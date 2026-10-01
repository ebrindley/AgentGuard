# Agent Guard

Guardrails for terminal coding agents on macOS. One engine runs each agent under a macOS Seatbelt sandbox built from one allow and deny list, with a small profile and plugin per agent. It will replace OpenCode Guard and pi-sandbox-guard.

Stage 1 contains the OpenCode Guard v1.0.3 port, including the v1.0.4 fixes.
It is not a migration release; OpenCode Guard remains the released product. See
[docs/DESIGN.md](docs/DESIGN.md).

The shared launcher and Seatbelt builder are in `engine/`. OpenCode's paths,
protected-name fragment, lifecycle hooks, plugin, and installation support are
in `profiles/opencode/`. The launcher resolves home from the macOS account
database, then loads `profiles/opencode/harness.zsh` only from the release
folder it runs from, which must be directly inside
`~/Library/Application Support/AgentGuard/releases/`. Ambient `HOME` and `USER`
cannot choose that profile, and a copy of the launcher elsewhere refuses to run.

This port retains v1.0.3 policy and limitations: ALLOW contents remain writable,
reads and network access are broad unless denied, cached OpenCode plugins remain
writable, and symlink targets of project config names are protected only in the
start folder. There is no Pi profile, list import, `@project`, or migration yet.

## Install

In Terminal, outside any agent session, on macOS 15 or later:

```sh
/bin/zsh -c "$(/usr/bin/curl -fsSL https://github.com/ebrindley/AgentGuard/releases/latest/download/install.sh)"
```

To allow a projects folder without the prompt, add `install.sh --projects ~/Projects`
after the closing quote. For a particular release, replace
`latest/download` with `download/v1.2.3`. From a checkout or an unpacked
archive, `zsh install.sh [--projects DIR] [--gui]` installs that tree the same
way.

The command downloads the release's bootstrap, which downloads the release
archive and its checksum, verifies the SHA-256 sum and only then unpacks the
archive and runs its installer. The checksum comes from the same release as the
archive, so it detects a corrupted download or assets that do not belong
together. It does not prove who published them: whoever can replace the archive
can replace its checksum. The bootstrap itself is trusted code fetched over
HTTPS; nothing verifies it before it runs. A download cut short runs nothing.

The installer refuses, before any change, inside a guard or another sandbox,
while another install runs, over OpenCode Guard (migration arrives in a later
release) and over an install made before release folders (run its
`uninstall.sh` in the engine folder first). It assembles the new release in
`~/Library/Application Support/AgentGuard/releases/<version>-<UTC time>`, builds
the app, and tests that release with `launch check staged` before it changes
anything outside the engine folder and `~/Agent Guard`. It then switches the
rulebook, the app, `current`, the plugin link, the OpenCode permission values
and the PATH blocks, and runs the gate: `agent-guard doctor` and a launch of
`opencode --version` through the new PATH shim. If any check fails, it puts
everything back, exits non-zero and names the failed checks; the previous
version keeps working. Only after the gate passes does it write the version
stamp and remove release folders older than the previous one, which stays for
OpenCode sessions started from it.

Installed layout: `current` links to the active release folder and `bin` to
`current/bin`, which holds `opencode`, `opencode-gui` and `agent-guard`.
`state/` (launch rules, the permission record, the stamp, the lock and an open
transaction) is outside the release folders.
`~/.config/opencode/plugins/agent-guard.js` is a link to
`current/profiles/opencode/plugin.js`. Each launch sets `AGENT_GUARD_RELEASE` to
its release ID; the plugin, loaded through `current`, then uses that release's
plugin; when that release is gone, it refuses every guarded tool with a message
to reopen OpenCode.

## Commands

- `agent-guard doctor` runs the installed self-test.
- `agent-guard version` prints the version, tag, commit, release ID and install
  time from the stamp, then every installed file or link that changed, went
  missing or was added since. It exits 1 if anything drifted.
- `agent-guard update` installs the latest release the same way as the
  one-liner, with the same checks and rollback. It does nothing when the
  installed release is the latest or newer.
- `agent-guard uninstall` removes PATH blocks, restores the permission values
  the installer changed (unless you changed them since), then removes the app,
  the rulebook, the plugin and the engine folder. `~/Agent Guard` stays. A value
  it could not restore is reported, and the permission record is saved to
  `~/Agent Guard/permissions-backup.json` first. It exits 1 when anything was
  left; running it again finishes the job.

`update` and `uninstall` refuse inside a guard or another sandbox.

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
v1.0.3 launcher as OpenCode Guard), and that OpenCode Guard's PATH blocks,
rulebook and plugin file are left unchanged. Only its copied launcher has the
account-home lookup replaced; production has no test override. The golden test checks the
real account lookup under spoofed environment values, then compares complete
generated profiles against unmodified v1.0.3 fixtures for empty and nested lists.
The v1.0.3 reference runs unmodified, without the adapter.
Only the two product path names are normalized. The original source commit is
`9242c1ad45c895efd63e903e1b27d7bab53620ad`; bundled cc-safety-net is 2.4.14.

`test/golden.mjs`, `test/test.sh`, `test/release.sh`, `test/bootstrap.sh`, `test/install.sh` and `test/plugin.mjs` are development tests.
They run in a disposable home, are not installed, and the installer does not run
them. The installed check is `agent-guard doctor` (the release's
`launch check`), which the installer runs as its self-test: a protected write is
denied, a temp write is allowed, `open` is denied, then the profile's
`check_hook`. For OpenCode that hook confirms the `agent_guard_status` tool is
visible through `opencode serve`. `launch check staged` runs the same checks on
a release that is not current, loading that release's plugin through a config
folder inside it. The development tests may read its output; it never depends
on `test/`.

## Building a release

```sh
scripts/release.sh [--dev] [--out DIR] 1.2.3
```

This writes three release assets to `dist/` (or `DIR`):
`agent-guard-1.2.3.tar.gz`, `agent-guard-1.2.3.tar.gz.sha256` and
`install.sh`. The archive holds one `agent-guard-1.2.3/` folder with the files
listed in the script, the whole of `engine/vendor/cc-safety-net` and
`profiles/opencode/templates`, a `VERSION` file and a `COMMIT` file. The script
stops if a listed file is missing. It uses only tools that ship with macOS. The
checksum file names the archive without a folder, so check it from `dist/`:

```sh
cd dist && shasum -a 256 -c agent-guard-1.2.3.tar.gz.sha256
```

`install.sh` is the bootstrap for the one-line install, filled in from
`scripts/bootstrap.zsh` with the tag `v1.2.3`, the version and the launcher's
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

`LICENSE` covers Agent Guard. `engine/vendor/cc-safety-net/LICENSE` covers
cc-safety-net, and `engine/vendor/THIRD-PARTY-NOTICES` covers the effect and
`@opencode/schema` code bundled in cc-safety-net's `dist/index.js`. The
installer copies all three into each release folder.
