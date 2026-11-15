import assert from "node:assert/strict"
import { execFileSync, spawn, spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir, userInfo } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { isolateHarness, layout, opencodeOfferSeams, opencodeUpdateSeams, stage } from "./engines/zsh.mjs"
import { archive, bundle, feed, seams as desktopSeams, snapshot, tools } from "./desktop-fixture.mjs"
import { quote } from "./fixture-home.mjs"
import { groupExists, groupMembers, signalGroup } from "./process-group.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
// Keep the event loop blocked until this owned child is a zombie, so reaping
// cannot hide the Darwin EPERM window from the cleanup regression.
const exited = spawn("/usr/bin/true", [], { detached: true, stdio: "ignore" })
const reaped = new Promise(resolve => exited.once("close", resolve))
let zombie = false
for (let attempt = 0; attempt < 100; attempt++) {
  if (groupMembers(exited.pid).some(member => member.state.startsWith("Z"))) { zombie = true; break }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5)
}
assert.ok(zombie, "fixture child must exit before its parent reaps it")
assert.equal(groupExists(exited.pid), true)
signalGroup(exited.pid, "SIGTERM")
assert.equal(groupExists(exited.pid), true, "an unreaped group must not be reported absent")
await reaped
assert.equal(groupExists(exited.pid), false)
const alive = spawn("/bin/sleep", ["30"], { detached: true, stdio: "ignore" })
const stopped = new Promise(resolve => alive.once("close", resolve))
await new Promise(resolve => alive.once("spawn", resolve))
const kill = process.kill
try {
  process.kill = () => { throw Object.assign(new Error("fixture permission failure"), { code: "EPERM" }) }
  assert.throws(() => signalGroup(alive.pid, "SIGTERM"), { code: "EPERM" })
} finally {
  process.kill = kill
  signalGroup(alive.pid, "SIGTERM")
  await stopped
}
assert.equal(groupExists(alive.pid), false)
console.log("ok process-group cleanup: zombies stay present until reaped; live-group permission errors remain failures")

function pluginReport(value, severity = "FAIL") {
  return spawnSync("/bin/zsh", ["-fc", 'setopt no_unset pipe_fail; source "$1"; opencode_plugins_v2 "$2" "$3" " (fixture)"',
    "plugins", join(root, "profiles/opencode/hooks.zsh"), typeof value === "string" ? value : JSON.stringify(value), severity], { encoding: "utf8" })
}
for (const data of [[], [{ id: "healthy", state: { status: "active" } }]]) assert.equal(pluginReport({ data }).status, 0)
for (const value of ["", "invalid JSON", {}, { data: null }, { data: {} }]) {
  const result = pluginReport(value)
  assert.equal(result.status, 1)
  assert.match(result.stdout, /plugin status unavailable/)
  assert.equal(result.stderr, "")
}
const failedPlugins = { data: [
  { id: "healthy", state: { status: "active" } },
  { source: { target: "@fixture/broken@1.0.0" }, state: { status: "failed", error: "PRIVATE_ERROR", ref: "err_fixture1" } },
  { id: "sk-private", source: { target: "https://user:PRIVATE_TOKEN@example.test/plugin?key=PRIVATE_QUERY" }, state: { status: "failed", ref: "PRIVATE_REF\n" } },
  { source: { path: "/PRIVATE_PATH" }, state: { status: "PRIVATE_STATUS" } },
] }
for (const severity of ["FAIL", "warn"]) {
  const result = pluginReport(failedPlugins, severity)
  assert.equal(result.status, 1)
  assert.match(result.stdout, /#2 @fixture\/broken@1\.0\.0: failed \(err_fixture1\)/)
  assert.match(result.stdout, /#3 name withheld: failed/)
  assert.match(result.stdout, /#4 name withheld: unknown/)
  assert.ok(result.stdout.split("\n").filter(Boolean).every(line => line.startsWith(severity + " ")))
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE|sk-private|https:|user:/)
}
assert.equal(pluginReport({ data: Array.from({ length: 12 }, () => ({ state: { status: "failed" } })) }).stdout.trim().split("\n").length, 8)
// A plugin the user disabled is not a failure, but Agent Guard's own must be active.
assert.equal(pluginReport({ data: [{ id: "healthy", state: { status: "active" } }, { id: "other", state: { status: "disabled" } }] }).status, 0)
{
  const own = pluginReport({ data: [{ id: "agent-guard", state: { status: "disabled" } }] })
  assert.equal(own.status, 1)
  assert.match(own.stdout, /#1 agent-guard: disabled/)
  const mixed = pluginReport({ data: [{ id: "other", state: { status: "disabled" } }, { id: "broken", state: { status: "failed" } }] })
  assert.equal(mixed.status, 1)
  assert.deepEqual(mixed.stdout.trim().split("\n").map(line => line.replace(/^.*V2 \(fixture\): /, "")), ["#2 broken: failed"])
}
console.log("ok OpenCode V2 plugin diagnostics: healthy, unavailable, failed and sanitized status")

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
for (const args of [["serve"], ["--version"], ["debug", "paths"], ["acp"], ["run", "--server", "http://localhost:4096", "hello"],
  ["mcp", "add", "fixture", "--url", "https://example.test/mcp", "--global"],
  ["plugin", "add", "fixture"], ["plugin", "remove", "fixture"], ["--print-logs", "mcp", "add", "fixture"]]) {
  const result = prepare(args)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.managed, false)
  assert.deepEqual(result.args, args)
}
for (const args of [["service", "start"], ["service", "restart"], ["acp", "--login"]]) assert.equal(prepare(args).status, 2)
assert.deepEqual(prepare(["run", "--", "--server"]).args, ["run", "--standalone", "--", "--server"])
assert.deepEqual(prepare(["run", "--standalone", "hello"]).args, ["run", "--standalone", "hello"])
assert.deepEqual(prepare(["run", "--", "--standalone"]).args, ["run", "--standalone", "--", "--standalone"])
assert.deepEqual(prepare(["--print-logs", "run", "hello"]).args, ["--print-logs", "run", "--standalone", "hello"])
assert.equal(prepare(["--print-logs", "mcp", "list"]).managed, true)
for (const args of [["auth"], ["session"], ["--print-logs", "auth"]]) assert.deepEqual(prepare(args).args, args)
for (const args of [["--log-level", "DEBUG", "service", "start"], ["--log-level=debug", "service", "restart"], ["--pure", "--print-logs", "service", "start"],
  ["service", "--print-logs", "start"], ["--log-level", "info", "acp", "--log-level", "info", "--login"]]) assert.equal(prepare(args).status, 2, args.join(" "))
for (const args of [["--log-level", "error", "serve"], ["--log-level=error", "mcp", "add", "fixture"], ["--log-level", "error", "debug", "paths"],
  ["--log-level", "error", "acp"], ["--completions", "zsh", "--version"]]) {
  const result = prepare(args)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.managed, false)
  assert.deepEqual(result.args, args)
}
assert.deepEqual(prepare(["--log-level", "error", "run", "hello"]).args, ["--log-level", "error", "run", "--standalone", "hello"])
assert.deepEqual(prepare(["--log-level", "error", "--model", "fixture/test"]).args, ["--log-level", "error", "--standalone", "--model", "fixture/test"])
assert.deepEqual(prepare(["auth", "--log-level", "error", "login"]).args, ["auth", "--log-level", "error", "login", "--standalone"])
assert.equal(prepare(["--log-level", "error", "mcp", "list"]).managed, true)
for (const args of [["mcp"], ["mcp", "--help"], ["plugin", "-h"], ["debug"], ["pair", "--help"]]) {
  const result = prepare(args)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.managed, false, args.join(" "))
  assert.deepEqual(result.args, args)
}
console.log("ok OpenCode V2 command routing: private servers, managed clients, explicit attachments and maintenance")

// The maintenance command: upgrade on OpenCode 1 and 2, update on 2 only, as the
// first word after the global options; a help request or words after -- change
// nothing. The caller's REPLY survives.
function maintenance(major, args) {
  const result = spawnSync("/bin/zsh", ["-fc", `
    setopt err_exit no_unset pipe_fail extended_glob
    source "$1"
    REPLY=kept
    major=$2
    shift 2
    if opencode_maintenance $major "$@"; then print yes; else print no; fi
    print -r -- $REPLY
  `, "runtime", join(root, "profiles/opencode/runtime.zsh"), String(major), ...args], { encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.split("\n")[1], "kept")
  return result.stdout.startsWith("yes")
}
for (const [major, args, expected] of [
  [1, ["upgrade"], true], [2, ["upgrade"], true], [2, ["update"], true], [1, ["update"], false],
  [1, ["upgrade", "1.2.3", "--method", "npm"], true], [2, ["update", "--method=npm"], true],
  [1, ["--print-logs", "upgrade"], true], [1, ["--log-level", "debug", "--pure", "upgrade", "1.2.3"], true], [2, ["--log-level=info", "update"], true],
  [1, ["upgrade", "--help"], false], [2, ["update", "-h"], false], [2, ["upgrade", "1.2.3", "--help"], false],
  [1, ["upgrade", "--", "--help"], true], [1, ["upgrade", "--", "-h"], true],
  [1, ["--", "upgrade"], false], [1, ["--help", "upgrade"], false], [1, ["run", "upgrade"], false], [2, ["project", "update"], false],
  [1, ["upgrades"], false], [1, ["Upgrade"], false], [1, [], false], [2, ["--log-level"], false],
]) assert.equal(maintenance(major, args), expected, `${major} ${args.join(" ")}`)

{
  // The updater gets the operator's values of what the launcher changes for a
  // session, the way opencode_upgrade runs it; nothing set afterwards leaks in.
  const dir = mkdtempSync(join(tmpdir(), "agentguard-runtime-"))
  try {
    const cli = join(dir, "opencode")
    writeFileSync(cli, `#!/bin/sh\nprintf '%s\\n' "\${FIXTURE_SET:--}" "\${FIXTURE_UNSET:--}" "\${FIXTURE_SSH:--}" "\${AGENT_GUARD_CONTEXT:--}" "$PATH" "$HOME" "$@"\nexit 3\n`)
    chmodSync(cli, 0o755)
    const result = spawnSync("/bin/zsh", ["-fc", `
      setopt err_exit no_unset pipe_fail extended_glob
      source "$1"
      opencode_warn_shadow() { :; }
      cli=$2
      env_unset=(FIXTURE_UNSET FIXTURE_SSH)
      env_set=(FIXTURE_SET=session)
      export FIXTURE_SET=operator FIXTURE_UNSET=operator
      opencode_capture_env
      unset $env_unset
      export $env_set AGENT_GUARD_CONTEXT=session HOME=/session
      path=(/session/peers $path)
      rc=0
      opencode_upgrade 1.2.3 || rc=$?
      print -r -- "status $rc"
    `, "runtime", join(root, "profiles/opencode/runtime.zsh"), cli], { encoding: "utf8", env: { PATH: "/usr/bin:/bin", HOME: "/operator-home" } })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(result.stdout.trimEnd().split("\n"), ["operator", "operator", "-", "-", "/usr/bin:/bin", "/operator-home", "upgrade", "1.2.3", "status 3"])
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

{
  // The CLI bundled in OpenCode.app is updated with the app; nothing runs. The
  // refusal gives the app's route, and a link to the CLI is refused like its own
  // path. The app is a stand-in bundle; codesign and od are stand-ins, and
  // Homebrew is looked for under the test home only.
  const dir = mkdtempSync(join(tmpdir(), "agentguard-bundled-"))
  try {
    const module = join(dir, "update.zsh")
    writeFileSync(module, desktopSeams(readFileSync(join(root, "profiles/opencode/update.zsh"), "utf8"), tools(dir), true))
    opencodeUpdateSeams(module, "http://127.0.0.1:1")
    const app = join(dir, "Applications/OpenCode.app")
    const refusal = (bundled) => {
      const result = spawnSync("/bin/zsh", ["-fc", `
        setopt err_exit no_unset pipe_fail extended_glob
        source "$1"
        source "$2"
        fail() { print -ru2 -- "agent-guard: $*"; exit 1; }
        home=$4
        cli=$3
        mode=cli
        ag_update_run() { print ran; }
        opencode_maintain upgrade
      `, "runtime", join(root, "profiles/opencode/runtime.zsh"), module, bundled, dir], { encoding: "utf8" })
      assert.equal(result.status, 1)
      assert.equal(result.stdout, "")
      return result.stderr
    }
    const belongs = "agent-guard: This OpenCode belongs to the OpenCode app and is updated with the app. "
    const download = "To update, quit OpenCode and install the download from opencode.ai"
    bundle(app, { cli: "#!/bin/sh\n" })
    symlinkSync(join(app, "Contents/Resources/opencode-cli"), join(dir, "opencode"))
    for (const bundled of [join(app, "Contents/Resources/opencode-cli"), join(dir, "opencode")]) {
      assert.equal(refusal(bundled), `${belongs}Agent Guard offers its updates when you open Agent Guard.\n`)
    }
    // An app Agent Guard does not update gets the manual route, with brew only where this Mac has the cask.
    bundle(app, { cli: "#!/bin/sh\n", files: { "Contents/badsig": "" } })
    const reason = `${belongs}Agent Guard does not offer updates because its signature cannot be checked. ${download}`
    assert.equal(refusal(join(dir, "opencode")), `${reason}.\n`)
    mkdirSync(join(dir, "homebrew/bin"), { recursive: true })
    mkdirSync(join(dir, "homebrew/Caskroom/opencode-desktop"), { recursive: true })
    writeFileSync(join(dir, "homebrew/bin/brew"), "#!/bin/sh\nexit 99\n", { mode: 0o755 })
    assert.equal(refusal(join(dir, "opencode")), `${reason} or run brew upgrade --cask opencode-desktop.\n`)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
console.log("ok OpenCode maintenance command: detection, the operator's environment and the app-bundled CLI")

// Each `service status` probe consumes the next response, "<exit status>:<output>";
// the last one repeats. The server is a sleeping process and the client exits at once.
function managed(responses, script, tty = "") {
  const dir = mkdtempSync(join(tmpdir(), "agentguard-runtime-"))
  try {
    const body = `
      setopt err_exit no_unset pipe_fail extended_glob
      source "$1"
      source "\${1:h}/browser.zsh"
      mode=cli
      session=$2
      shift 2
      responses=("$@")
      fail() { print -ru2 -- "$*"; exit 2; }
      note() { :; }
      record_app_projects() { :; }
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
        [[ \${1:-} == read ]] && exec /usr/bin/head -n 1
        print -r -- client "$@"
      }
      sandbox=(fake)
      print 0 > $session/probes
      ${script}
    `
    const args = ["runtime", join(root, "profiles/opencode/runtime.zsh"), dir, ...responses]
    // With tty, a typed line waits in a terminal, as when launched from Terminal.
    const result = tty
      ? (spawnSync("/usr/bin/expect", ["-f", join(root, "test/tty.exp"), join(dir, "out"), tty, "/bin/zsh", "-fc", body, ...args], { encoding: "utf8", timeout: 20000 }),
         { status: 0, stderr: "", stdout: readFileSync(join(dir, "out"), "utf8") })
      : spawnSync("/bin/zsh", ["-fc", body, ...args], { encoding: "utf8", timeout: 20000 })
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
let result
for (const response of ["0:stopped", "0:disabled\n"]) {
  const result = managed([response, "0:http://127.0.0.1:4096"], launch)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), "client app")
  assert.equal(result.probes, 2)
}
result = managed(["0:stopped", "0:http://127.0.0.1:4096"], "opencode_managed cli read", "typed input")
assert.equal(result.status, 0, result.stderr)
assert.equal(result.stdout.trim(), "typed input")
result = managed(["0:http://127.0.0.1:4096"], launch)
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
  // A CLI that records the marker, the outer-sandbox variable and its
  // arguments, and exits 7. Its version is the content of the file next to it
  // (V2 unless a test writes another). A second record holds what a maintenance
  // command checks: the NPM and SSH variables, PATH, and whether it could write
  // to the engine's protected state folder.
  const versionFile = join(bin, "version")
  const envRecord = join(scratch, "env")
  writeFileSync(versionFile, "2.1.4\n")
  const proof = join(home, "Library/Application Support/AgentGuard/state/.upgrade-proof")
  // What a new terminal window finds: Agent Guard's block in .zshrc puts the
  // engine's bin first, and the current release's bin/opencode is the launcher.
  // An updater run with APPEND_PATH_LINE set adds OpenCode's own PATH line after it.
  const rc = join(home, ".zshrc")
  const block = '# >>> agent-guard >>>\npath=("$HOME/Library/Application Support/AgentGuard/bin" ${path:#"$HOME/Library/Application Support/AgentGuard/bin"})\n# <<< agent-guard <<<\n'
  const pathLine = 'export PATH="$HOME/.opencode/bin:$PATH"'
  const shadowWarning = "agent-guard: new terminal windows will start ~/.opencode/bin/opencode, not Agent Guard's opencode, so OpenCode runs there without protection. Run agent-guard update to fix it."
  symlinkSync("current/bin", join(engine, "bin"))
  writeFileSync(join(engine, "current/bin/opencode"), "#!/bin/sh\n", { mode: 0o755 })
  writeFileSync(rc, block)
  writeFileSync(join(bin, "opencode"), `#!/bin/sh\n[ "$1" = --version ] && { cat "\${0%/*}/version"; exit 0; }\n[ "$1" = upgrade ] && [ -n "\${APPEND_PATH_LINE:-}" ] && echo '${pathLine}' >> "$HOME/.zshrc"\n{ printf '%s\\n' "\${NPM_CONFIG_USERCONFIG:--}" "\${SSH_AUTH_SOCK:--}" "$PATH"; ( : > ${JSON.stringify(proof)} ) 2>/dev/null && echo written || echo denied; } > ${JSON.stringify(envRecord)}\nprintf '%s\\n' "\${AGENT_GUARD_SANDBOXED:--}" "\${AGENT_GUARD_OUTER_SANDBOX:--}" "$@" > ${JSON.stringify(record)}\nexit 7\n`)
  chmodSync(join(bin, "opencode"), 0o755)
  const log = join(home, "Agent Guard/last-launch-opencode.log")
  const launch = (outer, args, env = {}, input) => {
    rmSync(record, { force: true })
    const argv = [...(outer ? ["/usr/bin/sandbox-exec", "-p", outer] : []), "/bin/zsh", join(engine, "current/launch"), ...args]
    return spawnSync(argv[0], argv.slice(1), {
      cwd: join(home, "Projects/app"), encoding: "utf8", input,
      env: { PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`, HOME: home, TMPDIR: temp, ...env },
    })
  }
  const recorded = () => existsSync(record) ? readFileSync(record, "utf8").trimEnd().split("\n") : null
  const stepAside = /agent-guard: already inside another sandbox; Agent Guard's sandbox is not applied and OpenCode runs under the existing one/
  const allowAll = "(version 1)(allow default)"
  // An orchestrator's run sandbox: it denies writes to the list folder and the
  // engine. It also denies osascript, so a gui refusal shows no alert here.
  const denyList = `(version 1)(allow default)(deny file-write* (subpath ${JSON.stringify(join(home, "Agent Guard"))}) (subpath ${JSON.stringify(engine)}))(deny process-exec (literal "/usr/bin/osascript"))`
  const nests = spawnSync("/usr/bin/sandbox-exec", ["-p", allowAll, "/usr/bin/sandbox-exec", "-p", allowAll, "/usr/bin/true"]).status === 0
  for (const [name, outer] of [["an allow-everything sandbox", allowAll], ["a sandbox denying the list folder", denyList]]) {
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
    const r = launch(denyList, ["cli", "mcp", "list"])
    assert.equal(r.status, 1)
    assert.match(r.stderr, /run this V2 command from Terminal outside the existing guard/)
    assert.equal(recorded(), null)
    console.log("ok launch cli inside another sandbox refuses a command that needs a managed service")
  }
  for (const mode of ["gui", "check"]) {
    const r = launch(denyList, [mode])
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
      console.log("ok the stamp throttles pruning")
    } finally { live.kill() }
    rmSync(join(engine, "state"), { recursive: true, force: true })
    rmSync(log, { force: true })
  }
  {
    // OpenCode's updater (the maintenance command) runs unconfined, with the
    // operator's environment, only outside any sandbox; the launcher exits with its
    // status and starts no session. Help requests and `update` on OpenCode 1 stay
    // confined. Inside a guarded session the command is refused; inside another
    // sandbox the launcher steps aside as before.
    const notice = "Updating OpenCode. The update runs without Agent Guard's protection; your next session will be protected as usual."
    const refusal = "agent-guard: Updates cannot run from an agent session. Quit the session, then run opencode upgrade in Terminal. Agent Guard may also offer the update at your next launch."
    const operator = { NPM_CONFIG_USERCONFIG: "/operator/npmrc", SSH_AUTH_SOCK: "/operator/agent.sock" }
    const operatorPath = `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`
    const checked = () => existsSync(envRecord) ? readFileSync(envRecord, "utf8").trimEnd().split("\n") : null
    const count = (text, line) => text.split("\n").filter(l => l === line).length
    const version = v => writeFileSync(versionFile, `${v}\n`)
    const reset = () => { rmSync(envRecord, { force: true }); rmSync(proof, { force: true }) }
    try {
      for (const [v, args] of [["2.1.4", ["upgrade", "1.2.3"]], ["2.1.4", ["update", "--method", "npm"]], ["2.1.4", ["--print-logs", "update"]],
                               ["1.4.0", ["upgrade"]], ["1.4.0", ["--log-level", "debug", "upgrade", "1.2.3", "--", "--help"]]]) {
        version(v); reset()
        const r = launch(null, ["cli", ...args], operator)
        const name = `${v} ${args.join(" ")}`
        assert.equal(r.status, 7, `${name}: ${r.stderr}`)
        assert.equal(count(r.stderr, notice), 1, `${name}: ${r.stderr}`)
        assert.deepEqual(recorded(), ["-", "-", ...args], name)
        assert.deepEqual(checked(), ["/operator/npmrc", "/operator/agent.sock", operatorPath, "written"], name)
        assert.equal(r.stderr.includes("new terminal windows will start"), false, `${name}: ${r.stderr}`)
      }
      console.log("ok launch cli runs OpenCode's updater unconfined with the operator's environment, prints the notice and exits with its status")
      // An updater that adds its own PATH line after Agent Guard's block: the
      // warning names the opencode a new terminal finds, and the status is the
      // updater's.
      version("2.1.4"); reset()
      mkdirSync(join(home, ".opencode/bin"), { recursive: true })
      writeFileSync(join(home, ".opencode/bin/opencode"), "#!/bin/sh\n", { mode: 0o755 })
      try {
        const r = launch(null, ["cli", "upgrade"], { ...operator, APPEND_PATH_LINE: "1" })
        assert.equal(r.status, 7, r.stderr)
        assert.equal(count(r.stderr, shadowWarning), 1, r.stderr)
        assert.equal(readFileSync(rc, "utf8"), block + pathLine + "\n")
      } finally {
        rmSync(join(home, ".opencode"), { recursive: true, force: true })
        writeFileSync(rc, block)
      }
      console.log("ok launch cli warns after an upgrade that puts another opencode ahead of Agent Guard's")
      for (const [v, args] of [["1.4.0", ["update"]], ["2.1.4", ["upgrade", "--help"]], ["1.4.0", ["upgrade", "-h"]], ["2.1.4", ["update", "1.2.3", "--help"]]]) {
        version(v); reset()
        const r = launch(null, ["cli", ...args], operator)
        const name = `${v} ${args.join(" ")}`
        assert.equal(r.status, 7, `${name}: ${r.stderr}`)
        assert.equal(r.stderr.includes(notice), false, name)
        assert.deepEqual(recorded().slice(0, 2), ["1", "-"], name)
        assert.equal(recorded().at(-1), args.at(-1), name)
        const [npm, ssh, path, write] = checked()
        assert.deepEqual([npm, ssh, write], ["/dev/null", "-", "denied"], name)
        assert.match(path, /\/releases\/[^/]+\/peers:/, name)
      }
      console.log("ok launch cli keeps update on OpenCode 1 and help requests confined")
      reset(); version("2.1.4")
      for (const [v, args] of [["2.1.4", ["upgrade"]], ["2.1.4", ["update", "1.2.3"]], ["1.4.0", ["upgrade"]]]) {
        version(v)
        const r = launch(denyList, ["cli", ...args], { AGENT_GUARD_SANDBOXED: "1" })
        assert.equal(r.status, 2, `${v} ${args}: ${r.stderr}`)
        assert.equal(r.stderr, refusal + "\n")
        assert.equal(recorded(), null, `${v} ${args}: the CLI ran`)
      }
      version("1.4.0")
      {
        const r = launch(denyList, ["cli", "update"], { AGENT_GUARD_SANDBOXED: "1" })
        assert.equal(r.status, 7, r.stderr)
        assert.deepEqual(recorded(), ["1", "-", "update"])
      }
      console.log("ok launch cli inside a guarded session refuses the maintenance command with status 2")
      // Another tool's sandbox owns its policy: the launcher steps aside as before.
      version("2.1.4")
      {
        const r = launch(denyList, ["cli", "upgrade"])
        assert.equal(r.status, 7, r.stderr)
        assert.deepEqual(recorded(), ["-", "1", "upgrade"])
        assert.equal(r.stderr.includes("Updates cannot run"), false)
        assert.equal(r.stderr.includes(notice), false)
      }
      console.log("ok launch cli inside another sandbox runs the maintenance command as any other")
      // A nesting probe that fails for any other reason leaves the command confined,
      // and here the confined launch cannot start at all.
      {
        const r = launch(`(version 1)(allow default)(deny process-exec (literal "/usr/bin/sandbox-exec"))`, ["cli", "upgrade"], operator)
        assert.notEqual(r.status, 0)
        assert.equal(recorded(), null, "the CLI ran")
        assert.equal(r.stderr.includes(notice), false)
        console.log("ok a probe failure does not turn the maintenance command into an unconfined run")
      }
    } finally {
      version("2.1.4")
      rmSync(join(engine, "state"), { recursive: true, force: true })
      rmSync(log, { force: true })
      rmSync(envRecord, { force: true })
    }
  }
  {
    // OpenCode's update offer at the start of a session. The lookup goes to a
    // local server in a child process (the launcher blocks this one), the
    // updater is a stand-in in the installer's location, and the release's
    // terminal check is replaced for the runs that answer the prompt on stdin.
    const lookups = join(scratch, "lookups")
    const reply = join(scratch, "reply")
    const upgraded = join(scratch, "upgrade")
    const eligible = join(home, ".opencode/bin")
    const stateFolder = join(engine, "state")
    const updates = join(engine, "current/updates.zsh")
    const desktopFeed = join(scratch, "desktop-feed")
    const desktopZip = join(scratch, "desktop-zip")
    const server = spawn(process.execPath, ["-e", `
      const http = require("node:http"), fs = require("node:fs")
      const [lookups, reply, desktopFeed, desktopZip] = process.argv.slice(1)
      http.createServer((req, res) => {
        fs.appendFileSync(lookups, req.url + "\\n")
        if (req.url.startsWith("/opencode-desktop-update")) res.end(fs.readFileSync(desktopFeed))
        else if (req.url.startsWith("/files/")) res.end(fs.readFileSync(desktopZip))
        else res.end(JSON.stringify({ channel: "latest", name: "cli", version: fs.readFileSync(reply, "utf8").trim() }))
      }).listen(0, "127.0.0.1", function () { console.log(this.address().port) })
    `, lookups, reply, desktopFeed, desktopZip], { stdio: ["ignore", "pipe", "inherit"] })
    try {
      const port = Number(await new Promise(resolve => server.stdout.once("data", resolve)))
      opencodeOfferSeams(join(engine, "current"), `http://127.0.0.1:${port}`)
      const production = readFileSync(updates, "utf8")
      const terminal = on => writeFileSync(updates, on ? production.replace("[[ -t 0 && -t 2 ]]", "true") : production)
      assert.notEqual(production.replace("[[ -t 0 && -t 2 ]]", "true"), production)
      // Installed version, then what its updater does: install the offered version,
      // leave the version alone, install another one, or fail.
      mkdirSync(eligible, { recursive: true })
      writeFileSync(join(eligible, "opencode"), `#!/bin/sh
dir=\${0%/*}
[ "$1" = --version ] && { cat "$dir/version"; exit 0; }
if [ "$1" = upgrade ]; then
  { printf '%s\\n' "$*" "\${AGENT_GUARD_SANDBOXED:--}"; ( : > ${JSON.stringify(proof)} ) 2>/dev/null && echo written || echo denied; } > ${JSON.stringify(upgraded)}
  case $(cat "$dir/mode") in
    install) printf '%s\\n' "$2" > "$dir/version" ;;
    shadow) printf '%s\\n' "$2" > "$dir/version"; echo '${pathLine}' >> "$HOME/.zshrc" ;;
    other) echo 2.9.9 > "$dir/version" ;;
    fail) exit 1 ;;
  esac
  exit 0
fi
printf '%s\\n' "$(cat "$dir/version")" "\${AGENT_GUARD_SANDBOXED:--}" "$@" > ${JSON.stringify(record)}
exit 7
`)
      chmodSync(join(eligible, "opencode"), 0o755)
      const prepare = ({ installed = "2.3.0", offered = "2.4.0", mode = "install", preference } = {}) => {
        for (const f of [lookups, upgraded, proof]) rmSync(f, { force: true })
        writeFileSync(lookups, "")
        writeFileSync(reply, offered)
        writeFileSync(join(eligible, "version"), installed)
        writeFileSync(join(eligible, "mode"), mode)
        mkdirSync(stateFolder, { recursive: true })
        if (preference) writeFileSync(join(stateFolder, "update-check"), preference)
        else rmSync(join(stateFolder, "update-check"), { force: true })
      }
      const requests = () => readFileSync(lookups, "utf8").trimEnd().split("\n").filter(Boolean)
      const upgrade = () => existsSync(upgraded) ? readFileSync(upgraded, "utf8").trimEnd().split("\n") : null
      const session = () => recorded()
      const onPath = { PATH: `${eligible}:/usr/bin:/bin:/usr/sbin:/sbin` }
      const available = /OpenCode 2\.4\.0 is available\. You have 2\.3\.0\.\nThe update runs without Agent Guard's protection\.\n/
      terminal(true)

      prepare()
      let r = launch(null, ["cli", "hello"], onPath, "y\n")
      assert.equal(r.status, 7, r.stderr)
      assert.match(r.stderr, available)
      assert.match(r.stderr, /Update now\? \[Y\/n\] OpenCode updated to 2\.4\.0\.\n/)
      assert.deepEqual(requests(), ["/opencode-update?current=2.3.0"])
      assert.deepEqual(upgrade(), ["upgrade 2.4.0", "-", "written"])
      // The session runs the new version, and --standalone shows the arguments were
      // prepared for OpenCode 2 after the update.
      assert.deepEqual(session(), ["2.4.0", "1", "--standalone", "hello"])
      assert.equal(r.stderr.includes("new terminal windows will start"), false, r.stderr)
      console.log("ok launch cli offers an OpenCode update, runs the accepted one unconfined and starts the session on the new version")

      // The same check after the accepted offer: the warning comes before the
      // session, which still starts.
      prepare({ mode: "shadow" })
      try {
        r = launch(null, ["cli", "hello"], onPath, "y\n")
        assert.equal(r.status, 7, r.stderr)
        assert.equal(r.stderr.split(shadowWarning).length - 1, 1, r.stderr)
        assert.deepEqual(session(), ["2.4.0", "1", "--standalone", "hello"])
      } finally { writeFileSync(rc, block) }
      console.log("ok launch cli warns after an accepted OpenCode update that puts another opencode ahead of Agent Guard's, and starts the session")

      prepare()
      r = launch(null, ["cli"], onPath, "n\n")
      assert.equal(r.status, 7, r.stderr)
      assert.match(r.stderr, available)
      assert.doesNotMatch(r.stderr, /updated to/)
      assert.equal(upgrade(), null)
      assert.deepEqual(session(), ["2.3.0", "1", "--standalone"])
      console.log("ok launch cli starts the session unchanged when the OpenCode update is declined")

      prepare({ mode: "fail" })
      r = launch(null, ["cli"], onPath, "y\n")
      assert.equal(r.status, 1, r.stderr)
      assert.match(r.stderr, /agent-guard: the OpenCode update failed\. Run opencode upgrade in Terminal to finish it, then reopen\./)
      assert.equal(session(), null)
      for (const mode of ["none", "other"]) {
        prepare({ mode })
        r = launch(null, ["cli"], onPath, "y\n")
        assert.equal(r.status, 1, r.stderr)
        assert.match(r.stderr, new RegExp(`the OpenCode update did not install the version offered: expected 2\\.4\\.0, found ${mode === "other" ? "2\\.9\\.9" : "2\\.3\\.0"}\\.`))
        assert.equal(session(), null, mode)
      }
      console.log("ok launch cli stops when the OpenCode update fails or does not install the offered version")

      for (const args of [["run", "hello"], ["--version"], ["--help"], ["serve"], ["auth", "list"], ["--print-logs", "run", "x"], ["--completions", "zsh"], ["--completions=zsh"], ["--attach", "http://h:1"], ["--server=http://h:1"], ["attach", "http://h:1"]]) {
        prepare()
        r = launch(null, ["cli", ...args], onPath, "y\n")
        assert.deepEqual(requests(), [], args.join(" "))
        assert.equal(upgrade(), null, args.join(" "))
        assert.doesNotMatch(r.stderr, /is available/, args.join(" "))
      }
      for (const [name, outer, env] of [["a guarded session", denyList, { AGENT_GUARD_SANDBOXED: "1" }], ["another sandbox", denyList, {}]]) {
        prepare()
        r = launch(outer, ["cli"], { ...onPath, ...env }, "y\n")
        assert.equal(r.status, 7, `${name}: ${r.stderr}`)
        assert.deepEqual(requests(), [], name)
        assert.equal(upgrade(), null, name)
      }
      // The same version in a location the offer does not cover.
      prepare()
      writeFileSync(versionFile, "2.3.0\n")
      r = launch(null, ["cli"], {}, "y\n")
      writeFileSync(versionFile, "2.1.4\n")
      assert.equal(r.status, 7, r.stderr)
      assert.deepEqual(requests(), [])
      console.log("ok launch cli makes no OpenCode lookup for another subcommand, an attached or nested launch or an uncovered installation")

      prepare({ preference: "off" })
      r = launch(null, ["cli"], onPath, "y\n")
      assert.equal(r.status, 7, r.stderr)
      assert.deepEqual(requests(), [])
      assert.equal(upgrade(), null)
      assert.deepEqual(session(), ["2.3.0", "1", "--standalone"])
      console.log("ok update-check off makes no OpenCode lookup")

      terminal(false)
      prepare()
      r = launch(null, ["cli"], onPath, "y\n")
      assert.equal(r.status, 7, r.stderr)
      assert.match(r.stderr, available)
      assert.doesNotMatch(r.stderr, /Update now/)
      assert.equal(upgrade(), null)
      assert.deepEqual(session(), ["2.3.0", "1", "--standalone"])
      console.log("ok a launch without a terminal reports the OpenCode update and installs nothing")

      // The desktop app in gui mode: offered after Agent Guard's own offer and outside the
      // profile. The dialog is a stand-in, and so are codesign, spctl and od, which read the
      // facts each stand-in bundle holds (test/desktop-fixture.mjs).
      isolateHarness(join(engine, "current"))
      const stand = tools(scratch)
      const dialog = join(scratch, "dialog")
      const answerFile = join(scratch, "answer")
      const shown = join(scratch, "dialog-args")
      writeFileSync(dialog, `#!/bin/zsh -f\n[[ $1 == -l ]] && exec /bin/sleep 30\n[[ "$*" == *'display dialog'* ]] && print -rl -- "$@" > ${quote(shown)}\ncat ${quote(answerFile)}\n`, { mode: 0o755 })
      const profileUpdate = join(engine, "current/profiles/opencode/update.zsh")
      writeFileSync(profileUpdate, desktopSeams(readFileSync(profileUpdate, "utf8"), stand, true))
      for (const file of [updates, join(engine, "current/launch")]) writeFileSync(file, readFileSync(file, "utf8").replaceAll("/usr/bin/osascript", quote(dialog)))
      const base = `http://127.0.0.1:${port}`
      const app = join(home, "Applications/OpenCode.app")
      const probes = join(scratch, "cli-probes")
      // The app records which build ran and the bundled CLI which build probed it.
      // It also tries to change its own bundle, the way a guarded session could.
      const writes = join(scratch, "app-writes")
      const script = `#!/bin/sh
printf '%s\\n' "$(cat "\${0%/*}/../build")" "\${AGENT_GUARD_SANDBOXED:--}" > ${JSON.stringify(record)}
app=\${0%/*/*/*}
{
  ( : > "$app/Contents/probe" ) 2>/dev/null && echo create-written || echo create-denied
  ( echo x >> "$app/Contents/Info.plist" ) 2>/dev/null && echo modify-written || echo modify-denied
  ( : > "$app/../probe" ) 2>/dev/null && echo sibling-written || echo sibling-denied
  mv "$app" "$app.moved" 2>/dev/null && { mv "$app.moved" "$app"; echo rename-written; } || echo rename-denied
} > ${JSON.stringify(writes)}
`
      const cli = `#!/bin/sh\ncat "\${0%/*}/../build" >> ${JSON.stringify(probes)}\necho 1.18.33\n`
      mkdirSync(join(scratch, "desktop-build"), { recursive: true })
      const install = (options = {}) => {
        mkdirSync(dirname(app), { recursive: true })
        chmodSync(dirname(app), 0o755)
        rmSync(app, { recursive: true, force: true })
        bundle(app, { script, cli, files: { "Contents/build": "old\n" }, ...options })
        return snapshot(app)
      }
      const publish = (version, options = {}, feedOptions = {}) => {
        const built = archive(join(scratch, "desktop-build"), { version, script, cli, files: { "Contents/build": "new\n" }, ...options })
        writeFileSync(desktopZip, built.body)
        writeFileSync(desktopFeed, JSON.stringify(feed(base, version, { ...built, ...feedOptions })))
      }
      const arrange = (answer, preference) => {
        for (const f of [lookups, probes, shown]) rmSync(f, { force: true })
        writeFileSync(lookups, "")
        writeFileSync(answerFile, answer)
        mkdirSync(stateFolder, { recursive: true })
        if (preference) writeFileSync(join(stateFolder, "update-check"), preference)
        else rmSync(join(stateFolder, "update-check"), { force: true })
      }
      const desktopRequests = () => requests().filter(u => u.startsWith("/opencode-desktop") || u.startsWith("/files/"))
      const built = () => existsSync(probes) ? readFileSync(probes, "utf8").trimEnd().split("\n") : []
      try {
        let before = install(); publish("2.4.0")
        arrange("Update")
        r = launch(null, ["gui"])
        assert.equal(r.status, 0, r.stderr)
        assert.deepEqual(desktopRequests(), ["/opencode-desktop-update?current=2.3.0", "/files/opencode-desktop-mac-arm64.zip"])
        assert.ok(readFileSync(shown, "utf8").endsWith("An update is available: 2.4.0.\nYou have 2.3.0.\nThe update runs without Agent Guard's protection.\n"))
        // The app that starts, and the CLI bundled in it that the launcher probes, are the new ones.
        assert.deepEqual(recorded(), ["new", "1"])
        assert.deepEqual(built(), ["new"])
        assert.match(readFileSync(join(app, "Contents/Info.plist"), "utf8"), /<string>2\.4\.0<\/string>/)
        assert.deepEqual(readdirSync(dirname(app)), ["OpenCode.app"])
        console.log("ok launch gui offers an OpenCode app update, replaces the app outside the profile and starts the new one")

        install(); arrange("Later")
        r = launch(null, ["gui"])
        assert.equal(r.status, 0, r.stderr)
        assert.deepEqual(desktopRequests(), ["/opencode-desktop-update?current=2.3.0"])
        assert.deepEqual(recorded(), ["old", "1"])
        assert.deepEqual(built(), ["old"])
        console.log("ok launch gui starts the installed app unchanged when the update is declined")

        // Whether a session can write the app bundle: not by default, and yes under an ALLOW entry that contains it.
        const expected = verdict => ["create", "modify", "sibling", "rename"].map(name => `${name}-${verdict}`)
        assert.deepEqual(readFileSync(writes, "utf8").trimEnd().split("\n"), expected("denied"))
        const guardList = join(home, "Agent Guard/Guard List.txt")
        const original = readFileSync(guardList, "utf8")
        writeFileSync(guardList, `ALLOW\n${dirname(app)}\n`)
        try {
          install(); arrange("Later")
          r = launch(null, ["gui"])
          assert.equal(r.status, 0, r.stderr)
          assert.deepEqual(readFileSync(writes, "utf8").trimEnd().split("\n"), expected("written"))
        } finally {
          writeFileSync(guardList, original)
          rmSync(join(dirname(app), "probe"), { force: true })
        }
        console.log("ok a session cannot write OpenCode.app in ~/Applications by default, and can under an ALLOW entry that contains it")

        // A check that fails leaves the app as it was and ends the launch.
        before = install(); publish("2.4.0", {}, { sha256: "0".repeat(64) })
        arrange("Update")
        r = launch(null, ["gui"])
        assert.equal(r.status, 1, r.stderr)
        assert.match(r.stderr, new RegExp(`agent-guard: the OpenCode update failed and the app was not changed\\. To update by hand, quit OpenCode and install the download from opencode\\.ai\\. Details: ${join(home, "Agent Guard/last-opencode-update.log").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n`))
        assert.match(readFileSync(join(home, "Agent Guard/last-opencode-update.log"), "utf8"), /^OpenCode update stopped: the download does not match the SHA-256/)
        assert.equal(recorded(), null)
        assert.deepEqual(snapshot(app), before)
        assert.deepEqual(readdirSync(dirname(app)), ["OpenCode.app"])
        console.log("ok launch gui stops, naming the log, when the app update fails a check, and leaves the app as it was")

        publish("2.4.0"); before = install()
        for (const [name, go] of [
          ["update-check off", () => { arrange("Update", "off"); return launch(null, ["gui"]) }],
          ["a terminal launch", () => { arrange("Update"); return launch(null, ["cli", "hello"], onPath) }],
          ["a nested launch", () => { arrange("Update"); return launch(denyList, ["gui"]) }],
          ["a guarded session", () => { arrange("Update"); return launch(denyList, ["gui"], { AGENT_GUARD_SANDBOXED: "1" }) }],
        ]) {
          r = go()
          assert.deepEqual(desktopRequests(), [], name)
          assert.deepEqual(snapshot(app), before, name)
        }
        console.log("ok launch gui makes no desktop lookup with update-check off, from a terminal launch, nested or from a guarded session")

        // An installation the offer does not cover starts as it is, without a lookup.
        for (const [name, arrangeApp] of [
          ["a link", () => { install(); renameSync(app, join(scratch, "real.app")); symlinkSync(join(scratch, "real.app"), app) }],
          ["an unwritable folder", () => { install(); chmodSync(dirname(app), 0o555) }],
          ["a prerelease", () => { install({ version: "2.3.0-rc.1" }) }],
        ]) {
          arrangeApp(); arrange("Update")
          r = launch(null, ["gui"])
          chmodSync(dirname(app), 0o755)
          rmSync(join(scratch, "real.app"), { recursive: true, force: true })
          assert.equal(r.status, 0, `${name}: ${r.stderr}`)
          assert.deepEqual(desktopRequests(), [], name)
          assert.deepEqual(recorded(), ["old", "1"], name)
        }
        console.log("ok launch gui starts an app that is a link, in an unwritable folder or a prerelease without a lookup")

        // The launcher's check, which the doctor prints, adds one information line for the
        // CLI it ran and one for the app. The stand-in server does not start, so the check
        // fails as it does without the lines; the lines are not what fails it.
        const notes = r => r.stdout.split("\n").filter(line => line.startsWith("note OpenCode CLI") || line.startsWith("note OpenCode app"))
        install(); arrange("Later"); prepare()
        r = launch(null, ["check"], onPath)
        assert.equal(r.status, 1, r.stdout + r.stderr)
        assert.match(r.stdout, /^FAIL Guard readiness degraded or unverified in OpenCode V2$/m)
        assert.deepEqual(notes(r), [
          "note OpenCode CLI 2.3.0 at ~/.opencode/bin/opencode: Agent Guard offers its updates when you run opencode in Terminal.",
          "note OpenCode app 2.3.0 at ~/Applications/OpenCode.app: Agent Guard offers its updates when you open Agent Guard.",
        ])
        install({ files: { "Contents/badsig": "" } })
        r = launch(null, ["check"], onPath)
        assert.equal(r.status, 1, r.stdout + r.stderr)
        assert.deepEqual(notes(r)[1], "note OpenCode app 2.3.0 at ~/Applications/OpenCode.app: Agent Guard does not offer updates because its signature cannot be checked. To update, quit OpenCode and install the download from opencode.ai.")
        rmSync(join(home, "Applications"), { recursive: true, force: true })
        r = launch(null, ["check"], onPath)
        assert.equal(notes(r).length, 1, r.stdout)
        assert.doesNotMatch(r.stdout, /note OpenCode app/)
        console.log("ok launch check names the OpenCode CLI and app versions, paths and update routes as information lines that do not fail it")
      } finally {
        if (existsSync(dirname(app))) chmodSync(dirname(app), 0o755)
        rmSync(join(home, "Applications"), { recursive: true, force: true })
        rmSync(join(home, "Library/Application Support/ai.opencode.desktop"), { recursive: true, force: true })
      }
    } finally {
      server.kill()
      rmSync(stateFolder, { recursive: true, force: true })
      rmSync(log, { force: true })
      rmSync(eligible, { recursive: true, force: true })
    }
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
