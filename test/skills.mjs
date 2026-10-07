import assert from "node:assert/strict"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import * as adapter from "./engines/zsh.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const run = mkdtempSync(join(root, "test/.run-skills-"))
const home = join(run, "home"), tree = join(run, "source"), engine = join(home, "Library/Application Support/AgentGuard")
for (const p of [home, tree, join(home, "Projects/app"), join(home, "Projects/second"), join(home, "Projects/third"), join(home, "Projects/blocked"), join(home, "Projects/reference"),
                 join(home, "Documents"), join(home, "Agent Guard"), join(home, "fakebin")]) mkdirSync(p, { recursive: true })
writeFileSync(join(home, "Projects/blocked/.opencode"), "not a directory")
adapter.stage(root, tree, home)
const release = adapter.layout(tree, engine)
cpSync(join(tree, "engine/vendor"), join(release, "vendor"), { recursive: true })
mkdirSync(join(home, ".cc-safety-net/rules/agent-guard"), { recursive: true })
cpSync(join(root, "profiles/opencode/templates/cc-safety-net/rules/agent-guard/rulebook.json"), join(home, ".cc-safety-net/rules/agent-guard/rulebook.json"))
writeFileSync(join(home, ".cc-safety-net/rules/rule.json"), '{"version":1,"rules":["agent-guard"],"overrides":{},"transparent_wrappers":["env","timeout"]}')
const list = join(home, "Agent Guard/Guard List.txt")
writeFileSync(list, `ALLOW\n${home}/Projects\nREAD ONLY\n${home}/Projects/reference\n${process.argv[2] === "readonly" ? home + "/.claude/skills\n" : ""}DENY\n`)
writeFileSync(join(home, "fakebin/opencode"), '#!/bin/sh\nexec "$@"\n', { mode: 0o755 })
const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local/share"), XDG_STATE_HOME: join(home, ".local/state"), PATH: join(home, "fakebin") + ":" + process.env.PATH,
              AGENT_GUARD_CONTEXT: "", AGENT_GUARD_RELEASE: "", AGENT_GUARD_SANDBOXED: "", OPENCODE_SANDBOXED: "",
              CC_SAFETY_NET_PARANOID_RM: "", SAFETY_NET_PARANOID_RM: "", CC_SAFETY_NET_LEVEL: "strict" }
for (const name of ["OPENCODE_CONFIG", "OPENCODE_CONFIG_DIR", "OPENCODE_CONFIG_CONTENT", "XDG_CACHE_HOME"]) delete env[name]
function client(mode, extra = {}) {
  const r = spawnSync("/bin/zsh", [join(release, "launch"), "cli", process.execPath, join(root, "test/skills-client.mjs"), join(release, "profiles/opencode/plugin.js"), mode],
    { cwd: join(home, "Projects/app"), env: { ...env, ...extra }, encoding: "utf8", timeout: 30000 })
  writeFileSync(join(run, mode + ".out"), r.stdout ?? "")
  writeFileSync(join(run, mode + ".err"), r.stderr ?? "")
  assert.equal(r.status, 0, `${mode}: ${r.error ?? ""}\n${r.stdout}\n${r.stderr}\nfixture: ${run}`)
  const context = JSON.parse(readFileSync(join(engine, "state/rules.json"), "utf8"))
  assert.equal(existsSync(context.preparation), false, "preparation channel is removed when the launch ends")
  assert.equal(existsSync(context.preparationReplies), false, "preparation replies are removed when the launch ends")
  process.stdout.write(r.stdout)
}
// A staged check removes its own snapshot however it ends, and leaves other sessions' snapshots.
function staged() {
  const next = join(engine, "releases/0.0.0-20000101T000000Z"), config = join(next, "profiles/opencode/check-config/opencode")
  const sessions = join(engine, "state/opencode"), rules = join(home, ".cc-safety-net/rules/rule.json"), saved = readFileSync(rules)
  cpSync(release, next, { recursive: true, verbatimSymlinks: true })
  writeFileSync(join(next, "RELEASE"), "0.0.0-20000101T000000Z\n")
  mkdirSync(join(config, "plugins"), { recursive: true })
  symlinkSync("../../../plugin.js", join(config, "plugins/agent-guard.js"))
  writeFileSync(join(config, ".gitignore"), "node_modules\npackage.json\npackage-lock.json\nbun.lock\n.gitignore\n")
  mkdirSync(join(home, "fakeserve"), { recursive: true })
  writeFileSync(join(home, "fakeserve/opencode"), `#!/bin/sh\nexec '${process.execPath}' '${join(root, "test/fake-opencode.mjs")}' "$@"\n`, { mode: 0o755 })
  const check = (extra = {}) => spawnSync("/bin/zsh", [join(next, "launch"), "check", "staged"], { cwd: join(home, "Projects/app"), env: { ...env, ...extra }, encoding: "utf8", timeout: 60000 })
  if (existsSync(sessions)) renameSync(sessions, sessions + ".kept")
  let r = check({ PATH: join(home, "fakeserve") + ":" + process.env.PATH })
  assert.equal(r.status, 0, `staged check passes\n${r.stdout}\n${r.stderr}\nfixture: ${run}`)
  assert.equal(existsSync(sessions), false, "a passing staged check removes its snapshot and the empty sessions folder")
  if (existsSync(sessions + ".kept")) renameSync(sessions + ".kept", sessions)
  mkdirSync(join(sessions, "unrelated.AAAAAAAA/checker"), { recursive: true })
  writeFileSync(join(sessions, "unrelated.AAAAAAAA/checker/policy.json"), "{}")
  const before = readdirSync(sessions).sort().join("\n")
  r = check()
  assert.notEqual(r.status, 0, "staged check fails without a serving OpenCode")
  assert.equal(readdirSync(sessions).sort().join("\n"), before, "a failed staged check removes only its own snapshot")
  writeFileSync(rules, "[]")
  r = check()
  writeFileSync(rules, saved)
  assert.ok(r.status !== 0 && r.stderr.includes("cannot preserve the checker policy"), r.stdout + r.stderr)
  assert.equal(readdirSync(sessions).sort().join("\n"), before, "a partial snapshot is removed")
  rmSync(next, { recursive: true })
  console.log("ok staged check snapshots removed")
}
console.log(`fixture: ${run}`)
if (!process.argv[2] || process.argv[2] === "lifecycle") client("lifecycle")
if (!process.argv[2] || process.argv[2] === "staged") staged()
if (process.argv[2] === "readonly") client("readonly")
if (process.argv[2] === "kernel") client("kernel")
if (process.argv[2] === "stdin") {
  const syntax = spawnSync("/bin/zsh", ["-fn", join(release, "launch")], { encoding: "utf8" })
  assert.equal(syntax.status, 0, syntax.stderr)
  assert.equal(syntax.stderr, "", "launcher syntax check is silent")
  const args = ["/bin/zsh", join(release, "launch"), "cli", process.execPath, join(root, "test/skills-client.mjs"), join(release, "profiles/opencode/plugin.js"), "stdin"]
  const words = args.map(a => "{" + a.replaceAll("}", "\\}") + "}").join(" ")
  const script = `set timeout 15\nspawn -noecho ${words}\nexpect stdin-ready\nsend "fixture\\r"\nexpect stdin-received:fixture\nexpect eof\nset r [wait]\nexit [lindex $r 3]\n`
  const result = spawnSync("/usr/bin/expect", ["-c", script], { cwd: join(home, "Projects/app"), env, encoding: "utf8", timeout: 20000 })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.ok(result.stdout.includes("stdin-received:fixture"), result.stdout)
  console.log("ok terminal input retained")
}
if (!process.argv[2] || process.argv[2] === "paranoid") client("paranoid", { CC_SAFETY_NET_LEVEL: "paranoid" })
console.log("ok skills fixture reports retained")
