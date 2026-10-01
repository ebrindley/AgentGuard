// Test adapter for the zsh engine. Import it from Node, or run it as
// `node zsh.mjs name|stage|launcher|identity ...` from zsh.
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fixtureHome } from '../fixture-home.mjs';

export const name = 'zsh';

// Copies engine/, profiles/ and install.sh from source into dest, then points
// the copied launcher's account lookup at home. The source tree is not touched.
export function stage(source, dest, home) {
  const copy = spawnSync('/bin/cp', ['-R', join(source, 'engine'), join(source, 'profiles'), join(source, 'install.sh'), dest + '/'], { encoding: 'utf8' });
  assert.equal(copy.status, 0, copy.stderr);
  fixtureHome(join(dest, 'engine/launch'), home);
}

// The argv that runs the launcher installed in the engine folder.
export function launcher(engine) {
  return ['/bin/zsh', join(engine, 'launch')];
}

// Runs the unmodified account lookup from source/engine/launch with env added
// to the environment, stopping before any profile is loaded.
export function identity(source, env) {
  const text = readFileSync(join(source, 'engine/launch'), 'utf8');
  const end = text.indexOf('source "$profile_dir/harness.zsh"');
  assert.notEqual(end, -1, 'profile loading line not found in engine/launch');
  const result = spawnSync('/bin/zsh', ['-fc', text.slice(0, end) + '\nprint -rl -- "$home" "$engine"'], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  assert.equal(result.status, 0, result.stderr);
  const [home, engine] = result.stdout.trim().split('\n');
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
