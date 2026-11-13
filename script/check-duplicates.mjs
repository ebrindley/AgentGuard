#!/usr/bin/env node
// Fails when a block of MIN or more consecutive non-trivial lines appears in two
// places in the tracked shell and JavaScript sources, and prints both places.
// Move a shared block into a helper; allow a pair of files below only when they
// must keep separate copies.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MIN = 8;
const roots = ['engine/', 'installer/', 'profiles/', 'scripts/', 'script/', 'test/'];
// Vendored and generated files.
const excluded = ['engine/vendor/', 'test/fixtures/', '.build-project/'];
// [file, file, why the two cannot share code]
const allowed = [
  ['engine/account.zsh', 'engine/launch', 'launch resolves the account before it reads any file; test/test.sh checks the copies match'],
];

const root = new URL('..', import.meta.url).pathname;
const files = execFileSync('git', ['ls-files', '-z', '--', ...roots], { cwd: root, encoding: 'utf8' })
  .split('\0').filter((f) => f && !excluded.some((x) => f.startsWith(x)));

// Lines with no logic of their own: blanks, comments, closers and bare keywords.
const trivial = /^(?:#.*|\/\/.*|\/?\*.*|[{}()[\];,]*|(?:fi|done|esac|else|then|do|;;|return|break|continue)[;}]*)$/;
const isAllowed = (a, b) => allowed.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

const seen = new Map();
const found = [];
let scanned = 0;
for (const file of files) {
  const text = readFileSync(`${root}${file}`, 'utf8');
  if (!/\.(?:m?js|z?sh)$/.test(file) && !/^#!.*\b(?:zsh|sh|bash|node)\b/.test(text)) continue;
  scanned++;
  const lines = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim().replace(/\s+/g, ' ');
    if (!trivial.test(line)) lines.push({ line, at: i + 1 });
  });
  // A window that follows a reported one continues the same block.
  let inBlock = false;
  for (let i = 0; i + MIN <= lines.length; i++) {
    const key = lines.slice(i, i + MIN).map((l) => l.line).join('\n');
    const first = seen.get(key);
    if (!first) { seen.set(key, { file, index: i, at: lines[i].at }); inBlock = false; continue; }
    const repeat = !(first.file === file && i - first.index < MIN) && !isAllowed(first.file, file);
    if (repeat && !inBlock) found.push(`${first.file}:${first.at} and ${file}:${lines[i].at}`);
    inBlock = repeat;
  }
}

if (found.length) {
  console.error(`Blocks of ${MIN} or more identical lines in two places:`);
  for (const pair of found) console.error(`  ${pair}`);
  process.exit(1);
}
console.log(`No block of ${MIN} or more lines repeats in ${scanned} source files`);
