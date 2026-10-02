# Security policy

## Reporting a vulnerability

Report vulnerabilities through the
[private security advisory form](https://github.com/ebrindley/AgentGuard/security/advisories/new).
It is the only private channel. No email address is published.

Include the Agent Guard version (`agent-guard version`), the macOS version and
chip, the harness (OpenCode, Pi or OMP) and its version, the launch route
(`opencode` in a terminal or the app; `pi`, `omp` or a custom wrapper) and the
steps that reproduce the problem. Do not include credentials or other secrets.

If that link does not show a report form, private reporting is not switched on.
Open a public issue that contains no exploit detail and asks for a private
channel; reporting will be switched on so you can file there.

This is a personal project with one maintainer. Reports are handled on a
best-effort basis. There is no bug bounty.

## Supported versions

Fixes go into the latest release only. `agent-guard update` installs it.

## What Agent Guard is

Agent Guard is a macOS Seatbelt write-containment boundary for terminal coding
agents. Release 0.2.0 guards OpenCode, Pi and Oh My Pi (OMP). Each harness, and
every process it starts, runs under `/usr/bin/sandbox-exec`, but OpenCode and Pi
are guarded by different code with different rules until Pi moves onto Agent
Guard's engine (step 10d of the plan in [docs/DESIGN.md](docs/DESIGN.md#12-plan)).
Statements about Pi below apply to OMP too unless they name one runtime.

### OpenCode

The launcher runs OpenCode under a profile generated from the Guard List
(`~/Agent Guard/Guard List.txt`) at each launch. Under that profile the agent
can write only to ALLOW folders and the data, cache and temp folders OpenCode
needs, cannot read or write DENY entries, and cannot change the guard, the list,
OpenCode's global config and plugin folder (`~/.config/opencode`), OpenCode's
package stores, `bin` folder and model catalog in its cache (also under
`XDG_CACHE_HOME`, even inside ALLOW), the shell startup files or
`~/Library/LaunchAgents`. Once Pi's guard is installed, it also cannot change
Pi's guard files, even inside ALLOW: `pi`, `omp`, `pi-sandbox.sb`,
`pi-sandbox-preamble.zsh` and the recorded custom wrappers in `~/.local/bin`, the
extension folder `~/.pi/agent/extensions/pi-sandbox-guard/` and
`~/.config/pi-sandbox-guard/executables.conf`. Nor can it create or change
`~/.local/bin/pi-sandbox-guard-extension`, whose `index.ts` the launcher loads
in place of the installed extension whenever it exists. Each of these paths is
protected as named and, when it is a link, at its target, with two exceptions:
the target of a link inside the extension folder can be written where an ALLOW
entry covers it, and a protected path that is a link to a missing target is
protected at its name only, so the missing target can be created where an ALLOW
entry covers it. The other exceptions are under
[Known limitations](#known-limitations-in-020): npm configuration in the cache
that steers installs made outside the guard, remote-configuration entries in
OpenCode's `auth.json`, the targets of symlinked project config names, and Pi's
and OMP's configuration under ALLOW.

The OpenCode plugin and cc-safety-net are advisory. They refuse tool calls with
a clear message, but nothing depends on them for safety. The Seatbelt profile is
the boundary.

### Pi and OMP

The launcher, `~/.local/bin/pi` or `~/.local/bin/omp`, runs Pi or OMP under
pi-sandbox-guard 7ad441f's Seatbelt profile, which Agent Guard installs at the
paths pi-sandbox-guard uses. The profile is fixed; it does not read the Guard
List. Under it the agent can write only to the project (`PI_PROJECT`, else the
Git top level, else the launch folder), temp, Pi's state folder apart from its
configuration, the OMP runtime folders the profile lists, `~/.npm`, `~/.cache`
and `~/Library/Caches`. It cannot write Pi's or OMP's configuration, extensions,
packages, skills or system prompts, a project's `.pi` and `.omp` folders or the
extension, hook and tool folders OMP loads from `.claude`, `.codex`, `.gemini`
and `.opencode`, the project's active Git hooks, or credential paths. It cannot
read `~/.ssh`, `~/.aws/credentials`, `~/.aws/config`, `~/.docker/config.json`,
`~/.kube/config`, `~/.gnupg`, `~/.config/gh`, `~/.config/gcloud`, Git's credential
stores, `~/.netrc`, `~/.npmrc`, `~/.secrets`, `.env` files anywhere or the
analyzer's log, `~/.pi/agent/security-events.log`. The launcher refuses a project
that is too broad or sensitive, or that contains its own folder,
`~/.local/bin`. The full 7ad441f policy is in pi-sandbox-guard's
[SECURITY.md](https://github.com/ebrindley/pi-sandbox-guard/blob/7ad441f51c249eafe6f92d16e92d2fbf37622d67/SECURITY.md)
and
[ARCHITECTURE.md](https://github.com/ebrindley/pi-sandbox-guard/blob/7ad441f51c249eafe6f92d16e92d2fbf37622d67/docs/ARCHITECTURE.md).

Agent Guard 0.2.0 differs from pi-sandbox-guard 7ad441f in five ways, recorded
in `test/fixtures/differences/pi.json`:

1. Pi and OMP sessions cannot change Agent Guard's engine folder, `~/Agent Guard`,
   `~/Applications/Agent Guard.app`, OpenCode Guard's engine folder,
   `~/.config/opencode`, `~/.opencode`, `~/.cc-safety-net` apart from its `logs`,
   `~/Library/LaunchAgents` or the eight shell startup files (`.zshenv`,
   `.zprofile`, `.zshrc`, `.zlogin`, `.profile`, `.bash_profile`, `.bash_login`,
   `.bashrc`), nor the resolved target of any of them that is a link, nor rename
   or remove the folders above such a target.
2. A project that is, contains or is inside one of those folders, or is or is
   inside the target of one that is a link, is refused.
3. `lsopen` and `job-creation` are denied, and so is running `open`, `osascript`,
   `osacompile`, `codesign`, `diskutil`, `launchctl` and `sudo`, as for OpenCode.
4. OpenCode's package stores, `bin` folder and model catalog are write-denied
   under `~/.cache` and under `XDG_CACHE_HOME`, which Pi's `~/.cache` grant would
   otherwise leave writable. An `XDG_CACHE_HOME` that is not an existing folder
   named by its full path refuses the launch.
5. Repair messages name `agent-guard bind`.

Taking over from pi-sandbox-guard also changes what surrounds the profile:
Agent Guard's installer, `agent-guard update` and `agent-guard uninstall`
replace pi-sandbox-guard's npm scripts; `agent-guard bind` writes only
`executables.conf`, the file the launcher reads, and `.guard-node`; and a
migration moves pi-sandbox-guard's backups into the engine folder, including the
extension backups in `~/.pi/agent/extension-backups/`, which Pi sessions could
write.

The extension's bash analyzer is advisory. It blocks or asks before shell
commands it recognizes as destructive, but nothing depends on it for safety. The
Seatbelt profile is the boundary.

## What it does not cover

- Network access. Outbound connections are not restricted, for any harness.
- Read confidentiality beyond the denies. An OpenCode session can read any file
  the macOS account can read unless a DENY entry covers it; a Pi or OMP session
  can read any file outside the credential paths and `.env` files listed above.
- Integrity of the folders the agent is meant to change: ALLOW folders for
  OpenCode, the project for Pi and OMP.
- Provider tokens and other secrets the harness itself uses.
- A VM, container or separate user identity.

## Known limitations in 0.2.0

### OpenCode

- **npm configuration in the cache steers installs made outside the guard.**
  Apart from OpenCode's package stores, `bin` and model catalog, `~/.cache` is
  writable. An agent can create `~/.cache/node_modules` and `~/.cache/.npmrc`; a
  later install of a new plugin or npm language server outside the guard then
  fetches it from the registry that `.npmrc` names (OpenCode 1.18.33), and the
  installed code runs in every later OpenCode session. Check `~/.cache` before
  installing ([README](README.md#maintenance-outside-the-guard)). Pi and OMP
  sessions can write `~/.cache` too. Not yet planned.
- **OpenCode's `auth.json` can add remote configuration.** OpenCode's data
  folder, `~/.local/share/opencode`, is writable, including `auth.json`. A
  `wellknown` entry there makes OpenCode fetch configuration from the entry's URL
  at every start and merge it as global configuration, plugins and MCP commands
  included (OpenCode 1.18.34). An agent can add an entry for a server it
  controls. The next OpenCode start runs what that server names, under the guard
  for a guarded start and with full authority otherwise. Planned: before the
  composition release (step 10e of the plan), this is protected, checked at
  launch or accepted in writing ([docs/DESIGN.md](docs/DESIGN.md#9-code-in-writable-folders), section 9).
- **Concurrent launches share `state/rules.json`.** Each launch writes the
  resolved ALLOW, READ ONLY and DENY paths to one file in the engine folder, and
  each plugin reads it once at start. When two launches start close together, or
  start in folders whose symlinked config names differ, the first session's
  plugin can refuse and report against the second launch's rules. Seatbelt still
  enforces each session's own profile. Planned: step 9 of the plan in
  [docs/DESIGN.md](docs/DESIGN.md#12-plan) writes one state file per launch.
- **Symlinked project config names.** The names `.opencode`, `opencode.json`,
  `opencode.jsonc`, `tui.json` and `tui.jsonc` cannot be created, replaced or
  removed anywhere. When one of them is a symlink, its target is write-protected
  only when OpenCode starts from the folder that holds the link, in a terminal.
  Started from the app, or with `opencode <project>` from another folder, writes
  through the link reach its target. The plugin refuses file edits through such a
  link; shell commands are not checked. Not planned.
- **Pi's and OMP's configuration is writable under ALLOW.** On a Mac with Pi's
  guard, an OpenCode session can write Pi's and OMP's configuration, extensions
  and other folders Pi and OMP load from, and `.pi` and `.omp` folders, wherever
  an ALLOW entry covers them; only Pi's guard files are protected. Pi and OMP
  load what is written there at their next start. Planned: step 10c.
- **Anything in an ALLOW folder can be changed or deleted.** That includes git
  hooks, build scripts and other files that run later outside the guard, for
  example when you run `git commit` or a build in an unguarded terminal. Review
  changes before running them outside the guard. An ALLOW entry that covers an
  executable's folder, such as `/opt/homebrew`, makes that executable writable,
  OpenCode's included. Not planned: editing these folders is what the agent is for.
- **Reads are broad unless denied.** Without DENY entries the agent can read
  `~/.ssh`, `~/.aws` and every other file the account can read. Add DENY entries
  to the Guard List for what it must not read; denying `~/.ssh` also stops git
  over SSH inside the guard. A DENY or READ ONLY entry that is or contains a
  folder OpenCode needs (`/`, home, `~/Library`, `~/.config`, `~/.local`,
  `~/.cache`, `/usr`, `/bin`, `/sbin`, `/System`, `/Library`, `/private`, `/dev`,
  `/opt`, `/Applications`) is refused, not applied; each launch names refused
  and skipped entries in `~/Agent Guard/last-launch-opencode.log`. Not planned.

### Pi and OMP

Until Pi moves onto Agent Guard's engine (step 10d), Pi's guard is
pi-sandbox-guard 7ad441f's with the five differences above, so:

- **The Guard List does not apply.** ALLOW entries do not add writes, and DENY
  and READ ONLY entries do not restrict a Pi or OMP session: a DENY entry
  protecting a folder from OpenCode does not stop a Pi session reading it.
  Planned: step 10d.
- **Nothing refuses tools when Pi or OMP starts outside the guard.** A direct
  start of the real executable runs without Seatbelt. Pi then loads the guard's
  extension from `~/.pi/agent/extensions/`, which warns `FILTER-ONLY` and runs
  the bash analyzer only, and `pi -ne` removes it. `AGENT_GUARD_BYPASS` has no
  effect. Planned: step 10d refuses tools in such a session, as OpenCode's plugin
  does.
- **Only `bash` is checked in-process.** The analyzer sees `bash` commands, not
  file tools such as `read`, `edit` and `write`. Seatbelt still applies to every
  write. Planned: step 10d.
- **The analyzer does not check Git history commands.** It allows `git push
  --force` and other pushes that rewrite or delete remote branches, and local
  discards such as `git checkout -- .`, `git restore .`, `git stash drop` and
  `git branch -D`; cc-safety-net blocks these in OpenCode sessions. Seatbelt
  cannot stop a push. It checks `git reset --hard` and `git clean`. Planned: an
  ask before a force-push in 0.2.1, and cc-safety-net for Pi at step 10d.
- **The launcher trusts its own folder.** It reads its profile and preamble from
  `~/.local/bin`, beside itself, not from a release folder in the write-protected
  engine folder. Pi sessions cannot write `~/.local/bin`, the launcher refuses a
  project that contains it, and OpenCode sessions cannot write the guard's files
  there. A route around those rules would leave a launcher, profile or wrapper
  writable, and it runs outside the sandbox at the next start. Planned: step 10d.
- **OMP's runtime folders were observed on OMP 17.2.10.** The profile's list of
  OMP folders a session may write comes from pi-sandbox-guard's observation of
  OMP 17.2.10 and was not rechecked against later OMP versions. Planned: rechecked
  against OMP 18.4.9 for step 10d.
- **OpenCode's project config names are writable in Pi and OMP sessions.**
  `opencode.json`, `opencode.jsonc`, `tui.json`, `tui.jsonc` and `.opencode`
  outside `.opencode/plugins` can be created or changed in a Pi session's project.
  An OpenCode started in that project loads them, including the plugins and MCP
  commands they name. Planned: step 10d.
- **An npm update can put a real `pi` back in `~/.local/bin`.** With npm's
  prefix at `~/.local`, an update of Pi can replace the launcher with npm's link;
  `pi`, and Agent Guard's `bin/pi`, which links to it, then start Pi unguarded.
  `agent-guard doctor` reports it. Not yet planned.
- **OMP's `agent.db` is writable.** OMP keeps runtime data and logins in one
  file, which it needs to write, so file-level protection of OMP's logins is not
  claimed. Not planned.
- **Files that carry instructions into later sessions are writable.** Files in
  `~/.pi/agent/prompts` whose names do not contain `prompt`, the `AGENTS.md`,
  `AGENTS.override.md` and `CLAUDE.md` that Pi 0.99.2 loads from its agent folder
  into every session, and OMP's `memories` can be written in a session and are
  loaded by later sessions. Not yet decided: protect them, or accept the risk in
  writing.
- **Anything in the project can be changed or deleted,** including build scripts
  and `.git/config`. The active Git hooks are write-denied as resolved at launch,
  but a session can point `core.hooksPath` at a folder it can write, whose hooks
  then run at the next `git` run outside the guard; the analyzer asks before a
  `git config` command that changes it. Review changes before running them
  outside the guard. Not planned.

pi-sandbox-guard defects kept until step 10d, because the launcher, preamble and
extension are reused unchanged apart from the five differences:

- A runtime started inside its own session, such as `pi` inside a Pi session,
  exits with `HOME_CANON: parameter not set` whenever `.guard-node` exists, which
  every Agent Guard install records. It fails closed: nothing starts.
- Home is passed to Seatbelt as the account database names it, not resolved, so
  with a home folder reached through a link the read denies may not match
  (inference, not tested).
- `DEVELOPER_DIR` is not cleared before the launcher's Git probes, so a value set
  before the launch chooses the developer tools they run (inference).
- The extension is not injected for `pi --help` and `pi --list-models`; it loads
  there only through discovery, so `-ne` or a settings entry can remove it.
- `PI_PACKAGE_DIR` is reported by `agent-guard doctor` but not refused. Pi 0.99.2
  takes its configuration folder name from the `package.json` there, which can
  move Pi's configuration past the profile's denies.
- The preamble's `PI_SANDBOX=0` and non-transparent branches cannot be reached;
  they have no effect on a session.

## Bug or vulnerability

A vulnerability is a reliable way for an agent running under the guard to do
what its harness's profile should stop.

For OpenCode:

- write outside ALLOW and the folders OpenCode needs;
- read a DENY entry;
- change the guard, the Guard List, OpenCode's config or plugins, its package
  stores, `bin` folder or model catalog, Pi's guard files once Pi's guard is
  installed, or another protected path or name;
- start OpenCode unguarded through an Agent Guard entry point (the `opencode`
  command, the app, or a forwarder left after the move from OpenCode Guard)
  without the plugin's refusal.

For Pi and OMP:

- write outside the project, temp, the Pi and OMP state the profile grants,
  `~/.npm`, `~/.cache` and `~/Library/Caches`;
- write what the profile denies there: Pi's or OMP's configuration, extensions or
  packages, a project's `.pi` or `.omp` folder or the other agent folders the
  profile protects, the project's active Git hooks, or a credential path;
- read a credential path the profile denies, a `.env` file or the analyzer's log;
- change Agent Guard's files, OpenCode's configuration, `~/.cc-safety-net`,
  `~/Library/LaunchAgents`, a shell startup file or its link target, or
  OpenCode's package stores, `bin` folder or model catalog;
- change Pi's guard files: the launchers, profile, preamble, recorded wrappers
  and `pi-sandbox-guard-extension` in `~/.local/bin`, the extension folder or
  `executables.conf`;
- run `open`, `osascript`, `osacompile`, `codesign`, `diskutil`, `launchctl` or
  `sudo`, or start a program through Launch Services or launchd;
- start Pi or OMP without Seatbelt through an Agent Guard entry point: `pi`,
  `omp`, Agent Guard's `bin/pi` or `bin/omp`, or a recorded wrapper.

A direct start of the real Pi or OMP executable runs without Seatbelt by design
until step 10d; that is a known limitation, not a vulnerability.

Report those through the advisory form.

Everything else is a bug and goes to a public issue (see
[CONTRIBUTING.md](CONTRIBUTING.md)): a refusal by the plugin, cc-safety-net or
Pi's analyzer that should not happen, a destructive command cc-safety-net or the
analyzer misses while Seatbelt still holds, an install, update, migration or
uninstall failure, and the limitations above. When unsure, use the advisory form.
