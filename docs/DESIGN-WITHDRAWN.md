# Agent Guard design: withdrawn sections

Text removed from [DESIGN.md](DESIGN.md): the Rust launcher, the shared engine and its typed policy model, composition across harnesses, and the move of Pi and OMP onto that engine. None of it is built (DESIGN.md section 15, decisions D12 and D17). Section numbers, headings and cross-references are DESIGN.md's.

## 3. Harness profiles

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
subtree = ["extensions", "npm", "git", "skills", "bin", "tools"]
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

`state_grants` cover runtime data only. Pi's grant is its whole active root, and `state_config` then denies its configuration, so sessions and theme files stay writable while extensions, the user package folders (since pi-sandbox-guard #9), skills, settings, `auth.json`, `trust.json`, system prompts, model configuration and MCP server configuration (`mcp.json`, read since Pi 0.99.0, names commands Pi runs) do not. Neither do `bin`, which Pi 1.3.0 puts first on every Bash command's `PATH` and searches first for `rg` and `fd`, and `tools`, whose `fd` and `rg` Pi moves into `bin` at startup (`utils/shell.js`, `utils/tools-manager.js`, `migrations.js`); a guarded session cannot download a missing `rg` or `fd`, and Pi warns and continues without it. The launcher creates `bin` before confinement, because Pi's startup migration of a legacy `tools/rg` or `tools/fd` stops Pi when it cannot create a missing `bin`. `models-store.json`, Pi's cached model catalog, stays writable because Pi rewrites it when it refreshes the catalog. This is an accepted risk: a session can change a cached model's endpoint, and a later session that selects that model sends its prompts and API key there. OMP's grant is the positive allowlist of the runtime paths pi-sandbox-guard observed in OMP 17.2.10: 53 exact-node and subtree entries. Its extensions, hooks, tools, commands, skills, agents, prompts, rules, instructions, plugins and its config, model, MCP, SSH, token and `.env` files stay read-only. OMP's `agent.db` holds operational data and credentials in one file and stays writable, so file-level protection of OMP's credentials is not claimed, as in pi-sandbox-guard.

`path` is pi-sandbox-guard's pinned `PATH`, preceded by one trusted Node folder: the resolved folder of the first Node among `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`, `/opt/homebrew/opt/node/bin`, `/usr/local/opt/node/bin`, then the `opt/node@*/bin` folders under both prefixes. The `*` entries of the engine's Git selector list (Git hooks) unset every variable with that prefix, which the built `env_unset` does not support. Pi may derive another agent folder from `PI_PACKAGE_DIR`, moving `.pi` past the name rules; pi-sandbox-guard only reports it (`scripts/status.sh`); the Pi profile refuses the launch.

The credential set (Credentials), Git hooks (Git hooks), the executable checks (Executables and launch links) and the nested-launch rule (section 7, Nested launch) apply to every profile. OpenCode receives them one release at a time after Pi's migration (section 11, OpenCode's releases) and keeps its built behavior until each. Composition (below) covers grants to the other harnesses present in a session. The other capabilities (pinned `path`, `rlimits`, `refuse_env`, `on_link = "refuse"`, the event log) stay profile choices.

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

## 7. Rust launcher

Not built (decision D12). This section is kept as the record of the design that was planned; the zsh engine in `engine/launch` stays.

The Rust launcher was to replace `engine/launch` at step 8, as an ordinary `update` to existing installs. Migration failures and rewrite failures stay separate.

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
| R7 | **Project.** `@project` from `start_folder`, or in `gui` mode the remembered app projects and the folders dropped for this launch, each re-resolved; the refusal list of section 4; refusal inside a protected agent folder. | `start_folder` | `PI_PROJECT`, git top level, cwd |
| R8 | **Git hooks folder**, for every profile: resolved with the probe environment plus the harness's own `XDG_CONFIG_HOME` from R4, so it reads the configuration the session's Git reads (section 3, Git hooks); broad, home or project-containing results refused. In `gui` mode it runs for each app project (section 4) or, with none, the launch folder; with a terminal `@project`, the project. | none | `git rev-parse --git-path hooks` |
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

Stage by stage, step 8 builds for OpenCode: R1 to R3; R4 with `env_unset` and `env_set`; R6 for the cache root step 7 resolves (section 9); R9; N1 as built (section 2); C1 with `protect-target`; C2 with today's selection; C3 with `gui_args`; C4; Execute. Step 9 adds the snapshot. Step 10a adds `@project` for OpenCode (R7). Step 10c adds the engine capabilities, with OpenCode switched off: `path`, `rlimits` and `refuse_env` (R4); R8 and the hooks block; the root levels and recorded roots of the protection union; the credential set; `same-boundary` (N1); `on_link = "refuse"` (C1); bindings and the writable-set check (C2). It also adds every installed harness's denies inside granted folders to the protection union, rendered in every launch, OpenCode's included (R9). Step 10d adds Pi's `args_hook` and runtime tables (R5, C3) and its `state_hook` (R6). Step 10e, OpenCode's releases (section 11, OpenCode's releases), switches the capabilities on for OpenCode, one release each; its composition release, which ships for every launch, adds NESTED and member resolution (R6), the combined writable set (R9, C2), member snapshots and the canary on every launch (Per-launch snapshot, Nested launch). The zsh engine is not extended, with one exception: it launches Grok (section 3, Grok), which Agent Guard supports ahead of the Rust launcher because Grok's own sandbox profiles block the macOS keychain and so break `gh` and `git` over https. That change takes a harness name, leaves OpenCode's generated profiles byte-identical (the golden test passes unchanged) and adds none of the planned capabilities above.

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
| Yes | `AGENT_GUARD_SANDBOXED=1` and no snapshot, until the release after every Mac runs step 9's release and has restarted: a session started from a release before step 9 | OpenCode | Run directly, as built. |
| Yes | `AGENT_GUARD_SANDBOXED=1`, a valid snapshot of the same profile and runtime | `inherit` (OpenCode, until its nested-launch release) | Run directly under the enclosing policy, as built. |
| Yes | a valid snapshot of another profile or runtime | `inherit` | Refuse. |
| Yes | `AGENT_GUARD_SANDBOXED=1`, a valid snapshot that lists the request's runtime | `same-boundary` | Run directly under the enclosing policy when the conditions below hold; otherwise refuse with the reason. |
| Yes | a valid snapshot that does not list the request's runtime | `same-boundary` | Refuse: not part of this session. |
| Yes | no marker, and the probe fails with `sandbox_apply: Operation not permitted`: a sandbox Agent Guard did not create | OpenCode `cli` | Step aside: run directly under that sandbox, writing nothing (decision D10, section 15; built in the zsh engine). Other modes refuse. |
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

An inherited launch writes no second snapshot and claims no policy it does not enforce. Under `inherit` it finds the executable as the zsh engine does (`next_cli`), searching PATH again. Under `same-boundary` it uses the outer launch's release and the executable and interpreters the snapshot records for its runtime, so it never searches PATH again and does not repeat the binding checks that fail in pi-sandbox-guard (below); for OpenCode this holds from its nested-launch release. The cross-profile refusal under `inherit` is not a boundary: an agent can unset `AGENT_GUARD_STATE`, and an OpenCode request then runs directly under whatever sandbox encloses it, which still applies its own policy. The membership refusal is not a boundary either: an agent can start the executable of a runtime the session does not include, and it runs under the enclosing sandbox and its policy. The adopted guard already lost the defect (difference 18); this keeps it gone. It was a pi-sandbox-guard defect at 7ad441f: when its re-entry check (`own_policy_reentry`) passes, `sandbox/pi-sandbox-preamble.zsh` returns before it sets `PROJECT`, `HOME_CANON` and `TMPDIR_CANON`, and `launchers/pi`, which runs under `set -u`, then passes all three to `executable_under_sandbox_write_root` when a `.guard-node` binding exists, so an agent-session re-entry exits. It fails closed.

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

## 11. Moving from pi-sandbox-guard

### The Pi migration

Step 10d, an update in a transaction of section 6. Because the adopted guard keeps pi-sandbox-guard's layout, the same migration also runs from a pi-sandbox-guard install that was never adopted; that case adds the adoption's refusal while Pi or OMP runs, its wrapper import and its legacy bundle (The adoption).

1. **Detect.** The stamp lists Pi in the adopted layout, or pi-sandbox-guard is present (The adoption, item 1).
2. **Stage.** Build the release with the Pi profile; validate the bindings in `executables.conf` and the wrapper records; run `check staged` for the Pi profile.
3. **Confirm policy.** The installer shows what the shared list means for Pi and asks, whether or not the list needs an edit: with `ALLOW ~/Projects`, Pi gains write access to every project there, not only the one it starts in (decision D1). When no ALLOW entry covers Pi's projects, it proposes `@project`. It writes nothing until the user confirms.
4. **Convert** the bindings in `executables.conf` into `state/bindings.toml`, through the validation of section 3, Executables and launch links. `.guard-node` is not converted; it goes with the extension folder (item 5).
5. **Switch,** journaled, in this order: `current` first, which makes `$engine/bin/pi` and `omp` the engine's shims, so `~/.local/bin/pi` and `$engine/bin/pi` never link to each other; the discovery link, placed under a name Pi does not load, then renamed to `agent-guard.ts`; `~/.local/bin/pi` and `omp` replaced with links to `$engine/bin/pi` and `omp` through `replace_link`; the extension folder, with whatever an earlier release left in it, `pi-sandbox.sb` and `pi-sandbox-preamble.zsh` moved into the transaction backup. The analyzer's old log stays at `~/.pi/agent/security-events.log` (section 3, Event log). Between placing the discovery link and moving the extension folder, a Pi started elsewhere may load both extensions; the window is three renames.
6. **Gate.** `doctor` for both profiles. On failure, roll back from the journal and the backup.
7. **After the stamp**, `~/.config/pi-sandbox-guard/` is removed, journaled in the same transaction, once the conversion's bindings pass `doctor`; Agent Guard does not read it after the conversion. The file is a live binding until here, not a leftover. The legacy bundle stays.

Sessions started before the update keep the adopted guard's Seatbelt profile; after `/reload` they load the new plugin through the discovery link and meet its refusals until they are restarted.

A rollback, inside the transaction, puts the adopted guard's files back from the journal and the backup. Uninstall after Pi's migration removes Agent Guard's Pi pieces: the `~/.local/bin` links, the discovery link, and the bindings with the engine folder. It copies the legacy bundle where one remains and prints the steps to reinstate pi-sandbox-guard, as from 0.2.0 (The adoption, Uninstall; decision D6).

### Mapping of every pi-sandbox-guard function

Where each behavior of the adopted guard, pi-sandbox-guard 7ad441f with the nine recorded differences, lives from step 10d. E: engine. D: Pi profile data. H: Pi Rust hook. A: Pi adapter. C: plugin core. K: the command checker, cc-safety-net with Agent Guard's rules (section 5, Command checker). I: installer or `agent-guard`. R: retired. Stages R1 to R9, N1 and C1 to C4 are in section 7, Launch pipeline. Rows marked I are Agent Guard's from step 7c, at the adopted paths; step 10d changes them only where The Pi migration converts a file.

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

### Compatibility matrix

Differences between the adopted guard (from 0.2.0) and the shared engine, per harness and operation. The differences from pi-sandbox-guard that 0.2.0 already makes are in What changes for Pi sessions and What changes for OpenCode sessions. Everything not listed is unchanged.

**Pi and OMP**

| Operation | Adopted guard | From step 10d |
|---|---|---|
| Direct start of the real binary | runs; FILTER-ONLY warning; every tool call refused, since no session copy exists | tools refused after the probe; filter-only use ends. `pi -ne` or a settings entry removes the discovered copy on a direct start; a guarded start is unaffected |
| File tools (`read`, `edit`, `write`, `grep`, `find`, `ls`) | not checked in-process | checked against the projection: refusals with a message where Seatbelt already denies, plus reads under DENY; cc-safety-net does not see them |
| Shell commands | cc-safety-net for `bash` and `powershell` with the session copy and Agent Guard's Git rulebook (section 5, Command checker); every verdict is allow or deny | unchanged |
| Recursive deletes | the policy every harness uses (section 5, Recursive deletes) | unchanged |
| The Guard List | not read; writes only to the project, temp, state and caches | read: every ALLOW entry adds writes (decision D1), and DENY and READ ONLY entries apply |
| Writes to OpenCode's protected names (`.opencode`, `opencode.json`, `opencode.jsonc`, `tui.json`, `tui.jsonc`) | denied inside the project only, with `.cc-safety-net` (step 7f) | denied: the protection union (section 3, Every installed harness) |
| Device and cache grants | Pi's set | the base template's set (adds `/dev/ptmx`, `/dev/dtracehelper`, all of `/dev/fd`, `DARWIN_CACHE`). Pi's `/dev/stdout` and `/dev/stderr` literals stay in the Pi profile unless a conformance case shows the base set already covers them (section 15, To verify) |
| `PI_PACKAGE_DIR` set | runs; `doctor` reports it | launch refused |
| Command log | cc-safety-net's audit log in `~/.cc-safety-net/logs`, as for OpenCode; the analyzer's `~/.pi/agent/security-events.log` is left in place | unchanged |
| Bindings | `~/.config/pi-sandbox-guard/executables.conf`, written by `agent-guard bind`; `.guard-node` is no longer written or read | `state/bindings.toml` in the engine folder, written by `agent-guard bind` |
| Inference credentials: `~/.aws/credentials`, `~/.aws/config`, `~/.config/gcloud` | read- and write-denied | readable; the AWS token caches (`~/.aws/sso/cache`, `~/.aws/login/cache`, `~/.aws/cli/cache`) writable; configuration stays write-denied. A loosening, needed for Bedrock and Vertex (section 3, Credentials) |
| `.env` and `.env.*` files | unreadable anywhere | unreadable, apart from `.env.example`, `.env.sample` and `.env.template`, and OMP's own two `.env` files, which are readable and checked at launch (section 3, Credentials) |
| OMP keys in `~/.env` or a project `.env` | not loaded; OMP skips an unreadable file without a message | unchanged: still not loaded, without a message; the release notes say so (section 3, Credentials) |
| Pi OAuth login refresh | fails at the first refresh inside a session: `auth.json` is write-denied | unchanged; a known limitation (section 3, Credentials) |
| Writes to other harnesses' runtime data | only the launched runtime's state and the shared caches | from the composition release, the runtime data of each runtime listed under NESTED, apart from its logins and instruction files, such as OpenCode's `~/.local/share/opencode` without `auth.json`; OMP's `agent.db`, logins included, when `omp` is listed; configuration stays write-denied (section 3, Composition) |
| Re-entry of the same runtime, such as Pi inside Pi | passes through after its confinement probes since difference 18; 7ad441f exited when `.guard-node` existed (Defects not carried over) | runs under the enclosing policy when the conditions of section 7, Nested launch, hold |
| Nested launch of another runtime: Pi or OMP inside OpenCode, Pi inside OMP or the reverse | Pi refuses a foreign enclosing sandbox and a cross-runtime re-entry | refused until the composition release (OpenCode's releases, below). From it, a runtime listed under NESTED runs when its project, state folders, OMP profile and hooks folder match the session's (section 7, Nested launch); an unlisted one is refused with a message naming the heading. OpenCode inside a Pi or OMP session also waits for OpenCode's nested-launch release |

**OpenCode**, on a Mac with Pi installed

| Operation | Adopted guard | From step 10c |
|---|---|---|
| Writes to `.pi`, `.omp` and the cross-harness extension folders anywhere; to Pi and OMP configuration under any root | allowed where an ALLOW entry covers them, except Pi's guard files (What changes for OpenCode sessions) and the names `.pi` and `.omp` (step 7f) | denied: an intended installation-time policy change (section 3, Every installed harness); step 10c writes the Pi profile data the protection union needs |
| Writes covered by Pi's and OMP's denies inside granted folders (section 9) | allowed where OpenCode's grants or an ALLOW entry cover them | denied, rendered in every launch (section 3, Every installed harness) |
| Nested launch under an Agent Guard session started before step 9 | runs directly | unchanged until the release after step 9 reaches every Mac (section 7, Nested launch) |
| Everything else | | unchanged at Pi's migration; then changed by OpenCode's releases (below). Only moving the cc-safety-net audit log out of `~/.cc-safety-net/logs` and read-denying it stays an opt-in (section 3, Event log) |
