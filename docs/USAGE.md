# Using Agent Guard

This guide describes the current checkout, which supports OpenCode, Pi and OMP.
OpenCode configuration maintenance is unreleased.
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
the applied paths and any skipped or refused entries. The full list of
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
  Guard's `opencode` called by its full path fails at its first write.
- `omp` inside a Pi session and `pi` inside an OMP session refuse.
- A runtime started inside its own session, such as `pi` inside a Pi session,
  exits with `HOME_CANON: parameter not set`. This is a pi-sandbox-guard defect,
  present in the current Pi guard whenever `.guard-node` exists, which every
  Agent Guard install records. It fails closed: nothing starts.

## OpenCode skills

0.2.2 permits ordinary skill maintenance in standard OpenCode and
compatible skill folders. See [skill permissions](SKILLS.md) for defaults,
explicit restrictions, first-time preparation and scoped deletion.
