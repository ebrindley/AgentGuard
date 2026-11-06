import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

assert.equal(process.versions.node.split('.')[0], '24', 'Node 24 required')
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const run = mkdtempSync('/tmp/agentguard-browser-native.')
const home = join(run, 'home'), project = join(run, 'project')
for (const directory of [home, project, join(home, '.config/opencode')]) mkdirSync(directory, { recursive: true })
assert.equal(spawnSync('git', ['-C', project, 'init', '-q']).status, 0)
console.log(`Native browser plugin fixture: ${run}`)
const env = {
  HOME: home, SHELL: '/bin/zsh', PATH: '/usr/bin:/bin:/usr/sbin:/sbin', TMPDIR: process.env.TMPDIR,
  XDG_CONFIG_HOME: join(home, '.config'), XDG_DATA_HOME: join(home, '.local/share'),
  XDG_STATE_HOME: join(home, '.local/state'), XDG_CACHE_HOME: join(home, '.cache'),
  OPENCODE_CONFIG_CONTENT: JSON.stringify({ plugins: [join(root, 'profiles/opencode/browser')] }),
  OPENCODE_DISABLE_MODELS_FETCH: '1', OPENCODE_DISABLE_DEFAULT_PLUGINS: '1',
  OPENCODE_PASSWORD: 'fixture-browser-password',
}
const child = spawn(process.env.AG_TEST_OPENCODE ?? '/Applications/OpenCode.app/Contents/Resources/opencode-cli',
  ['serve', '--hostname', '127.0.0.1', '--port', '0'], { cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
child.stdout.on('data', chunk => { output += chunk })
child.stderr.on('data', chunk => { output += chunk })
const closed = new Promise(resolve => child.once('close', resolve))
try {
  let address
  for (let i = 0; i < 200; i++) {
    address = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
    if (address || child.exitCode !== null) break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(address, output)
  const headers = { Authorization: `Basic ${Buffer.from('opencode:fixture-browser-password').toString('base64')}` }
  let body, plugin
  for (let i = 0; i < 100; i++) {
    const response = await fetch(`${address}/api/plugin?location%5Bdirectory%5D=${encodeURIComponent(project)}`, { headers })
    assert.equal(response.status, 200, await response.clone().text())
    body = await response.json()
    plugin = (body.data ?? body).find(plugin => plugin.id === 'agent-guard-browser')
    if (plugin?.state?.status === 'active' || plugin?.state?.status === 'failed') break
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  writeFileSync(join(run, 'plugins.json'), JSON.stringify(body, null, 2))
  assert.ok(plugin, JSON.stringify(body))
  assert.equal(plugin.state.status, 'active', JSON.stringify(plugin))
  assert.equal(plugin.features.gui, true)
  const gui = await fetch(`${address}/api/plugin/gui?id=agent-guard-browser&location%5Bdirectory%5D=${encodeURIComponent(project)}`, { headers })
  assert.equal(gui.status, 200, await gui.clone().text())
  assert.ok((await gui.text()).includes('Connect ChatGPT through Agent Guard'))
  console.log('ok native OpenCode: inline config loads local package and serves GUI commands')
} finally {
  child.kill('SIGTERM')
  const stopped = await Promise.race([closed.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 5000))])
  if (!stopped) { child.kill('SIGKILL'); await closed }
  writeFileSync(join(run, 'server.log'), output)
}
