import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createConnection } from 'node:net'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { createRequire } from 'node:module'

assert.equal(process.versions.node.split('.')[0], '24', 'Node 24 required')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'profiles/opencode/browser')
const nativeRequire = createRequire(import.meta.url)
function loadGUI() {
  const token = {}
  const context = { module: { exports: {} }, require(name) {
    if (name === '@opencode/plugin/gui') return { Plugin: { define: x => x }, Command: token, Ipc: { define: x => x } }
    if (name === 'effect') return { Schema: { String: {} } }
    return nativeRequire(name)
  }, setTimeout, clearTimeout, Map, Date, Promise, Error, process, Buffer }
  vm.runInNewContext(readFileSync(join(source, 'gui.cjs'), 'utf8'), context)
  return { definition: context.module.exports.default, token }
}
const run = mkdtempSync('/tmp/agentguard-browser-test.')
console.log(`Browser fixture: ${run}`)
const socket = join(run, 's'), captured = join(run, 'opened'), app = join(run, 'Browser.app')
mkdirSync(app)
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'"
const opener = join(run, 'open')
writeFileSync(opener, `#!/bin/zsh -f\nprint -r -- "$@" >> ${quote(captured)}\n`, { mode: 0o755 })
const helper = join(run, 'helper.zsh')
writeFileSync(helper, readFileSync(join(source, 'helper.zsh'), 'utf8').replace('/usr/bin/open -a', `${quote(opener)} -a`))
const child = spawn('/bin/zsh', ['-f', helper, socket, app], { stdio: ['ignore', 'ignore', 'pipe'] })
let errors = ''
child.stderr.on('data', chunk => { errors += chunk })
const closed = new Promise(resolve => child.once('close', resolve))
async function request(url) {
  return await new Promise((resolve, reject) => {
    const client = createConnection(socket)
    const data = Buffer.from(url)
    let reply = ''
    client.setTimeout(5000, () => { client.destroy(); reject(new Error('helper timeout')) })
    client.on('error', reject)
    client.on('connect', () => client.write(Buffer.concat([Buffer.from(String(data.length).padStart(5, '0')), data])))
    client.on('data', chunk => {
      reply += chunk
      if (reply.includes('\n')) { client.destroy(); resolve(reply.trim()) }
    })
  })
}
try {
  // The socket file exists from bind(), before listen(); only a connection shows readiness.
  const listening = () => new Promise(resolve => {
    const probe = createConnection(socket)
    probe.once('connect', () => { probe.destroy(); resolve(true) })
    probe.once('error', () => resolve(false))
  })
  let ready = false
  for (let i = 0; i < 80 && !ready && child.exitCode === null; i++) {
    ready = await listening()
    if (!ready) await new Promise(resolve => setTimeout(resolve, 25))
  }
  assert.ok(ready, errors || 'helper did not start')
  const allowed = [
    'https://auth.openai.com/api/accounts/authorize?client_id=dynamic_agent_client&redirect_uri=http%3A%2F%2F127.0.0.1%3A45678%2Fauth%2Fcallback',
    'https://opencode.ai/console/device?user_code=dummy',
    'https://claude.ai/oauth/authorize?code_challenge=dummy',
    'https://console.anthropic.com/oauth/authorize?code_challenge=dummy',
  ]
  for (const url of allowed) assert.equal(await request(url), 'ok')
  const before = readFileSync(captured, 'utf8')
  for (const url of [
    'file:///System/Applications/Terminal.app', 'x-apple.systempreferences:foo',
    'https://example.com/', 'https://auth.openai.com.evil.test/api/accounts/authorize?x=1',
    'https://auth.openai.com@evil.test/api/accounts/authorize?x=1',
    'http://127.0.0.1:1234/', 'https://opencode.ai/console/../download',
    'https://opencode.ai/console/%2e%2e/download', 'https://opencode.ai/console/\n-a Terminal',
    'https://opencode.ai/console/\\evil', '-a Terminal',
  ]) assert.match(await request(url), /^error:/, url)
  // Oversize frames may be closed before the client finishes writing them.
  assert.match(await request('x'.repeat(8193)).catch(error => `error: ${error.code}`), /^error:/)
  assert.equal(readFileSync(captured, 'utf8'), before)
  assert.equal(await request(allowed[0]), 'ok', 'listener survives invalid requests')
  // A client that leaves before the reply is written must not end the helper.
  for (let i = 0; i < 5; i++) {
    const gone = createConnection(socket)
    await new Promise(resolve => { gone.once('connect', resolve); gone.once('error', resolve) })
    gone.destroy()
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  assert.equal(child.exitCode, null, 'helper exited after clients disconnected early')
  assert.equal(await request(allowed[0]), 'ok', 'listener survives early disconnects')
  for (const partial of ['0', '00100h']) {
    const stalled = createConnection(socket)
    stalled.on('error', () => {})
    await new Promise(resolve => stalled.once('connect', resolve))
    stalled.write(partial)
    try {
      const started = Date.now()
      assert.equal(await request(allowed[0]), 'ok')
      assert.ok(Date.now() - started < 4500, 'partial frame must not wedge subsequent requests')
    } finally { stalled.destroy() }
  }
  assert.ok(before.includes(`-a ${app} -- ${allowed[0]}`))
  console.log('ok helper: provider URLs, fixed browser target, rejected file/scheme/host/path/oversize requests')

  const profile = join(run, 'caller.sb')
  writeFileSync(profile, `(version 1) (allow default) (deny lsopen) (deny process-exec (literal "/usr/bin/open")) (deny file-write* (literal "${socket}"))`)
  const probe = spawnSync('/usr/bin/sandbox-exec', ['-f', profile, '/bin/zsh', join(source, 'bin/open'), allowed[0]], {
    env: { ...process.env, AGENT_GUARD_BROWSER_SOCKET: socket }, encoding: 'utf8', timeout: 15000,
  })
  // The helper runs in this process's event loop, but is a separate shell, so
  // synchronous caller probes cannot deadlock its listener.
  assert.equal(probe.status, 0, probe.stderr)
  const denied = spawnSync('/usr/bin/sandbox-exec', ['-f', profile, '/usr/bin/open', '-h'], { encoding: 'utf8' })
  assert.notEqual(denied.status, 0)
  console.log('ok Seatbelt caller: delegated browser request succeeds while direct open remains denied')

  const fakebin = join(run, 'cli')
  mkdirSync(fakebin)
  writeFileSync(join(fakebin, 'claude'), `#!/bin/zsh -f\n[[ -t 0 && -t 1 && $* == 'auth login --claudeai' ]] || exit 1\nexec open 'https://claude.ai/oauth/authorize?code_challenge=fixture'\n`, { mode: 0o755 })
  const priorPath = process.env.PATH, priorSocket = process.env.AGENT_GUARD_BROWSER_SOCKET
  process.env.PATH = `${fakebin}:${join(source, 'bin')}:/usr/bin:/bin`
  process.env.AGENT_GUARD_BROWSER_SOCKET = socket
  let ipc, dispose
  try {
    loadGUI().definition.main({ provide: (_token, impl) => { ipc = impl }, onCleanup: fn => { dispose = fn } })
    await ipc.open(allowed[1])
    await ipc.claude()
    assert.ok(readFileSync(captured, 'utf8').includes('code_challenge=fixture'))
  } finally {
    dispose?.()
    process.env.PATH = priorPath
    if (priorSocket === undefined) delete process.env.AGENT_GUARD_BROWSER_SOCKET
    else process.env.AGENT_GUARD_BROWSER_SOCKET = priorSocket
  }
  console.log('ok GUI main IPC and Claude PTY: native request framing and protected opener forwarding')
} finally {
  child.kill('SIGTERM')
  const stopped = await Promise.race([closed.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 3000))])
  if (!stopped) { child.kill('SIGKILL'); await closed }
  assert.ok(stopped, 'helper did not stop on TERM')
}

// Execute the shipped GUI module against the same public plugin interfaces,
// without loading Electron or starting any authentication process.
const commands = [], messages = [], opened = [], calls = []
const { definition, token } = loadGUI()
const cleanup = definition.setup({
  main: () => ({ open: async url => opened.push(url), claude: async () => {}, cancelClaude: async () => {} }),
  client: { integration: { oauth: {
    connect: async input => { calls.push(input); return { location: { directory: '/fixture' }, data: { mode: 'auto', attemptID: input.integrationID, url: `https://provider.test/${input.integrationID}` } } },
    status: async input => { assert.equal(input.location.directory, '/fixture'); return { data: { status: 'complete' } } }, cancel: async () => {},
  } } },
  add: (kind, command) => { assert.equal(kind, token); commands.push(command) },
  toast: { show: message => { messages.push(message); return { dismiss() {} } } },
})
assert.equal(commands.length, 3)
await commands[0].run(); await commands[1].run()
assert.deepEqual(opened, ['https://provider.test/openai', 'https://provider.test/opencode'])
assert.deepEqual(calls.map(x => x.methodID), ['chatgpt-token-sharing', 'device'])
assert.equal(messages.filter(x => x.title === 'Provider connected').length, 2)
cleanup()
console.log('ok GUI commands: existing OAuth API supplies browser URLs and completion')

const lifecycle = join(run, 'browser.zsh')
writeFileSync(lifecycle, readFileSync(join(source, '../browser.zsh'), 'utf8')
  .replace('/usr/bin/osascript -l JavaScript "$profile_dir/browser/default-browser.js"', `/usr/bin/printf %s ${quote(app)}`))
mkdirSync(join(run, 'engine/state'), { recursive: true })
for (const inlineConfig of [undefined, '', '{"plugins":["existing"],"theme":"preserved"}']) {
  const env = { PATH: '/usr/bin:/bin' }
  if (inlineConfig !== undefined) env.OPENCODE_CONFIG_CONTENT = inlineConfig
  const result = spawnSync('/bin/zsh', ['-fc', `
  setopt err_exit no_unset pipe_fail
  source "$1"
  engine=$2 profile_dir=$3 mode=gui
  opencode_host_env=(/usr/bin/env PATH=/usr/bin:/bin)
  note() { print -ru2 -- "$*"; }
  fail() { print -ru2 -- "$*"; exit 1; }
  opencode_browser_start
  [[ -S $AGENT_GUARD_BROWSER_SOCKET ]]
  [[ $PATH == "$profile_dir/browser/bin:"* ]]
  saved=$opencode_browser_dir
  for item in "\${opencode_host_env[@]}"; do
    [[ $item != OPENCODE_CONFIG_CONTENT=* ]] || print -r -- "\${item#*=}"
  done
  opencode_browser_stop
  [[ ! -e $saved ]]
`, 'browser', lifecycle, join(run, 'engine'), join(source, '..')], {
  env,
  encoding: 'utf8', timeout: 10000,
})
  assert.equal(result.status, 0, result.stderr)
  const config = JSON.parse(result.stdout)
  if (inlineConfig) {
    assert.equal(config.theme, 'preserved')
    assert.deepEqual(config.plugins, ['existing', join(source, '..', 'browser')])
  } else {
    assert.deepEqual(config, { plugins: [join(source, '..', 'browser')] })
  }
}
console.log('ok launcher: helper readiness, protected shim path, config preservation and cleanup')

for (const [args, wanted] of [
  [[], 0], [['/some/project'], 0], [['--model', 'fixture/model', '/some/project'], 0],
  [['--print-logs', 'auth', 'login'], 0], [['--log-level', 'error', 'auth', 'login'], 0],
  [['auth', 'logout'], 1], [['--help'], 1], [['auth', 'login', '--help'], 1],
  [['serve'], 1], [['run', 'hello'], 1], [['models'], 1],
]) {
  const routed = spawnSync('/bin/zsh', ['-fc', 'setopt extended_glob; source "$1"; source "$2"; shift 2; opencode_browser_cli_requested "$@"',
    'browser', join(source, '../runtime.zsh'), join(source, '../browser.zsh'), ...args])
  assert.equal(routed.status, wanted, JSON.stringify(args))
}
console.log('ok launcher routing: global flags, project TUI, login and noninteractive commands')
