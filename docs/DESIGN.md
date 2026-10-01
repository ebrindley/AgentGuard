# Agent Guard design

Status: accepted plan, 2026-10-01. Built on the zsh engine: stage 1 (the OpenCode Guard v1.0.3 port, with the v1.0.4 fixes) and steps 2 to 5: the test contract, permanent names, the staged installer with update, uninstall, recovery and the version stamp, and the migration from OpenCode Guard (section 10). Step 6's first public release (OpenCode only) is published as 0.1.0, then 0.1.1; steps 7–11 are not built. The plan for folding in pi-sandbox-guard (sections 3, 5, 6, 7 and 11) is recorded and not built.

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
| Nested launch | If `AGENT_GUARD_SANDBOXED=1`, or OpenCode Guard's `OPENCODE_SANDBOXED=1` until step 11, and a trivial `sandbox-exec` call fails (the caller is already sandboxed), `cli` runs the harness directly and every other mode refuses. The planned contract, including Pi's `same-boundary` policy, is in section 7, Nested launch. |
| List parser | In `engine/launch`. Rules in section 4. |
| Profile builder | Fills the slots of `engine/profile.sb` (`@WRITABLE@`, `@WRITABLE_GUI@`, `@USER_RULES@`, `@PROTECTED@`, `@PROTECTED_NAMES@`) from the profile and the list, and passes `HOME`, `DARWIN_TEMP`, `DARWIN_CACHE` and `GUI` as `-D` parameters. Rule order in section 3. |
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
| `credentials` | Planned, step 10c. `"mandatory"` or `"list"` (Credentials) | `"list"`: only what the Guard List denies, as built | `"mandatory"` |
| `hooks` | Planned, step 10c. `"protect"` or `"off"` (Git hooks) | `"off"`, as built | `"protect"` |
| `nested` | Planned, step 10c. `"inherit"` or `"same-boundary"` (section 7, Nested launch) | `"inherit"`, as built | `"same-boundary"` |
| `env_unset`, `env_set` | Environment changes, applied in every mode. The engine sets its nesting marker itself; profiles do not list it | Unset `ELECTRON_RUN_AS_NODE`, `OPENCODE_SIDECAR_V2`, `CC_SAFETY_NET_HOME`, `CC_SAFETY_NET_WORKTREE`, `SAFETY_NET_WORKTREE`; set `CC_SAFETY_NET_PARANOID_RM=1` | Unset git's repository and config selectors, `SSH_AUTH_SOCK` and `GPG_AGENT_INFO`; set nothing (`NPM_CONFIG_USERCONFIG` comes with the `~/.npmrc` credential entry) |
| `path` | Planned, step 10c. The harness `PATH`: `"inherit"` or a pinned list | `"inherit"`, as built | Pinned |
| `rlimits` | Planned, step 10c. Resource limits for the harness | None | Core dumps 0, file size 2 GiB, CPU time from `PI_RLIMIT_CPU` when set |
| `refuse_env` | Planned, step 10c. Variables that stop the launch with a message | None | `PI_PACKAGE_DIR` |
| `prepare_hook` | Runs after the profile is built, before the state write and exec | `opencode_prepare`: creates `~/.config/opencode`, its `.gitignore` and a minimal `opencode.json` if none exists | None; the hooks folder and link checks are engine stages (section 7, Launch pipeline, R8 and C1) |
| `check_hook` | Extra step in `check` | `opencode_check`: runs `opencode serve` under the guard and looks for the status tool | `pi_check` |
| `start_folder` | Planned for step 10a. What `@project` means (section 4) | Defined at step 10a from `opencode [project]` | `PI_PROJECT`, else the git top level, else the launch folder |
| `checkers` | Planned, step 9. The checker chain (section 5, Checker chain) | `["cc-safety-net"]`, through the compatibility wrapper | `["pi-analyzer"]` |
| `plugin_dir`, `plugin_files` | Planned. Where the installer puts the plugin | Hard-coded in the installer as `~/.config/opencode/plugins/agent-guard.js` | `~/.pi/agent/extensions/agent-guard.ts`, a link to `$engine/current/plugin/pi-entry.ts`; the launcher also injects the launch release's copy (section 5) |
| `install_hook` | Planned. Harness-specific install steps | The permission merge, now inline in `install.sh` | None |
| `inner_sandbox` | Planned. How to switch off a harness's own Seatbelt, or that the harness is unsupported | None | None |

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

`writable` includes all of `~/.cache`, which holds OpenCode's npm plugin store. Step 7 protects the store (section 9).

### The policy model

Planned, step 8. One small typed model holds every rule the engine and the profiles contribute:

- paths relative to a root: home, a state root from R6, `@project`, the active hooks folder, or `/`;
- exact-node and subtree matches (`literal`, `subpath`);
- fixed name rules: a path component such as `.pi` or a final name such as `*.sample`, matched anywhere or within a subtree; the pattern is data, never a regex built from a resolved path, as in pi-sandbox-guard's `sandbox/pi-sandbox.sb`;
- read and write effects;
- narrowly scoped exceptions, each attached to the deny it narrows, such as `~/.cc-safety-net/logs` in the `.cc-safety-net` rule or the hooks scaffolding (Git hooks).

The compiler renders the resolved model twice: to SBPL for Seatbelt, and to the plugin's projection, so the plugin checks file tools against the rules Seatbelt enforces (section 5). OMP's positive allowlist is model data (`state_grants`), not SBPL. No SBPL fragment is kept unless the model provably cannot express a rule, and such a fragment carries a written reason; none is planned. Step 8 builds only the parts OpenCode uses; each later capability adds its part with the behavior that needs it.

### Planned Pi profile

Planned for step 10d: one profile, `pi`, with runtimes `pi` and `omp`, embedded as `engine/profiles/pi.toml`. It is written as TOML because Pi arrives after the Rust launcher. The listing is illustrative; key names inside tables are settled when the profile is written. Values come from pi-sandbox-guard 7ad441f (`launchers/pi`, `sandbox/pi-sandbox-preamble.zsh`, `sandbox/pi-sandbox.sb`); OMP values are pi-sandbox-guard's and were not observed against OMP.

```toml
name = "pi"
title = "Pi"
writable = ["~/.npm", "~/.cache", "~/Library/Caches"]
protected = ["~/.pi/agent/extensions", "~/.pi/agent/settings.json",
             "~/.pi/agent/auth.json", "~/.pi/agent/trust.json"]
credentials = "mandatory"
hooks = "protect"
nested = "same-boundary"
path = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"]
env_unset = ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_CEILING_DIRECTORIES",
             "GIT_DISCOVERY_ACROSS_FILESYSTEM", "GIT_CONFIG", "GIT_CONFIG_SYSTEM",
             "GIT_CONFIG_GLOBAL", "GIT_CONFIG_NOSYSTEM", "GIT_CONFIG_PARAMETERS",
             "GIT_CONFIG_COUNT", "GIT_CONFIG_KEY_*", "GIT_CONFIG_VALUE_*",
             "SSH_AUTH_SOCK", "GPG_AGENT_INFO"]
rlimits = { core = 0, file_size = 2147483648, cpu_env = "PI_RLIMIT_CPU" }
refuse_env = ["PI_PACKAGE_DIR"]
start_folder = ["env:PI_PROJECT", "git-toplevel", "launch-folder"]
checkers = ["pi-analyzer"]
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
node = ["settings.json", "auth.json", "trust.json", "SYSTEM.md", "APPEND_SYSTEM.md", "models.json"]
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

`state_grants` cover runtime data only. Pi's grant is its whole active root, and `state_config` then denies its configuration, so sessions and theme files stay writable while extensions, the user package folders (since pi-sandbox-guard #9), skills, settings, `auth.json`, `trust.json`, system prompts and model configuration do not. OMP's grant is the positive allowlist of the runtime paths pi-sandbox-guard observed in OMP 17.2.10: 53 exact-node and subtree entries. Its extensions, hooks, tools, commands, skills, agents, prompts, rules, instructions, plugins and its config, model, MCP, SSH, token and `.env` files stay read-only. OMP's `agent.db` holds operational data and credentials in one file and stays writable, so file-level protection of OMP's credentials is not claimed, as in pi-sandbox-guard.

`path` is pi-sandbox-guard's pinned `PATH`, preceded by one trusted Node folder: the resolved folder of the first Node among `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`, `/opt/homebrew/opt/node/bin`, `/usr/local/opt/node/bin`, then the `opt/node@*/bin` folders under both prefixes. An `env_unset` entry ending in `*` unsets every variable with that prefix, which the built field does not support. Pi may derive another agent folder from `PI_PACKAGE_DIR`, moving `.pi` past the name rules; pi-sandbox-guard only reports it (`scripts/status.sh`); the Pi profile refuses the launch.

Each engine capability the Pi profile switches on stays off for OpenCode, apart from the protection union, until OpenCode opts in, each opt-in its own release (the compatibility matrix in section 11).

### Rule order

In the generated profile, as built:

1. `(allow default)`, then deny all writes.
2. Allow writes to `writable`, `/private/tmp`, the per-user temp and cache folders and a few device files; `writable_gui` in `gui` mode.
3. List rules: ALLOW and READ ONLY entries from least to most specific, then DENY entries (read and write), then symlink targets of protected paths, then pinned folders (section 4).
4. The final deny block: engine folder, OpenCode Guard's engine folder, list folder, `protected_paths`, `~/Library/LaunchAgents`, the app, shell startup files, the pinned home folders, then `protected_fragment`.
5. Deny `lsopen` and `job-creation`, and deny running `open`, `osascript`, `osacompile`, `codesign`, `diskutil`, `launchctl` and `sudo`.

Planned additions. Each renders nothing for a profile that does not use it, so OpenCode's golden bytes change only where the compatibility matrix in section 11 says:

- 2 gains the state-root grants from `state_grants`, relative to R6's roots, including OMP's positive allowlist.
- 3 gains `@project` as an ALLOW entry (step 10a).
- 4 gains the protection union (Every installed harness), the credential write denies for `credentials = "mandatory"` (Credentials) the hooks denies for `hooks = "protect"` (Git hooks) and, for `nested = "same-boundary"`, the launch canary (section 7, Nested launch). From step 8 the rules rendered from `protected.sb` stand where the fragment stood.
- After 4 come the hooks exceptions (Git hooks), then the read denies of the credential set and the event log (Event log). List DENY entries keep their read deny in 3; no rule allows reads.

Seatbelt applies the last matching rule, so the list cannot reopen a protected path. Harness denies (the union, credentials, hooks) come after the list, because an ALLOW entry covering a project would override them if they came before it. State-root grants come before the list and the deny block, so a DENY or READ ONLY entry still restricts them and they cannot reopen configuration. The hooks exceptions are the only allows after the deny block. They narrow the hooks denies only and are rendered so they cannot reopen a list DENY or READ ONLY entry or the protection union (Git hooks), so "DENY always wins" (section 4) holds.

### Protected paths and names

Protected paths and names are write-denied, including creation, rename and removal. A missing config file created by the agent and run at the next start was [CVE-2026-25725](https://nvd.nist.gov/vuln/detail/CVE-2026-25725) in Claude Code. OpenCode's names match anywhere on disk, including temp and OpenCode's own writable folders; the only exception is `~/.cc-safety-net/logs`. pi-sandbox-guard matches its names only inside the project (PR #8). Planned for Pi: `.pi`, `.omp`, `.claude/{extensions,hooks,tools}`, `.codex/{extensions,hooks,tools}`, `.gemini/extensions` and `.opencode/plugins` match anywhere on disk too, except at or inside a Pi or OMP root, whose configuration the root rules cover (Every installed harness), so `.omp` does not cover OMP's state in `~/.omp`. Matching everywhere also closes a route the project-only rule leaves open: building a `.pi` folder in `/private/tmp` and moving its parent into a project. A name must still be narrow enough not to cover other state the harness writes. Narrow exceptions are policy-model exceptions (The policy model), as `~/.cc-safety-net/logs` is from step 8.

### Symlinks

Seatbelt checks the resolved path, so a link can carry a write past a name rule. At launch the engine resolves the engine folder, the list folder, the profile's `protected` entries, `~/Library/LaunchAgents`, the shell startup files and each of `protected_names` directly inside the launch folder (`$PWD`). Where one is a link, its target is write-denied and added to READ ONLY for the plugin. Elsewhere only the name is protected: the agent cannot create, replace or remove a link with that name, but writes through an existing link reach its target. The plugin refuses file edits through such a link; shell commands are not checked. `.cc-safety-net` is not in `protected_names`, so a `.cc-safety-net` link in the launch folder is not resolved. `opencode <project>` run from another folder gets no resolution for the project's names; `@project` (step 10a) must resolve the same folder the harness opens. Stage 1 keeps these limits and the README says so.

Planned, step 10c: the check covers the launch folder and `@project`, against the resolved writable set (section 7, Launch pipeline, C1), and each `protected_names` entry carries `on_link`. `"protect-target"` is the behavior above, OpenCode's. `"refuse"`, Pi's for `.pi` and `.omp`, refuses the launch when the name is a link, or is a folder holding a link to a writable place outside it, as pi-sandbox-guard does (PR #8). Links that stay inside the folder, such as npm's `.bin` links, or that point to places the launch cannot write are accepted.

### Every installed harness

The base profile write-protects the engine folder (launcher, profiles, shims, vendored code, state), OpenCode Guard's engine folder `~/Library/Application Support/OpenCodeGuard` (the forwarders, section 10), the list folder, `~/Applications/Agent Guard.app`, `~/Library/LaunchAgents` and eight shell startup files. It also stops home, `~/Library`, `~/Library/Application Support`, `~/.config` and `~/Applications` from being renamed or removed. The profile adds its own paths and names.

Planned, step 10c: the protection union. Every launch denies writes, creation, rename and removal for the protected paths, names and state configuration of every installed profile, not only the one being launched; otherwise an ALLOW entry could expose another harness's plugin or config. During an install or update transaction, "installed" means the candidate inventory in the transaction plan (section 6, Planned: installer structure); after it, the version stamp's `harnesses`, which records what was committed. The launched profile's own protections are always included. Installing Pi therefore changes OpenCode's policy; that is intended (the compatibility matrix in section 11).

Pi and OMP configuration is protected at three root levels, all rendered from `state_config`:

1. **Root families**, matched lexically: `~/.pi/agent` and any root Pi accepts under `~/.pi`, including nested relocations; OMP's `~/.omp`, `~/.omp-*`, `~/.omp.*` and `~/.omp_*`, each with its base, `profiles/<name>/` state root and `agent/` child kept distinct, as pi-sandbox-guard's parameters do.
2. **The launch's own canonical roots** from R6 (section 7, Launch pipeline), exactly, with their ancestors pinned against rename and replacement.
3. **Recorded canonical roots.** Each launch records the canonical roots it resolved in `state/roots.json`, outside the sandbox before exec, and every later launch of any profile protects them too. This covers a family member that links elsewhere, such as `~/.omp-work` linked into `~/Projects`, which the lexical families miss.

A linked root is protected, not refused, so existing layouts keep working. No guarded launch writes configuration, including its own harness's; `state_grants` cover runtime data only.

The engine's persistent records, `state/bindings.toml` (Executables and launch links), `state/roots.json` and `state/wrappers.json` (custom Pi wrappers, section 11), are inside the write-protected engine folder.

### Credentials

Planned, step 10c. One credential set, defined once in engine data, taken from pi-sandbox-guard's `sandbox/pi-sandbox.sb`:

- write denies on `~/.ssh`, `~/.aws`, `~/.docker`, `~/.gnupg`, `~/.kube`, `~/.config/gh`, `~/.config/gcloud`, `~/.git-credentials`, `~/.config/git/credentials`, `~/.netrc`, `~/.npmrc` and `~/.secrets`;
- read denies on the same set, with `~/.aws`, `~/.docker` and `~/.kube` narrowed to `~/.aws/credentials`, `~/.aws/config`, `~/.docker/config.json` and `~/.kube/config`;
- read denies on `.env` and `.env.*` files anywhere.

Entries apply whether or not the path exists. An entry may carry an environment requirement: `~/.npmrc` carries `NPM_CONFIG_USERCONFIG=/dev/null`, so npm never reads the denied file.

`credentials = "mandatory"` (Pi) applies the set. `"list"` (OpenCode) applies only what the Guard List denies, as built (decision D2, section 15). List DENY entries apply to every harness either way, so Pi's protection does not depend on the user accepting a list proposal (section 11).

### Git hooks

Planned, step 10c, switched on by `hooks = "protect"`. Write denies cover `<@project>/.git/hooks`, the active hooks folder resolved at launch (section 7, Launch pipeline, R8), every `hooks` folder under `.git/modules`, and the hooks in OMP's worktrees (`wt/` under the OMP state root). Exceptions keep `git init` and ordinary source work: the project's and submodules' hooks folder nodes and the `*.sample` files directly in them; in OMP worktrees, hooks folder nodes and files with an extension directly in them (Git's hook names have none, so source such as `src/hooks/useFoo.ts` stays editable). The active hooks folder gets no exception.

The exceptions narrow the hooks denies only. Each is rendered as `(require-all <exception> (require-not <list DENY or READ ONLY>) (require-not <union>))`, or the builder re-emits the list restrictions and the union after the exceptions; either way "DENY always wins" (section 4) holds. Conformance cases cover the collisions: a DENY or READ ONLY entry over a project's `.git`, and a READ ONLY entry over an OMP worktree.

`.git/config` stays writable, so a `core.hooksPath` change during a session remains a residual risk, as in pi-sandbox-guard; the Pi analyzer's ask on `core.hooksPath` stays.

### SBPL parameters

As built, the builder passes `HOME`, `DARWIN_TEMP`, `DARWIN_CACHE` and `GUI` as `-D` parameters, and `path_rules` in `engine/launch` writes every profile path relative to `HOME` (`(subpath (h ...))`), so it assumes every path is under home. Step 8 removes both limits. Planned: the state roots, `@project` and the active hooks folder (R6 to R8) become named parameters, `PROJECT`, `ACTIVE_HOOKS`, `PI_AGENT_STATE`, `OMP_AGENT_STATE`, `OMP_STATE_ROOT` and `OMP_BASE_ROOT`. A runtime that is not launched gets no parameters and renders no rules, so pi-sandbox-guard's `/private/tmp/pi-sandbox-guard-unused` placeholders are not needed.

### Event log

Planned, step 10c. One folder, `~/Library/Logs/Agent Guard/`, created by the launcher. Inside the sandbox it is writable and not readable, the SBPL semantics of pi-sandbox-guard's log today (`file-write*` allowed, reads denied); this is not append-only enforcement. The Pi analyzer's log moves there from `~/.pi/agent/security-events.log` with its current semantics: umask 077, mode 0600, full command text. The analyzer takes the path from its checker, not from `$HOME`. New behavior: the launcher rotates the analyzer log at launch, outside the sandbox, opening it without following links.

Open hypothesis, not tried: the agent can replace the log with a link, and a later write outside the sandbox follows it. Unguarded, the plugin refuses tools before any checker runs, so the analyzer does not run there, except with `AGENT_GUARD_BYPASS=1`. Whether SBPL can deny link creation in the folder while allowing writes is unverified; if it can, the conformance suite checks it.

For OpenCode the cc-safety-net audit log stays in `~/.cc-safety-net/logs`, readable, as built. Moving it with `CC_SAFETY_NET_AUDIT_HOME` is an OpenCode opt-in.

### Executables and launch links

Planned: the harness executable, its interpreter and every launch link on the way to them (shim, symlink) are protected against replacement and against renames of their parent folders. Homebrew's prefixes (`/opt/homebrew`, `/usr/local`) are owned by the installing user, so Seatbelt policy, not ownership, stops the agent writing there. Today the OpenCode executable is protected only by the base write deny: an ALLOW entry such as `/opt/homebrew` passes the list checks and makes it writable.

Planned, step 10c: one selection procedure for every profile, per runtime, with pi-sandbox-guard's precedence (`resolve_agent_executable` in `sandbox/pi-sandbox-preamble.zsh`):

1. **Override.** The variable named by `override_env` (`PI_EXECUTABLE`, `OMP_EXECUTABLE`), accepted only when its resolved path is under `trusted_prefixes`; an override that fails the checks refuses the launch. An override can route around a stale binding, as today.
2. **Binding.** The runtime's record in `$engine/state/bindings.toml`, write-protected with the engine folder; no environment variable selects the file. A binding is trusted without the prefix rule because the operator recorded it.
3. **Discovery.** `cli_names` on the harness `PATH` (the pinned `path` when the profile sets one, as pi-sandbox-guard searches its pinned `PATH`), then `cli_search`, under `trusted_prefixes` when the profile sets them.

Every candidate must be an executable regular file, must not be a guard shim (section 10, rule 8, extended to pi-sandbox-guard's shims by their location and the `pi-sandbox-guard` marker in their text) and must not lie inside the resolved writable set (section 7, Launch pipeline, C2). The same check applies to two interpreters, kept as separate records:

- the **harness interpreter**: for Pi, the `node` that runs a Node-shebang target; a native target has none;
- the **checker interpreter**: the Node that runs the Pi analyzer's helpers, today `.guard-node` beside pi-sandbox-guard's extension.

They are separate because OMP's `process.execPath` is its own native binary (pi-sandbox-guard `scripts/deploy-local.sh`), so a native Pi or an OMP target has no harness interpreter while the checker still needs one. The installer imports `.guard-node` through the same validation (section 11, The Pi migration). A Node path from Homebrew is recorded as its formula's `opt` link when that link resolves to the same Cellar executable, so a formula upgrade needs no rebind (pi-sandbox-guard #10, `ops_stable_node_path` in `scripts/lib-ops.sh`); this stays Node-specific.

A stale binding fails closed: the launch refuses with the recorded path and the `agent-guard bind` command that fixes it.

OpenCode keeps today's selection (`PATH`, then `cli_search`, skipping guard shims) until it opts in. The writable-set check closes the `/opt/homebrew` gap above and is the first recommended opt-in.

`agent-guard bind` (section 6) replaces pi-sandbox-guard's `scripts/bind-executable.sh`: `--show`, `--check` (non-zero when a binding is stale), `--detect` (pi-sandbox-guard's install layout list, as data) and explicit `--pi`, `--omp`, `--node` (the harness interpreter) and `--checker-node` (the checker interpreter) paths. It refuses to run inside the guard, confirms on the terminal and writes `state/bindings.toml` atomically.

## 4. The Guard List

One list for all harnesses: `~/Agent Guard/Guard List.txt`. The launcher reads it at each launch; edits apply at the next launch. Same headings and rules as OpenCode Guard:

- Headings are ALLOW, READ ONLY (or READ-ONLY) and DENY, in any case, optionally followed by `-` or `:` and text. Lines before the first heading and lines starting with `#` are ignored.
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

Every entry applies to every harness, so a list import is a policy change, not a copy. The installer shows the proposed list and what each harness gains or loses once, writes nothing until the user confirms, and never overwrites an existing `~/Agent Guard/Guard List.txt`. The OpenCode Guard import is in section 10. Adding Pi changes policy even when the list needs no edit: with `~/Projects` under ALLOW, Pi can write to every project there. The Pi migration shows what Pi gains from the shared list and asks before switching (section 11, The Pi migration).

## 5. Inner layer

Recommendation: Agent Guard's plugin core checks file paths for every harness, and shell commands go to the profile's checker chain: cc-safety-net for OpenCode, pi-sandbox-guard's bash analyzer for Pi. The inner layer is advisory; Seatbelt is the boundary.

The OpenCode plugin as built (`profiles/opencode/plugin.js`):

- **Guard probe.** It creates a file in the engine's `state/` folder. EPERM means guarded. Success, any other error, a missing folder or a symlinked folder means unguarded.
- **Unguarded refusal.** Unguarded, it refuses every tool except `invalid`, `question`, `todowrite`, `webfetch`, `websearch`, `plan_exit` and the status tool, with a message to quit and open Agent Guard or run `opencode` from a new terminal. `AGENT_GUARD_BYPASS=1` lifts the refusal; OpenCode Guard's `OPENCODE_GUARD_BYPASS` does not. This also covers any launcher that bypasses the guard, including custom wrappers.
- **Path checks.** Guarded, it refuses every tool if cc-safety-net fails to load. `read`, `glob`, `grep`, `list` and `lsp` are refused under DENY. `edit`, `write` and each path in `apply_patch` are refused when the path is protected (the engine folder, OpenCode Guard's engine folder, the list folder, `~/.config/opencode`, `~/.cc-safety-net` or a protected name on the path as typed or as resolved), under DENY or outside ALLOW and temp. Writes are refused when `state/rules.json` could not be read.
- **Release.** The plugin finds its release from its own real path (`realpathSync` of `import.meta.url`), whatever link OpenCode loaded it through. A copy whose real path is not inside a release folder in `releases/` loads no cc-safety-net: guarded, it refuses every tool, and it registers no status tool, so `check` fails.
- **Launch release.** Before anything else, the plugin reads `AGENT_GUARD_RELEASE`, which the launcher sets to its own release ID. OpenCode loads the plugin through `current`, so after an update a session started from the previous release would otherwise load the new release's plugin. If the value matches `[0-9A-Za-z.+-]+` (not `.` or `..`), differs from the plugin's own release and names a folder in `releases/` that holds `RELEASE` and whose `profiles/opencode/plugin.js` really lives there, the plugin imports that file and returns its plugin function instead of its own. That module is then in its own release, so it does not hand over again. If the named release is missing or fails to load, the plugin loads no cc-safety-net: guarded, it refuses every tool with "Agent Guard was updated; quit and reopen OpenCode."; unguarded, it refuses as usual. Any other value, and an unset variable (a bare `opencode`), leave the plugin on its own release. Only folders in the write-protected `releases/` qualify, so the variable cannot pick code from a writable place.
- **Shell commands** go to cc-safety-net 2.4.14, loaded from `vendor/` of the release the plugin resolves into. The profile sets `CC_SAFETY_NET_PARANOID_RM=1` and unsets `CC_SAFETY_NET_HOME`, `CC_SAFETY_NET_WORKTREE` and `SAFETY_NET_WORKTREE`. Guarded, the plugin also deletes those three from its own environment and sets `CC_SAFETY_NET_PARANOID_RM=1` before it loads cc-safety-net; unguarded, it leaves the environment alone. The installer adds an Agent Guard rulebook.
- **Status tool** `agent_guard_status` reports whether the guard is active, with that release's version and ID (`Agent Guard 0.2.0 (0.2.0-20261001T120000Z) is active.`); its description carries the same version and ID. `check` looks for it. It is registered only when cc-safety-net loaded.

### Plugin core and adapters

Planned. Step 9 splits `profiles/opencode/plugin.js` into `plugin/core.mjs`, used by every adapter, and `plugin/opencode.js`, the OpenCode adapter with the cc-safety-net compatibility wrapper; the 79 plugin checks stay unchanged (section 8). The adapter keeps a `.js` name, as the built plugin has: whether OpenCode loads a `.js` link whose target is `.mjs` is unverified. Step 10d adds `plugin/pi.mjs`, the adapter for Pi and OMP, `plugin/pi-entry.ts`, the `.ts` re-export that Pi's discovery loads, and the analyzer checker in `plugin/checkers/pi-analyzer/`.

The core:

- **Release, before registration.** The plugin computes its release from its own real path and compares it with `AGENT_GUARD_RELEASE`. In OpenCode it hands over to the launch release, as built. Until no kept release predates step 9, the handover also accepts that release's `profiles/opencode/plugin.js`, the path the built plugin uses. In Pi the launcher injects the launch release's copy with `-e`, and discovery may also load `current`'s copy. A copy whose release differs from `AGENT_GUARD_RELEASE` stands aside, registering nothing, only when Pi's arguments (`process.argv`) carry `-e` or `--extension` with the launch release's `plugin/pi-entry.ts`; that copy loads first and registers. Otherwise it hands over to the launch release as the OpenCode plugin does, with the same checks and the same refusal when that release is missing, so a stray or agent-set variable on a direct start cannot leave Pi with no plugin. On a direct start the variable is unset and the discovered copy registers. The decision is made at every load, so it holds across `/reload`.
- **Registration lifecycle.** Pi's `/reload` builds a new extension runner in the same process. In Pi 0.99.2, `reload` in `core/agent-session.js` emits `session_shutdown`, invalidates the old runner, has the resource loader clear its extension cache and load every extension again (`reload` in `core/resource-loader.js`), builds a new runner and emits `session_start`. Process-wide state such as `globalThis` survives. The plugin therefore registers its handlers and tools on every load it is given, with no process-wide "already registered" flag, which would outlive the handlers it stands for. Per-event deduplication of copies of the same source, and independent verdicts for different physical copies, stay as pi-sandbox-guard has them (`src/index.mjs`).
- **Probe**, as built: an `O_CREAT|O_EXCL|O_NOFOLLOW` create in `state/`; EPERM means guarded.
- **Snapshot.** Read from the file `AGENT_GUARD_STATE` names (section 7, Per-launch snapshot), accepted only as a regular file directly in `state/launch/`. Writes are refused when it is missing or malformed. A snapshot of another profile or runtime than the adapter's counts as unguarded (below): a Pi started directly inside an OpenCode session inherits OpenCode's variables, and the probe alone would report it guarded.
- **Decisions.** `decide({op, paths, cwd})` checks reads (a folder listing is a read) and writes against the snapshot's projection: DENY, READ ONLY, a write outside ALLOW, temp and the runtime grants, the protection union (section 3, Every installed harness) on the path as typed and as resolved, and dangling links, which are refused. These are the built semantics, generalized. Pi gains them at step 10d; pi-sandbox-guard's extension checks only `bash`.
- **Unguarded refusal.** Every tool except the adapter's safe set is refused unless `AGENT_GUARD_BYPASS=1`, as built. For Pi this is a behavior change (section 11).
- **Status text**, as built, and the checker chain (below).

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

The wrapper forwards `config` unchanged and returns any other hook the entry adds, as today (`...(net ?? {})`). Only `tool.execute.before` joins the checker chain, after the core's path checks. Calling the check alone would drop the command and could pick the wrong dialect. The environment handling (unset `CC_SAFETY_NET_HOME`, `CC_SAFETY_NET_WORKTREE` and `SAFETY_NET_WORKTREE`; set `CC_SAFETY_NET_PARANOID_RM=1`) moves into the wrapper unchanged.

### Plugin injection by command

Planned for step 10d. The tables are runtime data (`admin_commands`, `refused_commands`, `value_options` in `[runtime.<name>]`, section 3); `args_hook` classifies the command at R5 and C3 adds the plugin (section 7, Launch pipeline).

Pi 0.99.2 loads extensions for interactive, print, JSON and RPC sessions and for `--help` and `--list-models`. It handles `auth`, `install`, `remove`, `uninstall`, `update`, `list`, `config`, `mcp`, `--version` and `--export` before it loads any (`main.js`). The Pi runtime injects `-e` for every command that loads extensions and for no other. pi-sandbox-guard does not inject for `--help` and `--list-models` (`is_runtime_command` in `launchers/pi`); its discovered copy loads there, but `-ne` or a settings entry can remove it.

OMP keeps pi-sandbox-guard's tables from `launchers/pi` until OMP is observed (section 15):

- no injection for `agents`, `auth-broker`, `auth-gateway`, `bench`, `browser-relay`, `completions`, `config`, `dry-balance`, `gallery`, `gc`, `grep`, `grievances`, `install`, `models`, `plugin`, `read`, `say`, `search`, `setup`, `shell`, `ssh`, `stats`, `tiny-models`, `token`, `ttsr`, `update`, `usage` and `worktree`, or for `--alias`, `--export`, `--list-models`, `--help` (`-h`) and `--version` (`-v`);
- `--profile`, `--cwd`, `--config` and `--add-dir` take a value, and `--allow-home` and `--offline` do not; classification skips them. `--` or any other option makes the command an agent session;
- `cleanse`, `commit` and `join` are refused, because they reject `--extension`.

### Checker chain

Planned with the core: step 9 for OpenCode, step 10d for Pi. A checker takes `{tool, op, command?, paths?, cwds, ctx}`, declares which tools and inputs it applies to, and returns `allow`, `ask` or `block` with a reason and a rule ID. The core runs the profile's `checkers`, read from the snapshot, over the checkers that apply and keeps the worst verdict. A checker error, timeout or unhealthy state blocks the call. The adapter maps `ask` (table above).

- **OpenCode:** `["cc-safety-net"]`, through the compatibility wrapper. Behavior is unchanged, including cc-safety-net's secret-path checks on file tools and its audit log in `~/.cc-safety-net/logs`.
- **Pi:** `["pi-analyzer"]`, for `bash` input only, so a `powershell` call gets no checker, as today. pi-sandbox-guard's `src/guard-core.mjs` and `src/validate-bash-command.sh` move to `plugin/checkers/pi-analyzer/` unchanged (decision D5) except for the log path (section 3, Event log) and the Node that runs the helpers, which comes from the checker interpreter binding instead of the `.guard-node` file beside the extension (section 3, Executables and launch links). The rest carries over: the allow-listed subprocess environment, preflight and degraded mode, the 2-second timeout with process-group kill, output caps, normalization probes, exit-code verdicts and `POLICY_RM_SAFE_ROOTS`.

cc-safety-net 2.4.14 ships entry points for OpenCode and Pi, and a hook mode for Claude Code, Codex, Copilot CLI, Cursor, Gemini CLI, Grok Build, Kimi Code, Antigravity CLI, Amp, OpenClaw and Hermes Agent. One upstream blocker would be less to maintain than a second analyzer (`src/validate-bash-command.sh`, 4,417 lines). Even so, adding cc-safety-net to Pi's chain, adding the analyzer to OpenCode's and replacing the analyzer are not part of step 10 (decision D5, section 15). A replacement needs a characterization run and an ask layer first. The core's fail-closed handling applies to any checker. The cost, all on the Pi side:

- cc-safety-net only blocks or allows; it has no ask verdict. Without an ask layer, Pi users lose the analyzer's confirm prompts.
- The characterization run puts Pi's 383 corpus cases, with allow, ask and block verdicts, and the adapter's contract (malformed and empty input, degraded mode, ask mapping) through cc-safety-net, both interactively and headless (Pi turns ask into block when no one can confirm). Each case where cc-safety-net differs needs a written decision: a rule in an Agent Guard rulebook (cc-safety-net takes custom rules), an upstream report or an accepted change.
- Whether cc-safety-net's Pi entry loads in OMP is not verified.

## 6. Install, update and uninstall

### The installer as built

`profiles/opencode/install.sh` has three entries. The bootstrap runs `install.sh --stage <txn>` on the unpacked tree in `stage/<txn>/tree`, under the lock it took. From a checkout or an unpacked archive, `zsh install.sh [--projects DIR] [--gui]` copies the tree into `stage/<txn>/tree` (with `COMMIT` set to `checkout` when the tree has none) and runs that copy the same way. Recovery runs `state/txn/install.sh --recover <caller>` (below). Every function runs from `main` on the last line, so a file replaced or deleted mid-run is never read half-way.

Preflight changes nothing and stops on the first failure: required tools; the guard probe (an exclusive create in `state/`, and in OpenCode Guard's `state/` when it exists, refused with "run this from Terminal, outside any guard or sandbox" when Seatbelt denies it); the lock; recovery of an earlier run; an install made before release folders (`$engine/launch` a regular file, removed with its own `"$engine/uninstall.sh"`); OpenCode Guard's state on this Mac (section 10), with a migration's own checks; an unfinished PATH block, Agent Guard's or OpenCode Guard's, in a startup file; any file the run replaces on another volume than the engine; the projects folder. Only then does a run name its release ID and open a transaction.

**Lock.** `state/lock/` holds `pid` and `start`, the owner's start time from `ps -o lstart=`. A lock is live when that pid runs zsh with the same start time; a lock without both files counts as held for 10 seconds, so a run that is still writing them is not taken over. A stale lock is taken over under an `fcntl` lock on `state/.lock-takeover`. The bootstrap, the installer and `agent-guard update` hand the lock on through `exec`, which keeps the pid. A recovery child adopts its parent's lock and refuses to run without it.

**Transaction.** The installer builds `state/txn.new/` with copies of `install.sh`, `account.zsh` and `uninstall.sh`, `plan.json` (release IDs, kind, stage, projects folder, app decision and the config files) and an empty `journal`, syncs, and renames it to `state/txn/`. The journal has one line per step, `<action> begun|done|undone [detail]`; a line of any other form, such as a torn last line, is ignored. Before a step changes a file it copies the original to `txn/backup/<name>/file` through a temporary name. Runs before the switch (assemble into `stage/<txn>/release` and rename to `releases/<rid>`, the rulebook and merged `rule.json` in the stage, the app build with `codesign --verify --strict` and a bundle ID check, the list, then `releases/<rid>/launch check staged`) touch nothing outside the engine folder and the list.

**Switch.** In order: rulebook folder, `rule.json`, app, `current`, plugin link, permission values, PATH blocks. Each step journals `begun` before it changes anything and `done` after, and each has an undo that uses the backup and the journal detail. The app is rebuilt only when its inputs (the AppleScript, which names `bin/opencode-gui` through `bin`, the bundle ID and the icon) differ from the stamp's `app_inputs`; otherwise the installed app is kept. The permission record is written before the config it describes, so a run stopped between the two writes leaves a record that matches either config state. `/bin/sync` runs after each `begun` line, after the transaction opens and after the stamp is written.

**Gate.** After the switch: `bin/agent-guard doctor` against the live install, then `bin/opencode --version` through the PATH shim with a 20-second limit, whose log must name the new release. With no OpenCode CLI the launch check is skipped and says so. Any failure rolls back.

**Rollback.** Journals `rollback begun`, undoes every step that began, in reverse order, journals `rollback done`, deletes the new release and closes the transaction (one rename, then deletion, so an interrupted deletion leaves no half transaction). A rollback of a fresh install also removes the engine folder; a permission record that is not empty is first copied to `~/Agent Guard/permissions-backup.json`.

**Stamp and cleanup.** `state/stamp.json` is written only after the gate passes: version, tag, commit, release ID, install time, `app_inputs`, the SHA-256 of every file in the release folder, the app and the rulebook, and the targets of `current`, `bin` and the plugin link. Cleanup then journals `cleanup begun`, removes release folders other than the new one and the one `current` named before (the kept one serves sessions started from it, section 5), deletes the stage and closes the transaction.

**Recovery.** Every install, update and uninstall first runs `ag_recover`: it stops a `serve` left by `check staged` (`state/.serve.pid`), deletes `state/txn.new`, and when `state/txn` exists runs the copy of the installer in it, which decides from the stamp and the journal:

| State | Action |
|---|---|
| The stamp names the new release | finish the cleanup |
| No switch step began | discard: delete the new release and the stage, close the transaction |
| `rollback begun` is journaled, or the caller is uninstall | finish the rollback |
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

- `doctor` runs the release's `launch check` (section 8). The gate runs it after the switch. It does not recover an interrupted run; `update` does.
- `version` prints `Agent Guard <version> (<tag>, commit <12 characters>), release <rid>, installed <UTC time>` from the stamp, then one line per stamped file or link that is missing or changed and per file added to the release folder. It exits 1 on any drift or when there is no stamp.
- `update` refuses inside a guard, takes the lock and runs recovery, then removes the forwarders when their time has come (section 10), then downloads the latest release's `install.sh` from the download base compiled into it. It requires the file's last line to be `{ agent_guard_bootstrap "$@" }` and exactly one release tag in it. When that tag is the stamp's, or older, it says so and changes nothing; otherwise it runs the bootstrap with `--update` under the same lock, and the full staged install follows. A failed update leaves the installed version working.
- `uninstall` refuses inside a guard, takes the lock and runs recovery as the uninstall caller, which rolls back an open switch. Recovery can delete the release this command runs from, so it then finds the uninstaller again: `current`'s, else the transaction's copy. When recovery rolled back a fresh install and only the state folder is left, it removes the engine folder itself, first copying a permission record that still holds entries to `~/Agent Guard/permissions-backup.json` and then exiting 1.

Planned at step 10: `agent-guard bind` shows, checks, detects and records harness executables and interpreters (section 3, Executables and launch links); `agent-guard wrapper add|remove|list` maintains custom Pi wrappers, and `doctor --json` gives `doctor`'s results as JSON (section 11, Commands).

### Uninstall

`profiles/opencode/uninstall.sh` runs in this order. Until the plugin goes, a start without a PATH block meets the plugin's unguarded refusal, and an old terminal still reaches working shims.

| Step | What |
|---|---|
| U1 | PATH blocks between the markers in `.zprofile`, `.zshrc` and `.bash_profile`, at each file's resolved target; an unfinished block is reported, not touched |
| U2 | Each recorded permission value, only where the current value still equals the recorded `wrote` value, so later user edits survive; an `orig` of null deletes the key, and a key with no recorded `wrote` value is left as is. A file's entry leaves the record once the file is restored. |
| U4 | The launcher app |
| U5 | The `agent-guard` entry in `~/.cc-safety-net/rules/rule.json`, then the rulebook folder |
| U6 | After a migration: OpenCode Guard's retirement if it is unfinished, then the forwarders at its old command paths and its engine folder, whatever the boot time (section 10) |
| U7 | If any value was not restored, the permission record is copied to `~/Agent Guard/permissions-backup.json`, and OpenCode Guard's imported record, if present, to `~/Agent Guard/opencode-guard-permissions.json`. If a copy fails, the engine is kept and uninstall exits 1. |
| U3 | The plugin, when it is a link into the engine folder or a regular file. If it cannot be removed, the engine is kept and uninstall exits 1. |
| U8 | The engine folder, renamed to `.AgentGuard.removing` and then deleted, so a rerun finds the whole folder or none of it |

Each step can be repeated, so a rerun after a failed or interrupted uninstall finishes the job. Uninstall exits 1 and names what is left when a PATH block, a permission value, the app, the rulebook or its `rule.json` entry was not handled.

It leaves `~/Agent Guard` (list, logs, any permission backup); the wrapper entries (`env`, `exec`, `nice`, `nohup`, `setsid`, `stdbuf`, `time`, `timeout`) in `rule.json`'s `transparent_wrappers`; the `~/.config/opencode/.gitignore` and default `opencode.json` the launcher creates when missing; the writable folders the launcher creates.

It also leaves `~/OpenCode Guard`. Uninstall never runs OpenCode Guard's uninstaller; after a migration it restores the imported values by the same rule (section 10).

### Planned: installer structure

Step 10b, in its own pull request, before any Pi code. `profiles/opencode/install.sh` (1,952 lines) is mostly generic transaction machinery; the rest is OpenCode's own steps (plugin link, permission merge) and the OpenCode Guard migration (detection, imports, forwarders, plugin swap, retirement). It is split into `installer/lib.zsh` (transaction, journal, lock, recovery, staging, gate, PATH blocks, app, list, rulebook), `installer/actions.zsh`, `installer/harness/*.zsh` and `installer/migrate/*.zsh`; the repository layout is in section 7, Structure. The OpenCode tests pass unchanged.

- **Action registry.** `actions.zsh` is the ordered list of switch actions, each labelled with its phase and holding paired do and undo handlers. Today the action set is written out three times: `ag_switch` runs the do steps, `ag_rollback` lists the undos in reverse, and `ag_switch_begun`, with which recovery decides whether a switch began, matches journal lines against a fixed pattern of action names. A journal whose only begun actions are missing from that pattern counts as no switch: recovery discards the new release and leaves those actions' changes in place. After the split all three derive from the registry, so an interrupted Pi action is rolled back.
- **Frozen recovery bundle.** Recovery already runs from copies: `ag_txn_open` copies `install.sh`, `account.zsh` and `uninstall.sh` into `state/txn/`, and recovery runs that `install.sh`. After the split the transaction also copies every module the registered undo handlers need, so recovery never depends on the new release being intact. The bundle lasts only as long as the transaction: `ag_cleanup` deletes `txn/backup` and the stage, then closes the transaction. A file that must outlive the commit, for uninstall or for the steps it prints, needs a durable copy outside the transaction, such as the Pi migration's legacy bundle (section 11, The Pi migration).
- **Candidate inventory.** `plan.json` names the harnesses the transaction installs. The staged checks, the switch and the gate use it, and so does the protection union while the transaction is open (section 3, Every installed harness). The stamp gains `harnesses`, the receipt of what was committed. It cannot be the gate's input: the gate runs before the stamp is written (`ag_switch`, `ag_gate`, then `ag_stamp_write`, in an install and in recovery), so during a first Pi install the stamp is missing or names OpenCode alone.
- **Sequential migrations.** `state/migration.json` becomes a list of `{from, switched_at, retired}` records. One run migrates one source; on a Mac with both old guards, OpenCode Guard is migrated first.

`doctor`, `update` and `uninstall` iterate over the stamp's `harnesses`.

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
| R4 | **Harness environment**, computed, not yet applied: `env_unset`, `env_set`, harness `PATH` (`inherit` or pinned), `rlimits`, and `refuse_env` variables, which stop the launch with a message. | `env_unset`, `env_set`, `path`, `rlimits`, `refuse_env` | PATH reset, `ulimit`, `SSH_AUTH_SOCK` and `GPG_AGENT_INFO` unset |
| R5 | **Arguments, parsed.** The runtime's selectors and command class (agent session, extension-loading command, administrative command, refused command), with option precedence. | `args_hook`, runtime command tables | `is_runtime_command`, `--profile` mirroring |
| R6 | **State roots.** The profile's `state_hook` resolves and canonicalizes this launch's roots, or refuses. | `state_hook` | `PI_CODING_AGENT_DIR`, `PI_CONFIG_DIR`, `OMP_PROFILE`, `PI_PROFILE`, `--profile` |
| R7 | **Project.** `@project` from `start_folder`; the refusal list of section 4; refusal inside a protected agent folder. | `start_folder` | `PI_PROJECT`, git top level, cwd |
| R8 | **Git hooks folder**, when `hooks = "protect"`: resolved with the probe environment; broad, home or project-containing results refused. | `hooks` | `git rev-parse --git-path hooks` |
| R9 | **Rules.** List parser (built) plus `@project`, state-root grants and the protection union (section 3, Every installed harness). Output: the resolved request, including the effective writable set and the protected set. | all policy fields | n/a |

**Decide:**

| # | Stage | Profile input |
|---|---|---|
| N1 | **Nested launch** (Nested launch, below), comparing the request with the enclosing launch: after R5 for `nested = "inherit"`, after R9 for `"same-boundary"`. An inherited launch skips C1 to C4 and uses the enclosing launch's release and executable. | `nested` |

**Compile:**

| # | Stage | Profile input |
|---|---|---|
| C1 | **Symlinked protected names** in the launch folder and `@project`: per name, `on_link = "protect-target"` (OpenCode, built) or `"refuse"` (Pi's `.pi` and `.omp`, including a link inside them to a writable place outside). Uses R9's writable set. | `protected_names[].on_link` |
| C2 | **Executable** (section 3, Executables and launch links), checked against R9's writable set; the app in `gui` mode (built). | `cli_names`, `cli_search`, `app_paths`, `app_bundle_id`; runtime binding keys, `override_env`, `trusted_prefixes` |
| C3 | **Arguments, final**: `gui_args` (built), plugin injection by command class (section 5, Plugin injection by command), refused commands. | `gui_args`, runtime command tables |
| C4 | **SBPL and plugin projection** from the policy model (section 3); the snapshot (Per-launch snapshot, below). | none |

**Execute:** create the writable folders, run `prepare_hook` (built), apply R4, record canonical roots in `state/roots.json` (section 3, Every installed harness), write the log `last-launch-<profile>.log` and the snapshot, then exec under `sandbox-exec` with `AGENT_GUARD_SANDBOXED=1`, `AGENT_GUARD_RELEASE` and `AGENT_GUARD_STATE`. An inherited launch applies R4 and execs without `sandbox-exec`; it creates and writes nothing. A launch refused before Execute changes no file; the zsh engine creates the writable folders and writes `state/rules.json` before it looks for the executable (`engine/launch`), so this is a recorded difference (Constraints, parity and rollback).

Stage by stage, step 8 builds for OpenCode: R1 to R3; R4 with `env_unset` and `env_set`; R6 for the cache root step 7 resolves (section 9); R9; N1 as built (section 2); C1 with `protect-target`; C2 with today's selection; C3 with `gui_args`; C4; Execute. Step 9 adds the snapshot. Step 10a adds `@project` for OpenCode (R7). Step 10c adds the engine capabilities, with OpenCode switched off: `path`, `rlimits` and `refuse_env` (R4); R8 and the hooks block; the root levels and recorded roots of the protection union; the `credentials` modes; `same-boundary` (N1); `on_link = "refuse"` (C1); bindings, the writable-set check and the checker interpreter (C2); the event log (section 3, Event log). Step 10d adds Pi's `args_hook` and runtime tables (R5, C3) and its `state_hook` (R6). The zsh engine is not extended.

### Per-launch snapshot

Planned for step 9. Each launch writes `state/launch/<profile>-<launch-id>.json` in the engine folder: immutable, versioned and write-protected, with its path in `AGENT_GUARD_STATE`. Environment variables carry its location, never copies of policy. Persistent data (bindings, roots, wrappers) stays in separate files. The snapshot records:

- profile, runtime, release ID, launch ID, snapshot version;
- `@project`, state roots, active hooks folder and, for `same-boundary`, the launch canary (Nested launch, below);
- the plugin projection: allow, read-only and deny sets; the protection union as prefixes and name patterns; the runtime grants that the plugin must allow (state-root grants, caches), so file-tool checks never refuse a write Seatbelt permits on purpose;
- the checker chain and its settings, including the checker interpreter (section 3, Executables and launch links);
- the executable and interpreter used.

Each step writes only the fields its behavior uses; step 9 writes OpenCode's. The safe tool set for unguarded refusal stays in each adapter, because an unguarded start has no snapshot.

It replaces `state/rules.json` (section 2) and pi-sandbox-guard's environment markers (`PI_SANDBOX_PROFILE_DIGEST`, the three boundary markers `PI_SANDBOX_PROJECT_BOUNDARY`, `PI_SANDBOX_ACTIVE_HOOKS_BOUNDARY` and `PI_SANDBOX_AGENT_STATE_BOUNDARY`, `PI_SANDBOX_SHIM_ACTIVE`, `PI_SANDBOX_RUNTIME_ACTIVE`). The plugin refuses writes when the snapshot is missing or malformed, and treats a snapshot of another profile as unguarded (section 5, Plugin core and adapters). The snapshot describes what a launch enforces; on its own it does not prove that the surrounding sandbox enforces it, and the variable that names it is the agent's to set.

### Nested launch

Planned: step 8 keeps the built decision (section 2); step 9 reads the snapshot; step 10c adds `same-boundary`. A launch is **confined** when a trivial `sandbox-exec` call fails (built). As built, only `cli` mode runs a nested launch; every other mode refuses.

The decision runs at one of two points. For `nested = "inherit"` it runs after R5, as the zsh engine decides before it reads the list; when the launch inherits, R6 to R9 do not run, so a list or `@project` that would fail to resolve does not refuse a launch the zsh engine runs. For `nested = "same-boundary"` it runs after R9 and compares fully resolved boundaries.

| Confined | Enclosing launch | Request | Result |
|---|---|---|---|
| No | any marker | any | Markers are ignored; the launch proceeds (built). |
| Yes | `OPENCODE_SANDBOXED=1` from OpenCode Guard, until step 11 | OpenCode | Run directly, as built (section 10). |
| Yes | `AGENT_GUARD_SANDBOXED=1` and no snapshot, until step 11: a session started from a release before step 9 | OpenCode | Run directly, as built. |
| Yes | `AGENT_GUARD_SANDBOXED=1`, a valid snapshot of the same profile and runtime | `inherit` (OpenCode) | Run directly under the enclosing policy, as built. |
| Yes | the same | `same-boundary` (Pi) | Run directly when the snapshot names the same `@project` and state roots as the request, and the launch canary and the behavioral probes below pass. Otherwise refuse. |
| Yes | a valid snapshot of another profile or runtime | any | Refuse (decision D3, section 15). |
| Yes | anything else: no marker, an unreadable snapshot, no snapshot for a Pi request | any | Refuse. |

**Launch canary.** Each `same-boundary` launch denies writes to one file unique to it, `agent-guard-canary-<launch-id>` in the per-user temp folder, which every profile otherwise allows, and its snapshot names that file. A nested launch inherits only when an exclusive create of it fails with EPERM. Only the sandbox compiled for that launch denies the file, so an enclosing OpenCode sandbox or another Pi launch's sandbox cannot pass, whatever its list holds, and a snapshot named by an agent-set `AGENT_GUARD_STATE` proves nothing on its own. Any other result, including EEXIST, refuses. With the protection union in force (section 3, Every installed harness), an enclosing OpenCode sandbox already passes pi-sandbox-guard's engine and extension probes, and its list can pass the credential probes; the canary is what ties the request to the enclosing policy.

The behavioral probes are pi-sandbox-guard's (`verify_existing_confinement` in `sandbox/pi-sandbox-preamble.zsh`), kept as a check that the enclosing policy still holds, plus two new ones: the project is writable; home, the active hooks folder, `~/.pi/agent/extensions` and, for OMP, its extensions and plugins folders are not writable; `~/.ssh`, when present, cannot be listed; one credential read deny holds (new); the engine folder is not writable (new).

An inherited launch writes no snapshot, claims no policy it does not enforce, and uses the enclosing launch's release and executable: from its snapshot, or as built when there is none. The cross-profile refusal is not a boundary: an agent can unset `AGENT_GUARD_STATE`, and an OpenCode request then runs directly under whatever sandbox encloses it, which still applies its own policy. This removes a pi-sandbox-guard defect at 7ad441f: when its re-entry check (`own_policy_reentry`) passes, `sandbox/pi-sandbox-preamble.zsh` returns before it sets `PROJECT`, `HOME_CANON` and `TMPDIR_CANON`, and `launchers/pi`, which runs under `set -u`, then passes all three to `executable_under_sandbox_write_root` when a `.guard-node` binding exists, so an agent-session re-entry exits. It fails closed.

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
- each protected path, root level (family, own canonical root, recorded root, linked root; section 3, Every installed harness) and protected name is denied for write, creation, rename and link replacement, directly and through a symlink, in the project, in temp and inside another profile's writable folders;
- DENY entries are denied for reads;
- the credential and hooks blocks, where the profile switches them on, and the hooks collision cases of section 3, Git hooks;
- `open` and `osascript` are denied;
- the plugin loads inside the guard;
- tools are refused when the harness runs unguarded;
- the nested-launch cases of section 7, Nested launch;
- a launch from each entry and through each recorded custom wrapper.

**`doctor` versus conformance tests.** `doctor` is the small check that runs on an installed Mac: the installer's self-test, `update` and step 6's per-Mac check. It is `agent-guard doctor`, which runs the release's `launch check`: a protected write is denied, a temp write is allowed, `open` is denied, then the OpenCode hook starts `opencode serve` under the guard and looks for the guard's status tool. It skips the plugin check, and still passes, when the OpenCode CLI is not found. Step 7 extends it to check that the configured plugins loaded (section 9). The conformance suite and the integration checks are development tests. They run from the repository in a disposable home and are not installed. This replaces the draft's plan to run the conformance suite as the installer's self-test.

**Pi suites, carried over at step 10.** Every pi-sandbox-guard test case (7ad441f), including the manual ones, gets a home here or a written reason to retire it:

- **Conformance cases.** `test/shim.mjs` (executable resolution, config pinning, nested launch) and `scripts/test-sandbox-profile.sh` become conformance cases for the Pi profile. They first serve as acceptance cases for step 10c's engine capabilities.
- **Plugin case table.** One table, run through a driver per adapter: DENY, READ ONLY, protected, union, runtime grants, `~`, patch, dangling link, unguarded, bypass, handover, state missing or malformed. `test/adapter.mjs` and `test/degraded.mjs` join it. Pi lifecycle cases: `/reload`, session replacement, and discovered plus injected copies of one release and of two releases (section 5, Plugin core and adapters).
- **Checker corpus.** The 383 cases of `test/corpus/corpus.json` and `test/smoke.mjs`'s regressions run through the core and the Pi analyzer checker, as characterization. The one pinned gap (`expectFail` in the corpus) stays pinned.
- **Pi-only cases.** Runtime selection, OMP profiles and `--profile` placement, command classes and option precedence, `refused_commands`, `-e` injection per command (section 5, Plugin injection by command), state-root refusals, and native Pi and OMP with no harness interpreter.
- **Installer cases.** Recovery after every registered action and after cleanup (section 6, Planned: installer structure), and uninstall after a Pi migration (section 11). `scripts/test-ops.sh`'s deploy and status cases become installer and migration tests, which run in CI; today they run in no gate.
- **Retired, with reasons.** TMPDIR validation: the engine never takes `TMPDIR`, and one conformance case shows that `TMPDIR=/` or `TMPDIR=$HOME` widens nothing. The `--deployed` launcher checks (below). The sibling-extension test seam (`launchers/pi` prefers `pi-sandbox-guard-extension/index.ts` beside the shim, which `test/shim.mjs` uses): the launcher injects one path, the launch release's plugin. The `PI_SANDBOX=0` branch of `sandbox/pi-sandbox-preamble.zsh`: unreachable, since `launchers/pi` pins `PI_SANDBOX=1`.
- **Manual.** `test/e2e-demo.mjs` becomes a manual Pi check in step 10d's verification.

`scripts/check-launchers.mjs` runs once in `--sources` mode for the custom Pi wrapper scripts. Its `--deployed` mode expects zsh shims and would reject Rust ones, so launch behavior is verified by the conformance suite instead (section 11).

## 9. OpenCode package store

OpenCode Guard v1.0.3 lets an agent change cached npm plugin code that OpenCode imports at its next start. Its profile allows writes beneath `~/.cache`, which holds OpenCode's npm package store. Stage 1 kept this unchanged. A spike on 2026-09-28 measured the write access under the v1.0.3 profile; that OpenCode then imports the changed code comes from its source, not from running a payload. Protection is step 7.

### Evidence

OpenCode 1.18.33, installed by Homebrew; its tag is commit `51ef4be1d3c122f18fefb510dca8d778571f4f18`. `XDG_CACHE_HOME` was unset, so the default cache root applied.

- [core/global.ts:10–25](https://github.com/anomalyco/opencode/blob/51ef4be1d3c122f18fefb510dca8d778571f4f18/packages/core/src/global.ts#L10) derives OpenCode's cache folder from the XDG cache root. Data, state, logs and the cache's `bin` folder are separate.
- [plugin/shared.ts:207–213](https://github.com/anomalyco/opencode/blob/51ef4be1d3c122f18fefb510dca8d778571f4f18/packages/opencode/src/plugin/shared.ts#L207) resolves configured npm plugins through `Npm.add`; an unversioned name means `@latest`. OpenCode does not run arbitrary files from the cache.
- [core/npm.ts:87 and 124–145](https://github.com/anomalyco/opencode/blob/51ef4be1d3c122f18fefb510dca8d778571f4f18/packages/core/src/npm.ts#L87) uses `<cache>/packages/<specifier>/node_modules/<package>`. If that folder exists, it resolves the existing entry point without restoring the package; otherwise it installs into the store. The file read had Git blob hash `94e573d12da938336fc5922b69fc342e401105e9`, matching GitHub's metadata for that commit.
- [plugin/loader.ts:94–101 and 136–145](https://github.com/anomalyco/opencode/blob/51ef4be1d3c122f18fefb510dca8d778571f4f18/packages/opencode/src/plugin/loader.ts#L136) resolves the configured plugin and imports its entry point.
- The [plugin documentation](https://opencode.ai/docs/plugins/#how-plugins-are-installed) still names the older `~/.cache/opencode/node_modules/`. The probe covers both layouts.
- [OpenCode Guard v1.0.3 profile:6–22](https://github.com/ebrindley/OpenCodeGuard/blob/9242c1ad45c895efd63e903e1b27d7bab53620ad/engine/profile.sb#L6) allows writes beneath `~/.cache`. Its protected paths and names do not cover package entries.

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

Write-protect the effective package store and nothing more:

- the current store, `<cache>/packages/` with its metadata and dependencies (`~/.cache/opencode/packages` by default);
- the legacy store, `~/.cache/opencode/node_modules`, and its install metadata;
- both of these under a relocated `XDG_CACHE_HOME`. A hard-coded default path does not cover a relocated store.

Keep the general `~/.cache` grant and place the narrower deny after it. Data, state, logs, temp and the rest of the cache stay writable. Freezing all of `~/.cache`, or all of OpenCode's cache, is not needed to protect plugin packages. Step 7 confirms the store paths for the supported OpenCode versions.

### Cost

- Missing plugin packages and their dependencies cannot be installed from inside the guard. Package maintenance runs in an operator session outside it; step 7 documents how.
- A fully populated store resolves without writing, so installed packages should keep working. This is expected from the source, not tested.
- The same store holds npm language servers. [lsp/server.ts:125](https://github.com/anomalyco/opencode/blob/51ef4be1d3c122f18fefb510dca8d778571f4f18/packages/opencode/src/lsp/server.ts#L125) finds TypeScript's through `Npm.which`, and [core/npm.ts:200–245](https://github.com/anomalyco/opencode/blob/51ef4be1d3c122f18fefb510dca8d778571f4f18/packages/core/src/npm.ts#L200) installs a missing binary. First-use downloads and repairs also need operator maintenance.
- OpenCode can report and skip a plugin that failed to install, so "OpenCode started" does not prove the configured plugins loaded. Today's plugin check (`opencode_check` in `profiles/opencode/hooks.zsh`) looks only for the guard's own status tool.

Step 7 is done when configured plugins load, a representative npm language server works, the message for a missing package is clear, replacing or renaming the store is denied and `doctor` checks the configured plugins, not only the status tool.

### Scope and limits

This is a persistence and plugin-integrity gap, not a Seatbelt escape. A guarded restart runs the changed code under Seatbelt. A later start without the guard, made on purpose, imports it with that process's full authority. Disabling the inner layer this way was not attempted. The path deny does not give integrity of all loaded code, or credential isolation. Pi had the same class of gap in `~/.pi/agent/npm`, closed by pi-sandbox-guard #9.

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
10. **What stays.** `~/OpenCode Guard`, with its list, log and any permission backup, is never removed, as OpenCode Guard's own uninstaller keeps it. The forwarders stay until no shell started before the switch can remain: the installer records the switch time, and the first `update` (or install) after the Mac's boot time passes it removes them. Boot time is `sec` from `/usr/sbin/sysctl -n kern.boottime` (`{ sec = N, usec = M } …`); if the command fails or the output does not parse, the forwarders stay. Uninstall removes them too.
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

Step 10d, after `@project` is defined for OpenCode (section 4) and after the Rust launcher (section 7). The source is pi-sandbox-guard at #10 (commit `7ad441f`). Statements about OMP come from pi-sandbox-guard's code and documents; OMP itself was not observed and is re-observed at step 10d (section 15).

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

### Installed layout additions

The repository layout is in section 7, Structure. Installed, additions only:

```
$engine/bin/{opencode,opencode-gui,pi,omp,agent-guard}    shims; each passes its own entry name
$engine/state/bindings.toml                               recorded harness executables, harness interpreters and checker interpreters
$engine/state/roots.json                                  canonical Pi and OMP state roots seen at launch (section 3, Every installed harness)
$engine/state/wrappers.json                               custom Pi wrappers: names, historical names, hashes
$engine/state/launch/<profile>-<launch-id>.json           per-launch snapshot (step 9; section 7, Per-launch snapshot)
$engine/state/legacy/pi-sandbox-guard/                    durable legacy bundle (The Pi migration, item 8)
~/.local/bin/pi, ~/.local/bin/omp                         links to $engine/bin/pi and omp (same paths as pi-sandbox-guard)
~/.pi/agent/extensions/agent-guard.ts                     link to $engine/current/plugin/pi-entry.ts
~/Library/Logs/Agent Guard/                               event log folder (section 3, Event log)
```

`state/migration.json` becomes a list and the stamp gains `harnesses` (section 6, Planned: installer structure).

### The Pi migration

A transaction of section 6, mirroring section 10:

1. **Detect.** pi-sandbox-guard is present when any of these exists: `~/.local/bin/pi` or `omp` containing the string `pi-sandbox-guard`, `~/.local/bin/pi-sandbox.sb` or `pi-sandbox-preamble.zsh`, `~/.pi/agent/extensions/pi-sandbox-guard/`, `~/.config/pi-sandbox-guard/executables.conf`. Its launcher stamp lists the installed wrappers (`launcher_names`), wrappers installed before (`launcher_names_seen`) and the hashes of the installed set.
2. **Refuse while Pi or OMP runs.**
3. **Stage.** Build the release with the Pi profile; validate the bindings, `.guard-node` and the wrapper records to import; run `check staged` for the Pi profile.
4. **Confirm policy.** The installer shows what the shared list means for Pi and asks, whether or not the list needs an edit: with `ALLOW ~/Projects`, Pi gains write access to every project there, not only the one it starts in (decision D1). When no ALLOW entry covers Pi's projects, it proposes `@project`. It writes nothing until the user confirms.
5. **Import** the bindings, the checker interpreter (`.guard-node`) and the wrapper records (names, historical names, hashes) into `state/`.
6. **Switch,** journaled, in this order: place the discovery link under a name Pi does not load, then rename it to `agent-guard.ts`; replace `~/.local/bin/pi` and `omp` with links to `$engine/bin/pi` and `omp` through `replace_link`; move `~/.pi/agent/extensions/pi-sandbox-guard/` into the transaction backup. Between the first and the last step a Pi started elsewhere may load both extensions; the window is three renames.
7. **Gate.** `doctor` for both profiles. On failure, roll back from the journal and the backup.
8. **Retire** after the stamp, as the OpenCode Guard retirement does, into a durable legacy bundle under `state/legacy/pi-sandbox-guard/` that survives transaction cleanup: the original shims, `pi-sandbox.sb`, `pi-sandbox-preamble.zsh`, the launcher stamp, the extension, and what pi-sandbox-guard left beside them: the launcher backups in `~/.local/bin`, `~/.pi/agent/extension-backups/` and `~/.pi/agent/security-events.log`. Nothing is deleted. `~/.config/pi-sandbox-guard/` stays in place and unchanged until step 11; Agent Guard does not read it after the import or write it.

Rollback and uninstall are different. A rollback, inside the transaction, puts pi-sandbox-guard's files back from the journal and the backup. Uninstall, after the commit, removes Agent Guard's Pi pieces: the `~/.local/bin` links, the discovery link, and the bindings with the engine folder. It does not reinstate pi-sandbox-guard; it prints the steps that would (decision D6). The legacy bundle is inside the engine folder that uninstall removes (section 6, Uninstall, U8), so uninstall first copies it to `~/Agent Guard/pi-sandbox-guard-legacy/`, as U7 copies the permission record, and the printed steps name that copy. If the copy fails, the engine is kept and uninstall exits 1. This matches the OpenCode Guard end state, where uninstall does not reinstate the old guard.

### Custom wrappers

A wrapper hands off to the `pi` next to it (`PI_SHIM="${0:A:h}/pi"`, then `exec "$PI_SHIM" "$@"`; `launchers/example-custom`). Agent Guard's entry links take over `~/.local/bin/pi` and `omp`, the same paths, so each wrapper keeps its path and its arguments pass through unchanged, and terminals opened before the switch reach the new entry points without forwarders. The entry links and the recorded wrappers are launch links (section 3, Executables and launch links).

Before the switch, pi-sandbox-guard's checker runs once against the custom wrappers, from a pi-sandbox-guard checkout:

```sh
node scripts/check-launchers.mjs --sources ~/.local/bin/<wrapper> ...
```

It checks that each wrapper uses `#!/bin/zsh -f`, hands off to the `pi` next to it and calls only permitted helpers before the sandbox. Its `--deployed` mode is not used after the switch: it requires pi-sandbox-guard's own shim text (for example `PI_SANDBOX=1` and the profile path in `~/.local/bin`) and its profile and preamble, so it rejects a correct migration. The conformance suite (section 8) checks the launch behavior of the new entry points, directly and through each recorded wrapper.

After the switch, `agent-guard wrapper add|remove|list` replaces `deploy:launchers --extra-launchers`, with the same validation before anything is installed. It installs a copy in `~/.local/bin`, next to the `pi` link, and records names, historical names and hashes in `state/wrappers.json`. `remove` deletes a wrapper whose content still matches its recorded hash and keeps its name as historical; a changed wrapper is reported and left. `doctor` checks each recorded hash and reports a historical name that is still executable, as `scripts/status.sh` does with `launcher_names_seen`.

### Commands

| pi-sandbox-guard | Agent Guard |
|---|---|
| `npm run setup`, `deploy`, `deploy:all` | the one-liner and `agent-guard update` |
| `deploy:launchers --extra-launchers` (validate, reject reserved and duplicate names, install, hash) | `agent-guard wrapper add\|remove\|list`, with the same validation, recorded in `state/wrappers.json` |
| `npm run bind` | `agent-guard bind` (section 3, Executables and launch links) |
| `npm run status`, including `--json` | `agent-guard doctor`, including `--json`. Per profile it checks what `status` and `check-path.sh` check: release file hashes against the release manifest instead of a checkout, binding and checker-interpreter staleness, wrapper hashes and historical wrappers still executable, entry-point resolution in a login shell, relocation variables. `--json` keeps `status --json`'s aggregate fields (binding state and paths, overall drift). |
| `npm run preflight` | `doctor` runs the checker preflight for each profile's chain |
| `.githooks/pre-push`, `setup-hooks.sh` | CI; retired |

### Unguarded refusal is a behavior change

Today the Pi extension only warns when the `PI_SANDBOX_PROFILE_DIGEST` environment marker is missing (`FILTER-ONLY: could not verify launch through the protected Pi/OMP Seatbelt shim`, `src/index.mjs`). It never blocks, and filter-only use (the extension deployed without the launchers, or installed as a Pi package) is a documented mode. The marker is ambient, so a project can set it and silence the warning.

Under Agent Guard the Pi plugin uses the behavioral probe (section 5, Plugin core and adapters). Unguarded, it refuses every tool except the Pi adapter's safe set, defined at step 10d, with a message to relaunch through the guard. Filter-only use ends: running the real Pi or OMP binary directly, or any launcher that skips the entry points, gets refusals. On such a direct start only the discovered copy (`~/.pi/agent/extensions/agent-guard.ts`) loads, and `pi -ne` or a settings entry removes it; a guarded start is unaffected, because the launcher injects the plugin with `-e`, which neither can disable. Release notes and the Pi migration message state this as a behavior change. An agent session started outside the guard on purpose needs `AGENT_GUARD_BYPASS=1` (step 3).

### Analyzer

`src/guard-core.mjs` and `src/validate-bash-command.sh` move unchanged, apart from the log path and the interpreter source, into the Pi analyzer checker; the input rules of `src/index.mjs` move into the Pi adapter. The analyzer's ask tier and its fail-closed mode (a missing helper or analyzer blocks all bash) stay. The contract is in section 5, Checker chain; replacing the analyzer with cc-safety-net is a separate decision (section 15, decision D5).

### Policy at the switch

Pi's credential protection no longer depends on a list edit: the Pi profile sets `credentials = "mandatory"`, which applies the engine's credential set whatever the list holds (section 3, Credentials). The only list change the migration proposes is `@project`, when no ALLOW entry covers Pi's projects, and it asks even when no edit is needed, because the existing ALLOW entries already widen what Pi can write (The Pi migration, item 4; decision D1).

For OpenCode:

- **Credentials.** Nothing changes. OpenCode keeps `credentials = "list"`: only the list's DENY entries apply, as today, so git over SSH and cloud command-line tools keep working inside OpenCode's guard.
- **The protection union.** Once Pi is installed, OpenCode launches also write-deny Pi's and OMP's protected names and configuration, even under an ALLOW entry (compatibility matrix below). This is intended: otherwise an OpenCode session could change Pi's plugin or configuration (section 3, Every installed harness).

### Mapping of every pi-sandbox-guard function

E: engine. D: Pi profile data. H: Pi Rust hook. A: Pi adapter. C: plugin core. K: Pi analyzer checker. I: installer or `agent-guard`. R: retired. Stages R1 to R9, N1 and C1 to C4 are in section 7, Launch pipeline.

| pi-sandbox-guard behavior | Home |
|---|---|
| `zsh -f`, `set -euo pipefail`, readonly install paths, ambient profile and preamble paths ignored | E (single binary; release from its own location, built) |
| Runtime from the launcher's basename | E R2, D `[runtime.<name>]` |
| `PI_EXECUTABLE_KEY` must match the runtime | R: the entry selects the runtime |
| Command classification with option precedence; administrative commands | H R5, D runtime tables (section 5, Plugin injection by command) |
| OMP `cleanse`, `commit`, `join` refused | D runtime tables |
| `--extension` injection and lookup | H C3; one path, the launch release; sibling seam R |
| `.guard-node` validation | E checker interpreter (section 3, Executables and launch links) |
| Override variables before bindings, trusted prefixes, PATH auto-resolution, shim and marker skips, write-root checks, recheck after project and temp | E (section 3, Executables and launch links) |
| Node prepended for Node-shebang targets; stale interpreter refused | E harness interpreter (section 3, Executables and launch links) |
| Homebrew `opt` links for Node | E (section 3, Executables and launch links), I `bind` |
| `bind` modes and detection layouts | I `agent-guard bind` |
| Absolute tool paths; git selector scrub and `XDG_CONFIG_HOME` pin for probes; `PERL*` | E R3 |
| Git selectors removed from the agent's environment | D `env_unset` |
| PATH reset with a trusted Node folder | D `path` |
| Login and home from the system; spaces kept; bad records refused | E R1 (built), plus canonical home |
| `ulimit` core 0, 2 GB file size, `PI_RLIMIT_CPU` | D `rlimits` |
| `NPM_CONFIG_USERCONFIG=/dev/null` | E credential entry for `~/.npmrc` (section 3, Credentials) |
| `SSH_AUTH_SOCK`, `GPG_AGENT_INFO` unset | D `env_unset` |
| TMPDIR validation and parameter | R (section 8); temp from `getconf` (built) |
| Confinement probe | E (built) |
| Re-entry: digest, markers, behavioral probes, cross-runtime refusal, unknown sandbox refusal | E (section 7, N1 and Nested launch), D `nested = "same-boundary"` |
| Project from `PI_PROJECT`, git top level, cwd; canonicalized | E R7, D `start_folder` |
| Project refusals | E R7 (section 4) |
| Symlinked `.pi`/`.omp` refusal | E C1, D `on_link = "refuse"` |
| Startup banner | E log and stderr line |
| `PI_CODING_AGENT_DIR` rules, including nested relocations; `PI_CONFIG_DIR` shape; XDG-split OMP refused; `OMP_PROFILE`, `PI_PROFILE`; `--profile` only first; agent-dir consistency; base, state and agent roots distinct | H R6 and R5 |
| Status drift on `PI_CODING_AGENT_DIR`, `PI_PACKAGE_DIR` | D `refuse_env = ["PI_PACKAGE_DIR"]`; `doctor` reports relocation |
| Active hooks resolution, refusals, denies, exceptions; `.git/config` residual | E R8 (section 3, Git hooks), D `hooks = "protect"` |
| `(allow default)`, deny writes, last match wins | E (built) |
| Write allows: project, temp, Pi state, OMP allowlist, caches, devices | E (`@project`, temp, devices built), D `writable`, `state_grants` |
| Project agent-config denies | D `protected_names`, matched everywhere |
| Pi #9 and OMP config denies, default, relocated and linked roots | E root levels (section 3, Every installed harness), D `state_config` |
| Credential write and read denies; `.env` anywhere | E credential set (section 3, Credentials), D `credentials = "mandatory"` |
| SBPL parameters | E (section 3, SBPL parameters) |
| Profile digest; boundary markers; FILTER-ONLY warning | R; snapshot (section 7, Per-launch snapshot), probes (section 7, Nested launch), unguarded refusal (C) |
| Security event log: path, umask 077, mode 0600, full command, read-denied | E (section 3, Event log), K log path |
| Deploy staging, hash checks, backups, rollback, stamp, release ID | I (built transaction, action registry; section 6) |
| Extra launchers: validation, reserved and duplicate names, hashes, `launcher_names_seen` | I `agent-guard wrapper`, `state/wrappers.json`, `doctor` |
| `status` drift and `--json` | I `doctor --json` |
| `check-path` | I `doctor` |
| Checker `--sources` | run once before the switch; then R |
| pre-push and setup-hooks | R; CI |
| `tool_call` on `bash` only | A, all tools; C decisions |
| Registration on every fresh API; per-event dedup of the same source; independent verdicts for different copies | C (section 5, Plugin core and adapters) |
| Malformed payload blocks; whitespace-only command allowed before health checks | A |
| Empty or oversized command blocks inside the core | K (unchanged) |
| Candidate working folders, worst verdict | A |
| `POLICY_RM_SAFE_ROOTS`; dropped disarm variables | K (unchanged) |
| Ask through `ctx.ui.confirm`; decline, error or no UI blocks | C verdict, A mapping |
| Preflight, degraded mode | K, reported by `doctor` |
| Error and unknown verdicts block | C |
| Subprocess environment, timeouts, process-group kill, output caps, size cap, normalization probes, exit-code verdicts | K (unchanged) |
| Analyzer rule families and their root lists | K (unchanged; replacement is separate) |
| Manual demo `test/e2e-demo.mjs` | step 10d manual check (section 8) |

### Defects not carried over

| Defect (pi-sandbox-guard 7ad441f) | Removed by |
|---|---|
| Agent-session re-entry with a `.guard-node` binding exits under `set -u` (fails closed): the preamble returns before setting `HOME_CANON`, `PROJECT` and `TMPDIR_CANON`, which the shim then reads | section 7, Nested launch; inherited launches skip the compile stages |
| `~/.pi/agent/extension-backups` is writable inside a Pi launch (it lies under the Pi state root) | backups live in the engine's transaction backup and legacy bundle |
| Home passed to Seatbelt uncanonicalized; read denies miss under a linked home (inference) | section 7, R1 |
| `DEVELOPER_DIR` not cleared before `/usr/bin/git` probes (inference) | section 7, R3 |
| `PI_SANDBOX=0` and non-transparent branches unreachable | not reimplemented |
| bind can record a config the shim never reads (`PI_SANDBOX_CONFIG_DIR`) | one bindings file, no environment selector |
| Post-install lint reads the previous stamp (`deploy-launchers.sh` runs it before writing the new one) | not reimplemented |
| `test-ops.sh` runs in no gate | installer and migration tests in CI (section 8) |
| The analyzer is not injected for `--help` and `--list-models`, so `-ne` or settings can remove it there | section 5, Plugin injection by command |
| `PI_PACKAGE_DIR` can move Pi's configuration past the name rules (Pi 0.99.2 takes its config folder name from the `package.json` there); only `status` reports it | refused at launch |

The log-link hypothesis (section 3, Event log) is not listed as removed: Agent Guard narrows when it could matter but does not prove it gone.

### Compatibility matrix

Differences from today, per harness and operation. Everything not listed is unchanged.

**Pi and OMP**

| Operation | Today | Under Agent Guard |
|---|---|---|
| Direct start of the real binary | runs; FILTER-ONLY warning | tools refused after the probe; filter-only use ends. `pi -ne` or a settings entry removes the discovered copy on a direct start; a guarded start is unaffected |
| File tools (`read`, `edit`, `write`, `grep`, `find`, `ls`) | not checked in-process | checked against the projection: refusals with a message where Seatbelt already denies, plus reads under DENY |
| Writes outside the project | only the project, temp, state and caches | plus every ALLOW entry of the shared list (decision D1) |
| `open`, `osascript`, `osacompile`, `codesign`, `diskutil`, `launchctl`, `sudo`; `lsopen`; job creation | allowed | denied by the base template (decision D7) |
| Device and cache grants | Pi's set | the base template's set (adds `/dev/ptmx`, `/dev/dtracehelper`, all of `/dev/fd`, `DARWIN_CACHE`). Pi's `/dev/stdout` and `/dev/stderr` literals stay in the Pi profile unless a conformance case shows the base set already covers them (section 15, To verify) |
| `PI_PACKAGE_DIR` set | runs; `status` reports drift | launch refused |
| Analyzer log | `~/.pi/agent/security-events.log` | `~/Library/Logs/Agent Guard/`, rotated at launch |
| Install, update, bind, status | npm scripts | `agent-guard` |
| Nested Pi under OpenCode, or the reverse | Pi refuses a foreign enclosing sandbox | refused (decision D3) |

**OpenCode**

| Operation | Today | Under Agent Guard with Pi installed |
|---|---|---|
| Writes to `.pi`, `.omp` and the cross-harness extension folders anywhere; to Pi and OMP configuration under any root | allowed where an ALLOW entry covers them | denied: an intended installation-time policy change (section 3, Every installed harness) |
| Nested launch under OpenCode Guard (`OPENCODE_SANDBOXED=1`), or under an Agent Guard session started before step 9 | runs directly | unchanged until step 11 (section 7, Nested launch) |
| Everything else | | unchanged. Opt-ins, each its own release: executable write-root check (recommended first), credentials `mandatory`, hooks `protect`, `nested = "same-boundary"`, cc-safety-net audit log moved and read-denied |

## 12. Plan

Steps are numbered in the order they are done. "Needs step N" marks a step that cannot start until step N is done.

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

   The work Mac's admission route gates step 8.

7. **Package-store protection (first policy update).** Needs step 6; it reaches both Macs through `update`. The current, legacy and XDG-relocated package stores are protected; the rest of the cache stays writable. Operator maintenance outside the guard is documented. `doctor` checks that the configured plugins loaded, not only the status tool (section 9). The cache-root resolution (`XDG_CACHE_HOME`, else `~/.cache`) is written as OpenCode's first state-root resolver, the stage that resolves Pi's and OMP's roots at step 10d (section 7, Launch pipeline, R6). Done when configured plugins load, a representative npm language server works, the missing-package message is clear, and replacement and rename of the store are denied.

8. **Rust launcher, delivered as an update.** Needs step 6, and the work Mac's admission route before the update reaches that Mac. Constraints and parity are in section 7. The launcher is built as define, resolve, compile and execute (section 7, Structure) around the typed policy model (section 3, The policy model), with only the fields OpenCode uses; each later field arrives with the step whose behavior uses it. The shims pass their entry name to the launcher, every subprocess the launcher runs itself gets the cleared probe environment (section 7, Launch pipeline, R2 and R3), and the profile builder accepts paths outside home and a parameter set that is no longer fixed (section 3, SBPL parameters). OpenCode's `protected.sb` becomes model data, its name rules and the `~/.cc-safety-net/logs` exception, rendered to the same bytes; `protected_fragment` retires. The parity evidence of section 7 is unchanged. The update refuses to switch a Mac where the new binary cannot run and leaves the zsh version working there. The zsh engine stays in the repository until both Macs run the Rust version; rollback artifacts are kept after that. Done when the Rust engine passes the golden and behavioral parity tests and both Macs run it.

9. **Per-launch snapshot and plugin split.** Needs step 8, so it is built once. Each launch writes its own snapshot, `state/launch/<profile>-<launch-id>.json`, and passes its path to the plugin in `AGENT_GUARD_STATE`, which removes the shared `state/rules.json` race (section 2). The snapshot is immutable, versioned and write-protected; environment variables carry its location, never copies of policy (section 7, Per-launch snapshot). The plugin splits into `plugin/core.mjs` and the OpenCode adapter, which keeps the vendored cc-safety-net entry intact behind the compatibility wrapper (section 5). Done when concurrent launches, a missing or malformed snapshot (writes refused) and cleanup of ended launches have defined, tested behavior, the snapshot holds the fields section 7 lists, and the 79 plugin checks pass unchanged against the split plugin.

10. **`@project`, then Pi and Oh My Pi (OMP).** Needs step 9, because `@project` makes the rules differ between launches started in different folders (inference from section 4). Four parts, done in order:

    - **10a. `@project` for OpenCode.** Its positional project argument (`opencode [project]`) and what the app launcher means by it; the app's working directory is unverified.
    - **10b. Installer split** (section 6, Planned: installer structure), before any Pi code is added: `profiles/opencode/install.sh` becomes the `installer/` modules, with the action registry, frozen recovery bundle, candidate inventory and sequential migrations. Its own pull request; the OpenCode tests run unchanged.
    - **10c. Engine capabilities, switched off for OpenCode** (sections 3 and 7): bindings and the checker interpreter, root levels and recorded roots, credential modes, hooks with their collision cases, `rlimits`, pinned `path`, `refuse_env`, nested policies, `on_link` and the event log. Each gets acceptance cases taken from pi-sandbox-guard's `test/shim.mjs` and `scripts/test-sandbox-profile.sh`; `rlimits`, `refuse_env` and recorded roots have no case there and get new ones. Also an unshipped Pi slice: the Pi adapter loaded by a real Pi 0.99.2 in a disposable home through `-e` and discovery, `/reload`, and a dry migration against a fixture pi-sandbox-guard install, so the load cycle and the migration are exercised before 10d.
    - **10d. Pi.** The Pi profile, its Rust hooks, the Pi analyzer as a checker and the Pi migration (section 11), with OMP re-observed (section 15, To verify). Unguarded refusal and the other differences in section 11's compatibility matrix are documented as behavior changes. After Pi works, a short "adding a harness" guide is written from what Pi needed (section 14).

    Done when Pi and OMP run guarded on the owner's Mac and the conformance suite passes for both profiles.

11. **Close out.** OpenCode Guard and pi-sandbox-guard each get a final release that says where to go and how to recover. Each repository is archived only after its migration works: OpenCode Guard after step 6, pi-sandbox-guard after step 10. Until this step `~/.config/pi-sandbox-guard/` stays in place and unchanged, and the legacy bundle `state/legacy/pi-sandbox-guard/` is kept; uninstall copies the bundle to `~/Agent Guard/` and prints how to reinstate pi-sandbox-guard from that copy (section 11, The Pi migration). What happens to both is decided at this step. The launcher's acceptance of `OPENCODE_SANDBOXED=1`, and of `AGENT_GUARD_SANDBOXED=1` without a snapshot, ends here (section 7, Nested launch). Done when both repositories are archived.

**End state for the existing OpenCode Guard installs.** Done when both Macs run the Rust release, OpenCode Guard's engine, shims, forwarders, plugin, app, rulebook entry and PATH blocks are gone from both, and uninstall has been tested. `~/OpenCode Guard`, with the old list, stays (section 10). They switch at step 6; steps 7 and 8 reach them through `update`.

**End state for open source and more harnesses.** Public from step 6. A harness is profile data, Rust hooks, a plugin adapter, its checkers and a pass of the conformance suite (section 14). Pi is the first new harness; done when Pi and OMP run guarded on the owner's Mac, the conformance suite passes for both profiles, and pi-sandbox-guard is archived. Later candidates are in section 14.

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
| Checkers | Optional. Advisory checks behind the plugin core, such as cc-safety-net or the Pi analyzer; the chain is profile data (section 5, Checker chain). |
| Conformance pass | The suite in section 8, run against the new profile under the real `sandbox-exec`. |

A new harness's protected paths and names apply to every launch of every installed harness (section 3), so adding one also changes what the others can write.

Pi is the first case (section 11). What it needs beyond OpenCode is built as engine capabilities that any profile can switch on with data, at step 10c with OpenCode switched off: executable bindings, state roots, mandatory credentials, git hooks protection, the `same-boundary` nested policy, `on_link = "refuse"`, `rlimits`, a pinned `path` and `refuse_env` (sections 3 and 7). OpenCode can opt into each later, in a release of its own (section 11). The "adding a harness" guide is written after Pi works (step 10), from what Pi actually needed. Until then this section is the outline.

Candidates, ranked. None has an OS sandbox of its own. The reasons and caveats come from the 2026-09-28 draft and were not rechecked for this revision.

1. **Kiro CLI.** Claude-style PreToolUse hooks. They fail open, which is acceptable because the outer layer is the boundary.
2. **Crush.** A terminal CLI like OpenCode, so the launch model carries over. Hook API not yet verified.
3. **Mistral Vibe.** Hook API not yet verified.

Aider and OpenHands are not candidates until they have a hook that can refuse a tool call. Hermes Agent is out of scope; its safety stays in its own config.

Harnesses that ship their own Seatbelt sandbox (Codex, Claude Code, Gemini CLI) are excluded. Seatbelt sandboxes cannot nest, so a profile would have to switch the harness's own sandbox off (section 1).

## 15. Risks and open decisions

Risks:

- **Work-Mac binary admission.** If the work Mac runs Santa in a mode that blocks unknown binaries, the new ad-hoc signed launcher app (step 6) or the Rust binary (step 8) could be blocked. Step 6 checks the app before the switch; step 8 refuses to switch a Mac where the new binary cannot run (sections 6 and 7).
- **Harness updates move config paths.** An update can add a config, plugin or extension path the profile does not protect. OpenCode's plugin documentation still describes `~/.cache/opencode/node_modules`, while 1.18.33 uses `~/.cache/opencode/packages/` (section 9). The conformance suite runs against new harness versions in development, and `doctor` runs after each update on an installed Mac.
- **`sandbox-exec` deprecation.** Apple marks `sandbox-exec` deprecated. It still works, and Chrome, Codex and Claude Code depend on it. Both engines depend on Seatbelt; the self-test and `doctor` fail loudly if it stops working. Linux and Windows are non-goals (section 1), so there is no fallback platform.
- **Two guards installed during migration.** Both plugins would issue competing refusals, the two launchers' shims can call each other, the app bundle ID is shared, and terminals opened earlier keep the old PATH. Section 10 gives the rule for each. For pi-sandbox-guard at step 10d, a Pi started elsewhere during the switch may load both extensions; the window is three renames (section 11, The Pi migration).

Decisions taken, each with the alternative not taken and its cost:

- **D1. Shared ALLOW entries and Pi.** One list for all harnesses. The Pi migration shows what Pi gains from the shared list and asks, even when the list needs no edit: with `ALLOW ~/Projects`, Pi gains write access to every project there (section 11, The Pi migration). Alternative: a Pi setting that honors only `@project` from ALLOW; cost: the list no longer means the same for every harness.
- **D2. Credentials.** `credentials = "mandatory"` for Pi; `"list"` for OpenCode, which gets only what the Guard List denies, until it opts in (section 3, Credentials). Alternative: mandatory for both now; cost: git over SSH and cloud command-line tools stop working inside OpenCode.
- **D3. Cross-profile nested launches.** Refused, as pi-sandbox-guard does today: a confined launch whose enclosing snapshot names another profile or runtime does not run (section 7, Nested launch). The refusal is not a boundary; the enclosing sandbox applies its own policy either way. Alternative: run under the enclosing policy and report it; cost: the inner harness's state folders are not writable, and its own protections are not applied.
- **D4. RPC confirmations.** Today's behavior: Pi's asks go to `ctx.ui.confirm` when there is a UI and are refused otherwise, and in RPC mode the client program answers (section 5). Alternative: refuse asks in RPC mode; cost: RPC clients that confirm today stop working.
- **D5. The analyzer.** Moved unchanged as a checker behind the plugin core (section 5, Checker chain); replacement is investigated later. Alternative: replace it with cc-safety-net at step 10; cost: Pi loses its ask tier, and each of the 383 corpus cases where cc-safety-net differs needs a written decision first (section 5).
- **D6. Uninstall after a Pi migration.** Removes Agent Guard's Pi pieces, copies the legacy bundle to `~/Agent Guard/` and prints the steps to reinstate pi-sandbox-guard from that copy, without reinstating it (section 11, The Pi migration). Alternative: reinstate it automatically; cost: uninstall then depends on a retired project's files and layout.
- **D7. The base template's exec and Launch Services denies for Pi.** Applied, as for OpenCode: `lsopen`, `job-creation` and running `open`, `osascript`, `osacompile`, `codesign`, `diskutil`, `launchctl` and `sudo` are denied, which closes routes out of the sandbox (section 3). Alternative: a Pi exception; cost: one more per-harness difference in the base.

Open decisions:

- **Notarize or stay unsigned.** The facts are in section 6. The work Mac's admission route, collected before step 6, decides this before step 8.
- **Name entries in the list**, such as `.env` anywhere under DENY. Pi's `.env` and `.env.*` read deny anywhere does not wait on this: it lives in the engine credential set and applies with `credentials = "mandatory"` (section 3, Credentials). A name entry would let a harness on `"list"` get such a rule from the list.
- **Retiring Pi's analyzer.** Replacing it with cc-safety-net is decided after the corpus run, not as part of step 10 (section 5, Checker chain).
- **Project config files that one harness reads from another** (`.mcp.json`, `.claude/settings.json`, `.codex/config.toml`, `opencode.json` and similar). They are bare file names that also appear in fixtures and examples, and their MCP commands run inside the sandbox.

To verify, before or during implementation:

- **OMP**, at step 10d, which needs OMP installed on the owner's Mac first; every OMP statement in this document comes from pi-sandbox-guard's code and documents. Extension discovery folders, real-path deduplication, `-e` handling, tool names, the command list, `cleanse`, `commit` and `join`, and the runtime paths behind the OMP allowlist in `state_grants`, which pi-sandbox-guard observed in OMP 17.2.10.
- **Pi** (observed: 0.99.2). Top-level `await` under jiti; whether `JITI_*` variables or jiti's file cache in `$TMPDIR` change what code loads; reload with two copies from different releases; whether session replacement (`/new`, `/resume`, a fork) builds a new runner; that a settings entry cannot disable a `-e` extension (only `-ne` was read); that `process.argv` carries the injected `-e` path as passed (section 5, Plugin core and adapters); which options take a value in Pi's `cli/args.js`, against the `value_options` carried from pi-sandbox-guard.
- **Seatbelt.** The hooks exception rendering against list collisions (section 3, Git hooks); whether a rule can allow writes in a folder while denying link creation there (section 3, Event log); that recorded linked roots are denied through their canonical path (section 3, Every installed harness); whether writes to `/dev/stdout` and `/dev/stderr` match the base template's `/dev/fd` grant (section 11, Compatibility matrix).
- **OpenCode.** That 1.18.34 never calls the `permission.ask` plugin hook (found by static inspection of the binary only); whether a plugin tool's `context.ask` could carry an ask tier, not needed now (section 5); whether a `.js` link to a `.mjs` target loads, which the adapter's `.js` name avoids (section 5).
- **Bun.** Whether `import.meta.url` shows a link or its target; the plugin already resolves it (section 5).
