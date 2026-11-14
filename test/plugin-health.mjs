import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

// Fault injection stays in this disposable-home fixture. It observes readiness
// and refusal behavior without launching OpenCode or invoking a model.
const self = fileURLToPath(import.meta.url);
const cases = ['healthy', 'rules-missing', 'engine-import', 'engine-init', 'api-import', 'hooks-missing', 'updated', 'unsafe-version', 'outer-sandbox'];
if (process.argv[2] !== '--case') {
  const source = resolve(process.argv[2] ?? join(dirname(self), '../profiles/opencode/plugin.js'));
  // Outside temp: the repository confirmation leaves repositories in temp folders alone.
  const root = fs.realpathSync(fs.mkdtempSync(join(os.userInfo().homedir, 'Library/Caches', 'agentguard-plugin-health-')));
  let failed = false;
  for (const host of ['v1', 'v2']) for (const name of cases) {
    const result = spawnSync(process.execPath, [self, '--case', root, source, name, host], { encoding: 'utf8' });
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    if (result.status !== 0) failed = true;
  }
  // The cache folder is not cleared by the system as temp is: keep fixtures only to diagnose a failure.
  if (failed) console.log(`Plugin-health fixtures retained: ${root}`);
  else fs.rmSync(root, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}

const [, , , root, source, name, host] = process.argv;
const home = join(root, `${host}-${name}`);
const engine = join(home, 'Library/Application Support/AgentGuard');
const release = join(engine, 'releases/1.0.0-fixture');
const directory = join(home, 'Projects/app');
const state = join(engine, 'state');
const checker = join(state, 'opencode/checker');
const logs = join(home, '.cc-safety-net/logs');
const marker = 'PRIVATE-MARKER-do-not-export';
for (const dir of [directory, checker, logs, join(release, 'profiles/opencode'), join(release, 'vendor/cc-safety-net/dist'), join(release, 'peers')])
  fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(join(release, 'package.json'), '{"type":"module"}');
fs.writeFileSync(join(release, 'RELEASE'), '1.0.0-fixture\n');
fs.writeFileSync(join(release, 'VERSION'), name === 'unsafe-version' ? marker + '\n' : name === 'updated' ? '1.0.0.1\n' : '1.0.0\n');
fs.copyFileSync(source, join(release, 'profiles/opencode/plugin.js'));
for (const file of ['permissions.js', 'permissions.jq', 'v2.js']) fs.copyFileSync(join(dirname(source), file), join(release, 'profiles/opencode', file));
// The shared repository check, from a source tree or an unpacked release.
fs.mkdirSync(join(release, 'checker'), { recursive: true });
fs.copyFileSync(['../../engine/checker', '../../checker'].map(d => join(dirname(source), d, 'repository.mjs')).find(f => fs.existsSync(f)), join(release, 'checker/repository.mjs'));
fs.mkdirSync(join(directory, 'repo/.git'), { recursive: true });
fs.mkdirSync(join(checker, 'rules'), { recursive: true });
fs.writeFileSync(join(checker, 'rules/rule.json'), '{}');
const deniedRoot = join(directory, 'private');
const denied = join(deniedRoot, marker);
const credentialFile = join(home, '.ssh', 'id_fixture');
const envFile = join(directory, '.env');
const unrelated = join(home, marker + '-unclassified');
const protectedFile = join(home, '.cc-safety-net', marker);
if (name !== 'rules-missing') fs.writeFileSync(join(state, 'rules.json'), JSON.stringify({
  allow: [directory], readonly: [], deny: [deniedRoot], skills: [], configs: [], protected: [], credentials: [join(home, '.ssh')], checker, preparationStatus: 'ready',
}));
let net = 'export default { server: async () => ({ "tool.execute.before": async (_info, output) => { if(output.args?.command?.includes("FAIL-RULE")) throw new Error("BLOCKED by CC Safety Net\\n\\nReason: CC Safety Net refused\\nRule: custom.agent-guard-git/hooks-path\\n"); if(output.args?.command?.includes("FAIL-CLOSED")) throw new Error("blocked\\nRule: analysis.failed-closed\\n"); if(output.args?.command?.includes("FAIL-NET")) throw Object.assign(new Error("' + marker + '"), { code: "ENAMETOOLONG" }); } }) };';
if (name === 'engine-import') net = 'throw new Error("' + marker + '");';
if (name === 'engine-init') net = 'export default { server: async () => { throw new Error("' + marker + '"); } };';
if (name === 'hooks-missing') net = 'export default { server: async () => ({}) };';
fs.writeFileSync(join(release, 'vendor/cc-safety-net/dist/index.js'), net);
fs.writeFileSync(join(release, 'vendor/cc-safety-net/dist/api.js'), name === 'api-import' ? 'throw new Error("' + marker + '");' : 'export const checkCommand = ({command, cwd}) => cwd.endsWith("/repo") ? (command.includes("DELETE-REPO") ? ({kind:"deny",reason:"git",ruleId:"rm.git-metadata"}) : ({kind:"allow"})) : command.includes("API-DENY") ? ({kind:"deny",reason:"' + marker + '",ruleId:"' + marker + '"}) : command.startsWith("git config core.hooksPath ") ? ({kind:"deny",reason:"hooks",ruleId:"custom.agent-guard-git/hooks-path"}) : ({kind:"allow"});');
let installed = release;
if (name === 'updated') {
  installed = join(engine, 'releases/2.0.0.1-fixture');
  fs.mkdirSync(installed, { recursive: true });
  fs.writeFileSync(join(installed, 'RELEASE'), '2.0.0.1-fixture\n');
}
fs.symlinkSync(installed, join(engine, 'current'));
process.env.AGENT_GUARD_RELEASE = '1.0.0-fixture';
delete process.env.AGENT_GUARD_CONTEXT;
delete process.env.AGENT_GUARD_BYPASS;
// outer-sandbox: the launcher stepped aside under another tool's sandbox, which
// also denies the probe's write (EPERM below) and leaves an older rules.json.
if (name === 'outer-sandbox') process.env.AGENT_GUARD_OUTER_SANDBOX = '1';
else delete process.env.AGENT_GUARD_OUTER_SANDBOX;
os.homedir = () => home;
const open = fs.openSync;
fs.openSync = (path, ...args) => {
  if (typeof path === 'string' && path.startsWith(join(state, '.probe-'))) {
    const error = new Error(marker);
    error.code = 'EPERM';
    throw error;
  }
  return open(path, ...args);
};
const realpath = fs.realpathSync;
fs.realpathSync = (path, ...args) => {
  if (typeof path === 'string' && ([denied, unrelated, protectedFile, credentialFile].some(prefix => path.startsWith(prefix)) || path === envFile)) {
    const error = new Error(marker);
    error.code = 'EPERM';
    throw error;
  }
  return realpath(path, ...args);
};
syncBuiltinESMExports();
const { AgentGuard, default: definition } = await import(pathToFileURL(join(release, 'profiles/opencode/plugin.js')).href);
let hooks;
if (host === 'v2') {
  const tools = {}, rpc = {};
  let execute, finished;
  globalThis.permission = { evaluate: null, asked: [], answer: async () => {} };
  await definition.setup({
    location: { directory, project: { directory, canonical: directory } },
    agent: { list: async () => ({ data: [{ id: 'build', permissions: [{ action: 'shell', resource: '*', effect: 'allow' }] }] }) },
    permission: {
      hook: async (name, callback) => { assert.equal(name, 'evaluate'); globalThis.permission.evaluate = callback; },
      assert: async request => { globalThis.permission.asked.push(request); await globalThis.permission.answer(request); },
    },
    tool: {
      hook: async (name, callback) => { assert.ok(['execute.before', 'execute.after'].includes(name)); if (name === 'execute.before') execute = callback; else finished = callback; },
      transform: async callback => callback({ add: tool => { tools[tool.name] = tool; } }),
    },
    rpc: { register: async (_definition, handlers) => Object.assign(rpc, handlers) },
  });
  hooks = {
    tool: Object.fromEntries(Object.entries(tools).map(([name, tool]) => [name, { ...tool, execute: async args => (await tool.execute(args, {})).content }])),
    'tool.execute.before': async (info, output) => {
      const input = { ...output.args };
      const tool = ({ bash: 'shell', apply_patch: 'patch' })[info.tool] ?? info.tool;
      if (['read', 'write', 'edit'].includes(tool)) { input.path = input.filePath; delete input.filePath; }
      const event = { ...info, tool, input };
      await execute(event);
      if (tool === 'shell') output.args.command = event.input.command;
    },
    // The host's finished-call event, with the result as OpenCode 2 holds it.
    'tool.execute.after': async (info, output) => {
      const event = { ...info, tool: ({ bash: 'shell' })[info.tool] ?? info.tool, status: 'completed', result: { content: [{ type: 'text', text: output.output }] } };
      await finished(event);
      output.output = event.result.content.map(part => part.text).join('\n');
    },
  };
  assert.equal((await rpc.status()).state, name === 'outer-sandbox' ? 'inactive' : ['healthy', 'updated', 'unsafe-version'].includes(name) ? 'active' : 'degraded');
  if (name === 'healthy') {
    const permissions = await rpc.permissions();
    assert.equal(permissions.availability, 'observed');
    assert.equal(permissions.agents[0].probes.bashGitStatus.action, 'allow');
    const patch = { tool: 'patch', input: { patchText: `*** Begin Patch\n*** Add File: ${protectedFile}\n+x\n*** End Patch` } };
    await assert.rejects(execute(patch), /protected/);
  }
} else {
  assert.equal(definition.server, AgentGuard);
  hooks = await AgentGuard({ directory });
}
const before = hooks['tool.execute.before'];
await before({ tool: 'agent_guard_status' }, { args: {} });
const status = hooks.tool.agent_guard_status;
const raw = await status.execute({});
const health = JSON.parse(raw);
assert.equal(raw.includes(marker), false, 'health must omit private errors and paths');
assert.equal(status.description.includes(marker), false);
assert.equal(health.sandbox.result, 'confined');
if (name === 'outer-sandbox') {
  assert.equal(health.state, 'inactive');
  assert.equal(health.rules.loaded, false);
  for (const [tool, args] of [['bash', { command: 'pwd' }], ['read', { filePath: join(directory, 'README.md') }], ['write', { filePath: join(directory, 'allowed.txt') }]])
    await assert.rejects(before({ tool }, { args }), /Agent Guard protects this computer.*OpenCode was started without it, so tools are disabled.*from a new terminal\.$/);
  const unguarded = { output: 'zsh:1: operation not permitted: ps' };
  await hooks['tool.execute.after']({ tool: 'bash' }, unguarded);
  assert.equal(unguarded.output, 'zsh:1: operation not permitted: ps', 'no sandbox note outside the guard');
  await before({ tool: 'todowrite' }, { args: {} });
  console.log(`ok plugin health ${host} ${name}: the outer-sandbox variable overrides the probe and refuses as unguarded`);
  process.exit(0);
}
const ready = ['healthy', 'updated', 'unsafe-version'].includes(name);
assert.equal(health.state, ready ? 'active' : 'degraded');
assert.equal(status.description.includes(ready ? '[agent-guard:ready]' : '[agent-guard:degraded]'), true);
if (name === 'updated') {
  assert.equal(health.restartNeeded, true);
  // Same-day releases add a fourth number.
  assert.deepEqual([health.releases.installed, health.releases.version], ['2.0.0.1-fixture', '1.0.0.1']);
}
if (name === 'unsafe-version') assert.equal(health.releases.version, null);
if (ready) {
  await before({ tool: 'bash' }, { args: { command: 'pwd' } });
  // A Seatbelt denial in a shell command's output gets the sandbox note, once.
  const after = hooks['tool.execute.after'];
  const denial = { output: 'touch: /x: Operation not permitted' };
  await after({ tool: 'bash' }, denial);
  assert.match(denial.output, /^touch: \/x: Operation not permitted\n\nAgent Guard: this session runs in Agent Guard's sandbox.*ps, open, launchctl and codesign.*outside Agent Guard\.$/s);
  // Decision D18: a command that deletes a repository below its folder needs the
  // user's approval. V1 has no request to raise, so it refuses.
  const remove = () => before({ tool: 'bash', sessionID: 'ses_fixture' }, { args: { command: 'rm DELETE-REPO repo' } });
  await before({ tool: 'bash' }, { args: { command: 'rm DELETE-REPO other' } });
  await before({ tool: 'bash' }, { args: { command: 'ls DELETE-REPO repo' } });
  if (host === 'v1') await assert.rejects(remove(), /deletes the repository .*\/Projects\/app\/repo or its Git data\. Agent Guard cannot ask the user in this session.*outside Agent Guard\.$/);
  else {
    const { permission } = globalThis;
    const question = { action: 'agent-guard.delete-repository', effect: 'allow' }, other = { action: 'shell', effect: 'allow' };
    await permission.evaluate(question); await permission.evaluate(other);
    assert.deepEqual([question.effect, other.effect], ['ask', 'allow']);
    await assert.rejects(remove(), /approval came back at once.*automatic/);
    assert.deepEqual(permission.asked.at(-1).resources, [join(directory, 'repo')]);
    assert.equal(permission.asked.at(-1).sessionID, 'ses_fixture');
    permission.answer = async () => { throw new Error('rejected'); };
    await assert.rejects(remove(), /The user did not approve it/);
    permission.answer = () => new Promise(resolve => setTimeout(resolve, 1600));
    await remove();
    assert.equal(permission.asked.length, 3);
  }
  const plain = { output: 'done' };
  await after({ tool: 'bash' }, plain);
  assert.equal(plain.output, 'done');
  const read = { output: 'Operation not permitted' };
  await after({ tool: 'read' }, read);
  assert.equal(read.output, 'Operation not permitted');
  await assert.rejects(before({ tool: 'read' }, { args: { filePath: denied } }), /DENY list/);
  fs.mkdirSync(deniedRoot, { recursive: true });
  fs.writeFileSync(join(deniedRoot, 'plain.txt'), 'x');
  fs.symlinkSync(join(deniedRoot, 'plain.txt'), join(directory, 'link.txt'));
  await assert.rejects(before({ tool: 'read' }, { args: { filePath: 'link.txt' } }), new RegExp(`link\\.txt \\(resolves to ${join(deniedRoot, 'plain.txt').replaceAll('.', '\\.')}\\) is in the DENY list`));
  await assert.rejects(before({ tool: 'read' }, { args: { filePath: unrelated } }), { code: 'EPERM' });
  await assert.rejects(before({ tool: 'write' }, { args: { filePath: protectedFile } }), /protected \(~\/\.cc-safety-net\).*cannot be unlocked from the Guard List/);
  // Fixed credential and .env protections are explained, not raw EPERM.
  await assert.rejects(before({ tool: 'read' }, { args: { filePath: credentialFile } }), /fixed Agent Guard protection \(~\/\.ssh is a credential path\)/);
  await assert.rejects(before({ tool: 'read' }, { args: { filePath: envFile } }), /fixed Agent Guard protection \(\.env files are blocked/);
  await before({ tool: 'write' }, { args: { filePath: join(directory, '.env.EXAMPLE') } });
  await assert.rejects(before({ tool: 'bash' }, { args: { command: 'API-DENY', workdir: home } }), new RegExp(marker));
  assert.equal(health.safetyNet.gitRuleCheck, 'passed');
  assert.deepEqual(health.roots.allow, [directory]);
  assert.deepEqual(health.roots.deny, [deniedRoot]);
  assert.ok(health.roots.protected.includes(join(home, '.cc-safety-net')));
  // An analysis failure is reported as one, without the checker's raw error text.
  await assert.rejects(before({ tool: 'bash' }, { args: { command: 'FAIL-NET' } }), error =>
    /could not analyze this command \(ENAMETOOLONG\).*not a policy denial/.test(error.message) && !error.message.includes(marker));
  await assert.rejects(before({ tool: 'bash' }, { args: { command: 'FAIL-CLOSED' } }), /Rule: analysis\.failed-closed/);
  // A denial keeps its rule line and carries Agent Guard's name.
  await assert.rejects(before({ tool: 'bash' }, { args: { command: 'FAIL-RULE' } }), error =>
    /^Blocked by Agent Guard\n\nReason: Agent Guard refused\nRule: custom\.agent-guard-git\/hooks-path$/m.test(error.message) && !error.message.includes('CC Safety Net'));
  const observedText = fs.readFileSync(join(logs, 'agent-guard-events.json'), 'utf8');
  assert.equal(observedText.includes(marker), false);
  const observed = JSON.parse(observedText).events;
  assert.ok(observed.some(event => event.stage === 'safety-net' && event.code === 'command-denied' && event.ruleId === 'custom'));
  assert.ok(observed.some(event => event.code === 'safety-net-failed' && event.ruleId === 'unattributed' && event.errno === 'ENAMETOOLONG' && event.remediation === 'none'));
  assert.ok(observed.some(event => event.code === 'safety-net-failed' && event.errno === 'unknown'));
  assert.equal(observed.some(event => event.code === 'safety-net-failed' && event.ruleId !== 'unattributed'), false);
  assert.ok(observed.some(event => event.layer === 'filesystem' && event.code === 'filesystem-error' && event.errno === 'EPERM'));
  assert.ok(observed.some(event => event.layer === 'guard' && event.code === 'path-protected' && event.remediation === 'none' && event.errno === 'EPERM'));
  assert.ok(observed.some(event => event.layer === 'guard' && event.ruleId === 'guard.path.protected' && event.errno === 'EPERM'));
  assert.ok(observed.some(event => event.layer === 'guard' && event.code === 'command-denied' && event.ruleId === 'custom'));
  assert.equal(observed.some(event => event.layer === 'sandbox'), false, 'uncorrelated EPERM must not imply Seatbelt');
  if (name === 'healthy') {
    fs.writeFileSync(join(logs, 'agent-guard-events.json'), marker + ' truncated advisory JSON');
    await assert.rejects(before({ tool: 'read' }, { args: { filePath: denied } }), /DENY list/);
    const repairedText = fs.readFileSync(join(logs, 'agent-guard-events.json'), 'utf8');
    assert.equal(repairedText.includes(marker), false, 'corrupt history must not suppress sanitized future observations');
    const repaired = JSON.parse(repairedText);
    assert.equal(repaired.schemaVersion, 1);
    assert.equal(repaired.advisory, true);
    assert.equal(repaired.events.length, 1);
    assert.equal(repaired.events[0].ruleId, 'guard.path.deny');
    const eventFile = join(logs, 'agent-guard-events.json');
    const target = join(directory, 'valuable.txt');
    fs.writeFileSync(target, 'preserve this file\n');
    fs.unlinkSync(eventFile);
    fs.symlinkSync(target, eventFile);
    await assert.rejects(before({ tool: 'read' }, { args: { filePath: denied } }), /DENY list/);
    assert.equal(fs.readFileSync(target, 'utf8'), 'preserve this file\n', 'advisory logging must not overwrite a symlink target');
    assert.equal(fs.lstatSync(eventFile).isSymbolicLink(), true);
    fs.unlinkSync(eventFile);
  }
  // Event retention must remain bounded after repeated refusals.
  for (let count = 0; count < 35; count++)
    await assert.rejects(before({ tool: 'read' }, { args: { filePath: denied } }));
} else {
  await assert.rejects(before({ tool: 'bash' }, { args: { command: 'pwd' } }));
  await assert.rejects(before({ tool: 'read' }, { args: { filePath: 'README.md' } }));
  await assert.rejects(before({ tool: 'write' }, { args: { filePath: 'allowed.txt' } }));
  assert.ok(health.failures.length > 0);
}
const eventsText = fs.readFileSync(join(logs, 'agent-guard-events.json'), 'utf8');
assert.equal(eventsText.includes(marker), false, 'events must omit private payloads');
const events = JSON.parse(eventsText);
assert.equal(events.schemaVersion, 1);
assert.equal(events.advisory, true);
assert.ok(events.events.length <= 32);
assert.ok(Buffer.byteLength(eventsText) <= 65536);
if (ready) assert.ok(events.events.some(event => event.layer === 'guard' && event.ruleId === 'guard.path.deny' && event.errno === 'EPERM'));
console.log(`ok plugin health ${host} ${name}: status callable, readiness accurate, events sanitized`);
