import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { stage, layout } from './engines/zsh.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = mkdtempSync(join(root, 'test/.run-peers-'));
const home = join(run, 'home'), tree = join(run, 'source');
const engine = join(home, 'Library/Application Support/AgentGuard');
const project = join(home, 'Projects/app'), bin = join(home, '.local/bin');
for (const p of [home, tree, project, bin, join(home, 'Agent Guard'),
                 join(home, '.config/pi-sandbox-guard'), join(home, '.pi/agent/extensions/pi-sandbox-guard'),
                 join(home, '.codex'), join(home, '.claude'), join(home, '.cursor'), join(home, '.grok')])
  mkdirSync(p, { recursive: true });
stage(root, tree, home);
const release = layout(tree, engine);
cpSync(join(tree, 'engine/vendor'), join(release, 'vendor'), { recursive: true });
writeFileSync(join(home, 'Agent Guard/Guard List.txt'), `ALLOW\n${project}\nREAD ONLY\nDENY\n`);
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
const peers = ['codex', 'claude', 'cursor-agent', 'grok', 'opencode'];
for (const name of peers) {
  const prefix = name === 'opencode' ? 'if [[ ${1:-} == --version ]]; then print 1.19.3; exit; fi\nif [[ ${1:-} == /* ]]; then exec "$@"; fi\n' : '';
  writeFileSync(join(bin, name), '#!/bin/zsh -f\n' + prefix + 'print -l -- "$@"\n', { mode: 0o755 });
}
const standIn = join(run, 'runtime');
writeFileSync(standIn, '#!/bin/sh\nif [ "$1" = --extension ]; then shift 2; fi\nexec "$@"\n', { mode: 0o755 });
for (const name of ['pi', 'omp']) cpSync(join(tree, 'profiles/pi/launchers/pi'), join(bin, name));
cpSync(join(tree, 'profiles/pi/sandbox/pi-sandbox.sb'), join(bin, 'pi-sandbox.sb'));
cpSync(join(tree, 'profiles/pi/sandbox/pi-sandbox-preamble.zsh'), join(bin, 'pi-sandbox-preamble.zsh'));
writeFileSync(join(home, '.config/pi-sandbox-guard/executables.conf'), `pi=${standIn}\nomp=${standIn}\n`);
writeFileSync(join(home, '.pi/agent/extensions/pi-sandbox-guard/index.ts'), 'export default function () {}\n');
const env = { ...process.env, HOME: home, PATH: bin + ':/usr/bin:/bin:/usr/sbin:/sbin', PI_PROJECT: project,
              AGENT_GUARD_SANDBOXED: '', OPENCODE_SANDBOXED: '', AGENT_GUARD_PEER_PATH: '',
              XDG_CACHE_HOME: '', XDG_CONFIG_HOME: join(home, '.config') };
for (const key of ['CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'GROK_HOME', 'GROK_SANDBOX', 'AGENT_GUARD_RELEASE', 'AGENT_GUARD_CONTEXT']) delete env[key];
writeFileSync(join(home, '.zshenv'), 'path=("$HOME/.local/bin" $path)\n');
function launch(parent, command) {
  const args = parent === 'opencode' ? [join(release, 'launch'), 'cli', '/bin/zsh', '-f', '-c', command]
    : [join(bin, parent), '/bin/zsh', '-f', '-c', command];
  return spawnSync('/bin/zsh', args, { cwd: project, env, encoding: 'utf8', timeout: 15000 });
}
for (const parent of ['opencode', 'pi', 'omp']) {
  for (const name of peers) {
    const r = launch(parent, `${name} --model fixture 'prompt with spaces'`);
    assert.equal(r.status, 0, `${parent} -> ${name}: ${r.stderr}\nfixture: ${run}`);
    const argv = r.stdout.trim().split('\n');
    assert.deepEqual(argv.slice(-3), ['--model', 'fixture', 'prompt with spaces']);
    assert.ok(!argv.includes('--force') && !argv.includes('--dangerously-bypass-approvals-and-sandbox'));
    if (name === 'codex') assert.deepEqual(argv.slice(0, 3), ['--no-daemon', '--sandbox', 'danger-full-access']);
    if (name === 'claude') assert.deepEqual(argv.slice(0, 2), ['--settings', '{"sandbox":{"enabled":false}}']);
    console.log(`ok ${parent} -> ${name}: discovery, argv and approvals`);
  }
  for (const command of ['codex exec --sandbox read-only', 'codex exec -s workspace-write',
                         'codex exec -c sandbox_mode=read-only', 'codex exec --config=sandbox_mode=read-only',
                         'codex exec -csandbox_mode=read-only', 'codex exec -c "sandbox_mode = read-only"',
                         'cursor-agent --sandbox enabled', 'grok --sandbox strict']) {
    const r = launch(parent, command);
    assert.equal(r.status, 2, `${parent}: ${command}\n${r.stderr}`);
    assert.match(r.stderr, /cannot apply/);
  }
  const explicit = launch(parent, 'codex --no-daemon --sandbox danger-full-access exec');
  assert.equal(explicit.status, 0, explicit.stderr);
  assert.equal(explicit.stdout.split('\n').filter(x => x === '--no-daemon').length, 1);
  assert.equal(explicit.stdout.split('\n').filter(x => x === '--sandbox').length, 1);
  const settings = launch(parent, `claude --settings '${JSON.stringify({ env: { PEER_FIXTURE: 'kept' } })}' --model fixture`);
  assert.equal(settings.status, 0, settings.stderr);
  const merged = JSON.parse(settings.stdout.split('\n')[1]);
  assert.equal(merged.env.PEER_FIXTURE, 'kept');
  assert.equal(merged.sandbox.enabled, false);
  assert.equal(launch(parent, `claude --settings '${JSON.stringify({ sandbox: { enabled: true } })}'`).status, 2);
  const literal = launch(parent, 'claude -- --settings');
  assert.equal(literal.status, 0, literal.stderr);
  assert.deepEqual(literal.stdout.trim().split('\n').slice(-2), ['--', '--settings']);
  for (const command of ['codex --remote exec', 'opencode run --attach=http://localhost:4096', 'opencode attach http://localhost:4096', 'opencode run --server=http://localhost:4096',
                         'opencode --print-logs attach http://localhost:4096', 'opencode --log-level ERROR attach http://localhost:4096',
                         'opencode --print-logs --pure attach http://localhost:4096']) {
    const r = launch(parent, command);
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /must execute locally/);
  }
  for (const relative of ['.codex/installation_id', '.codex/state_5.sqlite', '.codex/logs_2.sqlite-wal', '.claude/debug/test', '.cursor/chats/test', '.grok/sessions/test', '.local/share/opencode/test']) {
    const path = join(home, relative);
    mkdirSync(dirname(path), { recursive: true });
    const r = launch(parent, `/usr/bin/touch ${quote(path)}`);
    assert.equal(r.status, 0, `${parent}: runtime ${relative}\n${r.stderr}`);
  }
  for (const relative of ['.codex/shell_snapshots/test', '.codex/memories_1.sqlite', '.codex/archived_sessions/state_5.sqlite', '.codex/backup/.codex/state_5.sqlite', '.claude/session-env/test', '.claude/shell-snapshots/test']) {
    mkdirSync(dirname(join(home, relative)), { recursive: true });
    assert.notEqual(launch(parent, `/usr/bin/touch ${quote(join(home, relative))}`).status, 0);
  }
  for (const path of [join(release, 'peers/codex'), join(home, '.codex/config.toml'), join(home, 'outside')]) {
    const r = launch(parent, `/usr/bin/touch ${quote(path)}`);
    assert.notEqual(r.status, 0, `${parent}: protected write ${path}`);
  }
  assert.equal(launch(parent, `/usr/bin/touch ${quote(join(project, 'edited'))}`).status, 0);
  const shell = launch(parent, `${quote(process.execPath)} ${quote(join(root, 'test/peer-shell.mjs'))} ${quote(join(release, 'profiles/opencode/plugin.js'))}`);
  assert.equal(shell.status, 0, shell.stdout + shell.stderr);
  process.stdout.write(shell.stdout);
  console.log(`ok ${parent}: explicit restrictions, runtime writes and containment`);
}
const opencodeFile = join(bin, 'opencode');
const v1Stub = readFileSync(opencodeFile, 'utf8');
writeFileSync(opencodeFile, v1Stub.replace('print 1.19.3', 'print 2.0.32').replace('if [[ ${1:-} == /* ]]', '[[ ${1:-} == --standalone ]] && shift\nif [[ ${1:-} == /* ]]'));
for (const parent of ['opencode', 'pi', 'omp']) {
  const result = launch(parent, 'opencode run --model fixture hello');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ['run', '--standalone', '--model', 'fixture', 'hello']);
  const attach = launch(parent, 'opencode --print-logs attach http://localhost:4096');
  assert.equal(attach.status, 2, attach.stderr);
  assert.match(attach.stderr, /must execute locally/);
}
writeFileSync(opencodeFile, v1Stub);
console.log('ok V2 peer commands use private servers under all parent policies');
mkdirSync(join(home, '.opencode/bin'), { recursive: true });
renameSync(join(bin, 'opencode'), join(home, '.opencode/bin/opencode'));
const fallback = launch('pi', 'opencode --version');
assert.equal(fallback.status, 0, fallback.stderr);
assert.equal(fallback.stdout, '1.19.3\n');
console.log('ok OpenCode discovery outside PATH');
const outside = spawnSync(join(release, 'peers/codex'), ['--model', 'fixture'], { env, encoding: 'utf8' });
assert.equal(outside.status, 0, outside.stderr);
assert.equal(outside.stdout, '--model\nfixture\n');
console.log('ok outside-guard argv unchanged');
console.log(`Reports: ${run}`);
