import assert from "node:assert/strict"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createServer } from "node:http"
import { spawn } from "node:child_process"
import * as adapter from "./engines/zsh.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const run = mkdtempSync(join(root, "test/.run-skills-native-")), home = join(run, "home"), tree = join(run, "source")
const engine = join(home, "Library/Application Support/AgentGuard"), start = join(home, "Projects/start"), project = join(home, "Projects/selected")
const realCLI = [process.env.AG_TEST_OPENCODE, "/opt/homebrew/bin/opencode", "/usr/local/bin/opencode", ...process.env.PATH.split(":").map(p => join(p, "opencode"))]
  .find(p => p && existsSync(p) && !realpathSync(p).includes("/Library/Application Support/AgentGuard/"))
assert.ok(realCLI, "OpenCode CLI is required")
for (const p of [home, tree, start, project, join(home, "Agent Guard"), join(home, ".config/opencode/plugins"), join(home, "fakebin")]) mkdirSync(p, { recursive: true })
adapter.stage(root, tree, home)
const release = adapter.layout(tree, engine)
cpSync(join(tree, "engine/vendor"), join(release, "vendor"), { recursive: true })
symlinkSync(join(release, "profiles/opencode/plugin.js"), join(home, ".config/opencode/plugins/agent-guard.js"))
writeFileSync(join(home, ".config/opencode/.gitignore"), "node_modules\npackage.json\npackage-lock.json\nbun.lock\n.gitignore\n")
writeFileSync(join(home, "Agent Guard/Guard List.txt"), `ALLOW\n${home}/Projects\nREAD ONLY\nDENY\n`)
const quote = p => "'" + p.replaceAll("'", "'\\''") + "'"
writeFileSync(join(home, "fakebin/opencode"), `#!/bin/sh\nexec ${quote(realpathSync(realCLI))} "$@"\n`, { mode: 0o755 })
const localSkill = join(project, ".opencode/skills/native"), globalSkill = join(home, ".agents/skills/native")
const projectConfig = join(project, "opencode.json")
const ordinaryPlugin = join(project, ".opencode/plugins/ordinary.js")
const calls = [
  ["write", { filePath: projectConfig, content: "{}" }],
  ["read", { filePath: projectConfig }],
  ["edit", { filePath: projectConfig, oldString: "{}", newString: '{"model":"guardfixture/test"}' }],
  ["write", { filePath: ordinaryPlugin, content: "export const Ordinary = async () => ({})" }],
  ["bash", { command: "rm .opencode/plugins/ordinary.js", workdir: project, description: "Remove ordinary plugin" }],
  ["write", { filePath: join(project, ".opencode/.gitignore"), content: "node_modules/\n" }],
  ["write", { filePath: join(localSkill, "SKILL.md"), content: "first" }],
  ["write", { filePath: join(localSkill, "references/opencode.json"), content: "{}" }],
  ["edit", { filePath: join(localSkill, "SKILL.md"), oldString: "first", newString: "updated" }],
  ["bash", { command: "mv .opencode/skills/native .opencode/skills/native-renamed", workdir: project, description: "Rename fixture skill" }],
  ["bash", { command: "rm -r .opencode/skills/native-renamed", workdir: project, description: "Remove fixture skill" }],
  ["write", { filePath: join(globalSkill, "SKILL.md"), content: "global" }],
  ["bash", { command: `rm -rf ${quote(globalSkill)}`, workdir: project, description: "Remove global fixture skill" }],
]
const mode = process.argv[2] ?? "cli"
let requests = 0, totalRequests = 0
const server = createServer(async (req, res) => {
  if (req.method === "GET") { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); return }
  let body = ""; for await (const data of req) body += data
  writeFileSync(join(run, `model-request-${totalRequests++}.json`), body)
  const payload = JSON.parse(body)
  const action = payload.tools?.length ? calls[requests++] : null
  res.writeHead(200, { "content-type": "text/event-stream" })
  const event = delta => res.write(`data: ${JSON.stringify({ id: `fixture-${requests}`, object: "chat.completion.chunk", created: 0, model: "fixture", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
  if (action) event({ role: "assistant", tool_calls: [{ index: 0, id: `call-${requests}`, type: "function", function: { name: action[0], arguments: JSON.stringify(action[1]) } }] })
  else event({ role: "assistant", content: "done" })
  res.write(`data: ${JSON.stringify({ id: `fixture-${requests}`, object: "chat.completion.chunk", created: 0, model: "fixture", choices: [{ index: 0, delta: {}, finish_reason: action ? "tool_calls" : "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\ndata: [DONE]\n\n`)
  res.end()
})
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
const url = `http://127.0.0.1:${server.address().port}`
// Both execute directly, before model tool hooks. Kernel confinement must hold.
const containment = `
import fs from 'node:fs';
try { fs.writeFileSync(${JSON.stringify(join(home, "Documents/outside"))}, 'bad'); throw new Error('outside write succeeded'); }
catch (error) { if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error; }
`;
mkdirSync(join(home, "Documents"));
writeFileSync(join(home, ".config/opencode/plugins/containment.js"), containment + `
export const Containment = async () => { fs.writeFileSync(${JSON.stringify(join(project, "plugin-confined"))}, 'ok'); return {}; };
`);
const mcpScript = join(project, "mcp-fixture.mjs");
writeFileSync(mcpScript, containment + `
import readline from 'node:readline';
fs.writeFileSync(${JSON.stringify(join(project, "mcp-confined"))}, 'ok');
readline.createInterface({input: process.stdin}).on('line', line => {
  const req = JSON.parse(line); if (req.id === undefined) return;
  const result = req.method === 'initialize' ? {protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'fixture',version:'1'}} : req.method === 'tools/list' ? {tools:[]} : {};
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:req.id,result})+'\\n');
});
`);
writeFileSync(join(home, ".config/opencode/opencode.json"), JSON.stringify({
  mcp: { confinement: { type: "local", command: [process.execPath, mcpScript], enabled: true } },
  permission: { edit: "allow", bash: "allow", external_directory: "allow" },
  provider: { guardfixture: { name: "Fixture", npm: "@ai-sdk/openai-compatible", options: { baseURL: url + "/v1", apiKey: "fixture" }, models: { test: { name: "Fixture", tool_call: true, limit: { context: 8192, output: 1024 } } } } },
}))
const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, ".config"), XDG_DATA_HOME: join(home, ".local/share"), XDG_STATE_HOME: join(home, ".local/state"), PATH: join(home, "fakebin") + ":" + process.env.PATH, OPENCODE_MODELS_URL: url + "/models",
  AGENT_GUARD_CONTEXT: "", AGENT_GUARD_RELEASE: "", AGENT_GUARD_SANDBOXED: "", OPENCODE_SANDBOXED: "", CC_SAFETY_NET_PARANOID_RM: "", SAFETY_NET_PARANOID_RM: "", CC_SAFETY_NET_LEVEL: "strict" }
for (const name of ["OPENCODE_CONFIG", "OPENCODE_CONFIG_DIR", "OPENCODE_CONFIG_CONTENT", "XDG_CACHE_HOME"]) delete env[name]
console.log(`fixture: ${run}`)
let guardedServer
let child
if (mode === "cli") {
  child = spawn("/bin/zsh", [join(release, "launch"), "cli", "run", "--dir", project, "--model", "guardfixture/test", "--format", "json", "Perform the fixture tool calls."], { cwd: start, env, stdio: ["ignore", "pipe", "pipe"] })
} else {
  const port = 20000 + Math.floor(Math.random() * 30000)
  let route = "cli", args = ["serve", "--hostname", "127.0.0.1", "--port", String(port)]
  if (mode === "gui") {
    const app = join(home, "Applications/OpenCode.app/Contents"), executable = join(app, "MacOS/SkillFixture")
    mkdirSync(dirname(executable), { recursive: true })
    writeFileSync(join(app, "Info.plist"), '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>SkillFixture</string><key>CFBundleIdentifier</key><string>invalid.test</string></dict></plist>')
    writeFileSync(executable, `#!/bin/sh\n[ "$1" = --no-sandbox ] && shift\nexec ${quote(realpathSync(realCLI))} serve --hostname 127.0.0.1 --port ${port}\n`, { mode: 0o755 })
    const harness = join(release, "profiles/opencode/harness.zsh")
    writeFileSync(harness, readFileSync(harness, "utf8").replace('app_paths=(/Applications/OpenCode.app "$home/Applications/OpenCode.app")', 'app_paths=("$home/Applications/OpenCode.app")').replace('app_bundle_id=ai.opencode.desktop', 'app_bundle_id=invalid.test'))
    route = "gui"; args = []
  }
  guardedServer = spawn("/bin/zsh", [join(release, "launch"), route, ...args], { cwd: start, env, stdio: ["ignore", "pipe", "pipe"] })
  let listening = "", serverError = ""
  guardedServer.stdout.on("data", d => { listening += d })
  guardedServer.stderr.on("data", d => { serverError += d })
  for (let i = 0; i < 100 && !listening.includes("http://"); i++) await new Promise(resolve => setTimeout(resolve, 50))
  assert.ok(listening.includes("http://"), `${serverError}\n${listening}`)
  child = spawn(realpathSync(realCLI), ["run", "--attach", `http://127.0.0.1:${port}`, "--dir", project, "--model", "guardfixture/test", "--format", "json", "Perform the fixture tool calls."], { cwd: start, env, stdio: ["ignore", "pipe", "pipe"] })
}
let output = "", error = ""
child.stdout.on("data", d => { output += d })
child.stderr.on("data", d => { error += d })
const timer = setTimeout(() => child.kill("SIGTERM"), 45000)
const code = await new Promise(resolve => child.on("exit", resolve))
clearTimeout(timer)
server.close()
if (guardedServer) {
  const ended = new Promise(resolve => guardedServer.on("exit", resolve))
  guardedServer.kill("SIGTERM")
  await Promise.race([ended, new Promise((_, reject) => setTimeout(() => reject(new Error("guarded server did not stop")), 5000))])
}
writeFileSync(join(run, "opencode.out"), output); writeFileSync(join(run, "opencode.err"), error)
const context = JSON.parse(readFileSync(join(engine, "state/rules.json"), "utf8"))
assert.equal(existsSync(context.preparation), false, "preparation channel is removed after process exit")
assert.equal(code, 0, `${error}\n${output}\nfixture: ${run}`)
assert.equal(requests, calls.length + 1, output)
assert.equal(existsSync(localSkill), false)
assert.equal(existsSync(localSkill + "-renamed"), false)
assert.equal(existsSync(globalSkill), false)
assert.equal(readFileSync(join(project, ".opencode/.gitignore"), "utf8"), "node_modules/\n")
assert.equal(existsSync(ordinaryPlugin), false)
assert.equal(readFileSync(join(project, "plugin-confined"), "utf8"), "ok")
assert.equal(readFileSync(join(project, "mcp-confined"), "utf8"), "ok")
const events = output.split("\n").flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
const tools = events.filter(e => e.type === "tool_use")
assert.equal(tools.length, calls.length, output)
assert.ok(tools.every(e => e.part?.state?.status !== "error"), output)
console.log(`ok native OpenCode ${mode}: ${calls.length} configuration and skill operations with confined plugin/MCP initialization`)
