import assert from "node:assert/strict"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { spawn, spawnSync } from "node:child_process"
import { createServer } from "node:http"
import { DatabaseSync } from "node:sqlite"
import * as adapter from "./engines/zsh.mjs"

assert.equal(process.versions.node.split(".")[0], "24", "native permission fixture requires Node 24")
assert.ok(!process.env.AGENT_GUARD_SANDBOXED && !process.env.OPENCODE_SANDBOXED, "run the fixture outside an existing sandbox")
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const realCLI = [process.env.AG_TEST_OPENCODE, "/opt/homebrew/bin/opencode", "/usr/local/bin/opencode", ...(process.env.PATH ?? "").split(":").map(p => join(p, "opencode"))]
  .find(p => p && existsSync(p) && !realpathSync(p).includes("/Library/Application Support/AgentGuard/"))
assert.ok(realCLI, "OpenCode CLI is required")
const version = spawnSync(realCLI, ["--version"], { encoding: "utf8" })
assert.equal(version.status, 0, version.stderr)
const modes = ["explore-default", "plan-paths", "auto-protection"]
const selected = process.argv[2] ? [process.argv[2]] : modes
assert.ok(selected.every(mode => modes.includes(mode)), "expected explore-default, plan-paths, or auto-protection")
const run = realpathSync(mkdtempSync(join(root, "test/.run-opencode-permissions-native-")))
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'"
const reports = []
console.log(`OpenCode ${version.stdout.trim()}; fixture: ${run}`)

for (const mode of selected) {
  const home = join(run, mode, "home"), tree = join(run, mode, "source")
  const project = join(home, "Projects/app"), external = join(home, "Projects/external"), denied = join(home, "Projects/denied")
  const engine = join(home, "Library/Application Support/AgentGuard")
  const config = join(home, ".config/opencode"), permissionEvents = join(project, "permission-events.jsonl")
  for (const path of [tree, project, external, denied, join(home, "Agent Guard"), join(home, "fakebin"), join(config, "plugins")]) mkdirSync(path, { recursive: true })
  // A sibling of a git worktree is external to OpenCode's active project.
  const git = spawnSync("git", ["-C", project, "init", "--quiet"], { encoding: "utf8" })
  assert.equal(git.status, 0, git.stderr)
  adapter.stage(root, tree, home)
  const release = adapter.layout(tree, engine)
  cpSync(join(tree, "engine/vendor"), join(release, "vendor"), { recursive: true })
  symlinkSync(join(release, "profiles/opencode/plugin.js"), join(config, "plugins/agent-guard.js"))
  writeFileSync(join(config, ".gitignore"), "node_modules\npackage.json\npackage-lock.json\nbun.lock\n.gitignore\n")
  writeFileSync(join(home, "fakebin/opencode"), `#!/bin/sh\nexec ${quote(realpathSync(realCLI))} "$@"\n`, { mode: 0o755 })
  writeFileSync(join(home, "Agent Guard/Guard List.txt"), `ALLOW\n${home}/Projects\nREAD ONLY\nDENY\n${denied}\n`)
  const plain = join(external, "plain.txt"), deniedFile = join(denied, "plain.txt"), secret = join(external, ".env")
  const plainContents = "PERMITTED-EXTERNAL-FIXTURE", deniedContents = "DENIED-CONTENTS-MUST-STAY-PRIVATE", secretContents = "SYNTHETIC_SECRET=DO-NOT-RETURN"
  writeFileSync(plain, plainContents)
  writeFileSync(deniedFile, deniedContents)
  writeFileSync(secret, secretContents)
  // Observe native permission events; no permission reply or host policy change.
  writeFileSync(join(config, "plugins/permission-observer.js"), `import { appendFileSync, writeFileSync } from 'node:fs';
export const PermissionObserver = async () => {
  writeFileSync(${JSON.stringify(permissionEvents)}, '');
  return { event: async ({ event }) => {
    const record = event.type === 'permission.asked' ? event : { type: event.type };
    appendFileSync(${JSON.stringify(permissionEvents)}, JSON.stringify(record) + '\\n');
  } };
};\n`)

  const childCalls = mode === "auto-protection" ? [
    ["read", { filePath: plain }],
    ["read", { filePath: deniedFile }],
    ["read", { filePath: secret }],
    ["bash", { command: "git reset --hard", workdir: project, description: "Probe destructive command rejection" }],
  ] : [["read", { filePath: plain }]]
  const planCalls = [
    ["write", { filePath: join(project, "ordinary.txt"), content: "MUST-NOT-WRITE" }],
    ["write", { filePath: join(project, ".opencode/plans/probe.md"), content: "Native planning-file fixture\n" }],
    ["agent_guard_permissions", {}],
  ]
  const mainCalls = [
    ["task", { description: "Probe Explore external reads", prompt: "Perform the fixture reads and safety probes, then finish.", subagent_type: "explore" }],
    ["agent_guard_permissions", {}],
  ]
  let mainIndex = 0, childIndex = 0, planIndex = 0, requestIndex = 0
  const observedTools = [], actionIDs = []
  const model = createServer(async (req, res) => {
    if (req.method === "GET") { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); return }
    let body = ""; for await (const data of req) body += data
    writeFileSync(join(run, mode, `model-request-${requestIndex++}.json`), body)
    const payload = JSON.parse(body), names = (payload.tools ?? []).map(tool => tool.function?.name ?? tool.name)
    let action = null, role = "auxiliary", index = 0
    if (names.length) {
      if (mode === "plan-paths") { role = "plan"; index = planIndex; action = planCalls[planIndex++] }
      else if (names.includes("task")) { role = "main"; index = mainIndex; action = mainCalls[mainIndex++] }
      else { role = "explore"; index = childIndex; action = childCalls[childIndex++] }
      observedTools.push({ role, names })
    }
    const id = `${mode}-${role}-${index}`
    if (action) actionIDs.push({ id, role, tool: action[0], args: action[1] })
    res.writeHead(200, { "content-type": "text/event-stream" })
    const base = { id, object: "chat.completion.chunk", created: 0, model: "fixture" }
    const delta = action ? { role: "assistant", tool_calls: [{ index: 0, id, type: "function", function: { name: action[0], arguments: JSON.stringify(action[1]) } }] } : { role: "assistant", content: "done" }
    res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
    res.end(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: action ? "tool_calls" : "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise(resolve => model.listen(0, "127.0.0.1", resolve))
  const url = `http://127.0.0.1:${model.address().port}`
  const agent = mode === "auto-protection" ? { explore: { permission: { external_directory: "ask" } } } : undefined
  writeFileSync(join(config, "opencode.json"), JSON.stringify({
    permission: { bash: "allow", external_directory: "allow" }, agent,
    provider: { guardfixture: { name: "Fixture", npm: "@ai-sdk/openai-compatible", options: { baseURL: url + "/v1", apiKey: "fixture" }, models: { test: { name: "Fixture", tool_call: true, limit: { context: 16384, output: 1024 } } } } },
  }))
  // A minimal environment and a fresh home keep real provider credentials out.
  const env = { HOME: home, SHELL: "/bin/zsh", PATH: join(home, "fakebin") + ":" + process.env.PATH,
    TMPDIR: process.env.TMPDIR ?? tmpdir(), LANG: process.env.LANG ?? "en_US.UTF-8",
    XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local/share"), XDG_STATE_HOME: join(home, ".local/state"),
    OPENCODE_MODELS_URL: url + "/models", CC_SAFETY_NET_LEVEL: "strict" }
  const args = [join(release, "launch"), "cli", "run", ...(mode === "auto-protection" ? ["--auto"] : []),
    ...(mode === "plan-paths" ? ["--agent", "plan"] : []), "--dir", project, "--model", "guardfixture/test", "--format", "json", "Perform the native permission fixture."]
  const child = spawn("/bin/zsh", args, { cwd: project, env, stdio: ["ignore", "pipe", "pipe"] })
  let output = "", error = "", timedOut = false
  child.stdout.on("data", data => { output += data })
  child.stderr.on("data", data => { error += data })
  const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM") }, 60000)
  const code = await new Promise((resolve, reject) => { child.once("exit", resolve); child.once("error", reject) })
  clearTimeout(timer)
  await new Promise(resolve => model.close(resolve))
  writeFileSync(join(run, mode, "opencode.out"), output)
  writeFileSync(join(run, mode, "opencode.err"), error)
  assert.equal(timedOut, false, `${mode}: no manual approval response was supplied; fixture timed out\n${error}`)
  assert.equal(code, 0, `${mode}: ${error}\n${output}`)

  const db = new DatabaseSync(join(home, ".local/share/opencode/opencode.db"), { readOnly: true })
  const parts = db.prepare("SELECT p.data, p.session_id, s.agent, s.parent_id FROM part p JOIN session s ON s.id = p.session_id").all()
    .map(row => ({ ...JSON.parse(row.data), sessionID: row.session_id, sessionAgent: row.agent, parentID: row.parent_id }))
  db.close()
  const toolParts = parts.filter(part => part.type === "tool")
  assert.equal(existsSync(permissionEvents), true, "native event observer must initialize")
  const observedEvents = readFileSync(permissionEvents, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line))
  assert.ok(observedEvents.length > 0, "native event hook must receive events")
  const asked = observedEvents.filter(event => event.type === "permission.asked")
  assert.ok(asked.every(event => typeof event.properties?.tool?.callID === "string"), "approval observations must carry a correlatable tool call ID")
  const findAction = (role, tool, file) => actionIDs.find(action => action.role === role && action.tool === tool && (!file || action.args.filePath === file))
  const findPart = action => toolParts.find(part => part.callID === action?.id)
  const diagnostics = findPart(findAction(mode === "plan-paths" ? "plan" : "main", "agent_guard_permissions"))
  assert.equal(diagnostics?.state?.status, "completed", `permission diagnostic missing: ${output}`)
  const permissionReport = JSON.parse(diagnostics.state.output)
  assert.equal(permissionReport.availability, "observed")
  assert.equal(permissionReport.autoApproval.state, "not_observable")
  const diagnosticAgent = permissionReport.agents.find(agent => agent.agent === (mode === "plan-paths" ? "plan" : "explore"))
  assert.equal(diagnosticAgent?.probes?.ordinaryEdit?.action, "deny")

  if (mode === "plan-paths") {
    assert.ok(observedTools.some(request => request.role === "plan" && request.names.includes("write")), "Plan planning exception must keep editing tools available")
    const ordinary = findPart(findAction("plan", "write", join(project, "ordinary.txt")))
    const planning = findPart(findAction("plan", "write", join(project, ".opencode/plans/probe.md")))
    assert.equal(ordinary?.state?.status, "error")
    assert.match(ordinary.state.error, /permission|denied|reject/i)
    assert.equal(existsSync(join(project, "ordinary.txt")), false)
    assert.equal(planning?.state?.status, "completed")
    assert.equal(readFileSync(join(project, ".opencode/plans/probe.md"), "utf8"), "Native planning-file fixture\n")
    assert.equal(diagnosticAgent?.probes?.planningEdit?.action, "allow")
    assert.equal(asked.length, 0, "explicit Plan denies and allows must not request approval")
  } else {
    const childRequests = observedTools.filter(request => request.role === "explore")
    assert.ok(childRequests.length > 0, "Explore model request must be observed")
    assert.ok(childRequests.every(request => !request.names.some(name => ["write", "edit", "apply_patch"].includes(name))), "Explore retains native editing restrictions")
    const task = findPart(findAction("main", "task")), read = findPart(findAction("explore", "read", plain))
    assert.equal(task?.state?.status, "completed")
    assert.equal(read?.state?.status, "completed")
    assert.ok(read.state.output.includes(plainContents))
    assert.equal(read.sessionAgent, "explore")
    assert.equal(read.parentID, task.sessionID, "read must belong to the task's child session")
    assert.notEqual(read.sessionID, task.sessionID)
    assert.ok(permissionReport.sessions.some(session => session.agent === "explore" && session.relationship === "subagent"), "main diagnostic includes the linked Explore child")
    if (mode === "explore-default") assert.equal(asked.length, 0, "global external allowance avoids native permission requests")
    else {
      for (const action of actionIDs.filter(action => action.role === "explore" && (action.args.filePath === deniedFile || action.args.filePath === secret || action.tool === "bash"))) {
        const blocked = findPart(action)
        assert.equal(blocked?.state?.status, "error", `${action.tool} must remain blocked under native auto`)
        assert.equal(blocked.sessionID, read.sessionID, "safety probes must run in the same Explore child")
        assert.equal(asked.some(event => event.properties?.tool?.callID === action.id), false, "Guard rejection must precede native approval")
      }
      assert.match(findPart(findAction("explore", "read", deniedFile)).state.error, /DENY|EPERM/)
      assert.match(findPart(findAction("explore", "read", secret)).state.error, /secret|\.env|Safety Net/i)
      assert.match(findPart(findAction("explore", "bash")).state.error, /reset|Safety Net/i)
      assert.equal(parts.some(part => part.state?.output?.includes(deniedContents) || part.state?.output?.includes(secretContents)), false)
    }
  }
  const report = { mode, cliVersion: version.stdout.trim(), exitCode: code, modelRequests: requestIndex, nativePermissionRequests: asked.length,
    toolCalls: toolParts.length, linkedExploreReads: toolParts.filter(part => part.tool === "read" && part.sessionAgent === "explore" && part.parentID).length }
  reports.push(report)
  console.log(`ok native ${mode}: ${JSON.stringify(report)}`)
}
writeFileSync(join(run, "results.json"), JSON.stringify(reports, null, 2) + "\n")
console.log(`Completed ${reports.length} native permission cases; retained ${run}`)
