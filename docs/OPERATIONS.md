# Installation and maintenance

These procedures describe stable 0.2.2. For everyday use, see the
[user guide](USAGE.md).

## Release channels

The latest stable release is
[0.2.4](https://github.com/ebrindley/AgentGuard/releases/tag/v0.2.4), for OpenCode,
Pi and Oh My Pi (OMP). Run the installer from Terminal outside any agent session
or sandbox:

```sh
/bin/zsh -c "$(/usr/bin/curl -fsSL https://github.com/ebrindley/AgentGuard/releases/latest/download/install.sh)"
```

`agent-guard update` follows stable releases, leaves a newer installed version
unchanged, and does not fetch changes on `main`. For a particular release, use
`releases/download/vVERSION/install.sh` in place of `releases/latest/download/install.sh`.
Rerunning a tagged installer reinstalls that release; it does not obtain later commits.

### Updating from 0.1.2 or 0.2.0

0.2.1 adds Pi/OMP installation and migration to the stable OpenCode release.
The installer enrolls Pi's guard when it detects Pi or OMP, including during
an OpenCode update. Pi/OMP require Node and executable locations outside their
writable folders; see [requirements](#requirements) and
[bindings](USAGE.md#pi-and-omp). If detection or binding fails, follow the
reported remedy outside the guard and rerun the update.

Compared with the 0.2.0 prerelease, 0.2.1 pins Pi/OMP state roots, protects
missing OpenCode configuration behind linked ancestors, improves diagnostics,
preserves uninstall recovery when harness ownership is unreadable, and reports
same-version migration-detection errors. The custom-wrapper template now names
`agent-guard wrapper add`.

Restart sessions after updating to apply the new Seatbelt profile. Pi/OMP's
`/reload` refreshes the extension; it cannot change a running process's sandbox.
Before downgrading to 0.1.2 or reinstating an older guard, run
`agent-guard uninstall`. Do not run an older installer over a 0.2.x installation.
See [recovery](#recovery-after-a-failed-or-interrupted-install) for interrupted updates.

To allow an existing projects folder without the prompt, append
`install.sh --projects ~/Projects` after the closing quote. This grants OpenCode
write access to that folder; Pi and OMP ignore the Guard List. From a checkout
or unpacked archive, `zsh install.sh [--projects DIR] [--gui]` installs that tree.
An existing Guard List is kept. Quit running agents before migrating either
older guard.

## Requirements

- macOS 15 or later. The installer uses only tools that ship with macOS and
  stops, naming the tool, if one is missing.
- OpenCode: the `opencode` CLI on PATH, in `/opt/homebrew/bin`, `/usr/local/bin`
  or `~/.opencode/bin`; for the app route, `OpenCode.app`, looked for in
  `/Applications` and `~/Applications`, then by its bundle ID. The OpenCode part
  is installed on every Mac; without the CLI or the app the checks that need
  them are skipped and say so.
- Pi and OMP, for their guard: Pi (`@earendil-works/pi-coding-agent`), OMP, or
  both, and a Node on PATH outside every folder a Pi session can write (a
  Homebrew Node, for example, not one under `~/.cache`). The bash analyzer runs
  on that Node for both runtimes. An OMP binary stored at `~/.local/bin/omp`
  must be moved out of `~/.local/bin` first, because the launcher takes that
  path.
- Terminal, outside any agent session or other sandbox, for install, update and
  uninstall.

## Installation

The command downloads the release's bootstrap, which downloads the release
archive and its checksum, verifies the SHA-256 sum and only then unpacks the
archive and runs its installer. The checksum comes from the same release as the
archive, so it detects a corrupted download or assets that do not belong
together. It does not prove who published them: whoever can replace the archive
can replace its checksum. The bootstrap itself is trusted code fetched over
HTTPS; nothing verifies it before it runs. A download cut short runs nothing.

The installer refuses, before any change, inside a guard or another sandbox,
while another install runs and over an install made before release folders (run
its `uninstall.sh` in the engine folder first). Over OpenCode Guard or
pi-sandbox-guard it migrates (below). It assembles the new release in
`~/Library/Application Support/AgentGuard/releases/<version>-<UTC time>`, builds
the app, and tests that release with `launch check staged` before it changes
anything outside the engine folder and `~/Agent Guard`. It then switches the
rulebook, the app, `current`, the plugin link, the OpenCode permission values
and the PATH blocks, and runs the gate: `agent-guard doctor` and a launch of
`opencode --version` through the new PATH shim. With Pi's guard, the staged
checks also test the new Pi files, the switch also replaces the Pi files at
their paths ([Pi and OMP](USAGE.md#pi-and-omp)), and the gate includes `doctor`'s Pi
checks, which run `pi --version` and `omp --version`. If any check fails, it puts
everything back, exits non-zero and names the failed checks; the previous
version keeps working. A configured plugin other than the guard's that fails to
load is a warning in these checks, not a failure
([Maintenance outside the guard](OPERATIONS.md#maintenance-outside-the-guard)). Only after the gate passes does it write the version
stamp and remove release folders older than the previous one, which stays for
OpenCode sessions started from it.

What an install does depends on what it finds on the Mac; `agent-guard update`
does the same when it installs:

- **Neither old guard:** a fresh install. When it finds Pi or OMP, it also
  places Pi's guard ([Pi and OMP](USAGE.md#pi-and-omp)).
- **OpenCode Guard:** it migrates OpenCode Guard
  ([Moving from OpenCode Guard](#moving-from-opencode-guard)), and places Pi's
  guard when it finds Pi or OMP.
- **pi-sandbox-guard:** it installs the OpenCode part and migrates
  pi-sandbox-guard ([Moving from pi-sandbox-guard](#moving-from-pi-sandbox-guard)).
- **Both:** one command migrates both, OpenCode Guard first, then
  pi-sandbox-guard, each in its own transaction with its own release ID, checks
  and rollback. When the first fails, or its retirement or cleanup does not
  finish, the command stops before pi-sandbox-guard and names it; the next
  install or `agent-guard update` finishes the first and then migrates
  pi-sandbox-guard.

Quit OpenCode, Pi and OMP before a migration; each migration stops, naming the
process, while its harness runs.

Installed layout: `current` links to the active release folder and `bin` to
`current/bin`, which holds `opencode`, `opencode-gui` and `agent-guard`.
`state/` (launch rules, the permission record, the stamp, the lock and an open
transaction) is outside the release folders.
`~/.config/opencode/plugins/agent-guard.js` is a link to
`current/profiles/opencode/plugin.js`. Each launch sets `AGENT_GUARD_RELEASE` to
its release ID; the plugin, loaded through `current`, then uses that release's
plugin; when that release is gone, it refuses every guarded tool with a message
to reopen OpenCode. With Pi's guard installed, `bin` also holds `pi` and `omp`,
links to the launchers in `~/.local/bin`, and `state/` holds the custom wrapper
records and what a pi-sandbox-guard migration retired; Pi's own files are listed
under [Pi's files](#pis-files).

## Moving from OpenCode Guard

Run the appropriate installer under [Release channels](#release-channels).
When it finds any part of OpenCode Guard (v1.0.0 or later), it replaces it
without running OpenCode Guard's uninstaller:

1. Quit the OpenCode app and every `opencode` in a terminal first. The installer
   stops while one runs, and names it.
2. It shows the entries of `~/OpenCode Guard/Guard List.txt` and asks
   `Import this list? [y/N]`. Yes copies it unchanged to
   `~/Agent Guard/Guard List.txt`; no, or no terminal, stops with nothing changed.
   An existing `~/Agent Guard/Guard List.txt` is never changed.
3. It keeps OpenCode Guard's permission record, so `agent-guard uninstall` can
   still put back the values you had before OpenCode Guard, and writes no
   permission value. It reports each value you changed after installing OpenCode
   Guard; those stay as you set them.
4. It tests the new release, then switches the PATH blocks, the plugin
   (`opencode-guard.js` becomes `agent-guard.js` in one rename, so OpenCode never
   sees both or neither), the app (`OpenCode Guard.app` goes; drag
   `Agent Guard.app` to the Dock in place of its Dock item) and the rulebook. If a
   check after the switch fails, OpenCode Guard is put back as it was.
5. It then removes the rest of OpenCode Guard: its rulebook and `rule.json`
   entry, and `launch`, `profile.sb`, `uninstall.sh`, `vendor/` and `state/` in
   `~/Library/Application Support/OpenCodeGuard`. If that fails (for example
   `rule.json` cannot be written), Agent Guard stays active, the installer exits
   1 and says what to fix; the next install or `agent-guard update` finishes it.

What stays in `~/OpenCode Guard`: the old list, which is no longer read, its log,
any `permissions-backup.json`, and a note, `Moved to Agent Guard.txt`. Nothing
else there is changed or removed.

An imported list keeps its introductory text. It may still say `OpenCode Guard
List` and point to `last-launch.log`; older lists may also lack the broad-read
explanation. You can update the text above the first heading without changing
the policy entries. Agent Guard writes its log to
`~/Agent Guard/last-launch-opencode.log`. Reads remain broad unless denied,
including when the READ ONLY section is empty.

Terminal windows opened before the switch still have OpenCode Guard's `bin`
folder on their PATH. Its `opencode` and `opencode-gui` are then forwarders, links
to Agent Guard's, so those windows run OpenCode under Agent Guard. The forwarders
and `~/Library/Application Support/OpenCodeGuard` are removed by the first
`agent-guard update` (or install) after the Mac restarts; if the boot time cannot
be read they stay. `agent-guard uninstall` removes them at once.

The way back: `agent-guard uninstall`, then OpenCode Guard's own `install.sh`.
Uninstall puts back, from the imported record, the values you had before
OpenCode Guard wherever the current value is still the one OpenCode Guard wrote,
so OpenCode Guard's installer records those as the originals again. It keeps
`~/OpenCode Guard` and `~/Agent Guard` and, if a value cannot be restored, saves
both records in `~/Agent Guard`.

## Moving from pi-sandbox-guard

Use the 0.2.0 prerelease installer below. `agent-guard update` follows the stable
channel, which does not yet include Pi or OMP. When Agent Guard does not guard Pi yet and finds any part of
pi-sandbox-guard (a `pi` or `omp` in `~/.local/bin` that names
pi-sandbox-guard, `pi-sandbox.sb` or `pi-sandbox-preamble.zsh` there, the
extension folder `~/.pi/agent/extensions/pi-sandbox-guard/`, or
`~/.config/pi-sandbox-guard/executables.conf`), it takes those files over at the
same paths. It does not run pi-sandbox-guard's npm scripts:

1. Quit every Pi and OMP session first. The installer stops while one runs, and
   names it. A Pi session's process is `node`, so it looks for processes that run
   the Pi and OMP executables, not for a process named `pi`. When it cannot list
   processes, it stops and asks to be run outside any sandbox. It checks again
   just before the switch.
2. It assembles the new launchers, profile, preamble and extension, with your
   existing `.guard-node`, checks the bindings in `executables.conf` and
   `.guard-node`, and runs the profile's self-test against the staged copies.
3. It imports your custom wrappers from pi-sandbox-guard's launcher stamp: their
   names, the names installed before and their hashes. The wrappers stay in
   `~/.local/bin`. A wrapper whose content no longer matches its recorded hash,
   or a name installed before that is still an executable file there, stops the
   install before the switch, with nothing changed, and is named. Restore or
   remove each file named, or deploy it again with pi-sandbox-guard, then run
   the install again; after the install, `agent-guard wrapper add` records a
   wrapper.
4. It replaces `pi-sandbox-preamble.zsh`, `pi-sandbox.sb`, `pi`, `omp` and the
   extension folder, each by a rename, then switches Agent Guard's own files. At
   every point of the switch, `pi`, `omp` and your wrappers run Pi under at least
   pi-sandbox-guard's protections or refuse; while the extension folder is being
   replaced they refuse, and a direct start of the real executable loads no
   extension.
5. It checks the result with `agent-guard doctor`, Pi's checks included, and
   `pi --version` and `omp --version` through Agent Guard's `bin`. If a check
   fails, pi-sandbox-guard's files are put back byte for byte.
6. It then retires pi-sandbox-guard: its original `pi`, `omp`, `pi-sandbox.sb`,
   `pi-sandbox-preamble.zsh` and extension folder (with `.deployed-version`), its
   launcher stamp and the backups it left, `~/.local/bin/<name>.bak.*` and
   `~/.pi/agent/extension-backups/`, move into
   `~/Library/Application Support/AgentGuard/state/legacy/pi-sandbox-guard/`,
   which no session can write. Nothing is deleted. `executables.conf` stays in
   place as the live bindings, and the analyzer's log stays at
   `~/.pi/agent/security-events.log`.

Afterwards, run Pi and OMP as before. `pi`, `omp` and your wrappers keep their
paths and pass their arguments through unchanged, and the launcher still prints
`OS sandbox ON` before Pi starts. Terminals opened before the switch reach the
new launcher at the same path. New terminals also find `pi` and `omp` in Agent
Guard's `bin`, which Agent Guard's PATH block puts first, so for `pi` and `omp`
`~/.local/bin` no longer has to come before the real executables on PATH.
Wrappers are found by name only through `~/.local/bin`. The PATH block is new on
a Mac that had only pi-sandbox-guard, and so is the OpenCode part of Agent
Guard, which is installed on every Mac.

Agent Guard's commands replace pi-sandbox-guard's:

| pi-sandbox-guard | Agent Guard |
|---|---|
| `npm run setup`, `deploy`, `deploy:all` | the one-line install and `agent-guard update` |
| `npm run deploy:launchers -- --extra-launchers <dir>` | `agent-guard wrapper add` |
| `npm run bind` | `agent-guard bind` |
| `npm run status`, `check:path`, `preflight` | `agent-guard doctor` |

pi-sandbox-guard's checkout is no longer used. Its deploy scripts write the
same paths: run after the switch, they replace Agent Guard's files, and
`agent-guard version` and `agent-guard doctor` report those files as changed.
What changes in Pi and OMP sessions is under [Pi and OMP](USAGE.md#pi-and-omp).

The way back: `agent-guard uninstall`. It first copies the retired files to
`~/Agent Guard/pi-sandbox-guard-legacy/`, removes Agent Guard's Pi files and
prints the steps that reinstate pi-sandbox-guard from that copy: its `pi`, `omp`,
`pi-sandbox.sb` and `pi-sandbox-preamble.zsh` back into `~/.local/bin` and its
extension folder back into `~/.pi/agent/extensions/`, or `npm run setup` in a
pi-sandbox-guard checkout. It does not reinstate pi-sandbox-guard itself.
`executables.conf`, the analyzer's log and your wrappers stay where they are.

## Pi's files

Pi's guard stays where pi-sandbox-guard puts it:

- `~/.local/bin/pi` and `~/.local/bin/omp`: identical copies of the launcher,
  which takes its runtime from its own file name, with `pi-sandbox.sb` and
  `pi-sandbox-preamble.zsh` beside them, and your custom wrappers;
- `~/.pi/agent/extensions/pi-sandbox-guard/`: the extension and its analyzer,
  and `.guard-node`, the path of the Node the analyzer runs on;
- `~/.config/pi-sandbox-guard/executables.conf`: the Pi, OMP and Node
  executables the launcher runs (`agent-guard bind`);
- `~/.pi/agent/security-events.log`: the analyzer's log of flagged commands.
  Pi sessions can write it but not read it, so a session can also empty or
  overwrite it; it is not an append-only record.

Agent Guard's version stamp records the hashes of the launchers, the profile,
the preamble and the extension's code, not of `.guard-node`;
pi-sandbox-guard's own stamps, `.pi-sandbox-launchers-version` and
`.deployed-version`, are not written. In the engine folder, `bin/pi` and
`bin/omp` link to the launchers, `state/wrappers.json` holds the wrapper records
and `state/legacy/` holds what a pi-sandbox-guard migration retired and what a
fresh install replaced in `~/.local/bin`. Pi sessions cannot write any of these
files except the log. With Pi's guard installed, OpenCode sessions cannot write
the launchers, profile, preamble, recorded wrappers, extension folder or
`executables.conf`, even under an ALLOW entry that covers them, because they run
outside the sandbox at the next Pi start. Nor can they create or change
`~/.local/bin/pi-sandbox-guard-extension`: the launcher loads the `index.ts` in
that folder in place of the installed extension whenever it exists. Two link
cases are not covered; see [SECURITY.md](../SECURITY.md#opencode). OpenCode
sessions also cannot create or change a `.pi` or `.omp` folder anywhere, even
under an ALLOW entry: Pi loads a trusted project's `.pi`, and OMP loads `.omp`
from the project and its parents without asking. Where either name in the
launch folder is a link, its target is protected too.

On a Mac without pi-sandbox-guard, the installer places these files when it finds
Pi or OMP. The analyzer's Node is the `node` on PATH, refused when it lies in a
folder Pi sessions can write, and recorded as its Homebrew `opt` link when it has
one, so a formula upgrade needs no new binding. A file already at
`~/.local/bin/pi` or `omp` that is not pi-sandbox-guard's, such as npm's `pi`
link for an npm prefix of `~/.local`, gives way to the launcher. The launcher's
PATH does not include `~/.local`, so before the switch the installer resolves
the entry to the executable it names, checks it as `agent-guard bind` does and
records it in `executables.conf`. The entry is kept as it was, a link with its
original target, in `state/legacy/replaced/`, and the install reports it. When
the entry is itself the executable, such as an OMP binary stored at
`~/.local/bin/omp`, or cannot be resolved and checked, the install stops before
the switch and names what to do.

## Updates and sessions

An installation that updates Pi, including a tagged prerelease install,
replaces the Pi files by renames and does not wait for Pi or OMP sessions to
end. A running session keeps the profile it started with and the extension it
loaded; `/reload` loads the extension now on disk.

## Commands

- `agent-guard doctor` runs each installed harness's checks: OpenCode's installed
  self-test and, with Pi's guard installed, Pi's checks:
  - everything pi-sandbox-guard's `npm run status` and `npm run check:path`
    checked, comparing the installed Pi files with the stamp's hashes;
  - the profile's self-test, the analyzer's preflight, and one allowed and one
    blocked command through the installed extension;
  - that `pi`, `omp` and each recorded wrapper resolve, in a login shell, to the
    installed files, which also catches an npm update that put a real `pi` back
    in `~/.local/bin`;
  - that the bindings in `executables.conf` and `.guard-node` are still usable;
    a stale binding fails;
  - each recorded wrapper's hash, and earlier wrapper names that are still
    executable;
  - `PI_CODING_AGENT_DIR` and `PI_PACKAGE_DIR`, which move Pi's folders,
    reported when set;
  - `pi --version` and `omp --version`, run from a scratch project in the temp
    folder, because Pi refuses home as a project. A runtime that is not
    installed is skipped and named.

  Without the `opencode` CLI, the OpenCode plugin check is skipped and named.
  A passing `doctor` with that skip does not verify that the desktop app loads
  the guard plugin. The CLI is not required to launch the guarded desktop app.

  `agent-guard doctor --json` prints the results as JSON. With Pi's guard
  installed it keeps the fields of pi-sandbox-guard's `npm run status -- --json`,
  such as `runtime_binding`, `pi_binding` and `drift`, with the same meaning.
- `agent-guard version` prints the version, tag, commit, release ID and install
  time from the stamp, then each file and link the stamp records that changed or
  went missing, and each file added to the release folder. With Pi's guard
  installed, the recorded files include `pi`, `omp`, `pi-sandbox.sb` and
  `pi-sandbox-preamble.zsh` in `~/.local/bin` and the extension's code. It does
  not check `.guard-node`, `executables.conf` or the custom wrappers, whose
  hashes `agent-guard doctor` checks, and it does not notice a file added
  outside the release folder, such as in the extension folder. It exits 1 if
  anything drifted.
- `agent-guard update` installs the latest stable release the same way as the
  one-liner, with the same checks and rollback. When the installed release is
  the latest, it installs it again only to finish a migration or retirement that
  is still pending or to add a harness found on this Mac that the install does
  not include yet, for example Pi installed after Agent Guard. Otherwise, and
  when the installed release is newer, it does nothing apart from removing the
  forwarders at OpenCode Guard's old command paths once the Mac has restarted
  since the migration.
  A migration-detection error returns failure with its diagnostic; it is not
  reported as current. It does not fetch prereleases. To install a prerelease, rerun the installer for that tag under
  [Release channels](#release-channels).
- `agent-guard uninstall` first checks that the stamp identifies the installed
  harnesses. An unreadable or invalid ownership record stops uninstall and keeps
  the guard and saved replacement entries; restore the stamp from a backup
  before retrying.
  Valid 0.1.x stamps without a harness list still mean OpenCode alone. It removes PATH blocks, restores the permission values
  the installer changed (unless you changed them since), then removes the app,
  the rulebook, after a migration the forwarders, then the plugin and the engine
  folder. `~/Agent Guard` stays. A value it could not restore is reported, and
  the permission record is saved to `~/Agent Guard/permissions-backup.json` first
  (OpenCode Guard's, after a migration, to
  `~/Agent Guard/opencode-guard-permissions.json`). With Pi's guard installed it
  also removes `pi`, `omp`, `pi-sandbox.sb` and `pi-sandbox-preamble.zsh` from
  `~/.local/bin` and the extension folder, and puts back an entry that a fresh
  install replaced in `~/.local/bin`, as the link it was. A `pi` or `omp` there
  that is no longer the guard's launcher is left as it is, and its replaced entry
  is not put back. Replaced entries it does not put back, and earlier ones kept
  under a time suffix, are copied to `~/Agent Guard/pi-replaced-<time>/`, and it
  prints where. After a pi-sandbox-guard migration it first copies the retired
  files to `~/Agent Guard/pi-sandbox-guard-legacy/` and prints how to reinstate
  pi-sandbox-guard from there ([Moving from pi-sandbox-guard](#moving-from-pi-sandbox-guard));
  if that copy or the copy of replaced entries fails, it keeps the engine folder
  and exits 1. It leaves `executables.conf`, the analyzer's log and your custom
  wrappers, and names the wrappers it leaves. A wrapper then runs whatever `pi`
  is beside it: Pi unguarded when an npm `pi` was put back, or an error when
  there is none. What it leaves on purpose, the wrappers, a `pi` or `omp` that is
  not the guard's and the copied entries, is reported as a warning and does not
  change the exit status. It exits 1 when a step fails, a PATH block or file
  cannot be removed or a permission value cannot be restored, and names it. A
  step that fails before the engine folder is removed keeps it, so `agent-guard
  uninstall` can run again. Uninstall removes the engine folder by renaming it
  to `~/Library/Application Support/.AgentGuard.removing` and then deleting
  that. If the rename fails, the engine folder stays and `agent-guard uninstall`
  can run again; if the deletion fails, delete `.AgentGuard.removing` by hand.
  The other three are reported after the engine folder is removed, so
  finish them by hand: remove the named PATH blocks and files, and restore the
  named permission values from `~/Agent Guard/permissions-backup.json`, where
  the original settings are saved.
- `agent-guard bind` records the Pi, OMP and Node executables the Pi launcher
  runs, in `~/.config/pi-sandbox-guard/executables.conf`, the file the launcher
  reads; no environment variable selects another. It has `npm run bind`'s
  modes: `--detect` proposes the installs it finds and records them once you
  confirm; `--pi`, `--omp` and `--node` record absolute paths, `--node` being the
  interpreter for a Pi that is a Node script; `--show` prints the bindings;
  `--check` exits 3 when one is missing or stale. `--checker-node` records the
  Node the analyzer runs on, in the extension's `.guard-node`. The launcher
  refuses a stale binding and names this command. Bind again after an upgrade
  that moves an executable, such as a new Node under a version manager.
  `bind` needs Pi: on a Mac with OMP and no Pi binding, `--detect` stops because
  it finds no Pi, and `--omp` stops with `no Pi path supplied or previously
  recorded`. There, the install records OMP when it replaces an `omp` in
  `~/.local/bin`; otherwise the launcher looks for `omp` on its own PATH. To
  fix a stale OMP binding on such a Mac, set the `omp=` line in
  `executables.conf` to the OMP executable's full path in Terminal, then run
  `agent-guard doctor`, which reports a binding the launcher refuses. Deleting
  the line instead works only for an `omp` in `/opt/homebrew/bin`,
  `/usr/local/bin` or the system folders, which make up the launcher's PATH; it
  does not find one in `~/.local/lib/omp` or `~/.bun/bin`.
- `agent-guard wrapper add FILE|FOLDER...` installs custom wrappers into
  `~/.local/bin`, `agent-guard wrapper remove NAME...` removes them, and
  `agent-guard wrapper list` shows the recorded and earlier names and whether
  each installed copy still matches its record
  ([Custom wrappers](USAGE.md#custom-wrappers)).

`update`, `uninstall` and `wrapper` refuse inside a guard or another sandbox.
Run `doctor` and `bind` from Terminal too: `doctor`'s OpenCode check refuses
inside a guarded OpenCode session, and no session can write `bind`'s files.

## Diagnostic coverage

`agent-guard doctor` checks installed components, not every project or every
possible command. It checks OpenCode plugins from the global configuration and
`~/.opencode`, not plugins named only in a project's configuration. Read the
warnings and skipped checks as well as the exit status. Inside guarded OpenCode,
`agent_guard_status` reports whether Agent Guard is active and names its release.

CC Safety Net 2.4.14's standalone `cc-safety-net doctor` looks for its package
in OpenCode's plugin configuration. It does not recognize Agent Guard's
file-based wrapper plugin, so it can report "No integration configured" even
when Agent Guard is active. That result does not establish whether the guard
is active; use `agent-guard doctor` outside the guard, noting any skipped
checks, and `agent_guard_status` in the guarded OpenCode session.

CC Safety Net's synthetic self-test uses three fixed commands, no custom
rules, and the standard baseline with `fail_closed`, `paranoid_rm` and
`paranoid_interpreters` off. Its allowed result for `rm -rf ./node_modules`
does not test Agent Guard's effective policy, which uses at least the strict
preset, scoped deletion allowances and registered custom rules.

## Recovery after a failed or interrupted install

A failed check is undone at once: the installer prints what failed and the
previous version stays active. A first install that fails leaves no engine
folder.

An install, update or uninstall that was interrupted (Terminal closed, the Mac
restarted, the process killed) leaves its journal in
`~/Library/Application Support/AgentGuard/state/txn`. The next install,
`agent-guard update` or `agent-guard uninstall` finishes it first: a run stopped
before the switch is discarded; one stopped during the switch is completed and
checked (install, update) or rolled back (uninstall, or a rollback that had
begun); one stopped after the stamp has its cleanup finished. `agent-guard
doctor` does not recover. "another Agent Guard install is running" means a live
run holds the lock; a lock left by a process that is gone is taken over.

OpenCode does not start, from the terminal or the app, when one of the records
it reads in `~/Library/Application Support/AgentGuard` exists but cannot be
read, is empty, holds more than one JSON document or is malformed:
`state/txn/plan.json` or `state/stamp.json` (`cannot read the installed
harnesses in …`), and, with Pi's guard installed, `state/wrappers.json`
(`cannot read Pi's recorded wrappers in …`). The message names the file. No
session can write these records, so the file was damaged outside the guard.
From Terminal:

- `state/stamp.json`: run the installer for the installed release again; it
  writes a new stamp. Use its explicit tag under [Release channels](#release-channels).
  `agent-guard update` may report the release as current and leave the stamp
  as it is. A stamp the install cannot read, or one that is a link to a missing
  file, stops the install too; report it in an issue.
- `state/wrappers.json`: install and update do not rewrite it. Remove it, then
  record each wrapper again with `agent-guard wrapper add ~/.local/bin/NAME`.
- `state/txn/plan.json`: nothing in Agent Guard repairs it. Install, update and
  uninstall stop with `the interrupted run in … could not be finished; it is
  kept for the next run`. Report it in an issue with that output; do not
  remove `state/txn`, which holds what recovery needs to finish or undo the
  interrupted run.

Power loss is a limit: macOS shell tools cannot force a write to disk, so after
a power cut during the switch a change can be lost or reach the disk before the
journal line that names it. Recovery restores from its backups; a permission
value whose change was lost is treated as your edit, left unchanged and
reported. Check `agent-guard version` and `agent-guard doctor` afterwards.

## Running OpenCode without the guard

Started without the guard, the plugin refuses every tool except a few that do
not touch files ([design](DESIGN.md#5-inner-layer)). Set
`AGENT_GUARD_BYPASS=1` in OpenCode's environment to lift that refusal. OpenCode
Guard's `OPENCODE_GUARD_BYPASS` is no longer honored.

## Running Pi or OMP without the guard

Started directly, for example as `/opt/homebrew/bin/pi`, Pi runs without
Seatbelt. It still loads the guard's extension from `~/.pi/agent/extensions/`:
the extension prints a `FILTER-ONLY` warning and its bash analyzer still checks
`bash` commands. Nothing else applies, and `pi -ne` (no extensions) removes the
analyzer too. A direct start of OMP may load the extension in the same way.
The current Pi guard does not refuse tools in such a session, where OpenCode's plugin
refuses them
([Running OpenCode without the guard](OPERATIONS.md#running-opencode-without-the-guard)).
`AGENT_GUARD_BYPASS` has no effect on Pi or OMP.

As with pi-sandbox-guard, some maintenance needs the real executable, run
directly in Terminal, with your account's full authority: installing, updating
and removing Pi packages, and editing Pi's settings, system prompts, skills and
`models.json`; for OMP, updates, plugin installs and XDG-split state folders.
Inside the guard these writes are denied, and a package missing at start or at
`/reload` cannot be installed. Pi's OAuth logins stop at their first refresh
inside a session, because `auth.json` is write-protected; pi-sandbox-guard
behaves the same.

An update of a Pi installed with npm's prefix at `~/.local` can put npm's `pi`
back in `~/.local/bin` in place of the launcher; `pi` then starts Pi unguarded.
`agent-guard doctor` reports it.

## Maintenance outside the guard

Inside the guard, OpenCode can read and run the code and configuration it keeps
in its cache, but cannot write, create, remove, rename or replace them:

- the npm package store, `~/.cache/opencode/packages`, which holds configured
  plugins and npm language servers such as TypeScript's;
- the legacy store, `~/.cache/opencode/node_modules`, with `package.json`,
  `package-lock.json` and `bun.lock` beside it;
- `~/.cache/opencode/bin`, where OpenCode keeps ripgrep and the language servers
  it downloads;
- the model catalog, `~/.cache/opencode/models.json`, or `models-<hash>.json`
  when `OPENCODE_MODELS_URL` names another source.

When `XDG_CACHE_HOME` is set, the same paths under `$XDG_CACHE_HOME/opencode` are
protected too. A launch refuses when `XDG_CACHE_HOME` is set but is not an
existing folder named by its full path. The rest of `~/.cache` stays writable.
OpenCode creates `bin` at every start and stops when it cannot, so the launch
creates it when it is missing. Pi and OMP sessions cannot write these paths
either; see [Pi and OMP](USAGE.md#pi-and-omp).

Installing, updating and repairing these happens outside the guard, by running
OpenCode's real executable directly. That runs with your account's full
authority, and what it installs runs in every later OpenCode session, guarded or
not, so install only what you trust. `which -a opencode` lists the real
executable after Agent Guard's own `opencode` (for example
`/opt/homebrew/bin/opencode`); `<opencode>` below stands for it.

- **Plugins.** `<opencode> plugin <package> --global` installs a plugin into the
  store and adds it to the global config; `--force` replaces the installed
  version. Inside the guard, a configured plugin missing from the store cannot be
  installed: OpenCode reports "Failed to install plugin <package>@<version>", and
  `agent-guard doctor` fails and names it. The installer's checks, which also run
  in `agent-guard update`, report a configured plugin that fails to install, load
  or start as a warning and pass, so a broken plugin in your configuration does
  not roll back an install or block an update. They still fail when the guard's
  own plugin does not load.
- **npm language servers** (TypeScript, Pyright, Vue, Svelte, Astro, Bash, YAML,
  Dockerfile, PHP Intelephense and Biome in OpenCode 1.18.34). OpenCode starts
  language servers only when `lsp` is enabled in its config. Run
  `<opencode> debug lsp diagnostics <file>` on a file of that language inside a
  project; OpenCode installs the server into the store. Inside the guard a server
  missing from the store is skipped without a message.
- **ripgrep.** OpenCode's grep and glob tools run `rg` from PATH, else `bin/rg`,
  else download it into `bin`, which fails inside the guard. Install ripgrep on
  PATH, for example with `brew install ripgrep`. `agent-guard doctor` warns when
  `rg` is in neither place.
- **Language servers OpenCode downloads into `bin`** (gopls, RuboCop, ElixirLS,
  ESLint's server, zls, clangd, F# `fsautocomplete`, JDT LS, the Kotlin and Lua
  servers, terraform-ls, TexLab and Tinymist in OpenCode 1.18.34): run
  `<opencode> debug lsp diagnostics <file>` as above, or install the server on
  PATH. Inside the guard such a server is skipped without a message, so it is
  unavailable until it is installed outside the guard.
- **Model catalog.** `<opencode> models --refresh`. Inside the guard, OpenCode
  still fetches a new catalog at start when the one on disk is older than five
  minutes, and on `opencode models --refresh`, but cannot rename it into place.
  It logs the failure and keeps using the catalog on disk, or its bundled list
  when there is none; `opencode models --refresh` still prints "Models cache
  refreshed". The catalog changes only when OpenCode runs outside the guard.

Not covered: a catalog named by `OPENCODE_MODELS_PATH`, which OpenCode reads in
place of the protected one, and anything written to the store, `bin` or the
catalog before 0.1.2, which is not checked. npm configuration in the cache is
writable too: with `~/.cache/node_modules` or `~/.cache/package.json` present,
an install of a new plugin or npm language server reads `~/.cache/.npmrc`, which
can name another registry. Before installing, check that `~/.cache` (and the
folders above a relocated cache) hold no `.npmrc`, `node_modules` or
`package.json` you did not put there. `agent-guard doctor` checks the
plugins OpenCode loads outside any project, that is, from the global config and
`~/.opencode`; plugins named only in a project's config are not checked.

## OpenCode skill preparation

0.2.2 uses a launch-scoped preparation worker and protected checker
snapshots. The shared legacy rulebook remains for older sessions and independent
checker consumers. See [OpenCode skills](SKILLS.md). Existing skill files and
containers are retained during uninstall.
