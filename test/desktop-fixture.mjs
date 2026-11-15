// Stand-ins for the OpenCode desktop app update (profiles/opencode/update.zsh): a
// bundle whose signature facts are files in it, the archive and update-service reply
// for it, and the three tools whose absolute paths a test copy replaces, because
// codesign and spctl cannot pass for a stand-in bundle and od would read its script.
import { createHash } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { quote } from './fixture-home.mjs';

export const identifier = 'ai.opencode.desktop';
export const team = 'TEAM123456';
export const requirement = (id = identifier, who = team) => `identifier "${id}" and anchor apple generic and certificate leaf[subject.OU] = "${who}"`;
const arm64 = Buffer.from('cffaedfe0c000001', 'hex');

// A bundle folder at dir. Its signature is the files Contents/team and Contents/dr
// (the stand-in codesign prints them); Contents/badsig makes verification fail and
// Contents/rejected makes the Gatekeeper assessment fail. The executable holds
// the Mach-O header of an arm64 binary, or the script when one is given (the
// tools' od then stands in for the header). cli is the script of the bundled CLI.
export function bundle(dir, { version = '2.3.0', id = identifier, exec = 'AgFakeApp', who = team, dr = requirement(), script, cli, files = {} } = {}) {
  mkdirSync(join(dir, 'Contents/MacOS'), { recursive: true });
  mkdirSync(join(dir, 'Contents/Resources'), { recursive: true });
  writeFileSync(join(dir, 'Contents/Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>${exec}</string><key>CFBundleIdentifier</key><string>${id}</string><key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>`);
  writeFileSync(join(dir, 'Contents/MacOS', exec), script ?? arm64);
  chmodSync(join(dir, 'Contents/MacOS', exec), 0o755);
  if (cli) {
    writeFileSync(join(dir, 'Contents/Resources/opencode-cli'), cli);
    chmodSync(join(dir, 'Contents/Resources/opencode-cli'), 0o755);
  }
  writeFileSync(join(dir, 'Contents/team'), who);
  writeFileSync(join(dir, 'Contents/dr'), dr);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
}

// The archive of a bundle built under folder, as the update service serves it:
// the app's folder at the top level, named name.
export function archive(folder, options, name = 'OpenCode.app') {
  const dir = join(folder, 'archive');
  rmSync(dir, { recursive: true, force: true });
  bundle(join(dir, name), options);
  const zip = join(folder, 'update.zip');
  rmSync(zip, { force: true });
  const made = spawnSync('/usr/bin/ditto', ['-c', '-k', '--keepParent', join(dir, name), zip], { encoding: 'utf8' });
  if (made.status !== 0) throw new Error(made.stderr);
  const body = readFileSync(zip);
  return { body, sha256: createHash('sha256').update(body).digest('hex'), size: body.length };
}

// The update service's reply for a desktop release at version, with the archives'
// entries for both architectures given by file (the arm64 one is the real entry).
export function feed(base, version, { sha256, size, url = `${base}/files/opencode-desktop-mac-arm64.zip` }) {
  const entry = (name, hash, bytes, address) => [name, { url: address, sha256: hash, size: bytes }];
  return {
    channel: 'latest', name: 'desktop', distribution: 'opencode', version,
    metadata: { files: Object.fromEntries([
      entry('opencode-desktop-mac-arm64.zip', sha256, size, url),
      entry('opencode-desktop-mac-x64.zip', '0'.repeat(64), 1, `${base}/files/opencode-desktop-mac-x64.zip`),
      entry('opencode-desktop-win-x64.exe', '1'.repeat(64), 1, `${base}/files/opencode-desktop-win-x64.exe`),
    ]) },
  };
}

// Every path and its content or link target, for a before and after comparison.
export function snapshot(dir) {
  const out = {};
  const walk = (path, rel) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) out[rel] = `link ${readlinkSync(path)}`;
    else if (stat.isDirectory()) { out[rel] = `dir ${(stat.mode & 0o777).toString(8)}`; for (const name of readdirSync(path).sort()) walk(join(path, name), `${rel}/${name}`); }
    else out[rel] = `file ${(stat.mode & 0o777).toString(8)} ${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
  };
  walk(dir, '.');
  return out;
}

// The stand-in tools, written into folder. Returns the argument list for seams().
export function tools(folder) {
  const script = (name, body) => { writeFileSync(join(folder, name), `#!/bin/zsh -f\n${body}\n`); chmodSync(join(folder, name), 0o755); return join(folder, name); };
  return {
    codesign: script('codesign', `app=\${@[-1]}
case "$*" in
  *'-d -r-'*) print -r -- "designated => $(<$app/Contents/dr)" ;;
  *'-d --verbose=2'*) print -u2 -- "Executable=$app/Contents/MacOS/x"; print -u2 -- "TeamIdentifier=$(<$app/Contents/team)" ;;
  *)
    [[ ! -e $app/Contents/badsig ]] || exit 1
    for a in "$@"; do [[ $a != -R=* || \${a#-R=} == "$(<$app/Contents/dr)" ]] || exit 3; done ;;
esac`),
    spctl: script('spctl', '[[ ! -e ${@[-1]}/Contents/rejected ]]'),
    od: script('od', 'print -r -- " cf fa ed fe 0c 00 00 01"'),
  };
}

// The text of a profile file with the absolute paths of those tools replaced;
// od stays the system's unless script is set.
export function seams(text, stand, script = false) {
  const swapped = text.replaceAll('/usr/bin/codesign', quote(stand.codesign)).replaceAll('/usr/sbin/spctl', quote(stand.spctl));
  return script ? swapped.replaceAll('/usr/bin/od', quote(stand.od)) : swapped;
}
