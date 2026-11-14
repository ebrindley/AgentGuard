// Which repository a shell command would delete, for the confirmation of decision
// D18 (docs/DESIGN.md section 15). Shared by OpenCode's plugin and the Pi extension.
//
// cc-safety-net protects the Git metadata of the folder it is anchored in and
// reports no targets. So the question is put to it once per candidate: anchored in
// repository R, with the command run from its real folder, a delete of R or of
// R/.git with rm is denied by its rm.git-metadata rule. cc-safety-net does the
// parsing; nothing here reads the command beyond a word and a name test.
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Only rm is asked about. cc-safety-net's rules for find and rsync also deny forms
// that delete nothing (`rsync --dry-run --delete`, `find -maxdepth 0 -type f -delete`),
// and a rename (guard.git-metadata) loses nothing.
const DELETES = /(^|[^\w.-])rm(?![\w.-])/;
const RULE = 'rm.git-metadata';
const quote = (text) => `'${text.replaceAll("'", `'\\''`)}'`;
const real = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};
const under = (path, root) => path === root || path.startsWith(root + '/');
const sameFile = (a, b) => {
  try {
    const x = statSync(a);
    const y = statSync(b);
    return x.ino === y.ino && x.dev === y.dev;
  } catch {
    return false;
  }
};
// A name as a command may spell it: any letter case, which a case-insensitive
// volume takes for the same folder, and a backslash before any character
// (`Review\ Repo`). It stands as a whole path part, not inside a longer word.
const spelled = (name) =>
  new RegExp(`(?<![\\w.\\\\-])${[...name].map((c) => `\\\\?${c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`).join('')}(?![\\w.-])`, 'giu');

/**
 * The first repository directly inside one of `folders` that `command`, run from
 * that folder, would delete whole or strip of its Git data; null when there is
 * none. Repositories in temp folders are left out: a clone made there is scratch.
 * It misses a repository named after a folder cc-safety-net refuses for another
 * reason first, such as `rm -rf other AgentGuard` anchored in AgentGuard, a
 * delete of part of `.git`, and deletes by find or rsync. A command that holds
 * rm and an rsync --delete into the repository is asked about, dry run or not,
 * since both carry the one rule.
 */
export function repositoryDelete(checkCommand, command, folders) {
  if (typeof checkCommand !== 'function' || typeof command !== 'string' || !DELETES.test(command)) return null;
  // A name may be written with backslash escapes: `Review\ Repo`.
  const plain = command.replaceAll('\\', '');
  const lower = plain.toLowerCase();
  const temp = ['/tmp', '/private/tmp', '/var/tmp', '/private/var/tmp', '/private/var/folders', real(tmpdir())];
  for (const folder of new Set(folders.filter((f) => typeof f === 'string' && f.startsWith('/')).map(real))) {
    let entries;
    try {
      entries = readdirSync(folder, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const exact = command.includes(entry.name) || plain.includes(entry.name);
      const letters = [...entry.name];
      const other = !letters.includes('\\') && lower.includes(entry.name.toLowerCase()) && spelled(entry.name).test(command);
      if (!exact && !other) continue;
      const repository = join(folder, entry.name);
      if (!existsSync(join(repository, '.git')) || temp.some((root) => under(repository, root))) continue;
      // cc-safety-net compares names exactly, so a spelling in another letter case
      // that reaches this folder is put to it under the folder's own name. Only the
      // question is rewritten, never the command that runs.
      let asked = command;
      if (other) {
        asked = command.replace(spelled(entry.name), (found) => {
          const typed = found.replaceAll('\\', '');
          if (typed === entry.name || !sameFile(join(folder, typed), repository)) return found;
          let at = 0;
          return found.replace(/\\?([^\\])/gu, (pair, letter) => pair.slice(0, pair.length - letter.length) + letters[at++]);
        });
      }
      let result;
      try {
        result = checkCommand({ command: `cd ${quote(folder)} && ${asked}`, cwd: repository });
      } catch {
        continue;
      }
      if (result?.kind === 'deny' && result.ruleId === RULE) return repository;
    }
  }
  return null;
}
