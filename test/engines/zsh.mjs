// Test adapter for the zsh engine. Import it from Node, or run it as
// `node zsh.mjs name|stage|launcher|identity|release ...` from zsh.
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

// The argv that runs the launcher of the current release in the engine folder,
// or of the release rid when given.
export function launcher(engine, rid) {
  return ['/bin/zsh', join(engine, rid ? join('releases', rid) : 'current', 'launch')];
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

// Production seam forms (design section 9.2) and their test forms. Each production
// form must occur exactly once where it is applied; scripts/check-seams.zsh checks the same forms.
const seams = {
  downloadBase: "local repo='https://github.com/ebrindley/AgentGuard'; local -a curl_proto=(--proto '=https' --proto-redir '=https')",
  testPoint: 'test_point() { : }',
  bootstrapHome: "account_home || die 'cannot resolve account home'",
  cliSearch: 'cli_search=(/opt/homebrew/bin/opencode /usr/local/bin/opencode "$home/.opencode/bin/opencode")',
  appPaths: 'app_paths=(/Applications/OpenCode.app "$home/Applications/OpenCode.app")',
  appBundleId: 'app_bundle_id=ai.opencode.desktop',
};
// The test harness looks for the CLI on PATH and in the disposable home only, and
// for the app only at ~/Applications/OpenCode.app (a fake bundle in the tests).
const harness = {
  cliSearch: 'cli_search=("$home/.opencode/bin/opencode")',
  appPaths: 'app_paths=("$home/Applications/OpenCode.app")',
  appBundleId: 'app_bundle_id=invalid.test',
};
const testPoint = 'test_point() { case ${AG_TEST_POINT:-} in ("kill:$1") kill -KILL $$ ;; ("fail:$1") return 1 ;; esac }';
const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";

function replaceOnce(file, from, to) {
  const text = readFileSync(file, 'utf8');
  assert.equal(text.split(from).length, 2, `${file}: seam must occur exactly once: ${from}`);
  writeFileSync(file, text.replace(from, () => to));
}

// Builds a test release of source into out/<tag>. scripts/release.sh --dev builds
// from the unmodified source, so its seam check sees the production forms; then the
// archive is unpacked and the seams are applied: the installer's test points, the
// home of the launcher and of account.zsh, agent-guard's download base and the
// harness's CLI and app lookup. It is repacked with release.sh's tar options and a
// new .sha256. The bootstrap is pointed at url and at home, with its test point
// enabled. No test release's installer or uninstaller runs before the account.zsh
// seam is applied: both take home from it. Returns the asset paths.
// Pending with step 5: boot time and pgrep.
export function release(source, out, { home, tag, version, url }) {
  assert.equal(tag, `v${version}`, 'release.sh names the tag v<version>');
  const dest = join(out, tag);
  const built = spawnSync('/bin/zsh', [join(source, 'scripts/release.sh'), '--dev', '--out', dest, version], { encoding: 'utf8' });
  assert.equal(built.status, 0, built.stderr);
  const name = `agent-guard-${version}`;
  const archive = join(dest, `${name}.tar.gz`);
  const unpacked = join(out, `.unpack-${tag}`);
  rmSync(unpacked, { recursive: true, force: true });
  mkdirSync(unpacked, { recursive: true });
  const run = (args, options = {}) => {
    const result = spawnSync(args[0], args.slice(1), { encoding: 'utf8', ...options });
    assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
    return result.stdout;
  };
  const entries = run(['/usr/bin/tar', '-tzf', archive]).split('\n').filter(Boolean);
  run(['/usr/bin/tar', '-xzf', archive, '-C', unpacked]);
  const tree = join(unpacked, name);
  replaceOnce(join(tree, 'profiles/opencode/install.sh'), seams.testPoint, testPoint);
  fixtureHome(join(tree, 'engine/launch'), home);
  fixtureAccount(join(tree, 'engine/account.zsh'), home);
  replaceOnce(join(tree, 'engine/agent-guard'), seams.downloadBase, `local repo=${quote(url)}; local -a curl_proto=()`);
  for (const key of Object.keys(harness)) replaceOnce(join(tree, 'profiles/opencode/harness.zsh'), seams[key], harness[key]);
  rmSync(archive);
  run(['/usr/bin/tar', '-czf', archive, '--no-xattrs', '--no-acls', '--no-fflags', '--uid', '0', '--gid', '0', '--uname', 'root', '--gname', 'wheel', '-C', unpacked, ...entries],
    { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  writeFileSync(archive + '.sha256', run(['/usr/bin/shasum', '-a', '256', `${name}.tar.gz`], { cwd: dest }));
  rmSync(unpacked, { recursive: true, force: true });
  const bootstrap = join(dest, 'install.sh');
  replaceOnce(bootstrap, seams.downloadBase, `local repo=${quote(url)}; local -a curl_proto=()`);
  replaceOnce(bootstrap, seams.bootstrapHome, `REPLY=${quote(home)}`);
  replaceOnce(bootstrap, seams.testPoint, testPoint);
  return { dir: dest, archive, sha256: archive + '.sha256', bootstrap };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'name') console.log(name);
  else if (command === 'release' && args.length === 6) {
    const [source, out, home, tag, version, url] = args;
    console.log(release(source, out, { home, tag, version, url }).dir);
  }
  else if (command === 'stage' && args.length === 3) stage(...args);
  else if (command === 'launcher' && (args.length === 1 || args.length === 2)) console.log(launcher(...args).join('\n'));
  else if (command === 'identity' && args.length === 3) {
    const found = identity(args[0], { HOME: args[1], USER: args[2] });
    console.log(`${found.home}\n${found.engine}`);
  } else {
    console.error('usage: zsh.mjs name | stage SOURCE DEST HOME | launcher ENGINE [RID] | identity SOURCE HOME USER | release SOURCE OUT HOME TAG VERSION URL');
    process.exit(2);
  }
}
