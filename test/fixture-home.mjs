import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Only test copies use this seam. Production has no env/flag override for home.
export function fixtureHome(file, home) {
  const source = readFileSync(file, 'utf8');
  const marker = "account_home || { print -ru2 'agent-guard: cannot resolve account home'; exit 1 }";
  assert.equal(source.split(marker).length, 2, 'account lookup seam must be unique');
  const quoted = "'" + home.replaceAll("'", "'\\''") + "'";
  writeFileSync(file, source.replace(marker, `REPLY=${quoted}`));
}

if (process.argv[2]) fixtureHome(process.argv[2], process.argv[3]);
