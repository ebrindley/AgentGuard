# Agent Guard design

Status: draft, 2026-09-28. Not built yet.

Agent Guard is one macOS guard for terminal coding agents. It merges what OpenCode Guard (v1.0.3) and pi-sandbox-guard do today into one engine with a small profile and plugin per harness.

## 1. Goal and non-goals

Goal: an agent keeps full tool permissions and broad read access, but can only change or delete files in folders you allow, plus the data, cache and temp folders its harness needs. It can never read or change folders you deny. It cannot edit the guard, the list, or its harness's config and plugins, so it cannot switch its own guardrails off. Both layers are on by default. Few tools do that; most vendors sandbox only shell commands, and third-party wrappers do only the outer layer.

Non-goals:

- Protecting files inside ALLOW folders. The agent edits code there; keep backups and review diffs.
- Keeping provider tokens secret from the harness that uses them.
- Linux or Windows.
- A VM or container.
- Harnesses that ship their own Seatbelt sandbox (Codex, Claude Code, Gemini CLI) in the first release. Seatbelt sandboxes cannot nest, so a profile would have to switch theirs off.

## 2. Architecture

Two layers, as in both guards today.

- **Outer layer (the boundary).** The launcher runs the whole harness process, and every child, under a Seatbelt profile built at each launch. Every harness component must run inside it. The 2026 escapes (Beltdown, Pillar) used harness parts that ran outside the sandbox.
- **Inner layer (advisory).** A plugin inside the harness refuses forbidden tool calls with a clear message and blocks destructive shell commands. Hook failure behavior differs by vendor (Kiro fails open), so nothing depends on the plugin for safety.

Shared engine, written in zsh with only macOS tools (`sandbox-exec`, `jq`, `plutil`):

| Part | Does |
|---|---|
| List parser | Reads the one Guard List, applies the refusal rules (too broad to allow, needed by the harness), resolves `@project`. Lifted from OpenCode Guard `engine/launch`. |
| Profile builder | Base SBPL, then harness writable paths, an optional harness SBPL fragment, list rules, and protected paths and names last (section 3). |
| Launcher | Takes home and the engine folder from the account database, not `$HOME`, before it reads any profile. Pi does this today; it lands with the profile loader in stage 1. Finds the binary or app, refuses to run nested or unguarded, cleans the environment, execs under `sandbox-exec`. Pi's other pre-sandbox checks (fixed PATH, TMPDIR checks, executable and interpreter checks) come in stage 3. |
| Log | `~/Agent Guard/last-launch-<harness>.log`: what applied, what was skipped or refused, what the harness can always write. |
| State | Resolved rules written per launch to `state/<harness>-<launch-id>.json` in the engine folder, so two launches with different start folders do not overwrite each other. The launcher passes the file's path in `AGENT_GUARD_STATE`. The plugin accepts only a path inside the state folder, and refuses edits if the file is missing or malformed, as OpenCode Guard does today. Files whose launch has ended are removed at the next launch. |
| Plugin core | One JS module: sandbox probe, path checks against the state file, "started without the guard" refusal, status tool, loading cc-safety-net. |
| Installer and check | Copies files, sets up shims and the launcher app, runs the self-test. |

Per harness: a profile file, an optional SBPL fragment, a thin plugin adapter for that harness's hook API, and optional install steps (for example OpenCode's permission merge).

Install layout: engine in `~/Library/Application Support/AgentGuard/`, profiles in `profiles/<harness>/` inside it, shims in `bin/` inside it (put first on PATH by the installer, as OpenCode Guard does). The whole folder is write-protected from inside the guard.

## 3. Per-harness profile contract

Recommendation: a zsh file of assignments, read with `source`. Zsh arrays keep paths with spaces intact and need no parser. Where a harness needs logic, the profile names a hook function in `hooks.zsh` next to it.

Profiles and hook files are trusted code, like the engine: `source` runs anything in them, including `$(...)` inside an assignment. They are safe only because they live in the write-protected engine folder and the launcher finds that folder from the account database, not from `$HOME` or any other environment the agent could set. A conformance test that allows only plain assignments catches mistakes. It is not a boundary.

`profiles/opencode/harness.zsh`:

```zsh
name=opencode
title="OpenCode"
cli_names=(opencode)
cli_search=(/opt/homebrew/bin/opencode /usr/local/bin/opencode "$HOME/.opencode/bin/opencode")
app_paths=(/Applications/OpenCode.app "$HOME/Applications/OpenCode.app")
app_bundle_id=ai.opencode.desktop
writable=("$HOME/.local/share/opencode" "$HOME/.local/state/opencode" "$HOME/.cache"
          "$HOME/Library/Caches" "$HOME/.npm" "$HOME/.bun/install/cache" "$HOME/.cc-safety-net/logs")
writable_gui=("$HOME/Library/Application Support/ai.opencode.desktop"
              "$HOME/Library/Saved Application State/ai.opencode.desktop.savedState")
protected=("$HOME/.config/opencode" "$HOME/.opencode" "$HOME/.cc-safety-net")
protected_names=(.opencode opencode.json opencode.jsonc tui.json tui.jsonc .cc-safety-net)
writable_exceptions=("$HOME/.cc-safety-net/logs")   # stays writable inside a protected tree
gui_args=(--no-sandbox)              # Electron; Chromium's sandbox cannot nest
env_unset=(ELECTRON_RUN_AS_NODE OPENCODE_SIDECAR_V2 CC_SAFETY_NET_HOME)
env_set=(OPENCODE_SANDBOXED=1 CC_SAFETY_NET_PARANOID_RM=1)
inner_sandbox=none                   # none | off-flag:<args> | unsupported
start_folder=cwd                     # what @project means: cwd | git-toplevel
plugin_dir="$HOME/.config/opencode/plugins"
plugin_files=(agent-guard-opencode.js)
install_hook=opencode_install        # permission merge, config .gitignore
check_hook=opencode_check            # serve, then look for the status tool
```

`profiles/pi/harness.zsh`:

```zsh
name=pi
title="Pi"
cli_names=(pi omp)                   # runtime chosen from the shim's own name
binding_file=executables.conf        # in the engine folder, recorded by `agent-guard bind`
cli_search=(/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js
            /usr/local/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js)
app_paths=()
writable=("$HOME/.npm" "$HOME/.cache" "$HOME/Library/Caches")
state_hook=pi_state_paths            # active Pi/OMP state roots, OMP --profile selector
sb_fragment=pi.sb                    # OMP positive state allowlist, prompt*.md re-deny, active git hooks
protected=("$HOME/.pi/agent/extensions" "$HOME/.pi/agent/settings.json"
           "$HOME/.pi/agent/auth.json" "$HOME/.pi/agent/trust.json")
protected_names=(.pi .omp .claude/{extensions,hooks,tools} .codex/{extensions,hooks,tools}
                 .gemini/extensions .opencode/plugins)   # Pi and OMP load these at start
launch_hook=pi_launch_args           # inject the plugin even under --no-extensions
inner_sandbox=none
start_folder=git-toplevel
plugin_dir="$HOME/.pi/agent/extensions"
plugin_files=(agent-guard-pi)
check_hook=pi_check
```

The Pi `protected_names` set matches the project-config fix in pi-sandbox-guard (`protect-project-pi-config`), with evidence from Pi 0.87.1 and upstream Oh My Pi. The OMP folder names come from OMP's upstream source and need rechecking against the OMP version users run.

Protected paths and names are write-denied, including creation. A missing config file created by the agent and run at the next start was CVE-2026-25725 in Claude Code. Names match as path parts anywhere except inside the harness's own writable state folders, so Pi's `.omp` name does not cover OMP's state in `~/.omp`. A name must still be narrow enough not to cover other state the harness writes. Narrow exceptions are listed in `writable_exceptions`. Matching names everywhere, including temp, also closes a route that pi-sandbox-guard's project-only rule leaves open: building a `.pi` folder in `/private/tmp` and moving its parent into a project.

Symlinks: the target of a protected path is resolved and protected at launch. The target of a protected name is resolved only inside the start folder, as OpenCode Guard does today. Elsewhere only the name is protected, and the plugin refuses edits through it. Stage 1 keeps this limit, and the README keeps saying so.

Every launch protects the guard's files for every installed harness, not only the one being launched. That covers the engine folder (profiles, bindings, state), the list folder, the launcher app, the `protected` entries of every installed profile, shell startup files and `~/Library/LaunchAgents`. Otherwise an ALLOW entry could expose another harness's plugin or a binding file.

Rule order: base profile, harness writable paths, harness fragment, list rules, then protected paths and names last. Seatbelt applies the last matching rule, so neither a fragment nor the list can reopen a DENY entry or a protected path. Fragments are reviewed like engine code.

`inner_sandbox` tells the launcher how to switch a harness's own Seatbelt off, or that the harness is not supported.

## 4. The list

One list for all harnesses: `~/Agent Guard/Guard List.txt`. Same headings and rules as OpenCode Guard: ALLOW, READ ONLY, DENY; DENY always wins; otherwise the more specific entry wins; folders above a DENY or READ ONLY entry cannot be renamed or removed; `/`, home, `~/Library`, `~/.config` and `~/.local` cannot be allowed whole; folders the harness needs cannot be made READ ONLY or DENY.

Pi's project model fits as one new entry, valid only under ALLOW:

```
ALLOW - agents may create, change and delete things inside these:
@project
~/Projects
```

`@project` means the folder the agent starts in, or its git top level when the profile says `start_folder=git-toplevel`. `PI_PROJECT` overrides it, as in Pi today. It uses Pi's refusal rules unchanged. The launch is refused rather than widened if `@project` is `/`, home, a system or credential folder, `~/Library`, `~/Desktop`, `~/Documents` or `~/Downloads`, anything inside one of them, or a folder that contains the guard. The launcher also refuses to start if the harness executable or its interpreter sits inside any writable folder, not just `@project`. The log shows what `@project` resolved to. New lists get `@project` commented out.

One list changes scope. An OpenCode ALLOW of `~/Projects` would let Pi write to every project there, not just the one it started in. Pi's credential DENY entries would start applying to OpenCode. So importing is a policy change, not a copy. The installer shows the merged list and what each harness gains or loses, and writes nothing until the user confirms. It never replaces an existing `~/Agent Guard/Guard List.txt`.

## 5. Inner layer

Recommendation: cc-safety-net for shell commands in every harness, plus Agent Guard's own plugin core for file paths. cc-safety-net 2.4.6 already ships entry points for OpenCode and Pi, and a hook mode for Claude Code, Codex, Copilot CLI, Cursor, Gemini CLI, Grok Build, Kimi Code, Antigravity CLI, Amp, OpenClaw and Hermes Agent. One upstream blocker is less to maintain than a second 4,417-line analyzer, and the inner layer is advisory anyway.

Migration cost, all on the Pi side:

- Pi's analyzer has an ask tier (confirm prompts). cc-safety-net only blocks or allows. Pi users lose the prompts.
- Pi's corpus has 383 cases with allow, ask and block verdicts. Every ask and block case goes through cc-safety-net, checked both interactively and headless (Pi turns ask into block when no one can confirm). Each case where cc-safety-net is weaker needs a written decision: a rule in an Agent Guard rulebook (cc-safety-net takes custom rules), an upstream report, or an accepted change.
- Pi's fail-closed adapter behavior (timeout kills the process group, missing helpers block all bash) must be kept in the Pi adapter around cc-safety-net.
- Whether cc-safety-net's Pi extension loads in OMP is not verified.

Until the corpus run is done, the Pi profile keeps Pi's analyzer as its plugin. The retirement decision rests on that run.

## 6. Install, update, uninstall, signing

- **Install.** One zsh installer: `install.sh --harness opencode|pi [--projects DIR]`. A DMG with the AppleScript installer for people who do not use a terminal, as today. Pi drops npm as an install requirement. npm only ran scripts, and the deploy scripts' own `npm test` calls get replaced. Node stays, because Pi and its plugin run on it.
- **Update.** Run the installer again. It writes a version stamp (git SHA plus profile hash, as Pi does) and reruns the self-test. `agent-guard status` compares installed files with the stamp.
- **Uninstall.** Per harness, or everything. It restores what it changed (OpenCode permission values, PATH lines, Pi shim backups) and leaves the list and logs.
- **Signing.** Unsigned and not notarized, as both guards are today. The launcher app gets an ad-hoc signature. After each download the user clicks Open Anyway in System Settings, Privacy & Security. The installer removes the quarantine flag from the files it copies.

## 7. Testing

- OpenCode Guard's `test/test.sh` (throwaway home, list parsing, sandbox, plugin, OpenCode self-test, uninstall) splits into an engine test and the OpenCode profile test, with the same checks.
- A golden test: for fixed lists, the profile Agent Guard builds for OpenCode matches what OpenCode Guard 1.0.3 builds, apart from renamed paths. This is what "no behavior change" means in stage 1.
- Pi's suites carry over:
  - `smoke.mjs`, `corpus.mjs`, `adapter.mjs` and `degraded.mjs` become Pi plugin tests.
  - `shim.mjs` (executable resolution, TMPDIR, config pinning, nested launch) and `test-sandbox-profile.sh` become engine and Pi conformance cases.
  - `test-ops.sh` (deploy and status) and `check-launchers.mjs` feed the installer and migration tests.
  - Each case gets a new home or a written reason to retire it.
- One conformance suite runs against every profile under the real `sandbox-exec`: the profile file is assignments only; each writable path is writable; home and the guard are not; each protected path and name is denied for write and for creation, directly and through a symlink; DENY entries are denied for reads; `open` and `osascript` are denied; the plugin loads inside the guard; tools are refused when the harness runs unguarded; a nested launch passes through or refuses as designed.
- The installer runs the conformance suite as its self-test. Rerun it after each harness update, because harnesses move config paths.

## 8. Migration

**Stage 1: OpenCode, no behavior change.** Copy OpenCode Guard 1.0.3 into this repo, split into engine plus `profiles/opencode`. Pass the ported `test.sh` and the golden test. OpenCode Guard stays as it is and remains the released product.

**How every migration runs (stages 2 and 3).** Four steps:

1. Prepare: install Agent Guard beside the old guard, and keep copies of everything it will change.
2. Validate: run the conformance self-test through the new launcher.
3. Switch: point the `opencode`, `pi` and `omp` commands and the launcher app at Agent Guard.
4. Retire: remove the old engine, plugin, PATH lines and launcher app.

If a step fails, the installer stops with either the old guard still working or a launcher that refuses to start. It never leaves a harness that starts unguarded. Old command names are replaced, not deleted, so a shell opened earlier still finds a wrapper that runs the new launcher. Running the installer twice is safe.

**Stage 2: move OpenCode users.** The Agent Guard installer finds an OpenCode Guard install and imports `~/OpenCode Guard/Guard List.txt` as described in section 4. It carries over the saved permission record, so a later uninstall still restores the user's original values. It leaves a short note in `~/OpenCode Guard` pointing to the new list. The OpenCodeGuard repo gets a last release that says where to go, then is archived.

**Stage 3: Pi.** Port Pi's launcher hardening into the shared engine, the Pi SBPL fragment and state hook into `profiles/pi`, and keep Pi's analyzer as the Pi plugin. The installer imports `~/.config/pi-sandbox-guard/executables.conf` into the engine folder. It replaces the `~/.local/bin/{pi,omp}` shims with Agent Guard's, keeping backups. It proposes `@project` and Pi's credential DENY entries as a list change (section 4), and removes the old extension. Pi's active git hooks protection stays on throughout. Then run the corpus against cc-safety-net and decide on section 5. The pi-sandbox-guard repo is public; it gets a last release note and is archived.

**Later, a separate release:** extend Pi's active git hooks protection to every profile. Hooks planted in an ALLOW folder run outside the guard at the next plain `git` command. OpenCode Guard lists this as a limit today; this is a behavior change for OpenCode users, so it does not ship in stage 1.

## 9. Candidate next harnesses

Ranked. Each has no OS sandbox of its own.

1. **Kiro CLI.** Claude-style PreToolUse hooks. It fails open, which is acceptable because the outer layer is the boundary.
2. **Crush.** No OS sandbox, and a terminal CLI like OpenCode, so the launch model carries over. Hook API not yet verified.
3. **Mistral Vibe.** No OS sandbox. Hook API not yet verified.

Aider and OpenHands are not candidates until they have a hook that can refuse a tool call. Hermes Agent is out of scope; its safety stays in its own config.

## 10. Risks and open decisions

Risks:

- Apple marks `sandbox-exec` deprecated. It still works and Chrome, Codex and Claude Code depend on it. The self-test fails loudly if it stops working.
- Harness updates can add config or extension paths the profile does not protect. The conformance suite after each update is the check.
- During stage 2 and 3, two guards can be installed at once with competing shims. The installer must remove the old one before it finishes.

Open decisions:

- Notarize (paid Apple Developer ID) or stay unsigned.
- Name entries in the list (such as `.env` anywhere under DENY). Pi denies project `.env` reads today; until this is decided that rule stays in the Pi fragment.
- Retire Pi's analyzer, after the corpus run.
- Protect project MCP and settings files that one harness reads from another (`.mcp.json`, `.claude/settings.json`, `.codex/config.toml`, `opencode.json` and similar). They are bare file names that also appear in fixtures and examples, and their MCP commands run inside the sandbox.
- Protect Pi's user-level package folders (`~/.pi/agent/npm`, `~/.pi/agent/git`) and `~/.pi/agent/SYSTEM.md`. Pi loads them at every start, and pi-sandbox-guard leaves them writable today. Protecting them stops `pi install` from working inside the guard.
- When to make the Agent Guard repo public.

## 11. Next steps

1. Add an MIT LICENSE and a `.gitignore`.
2. Copy OpenCode Guard 1.0.3 in and split it into `engine/` and `profiles/opencode/`.
3. Port `test/test.sh` and add the golden profile test against 1.0.3.
4. Write the profile loader, with home and the engine folder taken from the account database, and the conformance suite; run it on the OpenCode profile.
5. Add `@project` and per-launch state files to the list parser.
6. Write the stage 2 migration path (list and permission record import, old install removal) and test it in a throwaway home.
7. After the pi-sandbox-guard fix lands on main, draft `profiles/pi` and run Pi's corpus through cc-safety-net.
