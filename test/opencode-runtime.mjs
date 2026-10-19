import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
function prepare(args) {
  const result = spawnSync("/bin/zsh", ["-fc", `
    setopt no_unset
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
console.log("ok OpenCode V2 command routing: private servers, managed clients, explicit attachments and maintenance")
