import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

// Match proper-lockfile's directory lock without loading a provider or reading
// an account's settings. An optional native module qualifies Pi's reader too.
export function checkSettingsLocks(profile, nativeModule) {
  const run = realpathSync(mkdtempSync('/private/var/tmp/agentguard-settings-lock-'));
  const home = join(run, 'home'), project = join(home, 'project with spaces');
  const state = join(home, '.pi/agent');
  for (const path of [state, join(project, '.pi'), join(project, 'nested/.pi'), join(home, 'outside/.pi')])
    mkdirSync(path, { recursive: true });
  writeFileSync(join(state, 'settings.json'), '{"defaultProvider":"global-canary"}');
  for (const folder of [project, join(project, 'nested')])
    writeFileSync(join(folder, '.pi/settings.json'), '{"defaultProvider":"project-canary"}');
  const params = {
    HOME: home, PROJECT: project, TMPDIR: '/private/tmp', ACTIVE_HOOKS: join(project, '.git/hooks'),
    PI_AGENT_STATE: state, OMP_AGENT_STATE: join(home, '.unused/omp-agent'),
    OMP_STATE_ROOT: join(home, '.unused/omp-state'), OMP_BASE_ROOT: join(home, '.unused/omp-base'),
  };
  for (const [, name] of readFileSync(profile, 'utf8').matchAll(/\(param "(AG_[A-Z0-9_]+)"\)/g))
    params[name] = join(home, '.unused');
  const defines = Object.entries(params).flatMap(([key, value]) => ['-D', `${key}=${value}`]);
  const env = { HOME: home, PATH: '/usr/bin:/bin', TMPDIR: '/tmp' };
  const sb = (...args) => spawnSync('/usr/bin/sandbox-exec', [...defines, '-f', profile, ...args], { env, encoding: 'utf8' });
  const denied = (result, name) => {
    assert.notEqual(result.status, 0, `${name}: unexpectedly allowed`);
    assert.match(result.stderr, /Operation not permitted|EPERM/, `${name}: ${result.stderr}`);
  };
  const allowed = (result, name) => assert.equal(result.status, 0, `${name}: ${result.stderr}`);
  const observations = [];
  for (const folder of [project, join(project, 'nested')]) {
    const settings = join(folder, '.pi/settings.json'), lock = `${settings}.lock`;
    allowed(sb('/bin/sh', '-c', 'mkdir "$1" && touch "$1" && rmdir "$1"', 'lock', lock), 'settings lock lifecycle');
    observations.push({ folder, lockLifecycle: 'allowed' });
    denied(sb('/bin/sh', '-c', 'printf tamper >> "$1"', 'write', settings), 'settings modify');
    denied(sb('/bin/rm', settings), 'settings remove');
    denied(sb('/bin/mv', settings, join(folder, 'moved-settings.json')), 'settings rename');
    denied(sb('/bin/sh', '-c', 'printf tamper > "$1"', 'file', lock), 'lock regular file');
    allowed(sb('/bin/mkdir', lock), 'lock directory create');
    denied(sb('/bin/sh', '-c', 'printf tamper > "$1/child"', 'child', lock), 'lock descendant');
    denied(sb('/bin/ln', '-s', settings, join(lock, 'settings-link')), 'lock descendant link');
    allowed(sb('/bin/rmdir', lock), 'lock directory remove');
    denied(sb('/bin/ln', '-s', settings, lock), 'lock symlink');
    denied(sb('/bin/ln', '-s', folder, lock), 'lock directory symlink');
    assert.equal(readFileSync(settings, 'utf8'), '{"defaultProvider":"project-canary"}');
  }
  denied(sb('/bin/mkdir', join(home, 'outside/.pi/settings.json.lock')), 'outside-project lock');
  denied(sb('/bin/mkdir', join(project, '.pi/extensions')), 'extensions create');
  denied(sb('/bin/mkdir', join(project, '.pi/other.json.lock')), 'other config lock');
  if (nativeModule) {
    const program = `import {SettingsManager} from ${JSON.stringify(pathToFileURL(resolve(nativeModule)).href)};
const s=SettingsManager.create(${JSON.stringify(project)},${JSON.stringify(state)});
console.log(JSON.stringify({provider:s.getDefaultProvider(),errors:s.drainErrors()}));`;
    const result = sb(process.execPath, '--input-type=module', '-e', program);
    allowed(result, 'native Pi settings reader');
    const loaded = JSON.parse(result.stdout);
    assert.deepEqual(loaded, { provider: 'project-canary', errors: [] });
    observations.push({ nativeSettings: loaded });
  }
  console.log(`settings-lock fixture: ${run}`);
  console.log(JSON.stringify(observations));
  return observations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  checkSettingsLocks(process.argv[2] ?? join(root, 'profiles/pi/sandbox/pi-sandbox.sb'), process.argv[3]);
}
