import assert from "node:assert/strict"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
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
console.log(`fixture: ${run}`)
if (!process.argv[2] || process.argv[2] === "lifecycle") client("lifecycle")
if (process.argv[2] === "readonly") client("readonly")
if (process.argv[2] === "kernel") client("kernel")
if (process.argv[2] === "stdin") {
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
