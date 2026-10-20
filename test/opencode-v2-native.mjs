import assert from "node:assert/strict"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { spawn, spawnSync } from "node:child_process"
import { createServer } from "node:http"
import * as adapter from "./engines/zsh.mjs"

assert.equal(process.versions.node.split(".")[0], "24")
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const cli = realpathSync(process.env.AG_TEST_OPENCODE)
const modes = ["cli", "gui", "doctor", "managed-cli", "gui-signal", "gui-server-stop"]
const selected = process.argv[2] ? [process.argv[2]] : modes
assert.ok(selected.every(mode => modes.includes(mode)))
const run = realpathSync(mkdtempSync(join(root, "test/.run-opencode-v2-")))
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'"
console.log(`OpenCode V2 fixture: ${run}`)

for (const mode of selected) {
  const home = join(run, mode, "home"), tree = join(run, mode, "source")
  const project = join(home, "Projects/app"), readonly = join(home, "Projects/reference"), denied = join(home, "Projects/private")
  const engine = join(home, "Library/Application Support/AgentGuard"), config = join(home, ".config/opencode")
  for (const path of [tree, project, readonly, denied, join(home, "Agent Guard"), join(home, "fakebin"), join(config, "plugins")]) mkdirSync(path, { recursive: true })
  adapter.stage(root, tree, home)
  const release = adapter.layout(tree, engine)
  const launch = join(release, "launch")
  writeFileSync(launch, readFileSync(launch, "utf8").replace('if [[ $mode == gui ]]; then', 'if false; then'))
  cpSync(join(tree, "engine/vendor"), join(release, "vendor"), { recursive: true })
  symlinkSync(join(release, "profiles/opencode/plugin.js"), join(config, "plugins/agent-guard.js"))
  writeFileSync(join(home, "fakebin/opencode"), `#!/bin/sh\nexec ${quote(cli)} "$@"\n`, { mode: 0o755 })
  writeFileSync(join(home, "Agent Guard/Guard List.txt"), `ALLOW\n${home}/Projects\nREAD ONLY\n${readonly}\nDENY\n${denied}\n`)
  writeFileSync(join(denied, "secret.txt"), "DENIED-FIXTURE-CONTENT")
  const calls = [
    ["shell", { command: `touch ${quote(join(project, "shell-allowed"))}`, workdir: "~/Projects/app" }],
    ["write", { path: join(project, "allowed.txt"), content: "allowed" }],
    ["write", { path: join(readonly, "refused.txt"), content: "refused" }],
    ["patch", { patchText: `*** Begin Patch\n*** Add File: ${join(readonly, "patch.txt")}\n+refused\n*** End Patch` }],
    ["read", { path: join(denied, "secret.txt") }],
    ["shell", { command: "git reset --hard", workdir: project }],
    ["agent_guard_status", {}],
    ["agent_guard_permissions", {}],
  ]
  let index = 0
  const requests = []
  const model = createServer(async (req, res) => {
    if (req.method === "GET") { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); return }
    let body = ""; for await (const data of req) body += data
    const payload = JSON.parse(body)
    requests.push(payload)
    const action = payload.tools?.length ? calls[index++] : null
    const id = `fixture-${index}`
    const delta = action ? { role: "assistant", tool_calls: [{ index: 0, id, type: "function", function: { name: action[0], arguments: JSON.stringify(action[1]) } }] } : { role: "assistant", content: "done" }
    const base = { id, object: "chat.completion.chunk", created: 0, model: "fixture" }
    res.writeHead(200, { "content-type": "text/event-stream" })
    res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
    res.end(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: action ? "tool_calls" : "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\ndata: [DONE]\n\n`)
  })
  await new Promise(resolve => model.listen(0, "127.0.0.1", resolve))
  const url = `http://127.0.0.1:${model.address().port}`
  const reservation = createServer()
  await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve))
  const servicePort = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  writeFileSync(join(config, "service.json"), JSON.stringify({ port: servicePort }))
  writeFileSync(join(config, "opencode.json"), JSON.stringify({
    permission: { bash: "allow", external_directory: "allow", edit: "allow" },
    provider: { guardfixture: { name: "Fixture", npm: "@ai-sdk/openai-compatible", options: { baseURL: url + "/v1", apiKey: "fixture" }, models: { test: { name: "Fixture", tool_call: true, limit: { context: 16384, output: 1024 } } } } },
  }))
  const env = { HOME: home, SHELL: "/bin/zsh", PATH: join(home, "fakebin") + ":" + process.env.PATH,
    TMPDIR: process.env.TMPDIR, LANG: "en_US.UTF-8", XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local/share"), XDG_STATE_HOME: join(home, ".local/state"),
    OPENCODE_MODELS_URL: url + "/models", OPENCODE_DISABLE_MODELS_FETCH: "1" }
  let route = "cli", args = ["--print-logs", "run", "--auto", "--model", "guardfixture/test", "--format", "json", "Perform the fixture calls"]
  if (mode.startsWith("gui")) {
    // The desktop fixture follows V2's actual service discovery contract. The
    // bundled CLI starts the server; the client supplies no standalone flag.
    const app = join(home, "Applications/OpenCode.app/Contents")
    mkdirSync(join(app, "MacOS"), { recursive: true })
    mkdirSync(join(app, "Resources"), { recursive: true })
    symlinkSync(cli, join(app, "Resources/opencode-cli"))
    writeFileSync(join(app, "Info.plist"), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>GuardV2Fixture</string></dict></plist>')
    const reconnect = mode === "gui-server-stop" ? `${quote(cli)} service stop\n` : ""
    const command = mode === "gui-signal" ? `touch ${quote(join(project, "client-ready"))}\nexec /bin/sleep 60` : `${reconnect}exec ${quote(cli)} run --auto --model guardfixture/test --format json 'Perform the fixture calls'`
    writeFileSync(join(app, "MacOS/GuardV2Fixture"), `#!/bin/sh\n${command}\n`, { mode: 0o755 })
    const harness = join(release, "profiles/opencode/harness.zsh")
    writeFileSync(harness, readFileSync(harness, "utf8").replace('app_paths=(/Applications/OpenCode.app "$home/Applications/OpenCode.app")', 'app_paths=("$home/Applications/OpenCode.app")').replace('app_bundle_id=ai.opencode.desktop', 'app_bundle_id=invalid.test'))
    route = "gui"; args = []
  } else if (mode === "doctor") {
    route = "check"; args = []
  } else if (mode === "managed-cli") {
    args = ["--print-logs", "mcp", "list"]
  }
  const child = spawn("/bin/zsh", [join(release, "launch"), route, ...args], { cwd: project, env, stdio: ["ignore", "pipe", "pipe"] })
  let output = "", error = ""
  child.stdout.on("data", data => { output += data })
  child.stderr.on("data", data => { error += data })
  const timer = setTimeout(() => child.kill("SIGTERM"), 60000)
  const completion = new Promise(resolve => child.on("exit", resolve))
  if (mode === "gui-signal") {
    for (let attempt = 0; attempt < 100 && !existsSync(join(project, "client-ready")) && child.exitCode === null; attempt++)
      await new Promise(resolve => setTimeout(resolve, 50))
    child.kill("SIGTERM")
  }
  const code = await completion
  clearTimeout(timer)
  model.closeAllConnections(); model.close()
  writeFileSync(join(run, mode, "stdout"), output)
  writeFileSync(join(run, mode, "stderr"), error)
  writeFileSync(join(run, mode, "requests.json"), JSON.stringify(requests))
  if (mode === "gui-server-stop" || mode === "gui-signal") {
    const service = spawnSync(cli, ["service", "status"], { env, encoding: "utf8", timeout: 10000 })
    if (service.stdout.trim() !== "stopped") spawnSync(cli, ["service", "stop"], { env, timeout: 10000 })
    assert.equal(service.stdout.trim(), "stopped", "a disconnected client must not leave a replacement service")
    assert.equal(code, mode === "gui-server-stop" ? 1 : 143, `${error}\n${output}`)
    if (mode === "gui-signal") assert.ok(existsSync(join(project, "client-ready")), error)
    console.log(`ok OpenCode V2 ${mode}: client and server lifetime coupled`)
    continue
  }
  assert.equal(code, 0, `${error}\n${output}\nfixture: ${run}`)
  if (mode === "doctor") {
    assert.match(output, /ok   Guard readiness in OpenCode V2/)
    assert.equal(index, 0, "doctor must not call a model")
  } else if (mode === "managed-cli") {
    assert.match(output, /No MCP servers configured/)
    assert.equal(index, 0)
    const service = spawnSync(cli, ["service", "status"], { env, encoding: "utf8", timeout: 10000 })
    assert.equal(service.stdout.trim(), "stopped")
  } else {
    assert.equal(index, calls.length + 1, output)
    assert.equal(readFileSync(join(project, "allowed.txt"), "utf8"), "allowed")
    assert.ok(existsSync(join(project, "shell-allowed")))
    assert.equal(existsSync(join(readonly, "refused.txt")), false)
    assert.equal(existsSync(join(readonly, "patch.txt")), false)
    const messages = requests.at(-1)?.messages
    const responses = JSON.stringify(messages)
    assert.match(messages.find(message => message.tool_call_id === "fixture-4")?.content ?? "", /Agent Guard:.*not writable/)
    assert.match(responses, /not writable/)
    assert.match(responses, /DENY list/)
    assert.match(responses, /git reset --hard/)
    assert.doesNotMatch(responses, /DENIED-FIXTURE-CONTENT/)
    assert.match(responses, /\\"state\\":\\"active\\"/)
    assert.match(responses, /\\"availability\\":\\"observed\\"/)
    const service = spawnSync(cli, ["service", "status"], { env, encoding: "utf8", timeout: 10000 })
    assert.equal(service.stdout.trim(), "stopped", "private or GUI-owned server must not survive its owner")
  }
  console.log(`ok OpenCode V2 ${mode}: ${mode === "doctor" ? "model-free readiness" : "tool policy and server lifetime"}`)
}
