import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const plugin = process.argv[2];
const { AgentGuard } = await import(pathToFileURL(plugin).href);
const hooks = await AgentGuard({ directory: process.cwd() });
const args = { command: 'command -v codex claude cursor-agent grok opencode', workdir: process.cwd() };
await hooks['tool.execute.before']({ tool: 'bash' }, { args });
const result = spawnSync('/bin/zsh', ['-c', args.command], { encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr);
const release = dirname(dirname(dirname(plugin)));
assert.deepEqual(result.stdout.trim().split('\n'),
  ['codex', 'claude', 'cursor-agent', 'grok', 'opencode'].map(name => join(release, 'peers', name)));
console.log('ok OpenCode Bash keeps peer wrappers after shell startup');
