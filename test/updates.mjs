// Offline release lookup, consent and restart checks. Only disposable copies
// replace the network base, dialogs and installation transaction.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureAccount } from './fixture-home.mjs';
import { opencodeUpdateSeams } from './engines/zsh.mjs';
import { archive, bundle, feed, requirement, seams as desktopSeams, snapshot, tools } from './desktop-fixture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = realpathSync(mkdtempSync('/tmp/agentguard-updates.'));
const home = join(temp, 'home');
const engine = join(home, 'Library/Application Support/AgentGuard');
const release = join(engine, 'releases/2026.11.01-test');
mkdirSync(join(release, 'bin'), { recursive: true });
mkdirSync(join(engine, 'state'), { recursive: true });
mkdirSync(join(home, 'Agent Guard'), { recursive: true });
symlinkSync('releases/2026.11.01-test', join(engine, 'current'));
writeFileSync(join(release, 'RELEASE'), '2026.11.01-test\n');
const quote = (s) => `'${s.replaceAll("'", "'\\''")}'`;
const requests = [];
let tag = 'v2026.11.05', response = 'redirect', answer = 'Later', updateStatus = 0;
let opencodeReply = '2.4.0';
// The desktop update service's reply (a status code for a failure), the archive it serves and the delay before it does.
let desktopReply = {}, desktopZip = Buffer.alloc(0), desktopDelay = 0;
const server = createServer((req, res) => {
  requests.push(req.url);
  if (req.url.startsWith('/opencode-desktop-update?')) {
    if (typeof desktopReply === 'number') res.writeHead(desktopReply).end(); else res.end(JSON.stringify(desktopReply));
  } else if (req.url.startsWith('/files/')) {
    setTimeout(() => res.end(desktopZip), desktopDelay);
  } else if (req.url.startsWith('/opencode-update?')) {
    if (opencodeReply === 'failure') res.writeHead(503).end();
    else if (opencodeReply === 'malformed') res.end('not json');
    else res.end(opencodeReply.startsWith('{') ? opencodeReply : JSON.stringify({ channel: 'latest', name: 'cli', version: opencodeReply, metadata: { package: '@opencode/cli' } }));
  } else if (req.url === '/releases/latest') {
    if (response === 'failure') { res.writeHead(503).end(); return; }
    if (response === 'timeout') { setTimeout(() => res.end(), 10000).unref(); return; }
    res.writeHead(302, { Location: response === 'foreign' ? 'https://example.com/releases/tag/v9999' : `${base}/releases/tag/${tag}` }).end();
  } else if (req.url === `/releases/download/${tag}/install.sh`) {
    res.end(`agent_guard_bootstrap() {\n  local tag='${tag}' version='${tag.slice(1)}'\n  /usr/bin/jq -cn --args '$ARGS.positional' -- "$@" > ${quote(join(temp, 'bootstrap.json'))}\n}\n{ agent_guard_bootstrap "$@" }\n`);
  } else res.writeHead(404).end();
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const downloadBase = "local repo='https://github.com/ebrindley/AgentGuard'; local -a curl_proto=(--proto '=https' --proto-redir '=https')";
const module = join(release, 'updates.zsh');
const replaceOnce = (s, a, b) => { assert.equal(s.split(a).length, 2, a); return s.replace(a, () => b); };
let source = readFileSync(join(root, 'engine/updates.zsh'), 'utf8');
source = replaceOnce(source, "local repo='https://github.com/ebrindley/AgentGuard'", `local repo=${quote(base)}`);
source = replaceOnce(source, "local -a curl_proto=(--proto '=https' --proto-redir '=https')", 'local -a curl_proto=()');
source = source.replaceAll('/usr/bin/osascript', quote(join(temp, 'dialog')));
writeFileSync(module, source);
const opencodeModule = join(release, 'update.zsh');
const standIns = tools(temp);
writeFileSync(opencodeModule, desktopSeams(readFileSync(join(root, 'profiles/opencode/update.zsh'), 'utf8'), standIns));
opencodeUpdateSeams(opencodeModule, base);
const stamp = (value) => writeFileSync(join(engine, 'state/stamp.json'), JSON.stringify({ tag: value }));
const preference = (value) => writeFileSync(join(engine, 'state/update-check'), value);
const run = (body, input = '') => new Promise((done, reject) => {
  const child = spawn('/bin/zsh', ['-fc', `setopt no_unset extended_glob; home=${quote(home)}; engine=${quote(engine)}; source ${quote(module)}; source ${quote(join(root, 'profiles/opencode/runtime.zsh'))}; source ${quote(opencodeModule)}; ${body}`], { cwd: temp });
  let stdout = '', stderr = '';
  child.stdout.on('data', (b) => { stdout += b; }); child.stderr.on('data', (b) => { stderr += b; });
  child.on('error', reject); child.on('close', (status) => done({ status, stdout, stderr })); child.stdin.end(input);
});
const executable = (path, text) => writeFileSync(path, '#!/bin/zsh -f\n' + text, { mode: 0o755 });
const startup = (mode = 'gui', args = '', input = '') => run(`ag_update_startup ${mode} OpenCode ${quote(join(temp, 'restart'))} ${args}; exit $?`, input);
const installCalls = join(temp, 'install-calls');
executable(join(temp, 'restart'), `home=${quote(home)}; engine=${quote(engine)}; source ${quote(module)}\nag_update_startup gui OpenCode "$0" "$@" || exit $?\n/usr/bin/jq -cn --arg cwd "$PWD" --arg marker "\${AGENT_GUARD_UPDATE_RESTART:-}" --args '{cwd:$cwd,marker:$marker,args:$ARGS.positional}' -- "$@"\n`);
const helperPid = join(temp, 'helper-pid'), alertArgs = join(temp, 'alert-args'), noticeArgs = join(temp, 'notice-args');
// The window helper stub idles until stopped. The updater stub waits for it to
// start when AG_WAIT_HELPER is set, so a missed stop is visible as a live pid.
function ui() {
  executable(join(temp, 'dialog'), `if [[ $1 == -l ]]; then print -r -- $$ > ${quote(helperPid)}; exec /bin/sleep 30; fi\n` +
    `[[ "$*" == *'display dialog'* ]] && print -rl -- "$@" > ${quote(alertArgs)}\n` +
    `[[ "$*" == *'display notification'* ]] && print -rl -- "$@" > ${quote(noticeArgs)}\n` +
    `print -r -- ${quote(answer)}\n`);
  executable(join(release, 'bin/agent-guard'), `print -r -- "$*" >> ${quote(installCalls)}\n` +
    `if [[ -n \${AG_WAIT_HELPER:-} ]]; then repeat 50 { [[ -e ${quote(helperPid)} ]] && break; /bin/sleep 0.1 }; fi\nexit ${updateStatus}\n`);
}
const helperStopped = () => {
  const pid = Number(readFileSync(helperPid, 'utf8'));
  try { process.kill(pid, 0); } catch (e) { return e.code === 'ESRCH'; }
  process.kill(pid, 'SIGKILL'); return false;
};
let checks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log(`ok   ${name}`); };
try {
  stamp('v2026.11.01'); preference('on'); ui();
  await check('newer numeric stable release is available with one metadata request', async () => {
    const before = requests.length; const r = await run('ag_update_available && print -r -- "$REPLY"');
    assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), tag); assert.equal(requests.length - before, 1);
  });
  await check('equal, ahead and prerelease installations are not offered upgrades', async () => {
    for (const installed of [tag, 'v2026.12.01', 'v2026.11.01-rc.1']) { stamp(installed); assert.equal((await run('ag_update_available')).status, 1); }
    stamp('v2026.11.01');
  });
  await check('bad redirects, malformed tags and failed lookups are harmless at startup', async () => {
    for (const kind of ['foreign', 'failure']) { response = kind; assert.equal((await startup()).status, 0); }
    response = 'redirect'; const saved = tag; tag = 'v2026.11.05-rc.1'; assert.equal((await startup()).status, 0); tag = saved;
  });
  await check('lookup timeout is bounded and leaves startup successful', async () => {
    response = 'timeout'; const before = Date.now(); assert.equal((await startup()).status, 0); assert.ok(Date.now() - before < 5000); response = 'redirect';
  });
  await check('disabled, gate, help/version and restart handoffs make no request', async () => {
    const before = requests.length;
    preference('off'); assert.equal((await startup()).status, 0); preference('on');
    assert.equal((await run(`AGENT_GUARD_GATE=1; ag_update_startup gui OpenCode /unused`)).status, 0);
    assert.equal((await startup('cli', '--version')).status, 0);
    assert.equal((await startup('cli', '--help')).status, 0);
    assert.equal((await run('export AGENT_GUARD_UPDATE_RESTART=1; ag_update_startup gui OpenCode /unused; [[ -z ${AGENT_GUARD_UPDATE_RESTART:-} ]]')).status, 0);
    assert.equal(requests.length, before);
  });
  await check('declining and headless launches never run the updater', async () => {
    assert.equal((await startup()).status, 0);
    const r = await startup('cli'); assert.equal(r.status, 0); assert.equal(r.stdout, ''); assert.match(r.stderr, /is available/);
    assert.equal(requests.filter((p) => p.includes('/download/')).length, 0);
  });
  await check('accepted upgrade installs the offered tag and restarts once with cwd and literal arguments', async () => {
    answer = 'Update'; ui(); const before = requests.length; rmSync(helperPid, { force: true });
    const r = await run(`export AG_WAIT_HELPER=1; ag_update_startup gui OpenCode ${quote(join(temp, 'restart'))} 'a project' '--prompt' 'a; $literal' '雪'; exit $?`);
    assert.equal(r.status, 0, r.stderr);
    const alert = readFileSync(alertArgs, 'utf8');
    assert.match(alert, /buttons \{"Later", "Update"\} default button "Update" cancel button "Later"/);
    assert.ok(alert.includes('display dialog (item 2 of argv) with title "Agent Guard"'));
    assert.ok(alert.endsWith('An update is available: 2026.11.05.\nYou have 2026.11.01.\n'));
    assert.ok(readFileSync(noticeArgs, 'utf8').endsWith('Agent Guard updated to 2026.11.05.\n'));
    assert.ok(helperStopped());
    assert.deepEqual(JSON.parse(r.stdout), { cwd: temp, marker: '', args: ['a project', '--prompt', 'a; $literal', '雪'] });
    assert.equal(requests.length - before, 1);
    assert.equal(readFileSync(installCalls, 'utf8').trim(), `update --to ${tag} --no-prompt`);
  });
  await check('failed accepted installation stops without relaunching', async () => {
    updateStatus = 1; answer = 'Update'; ui(); rmSync(helperPid, { force: true });
    const r = await run(`export AG_WAIT_HELPER=1; ag_update_startup gui OpenCode ${quote(join(temp, 'restart'))}; exit $?`);
    assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.ok(helperStopped());
    updateStatus = 0;
  });
  // Treat stdin and stderr as terminals for the rest of the file.
  source = replaceOnce(source, '[[ -t 0 && -t 2 ]]', 'true');
  writeFileSync(module, source);
  await check('terminal offer updates on an empty answer or yes and not on no', async () => {
    const calls = () => readFileSync(installCalls, 'utf8').split('\n').length;
    for (const [input, updates] of [['\n', true], ['Yes\n', true], ['n\n', false], ['maybe\n', false], ['', false]]) {
      ui(); const before = calls(); const r = await startup('cli', '', input);
      assert.match(r.stderr, /Agent Guard 2026\.11\.05 is available\. You have 2026\.11\.01\.\nUpdate now\? \[Y\/n\] /);
      assert.equal(calls() - before, updates ? 1 : 0, JSON.stringify(input));
      if (updates) assert.match(r.stderr, /Agent Guard updated to 2026\.11\.05\./);
    }
  });

  await check('another product supplies its own lookup, command and sentence and the offer returns to its caller', async () => {
    ui();
    const other = (lookup, rule = '') => `ag_lookup_other() { reply=(${lookup}); }; ag_run_other() { print -r -- "ran $1"; reply=(done); }; typeset -A other=(name Other lookup ag_lookup_other run ag_run_other log ${quote(join(temp, 'other.log'))} window_label Updating note 'Extra sentence.' same_major '${rule}'); ag_update_offer cli other; print -r -- "status $?"`;
    const r = await run(other('1.2.0 1.3.0'), 'y\n');
    assert.equal(r.stderr, 'Other 1.3.0 is available. You have 1.2.0.\nExtra sentence.\nUpdate now? [Y/n] Other updated to 1.3.0.\n');
    assert.equal(r.stdout, 'ran 1.3.0\nstatus 2\n');
    for (const [reply, rule, text] of [['1.2.0 2.0.0', 'same-major', ''], ['1.2.0 2.0.0', '', 'ran 2.0.0\n']]) {
      const s = await run(other(reply, rule), 'y\n');
      assert.equal(s.stdout, `${text}status ${text ? 2 : 0}\n`, reply + rule);
    }
  });

  // OpenCode as a product. opencode_upgrade is the launcher's; here it only records.
  const upgradeCalls = join(temp, 'upgrade-calls');
  const installerCli = join(home, '.opencode/bin/opencode');
  const npmCli = join(temp, 'npm/lib/node_modules/@opencode/cli/bin/opencode');
  for (const path of [installerCli, npmCli]) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, ''); }
  mkdirSync(join(temp, 'npm/bin')); symlinkSync('../lib/node_modules/@opencode/cli/bin/opencode', join(temp, 'npm/bin/opencode'));
  mkdirSync(join(temp, 'link')); symlinkSync(installerCli, join(temp, 'link/opencode'));
  const offer = (mode = 'cli', { version = '2.3.0', cli = installerCli, upgrade = 0, extra = '' } = {}, input = 'y\n') => run(
    `cli=${quote(cli)}; opencode_version=${quote(version)}; opencode_upgrade() { print -r -- "upgrade $1"; print -r -- "$1" >> ${quote(upgradeCalls)}; return ${upgrade}; }; ${extra}; opencode_update_offer ${mode} ${quote(cli)}; print -r -- "status $?"`, input);
  const upgrades = () => { try { return readFileSync(upgradeCalls, 'utf8'); } catch { return ''; } };
  const bundleCli = '/Applications/OpenCode.app/Contents/Resources/opencode-cli';
  await check('only stable OpenCode 2 in the installer or an npm global location is eligible', async () => {
    const layouts = new Map([
      [installerCli, true], [join(temp, 'link/opencode'), true], [join(temp, 'npm/bin/opencode'), true], [npmCli, true],
      [join(temp, 'volta/tools/image/packages/@opencode/cli/lib/node_modules/@opencode/cli/bin/opencode'), false],
      [join(temp, 'mise/installs/npm-opencode-cli/2.3.0/lib/node_modules/@opencode/cli/bin/opencode'), false],
      [join(temp, 'pnpm/global/5/node_modules/@opencode/cli/bin/opencode'), false],
      [join(home, '.bun/install/global/node_modules/@opencode/cli/bin/opencode'), false],
      [join(home, '.yarn/bin/opencode'), false], ['/opt/homebrew/Cellar/opencode/2.3.0/bin/opencode', false], ['/usr/local/bin/opencode', false],
      [bundleCli, false], [join(temp, 'npm/lib/node_modules/@opencode/cli/opencode'), false], ['', false],
    ]);
    for (const [path, eligible] of layouts) {
      const r = await run(`opencode_update_eligible ${quote(path)} 2.3.0; print -r -- $?`);
      assert.equal(r.stdout, eligible ? '0\n' : '1\n', path);
    }
    // The installer's location linked to the app's bundled CLI is the app's.
    const linked = join(temp, 'linked-home');
    mkdirSync(join(linked, '.opencode/bin'), { recursive: true }); mkdirSync(join(linked, 'OpenCode.app/Contents/Resources'), { recursive: true });
    writeFileSync(join(linked, 'OpenCode.app/Contents/Resources/opencode-cli'), '');
    symlinkSync(join(linked, 'OpenCode.app/Contents/Resources/opencode-cli'), join(linked, '.opencode/bin/opencode'));
    assert.equal((await run(`home=${quote(linked)}; opencode_update_eligible ${quote(join(linked, '.opencode/bin/opencode'))} 2.3.0; print -r -- $?`)).stdout, '1\n');
    for (const version of ['1.18.33', '0.0.0-dev-123', '2.3.0-rc.1', '2.3', '3.0.0', '']) {
      assert.equal((await run(`opencode_update_eligible ${quote(installerCli)} ${quote(version)}; print -r -- $?`)).stdout, '1\n', version);
    }
  });
  await check('a newer same-major OpenCode is offered with its note and an accepted offer upgrades and returns 2', async () => {
    opencodeReply = '2.4.0'; const before = requests.length;
    const r = await offer();
    assert.equal(r.stderr, "OpenCode 2.4.0 is available. You have 2.3.0.\nThe update runs without Agent Guard's protection.\nUpdate now? [Y/n] OpenCode updated to 2.4.0.\n");
    assert.equal(r.stdout, 'upgrade 2.4.0\nstatus 2\n');
    assert.deepEqual(requests.slice(before), ['/opencode-update?current=2.3.0']);
    assert.equal(upgrades(), '2.4.0\n');
    rmSync(upgradeCalls);
    assert.equal((await offer('cli', { cli: join(temp, 'npm/bin/opencode') })).stdout, 'upgrade 2.4.0\nstatus 2\n');
    rmSync(upgradeCalls);
  });
  await check('equal, older and next-major OpenCode versions make no offer', async () => {
    for (const offered of ['2.3.0', '2.2.9', '3.0.0']) {
      opencodeReply = offered; const r = await offer();
      assert.equal(r.stdout, 'status 0\n', offered); assert.equal(r.stderr, '', offered);
    }
    assert.equal(upgrades(), '');
  });
  await check('a failed, malformed or non-numeric OpenCode lookup makes no offer', async () => {
    for (const reply of ['failure', 'malformed', '{"name":"cli"}', '{"version":2}', '{"version":"2.4.0-beta.1"}', '{"version":"v2.4.0"}', '{"version":"2.4"}']) {
      opencodeReply = reply; const r = await offer();
      assert.equal(r.stdout, 'status 0\n', reply); assert.equal(r.stderr, '', reply);
    }
    assert.equal(upgrades(), '');
  });
  await check('declining, ineligible installations and the update-check preference make no OpenCode upgrade', async () => {
    opencodeReply = '2.4.0';
    for (const input of ['n\n', 'maybe\n', '']) {
      const r = await offer('cli', {}, input); assert.equal(r.stdout, 'status 0\n'); assert.match(r.stderr, /is available/);
    }
    let before = requests.length;
    for (const options of [{ cli: '/opt/homebrew/Cellar/opencode/2.3.0/bin/opencode' }, { cli: bundleCli }, { version: '1.18.33' }, { version: '0.0.0-dev-123' }]) {
      const r = await offer('cli', options); assert.equal(r.stdout, 'status 0\n'); assert.equal(r.stderr, '');
    }
    assert.equal(requests.length, before);
    preference('off'); const r = await offer(); preference('on');
    assert.equal(r.stdout, 'status 0\n'); assert.equal(r.stderr, ''); assert.equal(requests.length, before);
    assert.equal(upgrades(), '');
  });
  await check('a failing OpenCode upgrade returns 1 without the success message', async () => {
    opencodeReply = '2.4.0'; const r = await offer('cli', { upgrade: 1 });
    assert.equal(r.stdout, 'upgrade 2.4.0\nstatus 1\n'); assert.doesNotMatch(r.stderr, /updated to/);
    rmSync(upgradeCalls);
  });
  await check('the desktop offer shows the note, logs the upgrade and stops its window', async () => {
    answer = 'Update'; ui(); rmSync(helperPid, { force: true }); opencodeReply = '2.4.0';
    const log = join(home, 'Agent Guard/last-opencode-update.log');
    // The recording upgrade waits for the window helper to start, as the updater stub does.
    const wait = `opencode_upgrade() { repeat 50 { [[ -e ${quote(helperPid)} ]] && break; /bin/sleep 0.1 }; print -r -- "upgrade $1" }`;
    const r = await offer('gui', { extra: wait }, '');
    assert.equal(r.stdout, 'status 2\n', r.stderr);
    assert.ok(readFileSync(alertArgs, 'utf8').endsWith("An update is available: 2.4.0.\nYou have 2.3.0.\nThe update runs without Agent Guard's protection.\n"));
    assert.ok(readFileSync(alertArgs, 'utf8').includes('with title "OpenCode"'));
    assert.ok(readFileSync(noticeArgs, 'utf8').endsWith('OpenCode updated to 2.4.0.\n'));
    assert.equal(readFileSync(log, 'utf8'), 'upgrade 2.4.0\n');
    assert.ok(helperStopped());
    answer = 'Later'; ui();
  });
  await check('an installed update hands the offered version back in REPLY, after a terminal or a desktop run', async () => {
    opencodeReply = '2.4.0'; answer = 'Update'; ui();
    // The desktop run leaves the progress window's script in REPLY.
    for (const mode of ['cli', 'gui']) {
      const s = await run(`cli=${quote(installerCli)}; opencode_version=2.3.0; opencode_upgrade() { :; }; opencode_update_offer ${mode} >/dev/null 2>&1; print -r -- "$? $REPLY"`, 'y\n');
      assert.equal(s.stdout, '2 2.4.0\n', `${mode}: ${s.stderr}`);
    }
    answer = 'Later'; ui();
  });
  await check('opencode_major leaves the full version it parsed and keeps its result', async () => {
    const sandbox = join(temp, 'sandbox'); executable(sandbox, 'shift 2\nexec "$@"\n');
    const probe = (output) => { const cli = join(temp, 'fake-opencode'); executable(cli, `print -r -- ${quote(output)}\n`);
      return run(`sandbox=${quote(sandbox)}; fail() { print -r -- "fail: $*"; exit 3 }; source ${quote(join(root, 'profiles/opencode/runtime.zsh'))}; opencode_version=before; opencode_major ${quote(cli)}; print -r -- "$REPLY $opencode_version"`); };
    for (const [output, expected] of [['v2.3.0', '2 2.3.0'], ['opencode v2.3.0', '2 2.3.0'], ['1.18.33', '1 1.18.33'], ['2.4.0-rc.1\n', '2 2.4.0-rc.1']]) {
      assert.equal((await probe(output)).stdout, `${expected}\n`, output);
    }
    for (const output of ['garbage', '0.0.0-dev-123', '3.0.0']) {
      const r = await probe(output); assert.equal(r.status, 3, output); assert.match(r.stdout, /^fail: /);
    }
  });

  // OpenCode.app as a product. The installed app is a stand-in bundle in the disposable
  // home; codesign and spctl are stand-ins that read the facts the bundle holds.
  const appPath = join(home, 'Applications/OpenCode.app');
  const appParent = dirname(appPath);
  const appLog = join(home, 'Agent Guard/last-opencode-update.log');
  mkdirSync(join(temp, 'build'), { recursive: true });
  const installApp = (options = {}) => {
    mkdirSync(appParent, { recursive: true });
    chmodSync(appParent, 0o755);
    rmSync(appPath, { recursive: true, force: true });
    bundle(appPath, { files: { 'Contents/Resources/payload': 'old' }, ...options });
    return snapshot(appPath);
  };
  // The archive and the service's reply for a build; feedOptions overrides what the reply says of it.
  const publish = (version, options = {}, feedOptions = {}, name) => {
    const built = archive(join(temp, 'build'), { version, files: { 'Contents/Resources/payload': 'new' }, ...options }, name);
    desktopZip = built.body;
    desktopReply = feed(base, version, { ...built, ...feedOptions });
  };
  const desktop = (extra = '', args = '') => run(`app=${quote(appPath)}; ${extra}; opencode_desktop_offer gui ${args}; print -r -- "status $?"`);
  const desktopRequests = (before) => requests.slice(before);
  const unchanged = (before, why) => { assert.deepEqual(snapshot(appPath), before, why); assert.deepEqual(readdirSync(appParent), ['OpenCode.app'], why); };
  await check('the desktop build is named from the executable\'s Mach-O header', async () => {
    const exe = join(temp, 'exe');
    for (const [header, want] of [['cffaedfe0c000001', 'arm64'], ['cffaedfe0c00000100000000', 'arm64'], ['cffaedfe07000001', 'x64'], ['cffaedfe0c000002', ''], ['cafebabe00000002', ''], ['2321202f62696e2f', ''], ['', '']]) {
      writeFileSync(exe, Buffer.from(header, 'hex'));
      assert.equal((await run(`opencode_desktop_arch ${quote(exe)} && print -r -- "$REPLY"`)).stdout.trim(), want, header);
    }
    assert.equal((await run(`opencode_desktop_arch ${quote(join(temp, 'missing'))}; print -r -- $?`)).stdout, '1\n');
  });
  await check('an app that is a link, in a folder the operator cannot write, a prerelease, universal or badly signed gets no desktop lookup', async () => {
    publish('2.4.0'); answer = 'Update'; ui();
    const cases = [
      ['a link', () => { installApp(); renameSync(appPath, join(temp, 'real.app')); symlinkSync(join(temp, 'real.app'), appPath); }],
      ['an unwritable folder', () => { installApp(); chmodSync(appParent, 0o555); }],
      ['a prerelease', () => installApp({ version: '2.3.0-rc.1' })],
      ['a version of two parts', () => installApp({ version: '2.3' })],
      ['a universal executable', () => { installApp(); writeFileSync(join(appPath, 'Contents/MacOS/AgFakeApp'), Buffer.from('cafebabe00000002', 'hex')); }],
      ['a bad signature', () => installApp({ files: { 'Contents/badsig': '' } })],
      ['no Team Identifier', () => installApp({ who: 'not set' })],
    ];
    for (const [name, setup] of cases) {
      setup(); const before = requests.length;
      const r = await desktop();
      chmodSync(appParent, 0o755); rmSync(join(temp, 'real.app'), { recursive: true, force: true });
      assert.equal(r.stdout, 'status 0\n', name); assert.deepEqual(desktopRequests(before), [], name);
    }
  });
  await check('an unusable desktop reply, an archive outside the update service or a version that is not newer within the major makes no offer', async () => {
    const before = installApp(); const start = requests.length;
    const foreign = ['http://localhost:' + base.split(':')[2] + '/files/a.zip', base + '.example/files/a.zip', base + '@example.test/files/a.zip', '/files/a.zip', ''];
    const cases = [
      ...foreign.map((url) => [`the address ${url}`, '2.4.0', { url }]),
      ['a malformed hash', '2.4.0', { sha256: 'abc' }], ['a hash that is not hexadecimal', '2.4.0', { sha256: 'g'.repeat(64) }],
      ['a size that is not a number', '2.4.0', { size: '1e9' }], ['no size', '2.4.0', { size: undefined }],
      ['the next major', '3.0.0', {}], ['the installed version', '2.3.0', {}], ['an older version', '2.2.9', {}],
    ];
    for (const [name, version, options] of cases) {
      publish(version, {}, options);
      const r = await desktop(); assert.equal(r.stdout, 'status 0\n', name);
      assert.equal(requests.slice(start).filter((u) => u.startsWith('/files/')).length, 0, name);
      assert.equal(r.stderr, '', name);
    }
    publish('2.4.0'); desktopReply = { ...desktopReply, metadata: { files: {} } };
    assert.equal((await desktop()).stdout, 'status 0\n');
    for (const reply of [503, { channel: 'latest' }, { version: '2.4.0-rc.1' }]) { desktopReply = reply; assert.equal((await desktop()).stdout, 'status 0\n'); }
    assert.equal(requests.slice(start).filter((u) => u.startsWith('/files/')).length, 0);
    unchanged(before);
  });
  await check('update-check off, a nested launch and --version make no desktop lookup', async () => {
    publish('2.4.0'); installApp(); const before = requests.length;
    preference('off'); assert.equal((await desktop()).stdout, 'status 0\n'); preference('on');
    assert.equal((await desktop('export AGENT_GUARD_GATE=1')).stdout, 'status 0\n');
    assert.equal((await desktop('', '--version')).stdout, 'status 0\n');
    assert.deepEqual(desktopRequests(before), []);
  });
  await check('declining the desktop update changes nothing and downloads nothing', async () => {
    answer = 'Later'; ui(); const before = installApp(); const start = requests.length;
    const r = await desktop();
    assert.equal(r.stdout, 'status 0\n'); assert.deepEqual(desktopRequests(start), ['/opencode-desktop-update?current=2.3.0']);
    unchanged(before);
  });
  await check('an accepted desktop update replaces the app, shows the dialog and window, logs and cleans up', async () => {
    publish('2.4.0'); answer = 'Update'; ui(); installApp(); rmSync(helperPid, { force: true }); desktopDelay = 300; const start = requests.length;
    const r = await desktop();
    assert.equal(r.stdout, 'status 2\n', r.stderr);
    const alert = readFileSync(alertArgs, 'utf8');
    assert.ok(alert.includes('with title "OpenCode"'));
    assert.ok(alert.endsWith("An update is available: 2.4.0.\nYou have 2.3.0.\nThe update runs without Agent Guard's protection.\n"));
    assert.ok(readFileSync(noticeArgs, 'utf8').endsWith('OpenCode updated to 2.4.0.\n'));
    assert.deepEqual(desktopRequests(start), ['/opencode-desktop-update?current=2.3.0', '/files/opencode-desktop-mac-arm64.zip']);
    assert.match(readFileSync(join(appPath, 'Contents/Info.plist'), 'utf8'), /<string>2\.4\.0<\/string>/);
    assert.equal(readFileSync(join(appPath, 'Contents/Resources/payload'), 'utf8'), 'new');
    assert.deepEqual(readdirSync(appParent), ['OpenCode.app']);
    assert.equal(readFileSync(appLog, 'utf8'), '');
    assert.ok(helperStopped());
    desktopDelay = 0;
  });
  await check('a download slower than the lookup limit still completes', async () => {
    publish('2.4.0'); installApp(); desktopDelay = 2500;
    const r = await desktop(); desktopDelay = 0;
    assert.equal(r.stdout, 'status 2\n', r.stderr);
  });
  await check('every failed check leaves the installed app as it was and says why in the log', async () => {
    const cases = [
      ['a wrong SHA-256', () => publish('2.4.0', {}, { sha256: '0'.repeat(64) }), /does not match the SHA-256/],
      ['a download larger than announced', () => publish('2.4.0', { files: { 'Contents/Resources/payload': randomBytes(2 << 20) } }, { size: 10 }), /the download failed/],
      ['an address the server does not have', () => publish('2.4.0', {}, { url: base + '/missing.zip' }), /the download failed/],
      ['something that is not an archive', () => { publish('2.4.0'); desktopZip = Buffer.from('not a zip'); desktopReply.metadata.files['opencode-desktop-mac-arm64.zip'] = { url: base + '/files/a.zip', sha256: createHash('sha256').update(desktopZip).digest('hex'), size: 9 }; }, /not a readable archive/],
      ['an archive holding another folder', () => publish('2.4.0', {}, {}, 'Other.app'), /does not hold exactly OpenCode\.app/],
      ['another bundle ID', () => publish('2.4.0', { id: 'ai.example.other' }), /CFBundleIdentifier is ai\.example\.other/],
      ['another executable name', () => publish('2.4.0', { exec: 'Other' }), /CFBundleExecutable is Other/],
      ['another version than offered', () => publish('2.4.0', { version: '2.4.1' }), /new app is version 2\.4\.1, not 2\.4\.0/],
      ['another developer', () => publish('2.4.0', { who: 'OTHER00000', dr: requirement(undefined, 'OTHER00000') }), /not signed by team TEAM123456/],
      ['another designated requirement', () => publish('2.4.0', { dr: requirement('ai.example.other') }), /does not satisfy the installed app's designated requirement/],
      ['a signature that does not verify', () => publish('2.4.0', { files: { 'Contents/badsig': '' } }), /does not satisfy the installed app's designated requirement/],
      ['a Gatekeeper refusal', () => publish('2.4.0', { files: { 'Contents/rejected': '' } }), /Gatekeeper does not accept the new app/],
    ];
    for (const [name, setup, reason] of cases) {
      const before = installApp(); setup();
      const r = await desktop();
      assert.equal(r.stdout, 'status 1\n', name); assert.doesNotMatch(r.stderr, /updated to/, name);
      assert.match(readFileSync(appLog, 'utf8'), new RegExp(`^OpenCode update stopped: .*${reason.source}`), name);
      unchanged(before, name);
    }
  });
  const moves = (failing) => { // a mv that fails on the calls numbered in failing
    const counter = join(temp, 'mv-count'); writeFileSync(counter, '0');
    executable(join(temp, 'mv'), `n=$(( $(<${quote(counter)}) + 1 )); print -r -- $n > ${quote(counter)}\n[[ ",${failing}," == *",$n,"* ]] && exit 1\nexec /bin/mv "$@"\n`);
    writeFileSync(join(temp, 'update-mv.zsh'), readFileSync(opencodeModule, 'utf8').replaceAll('/bin/mv', quote(join(temp, 'mv'))));
    return `source ${quote(join(temp, 'update-mv.zsh'))}`;
  };
  await check('a failed second move puts the old app back, and an old app that cannot be put back is kept', async () => {
    publish('2.4.0'); let before = installApp();
    const r = await desktop(moves('2'));
    assert.equal(r.stdout, 'status 1\n'); assert.match(readFileSync(appLog, 'utf8'), /^OpenCode update stopped: cannot move the new OpenCode\.app into place/);
    unchanged(before);
    installApp();
    const kept = await desktop(moves('2,3,4'));
    assert.equal(kept.stdout, 'status 1\n'); assert.equal(existsSync(appPath), false);
    const [staging] = readdirSync(appParent); assert.match(staging, /^\.opencode-update\./);
    assert.match(readFileSync(appLog, 'utf8'), /the previous OpenCode\.app is kept in /);
    assert.equal(readFileSync(join(appParent, staging, 'old/Contents/Resources/payload'), 'utf8'), 'old');
    rmSync(join(appParent, staging), { recursive: true });
  });
  await check('an old app that cannot be removed after the swap is not a failed update', async () => {
    installApp({ files: { 'Contents/locked/file': 'x' } }); chmodSync(join(appPath, 'Contents/locked'), 0o500);
    const r = await desktop();
    assert.equal(r.stdout, 'status 2\n', r.stderr);
    assert.match(readFileSync(join(appPath, 'Contents/Info.plist'), 'utf8'), /<string>2\.4\.0<\/string>/);
    const left = readdirSync(appParent).filter((n) => n !== 'OpenCode.app');
    assert.equal(left.length, 1);
    chmodSync(join(appParent, left[0], 'old/Contents/locked'), 0o700); rmSync(join(appParent, left[0]), { recursive: true });
  });
  await check('the launcher\'s desktop offer stops on a failed update or another version and reads the executable again after an update', async () => {
    publish('2.4.0'); installApp();
    const launch = (extra) => run(`app=${quote(appPath)}; mode=gui; main=before; fail() { print -r -- "fail: $*"; exit 3 }; ${extra}; opencode_desktop_launch_offer; print -r -- "main=$main"`);
    let r = await launch('opencode_desktop_run() { return 1 }');
    assert.equal(r.status, 3); assert.equal(r.stdout, `fail: the OpenCode update failed and the app was not changed. Details: ${appLog}\n`);
    r = await launch('opencode_desktop_run() { :; }');
    assert.equal(r.status, 3); assert.equal(r.stdout, 'fail: the OpenCode update did not install the version offered: expected 2.4.0, found 2.3.0.\n');
    r = await launch('');
    assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, 'main=AgFakeApp\n');
    answer = 'Later'; ui(); installApp();
    assert.equal((await launch('')).stdout, 'main=before\n');
  });

  await check('Pi and OMP restart through their shim with the saved peer PATH, cwd and arguments', async () => {
    // Keep the real shim and startup preamble through the update hook. Replace
    // account/runtime/probe inputs and stop before unrelated policy construction.
    updateStatus = 0; ui();
    const bin = join(home, '.local/bin'); mkdirSync(bin, { recursive: true });
    const agent = join(temp, 'pi-agent');
    executable(agent, `/usr/bin/jq -cn --arg cwd "$PWD" --arg peers "$AGENT_GUARD_PEER_PATH" --arg marker "\${AGENT_GUARD_UPDATE_RESTART:-}" --args '{cwd:$cwd,peers:$peers,marker:$marker,args:$ARGS.positional}' -- "$@"\n`);
    let preamble = readFileSync(join(root, 'profiles/pi/sandbox/pi-sandbox-preamble.zsh'), 'utf8');
    const end = preamble.indexOf('# fail-closed prerequisites (absolute path; do not trust'); assert.ok(end > 0);
    preamble = preamble.slice(0, end);
    preamble = replaceOnce(preamble, 'typeset -r DSCL_BIN="/usr/bin/dscl"', `fixture_dscl() { print -r -- ${quote('NFSHomeDirectory: ' + home)}; }; typeset -r DSCL_BIN=fixture_dscl`);
    preamble = replaceOnce(preamble, 'typeset -r SANDBOX_EXEC="/usr/bin/sandbox-exec"', 'typeset -r SANDBOX_EXEC="/usr/bin/true"');
    preamble = replaceOnce(preamble, '\nresolve_agent_executable\n', `\nPI_LAUNCH_VECTOR=(${quote(agent)})\n`);
    writeFileSync(join(bin, 'pi-sandbox-preamble.zsh'), preamble + '\nreturn 0\n');
    mkdirSync(join(bin, 'pi-sandbox-guard-extension')); writeFileSync(join(bin, 'pi-sandbox-guard-extension/index.ts'), '');
    const originalPath = `${temp}/custom-peers:/usr/bin:/bin`;
    for (const runtime of ['pi', 'omp']) {
      const shim = join(bin, runtime); executable(shim, readFileSync(join(root, 'profiles/pi/launchers/pi'), 'utf8'));
      const before = requests.length;
      const r = await run(`unset AGENT_GUARD_PEER_PATH; export PATH=${quote(originalPath)}; exec /bin/zsh -f ${quote(shim)} '--prompt' 'a; $literal'`, 'y\n');
      assert.equal(r.status, 0, r.stderr);
      const result = JSON.parse(r.stdout);
      assert.equal(result.cwd, temp); assert.equal(result.peers, originalPath); assert.equal(result.marker, '');
      assert.deepEqual(result.args.slice(2), ['--prompt', 'a; $literal']);
      assert.match(r.stderr, /Agent Guard updated to 2026\.11\.05\./); assert.equal(requests.length - before, 1);
    }
  });

  // Exercise the actual command parser and pinned bootstrap selection, replacing
  // only transaction ownership in this isolated command copy.
  copyFileSync(join(root, 'engine/account.zsh'), join(release, 'account.zsh'));
  fixtureAccount(join(release, 'account.zsh'), home);
  let cli = readFileSync(join(root, 'engine/agent-guard'), 'utf8');
  cli = replaceOnce(cli, downloadBase, `local repo=${quote(base)}; local -a curl_proto=()`);
  const start = cli.indexOf('load_installer() {'), end = cli.indexOf('\n}\n', start) + 3;
  cli = cli.slice(0, start) + `load_installer() {\n stamp="$engine/state/stamp.json"\n ag_probe() { :; }; ag_lock() { :; }; ag_unlock() { :; }; ag_recover() { :; }; ag_maintenance() { :; }; ag_pending() { REPLY=; return 1; }\n}\n` + cli.slice(end);
  const command = join(temp, 'command');
  writeFileSync(join(release, 'bin/agent-guard'), cli);
  executable(command, `exec /bin/zsh -f ${quote(join(release, 'bin/agent-guard'))} "$@"\n`);
  const invoke = (args) => run(`${quote(command)} ${args}`);
  await check('preference persists and explicit check ignores it', async () => {
    assert.equal((await invoke('update-check off')).status, 0);
    assert.equal((await invoke('update-check')).stdout.trim(), 'off');
    const before = requests.length; const r = await invoke('update --check'); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /is available/); assert.equal(requests.length - before, 1);
  });
  await check('pinned updater downloads only the offered tag and forwards quiet completion', async () => {
    const before = requests.length; const r = await invoke(`update --to ${tag} --no-prompt`); assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(requests.slice(before), [`/releases/download/${tag}/install.sh`]);
    assert.deepEqual(JSON.parse(readFileSync(join(temp, 'bootstrap.json'), 'utf8')), ['--update', '--no-prompt']);
  });
  await check('pinned update does not replace a concurrent newer installation', async () => {
    stamp('v2026.12.01'); const r = await invoke(`update --to ${tag}`); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /not older/); stamp('v2026.11.01');
  });
  await check('pinned current updates apply explicit setup options', async () => {
    stamp(tag);
    for (const flags of [['--restore-edit-permissions'], ['--approval-preference', 'auto'], ['--restore-edit-permissions', '--approval-preference', 'auto']]) {
      const r = await invoke(`update --to ${tag} ${flags.join(' ')}`);
      assert.equal(r.status, 0, r.stderr);
      assert.deepEqual(JSON.parse(readFileSync(join(temp, 'bootstrap.json'), 'utf8')), ['--update', ...flags]);
    }
    stamp('v2026.11.01');
  });
  await check('pinned older or incomparable updates refuse unapplied setup options', async () => {
    const before = readFileSync(join(temp, 'bootstrap.json'), 'utf8');
    for (const installed of ['v2026.12.01', 'v2026.11.09-rc.1', 'dev']) {
      stamp(installed);
      const r = await invoke(`update --to ${tag} --approval-preference auto`);
      assert.equal(r.status, 1, installed);
      assert.match(r.stderr, /Requested setup options were not applied/);
      assert.equal(readFileSync(join(temp, 'bootstrap.json'), 'utf8'), before);
    }
    stamp('v2026.11.01');
  });
  await check('the window helper runs the real script until the launcher process ends', async () => {
    // A call that throws ends the helper at once with a nonzero status.
    const began = Date.now();
    const r = await run(`source ${quote(join(root, 'engine/updates.zsh'))}; ag_update_window_source; /bin/sleep 2 & /usr/bin/osascript -l JavaScript -e "$REPLY" ${quote(join(temp, 'window.log'))} $! 'Agent Guard' 'Downloading update…' 'Preparing update…' 'Installing update…'; exit $?`);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(Date.now() - began >= 1500, 'the helper ended before the process it watches');
  });
  console.log(`${checks} update checks passed; fixtures: ${temp}`);
} finally {
  server.closeAllConnections(); await new Promise((done) => server.close(done));
}
