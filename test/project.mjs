// @project in the Guard List (docs/DESIGN.md section 4), for OpenCode. Runs on a
// disposable home. The launches that apply a Seatbelt profile run the real
// sandbox-exec, so this runs outside the coding agent sandbox.
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
  assert.match(logText(), /^unreadable and unwritable for OpenCode: .*\.ssh.*, \.env files$/m);
  console.log('ok   the OpenCode launch log records the credential paths');

  // A heading may carry a # suffix like a - or : one; it does not start a path line.
  const dashed = `ALLOW - note\n${P('Projects/other')}\nREAD ONLY - note\n${P('Projects/sibling')}\nDENY - note\n${P('Projects/app')}\n`;
  profile([], { text: dashed });
  const sections = () => { const { allow, readonly, deny } = rules(); return { allow, readonly, deny }; };
  const dashSections = sections();
  assert.deepEqual(Object.values(dashSections).map((s) => s.length), [1, 1, 1]);
  profile([], { text: dashed.replaceAll(' - note', ' # note') });
  assert.deepEqual(sections(), dashSections);
  assert.doesNotMatch(logText(), /skipped, not a full path/);
  console.log('ok   a heading with a # suffix opens its section like a - suffix');

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
  for (const target of [P('Projects/sibling'), P('Projects')]) {
    git(app, 'config', '--local', 'core.worktree', target);
    refuse('persisted worktree redirect', [], /instead of the checkout/, { cwd: P('Projects/app/src/deep') });
    same('an explicit project remains selectable with redirected Git config', [target], realpathSync(target));
    git(app, 'config', '--local', '--unset', 'core.worktree');
  }
  git(app, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'Initialize fixture');
  git(app, 'worktree', 'add', '-q', '--detach', P('Projects/linked'), 'HEAD');
  mkdirSync(P('Projects/linked/sub'));
  same('a linked worktree keeps its own boundary', [], realpathSync(P('Projects/linked')), { cwd: P('Projects/linked/sub') });
  git(P('Projects'), 'init', '-q', '--separate-git-dir', P('Projects/separate.git'), P('Projects/separate'));
  mkdirSync(P('Projects/separate/sub'));
  same('a separate Git directory keeps its checkout boundary', [], realpathSync(P('Projects/separate')), { cwd: P('Projects/separate/sub') });
  symlinkSync(app, P('Projects/checkout-link'));
  same('a symlink to the checkout uses its physical boundary', [], app, { cwd: P('Projects/checkout-link/src/deep') });
  console.log('ok   implicit Git discovery binds to the physical checkout; linked worktrees, separate Git directories and explicit paths remain supported');

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

  // @project in the app (docs/DESIGN.md section 4): the remembered app projects plus the folders
  // dropped on the app. A fake OpenCode.app reports what a launch lets it write, then exits.
  const appDir = join(home, 'Applications/OpenCode.app/Contents');
  mkdirSync(join(appDir, 'MacOS'), { recursive: true });
  writeFileSync(join(appDir, 'Info.plist'), '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>AgFakeApp</string></dict></plist>');
  writeFileSync(join(appDir, 'MacOS/AgFakeApp'), `#!/bin/sh
cp "$AGENT_GUARD_CONTEXT" "$FAKE_OUT.context"
: > "$FAKE_OUT"
OLDIFS=$IFS; IFS=:
for d in $FAKE_PROBES; do
  if : > "$d/probe" 2>/dev/null; then echo "write $d" >> "$FAKE_OUT"; rm -f "$d/probe"; else echo "denied $d" >> "$FAKE_OUT"; fi
done
IFS=$OLDIFS
if : >> "$FAKE_STORE" 2>/dev/null || : > "$FAKE_STORE.tmp" 2>/dev/null; then echo "write store" >> "$FAKE_OUT"; else echo "denied store" >> "$FAKE_OUT"; fi
exit 0
`);
  chmodSync(join(appDir, 'MacOS/AgFakeApp'), 0o755);
  const store = join(engine, 'state/opencode/app-projects');
  const stored = () => (existsSync(store) ? readFileSync(store, 'utf8') : null);
  const setStore = (...lines) => { mkdirSync(dirname(store), { recursive: true }); writeFileSync(store, lines.map((l) => `${l}\n`).join('')); };
  const gui = (name, args, options = {}) => {
    const out = join(scratch, name);
    const r = launch('gui', args, { ...options, env: { FAKE_OUT: out, FAKE_STORE: store, FAKE_PROBES: '', ...options.env } });
    return { r, out, results: () => readFileSync(out, 'utf8').trim().split('\n').sort(), context: () => JSON.parse(readFileSync(`${out}.context`, 'utf8')) };
  };
  const dropped = (name, args, options) => {
    const g = gui(name, args, options);
    assert.equal(g.r.status, 0, `${name}: ${g.r.stderr}`);
    return g;
  };
  const sibling = realpathSync(P('Projects/sibling')), withSpace = realpathSync(P('Projects/with space'));
  const refused = (name, args, pattern, options = {}) => {
    const before = stored();
    const g = gui(name, args, { text: ALLOW('@project'), ...options });
    assert.notEqual(g.r.status, 0, `${name}: launch not refused`);
    assert.match(g.r.stderr, pattern, name);
    assert.equal(stored(), before, `${name}: the store changed`);
    assert.ok(!existsSync(join(engine, 'state/rules.json')), `${name}: rules published`);
    assert.ok(!existsSync(g.out), `${name}: the app started`);
    return g.r.stderr;
  };

  // No folder yet: the chooser is asked for, once a folder is remembered it is not.
  rmSync(join(engine, 'state/opencode'), { recursive: true, force: true });
  writeFileSync(log, 'previous launch\n');
  const query = (text, env) => {
    const r = launch('gui', ['--project-query'], { text, env });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  assert.equal(query(ALLOW('@project')), 'ask\n');
  assert.equal(query(ALLOW('  @project  ', P('Projects/sibling'))), 'ask\n');
  assert.equal(query(ALLOW('# @project')), 'go\n');
  assert.equal(query(ALLOW(P('Projects/sibling'))), 'go\n');
  assert.equal(query('ALLOW\nREAD ONLY\n@project\nDENY\n'), 'go\n');
  assert.equal(readFileSync(log, 'utf8'), 'previous launch\n', 'the query rewrote the launch log');
  assert.equal(stored(), null);
  assert.ok(!existsSync(join(engine, 'state/rules.json')) && !existsSync(join(engine, 'state/opencode')), 'the query wrote state');
  setStore(other);
  assert.equal(query(ALLOW('@project')), 'go\n');
  rmSync(store);
  // An open app gets the launch, which names it, not the chooser.
  symlinkSync('/bin/sleep', join(scratch, 'AgFakeApp'));
  const incumbent = spawn(join(scratch, 'AgFakeApp'), ['60'], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 50 && spawnSync('/usr/bin/pgrep', ['-x', 'AgFakeApp']).status !== 0; i++) await new Promise((d) => setTimeout(d, 100));
    assert.equal(spawnSync('/usr/bin/pgrep', ['-x', 'AgFakeApp']).status, 0, 'no running AgFakeApp to stand for OpenCode');
    assert.equal(query(ALLOW('@project')), 'go\n');
    // A drop on a running app neither prompts nor records; the log keeps its content and gains the refusal as its own entry.
    refused('incumbent', ['--project', other], /OpenCode is already open/);
    assert.match(readFileSync(log, 'utf8'), /^previous launch\nAgent Guard gui \S+ \S+ \S+ refused before launch\nfailed: OpenCode is already open\. [^\n]*\nagent-guard-stage:host-launch\n$/);
    refused('incumbent, plain', [], /OpenCode is already open/);
  } finally { incumbent.kill(); }
  console.log('ok   --project-query answers ask only for an empty store with @project on, and writes nothing; an open app is refused first');

  // A dropped folder is granted, remembered, and the store is written once the launch is certain.
  const probe = [other, app, sibling, withSpace, P('Projects/plain')].join(':');
  let g = dropped('drop-one', ['--project', other], { text: ALLOW('@project'), env: { FAKE_PROBES: probe } });
  assert.equal(stored(), `${other}\n`);
  assert.deepEqual(g.context().allow, [other]);
  assert.deepEqual(g.context().projects, [other]);
  assert.deepEqual(g.results(), [`write ${other}`, `denied ${app}`, `denied ${sibling}`, `denied ${withSpace}`, `denied ${P('Projects/plain')}`, 'denied store'].sort());
  assert.match(logText(), new RegExp(`@project resolves to: ${other.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`));
  // A trailing slash, a repeat and several folders at once; the store keeps each once, in order.
  g = dropped('drop-many', ['--project', `${other}/`, '--project', `${sibling}/`, '--project', app, '--project', sibling], { text: ALLOW('@project') });
  assert.equal(stored(), `${other}\n${sibling}\n${app}\n`);
  assert.deepEqual(g.context().allow.toSorted(), [app, other, sibling].toSorted());
  assert.deepEqual(g.context().projects, [other, sibling, app]);
  // A plain open uses the store; without @project the store is ignored and nothing prompts.
  g = dropped('open', [], { text: ALLOW('@project', P('Projects/plain')) });
  assert.deepEqual(g.context().allow.toSorted(), [app, other, sibling, plainDir].toSorted());
  assert.equal(stored(), `${other}\n${sibling}\n${app}\n`);
  g = dropped('off', [], { text: ALLOW('# @project', P('Projects/plain')) });
  assert.deepEqual(g.context().allow, [plainDir]);
  assert.deepEqual(g.context().projects, []);
  console.log('ok   dropped folders are granted and remembered; a plain open grants the remembered ones; @project off ignores the store');

  // The app's @project is the remembered set, and the command line's is unchanged by it.
  profile([], { text: ALLOW('@project'), cwd: P('Projects/plain') });
  assert.deepEqual(rules().allow, [plainDir]);
  assert.deepEqual(rules().projects, [plainDir]);
  console.log('ok   the command line\'s @project ignores the app store and reports its one project');

  // Refused folders fail the launch and are not stored, even beside a good one.
  const before = stored();
  mkdirSync(P('Projects/new-good'), { recursive: true });
  writeFileSync(P('Projects/file.txt'), '');
  refused('home', ['--project', home], /@project is too broad/);
  refused('home with a slash', ['--project', `${home}/`], /@project is too broad/);
  refused('Documents', ['--project', P('Documents/proj')], /is or is inside .*Documents/);
  refused('the list folder', ['--project', P('Agent Guard')], /contains the guard/);
  refused('the guard engine', ['--project', engine], /is or is inside .*Library/);
  refused('root', ['--project', '/'], /@project is too broad/);
  refused('a refused folder beside a good one', ['--project', P('Projects/new-good'), '--project', P('Documents/proj')], /Documents/);
  refused('a tab in the name', ['--project', P('Projects/tab\tdir')], /tab or newline/);
  refused('a missing folder', ['--project', P('Projects/missing')], /not a folder: .*Projects\/missing/);
  refused('a file', ['--project', P('Projects/file.txt')], /not a folder: /);
  // Malformed values: empty, relative, missing, and a folder name that reads as an option.
  refused('empty', ['--project', ''], /--project needs a full path/);
  refused('relative', ['--project', 'Projects/other'], /--project needs a full path: Projects\/other/);
  refused('dash', ['--project', '-x'], /--project needs a full path: -x/);
  // A refusal before the launch's header keeps the log as it was and is appended as its own entry.
  writeFileSync(log, 'previous launch\n');
  refused('no value', ['--project'], /--project needs a folder/);
  const early = logText().split('\n');
  assert.equal(early[0], 'previous launch');
  assert.match(early[1], /^Agent Guard gui \S+ \d{4}-\d\d-\d\d \d\d:\d\d:\d\d refused before launch$/);
  assert.deepEqual(early.slice(2), ['failed: --project needs a folder', 'agent-guard-stage:configuration', '']);
  refused('not active', ['--project', P('Projects/new-good')], /@project is off in/, { text: ALLOW('# @project') });
  // After the header the reason goes between the launch's own lines and the stage.
  const late = logText().trimEnd().split('\n');
  assert.match(late[0], /^Agent Guard gui \S+ \d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
  assert.match(late.at(-2), /^failed: @project is off in /);
  assert.match(late.at(-1), /^agent-guard-stage:[a-z-]+$/);
  assert.ok(!late.some((l) => l.endsWith('refused before launch')));
  refused('not active, READ ONLY', ['--project', P('Projects/new-good')], /@project is off in/, { text: 'ALLOW\nREAD ONLY\n@project\n' });
  assert.equal(stored(), before);
  console.log('ok   a refused, missing, malformed or inactive drop fails the launch and the store keeps what it had');

  // A name that holds shell syntax is data end to end.
  const hostile = P('Projects/it\'s "$(touch pwned)" `id` ; $HOME \\ & x');
  mkdirSync(hostile, { recursive: true });
  g = dropped('hostile', ['--project', hostile], { text: ALLOW('@project'), cwd: scratch, env: { FAKE_PROBES: realpathSync(hostile) } });
  assert.ok(stored().split('\n').includes(realpathSync(hostile)), 'hostile name stored as is');
  assert.ok(g.results().includes(`write ${realpathSync(hostile)}`));
  assert.ok(!existsSync(join(scratch, 'pwned')) && !existsSync('pwned'), 'a command in the name ran');
  // The applet text hands each folder to the launcher as one literal argument.
  const stub = join(scratch, 'applet');
  mkdirSync(join(stub, 'bin'), { recursive: true });
  writeFileSync(join(stub, 'bin/opencode-gui'), '#!/bin/sh\nfor a; do printf \'%s\\0\' "$a"; done > "$APPLET_OUT.part"\nmv "$APPLET_OUT.part" "$APPLET_OUT"\n');
  chmodSync(join(stub, 'bin/opencode-gui'), 0o755);
  const applet = spawnSync('/bin/zsh', ['-fc', 'engine=$1; source "$2"; ag_app_script; print -r -- "$REPLY"', 'x', stub, join(root, 'installer/lib.zsh')], { encoding: 'utf8' });
  assert.equal(applet.status, 0, applet.stderr);
  assert.ok(applet.stdout.includes(`property launcher : "${stub}/bin/opencode-gui"`));
  writeFileSync(join(stub, 'main.applescript'), applet.stdout);
  const compiled = spawnSync('/usr/bin/osacompile', ['-o', join(stub, 'main.scpt'), join(stub, 'main.applescript')], { encoding: 'utf8' });
  assert.equal(compiled.status, 0, compiled.stderr);
  const handler = (values) => {
    const out = join(stub, `out-${values.length}`);
    rmSync(out, { force: true });
    const r = spawnSync('/usr/bin/osascript', ['-e', 'on run argv', '-e', 'set s to load script POSIX file (item 1 of argv)', '-e', 'tell s to startGuard(rest of argv)', '-e', 'end run',
      join(stub, 'main.scpt'), ...values], { encoding: 'utf8', env: { ...process.env, APPLET_OUT: out } });
    assert.equal(r.status, 0, r.stderr);
    for (let i = 0; i < 100 && !existsSync(out); i++) spawnSync('/bin/sleep', ['0.1']);
    return readFileSync(out, 'utf8').split('\0').slice(0, -1);
  };
  const names = ['/a b/c', hostile, '/x\'; touch /tmp/ag-pwned; \'', '/odd "name" $(x) `y` \\ *'];
  assert.deepEqual(handler([]), []);
  assert.deepEqual(handler(names), names.flatMap((n) => ['--project', n]));
  assert.ok(!existsSync('/tmp/ag-pwned'));
  console.log('ok   a folder name with quotes, $(), backticks and spaces is one literal argument and runs nothing');

  // Links in the path are pinned; a folder spelled through a link is stored by its target.
  rmSync(store);
  g = dropped('link', ['--project', P('Projects/alias')], { text: ALLOW('@project') });
  assert.equal(stored(), `${other}\n`);
  assert.ok(g.context().pins.includes(P('Projects/alias')), 'link pinned');
  console.log('ok   a link in a dropped path is pinned and the store keeps the canonical folder');

  // Each remembered folder is re-resolved at every launch.
  setStore(other, P('Projects/gone'));
  g = dropped('gone', [], { text: ALLOW('@project') });
  assert.deepEqual(g.context().allow, [other]);
  assert.match(logText(), /skipped, app project folder does not exist: .*Projects\/gone/);
  assert.equal(stored(), `${other}\n${P('Projects/gone')}\n`);
  setStore(other, P('Documents/proj'));
  refused('stored and now refused', ['--project', P('Projects/new-good')], /@project is or is inside .*Documents.*proj\. Remove it with: agent-guard app-projects remove .*Documents\/proj/);
  console.log('ok   a remembered folder that is gone is skipped and kept; one now refused fails the launch');

  // A stored line is canonical when written: a link now on its path refuses the launch, as a
  // replaced folder or as a link planted where a deleted folder was, and grants nothing.
  const swap = P('Projects/swap');
  mkdirSync(swap);
  const swapReal = realpathSync(swap);
  setStore(other, swapReal);
  rmSync(swap, { recursive: true });
  symlinkSync(sibling, swap);
  const swapRefusal = refused('stored folder replaced by a link', [], new RegExp(`remembered folder ${swapReal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} now resolves to ${sibling.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.* Remove it with: agent-guard app-projects remove '${swapReal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\n`));
  // A link left at the name of a deleted folder refuses too, even one that points nowhere.
  rmSync(swap);
  symlinkSync(P('Projects/nowhere'), swap);
  refused('stored folder gone, dangling link planted', [], /remembered folder .*Projects\/swap now resolves to/);
  console.log('ok   a remembered folder now behind a link refuses the launch and names the removal command');

  // A launch that fails after resolving, in the managed service checks, remembers nothing.
  mkdirSync(join(appDir, 'Resources'), { recursive: true });
  writeFileSync(join(appDir, 'Resources/opencode-cli'), `#!/bin/sh
case "$1" in --version) echo 2.0.0 ;; service) echo http://127.0.0.1:1 ;; esac
`);
  chmodSync(join(appDir, 'Resources/opencode-cli'), 0o755);
  setStore(other);
  const storeBefore = stored();
  const failed = gui('managed-fails', ['--project', sibling], { text: ALLOW('@project') });
  assert.notEqual(failed.r.status, 0);
  assert.match(failed.r.stderr, /background service/);
  assert.ok(!existsSync(failed.out), 'the app started');
  assert.equal(stored(), storeBefore, 'a failed launch changed the store');
  rmSync(join(appDir, 'Resources'), { recursive: true });
  console.log('ok   a launch that fails its managed service checks does not remember dropped folders');

  // Per project: protected names behind links, and the active hooks folder.
  rmSync(store);
  mkdirSync(P('Projects/piproj/omp-target'), { recursive: true });
  symlinkSync(P('Projects/piproj/omp-target'), P('Projects/piproj/.omp'));
  writeFileSync(join(engine, 'state/stamp.json'), JSON.stringify({ harnesses: ['opencode', 'pi'] }));
  const hooked = realpathSync(P('Projects/hooked')), piproj = realpathSync(P('Projects/piproj'));
  const names2 = [hooked, piproj, join(hooked, 'custom-hooks'), join(piproj, 'omp-target')].join(':');
  g = dropped('per-project', ['--project', hooked, '--project', piproj], { text: ALLOW('@project'), env: { FAKE_PROBES: names2 } });
  assert.deepEqual(g.results().filter((x) => x !== 'denied store'), [`write ${hooked}`, `write ${piproj}`, `denied ${join(hooked, 'custom-hooks')}`, `denied ${join(piproj, 'omp-target')}`].sort());
  assert.match(logText(), new RegExp(`active hooks folder .*${hooked.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/custom-hooks`));
  rmSync(join(engine, 'state/stamp.json'));
  console.log('ok   each remembered folder gets its protected names and its active hooks folder write-denied');

  // Under Seatbelt the store cannot be written, so a session cannot add a project for a later launch.
  rmSync(store);
  g = dropped('store-denied', ['--project', other], { text: ALLOW('@project') });
  assert.ok(g.results().includes('denied store'), 'store writable inside the sandbox');
  assert.equal(stored(), `${other}\n`);
  console.log('ok   the store is written by the launcher and write-denied inside the session');

  // agent-guard app-projects lists and removes.
  const ag = join(engine, 'releases/0.0.0-20260101T000000Z/bin/agent-guard');
  mkdirSync(dirname(ag), { recursive: true });
  copyFileSync(join(source, 'engine/agent-guard'), ag);
  chmodSync(ag, 0o755);
  const manage = (...args) => spawnSync('/bin/zsh', [ag, 'app-projects', ...args], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: home, TMPDIR: temp }, cwd: P('Projects') });
  rmSync(store);
  let m = manage();
  assert.deepEqual([m.status, m.stdout], [0, '']);
  assert.match(m.stderr, /no app projects are remembered/);
  setStore(other, sibling, withSpace, P('Projects/gone'), '/x/[ab]*');
  assert.equal(manage().stdout, `${other}\n${sibling}\n${withSpace}\n${P('Projects/gone')}\n/x/[ab]*\n`);
  m = manage('remove', sibling);
  assert.equal(m.status, 0, m.stderr);
  assert.equal(stored(), `${other}\n${withSpace}\n${P('Projects/gone')}\n/x/[ab]*\n`);
  m = manage('remove', 'alias/');
  assert.equal(m.status, 0, m.stderr);
  assert.equal(stored(), `${withSpace}\n${P('Projects/gone')}\n/x/[ab]*\n`);
  assert.equal(manage('remove', '/x/[ab]*').status, 0);
  assert.equal(manage('remove', '/x/a').status, 1);
  assert.match(manage('remove', P('Projects/not-stored')).stderr, /not an app project/);
  assert.equal(manage('remove', P('Projects/gone')).status, 0);
  assert.equal(manage('remove', withSpace).status, 0);
  assert.equal(stored(), '');
  // The removal command in a refusal works as printed, with the link still in place.
  setStore(other, swapReal);
  const hint = swapRefusal.match(/Remove it with: agent-guard (app-projects remove .*)\n/)[1];
  m = spawnSync('/bin/zsh', ['-c', `exec /bin/zsh ${JSON.stringify(ag)} ${hint}`], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: home, TMPDIR: temp }, cwd: P('Projects') });
  assert.equal(m.status, 0, m.stderr);
  assert.equal(stored(), `${other}\n`);
  rmSync(swap);
  setStore();
  assert.equal(manage('remove').status, 2);
  assert.equal(manage('add', other).status, 2);
  console.log('ok   agent-guard app-projects lists the store and removes an entry as stored or as typed');

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
