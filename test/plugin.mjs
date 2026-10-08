import { realpathSync } from "node:fs"
import { homedir } from "node:os"

// STATUS, in guarded mode: the exact text the status tool must return.
const [plugin, mode, status] = process.argv.slice(2)
// OpenCode Guard's plugin exports OpenCodeGuard; the migration tests probe it too.
const mod = await import(plugin)
const AgentGuard = mod.AgentGuard ?? mod.OpenCodeGuard
const home = realpathSync(homedir())
const directory = `${home}/Projects/app`
if (mode === "guarded") process.env.CC_SAFETY_NET_HOME = `${home}/Projects/net`
const hooks = await AgentGuard({ directory })
const hook = hooks["tool.execute.before"]
let failures = 0

// TEXT, when given, must be part of the refusal.
async function expect(want, name, tool, args, text) {
  let blocked = false
  try { await hook({ tool }, { args }) } catch (error) { blocked = text === undefined || error.message.includes(text) }
  const ok = want === "blocked" ? blocked : !blocked
  console.log(`${ok ? "ok  " : "FAIL"} plugin ${mode}: ${name}`)
  if (!ok) failures++
}

if (mode === "unguarded" || mode === "old-bypass" || mode === "symlinked") {
  await expect("blocked", "bash refused", "bash", { command: "ls" })
  await expect("blocked", "MCP tool refused", "github_create_issue", {})
  await expect("blocked", "read refused", "read", { filePath: "README.md" })
  await expect("allowed", "question allowed", "question", {})
} else if (mode === "bypass") {
  await expect("allowed", "bash allowed", "bash", { command: "ls" })
} else if (mode === "outside" || mode === "updated") {
  // Run guarded, a copy outside releases/ (outside) or a plugin whose
  // AGENT_GUARD_RELEASE names a release that is gone (updated): no cc-safety-net,
  // so no status tool and every tool refused.
  const text = mode === "updated" ? "Agent Guard was updated; quit and reopen OpenCode" : undefined
  const absent = hooks.tool?.agent_guard_status === undefined
  console.log(`${absent ? "ok  " : "FAIL"} plugin ${mode}: no agent_guard_status`)
  if (!absent) failures++
  await expect("blocked", "bash refused", "bash", { command: "ls" }, text)
  await expect("blocked", "read refused", "read", { filePath: "README.md" }, text)
  await expect("blocked", "edit in ALLOW refused", "edit", { filePath: "src/index.js" }, text)
} else {
  const registered = typeof hooks.tool?.agent_guard_status?.execute === "function"
  console.log(`${registered ? "ok  " : "FAIL"} plugin ${mode}: agent_guard_status registered`)
  if (!registered) failures++
  if (status !== undefined) {
    const said = registered ? await hooks.tool.agent_guard_status.execute({}) : ""
    console.log(`${said === status ? "ok  " : "FAIL"} plugin ${mode}: status reports "${status}"`)
    if (said !== status) failures++
  }
  // status mode checks only which release answered.
  if (mode === "status") process.exit(failures ? 1 : 0)
  await expect("allowed", "bash allowed", "bash", { command: "ls" })
  await expect("blocked", "absolute-path env wrapper", "bash", { command: "/usr/bin/env git reset --hard" })
  await expect("allowed", "scoped recursive rm with the engine-owned checker policy", "bash", { command: "rm -r sample" })
  await expect("blocked", "recursive rm behind a wrapper", "bash", { command: "timeout 5 rm -r ../outside" })
  await expect("blocked", "recursive rm inside bash -c", "bash", { command: "bash -c 'rm -r ../outside'" })
  await expect("blocked", "recursive rm inside env -S", "bash", { command: '/usr/bin/env -S "rm -r ../outside"' })
  await expect("allowed", "write cache through file tools", "write", { filePath: `${home}/.cache/opencode/package.json` })
  await expect("allowed", "edit in ALLOW", "edit", { filePath: "src/index.js" })
  await expect("allowed", "write new file in ALLOW", "write", { filePath: `${home}/Projects/app/a/b/c.txt` })
  await expect("blocked", "write outside lists", "write", { filePath: `${home}/Documents/x.txt` })
  await expect("blocked", "write READ ONLY", "edit", { filePath: `${home}/Projects/archive/x.txt` })
  await expect("allowed", "write ALLOW inside READ ONLY", "edit", { filePath: `${home}/Projects/archive/live/x.txt` })
  await expect("blocked", "write DENY", "write", { filePath: "secret/key" })
  await expect("blocked", "read DENY", "read", { filePath: "secret/key" })
  await expect("blocked", "grep DENY", "grep", { pattern: "x", path: `${home}/Documents/private` })
  await expect("blocked", "edit Guard List", "edit", { filePath: `${home}/Agent Guard/Guard List.txt` })
  // test.sh lists this folder under ALLOW; it stays protected.
  await expect("blocked", "write OpenCode Guard's engine folder", "write", { filePath: `${home}/Library/Application Support/OpenCodeGuard/bin/opencode` }, "is protected")
  await expect("blocked", "project plugin", "write", { filePath: ".opencode/plugins/x.js" })
  await expect("blocked", "project config", "edit", { filePath: "opencode.json" })
  await expect("blocked", "project tui config", "write", { filePath: "tui.json" })
  await expect("blocked", "list DENY", "list", { path: `${home}/Documents/private` })
  await expect("blocked", "project cc-safety-net policy", "write", { filePath: ".cc-safety-net/policy.json" })
  await expect("blocked", "tilde outside", "write", { filePath: "~/.zshrc" })
  await expect("blocked", "patch mixed", "apply_patch", { patchText: "*** Begin Patch\n*** Add File: ok.txt\n+x\n*** Delete File: ../../Documents/private/doc\n*** End Patch" })
  await expect("allowed", "patch inside", "apply_patch", { patchText: "*** Begin Patch\n*** Update File: a.txt\n*** Move to: b/a.txt\n@@\n-x\n+y\n*** End Patch" })
}
process.exit(failures ? 1 : 0)
