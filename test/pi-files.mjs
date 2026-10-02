// Compares profiles/pi with pi-sandbox-guard 7ad441f. The record lists the git blob
// hash and mode of every vendored file at that commit, or at the later commit its
// entry names; the stored patch holds every change Agent Guard made to them.
// Reversing the patch must apply exactly, hunk by hunk at its recorded line, and give
// back those blobs, so a change outside the recorded differences fails here.
//
// After a reviewed change to a vendored file, regenerate the patch from the commit
// that vendored the files unchanged ("Vendor pi-sandbox-guard 7ad441f's Pi profile
// unchanged"), and record the change in pi.json:
//   git diff --relative=profiles/pi/ <commit> -- profiles/pi ':!profiles/pi/package.json' \
//     > test/fixtures/differences/pi.patch
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vendored = join(root, 'profiles/pi');
const record = JSON.parse(readFileSync(join(root, 'test/fixtures/differences/pi.json'), 'utf8'));
const patch = readFileSync(join(root, 'test/fixtures/differences', record.patch), 'utf8');
let fails = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    fails++;
    console.log(`FAIL ${name}\n     ${error.message.replaceAll('\n', '\n     ')}`);
  }
}

const blob = (bytes) => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [relative(vendored, join(dir, e.name))]);
}

// A git diff: per file, hunks of ' ', '-' and '+' lines with their new-file start line.
function parsePatch(text) {
  const files = new Map();
  let hunks = null;
  let hunk = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      hunks = null;
      hunk = null;
    } else if (line.startsWith('+++ ')) {
      assert.ok(line.startsWith('+++ b/'), `unexpected file header: ${line}`);
      const name = line.slice(6);
      assert.ok(!files.has(name), `file appears twice in the patch: ${name}`);
      hunks = [];
      files.set(name, hunks);
    } else if (line.startsWith('@@ ')) {
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      assert.ok(m && hunks, `unexpected hunk header: ${line}`);
      hunk = { start: Number(m[1]), lines: [] };
      hunks.push(hunk);
    } else if (hunk && /^[ +-]/.test(line)) {
      hunk.lines.push(line);
    } else if (hunk && line.startsWith('\\')) {
      assert.fail(`patch changes a missing final newline: ${line}`);
    }
  }
  return files;
}

// Reverses the hunks against the current text: each hunk's context and added lines
// must be at its recorded start line, and are replaced by its context and removed lines.
function reverse(text, hunks) {
  const lines = text.split('\n');
  for (const { start, lines: body } of [...hunks].reverse()) {
    const now = body.filter((l) => l[0] !== '-').map((l) => l.slice(1));
    const then = body.filter((l) => l[0] !== '+').map((l) => l.slice(1));
    const at = start - 1;
    assert.deepEqual(lines.slice(at, at + now.length), now, `hunk at line ${start} does not match the vendored file`);
    lines.splice(at, now.length, ...then);
  }
  return lines.join('\n');
}

const recorded = Object.keys(record.files);
const patched = parsePatch(patch);

check('profiles/pi holds only the recorded vendored files and the recorded additions', () => {
  assert.deepEqual(walk(vendored).sort(), [...recorded, ...Object.keys(record.added)].sort());
});

check('the patch changes only recorded vendored files, each named by a difference or a test edit', () => {
  const named = new Set([...record.differences.flatMap((d) => d.files), ...record.test_edits.map((e) => e.file)]);
  assert.deepEqual([...patched.keys()].sort(), [...named].sort());
  for (const f of named) assert.ok(recorded.includes(f), `not a vendored file: ${f}`);
});

for (const name of recorded) {
  const { blob: want, mode, commit = record.commit } = record.files[name];
  const path = join(vendored, name);
  check(`${name} is ${commit}'s${patched.has(name) ? ' apart from the recorded differences' : ''}`, () => {
    assert.equal((statSync(path).mode & 0o777).toString(8), mode, 'file mode');
    const text = readFileSync(path, 'utf8');
    const original = patched.has(name) ? reverse(text, patched.get(name)) : text;
    assert.equal(blob(Buffer.from(original, 'utf8')), want, `git blob hash at ${commit}`);
  });
}

check('the profile names every recorded parameter, and only those', () => {
  const profile = readFileSync(join(vendored, 'sandbox/pi-sandbox.sb'), 'utf8');
  const used = new Set([...profile.matchAll(/\(param "(AG_[A-Z_]+)"\)/g)].map((m) => m[1]));
  assert.deepEqual([...used].sort(), record.differences.flatMap((d) => d.parameters ?? []).sort());
});

check('no message in the launcher or preamble names npm run bind', () => {
  for (const f of ['launchers/pi', 'sandbox/pi-sandbox-preamble.zsh']) {
    const messages = readFileSync(join(vendored, f), 'utf8').split('\n').filter((l) => /^\s*(emit|print)\b/.test(l));
    assert.deepEqual(messages.filter((l) => l.includes('npm run bind')), [], f);
  }
});

console.log(`${fails} failure(s)`);
process.exit(fails ? 1 : 0);
