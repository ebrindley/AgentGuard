import assert from "node:assert/strict"
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { spawnSync } from "node:child_process"
import * as adapter from "./engines/zsh.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), ".."), run = mkdtempSync(join(root, "test/.run-skills-policy-"))
const home = join(run, "home"), tree = join(run, "source"), project = join(home, "Projects/app"), engine = join(home, "Library/Application Support/AgentGuard")
for (const p of [tree, project, join(home, "Projects/rules"), join(home, "Agent Guard"), join(home, ".cc-safety-net/rules/agent-guard")]) mkdirSync(p, { recursive: true })
adapter.stage(root, tree, home)
const release = adapter.layout(tree, engine)
cpSync(join(tree, "engine/vendor"), join(release, "vendor"), { recursive: true })
const source = join(home, ".cc-safety-net"), rules = join(source, "rules")
const factory = JSON.parse(readFileSync(join(root, "profiles/opencode/templates/cc-safety-net/rules/agent-guard/rulebook.json"), "utf8"))
const factoryText = readFileSync(join(root, "profiles/opencode/templates/cc-safety-net/rules/agent-guard/rulebook.json"), "utf8")
const installerEngine = join(run, "rulebook-engine"), installerRules = join(run, "rulebook-rules")
for (const version of ["old", "new"]) {
  const dir = join(installerEngine, "releases", version, "profiles/opencode/templates/cc-safety-net/rules/agent-guard")
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "rulebook.json"), version === "new" ? factoryText : JSON.stringify({ ...factory, version: "previous-factory" }))
}
mkdirSync(join(installerRules, "agent-guard"), { recursive: true })
const installedRulebook = join(installerRules, "agent-guard/rulebook.json")
for (const [name, content, expected, previous] of [
  ["formatted factory", JSON.stringify(factory), factoryText, "old"],
  ["previous factory", JSON.stringify({ ...factory, version: "previous-factory" }), factoryText, "old"],
  ["custom update", JSON.stringify({ ...factory, version: "operator-custom" }), null, "old"],
  ["custom install", JSON.stringify({ ...factory, version: "operator-custom" }), null, ""],
]) {
  writeFileSync(installedRulebook, content)
  const result = spawnSync("/bin/zsh", ["-fc", `source "$1"
engine=$2 cc=$3 ag_rid_old=$4 ag_rid_new=new
ag_jlast() { REPLY=; }
ag_backup() { :; }
ag_jnl() { :; }
ag_sha() { REPLY=fixture; }
do_rulebook`, "rulebook", join(root, "installer/lib.zsh"), installerEngine, installerRules, previous], { encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(installedRulebook, "utf8"), expected ?? content, name)
}
console.log("ok installer rulebooks: formatted factory, previous factory, custom update and custom install")
if (process.argv[2] === "rulebook") process.exit(0)
const custom = { name: "custom-printf", command: "printf", block_args: ["custom-denied"], reason: "Operator restriction" }
const mixed = { ...factory, allowed_commands: ["rm", "printf"], rules: [...factory.rules, custom] }
writeFileSync(join(rules, "agent-guard/rulebook.json"), JSON.stringify(mixed))
writeFileSync(join(home, "Projects/rules/rulebook.json"), JSON.stringify({ rulebook_version: 1, name: "other", version: "1", allowed_commands: ["printf"], rules: [{ ...custom, name: "other-printf", block_args: ["other-denied"] }] }))
symlinkSync(join(home, "Projects/rules"), join(rules, "other"))
writeFileSync(join(rules, "rule.json"), JSON.stringify({ version: 1, rules: ["agent-guard", "other"], overrides: {}, transparent_wrappers: ["env", "timeout"] }))
writeFileSync(join(home, "Agent Guard/Guard List.txt"), `ALLOW\n${home}/Projects\nREAD ONLY\nDENY\n`)
const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), CC_SAFETY_NET_LEVEL: "standard", CC_SAFETY_NET_PARANOID_RM: "", SAFETY_NET_PARANOID_RM: "", AGENT_GUARD_SANDBOXED: "", OPENCODE_SANDBOXED: "" }
delete env.XDG_CACHE_HOME
const before = readFileSync(join(rules, "agent-guard/rulebook.json"), "utf8")
const result = spawnSync("/bin/zsh", [join(release, "launch"), "profile"], { cwd: project, env, encoding: "utf8" })
assert.equal(result.status, 0, result.stderr)
const context = JSON.parse(readFileSync(join(engine, "state/rules.json"), "utf8"))
const snapshot = JSON.parse(readFileSync(join(context.checker, "rules/agent-guard/rulebook.json"), "utf8"))
assert.deepEqual(snapshot.rules, [custom])
assert.equal(lstatSync(join(context.checker, "rules/other")).isSymbolicLink(), false)
assert.equal(readFileSync(join(rules, "agent-guard/rulebook.json"), "utf8"), before)
process.env.CC_SAFETY_NET_HOME = context.checker
process.env.CC_SAFETY_NET_LEVEL = "standard"
process.env.CC_SAFETY_NET_PROJECT_TIGHTEN_ONLY = "1"
process.env.NODE_ENV = "test"
const { checkCommand } = await import(pathToFileURL(join(release, "vendor/cc-safety-net/dist/api.js")))
for (const command of ["printf custom-denied", "env printf other-denied"])
  assert.equal(checkCommand({ command, cwd: project }).kind, "deny", command)
assert.equal(checkCommand({ command: "rm -r ordinary", cwd: project }).kind, "allow")
mkdirSync(join(project, ".cc-safety-net"))
writeFileSync(join(project, ".cc-safety-net/policy.json"), JSON.stringify({ version: 1, destructive_command_protection: { enabled: false, allow_paths: [join(home, "Projects")] } }))
assert.equal(checkCommand({ command: "rm -r ../other-project", cwd: project }).kind, "deny")
const oldPath = join(root, "test/fixtures/installs/opencode-guard-1.0.4/vendor/cc-safety-net/dist/api.js")
process.env.CC_SAFETY_NET_HOME = source
const old = await import(pathToFileURL(oldPath))
assert.equal(old.checkCommand({ command: "rm -r ordinary", cwd: project }).kind, "deny")
console.log("ok policy snapshot: custom rules, materialized links, project tightening and legacy consumer")
// A malformed policy.json launches with the dynamic-delete rule on and no allowances.
const malformed = (name, policy) => {
  const account = join(run, `malformed-${name}`), dest = join(account, "session")
  mkdirSync(join(account, ".cc-safety-net"), { recursive: true })
  writeFileSync(join(account, ".cc-safety-net/policy.json"), policy)
  const built = spawnSync("/bin/zsh", ["-fc", 'source "$1/checker/snapshot.zsh"; ag_checker_snapshot "$2" "$3" "$1" standard "$4"; rc=$?; print -r -- "$ag_checker_warning"; exit $rc',
    "snapshot", release, account, dest, join(account, "granted")], { encoding: "utf8" })
  assert.equal(built.status, 0, built.stderr)
  assert.match(built.stdout.trim(), /^checker policy is malformed; the session adds no automatic deletion allowances and turns the dynamic-delete rule on unless a readable policy sets rm\.recursive-force-dynamic-target to off: .*\/policy\.json$/, name)
  assert.equal(readFileSync(join(account, ".cc-safety-net/policy.json"), "utf8"), policy, `${name}: the user's policy is only read`)
  process.env.CC_SAFETY_NET_HOME = dest
  return { session: JSON.parse(readFileSync(join(dest, "policy.json"), "utf8")), cwd: account }
}
{
  const rule = "rm.recursive-force-dynamic-target"
  const wrong = malformed("allow-paths", JSON.stringify({ version: 1, destructive_command_protection: { allow_paths: "/tmp" } }))
  assert.deepEqual(wrong.session, { version: 1, destructive_command_protection: { allow_paths: "/tmp", overrides: { [rule]: "on" } } })
  for (const command of ['rm -rf "$TARGET"', "rm -rf *"]) {
    const verdict = checkCommand({ command, cwd: wrong.cwd })
    assert.equal(verdict.kind, "deny", command)
    assert.equal(verdict.ruleId, rule, command)
  }
  const minimal = { version: 1, destructive_command_protection: { overrides: { [rule]: "on" } } }
  for (const [name, policy] of [["not-json", "not json"], ["array", "[1]"], ["empty", ""]]) {
    const copy = malformed(name, policy)
    assert.deepEqual(copy.session, minimal, name)
    assert.equal(checkCommand({ command: 'rm -rf "$TARGET"', cwd: copy.cwd }).kind, "deny", name)
  }
  const container = malformed("container", JSON.stringify({ version: 1, safety: { level: "strict" }, destructive_command_protection: { overrides: "x" } }))
  assert.deepEqual(container.session, { version: 1, safety: { level: "strict" }, destructive_command_protection: { overrides: { [rule]: "on" } } })
  const off = malformed("user-off", JSON.stringify({ version: 1, destructive_command_protection: { allow_paths: "/tmp", overrides: { [rule]: "off" } } }))
  assert.equal(off.session.destructive_command_protection.overrides[rule], "off")
  assert.equal(checkCommand({ command: 'rm -rf "$TARGET"', cwd: off.cwd }).kind, "allow")
}
console.log("ok malformed policy: the session copy keeps the dynamic-delete rule unless the user's overrides name it")
console.log(`fixture: ${run}`)
