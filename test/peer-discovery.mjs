import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = mkdtempSync(join(tmpdir(), 'agentguard-peer-discovery-'));
try {
  const home = join(run, 'home'), release = join(run, 'release'), bin = join(run, 'bin');
  const profile = join(release, 'profiles/opencode'), peers = join(release, 'peers');
  for (const path of [home, bin, profile, peers]) mkdirSync(path, { recursive: true });
  const replace = (text, from, to) => {
    assert.equal(text.split(from).length, 2, from);
    return text.replace(from, to);
  };
  writeFileSync(join(release, 'peers.zsh'), replace(readFileSync(join(root, 'engine/peers.zsh'), 'utf8'),
    ' /opt/homebrew/bin /usr/local/bin)', ')'));
  let harness = readFileSync(join(root, 'profiles/opencode/harness.zsh'), 'utf8');
  harness = replace(harness, 'app_paths=(/Applications/OpenCode.app "$home/Applications/OpenCode.app")',
    'app_paths=("$home/Applications/OpenCode.app")');
  harness = replace(harness, 'app_bundle_id=ai.opencode.desktop', 'app_bundle_id=invalid.test');
  writeFileSync(join(profile, 'harness.zsh'), harness);
  copyFileSync(join(root, 'engine/peers/opencode'), join(peers, 'opencode'));
  const env = { HOME: home, PATH: `${bin}:/usr/bin:/bin`, AGENT_GUARD_PEER_PATH: '',
    AGENT_GUARD_SANDBOXED: '', PI_SANDBOX_SHIM_ACTIVE: '' };
  const invoke = () => spawnSync('/bin/zsh', [join(peers, 'opencode'), 'run', 'prompt with spaces'], { env, encoding: 'utf8' });
  assert.equal(invoke().status, 127, 'no native CLI or app must report not found');
  const app = join(home, 'Applications/OpenCode.app/Contents');
  mkdirSync(join(app, 'MacOS'), { recursive: true });
  mkdirSync(join(app, 'Resources'));
  const executable = (path, label) => writeFileSync(path, `#!/bin/zsh -f\nprint -rl -- ${label} "$@"\n`, { mode: 0o755 });
  executable(join(app, 'Resources/opencode-cli'), 'bundled');
  let result = invoke();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ['bundled', 'run', 'prompt with spaces']);
  executable(join(bin, 'opencode'), 'native');
  result = invoke();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ['native', 'run', 'prompt with spaces']);
  rmSync(join(bin, 'opencode'));
  symlinkSync(join(peers, 'opencode'), join(bin, 'opencode'));
  result = invoke();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ['bundled', 'run', 'prompt with spaces']);
  console.log('ok peer CLI discovery: app-only fallback, native priority, shim exclusion and missing executable');
} finally {
  rmSync(run, { recursive: true, force: true });
}
