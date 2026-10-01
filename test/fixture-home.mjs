import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Only test copies use these seams. Production has no env/flag override for home.
const quote = (home) => "'" + home.replaceAll("'", "'\\''") + "'";

// The launcher's inline lookup.
export function fixtureHome(file, home) {
  const source = readFileSync(file, 'utf8');
  const marker = "account_home || { print -ru2 'agent-guard: cannot resolve account home'; exit 1 }";
  assert.equal(source.split(marker).length, 2, 'account lookup seam must be unique');
  writeFileSync(file, source.replace(marker, `REPLY=${quote(home)}`));
}

// engine/account.zsh, used by the installer, the uninstaller and agent-guard.
export function fixtureAccount(file, home) {
  const source = readFileSync(file, 'utf8');
  const marker = 'account_home() {';
  assert.equal(source.split(marker).length, 2, 'account.zsh seam must be unique');
  writeFileSync(file, source.replace(marker, `account_home() { REPLY=${quote(home)} }\nproduction_account_home() {`));
}
