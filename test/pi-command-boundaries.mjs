import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { analyzeCommand, preflight } from '../profiles/pi/src/guard-core.mjs';

const home = mkdtempSync('/private/var/tmp/agentguard-command-boundaries-');
const project = join(home, 'project');
mkdirSync(join(project, 'dist'), { recursive: true });
assert.equal(spawnSync('/usr/bin/git', ['init', '-q', '--template=', project], { env: { HOME: home, PATH: '/usr/bin:/bin' } }).status, 0);
assert.equal((await preflight()).ok, true);
const rows = [];
const cases = JSON.parse(readFileSync(new URL('../profiles/pi/test/corpus/corpus.json', import.meta.url))).cases
  .filter(c => c.note?.startsWith('Command boundary:'));
assert.equal(cases.length, 12);
for (const { command, expect: expected } of cases) {
  const result = await analyzeCommand(command, { cwd: project, home });
  rows.push({ command, expected, actual: result.decision, reason: result.reason });
}
writeFileSync(join(home, 'result.json'), JSON.stringify(rows, null, 2));
console.log(`command-boundaries fixture: ${home}`);
for (const row of rows) assert.equal(row.actual, row.expected, `${row.command}: ${row.reason}`);
console.log(`${rows.length} command-boundary cases passed`);
