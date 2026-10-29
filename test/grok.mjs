// Grok on the zsh engine (docs/DESIGN.md section 3, Grok): launches through the
// real launcher under Seatbelt in a disposable home, with a stand-in grok that
// reports its arguments or runs a command inside the sandbox it was started in.
// Needs macOS, Node and an unguarded caller; the run folder is under test/.
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { layout, stage } from './engines/zsh.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = mkdtempSync(join(root, 'test/.run-grok-'));
const home = join(run, 'home'), tree = join(run, 'source');
const engine = join(home, 'Library/Application Support/AgentGuard');
const project = join(home, 'Projects/app'), grok = join(home, '.grok');
const mk = (...p) => p.forEach((d) => mkdirSync(d, { recursive: true }));
const put = (file, text = '', mode) => { mk(dirname(file)); writeFileSync(file, text, mode ? { mode } : undefined); };
mk(home, tree, project, join(home, 'Agent Guard'), join(engine, 'state'));
stage(root, tree, home);
const release = layout(tree, engine);
symlinkSync('current/bin', join(engine, 'bin'));
writeFileSync(join(home, 'Agent Guard/Guard List.txt'), `ALLOW\n${project}\nREAD ONLY\nDENY\n`);

// The stand-in: with AG_PROBE it runs that command in the sandbox, else it reports.
const standIn = '#!/bin/zsh -f\n[[ -n ${AG_PROBE:-} ]] && exec /bin/zsh -f -c "$AG_PROBE"\n' +
  'print -r -- "argv:${(j:|:)@}"\n' +
  'print -r -- "env:sandbox=${GROK_SANDBOX-unset} updater=${GROK_DISABLE_AUTOUPDATER-unset} ssh=${SSH_AUTH_SOCK-unset} npmrc=${NPM_CONFIG_USERCONFIG-unset} outer=${AGENT_GUARD_OUTER_SANDBOX-unset}"\n';
// ~/.grok/bin/grok -> ../downloads/grok-1.0.0, as Grok installs itself.
put(join(grok, 'downloads/grok-1.0.0'), standIn, 0o755);
mk(join(grok, 'bin'));
symlinkSync('../downloads/grok-1.0.0', join(grok, 'bin/grok'));
put(join(engine, 'state/grok-executable'), `${join(grok, 'bin/grok')}\n`);
mk(join(home, '.local/bin'));
symlinkSync(join(engine, 'bin/grok'), join(home, '.local/bin/grok'));
const hookTarget = join(project, 'hooks/extra.json');
put(hookTarget, '{}');
put(join(grok, 'hooks-paths'), `${hookTarget}\nrelative/ignored.json\n`);
for (const f of ['config.toml', 'sandbox.toml', 'requirements.toml', 'managed_config.toml', 'trusted_folders.toml', 'AGENTS.md', 'auth.json'])
  put(join(grok, f), '');
for (const d of ['hooks', 'vendor', 'bundled', 'bundles', 'skills', 'agents', 'workflows', 'plugins', 'installed-plugins',
                 'marketplace-cache', 'memory', 'memory-v2', 'sessions', 'logs', 'projects'])
  mk(join(grok, d));
for (const f of ['.ssh/id_test', '.aws/credentials', '.netrc', '.npmrc', '.git-credentials', '.config/git/credentials', '.gnupg/key',
                 '.secrets/token', '.docker/config.json', '.kube/config', '.config/gh/config.yml'])
  put(join(home, f), 'x\n');
mk(join(home, '.local/state/gh'), join(home, '.cache/gh'));
for (const f of ['.env', '.env.local', '.env.example', '.env.sample', '.env.template']) put(join(project, f), 'KEY=value\n');

const env = { HOME: home, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', SSH_AUTH_SOCK: '/tmp/agent.sock', LANG: 'C' };
const shim = join(release, 'bin/grok');
const exec = (file, args, extra = {}, cwd = project) =>
  spawnSync(file, args, { cwd, env: { ...env, ...extra }, encoding: 'utf8', timeout: 20000 });
const launch = (args, extra, cwd) => exec(shim, args, extra, cwd);
const probe = (command, extra = {}) => launch([], { AG_PROBE: command, ...extra });
const q = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
const ok = (message) => console.log(`ok   ${message}`);

// Plain and scripted launches reach the guard and run Grok with the guard's arguments.
const plain = launch(['-p', 'hello world']);
assert.equal(plain.status, 0, `${plain.stderr} ${plain.signal} ${plain.error}`);
assert.match(plain.stdout, /^argv:--sandbox\|off\|-p\|hello world$/m);
assert.match(plain.stdout, /env:sandbox=off updater=1 ssh=unset npmrc=\/dev\/null outer=unset$/m);
ok('plain launch runs grok --sandbox off with the updater off and credentials variables removed');
const viaLink = exec(join(home, '.local/bin/grok'), ['--version']);
assert.equal(viaLink.status, 0, viaLink.stderr);
assert.match(viaLink.stdout, /^argv:--sandbox\|off\|--version$/m);
ok('the link in ~/.local/bin reaches the same launcher');
const agent = launch(['agent', 'stdio']);
assert.match(agent.stdout, /^argv:--sandbox\|off\|agent\|--no-leader\|stdio$/m);
ok('grok agent runs locally');
const dup = launch(['--sandbox', 'off', '-p', 'x', '--', '--sandbox', 'strict']);
assert.match(dup.stdout, /^argv:--sandbox\|off\|-p\|x\|--\|--sandbox\|strict$/m);
ok('an explicit --sandbox off is kept once, and arguments after -- are untouched');
assert.equal(probe('print -r -- "$AGENT_GUARD_SANDBOXED"').stdout, '1\n');
ok('scripted launch is marked as guarded');

// Refusals.
for (const [name, args, extra, text] of [
  ['--sandbox workspace', ['--sandbox', 'workspace'], {}, /cannot apply the sandbox profile 'workspace'/],
  ['--sandbox=strict', ['--sandbox=strict'], {}, /cannot apply the sandbox profile 'strict'/],
  ['--sandbox without a value', ['--sandbox'], {}, /requires a value/],
  ['--leader', ['--leader'], {}, /shared leader/],
  ['GROK_SANDBOX', ['-p', 'x'], { GROK_SANDBOX: 'workspace' }, /unset GROK_SANDBOX/],
  ['relocated GROK_HOME', ['-p', 'x'], { GROK_HOME: join(run, 'elsewhere') }, /GROK_HOME/],
  ['update', ['update'], {}, /run it outside, as .*\.grok\/bin\/grok update/],
  ['login', ['login'], {}, /outside/],
  ['workspace start', ['workspace', 'start'], {}, /outlives the session/],
]) {
  const r = launch(args, extra);
  assert.equal(r.status, 1, `${name}: ${r.stdout}${r.stderr}`);
  assert.match(r.stderr, text, name);
  assert.doesNotMatch(r.stdout, /argv:/, `${name} must not start grok`);
}
ok('explicit sandbox profiles, --leader, GROK_SANDBOX, a relocated GROK_HOME, update, login and workspace start are refused');
put(join(grok, 'config.toml'), '[cli]\nuse_leader = true\n');
const leader = launch(['-p', 'x']);
assert.equal(leader.status, 1);
assert.match(leader.stderr, /use_leader is true/);
put(join(grok, 'config.toml'), '');
ok('use_leader = true in config.toml is refused');

// A resumed session keeps the profile it was saved with.
const session = (cwd, id, profile) => put(join(grok, 'sessions', encodeURIComponent(cwd), id, 'summary.json'), JSON.stringify({ sandbox_profile: profile }));
const nativeId = '0194a000-0000-7000-8000-000000000001', offId = '0194a000-0000-7000-8000-000000000002';
session(project, nativeId, 'workspace');
session(join(home, 'elsewhere'), offId, 'off');
const resumed = launch(['--resume', nativeId]);
assert.equal(resumed.status, 1);
assert.match(resumed.stderr, /saved with the sandbox profile 'workspace'/);
assert.equal(launch(['-r', nativeId, '-p', 'x']).status, 1);
assert.equal(launch(['--resume=' + nativeId]).status, 1);
assert.equal(launch(['--continue']).status, 1);
assert.equal(launch(['-c']).status, 1);
assert.equal(launch(['--resume', offId]).status, 0);
assert.equal(launch(['--resume', '--yolo']).status, 0);
ok('resuming a session saved with a native profile is refused; a session saved with off resumes');

// Writes: what Grok authors stays writable, protection and executable surfaces do not.
const writable = [join(grok, 'skills/new/SKILL.md'), join(grok, 'agents/a.md'), join(grok, 'workflows/w.js'), join(grok, 'AGENTS.md'),
  join(grok, 'plugins/p/index.js'), join(grok, 'installed-plugins/p'), join(grok, 'marketplace-cache/m'), join(grok, 'memory/m.md'),
  join(grok, 'memory-v2/m.md'), join(grok, 'sessions/s'), join(grok, 'auth.json'), join(grok, 'logs/l'), join(grok, 'projects/p'),
  join(home, '.cache/x'), join(home, '.cache/gh/y'), join(home, '.local/state/gh/z'), join(home, '.npm/n'), join(home, 'Library/Caches/c'),
  join(project, 'src.txt'), join(project, '.env.example')];
const guarded = [join(grok, 'config.toml'), join(grok, 'sandbox.toml'), join(grok, 'requirements.toml'), join(grok, 'managed_config.toml'),
  join(grok, 'trusted_folders.toml'), join(grok, 'hooks-paths'), join(grok, 'hooks/h.json'), join(grok, 'bin/other'), join(grok, 'downloads/grok-2.0.0'),
  join(grok, 'downloads/grok-1.0.0'), join(grok, 'vendor/rg'), join(grok, 'bundled/skill'), join(grok, 'bundles/skill'), hookTarget,
  join(home, '.local/bin/grok'), join(home, '.config/gh/hosts.yml'), join(home, '.config/gh/config.yml'), join(engine, 'state/grok-executable'),
  join(release, 'bin/grok'), join(release, 'launch'), join(home, 'Agent Guard/Guard List.txt'), join(home, 'outside'), join(home, '.zshrc')];
for (const file of writable) {
  mk(dirname(file));
  const r = probe(`: > ${q(file)}`);
  assert.equal(r.status, 0, `${file} should be writable: ${r.stderr}`);
}
for (const file of guarded) {
  const r = probe(`: >> ${q(file)}`);
  assert.notEqual(r.status, 0, `${file} should not be writable`);
}
for (const command of [`/bin/mv ${q(join(grok, 'bin'))} ${q(join(grok, 'bin-moved'))}`, `/bin/mv ${q(join(grok, 'config.toml'))} ${q(join(grok, 'config.old'))}`,
  `/bin/mv ${q(join(grok, 'hooks'))} ${q(join(grok, 'hooks-moved'))}`, `/bin/rm ${q(join(home, '.local/bin/grok'))}`,
  `/bin/ln -sf /bin/ls ${q(join(home, '.local/bin/grok'))}`, `/bin/rm -r ${q(join(grok, 'downloads'))}`,
  `/bin/mv ${q(join(grok, 'config.toml.tmp'))} ${q(join(grok, 'config.toml'))}`]) {
  put(join(grok, 'config.toml.tmp'), '');
  assert.notEqual(probe(command).status, 0, command);
}
ok('skills, agents, workflows, plugins, memory, sessions, auth.json, caches and the project stay writable; settings, hooks, executables, the link and the registry targets do not');

// Credentials: neither read nor written. gh's configuration is readable only.
for (const file of ['.ssh/id_test', '.aws/credentials', '.netrc', '.npmrc', '.git-credentials', '.config/git/credentials', '.gnupg/key',
                    '.secrets/token', '.docker/config.json', '.kube/config'].map((f) => join(home, f))) {
  assert.notEqual(probe(`/bin/cat ${q(file)} > /dev/null`).status, 0, `${file} must not be readable`);
  assert.notEqual(probe(`: >> ${q(file)}`).status, 0, `${file} must not be writable`);
}
for (const name of ['.env', '.env.local']) {
  assert.notEqual(probe(`/bin/cat ${q(join(project, name))} > /dev/null`).status, 0, `${name} must not be readable`);
  assert.notEqual(probe(`: >> ${q(join(project, name))}`).status, 0, `${name} must not be writable`);
}
for (const name of ['.env.example', '.env.sample', '.env.template'])
  assert.equal(probe(`/bin/cat ${q(join(project, name))} > /dev/null`).status, 0, `${name} stays readable`);
assert.equal(probe(`/bin/cat ${q(join(home, '.config/gh/config.yml'))} > /dev/null`).status, 0);
assert.notEqual(probe(`: >> ${q(join(home, '.config/gh/config.yml'))}`).status, 0);
ok('credential files and .env files are unreadable and unwritable, template names are readable, gh configuration is readable and not writable');

// Nested launches.
// An outer sandbox a second profile cannot be applied inside, as Poetic's denies the engine and list folders.
const outerProfile = `(version 1)(allow default)(deny file-write* (subpath ${JSON.stringify(engine)}) (subpath ${JSON.stringify(join(home, 'Agent Guard'))}))(deny process-exec (literal "/usr/bin/osascript"))`;
const outer = (args) => spawnSync('/usr/bin/sandbox-exec', ['-p', outerProfile, '/bin/zsh', '-f', '-c', '"$0" "$@"', shim, ...args], { cwd: project, env, encoding: 'utf8', timeout: 20000 });
const other = outer(['-p', 'x']);
assert.equal(other.status, 0, other.stderr);
assert.match(other.stderr, /already inside another sandbox; Agent Guard's sandbox is not applied and Grok runs under the existing one/);
assert.match(other.stdout, /^argv:--sandbox\|off\|-p\|x$/m);
assert.match(other.stdout, /updater=1 ssh=unset npmrc=\/dev\/null outer=1$/m);
const refusedOther = outer(['--sandbox', 'strict']);
assert.equal(refusedOther.status, 1);
const inside = probe(`AG_PROBE= ${q(shim)} -p nested`);
assert.equal(inside.status, 0, inside.stderr);
assert.match(inside.stdout, /^argv:--sandbox\|off\|-p\|nested$/m);
ok('inside another sandbox or the guard the launcher steps aside and keeps the same arguments');
// Peer commands in a guarded session find the recorded executable (the link in
// ~/.local/bin is the guard's) and run it with the same arguments.
const peer = probe(`AG_PROBE= ${q(join(release, 'peers/grok'))} -p peer`);
assert.equal(peer.status, 0, peer.stderr);
assert.match(peer.stdout, /^argv:--sandbox\|off\|-p\|peer$/m);
assert.match(peer.stdout, /updater=1/);
for (const args of ['--sandbox strict', 'update', '--leader'])
  assert.equal(probe(`AG_PROBE= ${q(join(release, 'peers/grok'))} ${args}`).status, 2, args);
ok('the peer command finds the recorded executable and refuses what the launcher refuses');

// The launcher's own check and its refusals.
const check = exec('/bin/zsh', [join(release, 'launch'), '--harness', 'grok', 'check']);
assert.equal(check.status, 0, check.stdout + check.stderr);
assert.match(check.stdout, /ok   Grok executable .*\.grok\/bin\/grok/);
assert.match(check.stdout, /ok   Grok settings write denied/);
const profile = exec('/bin/zsh', [join(release, 'launch'), '--harness', 'grok', 'profile']).stdout;
assert.doesNotMatch(profile, /skill-content|@[A-Z_]+@/);
assert.equal(exec('/bin/zsh', [join(release, 'launch'), '--harness', 'grok', 'gui']).status, 1);
assert.equal(exec('/bin/zsh', [join(release, 'launch'), '--harness', 'nonexistent', 'cli']).status, 1);
ok('check passes, the profile has no unfilled slot, and an unknown harness or an app launch is refused');

rmSync(run, { recursive: true, force: true });
console.log('Grok tests passed');
