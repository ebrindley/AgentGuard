// Offline release lookup, consent and restart checks. Only disposable copies
// replace the network base, dialogs and installation transaction.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureAccount } from './fixture-home.mjs';

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
const server = createServer((req, res) => {
  requests.push(req.url);
  if (req.url === '/releases/latest') {
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
source = replaceOnce(source, downloadBase, `local repo=${quote(base)}; local -a curl_proto=()`);
source = source.replaceAll('/usr/bin/osascript', quote(join(temp, 'dialog')));
writeFileSync(module, source);
const stamp = (value) => writeFileSync(join(engine, 'state/stamp.json'), JSON.stringify({ tag: value }));
const preference = (value) => writeFileSync(join(engine, 'state/update-check'), value);
const run = (body, input = '') => new Promise((done, reject) => {
  const child = spawn('/bin/zsh', ['-fc', `setopt no_unset extended_glob; home=${quote(home)}; engine=${quote(engine)}; source ${quote(module)}; ${body}`], { cwd: temp });
  let stdout = '', stderr = '';
  child.stdout.on('data', (b) => { stdout += b; }); child.stderr.on('data', (b) => { stderr += b; });
  child.on('error', reject); child.on('close', (status) => done({ status, stdout, stderr })); child.stdin.end(input);
});
const executable = (path, text) => writeFileSync(path, '#!/bin/zsh -f\n' + text, { mode: 0o755 });
const startup = (mode = 'gui', args = '') => run(`ag_update_startup ${mode} OpenCode ${quote(join(temp, 'restart'))} ${args}; exit $?`);
const installCalls = join(temp, 'install-calls');
executable(join(temp, 'restart'), `home=${quote(home)}; engine=${quote(engine)}; source ${quote(module)}\nag_update_startup gui OpenCode "$0" "$@" || exit $?\n/usr/bin/jq -cn --arg cwd "$PWD" --arg marker "\${AGENT_GUARD_UPDATE_RESTART:-}" --args '{cwd:$cwd,marker:$marker,args:$ARGS.positional}' -- "$@"\n`);
function ui() {
  executable(join(temp, 'dialog'), `print -r -- ${quote(answer)}\n`);
  executable(join(release, 'bin/agent-guard'), `print -r -- "$*" >> ${quote(installCalls)}\nexit ${updateStatus}\n`);
}
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
    answer = 'Upgrade'; ui(); const before = requests.length;
    const r = await startup('gui', "'a project' '--prompt' 'a; $literal' '雪'");
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), { cwd: temp, marker: '', args: ['a project', '--prompt', 'a; $literal', '雪'] });
    assert.equal(requests.length - before, 1);
    assert.equal(readFileSync(installCalls, 'utf8').trim(), `update --to ${tag} --no-prompt`);
  });
  await check('failed accepted installation stops without relaunching', async () => {
    updateStatus = 1; ui(); const r = await startup(); assert.equal(r.status, 1); assert.equal(r.stdout, '');
  });

  await check('Pi and OMP restart through their shim with the saved peer PATH, cwd and arguments', async () => {
    // Keep the real shim and startup preamble through the update hook. Replace
    // account/runtime/probe inputs and stop before unrelated policy construction.
    source = replaceOnce(source, '[[ -t 0 && -t 2 ]]', 'true');
    writeFileSync(module, source);
    answer = 'Upgrade'; updateStatus = 0; ui();
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
      assert.match(r.stderr, /updated\. Restarting/); assert.equal(requests.length - before, 1);
    }
  });

  // Exercise the actual command parser and pinned bootstrap selection, replacing
  // only transaction ownership in this isolated command copy.
  copyFileSync(join(root, 'engine/account.zsh'), join(release, 'account.zsh'));
  fixtureAccount(join(release, 'account.zsh'), home);
  let cli = readFileSync(join(root, 'engine/agent-guard'), 'utf8');
  cli = replaceOnce(cli, downloadBase, `local repo=${quote(base)}; local -a curl_proto=()`);
  const start = cli.indexOf('load_installer() {'), end = cli.indexOf('\n}\n', start) + 3;
  cli = cli.slice(0, start) + `load_installer() {\n stamp="$engine/state/stamp.json"\n ag_probe() { :; }; ag_lock() { :; }; ag_unlock() { :; }; ag_recover() { :; }; ag_maintenance() { :; }\n}\n` + cli.slice(end);
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
  console.log(`${checks} update checks passed; fixtures: ${temp}`);
} finally {
  server.closeAllConnections(); await new Promise((done) => server.close(done));
}
