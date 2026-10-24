# Using Agent Guard

This guide describes release 2026.10.23, which supports OpenCode, Pi and OMP.
See [release channels](OPERATIONS.md#release-channels) for installation.

## Start OpenCode

Open a new terminal after installation so it receives Agent Guard's PATH entry.
Choose a project folder permitted by the Guard List, then run:

```sh
cd ~/Projects/your-project
opencode
```

For the desktop app, open `~/Applications/Agent Guard.app` instead of
`OpenCode.app`. Inside guarded OpenCode, the `agent_guard_status` tool reports
the loaded advisory plugin and its observed guard release. Run `agent-guard doctor` from Terminal outside
the guard; [diagnostic coverage](OPERATIONS.md#diagnostic-coverage) explains
what that check verifies and what it skips.

The sandbox covers the agent and its child processes. Network access remains
unrestricted, and permitted project files can still be changed or deleted.
Review changes before executing them outside the guard.

## OpenCode versions

Stable 2026.10.23 targets OpenCode 1.18.33 and newer V1 releases,
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
it and still uses the service Guard starts. With the opt-out on, `mcp`, `plugin`
and `debug` start their own private server, so Guard's service goes unused for
them, and `pair` is unavailable. Guard treats a `service status` of `disabled`,
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
protection summary is written only to that log. The full list of
essential folders is in [the security policy](../SECURITY.md#opencode-1).

OpenCode's required data, cache and temporary folders remain writable without
list entries. Build tools that use other home folders, such as `~/.cargo` or
`~/go`, need those folders under ALLOW. An ALLOW folder itself, and folders
above a READ ONLY or DENY entry, cannot be renamed or removed.

DENY entries can break tools that need the denied files. Denying `~/.ssh`, for
example, prevents Git over SSH inside OpenCode. `@project` is not supported by
the current launcher.

Imported OpenCode Guard lists keep their introductory text. You can update the
text above the first heading without changing the policy entries; the current
log is `last-launch-opencode.log`, not `last-launch.log`.

## Pi and OMP

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

The bash analyzer checks shell commands only; it does not check file tools.
It can block a command or ask for confirmation, but Seatbelt supplies the
enforcement boundary. A direct launch of the real Pi/OMP executable is
unguarded even if the analyzer loads and prints `FILTER-ONLY`; see
[unguarded execution and maintenance](OPERATIONS.md#running-pi-or-omp-without-the-guard).

Pi OAuth logins stop at their first refresh inside a session because
`auth.json` is write-protected. Install packages and edit settings outside the
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

## Peer CLIs

Inside guarded OpenCode, Pi and OMP sessions, `codex`, `claude`,
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
  exits with `HOME_CANON: parameter not set`. This is a pi-sandbox-guard defect,
  present in the current Pi guard whenever `.guard-node` exists, which every
  Agent Guard install records. It fails closed: nothing starts.

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
Commands that need a launcher-owned service (V2 `mcp`, `plugin`, `debug` and
`pair`) are refused, and so are the desktop app and the launcher's self-check. The
launcher recognizes another sandbox only by macOS refusing to apply a second
profile; any other failure of that probe stops the launch as before.

## OpenCode skills

0.2.2 permits ordinary skill maintenance in standard OpenCode and
compatible skill folders. See [skill permissions](SKILLS.md) for defaults,
explicit restrictions, first-time preparation and scoped deletion.
