// @project in the Guard List (docs/DESIGN.md section 4), for OpenCode. Runs on a
// disposable home. The launches that apply a Seatbelt profile run the real
// sandbox-exec, so this runs outside the coding agent sandbox.
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { isolateHarness, launcher, layout, stage } from './engines/zsh.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Outside the repository, so a launch folder here is not in a Git repository, and outside the
// temp folders, which every profile makes writable.
const run = realpathSync(mkdtempSync(join(homedir(), '.agent-guard-project-')));
const temp = realpathSync(execFileSync('/usr/bin/getconf', ['DARWIN_USER_TEMP_DIR'], { encoding: 'utf8' }).trim());
const scratch = realpathSync(mkdtempSync(join(temp, 'agent-guard-project-')));
let passed = false;
try {
  // Parsing the arguments of `opencode [project]`.
  const parse = (...args) => {
    const r = spawnSync('/bin/zsh', ['-fc', 'source "$1"; shift; opencode_project_arg "$@"; rc=$?; print -r -- "$rc|$REPLY"', 'x',
      join(root, 'profiles/opencode/runtime.zsh'), ...args], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const [rc, ...rest] = r.stdout.replace(/\n$/, '').split('|');
    return [Number(rc), rest.join('|')];
  };
  const table = [
    [[], ''], [['.'], '.'], [['proj'], 'proj'], [['/a b/c d'], '/a b/c d'], [['../x'], '../x'], [[''], ''],
    [['run', 'msg'], ''], [['run', 'proj'], ''], [['run', '--dir', 'sub', 'msg'], 'sub'], [['run', '--dir=sub'], 'sub'],
    [['run', '--attach', 'http://h:1', '--dir', '/remote'], ''], [['run', '--model', 'a/b', 'hello world'], ''],
    [['serve'], ''], [['serve', '--port', '1'], ''], [['mcp', 'list'], ''], [['attach', 'http://h:1'], ''],
    [['--model', 'x'], ''], [['--model', 'x', 'proj'], 'proj'], [['-m', 'x', 'proj'], 'proj'], [['-cm', 'x', 'proj'], 'proj'],
    [['-mx', 'proj'], 'proj'], [['-c', 'proj'], 'proj'], [['-s', 'id'], ''], [['--session', 'id', '--continue'], ''],
    [['--prompt', 'two words', 'proj'], 'proj'], [['--print-logs', '--log-level', 'DEBUG', 'proj'], 'proj'],
    [['--model=x', 'proj'], 'proj'], [['--standalone', 'proj'], 'proj'], [['proj', '--standalone'], 'proj'],
    [['--cors', 'a', 'b', 'proj'], ''], [['--cors', 'a', '--auto', 'proj'], 'proj'],
    [['--', 'proj'], 'proj'], [['--agent', 'build', '--', 'proj'], 'proj'], [['--newflag=1', 'proj'], 'proj'], [['--newflag'], ''],
    [['--no-replay', 'proj'], 'proj'],
  ];
  for (const [args, want] of table) assert.deepEqual(parse(...args), [0, want], JSON.stringify(args));
  assert.equal(parse('--newflag', 'proj')[0], 1, 'an unknown option before a word is ambiguous');
  assert.equal(parse('run', '--newflag', 'x')[0], 0, 'a subcommand needs no guess');
  console.log('ok   opencode [project] argument: subcommands, option values, = forms, -- and run --dir are not misread');

  // A disposable home with repositories, links and a fake OpenCode.
  const home = join(run, 'home with spaces');
  const source = join(run, 'source');
  const bin = join(run, 'bin');
  const engine = join(home, 'Library/Application Support/AgentGuard');
  const list = join(home, 'Agent Guard/Guard List.txt');
  const log = join(home, 'Agent Guard/last-launch-opencode.log');
  for (const d of ['Agent Guard', 'Projects/app/src/deep', 'Projects/plain/sub', 'Projects/other', 'Projects/with space', 'Projects/sibling',
    'Documents/proj', '.cc-safety-net/inner', 'real/target']) mkdirSync(join(home, d), { recursive: true });
  for (const d of [source, bin]) mkdirSync(d, { recursive: true });
  const git = (cwd, ...args) => execFileSync('/usr/bin/git', ['-C', cwd, ...args], { encoding: 'utf8', env: { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1' } });
  git(join(home, 'Projects/app'), 'init', '-q');
  git(join(home, 'Projects/other'), 'init', '-q');
  symlinkSync(join(home, 'Projects/other'), join(home, 'Projects/alias'));
  symlinkSync(join(home, 'Projects/app/src'), join(home, 'Projects/srclink'));
  stage(root, source, home);
  isolateHarness(source);
  // The app launch must not raise its alert dialog here.
  const text = readFileSync(join(source, 'engine/launch'), 'utf8');
  assert.equal(text.split('/usr/bin/osascript').length, 2);
  writeFileSync(join(source, 'engine/launch'), text.replace('/usr/bin/osascript', '/usr/bin/true'));
  layout(source, engine);
  // A CLI that reports what a launch lets it write, then exits.
  writeFileSync(join(bin, 'opencode'), `#!/bin/sh
[ "$1" = --version ] && { echo 1.18.33; exit 0; }
if [ -n "$FAKE_BARRIER" ]; then
  : > "$FAKE_BARRIER/$$"
  i=0; while [ "$(ls "$FAKE_BARRIER" | wc -l)" -lt 2 ] && [ $i -lt 200 ]; do sleep 0.1; i=$((i + 1)); done
fi
cp "$AGENT_GUARD_CONTEXT" "$FAKE_OUT.context"
: > "$FAKE_OUT"
OLDIFS=$IFS; IFS=:
for d in $FAKE_PROBES; do
  if : > "$d/probe" 2>/dev/null; then echo "write $d" >> "$FAKE_OUT"; rm -f "$d/probe"; else echo "denied $d" >> "$FAKE_OUT"; fi
done
IFS=$OLDIFS
exit 0
`);
  chmodSync(join(bin, 'opencode'), 0o755);

  const launch = (mode, args, { cwd = join(home, 'Projects/app'), env = {}, text } = {}) => {
    if (text !== undefined) writeFileSync(list, text);
    rmSync(join(engine, 'state/rules.json'), { force: true });
    return spawnSync('/bin/zsh', [...launcher(engine).slice(1), mode, ...args], {
      cwd, encoding: 'utf8',
      env: { PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`, HOME: home, TMPDIR: temp, PWD: cwd, ...env },
    });
  };
  const rules = () => JSON.parse(readFileSync(join(engine, 'state/rules.json'), 'utf8'));
  const profile = (args, options) => {
    const r = launch('profile', args, options);
    assert.equal(r.status, 0, r.stderr);
    return r;
  };
  const logText = () => readFileSync(log, 'utf8');
  const ALLOW = (...entries) => `ALLOW\n${entries.join('\n')}\nREAD ONLY\nDENY\n`;
  const P = (...p) => join(home, ...p);

  // Off by default: a commented @project, or no entry, gives the same profile.
  const plain = profile([], { text: ALLOW(P('Projects/other')) }).stdout;
  assert.equal(profile([], { text: ALLOW('# @project', P('Projects/other')) }).stdout, plain);
  assert.equal(profile(['proj'], { text: ALLOW('# @project', P('Projects/other')) }).stdout, plain);
  assert.deepEqual(rules().allow, [P('Projects/other')]);
  console.log('ok   a list without @project gives the same profile whatever the arguments');

  // The template carries @project commented out under ALLOW, so a new list changes nothing.
  const template = readFileSync(join(root, 'profiles/opencode/templates/Guard List.txt'), 'utf8');
  assert.match(template, /^# @project$/m);
  assert.doesNotMatch(template, /^@project/m);
  const fromTemplate = profile([], { text: template }).stdout;
  assert.equal(fromTemplate, profile([], { text: template.replace(/^# @project$/m, '') }).stdout);
  console.log('ok   the template lists @project commented out');

  // @project resolves to the same profile as the folder it names.
  const same = (name, args, folder, options = {}, entry = folder) => {
    const got = profile(args, { ...options, text: ALLOW('@project') }).stdout;
    assert.match(readFileSync(log, 'utf8'), new RegExp(`@project resolves to: ${folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`), name);
    const want = profile(args, { ...options, text: ALLOW(entry) }).stdout;
    assert.equal(got.replace(/^Agent Guard.*\n/, ''), want.replace(/^Agent Guard.*\n/, ''), name);
    assert.deepEqual(rules().allow, [folder], name);
  };
  const app = realpathSync(P('Projects/app')), other = realpathSync(P('Projects/other')), plainDir = realpathSync(P('Projects/plain'));
  same('git top level from the launch folder', [], app);
  same('git top level from a subfolder', [], app, { cwd: P('Projects/app/src/deep') });
  same('launch folder outside a repository', [], plainDir, { cwd: P('Projects/plain') });
  same('launch folder, a subfolder of a plain folder', [], realpathSync(P('Projects/plain/sub')), { cwd: P('Projects/plain/sub') });
  same('run "message"', ['run', 'fix it'], app);
  same('serve', ['serve'], app);
  same('an option and its value', ['--model', 'x/y'], app);
  same('a project argument', [other], other);
  same('a project argument after options', ['--model', 'x/y', '--print-logs', other], other);
  same('a relative project argument', ['../other'], other);
  same('dot', ['.'], app);
  same('dot from a subfolder', ['.'], realpathSync(P('Projects/app/src/deep')), { cwd: P('Projects/app/src/deep') });
  same('a path with spaces', [P('Projects/with space')], realpathSync(P('Projects/with space')));
  same('a relative path with spaces', ['with space'], realpathSync(P('Projects/with space')), { cwd: P('Projects') });
  same('a symlink argument', [P('Projects/alias')], other, {}, P('Projects/alias'));
  same('run --dir', ['run', '--dir', '../other', 'hi'], other);
  assert.deepEqual(rules().allow, [other]);
  console.log('ok   @project is the project argument, else the git top level, else the launch folder, canonicalized');

  // Not misread: a subcommand or option value that names a folder is not the project.
  mkdirSync(P('Projects/app/serve'), { recursive: true });
  mkdirSync(P('Projects/app/x'), { recursive: true });
  same('a folder named like a subcommand', ['serve'], app);
  same('a folder named like an option value', ['--model', 'x'], app);
  console.log('ok   a folder named like a subcommand or an option value is not taken as the project');

  // Entries that cannot resolve are skipped; a bad target refuses the launch.
  let r = profile([P('Projects/missing')], { text: ALLOW('@project', P('Projects/sibling')) });
  assert.deepEqual(rules().allow, [realpathSync(P('Projects/sibling'))]);
  assert.match(logText(), /skipped, @project folder does not exist: .*Projects\/missing/);
  for (const section of ['READ ONLY', 'DENY']) {
    profile([], { text: `ALLOW\n${P('Projects/sibling')}\n${section}\n@project\n` });
    assert.deepEqual(rules().allow, [realpathSync(P('Projects/sibling'))]);
    assert.deepEqual([...rules().readonly, ...rules().deny], []);
    assert.match(logText(), /skipped, @project is valid only under ALLOW/);
  }
  profile([], { text: ALLOW('@project', '@project') });
  assert.deepEqual(rules().allow, [app]);
  assert.match(logText(), /skipped, @project is already listed/);
  console.log('ok   @project outside ALLOW, a second @project and a missing folder are skipped and logged');

  const refuse = (name, args, pattern, options = {}) => {
    const out = launch('profile', args, { ...options, text: ALLOW('@project', P('Projects/sibling')) });
    assert.notEqual(out.status, 0, `${name}: launch not refused`);
    assert.match(out.stderr, pattern, name);
    assert.match(logText(), /refused @project: /, name);
    assert.equal(out.stdout, '', `${name}: a profile was written`);
    assert.ok(!existsSync(join(engine, 'state/rules.json')), `${name}: rules published`);
  };
  refuse('home', [home], /@project is too broad/);
  refuse('home by a launch from home', [], /@project is too broad/, { cwd: home });
  refuse('root', ['/'], /@project is too broad/);
  refuse('/tmp', ['/tmp'], /@project is too broad/);
  refuse('/private/var', ['/var'], /@project is too broad/);
  refuse('/Users', ['/Users'], /@project is too broad/);
  refuse('/usr/local', ['/usr/local'], /is or is inside \/usr/);
  refuse('/Applications', ['/Applications'], /is or is inside \/Applications/);
  refuse('Documents', [P('Documents/proj')], /is or is inside .*Documents/);
  refuse('Library', [P('Library')], /is or is inside .*Library/);
  refuse('the list folder', [P('Agent Guard')], /contains the guard/);
  refuse('inside the engine', [engine], /is or is inside .*Library/);
  refuse('a .cc-safety-net folder', [P('.cc-safety-net/inner')], /is inside the protected folder|\.cc-safety-net/);
  refuse('a launch from inside a protected folder', [], /\.cc-safety-net|protected folder/, { cwd: P('.cc-safety-net/inner') });
  refuse('a link into Documents', [(() => { symlinkSync(P('Documents/proj'), P('Projects/docs-link')); return P('Projects/docs-link') })()], /Documents/);
  refuse('an argument that cannot be read', ['--newflag', 'x'], /cannot tell whether the word after --newflag/);
  // A differently cased spelling of home is still home, on a case-insensitive volume.
  if (existsSync(home.toLowerCase())) {
    refuse('home spelled in lowercase', [home.toLowerCase()], /@project is too broad/);
    refuse('Documents spelled in lowercase', [P('Documents/proj').toLowerCase()], /is or is inside .*Documents/);
  }
  // A folder whose name holds a tab would otherwise add an entry of its own.
  mkdirSync(P('Projects/tab\tdir'), { recursive: true });
  refuse('a tab in the folder name', [P('Projects/tab\tdir')], /contains a tab or newline/);
  refuse('a launch from a folder with a tab in its name', [], /contains a tab or newline/, { cwd: P('Projects/tab\tdir') });
  // Pi's config folders are protected once Pi is installed.
  mkdirSync(join(engine, 'state'), { recursive: true });
  writeFileSync(join(engine, 'state/stamp.json'), JSON.stringify({ harnesses: ['opencode', 'pi'] }));
  mkdirSync(P('Projects/sibling/.pi/inner'), { recursive: true });
  refuse('a .pi folder with Pi installed', [P('Projects/sibling/.pi/inner')], /protected agent config folder/);
  rmSync(join(engine, 'state/stamp.json'));
  console.log('ok   a too broad, sensitive, guard-containing or protected @project refuses the launch and is logged');

  // `..` through a link: OpenCode 1 and 2 disagree, so the launch is refused.
  symlinkSync(P('Projects/app/src/deep'), P('Projects/deeplink'));
  const viaLink = launch('profile', ['../other'], { cwd: P('Projects/deeplink'), env: { PWD: P('Projects/deeplink') }, text: ALLOW('@project') });
  assert.notEqual(viaLink.status, 0);
  assert.match(viaLink.stderr, /depending on the OpenCode version; give the project as a full path/);
  console.log('ok   a relative project that differs by OpenCode version through a link is refused');

  // Protected names that are links inside @project get the launch folder's link handling.
  const piList = ALLOW('@project');
  writeFileSync(join(engine, 'state/stamp.json'), JSON.stringify({ harnesses: ['opencode', 'pi'] }));
  mkdirSync(P('real/pi-target'), { recursive: true });
  symlinkSync(P('real/pi-target'), P('Projects/sibling/.omp'));
  const target = realpathSync(P('real/pi-target'));
  const deny = `(deny file-write* (subpath ${JSON.stringify(target)}))`;
  assert.ok(profile([P('Projects/sibling')], { text: piList, cwd: P('Projects/plain') }).stdout.includes(deny), 'project link target denied');
  assert.ok(!profile([], { text: piList, cwd: P('Projects/plain') }).stdout.includes(deny), 'no link in the launch folder');
  assert.ok(profile([], { text: ALLOW(P('Projects/sibling')), cwd: P('Projects/sibling') }).stdout.includes(deny), 'launch folder behaviour');
  rmSync(join(engine, 'state/stamp.json'));
  console.log('ok   a protected name that is a link inside @project has its target write-denied, as in the launch folder');

  // The hooks folder protected is the project's, not the launch folder's.
  mkdirSync(P('Projects/hooked/custom-hooks'), { recursive: true });
  git(P('Projects/hooked'), 'init', '-q');
  git(P('Projects/hooked'), 'config', 'core.hooksPath', P('Projects/hooked/custom-hooks'));
  const hooks = `(deny file-write* (subpath (h "/${P('Projects/hooked/custom-hooks').slice(home.length + 1)}")))`;
  assert.ok(profile([P('Projects/hooked')], { text: ALLOW('@project'), cwd: P('Projects/plain') }).stdout.includes(hooks), 'project hooks folder denied');
  assert.ok(!profile([P('Projects/hooked')], { text: ALLOW(P('Projects/hooked')), cwd: P('Projects/plain') }).stdout.includes(hooks), 'unchanged without @project');
  console.log('ok   with @project the project\'s active hooks folder is denied; without it the launch folder\'s is used');

  // The app has no project folder: @project is skipped and the fixed ALLOW folders stay.
  r = launch('gui', [], { text: ALLOW('@project', P('Projects/sibling')) });
  assert.notEqual(r.status, 0, 'no OpenCode.app in the fixture home');
  assert.match(logText(), /skipped, @project has no project folder in the app/);
  assert.doesNotMatch(logText(), /@project resolves to/);
  assert.equal(JSON.parse(readFileSync(join(engine, 'state/rules.json'), 'utf8')).allow.join(), realpathSync(P('Projects/sibling')));
  console.log('ok   the app resolves @project to nothing and keeps the fixed ALLOW folders');

  // Real Seatbelt: writes inside @project, nowhere else; concurrent launches stay apart.
  const probes = [app, P('Projects/app/src'), other, P('Projects/sibling'), P('Projects/plain')];
  const cli = (name, args, options = {}) => {
    const out = join(scratch, name);
    const r = launch('cli', args, { ...options, env: { FAKE_OUT: out, FAKE_PROBES: probes.join(':'), ...options.env } });
    assert.equal(r.status, 0, r.stderr);
    return { results: readFileSync(out, 'utf8').trim().split('\n').sort(), context: JSON.parse(readFileSync(`${out}.context`, 'utf8')) };
  };
  const expected = (...writable) => probes.map((d) => `${writable.includes(d) ? 'write' : 'denied'} ${d}`).sort();
  let seen = cli('subfolder', [], { cwd: P('Projects/app/src'), text: ALLOW('@project') });
  assert.deepEqual(seen.results, expected(app, P('Projects/app/src')));
  assert.deepEqual(seen.context.allow, [app]);
  seen = cli('argument', [other], { cwd: P('Projects/app'), text: ALLOW('@project') });
  assert.deepEqual(seen.results, expected(other));
  seen = cli('run', ['run', 'hello'], { cwd: P('Projects/plain'), text: ALLOW('@project') });
  assert.deepEqual(seen.results, expected(P('Projects/plain')));
  seen = cli('with-fixed', ['--model', 'a/b'], { cwd: P('Projects/app'), text: ALLOW('@project', P('Projects/sibling')) });
  assert.deepEqual(seen.results, expected(app, P('Projects/app/src'), P('Projects/sibling')));
  seen = cli('commented', [other], { cwd: P('Projects/app'), text: ALLOW('# @project', P('Projects/sibling')) });
  assert.deepEqual(seen.results, expected(P('Projects/sibling')));
  console.log('ok   under Seatbelt a session writes inside @project and not in other folders');

  writeFileSync(list, ALLOW('@project'));
  const barrier = join(scratch, 'barrier');
  mkdirSync(barrier);
  const start = (name, cwd) => new Promise((done) => {
    const out = join(scratch, name);
    const child = spawn('/bin/zsh', [...launcher(engine).slice(1), 'cli'], {
      cwd, encoding: 'utf8',
      env: { PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`, HOME: home, TMPDIR: temp, PWD: cwd, FAKE_OUT: out, FAKE_PROBES: probes.join(':'), FAKE_BARRIER: barrier },
    });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => done({ status, stderr, results: readFileSync(out, 'utf8').trim().split('\n').sort(), context: JSON.parse(readFileSync(`${out}.context`, 'utf8')) }));
  });
  const [one, two] = await Promise.all([start('one', P('Projects/app')), start('two', P('Projects/other'))]);
  for (const x of [one, two]) assert.equal(x.status, 0, x.stderr);
  assert.deepEqual(one.results, expected(app, P('Projects/app/src')));
  assert.deepEqual(two.results, expected(other));
  assert.deepEqual([one.context.allow, two.context.allow], [[app], [other]]);
  console.log('ok   concurrent launches in different projects each write only their own project');

  // Other harnesses have no start folder yet: the entry is skipped.
  const grok = spawnSync('/bin/zsh', [...launcher(engine).slice(1), '--harness', 'grok', 'profile'], {
    cwd: P('Projects/app'), encoding: 'utf8', env: { PATH: `${bin}:/usr/bin:/bin:/usr/sbin:/sbin`, HOME: home, TMPDIR: temp, PWD: P('Projects/app') } });
  assert.equal(grok.status, 0, grok.stderr);
  assert.match(readFileSync(join(home, 'Agent Guard/last-launch-grok.log'), 'utf8'), /skipped, @project is not defined for Grok/);
  console.log('ok   a harness without a start folder skips @project');
  passed = true;
} finally {
  rmSync(scratch, { recursive: true, force: true });
  if (passed) rmSync(run, { recursive: true, force: true });
  else console.error(`project fixture retained: ${run}`);
}
