# Development

Run development commands from a checkout outside an agent sandbox. The tests
exercise actual macOS confinement and installation; use the disposable accounts
and homes described below. For installed checks, see
[commands](OPERATIONS.md#commands).

## Tests

### Fast landing and background validation

`script/test` is the required local macOS gate: profile characterization,
rulebook/policy checks and real Seatbelt launch checks in disposable homes. It
requires Node 24 and an unguarded CI/orchestration process; it does not disable a
coding agent's sandbox. The initial measurement on the development Mac was 62
checks in 35 seconds. Installation, GUI, native OpenCode and migration suites
remain in the full macOS 15/26 matrix.

After independent review, `poetic ci merge <pr> --sha <reviewed-sha>` owns local
validation and protected landing. Keep independently armed GitHub auto-merge off.
The Mac must be available. Use `poetic ci status <pr>` for local proof and
`poetic ci reconcile` from the trusted host context for interrupted work.

The temporary GitHub `tests` workflow bootstraps this configuration under the
existing required check. Remove it only after `Poetic Local CI` is required on
main and a real local attestation has been verified. The steady-state merge path
runs the gate once locally.

`Full validation` runs automatically on pushes to main and by manual dispatch.
Documentation/backlog-only pushes do not start it, so they cannot cancel an
already-running code validation. Manual dispatch always runs it. No matching run
means full stage proof is unverified. Before publishing a
release, require a successful full run on its exact source commit and retain the
existing packaging/seam checks. Local gate success alone is not release proof.

The delivery policy declares the scopes. `poetic ci status --delivery` inspects
hosted background evidence; it does not relabel ordinary Local CI runs as new
stage proofs. The generated incident kit records failing matrix jobs/steps and
closes them only after matching current-main coverage. Repair remains disabled.
The reviewer binding records intent, not account activation or entitlement.

Required check count stays one: hosted `tests` during bootstrap, then `Poetic
Local CI`. The four full macOS jobs move from PR blocking to main background
execution. Hosted workflows go from one to three during bootstrap, then two
after the temporary gate is removed.

For skill changes, run `node test/skills.mjs`, `node test/skills.mjs readonly`,
`node test/skills.mjs kernel`, `node test/skills.mjs linked`, `node test/skills.mjs stdin` and
`node test/skills-policy.mjs` sequentially.
`node test/skills-native.mjs` tests real OpenCode tools with a local model fixture;
`server` and `gui` arguments exercise project selection after startup.
`AG_TEST_OPENCODE` can select the CI-pinned CLI for this fixture. The GUI
fixture uses a test bundle with the real backend. Logs remain under `test/.run-*`.
These focused runners use disposable homes and require no additional account.

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
checks package, tool and catalog maintenance at the default cache and a relocated
cache inside ALLOW. It checks the default root pin, no additional access for an
ungranted relocated cache, acceptance of a missing absolute cache path, and
rejection of relative paths or existing non-directories. A
local npm fixture verifies lifecycle confinement and removal. Real OpenCode
installs and reinstalls a cold plugin from a locally served tarball, reports
missing or failing plugins, runs cached ripgrep, and reads a refreshed catalog
on the next launch. Only its copied launcher has the
account-home lookup replaced; production has no test override. The golden test checks the
real account lookup under spoofed environment values, then compares complete
generated profiles against unmodified v1.0.3 fixtures for empty and nested lists.
The v1.0.3 reference runs unmodified, without the adapter.
Only the two product path names are normalized, and the recorded differences in
`test/fixtures/differences/` are applied: step 5 adds the rule that protects
OpenCode Guard's engine folder, and step 7 the rules for OpenCode's package
stores, `bin` folder and model catalog. The original source commit is
`9242c1ad45c895efd63e903e1b27d7bab53620ad`; bundled cc-safety-net is 2.4.14.

`zsh test/pi.sh` tests Pi's guard. It runs pi-sandbox-guard's suites from
`profiles/pi/test` and `profiles/pi/scripts` against Agent Guard's copy, changed
only where a recorded difference changes what they assert; `test/pi-files.mjs`,
which compares `profiles/pi` with pi-sandbox-guard 7ad441f and allows only the
changes in `test/fixtures/differences/pi.json` and `pi.patch`; and
`test/pi-launch.mjs`, which tests each recorded difference and the nested
launches in disposable homes. It needs Node. `profiles/pi/test/shim.mjs` runs
the launcher's preamble against the account's real home: it creates and removes
`~/.local/share/pi-sandbox-bindable-*` folders there and creates
`~/.cache/opencode/bin` when it is missing. It also prepares active Pi/OMP roots,
including `~/.omp/agent`, `~/.omp/profiles` and named profiles. Run those shim
cases in a disposable account.

`test/golden.mjs`, `test/test.sh`, `test/pi.sh`, `test/release.sh`, `test/bootstrap.sh`, `test/install.sh`, `test/migrate.sh` and `test/plugin.mjs` are development tests.
They run in a disposable home, apart from the `shim.mjs` cases above, are not
installed, and the installer does not run them. The installed check is
`agent-guard doctor` (the release's `launch check`, plus Pi's checks under
[Commands](OPERATIONS.md#commands) when Pi's guard is installed), which the installer runs as
its self-test. The release's `launch check` checks that a protected write is
denied, a temp write is allowed and `open` is denied, then runs the profile's
`check_hook`. For OpenCode that hook confirms through `opencode serve` that the
`agent_guard_status` tool is visible and that no configured plugin failed to
install, load or start, as OpenCode reports it in its events and its log, naming
each that failed; the installer runs it with `AGENT_GUARD_GATE=1`, which reports
plugins other than the guard's that failed as warnings. It also warns when ripgrep is neither on PATH nor in OpenCode's
`bin`. `launch check staged` runs the same checks on
a release that is not current, loading that release's plugin through a config
folder inside it. The development tests may read its output; it never depends
on `test/`.

## Building a release

```sh
scripts/release.sh [--dev] [--out DIR] 0.2.0
```

This writes three release assets to `dist/` (or `DIR`):
`agent-guard-0.2.0.tar.gz`, `agent-guard-0.2.0.tar.gz.sha256` and
`install.sh`. The archive holds one `agent-guard-0.2.0/` folder with the files
listed in the script, the whole of `engine/vendor/cc-safety-net` and
`profiles/opencode/templates`, a `VERSION` file and a `COMMIT` file. The script
stops if a listed file is missing. It uses only tools that ship with macOS. The
checksum file names the archive without a folder, so check it from `dist/`:

```sh
cd dist && shasum -a 256 -c agent-guard-0.2.0.tar.gz.sha256
```

`install.sh` is the bootstrap for the one-line install, filled in from
`scripts/bootstrap.zsh` with the tag `v0.2.0`, the version and the launcher's
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

## License

MIT. `LICENSE` covers Agent Guard. `engine/vendor/cc-safety-net/LICENSE` covers
cc-safety-net, and `engine/vendor/THIRD-PARTY-NOTICES` covers the effect and
`@opencode/schema` code bundled in cc-safety-net's `dist/index.js`. The
installer copies all three into each release folder. `profiles/pi/LICENSE`
covers the files in `profiles/pi/` that come from pi-sandbox-guard; the release
archive carries it.
