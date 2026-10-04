// Tests Agent Guard's recorded differences to pi-sandbox-guard 7ad441f's Pi profile
// (test/fixtures/differences/pi.json) and nested launches. Each account is a
// disposable home with the vendored launcher, preamble and profile in ~/.local/bin,
// as installed; only the copied preamble's directory-service lookup is pointed at
// the disposable home. A stand-in Pi runs the command it is given inside the
// session. Runs outside any sandbox.
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { layout, stage } from './engines/zsh.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pi = join(root, 'profiles/pi');
const profile = join(pi, 'sandbox/pi-sandbox.sb');
const run = realpathSync(mkdtempSync(join(root, 'test/.run-pi-launch-')));
const temp = realpathSync(execFileSync('/usr/bin/getconf', ['DARWIN_USER_TEMP_DIR'], { encoding: 'utf8' }).trim());
// Writable through the session's TMPDIR grant, outside every account home.
const scratch = realpathSync(mkdtempSync(join(temp, 'agent-guard-pi-')));
const inert = '/private/tmp/pi-sandbox-guard-unused/agent-guard-no-link';
const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
let fails = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    fails++;
    console.log(`FAIL ${name}\n     ${error.message.replaceAll('\n', '\n     ')}`);
  }
}

// The stand-in Pi: drops the injected extension flag and runs the rest.
const standIn = join(run, 'runtime', 'pi');
mkdirSync(dirname(standIn));
writeFileSync(standIn, '#!/bin/sh\nif [ "$1" = --extension ]; then shift 2; fi\nexec "$@"\n');
chmodSync(standIn, 0o755);

function account(name) {
  const base = join(run, name);
  const home = join(base, 'home with spaces');
  const bin = join(home, '.local/bin');
  const project = join(home, 'Projects/app');
  for (const d of [bin, project, join(home, '.pi/agent/extensions/pi-sandbox-guard'), join(home, '.config/pi-sandbox-guard')])
    mkdirSync(d, { recursive: true });
  execFileSync('/usr/bin/git', ['init', '-q', project]);
  const dscl = join(base, 'dscl');
  writeFileSync(dscl, `#!/bin/sh\nprintf '%s\\n' ${quote(`NFSHomeDirectory: ${home}`)}\n`);
  chmodSync(dscl, 0o755);
  for (const runtime of ['pi', 'omp']) {
    copyFileSync(join(pi, 'launchers/pi'), join(bin, runtime));
    chmodSync(join(bin, runtime), 0o755);
  }
  copyFileSync(profile, join(bin, 'pi-sandbox.sb'));
  const seam = 'typeset -r DSCL_BIN="/usr/bin/dscl"';
  const preamble = readFileSync(join(pi, 'sandbox/pi-sandbox-preamble.zsh'), 'utf8');
  assert.equal(preamble.split(seam).length, 2, 'directory-service seam must be unique');
  writeFileSync(join(bin, 'pi-sandbox-preamble.zsh'), preamble.replace(seam, () => `typeset -r DSCL_BIN=${quote(dscl)}`));
  writeFileSync(join(home, '.pi/agent/extensions/pi-sandbox-guard/index.ts'), 'export default function () {}\n');
  writeFileSync(join(home, '.config/pi-sandbox-guard/executables.conf'), `pi=${standIn}\nomp=${standIn}\n`);
  return { home, bin, project };
}

const environment = (a, env) => ({
  PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: a.home, TMPDIR: temp, PI_PROJECT: a.project, ...env,
});
// Starts a session of RUNTIME in A and runs argv in it.
function session(a, argv, { runtime = 'pi', env = {}, wrap = [] } = {}) {
  const launcher = join(a.bin, runtime);
  const [command, ...args] = [...wrap, launcher, ...argv];
  return spawnSync(command, args, { cwd: a.project, encoding: 'utf8', env: environment(a, env) });
}
const write = (a, path, options) => session(a, ['/bin/sh', '-c', 'printf x >> "$1"', 'sh', path], options);
const started = (r) => /OS sandbox ON/.test(r.stderr);
function allowed(r, what) {
  assert.ok(started(r), `${what}: session did not start:\n${r.stderr}`);
  assert.equal(r.status, 0, `${what}: denied:\n${r.stderr}`);
}
function denied(r, what) {
  assert.ok(started(r), `${what}: session did not start:\n${r.stderr}`);
  assert.notEqual(r.status, 0, `${what}: allowed`);
  assert.match(r.stderr, /Operation not permitted/, what);
}
function refused(r, what, text) {
  assert.notEqual(r.status, 0, `${what}: launched`);
  assert.ok(!started(r), `${what}: session started`);
  assert.equal(r.stdout, '', `${what}: the stand-in ran`);
  if (text) assert.match(r.stderr, text, what);
}

// The profile alone, with every parameter the preamble passes; AG_* are inert
// unless given.
function sb(params, argv) {
  const all = {
    TMPDIR: temp, ACTIVE_HOOKS: join(params.PROJECT, '.git/hooks'), PI_AGENT_STATE: join(params.HOME, '.pi/agent'),
    OMP_AGENT_STATE: `${inert}/omp-agent`, OMP_STATE_ROOT: `${inert}/omp-state`, OMP_BASE_ROOT: `${inert}/omp-base`,
    AG_CACHE_HOME: join(params.HOME, '.cache'), AG_XDG_CACHE_HOME: join(params.HOME, '.cache'), ...params,
  };
  for (const [, name] of readFileSync(profile, 'utf8').matchAll(/\(param "(AG_(?:LINK|PIN)_[A-Z0-9_]+)"\)/g)) all[name] ??= inert;
  const defines = Object.entries(all).flatMap(([k, v]) => ['-D', `${k}=${v}`]);
  return spawnSync('/usr/bin/sandbox-exec', [...defines, '-f', profile, ...argv], { encoding: 'utf8' });
}
const sbWrite = (params, path) => sb(params, ['/bin/sh', '-c', 'printf x >> "$1"', 'sh', path]);

// Difference 1's paths under the home, by the parameter that carries the link target.
const protectedFolders = {
  AG_LINK_ENGINE: 'Library/Application Support/AgentGuard',
  AG_LINK_OPENCODEGUARD: 'Library/Application Support/OpenCodeGuard',
  AG_LINK_GUARD_LIST: 'Agent Guard',
  AG_LINK_APP: 'Applications/Agent Guard.app',
  AG_LINK_OPENCODE_CONFIG: '.config/opencode',
  AG_LINK_OPENCODE: '.opencode',
  AG_LINK_CC_SAFETY_NET: '.cc-safety-net',
  AG_LINK_LAUNCH_AGENTS: 'Library/LaunchAgents',
};
const protectedFiles = {
  AG_LINK_ZSHENV: '.zshenv',
  AG_LINK_ZPROFILE: '.zprofile',
  AG_LINK_ZSHRC: '.zshrc',
  AG_LINK_ZLOGIN: '.zlogin',
  AG_LINK_PROFILE: '.profile',
  AG_LINK_BASH_PROFILE: '.bash_profile',
  AG_LINK_BASH_LOGIN: '.bash_login',
  AG_LINK_BASHRC: '.bashrc',
};

try {
  // Difference 9: node pins keep path-based config denies attached to active state.
  for (const variant of ['pi', 'pi-relocated', 'omp', 'omp-profile']) {
    const a = account(`state-${variant}`);
    const options = variant.startsWith('omp')
      ? { runtime: 'omp', env: variant === 'omp-profile' ? { OMP_PROFILE: 'work' } : {} }
      : { env: variant === 'pi-relocated' ? { PI_CODING_AGENT_DIR: join(a.home, '.pi/alternate-agent') } : {} };
    const base = join(a.home, '.omp');
    const state = variant === 'omp-profile' ? join(base, 'profiles/work') : base;
    const agent = variant.startsWith('omp') ? join(state, 'agent')
      : join(a.home, variant === 'pi-relocated' ? '.pi/alternate-agent' : '.pi/agent');
    const roots = variant.startsWith('omp') ? [...new Set([base, join(base, 'profiles'), state, agent])] : [agent];
    check(`difference 9: ${variant} prepares missing roots and preserves runtime writes`, () => {
      if (variant !== 'pi') assert.ok(!existsSync(agent), 'state root already exists');
      allowed(session(a, ['/bin/sh', '-c', 'mkdir -p "$1/sessions" && printf state > "$1/sessions/probe"', 'sh', agent], options), 'session state');
      for (const p of roots) assert.ok(existsSync(p), `root not prepared: ${p}`);
      allowed(session(a, ['/bin/mkdir', '-p', ...roots], options), 'existing root mkdir');
      const files = variant.startsWith('omp') ? [join(agent, 'agent.db'), join(state, 'stats.db'), join(base, 'install-id')]
        : [join(agent, 'run-history.json'), join(agent, 'security-events.log')];
      for (const p of files) allowed(write(a, p, options), p);
    });
    check(`difference 9: ${variant} denies direct config writes`, () => {
      denied(write(a, join(agent, variant.startsWith('omp') ? 'config.yml' : 'settings.json'), options), 'config');
      if (variant.startsWith('omp')) {
        mkdirSync(join(state, 'plugins'), { recursive: true });
        denied(write(a, join(state, 'plugins/probe.js'), options), 'plugin');
      }
    });
    check(`difference 9: ${variant} roots cannot be removed, moved or replaced`, () => {
      const replacement = join(scratch, `state-replacement-${variant}`);
      mkdirSync(replacement);
      const probe = 'import ctypes, errno, os, sys\n' +
        'libc = ctypes.CDLL(None, use_errno=True)\n' +
        'for root in sys.argv[2:]:\n' +
        '  for operation in (lambda: os.rename(root, sys.argv[1] + "-moved"), lambda: os.rmdir(root), lambda: os.symlink(sys.argv[1], root)):\n' +
        '    try: operation()\n' +
        '    except OSError as e: assert e.errno == errno.EPERM, (root, e)\n' +
        '    else: raise AssertionError("root mutation allowed: " + root)\n' +
        '  assert libc.renamex_np(root.encode(), sys.argv[1].encode(), 2) == -1\n' +
        '  assert ctypes.get_errno() == errno.EPERM, root\n';
      allowed(session(a, ['/usr/bin/python3', '-c', probe, replacement, ...roots], options), 'root mutations denied');
      for (const p of roots) assert.ok(existsSync(p), `root moved: ${p}`);
      assert.equal(readFileSync(join(agent, 'sessions/probe'), 'utf8'), 'state');
      assert.ok(!existsSync(`${replacement}-moved`), 'root renamed into writable temp');
    });
  }

  // Difference 1, in the profile: a home inside the project, so that only the
  // recorded denies stand between the session and these paths.
  {
    const project = join(run, 'profile/project');
    const home = join(project, 'home');
    for (const f of Object.values(protectedFolders)) mkdirSync(join(home, f), { recursive: true });
    mkdirSync(join(home, '.cc-safety-net/logs'), { recursive: true });
    const params = { PROJECT: project, HOME: home };
    check('difference 1: Agent Guard\'s folders and the shell startup files are write-denied', () => {
      for (const p of [...Object.values(protectedFolders).map((f) => join(f, 'probe')), ...Object.values(protectedFiles), '.cc-safety-net/rules.json']) {
        const r = sbWrite(params, join(home, p));
        assert.notEqual(r.status, 0, `allowed: ${p}`);
        assert.ok(!existsSync(join(home, p)), `created: ${p}`);
      }
    });
    check('difference 1: other files in the same folders stay writable, and so do cc-safety-net\'s logs', () => {
      for (const p of ['notes.txt', '.cc-safety-net/logs/audit.log', 'Library/Application Support/other.txt', 'Applications/Other.app', '.config/other.json'])
        assert.equal(sbWrite(params, join(home, p)).status, 0, `denied: ${p}`);
    });
    check('difference 1: each AG_LINK_* parameter write-denies the link target it names', () => {
      for (const name of [...Object.keys(protectedFolders), ...Object.keys(protectedFiles)]) {
        const target = join(project, 'targets', name);
        mkdirSync(target, { recursive: true });
        assert.notEqual(sbWrite({ ...params, [name]: target }, join(target, 'probe')).status, 0, name);
        assert.equal(sbWrite(params, join(target, 'probe')).status, 0, `${name} denied while inert`);
      }
    });
  }

  // Difference 1, through the launcher: link targets inside writable folders.
  {
    const a = account('links');
    const dotfiles = join(a.project, 'dotfiles');
    mkdirSync(dotfiles);
    writeFileSync(join(dotfiles, 'zshrc'), 'export X=1\n');
    symlinkSync(join(dotfiles, 'zshrc'), join(a.home, '.zshrc'));
    const linkedFolder = join(scratch, 'opencode home');
    mkdirSync(linkedFolder);
    symlinkSync(linkedFolder, join(a.home, '.opencode'));
    check('difference 1: a ~/.zshrc linked into the project is write-denied, directly and through the link', () => {
      denied(write(a, join(dotfiles, 'zshrc')), 'link target');
      denied(write(a, join(a.home, '.zshrc')), '~/.zshrc');
      assert.equal(readFileSync(join(dotfiles, 'zshrc'), 'utf8'), 'export X=1\n');
      allowed(write(a, join(dotfiles, 'gitconfig')), 'the rest of the project');
    });
    check('difference 1: a ~/.opencode linked into the temp folder is write-denied; the temp folder is not', () => {
      denied(write(a, join(linkedFolder, 'opencode.json')), 'link target');
      allowed(write(a, join(scratch, 'other.txt')), 'temp folder');
    });
    check('difference 1: the folder holding a linked ~/.zshrc\'s target can be neither renamed away nor swapped for a replacement', () => {
      const replacement = join(a.project, 'replacement');
      mkdirSync(replacement);
      writeFileSync(join(replacement, 'zshrc'), 'export EVIL=1\n');
      denied(session(a, ['/bin/mv', dotfiles, join(a.project, 'dotfiles-old')]), 'rename away');
      // An atomic exchange of the two folders: renamex_np with RENAME_SWAP.
      const swap = 'import ctypes, errno, sys\nlibc = ctypes.CDLL(None, use_errno=True)\n' +
        'ok = libc.renamex_np(sys.argv[1].encode(), sys.argv[2].encode(), 2) == 0\n' +
        'print("swapped" if ok else errno.errorcode[ctypes.get_errno()])\n';
      const r = session(a, ['/usr/bin/python3', '-c', swap, replacement, dotfiles]);
      assert.ok(started(r), r.stderr);
      assert.equal(r.stdout.trim(), 'EPERM', `swap: ${r.stdout}${r.stderr}`);
      assert.equal(readFileSync(join(a.home, '.zshrc'), 'utf8'), 'export X=1\n');
    });
  }
  {
    // Eight startup files linked four folders deep apiece: more folders to pin than slots.
    const a = account('many-links');
    for (const [i, f] of Object.values(protectedFiles).entries()) {
      const dir = join(scratch, 'many links', `${i}`, 'b', 'c', 'd');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'rc'), '\n');
      symlinkSync(join(dir, 'rc'), join(a.home, f));
    }
    check('difference 1: a launch with more folders to pin than the profile has slots is refused', () => {
      refused(session(a, ['/bin/echo', 'started']), 'too many pins', /parent folders to protect, more than the profile's 32/);
    });
  }

  // Difference 2.
  {
    const a = account('refusals');
    const dotfiles = join(a.home, 'Projects/dotfiles');
    for (const d of ['Agent Guard/sub', 'Applications/Agent Guard.app', '.opencode/sub', '.cc-safety-net/logs',
      'Library/Application Support/AgentGuard', 'Projects/dotfiles/opencode', '.config'])
      mkdirSync(join(a.home, d), { recursive: true });
    symlinkSync(join(dotfiles, 'opencode'), join(a.home, '.config/opencode'));
    // Difference 7 refuses .opencode and .cc-safety-net as agent config folders first.
    const refusal = /Agent Guard's protected folder|inside a protected agent config folder/;
    check('difference 2: a project that is, contains or is inside an Agent Guard folder is refused', () => {
      for (const p of ['Agent Guard', 'Agent Guard/sub', 'Applications', 'Applications/Agent Guard.app', '.opencode',
        '.opencode/sub', '.cc-safety-net', '.cc-safety-net/logs'])
        refused(session(a, ['/bin/echo', 'started'], { env: { PI_PROJECT: join(a.home, p) } }), p, refusal);
    });
    check('difference 2: a project that is or is inside the target of a linked Agent Guard folder is refused', () => {
      mkdirSync(join(dotfiles, 'opencode/sub'));
      for (const p of [join(dotfiles, 'opencode'), join(dotfiles, 'opencode/sub')])
        refused(session(a, ['/bin/echo', 'started'], { env: { PI_PROJECT: p } }), p, /it is or is inside '.*', the link target of Agent Guard's protected folder/);
    });
    check('difference 2: a project that contains such a link target starts, with the target write-denied', () => {
      const env = { PI_PROJECT: dotfiles };
      denied(write(a, join(dotfiles, 'opencode/opencode.json'), { env }), 'link target');
      allowed(write(a, join(dotfiles, 'gitconfig'), { env }), 'the rest of the project');
    });
    check('difference 2: the engine folder is still refused by pi-sandbox-guard\'s ~/Library refusal', () => {
      refused(session(a, ['/bin/echo', 'started'], { env: { PI_PROJECT: join(a.home, 'Library/Application Support/AgentGuard') } }),
        'engine folder', /broad\/system\/credential path/);
    });
    check('difference 2: other projects start', () => {
      const r = session(a, ['/bin/echo', 'started']);
      allowed(r, 'project');
      assert.equal(r.stdout, 'started\n');
    });
  }

  // Difference 3.
  const d7 = [
    ['/usr/bin/open', '--help'], ['/usr/bin/osascript', '-e', 'return 1'], ['/usr/bin/osacompile'], ['/usr/bin/codesign'],
    ['/usr/sbin/diskutil'], ['/bin/launchctl', 'version'], ['/usr/bin/sudo', '-n', '-V'],
  ];
  {
    const project = join(run, 'd7/project');
    mkdirSync(project, { recursive: true });
    const params = { PROJECT: project, HOME: join(run, 'd7/home') };
    check('difference 3: the profile denies running open, osascript, osacompile, codesign, diskutil, launchctl and sudo', () => {
      for (const argv of d7) {
        const r = sb(params, argv);
        assert.equal(r.status, 71, `${argv[0]}: exit ${r.status}`);
        assert.match(r.stderr, /execvp\(\) of .* failed: Operation not permitted/, argv[0]);
      }
      assert.equal(sb(params, ['/usr/bin/true']).status, 0, 'true');
    });
    const a = account('d7');
    check('difference 3: open and osascript are denied inside a session; other programs run', () => {
      for (const argv of d7.slice(0, 2)) {
        const r = session(a, argv);
        assert.ok(started(r), r.stderr);
        assert.notEqual(r.status, 0, `${argv[0]} ran`);
        assert.ok(r.stderr.includes(`${argv[0]}: Operation not permitted`), r.stderr);
      }
      allowed(session(a, ['/usr/bin/true']), 'true');
    });
  }

  // Difference 4.
  {
    const a = account('cache');
    const populate = (c) => {
      for (const d of ['opencode/packages/plugin', 'opencode/node_modules', 'opencode/bin', 'other'])
        mkdirSync(join(c, d), { recursive: true });
      for (const f of ['models.json', 'package.json', 'package-lock.json', 'bun.lock'])
        writeFileSync(join(c, 'opencode', f), '{}\n');
    };
    const deniedIn = (c, options) => {
      for (const p of ['opencode/packages/plugin/index.js', 'opencode/node_modules/x.js', 'opencode/bin/opencode',
        'opencode/models.json', 'opencode/models-dev.json', 'opencode/package.json', 'opencode/package-lock.json',
        'opencode/bun.lock'])
        denied(write(a, join(c, p), options), p);
      // Both destinations are writable, so only the pins stop these.
      denied(session(a, ['/bin/mv', join(c, 'opencode'), join(c, 'moved')], options), 'rename opencode');
      denied(session(a, ['/bin/mv', c, join(scratch, `moved-${basename(c)}`)], options), 'rename the cache root');
      denied(session(a, ['/bin/rm', '-r', join(c, 'opencode/packages')], options), 'remove packages');
      assert.ok(existsSync(join(c, 'opencode/packages/plugin')), 'packages removed');
    };
    const cache = join(a.home, '.cache');
    populate(cache);
    check('difference 4: OpenCode\'s package store, install metadata, bin and model catalog under ~/.cache are write-denied and pinned', () => {
      deniedIn(cache);
    });
    check('difference 4: the rest of ~/.cache, and of its opencode folder, stays writable', () => {
      for (const p of ['other/x', 'new-tool/x', 'opencode/other.txt'])
        allowed(session(a, ['/bin/sh', '-c', 'mkdir -p "$(dirname "$1")" && printf x > "$1"', 'sh', join(cache, p)]), p);
    });
    const xdg = join(scratch, 'xdg cache');
    populate(xdg);
    check('difference 4: with XDG_CACHE_HOME set, both cache roots are protected', () => {
      deniedIn(xdg, { env: { XDG_CACHE_HOME: xdg } });
      denied(write(a, join(cache, 'opencode/packages/plugin/index.js'), { env: { XDG_CACHE_HOME: xdg } }), 'default root');
      allowed(write(a, join(xdg, 'other/x'), { env: { XDG_CACHE_HOME: xdg } }), 'other');
    });
    const real = join(scratch, 'xdg-real');
    populate(real);
    symlinkSync(real, join(scratch, 'xdg-link'));
    check('difference 4: a linked XDG_CACHE_HOME is protected at its canonical path', () => {
      denied(write(a, join(real, 'opencode/bin/opencode'), { env: { XDG_CACHE_HOME: join(scratch, 'xdg-link') } }), 'bin');
    });
    const inProject = join(a.project, 'build/cache');
    populate(inProject);
    mkdirSync(join(a.project, 'docs'));
    check('difference 4: the folder above an XDG_CACHE_HOME inside the project cannot be renamed away', () => {
      const env = { XDG_CACHE_HOME: inProject };
      denied(session(a, ['/bin/mv', join(a.project, 'build'), join(a.project, 'build-old')], { env }), 'rename the parent');
      assert.ok(existsSync(join(inProject, 'opencode/packages/plugin')), 'cache root moved');
      allowed(session(a, ['/bin/mv', join(a.project, 'docs'), join(a.project, 'docs-old')], { env }), 'rename another folder');
    });
    check('difference 4: an XDG_CACHE_HOME that is missing or relative refuses the launch', () => {
      for (const value of [join(scratch, 'missing'), 'relative/cache'])
        refused(session(a, ['/bin/echo', 'started'], { env: { XDG_CACHE_HOME: value } }), value, /XDG_CACHE_HOME .* is not an existing absolute folder/);
    });
    check('differences 1 and 4 apply to OMP sessions too', () => {
      denied(write(a, join(cache, 'opencode/packages/plugin/index.js'), { runtime: 'omp' }), 'OMP');
    });
  }
  {
    const a = account('linked-cache');
    const target = join(a.project, 'cache');
    mkdirSync(join(target, 'opencode/packages/plugin'), { recursive: true });
    symlinkSync(target, join(a.home, '.cache'));
    check('difference 4: a ~/.cache linked into the project keeps OpenCode\'s cache protected at the link target', () => {
      for (const p of ['opencode/packages/plugin/index.js', 'opencode/bin/opencode', 'opencode/models.json'])
        denied(write(a, join(target, p)), p);
      denied(write(a, join(a.home, '.cache/opencode/packages/plugin/index.js')), 'through the link');
      allowed(write(a, join(target, 'other.txt')), 'the rest of the cache');
    });
  }
  {
    const a = account('fresh-cache');
    const cache = join(a.home, '.cache');
    const xdg = join(scratch, 'fresh xdg cache');
    mkdirSync(xdg);
    check('difference 4: a launch on an account without ~/.cache creates a write-denied opencode/bin', () => {
      assert.ok(!existsSync(cache), '~/.cache exists before the launch');
      denied(write(a, join(cache, 'opencode/bin/opencode')), 'bin');
      assert.ok(existsSync(join(cache, 'opencode/bin')), 'opencode/bin not created');
      allowed(write(a, join(cache, 'notes.txt')), 'a file in ~/.cache');
    });
    check('difference 4: the launch also creates opencode/bin under XDG_CACHE_HOME', () => {
      denied(write(a, join(xdg, 'opencode/bin/opencode'), { env: { XDG_CACHE_HOME: xdg } }), 'bin');
      assert.ok(existsSync(join(xdg, 'opencode/bin')), 'opencode/bin not created');
    });
  }

  // Difference 5.
  {
    const a = account('bind');
    const conf = join(a.home, '.config/pi-sandbox-guard/executables.conf');
    const untrusted = join(run, 'runtime', 'other-pi');
    copyFileSync(standIn, untrusted);
    check('difference 5: repair messages name agent-guard bind', () => {
      let r = session(a, ['/bin/echo', 'started'], { env: { PI_EXECUTABLE: untrusted } });
      refused(r, 'ambient override', /Record non-standard installs with: agent-guard bind/);
      writeFileSync(conf, `pi=${join(run, 'runtime', 'missing')}\n`);
      r = session(a, ['/bin/echo', 'started']);
      refused(r, 'stale binding', /Re-record it: agent-guard bind/);
      const inside = join(a.project, 'bin/pi');
      mkdirSync(dirname(inside));
      copyFileSync(standIn, inside);
      writeFileSync(conf, `pi=${inside}\n`);
      r = session(a, ['/bin/echo', 'started']);
      refused(r, 'binding inside the project', /agent-guard bind --pi <abs-path> --node <abs-path>/);
      assert.doesNotMatch(r.stderr, /npm run/);
    });
    check('difference 5: the extension\'s FILTER-ONLY warning names agent-guard update and agent-guard bind', () => {
      const index = JSON.stringify(join(pi, 'src/index.mjs'));
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', `(await import(${index})).default({ on() {} })`],
        { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', HOME: a.home, TMPDIR: temp } });
      assert.equal(r.status, 0, r.stderr);
      const warning = r.stderr.split('\n').find((l) => l.includes('FILTER-ONLY')) ?? '';
      assert.match(warning, /install Agent Guard \(`agent-guard update`, or the one-line installer\) and run `agent-guard bind`/);
      assert.doesNotMatch(warning, /npm run/);
    });
  }

  // Difference 7.
  {
    const a = account('opencode-config');
    for (const d of ['.opencode/agent', 'sub/.opencode', '.cc-safety-net', 'sub/.cc-safety-net', 'notes'])
      mkdirSync(join(a.project, d), { recursive: true });
    check('difference 7: OpenCode\'s project config and .cc-safety-net are write-denied anywhere in the project', () => {
      for (const p of ['.opencode/opencode.json', '.opencode/agent/review.md', 'sub/.opencode/plugin.js', 'opencode.json',
        'opencode.jsonc', 'tui.json', 'tui.jsonc', 'sub/opencode.json', '.cc-safety-net/policy.json',
        'sub/.cc-safety-net/policy.json'])
        denied(write(a, join(a.project, p)), p);
      denied(session(a, ['/bin/mkdir', join(a.project, 'notes/.cc-safety-net')]), 'create .cc-safety-net');
      denied(session(a, ['/bin/mkdir', join(a.project, 'notes/.opencode')]), 'create .opencode');
    });
    check('difference 7: other project files with similar names stay writable', () => {
      for (const p of ['opencode.md', 'notes/tui.json.bak', 'src-opencode.json.txt', '.opencoderc', 'notes/opencode.ts'])
        allowed(write(a, join(a.project, p)), p);
    });
    check('difference 7: a project inside .opencode or .cc-safety-net is refused', () => {
      for (const p of ['.opencode', '.opencode/agent', '.cc-safety-net'])
        refused(session(a, ['/bin/echo', 'started'], { env: { PI_PROJECT: join(a.project, p) } }), p,
          /inside a protected agent config folder/);
    });
  }
  // Difference 7: Seatbelt checks the resolved path, so links at OpenCode's names.
  {
    const a = account('opencode-links');
    const dotfiles = join(a.home, 'dotfiles');
    mkdirSync(join(a.project, 'config'));
    mkdirSync(join(dotfiles, 'opencode'), { recursive: true });
    writeFileSync(join(a.project, 'config/open-code.json'), '{}\n');
    writeFileSync(join(dotfiles, 'tui.json'), '{}\n');
    check('difference 7: a link at an OpenCode name to a place the session can write is refused', () => {
      for (const [name, target] of [['opencode.json', 'config/open-code.json'], ['.opencode', 'config'], ['tui.jsonc', 'config/missing.jsonc']]) {
        symlinkSync(target, join(a.project, name));
        refused(session(a, ['/bin/echo', 'started']), name, /symlinked project agent config/);
        rmSync(join(a.project, name));
      }
      mkdirSync(join(a.project, '.cc-safety-net'));
      symlinkSync('../config/open-code.json', join(a.project, '.cc-safety-net/policy.json'));
      refused(session(a, ['/bin/echo', 'started']), '.cc-safety-net/policy.json', /symlinked project agent config/);
      rmSync(join(a.project, '.cc-safety-net'), { recursive: true });
      mkdirSync(join(a.project, '.opencode'));
      symlinkSync('../config/agent-settings.json', join(a.project, '.opencode/opencode.json'));
      refused(session(a, ['/bin/echo', 'started']), '.opencode/opencode.json, missing target', /symlinked project agent config/);
      rmSync(join(a.project, '.opencode'), { recursive: true });
    });
    check('difference 7: a link at an OpenCode name to a place the session cannot write starts', () => {
      symlinkSync(join(dotfiles, 'tui.json'), join(a.project, 'tui.json'));
      symlinkSync(join(dotfiles, 'opencode'), join(a.project, '.opencode'));
      allowed(session(a, ['/bin/echo', 'started']), 'links into dotfiles');
    });
    check('difference 7: a link to a project path the profile denies by name starts, with the target write-denied', () => {
      writeFileSync(join(a.project, 'config/opencode.json'), '{}\n');
      symlinkSync('config/opencode.json', join(a.project, 'opencode.json'));
      denied(write(a, join(a.project, 'config/opencode.json')), 'named link target');
    });
  }

  // Nested launches.
  {
    const a = account('nested');
    const home = a.home;
    // macOS refuses a nested sandbox_apply under any profile with a deny rule, and on
    // some releases (macOS 15 on CI) under an allow-everything one too, so only an
    // allow-everything sandbox may let the launcher apply its own profile.
    check('nesting: Pi under a foreign enclosing sandbox refuses', () => {
      const foreign = `(version 1)(allow default)(deny file-write*)(allow file-write* (subpath "/private/tmp") (subpath "${temp}") (literal "/dev/null"))`;
      const r = session(a, ['/bin/echo', 'started'], { wrap: ['/usr/bin/sandbox-exec', '-p', foreign] });
      refused(r, `foreign sandbox: ${r.stderr}`, /sandbox_apply unavailable and no verified own-shim confinement; refusing/);
    });
    // The launcher's own sandbox_apply probe, run under the same enclosing sandbox.
    const allowAll = ['/usr/bin/sandbox-exec', '-p', '(version 1)(allow default)'];
    const nests = spawnSync(allowAll[0], [...allowAll.slice(1), ...allowAll, '/usr/bin/true']).status === 0;
    check(`nesting: Pi under an allow-everything sandbox ${nests ? 'applies its own profile' : 'refuses, as this macOS refuses nesting there'}`, () => {
      const zshrc = join(home, '.zshrc');
      assert.ok(!existsSync(zshrc), '~/.zshrc exists before the launch');
      const r = session(a, ['/bin/sh', '-c', 'printf x > "$1" && echo ran', 'sh', zshrc], { wrap: allowAll });
      if (nests) denied(r, '~/.zshrc');
      else refused(r, `allow-everything sandbox: ${r.stderr}`, /sandbox_apply unavailable and no verified own-shim confinement; refusing/);
      assert.ok(!existsSync(zshrc), '~/.zshrc written');
    });
    check('nesting: Pi under Agent Guard\'s OpenCode base template refuses', () => {
      // engine/profile.sb with the harness data left out, as an OpenCode session
      // started by engine/launch applies it.
      const template = readFileSync(join(root, 'engine/profile.sb'), 'utf8').replace(/;;@[A-Z_]+@/g, '');
      const r = session(a, ['/bin/echo', 'started'], {
        env: { AGENT_GUARD_SANDBOXED: '1' },
        wrap: ['/usr/bin/sandbox-exec', '-D', `HOME=${home}`, '-D', `DARWIN_TEMP=${temp}`, '-D', `DARWIN_CACHE=${temp}`, '-D', 'GUI=0', '-p', template],
      });
      refused(r, 'OpenCode guard', /sandbox_apply unavailable and no verified own-shim confinement; refusing/);
    });
    const inner = (runtime) => session(a, ['/bin/sh', '-c', '"$1" /bin/echo inner-started', 'sh', join(a.bin, runtime)]);
    check('nesting: Pi inside Pi passes through after its confinement probes', () => {
      const r = inner('pi');
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stderr, /existing pi-sandbox-guard confinement detected; skipping nested wrap/);
      assert.equal(r.stdout, 'inner-started\n');
    });
    check('nesting: OMP inside Pi is refused', () => {
      const r = inner('omp');
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /nested profile digest mismatch or confinement probes failed; refusing/);
      assert.equal(r.stdout, '');
    });
    check('nesting: Pi inside Pi exits when .guard-node exists (7ad441f defect, fails closed; DESIGN.md section 11)', () => {
      // The preamble returns before HOME_CANON, PROJECT and TMPDIR_CANON are set,
      // and the launcher's .guard-node check reads them under set -u.
      writeFileSync(join(home, '.pi/agent/extensions/pi-sandbox-guard/.guard-node'), '/usr/bin/true\n');
      try {
        const r = inner('pi');
        assert.notEqual(r.status, 0);
        assert.match(r.stderr, /existing pi-sandbox-guard confinement detected/);
        assert.match(r.stderr, /HOME_CANON: parameter not set/);
        assert.equal(r.stdout, '');
      } finally {
        rmSync(join(home, '.pi/agent/extensions/pi-sandbox-guard/.guard-node'));
      }
    });
    check('nesting: Agent Guard\'s OpenCode launcher inside Pi fails at its first write, to ~/Agent Guard', () => {
      const source = join(run, 'engine-source');
      mkdirSync(source);
      stage(root, source, home);
      const engine = join(home, 'Library/Application Support/AgentGuard');
      layout(source, engine);
      mkdirSync(join(home, 'Agent Guard'));
      writeFileSync(join(home, 'Agent Guard/Guard List.txt'), 'ALLOW -\nREAD ONLY -\nDENY -\n');
      const r = session(a, ['/bin/zsh', join(engine, 'current/launch'), 'cli', '--version']);
      assert.ok(started(r), r.stderr);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, /operation not permitted: .*Agent Guard\/last-launch-opencode\.log/);
      assert.ok(!existsSync(join(home, 'Agent Guard/last-launch-opencode.log')), 'launch log written');
    });
  }
} finally {
  rmSync(run, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`${fails} failure(s)`);
process.exit(fails ? 1 : 0);
