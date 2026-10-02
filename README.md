# Agent Guard

Guardrails for terminal coding agents on macOS. One engine runs each agent under a macOS Seatbelt sandbox built from one allow and deny list, with a small profile and plugin per agent. It replaces OpenCode Guard and, later, pi-sandbox-guard.

Release 0.1.2 supports OpenCode only. It is the OpenCode Guard v1.0.3 port,
including the v1.0.4 fixes, under Agent Guard's own names, with OpenCode's
package stores, `bin` folder and model catalog write-protected (see
[Maintenance outside the guard](#maintenance-outside-the-guard)). It replaces an
existing OpenCode Guard install (see
[Moving from OpenCode Guard](#moving-from-opencode-guard)). The design is in
[docs/DESIGN.md](docs/DESIGN.md).

The shared launcher and Seatbelt builder are in `engine/`. OpenCode's paths,
protected-name fragment, lifecycle hooks, plugin, and installation support are
in `profiles/opencode/`. The launcher resolves home from the macOS account
database, then loads `profiles/opencode/harness.zsh` only from the release
folder it runs from, which must be directly inside
`~/Library/Application Support/AgentGuard/releases/`. Ambient `HOME` and `USER`
cannot choose that profile, and a copy of the launcher elsewhere refuses to run.

There is no Pi profile or `@project` yet; both are planned.

## Requirements

- macOS 15 or later. The installer uses only tools that ship with macOS and
  stops, naming the tool, if one is missing.
- OpenCode: the `opencode` CLI on PATH, in `/opt/homebrew/bin`, `/usr/local/bin`
  or `~/.opencode/bin`; for the app route, `OpenCode.app`, looked for in
  `/Applications` and `~/Applications`, then by its bundle ID.
- Terminal, outside any agent session or other sandbox, for install, update and
  uninstall.

## Install

In Terminal, outside any agent session, on macOS 15 or later:

```sh
/bin/zsh -c "$(/usr/bin/curl -fsSL https://github.com/ebrindley/AgentGuard/releases/latest/download/install.sh)"
```

To allow a projects folder without the prompt, add `install.sh --projects ~/Projects`
after the closing quote. For a particular release, replace
`latest/download` with `download/v0.1.2`. From a checkout or an unpacked
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
while another install runs and over an install made before release folders (run
its `uninstall.sh` in the engine folder first). Over OpenCode Guard it migrates
(below). It assembles the new release in
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

## Commands

- `agent-guard doctor` runs the installed self-test.
- `agent-guard version` prints the version, tag, commit, release ID and install
  time from the stamp, then every installed file or link that changed, went
  missing or was added since. It exits 1 if anything drifted.
- `agent-guard update` installs the latest release the same way as the
  one-liner, with the same checks and rollback. When the installed release is
  the latest, it installs it again only to finish an OpenCode Guard migration or
  retirement that is still pending. Otherwise, and when the installed release is
  newer, it does nothing apart from removing the forwarders at OpenCode Guard's
  old command paths once the Mac has restarted since the migration.
- `agent-guard uninstall` removes PATH blocks, restores the permission values
  the installer changed (unless you changed them since), then removes the app,
  the rulebook, after a migration the forwarders, then the plugin and the engine
  folder. `~/Agent Guard` stays. A value it could not restore is reported, and
  the permission record is saved to `~/Agent Guard/permissions-backup.json` first
  (OpenCode Guard's, after a migration, to
  `~/Agent Guard/opencode-guard-permissions.json`). It exits 1 when anything was
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
creates it when it is missing.

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
  `agent-guard doctor` fails and names it.
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

Agent Guard limits writes. It does not limit network access, reads outside DENY
entries or what the agent does inside ALLOW folders. OpenCode's `auth.json` is
writable, and its `wellknown` entries load remote configuration. Concurrent
launches share one rules file, and a symlinked project config name has its target protected only when OpenCode
starts from that folder in a terminal. Each limitation, and what is planned for
it, is in [SECURITY.md](SECURITY.md#known-limitations-in-012). What the cache
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

`test/golden.mjs`, `test/test.sh`, `test/release.sh`, `test/bootstrap.sh`, `test/install.sh`, `test/migrate.sh` and `test/plugin.mjs` are development tests.
They run in a disposable home, are not installed, and the installer does not run
them. The installed check is `agent-guard doctor` (the release's
`launch check`), which the installer runs as its self-test: a protected write is
denied, a temp write is allowed, `open` is denied, then the profile's
`check_hook`. For OpenCode that hook confirms through `opencode serve` that the
`agent_guard_status` tool is visible and that no configured plugin failed to
install, load or start, as OpenCode reports it in its events and its log, naming
each that failed. It also warns when ripgrep is neither on PATH nor in OpenCode's
`bin`. `launch check staged` runs the same checks on
a release that is not current, loading that release's plugin through a config
folder inside it. The development tests may read its output; it never depends
on `test/`.

## Building a release

```sh
scripts/release.sh [--dev] [--out DIR] 0.1.2
```

This writes three release assets to `dist/` (or `DIR`):
`agent-guard-0.1.2.tar.gz`, `agent-guard-0.1.2.tar.gz.sha256` and
`install.sh`. The archive holds one `agent-guard-0.1.2/` folder with the files
listed in the script, the whole of `engine/vendor/cc-safety-net` and
`profiles/opencode/templates`, a `VERSION` file and a `COMMIT` file. The script
stops if a listed file is missing. It uses only tools that ship with macOS. The
checksum file names the archive without a folder, so check it from `dist/`:

```sh
cd dist && shasum -a 256 -c agent-guard-0.1.2.tar.gz.sha256
```

`install.sh` is the bootstrap for the one-line install, filled in from
`scripts/bootstrap.zsh` with the tag `v0.1.2`, the version and the launcher's
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
installer copies all three into each release folder.
