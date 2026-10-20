import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { permissionTool } from "../profiles/opencode/permissions.js"
import { setup } from "../profiles/opencode/v2.js"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const home = mkdtempSync(join(root, "test/.run-permissions-"))
mkdirSync(join(home, ".config/opencode"), { recursive: true })
writeFileSync(join(home, ".config/opencode/opencode.json"), JSON.stringify({ permission: { external_directory: "ask" }, provider: { private: { apiKey: "PRIVATE_SECRET_PROVIDER" } } }))
process.env.HOME = home
const rules = (...rows) => rows.map(([permission, pattern, action]) => ({ permission, pattern, action }))
const agent = (name, permission) => ({ name, mode: name === "build" || name === "plan" ? "primary" : "subagent", permission })
const agents = [agent("build", rules(["*", "*", "allow"], ["external_directory", "*", "allow"])),
  agent("explore", rules(["*", "*", "deny"], ["read", "*", "allow"], ["external_directory", "*", "ask"])),
  agent("plan", rules(["*", "*", "allow"], ["edit", "*", "deny"], ["edit", ".opencode/plans/*.md", "allow"])),
  agent("PRIVATE_SECRET_NAME", rules(["read", "/PRIVATE_SECRET_PATH/*", "deny"]))]
const input = { agents, sessions: [{ agent: "build", child: false, permission: rules(["edit", "*", "deny"]) }, { agent: "explore", child: true, permission: rules(["external_directory", "*", "allow"]) }] }
const result = spawnSync("/usr/bin/jq", ["-c", "--arg", "scope", "global", "--arg", "outside", "/outside/*", "--argjson", "observed", "1", "-f", join(root, "profiles/opencode/permissions.jq")], { input: JSON.stringify(input), encoding: "utf8" })
assert.equal(result.status, 0, result.stderr)
const report = JSON.parse(result.stdout)
assert.equal(report.agents[1].probes.externalDirectory.action, "ask")
assert.equal(report.agents[1].editToolVisible, false)
assert.equal(report.agents[2].editToolVisible, true)
assert.equal(report.agents[2].probes.ordinaryEdit.action, "deny")
assert.equal(report.agents[2].probes.planningEdit.action, "allow")
assert.equal(report.sessions[0].probes.ordinaryEdit.action, "deny")
assert.equal(report.sessions[1].probes.externalDirectory.action, "allow")
assert.doesNotMatch(result.stdout, /PRIVATE_SECRET/)
assert.equal(report.autoApproval.state, "not_observable")
const tool = permissionTool({ directory: join(home, "workspace"), worktree: join(home, "workspace"), client: { app: { agents: async () => ({ data: agents }) } } })
assert.equal(JSON.parse(await tool.execute({})).availability, "observed")
const detail = JSON.parse(await tool.execute({}))
assert.equal(detail.sourceCandidates[0].confidence, "candidate_only")
assert.doesNotMatch(JSON.stringify(detail), /PRIVATE_SECRET/)
const request = JSON.parse(await tool.execute({ filePath: "../external/sample.txt" }))
assert.equal(request.agents[1].requested.externalDirectoryRequired, true)
assert.equal(request.agents[1].requested.externalDirectory.action, "ask")
assert.equal(request.agents[2].requested.edit.action, "deny")
const workspace = join(home, "workspace"), nestedDirectory = join(workspace, "nested")
const nested = permissionTool({ directory: nestedDirectory, worktree: workspace, client: { app: { agents: async () => ({ data: agents }) } } })
const rootPlan = JSON.parse(await nested.execute({ filePath: "../.opencode/plans/probe.md" }))
assert.equal(rootPlan.agents[2].requested.edit.action, "allow", "edit matching is relative to the worktree root")
assert.equal(rootPlan.agents[2].requested.externalDirectoryRequired, false)
const nestedPlan = JSON.parse(await nested.execute({ filePath: ".opencode/plans/probe.md" }))
assert.equal(nestedPlan.agents[2].requested.edit.action, "deny", "a nested planning directory is not the worktree planning exception")
const contextPlan = JSON.parse(await tool.execute({ filePath: "../.opencode/plans/probe.md" }, { directory: nestedDirectory, worktree: workspace }))
assert.equal(contextPlan.agents[2].requested.edit.action, "allow", "session context supplies the edit worktree")
const filesystemRoot = JSON.parse(await tool.execute({ filePath: ".opencode/plans/probe.md" }, { worktree: "/" }))
assert.equal(filesystemRoot.agents[2].requested.edit.action, "deny", "a root worktree is not replaced by the session directory")
assert.equal(JSON.parse(await tool.execute({ filePath: "sample.txt" }, { worktree: "relative" })).availability, "unavailable")
assert.equal(JSON.parse(await tool.execute({ filePath: 123 })).availability, "invalid_request")
assert.equal(JSON.parse(await permissionTool({}).execute({})).availability, "unavailable")
const malformed = permissionTool({ client: { app: { agents: async () => ({ data: [{ name: "build", permission: "PRIVATE_SECRET" }] }) } } })
const invalid = await malformed.execute({})
assert.equal(JSON.parse(invalid).availability, "unsupported")
assert.doesNotMatch(invalid, /PRIVATE_SECRET/)

async function v2Tool(directory, project, canonical = project) {
  const tools = {}
  const plan = join(home, ".opencode/plan")
  const external = join(home, "external/allowed.txt")
  await setup({
    location: { directory, project: { directory: project, canonical } },
    agent: { list: async () => ({ data: [
      { id: "build", mode: "primary", permissions: [
        { action: "*", resource: "*", effect: "allow" },
        { action: "external_directory", resource: "*", effect: "ask" },
        { action: "read", resource: "protected.txt", effect: "deny" },
        { action: "read", resource: "../protected.txt", effect: "deny" },
        { action: "edit", resource: "*", effect: "deny" },
        { action: "edit", resource: "src/*", effect: "allow" },
        { action: "edit", resource: external, effect: "allow" },
      ] },
      { id: "plan", mode: "primary", permissions: [
        { action: "*", resource: "*", effect: "allow" },
        { action: "edit", resource: "*", effect: "deny" },
        { action: "edit", resource: join(plan, "*"), effect: "allow" },
      ] },
    ] }) },
    tool: { hook: async () => {}, transform: async callback => callback({ add: tool => { tools[tool.name] = tool } }) },
    rpc: { register: async () => {} },
  }, async input => ({ tool: {
    agent_guard_status: { args: {}, execute: async () => '{"state":"active"}' },
    agent_guard_permissions: permissionTool(input),
  }, "tool.execute.before": async () => {} }))
  return async args => JSON.parse((await tools.agent_guard_permissions.execute(args, {})).content)
}
const v2Root = await v2Tool(workspace, workspace)
const v2Read = await v2Root({ filePath: "protected.txt" })
assert.equal(v2Read.agents[0].requested.read.action, "deny", "V2 internal read resources are location-relative")
assert.equal(v2Read.agents[1].probes.planningEdit.action, "allow", "V2 probes the home planning directory")
const v2Nested = await v2Tool(nestedDirectory, workspace)
assert.equal((await v2Nested({ filePath: "src/a.txt" })).agents[0].requested.edit.action, "allow")
const v2Sibling = await v2Nested({ filePath: "../protected.txt" })
assert.equal(v2Sibling.agents[0].requested.read.action, "deny")
assert.equal(v2Sibling.agents[0].requested.externalDirectoryRequired, false)
const v2External = await v2Nested({ filePath: join(home, "external/allowed.txt") })
assert.equal(v2External.agents[0].requested.edit.action, "allow", "V2 external edit resources are absolute")
assert.equal(v2External.agents[0].requested.externalDirectoryRequired, true)
assert.equal(v2External.agents[0].requested.externalDirectory.action, "ask")
assert.equal((await v2Nested({ filePath: "~/.opencode/plan/probe.md" })).agents[1].requested.edit.action, "allow")
const linkedProject = join(home, "linked-worktree")
const v2Linked = await v2Tool(join(linkedProject, "nested"), linkedProject, workspace)
assert.equal((await v2Linked({ filePath: join(workspace, "outside.txt") })).agents[0].requested.externalDirectoryRequired, true,
  "the canonical main checkout is external to a linked worktree")
assert.equal((await v2Linked({ filePath: "../protected.txt" })).agents[0].requested.externalDirectoryRequired, false)
console.log("ok permissions: role exceptions, inherited session rules, source limitations and privacy")
