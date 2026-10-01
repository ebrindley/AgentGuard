import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const engines = readdirSync(join(root, 'test/engines')).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4));
const { values } = parseArgs({ options: { engine: { type: 'string', default: 'zsh' } } });
if (!engines.includes(values.engine)) {
  console.error(`unknown engine: ${values.engine} (known: ${engines.join(', ')})`);
  process.exit(1);
}
const adapter = await import(pathToFileURL(join(root, 'test/engines', `${values.engine}.mjs`)).href);
console.log(`engine: ${adapter.name}`);

const run = mkdtempSync(join(root, 'test/.run-golden-'));
const home = join(run, 'home with spaces');
const source = join(run, 'source');
const engine = join(home, 'Library/Application Support/AgentGuard');
const reference = join(root, 'test/fixtures/opencode-guard-1.0.3');
function exec([command, ...args], options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
try {
  for (const dir of ['Projects/app/secret', 'Projects/archive/live', 'Projects/dotfiles', 'Agent Guard', 'OpenCode Guard'])
    mkdirSync(join(home, dir), { recursive: true });
  mkdirSync(source);
  adapter.stage(root, source, home);
  adapter.layout(source, engine);
  writeFileSync(join(home, 'Projects/dotfiles/config'), '{}');
  symlinkSync(join(home, 'Projects/dotfiles/config'), join(home, 'Projects/app/opencode.json'));
  const identity = adapter.identity(root, { HOME: home, USER: 'not-the-login-user' });
  assert.deepEqual([identity.home, identity.engine], [userInfo().homedir, join(userInfo().homedir, 'Library/Application Support/AgentGuard')]);
  console.log('ok   account lookup ignores spoofed HOME and USER before profile loading');
  for (const [name, list] of [
    ['empty', 'ALLOW -\nREAD ONLY -\nDENY -\n'],
    ['nested', `ALLOW -\n${home}/Projects\n${home}/Projects/archive/live\n/\nREAD ONLY -\n${home}/Projects/archive\nDENY -\n${home}/Projects/app/secret\n${home}/missing\n`],
  ]) {
    for (const folder of ['Agent Guard', 'OpenCode Guard']) writeFileSync(join(home, folder, 'Guard List.txt'), list);
    const options = { cwd: join(home, 'Projects/app'), env: { ...process.env, HOME: home, OPENCODE_SANDBOXED: '', AGENT_GUARD_SANDBOXED: '' } };
    // v1.0.3 takes its home from $HOME, so the reference runs unmodified.
    const old = exec(['/bin/zsh', join(reference, 'launch'), 'profile'], options);
    const current = exec([...adapter.launcher(engine), 'profile'], options);
    assert.equal(current, old.replaceAll('OpenCodeGuard', 'AgentGuard').replaceAll('OpenCode Guard', 'Agent Guard'), name);
    console.log(`ok   ${name} profile matches v1.0.3 exactly apart from renamed paths`);
  }
} finally {
  rmSync(run, { recursive: true, force: true });
}
