import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
// Recorded, reviewed changes to the generated profile since v1.0.3, applied in step
// order to the renamed v1.0.3 output: each inserts lines right after an anchor line,
// or after each of its anchors in order. step-7c.json and then step-7f.json apply only
// with Pi installed.
const differences = readdirSync(join(root, 'test/fixtures/differences'))
  .filter((f) => /^step-\d+\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(join(root, 'test/fixtures/differences', f), 'utf8')))
  .sort((a, b) => a.step - b.step);
const piInstalled = ['step-7c.json', 'step-7f.json']
  .map((f) => JSON.parse(readFileSync(join(root, 'test/fixtures/differences', f), 'utf8')));
function applyDifferences(text, records) {
  for (const { step, after, insert, inserts = [{ after, insert }] } of records) {
    for (const d of inserts) {
      assert.equal(text.split(d.after).length, 2, `step ${step}: the text to insert after must occur exactly once`);
      text = text.replace(d.after, () => d.after + d.insert);
    }
  }
  return text;
}
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
  // An empty XDG_CACHE_HOME counts as unset, so the cache rules use the default root.
  const options = { cwd: join(home, 'Projects/app'), env: { ...process.env, HOME: home, OPENCODE_SANDBOXED: '', AGENT_GUARD_SANDBOXED: '', XDG_CACHE_HOME: '' } };
  function compare(name, list, records) {
    for (const folder of ['Agent Guard', 'OpenCode Guard']) writeFileSync(join(home, folder, 'Guard List.txt'), list);
    // v1.0.3 takes its home from $HOME, so the reference runs unmodified.
    const old = exec(['/bin/zsh', join(reference, 'launch'), 'profile'], options);
    const current = exec([...adapter.launcher(engine), 'profile'], options);
    assert.equal(current, applyDifferences(old.replaceAll('OpenCodeGuard', 'AgentGuard').replaceAll('OpenCode Guard', 'Agent Guard'), records), name);
    console.log(`ok   ${name} profile matches v1.0.3 exactly apart from renamed paths and recorded differences (step ${records.map((d) => d.step).join(', ')})`);
  }
  compare('empty', 'ALLOW -\nREAD ONLY -\nDENY -\n', differences);
  compare('nested', `ALLOW -\n${home}/Projects\n${home}/Projects/archive/live\n/\nREAD ONLY -\n${home}/Projects/archive\nDENY -\n${home}/Projects/app/secret\n${home}/missing\n`, differences);
  // Pi installed, with a recorded wrapper, under an ALLOW entry for ~/.local/bin.
  mkdirSync(join(home, '.local/bin'), { recursive: true });
  mkdirSync(join(engine, 'state'), { recursive: true });
  writeFileSync(join(engine, 'state/stamp.json'), JSON.stringify({ harnesses: ['opencode', 'pi'] }));
  writeFileSync(join(engine, 'state/wrappers.json'), JSON.stringify({ wrappers: { 'pi-work': { sha256: '0'.repeat(64) } }, historical: ['pi-old'] }));
  compare('pi-installed', `ALLOW -\n${home}/.local/bin\nREAD ONLY -\nDENY -\n`, [...differences, ...piInstalled]);
} finally {
  rmSync(run, { recursive: true, force: true });
}
