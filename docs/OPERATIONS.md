# Installation and maintenance

For everyday use, see the [user guide](USAGE.md).

## Release channels

The [latest stable release](https://github.com/ebrindley/AgentGuard/releases/latest)
supports OpenCode, Pi, Oh My Pi (OMP) and Grok. Run the installer from Terminal
outside any agent session or sandbox:

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
If an earlier installer added a project path containing a backslash or trailing
whitespace, correct its existing Guard List entry. Put the whole path in quotes
to make it literal.

An existing Guard List is kept. Quit running agents before migrating either
older guard.

<a id="unreleased-opencode-setup-and-diagnostics"></a>

## OpenCode setup and diagnostics

These setup options and diagnostics are included in 2026.10.20, which adds
OpenCode 2 compatibility; see [OpenCode versions](USAGE.md#opencode-versions).
Pi/OMP policy is unchanged.

### Preserve agent roles without routine approvals

New installations manage two global OpenCode permission keys, `bash` and
`external_directory`, instead of the previous three. They no longer write
`edit: allow`, which could override Plan and Explore's native edit restrictions.
Maintenance changes absent or ASK settings. A DENY for either managed key
in any of the default global config files keeps that key out of the defaults.
A wildcard DENY keeps both out. If those files cannot all be checked, for
example because one uses JSONC comments, set OpenCode permissions manually.
Pattern order and specific ASK patterns are preserved. Previously recorded
settings retain their ownership. If an earlier release inserted an allow that
masks your deny, remove that allow or restore your intended value in OpenCode's
global config. The existing command/path checks and Seatbelt filesystem
boundaries remain, and the required CI gate count remains one.

Every install checks settings. Every update runs installation checks even when
the release is current or newer than stable. Pending edit migration or an
explicit setup choice invokes the existing installation transaction, with its
gate and rollback. The global check does not establish readiness for arbitrary
projects or the desktop backend, whose OpenCode version may differ from the CLI.

Old Guard-owned `edit` entries are retired through the transaction journal. The
installer restores the first-install value, or removes an originally absent
key, only while the current value still matches Guard's write. It preserves
later user edits and the original records for remaining managed keys. Imported
OpenCode Guard records keep an unchanged archive. Recovery resumes interrupted
retirement; rollback changes only values still owned by the transaction.

Restoring an original ASK, including an ASK in a pattern map, is deferred by
default with `approval-prompts-would-return`. After choosing and configuring
native automatic approval, opt into that restoration explicitly:

```sh
zsh install.sh --approval-preference auto --restore-edit-permissions
```

Run this from a checkout or unpacked artifact, outside the guard.
The updater accepts the same two options. Without
`--restore-edit-permissions`, an `auto` preference alone does not authorize
restoring ASK. Unreadable, commented or protected configuration remains unchanged
with a reason; pending ownership remains available for a later retry.

`--approval-preference auto|host` records intended setup in
`state/opencode-preferences.json`; it neither changes OpenCode's live mode nor
injects launch flags. An update without that option preserves the choice. Both
options are frozen in the transaction plan for recovery. `host` leaves approval
handling to the host; it does not turn an existing native auto mode off.

For native automatic approval, launch the TUI with `opencode --auto`, or use
`opencode run --auto …`. Do not assume other subcommands accept that flag. In
the desktop app, use Auto-accept permissions (`Cmd+Shift+A`). Desktop setup
is user-managed: Guard does not write private frontend storage or claim to
observe its mode. Native auto handles applicable ASK decisions automatically;
effective explicit DENYs and Guard enforcement remain.

Approval mode and agent capabilities are separate. Verify that Explore retains
its edit restrictions and that Plan rejects ordinary edits while permitting its
planning files. Restoring an original global edit ALLOW or ASK can still leave a
user-owned role conflict. Guard reports that conflict; it does not guess custom
agent intent or rewrite roles. An edit-tool restriction alone does not establish
a strict read-only shell.

### Runtime health and permission explanation

In OpenCode, `agent_guard_status` returns JSON with the sandbox observation,
rules load, the applied ALLOW, READ ONLY, DENY and protected roots,
safety-net module/API/hooks readiness, the Git-rule check result, preparation
observation,
loaded/launcher/installed release, restart need and fixed failure reasons.
Status remains callable when a required component fails, provided the wrapper
loaded; ordinary tool calls remain refused. API import failure now retains the
existing refusing hooks rather than losing the plugin's enforcement. A failure
before the wrapper loads still needs external diagnostics. Cached startup
observations and unprobed semantic health are identified explicitly.

`agent-guard doctor` checks the component readiness marker through the existing
guarded host probe, without a model call. Merely registering the status tool is
insufficient: degraded or unreadable readiness fails the check. It also reports
global host-resolved Build/Plan/Explore decisions and role warnings, with project
configuration disabled. These warnings are not a claim about a running project
session or native approval mode.

In a healthy project session, `agent_guard_permissions` reports host-resolved
main-agent and subagent rules, plus observable current/child session overrides.
It evaluates fixed probes for an external directory, an ordinary edit, a Plan
planning-file edit and `git status`. These are representative inputs, not a
permission audit of every path or command. Custom agents use safe aliases;
rule identifiers and pattern classes are reported without exporting patterns.
Matching global configuration entries are labeled source candidates, not proven
file/line attribution: OpenCode's resolved rules do not retain that provenance.
Native auto mode and whether a particular approval was human or automatic remain
unobservable from these server observations.

### Read-only support collection

`agent-guard diagnose [--json]` collects release/link consistency, aggregate
drift counts, global configuration classification, safe permission ownership,
requested approval preference and bounded recent failure observations. It does
not launch OpenCode, perform write probes, change settings, repair files or
recover transactions. Its rulebook line classifies the file as written and
does not probe readiness. Save the diagnostic report before running `doctor`
for active checks, which can replace the last launch log.

The report uses logical path classes, fixed codes and safe rule identifiers.
It excludes full commands, arguments, credentials, environment dumps, exception
text, raw logs and file contents. Cached snapshots and failures include available
timestamps; advisory session-written events are not trusted audit evidence.
Absent or unobservable runtime evidence is labeled rather than counted as healthy.

A shell command that cc-safety-net refuses under a rule is recorded as
`command-denied`. A checker error that names no rule, or names
`analysis.failed-closed`, is recorded as `safety-net-failed` with the error
code when it is a known one. The command is refused either way; for an error
without a rule the session shows Agent Guard's analysis-failure message in
place of the error text.

Distinguish host permission ASK/DENY from a Guard rejection and a filesystem
error. A recorded protected-path rejection can identify expected configuration
protection; a fixed preparation or initialization stage can identify bootstrap
failure. `EPERM` alone does not identify Seatbelt, and an unobserved shell failure
has unknown attribution. The collector cannot reconstruct every host prompt or
OS denial.

Exit status is 0 for consistent installation files/links, 1 for inconsistent or
unreadable installation state, and 2 for invalid arguments. A 0 does not attest
runtime health, effective permissions or desktop approval mode.

### Command display

Repeated handling removes only exact Guard-generated leading PATH prefixes,
including copied prefixes from older releases, then adds the current prefix
once. User-written shell setup remains, and peer wrappers take precedence after
shell startup. OpenCode still displays the executed `input.command`. A separate
short display label with expanded execution details requires upstream renderer
support; this source change does not claim that UI feature.

## Requirements

- macOS 15 or later. The installer uses only tools that ship with macOS and
  stops, naming the tool, if one is missing.
- OpenCode: the `opencode` CLI on PATH, in `/opt/homebrew/bin`, `/usr/local/bin`
  or `~/.opencode/bin`; for the app route, `OpenCode.app`, looked for in
  `/Applications` and `~/Applications`, then by its bundle ID. The OpenCode part
  is installed on every Mac; without the CLI or the app the checks that need
  them are skipped and say so.
- Pi and OMP, for their guard: Pi (`@earendil-works/pi-coding-agent`), OMP, or
  both. The command checker runs inside Pi or OMP, so it needs no Node of its
  own. A Pi that is a Node script needs a Node recorded for it: the `node` on
  PATH outside every folder a Pi session can write (a Homebrew Node, for
  example, not one under `~/.cache`). An OMP binary stored at `~/.local/bin/omp`
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

OpenCode permission maintenance preserves links to ordinary configuration files.
It skips non-regular targets and links into guard policy, activation files or
recorded Pi wrappers, with a warning. Update, rollback and uninstall use the same
target check; an unrestored value remains in the recovery record. This adds one
shared configuration-target check where there was none; it changes no runtime
filesystem grants.

The first install, update or migration also turns off OpenCode 2's automatic
shared service ([OpenCode shared service](USAGE.md#opencode-shared-service)): it
sets `disabled: true` in `~/.config/opencode/service.json`, creating the file
with mode 0600 when it is missing, and records that in the permission record. It
changes only that key, keeps the file's mode and never prints the file, which
holds the service password. A `disabled` value already there is recorded and
left. An unreadable or invalid file is left as it is with a warning and tried
again by the next run. Once recorded, later runs leave the file alone. The
installer writes the default path even when `XDG_CONFIG_HOME` or
`OPENCODE_CONFIG_DIR` points OpenCode elsewhere.

The installer refuses, before any change, inside a guard or another sandbox,
while another install runs and over an install made before release folders (run
its `uninstall.sh` in the engine folder first). Over OpenCode Guard or
pi-sandbox-guard it migrates (below). It assembles the new release in
`~/Library/Application Support/AgentGuard/releases/<version>-<UTC time>`, builds
the app, and tests that release with `launch check staged` before it changes
anything outside the engine folder and `~/Agent Guard`. It then removes the
legacy rulebook when it is unmodified (below), adds the wrapper entries to an
existing `~/.cc-safety-net/rules/rule.json`, and switches the app, `current`, the
plugin link, the OpenCode permission values, OpenCode's shared service opt-out
and the PATH blocks, and runs the gate:
`agent-guard doctor` and a launch of `opencode --version` through the new PATH
shim. OpenCode's staged check, doctor and this launch run from a scratch project
folder in the temp folder, so `@project` resolves the same way wherever you run
them from. With Pi's guard, the staged
checks also test the new Pi files, the switch also replaces the Pi files at
their paths ([Pi and OMP](USAGE.md#pi-and-omp)), and the gate includes `doctor`'s Pi
checks, which run `pi --version` and `omp --version`. If any check fails, it puts
everything back, exits non-zero and names the failed checks; the previous
version keeps working. A configured plugin other than the guard's that fails to
load is a warning in these checks, not a failure
([Maintenance outside the guard](OPERATIONS.md#maintenance-outside-the-guard)). Only after the gate passes does it write the version
stamp and remove release folders older than the previous one, which stays for
OpenCode sessions started from it.

An install or update that finds Agent Guard's block in `.zprofile` or `.zshrc`
but a new terminal window starting another `opencode` rewrites that file with the
block moved to the end, once per file and through the same journaled rewrite as
a first install, so a rollback or uninstall restores the file as before. It
rewrites nothing when a new terminal already finds Agent Guard's launcher, when
the block is already the last thing in the file, and for `.bash_profile`. A
shadow it cannot repair, for example a line in `.zlogin` or in another file
after the block, does not fail or roll back the install: in the gate `doctor`
prints it as a `warn` line, and the report ends with a warning that names the
path. Run `agent-guard doctor` afterwards, where it fails until the other line is
removed or moved.

`Agent Guard.app` is rebuilt only when its script, bundle ID, icon or privacy text
changes, or when it is missing. macOS treats the app as the responsible process
for OpenCode's privacy requests and shows the app's usage strings in them, so all
11 `NS*UsageDescription` keys in its `Info.plist` say that OpenCode asked for the
access and that Agent Guard does not use it itself. A rebuild gives the app a new
ad hoc signature, and macOS may then ask its privacy questions again.

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
to reopen OpenCode. With Pi's guard installed, `bin` also holds the `pi` and
`omp` entry points, and `state/` holds the custom wrapper records and what a
pi-sandbox-guard migration retired. See [Pi's files](#pis-files).

Each OpenCode launch keeps its checker snapshot and session files in
`state/opencode/<release>.<random>`. OpenCode and its detached descendants can
keep using those files after the launcher exits. The launcher prunes folders
that predate the last boot, outside the sandbox and in the background, when
`state/opencode/.session-prune` is absent or more than 24 hours old. A launch
that ends without starting OpenCode (a refusal, `profile` or `check`) leaves
its folder for a later prune.

### The legacy recursive-rm rulebook

Earlier releases installed `~/.cc-safety-net/rules/agent-guard/rulebook.json`
and listed `agent-guard` in `~/.cc-safety-net/rules/rule.json`. Its one rule,
`recursive-rm`, denies every `rm -r`, `-R` or `--recursive` in any tool that runs
cc-safety-net with your configuration. Agent Guard sessions do not use it: each
session's checker copy drops that rule and checks recursive deletes by scope
instead ([Deletes and checker policy](SKILLS.md#deletes-and-checker-policy)).

Releases no longer install it. An install or `agent-guard update` removes the
file, and then the `agent-guard` entry in `rule.json`, only when the file is
byte-identical to the version Agent Guard shipped; if a check after the switch
fails, both are put back. A changed copy and its entry stay, and the installer
prints `custom rulebook kept` with the path. Sessions drop the `recursive-rm` rule
from a changed copy as before. To stop a changed copy applying in a separately
installed cc-safety-net, delete `~/.cc-safety-net/rules/agent-guard` and remove
`agent-guard` from `rules` in `rule.json`. `agent-guard uninstall` removes both,
changed or not.

## Moving from OpenCode Guard

Run the appropriate installer under [Release channels](#release-channels).
When it finds any part of OpenCode Guard (v1.0.0 or later), it replaces it
without running OpenCode Guard's uninstaller:

1. Quit the OpenCode app and every `opencode` in a terminal first. The installer
   stops while one runs, and names it.
2. It shows the entries of `~/OpenCode Guard/Guard List.txt` and asks
   `Import this list?`. Yes copies it unchanged to
   `~/Agent Guard/Guard List.txt`; no, or no terminal, stops the install with
   nothing changed. To install without the old entries, create
   `~/Agent Guard/Guard List.txt` first.
   An existing `~/Agent Guard/Guard List.txt` is never changed.
3. It keeps OpenCode Guard's permission record, so `agent-guard uninstall` can
   still put back the values you had before OpenCode Guard, and writes no
   permission value. It reports each value you changed after installing OpenCode
   Guard; those stay as you set them.
4. It tests the new release, then switches the PATH blocks, the plugin
   (`opencode-guard.js` becomes `agent-guard.js` in one rename, so OpenCode never
   sees both or neither) and the app (`OpenCode Guard.app` goes; drag
   `Agent Guard.app` to the Dock in place of its Dock item). If a check after the
   switch fails, OpenCode Guard is put back as it was.
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

Use the stable installer under [Release channels](#release-channels). Stable
releases support Pi and OMP starting with 0.2.1. When Agent Guard does not guard
Pi yet and finds any part of
pi-sandbox-guard (a `pi` or `omp` in `~/.local/bin` that names
pi-sandbox-guard, `pi-sandbox.sb` or `pi-sandbox-preamble.zsh` there, the
extension folder `~/.pi/agent/extensions/pi-sandbox-guard/`, or
`~/.config/pi-sandbox-guard/executables.conf`), it takes those files over at the
same paths. It does not run pi-sandbox-guard's npm scripts:

1. Quit OpenCode, Pi and OMP before migrating. The Pi migration enforces the
   Pi/OMP check only; an existing OpenCode process retains its earlier profile
   until restarted and does not acquire protections for newly installed Pi
   files. The installer stops while Pi or OMP runs, and
   names it. A Pi session's process is `node`, so it looks for processes that run
   the Pi and OMP executables, not for a process named `pi`. When it cannot list
   processes, it stops and asks to be run outside any sandbox. It checks again
   just before the switch.
2. It assembles the new launchers, profile, preamble and extension, checks the
   bindings in `executables.conf`, and runs the profile's self-test against the
   staged copies. The extension folder holds only the release's files, so
   pi-sandbox-guard's analyzer and `.guard-node` are not carried over.
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
   place as the live bindings, and pi-sandbox-guard's event log stays at
   `~/.pi/agent/security-events.log`.

Afterwards, open a new terminal. Agent Guard's PATH block puts its own `bin`
first, so `pi` and `omp` reach Agent Guard's entry points. Existing
terminals can still reach the compatibility launchers in `~/.local/bin`.
Custom wrappers are found by name through `~/.local/bin` and still use the
launcher beside them. Launchers pass arguments through unchanged and print
`OS sandbox ON` before starting a session.

Agent Guard's commands replace pi-sandbox-guard's:

| pi-sandbox-guard | Agent Guard |
|---|---|
| `npm run setup`, `deploy`, `deploy:all` | the one-line install and `agent-guard update` |
| `npm run deploy:launchers -- --extra-launchers <dir>` | `agent-guard wrapper add` |
| `npm run bind` | `agent-guard bind` |
| `npm run status`, `check:path`, `preflight` | `agent-guard doctor` (the command checker's check replaces the analyzer's preflight) |

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
`executables.conf`, pi-sandbox-guard's event log and your wrappers stay where they are.

## Pi's files

The active release holds its own executable launchers at `bin/pi` and
`bin/omp`. They load `pi-sandbox.sb` and `pi-sandbox-preamble.zsh` from the
same folder.

Agent Guard also installs compatibility files at the original paths.

- `~/.local/bin/pi` and `~/.local/bin/omp`: copies of the launcher that take
  their runtime from their file name and load the `pi-sandbox.sb` and
  `pi-sandbox-preamble.zsh` beside them. Your custom wrappers live here too;
- `~/.pi/agent/extensions/pi-sandbox-guard/`: the extension, `index.ts` and
  `src/index.mjs`, which runs cc-safety-net from the release. Releases before
  this one also placed the analyzer (`src/guard-core.mjs`,
  `src/validate-bash-command.sh`) and `.guard-node` there; an update or an
  uninstall removes them, and nothing needs doing by hand;
- `~/.config/pi-sandbox-guard/executables.conf`: the Pi, OMP and Node
  executables the launcher runs (`agent-guard bind`);
- `~/.pi/agent/security-events.log`: the event log of pi-sandbox-guard's analyzer.
  Nothing writes it now; Agent Guard leaves it where it is, and Pi sessions
  still cannot read it. cc-safety-net's audit log is in `~/.cc-safety-net/logs`.

Agent Guard's version stamp records the hashes of the launchers, the profile,
the preamble and the extension's code; pi-sandbox-guard's own stamps, `.pi-sandbox-launchers-version` and
`.deployed-version`, are not written. In the engine folder, `state/wrappers.json`
holds the wrapper records and `state/legacy/` holds what a pi-sandbox-guard
migration retired and what a fresh install replaced in `~/.local/bin`. Pi
sessions cannot write any of these files except the log. With Pi's guard
installed, OpenCode sessions cannot write the launchers, profile, preamble,
recorded wrappers, extension folder or `executables.conf`, even under an ALLOW
entry that covers them, because they run outside the sandbox at the next Pi
start. Nor can they create or change
`~/.local/bin/pi-sandbox-guard-extension`: the launcher loads the `index.ts` in
that folder in place of the installed extension whenever it exists. Two link
cases are not covered; see [SECURITY.md](../SECURITY.md#opencode). OpenCode
sessions also cannot create or change a `.pi` or `.omp` folder anywhere, even
under an ALLOW entry: Pi loads a trusted project's `.pi`, and OMP loads `.omp`
from the project and its parents without asking. Where either name in the
launch folder is a link, its target is protected too.

On a Mac without pi-sandbox-guard, the installer places these files when it finds
Pi or OMP. When the entry it records is a Node script, the Node recorded beside
it is the `node` on PATH, refused when it lies in a folder Pi sessions can write,
and recorded as its Homebrew `opt` link when it has one, so a formula upgrade
needs no new binding. A file already at
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

OpenCode terminal and desktop, Grok, Pi and OMP launches check GitHub's latest
stable release once before starting the agent. The lookup has a two-second total
timeout and no retries during that launch. A failed lookup leaves startup alone.
Desktop launches show an alert with “Later” and “Update”; terminal launches
print the offered and installed versions and ask `Update now? [Y/n]`, where an
empty answer updates. Declining continues the launch and the next launch checks
again. Noninteractive launches only report availability on stderr. Help, version requests, nested launches, desktop project queries and
installer checks do not check for updates.

Accepting installs the offered tag through the existing updater, then restarts
the launcher once with the original working directory and arguments. The handoff
skips the repeated check. Pi and OMP restart through Agent Guard's `bin`,
which points to the active release. Desktop upgrades show
“Downloading update…”, “Preparing update…” and “Installing update…” in a small
progress window and record output in `~/Agent Guard/last-update.log`. The window
follows the stage lines the installer prints. An accepted upgrade that fails stops that launch;
run `agent-guard update` from Terminal to finish recovery before reopening.

`opencode upgrade` (and `opencode update` on OpenCode 2) is separate from these
offers: from Terminal it runs OpenCode's own updater unconfined, prints one
notice and exits with the updater's status, and from an agent session it is
refused with status 2 ([Update the OpenCode CLI](USAGE.md#update-the-opencode-cli)).

A terminal launch of an OpenCode session also offers an OpenCode update. It
applies to `opencode` and `opencode <project>` (not subcommands, help or
version requests, or an attached client), only in the terminal launcher and
only when the nesting probe succeeded, so nested launches, peer wrappers and
another tool's sandbox never reach it. The desktop launch has its own offer,
described below. In this release the installation must be OpenCode 2 started
from the opencode.ai installer's `~/.opencode/bin/opencode`, from an npm
global install not owned by Volta or mise, or from a Homebrew Cellar folder of
the `opencode` or `opencode-v2` formula, at a stable version; the offered
version is the latest stable one and never another major. The latest version
comes from OpenCode's update service (its npm feed, or its Homebrew feed for
`opencode-v2`) or, for the `opencode` formula, from the `versions.stable` field
of `https://formulae.brew.sh/api/formula/opencode.json`, which can trail the
tap. Accepting runs OpenCode's own updater, which runs `brew upgrade` for a
Homebrew installation; Agent Guard does not run `brew`. The offer
comes after Agent Guard's own; the two prompts are separate. Each lookup has its
own two-second limit, so a launch can wait up to about four seconds when both
are slow; nothing is stored, and every eligible launch looks again.

The prompt reads `OpenCode <offered> is available. You have <installed>.`, then
the note `The update runs without Agent Guard's protection.`, then `Update now?
[Y/n]`. Accepting runs `opencode upgrade <offered>` unconfined, as the explicit
command does. The launcher then finds the executable again and reads its
version under the profile. Once it confirms the offered version, it prints
`OpenCode updated to <offered>.` and starts the session on it. If the update
fails, the launch stops with `the OpenCode update failed`; if the new version
is not the offered one or its major changed, it
stops and names the expected and the found version. In both cases run
`opencode upgrade` from Terminal and start again. A launch without a terminal
prints the first two lines on stderr, installs nothing and starts the session.

The desktop launch (Agent Guard.app) offers an OpenCode app update as a third
product of the same offer, after Agent Guard's own offer and before the app's
command line is built, under the same gate: `agent-guard update-check off` and a
nested launch suppress it, and it needs the nesting probe to have succeeded. A
launch that restarted after Agent Guard's own update makes this offer too. The launcher has already refused when OpenCode is open. The
installation must be a stable `N.N.N` app in a real folder, not a link, whose
parent folder the operator can write, with a valid signature that has a Team ID
and an executable of one architecture (arm64 or x64, read from the installed
app); anything else makes no lookup. The lookup is one HTTPS request to
OpenCode's update service, which must name a stable newer version of the same
major and, for the app's architecture, an archive address that starts with
`https://opencode.ai/` and a 64-digit SHA-256. The dialog shows the note above.
An accepted update runs outside the sandbox, with the progress window and
output in `~/Agent Guard/last-opencode-update.log`: it downloads the archive
into a private folder inside the app's parent folder (ten minutes at most),
checks the SHA-256, unpacks it with `ditto`, requires exactly the app's folder
name, and verifies the unpacked app (bundle ID, executable name, version,
Team ID, `codesign --verify --deep --strict` against the installed app's
designated requirement, `spctl --assess --type execute`). Only then does macOS
atomically exchange the two bundles on the same volume. After the exchange the
launcher reads the app's version again and requires the offered one, reads the
executable's name again, and probes the bundled CLI as for any desktop launch.
The updater removes the old app and private folder when it can.

If a verification or the exchange fails, the installed app stays in place and
the launch stops with the way to update by hand and the log path. The exchange
requires support from the app's filesystem. If the launcher is
interrupted, the installed app is the previous bundle before the exchange or
the verified new bundle after it. Reopen Agent Guard to use the installed app.
Once the update has stopped, a `.opencode-update.*` folder next to the app can
be removed if the updater did not clean it up. macOS's App Management
protection may also refuse the exchange for Agent Guard.app. Reopen and choose
Later to run the installed app, or quit OpenCode and install the download from
opencode.ai. The failure message says this too and adds `or run
brew upgrade --cask opencode-desktop` only when Homebrew is installed on this
Mac and its Caskroom holds `opencode-desktop` (see Commands, below).
Homebrew's record of the cask keeps the older version after an update by this
route.

After either run of OpenCode's updater, the explicit command or an accepted
offer, whatever its status, the launcher resolves `opencode` the way `agent-guard
doctor` does for a new terminal window (`engine/lookup.zsh`, one `zsh -l -i`
start of at most 20 seconds, only after an upgrade). When that finds a file other
than Agent Guard's launcher, which OpenCode's installer causes by adding
`~/.opencode/bin` to the end of `.zshrc`, it prints one warning on stderr that
names the path and says to run `agent-guard update`. The warning changes no exit
status and does not stop the session that follows an accepted offer. It is
skipped when `ZDOTDIR` points outside the home.

`agent-guard update-check` shows `on` or `off`; adding `on` or `off` changes the
preference in `state/update-check`, outside release folders. Missing preference
means `on`. It covers the startup offers of both Agent Guard and OpenCode.
`agent-guard update --check` checks explicitly regardless of that
preference and installs nothing, and covers Agent Guard only. Automatic offers
cover numeric stable versions; installations with prerelease tags remain on
their chosen version.

An installation that updates Pi, including a tagged prerelease install,
replaces the Pi files by renames and does not wait for Pi or OMP sessions to
end. A running session keeps the profile it started with and the extension it
loaded; `/reload` loads the extension now on disk.

## Commands

- `agent-guard doctor` runs each installed harness's checks. For OpenCode it runs
  the installed self-test and checks which `opencode` a new terminal window finds
  first (below). For Grok it runs the launcher's check and checks which `grok`
  a new terminal and `zsh -c` find first. It also verifies the link at
  `~/.local/bin/grok`. With Pi's guard installed it also runs the
  checks below.
  - everything pi-sandbox-guard's `npm run status` and `npm run check:path`
    checked, comparing the installed Pi files with the current release's copies
    byte for byte. When a file or link has drifted, a `note` line gives the
    repair: run the installer for the installed release again, shown with the
    stamp's tag. If `~/.local/bin/pi` or `~/.local/bin/omp` holds a regular file
    whose ownership the installer cannot verify, it leaves the file in place.
    Move it aside before reinstalling. If it is your runtime executable,
    record its new path with `agent-guard bind` afterwards.
    `agent-guard update --to` with the installed tag does not repair
    drift;
  - the profile's self-test, the checker's session copy built from
    `~/.cc-safety-net`, and one allowed command and two blocked ones through the
    installed extension, which proves cc-safety-net loads and Agent Guard's Git
    rules are in force. This check runs on the recorded Node or the `node` on
    PATH and is skipped, and named, when there is none. Its audit entries go to a scratch folder, so `~/.cc-safety-net` is not changed;
  - where `pi`, `omp` and each recorded wrapper resolve in a login shell. The
    PATH check can pass for `pi` or `omp` even when the copy in `~/.local/bin`
    has drifted. A wrapper that finds the wrong
    sibling `pi` fails its check even if the wrapper's hash matches;
  - that the bindings in `executables.conf` are still usable; a stale binding
    fails;
  - each recorded wrapper's hash, and earlier wrapper names that are still
    executable;
  - `PI_CODING_AGENT_DIR` and `PI_PACKAGE_DIR`, which move Pi's folders,
    reported when set;
  - `pi --version` and `omp --version`, run from a scratch project in the temp
    folder, because Pi refuses home as a project. Doctor runs these checks
    through Agent Guard's `bin`. A runtime that is not installed
    is skipped and named.
  - with `pi --version` working, whether guarded Pi finds `fd` and `rg`: in
    `~/.pi/agent/bin`, then in the directories of the launcher's pinned PATH
    (`/opt/homebrew/bin`, `/usr/local/bin` and the system directories), not the
    PATH of the shell that runs `doctor`. A missing tool is a `warn` line that
    names what stops working; it is not `FAIL` or drift and does not change
    `doctor`'s exit status or its `--json` `ok`. A `PI_CODING_AGENT_DIR` that a
    wrapper sets only in Pi's environment is not seen. The remedy is under
    [Running Pi or OMP without the guard](#running-pi-or-omp-without-the-guard).

  The OpenCode lookup starts `zsh -l -i` with a clean environment and your home
  and asks which `opencode` it finds. It passes when that is Agent Guard's
  launcher (`bin/opencode`, reached through `current`), is skipped when none is
  found, and otherwise fails, naming the path it found and telling you to run
  `agent-guard update`. It is not run when `ZDOTDIR` points outside your home,
  which `doctor` reports as a warning that the PATH line must be added to that
  folder's files. The opencode.ai installer appends
  `export PATH=$HOME/.opencode/bin:$PATH` to the end of `.zshrc`, after Agent
  Guard's block, so a new terminal then starts OpenCode without the guard; this
  happened on 2026-11-15. `agent-guard update` repairs it: see
  [Installation](#installation).

  The launcher's check, which `doctor` runs, adds up to two `note` lines
  (information only: they are never `FAIL` or `warn`, and they do not change
  `doctor`'s exit status or its `--json` `ok`):

  ```
  note OpenCode CLI 2.3.0 at ~/.opencode/bin/opencode: Agent Guard offers its updates when you run opencode in Terminal.
  note OpenCode app 2.3.0 at ~/Applications/OpenCode.app: Agent Guard offers its updates when you open Agent Guard.
  ```

  The first names the CLI the check ran, with the version from the confined
  probe the launcher uses and its path. The second names the app found in
  `/Applications`, `~/Applications` or by bundle ID, with its version from
  `Info.plist`. A missing CLI or app prints no line, and `check staged` prints
  none. Each line ends with the route for that installation, from the same
  checks that decide the launch offers. When Agent Guard offers nothing, the line
  gives the reason and the way to update by hand:
  - CLI: `Agent Guard does not offer updates because it was installed by
    Volta. To update, run opencode upgrade in Terminal, outside a session.`
    The reason is `it was installed by Homebrew` (a formula other than
    `opencode` and `opencode-v2`, or a cask), `Volta` or `mise`, `it was
    installed another way`, `it is OpenCode 1` or `it is a prerelease`.
  - The CLI inside the app: `This OpenCode belongs to the OpenCode app and is
    updated with the app.` followed by the app's route. The explicit `opencode
    upgrade` refuses with the same text.
  - App: `Agent Guard does not offer updates because <reason>. To update, quit
    OpenCode and install the download from opencode.ai.` The reason is `it is a
    link`, `it is not a folder`, `its folder <folder> cannot be written by this
    account`, `its version cannot be read`, `it is a prerelease`, `its
    executable cannot be read`, `its executable is not a single-architecture
    build`, `its signature cannot be checked` or `its signature has no Team
    Identifier`. ` or run brew upgrade --cask opencode-desktop` is added before
    the final period only when `/opt/homebrew/bin/brew` or `/usr/local/bin/brew`
    exists and `Caskroom/opencode-desktop` exists under the same prefix. Files
    are checked; `brew` is never run.

  The lines run `plutil` and `codesign` on the app, as the app offer does, and
  run no OpenCode beyond the version probe the check already makes. They make no
  network request.

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
  not check `executables.conf` or the custom wrappers, whose
  hashes `agent-guard doctor` checks, and it does not notice a file added
  outside the release folder, such as in the extension folder. It exits 1 if
  anything drifted.
- `agent-guard update` installs the latest stable release the same way as the
  one-liner, with the same checks and rollback. When the installed release is
  the latest, it installs it again only to finish a migration or retirement that
  is still pending, to add a harness found on this Mac that the install does
  not include yet, for example Pi installed after Agent Guard, or to move the
  PATH block to the end of a startup file when another `opencode` shadows it. Otherwise,
  and when the installed release is newer, it runs `agent-guard doctor`, which
  reports drifted files and does not repair them (rerun the installer for
  that), and removes the forwarders at OpenCode Guard's old command paths once
  the Mac has restarted since the migration.
  A migration-detection error returns failure with its diagnostic; it is not
  reported as current. It does not fetch prereleases. To install a prerelease, rerun the installer for that tag under
  [Release channels](#release-channels).
  `--to vVERSION` selects a specific numeric stable tag and leaves an equal or
  newer installed version alone unless setup options are supplied. With an equal
  tag, `--restore-edit-permissions` or `--approval-preference auto|host` runs the
  setup transaction. With a newer or incomparable installed tag, those options fail with an
  explanation instead of downgrading or leaving them unapplied without a reason.
  `--no-prompt` suppresses the install-complete
  “Edit List?” dialog; startup upgrades use it before restarting the launcher.
- `agent-guard uninstall` first checks that the stamp identifies the installed
  harnesses. An unreadable or invalid ownership record stops uninstall and keeps
  the guard and saved replacement entries; restore the stamp from a backup
  before retrying.
  Valid 0.1.x stamps without a harness list still mean OpenCode alone. It removes PATH blocks, restores the permission values
  the installer changed and removes the shared service opt-out's `disabled: true`
  (unless you changed them since), then removes the app,
  the legacy rulebook and its `rule.json` entry if present, after a migration the forwarders, then the plugin and the engine
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
  and exits 1. It removes the extension folder with whatever an earlier release left
  in it. It leaves `executables.conf`, pi-sandbox-guard's event log and your custom
  wrappers, and names the wrappers it leaves. A wrapper then runs whatever `pi`
  is beside it: Pi unguarded when an npm `pi` was put back, or an error when
  there is none. What it leaves on purpose, the wrappers, a `pi` or `omp` that is
  not the guard's and the copied entries, is reported as a warning and does not
  change the exit status. It exits 1 when a step fails, a PATH block or file
  cannot be removed or a permission value cannot be restored, and names it. If
  the engine folder stays after a failure, retry with
  `"$HOME/Library/Application Support/AgentGuard/bin/agent-guard" uninstall`.
  The full path works in a new terminal after uninstall removes the PATH blocks.
  Uninstall removes the engine folder by renaming it to
  `~/Library/Application Support/.AgentGuard.removing` and then deleting it.
  If the rename fails, use the same retry command. If deletion fails, remove
  `.AgentGuard.removing` by hand.
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
  `--check` exits 3 when one is missing or stale. `--show`, `--check` and
  recording a native Pi or OMP need no Node on PATH, so a Mac with only OMP
  works without one; recording a Node does.
  `--checker-node`, which
  recorded the analyzer's Node, is accepted and ignored with one line, so older
  scripts keep working. The launcher refuses a stale binding and names this
  command. Bind again after an upgrade
  that moves an executable, such as a new Node under a version manager.
  `bind` records Pi and OMP independently: `--omp` and `--detect` work on a Mac
  with OMP and no Pi. A recorded line that no longer validates is dropped with
  a note, and `node=` is detected again, so a stale line does not block a new
  binding.
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
`agent_guard_status` reports the loaded plugin's view of local confinement and
its release. It does not attest remote services or other plugins' hook behavior.

For OpenCode V2, doctor distinguishes unavailable plugin status from inactive
plugins. It lists up to eight inactive entries by position, a safe plugin name
when available, and the host's error reference. Paths, URLs and raw plugin errors
are withheld; use OpenCode's plugin list to inspect the named entry locally.

Bundled CC Safety Net's standalone `cc-safety-net doctor` looks for its package
in OpenCode's plugin configuration. It does not recognize Agent Guard's
file-based wrapper plugin, so it can report "No integration configured" even
when Agent Guard is active. That result does not establish whether the guard
is active; use `agent-guard doctor` outside the guard, noting any skipped
checks, and `agent_guard_status` in the guarded OpenCode session.

CC Safety Net's synthetic self-test uses three fixed commands, no custom
rules, and the standard baseline with `fail_closed`, `paranoid_rm` and
`paranoid_interpreters` off. Its allowed result for `rm -rf ./node_modules`
does not test Agent Guard's effective policy, which uses the standard
preset with the dynamic-target delete rule on, scoped deletion allowances and registered custom rules.

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

If a Pi, OMP or Grok launcher changed during an interrupted switch, recovery keeps
the file and transaction. Move the named launcher aside, then rerun the command
that started recovery. If `agent-guard` is no longer available, rerun the installer.

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

## Grok's files and running Grok without the guard

The installer replaces `~/.local/bin/grok` with a link to Agent Guard's `bin/grok`,
records Grok's executable (normally `~/.grok/bin/grok`) in `state/grok-executable`
and keeps the entry it replaced in `state/grok-replaced/grok`; uninstall puts it
back when `~/.local/bin/grok` is still Agent Guard's link. An entry it does not
put back, because that path now holds something else or nothing, or because an
earlier install replaced it (a time suffix), is copied to
`~/Agent Guard/grok-replaced-<time>/` before the engine folder is removed, and
uninstall prints where; if the copy fails it keeps the engine folder and exits 1. A regular executable at `~/.local/bin/grok` with no `~/.grok/bin/grok` is
also copied to `state/grok-kept/grok`, which the record names. Nothing under
`~/.grok` is changed. Run the recorded executable directly, `~/.grok/bin/grok` or
in that layout the kept copy under the engine's `state` folder, for what the
guard refuses (its refusal message names the path): `login`, `logout`, `update`,
`workspace start` and changes to
`config.toml`, `sandbox.toml`, hooks and other protected files. A direct start runs
Grok with its own sandbox setting, not Agent Guard's. `grok update` or a
reinstall of Grok can put a link of its own back at `~/.local/bin/grok`. Invoking
that path then starts Grok outside Agent Guard, even when a new terminal's
`PATH` still finds Agent Guard's launcher. Both `agent-guard doctor` and
`agent-guard version` report the changed link. Run the installer again to
restore it. If the recorded external executable is
removed while the guard link is in place, Agent Guard can still update the other
harnesses. It keeps the link and its uninstall record, and reports the skipped
Grok runtime checks. To use Grok again, reinstall Grok and rerun the Agent Guard
installer.

## Running Pi or OMP without the guard

Started directly, for example as `/opt/homebrew/bin/pi`, Pi runs without
Seatbelt. It still loads the guard's extension from `~/.pi/agent/extensions/`:
the extension prints a `FILTER-ONLY` warning and, finding no session copy of the
checker policy (the launcher builds it), blocks every tool call. Nothing else
applies, and `pi -ne` (no extensions) removes the extension too. A direct start of
OMP may load the extension in the same way. The current Pi guard refuses tools
because its checker is missing, not because it probed for Seatbelt as OpenCode's
plugin does
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

Pi's global `bin` and legacy `tools` folders are also write-protected. Pi needs
`fd` for its `find` tool and `@` file suggestions and `rg` (ripgrep) for its
`grep` tool. It looks for each in `<agent folder>/bin`, then on PATH (`fd`, then
`fdfind`; `rg`), and otherwise downloads it into that `bin`. A guarded session
cannot perform the download, and Pi does not attempt it when `PI_OFFLINE` is
set, so Pi continues without the tool and its `find` or `grep` calls fail.

To fix it, install the tool with a package manager from a plain Terminal outside
the guard (`brew install fd`, `brew install ripgrep`). A guarded shell cannot
write to Homebrew's prefix, and the launcher's pinned PATH includes
`/opt/homebrew/bin` and `/usr/local/bin`, so a restarted guarded Pi finds it.
Running the real Pi executable outside the guard also downloads the tool, but into
the `bin` of the agent folder that Pi uses: `~/.pi/agent` unless
`PI_CODING_AGENT_DIR` is set. A session that uses a different agent folder does
not see that copy, and nothing is downloaded when `PI_OFFLINE` is set.
`agent-guard doctor` prints a `warn` line for each of the two that guarded Pi
would not find.

An npm update or reinstall with its prefix at `~/.local` can replace the Pi
launcher at `~/.local/bin/pi`. Starting with 2026.11.19.2, bare commands
that find Agent Guard's `bin` first reach the release's own launchers and stay
guarded. Absolute calls to the replaced path, wrappers that hand off to it and
bare commands that find the vendor's command first can still start without
Seatbelt.

`agent-guard doctor` reports the changed launcher. If it reports a stale
runtime binding too, repair that with `agent-guard bind`. Rerun the installer
for the installed Agent Guard release to restore the launcher in `~/.local/bin`.
See [Commands](#commands).

## Maintenance outside the guard

OpenCode can install, update and remove packages, downloaded tools and model
catalogs inside its writable cache. This includes `packages`, legacy
`node_modules` and package metadata, `bin`, `models.json` and `models-*.json`.
Installers and their child processes stay under the launch's Seatbelt profile.
Guard's own checker remains vendored in its protected release folder.

`XDG_CACHE_HOME` selects a cache location but grants no additional access. A
relocated cache must already be writable through the Guard List or a runtime
grant. Missing directories are created by OpenCode inside the sandbox. The
default `~/.cache` root remains pinned against replacement.

Configured npm plugins install at startup. OpenCode can download ripgrep when
it is absent from PATH and the cache, and `opencode models --refresh` can replace
its cached catalog. Language servers may also need toolchain-specific paths,
such as `~/go` or `~/.cargo`, under ALLOW. Their locations are not automatically
granted. Ordinary plugin configuration is writable; Guard bootstrap entries remain
protected.

`opencode upgrade` is the one maintenance command the launcher runs outside the
profile, at your request, typed or accepted at the launch-time offer
([Updates and sessions](#updates-and-sessions)): OpenCode's updater runs your
package manager or OpenCode's installer, and reads the caches and configuration
a session can write.

Cache contents can affect later independently unguarded starts. Install only
packages you trust and inspect changes before running them outside Guard.
Pi/OMP cache and configuration protections are unchanged. Their maintenance,
and changes to Agent Guard itself, still run outside the guard.

## OpenCode configuration and skills

Default global configuration roots, `~/.config/opencode` and `~/.opencode`, are
writable except for Guard's bootstrap, its installer staging entry and the
installed `~/.opencode/bin` executable. Their identities and the Guard plugin
container stay pinned, so replacing the whole tree from a session is refused.
Ordinary sibling plugins, configuration files, MCP definitions, skills and
supporting files can be created, edited, renamed and deleted. Project settings
follow project permissions; READ ONLY and DENY still restrict automatic grants.

Configuration overrides retain OpenCode's own precedence. A relocated XDG root,
`OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR` or `OPENCODE_TUI_CONFIG` receives no
additional write grant. Put a custom location under ALLOW when it needs writes.
A non-default global config or plugin-disabled mode can omit the advisory Guard
plugin; it does not remove Seatbelt. Logs distinguish these cases. No Guard
configuration is injected into the user's inline configuration.

The launcher creates only pinned root containers. Ordinary config files and
project folders are initialized inside Seatbelt. No outside-sandbox worker
prepares skill directories. Policy snapshots remain immutable for the session;
restart to pick up changed Guard List permissions or a new release.

The diagnostic plugin check uses a controlled snapshot directory with project
configuration disabled. Plugin registration is operational evidence, not proof
that every hook executes or that a remote server is sandboxed. A local MCP child
inherits the launch profile; an existing or remote service does not. Attaching
a client to a server does not change that server's permissions.
The main launcher permits this attachment and logs the distinction. Peer CLI
wrappers refuse attachment. An OpenCode peer started from a Pi, OMP or Grok
session has no OpenCode session rules, so its wrapper sets
`AGENT_GUARD_OUTER_SANDBOX=1` and `AGENT_GUARD_BYPASS=1`: the plugin runs
unguarded, the command checker still runs, and the parent's sandbox is the
boundary. An unguarded server with the Guard plugin refuses
unsafe tools unless `AGENT_GUARD_BYPASS=1` is set; no refusal is assured on a
server without that plugin.

See [skills and deletion policy](SKILLS.md). Pi/OMP policy is unchanged, including
when OpenCode is a child of a Pi/OMP session.
