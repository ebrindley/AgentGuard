# Agent Guard

Guardrails for terminal coding agents on macOS. Each agent runs under a macOS Seatbelt sandbox, with a small profile and plugin per agent; the design moves every agent onto one engine and one allow and deny list. It replaces OpenCode Guard and pi-sandbox-guard.

Release 0.2.0 guards OpenCode, Pi and Oh My Pi (OMP), each in its own way until
Pi moves onto Agent Guard's engine (step 10d of the plan in
[docs/DESIGN.md](docs/DESIGN.md#12-plan)):

- **OpenCode** runs on Agent Guard's engine, under a profile generated from the
  Guard List at each launch. It is the OpenCode Guard v1.0.3 port, including the
  v1.0.4 fixes, under Agent Guard's own names, with OpenCode's package stores,
  `bin` folder and model catalog write-protected (see
  [Maintenance outside the guard](#maintenance-outside-the-guard)). It replaces an
  existing OpenCode Guard install (see
  [Moving from OpenCode Guard](#moving-from-opencode-guard)).
- **Pi and OMP** run under pi-sandbox-guard 7ad441f's launcher, Seatbelt profile
  and bash analyzer, installed at the paths pi-sandbox-guard uses, with five
  recorded differences (see [Pi and OMP](#pi-and-omp)). They do not read the
  Guard List. The installer replaces an existing pi-sandbox-guard install (see
  [Moving from pi-sandbox-guard](#moving-from-pi-sandbox-guard)).

The design is in [docs/DESIGN.md](docs/DESIGN.md).

The shared launcher and Seatbelt builder are in `engine/`. OpenCode's paths,
protected-name fragment, lifecycle hooks, plugin, and installation support are
in `profiles/opencode/`. The launcher resolves home from the macOS account
database, then loads `profiles/opencode/harness.zsh` only from the release
folder it runs from, which must be directly inside
`~/Library/Application Support/AgentGuard/releases/`. Ambient `HOME` and `USER`
cannot choose that profile, and a copy of the launcher elsewhere refuses to run.

Pi's guard is in `profiles/pi/`, in pi-sandbox-guard's layout: the launcher
(`launchers/pi`), the Seatbelt profile and the preamble that builds its
parameters (`sandbox/`), the extension with its bash analyzer (`src/`) and
pi-sandbox-guard's tests. The installer copies them to pi-sandbox-guard's paths.
Pi's launcher takes home from the system, its runtime from its own file name
(`pi` or `omp`) and its profile and preamble from its own folder,
`~/.local/bin`, not from a release folder.

`@project` and a Pi profile on the shared engine are planned.

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

## Install

In Terminal, outside any agent session, on macOS 15 or later:

```sh
/bin/zsh -c "$(/usr/bin/curl -fsSL https://github.com/ebrindley/AgentGuard/releases/latest/download/install.sh)"
```

To allow a projects folder without the prompt, add `install.sh --projects ~/Projects`
after the closing quote. The projects folder becomes an ALLOW entry in the
Guard List, which OpenCode reads and Pi and OMP do not. For a particular
release, replace `latest/download` with `download/v0.2.0`. From a checkout or an
unpacked archive, `zsh install.sh [--projects DIR] [--gui]` installs that tree
the same way.

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
their paths ([Pi and OMP](#pi-and-omp)), and the gate includes `doctor`'s Pi
checks, which run `pi --version` and `omp --version`. If any check fails, it puts
everything back, exits non-zero and names the failed checks; the previous
version keeps working. A configured plugin other than the guard's that fails to
load is a warning in these checks, not a failure
([Maintenance outside the guard](#maintenance-outside-the-guard)). Only after the gate passes does it write the version
stamp and remove release folders older than the previous one, which stays for
OpenCode sessions started from it.

What an install does depends on what it finds on the Mac; `agent-guard update`
does the same when it installs:

- **Neither old guard:** a fresh install. When it finds Pi or OMP, it also
  places Pi's guard ([Pi and OMP](#pi-and-omp)).
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
under [Pi and OMP](#pi-and-omp).

## Moving from OpenCode Guard

Run the same one-line install. When it finds any part of OpenCode Guard (v1.0.0
or later) it replaces it, without running OpenCode Guard's uninstaller:

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

Run the same one-line install, or `agent-guard update` where Agent Guard is
already installed. When Agent Guard does not guard Pi yet and finds any part of
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
What changes in Pi and OMP sessions is under [Pi and OMP](#pi-and-omp).

The way back: `agent-guard uninstall`. It first copies the retired files to
`~/Agent Guard/pi-sandbox-guard-legacy/`, removes Agent Guard's Pi files and
prints the steps that reinstate pi-sandbox-guard from that copy: its `pi`, `omp`,
`pi-sandbox.sb` and `pi-sandbox-preamble.zsh` back into `~/.local/bin` and its
extension folder back into `~/.pi/agent/extensions/`, or `npm run setup` in a
pi-sandbox-guard checkout. It does not reinstate pi-sandbox-guard itself.
`executables.conf`, the analyzer's log and your wrappers stay where they are.

## Pi and OMP

Run `pi` or `omp` from a project folder, as with pi-sandbox-guard. The launcher
prints a line that starts `OS sandbox ON`, then runs Pi or OMP, and every
process it starts, under `/usr/bin/sandbox-exec` with pi-sandbox-guard 7ad441f's
profile. Inside it the agent can write only to the project (`PI_PROJECT`, else
the Git top level, else the current folder), temp, Pi's state folder apart from
its configuration, the OMP runtime folders the profile lists, `~/.npm`,
`~/.cache` and `~/Library/Caches`. It cannot write Pi's or OMP's configuration,
extensions, packages, skills or system prompts, a project's `.pi` and `.omp`
folders and the extension, hook and tool folders OMP loads from `.claude`,
`.codex`, `.gemini` and `.opencode`, the project's active Git hooks or the
credential paths. It cannot read `~/.ssh`, `~/.aws/credentials`,
`~/.aws/config`, `~/.docker/config.json`, `~/.kube/config`, `~/.gnupg`,
`~/.config/gh`, `~/.config/gcloud`, Git's credential stores, `~/.netrc`,
`~/.npmrc`, `~/.secrets`, any `.env` file or the analyzer's log. The launcher
refuses a project that is too broad or sensitive, such as home, `~/Documents` or
`~/.config`, or that contains its own folder. The extension's bash analyzer
blocks destructive `bash` commands and asks before risky ones; it is advisory.
The full policy is in pi-sandbox-guard's
[SECURITY.md](https://github.com/ebrindley/pi-sandbox-guard/blob/7ad441f51c249eafe6f92d16e92d2fbf37622d67/SECURITY.md)
and
[ARCHITECTURE.md](https://github.com/ebrindley/pi-sandbox-guard/blob/7ad441f51c249eafe6f92d16e92d2fbf37622d67/docs/ARCHITECTURE.md).

Agent Guard 0.2.0 changes five things in Pi and OMP sessions. Each is recorded
in `test/fixtures/differences/pi.json` and has a test:

1. **Agent Guard's files, OpenCode's configuration and the shell startup files
   are write-protected:** the engine folder, `~/Agent Guard` (the Guard List),
   `~/Applications/Agent Guard.app`, OpenCode Guard's engine folder,
   `~/.config/opencode`, `~/.opencode`, `~/.cc-safety-net` apart from its `logs`,
   `~/Library/LaunchAgents`, and `.zshenv`, `.zprofile`, `.zshrc`, `.zlogin`,
   `.profile`, `.bash_profile`, `.bash_login` and `.bashrc` in home. Where one of
   them is a link, its target is write-protected too, and the folders above the
   target cannot be renamed or removed, so a session started in a dotfiles project
   cannot edit a `~/.zshrc` that links into it.
2. **Projects in those folders are refused:** a project that is, contains or is
   inside one of them, or is or is inside the target of one that is a link, is
   refused before Pi starts, as pi-sandbox-guard already refuses `~/.config` and
   `~/Library`.
3. **`open`, `osascript`, `osacompile`, `codesign`, `diskutil`, `launchctl` and
   `sudo` cannot run**, and opening apps and documents through Launch Services and
   creating launchd jobs are denied, as in OpenCode sessions.
4. **OpenCode's package stores, `bin` folder and model catalog are
   write-protected** under `~/.cache` and under `XDG_CACHE_HOME`, which Pi's
   `~/.cache` grant would otherwise leave open
   ([Maintenance outside the guard](#maintenance-outside-the-guard)). The launch
   creates `opencode/bin` at both roots before Pi starts, and refuses an
   `XDG_CACHE_HOME` that is not an existing folder named by its full path.
5. **Repair messages** name `agent-guard bind` instead of `npm run bind`.

A launch whose link targets and cache roots have more than 32 folders above them
to pin, for items 1 and 4, is refused with a message.

Until Pi moves onto Agent Guard's engine (step 10d), Pi's guard:

- **does not read the Guard List.** ALLOW, READ ONLY and DENY entries apply to
  OpenCode only; a Pi or OMP session writes only where the profile above allows,
  and a DENY entry does not stop it reading a path.
- **does not refuse anything when Pi or OMP starts outside the guard.** A direct
  start runs the bash analyzer at most, and `pi -ne` removes that too
  ([Running Pi or OMP without the guard](#running-pi-or-omp-without-the-guard)).
- **checks only `bash`,** not Pi's file tools such as `read`, `edit` and
  `write`. Seatbelt still applies to every write.
- **trusts its own folder:** the launcher reads its profile and preamble from
  `~/.local/bin`, beside itself, rather than from a release folder inside the
  write-protected engine folder.
- **grants OMP the runtime folders pi-sandbox-guard observed on OMP 17.2.10.**
  They were not rechecked against later OMP versions.

Until step 10d, OpenCode's project config names (`opencode.json`,
`opencode.jsonc`, `tui.json`, `tui.jsonc` and `.opencode` outside
`.opencode/plugins`) are also writable in Pi and OMP sessions. Until step 10c, an
OpenCode session can write Pi's and OMP's configuration and `.pi` and `.omp`
folders where an ALLOW entry covers them. SECURITY.md lists these limits and the
pi-sandbox-guard defects kept until step 10d.

### Pi's files

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
cases are not covered; see [SECURITY.md](SECURITY.md#opencode).

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

### Updates and sessions

`agent-guard update` replaces the Pi files the same way, by renames, and does not
wait for Pi or OMP sessions to end. A running session keeps the profile it
started with and the extension it loaded; `/reload` loads the extension now on
disk.

### Custom wrappers

A custom wrapper is a script in `~/.local/bin` that hands off to the `pi` next to
it, `PI_SHIM="${0:A:h}/pi"` and then `exec "$PI_SHIM" "$@"`;
`profiles/pi/launchers/example-custom` is the template. Its arguments reach the
launcher unchanged, and Pi runs under the guard because the `pi` beside it is the
launcher.

`agent-guard wrapper add` checks every file before it installs any, as
pi-sandbox-guard's `--extra-launchers` did: a regular file, not a link; a name of
letters, digits, `.`, `_` and `-` that is not a duplicate and not reserved
(`pi`, `omp`, `opencode`, `opencode-gui` and `agent-guard`); and pi-sandbox-guard's
launcher check, which requires `#!/bin/zsh -f`, the hand-off to the `pi` next to
it and only permitted helpers before it. It installs a copy next to `pi`, keeps a
backup of a wrapper it replaces, and records the name and the copy's hash in
`state/wrappers.json`. `agent-guard wrapper remove` deletes a wrapper only when
its content still matches its recorded hash, and keeps its name as an earlier
name; a changed wrapper is reported and left in place. `agent-guard doctor`
checks each recorded hash and reports an earlier wrapper name that is still
executable.

### Running Pi or OMP without the guard

Started directly, for example as `/opt/homebrew/bin/pi`, Pi runs without
Seatbelt. It still loads the guard's extension from `~/.pi/agent/extensions/`:
the extension prints a `FILTER-ONLY` warning and its bash analyzer still checks
`bash` commands. Nothing else applies, and `pi -ne` (no extensions) removes the
analyzer too. A direct start of OMP may load the extension in the same way.
Until step 10d nothing refuses tools in such a session, where OpenCode's plugin
refuses them
([Running OpenCode without the guard](#running-opencode-without-the-guard)).
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

### Nested launches

- `pi` or `omp` started inside an OpenCode session refuses, as it refuses under
  any sandbox it cannot verify as its own.
- Inside a Pi or OMP session, `opencode` from the session's PATH runs the real
  OpenCode under that session's sandbox, as with pi-sandbox-guard. Agent
  Guard's `opencode` called by its full path fails at its first write.
- `omp` inside a Pi session and `pi` inside an OMP session refuse.
- A runtime started inside its own session, such as `pi` inside a Pi session,
  exits with `HOME_CANON: parameter not set`. This is a pi-sandbox-guard defect,
  kept until step 10d, that every Agent Guard install meets because it records
  `.guard-node`. It fails closed: nothing starts.

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
- `agent-guard update` installs the latest release the same way as the
  one-liner, with the same checks and rollback. When the installed release is
  the latest, it installs it again only to finish a migration or retirement that
  is still pending or to add a harness found on this Mac that the install does
  not include yet, for example Pi installed after Agent Guard. Otherwise, and
  when the installed release is newer, it does nothing apart from removing the
  forwarders at OpenCode Guard's old command paths once the Mac has restarted
  since the migration.
- `agent-guard uninstall` removes PATH blocks, restores the permission values
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
  uninstall` can run again. If removing the engine folder itself fails, what is
  left is `~/Library/Application Support/.AgentGuard.removing`, which you delete
  by hand. The other three are reported after the engine folder is removed, so
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
  ([Custom wrappers](#custom-wrappers)).

`update`, `uninstall` and `wrapper` refuse inside a guard or another sandbox.
Run `bind` from Terminal too: no session can write its files.

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

- `state/stamp.json`: run the one-line install again; it writes a new stamp.
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
not touch files ([docs/DESIGN.md](docs/DESIGN.md#5-inner-layer)). Set
`AGENT_GUARD_BYPASS=1` in OpenCode's environment to lift that refusal. OpenCode
Guard's `OPENCODE_GUARD_BYPASS` is no longer honored.

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
either ([Pi and OMP](#pi-and-omp), item 4).

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

## Limitations

Agent Guard limits writes. It does not limit network access, for any harness.
For OpenCode it does not limit reads outside DENY entries or what the agent does
inside ALLOW folders. OpenCode's `auth.json` is writable, and its `wellknown`
entries load remote configuration. Concurrent launches share one rules file, and
a symlinked project config name has its target protected only when OpenCode
starts from that folder in a terminal. For Pi and OMP it does not limit reads
outside pi-sandbox-guard's credential paths and `.env` files, or what the agent
does inside the project, and until step 10d it does not apply the Guard List,
refuse tools in a session started outside the guard or check file tools
([Pi and OMP](#pi-and-omp)). Each limitation, per harness, and what is planned
for it, is in [SECURITY.md](SECURITY.md#known-limitations-in-020). What the cache
protections leave out is under
[Maintenance outside the guard](#maintenance-outside-the-guard).

## Tests

Run from a checkout, outside any agent sandbox, on macOS 15 or later:

```sh
node test/golden.mjs
zsh test/test.sh
```

Both take `--engine NAME` to choose the engine under test; the default is
`zsh`. Each engine has an adapter in `test/engines/` that stages a copy of
`engine/`, `profiles/`, `install.sh`, `LICENSE` and `VERSION` if present, lays a
staged tree out as a release folder, gives the command that runs the launcher
of the current or a named release, and runs the account lookup. An unknown name exits
non-zero, lists the known engines and runs no checks. `test.sh --source DIR`
stages those files from `DIR` instead of the checkout.

The integration test needs Node and the OpenCode CLI. It exercises the ported
installer, real Seatbelt enforcement, plugin load, permission restoration, and
uninstall in a disposable home. It also checks both nesting markers, both
bypass variables, PATH holding both guards' shim folders (with the unmodified
v1.0.3 launcher as OpenCode Guard), that OpenCode Guard's engine folder stays
write-protected when listed under ALLOW, and that uninstall leaves OpenCode
Guard's PATH blocks, rulebook and plugin file unchanged. For OpenCode's cache it
checks writes, creation, removal, renames and link replacement of the stores,
`bin` and the catalog at the default root and at an `XDG_CACHE_HOME` root inside
ALLOW, the refusal of an unusable `XDG_CACHE_HOME`, and, with the real CLI, a
plugin loading from the write-protected store, `doctor` naming a missing or
failing plugin, ripgrep from `bin`, and the catalog refresh against a local
catalog source. Only its copied launcher has the
account-home lookup replaced; production has no test override. The golden test checks the
real account lookup under spoofed environment values, then compares complete
generated profiles against unmodified v1.0.3 fixtures for empty and nested lists.
The v1.0.3 reference runs unmodified, without the adapter.
Only the two product path names are normalized, and the recorded differences in
`test/fixtures/differences/` are applied: step 5 adds the rule that protects
OpenCode Guard's engine folder, and step 7 the rules for OpenCode's package
stores, `bin` folder and model catalog. The original source commit is
`9242c1ad45c895efd63e903e1b27d7bab53620ad`; bundled cc-safety-net is 2.4.14.

`zsh test/pi.sh` tests Pi's guard. It runs pi-sandbox-guard's suites from
`profiles/pi/test` and `profiles/pi/scripts` against Agent Guard's copy, changed
only where a recorded difference changes what they assert; `test/pi-files.mjs`,
which compares `profiles/pi` with pi-sandbox-guard 7ad441f and allows only the
changes in `test/fixtures/differences/pi.json` and `pi.patch`; and
`test/pi-launch.mjs`, which tests each recorded difference and the nested
launches in disposable homes. It needs Node. `profiles/pi/test/shim.mjs` runs
the launcher's preamble against the account's real home: it creates and removes
`~/.local/share/pi-sandbox-bindable-*` folders there and creates
`~/.cache/opencode/bin` when it is missing.

`test/golden.mjs`, `test/test.sh`, `test/pi.sh`, `test/release.sh`, `test/bootstrap.sh`, `test/install.sh`, `test/migrate.sh` and `test/plugin.mjs` are development tests.
They run in a disposable home, apart from the `shim.mjs` cases above, are not
installed, and the installer does not run them. The installed check is
`agent-guard doctor` (the release's `launch check`, plus Pi's checks under
[Commands](#commands) when Pi's guard is installed), which the installer runs as
its self-test. The release's `launch check` checks that a protected write is
denied, a temp write is allowed and `open` is denied, then runs the profile's
`check_hook`. For OpenCode that hook confirms through `opencode serve` that the
`agent_guard_status` tool is visible and that no configured plugin failed to
install, load or start, as OpenCode reports it in its events and its log, naming
each that failed; the installer runs it with `AGENT_GUARD_GATE=1`, which reports
plugins other than the guard's that failed as warnings. It also warns when ripgrep is neither on PATH nor in OpenCode's
`bin`. `launch check staged` runs the same checks on
a release that is not current, loading that release's plugin through a config
folder inside it. The development tests may read its output; it never depends
on `test/`.

## Building a release

```sh
scripts/release.sh [--dev] [--out DIR] 0.2.0
```

This writes three release assets to `dist/` (or `DIR`):
`agent-guard-0.2.0.tar.gz`, `agent-guard-0.2.0.tar.gz.sha256` and
`install.sh`. The archive holds one `agent-guard-0.2.0/` folder with the files
listed in the script, the whole of `engine/vendor/cc-safety-net` and
`profiles/opencode/templates`, a `VERSION` file and a `COMMIT` file. The script
stops if a listed file is missing. It uses only tools that ship with macOS. The
checksum file names the archive without a folder, so check it from `dist/`:

```sh
cd dist && shasum -a 256 -c agent-guard-0.2.0.tar.gz.sha256
```

`install.sh` is the bootstrap for the one-line install, filled in from
`scripts/bootstrap.zsh` with the tag `v0.2.0`, the version and the launcher's
account lookup. It downloads that tag's archive and checksum into the engine
folder's `stage/`, verifies them, then runs the archive's installer with
`--stage <id>` and its own arguments. It refuses inside a guard or another
sandbox, and a copy cut short runs nothing.

Every build runs `scripts/check-seams.zsh` on what it packages and stops if it
fails: the production forms of the test seams must occur once each and
`AG_TEST_` must appear nowhere in the shipped files. Without `--dev` the checkout
must have no uncommitted changes and `COMMIT` holds its `HEAD`. `--dev` builds
from any tree and writes `COMMIT` as `dev` unless the checkout is clean. Do not
publish a `--dev` build.

`zsh test/release.sh` builds `0.0.0-test`, compares the archive listing with the
release file list, checks the checksum, `VERSION`, `COMMIT` and `install.sh`,
then runs `test/test.sh` against the unpacked archive. It needs the same
conditions as `test/test.sh`.

`zsh test/bootstrap.sh` tests the bootstrap without an installer. It starts
`test/release-server.mjs`, a local HTTP server on 127.0.0.1 that answers
GitHub's `releases/latest/download/<asset>` and `releases/download/<tag>/<asset>`
forms from a folder of tags and can cut short or corrupt one asset. The adapter's
`release` function builds each test release with `scripts/release.sh --dev` from
the unmodified source, then applies the test seams to the output: it repacks the
archive with the test points enabled and the launcher's account home fixed to a
disposable home, rewrites the checksum, and points the bootstrap at that server. It needs Node.

`zsh test/install.sh` tests the installer, `agent-guard update` and
`agent-guard uninstall` against releases from that server, in a disposable home
with a fake OpenCode CLI (`test/fake-opencode.mjs`) and a fake `OpenCode.app`.
It kills the installer at every test point, runs the next command, and checks
that recovery leaves either the previous or the new install working and every
entry point guarded or refused, then covers concurrent runs, failed gates,
uninstall order and reruns, and refusals inside a guard. It needs Node; it does
not need the OpenCode CLI.

`zsh test/migrate.sh` tests the migration. It installs OpenCode Guard v1.0.4,
v1.0.3, v1.0.1 and v1.0.0 with each tag's own `install.sh` from
`test/fixtures/installs/` (HOME set to a disposable home), and v1.0.0 upgraded in
place by v1.0.4's, edits a config as a user would, then migrates with a test
release from the same server and the fake CLI, answering the list prompt on a
terminal made by `/usr/bin/expect`. It covers a failure and a kill at every point
before, during and after the switch, reruns, uninstall and the way back to
OpenCode Guard, terminals opened before the switch, forwarder removal by boot
time, and the refusals. It needs Node; it does not need the OpenCode CLI.

## Contributing and security

Issues are welcome; external pull requests are not accepted. Bug-report
guidance is in [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities
privately as described in [SECURITY.md](SECURITY.md).

## License

MIT. `LICENSE` covers Agent Guard. `engine/vendor/cc-safety-net/LICENSE` covers
cc-safety-net, and `engine/vendor/THIRD-PARTY-NOTICES` covers the effect and
`@opencode/schema` code bundled in cc-safety-net's `dist/index.js`. The
installer copies all three into each release folder. `profiles/pi/LICENSE`
covers the files in `profiles/pi/` that come from pi-sandbox-guard; the release
archive carries it.
