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
  const root = fs.realpathSync(fs.mkdtempSync(join(os.tmpdir(), 'agentguard-plugin-health-')));
  let failed = false;
  for (const host of ['v1', 'v2']) for (const name of cases) {
    const result = spawnSync(process.execPath, [self, '--case', root, source, name, host], { encoding: 'utf8' });
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    if (result.status !== 0) failed = true;
  }
  console.log(`Plugin-health fixtures retained: ${root}`);
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
fs.writeFileSync(join(release, 'VERSION'), name === 'unsafe-version' ? marker + '\n' : '1.0.0\n');
fs.copyFileSync(source, join(release, 'profiles/opencode/plugin.js'));
for (const file of ['permissions.js', 'permissions.jq', 'v2.js']) fs.copyFileSync(join(dirname(source), file), join(release, 'profiles/opencode', file));
fs.mkdirSync(join(checker, 'rules'), { recursive: true });
fs.writeFileSync(join(checker, 'rules/rule.json'), '{}');
const denied = join(directory, marker);
const unrelated = join(home, marker + '-unclassified');
const protectedFile = join(home, '.cc-safety-net', marker);
if (name !== 'rules-missing') fs.writeFileSync(join(state, 'rules.json'), JSON.stringify({
  allow: [directory], readonly: [], deny: [denied], skills: [], configs: [], protected: [], checker, preparationStatus: 'ready',
}));
let net = 'export default { server: async () => ({ "tool.execute.before": async (_info, output) => { if(output.args?.command?.includes("FAIL-NET")) throw new Error("' + marker + '"); } }) };';
if (name === 'engine-import') net = 'throw new Error("' + marker + '");';
if (name === 'engine-init') net = 'export default { server: async () => { throw new Error("' + marker + '"); } };';
if (name === 'hooks-missing') net = 'export default { server: async () => ({}) };';
fs.writeFileSync(join(release, 'vendor/cc-safety-net/dist/index.js'), net);
fs.writeFileSync(join(release, 'vendor/cc-safety-net/dist/api.js'), name === 'api-import' ? 'throw new Error("' + marker + '");' : 'export const checkCommand = ({command}) => command.includes("API-DENY") ? ({kind:"deny",reason:"' + marker + '",ruleId:"' + marker + '"}) : command.startsWith("git config core.hooksPath ") ? ({kind:"deny",reason:"hooks",ruleId:"custom.agent-guard-git/hooks-path"}) : ({kind:"allow"});');
let installed = release;
if (name === 'updated') {
  installed = join(engine, 'releases/2.0.0-fixture');
  fs.mkdirSync(installed, { recursive: true });
  fs.writeFileSync(join(installed, 'RELEASE'), '2.0.0-fixture\n');
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
  if (typeof path === 'string' && [denied, unrelated, protectedFile].some(prefix => path.startsWith(prefix))) {
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
  let execute;
  await definition.setup({
    location: { directory, project: { directory, canonical: directory } },
    agent: { list: async () => ({ data: [{ id: 'build', permissions: [{ action: 'shell', resource: '*', effect: 'allow' }] }] }) },
    tool: {
      hook: async (name, callback) => { assert.equal(name, 'execute.before'); execute = callback; },
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
    await assert.rejects(before({ tool }, { args }), /started without the guard/);
  await before({ tool: 'todowrite' }, { args: {} });
  console.log(`ok plugin health ${host} ${name}: the outer-sandbox variable overrides the probe and refuses as unguarded`);
  process.exit(0);
}
const ready = ['healthy', 'updated', 'unsafe-version'].includes(name);
assert.equal(health.state, ready ? 'active' : 'degraded');
assert.equal(status.description.includes(ready ? '[agent-guard:ready]' : '[agent-guard:degraded]'), true);
if (name === 'updated') assert.equal(health.restartNeeded, true);
if (name === 'unsafe-version') assert.equal(health.releases.version, null);
if (ready) {
  await before({ tool: 'bash' }, { args: { command: 'pwd' } });
  await assert.rejects(before({ tool: 'read' }, { args: { filePath: denied } }), /DENY list/);
  await assert.rejects(before({ tool: 'read' }, { args: { filePath: unrelated } }), { code: 'EPERM' });
  await assert.rejects(before({ tool: 'write' }, { args: { filePath: protectedFile } }), /protected/);
  await assert.rejects(before({ tool: 'bash' }, { args: { command: 'API-DENY', workdir: home } }), new RegExp(marker));
  await assert.rejects(before({ tool: 'bash' }, { args: { command: 'FAIL-NET' } }), new RegExp(marker));
  const observedText = fs.readFileSync(join(logs, 'agent-guard-events.json'), 'utf8');
  assert.equal(observedText.includes(marker), false);
  const observed = JSON.parse(observedText).events;
  assert.ok(observed.some(event => event.layer === 'filesystem' && event.code === 'filesystem-error' && event.errno === 'EPERM'));
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
