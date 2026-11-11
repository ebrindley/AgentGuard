# Using Agent Guard

This guide describes release 2026.11.10, which supports OpenCode, Pi, OMP and Grok.
See [release channels](OPERATIONS.md#release-channels) for installation.

## Start OpenCode

Open a new terminal after installation so it receives Agent Guard's PATH entry.
Choose a project folder permitted by the Guard List, then run:

```sh
cd ~/Projects/your-project
opencode
```

The installer adds terminal activation to `~/.zprofile` and `~/.zshrc`.
With an exported `ZDOTDIR` pointing elsewhere, add this line to that folder's
`.zprofile` and `.zshrc` yourself, then open a new terminal:

```sh
export PATH="$HOME/Library/Application Support/AgentGuard/bin:$PATH"
```

Installation and `agent-guard doctor` warn when their environment contains a
nondefault `ZDOTDIR`; they do not edit those startup files. An unexported shell
variable is not visible to them. Uninstall does not remove manually added lines.

For the desktop app, open `~/Applications/Agent Guard.app` instead of
`OpenCode.app`. Inside guarded OpenCode, the `agent_guard_status` tool reports
the loaded advisory plugin and its observed guard release. Run `agent-guard doctor` from Terminal outside
the guard; [diagnostic coverage](OPERATIONS.md#diagnostic-coverage) explains
what that check verifies and what it skips.

The sandbox covers the agent and its child processes. Network access remains
unrestricted, and permitted project files can still be changed or deleted.
Review changes before executing them outside the guard.

## OpenCode versions

Stable 2026.11.10 targets OpenCode 1.18.33 and newer V1 releases,
plus OpenCode 2.0.32 and 2.1.1 CLI and desktop backends. The native V2
fixtures also pass with the OpenCode 2.1.4 CLI. Keep shared configuration in the V1 format
when both versions use it; V2 normalizes supported V1 settings in memory.
Native V2-only settings are not a configuration migration for V1.

Native compatibility fixtures exercise CLI tool policy and the desktop backend's
service lifecycle. They do not attest renderer behavior, first-launch onboarding,
or the desktop's stored approval mode. See [supported versions](../SECURITY.md#opencode)
for qualification limits.

| Interface | OpenCode 1 | OpenCode 2 |
|---|---|---|
| Terminal | Existing CLI runs under Seatbelt | Interactive and server-backed commands use `--standalone`; commands without that flag use a launcher-owned service |
| Desktop | App and its child backend run under Seatbelt | Guard starts the bundled CLI's service under Seatbelt, then starts the app and stops that service when the app exits |
| Plugin | V1 hooks and tool arguments | V2 hooks translate tool names and file arguments into the same Guard checks |
| Diagnostics | V1 server endpoints | V2 status RPC and plugin list; desktop bundled CLI checked separately when different |

Open the desktop through `~/Applications/Agent Guard.app`. If V2 already has a
shared service, close its clients and run `opencode service stop` outside the
guard before opening Agent Guard. The launcher neither adopts nor stops an
incumbent service. Quit the app, rather than only closing its window, to end its
owned service. Loss of that service closes the client; reopen Agent Guard to
start a fresh service. Restart to apply a changed Guard List.

OpenCode's service opt-out, `"disabled": true` in
`~/.config/opencode/service.json`, does not change the desktop: the app ignores
it and still uses the service Guard starts. With the opt-out on, server-backed
`mcp`, `plugin` and `debug` commands start their own private server, so Guard's
service goes unused for them, and `pair` is unavailable. `mcp add`, `plugin add`
and `plugin remove` edit local configuration without a server. Guard treats a
`service status` of `disabled`,
proposed upstream in anomalyco/opencode#53374, the same as `stopped`.

The terminal launcher uses the first native `opencode` on PATH, then its usual
fallback locations. If none exists, it can use the desktop's bundled
`Contents/Resources/opencode-cli`. The desktop always uses its own bundled V2
backend, so installing a V2 app does not select V2 for a terminal with V1 on PATH.

An explicit `--server` or V1 attachment selects a server with its own permissions;
client confinement does not establish server protection. Peer launch wrappers
refuse these attachments. V2 service start/restart and ACP login are maintenance
operations to run outside the guard; use `opencode serve` to start a foreground
guarded server. `doctor` uses a private probe, not the service attached to an
existing desktop window, and does not call a model.

## OpenCode Desktop behavior

Observed with OpenCode Desktop 2.1.4 on macOS unless noted. Statements about
OpenCode's code come from reading its bundle, not from running it.

- Closing the last window does not quit OpenCode. It stays in the Dock; click
  its icon to get a window back, or quit with Cmd-Q. Opening Agent Guard while
  OpenCode is running shows "OpenCode is already open"; the launcher cannot tell
  whether that OpenCode is guarded, so the message covers both cases.
- OpenCode checks for updates at launch and every ten minutes. Inside the guard
  it cannot replace the app. On 2026-10-24, 2.1.1 staging 2.1.4 raised an
  administrator prompt; cancelling it was logged as `OSStatus error -60006`.
  Since 2026.10.25 the guard denies `com.apple.authd` to the desktop, so the
  in-app update now fails without a prompt. Quit OpenCode, update it outside the
  guard, then reopen it through Agent Guard. For the Homebrew cask, run
  `brew upgrade --cask opencode-desktop`. The cask declares `auto_updates`, but
  Homebrew 7.0.10 also upgrades it with plain `brew upgrade` once the installed
  app is older than the tap's version (`Cask#outdated_version`), unless
  `HOMEBREW_NO_UPGRADE_AUTO_UPDATES_CASKS` is set. The other route is the
  download from opencode.ai.
- Browser links cannot open from the sandbox. In OpenCode 2.2.5, Console
  sign-in offers **Copy sign-in link**. Paste that link into your browser.
  Other browser sign-ins, including ChatGPT and legacy Codex browser login,
  do not expose the URL in Desktop. Use `opencode auth login` or `/connect`
  in a guarded terminal to obtain it, then complete authorization in your
  browser. Device-code methods show a copyable code; the terminal also shows
  the verification URL. API-key methods need no browser handoff.
  Quit and reopen OpenCode through Agent Guard after connecting in another
  process if Desktop still shows the provider as disconnected. A local fixture
  checks callback, refresh and backend-restart behavior; live provider login
  and the desktop renderer are not attested by that fixture.
- Desktop loads provider variables and PATH from your interactive login shell
  under its sandbox before starting the managed backend. Shell startup cannot
  write outside the granted folders. Guard controls and filesystem selectors
  such as `HOME`, `XDG_*` and OpenCode configuration paths retain their launch
  values; changing them in shell startup does not change the generated profile.
  These imported variables are passed only to confined OpenCode processes.
  A failing shell, or one that takes longer than five seconds, leaves the
  inherited environment in place and reports a note. Shell startup receives
  no terminal input.

### Browser handoff

Guarded OpenCode launches can open supported sign-in URLs through a small
launcher-owned helper. The desktop and backend still cannot call Launch
Services directly. The helper selects the default HTTPS application at launch;
requests cannot select another application, pass launch arguments, or open files.

In OpenCode 2.2.5, use the command palette and choose **Connect ChatGPT through
Agent Guard**, **Connect OpenCode through Agent Guard**, or **Sign in Claude Code
through Agent Guard**. These are new commands; the vendor's existing browser
buttons still use the denied native opener. ChatGPT and OpenCode Console use
their existing backend authentication APIs. The command shows completion or an
error and offers cancellation while waiting. OpenCode Go's API-key methods need
no browser handoff.

If these commands are missing, the launch continued without the handoff.
`~/Agent Guard/last-launch-opencode.log` then has a line starting
`browser handoff unavailable:` that gives the reason.

Claude's command starts `claude auth login --claudeai` in a terminal supplied by
the plugin, inside the existing desktop sandbox. It uses the shared Claude Code
account, not an Anthropic API key. The helper forwards its browser request;
credential saving and refresh retain their existing restrictions. This change
does not attest complete Claude sign-in or credential persistence. If credential
saving fails, use Claude Code's normal sign-in outside the guard. After signing
in, connect Claude Agent in OpenCode's Providers settings.

The helper also supplies the `open` command and `BROWSER` for guarded OpenCode
terminal sessions and `opencode auth login`. It accepts the OpenAI authorization
and device pages, OpenCode's `/console/` pages, and the Claude authorization pages
on `claude.ai`, `console.anthropic.com` and `platform.claude.com`. Other links,
custom URL schemes and local files are refused. The helper checks the initial
URL; it does not control subsequent browser navigation or consent decisions.
The helper ends with its launch. If a default browser cannot be resolved, or the
account path is too long for a Unix socket, the launch reports that handoff is
unavailable and leaves the existing browser restrictions in place.
- A prompt "'Agent Guard' would like to access the Microphone" appeared 155 ms
  after an agent reply finished, which is when OpenCode plays its "agent
  finished" sound. The sound is on by default (Settings, General, Sound
  effects, Agent), and OpenCode's helpers carry the audio-input entitlement.
  This version's desktop code does not capture audio. Its only `getUserMedia`
  call asks for a camera, in a web-only QR scanner. On 2026-10-25 the request
  came from `coreaudiod` as OpenCode's audio helper opened the default output,
  a virtual device with 8 input and 8 output channels. That is consistent with
  a report that macOS asks when an app with the audio-input entitlement starts
  playback on a device that has inputs
  (https://developer.apple.com/forums/thread/743077). The prompt names Agent
  Guard because Agent Guard starts OpenCode. Since 2026.10.25.1 Agent Guard
  signs its app with the hardened runtime and without the audio-input
  entitlement, so macOS
  refuses the microphone to the processes the app starts, without a prompt, and
  the sound still plays. No program those processes run can use the
  microphone, a future OpenCode voice feature included, and System Settings
  cannot grant it. OpenCode started from a terminal is not affected.

## OpenCode shared service

OpenCode 2 starts a shared background service for commands run without
`--standalone` and leaves it running after the command ends. While it runs,
`Agent Guard.app` refuses to start. The installer therefore turns the service's
automatic start off once per Mac, by setting `disabled: true` in
`~/.config/opencode/service.json`. A direct `opencode` command then runs a
private server that ends with it. The installer prints which it did: turned off,
or left as you set it when the file already had `disabled`.

- Pairing (`opencode pair`) needs the shared service and is unavailable while it
  is off.
- To turn sharing back on, run `opencode service set disabled false` outside the
  guard, or `opencode service enable` once OpenCode ships
  [anomalyco/opencode#53374](https://github.com/anomalyco/opencode/pull/53374).
  Agent Guard records that it set the value and does not set it again, even when
  you remove the key.
- The desktop app ignores the setting and still starts its own service, and so
  does `opencode service start`. Guarded launches do not depend on it.
- `agent-guard uninstall` removes the key while it is still `true`; a value you
  changed stays.

## Configure OpenCode

Inside guarded OpenCode you can maintain ordinary configuration, plugins, MCPs,
skills, agents, tools and themes. Default global roots are writable and project
configuration follows project access. Guard's own files, bootstrap entries and
`~/.opencode/bin` stay protected. Custom config paths require existing write
permission; selecting one does not expand the sandbox. See
[configuration maintenance](OPERATIONS.md#opencode-configuration-and-skills).


Edit `~/Agent Guard/Guard List.txt` in Terminal or a text editor outside the
guard. Save it, then quit and reopen OpenCode. Pi and OMP do not read this list.

```text
ALLOW
~/Projects

READ ONLY
~/Projects/reference

DENY
~/Private
```

Use folders that exist for ALLOW. A READ ONLY or DENY entry may name a path
that does not exist yet; the launcher keeps it, and logs a spelling warning for
DENY.

Paths resolve existing symlink targets before `..`, as filesystem access does.
Missing suffixes below resolved folders remain restricted. A dangling symlink is
kept at its name; its missing target is not separately restricted. A tab in a
path refuses the launch; remove it from the Guard List and reopen OpenCode.

- ALLOW permits creating, changing and deleting files inside the listed folder.
- READ ONLY removes write permission, including within an ALLOW folder. It does
  not restrict reads to listed folders; other readable paths remain readable.
- DENY blocks reads and writes and wins every overlap. Otherwise the most
  specific entry wins.

Put one absolute path or `~` path per line. You can drag a path from Finder;
quotes and Finder's backslash escapes are accepted. Heading names are
case-insensitive; READ-ONLY is also accepted. Lines starting with `#` and text
before the first heading are ignored.

The launcher skips nonexistent ALLOW entries and keeps nonexistent READ ONLY entries. It refuses ALLOW
entries broad enough to contain `~/Library/Application Support`, `~/.config`
or `~/.local`, and refuses READ ONLY or DENY entries that cover essential
system or runtime folders. Check `~/Agent Guard/last-launch-opencode.log` for
the applied paths and any skipped or refused entries. A terminal launch prints
refusals, warnings, failures, skipped entries, overrides and environment notices.
The desktop app and `check` keep refusals and warnings in that log. A desktop
failure shows an alert. A `check` failure prints. The allow, read-only, deny and
protection summary is written only to that log. A refused or failed launch appends
a `failed:` line with the reason and an `agent-guard-stage:` line; when the
launch had not yet rewritten the log, a header ending `refused before launch`
comes first, and the earlier content stays above it. The full list of
essential folders is in [the security policy](../SECURITY.md#opencode-1).

OpenCode's required data, cache and temporary folders remain writable without
list entries. Build tools that use other home folders, such as `~/.cargo` or
`~/go`, need those folders under ALLOW. An ALLOW folder itself, and folders
above a READ ONLY or DENY entry, cannot be renamed or removed.

DENY entries can break tools that need the denied files. OpenCode sessions
cannot read or write the credential paths (`~/.ssh`, `~/.gnupg`, `~/.aws` and the
others SECURITY.md lists) or `.env` files other than `.env.example`, `.env.sample`
and `.env.template`, and run without `SSH_AUTH_SOCK` and without access to
ssh-agent or gpg-agent, so Git over SSH fails inside them; use HTTPS remotes, or
set `AGENT_GUARD_SSH_AGENT=allow` outside the guard before starting OpenCode.

AWS profiles and SSO are opt-in. Start a terminal session with
`AGENT_GUARD_AWS_AUTH=allow opencode`. For Desktop, run
`AGENT_GUARD_AWS_AUTH=allow "$HOME/Library/Application Support/AgentGuard/bin/opencode-gui"`
from Terminal. Set the choice before launch; a setting inside OpenCode or its
shell does not change the active profile.

This permits reads under `~/.aws` and writes only under `sso/cache`,
`login/cache` and `cli/cache`. Configuration and credential files remain
write-protected, including their resolved symlink targets. Cache directory
entries cannot be replaced; symlinks within a cache's root path are refused.
The AWS root must resolve inside your account home. Guard List READ ONLY and
DENY entries still take precedence. Relocated AWS cache folders receive no
automatic grant. Complete initial AWS CLI/SSO setup outside the guard.
The session can use the selected AWS credentials with their full account
permissions, so use an appropriately scoped inference profile. API keys and
credentials already supplied through the environment do not need this opt-in.

OpenCode sessions cannot write Git hooks, other than Git's `*.sample` files, in
any repository or in the active hooks folder of the launch folder, so hook
managers such as husky, lefthook and pre-commit cannot install hooks inside them;
run their install commands outside the guard. A `core.hooksPath` that is home, a
system folder or contains the launch folder refuses the launch.
Inside OpenCode sessions, routine Git work is allowed: per-file `git restore` and
`git checkout -- <file>`, `git stash drop`, `git branch -D`, `git tag -d`, merge
and rebase aborts, `git push --delete` and `--force-with-lease`. Force and mirror
pushes, whole-tree discards such as `git reset --hard`, `git checkout .` and
`git restore .`, `git clean -f` and setting `core.hooksPath` are refused; run
them in a terminal outside the guard, and use `rm -r <path>` in place of a
path-scoped `git clean`. The checker runs at cc-safety-net's `standard` level,
so an interpreter that reads its program from a heredoc (`python3 - <<'PY'`),
`eval "$(pyenv init -)"` and `source <(...)` setup lines run; `rm -rf "$DIR"`
and `rm -rf *` are still refused. Still refused: a download piped to a shell and
`sh -c "$CMD"`, `. "$HOME/.nvm/nvm.sh"` and similar runs of a variable or sourced
script. Only shell commands are checked; the file tools are not. Your own
`~/.cc-safety-net` settings still apply in sessions, and take effect at the next
launch; the `paranoid` level, if you set it, stays.


### Grant only the project you start OpenCode in

`@project` is an ALLOW entry for the folder a session was started for, so one
list grants each session its own project instead of a fixed folder. It is off
by default: new lists carry it commented out. To turn it on, remove the `#` from
the `# @project` line under ALLOW, and drop a broad entry such as `~/Projects`
if you want sessions limited to their own project. Existing lists are never
rewritten by install, update or migration, so add the line yourself.

```text
ALLOW
@project
```

- `opencode [project]` takes the project argument; `opencode .`, a relative path
  and a path with spaces all work. A subcommand (`run`, `serve`, ...) or an
  option value is never taken as the project. `opencode run --dir <folder>`
  uses that folder.
- With no project argument, `@project` is the Git top level of the folder you
  start in, else that folder. Symlinks are resolved first, and a protected name
  inside the project that is a symlink is handled as in the launch folder.
- Each launch uses its own rules, so two sessions in different projects each
  write only their own project.
- Linked worktrees and checkouts with a separate Git directory grant the
  checkout only. When their Git metadata lies outside every ALLOW entry,
  `git add` and commits fail on metadata writes such as `index.lock`. Run
  `git rev-parse --path-format=absolute --git-common-dir` in the checkout to
  locate the shared metadata directory, then review and add that directory
  explicitly under ALLOW outside the guard. For a linked worktree, this is
  normally the original repository's `.git` directory. This permits shared
  repository metadata changes; Git hook protection still applies. Restart
  OpenCode after changing the list.
- The launch is refused, not widened, when `@project` is `/`, your home, `/Users`,
  `/Volumes`, `/tmp`, `/private`, `/var` or their private spellings, is or is
  inside a system folder, `~/.ssh`, `~/.aws`, `~/.config`, `~/.docker`,
  `~/.gnupg`, `~/.kube`, `~/Library`, `~/Desktop`, `~/Documents` or
  `~/Downloads`, contains the guard, or is inside a protected agent folder. A
  home folder that is a Git repository therefore refuses a launch from a folder
  with no repository of its own; comment out `@project` or start in a project.
  A relative project that OpenCode 1 and 2 would read differently, through a
  symlink and `..`, is refused: give a full path. So is an option this launcher
  does not know when a word follows it, because the word could be the project;
  write `--option=value`.
- A project folder that does not exist, and `@project` under READ ONLY or DENY,
  are skipped and logged. `last-launch-opencode.log` records what `@project`
  resolved to and any refusal.
- Pi, OMP and Grok do not use `@project` yet; they skip it.

#### `@project` in the desktop app

OpenCode Desktop is one process for all its projects and cannot be told which
folder to open, so the launcher cannot derive `@project` from the folder you
started in. In the app, `@project` is the set of folders you added to
`Agent Guard.app`. They are stored in `state/opencode/app-projects` in the engine folder
(one path per line), which sessions cannot write, so a session cannot add a
folder for a later launch.

- Add a folder by dropping it on `Agent Guard.app` in the Dock or Finder, or with
  Open With. Several folders can be dropped at once. The launcher takes each as
  given (no Git top-level lookup), applies the refusals above, and adds it to the
  store only when the launch goes ahead.
- The first time you open the app with `@project` on and no remembered folder, a
  chooser asks for one. Cancel quits without launching. Later opens launch
  without a prompt.
- Every launch re-resolves each stored folder. One that no longer exists is
  skipped and kept in the store. One that is now refused, or that now resolves
  through a link to a different folder than the one stored, fails the launch with
  an alert that names it and the removal command; nothing is granted or skipped
  silently.
- Dropping a folder grants it and remembers it; it does not open it in Desktop.
- A dropped path must be an absolute path to an existing folder, and must not be
  refused; otherwise the launch fails with an alert and nothing is added.
- Dropping a folder while `@project` is not under ALLOW shows an alert and does
  not launch. Remove the `#` from `@project` first. With `@project` off, the app
  keeps the fixed ALLOW folders and ignores the store.
- Dropping or opening while OpenCode is already running fails with the usual
  already-open alert and changes nothing.

```sh
agent-guard app-projects                 # list the remembered folders
agent-guard app-projects remove PATH     # forget one
```

`remove` matches the stored line first, then the path as typed, resolved to its
canonical form. It fails inside a guarded session, where the store is not
writable. `last-launch-opencode.log` records `@project resolves to:` followed by
the folders, or `none` when `@project` is on and no folder is remembered.

Limit: Desktop shows every project in one window under one grant, and restores
its last project from its own app data, which sessions can write. It can
therefore reopen a project you did not add. Writes there are refused unless
another ALLOW entry covers the folder. Observed with Desktop 2.2.5.

Imported OpenCode Guard lists keep their introductory text. You can update the
text above the first heading without changing the policy entries; the current
log is `last-launch-opencode.log`, not `last-launch.log`.

## Pi and OMP

Pi can read project settings that require a `settings.json.lock` directory.
Only that directory node is writable; its contents and project configuration
remain protected.

Run `pi` or `omp` from a project folder. The launcher prints `OS sandbox ON`
and runs the agent and its child processes under the operating system sandbox
(Seatbelt). The project is `PI_PROJECT` when set, otherwise the Git top level,
otherwise the current folder. Home, sensitive folders such as `~/Documents`
and `~/.config`, and projects that contain the launcher's own folder are refused.

The Guard List does not apply. The fixed profile permits writes in the project,
temporary folders and selected runtime/cache locations. It protects agent
configuration, extensions, active Git hooks and specified credentials, and
denies reads of specified credential paths and `.env` files. The complete
policy and exceptions are in [SECURITY.md](../SECURITY.md#pi-and-omp).

Pi and OMP check shell commands with cc-safety-net, under the same policy as
OpenCode (DESIGN.md decision D13). Each verdict is allow or refuse: there are no
confirmation prompts. At launch the guard copies `~/.cc-safety-net` into the
session and adds Agent Guard's Git rules; `~/.cc-safety-net` itself is not
changed. Routine work is allowed: `git status`, `commit`, `rebase`, `pull`,
`push` (also `--force-with-lease` and `--delete`), `stash drop`, `branch -D`,
`git restore` and `git checkout -- <path>` with a path, `rm -rf` of a literal
path below the project, package managers, builds and tests. Refused: `git push`
with `--force`, `-f` or a `+` refspec, and `--mirror`; `git reset --hard`,
`git checkout .`, `git restore .`, `git clean -f`, `git switch -f`, `git stash clear`; `git config core.hooksPath`; `rm -rf` of the project folder itself, its
parents, home, `/` or a dynamic path such as `rm -rf "$DIR"` or `rm -rf *`; and a
download piped to a shell, or a variable or sourced script run as shell (`sh -c
"$CMD"`, `. "$HOME/.nvm/nvm.sh"`). Allowed too: interpreters that read their
program from a heredoc (`python3 - <<'PY'`) and shell setup such as
`eval "$(pyenv init -)"`. Run a refused command in a terminal outside the guard.
The refusal names the rule.

Only shell commands are checked. The file tools `read`, `write`, `edit` and
`grep`, and other tools, pass the checker; Seatbelt decides what they can read
and write, and it denies reads of `.env` files and the credential paths.

If the checker cannot run, every tool call is refused and the message says what
to fix: relaunch through `pi` or `omp` for a missing session copy, fix
`~/.cc-safety-net/rules/rule.json` (`npx cc-safety-net doctor` lists the problem)
when the Git rules did not load, or rerun the installer when cc-safety-net fails
to load. When the installed release is already the latest, `agent-guard update`
only runs `doctor` and repairs nothing; see
[Release channels](OPERATIONS.md#release-channels). Seatbelt supplies the
enforcement boundary. A direct launch of the real Pi/OMP executable is unguarded
and refuses every tool call, because it has no session copy; see
[unguarded execution and maintenance](OPERATIONS.md#running-pi-or-omp-without-the-guard).

Set up Pi credentials outside the guard before the first guarded session: Pi
cannot create its protected `auth.json` inside a session.
Pi OAuth logins stop at their first refresh inside a session because
`auth.json` is write-protected; log in and refresh outside the guard, or use an
API key (DESIGN.md decision D16). Pi and OMP sessions cannot reach ssh-agent or
gpg-agent, so git over SSH fails inside them; use HTTPS remotes, or set
`AGENT_GUARD_SSH_AGENT=allow` outside the guard before starting Pi or OMP.
Install packages and edit settings outside the
guard. OMP profiles must be selected before confinement; `--profile` must be
the first argument and appear only once. Active XDG-split OMP state is refused
by the current launcher.

Since stable 0.2.1, the launcher creates and pins active state-root directory
nodes before confinement, including OMP's `profiles` directory. Runtime files
below them remain writable.

After updating Pi or OMP, run `agent-guard doctor` from Terminal. An npm update
with its prefix at `~/.local` can replace the Pi launcher and make `pi` start
unguarded. See [bindings](OPERATIONS.md#commands) for stale executable paths and
[updates and sessions](OPERATIONS.md#updates-and-sessions) for running sessions.

## Custom wrappers

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

Helpers run before Seatbelt with the account's full authority. The check validates
the permitted wrapper syntax and helper paths; it does not prove helper arguments
safe. Review download and output destinations before installing a wrapper.

## Grok

When the installer finds Grok, `grok` in a new terminal window, `~/.local/bin/grok`
and Agent Guard's `bin/grok` start Grok inside the guard with `--sandbox off`:
Grok's own sandbox profiles block the keychain, so `gh` and `git` over https fail
under them, and Agent Guard's profile takes their place. The Guard List applies as
for OpenCode, and so does nothing else of OpenCode's: there is no plugin.

Grok can write the folders the Guard List allows, `~/.grok` apart from the files
below, and its caches. It authors skills, agents, workflows, rules, `AGENTS.md`,
memory, plugins and sessions as usual. These stay write-protected:
`~/.grok/config.toml`, `sandbox.toml`, `requirements.toml`, `managed_config.toml`
and `trusted_folders.toml`; `hooks`, `hooks-paths` and the targets it names; `bin`,
`downloads`, `vendor`, `bundled` and `bundles`; the `grok` link; and
`~/.config/gh`, which stays readable. A setting changed inside a session, such as
`/model` or a folder-trust answer, therefore applies to that session only; change
`config.toml` outside the guard.

`~/.ssh`, `~/.gnupg`, `~/.aws`, `~/.git-credentials`, `~/.config/git/credentials`,
`~/.netrc`, `~/.npmrc`, `~/.secrets`, `~/.docker/config.json`, `~/.kube/config` and
`.env` files (but not `.env.example`, `.env.sample` or `.env.template`) can be neither
read nor written. The keychain stays usable, so a session can use the accounts
`gh` and `git` hold. Sessions run without `SSH_AUTH_SOCK` and with npm's user
configuration disabled, and cannot reach ssh-agent or gpg-agent, so git over SSH
fails inside them; use HTTPS remotes, or set `AGENT_GUARD_SSH_AGENT=allow`
outside the guard before starting Grok.

Grok sessions cannot write Git hooks, other than Git's `*.sample` files, in any
repository or in the active hooks folder of the launch folder, so hook managers
such as husky, lefthook and pre-commit cannot install hooks inside them; run their
install commands outside the guard. A `core.hooksPath` that is home, a system
folder or contains the launch folder refuses the launch.

Run these outside the guard, with Grok's own executable (`~/.grok/bin/grok`, or
the path the installer and the refusal message name when Grok was a regular file
at `~/.local/bin/grok`);
`grok` refuses them in a guarded session and says so: `grok login`, `grok logout`,
`grok update` and `grok workspace start|restart|resume`. Grok's updater is off in a
guarded session. The launcher also refuses an explicit `--sandbox` profile other
than `off` (and `GROK_SANDBOX`), `--leader`, `use_leader = true` in the
configuration, a `GROK_HOME` other than `~/.grok`, and resuming a session that
was saved with a sandbox profile, which Grok keeps for the life of the session.
Start a new session instead.

## Peer CLIs

Peer subscription logins and OpenCode's own provider connections use different
credential stores. OpenCode 2.2.5 can save and refresh its own credentials in its
data directory. Codex's file-backed login and Claude's credential-file fallback
receive no automatic write grants. A peer may therefore read an existing login
but fail to save a refreshed token. If the provider rotates that token, a later
run may require signing in again outside the guard. Keychain refresh support is
not qualified. Use an API key for guarded peers when persistent subscription
refresh is required but unavailable; changing the whole credential directory's
permissions is not a supported remedy.

Azure CLI token-cache writes are also not automatically granted. Azure API-key
connections avoid that dependency. Google application-default credentials can
be read at their ordinary path, but initial `gcloud auth` setup belongs outside
the guard. A credential under a named denied path remains inaccessible.

Inside guarded OpenCode, Pi, OMP and Grok sessions, `codex`, `claude`,
`cursor-agent`, `grok` and `opencode` use session-only launch wrappers. They
inherit the parent filesystem boundary and keep their native approvals, hooks,
models and configuration. No additional sandbox flags are needed. Launches
outside the guard use the normal CLI behavior.

An explicit inner sandbox such as `codex --sandbox read-only` is refused:
macOS cannot apply that restriction inside the existing sandbox. A read-only
consultation prompt expresses task intent; it does not remove the parent's
write permissions. Persistent sandbox defaults, including Codex profiles, are
replaced by parent confinement; native approvals remain active. Use the parent's
read-only filesystem rules when that
boundary is required.

Runtime state uses the standard user locations. Authentication and configuration
files are not copied or relocated. CLI-specific mixed state files are excluded
from the new grants. OMP launcher behavior is covered by disposable fixtures;
real OMP qualification requires an OMP installation.

## Nested launches

- `pi` or `omp` started inside an OpenCode session refuses, as it refuses under
  any sandbox it cannot verify as its own.
- Inside a Pi or OMP session, `opencode` from the session's PATH runs the real
  OpenCode under that session's sandbox, as with pi-sandbox-guard. Agent
  Guard's `opencode` called by its full path steps aside, as below.
- `omp` inside a Pi session and `pi` inside an OMP session refuse.
- A runtime started inside its own session, such as `pi` inside a Pi session,
  runs under the enclosing session's sandbox once its confinement checks pass.
  Releases before this one exited with `HOME_CANON: parameter not set`
  whenever `.guard-node` existed, which every earlier Agent Guard install
  recorded; this release does not read `.guard-node`.

### Inside another sandbox

When `opencode` starts inside a sandbox Agent Guard did not create, such as
another agent's command sandbox or a tool that wraps OpenCode in
`sandbox-exec`, macOS cannot apply Agent Guard's profile as well. The terminal
launcher then prints one note and runs the real OpenCode under the existing
sandbox, with `--standalone` on V2 as usual. That sandbox confines OpenCode, not
Agent Guard's: the Guard List is not read, nothing is written to
`~/Agent Guard` or the engine folder, and the plugin treats the session as
unguarded, refusing tools as it does for a bare `opencode` unless
`AGENT_GUARD_BYPASS=1` is set.
Commands that need a launcher-owned service (V2 server-backed `mcp`, `plugin`,
`debug` and `pair`) are refused, and so are the desktop app and the launcher's self-check. The
launcher recognizes another sandbox only by macOS refusing to apply a second
profile; any other failure of that probe stops the launch as before.

## OpenCode skills

0.2.2 permits ordinary skill maintenance in standard OpenCode and
compatible skill folders. See [skill permissions](SKILLS.md) for defaults,
explicit restrictions, first-time preparation and scoped deletion.
