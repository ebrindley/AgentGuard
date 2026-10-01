// Test adapter for the zsh engine. Import it from Node, or run it as
// `node zsh.mjs name|stage|launcher|identity ...` from zsh.
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fixtureAccount, fixtureHome } from '../fixture-home.mjs';

export const name = 'zsh';

// Copies engine/, profiles/, install.sh, LICENSE and VERSION (when present) from
// source into dest, then points the copied account lookups at home. The source
// tree is not touched.
export function stage(source, dest, home) {
  const files = ['engine', 'profiles', 'install.sh', 'LICENSE', 'VERSION'].filter((f) => f !== 'VERSION' || existsSync(join(source, f)));
  const copy = spawnSync('/bin/cp', ['-R', ...files.map((f) => join(source, f)), dest + '/'], { encoding: 'utf8' });
  assert.equal(copy.status, 0, copy.stderr);
  fixtureHome(join(dest, 'engine/launch'), home);
  fixtureAccount(join(dest, 'engine/account.zsh'), home);
}

// Lays out a staged tree as the release folder releases/<rid> in engine, with
// current pointing to it, as the installer does, without the rest of the install.
export function layout(tree, engine, rid = '0.0.0-20260101T000000Z') {
  const release = join(engine, 'releases', rid);
  mkdirSync(join(release, 'profiles'), { recursive: true });
  for (const f of ['launch', 'profile.sb', 'account.zsh']) cpSync(join(tree, 'engine', f), join(release, f));
  cpSync(join(tree, 'profiles/opencode'), join(release, 'profiles/opencode'), { recursive: true });
  writeFileSync(join(release, 'RELEASE'), `${rid}\n`);
  writeFileSync(join(release, 'VERSION'), `${rid.split('-')[0]}\n`);
  symlinkSync(join('releases', rid), join(engine, 'current'));
  return release;
}

// The argv that runs the launcher of the current release in the engine folder.
export function launcher(engine) {
  return ['/bin/zsh', join(engine, 'current/launch')];
}

// Runs the unmodified account lookup from source/engine/launch, and the one in
// source/engine/account.zsh, with env added to the environment. The launcher
// text stops before the release check and before any profile is loaded.
export function identity(source, env) {
  const run = (script) => {
    const result = spawnSync('/bin/zsh', ['-fc', script], { encoding: 'utf8', env: { ...process.env, ...env } });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim().split('\n');
  };
  const text = readFileSync(join(source, 'engine/launch'), 'utf8');
  const end = text.indexOf('release=${0:A:h}\n');
  assert.notEqual(end, -1, 'release resolution line not found in engine/launch');
  const [home, engine] = run(text.slice(0, end) + '\nprint -rl -- "$home" "$engine"');
  const quoted = "'" + join(source, 'engine/account.zsh').replaceAll("'", "'\\''") + "'";
  const [account] = run(`source ${quoted} && account_home && print -r -- "\${REPLY:A}"`);
  assert.equal(account, home, 'engine/account.zsh and engine/launch disagree on the account home');
  return { home, engine };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'name') console.log(name);
  else if (command === 'stage' && args.length === 3) stage(...args);
  else if (command === 'launcher' && args.length === 1) console.log(launcher(args[0]).join('\n'));
  else if (command === 'identity' && args.length === 3) {
    const found = identity(args[0], { HOME: args[1], USER: args[2] });
    console.log(`${found.home}\n${found.engine}`);
  } else {
    console.error('usage: zsh.mjs name | stage SOURCE DEST HOME | launcher ENGINE | identity SOURCE HOME USER');
    process.exit(2);
  }
}
