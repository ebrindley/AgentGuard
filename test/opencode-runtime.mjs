import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

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
