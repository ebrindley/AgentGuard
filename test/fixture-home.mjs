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

// engine/account.zsh, used by the installer, the uninstaller and agent-guard. The
// production function stays as it is; a later definition overrides it, so the
// copy still holds the launcher's function verbatim.
export function fixtureAccount(file, home) {
  const source = readFileSync(file, 'utf8');
  const marker = 'account_home() {';
  assert.equal(source.split(marker).length, 2, 'account.zsh seam must be unique');
  writeFileSync(file, `${source}${source.endsWith('\n') ? '' : '\n'}account_home() { REPLY=${quote(home)} }\n`);
}
