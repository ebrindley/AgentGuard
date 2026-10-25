import assert from "node:assert/strict"
import { execFileSync, spawn, spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir, userInfo } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { layout, stage } from "./engines/zsh.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
function prepare(args) {
  const result = spawnSync("/bin/zsh", ["-fc", `
    setopt err_exit no_unset pipe_fail extended_glob
    source "$1"
    shift
    fail() { print -ru2 -- "$*"; exit 2; }
    note() { :; }
    managed=0
    opencode_cli_args "$@"
    print -r -- "$managed"
    print -rl -- "$reply[@]"
  `, "runtime", join(root, "profiles/opencode/runtime.zsh"), ...args], { encoding: "utf8" })
  return { ...result, args: result.stdout.trimEnd().split("\n").slice(1), managed: result.stdout.startsWith("1\n") }
}
for (const args of [[], ["project with spaces"], ["--model", "fixture/test"], ["run", "--auto", "hello"], ["models"], ["api", "GET", "/api/agent"], ["session", "list"], ["auth", "list"]]) {
  const result = prepare(args)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.managed, false)
  assert.equal(result.args.filter(arg => arg === "--standalone").length, 1)
  assert.deepEqual(result.args.filter(arg => arg !== "--standalone"), args)
}
for (const args of [["plugin", "list"], ["mcp", "list"], ["debug", "agents"], ["pair"]]) {
  const result = prepare(args)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.managed, true)
  assert.deepEqual(result.args, args)
}
for (const args of [["serve"], ["--version"], ["debug", "paths"], ["acp"], ["run", "--server", "http://localhost:4096", "hello"]]) {
  const result = prepare(args)
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.args, args)
}
for (const args of [["service", "start"], ["service", "restart"], ["acp", "--login"]]) assert.equal(prepare(args).status, 2)
assert.deepEqual(prepare(["run", "--", "--server"]).args, ["run", "--standalone", "--", "--server"])
assert.deepEqual(prepare(["run", "--standalone", "hello"]).args, ["run", "--standalone", "hello"])
assert.deepEqual(prepare(["run", "--", "--standalone"]).args, ["run", "--standalone", "--", "--standalone"])
assert.deepEqual(prepare(["--print-logs", "run", "hello"]).args, ["--print-logs", "run", "--standalone", "hello"])
assert.equal(prepare(["--print-logs", "mcp", "list"]).managed, true)
for (const args of [["auth"], ["session"], ["--print-logs", "auth"]]) assert.deepEqual(prepare(args).args, args)
console.log("ok OpenCode V2 command routing: private servers, managed clients, explicit attachments and maintenance")

// Each `service status` probe consumes the next response, "<exit status>:<output>";
// the last one repeats. The server is a sleeping process and the client exits at once.
function managed(responses, script) {
  const dir = mkdtempSync(join(tmpdir(), "agentguard-runtime-"))
  try {
    const result = spawnSync("/bin/zsh", ["-fc", `
      setopt err_exit no_unset pipe_fail extended_glob
      source "$1"
      session=$2
      shift 2
      responses=("$@")
      fail() { print -ru2 -- "$*"; exit 2; }
      note() { :; }
      sleep() { :; }
      fake() {
        [[ $1 == -D ]] && shift 2
        if [[ \${2:-} == service ]]; then
          local n=$(( $(<$session/probes) + 1 )) response
          print -r -- $n > $session/probes
          response=\${responses[$(( n < $#responses ? n : $#responses ))]}
          print -rn -- "\${response#*:}"
          return \${response%%:*}
        fi
        [[ \${2:-} == serve ]] && exec /bin/sleep 30
        print -r -- client "$@"
      }
      sandbox=(fake)
      print 0 > $session/probes
      ${script}
    `, "runtime", join(root, "profiles/opencode/runtime.zsh"), dir, ...responses], { encoding: "utf8", timeout: 20000 })
    return { ...result, probes: Number(readFileSync(join(dir, "probes"), "utf8")) }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
const classify = response => managed([response], 'opencode_service_state cli; print -r -- "$REPLY"').stdout.trim()
const secret = "password=fixture-secret"
for (const [response, state] of [
  ["0:http://127.0.0.1:4096\n", "running"], ["0:https://example.test:4096", "running"], ["0:  http://127.0.0.1:4096 \n", "running"],
  ["0:stopped\n", "inactive"], ["0:disabled\n", "inactive"],
  ["0:", "unknown"], ["0:\n", "unknown"], ["1:http://127.0.0.1:4096\n", "unknown"], ["1:stopped\n", "unknown"],
  ["0:stopped\nwarning", "unknown"], ["0:http://127.0.0.1:4096 http://127.0.0.1:4097", "unknown"],
  ["0:ftp://127.0.0.1", "unknown"], ["0:Stopped", "unknown"], [`0:${secret}`, "unknown"],
]) assert.equal(classify(response), state, JSON.stringify(response))

const launch = 'opencode_managed cli app'
for (const response of ["0:stopped", "0:disabled\n"]) {
  const result = managed([response, "0:http://127.0.0.1:4096"], launch)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), "client app")
  assert.equal(result.probes, 2)
}
let result = managed(["0:http://127.0.0.1:4096"], launch)
assert.equal(result.status, 2)
assert.match(result.stderr, /has a background service/)
assert.equal(result.probes, 1)
for (const response of ["0:", "1:", "1:stopped", `0:${secret}`, `0:stopped\n${secret}`]) {
  result = managed([response, "0:stopped"], launch)
  assert.equal(result.status, 2, JSON.stringify(response))
  assert.match(result.stderr, /unrecognized service status/)
  assert.doesNotMatch(result.stderr, /fixture-secret/)
  assert.equal(result.stdout, "")
}
for (const pending of [["0:stopped", "0:disabled"], ["1:"], ["0:"], ["0:starting"]]) {
  result = managed(["0:stopped", ...pending, "0:http://127.0.0.1:4096"], launch)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), "client app")
  assert.equal(result.probes, 2 + pending.length)
}
for (const response of ["0:stopped", "0:disabled", "1:", "0:starting"]) {
  result = managed(["0:stopped", response], launch)
  assert.equal(result.status, 2)
  assert.match(result.stderr, /did not become ready/)
  assert.equal(result.stdout, "")
  assert.equal(result.probes, 61)
}
console.log("ok OpenCode V2 service status: running, inactive and unknown for the incumbent check and readiness wait")

// Launches inside a sandbox Agent Guard did not create (decision D10). Runs
// outside any sandbox; the outer sandbox is applied here with sandbox-exec.
const cache = join(userInfo().homedir, "Library/Caches")
mkdirSync(cache, { recursive: true })
const run = realpathSync(mkdtempSync(join(cache, "agent-guard-runtime-")))
const temp = realpathSync(execFileSync("/usr/bin/getconf", ["DARWIN_USER_TEMP_DIR"], { encoding: "utf8" }).trim())
const scratch = realpathSync(mkdtempSync(join(temp, "agent-guard-runtime-")))
try {
  const home = join(run, "home")
  const source = join(run, "source")
  const bin = join(run, "bin")
  const record = join(scratch, "argv")
  for (const d of [join(home, "Agent Guard"), join(home, "Projects/app"), source, bin]) mkdirSync(d, { recursive: true })
  stage(root, source, home)
  const engine = join(home, "Library/Application Support/AgentGuard")
  layout(source, engine)
  writeFileSync(join(home, "Agent Guard/Guard List.txt"), `ALLOW\n${join(home, "Projects")}\nREAD ONLY\nDENY\n`)
  // A V2 CLI that records the marker, the outer-sandbox variable and its
  // arguments, and exits 7.
  writeFileSync(join(bin, "opencode"), `#!/bin/sh\n[ "$1" = --version ] && { echo 2.1.4; exit 0; }\nprintf '%s\\n' "\${AGENT_GUARD_SANDBOXED:--}" "\${AGENT_GUARD_OUTER_SANDBOX:--}" "$@" > ${JSON.stringify(record)}\nexit 7\n`)
  chmodSync(join(bin, "opencode"), 0o755)
  const log = join(home, "Agent Guard/last-launch-opencode.log")
  const launch = (outer, args, env = {}) => {
    rmSync(record, { force: true })
    const argv = [...(outer ? ["/usr/bin/sandbox-exec", "-p", outer] : []), "/bin/zsh", join(engine, "current/launch"), ...args]
    return spawnSync(argv[0], argv.slice(1), {
      cwd: join(home, "Projects/app"), encoding: "utf8",
      env: { PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`, HOME: home, TMPDIR: temp, ...env },
    })
  }
  const recorded = () => existsSync(record) ? readFileSync(record, "utf8").trimEnd().split("\n") : null
  const stepAside = /agent-guard: already inside another sandbox; Agent Guard's sandbox is not applied and OpenCode runs under the existing one/
  const allowAll = "(version 1)(allow default)"
  // Poetic's case: the outer sandbox denies writes to the list folder and the
  // engine. It also denies osascript, so a gui refusal shows no alert here.
  const poetic = `(version 1)(allow default)(deny file-write* (subpath ${JSON.stringify(join(home, "Agent Guard"))}) (subpath ${JSON.stringify(engine)}))(deny process-exec (literal "/usr/bin/osascript"))`
  const nests = spawnSync("/usr/bin/sandbox-exec", ["-p", allowAll, "/usr/bin/sandbox-exec", "-p", allowAll, "/usr/bin/true"]).status === 0
  for (const [name, outer] of [["an allow-everything sandbox", allowAll], ["a sandbox denying the list folder", poetic]]) {
    if (outer === allowAll && nests) {
      console.log(`skip launch cli inside ${name}: this macOS applies a second profile there, so the launch is not confined`)
      continue
    }
    const r = launch(outer, ["cli", "hello"])
    assert.equal(r.status, 7, `${name}: ${r.stderr}`)
    assert.deepEqual(recorded(), ["-", "1", "--standalone", "hello"], name)
    assert.equal(r.stderr.match(new RegExp(stepAside, "g"))?.length, 1, r.stderr)
    assert.ok(!existsSync(log), `${name}: launch log written`)
    assert.ok(!existsSync(join(engine, "state")), `${name}: engine state written`)
    console.log(`ok launch cli inside ${name} runs the CLI with --standalone, writes nothing, sets no marker and marks the outer sandbox`)
  }
  {
    const r = launch(poetic, ["cli", "mcp", "list"])
    assert.equal(r.status, 1)
    assert.match(r.stderr, /run this V2 command from Terminal outside the existing guard/)
    assert.equal(recorded(), null)
    console.log("ok launch cli inside another sandbox refuses a command that needs a managed service")
  }
  for (const mode of ["gui", "check"]) {
    const r = launch(poetic, [mode])
    assert.equal(r.status, 1)
    assert.match(r.stderr, /agent-guard: already inside another sandbox, where Agent Guard cannot apply its own/)
    assert.doesNotMatch(r.stderr, /inside the guard/)
    assert.ok(!existsSync(log) && !existsSync(join(engine, "state")), `${mode}: state written`)
    console.log(`ok launch ${mode} inside another sandbox refuses and names it`)
  }
  {
    // A guarded launch never passes the outer-sandbox variable on.
    const r = launch(null, ["cli", "hello"], { AGENT_GUARD_OUTER_SANDBOX: "1" })
    assert.equal(r.status, 7, r.stderr)
    assert.deepEqual(recorded(), ["1", "-", "--standalone", "hello"])
    rmSync(join(engine, "state"), { recursive: true, force: true })
    rmSync(log, { force: true })
    console.log("ok a guarded launch drops the outer-sandbox variable")
  }
  {
    // Session folders: the launcher prunes ended ones outside the sandbox, once
    // a day, in the background.
    const sessions = join(engine, "state/opencode")
    const stamp = join(engine, "state/.session-prune")
    const wait = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
    const until = (done, what) => { for (let i = 0; i < 100 && !done(); i++) wait(100); assert.ok(done(), what) }
    const startOf = pid => execFileSync("/bin/ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" }).trim().split(/\s+/).join(" ")
    const old = new Date("2020-01-01T00:00:00Z")
    const folder = (name, { owner, mtime = old } = {}) => {
      const d = join(sessions, `fixture.${name}`)
      mkdirSync(d, { recursive: true })
      if (owner) writeFileSync(join(d, "owner"), `${owner[0]}\n${owner[1]}\n`)
      utimesSync(d, mtime, mtime)
      return d
    }
    const live = spawn("/bin/sleep", ["60"], { stdio: "ignore" })
    try {
      const dead = spawnSync("/usr/bin/true").pid
      const liveStart = startOf(live.pid)
      const kept = {
        live: folder("liveowne", { owner: [live.pid, liveStart] }),
        recent: folder("recentde", { owner: [dead, "Mon Jan  1 00:00:00 2001"], mtime: new Date() }),
        fresh: folder("freshnoow", { mtime: new Date() }),
      }
      const gone = {
        dead: folder("deadowne", { owner: [dead, liveStart] }),
        reused: folder("reusedpi", { owner: [live.pid, "Mon Jan  1 00:00:00 2001"] }),
        preboot: folder("preboot0", {}),
      }
      assert.equal(launch(null, ["cli", "hello"]).status, 7)
      until(() => Object.values(gone).every(d => !existsSync(d)), "ended sessions were not removed")
      wait(500)
      assert.ok(Object.values(kept).every(existsSync), "a live, recent or fresh session was removed")
      assert.ok(existsSync(sessions) && existsSync(stamp))
      const own = execFileSync("/bin/ls", [sessions], { encoding: "utf8" }).split("\n").filter(n => n && !n.startsWith("fixture."))
      assert.equal(own.length, 1)
      assert.match(readFileSync(join(sessions, own[0], "owner"), "utf8"), /^\d+\n\w{3} \w{3} +\d+ [\d:]{8} \d{4}\n$/)
      console.log("ok launch removes sessions of dead or reused owners and owner-less folders from before boot, and keeps the rest")
      const again = folder("deadtwo0", { owner: [dead, liveStart] })
      assert.equal(launch(null, ["cli", "hello"]).status, 7)
      wait(1500)
      assert.ok(existsSync(again), "the stamp did not throttle pruning")
      utimesSync(stamp, old, old)
      assert.equal(launch(null, ["cli", "hello"]).status, 7)
      until(() => !existsSync(again), "pruning did not run after the stamp aged")
      console.log("ok pruning runs at most once every 24 hours")
      const names = () => execFileSync("/bin/ls", [sessions], { encoding: "utf8" }).split("\n").filter(Boolean)
      const before = names()
      const r = launch(null, ["profile"])
      assert.equal(r.status, 0, r.stderr)
      assert.match(r.stdout, /\(version 1\)/)
      assert.deepEqual(names().filter(n => !before.includes(n)), [])
      console.log("ok launch profile leaves no session folder")
    } finally { live.kill() }
    rmSync(join(engine, "state"), { recursive: true, force: true })
    rmSync(log, { force: true })
  }
  {
    // The probe fails, but not with sandbox_apply: no step-aside.
    const r = launch(`(version 1)(allow default)(deny process-exec (literal "/usr/bin/sandbox-exec"))`, ["cli", "hello"])
    assert.notEqual(r.status, 0)
    assert.equal(recorded(), null, "the CLI ran")
    assert.doesNotMatch(r.stderr, /another sandbox/)
    console.log("ok a probe failure other than sandbox_apply does not step aside")
  }
} finally {
  rmSync(run, { recursive: true, force: true })
  rmSync(scratch, { recursive: true, force: true })
}
