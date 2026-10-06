# Agent Guard

Agent Guard limits where coding agents can write on macOS using the operating
system sandbox (Seatbelt). The sandbox covers the agent and its child processes;
plugins and command analyzers provide additional checks.

The stable release, [0.2.2](https://github.com/ebrindley/AgentGuard/releases/tag/v0.2.2),
supports OpenCode, Pi and Oh My Pi (OMP). Agent Guard replaces OpenCode Guard
and pi-sandbox-guard. Pi and OMP use a separate project-based policy.

## Supported agents and protection

| Agent | Write access | Read restrictions | Guard List |
|---|---|---|---|
| OpenCode | ALLOW folders, standard global skill folders and required runtime/cache/temp locations | Explicit DENY entries | Applies |
| Pi / OMP | Launched project and permitted runtime/cache/temp locations | Fixed credential-path and `.env` denies | Does not apply |

Agent configuration and guard files are write-protected, subject to the
[documented exceptions](SECURITY.md). Network access is unrestricted. Files
inside permitted write locations can still be changed or deleted; keep backups
and review changes before running them outside the guard. Reads outside the
applicable denies remain broad. The operating system sandbox is the enforcement
boundary; plugins and analyzers cannot replace it.

## Install and first run

Requires macOS 15 or later and an installed agent. For OpenCode, install the
CLI or desktop app. Pi/OMP also require Node on PATH outside folders their
sessions can write, such as a Homebrew installation. The OpenCode guard is
installed on every Mac; the installer adds Pi's guard when it detects Pi
or OMP. An OMP executable stored directly at `~/.local/bin/omp` must be moved
first; see [requirements](docs/OPERATIONS.md#requirements).

Run installation from Terminal outside any agent session or sandbox. Quit
running agents before migrating an older guard. Choose an existing projects
folder when prompted; OpenCode will be able to change its contents.

```sh
/bin/zsh -c "$(/usr/bin/curl -fsSL https://github.com/ebrindley/AgentGuard/releases/latest/download/install.sh)"
```

This command executes downloaded bootstrap code. The bootstrap checks the
archive's SHA-256 checksum before installation; the checksum detects corruption,
not publisher authenticity. See [installation and migration](docs/OPERATIONS.md#installation)
for options, rollback and older guards.

Open a new terminal, check the installation, then start OpenCode in your project:

```sh
agent-guard doctor
cd ~/Projects/your-project
opencode
```

For Pi or OMP, run `pi` or `omp` from the project instead. Their launcher
prints `OS sandbox ON`. For OpenCode's desktop app, open
`~/Applications/Agent Guard.app`. Its `agent_guard_status` tool reports the
guard's active release.

Read `doctor`'s warnings and skips: it is an installation check, not a full
security audit. Without the OpenCode CLI, the plugin check is skipped; a pass
does not verify the desktop app's plugin. See [diagnostic coverage](docs/OPERATIONS.md#diagnostic-coverage).

## Configure OpenCode

Edit `~/Agent Guard/Guard List.txt` outside the guard, then save and restart
OpenCode. For example:

```text
ALLOW
~/Projects

READ ONLY
~/Projects/reference

DENY
~/Private
```

ALLOW permits creating, changing and deleting files. READ ONLY removes write
permission, including within ALLOW. DENY blocks reads and writes and wins
overlaps; otherwise the most specific entry wins. READ ONLY is not a read
allowlist: unlisted readable files remain readable.

ALLOW folders must exist; missing ALLOW entries are skipped. Missing READ ONLY
entries still apply. Check
`~/Agent Guard/last-launch-opencode.log` for applied, skipped or refused rules.
Allowing `~/Projects` grants access to every project there. Pi/OMP ignore this
list and select their project from the launch context. See
[configuration and agent usage](docs/USAGE.md) for path rules, credentials,
bindings, custom wrappers and nested launches.

## Maintenance outside the guard

Install or update OpenCode plugins, language servers and model catalogs outside
the guard using the real executable. Pi/OMP packages and protected settings
also need outside maintenance. These commands run with your account's full
authority. Follow the [maintenance procedures](docs/OPERATIONS.md#maintenance-outside-the-guard),
including the cache checks before installing code. Run `agent-guard doctor`
after agent updates; an npm update can replace Pi's guarded launcher.

## Commands and help

Run these commands from Terminal outside an agent session:

| Command | Purpose |
|---|---|
| `agent-guard doctor` | Check installed components; note warnings and skips |
| `agent-guard version` | Show the installed release and recorded file changes |
| `agent-guard update` | Install the latest stable release |
| `agent-guard uninstall` | Remove the guard; retain `~/Agent Guard` |

`update` follows stable releases and leaves a newer installed version unchanged.
See [release channels](docs/OPERATIONS.md#release-channels) for tagged installs.

For an interrupted installation, rerun its installer from Terminal. See
[recovery](docs/OPERATIONS.md#recovery-after-a-failed-or-interrupted-install)
before changing installation records; do not delete the transaction directory.
`doctor` does not perform recovery. Exact command behavior and retained files
are documented in [operations](docs/OPERATIONS.md#commands).

## Further information

- [User guide](docs/USAGE.md): configuration and agent-specific usage.
- [Operations](docs/OPERATIONS.md): installation, migrations, diagnostics and recovery.
- [Development](docs/DEVELOPMENT.md): tests and release building.
- [Security policy](SECURITY.md): full boundaries, limitations and private reporting.
- [Design](docs/DESIGN.md): architecture and planned changes.

Issues are welcome; external pull requests are not accepted. See
[CONTRIBUTING.md](CONTRIBUTING.md) for bug reports. Report vulnerabilities
privately through the [security advisory form](https://github.com/ebrindley/AgentGuard/security/advisories/new).

MIT; see [LICENSE](LICENSE). Bundled code retains its
[upstream licenses and notices](docs/DEVELOPMENT.md#license).
