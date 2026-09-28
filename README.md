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
it to replace an existing OpenCode Guard installation before stage 2.

Run outside any agent sandbox on macOS 15 or later:

```sh
node test/golden.mjs
zsh test/test.sh
```

The integration test needs Node and the OpenCode CLI. It exercises the ported
installer, real Seatbelt enforcement, plugin load, permission restoration, and
uninstall in a disposable home. Only its copied launcher has the account-home
lookup replaced; production has no test override. The golden test checks the
real account lookup under spoofed environment values, then compares complete
generated profiles against unmodified v1.0.3 fixtures for empty and nested lists.
Only the two product path names are normalized. The original source commit is
`9242c1ad45c895efd63e903e1b27d7bab53620ad`; bundled cc-safety-net is unchanged.
