# Agent Guard

Guardrails for terminal coding agents on macOS. One engine runs each agent under a macOS Seatbelt sandbox built from one allow and deny list, with a small profile and plugin per agent. It will replace OpenCode Guard and pi-sandbox-guard.

Stage 1 contains the OpenCode Guard v1.0.3 port. It is not a migration release;
OpenCode Guard remains the released product. See [docs/DESIGN.md](docs/DESIGN.md).

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

## Tests

Run from a checkout, outside any agent sandbox, on macOS 15 or later:

```sh
node test/golden.mjs
zsh test/test.sh
```

Both take `--engine NAME` to choose the engine under test; the default is
`zsh`. Each engine has an adapter in `test/engines/` that stages a copy of
`engine/`, `profiles/` and `install.sh`, gives the command that runs the
installed launcher, and runs the account lookup. An unknown name exits
non-zero, lists the known engines and runs no checks.

The integration test needs Node and the OpenCode CLI. It exercises the ported
installer, real Seatbelt enforcement, plugin load, permission restoration, and
uninstall in a disposable home. Only its copied launcher has the account-home
lookup replaced; production has no test override. The golden test checks the
real account lookup under spoofed environment values, then compares complete
generated profiles against unmodified v1.0.3 fixtures for empty and nested lists.
The v1.0.3 reference runs unmodified, without the adapter.
Only the two product path names are normalized. The original source commit is
`9242c1ad45c895efd63e903e1b27d7bab53620ad`; bundled cc-safety-net is unchanged.

`test/golden.mjs`, `test/test.sh` and `test/plugin.mjs` are development tests.
They run in a disposable home, are not installed, and the installer does not run
them. The installed check is `launch check`, which the installer runs as its
self-test: a protected write is denied, a temp write is allowed, `open` is
denied, then the profile's `check_hook`. For OpenCode that hook confirms the
`opencode_guard_status` tool is visible through `opencode serve`. Step 4 renames
it `agent-guard doctor`. The development tests may read its output; it never
depends on `test/`.
