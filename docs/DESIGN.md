# Agent Guard design

Status: accepted plan, updated 2026-10-05. The zsh OpenCode engine, staged
installer, update/uninstall/recovery, version stamp, OpenCode Guard migration
and cache protection are built (steps 1–7). The installer split, adoption and
migration of Pi/OMP, and cross-harness project-config protection are built
(steps 7a–7d and 7f). OpenCode-only 0.1.2 is the latest stable release; 0.2.0
is a prerelease that adds Pi and OMP.

Current `main` also includes Pi/OMP state-root pinning and protection of missing
OpenCode configuration behind linked ancestors, committed after the 0.2.0 tag.
The checker measurement, Rust launcher, per-launch snapshots and Pi/OMP move
to the shared engine remain planned (steps 7e and 8–10). Step 11's retirement
and cleanup are planned. Current user procedures are in [USAGE.md](USAGE.md)
and [OPERATIONS.md](OPERATIONS.md).

Agent Guard is one macOS guard for terminal coding agents. It replaces OpenCode Guard (v1.0.4) and pi-sandbox-guard with one engine and a small profile, hook set and plugin adapter per harness.

## 1. Goal and non-goals

Goal: an agent keeps full tool permissions and broad read access, but can only change or delete files in folders you allow, plus the data, cache and temp folders its harness needs. It can never read or change folders you deny. It cannot edit the guard, the list or its harness's config and plugins, so it cannot switch its own guardrails off. Both layers are on by default. Install is a one-line terminal command (section 6). The end states are in section 12.

Non-goals:

- Protecting files inside ALLOW folders. The agent edits code there; keep backups and review diffs.
- Keeping provider tokens secret from the harness that uses them.
- Linux and Windows. On Linux, Landlock and bubblewrap cannot deny creation of a protected name anywhere in a writable tree. Windows, Cosmopolitan single binaries, Anthropic's sandbox-runtime (srt) and nono were also researched and rejected for now.
- A VM or container.
- A DMG or a Homebrew cask. OpenCode Guard's DMG is not carried over (section 6).
- Harnesses that ship their own Seatbelt sandbox (Codex, Claude Code, Gemini CLI) in the first release. Seatbelt sandboxes cannot nest, so a profile would have to switch theirs off.

## 2. Architecture

Two layers, as in both guards today.

- **Outer layer (the boundary).** The launcher runs the whole harness process, and every child, under `/usr/bin/sandbox-exec` with an SBPL profile generated at each launch. Every harness component must run inside it. [Beltdown](https://www.accomplish.ai/blog/beltdown-escaping-the-claude-code-sandbox/) (2026) escaped Claude Code's Seatbelt sandbox: the harness ran git outside the sandbox, and git ran a planted `core.fsmonitor` command.
- **Inner layer (advisory).** A JS plugin inside the harness refuses forbidden tool calls with a clear message, and cc-safety-net blocks destructive shell commands (section 5). Hook failure behavior differs by harness (section 14), so nothing depends on the plugin for safety.

The engine as built (stage 1) is zsh and uses only macOS tools (`sandbox-exec`, `dscl`, `jq`, `plutil`, `mdfind`, `getconf`):

| Part | Built as |
|---|---|
| Launcher | `engine/launch`. Takes the login name from `id -un` and home from `dscl /Search -read /Users/<login> NFSHomeDirectory`, and stops if that is missing, `/` or not a folder. Only then does it source `profiles/opencode/harness.zsh` and `hooks.zsh` from the release folder it runs from (its own resolved location, `${0:A:h}`), which must be a direct child of `releases/` in `~/Library/Application Support/AgentGuard/` under that home and hold a `RELEASE` file; otherwise it refuses before sourcing anything. It sets `HOME` to that home. `HOME` and `USER` from the environment cannot choose the profile, and a copy of `launch` elsewhere is refused. Finds the real CLI on PATH, then in `cli_search`, skipping any candidate whose resolved path is inside either guard's engine folder: its own or OpenCode Guard's `~/Library/Application Support/OpenCodeGuard` (section 10, rule 8). The first log line names the release ID. Finds the app in `app_paths`, then by bundle ID through Spotlight. In every mode, before the nested-launch check, unsets `env_unset` and exports `env_set`. It sets its own nesting marker, `AGENT_GUARD_SANDBOXED=1`, for every harness, only just before it execs under `sandbox-exec`, together with `AGENT_GUARD_RELEASE=<rid>`, the release it runs from, which the plugin uses (section 5). |
| Nested launch | If `AGENT_GUARD_SANDBOXED=1`, or OpenCode Guard's `OPENCODE_SANDBOXED=1` until step 11, and a trivial `sandbox-exec` call fails (the caller is already sandboxed), `cli` runs the harness directly and every other mode refuses. The planned contract, including the `same-boundary` policy and composed sessions, is in section 7, Nested launch. |
| List parser | In `engine/launch`. Rules in section 4. |
| Profile builder | Fills the slots of `engine/profile.sb` (`@WRITABLE@`, `@WRITABLE_GUI@`, `@USER_RULES@`, `@PROTECTED@`, `@STATE_PROTECTED@`, `@PROTECTED_NAMES@`) from the profile and the list, and passes `HOME`, `DARWIN_TEMP`, `DARWIN_CACHE` and `GUI` as `-D` parameters. Rule order in section 3. |
| Log | `~/Agent Guard/last-launch-opencode.log`, rewritten at each launch: skipped, refused and overridden entries; the resolved ALLOW, READ ONLY and DENY sets; what OpenCode can always write. |
| State | `state/rules.json` in the engine folder: the resolved allow, read only and deny paths. Every launch, in every mode including `profile` and `check` but except `check staged`, writes it to a temp file and renames it over the old one. The plugin reads it once at start, so launch B can replace it before launch A's plugin reads it; A's plugin then refuses and reports against B's rules while Seatbelt still enforces A's own profile. Step 9 replaces it with the per-launch snapshot (section 7, Per-launch snapshot). |
| Plugin | `profiles/opencode/plugin.js`: guard probe, path checks, unguarded refusal, status tool, cc-safety-net loading (section 5). One file for now; at step 9 it splits into `plugin/core.mjs` and an OpenCode adapter, `plugin/opencode.js`, and the Pi adapter follows at step 10d (section 5). |
| cc-safety-net | Version 2.4.14, unmodified, in `engine/vendor/cc-safety-net`. |
| Bootstrap | `scripts/bootstrap.zsh`, built into the release asset `install.sh`: downloads the archive and its checksum, verifies, unpacks into `stage/<txn>/tree` and runs the archive's installer under its lock. Section 6. |
| Installer and uninstaller | `profiles/opencode/install.sh` and `profiles/opencode/uninstall.sh`, both copied into each release folder; `install.sh` at the repository root forwards to the first. The installer is also a library (`source install.sh --lib`) for the guard probe, lock, recovery and file primitives that the uninstaller and `agent-guard` use. Both take home from `engine/account.zsh`, a verbatim copy of the launcher's `account_home` function; `scripts/check-seams.zsh` and `test/test.sh` check that the two match. Section 6. |
| Command | `engine/agent-guard`, installed as `bin/agent-guard`: `doctor`, `version`, `update`, `uninstall` (section 6). It takes its release from its own resolved location, sources that release's `account.zsh` only if the folder has the shape of a release (a `RELEASE` file, a parent named `releases`), then applies the launcher's check. |

Launcher modes: `cli` (the `opencode` shim), `gui` (the `opencode-gui` shim, used by the app; refuses if OpenCode is already running and shows failures as an alert), `profile` (prints the generated SBPL), `check` (the installer's self-test: a protected write is denied, a temp write is allowed, `open` is denied, then the profile's `check_hook`) and `check staged` (section 6). The installer also calls an internal `find-app` mode. The built launcher loads only the OpenCode profile, and its log name and some messages ("OpenCode needs", "opencode not found") are OpenCode's.

At step 8 the launcher becomes one Rust binary with the same parts: account lookup, list parser, profile builder, log and state. It is structured as define, resolve, compile and execute: profiles define policy as TOML embedded in the binary (section 3), a launch resolves the whole request without side effects, a compiler renders it from the typed policy model (section 3, The policy model) to SBPL and to the plugin's projection, and only execution creates folders, writes state and execs (section 7, Structure). Hooks become Rust functions. The plugin stays JavaScript and cc-safety-net stays vendored. The Rust launcher reaches the two existing installs through `update`, after both switched on the zsh engine, so migration failures and rewrite failures stay separate (section 7).

Install layout as built:

```
~/Library/Application Support/AgentGuard/            ($engine; write-protected by engine/profile.sb)
  current -> releases/<rid>                           relative symlink, replaced only by replace_link
  bin     -> current/bin                              the folder the PATH blocks name
  releases/<rid>/                                     rid = <version>-<UTC yyyymmddTHHMMSSZ>, e.g. 0.2.0-20261001T120000Z
    VERSION  COMMIT  LICENSE  RELEASE                 RELEASE holds <rid>; COMMIT is "checkout" from a checkout without one
    launch  profile.sb  account.zsh  install.sh  uninstall.sh
    bin/opencode  bin/opencode-gui  bin/agent-guard
    profiles/opencode/{harness.zsh,hooks.zsh,protected.sb,plugin.js,templates/,assets/}
    profiles/opencode/check-config/opencode/          .gitignore and plugins/agent-guard.js -> ../../../plugin.js
    vendor/cc-safety-net/  vendor/THIRD-PARTY-NOTICES
  stage/<txn>/                                        one run's unpacked tree, assembled release, built app and temp files
  state/
    rules.json                                        shared launch state (step 9 replaces it)
    permissions.json                                  permission record
    opencode-guard-permissions.json                   after a migration: OpenCode Guard's record, unchanged (section 10)
    migration.json                                    after a migration: {"from","switched_at","retired"}
    stamp.json                                        version stamp, written after the gate passes
    lock/{pid,start}                                  the running install, update or uninstall
    txn/                                              open transaction: install.sh, account.zsh, uninstall.sh, plan.json, journal, backup/
```

The planned additions to the installed layout are listed in section 11.

`releases/` holds the current release and, after a reinstall, the release `current` named before it; older ones are removed once the new release passes the gate (section 6). The kept release serves OpenCode sessions started from it, whose plugin hands over to it (section 5).

`replace_link LINK TARGET` makes a link under a temporary name and runs `/bin/mv -fh` onto `LINK`, so `LINK` exists at every moment. `ln -sfh` unlinks before linking, and `mv` without `-h` would move the new link into the old release folder. State that must survive a switch is in `state/`, outside the release folders. The shims keep `exec "${0:A:h:h}/launch"`, which resolves through `bin` and `current` to the release folder.

Other installed paths:

| Path | Form |
|---|---|
| `~/Agent Guard/` | `Guard List.txt` and the launch log |
| `~/.config/opencode/plugins/agent-guard.js` | Symlink to `$engine/current/profiles/opencode/plugin.js`, placed through the temporary name `.agent-guard.js.partial`, which OpenCode does not load (section 10, rule 2). The same rename of `current` switches the launcher and the plugin. |
| `~/.cc-safety-net/rules/agent-guard/` | The rulebook, named `agent-guard`, plus an entry in `~/.cc-safety-net/rules/rule.json` |
| `~/Applications/Agent Guard.app` | An AppleScript applet that runs `"$engine/bin/opencode-gui"`, a path that does not change between releases; ad-hoc signed |
| `.zprofile`, `.zshrc`, `.bash_profile` if present | A PATH block between `# >>> agent-guard >>>` and `# <<< agent-guard <<<` that puts `$engine/bin` first. The text does not change between releases. |

None of these names is shared with OpenCode Guard, and neither are the status tool, bypass variable, message prefix, nesting marker or app bundle ID (`io.github.ebrindley.agentguard`); the names are listed in section 12, step 3. The launcher still honors OpenCode Guard's nesting marker until step 11 and skips any executable inside its engine folder. An install that finds any part of OpenCode Guard migrates it (section 10). After a migration, `~/Library/Application Support/OpenCodeGuard/bin/opencode` and `opencode-gui` are forwarders, links to `$engine/bin/opencode` and `opencode-gui`, until a boot after the switch (section 10).

## 3. Harness profiles

A harness profile is data plus named hook functions. On the zsh engine, `harness.zsh` is a file of assignments read with `source`; zsh arrays keep paths with spaces intact and need no parser. Hooks are functions in `hooks.zsh`. The OpenCode profile also names one SBPL fragment, `protected.sb`.

Profiles and hook files are trusted code, like the engine: `source` runs anything in them, including `$(...)` inside an assignment. They are safe only because they live in the write-protected engine folder and the launcher finds that folder from the account database, not from `$HOME` or any other environment the agent could set. A conformance test that allows only plain assignments catches mistakes. It is not a boundary.

From step 8 profiles are TOML files embedded in the Rust binary, with OpenCode's built fields except `protected_fragment`. Hooks become Rust functions for what data cannot express: parsing a runtime's arguments and state roots, and harness-specific steps such as `opencode_prepare` and `opencode_check`. SBPL fragments are not kept; their rules become policy-model data (The policy model, below). The schema grows with the behavior that uses it: step 8 carries only the fields OpenCode uses, and each planned field arrives at the step whose behavior needs it. `~` in a path means the account home. Changing a profile then means replacing the binary, which the engine folder protection covers.

The contract. "Planned" fields do not exist in the built engine. "Runtime" fields sit in a `[runtime.<name>]` table.

| Field | Meaning | OpenCode (built) | Pi (planned) |
|---|---|---|---|
| `name` | Profile ID | `opencode`; not yet read by the launcher | `pi` |
| `title` | Name shown to the user | `OpenCode`; not yet read by the launcher | `Pi` |
| `[runtime.<name>]` | Planned. One table per runtime. From step 8 the shim passes its entry name, which selects the profile and runtime (section 7, Launch pipeline, R2) | None; its fields are top-level | `pi`, `omp` |
| `cli_names` | Runtime. Commands the shims stand in for; the launcher looks for the real one on PATH | `opencode` | `pi`; `omp` |
| `cli_search` | Runtime. Fallback executable paths | Both Homebrew prefixes, `~/.opencode/bin/opencode` | Pi's npm entry point under both Homebrew prefixes; none for OMP |
| `override_env` | Runtime. Planned, step 10c. Variable naming an executable, accepted only under `trusted_prefixes` (Executables and launch links) | None | `PI_EXECUTABLE`; `OMP_EXECUTABLE` |
| `trusted_prefixes` | Runtime. Planned, step 10c. Folders an override or a discovered executable must resolve into | None | `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`, `/bin` and Pi's npm package folder under both Homebrew prefixes, for both runtimes |
| `args_hook` | Runtime. Planned, step 10d. Rust hook parsing selectors and the command class (R5) | None | `pi_args`; `omp_args`, which accepts `--profile` only as the first argument |
| `state_hook` | Runtime. Planned, step 10d. Rust hook resolving and canonicalizing the runtime's state roots, or refusing (R6) | None. Step 7's cache-root resolution (section 9) is written as OpenCode's first state-root resolver | `pi_state_roots`: `PI_CODING_AGENT_DIR`, kept under `~/.pi`. `omp_state_roots`: `PI_CONFIG_DIR`, then the profile from `--profile`, `OMP_PROFILE` or `PI_PROFILE`; XDG-split state refused |
| `admin_commands`, `refused_commands`, `value_options` | Runtime. Planned, step 10d. Commands that get no plugin injection, commands refused, options that take a value (section 5, Plugin injection by command) | None | Below; OMP's are pi-sandbox-guard's tables in `launchers/pi` |
| `app_paths`, `app_bundle_id` | App locations, then a Spotlight lookup by bundle ID | `OpenCode.app` in `/Applications` and `~/Applications`; `ai.opencode.desktop` | None |
| `writable` | Always writable; created at launch | Seven paths, below | `~/.npm`, `~/.cache`, `~/Library/Caches`. The project is writable through the list (`@project`, section 4) |
| `writable_gui` | Also writable in `gui` mode | App support and saved state folders | None |
| `gui_args` | Arguments added in `gui` mode | `--no-sandbox` (Electron; Chromium's sandbox cannot nest) | None |
| `state_grants` | Planned. Runtime-data writes relative to the state roots, rendered with the allows (Rule order) | None | All of the active Pi root; OMP's positive allowlist |
| `state_config` | Planned, step 10c. Root-relative configuration paths and names, write-denied under every root level (Every installed harness) | None | Pi's and OMP's configuration lists |
| `protected_paths` | Harness paths write-denied in the final deny block | `~/.config/opencode`, `~/.opencode` | None; Pi's configuration is `state_config` |
| `protected` | Paths whose symlink targets are resolved and protected at launch | `protected_paths` plus `~/.cc-safety-net` | `~/.pi/agent/extensions`, `settings.json`, `auth.json`, `trust.json` |
| `protected_names` | Names whose symlinks directly in the launch folder are resolved at launch; built, the matching SBPL name rules are in `protected_fragment`. Planned, step 10c: each entry carries `on_link` (Symlinks) | `.opencode`, `opencode.json`, `opencode.jsonc`, `tui.json`, `tui.jsonc`; `on_link = "protect-target"` | `.pi` and `.omp` with `on_link = "refuse"`; `.claude` and `.codex` `extensions`, `hooks` and `tools`, `.gemini/extensions`, `.opencode/plugins` |
| `protected_fragment` | SBPL added at the end of the final deny block. Retires at step 8 | `protected.sb`: the name regexes and `.cc-safety-net` | None |
| `nested` | Planned, step 10c. `"same-boundary"` for every profile (section 7, Nested launch); `"inherit"` is the built behavior | `"inherit"`, as built, until its nested-launch release (section 11, OpenCode's releases), which removes the field | `"same-boundary"`, the default |
| `env_unset`, `env_set` | Environment changes, applied in every mode. The engine sets its nesting marker itself, and the variables that come with Git hooks and the credential set; profiles do not list them | Unset `ELECTRON_RUN_AS_NODE`, `OPENCODE_SIDECAR_V2`, `CC_SAFETY_NET_HOME`, `CC_SAFETY_NET_WORKTREE`, `SAFETY_NET_WORKTREE`; set `CC_SAFETY_NET_PARANOID_RM=1`, which its deletes release replaces with `CC_SAFETY_NET_LEVEL=strict` (section 5, Recursive deletes) | Set `CC_SAFETY_NET_LEVEL=strict`, plus OpenCode's interim delete settings until Pi's deletes change (section 5, Recursive deletes). The Git selector unsets come with Git hooks, and `SSH_AUTH_SOCK`, `GPG_AGENT_INFO` and `NPM_CONFIG_USERCONFIG` with the credential set, for every profile |
| `path` | Planned, step 10c. The harness `PATH`: `"inherit"` or a pinned list | `"inherit"`, as built | Pinned |
| `rlimits` | Planned, step 10c. Resource limits for the harness | None | Core dumps 0, file size 2 GiB, CPU time from `PI_RLIMIT_CPU` when set |
| `refuse_env` | Planned, step 10c. Variables that stop the launch with a message | None | `PI_PACKAGE_DIR` |
| `prepare_hook` | Runs after the profile is built, before the state write and exec | `opencode_prepare`: creates `~/.config/opencode`, its `.gitignore` and a minimal `opencode.json` if none exists | None; the hooks folder and link checks are engine stages (section 7, Launch pipeline, R8 and C1) |
| `check_hook` | Extra step in `check` | `opencode_check`: runs `opencode serve` under the guard and looks for the status tool | `pi_check` |
| `start_folder` | Planned for step 10a. What `@project` means (section 4) | Defined at step 10a from `opencode [project]` | `PI_PROJECT`, else the git top level, else the launch folder |
| `checkers` | Planned, step 9. The command checker and the adapter's ask list (section 5, Command checker) | `["cc-safety-net"]`, through the compatibility wrapper | `["cc-safety-net"]`, through the Pi entry's wrapper, from step 10d |
| `plugin_dir`, `plugin_files` | Planned. Where the installer puts the plugin | Hard-coded in the installer as `~/.config/opencode/plugins/agent-guard.js` | `~/.pi/agent/extensions/agent-guard.ts`, a link to `$engine/current/plugin/pi-entry.ts`; the launcher also injects the launch release's copy (section 5) |
| `install_hook` | Planned. Harness-specific install steps | The permission merge, now inline in `install.sh` | None |
| `inner_sandbox` | Planned. How to switch off a harness's own Seatbelt, or that the harness is unsupported | None | None |

The credential set (Credentials) and Git hooks protection (Git hooks) are not profile fields: they apply to every profile. Until OpenCode's credentials and hooks releases (section 11, OpenCode's releases), the engine leaves them off for OpenCode, as built, through a transition switch that those releases remove.

`profiles/opencode/harness.zsh` as built:

```zsh
# Trusted profile data, loaded only from the account-derived engine folder.
name=opencode
title=OpenCode
cli_names=(opencode)
cli_search=(/opt/homebrew/bin/opencode /usr/local/bin/opencode "$home/.opencode/bin/opencode")
app_paths=(/Applications/OpenCode.app "$home/Applications/OpenCode.app")
app_bundle_id=ai.opencode.desktop
writable=("$home/.local/share/opencode" "$home/.local/state/opencode" "$home/.cache"
          "$home/Library/Caches" "$home/.npm" "$home/.bun/install/cache" "$home/.cc-safety-net/logs")
writable_gui=("$home/Library/Application Support/ai.opencode.desktop"
              "$home/Library/Saved Application State/ai.opencode.desktop.savedState")
protected_paths=("$home/.config/opencode" "$home/.opencode")
protected=($protected_paths "$home/.cc-safety-net")
protected_names=(.opencode opencode.json opencode.jsonc tui.json tui.jsonc)
protected_fragment=protected.sb
gui_args=(--no-sandbox)
env_unset=(ELECTRON_RUN_AS_NODE OPENCODE_SIDECAR_V2 CC_SAFETY_NET_HOME CC_SAFETY_NET_WORKTREE SAFETY_NET_WORKTREE)
env_set=(CC_SAFETY_NET_PARANOID_RM=1)
prepare_hook=opencode_prepare
check_hook=opencode_check
```

`profiles/opencode/protected.sb`:

```
  (regex #"/\.opencode(/|$)")
  (regex #"/(opencode|tui)\.jsonc?$")
  (require-all (regex #"/\.cc-safety-net(/|$)") (require-not (subpath (h "/.cc-safety-net/logs"))))
```

At step 8 `protected.sb` becomes policy-model data, its name rules and the `~/.cc-safety-net/logs` exception, rendered to the same bytes.

`writable` includes all of `~/.cache`, which holds OpenCode's npm package store, its `bin` folder and its model catalog. Step 7 protects them (section 9).

### The policy model

Planned, step 8. One small typed model holds every rule the engine and the profiles contribute:

- paths relative to a root: home, a state root from R6, `@project`, the active hooks folder, or `/`;
- exact-node and subtree matches (`literal`, `subpath`);
- fixed name rules: a path component such as `.pi` or a final name such as `*.sample`, matched anywhere or within a subtree; the pattern is data, never a regex built from a resolved path, as in pi-sandbox-guard's `sandbox/pi-sandbox.sb`;
- read and write effects;
- narrowly scoped exceptions, each attached to the deny it narrows, such as `~/.cc-safety-net/logs` in the `.cc-safety-net` rule or the hooks scaffolding (Git hooks).

The compiler renders the resolved model twice: to SBPL for Seatbelt, and to the plugin's projection, so the plugin checks file tools against the rules Seatbelt enforces (section 5). OMP's positive allowlist is model data (`state_grants`), not SBPL. No SBPL fragment is kept unless the model provably cannot express a rule, and such a fragment carries a written reason; none is planned. Step 8 builds only the parts OpenCode uses; each later capability adds its part with the behavior that needs it.

### Planned Pi profile

Planned for step 10d: one profile, `pi`, with runtimes `pi` and `omp`, embedded as `engine/profiles/pi.toml`. It is written as TOML because it arrives after the Rust launcher; until then Pi runs on the adopted guard (section 11). The listing is illustrative; key names inside tables are settled when the profile is written. Values come from pi-sandbox-guard 7ad441f (`launchers/pi`, `sandbox/pi-sandbox-preamble.zsh`, `sandbox/pi-sandbox.sb`); OMP values are pi-sandbox-guard's and were not observed against OMP.

```toml
name = "pi"
title = "Pi"
writable = ["~/.npm", "~/.cache", "~/Library/Caches"]
protected = ["~/.pi/agent/extensions", "~/.pi/agent/settings.json",
             "~/.pi/agent/auth.json", "~/.pi/agent/trust.json"]
path = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"]
rlimits = { core = 0, file_size = 2147483648, cpu_env = "PI_RLIMIT_CPU" }
refuse_env = ["PI_PACKAGE_DIR"]
start_folder = ["env:PI_PROJECT", "git-toplevel", "launch-folder"]
checkers = ["cc-safety-net"]
plugin_dir = "~/.pi/agent/extensions"
plugin_files = ["agent-guard.ts"]          # a link to $engine/current/plugin/pi-entry.ts
check_hook = "pi_check"

[[protected_names]]                        # anywhere, except at or inside a Pi or OMP root
names = [".pi", ".omp"]
on_link = "refuse"

[[protected_names]]
names = [".claude/extensions", ".claude/hooks", ".claude/tools", ".codex/extensions",
         ".codex/hooks", ".codex/tools", ".gemini/extensions", ".opencode/plugins"]
on_link = "protect-target"

[runtime.pi]                               # root: pi_agent
cli_names = ["pi"]
cli_search = ["/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
              "/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js"]
override_env = "PI_EXECUTABLE"
trusted_prefixes = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin",
                    "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent",
                    "/usr/local/lib/node_modules/@earendil-works/pi-coding-agent"]
state_hook = "pi_state_roots"
args_hook = "pi_args"
admin_commands = ["auth", "install", "remove", "uninstall", "update", "list", "config", "mcp",
                  "--version", "-v", "--export"]
value_options = ["--profile", "--cwd", "--config", "--add-dir"]   # as pi-sandbox-guard; rechecked at step 10d

[runtime.omp]                              # roots: omp_base, omp_state, omp_agent
cli_names = ["omp"]
override_env = "OMP_EXECUTABLE"
trusted_prefixes = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin",
                    "/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent",
                    "/usr/local/lib/node_modules/@earendil-works/pi-coding-agent"]
state_hook = "omp_state_roots"
args_hook = "omp_args"
admin_commands = ["agents", "auth-broker", "auth-gateway", "bench", "browser-relay",
                  "completions", "config", "dry-balance", "gallery", "gc", "grep", "grievances",
                  "install", "models", "plugin", "read", "say", "search", "setup", "shell", "ssh",
                  "stats", "tiny-models", "token", "ttsr", "update", "usage", "worktree",
                  "--alias", "--export", "--list-models", "--help", "-h", "--version", "-v"]
refused_commands = ["cleanse", "commit", "join"]     # they reject --extension
value_options = ["--profile", "--cwd", "--config", "--add-dir"]

# Runtime data, relative to R6's roots; "." is the root itself.
[state_grants.pi_agent]
subtree = ["."]

[state_grants.omp_base]
node = [".", "profiles", "install-id"]

[state_grants.omp_state]
node = [".", "stats.db", "stats.db-wal", "stats.db-shm", "stats.db-journal", "autoqa.db",
        "autoqa.db-wal", "autoqa.db-shm", "autoqa.db-journal", "gpu_cache.json",
        "snapcompact-savings.jsonl"]
subtree = ["logs", "reports", "wt", "remote", "ssh-control", "remote-host", "python-env",
           "puppeteer", "browser-relay", "webcache", "cache", "natives", "autoresearch",
           "security", "run", "collab"]

[state_grants.omp_agent]
node = [".", "agent.db", "agent.db-wal", "agent.db-shm", "agent.db-journal", "history.db",
        "history.db-wal", "history.db-shm", "history.db-journal", "models.db", "models.db-wal",
        "models.db-shm", "models.db-journal", "last-changelog-version", "secret-placeholder.key",
        "omp-debug.log", "omp-crash.log"]
subtree = ["sessions", "blobs", "cache", "memories", "terminal-sessions", "python-gateway"]

# Configuration, write-denied at every root level.
[state_config.pi_agent]
subtree = ["extensions", "npm", "git", "skills"]
node = ["settings.json", "auth.json", "trust.json", "SYSTEM.md", "APPEND_SYSTEM.md", "models.json",
        "mcp.json"]
name = ["*prompt*.md"]                     # at any depth

[state_config.omp_state]
subtree = ["plugins"]
node = ["marketplaces.json", "auth-broker.token", "auth-gateway.token", ".env"]

[state_config.omp_agent]
subtree = ["extensions", "hooks", "tools", "commands", "skills", "agents", "prompts", "rules",
           "instructions"]
node = ["config.yml", "config.yaml", "settings.json", "models.yml", "mcp.json", ".mcp.json",
        "ssh.json", ".env", "SYSTEM.md", "APPEND_SYSTEM.md", "AGENTS.md", "RULES.md",
        "TITLE_SYSTEM.md"]
```

`state_grants` cover runtime data only. Pi's grant is its whole active root, and `state_config` then denies its configuration, so sessions and theme files stay writable while extensions, the user package folders (since pi-sandbox-guard #9), skills, settings, `auth.json`, `trust.json`, system prompts, model configuration and MCP server configuration (`mcp.json`, read since Pi 0.99.0, names commands Pi runs) do not. OMP's grant is the positive allowlist of the runtime paths pi-sandbox-guard observed in OMP 17.2.10: 53 exact-node and subtree entries. Its extensions, hooks, tools, commands, skills, agents, prompts, rules, instructions, plugins and its config, model, MCP, SSH, token and `.env` files stay read-only. OMP's `agent.db` holds operational data and credentials in one file and stays writable, so file-level protection of OMP's credentials is not claimed, as in pi-sandbox-guard.

`path` is pi-sandbox-guard's pinned `PATH`, preceded by one trusted Node folder: the resolved folder of the first Node among `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`, `/opt/homebrew/opt/node/bin`, `/usr/local/opt/node/bin`, then the `opt/node@*/bin` folders under both prefixes. The `*` entries of the engine's Git selector list (Git hooks) unset every variable with that prefix, which the built `env_unset` does not support. Pi may derive another agent folder from `PI_PACKAGE_DIR`, moving `.pi` past the name rules; pi-sandbox-guard only reports it (`scripts/status.sh`); the Pi profile refuses the launch.

The credential set (Credentials), Git hooks (Git hooks), the executable checks (Executables and launch links) and the nested-launch rule (section 7, Nested launch) apply to every profile. OpenCode receives them one release at a time after Pi's migration (section 11, OpenCode's releases) and keeps its built behavior until each. Composition (below) covers grants to the other harnesses present in a session. The other capabilities (pinned `path`, `rlimits`, `refuse_env`, `on_link = "refuse"`, the event log) stay profile choices.

### Rule order

In the generated profile, as built:

1. `(allow default)`, then deny all writes.
2. Allow writes to `writable`, `/private/tmp`, the per-user temp and cache folders and a few device files; `writable_gui` in `gui` mode.
3. List rules: ALLOW and READ ONLY entries from least to most specific, then DENY entries (read and write), then symlink targets of protected paths, then pinned folders (section 4).
4. The final deny block: engine folder, OpenCode Guard's engine folder, list folder, `protected_paths`, step 7's cache denies (section 9, As built) and, with Pi installed, Pi's guard files (section 11, What changes for OpenCode sessions), `~/Library/LaunchAgents`, the app, shell startup files, the pinned home folders, then `protected_fragment`.
5. Deny `lsopen` and `job-creation`, and deny running `open`, `osascript`, `osacompile`, `codesign`, `diskutil`, `launchctl` and `sudo`.

Planned additions. Each renders nothing where it does not apply, so OpenCode's golden bytes change only where the compatibility matrix in section 11 says:

- 2 gains the state-root grants from `state_grants`, relative to R6's roots, including OMP's positive allowlist; the inference token cache folders (Credentials); and, from the composition release (section 11, OpenCode's releases), every granted member's `writable` folders and `state_grants` (Composition).
- 3 gains `@project` as an ALLOW entry (step 10a).
- 4 gains the protection union (Every installed harness), including every installed harness's denies inside granted folders, such as step 7's (section 9); the credential write denies, with the token cache folders cut out (Credentials); the hooks denies (Git hooks); and the launch canary (section 7, Nested launch). From step 8 the rules rendered from `protected.sb` stand where the fragment stood.
- After 4 come the hooks exceptions (Git hooks), then the credential read denies with the `~/.secrets` file exceptions cut out, and the `.env` name deny with its exceptions cut out (Credentials). List DENY entries keep their read deny in 3; no rule allows reads.

Seatbelt applies the last matching rule, so the list cannot reopen a protected path. Harness denies (the union, credentials, hooks) come after the list, because an ALLOW entry covering a project would override them if they came before it. State-root grants, token cache folders and member grants come before the list and the deny block, so a DENY or READ ONLY entry still restricts them and they cannot reopen configuration. The hooks exceptions are the only allows after the deny block. They narrow the hooks denies only and are rendered so they cannot reopen a list DENY or READ ONLY entry or the protection union (Git hooks), so "DENY always wins" (section 4) holds. Credential exceptions are not allows: each is cut out of the deny it narrows (`require-not`), as `~/.cc-safety-net/logs` is.

### Protected paths and names

Protected paths and names are write-denied, including creation, rename and removal. A missing config file created by the agent and run at the next start was [CVE-2026-25725](https://nvd.nist.gov/vuln/detail/CVE-2026-25725) in Claude Code. OpenCode's names match anywhere on disk, including temp and OpenCode's own writable folders; the only exception is `~/.cc-safety-net/logs`. pi-sandbox-guard matches its names only inside the project (PR #8). Planned for Pi: `.pi`, `.omp`, `.claude/{extensions,hooks,tools}`, `.codex/{extensions,hooks,tools}`, `.gemini/extensions` and `.opencode/plugins` match anywhere on disk too, except at or inside a Pi or OMP root, whose configuration the root rules cover (Every installed harness), so `.omp` does not cover OMP's state in `~/.omp`. Matching everywhere also closes a route the project-only rule leaves open: building a `.pi` folder in `/private/tmp` and moving its parent into a project. A name must still be narrow enough not to cover other state the harness writes. Narrow exceptions are policy-model exceptions (The policy model), as `~/.cc-safety-net/logs` is from step 8.

### Symlinks

Seatbelt checks the resolved path, so a link can carry a write past a name rule. At launch the engine resolves the engine folder, the list folder, the profile's `protected` entries, `~/Library/LaunchAgents`, the shell startup files and each of `protected_names` directly inside the launch folder (`$PWD`). Where one is a link, its target is write-denied and added to READ ONLY for the plugin. Elsewhere only the name is protected: the agent cannot create, replace or remove a link with that name, but writes through an existing link reach its target. The plugin refuses file edits through such a link; shell commands are not checked. `.cc-safety-net` is not in `protected_names`, so a `.cc-safety-net` link in the launch folder is not resolved. `opencode <project>` run from another folder gets no resolution for the project's names; `@project` (step 10a) must resolve the same folder the harness opens. Stage 1 keeps these limits and the README says so.

Planned, step 10c: the check covers the launch folder and `@project`, against the resolved writable set (section 7, Launch pipeline, C1), and each `protected_names` entry carries `on_link`. `"protect-target"` is the behavior above, OpenCode's. `"refuse"`, Pi's for `.pi` and `.omp`, refuses the launch when the name is a link, or is a folder holding a link to a writable place outside it, as pi-sandbox-guard does (PR #8). Links that stay inside the folder, such as npm's `.bin` links, or that point to places the launch cannot write are accepted.

### Every installed harness

The base profile write-protects the engine folder (launcher, profiles, shims, vendored code, state), OpenCode Guard's engine folder `~/Library/Application Support/OpenCodeGuard` (the forwarders, section 10), the list folder, `~/Applications/Agent Guard.app`, `~/Library/LaunchAgents` and eight shell startup files. It also stops home, `~/Library`, `~/Library/Application Support`, `~/.config` and `~/Applications` from being renamed or removed. The profile adds its own paths and names.

Planned, step 10c: the protection union. Every launch denies writes, creation, rename and removal for the protected paths, names and state configuration of every installed profile, not only the one being launched; otherwise an ALLOW entry could expose another harness's plugin or config. The union also holds every installed harness's denies inside granted folders, with their exceptions: step 7's denies for OpenCode's package store, `bin` folder and model catalog under the effective cache root (`XDG_CACHE_HOME`, else `~/.cache`; section 9). Every launch renders them after its grants, so another harness's grant of the same folder, such as Pi's `~/.cache`, cannot reopen them. During an install or update transaction, "installed" means the candidate inventory in the transaction plan (section 6, Installer structure); after it, the version stamp's `harnesses`, which records what was committed. The launched profile's own protections are always included. Installing Pi therefore changes OpenCode's policy; that is intended (the compatibility matrix in section 11).

Pi and OMP configuration is protected at three root levels, all rendered from `state_config`:

1. **Root families**, matched lexically: `~/.pi/agent` and any root Pi accepts under `~/.pi`, including nested relocations; OMP's `~/.omp`, `~/.omp-*`, `~/.omp.*` and `~/.omp_*`, each with its base, `profiles/<name>/` state root and `agent/` child kept distinct, as pi-sandbox-guard's parameters do.
2. **The launch's own canonical roots** from R6 (section 7, Launch pipeline), exactly, with their ancestors pinned against rename and replacement; from the composition release, every granted member's canonical roots too (Composition, below).
3. **Recorded canonical roots.** Each launch records the canonical roots it resolved in `state/roots.json`, outside the sandbox before exec, from the composition release including every granted member's, and every later launch of any profile protects them too. This covers a family member that links elsewhere, such as `~/.omp-work` linked into `~/Projects`, which the lexical families miss.

A linked root is protected, not refused, so existing layouts keep working. No guarded launch writes configuration, including its own harness's; `state_grants` cover runtime data only.

Protection inputs come from the environment and the install layout, never from whether a harness's CLI is present, so an installed harness whose CLI is missing is still protected. Name rules, the lexical root families and the recorded roots always apply. Protections that must be looked up refuse the launch when they cannot be resolved: the link targets of `protected` entries, a relocated package store and the record in `state/roots.json`.

The engine's persistent records, `state/bindings.toml` (Executables and launch links), `state/roots.json` and `state/wrappers.json` (custom Pi wrappers, section 11), are inside the write-protected engine folder.

### Credentials

Planned, step 10c. One credential set, defined once in engine data and applied to every profile, in two classes. It starts from pi-sandbox-guard's set (`sandbox/pi-sandbox.sb`). What changes for each harness's users is in section 11.

**Tool credentials** can be neither read nor written:

- `~/.ssh`, `~/.gnupg`, `~/.config/gh`, `~/.git-credentials`, `~/.config/git/credentials`, `~/.netrc`, `~/.npmrc` and `~/.secrets`;
- `~/.docker` and `~/.kube`, with the read deny narrowed to `~/.docker/config.json` and `~/.kube/config`;
- for reads only, `.env` and `.env.*` files anywhere, except the exact names `.env.example`, `.env.sample` and `.env.template`. The exception relies on a naming convention; the sandbox cannot tell whether such a file holds real values.

**Inference credentials** are readable, with their configuration locked and only their token caches writable:

| Source | Readable | Writable |
|---|---|---|
| `~/.aws` | all of it | `sso/cache`, `login/cache`, `cli/cache` |
| `~/.config/gcloud` | all of it | nothing |
| `~/.azure` | all of it | the files `az account get-access-token` writes, listed from a trace at step 10c |
| Paths named by `AWS_CONFIG_FILE`, `AWS_SHARED_CREDENTIALS_FILE`, `AWS_WEB_IDENTITY_TOKEN_FILE`, `AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE`, `AWS_LOGIN_CACHE_DIRECTORY`, `GOOGLE_APPLICATION_CREDENTIALS`, `CLOUDSDK_CONFIG`, `AZURE_CONFIG_DIR` | token and key files; inside `~/.secrets`, an exception for that exact file | cache folders only; configuration files stay locked |
| OMP's `<omp_state>/.env` and `<omp_agent>/.env` | yes, after the launch check (below) | no |
| A `{file:...}` key file under `~/.secrets` named in OpenCode's config in `~/.config/opencode` | that exact file | no |

Harness login stores (OpenCode's and Pi's `auth.json`, OMP's `agent.db`) are not part of the set; their profiles govern them.

The tool class renders as write denies in rule 4 and read denies after it; the inference class as write denies in rule 4 on `~/.aws`, `~/.config/gcloud`, `~/.azure` and their environment-named relocations and configuration files, with the token cache folders allowed in rule 2 (Rule order). Every exception is cut out of the deny it narrows, never added as a later allow, as `~/.cc-safety-net/logs` is:

```
(require-all (subpath (h "/.aws")) (require-not (subpath (h "/.aws/sso/cache"))) ...)
```

That covers the cache folders inside the locked AWS and Azure folders, the `~/.secrets` file exceptions, the `.env` template names and OMP's `.env` files. A Guard List DENY or READ ONLY entry therefore still wins: a READ ONLY entry over `~/.aws` denies writes to its cache folders, and a DENY entry over `~/.secrets` denies a `{file:...}` key file. No rule allows reads. The plugin projection mirrors the set: the tool class unreadable, the inference class readable, cache folders writable, configuration locked, template names readable.

Rules:

- **Configuration stays locked because it runs programs:** `credential_process` in `~/.aws/config`, Google's executable-sourced credentials, `az` extensions. An agent that could edit them would have code run outside the guard at the next use of those CLIs.
- **Read exceptions are narrow.** Apart from OMP's `.env` files and the template names, they are made only inside `~/.secrets`, each for one exact file. An exception whose canonical path resolves outside `~/.secrets` is dropped.
- **`{file:...}` references count only from `~/.config/opencode`,** which no session can write: not from `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, a relocated `XDG_CONFIG_HOME`, a project's config or remote config. OpenCode 1.18.34 substitutes them in every config it loads and stops with a config error when it cannot read one (`packages/opencode/src/config/variable.ts`), so a project config that names a denied file stops OpenCode at startup.
- **Files named inside configuration files** are partly supported. `web_identity_token_file` in `~/.aws/config`, or a Google credential file's `credential_source.file` or `output_file`, is readable unless it lies in the tool class; there it is not supported, and the documentation says so.
- **Environment-named cache folders** are granted only when they resolve inside the account home and outside every protected path and the tool class; otherwise the log says so and nothing is granted. Environment-named configuration files and relocated folders get the same write lock as the defaults.
- **OMP's `.env` files are checked at launch,** as part of R6 for OMP (section 7, Launch pipeline). OMP 18.4.9 loads `~/.env`, its config root's `.env`, its agent folder's `.env` and the project's `.env`, copies `OMP_` names to their `PI_` spellings, applies a value only when the variable is unset, then recomputes its folders from `XDG_*_HOME` and `PI_CODING_AGENT_DIR` (`packages/utils/src/env.ts`). Those files could therefore move OMP's folders after R6 resolved them, or restore a variable the launch removed. Before exec the launcher reads the variable names, never the values, in `<omp_state>/.env` and `<omp_agent>/.env` (`~/.omp/.env` and `~/.omp/agent/.env` by default, or the active profile's). A name that moves OMP's folders (`PI_CODING_AGENT_DIR`, `PI_CONFIG_DIR`, `XDG_*_HOME`, or an `OMP_` spelling of one) that the launch removes (the Git selectors, `SSH_AUTH_SOCK`, `GPG_AGENT_INFO`, the profile's `env_unset`), or that names a credential location (the environment-named variables above, whose targets the launch can lock only when they are set before it; OMP 18.4.9 reads `AWS_CONFIG_FILE` after loading these files, `packages/ai/src/providers/aws-credentials.ts`) refuses a launch of OMP, naming the file and the variable, and drops OMP when it would be a granted member (Composition); OMP's lexical protections still apply. `state_config` write-denies both files, so a session cannot add a name later. pi-sandbox-guard refuses a relocated `PI_CODING_AGENT_DIR` the same way (`sandbox/pi-sandbox-preamble.zsh`).
- **A symlinked credential path** is also denied at its resolved target.
- **Only named files are protected.** Credentials in environment variables, the Keychain and 1Password stay usable inside a session.

Entries apply whether or not the path exists. An entry may carry an environment change, applied in every mode: `~/.npmrc` sets `NPM_CONFIG_USERCONFIG=/dev/null`, so npm never reads the denied file; `~/.ssh` unsets `SSH_AUTH_SOCK`; `~/.gnupg` unsets `GPG_AGENT_INFO`.

Until its credentials release (section 11, OpenCode's releases), OpenCode applies only what its Guard List denies, as built.

Provider notes:

- **AWS.** OpenCode 1.18.34 uses the AWS SDK's default credential chain for Bedrock. OMP 18.4.9 signs Bedrock requests itself and writes `~/.aws/sso/cache`, logging and ignoring a failed write (`packages/ai/src/providers/aws-credentials.ts`). The AWS SDK v3 also swallows a failed SSO cache write, but a failed `aws login` cache save surfaces as a refresh error, so `login/cache` must be writable. No harness reads `~/.aws/cli/cache`; it is writable for a `credential_process` that calls the AWS CLI.
- **Google.** Vertex does not need gcloud: google-auth-library reads the default credentials file directly, from a path fixed under `$HOME/.config/gcloud` (google-auth-library 10.5.0, the version OpenCode 1.18.34 pins, `src/auth/googleauth.ts`). For Vertex models served through the OpenAI-compatible SDK, OpenCode builds the library's client per request without a project, so when neither `GCLOUD_PROJECT`, `GOOGLE_CLOUD_PROJECT` nor the credential file's `project_id` names one, the library runs `gcloud config config-helper` on each request to find it and ignores a failure (`findAndCacheProjectId`); setting `GOOGLE_CLOUD_PROJECT` avoids it. OpenCode removes that callback for the Vertex SDKs, which take the project from OpenCode's options (`packages/opencode/src/provider/provider.ts`). Whether gcloud itself works with its folder locked is untested; its credential store opens `credentials.db` for writing.
- **Azure.** Only OpenCode uses `az` (`packages/opencode/src/plugin/azure.ts` runs `az account get-access-token`); Pi and OMP use API keys for Azure.
- **Pi OAuth.** Pi's OAuth logins stop at their first refresh inside a session. Pi 0.99.2 writes the refreshed login to `auth.json` (`core/auth-storage.js`), which `state_config` locks, and reports "Credential store modify failed". pi-sandbox-guard behaves the same today. A fix needs a change to how Pi stores logins and is not part of this design.
- **Pi `!command` keys.** A key command that reads a file under `~/.secrets` fails; the Keychain form in Pi 0.99.2's `docs/providers.md` works.
- **Vercel AI Gateway.** `AI_GATEWAY_API_KEY` works; a token from a Vercel CLI login cannot be refreshed inside a session.
- **OMP keys in `.env` files.** Keys in OMP's own two files load. Keys in `~/.env` or a project `.env` do not, and OMP skips an unreadable file without a message (`parseEnvFile` in `packages/utils/src/env.ts`), so the release notes say so.

Cost: any session can read the cloud sign-ins and use them with those accounts' full permissions, not only for inference. Narrowing them needs no design change: a Bedrock-only profile or key, or a dedicated Vertex service account. The alternative not taken, a credential server outside the sandbox so that `~/.aws` can be denied whole, is decision D2 (section 15).

Residual risk: with `SSH_AUTH_SOCK` removed, the SSH agent socket can still be found under `/private/tmp`; denying it in SBPL is untested.

### Git hooks

Planned, step 10c, for every profile; OpenCode from its hooks release (section 11, OpenCode's releases). Write denies cover `<@project>/.git/hooks`, the active hooks folder resolved at launch (section 7, Launch pipeline, R8), every `hooks` folder under `.git/modules`, and the hooks in OMP's worktrees (`wt/` under the OMP state root). The worktree denies are rendered whenever OMP's state root is granted: when OMP is launched and, from the composition release, when OMP is a granted member of another runtime's launch (Composition). Exceptions keep `git init` and ordinary source work: the project's and submodules' hooks folder nodes and the `*.sample` files directly in them; in OMP worktrees, hooks folder nodes and files with an extension directly in them (Git's hook names have none, so source such as `src/hooks/useFoo.ts` stays editable). The active hooks folder gets no exception.

Git in the session uses the hooks the launch protects. The Git selectors are engine data applied with Git hooks: the launch removes `GIT_DIR`, `GIT_WORK_TREE`, `GIT_COMMON_DIR`, `GIT_CEILING_DIRECTORIES`, `GIT_DISCOVERY_ACROSS_FILESYSTEM`, `GIT_CONFIG`, `GIT_CONFIG_SYSTEM`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_*` and `GIT_CONFIG_VALUE_*` from the harness environment (R4); a `*` entry removes every variable with that prefix. The list is pi-sandbox-guard's (`sandbox/pi-sandbox-preamble.zsh`). R8 runs `git` with the probe environment (R3) plus the harness's own `XDG_CONFIG_HOME` from R4, so Git in the session and R8 read the same configuration. pi-sandbox-guard pins `XDG_CONFIG_HOME` to `~/.config` for its probes only and leaves the session's value, so the two can differ there. In `gui` mode R8 uses the project folder step 10a defines for the app (section 4).

The exceptions narrow the hooks denies only. Each is rendered as `(require-all <exception> (require-not <list DENY or READ ONLY>) (require-not <union>))`, or the builder re-emits the list restrictions and the union after the exceptions; either way "DENY always wins" (section 4) holds. Conformance cases cover the collisions: a DENY or READ ONLY entry over a project's `.git`, and a READ ONLY entry over an OMP worktree.

`.git/config` stays writable, so a `core.hooksPath` change during a session remains a residual risk, as in pi-sandbox-guard. Until step 10d the Pi analyzer asks before one (pi-sandbox-guard `src/validate-bash-command.sh`). From step 10d the ask is the first entry of Agent Guard's ask list (section 5, Command checker): Pi and OMP ask, and OpenCode, whose plugin can only refuse, refuses from its hooks release. The entry matches `git config` setting the key, not its read options (`--get`, `--get-all`, `--get-regexp`, `--list`). Git accepts the key in any letter case. A version 1 rulebook rule (`block_args: ["core.hooksPath"]`) misses `core.hookspath` and blocks `--get`; a version 2 rule compares whole arguments, so it can list spellings and exclude the read options but cannot cover every letter case. Step 9 tests the spellings and records what the entry misses. `git -c core.hooksPath=...` lasts for one command inside the session and needs no entry.

Release notes state the limits: hook managers such as husky, lefthook and pre-commit cannot install hooks into a protected hooks folder from a session; a versioned hooks folder set as `core.hooksPath` is the active hooks folder and cannot be edited from a session; a hooks path that is home, too broad or contains the project refuses the launch (R8); only the launched project's hooks are protected, not those of other repositories a session can write; a `GIT_CONFIG_GLOBAL` or other selector the user sets does not reach sessions.

### SBPL parameters

As built, the builder passes `HOME`, `DARWIN_TEMP`, `DARWIN_CACHE` and `GUI` as `-D` parameters, and `path_rules` in `engine/launch` writes every profile path relative to `HOME` (`(subpath (h ...))`), so it assumes every path is under home. Step 8 removes both limits. Planned: the state roots, `@project` and the active hooks folder (R6 to R8) become named parameters, `PROJECT`, `ACTIVE_HOOKS`, `PI_AGENT_STATE`, `OMP_AGENT_STATE`, `OMP_STATE_ROOT` and `OMP_BASE_ROOT`. From the composition release a granted member's roots become parameters too (Composition); OMP's worktree hook denies (Git hooks) need `OMP_STATE_ROOT` whenever OMP is granted. A runtime that is neither launched nor a granted member gets no parameters and renders no rules relative to its roots, so pi-sandbox-guard's `/private/tmp/pi-sandbox-guard-unused` placeholders are not needed; the protection union still covers it (Every installed harness).

### Event log

Not planned. The analyzer's log was to move to `~/Library/Logs/Agent Guard/` at step 10c, with rotation at launch; the analyzer retires at step 10d instead (section 5, Command checker), so the move, the rotation and the folder are dropped. Until step 10d the adopted guard's analyzer logs to `~/.pi/agent/security-events.log`, read-denied to sessions, as pi-sandbox-guard does (umask 077, mode 0600, full command text); Pi's migration leaves that file in place.

cc-safety-net's audit log stays in `~/.cc-safety-net/logs` for every harness, readable, as built for OpenCode; Pi sessions may write it, as difference 1 allows (section 11, What changes for Pi sessions). Moving it with `CC_SAFETY_NET_AUDIT_HOME` is an opt-in.

### Executables and launch links

Planned: the harness executable, its interpreter and every launch link on the way to them (shim, symlink) are protected against replacement and against renames of their parent folders. Homebrew's prefixes (`/opt/homebrew`, `/usr/local`) are owned by the installing user, so Seatbelt policy, not ownership, stops the agent writing there. Today the OpenCode executable is protected only by the base write deny: an ALLOW entry such as `/opt/homebrew` passes the list checks and makes it writable.

Planned, step 10c: one selection procedure for every profile, per runtime, with pi-sandbox-guard's precedence (`resolve_agent_executable` in `sandbox/pi-sandbox-preamble.zsh`):

1. **Override.** The variable named by `override_env` (`PI_EXECUTABLE`, `OMP_EXECUTABLE`), accepted only when its resolved path is under `trusted_prefixes`; an override that fails the checks refuses the launch. An override can route around a stale binding, as today.
2. **Binding.** The runtime's record in `$engine/state/bindings.toml`, write-protected with the engine folder; no environment variable selects the file. A binding is trusted without the prefix rule because the operator recorded it.
3. **Discovery.** `cli_names` on the harness `PATH` (the pinned `path` when the profile sets one, as pi-sandbox-guard searches its pinned `PATH`), then `cli_search`, under `trusted_prefixes` when the profile sets them.

Every candidate must be an executable regular file, must not be a guard shim (section 10, rule 8, extended to pi-sandbox-guard's shims by their location and the `pi-sandbox-guard` marker in their text) and must not lie inside the resolved writable set (section 7, Launch pipeline, C2), which from the composition release is the combined writable set (Composition, below). The same check applies to the **harness interpreter**: for Pi, the `node` that runs a Node-shebang target; a native target, such as OMP's (its `process.execPath` is its own binary, pi-sandbox-guard `scripts/deploy-local.sh`), has none. Until step 10d the adopted guard also records a checker interpreter, the Node that runs the analyzer's helpers, in `.guard-node` beside its extension. It retires with the analyzer (section 5, Command checker): cc-safety-net runs inside the harness process, so Pi's migration does not convert `.guard-node`. A Node path from Homebrew is recorded as its formula's `opt` link when that link resolves to the same Cellar executable, so a formula upgrade needs no rebind (pi-sandbox-guard #10, `ops_stable_node_path` in `scripts/lib-ops.sh`); this stays Node-specific.

A stale binding fails closed: the launch refuses with the recorded path and the `agent-guard bind` command that fixes it.

From the composition release, the same procedure decides which installed runtimes are present (Composition, below).

OpenCode keeps today's selection (`PATH`, then `cli_search`, skipping guard shims) until its executable release (section 11, OpenCode's releases), which applies the full procedure and the writable-set check to OpenCode and is a prerequisite for composition. The writable-set check closes the `/opt/homebrew` gap above.

`agent-guard bind` (section 6) replaces pi-sandbox-guard's `scripts/bind-executable.sh`: `--show`, `--check` (non-zero when a binding is stale), `--detect` (pi-sandbox-guard's install layout list, as data) and explicit `--pi`, `--omp` and `--node` (the harness interpreter) paths, plus `--opencode` from OpenCode's executable release. The adopted guard's `--checker-node` retires with the analyzer. It refuses to run inside the guard, confirms on the terminal and writes `state/bindings.toml` atomically.

### Composition

Planned for the composition release (section 11, OpenCode's releases), after Pi's migration and the items in section 9, Other code in writable folders. An opt-in (decision D3, section 15): a runtime listed under the Guard List's NESTED heading (section 4) may start inside another harness's session and runs under that session's sandbox (section 7, Nested launch) instead of being refused. Every launch of another harness then also grants that runtime's folders. Nothing is listed by default, and a refused nested launch names the heading.

Guardrails:

- The Guard List is write-denied in every session, so an agent cannot list a runtime.
- Membership is decided at the outer launch and frozen in its snapshot (section 7, Per-launch snapshot); a nested launch never decides it again.
- A member that is not the launched runtime gets no write access to its logins or its instruction files: OpenCode's `auth.json`, Pi's `auth.json`, the `AGENTS.md`, `AGENTS.override.md` and `CLAUDE.md` in Pi's agent folder, `~/.pi/agent/prompts` and OMP's `memories` stay write-denied. A nested harness therefore cannot refresh a login inside the session, as Pi already cannot (section 11, Compatibility matrix). OMP keeps logins in `agent.db` with runtime data it must write, so listing `omp` lets other harnesses' sessions write OMP's logins; the list's template says so beside the heading.
- Every member runs the same command checker (section 5, Command checker), so a nested harness is never a weaker route than the session it runs in.

**Presence.** A runtime (Pi and OMP count separately) is present when it is listed under NESTED, installed, and the selection procedure finds its CLI (Executables and launch links): override, then binding, then discovery, skipping guard shims. The launched runtime is always present. Installed means that its profile is listed in the stamp's `harnesses` or, while an install or update transaction is open, in the transaction's candidate inventory (section 6, Installer structure). A runtime for which the procedure would refuse, through a rejected override or a stale binding, is not present; only the launched runtime's failure refuses the launch. The outer launch decides presence once and records each present runtime in its snapshot as a member (section 7, Per-launch snapshot); a nested launch does not decide it again. A runtime dropped by any check below also leaves the member list.

**Grants.** Each member gets its profile's `writable` folders and its runtime's `state_grants`, apart from the logins and instruction files above for a member that is not the launched runtime. The launched runtime's roots come from its own arguments and environment (section 7, Launch pipeline, R6), for example `omp --profile work`. Every other member's roots come from its `state_hook` applied to the environment alone: OMP's base from `PI_CONFIG_DIR` and its profile from `OMP_PROFILE` or `PI_PROFILE`, otherwise the default profile, never every profile. A member whose roots do not resolve, or whose OMP `.env` check fails (Credentials), gets no grants and leaves the member list, and the launch goes on; for the launched runtime either failure refuses the launch. `writable_gui` is granted only in an app launch.

**Executable check.** R9 builds the combined writable set once: the launch's own writable set with the grants of every member whose roots resolve. C2 checks every member's executable, interpreters and launch links against it (section 7, Launch pipeline). A member that fails is dropped: it loses its grants and leaves the member list. The set is not rebuilt; the rendered policy is then narrower than the set checked, so every remaining member's check still holds. If the failing member is the launched runtime, the launch refuses.

**Protections.** Every installed harness is protected, whether present or not: its protected paths and names, its state configuration under the root families and the recorded roots, and its denies inside granted folders (Every installed harness). Every granted member's canonical roots are also protected at root level 2, as the launched runtime's are, and recorded in `state/roots.json`. When an OpenCode session is granted a relocated OMP folder, that folder's configuration is therefore write-denied too.

The snapshot's member records, the launch canary that every launch carries from this release and the rule for a nested launch are in section 7 (Per-launch snapshot, Nested launch).

**Accepted cost**, only on a Mac where a runtime is listed: every folder below was already readable, so the cost is integrity. Every session of another harness can write the listed runtime's data apart from the logins and instruction files above: for OpenCode, `~/.local/share/opencode` apart from `auth.json`, `~/.local/state/opencode`, `~/.bun/install/cache` and `~/.cc-safety-net/logs`; for Pi, its sessions and caches; for OMP, `agent.db` with its logins, `browser-relay`, `ssh-control` and `secret-placeholder.key`; any code folder that section 9, Other code in writable folders, leaves writable; and, in an OpenCode app session, the app's folders. Such a session can delete or alter the listed harness's sessions, and OMP's logins. Configuration stays write-denied everywhere, because the denies come after the combined grants (Rule order).

**Alternatives not taken** (decision D3, section 15): grant every present runtime with no opt-in, the plan before 2026-10-02, which makes every session on a Mac with two harnesses pay the cost above, logins included, though only nested launches use the grants; or keep refusing cross-harness nested launches, so that Pi cannot be started from an OpenCode session, or the reverse.

## 4. The Guard List

One list for all harnesses: `~/Agent Guard/Guard List.txt`. The launcher reads it at each launch; edits apply at the next launch. Same headings and rules as OpenCode Guard:

- Headings are ALLOW, READ ONLY (or READ-ONLY) and DENY, in any case, optionally followed by `-` or `:` and text; NESTED follows from the composition release (below). Lines before the first heading and lines starting with `#` are ignored.
- An entry is a path starting with `/` or `~`, optionally quoted. Backslash escapes from a Finder drag are removed and symlinks in the path are resolved. Other lines are skipped.
- An ALLOW or READ ONLY entry that does not exist is skipped. A DENY entry that does not exist is kept, with a spelling warning.
- DENY always wins, for reads and writes. Otherwise the more specific entry wins.
- Folders above a DENY or READ ONLY entry, and each ALLOW folder itself, cannot be renamed or removed.
- `/`, home, `~/Library`, `~/.config` and `~/.local` cannot be allowed whole: ALLOW refuses `/` and any entry that is or contains `~/Library/Application Support`, `~/.config` or `~/.local`.
- Folders the harness needs cannot be made READ ONLY or DENY: those refuse any entry that is or contains `/`, home, `~/Library`, `~/.config`, `~/.local`, `~/.cache`, `/usr`, `/bin`, `/sbin`, `/System`, `/Library`, `/private`, `/dev`, `/opt` or `/Applications`. This is OpenCode's set, hard-coded in the launcher. It does not include the harness's own `writable` folders: a DENY on `~/.local/share/opencode` is applied, and OpenCode then cannot use its data folder.
- The log records every skipped, refused and overridden entry.

`@project` arrives at step 10a, as one new entry valid only under ALLOW:

```
ALLOW - agents may create, change and delete things inside these:
@project
~/Projects
```

Step 10a first defines it for OpenCode: the positional project argument (`opencode [project]`), and what it means for the app launcher, whose working directory is unverified. At step 10d the Pi profile's `start_folder` keeps pi-sandbox-guard's resolution: `PI_PROJECT` if set, else the git top level, else the launch folder, canonicalized. It also keeps Pi's refusal rules (`sandbox/pi-sandbox-preamble.zsh`). `@project` is resolved before the launch changes anything (section 7, Launch pipeline, R7). The launch is refused rather than widened if `@project`:

- is `/`, home (as given or canonicalized), `/Users`, `/Volumes`, `/tmp`, `/private/tmp`, `/private`, `/var`, `/private/var`, `/var/tmp` or `/private/var/tmp`;
- is or is inside `/etc`, `/private/etc`, `/usr`, `/bin`, `/sbin`, `/opt`, `/System`, `/Library` or `/Applications`;
- is or is inside `~/.ssh`, `~/.aws`, `~/.config`, `~/.docker`, `~/.gnupg`, `~/.kube`, `~/Library`, `~/Desktop`, `~/Documents` or `~/Downloads`;
- contains the guard;
- is inside a protected agent config folder (section 3).

The log shows what `@project` resolved to. New lists get `@project` commented out.

NESTED arrives with the composition release (section 3, Composition), as a fourth heading whose entries are runtime names, not paths: `opencode`, `pi` and `omp`, one per line. A listed runtime may start inside another harness's session. Other names are skipped and logged. New lists get the heading with every name commented out, and with a note beside `omp` that other harnesses' sessions can then write OMP's logins:

```
NESTED - harnesses that may start inside another harness's session:
# pi
# omp    (other harnesses' sessions can then write OMP's logins in agent.db)
# opencode
```

Every entry applies to every harness, so a list import is a policy change, not a copy. The installer shows the proposed list and what each harness gains or loses once, writes nothing until the user confirms, and never overwrites an existing `~/Agent Guard/Guard List.txt`. The OpenCode Guard import is in section 10. Adding Pi changes policy even when the list needs no edit: with `~/Projects` under ALLOW, Pi can write to every project there. The Pi migration shows what Pi gains from the shared list and asks before switching (section 11, The Pi migration).

## 5. Inner layer

Recommendation: Agent Guard's plugin core checks file paths for every harness, and every tool call then goes to one command checker, cc-safety-net, followed by Agent Guard's own rules, which can only make a verdict stricter (Command checker, below). OpenCode uses cc-safety-net as built; Pi and OMP keep pi-sandbox-guard's bash analyzer until step 10d. The inner layer is advisory; Seatbelt is the boundary.

The OpenCode plugin as built (`profiles/opencode/plugin.js`):

- **Guard probe.** It creates a file in the engine's `state/` folder. EPERM means guarded. Success, any other error, a missing folder or a symlinked folder means unguarded.
- **Unguarded refusal.** Unguarded, it refuses every tool except `invalid`, `question`, `todowrite`, `webfetch`, `websearch`, `plan_exit` and the status tool, with a message to quit and open Agent Guard or run `opencode` from a new terminal. `AGENT_GUARD_BYPASS=1` lifts the refusal; OpenCode Guard's `OPENCODE_GUARD_BYPASS` does not. This also covers any launcher that bypasses the guard, including custom wrappers.
- **Path checks.** Guarded, it refuses every tool if cc-safety-net fails to load. `read`, `glob`, `grep`, `list` and `lsp` are refused under DENY. `edit`, `write` and each path in `apply_patch` are refused when the path is protected (the engine folder, OpenCode Guard's engine folder, the list folder, `~/.config/opencode`, `~/.cc-safety-net` or a protected name on the path as typed or as resolved), under DENY or outside ALLOW and temp. Writes are refused when `state/rules.json` could not be read.
- **Release.** The plugin finds its release from its own real path (`realpathSync` of `import.meta.url`), whatever link OpenCode loaded it through. A copy whose real path is not inside a release folder in `releases/` loads no cc-safety-net: guarded, it refuses every tool, and it registers no status tool, so `check` fails.
- **Launch release.** Before anything else, the plugin reads `AGENT_GUARD_RELEASE`, which the launcher sets to its own release ID. OpenCode loads the plugin through `current`, so after an update a session started from the previous release would otherwise load the new release's plugin. If the value matches `[0-9A-Za-z.+-]+` (not `.` or `..`), differs from the plugin's own release and names a folder in `releases/` that holds `RELEASE` and whose `profiles/opencode/plugin.js` really lives there, the plugin imports that file and returns its plugin function instead of its own. That module is then in its own release, so it does not hand over again. If the named release is missing or fails to load, the plugin loads no cc-safety-net: guarded, it refuses every tool with "Agent Guard was updated; quit and reopen OpenCode."; unguarded, it refuses as usual. Any other value, and an unset variable (a bare `opencode`), leave the plugin on its own release. Only folders in the write-protected `releases/` qualify, so the variable cannot pick code from a writable place.
- **Shell commands** go to cc-safety-net 2.4.14, loaded from `vendor/` of the release the plugin resolves into. The profile sets `CC_SAFETY_NET_PARANOID_RM=1` and unsets `CC_SAFETY_NET_HOME`, `CC_SAFETY_NET_WORKTREE` and `SAFETY_NET_WORKTREE`. Guarded, the plugin also deletes those three from its own environment and sets `CC_SAFETY_NET_PARANOID_RM=1` before it loads cc-safety-net; unguarded, it leaves the environment alone. The installer adds an Agent Guard rulebook; from OpenCode's hooks release it also blocks `core.hooksPath` changes (section 3, Git hooks).
- **Status tool** `agent_guard_status` reports whether the guard is active, with that release's version and ID (`Agent Guard 0.2.0 (0.2.0-20261001T120000Z) is active.`); its description carries the same version and ID. `check` looks for it. It is registered only when cc-safety-net loaded.

### Plugin core and adapters

Planned. Step 9 splits `profiles/opencode/plugin.js` into `plugin/core.mjs`, used by every adapter, and `plugin/opencode.js`, the OpenCode adapter with the cc-safety-net compatibility wrapper; the 79 plugin checks stay unchanged (section 8). The adapter keeps a `.js` name, as the built plugin has: whether OpenCode loads a `.js` link whose target is `.mjs` is unverified. Step 10d adds `plugin/pi.mjs`, the adapter for Pi and OMP with the wrapper for cc-safety-net's Pi entry, and `plugin/pi-entry.ts`, the `.ts` re-export that Pi's discovery loads.

The core:

- **Release, before registration.** The plugin computes its release from its own real path and compares it with `AGENT_GUARD_RELEASE`. In OpenCode it hands over to the launch release, as built. Until no kept release predates step 9, the handover also accepts that release's `profiles/opencode/plugin.js`, the path the built plugin uses. In Pi the launcher injects the launch release's copy with `-e`, and discovery may also load `current`'s copy. A nested launch injects the outer launch's release, which the snapshot names, so plugin code stays at the outer launch's release (section 7, Nested launch). A copy whose release differs from `AGENT_GUARD_RELEASE` stands aside, registering nothing, only when Pi's arguments (`process.argv`) carry `-e` or `--extension` with the launch release's `plugin/pi-entry.ts`; that copy loads first and registers. Otherwise it hands over to the launch release as the OpenCode plugin does, with the same checks and the same refusal when that release is missing, so a stray or agent-set variable on a direct start cannot leave Pi with no plugin. On a direct start the variable is unset and the discovered copy registers. The decision is made at every load, so it holds across `/reload`.
- **Registration lifecycle.** Pi's `/reload` builds a new extension runner in the same process. In Pi 0.99.2, `reload` in `core/agent-session.js` emits `session_shutdown`, invalidates the old runner, has the resource loader clear its extension cache and load every extension again (`reload` in `core/resource-loader.js`), builds a new runner and emits `session_start`. Process-wide state such as `globalThis` survives. The plugin therefore registers its handlers and tools on every load it is given, with no process-wide "already registered" flag, which would outlive the handlers it stands for. Per-event deduplication of copies of the same source, and independent verdicts for different physical copies, stay as pi-sandbox-guard has them (`src/index.mjs`).
- **Probe**, as built: an `O_CREAT|O_EXCL|O_NOFOLLOW` create in `state/`; EPERM means guarded.
- **Snapshot.** Read from the file `AGENT_GUARD_STATE` names (section 7, Per-launch snapshot), accepted only as a regular file directly in `state/launch/`. Writes are refused when it is missing or malformed. Until the composition release (section 11, OpenCode's releases) a snapshot names one profile and runtime, and a snapshot of another profile or runtime than the adapter's counts as unguarded (below): a Pi started directly inside an OpenCode session inherits OpenCode's variables, and the probe alone would report it guarded. From the composition release a snapshot lists its members (section 3, Composition). An adapter accepts a snapshot that lists its runtime, and uses its own member record (checker settings and ask list, plugin arguments) and the shared projection; a snapshot that does not list its runtime counts as unguarded.
- **Decisions.** `decide({op, paths, cwd})` checks reads (a folder listing is a read) and writes against the snapshot's projection: DENY, READ ONLY, a write outside ALLOW, temp and the runtime grants, the protection union (section 3, Every installed harness) on the path as typed and as resolved, and dangling links, which are refused. These are the built semantics, generalized. Pi gains them at step 10d; pi-sandbox-guard's extension checks only `bash`. From the composition release the projection covers every member's grants. Where the credential set applies (section 3, Credentials), the projection mirrors its classes: tool credentials are unreadable; inference credentials are readable, with their config locked and their token caches writable; `.env` files are unreadable apart from the three template names and OMP's two `.env` files.
- **Unguarded refusal.** Every tool except the adapter's safe set is refused unless `AGENT_GUARD_BYPASS=1`, as built. For Pi this is a behavior change (section 11).
- **Status text**, as built, and the command checker (below).

| | OpenCode (`opencode.js`) | Pi and OMP (`pi.mjs`) |
|---|---|---|
| Hook | `tool.execute.before`; refuse by throwing (built) | `pi.on('tool_call')`; refuse with `{block, reason}`; a throw also blocks |
| Tools mapped to operations | `read`, `list`, `glob`, `grep`, `lsp` (`filePath`, else `path`, else the session folder): read; `edit`, `write` (`filePath`) and each path in `apply_patch`'s `patchText`: write; `bash` (`command`, `workdir`): shell. As built; `list` keeps its test. | `read`, `grep`, `find`, `ls` (`path`; the last three default to the working folder): read; `edit`, `write` (`path`): write; `bash`, `powershell` (`command`): shell |
| Shell input rules | as cc-safety-net's entry applies them | as pi-sandbox-guard's adapter has them: a non-string command blocks; a whitespace-only command is allowed before health checks; a degraded checker blocks |
| Working folders for shell | `workdir`, else the session folder | `event.input.cwd`, `event.cwd` and `ctx.cwd`, each kept only if it is an existing folder; worst verdict wins; none left blocks |
| Ask verdict | Refuse. OpenCode 1.18.34 never calls the declared `permission.ask` plugin hook, and `tool.execute.before` can only throw. A plugin-registered tool can call `context.ask`; whether that could carry an ask tier is unverified and not needed now (section 15). | `ctx.ui.confirm` when `ctx.hasUI`; refuse otherwise, and on a decline or a confirm error. Print and JSON modes have no UI. In RPC mode the client program answers, as today (decision D4, section 15). |
| Status tool | `agent_guard_status` (built) | `registerTool` of `agent_guard_status`, by the registering copy only |
| Safe set when unguarded | the built list | defined at step 10d |
| Loading | link in `~/.config/opencode/plugins` (built) | discovery link `~/.pi/agent/extensions/agent-guard.ts` to `$engine/current/plugin/pi-entry.ts`, for direct starts, plus `-e <launch release>/plugin/pi-entry.ts` from the launcher. Pi 0.99.2 puts `-e` paths first and drops a later path with the same real path (`mergePaths` in `core/resource-loader.js`); neither settings nor `-ne` can disable a `-e` extension. |

Known limit, carried over: Pi runs `tool_call` handlers in load order and passes each the same `event.input` (`emitToolCall` in `core/extensions/runner.js`). With `-e` the guard's handler runs first, so a later extension can change `event.input` after the guard approved it. pi-sandbox-guard has the same limit; Seatbelt is unaffected. Wrapping the built-in tools instead would make Pi refuse to start whenever another extension registers the same tool name: Pi 0.99.2 reports such a conflict as an extension load error and exits (`detectExtensionConflicts` in `core/resource-loader.js`, `main.js`). The same rule is why only the registering copy registers the status tool.

### The cc-safety-net compatibility wrapper

Planned for step 9. The OpenCode adapter keeps the vendored OpenCode entry intact instead of calling only its check. That entry (`default.server` in `vendor/cc-safety-net/dist/index.js`) returns two hooks:

- `config` keeps a reference to OpenCode's configuration and adds a `cc-safety-net` command unless the configuration already defines one. The configuration's `shell`, else `$SHELL`, later selects the dialect for `bash` calls: `powershell` and `pwsh` are PowerShell; `bash`, `dash`, `ksh`, `sh` and `zsh` are POSIX; anything else is `auto`.
- `tool.execute.before` checks the call.

The wrapper forwards `config` unchanged and returns any other hook the entry adds, as today (`...(net ?? {})`). Only `tool.execute.before` joins the command checker, after the core's path checks. Calling the check alone would drop the command and could pick the wrong dialect. The environment handling (unset `CC_SAFETY_NET_HOME`, `CC_SAFETY_NET_WORKTREE` and `SAFETY_NET_WORKTREE`; set `CC_SAFETY_NET_PARANOID_RM=1`) moves into the wrapper, which from step 9 also clears the other cc-safety-net variables that can loosen a check (Command checker, Settings).

### Plugin injection by command

Planned for step 10d. The tables are runtime data (`admin_commands`, `refused_commands`, `value_options` in `[runtime.<name>]`, section 3); `args_hook` classifies the command at R5 and C3 adds the plugin (section 7, Launch pipeline).

Pi 0.99.2 loads extensions for interactive, print, JSON and RPC sessions and for `--help` and `--list-models`. It handles `auth`, `install`, `remove`, `uninstall`, `update`, `list`, `config`, `mcp`, `--version` and `--export` before it loads any (`main.js`). The Pi runtime injects `-e` for every command that loads extensions and for no other. pi-sandbox-guard does not inject for `--help` and `--list-models` (`is_runtime_command` in `launchers/pi`); its discovered copy loads there, but `-ne` or a settings entry can remove it.

OMP keeps pi-sandbox-guard's tables from `launchers/pi` until OMP is observed (section 15):

- no injection for `agents`, `auth-broker`, `auth-gateway`, `bench`, `browser-relay`, `completions`, `config`, `dry-balance`, `gallery`, `gc`, `grep`, `grievances`, `install`, `models`, `plugin`, `read`, `say`, `search`, `setup`, `shell`, `ssh`, `stats`, `tiny-models`, `token`, `ttsr`, `update`, `usage` and `worktree`, or for `--alias`, `--export`, `--list-models`, `--help` (`-h`) and `--version` (`-v`);
- `--profile`, `--cwd`, `--config` and `--add-dir` take a value, and `--allow-home` and `--offline` do not; classification skips them. `--` or any other option makes the command an agent session;
- `cleanse`, `commit` and `join` are refused, because they reject `--extension`.

### Command checker

Planned: step 9 for OpenCode, step 10d for Pi and OMP (decision D5, section 15). Every profile runs one checker, cc-safety-net, through a wrapper for its harness's entry, and then Agent Guard's rules, which can only make a verdict stricter. The core runs them after its path checks and keeps the worst verdict. A checker returns `allow` or `block` with a reason and, when cc-safety-net reports one, a rule ID, and reports its health apart from its verdict. An error, a timeout or an unhealthy state blocks the call. A degraded cc-safety-net policy is unhealthy: 2.4.14 drops a missing or invalid rule source, marks its policy `degraded` and goes on allowing, so the wrapper checks that state and that Agent Guard's rulebook loaded, not only that the call returned. Today neither the plugin nor `doctor` notices a damaged `~/.cc-safety-net/rules/rule.json`; the installer only warns when it cannot merge it (`installer/lib.zsh`). The adapter maps `ask` (table above).

- **OpenCode** reaches cc-safety-net's OpenCode entry through the compatibility wrapper (above). Behavior is unchanged at step 9, including cc-safety-net's secret-path checks on file tools and its audit log in `~/.cc-safety-net/logs`. Those checks keep refusing file-tool reads of `~/.aws` and gcloud's configuration, which the credential set leaves readable; the harness's own reads are unaffected.
- **Pi and OMP** reach cc-safety-net's Pi entry (`vendor/cc-safety-net/dist/pi/index.js`) through a matching wrapper. It calls the entry with a stand-in Pi API that captures the entry's `tool_call` handler and drops the `cc-safety-net` command the entry registers, so neither Pi nor OMP loads cc-safety-net as an extension of its own. The wrapper calls the handler once for each working folder the adapter keeps (table above) and keeps the worst result. The entry checks `bash` and `powershell` commands and routes the file tools through its secret-path checks. pi-sandbox-guard's analyzer, Pi's checker until step 10d, checks `bash` only: it asks before force-pushes (difference 8) and allows `git checkout -- .`, `git stash drop`, `git branch -D` and every secret read, and from step 10d the credential set makes `~/.aws/credentials` readable in Pi sessions (section 3, Credentials), which cc-safety-net refuses to read through a tool.
- **Agent Guard's rules** run after cc-safety-net and can only turn an `allow` into an `ask` or a `block`. Blocks that hold in every harness are rules in Agent Guard's rulebook, which the installer keeps in cc-safety-net's user configuration (`~/.cc-safety-net/rules/agent-guard`). Asks are an ask list per adapter: Pi and OMP confirm them, and OpenCode, whose plugin can only refuse, refuses them. The ask list is a cc-safety-net rulebook of its own, evaluated in a second call after an `allow`, so that matching uses cc-safety-net's command analysis, wrappers and nested shells included, and Agent Guard writes no parser. Whether 2.4.14 can evaluate a second rulebook in-process is verified at step 9 (section 15, To verify); if it cannot, ask-list entries become rulebook rules, which block in every harness. The first entry is a `core.hooksPath` change (section 3, Git hooks).
- **No downgrades yet.** A `block` never becomes an `ask` while cc-safety-net reports only the first rule a command matched, as 2.4.14 does: `git reset --hard && git push --force` reports one rule, and asking about that one would let the other through. Once cc-safety-net reports every match (section 15, Requests to cc-safety-net), an adapter that can confirm may ask instead of block when every matched rule is on its ask list. Until then Pi's asks for `git reset --hard`, `git clean -fdx`, `find -delete` and force-pushes become blocks at step 10d.
- **Settings.** The core clears the `CC_SAFETY_NET_*` and `SAFETY_NET_*` variables that can loosen a check or move cc-safety-net's files, and keeps those that can only make it stricter, so an operator's own stricter setting, such as `CC_SAFETY_NET_LEVEL=paranoid`, still applies. Step 9 sorts 2.4.14's variables into the two groups from its source; the plugin as built clears three, `CC_SAFETY_NET_HOME`, `CC_SAFETY_NET_WORKTREE` and `SAFETY_NET_WORKTREE`. The core raises the level to `strict` where it is lower: for Pi and OMP from step 10d, for OpenCode from its deletes release (Recursive deletes, below), so that step 9 changes no OpenCode verdict. Agent Guard's rulebook stays in the user's cc-safety-net configuration, so the user's own cc-safety-net rules apply in sessions too; the level is set per session, so other tools that use cc-safety-net keep theirs.
- **Project policy.** cc-safety-net layers a project's `.cc-safety-net/policy.json` over the user's, and a project file can switch built-in rules off: in the design review on 2026-10-02, `{"destructive_command_protection":{"enabled":false},"secret_protection":{"enabled":false}}` in a session folder made cc-safety-net 2.4.14 allow `git push --force` and `cat .env` there. Rulebook rules still applied. Sessions cannot write such a file: OpenCode's protected names cover `.cc-safety-net` (built), and Pi's do from step 7f. A cloned repository that ships one is the residual (section 15, Risks). Rules that must hold belong in Agent Guard's rulebook.

pi-sandbox-guard's analyzer is not moved into the plugin. Its corpus stays as step 7e's characterization fixture. If step 7e leaves an in-scope Pi verdict that neither a rulebook rule nor the ask list can express, Pi's checkers keep the analyzer behind cc-safety-net until one can (decision D5). Step 7e settles this before step 10c starts. If it takes the fallback, step 10c also builds the checker interpreter record, which OMP needs because its executable is not Node, and step 10d moves the analyzer into `plugin/checkers/pi-analyzer/` behind cc-safety-net and converts `.guard-node` into that record, where the rest of this document drops them; the analyzer keeps its log at `~/.pi/agent/security-events.log`.

cc-safety-net 2.4.14 ships entry points for OpenCode and Pi, and a hook mode for Claude Code, Codex, Copilot CLI, Cursor, Gemini CLI, Grok Build, Kimi Code, Antigravity CLI, Amp, OpenClaw and Hermes Agent. In the design review, Pi's 383 corpus cases went through both checkers on scratch copies, cc-safety-net with Agent Guard's rulebook:

| Corpus verdicts | Cases |
|---|---|
| Same verdict | 182 |
| The analyzer blocks, cc-safety-net allows | 126: writes or deletes under `/`, `/etc`, `/System`, `/Library` or `/dev`, which no session can write, plus a fork bomb and a brace-expansion bomb |
| The analyzer asks, cc-safety-net blocks | 30, such as `git reset --hard`, `git clean -fdx`, `find -delete` and `xargs rm` |
| The analyzer asks, cc-safety-net allows | 30, such as interpreter one-liners, `export PATH`, `curl -o` and `core.hooksPath` changes |
| The analyzer allows, cc-safety-net blocks | 15, all recursive deletes inside the project, which OpenCode's interim delete settings block (Recursive deletes, below) |

The analyzer took 0.15 to 1.7 seconds per command against its 2-second fail-closed limit; cc-safety-net took 1.4 to 15 milliseconds in-process. The review's scratch homes were under `/tmp`, which the analyzer treats as a safe root, so some delete verdicts may differ in a real home; step 7e repeats the run outside the temp roots.

### Recursive deletes

Planned. One policy for every harness: Pi and OMP from step 10d, OpenCode from its deletes release (section 11, OpenCode's releases). It comes from cc-safety-net's scoped rules at the strict level:

- **Allowed without asking:** recursive deletes of literal paths below the session's working folder, and in temp, such as `rm -rf node_modules dist build`, `rm -rf ./src/generated` and `rm -rf /tmp/build-cache`. In temp this includes the working folder itself: 2.4.14 checks for a temp target before it checks for the working folder, so a session working in `/tmp/job` may run `rm -rf /tmp/job`. Temp holds nothing this design protects. Committed work can be restored with Git, and Seatbelt denies every delete outside the session's writable set. Uncommitted and untracked files below the working folder cannot be restored; deleting them without asking is accepted, as is any other write the agent makes there.
- **Blocked**, with cc-safety-net's message: the working folder itself outside temp, its parents and anything outside it, also through `cd ..`, `timeout`, `env` and `bash -c`; home and `/`; Git metadata; dynamic targets (`rm -rf "$DIR"`, `rm -rf *`, command substitution), which only the strict level blocks; `find -delete`; `find -exec rm -rf`; `xargs rm -rf` on dynamic input.

cc-safety-net 2.4.14 gives these verdicts with `CC_SAFETY_NET_LEVEL=strict` (observed with its `checkCommand` API on 2026-10-02), with one gap: a recursive delete without `-f` (`rm -r`, `rm -R`, `rm --recursive`) is not checked at any level, so `rm -r ../other` and `rm -r ~/Documents` are allowed. A rulebook rule cannot close it: version 2 rules compare whole arguments, so `-r` never matches `-rf`, and they need a fixed subcommand path, which `rm` lacks.

Until a cc-safety-net release checks those deletes (section 15, Requests to cc-safety-net), OpenCode keeps `CC_SAFETY_NET_PARANOID_RM=1` and the `recursive-rm` rule, which block every recursive delete, and Pi keeps the analyzer's rules. If no such release exists at step 10d, Pi takes OpenCode's interim settings too. A harness's deletes change is one change: the vendored cc-safety-net moves to that release, `CC_SAFETY_NET_LEVEL=strict` is set where it is not yet, and `CC_SAFETY_NET_PARANOID_RM=1` and the `recursive-rm` rule are removed. Agent Guard's rulebook keeps its other rules.

## 6. Install, update and uninstall

### The installer as built

`profiles/opencode/install.sh` is the entry; the code is in `installer/` (Installer structure, below). It has three entries. The bootstrap runs `install.sh --stage <txn>` on the unpacked tree in `stage/<txn>/tree`, under the lock it took. From a checkout or an unpacked archive, `zsh install.sh [--projects DIR] [--gui]` copies the tree into `stage/<txn>/tree` (with `COMMIT` set to `checkout` when the tree has none) and runs that copy the same way. Recovery runs `state/txn/install.sh --recover <caller>` (below). Every function runs from `main` on the last line, so a file replaced or deleted mid-run is never read half-way.

Preflight changes nothing and stops on the first failure: required tools; the guard probe (an exclusive create in `state/`, and in OpenCode Guard's `state/` when it exists, refused with "run this from Terminal, outside any guard or sandbox" when Seatbelt denies it); the lock; recovery of an earlier run; an install made before release folders (`$engine/launch` a regular file, removed with its own `"$engine/uninstall.sh"`); OpenCode Guard's state on this Mac (section 10), with a migration's own checks; an unfinished PATH block, Agent Guard's or OpenCode Guard's, in a startup file; any file the run replaces on another volume than the engine; the projects folder. Only then does a run name its release ID and open a transaction.

**Lock.** `state/lock/` holds `pid` and `start`, the owner's start time from `ps -o lstart=`. A lock is live when that pid runs zsh with the same start time; a lock without both files counts as held for 10 seconds, so a run that is still writing them is not taken over. A stale lock is taken over under an `fcntl` lock on `state/.lock-takeover`. The bootstrap, the installer and `agent-guard update` hand the lock on through `exec`, which keeps the pid. A recovery child adopts its parent's lock and refuses to run without it.

**Transaction.** The installer builds `state/txn.new/` with copies of `install.sh`, every `installer/` module, `account.zsh`, `uninstall.sh` and each harness's bundle files (the frozen recovery bundle, below), `plan.json` (release IDs, kind, migration source, harnesses, stage, projects folder, app decision and the config files) and an empty `journal`, syncs, and renames it to `state/txn/`. The journal has one line per step, `<action> begun|done|undone [detail]`; a line of any other form, such as a torn last line, is ignored. Before a step changes a file it copies the original to `txn/backup/<name>/file` through a temporary name. Runs before the switch (assemble into `stage/<txn>/release` and rename to `releases/<rid>`, the rulebook and merged `rule.json` in the stage, the app build with `codesign --verify --strict` and a bundle ID check, the list, then `releases/<rid>/launch check staged`) touch nothing outside the engine folder and the list.

**Switch.** In the action registry's order (Installer structure, below): rulebook folder, `rule.json`, app, `current`, plugin link, permission values, PATH blocks. Each step journals `begun` before it changes anything and `done` after, and each has an undo that uses the backup and the journal detail. The app is rebuilt only when its inputs (the AppleScript, which names `bin/opencode-gui` through `bin`, the bundle ID and the icon) differ from the stamp's `app_inputs`; otherwise the installed app is kept. The permission record is written before the config it describes, so a run stopped between the two writes leaves a record that matches either config state. `/bin/sync` runs after each `begun` line, after the transaction opens and after the stamp is written.

**Gate.** After the switch: `bin/agent-guard doctor` against the live install, then each installed harness's gate check, for OpenCode `bin/opencode --version` through the PATH shim with a 20-second limit, whose log must name the new release. With no OpenCode CLI the launch check is skipped and says so. Any failure rolls back.

**Rollback.** Journals `rollback begun`, undoes every step that began, in reverse order, journals `rollback done`, deletes the new release and closes the transaction (one rename, then deletion, so an interrupted deletion leaves no half transaction). A rollback of a fresh install also removes the engine folder; a permission record that is not empty is first copied to `~/Agent Guard/permissions-backup.json`.

**Stamp and cleanup.** `state/stamp.json` is written only after the gate passes: version, tag, commit, release ID, install time, `app_inputs`, `harnesses`, the SHA-256 of every file in the release folder, the app and the rulebook and of each harness's installed files outside the release folder (the `files` hook: Pi's copies in `~/.local/bin` and the extension folder), and the targets of `current`, `bin` and the plugin link. The keep step follows: each harness's `keep` hook, then the migration's, moves what must outlive the transaction from the transaction backup into `state/` (Pi's replaced entries into `state/legacy/replaced/`, pi-sandbox-guard's files into its legacy bundle). A failure leaves the transaction open, and the next run's recovery runs the keep step again. Cleanup then journals `cleanup begun`, removes release folders other than the new one and the one `current` named before (the kept one serves sessions started from it, section 5), deletes the stage and closes the transaction.

**Recovery.** Every install, update and uninstall first runs `ag_recover`: it stops a `serve` left by `check staged` (`state/.serve.pid`), deletes `state/txn.new`, and when `state/txn` exists runs the copy of the installer in it, which decides from the stamp and the journal:

| State | Action |
|---|---|
| The stamp names the new release | finish the cleanup |
| No switch step began | discard: delete the new release and the stage, close the transaction |
| `rollback begun` is journaled, or the caller is uninstall | finish the rollback |
| The new release folder is missing | finish the rollback |
| Otherwise (install, update) | redo the switch from the first unfinished step, run the gate and write the stamp; roll back if any of these fails |

Recovery then deletes the stage folders other than the open transaction's and the running bootstrap's. If recovery fails, `state/txn` is kept and the caller stops without changing anything.

**Power loss.** macOS shell tools have no `fsync`; `/bin/sync` asks the system to write its buffers but does not wait for the disk. The journal, the plan and each rename are ordered with it, and a torn journal line is ignored. After a power loss in a switch, a renamed file can still be lost or reach the disk before the journal line that names it. Recovery then undoes from the backups it finds; a permission value whose change was lost appears as a user edit and is left unchanged and reported.

**Testing the staged copy.** `releases/<rid>/launch check staged` tests a release that is not current; it refuses the current one. It runs checks 1–3 of `check` under the staged profile and skips `prepare_hook` and the `state/rules.json` write, so an unproven release creates no harness config and publishes no rules to running sessions. Its plugin check runs `opencode serve` with `AGENT_GUARD_RELEASE` set to the staged release, `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR` and `OPENCODE_CONFIG_CONTENT` unset and `XDG_CONFIG_HOME` set to `profiles/opencode/check-config` in the staged release, whose only plugin links to that release's `plugin.js`. The status tool registers only when that plugin loaded cc-safety-net from its own release, so a pass shows the staged plugin and vendored code loaded, not the live plugin. The serve pid is kept in `state/.serve.pid` while it runs. OpenCode 1.18.33 loads no config, and so no plugin, when it cannot create `.gitignore` in the config folder, and the staged profile denies writes there, so the installer writes that file into `check-config/opencode/`. `~/.opencode` is still scanned.

### Install

One command in Terminal installs the latest release from `github.com/ebrindley/AgentGuard`. Each release has three assets: `install.sh` (the bootstrap, built from `scripts/bootstrap.zsh`), `agent-guard-<version>.tar.gz` and its `.sha256`:

```sh
/bin/zsh -c "$(/usr/bin/curl -fsSL https://github.com/ebrindley/AgentGuard/releases/latest/download/install.sh)"
```

The `-c` form keeps the terminal on standard input, so the installer can still ask for the projects folder. The bootstrap script downloads the complete release archive and its checksum file, verifies the SHA-256 sum and unpacks the archive into a staging folder. It changes nothing in the install before the checksum matches.

The checksum comes from the same release as the archive. It detects a corrupted download and assets that do not belong together. It does not prove who published them: anyone able to replace the archive in the release can replace the checksum too. The bootstrap script is trusted code fetched over HTTPS.

Staged install:

1. The previous version stays in place and keeps working.
2. `check staged` runs against the new release folder before anything outside the engine folder and the list changes.
3. If it passes, the switch runs, followed by the gate: the live doctor, which checks the plugin in `~/.config/opencode/plugins`, and a launch through the command path. The stamp is written only after those pass. A failure after the switch restores the previous version.
4. If it fails, the install fails: the installer exits non-zero, names the failed checks, removes the new release and the stage and leaves the previous version working.

The launcher finds its engine from the account home, and production has no path override (section 8). Each install is a folder `releases/<id>` in the engine folder, and `current` names the active one. The staged copy is tested in its final folder before `current` moves (`check staged`, above).

Lists, user edits and permission records survive failed runs and reruns. An existing `~/Agent Guard/Guard List.txt` is never overwritten; the installer copies the template only when the list is missing. A config file's permission values are recorded once, on the first run that changes them, so reruns keep the first `orig`. A migration imports OpenCode Guard's record instead and writes no permission value (section 10, rule 3).

### Commands

`agent-guard`, installed as `$engine/bin/agent-guard`:

- `doctor` runs each harness's doctor entry; OpenCode's is the release's `launch check` (section 8). The harnesses are the open transaction's while it installs the doctor's release, else the stamp's (Installer structure, below). The gate runs it after the switch. It does not recover an interrupted run; `update` does.
- `version` prints `Agent Guard <version> (<tag>, commit <12 characters>), release <rid>, installed <UTC time>` from the stamp, then one line per stamped file or link that is missing or changed and per file added to the release folder. It exits 1 on any drift or when there is no stamp.
- `update` refuses inside a guard, takes the lock and runs recovery, then removes the forwarders when their time has come (section 10), then downloads the latest release's `install.sh` from the download base compiled into it. It requires the file's last line to be `{ agent_guard_bootstrap "$@" }` and exactly one release tag in it. When that tag is older than the stamp's, it says so and changes nothing. When it equals the stamp's, update still completes a pending migration (a registered source still to migrate or to retire) or installs a newly found harness (one found on this Mac and missing from the stamp's `harnesses`), and otherwise says the release is current and changes nothing. For a newer tag, or to complete such an install, it runs the bootstrap with `--update` under the same lock, and the full staged install follows. A failed update leaves the installed version working.
- `uninstall` refuses inside a guard, takes the lock and runs recovery as the uninstall caller, which rolls back an open switch. Recovery can delete the release this command runs from, so it then finds the uninstaller again: `current`'s, else the transaction's copy. When recovery rolled back a fresh install and only the state folder is left, it removes the engine folder itself, first copying a permission record that still holds entries to `~/Agent Guard/permissions-backup.json` and then exiting 1.

Planned at step 7c: `agent-guard bind` shows, checks, detects and records harness executables and interpreters (section 3, Executables and launch links); `agent-guard wrapper add|remove|list` maintains custom Pi wrappers, and `doctor --json` gives `doctor`'s results as JSON (section 11, Commands).

### Uninstall

`profiles/opencode/uninstall.sh` runs in this order; U2 and U3 run for each harness the stamp lists, U6 and U7's record copies for each registered migration. Until the plugin goes, a start without a PATH block meets the plugin's unguarded refusal, and an old terminal still reaches working shims.

| Step | What |
|---|---|
| U1 | PATH blocks between the markers in `.zprofile`, `.zshrc` and `.bash_profile`, at each file's resolved target; an unfinished block is reported, not touched |
| U2 | Each recorded permission value, only where the current value still equals the recorded `wrote` value, so later user edits survive; an `orig` of null deletes the key, and a key with no recorded `wrote` value is left as is. A file's entry leaves the record once the file is restored. |
| U4 | The launcher app |
| U5 | The `agent-guard` entry in `~/.cc-safety-net/rules/rule.json`, then the rulebook folder |
| U6 | After a migration, each migrated source's uninstall step. OpenCode Guard: its retirement if it is unfinished, then the forwarders at its old command paths and its engine folder, whatever the boot time (section 10). pi-sandbox-guard: its legacy bundle, while step 11's cleanup has not removed it, is copied to `~/Agent Guard/pi-sandbox-guard-legacy/` (section 11, Uninstall). If a source's step fails, the engine is kept and uninstall exits 1. |
| U7 | If any value was not restored, the permission record is copied to `~/Agent Guard/permissions-backup.json`, and OpenCode Guard's imported record, if present, to `~/Agent Guard/opencode-guard-permissions.json`. If a copy fails, the engine is kept and uninstall exits 1. |
| U3 | The plugin, when it is a link into the engine folder or a regular file. If it cannot be removed, the engine is kept and uninstall exits 1. |
| U8 | The engine folder, renamed to `.AgentGuard.removing` and then deleted, so a rerun finds the whole folder or none of it |

Each step can be repeated, so a rerun after a failed or interrupted uninstall finishes the job. Uninstall exits 1 and names what is left when a PATH block, a permission value, the app, the rulebook or its `rule.json` entry was not handled.

It leaves `~/Agent Guard` (list, logs, any permission backup); the wrapper entries (`env`, `exec`, `nice`, `nohup`, `setsid`, `stdbuf`, `time`, `timeout`) in `rule.json`'s `transparent_wrappers`; the `~/.config/opencode/.gitignore` and default `opencode.json` the launcher creates when missing; the writable folders the launcher creates.

It also leaves `~/OpenCode Guard`. Uninstall never runs OpenCode Guard's uninstaller; after a migration it restores the imported values by the same rule (section 10).

### Installer structure

Step 7a, before any Pi installer code (the Pi profile, 7b, runs alongside it). `profiles/opencode/install.sh` is only the entry: it finds `installer/` next to itself (a release folder or `state/txn`) or at the top of the tree, sources `lib.zsh` and `actions.zsh`, then the modules `actions.zsh` names, and calls `main`. Every module only defines functions, so all of them are read before any step runs.

| File | Holds |
|---|---|
| `installer/lib.zsh` | Transaction, journal, lock, recovery, staging, gate, PATH blocks, app, list, rulebook, the migration records and the entries (`ag_install_main`, `ag_recover_main`, `ag_checkout_main`) |
| `installer/actions.zsh` | The module lists, the action registry and, in the comment block at its top, the harness and migration module interfaces |
| `installer/harness/opencode.zsh` | The plugin link, the permission merge, OpenCode's staged and gate checks, its doctor entry and its uninstall steps |
| `installer/migrate/opencode-guard.zsh` | Detection, the imports, the forwarders, the plugin swap and retirement |

Every release folder holds a copy of `installer/`, which its `install.sh` loads when `agent-guard` and `uninstall.sh` source it with `--lib`. `scripts/release.sh` ships the four files; the test seams (`test_point`, `boot_time` and the process check's `pgrep`) are in `lib.zsh` only, where `scripts/check-seams.zsh` checks them. The OpenCode tests pass with no change to what they assert.

- **Action registry.** `ag_registry` is one ordered list of the actions that change files outside the engine folder and the list, one row each: phase, journal name, owner, kinds, and the do and undo handlers. Phase `staged` runs inside the transaction after the list step and before the staged check, and a discard undoes it (the OpenCode Guard record import, P6a); phase `switch` runs in the switch, and a rollback undoes it. The owner is `engine`, `harness:<name>` (runs when the transaction installs that harness) or `migrate:<name>` (runs when it migrates from that source); kinds are `all`, `plain` (install and update) or `migrate`. `ag_switch` runs the switch rows the transaction selects, in order, `ag_rollback` undoes the same rows in reverse and `ag_discard` undoes the staged rows. `ag_switch_begun` matches journal lines against every registered switch name, whatever transaction registered it, so an interrupted action that 0.1.x's fixed pattern of names did not include is finished or rolled back rather than left in place. `app` has two rows with disjoint kinds: before `current` in an install or update, after the PATH blocks in a migration (M7a). The migration's `plugin-take` and `plugin-name` run only when OpenCode Guard's plugin is there or the take began; OpenCode's `plugin` row then finds its link in place and writes nothing, and without that plugin it links it as on a fresh install (S5).
- **Frozen recovery bundle.** `ag_txn_open` copies `install.sh`, every `installer/` module, `account.zsh`, `uninstall.sh` and each harness's bundle files (OpenCode's `profiles/opencode/harness.zsh`, which the process check reads) into `state/txn/`. Recovery runs that `install.sh`, which loads only these copies, so recovery never reads the new release's code. When the new release folder is missing, recovery rolls the switch back instead of resuming it, since resuming needs the release; undoing needs only the journal, the backups and the copies. A transaction left open by an earlier release is finished by that release's own copy, as `ag_recover` runs `state/txn/install.sh` whatever release wrote it; a 0.1.1 transaction recovers with 0.1.1's single-file installer. The bundle lasts only as long as the transaction: `ag_cleanup` deletes `txn/backup` and the stage, then closes the transaction. A file that must outlive the commit, for uninstall or for the steps it prints, needs a durable copy outside the transaction, such as the adoption's legacy bundle (section 11, The adoption).
- **Candidate inventory.** `plan.json` names the harnesses the transaction installs (`harnesses`) and the source it migrates (`migration`). `ag_txn_plan` chooses them: every registered harness whose `detect` hook passes (OpenCode's always does), except one that a pending source other than this transaction's hands over, which waits for that source's transaction. The staged checks, the switch and the gate use the plan, and `agent-guard doctor` reads the open transaction's harnesses while that transaction installs the doctor's release. The launch reads the open transaction's plan whichever release it installs, for Pi's guard files from step 7c (section 11, What changes for OpenCode sessions); the protection union (section 3, Every installed harness) and composition's presence test (section 3, Composition) are to use it the same way. The stamp gains `harnesses` (`["opencode"]` today), the receipt of what was committed; a 0.1.x stamp without it means OpenCode alone. It cannot be the gate's input: the gate runs before the stamp is written (`ag_switch`, `ag_gate`, then `ag_stamp_write`, in an install and in recovery), so during a first Pi install the stamp is missing or names OpenCode alone.
- **Sequential migrations.** `state/migration.json` holds one `{from, switched_at, retired}` record per migrated source. A single record is written as one object, the 0.1.x form, so 0.1.x code (its recovery of its own transaction, or a reinstall of 0.1.x) still reads the file; two or more records are written as a list. The reader takes both, and a record is replaced by its `from`: OpenCode Guard's are `opencode-guard` and `forwarders` (the forwarders-only fresh install). One command migrates a Mac with both old guards, OpenCode Guard first, each source in its own transaction: `ag_install_main` runs a transaction for the first registered source whose state is `migrate`, detects again after it commits, and runs the next source's transaction, in `ag_migration_modules` order, until none is pending; each is a whole transaction with its own release ID, and a later one's cleanup also keeps the release that was current before the command (`keep` in `plan.json`). With no source pending, one transaction installs or updates. A failed retirement stops the command before the next source. A failed cleanup leaves the committed transaction open: the command ends with a warning that names each source not started, and the next run finishes the cleanup, then migrates them. `ag_txn_open` refuses while `state/txn` exists. The sources are OpenCode Guard and pi-sandbox-guard, in that order.
- **Module interfaces.** A harness module implements `detect`, `staged`, `gate`, `doctor RELEASE [--json]` (with `--json` it prints nothing and returns its check lines and a JSON object of the fields it adds) and `uninstall_remove` (U3), and may implement `init`, `title`, `prepare`, `volume`, `bundle`, `assemble` (adds its files to the release folder being assembled), `links`, `files` (its installed files outside the release folder, for the stamp's hashes), `keep` (the keep step, Stamp and cleanup), `procs`, `uninstall_restore` (U2) and `report`; its switch actions are registry rows owned by `harness:<name>`. A migration module implements `detect` (`migrate`, `retiring`, `done` or `none`), `harness` and `retire`, and may implement `init` (its state folder for the guard probe, its PATH block markers for the PATH block rewrite and the unfinished-block check), `title`, `checks`, `begin`, `list_import`, `before_switch`, `gate`, `links`, `keep` (after the harnesses' and before `retire`), `recover_check`, `after_install`, `maintenance`, `report`, `uninstall` (U6; when it fails, the engine is kept and uninstall exits 1) and `save` (U7). The comment block at the top of `installer/actions.zsh` defines each hook.

`doctor`, `update` and `uninstall` iterate over the stamp's `harnesses`: `doctor` runs each harness's doctor entry, `update` installs again at the latest release when a registered source is still to migrate or retire or a harness found on this Mac is missing from the list (Commands, above), and uninstall runs each harness's U2 and U3 steps.

### Gatekeeper and quarantine

Apple ("Resolving Trusted Execution Problems", https://developer.apple.com/forums/thread/706442):

- Browsers and other user-level apps set the `com.apple.quarantine` attribute on downloads, and Archive Utility passes it to unpacked files.
- `curl` and `scp` do not set it; `tar` and `unzip` do not pass it on.
- Launching a quarantined app always invokes Gatekeeper. The system may run Gatekeeper at other times; when is not documented.

So the one-liner's files are not quarantined and should not need Open Anyway in System Settings. This is unverified on the two Macs; step 6 checks it. The launcher app is built on the Mac with `osacompile`, not downloaded. The installer keeps removing quarantine from the engine it installs (`xattr -dr com.apple.quarantine`), which matters only when someone unpacks a browser-downloaded archive.

### Signing

- Release files are unsigned and not notarized.
- The launcher app gets an ad-hoc signature (`codesign --force --sign -`), as today.
- The Rust binary from step 8 is ad-hoc signed (section 7).
- A Developer ID costs $99 a year and is not planned now. A notarization ticket cannot be stapled to a bare command-line binary (https://developer.apple.com/forums/thread/689337), and a `curl` download is not quarantined. "Notarize or stay unsigned" stays open (section 15).

### Binary allowlisting (Santa)

A managed work Mac may run Santa or another binary allowlisting tool. Santa (https://northpole.dev/features/binary-authorization/) decides at each execution from rules keyed by CDHash, the file's SHA-256, signing ID, leaf certificate or Team ID. Signing ID and Team ID rules apply only to binaries signed with a production certificate; CDHash rules apply only to processes under the Hardened Runtime. A Developer ID signature is neither required nor sufficient: a signed binary with no matching rule can still be blocked in lockdown.

Inference, unverified: an ad-hoc signed binary has no Team ID or certificate, so admitting one would take a hash rule, and every release changes the hash.

The zsh engine runs through Apple-signed `/bin/zsh`, so it needs no new binary admission. The launcher app does: the installer builds it with `osacompile` and re-signs it ad hoc, so Santa sees a new binary whose hash differs from OpenCode Guard's app. Before step 6, collect whether the work Mac runs Santa or another allowlisting tool (`santactl status`), how it admits new binaries and whether it admits an app built this way. The Rust update reaches the work Mac only after that route is known (section 7).

### Not planned: DMG and Homebrew cask

- **No DMG.** A browser download is quarantined, so OpenCode Guard's unsigned DMG installer needs Open Anyway after every download (OpenCode Guard README). The one-liner avoids that.
- **No Homebrew cask.** Homebrew requires casks to pass its Gatekeeper checks, which means signed and notarized (https://docs.brew.sh/Acceptable-Casks), and is disabling casks that do not.

## 7. Rust launcher

The Rust launcher replaces `engine/launch` at step 8, as an ordinary `update` after both Macs have switched at step 6. Migration failures and rewrite failures stay separate.

Why Rust: one self-contained binary in place of a zsh script, and memory safety for a security tool. Profiles become embedded data instead of zsh files the launcher runs with `source` (section 3).

### Structure

Planned for step 8. A launch runs in four stages, and no check reads a value a later stage computes:

- **Define.** Profiles hold policy as data. Constants go in TOML; parsing that data cannot express goes in a focused, named Rust hook. The schema grows with the behavior that uses it.
- **Resolve.** The launch resolves the request with no side effects: account, entry, environment, arguments, state roots, project and rules.
- **Compile.** The nested-launch decision, the executable check and the symlink checks consume that one resolved request. The compiler then renders it from the policy model (section 3, The policy model) to SBPL and to the plugin's projection.
- **Execute.** Only this stage creates folders, writes state and execs.

```
engine/                         Rust crate
  profiles/opencode.toml        embedded; profiles/pi.toml from step 10d
  sbpl/base.sb                  template the policy model fills; replaces engine/profile.sb
  src/model.rs                  the policy model (section 3)
  src/resolve.rs                R1 to R9
  src/nested.rs                 N1
  src/exec_select.rs            C2
  src/compile.rs                C1, C3, C4
  src/execute.rs                Execute
  src/hooks/opencode.rs         named hooks; hooks/pi.rs from step 10d
```

Step 8 builds this structure with only the fields OpenCode uses. OpenCode's `protected.sb` becomes policy-model data rendered to the same bytes (section 3). Step 8 also makes the changes later stages need: the shims pass their entry name (R2); the launcher's own probes run in a cleared environment (R3); the builder renders paths outside home, which the zsh builder's `path_rules` writes relative to home (`engine/launch`), and parameters beyond its fixed set (section 3, SBPL parameters). Golden parity is unchanged.

### Launch pipeline

Planned. Parts marked "built" exist in the zsh engine today; the paragraph after the tables gives the step for each stage.

**Resolve** (no side effects; any failure refuses the launch):

| # | Stage | Profile input | Pi today |
|---|---|---|---|
| R1 | **Account.** Login from `id -un`, home from `dscl`; a missing, `/` or non-folder home is refused. Home is canonicalized once and used in canonical form everywhere, including SBPL parameters (built). | none | home passed to Seatbelt uncanonicalized |
| R2 | **Entry.** The shim passes its entry name (`launch cli --entry pi`). The entry selects the profile and runtime; an unknown entry is refused. | `[runtime.<name>]` | basename check in `launchers/pi` |
| R3 | **Probe environment.** Every subprocess the launcher runs itself (`git`, `sandbox-exec` probes) gets a cleared environment with fixed `PATH` and `HOME` and absolute tool paths. This one rule replaces pi-sandbox-guard's four scrub lists and also covers `DEVELOPER_DIR`, which none of them clears. | none | four scrub lists: git selectors, `GIT_CONFIG_KEY_*` and `GIT_CONFIG_VALUE_*`, the `XDG_CONFIG_HOME` pin for git probes, `PERL*` for `shasum` |
| R4 | **Harness environment**, computed, not yet applied: `env_unset` and `env_set`, joined by the engine's entries (the credential set's `SSH_AUTH_SOCK` and `GPG_AGENT_INFO` unsets and `NPM_CONFIG_USERCONFIG=/dev/null`, section 3, Credentials; the Git selector unsets, section 3, Git hooks), harness `PATH` (`inherit` or pinned), `rlimits`, and `refuse_env` variables, which stop the launch with a message. | `env_unset`, `env_set`, `path`, `rlimits`, `refuse_env` | PATH reset, `ulimit`, git selectors, `SSH_AUTH_SOCK` and `GPG_AGENT_INFO` unset |
| R5 | **Arguments, parsed.** The runtime's selectors and command class (agent session, extension-loading command, administrative command, refused command), with option precedence. | `args_hook`, runtime command tables | `is_runtime_command`, `--profile` mirroring |
| R6 | **State roots.** The profile's `state_hook` resolves and canonicalizes the launched runtime's roots from its arguments and environment, or refuses. From the composition release R6 also resolves the roots of every present member from the environment (section 3, Composition); a member whose roots do not resolve gets no grants and does not stop the launch. At a launch that is not confined, presence is decided here, with the selection procedure of section 3, Executables and launch links, so R9 can build the combined writable set; C2 checks what it selected. A confined launch (Nested launch) does not decide presence or select executables again: it takes the members and their executables from the snapshot, and R6 resolves only the roots N1 compares. For OMP, launched or a member, the `.env` check of section 3, Credentials follows: a forbidden variable refuses a launch of OMP, and otherwise drops OMP from the members. | `state_hook` | `PI_CODING_AGENT_DIR`, `PI_CONFIG_DIR`, `OMP_PROFILE`, `PI_PROFILE`, `--profile` |
| R7 | **Project.** `@project` from `start_folder`; the refusal list of section 4; refusal inside a protected agent folder. | `start_folder` | `PI_PROJECT`, git top level, cwd |
| R8 | **Git hooks folder**, for every profile: resolved with the probe environment plus the harness's own `XDG_CONFIG_HOME` from R4, so it reads the configuration the session's Git reads (section 3, Git hooks); broad, home or project-containing results refused. In `gui` mode it uses the project folder step 10a defines. | none | `git rev-parse --git-path hooks` |
| R9 | **Rules.** List parser (built) plus `@project`, state-root grants and the protection union with every installed harness's denies inside granted folders (section 3, Every installed harness). From the composition release the state-root grants are every granted member's, and the effective writable set is the combined writable set (section 3, Composition). Output: the resolved request, including the effective writable set and the protected set. | all policy fields | n/a |

**Decide:**

| # | Stage | Profile input |
|---|---|---|
| N1 | **Nested launch** (Nested launch, below), comparing the request with the enclosing launch's snapshot: after R9 under `nested = "same-boundary"`, the rule for every profile; after R5 under `"inherit"`, which OpenCode keeps until its nested-launch release (section 11, OpenCode's releases). Under `inherit` an inherited launch skips C1, C3 and C4 and selects the executable as built (C2, today's selection). Under `same-boundary` it runs C1's nested check and C3, skips C4 and uses the executable and interpreters the snapshot records for its runtime. | `nested` |

**Compile:**

| # | Stage | Profile input |
|---|---|---|
| C1 | **Symlinked protected names** in the launch folder and `@project`: per name, `on_link = "protect-target"` (OpenCode, built) or `"refuse"` (Pi's `.pi` and `.omp`, including a link inside them to a writable place outside). Uses R9's writable set. Under `same-boundary` a nested launch cannot add denies, so it refuses a symlinked protected name whose target the outer policy, as the snapshot records it, does not already write-deny, whatever its `on_link`; `"refuse"` names refuse as before. | `protected_names[].on_link` |
| C2 | **Executable** (section 3, Executables and launch links), with its interpreters and launch links, checked against R9's writable set; the app in `gui` mode (built). From the composition release every member's executable, interpreters and launch links are checked against the combined writable set: a failing member is dropped from the members and the set is not rebuilt; the launched runtime failing refuses the launch (section 3, Composition). | `cli_names`, `cli_search`, `app_paths`, `app_bundle_id`; runtime binding keys, `override_env`, `trusted_prefixes` |
| C3 | **Arguments, final**: `gui_args` (built), plugin injection by command class (section 5, Plugin injection by command), refused commands. A nested launch injects the outer launch's release, from the snapshot. | `gui_args`, runtime command tables |
| C4 | **SBPL and plugin projection** from the policy model (section 3); the snapshot (Per-launch snapshot, below). | none |

**Execute:** create the writable folders, run `prepare_hook` (built), apply R4, record the launch's canonical roots and, from the composition release, every granted member's in `state/roots.json` (section 3, Every installed harness), write the log `last-launch-<profile>.log` and the snapshot, then exec under `sandbox-exec` with `AGENT_GUARD_SANDBOXED=1`, `AGENT_GUARD_RELEASE` and `AGENT_GUARD_STATE`. An inherited launch applies R4 and execs without `sandbox-exec`. Neither an inherited launch nor a launch refused before Execute leaves a changed file. The only writes before Execute are N1's probes under `same-boundary` (Nested launch): each creates one file exclusively and removes what it created at once, whatever the result, and none creates a folder. The zsh engine, by contrast, creates the writable folders and writes `state/rules.json` before it looks for the executable (`engine/launch`), so this is a recorded difference (Constraints, parity and rollback).

Stage by stage, step 8 builds for OpenCode: R1 to R3; R4 with `env_unset` and `env_set`; R6 for the cache root step 7 resolves (section 9); R9; N1 as built (section 2); C1 with `protect-target`; C2 with today's selection; C3 with `gui_args`; C4; Execute. Step 9 adds the snapshot. Step 10a adds `@project` for OpenCode (R7). Step 10c adds the engine capabilities, with OpenCode switched off: `path`, `rlimits` and `refuse_env` (R4); R8 and the hooks block; the root levels and recorded roots of the protection union; the credential set; `same-boundary` (N1); `on_link = "refuse"` (C1); bindings and the writable-set check (C2). It also adds every installed harness's denies inside granted folders to the protection union, rendered in every launch, OpenCode's included (R9). Step 10d adds Pi's `args_hook` and runtime tables (R5, C3) and its `state_hook` (R6). Step 10e, OpenCode's releases (section 11, OpenCode's releases), switches the capabilities on for OpenCode, one release each; its composition release, which ships for every launch, adds NESTED and member resolution (R6), the combined writable set (R9, C2), member snapshots and the canary on every launch (Per-launch snapshot, Nested launch). The zsh engine is not extended.

### Per-launch snapshot

Planned for step 9. Each launch writes `state/launch/<profile>-<launch-id>.json` in the engine folder: immutable, versioned and write-protected, with its path in `AGENT_GUARD_STATE`. Environment variables carry its location, never copies of policy. Persistent data (bindings, roots, wrappers) stays in separate files. The snapshot records:

- profile, runtime, release ID, launch ID, snapshot version;
- `@project`, state roots, active hooks folder and the launch canary, when the launch has one (Nested launch, below);
- the plugin projection: allow, read-only and deny sets; the protection union as prefixes and name patterns; the runtime grants that the plugin must allow (state-root grants, caches), so file-tool checks never refuse a write Seatbelt permits on purpose;
- the command checker's settings and the adapter's ask list (section 5, Command checker);
- the executable and interpreter used.

Each step writes only the fields its behavior uses; step 9 writes OpenCode's. The safe tool set for unguarded refusal stays in each adapter, because an unguarded start has no snapshot.

Before the composition release (section 11, OpenCode's releases) a snapshot names one profile and runtime. From that release it lists its members (section 3, Composition) and records, per member, its executable and interpreters, checker settings and ask list, plugin arguments, state roots and OMP profile, with one projection covering every combined grant. A nested launch writes no second snapshot.

It replaces `state/rules.json` (section 2) and pi-sandbox-guard's environment markers (`PI_SANDBOX_PROFILE_DIGEST`, the three boundary markers `PI_SANDBOX_PROJECT_BOUNDARY`, `PI_SANDBOX_ACTIVE_HOOKS_BOUNDARY` and `PI_SANDBOX_AGENT_STATE_BOUNDARY`, `PI_SANDBOX_SHIM_ACTIVE`, `PI_SANDBOX_RUNTIME_ACTIVE`). The plugin refuses writes when the snapshot is missing or malformed. An adapter accepts a snapshot that lists its runtime and uses that runtime's record; it treats any other snapshot as unguarded, so before the composition release a snapshot of another profile or runtime counts as unguarded (section 5, Plugin core and adapters). The snapshot describes what a launch enforces; on its own it does not prove that the surrounding sandbox enforces it, and the variable that names it is the agent's to set.

### Nested launch

Planned: step 8 keeps the built decision (section 2); step 9 reads the snapshot; step 10c adds `same-boundary`, the rule for every profile; the composition release makes it compare the request with the snapshot's member records, so a session runs every runtime it was built to include (section 3, Composition; decision D3, section 15). OpenCode keeps `inherit` until its nested-launch release, which removes the `nested` field (section 11, OpenCode's releases). A launch is **confined** when a trivial `sandbox-exec` call fails (built). As built, only `cli` mode runs a nested launch; every other mode refuses.

The decision runs at one of two points. For `nested = "inherit"` it runs after R5, as the zsh engine decides before it reads the list; when the launch inherits, R6 to R9 do not run, so a list or `@project` that would fail to resolve does not refuse a launch the zsh engine runs. For `nested = "same-boundary"` it runs after R9 and compares fully resolved boundaries.

| Confined | Enclosing launch | Request | Result |
|---|---|---|---|
| No | any marker | any | Markers are ignored; the launch proceeds (built). |
| Yes | `OPENCODE_SANDBOXED=1` from OpenCode Guard, until step 11 | OpenCode | Run directly, as built (section 10). |
| Yes | `AGENT_GUARD_SANDBOXED=1` and no snapshot, until the release after every Mac runs step 9's release and has restarted: a session started from a release before step 9 | OpenCode | Run directly, as built. |
| Yes | `AGENT_GUARD_SANDBOXED=1`, a valid snapshot of the same profile and runtime | `inherit` (OpenCode, until its nested-launch release) | Run directly under the enclosing policy, as built. |
| Yes | a valid snapshot of another profile or runtime | `inherit` | Refuse. |
| Yes | `AGENT_GUARD_SANDBOXED=1`, a valid snapshot that lists the request's runtime | `same-boundary` | Run directly under the enclosing policy when the conditions below hold; otherwise refuse with the reason. |
| Yes | a valid snapshot that does not list the request's runtime | `same-boundary` | Refuse: not part of this session. |
| Yes | anything else: no marker, an unreadable snapshot, no snapshot for a `same-boundary` request | any | Refuse. |

Under `inherit` a snapshot's profile and runtime are those of the launch that wrote it; its members do not count, so a snapshot of another profile refuses. Under `same-boundary` a request runs directly only when:

1. it is confined, and `AGENT_GUARD_STATE` names a valid snapshot that lists the request's runtime;
2. the launch canary and the behavioral probes below pass;
3. its `@project` and active hooks folder equal the snapshot's, and its state roots and OMP profile equal those the snapshot records for its runtime; a subfolder of the same repository that resolves to the same `@project` is the same project;
4. no Guard List entry restricts its state roots, in the snapshot's projection or in the list R9 read.

It then runs C1's nested check: because a nested launch cannot add denies, a symlinked protected name in the launch folder or `@project` whose target the outer policy, as the snapshot records it, does not already write-deny refuses the launch, whatever its `on_link`. It runs C3, with plugin injection from the outer launch's release and the refused commands, such as OMP's `cleanse`, `commit` and `join`, and skips C4. It applies its own environment changes, limits and pinned `PATH` (R4) and execs the executable and interpreters the snapshot records for its runtime, without `sandbox-exec`. The outer launch's environment removals and limits still apply. Otherwise it refuses and says why:

- not part of this session: the snapshot does not list the runtime; list it under NESTED in the Guard List (section 3, Composition) and restart the session;
- a different project;
- a different state root, OMP profile or active hooks folder;
- the Guard List entry that restricts its state roots;
- the canary, a probe or the C1 check that failed.

**When each case runs.** A runtime inside another runtime's session (Pi inside OpenCode, OMP inside Pi) runs from the composition release when it is listed under NESTED; that release adds member snapshots and the canary to every launch. Before it, or when the runtime is not listed, a snapshot does not name the runtime, so such a request is not part of the session and refuses. OpenCode inside a Pi or OMP session runs from OpenCode's nested-launch release; until then OpenCode keeps `inherit`, including its PATH search, and a snapshot of the Pi profile refuses it. OpenCode inside an OpenCode session in a different project runs under `inherit` and is refused from that release, the cost of requiring the same project. Membership is decided at the outer launch: a harness installed during a session is not part of it until the session is restarted, and a harness uninstalled during a session keeps its grants until the session ends.

**Launch canary.** Every launch from the composition release, and every `same-boundary` launch before it, denies writes to one file unique to it, `agent-guard-canary-<launch-id>` in the per-user temp folder, which every profile otherwise allows, and its snapshot names that file. The composition release adds it to every launch so that a `same-boundary` request can test any enclosing launch, an `inherit` OpenCode launch included. A nested launch inherits only when an exclusive create of the canary fails with EPERM and an exclusive create of a control file beside it, `agent-guard-control-<launch-id>-<pid>`, succeeds; the control file is removed at once, and so is the canary if its create succeeded. Only the sandbox compiled for that launch denies the canary but not the control file. A list restriction over the temp folder, which the list parser accepts (`engine/launch`), denies both and so refuses, and a snapshot named by an agent-set `AGENT_GUARD_STATE` proves nothing on its own. Any other result, including EEXIST, refuses. With the protection union and the credential set in force (section 3, Every installed harness and Credentials), an enclosing sandbox of any profile already passes pi-sandbox-guard's engine, extension and credential probes; the canary is what ties the request to the enclosing policy.

The behavioral probes are pi-sandbox-guard's (`verify_existing_confinement` in `sandbox/pi-sandbox-preamble.zsh`), kept as a check that the enclosing policy still holds, with exclusive file creates in place of its `mkdir -p` probes, plus two new ones: the project is writable; home, the active hooks folder, `~/.pi/agent/extensions` and, for OMP, its extensions and plugins folders are not writable; `~/.ssh`, when present, cannot be listed; one credential read deny holds (new); the engine folder is not writable (new).

An inherited launch writes no second snapshot and claims no policy it does not enforce. Under `inherit` it finds the executable as the zsh engine does (`next_cli`), searching PATH again. Under `same-boundary` it uses the outer launch's release and the executable and interpreters the snapshot records for its runtime, so it never searches PATH again and does not repeat the binding checks that fail in pi-sandbox-guard (below); for OpenCode this holds from its nested-launch release. The cross-profile refusal under `inherit` is not a boundary: an agent can unset `AGENT_GUARD_STATE`, and an OpenCode request then runs directly under whatever sandbox encloses it, which still applies its own policy. The membership refusal is not a boundary either: an agent can start the executable of a runtime the session does not include, and it runs under the enclosing sandbox and its policy. This removes a pi-sandbox-guard defect at 7ad441f: when its re-entry check (`own_policy_reentry`) passes, `sandbox/pi-sandbox-preamble.zsh` returns before it sets `PROJECT`, `HOME_CANON` and `TMPDIR_CANON`, and `launchers/pi`, which runs under `set -u`, then passes all three to `executable_under_sandbox_write_root` when a `.guard-node` binding exists, so an agent-session re-entry exits. It fails closed.

### Constraints, parity and rollback

Constraints:

- Profiles are TOML embedded in the binary; the fields grow with the behavior that uses them (section 3).
- Hooks are written in Rust.
- One module renders the Seatbelt profile (`compile.rs`); `execute.rs` only passes it to `sandbox-exec`.
- Few crates, and a committed `Cargo.lock`.
- One dependency advisory check, `cargo deny`, not several equivalent ones.
- `unsafe` is forbidden except in one small FFI module.
- Universal binary, arm64 and x86_64.
- An ad-hoc signature, verified on each slice of the final universal binary after packaging. `ld(1)` ad-hoc signs Apple Silicon output by default and says nothing of the same for x86_64, so the linker's default is not evidence for the finished file.
- Test-only home injection is absent from release builds (section 8).
- The minimum macOS version is stated and checked. Today the README and the installer's missing-tool message say macOS 15 or later; the installer does not check the version.
- The binary and every launch link to it (shim, symlink) are protected against replacement and ancestor renames. Ownership does not protect them: Homebrew's prefix (`/opt/homebrew`, `/usr/local`) belongs to the installing user, so only Seatbelt policy stops the agent writing there.

Parity evidence required before the update ships:

- The golden test passes against the Rust engine (section 8).
- The integration checks and the conformance suite pass through the engine adapter against both engines.
- Behavior the golden test does not cover matches the zsh engine: executable selection that skips every guard shim, old and new (section 10, rule 8); argument forwarding; environment unset and set; nested launch; exit status; app launch; log and state contents. One difference is recorded: a launch refused before Execute changes no file (Launch pipeline).

Admission: the work Mac's route for admitting a new binary is settled before this update reaches it (section 6).

The Rust update refuses to switch a Mac where the new binary cannot run. It runs the staged binary's self-test on that Mac first. If the binary is blocked, needs a newer macOS or fails its checks, the update fails, says why and leaves the zsh version working.

The zsh engine stays in the repository until both existing Macs run the Rust version. After it is removed, rollback artifacts are kept: the last zsh release stays installable. How a Mac is rolled back to it is settled in step 8.

## 8. Testing

Both current tests run outside any agent sandbox on macOS 15 or later, because Seatbelt profiles cannot nest:

```sh
node test/golden.mjs
zsh test/test.sh
```

**Golden fixtures.** `test/fixtures/opencode-guard-1.0.3` holds unmodified `engine/launch` and `engine/profile.sb` from OpenCode Guard v1.0.3, commit `9242c1ad45c895efd63e903e1b27d7bab53620ad`. `test/golden.mjs` first checks that the account lookups in the launcher and in `engine/account.zsh` return the real account home when `HOME` and `USER` are spoofed. It lays the staged tree out as a release folder with `current` pointing to it. It then generates the complete SBPL for an empty and a nested list with both launchers and compares them byte for byte, replacing only `OpenCodeGuard` and `OpenCode Guard` with the Agent Guard names. It proves profile bytes only. The fixtures stay unchanged. When a later step changes the profile on purpose (step 7's package-store protection, for example), the golden test compares against the fixture plus that step's recorded, reviewed difference, not an edited fixture. The differences are `test/fixtures/differences/step-<N>.json`, each a line to insert right after an anchor line that must occur exactly once, applied in step order to the renamed v1.0.3 output. Step 5's inserts `(subpath (h "/Library/Application Support/OpenCodeGuard"))` after the Agent Guard engine line in the final deny block (section 10, rule 7).

**Engine adapter.** `test/test.sh` runs 163 checks in a disposable home: 84 shell checks (install refused with no change over an install without release folders; `account.zsh` equal to the launcher's function; install and installed names; release layout, `current` and `bin` links and the plugin link, with no other plugin file; `agent-guard version` and usage; two reinstalls that each keep only the new and the previous release; permission merge, list refusals and log, the release ID in the log; a copied launcher and a release folder without `RELEASE` refused; real Seatbelt enforcement, CLI launch and nested launch with each nesting marker, the shim loop in both PATH orders and through symlinks, executables inside either engine folder skipped; a launch from the previous release logged under its ID while `current` names the new one; `check staged` refused for the current release, passing for a staged one without writing `rules.json` or OpenCode config, and failing when the staged plugin lacks the status tool while `doctor` passes on the live one; OpenCode Guard's engine folder write-denied though listed under ALLOW; OpenCode Guard's PATH blocks, rulebook and plugin file, added after the last install, left unchanged by uninstall; uninstall) and 79 plugin checks from `test/plugin.mjs` in eight modes (unguarded, bypass, OpenCode Guard's bypass variable, guarded with the status text, run directly and through the previous release's launcher, which must report that release; `AGENT_GUARD_RELEASE` naming a deleted release, refused with the update message; the status text alone with `AGENT_GUARD_RELEASE` values outside the allowed form, which are ignored; a copy outside `releases/`; symlinked state folder). It needs Node and the OpenCode CLI. The shim loop checks install the unmodified v1.0.3 fixture launcher as OpenCode Guard and give up after 20 seconds, so a loop fails instead of hanging. Engine specifics sit behind an adapter, `test/engines/<name>.mjs`, with six functions: `name`; `stage`, which copies `engine/`, `profiles/`, `install.sh`, `LICENSE` and `VERSION` if present into a disposable tree and injects the test home into the copied launcher and `account.zsh`; `layout`, which lays a staged tree out as `releases/<rid>` with `current` pointing to it; `launcher`, the command that runs `current/launch` or a named release's `launch`; `identity`, which runs the unmodified account lookups; and `release`, which builds a release from the unmodified source with `scripts/release.sh --dev`, then applies the test seams to the archive's files and to its `install.sh` and rewrites the checksum (`test/bootstrap.sh` serves it from a local server). Both tests take `--engine NAME` (default `zsh`), so the same checks run against the zsh engine now and the Rust engine at step 8.

**Test-only home injection.** Today `test/fixture-home.mjs` rewrites the account lookup in a copied launcher, and the `account_home() {` line in a copied `account.zsh`, to a fixed home, and fails unless each occurs exactly once. The installed launcher has no environment variable or flag that chooses home. Rewriting source cannot work on a Rust binary, so the Rust launcher gets a home injection compiled only into test builds, and the release build is checked for its absence.

**Conformance suite.** Planned; not built. One suite runs against every profile under the real `sandbox-exec`. Its cases are generated from the policy model (section 3, The policy model), and each profile also has a fixture of expected results written by hand, so the generated cases are not checked only against the model that produced them:

- the profile holds only the declared fields: plain assignments for a zsh profile, known keys for a TOML profile;
- each writable path and runtime grant is writable; home and the guard are not;
- each protected path, root level (family, own canonical root, recorded root, linked root; section 3, Every installed harness) and protected name is denied for write, creation, rename and link replacement, directly and through a symlink, in the project, in temp and inside another profile's writable folders, and every installed harness's denies inside granted folders hold under every profile, with their exceptions writable (section 3, Every installed harness);
- DENY entries are denied for reads;
- the credential set's two classes and their collision cases (section 3, Credentials): tool credentials are denied for reads and writes; inference credentials are readable, their config is write-denied and their token caches are writable;
- the hooks block with its collision cases (section 3, Git hooks);
- `open` and `osascript` are denied;
- the plugin loads inside the guard;
- tools are refused when the harness runs unguarded;
- the nested-launch and composition cases (section 3, Composition; section 7, Nested launch);
- a launch from each entry and through each recorded custom wrapper.

OpenCode runs the credential and hooks cases from its credentials and hooks releases (section 11, OpenCode's releases).

**Provider acceptance cases.** Planned, step 10c, with real provider sign-ins and tools:

- providers: Bedrock with static keys, SSO, `aws login` and `credential_process`, for OpenCode, Pi and OMP; Vertex with Google's default credentials, with and without `GOOGLE_CLOUD_PROJECT`; Azure through `az` for OpenCode;
- tools and helpers: a gcloud token refresh with `~/.config/gcloud` write-denied; the helpers that stay usable, aws-vault, 1Password and `security`; a trace of the files `az account get-access-token` writes, which sets the `~/.azure` exceptions;
- the expected failure: Pi's OAuth refresh, with the message Pi reports recorded;
- rule collisions: a list DENY over `~/.secrets` with a `{file:...}` exception; a READ ONLY entry over `~/.aws` with its cache folders; the `.env` template names under a list DENY; an exception whose real path resolves outside `~/.secrets`, which is dropped;
- OMP's `.env` check: each forbidden variable in each of its two `.env` files refuses an OMP launch and, from the composition release, drops OMP as a member (section 3, Credentials);
- OpenCode's model list with its model catalog write-denied;
- composition, with the composition release (section 11, OpenCode's releases): the same project runs; a different project, OMP profile or hooks folder, a READ ONLY entry over a member's folder, a member executable inside the combined writable set, and a symlinked protected name in a nested launch's folder whose target the outer policy does not write-deny each refuse or drop the member as section 3, Composition and section 7, Nested launch specify; a relocated OMP folder granted to an OpenCode session has its config write-denied;
- OMP's `state_grants`, rechecked against OMP 18.4.9.

**`doctor` versus conformance tests.** `doctor` is the small check that runs on an installed Mac: the installer's self-test, `update` and step 6's per-Mac check. It is `agent-guard doctor`, which runs the release's `launch check`: a protected write is denied, a temp write is allowed, `open` is denied, then the OpenCode hook starts `opencode serve` under the guard and looks for the guard's status tool. It skips the plugin check, and still passes, when the OpenCode CLI is not found. Step 7 extends it to check that the configured plugins loaded (section 9). The conformance suite and the integration checks are development tests. They run from the repository in a disposable home and are not installed. This replaces the draft's plan to run the conformance suite as the installer's self-test.

**Pi suites, carried over at step 10.** From step 7b pi-sandbox-guard's suites run against the adopted copy, changed only where a recorded difference changes what they assert (section 11, Tests). At step 10 every pi-sandbox-guard test case (7ad441f), including the manual ones, gets a home here or a written reason to retire it:

- **Conformance cases.** `test/shim.mjs` (executable resolution, config pinning, nested launch) and `scripts/test-sandbox-profile.sh` become conformance cases for the Pi profile. At step 10c they also serve as acceptance cases for the engine capabilities.
- **Plugin case table.** One table, run through a driver per adapter: DENY, READ ONLY, protected, union, runtime grants, `~`, patch, dangling link, unguarded, bypass, handover, state missing or malformed. `test/adapter.mjs` and `test/degraded.mjs` join it. Pi lifecycle cases: `/reload`, session replacement, and discovered plus injected copies of one release and of two releases (section 5, Plugin core and adapters).
- **Checker corpus.** The 401 cases of `test/corpus/corpus.json` and `test/smoke.mjs`'s regressions run through both checkers at step 7e, and the result, with each difference's disposition, is committed as a fixture. From step 10d they run through the Pi adapter and cc-safety-net against that fixture. The one pinned gap (`expectFail` in the corpus) stays pinned.
- **Pi-only cases.** Runtime selection, OMP profiles and `--profile` placement, command classes and option precedence, `refused_commands`, `-e` injection per command (section 5, Plugin injection by command), state-root refusals, and native Pi and OMP with no harness interpreter.
- **Installer cases.** Recovery after every registered action and after cleanup (section 6, Installer structure), and uninstall after a Pi migration (section 11). `scripts/test-ops.sh`'s deploy and status cases become installer and migration tests at step 7c, which run in CI; in pi-sandbox-guard they run in no gate.
- **Retired, with reasons.** TMPDIR validation: the engine never takes `TMPDIR`, and one conformance case shows that `TMPDIR=/` or `TMPDIR=$HOME` widens nothing. The `--deployed` launcher checks (below). The sibling-extension test seam (`launchers/pi` prefers `pi-sandbox-guard-extension/index.ts` beside the shim, which `test/shim.mjs` uses): the launcher injects one path, the launch release's plugin. The `PI_SANDBOX=0` branch of `sandbox/pi-sandbox-preamble.zsh`: unreachable, since `launchers/pi` pins `PI_SANDBOX=1`.
- **Manual.** `test/e2e-demo.mjs` becomes a manual Pi check in step 10d's verification.

`scripts/check-launchers.mjs` runs once in `--sources` mode for the custom Pi wrapper scripts. Its `--deployed` mode expects zsh shims and would reject Rust ones, so launch behavior is verified by the conformance suite instead (section 11).

## 9. Code in writable folders

OpenCode Guard v1.0.3 lets an agent change code that OpenCode runs, and configuration it trusts, from its cache. Its profile allows writes beneath `~/.cache`, which holds OpenCode's npm package store, its `bin` folder of downloaded binaries and its model catalog. Stage 1 kept this unchanged. A spike on 2026-09-28 measured the write access to the package store under the v1.0.3 profile; that OpenCode then imports the changed code comes from its source, not from running a payload. What `bin` and the catalog do came from OpenCode 1.18.34's source; no probe covered them before step 7. Step 7, release 0.1.2, write-protects all three: As built and Test results, below. Code other harnesses run from their writable folders is listed under Other code in writable folders, below.

### Evidence

OpenCode 1.18.33, installed by Homebrew; its tag is commit `51ef4be1d3c122f18fefb510dca8d778571f4f18`. `XDG_CACHE_HOME` was unset, so the default cache root applied.

- [core/global.ts:10–25](https://github.com/anomalyco/opencode/blob/51ef4be1d3c122f18fefb510dca8d778571f4f18/packages/core/src/global.ts#L10) derives OpenCode's cache folder, `<cache>` below, from the XDG cache root. Data, state, logs and the cache's `bin` folder are separate.
- [plugin/shared.ts:207–213](https://github.com/anomalyco/opencode/blob/51ef4be1d3c122f18fefb510dca8d778571f4f18/packages/opencode/src/plugin/shared.ts#L207) resolves configured npm plugins through `Npm.add`; an unversioned name means `@latest`. Plugin loading does not run arbitrary files from the cache.
- [core/npm.ts:87 and 124–145](https://github.com/anomalyco/opencode/blob/51ef4be1d3c122f18fefb510dca8d778571f4f18/packages/core/src/npm.ts#L87) uses `<cache>/packages/<specifier>/node_modules/<package>`. If that folder exists, it resolves the existing entry point without restoring the package; otherwise it installs into the store. The file read had Git blob hash `94e573d12da938336fc5922b69fc342e401105e9`, matching GitHub's metadata for that commit.
- [plugin/loader.ts:94–101 and 136–145](https://github.com/anomalyco/opencode/blob/51ef4be1d3c122f18fefb510dca8d778571f4f18/packages/opencode/src/plugin/loader.ts#L136) resolves the configured plugin and imports its entry point.
- The [plugin documentation](https://opencode.ai/docs/plugins/#how-plugins-are-installed) still names the older `~/.cache/opencode/node_modules/`. The probe covers both layouts.
- [OpenCode Guard v1.0.3 profile:6–22](https://github.com/ebrindley/OpenCodeGuard/blob/9242c1ad45c895efd63e903e1b27d7bab53620ad/engine/profile.sb#L6) allows writes beneath `~/.cache`. Its protected paths and names do not cover package entries.

OpenCode 1.18.34, read from source at tag `v1.18.34`, commit `aec0b9a6d8898f68f923aaf08b7306d931fd9d76`:

- [core/global.ts:10–43](https://github.com/anomalyco/opencode/blob/aec0b9a6d8898f68f923aaf08b7306d931fd9d76/packages/core/src/global.ts#L10) puts `bin` at `<cache>/bin` and creates it at every start.
- [core/util/which.ts:5–14](https://github.com/anomalyco/opencode/blob/aec0b9a6d8898f68f923aaf08b7306d931fd9d76/packages/core/src/util/which.ts#L5) appends `<cache>/bin` to `PATH` when OpenCode looks up a command. [core/ripgrep/binary.ts:92–120](https://github.com/anomalyco/opencode/blob/aec0b9a6d8898f68f923aaf08b7306d931fd9d76/packages/core/src/ripgrep/binary.ts#L92) runs `rg` from that lookup, else `<cache>/bin/rg`, and otherwise downloads ripgrep there. [lsp/server.ts:366–389](https://github.com/anomalyco/opencode/blob/aec0b9a6d8898f68f923aaf08b7306d931fd9d76/packages/opencode/src/lsp/server.ts#L366) runs `gopls` from that lookup, else installs it into `<cache>/bin`; other language servers in that file install there too.
- [core/models-dev.ts:160–165](https://github.com/anomalyco/opencode/blob/aec0b9a6d8898f68f923aaf08b7306d931fd9d76/packages/core/src/models-dev.ts#L160) names the model catalog `<cache>/models.json`, or `models-<hash>.json` when `OPENCODE_MODELS_URL` names another source. Lines 217–221 load it from disk before the bundled snapshot. Lines 237–253 skip a refresh while the file is younger than 5 minutes; lines 202–215 write a refresh to a temporary file beside it and rename it over the catalog.
- [provider/provider.ts:1316–1330](https://github.com/anomalyco/opencode/blob/aec0b9a6d8898f68f923aaf08b7306d931fd9d76/packages/opencode/src/provider/provider.ts#L1316) takes each model's `api.url` and `api.npm` from its provider's catalog entry. Lines 1810–1813 send requests to `api.url` unless the configuration sets `baseURL`. Lines 1864–1876 import a `file://` `api.npm` value directly, and install any other value into the package store through `Npm.add` before importing it.

Inference from the source, not a run: a file placed in `<cache>/bin` under the name of a command missing from `PATH` runs the next time OpenCode looks that command up. A rewritten catalog sends a provider's key to another host on the first request after OpenCode next loads it, guarded or not, and a rewritten `api.npm` loads code at that provider's first use, with full authority on the next start without the guard.

### Probe

The profile came from the unchanged v1.0.3 launcher (commit `9242c1ad45c895efd63e903e1b27d7bab53620ad`), with a disposable home and one ALLOW entry for a test project. The home sat outside `/private/tmp`, because the profile allows all of `/private/tmp` and would have hidden the result. The probes ran outside any agent sandbox. Each `sandbox-exec` child appended a newline with `/bin/sh`. Code fixtures held only an inert comment and package metadata held `{}`. Each check compared the exit status and the file content.

| Probe beneath the disposable home | Operation | Result |
|---|---|---|
| `.cache/opencode/packages/guard-cache-probe@1.0.0/node_modules/guard-cache-probe/index.js` | Append | Allowed, changed |
| That package's `package.json` | Append | Allowed, changed |
| New entry in `packages/guard-new-probe@1.0.0/node_modules/guard-new-probe/` | Create | Allowed, created |
| `.cache/opencode/node_modules/guard-cache-probe/index.js` | Append | Allowed, changed |
| New entry in legacy `node_modules/guard-new-probe/` | Create | Allowed, created |
| `.config/opencode/plugins/guard-cache-probe.js` | Append | Denied, unchanged |
| `Documents/marker.txt`, outside ALLOW | Create | Denied, absent |
| `Projects/probe/marker.txt`, inside ALLOW | Create | Allowed, created |

Nothing in the real home or the OpenCode Guard install was read or changed.

### Recommendation

Write-protect the effective package store, `bin` and the model catalog, and nothing more:

- the current store, `<cache>/packages/` with its metadata and dependencies (`~/.cache/opencode/packages` by default);
- the legacy store, `~/.cache/opencode/node_modules`, and its install metadata;
- `<cache>/bin` (`~/.cache/opencode/bin` by default);
- the model catalog, `<cache>/models.json` and `<cache>/models-*.json`;
- all of these under a relocated `XDG_CACHE_HOME`. A hard-coded default path does not cover a relocated cache.

Keep the general `~/.cache` grant and place the narrower deny after it. Data, state, logs, temp and the rest of the cache stay writable. Freezing all of `~/.cache`, or all of OpenCode's cache, is not needed to protect these. OpenCode creates a missing `bin` at every start, and a denied create would stop it (inference from `core/global.ts`), so every launch that renders this deny creates it before exec, as `opencode_prepare` creates `~/.config/opencode`: OpenCode's own launches, and from step 10c every launch while OpenCode is installed, so an OpenCode started inside a Pi session finds it. Step 7 confirms these paths for the supported OpenCode versions.

### Cost

- Missing plugin packages and their dependencies cannot be installed from inside the guard. Package maintenance runs in an operator session outside it; step 7 documents how.
- A fully populated store resolves without writing, so installed packages keep working (Test results).
- The same store holds npm language servers. [lsp/server.ts:125](https://github.com/anomalyco/opencode/blob/51ef4be1d3c122f18fefb510dca8d778571f4f18/packages/opencode/src/lsp/server.ts#L125) finds TypeScript's through `Npm.which`, and [core/npm.ts:200–245](https://github.com/anomalyco/opencode/blob/51ef4be1d3c122f18fefb510dca8d778571f4f18/packages/core/src/npm.ts#L200) installs a missing binary. First-use downloads and repairs also need operator maintenance.
- Downloads into `bin` fail inside the guard: ripgrep when no `rg` is on `PATH`, and the language servers OpenCode installs there on first use. They need operator maintenance, like npm language servers; a ripgrep installed with Homebrew avoids its download.
- The catalog refreshes only outside the guard, for example with `opencode models --refresh` run from the real executable in an operator session. From the source, a refresh inside the guard fails at the rename and is logged and ignored, OpenCode keeps the catalog on disk, or its bundled snapshot when there is none, and `opencode models --refresh` still prints "Models cache refreshed" ([cli/cmd/models.ts:28–30](https://github.com/anomalyco/opencode/blob/aec0b9a6d8898f68f923aaf08b7306d931fd9d76/packages/opencode/src/cli/cmd/models.ts#L28)). Step 7 measured this on 1.18.33 and 1.18.34 (Test results).
- OpenCode can report and skip a plugin that failed to install, so "OpenCode started" does not prove the configured plugins loaded. Before step 7 the plugin check (`opencode_check` in `profiles/opencode/hooks.zsh`) looked only for the guard's own status tool; it now also reads OpenCode's plugin errors (As built).

Step 7 is done when configured plugins load, a representative npm language server works, the message for a missing package is clear, OpenCode starts with `bin` missing, replacing or renaming the store, `bin` and the catalog is denied, the catalog's refresh behavior under the deny is tested and documented, and `doctor` checks the configured plugins, not only the status tool.

### As built

Release 0.1.2, zsh engine.

**Cache roots.** `opencode_state_roots` in `profiles/opencode/hooks.zsh`, named by `state_hook` in `harness.zsh`, is OpenCode's first state-root resolver (section 7, Launch pipeline, R6). `engine/launch` runs it after checking that the Guard List is readable and before parsing it; an inherited nested launch does not reach it. The launch's cache root is `XDG_CACHE_HOME`, else `~/.cache`; an empty value counts as unset, as it does for OpenCode (xdg-basedir). A value that is not an existing folder named by its full path refuses the launch. Every launch also protects the default root, `~/.cache`, which every launch can write, so a session started with `XDG_CACHE_HOME` set cannot change the store that a later start without it loads. Both roots are canonicalized (zsh `:A`).

**Rules.** For each root `C`, `engine/launch` renders `cache_protected` and `cache_catalogs` from `harness.zsh` into the final deny block, after `protected_paths` (the `;;@STATE_PROTECTED@` slot in `engine/profile.sb`). They come after the list rules, so an ALLOW entry covering them does not reopen them. Inside home they are written relative to `HOME`; elsewhere as absolute paths. For the default root (`test/fixtures/differences/step-7.json`):

```
  (subpath (h "/.cache/opencode/packages"))
  (subpath (h "/.cache/opencode/node_modules"))
  (subpath (h "/.cache/opencode/package.json"))
  (subpath (h "/.cache/opencode/package-lock.json"))
  (subpath (h "/.cache/opencode/bun.lock"))
  (subpath (h "/.cache/opencode/bin"))
  (subpath (h "/.cache/opencode/models.json"))
  (require-all (subpath (h "/.cache/opencode")) (regex #"/opencode/models-[^/]*\.json$"))
  (literal (h "/.cache/opencode"))
  (literal (h "/.cache"))
```

- The legacy store's install metadata is the set OpenCode itself lists for a dependency folder: `config/config.ts` writes `node_modules`, `package.json`, `package-lock.json` and `bun.lock` into a config folder's `.gitignore`. OpenCode v1.0.0 and v1.2.0 install plugins with `bun add --cwd <cache>` against `<cache>/package.json` (`packages/opencode/src/bun/index.ts`); v1.16.0, v1.18.33 and v1.18.34 use `<cache>/packages` (`packages/core/src/npm.ts`) and load no plugin from the legacy store.
- The catalog regex holds no path, so path characters need no escaping. Scoped by the `subpath`, it matches `models-*.json` directly in `opencode/`, and below it only in folders that are themselves named `opencode`. The refresh's temporary file, `<catalog>.<pid>.<time>.tmp`, stays writable; renaming it over the catalog is denied.
- A protected path that is a link, or passes through one, is also denied at its resolved target. Every folder above a protected path or its target, up to home, and each folder on the way to a root as named, such as a link named by `XDG_CACHE_HOME`, gets a `literal` deny against rename and removal, as the list pins folders above DENY entries (section 4).
- Seatbelt matched these rules case-insensitively on the case-insensitive APFS volume tested: creating `MODELS.JSON`, `Package.json` or `Node_Modules` where none existed was denied.

**`bin`.** The launch creates `<launch root>/opencode/bin` with the `writable` folders, before exec, in every mode. With `bin` missing and write-denied, OpenCode 1.18.33 stops at start with `EPERM: operation not permitted, mkdir '<cache>/opencode/bin'`.

**`doctor`.** `opencode_check` starts `opencode serve --print-logs --log-level ERROR` under the guard and subscribes to its `/global/event` stream before the first request for a folder, which makes OpenCode load the configured plugins. OpenCode 1.18.33 publishes a `session.error` event for a plugin that fails to install, to resolve its entry point, to pass its `engines.opencode` check or to import ("Failed to install plugin …", "Failed to load plugin …", "Plugin … skipped: …", `plugin/index.ts`), and only logs one whose plugin function throws or is not a function ("failed to load plugin"). The check fails and names each; an install failure also points to README's maintenance procedure. It still requires `agent_guard_status`, and fails when the event stream does not open. The installer's checks (`check staged` and the live `doctor`, also in `update`) set `AGENT_GUARD_GATE=1`, which reports these failures and an unopened stream as warnings and passes: other plugins are the user's configuration, and a broken one must not roll back an install or block an update that carries a fix. A missing `agent_guard_status` fails in every mode. No server endpoint lists loaded plugins, so two cases go undetected: a package without a server entry point, which OpenCode skips silently, and plugins named only in a project's config, since the check opens the temp folder. The check also prints a warning, not a failure, when `rg` is neither on `PATH` nor in the launch root's `bin`. Missing npm language servers and `bin` downloads have no check: OpenCode skips them without a message, and which ones a session needs depends on its project.

**Versions.** OpenCode 1.18.33 from npm, as CI installs it, and 1.18.34 from Homebrew ran under the new profile with the store, `bin` and catalog paths above; `models-<hash>.json` is `models-<SHA-1 of the source URL>.json` (`core/util/hash.ts`). `core/src/global.ts`, `npm.ts`, `models-dev.ts`, `ripgrep/binary.ts` and `opencode/src/plugin/index.ts` are byte-identical in the two tags.

### Test results

2026-10-02, on macOS 26 with the zsh engine.

The spike's probe table, rerun against the 0.1.2 profile under the same conditions (Probe, above): the five package-store probes are denied with the files unchanged or absent; the plugin-folder, outside-ALLOW and inside-ALLOW probes are unchanged.

`test/test.sh`, OpenCode 1.18.33:

- At the default root and at an `XDG_CACHE_HOME` root inside ALLOW, named through a link and with `bin` linked into ALLOW: writing, adding, deleting and renaming in the store, the legacy store and its metadata, `bin` and `models-<hash>.json` are denied, and so are planting a link in the store, replacing `bin` with a link, renaming a temporary file over a catalog, renaming the `opencode` folder, the root and the link that names it, writing at `bin`'s link target, and creating `models.json` and the legacy store where none exists. Another file in `opencode/` and a folder elsewhere in the root stay writable. A relocated launch still protects the default root. A relative, a missing and a non-folder `XDG_CACHE_HOME` each refuse the launch, also from the terminal entry point.
- Through the real CLI: an npm plugin placed in the store loads inside the guard and `doctor` passes; with its folder removed, `doctor` fails with "Failed to install plugin guard-probe-plugin@latest: EPERM: operation not permitted, mkdir '<cache>/opencode/packages/…'" and the pointer to the maintenance procedure; a plugin whose init throws is named from the log. An update with both configured passes the installer's checks with a warning for each, and `doctor` on the release it installed fails. With `bin` removed, the launch recreates it and `doctor` passes. With `rg` only in `bin`, `opencode debug rg search` finds a match; with `rg` in neither place, `doctor` warns and names ripgrep.
- The catalog, with a local catalog source (`OPENCODE_MODELS_URL` on 127.0.0.1) and a catalog older than 5 minutes: `opencode models --refresh guardprobe` inside the guard fetches the new catalog, logs `"Failed to fetch models.dev"` with a `FileSystem.rename` failure, prints "Models cache refreshed" and lists the catalog on disk. The catalog's content and modification time are unchanged and no temporary file is left. With no catalog, `opencode models` lists the bundled snapshot and creates no catalog. The same run on 1.18.34 gave the same result.

One-off, outside CI, with the network, OpenCode 1.18.33:

- `opencode plugin opencode-poe-auth --global`, run with the real executable, installed the package into `packages/opencode-poe-auth@latest` and added it to the global config. The guarded `doctor` passed and left the store unchanged; with the package folder removed, it failed and named the package.
- With `"lsp": true` and TypeScript installed in a project, `opencode debug lsp diagnostics a.ts` outside the guard installed `typescript-language-server` into the store. The same command inside the guard returned the type error and left the store unchanged. With the server removed from the store, it returned no diagnostics and no message.
- With no `rg` on `PATH` or in `bin`, `opencode debug rg search` inside the guard failed with "ripgrep execution failed". From the source (`core/ripgrep/binary.ts`), it downloads ripgrep before writing it into `bin`, so the download is attempted and the write is denied.

### Scope and limits

The package store and `bin` are a persistence and code-integrity gap, not a Seatbelt escape. A guarded restart runs the changed code under Seatbelt. A later start without the guard, made on purpose, runs it with that process's full authority. Disabling the inner layer this way was not attempted. A rewritten catalog also redirects keys from guarded starts, because the profile does not restrict network access. The path deny does not give integrity of all loaded code, or credential isolation. A catalog named by `OPENCODE_MODELS_PATH` is read in place of `<cache>/models.json` (`core/models-dev.ts:184`) and is not covered. Pi had the same class of gap in `~/.pi/agent/npm`, closed by pi-sandbox-guard #9.

Observed at step 7 and not addressed: npm configuration in the writable cache steers later installs outside the guard. With `~/.cache/node_modules` and `~/.cache/.npmrc` present, `opencode plugin <name> --global` run outside the guard requested `<name>` from the registry that `.npmrc` names (OpenCode 1.18.33); without `~/.cache/node_modules` it did not. For a package folder that does not exist yet, `@npmcli/config` treats the nearest folder above it holding `node_modules` or `package.json` as the project and reads that folder's `.npmrc`. A guarded session can create both in `~/.cache`; by the same rule, inferred and not run, also in an ALLOW folder above a relocated root. README's maintenance procedure tells the operator to check for them.

From step 10c every launch, whatever its profile, renders these denies at the default and relocated cache roots: they join the protection union as denies inside granted folders (section 3, Every installed harness), because Pi's profile also grants `~/.cache`. pi-sandbox-guard 7ad441f grants it too (`sandbox/pi-sandbox.sb`), so its sessions can rewrite these files. The adopted guard denies them in Pi sessions from 0.2.0 (step 7d; section 11, What changes for Pi sessions, item 4); from step 10c the shared engine renders them in every launch.

### Other code in writable folders

Step 7's principle applies to everything a harness runs, or trusts as configuration, from its writable folders. Each item is write-protected, checked at launch or accepted in writing in this document. Protection comes first wherever the harness tolerates it, because a launch check helps only guarded starts, and an unguarded start is where such a change runs with full authority.

Two gates:

- **Before Pi's migration, at step 10c:** the three step 7 items, rendered in every launch (Scope and limits, above).
- **Before the composition release (section 3, Composition):** the items below. Each is already writable from its own harness's sessions; composition makes it writable from every present member's sessions. Temp, which holds jiti's cache, is already writable in every launch.

| Item | What it does | Source |
|---|---|---|
| `wellknown` entries in OpenCode's `auth.json` | OpenCode fetches remote config from the entry's URL at startup and merges it as global config, including plugins and MCP commands | OpenCode 1.18.34 `packages/opencode/src/config/config.ts` |
| OMP stored keys starting with `!` | Run through `/bin/sh -c` at key lookup | OMP 18.4.9 `packages/coding-agent/src/config/resolve-config-value.ts` |
| OMP's `python-env`, `natives` and `puppeteer` | Code OMP runs: its managed Python, its native add-on, Chromium | OMP 18.4.9 `packages/utils/src/dirs.ts` |
| OMP's `models.db` | Cached endpoint overrides survive loading, so a rewrite can redirect keys; checked at step 10d | OMP 18.4.9 model registry |
| Pi's compiled-extension cache | Whether jiti's file cache in `$TMPDIR` changes what code loads is unverified (section 15, To verify) | Pi 0.99.2 |

Files and folders where an agent can leave instructions that later sessions follow, such as Pi's `~/.pi/agent/prompts` and OMP's `memories`, are a separate open item (section 15, Open decisions).

## 10. Moving from OpenCode Guard

Step 5 built the migration and step 6 runs it on the two existing installs, a home Mac and a work Mac, home Mac first. The rules below bind the installer; "The migration as built" below says how it follows them. Section 6 covers the staged install and update it builds on.

OpenCode Guard v1.0.4 (tag `1ac39a2`, 2026-09-30) is v1.0.3 plus five commits (`2e93cf3`, `13a5aa1`, `14e0e85`, `3fd2703`, `85dc43f`): cc-safety-net 2.4.14, more cc-safety-net wrappers, clearing agent-set cc-safety-net home and worktree variables, and two `check` fixes. Step 3 ports them first, so a Mac on v1.0.4 loses no fix at the switch. They do not change the generated profile, so the v1.0.3 golden fixtures still apply.

### What an OpenCode Guard install contains

Every release from v1.0.0 to v1.0.4 installs to the same places (`install.sh` at each tag). None writes a version stamp, so the installer detects OpenCode Guard by its layout, not its version.

| Part | Location |
|---|---|
| Engine | `~/Library/Application Support/OpenCodeGuard/`: `launch`, `profile.sb`, `uninstall.sh`, `vendor/`, shims `bin/opencode` and `bin/opencode-gui`, `state/rules.json` |
| Permission record | `state/permissions.json` in the engine |
| Launcher app | `~/Applications/OpenCode Guard.app`, bundle ID `ai.opencodeguard.launcher`; it runs `bin/opencode-gui` |
| Plugin | `~/.config/opencode/plugins/opencode-guard.js` |
| cc-safety-net | `~/.cc-safety-net/rules/opencode-guard/`, plus `opencode-guard` in the `rules` of `~/.cc-safety-net/rules/rule.json` (v1.0.2 and later also add `env` to `transparent_wrappers`; v1.0.4 adds `exec`, `nice`, `nohup`, `setsid`, `stdbuf`, `time` and `timeout`) |
| PATH | A block between `# >>> opencode-guard >>>` and `# <<< opencode-guard <<<` in `~/.zprofile`, `~/.zshrc` and, if it exists, `~/.bash_profile`, putting the engine's `bin/` first |
| OpenCode permissions | `edit`, `bash` and `external_directory` set to allow in `~/.config/opencode/config.json`, `opencode.json` and `opencode.jsonc`, where each is a JSON object |
| List | `~/OpenCode Guard/Guard List.txt` and `last-launch.log`; after a failed uninstall restore (v1.0.1 and later), also `permissions-backup.json` |

The permission record maps each config file to `{"orig": …, "wrote": …}` for each of the three keys; `orig` is null when the key was absent. The old uninstaller restores a key only where its current value still equals `wrote`. v1.0.0's uninstaller deletes the engine, and the record with it, even when a restore fails; v1.0.1 (commit `78c0b85`) keeps a copy in `~/OpenCode Guard/permissions-backup.json` instead.

### Rules for the installer

1. **Run outside the guard.** OpenCode Guard write-protects the files the migration changes (shell startup files, `~/.config/opencode`), so a run from inside a guarded session would fail part way. The installer checks with a write probe and refuses before changing anything.
2. **Stage first.** The full release is staged and self-tested inside Agent Guard's engine folder before the switch (section 6). The new plugin stays out of `~/.config/opencode/plugins` until the switch. OpenCode 1.18.33 (commit `51ef4be`) loads `*.js` and `*.ts` from `plugin/` and `plugins/` in each config folder, including dot files and symlinked files. On macOS the match ignores case. `.mjs`, `.cjs` and other names are not loaded, so a temporary name must not end in `.js` or `.ts` in any case; the installer uses `.agent-guard.js.partial`. Each plugin probes and reads its own engine's state folder, which the other guard's profile denies, so under either guard the other plugin would enforce stale or missing rules. Agent Guard's PATH block is not written before the switch either, so OpenCode Guard's launcher never sees Agent Guard's shims.
3. **Import the permission record before any permission write.** The current installer records the value it finds as `orig`, then writes allow. Run over OpenCode Guard, it would record OpenCode Guard's allow values as the originals. So:
   - OpenCode Guard's record is copied into Agent Guard's record first, keeping `orig` and `wrote` for each file and key.
   - A key whose current value no longer equals `wrote` was changed by the user after OpenCode Guard's install. The installer leaves that value as it is and reports it. The current installer would reset it to allow.
   - Keys still equal to `wrote` need no write, because Agent Guard writes the same allow values.
   - Agent Guard's uninstall keeps OpenCode Guard's rule: restore only values still equal to `wrote`, and keep the record as recovery data if a restore fails.
   - A `permissions-backup.json` in `~/OpenCode Guard` means an earlier uninstall failed to restore. The installer reports it and does not merge it.
   - Without a record (for example after v1.0.0's failed uninstall and a reinstall), the originals are lost. The installer says so and does not claim to restore them.
4. **Import the list once.** If `~/Agent Guard/Guard List.txt` does not exist, the installer shows the entries it will copy from `~/OpenCode Guard/Guard List.txt` and writes the new list only after the user confirms. It never overwrites an existing Agent Guard list. The rules are in section 4. After the switch the old list is no longer read.
5. **Validate before switching.** The staged release passes its self-test through Agent Guard's launcher before anything outside the engine folder changes. No OpenCode flag loads a plugin from another folder. `OPENCODE_CONFIG`, `OPENCODE_CONFIG_CONTENT`, `OPENCODE_CONFIG_DIR` and a project `.opencode/plugins` add plugins but keep the global folder. Setting `XDG_CONFIG_HOME` replaces it; `~/.opencode` is still scanned. The staged check runs `opencode serve` with `XDG_CONFIG_HOME` set to a folder inside the staged release whose only plugin links to the staged `plugin.js`. The plugin loads cc-safety-net from the release it resolves into, so the check exercises the staged plugin and vendored code while OpenCode Guard's plugin stays in the global folder. The check runs again after the switch against `~/.config/opencode/plugins`.
6. **Switch.** The installer keeps a copy of every file the switch replaces, then:
   - replaces OpenCode Guard's `bin/opencode` and `bin/opencode-gui` with forwarders (rule 7);
   - removes each old PATH block and writes Agent Guard's block, one startup file at a time, editing a symlinked startup file at its target as the old installer does;
   - swaps the plugin: Agent Guard's plugin link is renamed onto `opencode-guard.js`, then renamed to `agent-guard.js`, so the folder never holds both plugins and never holds neither. Removing `opencode-guard.js` first and then adding Agent Guard's plugin would leave a moment in which an unguarded start has no refusal;
   - installs `~/Applications/Agent Guard.app` with Agent Guard's own bundle ID (`io.github.ebrindley.agentguard`, since step 3) and removes `OpenCode Guard.app`. A Dock item for the old app then fails to open; it cannot start OpenCode unguarded. The installer says to add the new app to the Dock.

   If a startup file has an old start marker without an end marker, the installer stops before the switch and names the file. Deleting that range would remove the rest of the file.
7. **Forwarders at the old command paths.** A terminal opened before the switch keeps OpenCode Guard's `bin/` first on its PATH. Deleting the old shims would send `opencode` there to the next `opencode` on PATH, which is unguarded. The forwarders run Agent Guard's launcher in the same mode (`cli` or `gui`) with the same arguments, through an absolute path written at install: each is a symbolic link to Agent Guard's shim of the same name, `$engine/bin/opencode` or `$engine/bin/opencode-gui`, whose `${0:A:h:h}` resolves through `bin` and `current` to the active release folder, `releases/<id>`, whose `launch` it runs. Every launch write-protects them and their folder explicitly, like the engine folder: the final deny block names `~/Library/Application Support/OpenCodeGuard`, so an ALLOW entry cannot reopen it, and the plugin refuses edits there. That rule is step 5's recorded golden difference (section 8).
8. **The launcher skips every guard shim.** Before step 3, `next_cli` in `engine/launch` skipped only its own shim. With a forwarder and an Agent Guard shim both on PATH, each would find the other and they would call each other forever. Since step 3 it skips any candidate whose resolved path is inside Agent Guard's or OpenCode Guard's `bin/`, and since step 4 anything inside either guard's engine folder, which covers the forwarders and every release's `bin/`. The nested-launch path and the `check` plugin probe also call `next_cli`.
9. **Check, then retire.** After the switch the installer runs `doctor` and launches OpenCode through the new command path and a forwarder. When those pass it retires OpenCode Guard without running its uninstaller. That uninstaller would put back the original permission values Agent Guard relies on, and delete the old engine folder with the forwarders in it; v1.0.0's would also delete the permission record after a failed restore. Retirement removes:
   - the old engine's `launch`, `profile.sb`, `uninstall.sh`, `vendor/` and `state/`, once the imported record is written and read back;
   - `~/.cc-safety-net/rules/opencode-guard/` and `opencode-guard` from `rules` in `rule.json`, leaving `transparent_wrappers` as the old uninstaller does;
   - the copies kept at the switch.
10. **What stays.** `~/OpenCode Guard`, with its list, log and any permission backup, stays after the migration, as OpenCode Guard's own uninstaller keeps it, until step 11's cleanup removes it after the legacy audit has compared it with what was imported (section 12, step 11). The forwarders stay until no shell started before the switch can remain: the installer records the switch time, and the first `update` (or install) after the Mac's boot time passes it removes them. Boot time is `sec` from `/usr/sbin/sysctl -n kern.boottime` (`{ sec = N, usec = M } …`); if the command fails or the output does not parse, the forwarders stay. Uninstall removes them too.
11. **Reruns.** Running the installer again at any point is safe. It resumes an interrupted switch rather than starting over, and never imports a record or list twice.

### The migration as built

`profiles/opencode/install.sh` runs the migration as a transaction of kind `migrate`, with the journal, backups, gate, rollback and recovery of section 6. `$ocg` below is `~/Library/Application Support/OpenCodeGuard`.

**Detection.** OpenCode Guard's parts are its `launch`, its record `$ocg/state/permissions.json`, `opencode-guard.js` when it is not Agent Guard's link, `OpenCode Guard.app`, the `opencode-guard` rulebook folder, `opencode-guard` in `rule.json`'s `rules`, and its PATH block in a startup file. `$ocg/bin` is not a part. The state decides the run:

| State | Found | Run |
|---|---|---|
| migrate | Any part, and no `state/migration.json` (or one whose retirement finished, when OpenCode Guard was installed again) | Migration, below; each action skips parts that are missing |
| retiring | `migration.json` with `retired` false and no open transaction | Retirement first, then an ordinary install or update |
| migrated | `migration.json` with `retired` true, no part | Ordinary install or update |
| remnant | No part, no `migration.json`; `~/OpenCode Guard/Guard List.txt` exists and `~/Agent Guard/Guard List.txt` does not (an uninstall ran, or v1.0.0's failed restore deleted the engine with its record) | Fresh install with the list import. It says that no record exists, so the values OpenCode Guard wrote cannot be restored, and names each OpenCode config. |
| forwarders-only | `$ocg/bin` holds only links to `$engine/bin/*` | Fresh install that records `retired` true and the install time as the switch time, so a later boot removes them |
| none | Nothing | Fresh install |

An open transaction of kind `migrate` is finished by recovery first, as any other. In every state a `~/OpenCode Guard/permissions-backup.json` is reported and never read.

**Preconditions,** before any change: the guard probe of both state folders; OpenCode Guard's record must be an object of per-file entries in which each key has `orig` (an entry without `wrote`, from an interrupted OpenCode Guard install, is imported and reported, and uninstall leaves that key as is); no OpenCode process runs. A server or app started before the switch keeps OpenCode Guard's Seatbelt profile, and each new session it opens rescans the plugin folder and rereads the state file, so after the switch it would enforce Agent Guard's plugin rules under OpenCode Guard's profile, and after retirement a cached OpenCode Guard plugin would find its state folder gone and refuse every tool. The check runs `/usr/bin/pgrep -x` for `opencode`, the app's `CFBundleExecutable` (found from the harness's `app_paths` and bundle ID) and `OpenCode Helper`: status 0 stops and names the process, 1 continues, any other status (3 when processes cannot be listed) stops with a message to run outside any sandbox. It runs again just before the switch, because the list prompt can take minutes, and before recovery finishes or undoes an interrupted switch, which leaves the transaction open while OpenCode runs. An unfinished block of either guard stops the run before the switch.

**Before the switch** (inside the transaction, after P5):

- P6b `list-import`, before P6. When `~/Agent Guard/Guard List.txt` is missing, the installer prints both paths and the old list's ALLOW, READ ONLY and DENY entries, says the old file is no longer read after the switch and asks `Import this list? [y/N]` on the terminal. Yes copies it byte for byte (`cp -p` to a temporary name, then `mv -n`). No, or no terminal, stops with "Nothing changed." An existing Agent Guard list is never changed; if it differs, the installer says the old list was not imported. P6 then makes the template only when no list exists, and `--projects` applies to the imported list.
- P6a `import`, after P6, writing only in `state/`: OpenCode Guard's record is copied byte for byte to `state/opencode-guard-permissions.json`, and each of its entries for a file without an entry in Agent Guard's record is added verbatim. Each key is reported as kept (current value equal to `wrote`, compared as JSON), left as is (changed after OpenCode Guard's install) or without a recorded value; a config with no entry in either record is reported. A discard removes what the import created and restores what it changed. Migrations skip S6: no permission value is written, so undoing a switch needs no permission restore.
- P7 is the staged check of section 6; OpenCode Guard's plugin stays in the global folder and is not loaded by it.

**Switch,** each action journaled with its backup:

| # | Action | What |
|---|---|---|
| M1 | `rulebook` | As S1 |
| M2 | `rulejson` | Adds `agent-guard`; `opencode-guard` stays until retirement |
| M3 | `current` | `current` and `bin` |
| M4a, M4b | `fwd-cli`, `fwd-gui` | `replace_link "$ocg/bin/opencode" "$engine/bin/opencode"`, the same for `opencode-gui` |
| M5a | `plugin-take` | Agent Guard's link under `.agent-guard.js.partial`, renamed onto `opencode-guard.js` (without OpenCode Guard's plugin: S5 instead) |
| M5b | `plugin-name` | `mv -fh opencode-guard.js agent-guard.js` |
| M6 | `rc` | Per file, one `replace_file` that removes both guards' blocks and appends Agent Guard's |
| M7a | `app` | The staged `Agent Guard.app` into place, as S3 |
| M7b | `app-old` | `OpenCode Guard.app` moved into the transaction's backup |
| M8 | `switch-time` | `state/migration.json`: `{"from": "opencode-guard", "switched_at": <now>, "retired": false}` |

The gate is section 6's, plus `forwarders point to Agent Guard` in `doctor` (each forwarder present links to `$engine/bin/<name>`) and a second bounded `opencode --version` through `$ocg/bin/opencode`. The stamp lists the forwarders among its links. On a failure the rollback undoes in reverse: the app back by rename, Agent Guard's app out, the startup files from their backups, `agent-guard.js` renamed back to `opencode-guard.js` and then replaced by its backup with `restore_over_link`, the shims the same way, then `current` and `bin`, `rule.json` and the rulebook, then the imports and the engine. `restore_over_link` copies the backup under a temporary name and renames it over the link, so the link is replaced and nothing is written through it into a release. OpenCode Guard's files are then byte-identical to before.

**Retirement,** after the stamp, journaled in the same transaction; a failure leaves Agent Guard active, `retired` false and the transaction open, exits 1, and the next install, update or uninstall repeats only what is unfinished:

1. R1 `retire-rulejson`: `opencode-guard` leaves `rules`; `transparent_wrappers` stay. A `rule.json` that cannot be read or written keeps the entry and the rulebook, with a warning.
2. R2 `retire-rulebook`: the `opencode-guard` rulebook folder, only after R1.
3. R3a `retire-compare`: `state/opencode-guard-permissions.json` must equal `$ocg/state/permissions.json` (`cmp`), and the imported entries in `state/permissions.json` must equal the copy's (jq `==`).
4. R3b `retire-engine`: `$ocg/launch`, `profile.sb`, `uninstall.sh`, `vendor/` and, last, `state/`. `$ocg/bin` stays. A rerun that finds `state/` gone needs no comparison.
5. R4 `retire-note`: `~/OpenCode Guard/Moved to Agent Guard.txt`, naming the new list.
6. R5: `retired` true; the cleanup then deletes the backup, with OpenCode Guard's app, and closes the transaction.

The migration never runs `$ocg/uninstall.sh`.

**Forwarder removal.** At the end of every successful install or update, and in `agent-guard update` before it downloads anything (so also when the install is current): when `retired` is true and the boot time is later than `switched_at`, each of `$ocg/bin/opencode` and `opencode-gui` that is a link to `$engine/bin/<name>` is removed, then `rmdir` of `$ocg/bin` and `$ocg`, which succeeds only when they are empty; anything else left there is named. The stamp's links are updated. Uninstall (U6) does the same whatever the boot time, after finishing retirement if `retired` is false; an unfinished retirement does not stop the uninstall, which names what it could not retire.

**Tests.** `test/migrate.sh` installs OpenCode Guard v1.0.4, v1.0.3, v1.0.1 and v1.0.0 with each tag's own `install.sh` (`test/fixtures/installs/`) in a disposable home with a user-edited config and covers the cases below. v1.0.2 needs no fixture: its `install.sh` and every file it installs equal v1.0.3's, apart from the list template, which equals v1.0.1's. Each of the four installs migrates, passes the entry-point probe, uninstalls and is installed again. One more case upgrades v1.0.0 in place with v1.0.4's `install.sh`, which keeps v1.0.0's record and list, then migrates it and uninstalls back to the values from before v1.0.0's install. It answers the list prompt on a terminal made by `/usr/bin/expect` (`test/tty.exp`). Test points in the migration actions are counted by a coverage check.

### Recovery testing

Recovery is tested against real installs, each made by that release's own `install.sh` in a disposable home: every failure and kill point against the latest OpenCode Guard release (v1.0.4 today), a rollback at the live doctor, after every switch action, against v1.0.1 and v1.0.0, and a kill during the switch against v1.0.0. It is also tested against the build the two Macs run if that is later. Fixtures cover:

- v1.0.0's failed restore, simulated from a v1.0.4 install by removing its engine folder and every other part, which leaves `~/OpenCode Guard` and the allow values in the configs but no record;
- permissions the user edited after installing OpenCode Guard;
- reruns, including after each interrupted phase;
- a terminal opened before the switch, with the old PATH;
- a startup file with an unfinished old block.

| Failure | Required outcome |
|---|---|
| Before the switch (download, checksum, staging, import, self-test) | OpenCode Guard unchanged and working; its own `launch check` passes. Nothing outside Agent Guard's engine and list folders has changed. |
| During the switch, interrupted after each step | Every entry point (an old terminal, a new terminal, the app) runs OpenCode under a guard or refuses; none starts it unguarded, and none loops. The inner layer may enforce the other guard's rules until a rerun finishes the switch. |
| After the switch, before retirement | Putting back the kept copies returns a working OpenCode Guard. Permission values need no restore, because the switch did not change them. |
| After retirement | Agent Guard's uninstall restores the original permission values from the imported record, keeps the record if a restore fails and keeps `~/Agent Guard` and `~/OpenCode Guard`. |

Every case also checks the permission values, both records and both lists against their expected contents.

## 11. Moving from pi-sandbox-guard

Pi and OMP move in two stages, both planned. **The adoption**, steps 7a to 7d and 7f, for release 0.2.0: Agent Guard installs, updates, checks and uninstalls pi-sandbox-guard's launcher, profile and extension at the paths they use today, with eight recorded differences, and pi-sandbox-guard is retired. **Pi's migration**, step 10d, after `@project` is defined for OpenCode (section 4) and after the Rust launcher (section 7), then moves Pi from the adopted guard onto the shared engine as an update. Elsewhere in this document "Pi's migration" and "the Pi migration" mean step 10d's. The source is pi-sandbox-guard at #10 (commit `7ad441f`). Statements about OMP come from pi-sandbox-guard's code and documents; OMP was not observed for this design and is observed before step 10d (section 15, To verify).

### What pi-sandbox-guard installs

From `scripts/deploy-launchers.sh`, `scripts/deploy-local.sh`, `scripts/bind-executable.sh` and `src/validate-bash-command.sh`:

| Part | Location |
|---|---|
| Protected shims | `~/.local/bin/pi` and `~/.local/bin/omp`, byte-identical copies of `launchers/pi`; the runtime comes from the launcher's own name |
| Profile and preamble | `~/.local/bin/pi-sandbox.sb`, `~/.local/bin/pi-sandbox-preamble.zsh` |
| Launcher stamp | `~/.local/bin/.pi-sandbox-launchers-version`: release ID, commit, profile and preamble hashes, `launcher_names` (the installed set, `pi` and `omp` included), `launcher_names_seen` (every name ever installed there) and `hash_launcher_<name>` for each name in the installed set |
| Custom wrappers | Copies in `~/.local/bin/`, installed with `--extra-launchers <dir>`. Regular files only; `pi` and `omp` are reserved, duplicate names are refused and names must match `[A-Za-z0-9._-]` |
| Launcher backups | `~/.local/bin/<name>.bak.<timestamp>.<pid>`, a copy of each file a deploy replaced with different content |
| Extension (analyzer) | `~/.pi/agent/extensions/pi-sandbox-guard/`: `index.ts`, `src/index.mjs`, `src/guard-core.mjs`, `src/validate-bash-command.sh`, the `.deployed-version` stamp and the `.guard-node` binding |
| Extension backups | `~/.pi/agent/extension-backups/pi-sandbox-guard.bak.<timestamp>.<pid>`, the previous extension folder, moved there by each redeploy |
| Executable bindings | `~/.config/pi-sandbox-guard/executables.conf` (`pi=`, `omp=`, `node=`), written by `npm run bind` |
| Security event log | `~/.pi/agent/security-events.log`, created by the analyzer at its first event (umask 077, mode 0600) |

It has no uninstaller. It writes no shell startup file: `~/.local/bin` must come before the real binaries on PATH, which `scripts/check-path.sh` checks.

### The adopted guard

Planned for steps 7b and 7c, for release 0.2.0. Everything stays where pi-sandbox-guard puts it:

```
~/.local/bin/pi, ~/.local/bin/omp                 byte-identical copies of profiles/pi/launchers/pi; copies, not links,
                                                  because the launcher takes its runtime from its own file name
~/.local/bin/pi-sandbox.sb                        copy of profiles/pi/sandbox/pi-sandbox.sb
~/.local/bin/pi-sandbox-preamble.zsh              copy of profiles/pi/sandbox/pi-sandbox-preamble.zsh
~/.local/bin/<wrapper>                            recorded custom wrappers (Custom wrappers)
~/.pi/agent/extensions/pi-sandbox-guard/          a real folder: index.ts (from profiles/pi/scripts/extension-entry.ts),
                                                  src/index.mjs, src/guard-core.mjs, src/validate-bash-command.sh,
                                                  and .guard-node, the analyzer's Node path (host-specific)
~/.config/pi-sandbox-guard/executables.conf       bindings (pi=, omp=, node=), pi-sandbox-guard's path and format
~/.pi/agent/security-events.log                   the analyzer's log, where it is today, read-denied to sessions
$engine/bin/pi, $engine/bin/omp                   new: links to ~/.local/bin/pi and omp
$engine/state/wrappers.json                       custom wrapper records: names, historical names, hashes
$engine/state/legacy/pi-sandbox-guard/            durable legacy bundle: local-bin/, extension/pi-sandbox-guard/,
                                                  extension-backups/ (The adoption, item 7)
$engine/state/legacy/replaced/                    entries a fresh install replaced in ~/.local/bin, kept as they were (Fresh install)
```

The release carries the source copies under `profiles/pi/`, in pi-sandbox-guard's relative layout (`launchers/`, `sandbox/`, `src/`, `scripts/`, `test/`). Install and update copy them into place as switch actions with backup and undo (section 6), and the stamp records the hashes of the copies. `.guard-node` is host data, checked by `doctor` as a binding rather than against a release hash. pi-sandbox-guard's own stamps, `.pi-sandbox-launchers-version` and `.deployed-version`, are not written; nothing in `launchers/`, `sandbox/` or `src/` reads them. `launchers/pi` takes its runtime and install folder from its resolved path (`${0:A:t}`, `${0:A:h}`), so a start through an `$engine/bin` link runs as `pi` or `omp` from `~/.local/bin`. The links let Agent Guard's PATH block reach the launchers on a Mac where `~/.local/bin` is missing from PATH or comes after the real binaries. From step 7a `state/migration.json` holds one record per migrated source (one object for one source, a list for more) and the stamp has `harnesses` (section 6, Installer structure).

Why this layout: moving the launcher into the release folder would drop a refusal pi-sandbox-guard has today. It refuses a project that contains its own install folder, `~/.local/bin` (`sandbox/pi-sandbox-preamble.zsh`). Moved, a Pi session started with `~/.local/bin` as its project could rewrite `pi`, `omp` or a custom wrapper, which run outside the sandbox at the next use. Keeping the launcher, extension and bindings in place removes this without new code, and also avoids an unverified folder-link discovery, two extension copies loading after an update plus `/reload`, a host-specific file inside a stamped release, and the test seam that hard-codes the bindings path. Cost: these files are outside the engine folder, so the engine folder's rule does not cover them. In Pi sessions pi-sandbox-guard's own rules do: only the extension folder lies in a granted folder, `~/.pi/agent`, and the configuration denies cover `~/.pi/agent/extensions`; a project that is or contains one of these files is refused. In OpenCode sessions the denies in What changes for OpenCode sessions do.

### What changes for Pi sessions

Each difference from 7ad441f is recorded and has a test (Tests):

1. **Agent Guard's files and OpenCode's configuration are write-protected:** the engine folder, `~/Agent Guard` (the Guard List), `~/Applications/Agent Guard.app`, OpenCode Guard's engine folder, `~/.config/opencode`, `~/.opencode`, `~/.cc-safety-net` except its `logs`, `~/Library/LaunchAgents` and the eight shell startup files the base profile names (section 3, Every installed harness), and the resolved targets of any of these that are links, passed to the profile as parameters. Without this, a Pi session started in `~/Agent Guard` could edit the Guard List, and one started in a dotfiles project could edit `~/.zshrc` when that is a link into the project.
2. **Launches from those folders are refused:** a project that is or is inside one of them is refused, as pi-sandbox-guard already refuses `~/.config` and `~/Library`, so a session never starts read-only without explanation.
3. **The base template's exec and Launch Services denies:** `lsopen`, `job-creation` and running `open`, `osascript`, `osacompile`, `codesign`, `diskutil`, `launchctl` and `sudo` are denied, as for OpenCode. This is decision D7, moved forward from step 10d because `open` and `launchctl` can run code outside the sandbox. OMP's browser features are tested under it before 0.2.0.
4. **Step 7's protections:** OpenCode's package stores, `bin` folder and model catalog (section 9) are write-denied under the default cache root and under the one in Pi's environment (`XDG_CACHE_HOME`). Pi grants all of `~/.cache` (`sandbox/pi-sandbox.sb`), so without this a Pi session could undo step 7. As section 9 requires of every launch that renders the `bin` deny, the launch creates a missing `bin` before exec.
5. **Repair messages** say `agent-guard bind` instead of `npm run bind`.

Difference 6 is `agent-guard bind` (Commands). Step 7f adds two:

7. **OpenCode's project config is write-protected in the project:** all of `.opencode`, not only `.opencode/plugins`, `opencode.json`, `opencode.jsonc`, `tui.json`, `tui.jsonc` and `.cc-safety-net`, in the profile's project agent config deny, and the preamble refuses a project inside `.opencode` or `.cc-safety-net`, as it does for the other folder names there. The file names match only the file itself. Seatbelt checks the resolved path, so the preamble's symlinked-config check, which refuses a linked `.pi` or `.omp`, also refuses a launch where one of OpenCode's names in the project or launch folder is a link whose target the session can write, or where `.opencode` or `.cc-safety-net` holds a link to a writable place outside it; a link to a place the session cannot write, such as a dotfiles folder in home, launches. Without this a Pi session could plant an OpenCode plugin or config that a later OpenCode session in the project loads, or a `.cc-safety-net/policy.json` that switches off cc-safety-net's built-in rules there (section 5, Command checker). `~/.cc-safety-net/logs` stays writable, as in difference 1.
8. **The analyzer asks before a push that rewrites or deletes remote refs:** `--force` and its variants, `--mirror`, `--prune`, `--delete`, a short option cluster containing `f` or `d`, and a refspec starting with `+` or `:`. Only Git's global options, such as `-C <dir>`, may come before `push`, and no token crosses a shell separator, which can also end the option, so `git push -f; git status` asks and `git push && ls -d x` does not. A plain push, long options such as `--follow-tags` and a refspec such as `main:main` stay allowed. Seatbelt cannot stop a push, and the baseline threat model puts literal force-pushes under ASK.

Not changed yet: Pi does not read the Guard List until Pi's migration. OpenCode's project config names are protected in Pi sessions inside the project only until Pi's migration, so a folder built in temp and moved into the project keeps them (section 3, Protected paths and names). In OpenCode sessions Pi's guard files and the names `.pi` and `.omp` are protected, and Pi's and OMP's other configuration waits for step 10c. Both are the protection union (section 3, Every installed harness), deferred on purpose and stated in the public claims (Public claims until step 10d).

### What changes for OpenCode sessions

Built at step 7c, zsh engine. Once Pi is installed, OpenCode sessions also write-protect Pi's guard files: `pi`, `omp`, `pi-sandbox.sb`, `pi-sandbox-preamble.zsh`, the recorded wrappers and the folder `pi-sandbox-guard-extension/` in `~/.local/bin`, the extension folder `~/.pi/agent/extensions/pi-sandbox-guard/` and the bindings `~/.config/pi-sandbox-guard/executables.conf`. Without these denies, an `ALLOW ~/.local/bin` entry, which the list accepts (section 4), would let an OpenCode session rewrite the launcher, preamble and wrappers, which run outside the sandbox at the next Pi start. `launchers/pi` loads `pi-sandbox-guard-extension/index.ts` beside itself, with the `.guard-node` there, instead of the installed extension whenever that file exists; the folder is usually absent, and its deny stops a session from creating it, so a later guarded Pi start cannot load planted code in place of the analyzer. From step 7f they also write-deny Pi's and OMP's project config names (below). Installing Pi changes nothing else in OpenCode sessions until step 10c.

- **Installed** has the meaning of section 3, Every installed harness. `engine/launch` reads `harnesses` from `state/txn/plan.json` while a transaction is open, whichever release it installs, else from `state/stamp.json`. A plan or stamp without `harnesses`, from before 0.2.0, and a missing stamp mean OpenCode alone. Unlike `doctor`, the launch does not require the plan to install its own release: the adoption's switch places Pi's files before `current` moves (The adoption, item 5), and a session started meanwhile from an earlier release from 0.2.0 on must protect them. A plan that disappears between the two reads, because its transaction closed, leaves the stamp to read.
- **Wrappers.** With Pi installed, the recorded wrappers are the keys of `wrappers` in `state/wrappers.json`; without Pi the file is not read. A key that does not match `[A-Za-z0-9._-]+`, or is `.` or `..`, is ignored. Historical names are not protected.
- **Unreadable records refuse the launch.** A plan, stamp or wrapper record that exists but cannot be read, does not hold exactly one JSON document (an empty or whitespace-only file holds none), or does not have the shape above (an object, with `harnesses` an array of strings and `wrappers` an object), refuses the launch with a message naming the file, in every mode. Refusing was chosen over rendering Pi's denies regardless: an unreadable wrapper record leaves no names to deny, and section 3 already refuses a launch whose protections cannot be looked up. The installer writes these records inside the write-protected engine folder, so a session cannot cause the refusal; a damaged record stops OpenCode until it is repaired.
- **Rules.** The denies are rendered after step 7's in the final deny block (the `;;@STATE_PROTECTED@` slot in `engine/profile.sb`), so no ALLOW entry reopens them; other files in `~/.local/bin` stay writable under an ALLOW entry. Each path is denied as named with its folder resolved, which keeps a link at that name in place, and at its resolved target (zsh `:A`). Each folder on the way from home, as named, and each folder above each of those and above the target, up to home, gets a `literal` deny against rename and removal, so no link on the way can be moved or removed. With the plain layout and one wrapper, `pi-work` (`test/fixtures/differences/step-7c.json`), these follow step 7's rules:

```
  (subpath (h "/.local/bin/pi"))
  (subpath (h "/.local/bin/omp"))
  (subpath (h "/.local/bin/pi-sandbox.sb"))
  (subpath (h "/.local/bin/pi-sandbox-preamble.zsh"))
  (subpath (h "/.local/bin/pi-sandbox-guard-extension"))
  (subpath (h "/.local/bin/pi-work"))
  (subpath (h "/.pi/agent/extensions/pi-sandbox-guard"))
  (subpath (h "/.config/pi-sandbox-guard/executables.conf"))
```

  and these follow step 7's pins:

```
  (literal (h "/.local/bin"))
  (literal (h "/.local"))
  (literal (h "/.pi/agent/extensions"))
  (literal (h "/.pi/agent"))
  (literal (h "/.pi"))
  (literal (h "/.config/pi-sandbox-guard"))
  (literal (h "/.config"))
```

- The launch log names the paths: `write-protected for Pi, maintained outside the guard: …`.
- **Pi's and OMP's project config names**, from step 7f: `.pi` and `.omp` are write-denied anywhere on disk, creation and rename included, by two `regex` rules after Pi's guard files in the final deny block, so no ALLOW entry reopens them (`test/fixtures/differences/step-7f.json`). Pi loads a trusted project's `.pi`, and OMP loads `.omp` from the project and its parents without asking (`sandbox/pi-sandbox.sb`'s project config comment), so without these an OpenCode session could plant code for the next Pi or OMP start. A link at either name in the launch folder has its target write-denied, as OpenCode's own names do. The names cover `~/.pi` and `~/.omp` too; a root reached through a link, such as `~/.pi/agent` linked into a dotfiles folder, and OMP's other root families (`~/.omp-*`, `~/.omp.*`, `~/.omp_*`) wait for step 10c's root rules. The launch log line is `write-protected anywhere, Pi's and OMP's project config: .pi, .omp`.
- **Limits**, shared with step 7's denies: a link inside the extension folder carries writes to its target, and a protected path that is a link to a missing target is denied at its name only, since `:A` cannot resolve it.
- **Tests.** `test/test.sh`, through the real launch in a disposable home, with ALLOW entries for `~/.local/bin`, `~/.pi` and `~/.config/pi-sandbox-guard`, `omp` a link to a file in ALLOW and `~/.pi/agent` a link to a folder in ALLOW: with Pi in the stamp, writing, renaming, deleting and replacing by a rename or a link are denied for each of the four files, a recorded wrapper, the extension's `index.ts` and the bindings; so are writing `omp`'s target, adding a file to the extension, renaming the extension folder, `extensions`, the folder of `omp`'s target and the target of `~/.pi/agent`, and renaming or deleting the link `~/.pi/agent`. With `pi-sandbox-guard-extension` absent, creating it as a folder, as a link or by moving a folder in is denied; with it present, adding or moving a file into it, replacing it by a rename, renaming it and deleting it are denied. Another file in `~/.local/bin`, a historical wrapper name, another file in `~/.pi/agent` through its link and another file beside the bindings stay writable, and ignored wrapper keys render no rule. With the launch folder holding a `.pi` folder and an `.omp` link to a folder with another name: writing in the `.pi` folder and in the link's target, creating `.omp` in a subfolder and in a parent folder, renaming a folder to `.pi`, creating `.pi` in temp and writing in `~/.pi` are denied, a name that only starts with `.pi` stays writable, and without Pi in the stamp the `.pi` folder and the link's target stay writable. With OpenCode alone in the stamp, or a stamp without `harnesses`, no Pi path gets a rule and a malformed wrapper record is not read. A transaction plan listing Pi gives the same profile as a stamp listing it. A malformed, empty, whitespace-only or two-document plan, stamp or wrapper record refuses the launch, as do two more malformed stamps, a stamp from the terminal entry point and an unreadable wrapper record; an empty `wrappers` object launches with Pi's denies. `test/golden.mjs` renders the profile with Pi installed and one wrapper under `ALLOW ~/.local/bin`, and compares it with v1.0.3's plus the recorded differences, `step-7c.json` and `step-7f.json`.

### The adoption

Planned for step 7c.

**Migration from pi-sandbox-guard**, one transaction of section 6, mirroring section 10:

1. **Detect.** pi-sandbox-guard is present when Agent Guard's stamp does not list Pi and any of these exists: `~/.local/bin/pi` or `omp` containing the string `pi-sandbox-guard`, `~/.local/bin/pi-sandbox.sb` or `pi-sandbox-preamble.zsh`, `~/.pi/agent/extensions/pi-sandbox-guard/`, `~/.config/pi-sandbox-guard/executables.conf`. Its launcher stamp lists the installed wrappers (`launcher_names`), wrappers installed before (`launcher_names_seen`) and the hashes of the installed set. Once the stamp lists Pi, these paths are Agent Guard's, and a file that differs from its stamped hash is drift, which `version` and `doctor` report.
2. **Refuse while Pi or OMP runs.** A session started before the switch keeps 7ad441f's profile, without the differences above, for as long as it runs. A Pi session's process is `node`, not `pi`, so the check matches the argument lists of running processes against each runtime's bound and resolved executable paths, not process names, and against the guard extension's `index.ts` as the argument of `--extension`, which the launcher passes to every agent session, so a session started with another accepted executable (`PI_EXECUTABLE` or `OMP_EXECUTABLE`) is found too, and a pager or editor that has the file open is not. A failure to list processes stops the run with a message to run outside any sandbox, as in section 10. The check runs again just before the switch.
3. **Stage and test.** The Pi files are assembled in the stage, the extension folder with the existing `.guard-node` while that Node is usable; an unusable one is chosen again as on a fresh install (Fresh install) and reported. The recorded bindings are validated as `agent-guard bind` validates them, and a stale one fails the staged check. The profile self-test runs against the staged profile, and the analyzer's preflight with one blocked and one allowed command against the staged extension and its `.guard-node`.
4. **Import the wrapper records** from the launcher stamp into `state/wrappers.json`, as a staged action that a discard undoes: names, historical names and hashes. A recorded wrapper that is gone becomes a historical name. A wrapper whose content no longer matches its recorded hash, and a name of `launcher_names_seen` no longer installed that is still executable, stop the migration before any change, naming each: `doctor` fails both, so the gate would roll the switch back.
5. **Switch.** Each replaced file goes in by rename from the stage, and the file it replaces goes into the transaction backup; a file identical to its staged copy is left in place. The order:
   - on a fresh install that records an entry, `executables.conf` (Fresh install);
   - `pi-sandbox-preamble.zsh`, then `pi-sandbox.sb`. A launch between the two runs the new preamble with 7ad441f's profile: 7ad441f's policy with the new refusals;
   - `pi`, then `omp`;
   - the extension folder: the old folder is renamed into the backup, then the staged folder into place. Between the two renames a guarded start of an agent session refuses, because `launchers/pi` refuses when the extension is missing, and a direct start of the real binary loads no extension;
   - then the switch actions of section 6, whose `current` adds `$engine/bin/pi` and `omp`, so those links never name a missing launcher.

   Each state between two renames is a test point: every entry point runs Pi under at least 7ad441f's protections or refuses; none starts it unguarded, and none loops.
6. **Gate.** Section 6's gate plus `doctor`'s Pi checks (Commands), including `pi --version` and `omp --version` through `$engine/bin`. On failure, the rollback renames pi-sandbox-guard's files back from the backup in reverse order, byte-identical to before.
7. **Retire** after the stamp, journaled in the same transaction, as the OpenCode Guard retirement is: the originals move from the transaction backup into the durable legacy bundle `state/legacy/pi-sandbox-guard/`, which survives transaction cleanup (section 6, Installer structure): `pi`, `omp`, `pi-sandbox.sb` and `pi-sandbox-preamble.zsh` into `local-bin/`, the extension folder with its `.deployed-version` into `extension/pi-sandbox-guard/`. This is the transaction's keep step, before the cleanup deletes the backup; a file the switch left in place because it was identical (7ad441f's `launchers/pi` is Agent Guard's) is copied instead, so the bundle holds all of them. The launcher stamp and what pi-sandbox-guard left beside its files move there too: the stamp and the launcher backups `~/.local/bin/<name>.bak.*`, for the names the stamp lists, into `local-bin/`, and `~/.pi/agent/extension-backups/` to `extension-backups/`; they are then out of reach of Pi sessions. The security event log is not moved: it stays at `~/.pi/agent/security-events.log`, read-denied to sessions. `executables.conf` stays in place as the live bindings. Nothing is deleted; step 11's cleanup removes the bundle after the legacy audit (section 12, step 11). As for OpenCode Guard (section 10, M8 and R5), a `pi-sandbox-guard` record in `state/migration.json` notes the switch and then the retirement.

**Updates** replace the same files with the same renames, as switch actions with backup and undo, and do not refuse while sessions run. A running session keeps its Seatbelt profile and the extension it loaded; `/reload` loads the extension on disk. A `/reload` that falls between the extension folder's two renames finds it missing; what Pi does then is tested. From step 7a, `agent-guard update` and the one-liner finish a pending migration or install a newly found harness even when the installed version is current (section 6, Installer structure). One command migrates a Mac with both old guards: OpenCode Guard first, then pi-sandbox-guard, each in its own transaction.

**Fresh install.** When the installer finds a Pi or OMP CLI and no pi-sandbox-guard, it places the adopted guard. The analyzer's Node is chosen as pi-sandbox-guard's `scripts/deploy-local.sh` chooses it: `process.execPath` of the `node` on PATH, refused when it lies in a folder Pi sessions can write, recorded as its Homebrew `opt` link (pi-sandbox-guard #10). An OMP-only Mac gets one too, because the analyzer runs on Node whatever the runtime. An existing file at `~/.local/bin/pi` or `omp` that is not pi-sandbox-guard's, such as a real Pi from an npm user prefix, is recorded before it is replaced, because the launcher's pinned PATH does not include `~/.local` and would not find it again: before the switch the installer resolves it to its canonical target, validates it as `agent-guard bind` does and, when that runtime has no binding yet, records it, with the interpreter a Node-shebang target needs, in `executables.conf` as a switch action with backup and undo; an existing binding is kept. bind's loop check compares a candidate with the protected shim; here it compares with the staged launcher that will take the entry's place, because before the switch the entry and its target resolve to the same file. The target must survive the switch: an entry that is itself the executable, such as a native OMP binary stored at `~/.local/bin/omp`, would be overwritten, so it is refused before the switch with a message to move the executable out of `~/.local/bin` and bind it there, as pi-sandbox-guard's README already advises. When the entry cannot be resolved and validated, the install stops before the switch and names the `agent-guard bind` command to run. The replaced entry is kept as it was, a symlink as a link with its original target text, not moved, because npm's links are relative and would resolve elsewhere from another folder: in the transaction backup during the switch, then, in the keep step after the stamp, in the durable bundle `state/legacy/replaced/`, which outlives transaction cleanup; an earlier entry there is kept under a time suffix. It is reported, never replaced silently. A rollback puts the entry back and removes what the install created, the folders it made for its files included.

**Uninstall** removes the Pi pieces: `pi`, `omp`, `pi-sandbox.sb` and `pi-sandbox-preamble.zsh` in `~/.local/bin` and the extension folder; `$engine/bin/pi` and `omp` go with the engine folder. The legacy bundle is inside the engine folder that uninstall removes (section 6, Uninstall, U8), so uninstall first copies it to `~/Agent Guard/pi-sandbox-guard-legacy/` (U6; under a time-stamped name when a different copy is already there), as U7 copies the permission record. An entry a fresh install replaced is put back at its path from `state/legacy/replaced/`, a link with its original target text. A `pi` or `omp` that is no longer the guard's launcher is left and named. It does not reinstate pi-sandbox-guard; it prints the steps that would, naming that copy (decision D6). If the copy fails, the engine is kept and uninstall exits 1. After step 11's cleanup there is no bundle to copy, and the printed steps name pi-sandbox-guard's final tag instead. An entry in `state/legacy/replaced/` that is not put back, because its place holds something else or because an earlier install replaced it, would go with the engine folder, so it is first copied to `~/Agent Guard/pi-replaced-<time>/`, links as links, and named (U3); if that copy fails, the engine is kept and uninstall exits 1 too. It leaves `executables.conf`, the security event log and the recorded wrappers, and names the wrappers it leaves. A wrapper then runs whatever `pi` is beside it: an entry put back from `state/legacy/replaced/` runs Pi unguarded, as the real `pi` command does after uninstall; with no `pi` there, the wrapper stops with an error. This matches the OpenCode Guard end state, where uninstall does not reinstate the old guard. A rollback is different: inside the transaction, it puts pi-sandbox-guard's files back from the journal and the backup.

### Commands

Planned for step 7c. pi-sandbox-guard's npm scripts are no longer used:

| pi-sandbox-guard | Agent Guard |
|---|---|
| `npm run setup`, `deploy`, `deploy:all` | the one-liner and `agent-guard update` |
| `deploy:launchers --extra-launchers` (validate, reject reserved and duplicate names, install, hash) | `agent-guard wrapper add\|remove\|list`, with the same validation, recorded in `state/wrappers.json` (Custom wrappers) |
| `npm run bind` | `agent-guard bind`: the same modes (`--show`, `--check`, `--detect`, `--pi`, `--omp`, `--node`) plus `--checker-node`, which records the analyzer's Node in `.guard-node`. It writes `~/.config/pi-sandbox-guard/executables.conf`, the file the launcher reads, and no other; no environment variable selects it. Pi's migration moves the executable bindings to `state/bindings.toml`; `.guard-node` retires with the analyzer (section 3, Executables and launch links). |
| `npm run status`, including `--json`, and `scripts/check-path.sh` | `agent-guard doctor`, including `--json` (below) |
| `npm run preflight` | `doctor` runs the analyzer's preflight |
| `.githooks/pre-push`, `setup-hooks.sh` | CI; retired |

`doctor` checks everything `status` and `check-path.sh` check, comparing the installed files with the stamp's hashes instead of a checkout, and `--json` keeps `status --json`'s fields, such as `runtime_binding`, `pi_binding` and `drift`, with the same meaning. It also runs the profile self-test, the analyzer's preflight and one allowed and one blocked command through the installed extension. It checks that each entry point (`pi`, `omp`, each recorded wrapper) resolves in a login shell to the installed launcher, which also catches an npm update that puts a real `pi` back in `~/.local/bin`; binding and `.guard-node` staleness; wrapper hashes and historical wrapper names that are still executable; and the relocation variables `PI_CODING_AGENT_DIR` and `PI_PACKAGE_DIR`. It runs `pi --version` and `omp --version` from a scratch project in the temp folder, because Pi refuses the home folder as a project. A missing runtime is skipped and named; a stale binding fails. `agent-guard version` reports drift in the Pi files outside the engine folder from the stamp, as it does for the release folder. Pi's migration redoes the Pi parts of `doctor` for the engine's layout.

### Custom wrappers

A wrapper hands off to the `pi` next to it (`PI_SHIM="${0:A:h}/pi"`, then `exec "$PI_SHIM" "$@"`; `launchers/example-custom`). `~/.local/bin/pi` and `omp` keep their paths, as launcher copies from 0.2.0 and as entry links from step 10d, so each wrapper keeps its path and its arguments pass through unchanged, and terminals opened before either switch reach the new entry points without forwarders. The entry points and the recorded wrappers are launch links (section 3, Executables and launch links).

From step 7c, `agent-guard wrapper add|remove|list` replaces `deploy:launchers --extra-launchers`, with pi-sandbox-guard's checks before anything is installed: a regular file, not a link; a name that matches `[A-Za-z0-9._-]`, is not a duplicate and is not reserved, where `opencode`, `opencode-gui` and `agent-guard` are reserved besides `pi` and `omp`; and `scripts/check-launchers.mjs --sources`, which checks that the wrapper uses `#!/bin/zsh -f`, hands off to the `pi` next to it and calls only permitted helpers before the sandbox. It installs a copy in `~/.local/bin`, next to `pi`, keeps a backup of a wrapper it replaces, and records names, historical names and hashes in `state/wrappers.json`. `remove` deletes a wrapper whose content still matches its recorded hash and keeps its name as historical; a changed wrapper is reported and left. `doctor` checks each recorded hash and reports a historical name that is still executable, as `scripts/status.sh` does with `launcher_names_seen`.

`check-launchers.mjs --deployed` is not used: it requires pi-sandbox-guard's own deployed text (for example `PI_SANDBOX=1` and the profile path in `~/.local/bin`) and its profile and preamble, which the recorded differences and, from step 10d, the entry links change. `doctor` checks the installed files against the stamp instead, and from step 10d the conformance suite (section 8) checks the launch behavior of the entry points, directly and through each recorded wrapper.

### Tests

Planned for steps 7b and 7c:

- **pi-sandbox-guard's suites** (`test/shim.mjs`, `test/adapter.mjs`, `test/degraded.mjs`, `test/corpus.mjs`, `test/smoke.mjs`, `scripts/test-sandbox-profile.sh`) run in CI against Agent Guard's copies, changed only where a recorded difference changes what they assert; `test/e2e-demo.mjs` stays a manual check. `scripts/test-ops.sh` retires: it tests the npm deploy, status and bind scripts that Agent Guard replaces, and its cases move into the installer tests.
- **A file comparison** against 7ad441f that allows only the recorded changes.
- **One case per difference**, including a Pi session whose project is `~/Agent Guard` being refused and a linked `~/.zshrc` whose target is in the project being write-denied; and, for OpenCode, a session with Pi installed that cannot write Pi's guard files, even under an ALLOW entry.
- **A Pi migration test** like `test/migrate.sh`: a real 7ad441f install in a disposable home, failures and kills at every switch point, reruns, uninstall, wrappers, and both old guards on one Mac.
- **Command tests** for `bind`, `wrapper` and `doctor --json` in a disposable home.
- **Nesting**, each route as it behaves on the zsh engine: Pi inside OpenCode refuses; inside Pi, `opencode` on Pi's fixed PATH runs the real OpenCode under Pi's sandbox, as today, and `$engine/bin/opencode` by full path fails at its state write (section 2, State); Pi inside Pi exits when `.guard-node` exists, an existing pi-sandbox-guard defect that fails closed and is fixed at step 10d (Defects not carried over).
- **On the owner's Mac** (step 7d): real Pi and OMP sessions pass launch, a blocked and an asked command, `/reload` and an update while a session runs; OMP's browser features are tested under difference 3.

### Public claims until step 10d

README and SECURITY.md (step 7d) describe Pi's guard as pi-sandbox-guard's policy plus the seven session differences above, and say what it does not do until step 10d: it does not read the Guard List; it has no refusal when Pi is started outside the guard (a direct start runs the analyzer only, and `pi -ne` removes it); it checks `bash` only, not file tools; its launcher trusts its own folder in `~/.local/bin` rather than a release folder; OMP's runtime folders were observed on OMP 17.2.10. SECURITY.md's vulnerability definition is stated per harness.

### Defects kept until step 10d

The launcher, preamble and extension are reused unchanged apart from the recorded differences, so these defects from Defects not carried over (below) stay until step 10d: the agent-session re-entry that exits under `set -u` when `.guard-node` exists (it fails closed); home passed to Seatbelt uncanonicalized; `DEVELOPER_DIR` not cleared before Git probes; the unreachable `PI_SANDBOX=0` and non-transparent branches; no analyzer injection for `--help` and `--list-models`; `PI_PACKAGE_DIR` reported, now by `doctor`, but not refused. The adoption removes the others: the writable extension backups, which move into the legacy bundle, and the defects of the npm scripts Agent Guard replaces (bind's configuration selector, the post-install lint, `test-ops.sh` in no gate).

### Installed layout additions

At step 10d, relative to the adopted guard. The repository layout is in section 7, Structure.

```
$engine/bin/{opencode,opencode-gui,pi,omp,agent-guard}    shims; each passes its own entry name; pi and omp replace the links to ~/.local/bin
$engine/state/bindings.toml                               recorded harness executables and harness interpreters; replaces executables.conf
$engine/state/roots.json                                  canonical Pi and OMP state roots seen at launch (section 3, Every installed harness)
$engine/state/launch/<profile>-<launch-id>.json           per-launch snapshot (step 9; section 7, Per-launch snapshot)
~/.local/bin/pi, ~/.local/bin/omp                         links to $engine/bin/pi and omp, replacing the launcher copies
~/.pi/agent/extensions/agent-guard.ts                     link to $engine/current/plugin/pi-entry.ts, replacing the extension folder
```

`pi-sandbox.sb` and `pi-sandbox-preamble.zsh` leave `~/.local/bin`. `state/wrappers.json` stays as the adoption left it, and so does the legacy bundle where step 11's cleanup has not removed it.

### The Pi migration

Step 10d, an update in a transaction of section 6. Because the adopted guard keeps pi-sandbox-guard's layout, the same migration also runs from a pi-sandbox-guard install that was never adopted; that case adds the adoption's refusal while Pi or OMP runs, its wrapper import and its legacy bundle (The adoption).

1. **Detect.** The stamp lists Pi in the adopted layout, or pi-sandbox-guard is present (The adoption, item 1).
2. **Stage.** Build the release with the Pi profile; validate the bindings in `executables.conf` and the wrapper records; run `check staged` for the Pi profile.
3. **Confirm policy.** The installer shows what the shared list means for Pi and asks, whether or not the list needs an edit: with `ALLOW ~/Projects`, Pi gains write access to every project there, not only the one it starts in (decision D1). When no ALLOW entry covers Pi's projects, it proposes `@project`. It writes nothing until the user confirms.
4. **Convert** the bindings in `executables.conf` into `state/bindings.toml`, through the validation of section 3, Executables and launch links. `.guard-node` is not converted; it goes with the extension folder (item 5).
5. **Switch,** journaled, in this order: `current` first, which makes `$engine/bin/pi` and `omp` the engine's shims, so `~/.local/bin/pi` and `$engine/bin/pi` never link to each other; the discovery link, placed under a name Pi does not load, then renamed to `agent-guard.ts`; `~/.local/bin/pi` and `omp` replaced with links to `$engine/bin/pi` and `omp` through `replace_link`; the extension folder, with the analyzer and `.guard-node`, `pi-sandbox.sb` and `pi-sandbox-preamble.zsh` moved into the transaction backup. The analyzer's log stays at `~/.pi/agent/security-events.log` (section 3, Event log). Between placing the discovery link and moving the extension folder, a Pi started elsewhere may load both extensions; the window is three renames.
6. **Gate.** `doctor` for both profiles. On failure, roll back from the journal and the backup.
7. **After the stamp**, `~/.config/pi-sandbox-guard/` is removed, journaled in the same transaction, once the conversion's bindings pass `doctor`; Agent Guard does not read it after the conversion. Step 11 comes before this step, so the file is a live binding until here, not a leftover. A legacy bundle that step 11's cleanup has not yet removed, such as one from a pi-sandbox-guard install migrated straight to this release, stays until that Mac's audit and cleanup.

Sessions started before the update keep the adopted guard's Seatbelt profile; after `/reload` they load the new plugin through the discovery link and meet its refusals until they are restarted.

A rollback, inside the transaction, puts the adopted guard's files back from the journal and the backup. Uninstall after Pi's migration removes Agent Guard's Pi pieces: the `~/.local/bin` links, the discovery link, and the bindings with the engine folder. It copies the legacy bundle where one remains and prints the steps to reinstate pi-sandbox-guard, as from 0.2.0 (The adoption, Uninstall; decision D6).

### Unguarded refusal is a behavior change

Until step 10d the Pi extension, pi-sandbox-guard's and then the adopted copy, only warns when the `PI_SANDBOX_PROFILE_DIGEST` environment marker is missing (`FILTER-ONLY: could not verify launch through the protected Pi/OMP Seatbelt shim`, `src/index.mjs`). It never blocks, and filter-only use (the extension deployed without the launchers, or installed as a Pi package) is a documented mode. The marker is ambient, so a project can set it and silence the warning.

From step 10d the Pi plugin uses the behavioral probe (section 5, Plugin core and adapters). Unguarded, it refuses every tool except the Pi adapter's safe set, defined at step 10d, with a message to relaunch through the guard. Filter-only use ends: running the real Pi or OMP binary directly, or any launcher that skips the entry points, gets refusals. On such a direct start only the discovered copy (`~/.pi/agent/extensions/agent-guard.ts`) loads, and `pi -ne` or a settings entry removes it; a guarded start is unaffected, because the launcher injects the plugin with `-e`, which neither can disable. Release notes and the Pi migration message state this as a behavior change. An agent session started outside the guard on purpose needs `AGENT_GUARD_BYPASS=1` (step 3).

### Analyzer

pi-sandbox-guard's analyzer (`src/guard-core.mjs`, `src/validate-bash-command.sh`) stays Pi's checker on the adopted guard and retires at step 10d, when Pi and OMP move to cc-safety-net (section 5, Command checker; decision D5). The input rules of `src/index.mjs` move into the Pi adapter. Its corpus stays as step 7e's characterization fixture, and Pi's release notes list the asks lost and the blocks gained from step 7e's results.

### Policy at the switch

Pi's credential protection does not depend on a list edit: the credential set applies to every profile, whatever the list holds (section 3, Credentials). The only list change the migration proposes is `@project`, when no ALLOW entry covers Pi's projects, and it asks even when no edit is needed, because the existing ALLOW entries already widen what Pi can write (The Pi migration, item 3; decision D1).

For OpenCode:

- **Credentials.** Nothing changes at Pi's migration. Until OpenCode's credentials release (OpenCode's releases, below), the engine leaves the credential set off for OpenCode and only the list's DENY entries apply, as built, so Git over SSH, `gh` and npm's user config keep working inside OpenCode's guard.
- **The protection union.** From step 10c, on a Mac with Pi installed, OpenCode launches also write-deny Pi's and OMP's protected names and configuration, and render Pi's and OMP's denies inside granted folders, even under an ALLOW entry (compatibility matrix below); from 0.2.0 they already write-deny Pi's guard files (What changes for OpenCode sessions) and the `.pi` and `.omp` names (step 7f). This is intended: otherwise an OpenCode session could change Pi's plugin or configuration, or code that Pi and OMP run from their writable folders (section 3, Every installed harness; section 9).

### Mapping of every pi-sandbox-guard function

Where each behavior of the adopted guard, pi-sandbox-guard 7ad441f with the eight recorded differences, lives from step 10d. E: engine. D: Pi profile data. H: Pi Rust hook. A: Pi adapter. C: plugin core. K: the command checker, cc-safety-net with Agent Guard's rules (section 5, Command checker). I: installer or `agent-guard`. R: retired. Stages R1 to R9, N1 and C1 to C4 are in section 7, Launch pipeline. Rows marked I are Agent Guard's from step 7c, at the adopted paths; step 10d changes them only where The Pi migration converts a file.

| pi-sandbox-guard behavior | Home |
|---|---|
| `zsh -f`, `set -euo pipefail`, readonly install paths, ambient profile and preamble paths ignored | E (single binary; release from its own location, built) |
| Runtime from the launcher's basename | E R2, D `[runtime.<name>]` |
| `PI_EXECUTABLE_KEY` must match the runtime | R: the entry selects the runtime |
| Command classification with option precedence; administrative commands | H R5, D runtime tables (section 5, Plugin injection by command) |
| OMP `cleanse`, `commit`, `join` refused | D runtime tables |
| `--extension` injection and lookup | H C3; one path, the launch release; sibling seam R |
| `.guard-node` validation | R with the analyzer: cc-safety-net runs in the harness process |
| Override variables before bindings, trusted prefixes, PATH auto-resolution, shim and marker skips, write-root checks, recheck after project and temp | E (section 3, Executables and launch links) |
| Node prepended for Node-shebang targets; stale interpreter refused | E harness interpreter (section 3, Executables and launch links) |
| Homebrew `opt` links for Node | E (section 3, Executables and launch links), I `bind` |
| `bind` modes and detection layouts | I `agent-guard bind` |
| Absolute tool paths; git selector scrub and `XDG_CONFIG_HOME` pin for probes; `PERL*` | E R3 |
| Git selectors removed from the agent's environment | E with Git hooks, every profile (section 3, Git hooks) |
| PATH reset with a trusted Node folder | D `path` |
| Login and home from the system; spaces kept; bad records refused | E R1 (built), plus canonical home |
| `ulimit` core 0, 2 GB file size, `PI_RLIMIT_CPU` | D `rlimits` |
| `NPM_CONFIG_USERCONFIG=/dev/null` | E credential entry for `~/.npmrc` (section 3, Credentials) |
| `SSH_AUTH_SOCK`, `GPG_AGENT_INFO` unset | E credential entries for `~/.ssh` and `~/.gnupg` (section 3, Credentials) |
| TMPDIR validation and parameter | R (section 8); temp from `getconf` (built) |
| Confinement probe | E (built) |
| Re-entry: digest, markers, behavioral probes, cross-runtime refusal, unknown sandbox refusal | E (section 7, N1 and Nested launch; section 3, Composition) |
| Project from `PI_PROJECT`, git top level, cwd; canonicalized | E R7, D `start_folder` |
| Project refusals | E R7 (section 4) |
| Symlinked `.pi`/`.omp` refusal | E C1, D `on_link = "refuse"` |
| Startup banner | E log and stderr line |
| `PI_CODING_AGENT_DIR` rules, including nested relocations; `PI_CONFIG_DIR` shape; XDG-split OMP refused; `OMP_PROFILE`, `PI_PROFILE`; `--profile` only first; agent-dir consistency; base, state and agent roots distinct | H R6 and R5; for OMP, the `.env` check extends the relocation refusal to variables set in OMP's two `.env` files (section 3, Credentials) |
| Status drift on `PI_CODING_AGENT_DIR`, `PI_PACKAGE_DIR` | D `refuse_env = ["PI_PACKAGE_DIR"]`; `doctor` reports relocation |
| Active hooks resolution, refusals, denies, exceptions; `.git/config` residual | E R8 (section 3, Git hooks) |
| `(allow default)`, deny writes, last match wins | E (built) |
| Write allows: project, temp, Pi state, OMP allowlist, caches, devices | E (`@project`, temp, devices built), D `writable`, `state_grants` |
| Project agent-config denies | D `protected_names`, matched everywhere |
| Pi #9 and OMP config denies, default, relocated and linked roots | E root levels (section 3, Every installed harness), D `state_config` |
| Credential write and read denies; `.env` anywhere | E credential set (section 3, Credentials) |
| SBPL parameters | E (section 3, SBPL parameters) |
| Profile digest; boundary markers; FILTER-ONLY warning | R; snapshot (section 7, Per-launch snapshot), probes (section 7, Nested launch), unguarded refusal (C) |
| Security event log: path, umask 077, mode 0600, full command, read-denied | R with the analyzer; cc-safety-net's audit log in `~/.cc-safety-net/logs` (section 3, Event log) |
| Deploy staging, hash checks, backups, rollback, stamp, release ID | I (built transaction, action registry; section 6) |
| Extra launchers: validation, reserved and duplicate names, hashes, `launcher_names_seen` | I `agent-guard wrapper`, `state/wrappers.json`, `doctor` |
| `status` drift and `--json` | I `doctor --json` |
| `check-path` | I `doctor` |
| Checker `--sources` | I `agent-guard wrapper` (Custom wrappers) |
| pre-push and setup-hooks | R; CI |
| `tool_call` on `bash` only | A, all tools; C decisions |
| Registration on every fresh API; per-event dedup of the same source; independent verdicts for different copies | C (section 5, Plugin core and adapters) |
| Malformed payload blocks; whitespace-only command allowed before health checks | A |
| Empty or oversized command blocks inside the core | A input rules, then K |
| Candidate working folders, worst verdict | A |
| `POLICY_RM_SAFE_ROOTS`; dropped disarm variables | R with the analyzer; deletes follow section 5, Recursive deletes, and C clears cc-safety-net's variables |
| Ask through `ctx.ui.confirm`; decline, error or no UI blocks | C verdict, A mapping; asks come from the ask list (K) |
| Preflight, degraded mode | K health: a degraded cc-safety-net policy or a missing rulebook blocks, reported by `doctor` |
| Error and unknown verdicts block | C |
| Subprocess environment, timeouts, process-group kill, output caps, size cap, normalization probes, exit-code verdicts | R with the analyzer: cc-safety-net runs in-process |
| Analyzer rule families and their root lists | K; step 7e gives each difference from cc-safety-net a disposition |
| Manual demo `test/e2e-demo.mjs` | step 10d manual check (section 8) |
| Difference 1: Agent Guard's files, OpenCode's configuration, `~/Library/LaunchAgents` and the startup files write-denied, with their link targets | E final deny block (built) and the protection union (section 3, Every installed harness) |
| Difference 2: projects in those folders refused | E R7, which gains these folders |
| Difference 3: exec and Launch Services denies | E rule 5 (built; section 3, Rule order) |
| Difference 4: step 7's denies under both cache roots | E protection union, denies inside granted folders (section 3, Every installed harness) |
| Difference 5: `agent-guard bind` in repair messages | E stale-binding refusal (section 3, Executables and launch links) |
| Difference 6: `bind-executable.sh` run as `agent-guard bind`, with `--checker-node` | I `agent-guard bind`, writing `state/bindings.toml`; `--checker-node` R with the analyzer |
| Difference 7: OpenCode's project config write-denied in the project; a project inside `.opencode` or `.cc-safety-net` refused | E protection union (section 3, Every installed harness); the refusal E R7, which gains these folders |
| Difference 8: the analyzer asks before a push that rewrites or deletes remote refs | K: force-pushes blocked (section 5, Command checker); step 7e gives each other form a disposition |

### Defects not carried over

Rows marked "the adoption" are removed at 0.2.0; the others stay until step 10d (Defects kept until step 10d).

| Defect (pi-sandbox-guard 7ad441f) | Removed by |
|---|---|
| Agent-session re-entry with a `.guard-node` binding exits under `set -u` (fails closed): the preamble returns before setting `HOME_CANON`, `PROJECT` and `TMPDIR_CANON`, which the shim then reads | section 7, Nested launch; inherited launches skip the compile stages |
| `~/.pi/agent/extension-backups` is writable inside a Pi launch (it lies under the Pi state root) | the adoption: existing backups move into the legacy bundle, and Agent Guard keeps its own in the engine folder |
| Home passed to Seatbelt uncanonicalized; read denies miss under a linked home (inference) | section 7, R1 |
| `DEVELOPER_DIR` not cleared before `/usr/bin/git` probes (inference) | section 7, R3 |
| `PI_SANDBOX=0` and non-transparent branches unreachable | not reimplemented |
| bind can record a config the shim never reads (`PI_SANDBOX_CONFIG_DIR`) | the adoption: `agent-guard bind` writes only the file the launcher reads; from step 10d one bindings file, no environment selector |
| Post-install lint reads the previous stamp (`deploy-launchers.sh` runs it before writing the new one) | the adoption: not reimplemented |
| `test-ops.sh` runs in no gate | the adoption: installer and migration tests in CI (section 8) |
| The analyzer is not injected for `--help` and `--list-models`, so `-ne` or settings can remove it there | section 5, Plugin injection by command |
| `PI_PACKAGE_DIR` can move Pi's configuration past the name rules (Pi 0.99.2 takes its config folder name from the `package.json` there); only `status` reports it | refused at launch |

### Compatibility matrix

Differences between the adopted guard (from 0.2.0) and the shared engine, per harness and operation. The differences from pi-sandbox-guard that 0.2.0 already makes are in What changes for Pi sessions and What changes for OpenCode sessions. Everything not listed is unchanged.

**Pi and OMP**

| Operation | Adopted guard | From step 10d |
|---|---|---|
| Direct start of the real binary | runs; FILTER-ONLY warning | tools refused after the probe; filter-only use ends. `pi -ne` or a settings entry removes the discovered copy on a direct start; a guarded start is unaffected |
| File tools (`read`, `edit`, `write`, `grep`, `find`, `ls`) | not checked in-process | checked against the projection: refusals with a message where Seatbelt already denies, plus reads under DENY; cc-safety-net's secret-path checks |
| Shell commands | pi-sandbox-guard's analyzer, `bash` only; asks before `git reset --hard`, `git clean`, `find -delete`, interpreter one-liners, `core.hooksPath` changes and others; it also asks before force-pushes in their common spellings (step 7f); Git discards and secret reads allowed | cc-safety-net for `bash` and `powershell`, then Agent Guard's rules (section 5, Command checker): force-pushes, Git discards and secret reads blocked; asks only for the ask list, which starts with `core.hooksPath`; the analyzer's other asks become blocks or allows, as step 7e records |
| Recursive deletes | the analyzer's rules | the policy every harness uses (section 5, Recursive deletes) |
| The Guard List | not read; writes only to the project, temp, state and caches | read: every ALLOW entry adds writes (decision D1), and DENY and READ ONLY entries apply |
| Writes to OpenCode's protected names (`.opencode`, `opencode.json`, `opencode.jsonc`, `tui.json`, `tui.jsonc`) | denied inside the project only, with `.cc-safety-net` (step 7f) | denied: the protection union (section 3, Every installed harness) |
| Device and cache grants | Pi's set | the base template's set (adds `/dev/ptmx`, `/dev/dtracehelper`, all of `/dev/fd`, `DARWIN_CACHE`). Pi's `/dev/stdout` and `/dev/stderr` literals stay in the Pi profile unless a conformance case shows the base set already covers them (section 15, To verify) |
| `PI_PACKAGE_DIR` set | runs; `doctor` reports it | launch refused |
| Command log | the analyzer's `~/.pi/agent/security-events.log` | cc-safety-net's audit log in `~/.cc-safety-net/logs`, as for OpenCode; the analyzer's log is left in place |
| Bindings | `~/.config/pi-sandbox-guard/executables.conf` and `.guard-node`, written by `agent-guard bind` | `state/bindings.toml` in the engine folder, written by `agent-guard bind`; `.guard-node` retires with the analyzer |
| Inference credentials: `~/.aws/credentials`, `~/.aws/config`, `~/.config/gcloud` | read- and write-denied | readable; the AWS token caches (`~/.aws/sso/cache`, `~/.aws/login/cache`, `~/.aws/cli/cache`) writable; configuration stays write-denied. A loosening, needed for Bedrock and Vertex (section 3, Credentials) |
| `.env` and `.env.*` files | unreadable anywhere | unreadable, apart from `.env.example`, `.env.sample` and `.env.template`, and OMP's own two `.env` files, which are readable and checked at launch (section 3, Credentials) |
| OMP keys in `~/.env` or a project `.env` | not loaded; OMP skips an unreadable file without a message | unchanged: still not loaded, without a message; the release notes say so (section 3, Credentials) |
| Pi OAuth login refresh | fails at the first refresh inside a session: `auth.json` is write-denied | unchanged; a known limitation (section 3, Credentials) |
| Writes to other harnesses' runtime data | only the launched runtime's state and the shared caches | from the composition release, the runtime data of each runtime listed under NESTED, apart from its logins and instruction files, such as OpenCode's `~/.local/share/opencode` without `auth.json`; OMP's `agent.db`, logins included, when `omp` is listed; configuration stays write-denied (section 3, Composition) |
| Re-entry of the same runtime, such as Pi inside Pi | exits when `.guard-node` exists, which every adopted install has (Defects not carried over) | runs under the enclosing policy when the conditions of section 7, Nested launch, hold |
| Nested launch of another runtime: Pi or OMP inside OpenCode, Pi inside OMP or the reverse | Pi refuses a foreign enclosing sandbox and a cross-runtime re-entry | refused until the composition release (OpenCode's releases, below). From it, a runtime listed under NESTED runs when its project, state folders, OMP profile and hooks folder match the session's (section 7, Nested launch); an unlisted one is refused with a message naming the heading. OpenCode inside a Pi or OMP session also waits for OpenCode's nested-launch release |

**OpenCode**, on a Mac with Pi installed

| Operation | Adopted guard | From step 10c |
|---|---|---|
| Writes to `.pi`, `.omp` and the cross-harness extension folders anywhere; to Pi and OMP configuration under any root | allowed where an ALLOW entry covers them, except Pi's guard files (What changes for OpenCode sessions) and the names `.pi` and `.omp` (step 7f) | denied: an intended installation-time policy change (section 3, Every installed harness); step 10c writes the Pi profile data the protection union needs |
| Writes covered by Pi's and OMP's denies inside granted folders (section 9) | allowed where OpenCode's grants or an ALLOW entry cover them | denied, rendered in every launch (section 3, Every installed harness) |
| Nested launch under OpenCode Guard (`OPENCODE_SANDBOXED=1`), or under an Agent Guard session started before step 9 | runs directly | unchanged until step 11 for `OPENCODE_SANDBOXED=1` and until the release after step 9 reaches every Mac for the other (section 7, Nested launch) |
| Everything else | | unchanged at Pi's migration; then changed by OpenCode's releases (below). Only moving the cc-safety-net audit log out of `~/.cc-safety-net/logs` and read-denying it stays an opt-in (section 3, Event log) |

### OpenCode's releases

Step 10e. Releases 1 to 3 need step 10c, and the hooks release also step 10a, so they can ship alongside Pi's migration (step 10d); releases 4 and 5 come after it. One change per release, in this order; until its release, OpenCode keeps the built behavior for that change. The items under each release are its release notes: what users see.

1. **The executable release.** OpenCode's executable is chosen by the selection procedure every profile uses, with the writable-set check (section 3, Executables and launch links). It comes first because composition checks every member's executable against the combined writable set (section 3, Composition).
   - A launch refuses, naming the path, when OpenCode's executable or a launch link to it lies inside the writable set, for example under an ALLOW entry such as `/opt/homebrew`.
   - A stale binding refuses with the `agent-guard bind` command that fixes it.
2. **The credentials release.** The credential set applies to OpenCode (section 3, Credentials).
   - Git over SSH, HTTPS pushes that use `gh` as the credential helper, GPG signing, Docker and Kubernetes logins, `gh` itself and all of npm's user config (registries, proxies, the CA file) stop working inside sessions.
   - `.env` and `.env.*` files cannot be read, apart from `.env.example`, `.env.sample` and `.env.template`.
   - Cloud command-line tools keep working, and AWS token refreshes are saved.
   - A `{file:...}` key file under `~/.secrets` is readable only when OpenCode's config in `~/.config/opencode` names it. Any config OpenCode loads that names a denied file, a project config for example, stops OpenCode at startup with a config error.
   - For Vertex models served through the OpenAI-compatible SDK, when the credential file names no `project_id`, setting `GOOGLE_CLOUD_PROJECT` stops OpenCode's Google library from running `gcloud` on each request to find the project.
3. **The hooks release.** Git hooks protection and the Git selector removals apply to OpenCode, and OpenCode refuses the ask list's `core.hooksPath` entry (section 3, Git hooks). It needs the app's project folder from step 10a, which R8 uses in `gui` mode (section 7, Launch pipeline).
   - Hook managers (husky, lefthook, pre-commit) cannot install hooks inside a session.
   - A versioned hooks folder set as `core.hooksPath` cannot be edited from a session.
   - A hooks path that is the home folder, too broad, or contains the project refuses the launch.
   - Only the launched project's hooks are protected.
   - A `GIT_CONFIG_GLOBAL` or other Git selector variable set before the launch does not reach the session.
   - A command that changes `core.hooksPath` is refused, never asked: OpenCode's plugin can only refuse.
4. **The composition release**, for every launch, Pi's and OpenCode's: the Guard List's NESTED heading, member grants, member snapshots and a launch canary (section 3, Composition; section 7, Per-launch snapshot and Nested launch). It needs Pi's migration and the items section 9 lists for before composition (section 9, Other code in writable folders).
   - Nothing changes until a runtime is listed under NESTED. A nested launch of an unlisted runtime is refused with a message naming the heading.
   - Pi and OMP, when listed, run inside an OpenCode session or inside each other's when their project, state folders, OMP profile and hooks folder match the session's (section 7, Nested launch).
   - Every session of another harness can write a listed runtime's data, such as Pi's sessions and OpenCode's `~/.local/share/opencode`, but not its logins or instruction files; OMP's logins live in `agent.db`, which listing `omp` makes writable. Configuration stays write-denied in every session.
   - A harness installed or listed during a session is not included until the session is restarted; an uninstalled one keeps its grants until the session ends.
5. **The nested-launch release.** OpenCode moves from `nested = "inherit"` to `"same-boundary"`, and the field is removed (section 7, Nested launch).
   - OpenCode started inside a Pi or OMP session runs when its project, state folders and hooks folder match the session's.
   - OpenCode inside an OpenCode session in a different project, which runs under `inherit`, is refused. That is the cost of requiring the same project.
   - A nested launch runs the executable the session's snapshot records instead of searching PATH.

Apart from that order, **the deletes release** ships when a vendored cc-safety-net release checks recursive deletes without `-f`, at any time after step 9 (section 5, Recursive deletes):

- Recursive deletes below the working folder and in temp run without a refusal, such as `rm -rf node_modules`.
- The working folder itself (outside temp), anything outside it, home, `/`, Git metadata, dynamic targets such as `rm -rf "$DIR"` and `rm -rf *`, and `find -delete` are refused.
- Other commands built at run time, such as `$(printf r)m -rf /` and `git reset $(printf --hard)`, are refused too, by cc-safety-net's strict level.

## 12. Plan

Steps are numbered in the order they are done. "Needs step N" marks a step that cannot start until step N is done. Steps 7a to 7d were inserted after step 7 when Pi and OMP moved ahead of the Rust launcher (decision D8, section 15); the installer split, step 10b before, is now step 7a, and no other step changed its number. Steps 7e and 7f were added by the design review of 2026-10-02, which also rewrote decisions D3 and D5. Step 7f keeps its letter but is done before step 7d, so release 0.2.0 includes it.

1. **Rules and design.** `AGENTS.md` holds the writing rules and the contribution policy; `CLAUDE.md` contains `@./AGENTS.md`. This document replaces the 2026-09-28 draft and carries the package-store findings (section 9), whose only other copy is a gitignored backlog archive. Backlog items cover steps 2–11, with 2–6 in detail. Done when these are merged and each of steps 2–11 has a backlog item.

2. **Test contract.** The v1.0.3 golden fixtures stay unchanged. The existing integration checks run through an engine adapter, so the same checks run against the zsh engine now and the Rust engine at step 8. Development conformance tests stay separate from the small installed `doctor` check (section 8). Done when the existing checks pass through the adapter against the zsh engine with the fixtures unchanged.

3. **OpenCode Guard's later fixes, then permanent names on the zsh engine.** The first change ports OpenCode Guard's five commits after v1.0.3 (section 10); it needs only step 1. The rename needs step 2. Agent Guard gets its own plugin file, PATH markers, rulebook, status tool, bypass variable, message prefix, nesting marker and app bundle ID, none shared with OpenCode Guard. The launcher skips every guard shim, old and new (section 10). The release contents include the JS plugin, vendored cc-safety-net, templates and license notices. Confirmed names:

   | Item | Stage 1 (shared with OpenCode Guard) | Agent Guard |
   |---|---|---|
   | Plugin file | `opencode-guard.js` | `agent-guard.js` |
   | PATH markers | `# >>> opencode-guard >>>` | `# >>> agent-guard >>>` |
   | Rulebook | `~/.cc-safety-net/rules/opencode-guard` | `agent-guard` (folder, rulebook `name` and `rule.json` entry) |
   | Status tool | `opencode_guard_status` | `agent_guard_status` |
   | Bypass variable | `OPENCODE_GUARD_BYPASS` | `AGENT_GUARD_BYPASS` |
   | Message prefix | `opencode-guard:` | `agent-guard:` |
   | Check probe file | `.opencode-guard-check` | `.agent-guard-check` |
   | Nesting marker | `OPENCODE_SANDBOXED` | `AGENT_GUARD_SANDBOXED`, set for every harness |
   | App bundle ID | `ai.opencodeguard.launcher` | `io.github.ebrindley.agentguard` |

   Until step 11 the launcher also treats `OPENCODE_SANDBOXED=1` as already guarded, so a session started under OpenCode Guard that reaches the new launcher does not apply a second profile. The log, `~/Agent Guard/last-launch-opencode.log`, is already Agent Guard's own; OpenCode Guard writes `~/OpenCode Guard/last-launch.log`. Done when OpenCode Guard's later fixes pass their tests here, no identifier is shared with OpenCode Guard, the launcher reaches the real harness with both guards' shims on PATH, and the step 2 checks pass.

4. **Installer: install, update, uninstall.** Needs step 3. The one-liner downloads a complete release and verifies its checksum before it touches the install. The previous version stays until the new one passes its self-test; a failed self-test fails the install and leaves the previous version working. `update` and `uninstall` commands exist. `doctor` replaces `launch check`. A version stamp is written. Until step 5 the installer refused to run over an OpenCode Guard install. Done when lists, user edits and permission records survive failed runs and reruns, and an interrupted update leaves the previous version working.

5. **OpenCode Guard migration.** Needs step 4. The installer follows the rules in section 10: import the permission record before any permission write, keep the new plugin out of the plugin folder until the switch, import the list once without overwriting an existing one, switch, leave write-protected forwarders at the old command paths, and retire OpenCode Guard's files without running its uninstaller. Done when recovery passes for failures before, during and after the switch, against a real install of the latest OpenCode Guard release plus the fixtures in section 10.

6. **First public release (OpenCode only) and the two Macs.** Needs step 5. Tracked files and history are reviewed, then the repository goes public with the files and settings in section 13. Releases 0.1.0 and 0.1.1 are published. The home Mac switches first, then the work Mac. Done when the release is public and each Mac passes terminal launch, app launch, `doctor` and recovery.

   Private vulnerability reporting is available only on public repositories, so it is switched on right after the repository goes public, before either Mac uses the release.

   Collected before this step:

   - each Mac's chip, macOS version and OpenCode version;
   - which OpenCode Guard build each Mac runs (a tag or commit, found by comparing installed files with the tags, since it writes no version stamp);
   - whether the work Mac runs Santa or another allowlisting tool (`santactl status`), how it admits new binaries, and whether it admits an ad-hoc signed app built on the Mac (section 6).

   The work Mac's admission route gates step 8's update on that Mac, not step 8 itself (step 8's done-when).

7. **Package store, `bin` and model catalog (first policy update), released as 0.1.2.** Needs step 6; it reaches both Macs through `update`. It comes first because it removes a public limitation and fixes the baseline the Pi profile copies (step 7b). OpenCode's current and legacy package stores, its `bin` folder and its model catalog are protected, at the default and the XDG-relocated cache root; the rest of the cache stays writable. Operator maintenance outside the guard is documented. `doctor` checks that the configured plugins loaded, not only the status tool (section 9). The cache-root resolution (`XDG_CACHE_HOME`, else `~/.cache`) is written as OpenCode's first state-root resolver, the stage that resolves Pi's and OMP's roots at step 10d (section 7, Launch pipeline, R6). Done when configured plugins load, a representative npm language server works, the missing-package message is clear, OpenCode starts with `bin` missing, replacement and rename of the store, `bin` and the catalog are denied, and the catalog's refresh behavior under the deny is tested and documented.

**7a. Installer split.** Formerly step 10b (section 6, Installer structure). Needs step 6 and runs alongside step 7. It comes before any Pi installer code, so the Pi steps are switch actions with undo and recovery and one command can run more than one migration. `profiles/opencode/install.sh` becomes the `installer/` modules, with the action registry, frozen recovery bundle, candidate inventory and sequential migrations; `agent-guard update` finishes a pending migration or installs a newly found harness even when the installed version is current. Its own pull request. Done when the OpenCode tests pass with no change to what they assert, a journal whose only begun action is outside the old fixed pattern is recognized and rolled back, recovery works with the new release folder missing, and an install from 0.1.1 with a migration record updates and keeps that record.

**7b. Pi profile.** Needs step 6; it can start alongside 7a, and difference 4 needs step 7's path set. pi-sandbox-guard 7ad441f's launcher, preamble, Seatbelt profile, extension and test scripts are copied byte for byte into `profiles/pi/`, in pi-sandbox-guard's relative layout, and the five recorded differences are applied (section 11, What changes for Pi sessions). Nothing is installed yet. Done when a file comparison against 7ad441f allows only the recorded differences, pi-sandbox-guard's suites pass in CI against the copy, changed only where a difference changes what they assert, each difference has a passing test, and the nesting tests assert the real behavior in both directions (section 11, Tests).

**7c. Pi install, migration and commands.** Needs steps 7a and 7b. The installer places the adopted guard at pi-sandbox-guard's paths, migrates a pi-sandbox-guard install, updates and uninstalls it (section 11, The adopted guard and The adoption), and OpenCode sessions write-protect Pi's guard files once Pi is installed (section 11, What changes for OpenCode sessions). `agent-guard bind`, `agent-guard wrapper add|remove|list` and the Pi checks of `doctor` and `doctor --json` replace pi-sandbox-guard's npm scripts (section 11, Commands). Done when Agent Guard installs, updates, checks (`doctor`, `version`) and uninstalls the Pi and OMP guard without those scripts; the Pi migration test passes against a real 7ad441f install with failures and kills at every switch point, reruns, uninstall, wrappers and both old guards on one Mac; and an OpenCode session with Pi installed cannot write Pi's guard files, even under an ALLOW entry.

**7f. Cross-harness project config, released in 0.2.0.** Needs step 7c. On the zsh engine, closing two gaps the protection union would otherwise leave open until step 10c. Pi sessions write-deny `.opencode` (all of it), `opencode.json`, `opencode.jsonc`, `tui.json`, `tui.jsonc` and `.cc-safety-net` anywhere in the project, as difference 7; without this a Pi session can plant an OpenCode plugin or switch off cc-safety-net's built-in rules for later OpenCode sessions in that folder (section 5, Command checker). With Pi installed, OpenCode sessions write-deny `.pi` and `.omp` anywhere, as pi-sandbox-guard's profile does inside the project, a recorded golden difference; OMP's other root families and the cross-harness extension folders stay at step 10c; without this an OpenCode session can plant an OMP extension, which OMP loads at its next start without asking (`sandbox/pi-sandbox.sb`'s project config comment). Pi's analyzer asks before `git push` with `--force`, `-f`, `--force-with-lease`, a `+` refspec or `--delete`, as difference 8: the baseline threat model puts literal force-pushes under ASK, and until step 10d nothing else in a Pi session checks them. Done when cross-writes in each direction are denied in a disposable-home test while other project files stay writable, the analyzer asks for each force-push form and allows a plain `git push`, the file comparison allows only the recorded differences, and SECURITY.md drops the limits these close.

**7d. Release 0.2.0: OpenCode, Pi and OMP.** Needs steps 7, 7c and 7f. README and SECURITY.md state Pi's guarantees per harness (section 11, Public claims until step 10d). OMP's browser features are tested under difference 3 (decision D7) before the release. It ships as a pre-release; the owner's Mac switches, and 0.2.0 becomes the latest release once that Mac passes the checks below. pi-sandbox-guard's final release and archive follow every Mac's migration and legacy audit (step 11). No new binary is involved: the Pi files run through Apple's `/bin/zsh`, so the work Mac's admission route does not gate this step. Done when the release archive contains the Pi profile and passes the bootstrap and install tests; on the owner's Mac real Pi and OMP sessions pass launch, a blocked and an asked command, `/reload` and an update while a session runs, and `doctor` passes; and 0.2.0 is the latest release.

Alongside steps 7 to 7d, not gating them: the OMP 18.4.9 observation, which needs OMP installed on the owner's Mac, the Pi 0.99.2 checks and the Seatbelt probes (section 15, To verify). Their results feed 10c and 10d.

**7e. Checker measurement.** After 0.2.0; it does not gate a release and finishes before step 10c. Pi's 401 corpus cases, `test/smoke.mjs`'s regressions and about 40 in-scope cases from the baseline threat model (force-push forms, Git discards, secret reads through `bash` and through file tools, pipe-to-shell, `core.hooksPath` forms, routine cleanup, wrappers such as `git -C`, `timeout` and `/usr/bin/env`) go through the analyzer and through cc-safety-net's Pi entry, with Agent Guard's settings and stock, as an interactive and a headless session would see them. The scratch home and repository lie outside `/tmp`, `/private/tmp` and `/var/folders`, the analyzer's safe roots. Every difference gets one disposition: denied by Seatbelt (checked under the Pi profile in a disposable home), out of scope as evasion, or in scope with a rulebook rule, an ask-list entry, an upstream request or a written acceptance. Also measured: p50 and p95 per call for both checkers on both Macs, the count of 2-second timeouts, and whether cc-safety-net's Pi entry loads in OMP 18.4.9, in a disposable home. The owner counts the asks and blocks in their own `~/.pi/agent/security-events.log`, which holds full command text. Done when the result is committed as a fixture with no difference left unclassified, every in-scope Pi verdict maps to Seatbelt, a rule, the ask list or decision D5's fallback, and decision D5 records whether the fallback is taken.

8. **Rust launcher, delivered as an update.** Comes after step 7d; needs step 6, and the work Mac's admission route before the update reaches that Mac. The update carries the Rust launcher, for OpenCode only, and the zsh Pi files of steps 7b and 7c unchanged; OpenCode's denies for Pi's guard files are part of the parity evidence. Constraints and parity are in section 7. The launcher is built as define, resolve, compile and execute (section 7, Structure) around the typed policy model (section 3, The policy model), with only the fields OpenCode uses; each later field arrives with the step whose behavior uses it. The shims pass their entry name to the launcher, every subprocess the launcher runs itself gets the cleared probe environment (section 7, Launch pipeline, R2 and R3), and the profile builder accepts paths outside home and a parameter set that is no longer fixed (section 3, SBPL parameters). OpenCode's `protected.sb` becomes model data, its name rules and the `~/.cc-safety-net/logs` exception, rendered to the same bytes; `protected_fragment` retires. The parity evidence of section 7 is unchanged. The update refuses to switch a Mac where the new binary cannot run and leaves the zsh version working there; OpenCode and Pi then both stay on the previous release on that Mac. The zsh engine stays in the repository until both Macs run the Rust version; rollback artifacts are kept after that. Done when the Rust engine passes the golden and behavioral parity tests, the home Mac runs it, and the work Mac either runs it or is recorded as staying on the last zsh release until its admission route allows the binary. Later steps need only that, so they do not wait on the work Mac's admission.

9. **Per-launch snapshot and plugin split.** Needs step 8, so it is built once. Each launch writes its own snapshot, `state/launch/<profile>-<launch-id>.json`, and passes its path to the plugin in `AGENT_GUARD_STATE`, which removes the shared `state/rules.json` race (section 2). The snapshot is immutable, versioned and write-protected; environment variables carry its location, never copies of policy (section 7, Per-launch snapshot). The plugin splits into `plugin/core.mjs` and the OpenCode adapter, which keeps the vendored cc-safety-net entry intact behind the compatibility wrapper (section 5). The command checker's contract is built for both of cc-safety-net's entries, OpenCode's live and Pi's in tests under a stand-in Pi API, so it is not shaped around OpenCode alone; it includes the health check that blocks on a degraded cc-safety-net policy or a missing rulebook, the clearing of the cc-safety-net variables that can loosen a check, and Agent Guard's ask list (section 5, Command checker). Done when concurrent launches, a missing or malformed snapshot (writes refused) and cleanup of ended launches have defined, tested behavior, the snapshot holds the fields section 7 lists, the 79 plugin checks pass unchanged against the split plugin, and a damaged `rule.json` blocks shell commands with a message instead of silently dropping Agent Guard's rules. The release after every Mac runs step 9's release and has restarted refuses a confined launch with `AGENT_GUARD_SANDBOXED=1` and no snapshot (section 7, Nested launch).

10. **`@project`, then Pi and Oh My Pi (OMP) on the shared engine, then OpenCode's releases.** Needs step 9, because `@project` makes the rules differ between launches started in different folders (inference from section 4). Four parts, done in order; 10b, the installer split, became step 7a:

    - **10a. `@project` for OpenCode.** Its positional project argument (`opencode [project]`) and what the app launcher means by it; the app's working directory is unverified.
    - **10c. Engine capabilities, switched off for OpenCode** (sections 3 and 7): bindings, root levels and recorded roots, the credential set with both classes and the OMP `.env` check (section 3, Credentials), Git hooks with their collision cases and no profile switch (section 3, Git hooks), `rlimits`, pinned `path`, `refuse_env`, nested policies and `on_link`. The analyzer's checker interpreter is not built, because the analyzer retires at 10d, unless step 7e takes decision D5's fallback (section 5, Command checker). The protection union also gains every installed harness's denies inside granted folders, with their exceptions, rendered in every launch, OpenCode's included, so Pi's `~/.cache` grant cannot reopen them (section 3, Every installed harness; section 9). Each gets acceptance cases taken from pi-sandbox-guard's `test/shim.mjs` and `scripts/test-sandbox-profile.sh`; `rlimits`, `refuse_env` and recorded roots have no case there and get new ones, and the provider acceptance cases are in section 8. 10c also writes the Pi profile data the protection union needs, so OpenCode launches protect the adopted Pi's names and configuration (section 11, Compatibility matrix). Also an unshipped Pi slice: the Pi adapter loaded by a real Pi 0.99.2 in a disposable home through `-e` and discovery, `/reload`, and a dry migration against a fixture install of the adopted guard, so the load cycle and the migration are exercised before 10d.
    - **10d. Pi on the shared engine**, after 10c's union covers the denies inside `~/.cache`. The Pi profile, its Rust hooks, cc-safety-net as Pi's and OMP's command checker with the Pi ask list and the delete policy (section 5, Command checker and Recursive deletes), and Pi's migration from the adopted guard (section 11, The Pi migration), with the OMP observation's results (section 15, To verify) and OMP's `models.db` checked (section 9, Other code in writable folders). It replaces the zsh Pi files of steps 7b and 7c and redoes the Pi parts of `doctor` and the entry-point layout; sessions started before the update meet the new plugin's refusals after `/reload` until they are restarted. Pi ships with the credential set, Git hooks, the executable checks (section 3, Executables and launch links) and `same-boundary` for its own runtimes. A nested launch whose runtime the enclosing snapshot does not name, such as Pi inside OpenCode, stays refused until the composition release (section 7, Nested launch). Unguarded refusal and the other differences in section 11's compatibility matrix are documented as behavior changes. After Pi works on the shared engine, a short "adding a harness" guide is written from what Pi needed (section 14).
    - **10e. OpenCode's releases** (section 11, OpenCode's releases), one change each, in this order: (1) the executable release; (2) the credentials release; (3) the hooks release, which needs the app project folder from 10a; (4) the composition release, which needs 10d and the items section 9 lists before composition (section 9, Other code in writable folders), and adds the NESTED opt-in, member grants, member snapshots and a canary to every launch, Pi's and OpenCode's (section 3, Composition); (5) the nested-launch release, after (4). Releases 1 to 3 need 10c, not 10d, and can ship alongside 10d. The deletes release (section 5, Recursive deletes) ships when cc-safety-net allows it, at any time after step 9.

    10a is done when `@project` passes its cases for OpenCode, and 10c when its acceptance cases pass with every capability switched off for OpenCode, so OpenCode's first three releases can follow without waiting for 10d. 10d is done when Pi and OMP run on the shared engine on the owner's Mac and the conformance suite passes for both profiles. 10e is done when OpenCode's five releases have shipped.

11. **Close out.** Needs step 7d, with 0.2.0 the latest release, and the migration of every Mac that ran OpenCode Guard or pi-sandbox-guard; it does not wait for steps 8 to 10. On each such Mac, in order:

    1. **Legacy audit**, read-only, after the migration and before any removal. Each item is recorded as carried over, live under its old name, a gap, or not present. Content is compared with the copies the migration kept: `~/OpenCode Guard`, `state/opencode-guard-permissions.json` and the legacy bundle `state/legacy/pi-sandbox-guard/`.
       - OpenCode Guard: every list entry is in `~/Agent Guard/Guard List.txt` with the same meaning; OpenCode config `permission` values equal their values before the switch, and `state/permissions.json` holds OpenCode Guard's `orig` values; `rule.json` has `agent-guard` and every `transparent_wrappers` entry it had, and the user's own cc-safety-net rules still apply; a new terminal, Agent Guard's app and any Dock item or alias that started OpenCode Guard's app start OpenCode guarded, and no `opencode-guard` PATH block remains; the retired engine files differ from the OpenCode Guard tag they came from only where Agent Guard matches the change.
       - pi-sandbox-guard: every binding in `executables.conf` and `.guard-node` passes `agent-guard bind --check` and `doctor`; every wrapper in pi-sandbox-guard's launcher stamp is in `state/wrappers.json` with a matching hash and starts Pi guarded; the bundle's files differ from 7ad441f, or the commit their `.deployed-version` names, only where Agent Guard matches the change; Pi's and OMP's settings that name the guard's paths still load its extension; real Pi and OMP sessions pass the checks of step 7d.
       - Both: shell startup files, scripts in the projects folder, `~/.config/opencode` and `~/Library/LaunchAgents` hold no remaining use of the old names (`OPENCODE_GUARD_BYPASS`, `OPENCODE_SANDBOXED`, `OpenCodeGuard`, `opencode-guard`, `pi-sandbox-guard`, `npm run deploy`, `npm run bind`, the checkouts' paths).

       Live under the old name, and not removed here: `pi`, `omp`, `pi-sandbox.sb` and `pi-sandbox-preamble.zsh` in `~/.local/bin`, the extension folder `~/.pi/agent/extensions/pi-sandbox-guard/`, `executables.conf`, `.guard-node` and the security event log (section 11, The adoption). `state/legacy/replaced/` is Agent Guard's own uninstall data.
    2. **Gaps.** Each gap is filed with the Mac, the legacy setting and what Agent Guard lacks. A legacy file a gap depends on stays until the gap is fixed in a release or the owner accepts it in writing.
    3. **Cleanup.** Restart, then `agent-guard update`: the forwarders and OpenCode Guard's engine folder go (section 10, Forwarder removal). Then a cleanup step, run on request, journaled and repeatable like the retirement and refused while the audit has open items, removes `~/OpenCode Guard`, `state/opencode-guard-permissions.json` and `state/legacy/pi-sandbox-guard/`. Local checkouts of either project are removed or never deployed again, because pi-sandbox-guard's deploy scripts write the Pi files' paths.

    Then each project gets a final release, and its `README.md` a notice: Agent Guard's install command, what the migration changes and keeps, and recovery (a failed migration rolls back; after a successful one, `agent-guard uninstall`, then the project's own install from its final tag). pi-sandbox-guard's notes repeat 0.2.0's behavior changes for Pi and OMP sessions. Open issues and pull requests are closed with a pointer to Agent Guard, and each repository is archived, not deleted: Agent Guard's design, fixtures and difference records cite their commits, and `profiles/pi/LICENSE` carries pi-sandbox-guard's notice. pi-sandbox-guard was never published to npm.

    The release after every such Mac has migrated and restarted ends the launcher's acceptance of `OPENCODE_SANDBOXED=1` (section 7, Nested launch). The migration modules stay while the final releases send users to Agent Guard's installer; a Mac that migrates later gets the same audit and cleanup. Done when every such Mac has a recorded audit with each gap fixed or accepted, its legacy files are gone, both repositories are archived with a final release as the latest, and the launcher refuses `OPENCODE_SANDBOXED=1` as a nesting marker.

**End state for the existing OpenCode Guard and pi-sandbox-guard installs.** Done at step 11: every Mac that ran either guard has migrated and passed the legacy audit; OpenCode Guard's engine, shims, forwarders, plugin, app, rulebook entry, PATH blocks and `~/OpenCode Guard` are gone, and so is the legacy bundle; and uninstall has been tested. Later releases, 0.2.0 and the Rust release included, reach these Macs through `update`.

**End state for open source and more harnesses.** Public from step 6. A harness is profile data, Rust hooks, a plugin adapter, its checkers and a pass of the conformance suite (section 14). Pi is the first new harness. It is guarded by the adopted profile from 0.2.0 (step 7d), pi-sandbox-guard is retired and archived once the Macs have migrated (step 11), and Pi has the parts of section 14 from step 10d. Done when Pi and OMP run on the shared engine on the owner's Mac and the conformance suite passes for both profiles. Later candidates are in section 14.

## 13. Open source

The repository was private until step 6 and is open source from the first public release, 0.1.0. The model is pi-sandbox-guard's (`CONTRIBUTING.md`, `SECURITY.md`, `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/`).

**License.** MIT, in `LICENSE`. Vendored cc-safety-net keeps its own `engine/vendor/cc-safety-net/LICENSE`, and every release carries the license notices (step 3).

**Contributions.** Issues are welcome. External pull requests are not accepted. `AGENTS.md` states this policy. `CONTRIBUTING.md` states it too and holds the bug-report guidance: reproduction steps, expected and actual behavior, and the macOS, harness and Agent Guard versions. That guidance does not go in `AGENTS.md`.

**Security reporting.** `SECURITY.md` sends vulnerabilities to the private advisory form (`/security/advisories/new`) and defines where a bug ends and a vulnerability begins, as pi-sandbox-guard's does. A link is not enough: GitHub accepts private reports only when private vulnerability reporting is switched on in the repository settings ([GitHub](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately)), which is possible only once the repository is public. If the form is missing, a reporter opens a public issue with no exploit details asking for a private channel. For that reason `.github/ISSUE_TEMPLATE/config.yml` keeps blank issues enabled and links the advisory form; `bug_report.yml` asks for the `CONTRIBUTING.md` fields.

**Repository settings and files.**

- Pull requests: "Collaborators only" ([GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/disabling-pull-requests)). In a personal repository a collaborator is anyone invited to it.
- Private vulnerability reporting: switched on.
- `.github/CODEOWNERS`: `* @ebrindley`, so review requests and advisory notifications reach the maintainer.

**Before going public.** Every tracked file and every commit in the history, including author metadata, is reviewed for credentials, personal details, account home paths and host names. The gitignored backlog archive is not published; what it holds that the design needs is in this document.

## 14. Adding a harness

A harness is five parts:

| Part | What it is |
|---|---|
| Profile data | The fields in section 3. zsh assignments now; TOML embedded in the binary from step 8. |
| Hooks | Named functions for what data cannot express, such as OpenCode's `prepare_hook` or Pi's `args_hook` and `state_hook`. zsh in `hooks.zsh` now; Rust from step 8. Install steps such as OpenCode's permission merge go in the installer's harness module (section 6). |
| Plugin adapter | A thin layer between the harness's hook API and the plugin core (section 5). |
| Command checker | cc-safety-net, through a wrapper for its entry for the harness when it ships one, and the adapter's ask list (section 5, Command checker). |
| Conformance pass | The suite in section 8, run against the new profile under the real `sandbox-exec`. |

A new harness's protected paths and names apply to every launch of every installed harness (section 3), so adding one also changes what the others can write. Its runtime folders are granted to every session where it is listed under NESTED and present (section 3, Composition), so anything in them that the harness runs as code, or trusts as config, must be protected, checked at launch or accepted in writing (section 9).

Pi is the first case (section 11). What it needs beyond OpenCode is built as engine capabilities at step 10c, with OpenCode switched off (sections 3 and 7). The credential set, Git hooks protection, the executable checks and the `same-boundary` rule apply to every profile, and reach OpenCode through its own releases (section 11, OpenCode's releases). `on_link = "refuse"`, `rlimits`, a pinned `path` and `refuse_env` stay profile choices. The "adding a harness" guide is written after Pi works (step 10), from what Pi actually needed. Until then this section is the outline.

Candidates, ranked. None has an OS sandbox of its own. The reasons and caveats come from the 2026-09-28 draft and were not rechecked for this revision.

1. **Kiro CLI.** Claude-style PreToolUse hooks. They fail open, which is acceptable because the outer layer is the boundary.
2. **Crush.** A terminal CLI like OpenCode, so the launch model carries over. Hook API not yet verified.
3. **Mistral Vibe.** Hook API not yet verified.

Aider and OpenHands are not candidates until they have a hook that can refuse a tool call. Hermes Agent is out of scope; its safety stays in its own config.

Harnesses that ship their own Seatbelt sandbox (Codex, Claude Code, Gemini CLI) are excluded. Seatbelt sandboxes cannot nest, so a profile would have to switch the harness's own sandbox off (section 1).

## 15. Risks and open decisions

Risks:

- **Work-Mac binary admission.** If the work Mac runs Santa in a mode that blocks unknown binaries, the new ad-hoc signed launcher app (step 6) or the Rust binary (step 8) could be blocked. Step 6 checks the app before the switch; step 8 refuses to switch a Mac where the new binary cannot run, and OpenCode and Pi then stay on the previous release there (sections 6 and 7). Steps 7 to 7f add no binary, since the Pi files run through Apple's `/bin/zsh`, so the admission route gates only the Rust launcher's arrival on the work Mac; later steps need only the home Mac (step 8).
- **Harness updates move config paths.** An update can add a config, plugin or extension path the profile does not protect. OpenCode's plugin documentation still describes `~/.cache/opencode/node_modules`, while 1.18.33 uses `~/.cache/opencode/packages/` (section 9). The conformance suite runs against new harness versions in development, and `doctor` runs after each update on an installed Mac. An npm update can also put a real `pi` back in `~/.local/bin`, which `doctor` reports (section 11, Commands).
- **`sandbox-exec` deprecation.** Apple marks `sandbox-exec` deprecated. It still works, and Chrome, Codex and Claude Code depend on it. Both engines depend on Seatbelt; the self-test and `doctor` fail loudly if it stops working. Linux and Windows are non-goals (section 1), so there is no fallback platform.
- **Two guards installed during migration.** Both plugins would issue competing refusals, the two launchers' shims can call each other, the app bundle ID is shared, and terminals opened earlier keep the old PATH. Section 10 gives the rule for each. The adoption replaces pi-sandbox-guard's files at the same paths by rename, so no Pi start loads two guards; while the extension folder is swapped, a guarded start refuses and a direct start loads no extension (section 11, The adoption). At step 10d a Pi started elsewhere during the switch may load both extensions; the window is three renames (section 11, The Pi migration).
- **One checker for every harness.** A cc-safety-net regression reaches OpenCode, Pi and OMP at once (section 5, Command checker). The vendored copy stays pinned and unmodified; an upgrade is a change of its own, reviewed with its upstream diff and run against step 7e's fixture.
- **A repository's cc-safety-net policy.** A cloned repository can ship a `.cc-safety-net/policy.json` that switches cc-safety-net's built-in rules off for sessions started in it. Sessions cannot write one (section 5, Command checker), and Agent Guard's rulebook still applies; an upstream setting to ignore a project's loosening is requested (Requests to cc-safety-net, below).
- **Pi's guard files outside the engine folder.** Until step 10d the launchers, extension and bindings live at pi-sandbox-guard's paths, covered by pi-sandbox-guard's own rules in Pi sessions and by the 0.2.0 denies in OpenCode sessions, not by the engine folder's rule (section 11, The adopted guard). A route those rules miss would leave a launcher or wrapper writable from a session, and it runs outside the sandbox at the next start.

Decisions taken, each with the alternative not taken and its cost:

- **D1. Shared ALLOW entries and Pi.** One list for all harnesses. The Pi migration shows what Pi gains from the shared list and asks, even when the list needs no edit: with `ALLOW ~/Projects`, Pi gains write access to every project there (section 11, The Pi migration). Alternative: a Pi setting that honors only `@project` from ALLOW; cost: the list no longer means the same for every harness.
- **D2. Credentials.** One credential set for every profile, in two classes: tool credentials, which no session can read or write, and inference credentials, which sessions can read, with their config write-denied and their token caches writable (section 3, Credentials). OpenCode gets it from its credentials release (section 11, OpenCode's releases). Alternative: a credential server outside the sandbox, so that `~/.aws` could be fully denied; cost: a process outside the sandbox for every launch, work for each provider, and OpenCode's Azure sign-in runs `az`, which has no hook for such a server.
- **D3. Cross-harness nested launches, opt-in.** A runtime listed under the Guard List's NESTED heading, started inside another harness's session, runs under that session's sandbox when the session lists it as a member and its project, state roots, OMP profile and active hooks folder equal the session's (section 3, Composition; section 7, Nested launch). Nothing is listed by default; a listed runtime's logins and instruction files stay write-denied in other harnesses' sessions, apart from OMP's `agent.db`. Decided on 2026-10-02: the owner does not nest harnesses today but expects to. Alternatives: grant every present runtime with no opt-in, the earlier plan; cost: every session on a Mac with two harnesses can rewrite the others' logins and runtime data, though only nested launches use the grants. Or keep refusing cross-harness nesting, as pi-sandbox-guard does; cost: no Pi from an OpenCode session, or the reverse.
- **D4. RPC confirmations.** Today's behavior: Pi's asks go to `ctx.ui.confirm` when there is a UI and are refused otherwise, and in RPC mode the client program answers (section 5). Alternative: refuse asks in RPC mode; cost: RPC clients that confirm today stop working.
- **D5. One command checker.** cc-safety-net for every profile, OpenCode from step 9 and Pi and OMP from step 10d, behind a wrapper per harness, followed by Agent Guard's rulebook and an ask list per adapter that can only make a verdict stricter; pi-sandbox-guard's analyzer retires at step 10d instead of moving into the plugin (section 5, Command checker). Decided on 2026-10-02 from the design review's corpus run: most of the analyzer's extra blocks are writes Seatbelt already denies, while it allows force-pushes, Git discards and secret reads, which Seatbelt cannot stop, and from step 10d the credential set leaves `~/.aws/credentials` readable; it also took 0.15 to 1.7 seconds per command, against cc-safety-net's 1.4 to 15 milliseconds. Cost: Pi loses most of its asks until cc-safety-net reports every rule a command matches, and recursive deletes follow one policy for every harness (section 5, Recursive deletes). Fallback, if step 7e leaves an in-scope Pi verdict that no rule or ask can express: Pi keeps the analyzer behind cc-safety-net until one can, and steps 10c and 10d keep the machinery it needs (section 5, Command checker). Step 7e records here whether the fallback is taken. Alternatives: keep the analyzer as Pi's only checker; cost: no check of force-pushes, Git discards or secret reads in Pi sessions, and the engine carries the analyzer's interpreter binding, log and subprocess limits. Or run both checkers in Pi permanently; cost: the same machinery, the analyzer's latency on every command, and both checkers' refusals combined.
- **D6. Uninstall after the adoption.** From 0.2.0, and after Pi's migration too, uninstall removes Agent Guard's Pi pieces, copies the legacy bundle to `~/Agent Guard/` and prints the steps to reinstate pi-sandbox-guard from that copy, without reinstating it (section 11, The adoption). After step 11's cleanup removes the bundle, the steps name pi-sandbox-guard's final tag. Alternative: reinstate it automatically; cost: uninstall then depends on a retired project's files and layout.
- **D7. The base template's exec and Launch Services denies for Pi.** Applied, as for OpenCode: `lsopen`, `job-creation` and running `open`, `osascript`, `osacompile`, `codesign`, `diskutil`, `launchctl` and `sudo` are denied, which closes routes out of the sandbox (section 3). Moved forward from step 10d to 0.2.0 as the adopted guard's difference 3, because `open` and `launchctl` can run code outside the sandbox; OMP's browser features are tested under it before 0.2.0 (section 11, What changes for Pi sessions). Alternative: a Pi exception; cost: one more per-harness difference in the base.
- **D8. Pi before the Rust launcher.** Agent Guard adopts pi-sandbox-guard 7ad441f in place at 0.2.0 (steps 7a to 7d and 7f), with eight recorded differences, and Pi moves onto the shared engine at step 10d as an update (section 11). Only step 7 and the installer split come first. The migration and the behavior changes ship separately, as they did for OpenCode, so a failure in either is easy to place and roll back. Accepted cost: Pi's zsh launcher, preamble and extension stay in service, reused rather than rewritten, until step 10d; the Pi parts of `doctor` and the entry-point layout are redone there; the defects section 11 lists under Defects kept until step 10d stay until then. Alternative: keep the previous order; cost: Pi waits for steps 8, 9, 10a and 10c, and its migration ships with every behavior change at once.
- **D9. The adopted guard keeps pi-sandbox-guard's paths.** The launchers, profile, preamble, extension and bindings stay where pi-sandbox-guard puts them, with links from `$engine/bin` (section 11, The adopted guard). Alternative: move the launcher into the release folder; cost: pi-sandbox-guard's refusal of a project that contains its install folder no longer covers `~/.local/bin`, so a Pi session started there could rewrite `pi`, `omp` or a wrapper, which run outside the sandbox at the next use; it also needs an unverified folder-link discovery, risks two extension copies loading after an update and `/reload`, puts a host-specific file in a stamped release and runs into the test seam that hard-codes the bindings path.

Open decisions:

- **Notarize or stay unsigned.** The facts are in section 6. The work Mac's admission route, collected before step 6, decides this before step 8.
- **Name entries in the list**, a DENY entry that matches a file name anywhere. The `.env` and `.env.*` read deny does not wait on this: it is in the engine credential set and applies to every profile (section 3, Credentials). A name entry would let the list add other names.
- **Project config files that one harness reads from another** (`.mcp.json`, `.claude/settings.json`, `.codex/config.toml`, `opencode.json` and similar). They are bare file names that also appear in fixtures and examples, and their MCP commands run inside the sandbox.
- **Files and folders that carry instructions into later sessions.** Pi's `~/.pi/agent/prompts`, which `state_config` covers only through the `*prompt*.md` name, the `AGENTS.md`, `AGENTS.override.md` and `CLAUDE.md` files Pi 0.99.2 loads from its agent folder into every session, and OMP's `memories`, a `state_grants` subtree, are writable from sessions, so an agent can leave instructions that later sessions load. Protect them, or accept the risk in writing.

Requests to cc-safety-net, none of which Agent Guard depends on; each lets an interim rule go:

- Recursive deletes without `-f` checked like those with it (section 5, Recursive deletes).
- A structured rule ID and every rule a command matched, from the Pi entry and `checkCommand`, so a block can become an ask safely (section 5, Command checker).
- A user-level setting that ignores a project `.cc-safety-net/policy.json` that loosens built-in rules (Risks, above).
- `find -delete` scoped like recursive deletes: allowed below the working folder.
- `caffeinate` as a transparent wrapper.

To verify, before or during implementation:

- **cc-safety-net 2.4.14**, at step 9: whether a second rulebook can be evaluated in-process for the ask list, and how the health check reads a degraded policy through the entries (section 5, Command checker). At step 7e: whether its Pi entry loads in OMP 18.4.9, and the shape of OMP's `tool_call` input it receives.

- **OMP**, alongside steps 7 to 7d and not gating them; it needs OMP installed on the owner's Mac, which step 7d's real OMP sessions also need, and its results feed 10c and 10d. Before 0.2.0, whether OMP's browser features (`browser-relay`, `puppeteer`) need anything difference 3 denies (section 11, What changes for Pi sessions). Every OMP statement in this document not cited to OMP 18.4.9's source comes from pi-sandbox-guard's code and documents. Extension discovery folders, real-path deduplication, `-e` handling, tool names, the command list, `cleanse`, `commit` and `join`, and the runtime paths behind the OMP allowlist in `state_grants`, which pi-sandbox-guard observed in OMP 17.2.10, rechecked against 18.4.9. Read in 18.4.9's source and not run: the `.env` loading and the folder recomputation after it (`packages/utils/src/env.ts`); the endpoint overrides kept in `models.db` (section 9, Other code in writable folders); its own Bedrock request signing and its `~/.aws/sso/cache` writes (`packages/ai/src/providers/aws-credentials.ts`).
- **Pi** (observed: 0.99.2), alongside steps 7 to 7d, feeding 10c and 10d. What Pi does when `/reload` finds the injected extension missing, during an update's extension swap (section 11, The adoption). Top-level `await` under jiti; whether `JITI_*` variables or jiti's file cache in `$TMPDIR` change what code loads; reload with two copies from different releases; whether session replacement (`/new`, `/resume`, a fork) builds a new runner; that a settings entry cannot disable a `-e` extension (only `-ne` was read); that `process.argv` carries the injected `-e` path as passed (section 5, Plugin core and adapters); which options take a value in Pi's `cli/args.js`, against the `value_options` carried from pi-sandbox-guard; the message an OAuth refresh reports under the guard, which the source gives as "Credential store modify failed" (section 3, Credentials).
- **Seatbelt**, alongside steps 7 to 7d, feeding 10c. The hooks exception rendering against list collisions (section 3, Git hooks); the credential exceptions rendered with `require-not` against list collisions (section 3, Credentials); whether an SBPL rule can stop a connection to the SSH agent socket under `/private/tmp` (section 3, Credentials); that recorded linked roots are denied through their canonical path (section 3, Every installed harness); whether writes to `/dev/stdout` and `/dev/stderr` match the base template's `/dev/fd` grant (section 11, Compatibility matrix).
- **OpenCode.** That 1.18.34 never calls the `permission.ask` plugin hook (found by static inspection of the binary only); whether a plugin tool's `context.ask` could carry an ask tier, not needed now (section 5); whether a `.js` link to a `.mjs` target loads, which the adapter's `.js` name avoids (section 5); how the model catalog refreshes when it is write-denied (step 7, section 9); which files `az account get-access-token` writes (section 3, Credentials); that google-auth-library runs `gcloud` to find the project on each Vertex request when `GOOGLE_CLOUD_PROJECT` is unset (section 3, Credentials).
- **gcloud.** Whether it works with `~/.config/gcloud` write-denied; its credential store opens `credentials.db` for writing (section 3, Credentials).
- **Bun.** Whether `import.meta.url` shows a link or its target; the plugin already resolves it (section 5).
