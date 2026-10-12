import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const engines = readdirSync(join(root, 'test/engines')).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4));
const { values } = parseArgs({ options: { engine: { type: 'string', default: 'zsh' }, case: { type: 'string' } } });
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
const skills = JSON.parse(readFileSync(join(root, "test/fixtures/differences/skills.json"), "utf8"));
const configuration = JSON.parse(readFileSync(join(root, "test/fixtures/differences/configuration.json"), "utf8"));
function applyDifferences(text, records) {
  for (const { step, after, insert, inserts = [{ after, insert }] } of records) {
    for (const d of inserts) {
      const anchor = d.before ?? d.after;
      assert.equal(text.split(anchor).length, 2, `step ${step}: insertion anchor must occur exactly once`);
      text = text.replace(anchor, () => d.before ? d.insert + anchor : anchor + d.insert);
    }
    for (const d of records.find(r => r.step === step)?.replaces ?? []) {
      assert.equal(text.split(d.before).length, 2, `step ${step}: replacement must occur exactly once`);
      text = text.replace(d.before, () => d.after);
    }
  }
  return text;
}
function exec([command, ...args], options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
let passed = false;
try {
  for (const dir of ['Projects/app/secret', 'Projects/archive/live', 'Projects/dotfiles', 'Agent Guard', 'OpenCode Guard'])
    mkdirSync(join(home, dir), { recursive: true });
  mkdirSync(source);
  adapter.stage(root, source, home);
  adapter.layout(source, engine);
  const identity = adapter.identity(root, { HOME: home, USER: 'not-the-login-user' });
  assert.deepEqual([identity.home, identity.engine], [userInfo().homedir, join(userInfo().homedir, 'Library/Application Support/AgentGuard')]);
  console.log('ok   account lookup ignores spoofed HOME and USER before profile loading');
  // An empty XDG_CACHE_HOME counts as unset, so the cache rules use the default root.
  const options = { cwd: join(home, 'Projects/app'), env: { ...process.env, HOME: home, OPENCODE_SANDBOXED: '', AGENT_GUARD_SANDBOXED: '', XDG_CACHE_HOME: '' } };
  function compare(name, list, records) {
    if (values.case && values.case !== name) return;
    for (const folder of ['Agent Guard', 'OpenCode Guard']) writeFileSync(join(home, folder, 'Guard List.txt'), list);
    // v1.0.3 takes its home from $HOME, so the reference runs unmodified.
    const old = exec(['/bin/zsh', join(reference, 'launch'), 'profile'], options);
    const current = exec([...adapter.launcher(engine), 'profile'], options);
    const expected = applyDifferences(old.replaceAll('OpenCodeGuard', 'AgentGuard').replaceAll('OpenCode Guard', 'Agent Guard'), [...records, skills, configuration, ...(name === 'pi-installed' ? [configuration.pi] : [])]);
    if (current !== expected) {
      writeFileSync(join(run, `${name}.actual.sb`), current);
      writeFileSync(join(run, `${name}.expected.sb`), expected);
    }
    assert.equal(current, expected, name);
    console.log(`ok   ${name} profile matches v1.0.3 exactly apart from renamed paths and recorded differences (step ${records.map((d) => d.step).join(', ')})`);
  }
  compare('empty', 'ALLOW -\nREAD ONLY -\nDENY -\n', differences);
  compare('nested', `ALLOW -\n${home}/Projects\n${home}/Projects/archive/live\n/\nREAD ONLY -\n${home}/Projects/archive\nDENY -\n${home}/Projects/app/secret\n${home}/missing\n`, differences);
  // Pi installed, with a recorded wrapper, under an ALLOW entry for ~/.local/bin.
  mkdirSync(join(home, '.local/bin'), { recursive: true });
  mkdirSync(join(engine, 'state'), { recursive: true });
  writeFileSync(join(engine, 'state/stamp.json'), JSON.stringify({ harnesses: ['opencode', 'pi'] }));
  writeFileSync(join(engine, 'state/wrappers.json'), JSON.stringify({ wrappers: { 'pi-work': { sha256: '0'.repeat(64) } }, historical: ['pi-old'] }));
  compare('pi-installed', `ALLOW -\n${home}/.local/bin\nREAD ONLY -\nDENY -\n`, [...differences, ...piInstalled].sort((a, b) => parseFloat(a.step) - parseFloat(b.step)));
  if (!values.case || values.case === 'path-identity') {
    const real = join(home, 'real');
    for (const p of ['child', 'allowed', 'reference', 'private']) mkdirSync(join(real, p), { recursive: true });
    symlinkSync(join(real, 'child'), join(home, 'Projects/link'));
    const link = join(home, 'Projects/link');
    const list = join(home, 'Agent Guard/Guard List.txt');
    writeFileSync(list, `ALLOW\n${link}/../allowed\nREAD ONLY\n${link}/../reference\nDENY\n${link}/../private\n${link}/../missing/secret\n${link}/absent/../future\n`);
    const current = exec([...adapter.launcher(engine), 'profile'], options);
    const rules = JSON.parse(readFileSync(join(engine, 'state/rules.json'), 'utf8'));
    assert.deepEqual(rules.allow, [join(real, 'allowed')]);
    assert.deepEqual(rules.readonly, [join(real, 'reference')]);
    assert.deepEqual(rules.deny, [join(real, 'private'), join(real, 'missing/secret'), join(real, 'child/future')]);
    const temp = exec(['/usr/bin/getconf', 'DARWIN_USER_TEMP_DIR']).trim();
    const cache = exec(['/usr/bin/getconf', 'DARWIN_USER_CACHE_DIR']).trim();
    const sandbox = ['/usr/bin/sandbox-exec', '-D', `HOME=${home}`, '-D', `DARWIN_TEMP=${temp}`,
      '-D', `DARWIN_CACHE=${cache}`, '-D', 'GUI=0', '-p', current];
    const write = p => spawnSync(sandbox[0], [...sandbox.slice(1), '/bin/sh', '-c', 'printf x > "$1"', 'sh', p], { encoding: 'utf8' });
    assert.equal(write(join(real, 'allowed/probe')).status, 0, 'kernel-resolved ALLOW target');
    assert.notEqual(write(join(real, 'reference/probe')).status, 0, 'kernel-resolved READ ONLY target');
    mkdirSync(join(real, 'missing'), { recursive: true });
    mkdirSync(join(real, 'child/absent'));
    for (const p of [join(real, 'private/probe'), join(real, 'missing/secret'), join(real, 'child/future')]) {
      writeFileSync(p, 'fixture');
      const result = spawnSync(sandbox[0], [...sandbox.slice(1), '/bin/cat', p], { encoding: 'utf8' });
      assert.notEqual(result.status, 0, `DENY target readable: ${p}`);
      assert.match(result.stderr, /Operation not permitted/, p);
    }
    console.log('ok   Guard List symlink/.. paths and missing targets match Seatbelt access');
    for (const section of ['ALLOW', 'READ ONLY', 'DENY']) {
      writeFileSync(list, `ALLOW\n${home}/Projects\n${section}\n${home}/Projects/tab\tpath\n`);
      const [command, ...args] = adapter.launcher(engine);
      const result = spawnSync(command, [...args, 'profile'], { ...options, encoding: 'utf8' });
      assert.notEqual(result.status, 0, `${section} tab-bearing path accepted`);
      assert.match(result.stderr, /Guard List path contains a tab/);
      assert.equal(result.stdout, '', 'invalid list emitted a profile');
    }
    console.log('ok   tab-bearing Guard List entries refuse the launch in every section');
  }
  passed = true;
} finally {
  if (passed) rmSync(run, { recursive: true, force: true });
  else console.error(`golden fixture retained: ${run}`);
}
