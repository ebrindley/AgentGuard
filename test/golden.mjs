import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fixtureHome } from './fixture-home.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = mkdtempSync(join(root, 'test/.run-golden-'));
const home = join(run, 'home with spaces');
const engine = join(home, 'Library/Application Support/AgentGuard');
const reference = join(root, 'test/fixtures/opencode-guard-1.0.3');
function zsh(args, options = {}) {
  const result = spawnSync('/bin/zsh', args, { encoding: 'utf8', ...options });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
try {
  for (const dir of ['Projects/app/secret', 'Projects/archive/live', 'Projects/dotfiles', 'Agent Guard', 'OpenCode Guard'])
    mkdirSync(join(home, dir), { recursive: true });
  mkdirSync(engine, { recursive: true });
  cpSync(join(root, 'engine/launch'), join(engine, 'launch'));
  cpSync(join(root, 'engine/profile.sb'), join(engine, 'profile.sb'));
  cpSync(join(root, 'profiles'), join(engine, 'profiles'), { recursive: true });
  fixtureHome(join(engine, 'launch'), home);
  writeFileSync(join(home, 'Projects/dotfiles/config'), '{}');
  symlinkSync(join(home, 'Projects/dotfiles/config'), join(home, 'Projects/app/opencode.json'));
  const source = readFileSync(join(root, 'engine/launch'), 'utf8');
  const prelude = source.slice(0, source.indexOf('source "$profile_dir/harness.zsh"'));
  const identity = zsh(['-fc', prelude + '\nprint -rl -- "$home" "$engine"'], {
    env: { ...process.env, HOME: home, USER: 'not-the-login-user' },
  }).trim().split('\n');
  assert.deepEqual(identity, [userInfo().homedir, join(userInfo().homedir, 'Library/Application Support/AgentGuard')]);
  console.log('ok   account lookup ignores spoofed HOME and USER before profile loading');
  for (const [name, list] of [
    ['empty', 'ALLOW -\nREAD ONLY -\nDENY -\n'],
    ['nested', `ALLOW -\n${home}/Projects\n${home}/Projects/archive/live\n/\nREAD ONLY -\n${home}/Projects/archive\nDENY -\n${home}/Projects/app/secret\n${home}/missing\n`],
  ]) {
    for (const folder of ['Agent Guard', 'OpenCode Guard']) writeFileSync(join(home, folder, 'Guard List.txt'), list);
    const options = { cwd: join(home, 'Projects/app'), env: { ...process.env, HOME: home, OPENCODE_SANDBOXED: '' } };
    const old = zsh([join(reference, 'launch'), 'profile'], options);
    const current = zsh([join(engine, 'launch'), 'profile'], options);
    assert.equal(current, old.replaceAll('OpenCodeGuard', 'AgentGuard').replaceAll('OpenCode Guard', 'Agent Guard'), name);
    console.log(`ok   ${name} profile matches v1.0.3 exactly apart from renamed paths`);
  }
} finally {
  rmSync(run, { recursive: true, force: true });
}
