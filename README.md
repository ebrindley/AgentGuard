# Agent Guard

Guardrails for terminal coding agents on macOS. One engine runs each agent under a macOS Seatbelt sandbox built from one allow and deny list, with a small profile and plugin per agent. It will replace OpenCode Guard and pi-sandbox-guard.

Stage 1 contains the OpenCode Guard v1.0.3 port, including the v1.0.4 fixes.
It is not a migration release; OpenCode Guard remains the released product. See
[docs/DESIGN.md](docs/DESIGN.md).

The shared launcher and Seatbelt builder are in `engine/`. OpenCode's paths,
protected-name fragment, lifecycle hooks, plugin, and installation support are
in `profiles/opencode/`. The launcher resolves home from the macOS account
database before loading `profiles/opencode/harness.zsh` from the installed
`~/Library/Application Support/AgentGuard/` folder. Ambient `HOME` and `USER`
cannot choose that profile.

This port retains v1.0.3 policy and limitations: ALLOW contents remain writable,
reads and network access are broad unless denied, cached OpenCode plugins remain
writable, and symlink targets of project config names are protected only in the
start folder. There is no Pi profile, list import, `@project`, or migration yet.
The installer is retained for development and disposable-home tests; do not use
it to replace an existing OpenCode Guard installation before step 5 in
[docs/DESIGN.md](docs/DESIGN.md#12-plan).

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
`engine/`, `profiles/`, `install.sh` and `LICENSE`, gives the command that runs
the installed launcher, and runs the account lookup. An unknown name exits
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

`test/golden.mjs`, `test/test.sh`, `test/release.sh` and `test/plugin.mjs` are development tests.
They run in a disposable home, are not installed, and the installer does not run
them. The installed check is `launch check`, which the installer runs as its
self-test: a protected write is denied, a temp write is allowed, `open` is
denied, then the profile's `check_hook`. For OpenCode that hook confirms the
`agent_guard_status` tool is visible through `opencode serve`. Step 4 renames
it `agent-guard doctor`. The development tests may read its output; it never
depends on `test/`.

## Building a release

```sh
scripts/release.sh 1.2.3
```

This writes `dist/agent-guard-1.2.3.tar.gz` and
`dist/agent-guard-1.2.3.tar.gz.sha256`. The archive holds one
`agent-guard-1.2.3/` folder with the files listed in the script, the whole of
`engine/vendor/cc-safety-net` and `profiles/opencode/templates`, and a
`VERSION` file. The script stops if a listed file is missing. It uses only
tools that ship with macOS. The checksum file names the archive without a
folder, so check it from `dist/`:

```sh
cd dist && shasum -a 256 -c agent-guard-1.2.3.tar.gz.sha256
```

`zsh test/release.sh` builds `0.0.0-test`, compares the archive listing with the
release file list, checks the checksum and `VERSION`, then runs `test/test.sh`
against the unpacked archive. It needs the same conditions as `test/test.sh`.

`LICENSE` covers Agent Guard. `engine/vendor/cc-safety-net/LICENSE` covers
cc-safety-net, and `engine/vendor/THIRD-PARTY-NOTICES` covers the effect and
`@opencode/schema` code bundled in cc-safety-net's `dist/index.js`. The
installer copies all three into the engine folder.
