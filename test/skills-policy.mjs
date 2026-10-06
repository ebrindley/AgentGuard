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
const custom = { name: "custom-printf", command: "printf", block_args: ["custom-denied"], reason: "Operator restriction" }
const mixed = { ...factory, allowed_commands: ["rm", "printf"], rules: [...factory.rules, custom] }
writeFileSync(join(rules, "agent-guard/rulebook.json"), JSON.stringify(mixed))
writeFileSync(join(home, "Projects/rules/rulebook.json"), JSON.stringify({ rulebook_version: 1, name: "other", version: "1", allowed_commands: ["printf"], rules: [{ ...custom, name: "other-printf", block_args: ["other-denied"] }] }))
symlinkSync(join(home, "Projects/rules"), join(rules, "other"))
writeFileSync(join(rules, "rule.json"), JSON.stringify({ version: 1, rules: ["agent-guard", "other"], overrides: {}, transparent_wrappers: ["env", "timeout"] }))
writeFileSync(join(home, "Agent Guard/Guard List.txt"), `ALLOW\n${home}/Projects\nREAD ONLY\nDENY\n`)
const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), CC_SAFETY_NET_LEVEL: "strict", CC_SAFETY_NET_PARANOID_RM: "", SAFETY_NET_PARANOID_RM: "", AGENT_GUARD_SANDBOXED: "", OPENCODE_SANDBOXED: "" }
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
process.env.CC_SAFETY_NET_LEVEL = "strict"
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
console.log(`fixture: ${run}`)
