# Agent Guard design

Status: accepted plan, 2026-09-30. Built on the zsh engine: stage 1 (the OpenCode Guard v1.0.3 port, with the v1.0.4 fixes) and steps 2 and 3. Step 4 is partly built: release folders, `check staged`, and `agent-guard doctor` and `version`. Its staged installer, update, uninstall command, recovery and version stamp, and steps 5–11, are not built.

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
| Nested launch | If `AGENT_GUARD_SANDBOXED=1`, or OpenCode Guard's `OPENCODE_SANDBOXED=1` until step 11, and a trivial `sandbox-exec` call fails (the caller is already sandboxed), `cli` runs the harness directly and every other mode refuses. |
| List parser | In `engine/launch`. Rules in section 4. |
| Profile builder | Fills the slots of `engine/profile.sb` (`@WRITABLE@`, `@WRITABLE_GUI@`, `@USER_RULES@`, `@PROTECTED@`, `@PROTECTED_NAMES@`) from the profile and the list, and passes `HOME`, `DARWIN_TEMP`, `DARWIN_CACHE` and `GUI` as `-D` parameters. Rule order in section 3. |
| Log | `~/Agent Guard/last-launch-opencode.log`, rewritten at each launch: skipped, refused and overridden entries; the resolved ALLOW, READ ONLY and DENY sets; what OpenCode can always write. |
| State | `state/rules.json` in the engine folder: the resolved allow, read only and deny paths. Every launch, in every mode including `profile` and `check` but except `check staged`, writes it to a temp file and renames it over the old one. The plugin reads it once at start, so launch B can replace it before launch A's plugin reads it; A's plugin then refuses and reports against B's rules while Seatbelt still enforces A's own profile. Step 9 replaces it with a state file per launch whose path the launcher passes to the plugin. |
| Plugin | `profiles/opencode/plugin.js`: guard probe, path checks, unguarded refusal, status tool, cc-safety-net loading (section 5). One file for now; it splits into a shared core and a per-harness adapter when Pi arrives (step 10). |
| cc-safety-net | Version 2.4.14, unmodified, in `engine/vendor/cc-safety-net`. |
| Bootstrap | `scripts/bootstrap.zsh`, built into the release asset `install.sh`: downloads the archive and its checksum, verifies, unpacks into `stage/<txn>/tree` and runs the archive's installer under its lock. Section 6. |
| Installer and uninstaller | `profiles/opencode/install.sh` and `profiles/opencode/uninstall.sh`, both copied into each release folder; `install.sh` at the repository root forwards to the first. The installer is also a library (`source install.sh --lib`) for the guard probe, lock, recovery and file primitives that the uninstaller and `agent-guard` use. Both take home from `engine/account.zsh`, a verbatim copy of the launcher's `account_home` function; `scripts/check-seams.zsh` and `test/test.sh` check that the two match. Section 6. |
| Command | `engine/agent-guard`, installed as `bin/agent-guard`: `doctor`, `version`, `update`, `uninstall` (section 6). It takes its release from its own resolved location, sources that release's `account.zsh` only if the folder has the shape of a release (a `RELEASE` file, a parent named `releases`), then applies the launcher's check. |

Launcher modes: `cli` (the `opencode` shim), `gui` (the `opencode-gui` shim, used by the app; refuses if OpenCode is already running and shows failures as an alert), `profile` (prints the generated SBPL), `check` (the installer's self-test: a protected write is denied, a temp write is allowed, `open` is denied, then the profile's `check_hook`) and `check staged` (section 6). The installer also calls an internal `find-app` mode. The built launcher loads only the OpenCode profile, and its log name and some messages ("OpenCode needs", "opencode not found") are OpenCode's.

At step 8 the launcher becomes one Rust binary with the same parts: account lookup, list parser, profile builder, log and state. Profiles become TOML embedded in the binary (section 3), hooks become Rust functions and one module builds the Seatbelt profile. The plugin stays JavaScript and cc-safety-net stays vendored. It reaches the two existing installs through `update`, after both switched on the zsh engine, so migration failures and rewrite failures stay separate (section 7).

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
    stamp.json                                        version stamp, written after the gate passes
    lock/{pid,start}                                  the running install, update or uninstall
    txn/                                              open transaction: install.sh, account.zsh, uninstall.sh, plan.json, journal, backup/
```

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

None of these names is shared with OpenCode Guard, and neither are the status tool, bypass variable, message prefix, nesting marker or app bundle ID (`io.github.ebrindley.agentguard`); the names are listed in section 12, step 3. The launcher still honors OpenCode Guard's nesting marker until step 11 and skips any executable inside its engine folder. An existing OpenCode Guard PATH block or rulebook is left unchanged. Until the migration (step 5), the installer refuses, before any change, when OpenCode Guard's engine folder or `~/.config/opencode/plugins/opencode-guard.js` exists (section 6).

## 3. Harness profiles

A harness profile is data plus named hook functions and SBPL fragments. On the zsh engine, `harness.zsh` is a file of assignments read with `source`; zsh arrays keep paths with spaces intact and need no parser. Hooks are functions in `hooks.zsh`, and `protected.sb` is the OpenCode fragment.

Profiles and hook files are trusted code, like the engine: `source` runs anything in them, including `$(...)` inside an assignment. They are safe only because they live in the write-protected engine folder and the launcher finds that folder from the account database, not from `$HOME` or any other environment the agent could set. A conformance test that allows only plain assignments catches mistakes. It is not a boundary.

From step 8 profiles are TOML files embedded in the Rust binary, with the same fields. Hook fields name Rust functions and fragments are embedded too. `~` in a path means the account home. Changing a profile then means replacing the binary, which the engine folder protection covers.

The contract. "Planned" fields do not exist in the built engine.

| Field | Meaning | OpenCode (built) | Pi (planned) |
|---|---|---|---|
| `name` | Profile ID | `opencode`; not yet read by the launcher | `pi` |
| `title` | Name shown to the user | `OpenCode`; not yet read by the launcher | `Pi` |
| `cli_names` | Commands the shims stand in for; the launcher looks for the real one on PATH | `opencode` | `pi`, `omp`; the shim's own name picks the runtime |
| `cli_search` | Fallback executable paths | Both Homebrew prefixes, `~/.opencode/bin/opencode` | npm installs under both Homebrew prefixes, after `binding_file` |
| `app_paths`, `app_bundle_id` | App locations, then a Spotlight lookup by bundle ID | `OpenCode.app` in `/Applications` and `~/Applications`; `ai.opencode.desktop` | None |
| `writable` | Always writable; created at launch | Seven paths, below | `~/.npm`, `~/.cache`, `~/Library/Caches` |
| `writable_gui` | Also writable in `gui` mode | App support and saved state folders | None |
| `gui_args` | Arguments added in `gui` mode | `--no-sandbox` (Electron; Chromium's sandbox cannot nest) | None |
| `protected_paths` | Harness paths write-denied in the final deny block | `~/.config/opencode`, `~/.opencode` | `~/.pi/agent/extensions`, `settings.json`, `auth.json`, `trust.json` |
| `protected` | Paths whose symlink targets are resolved and protected at launch | `protected_paths` plus `~/.cc-safety-net` | Same as `protected_paths` |
| `protected_names` | Names whose symlinks directly in the launch folder are resolved at launch | `.opencode`, `opencode.json`, `opencode.jsonc`, `tui.json`, `tui.jsonc` | `.pi`, `.omp` and the cross-harness folders below |
| `protected_fragment` | SBPL added at the end of the final deny block | `protected.sb`: the name regexes and `.cc-safety-net` | `pi-protected.sb`, below |
| `env_unset`, `env_set` | Environment changes, applied in every mode. The engine sets its nesting marker itself; profiles do not list it | Unset `ELECTRON_RUN_AS_NODE`, `OPENCODE_SIDECAR_V2`, `CC_SAFETY_NET_HOME`, `CC_SAFETY_NET_WORKTREE`, `SAFETY_NET_WORKTREE`; set `CC_SAFETY_NET_PARANOID_RM=1` | Set `NPM_CONFIG_USERCONFIG=/dev/null` |
| `prepare_hook` | Runs after the profile is built, before the state write and exec | `opencode_prepare`: creates `~/.config/opencode`, its `.gitignore` and a minimal `opencode.json` if none exists | `pi_prepare`: resolves the active git hooks folder; refuses symlinked `.pi` and `.omp` layouts |
| `check_hook` | Extra step in `check` | `opencode_check`: runs `opencode serve` under the guard and looks for the status tool | `pi_check` |
| `allow_fragment` | Planned. SBPL added after `writable`, before the list rules | None | `pi-allow.sb`, below |
| `state_hook` | Planned. Resolves harness state roots, passed as SBPL parameters | None | Pi and OMP roots from `PI_CODING_AGENT_DIR`, `PI_CONFIG_DIR`, OMP's `--profile` and `OMP_PROFILE` or `PI_PROFILE` |
| `launch_hook` | Planned. Adjusts the harness arguments | None | Adds `--extension <plugin>` for agent sessions, not for administrative subcommands |
| `binding_file` | Planned. Recorded executable and interpreter paths | None | Imported from `~/.config/pi-sandbox-guard/executables.conf` (section 11) |
| `start_folder` | Planned for step 10. What `@project` means (section 4) | Defined at step 10 from `opencode [project]` | `PI_PROJECT`, else git top level, else the launch folder |
| `plugin_dir`, `plugin_files` | Planned. Where the installer puts the plugin | Hard-coded in the installer as `~/.config/opencode/plugins/agent-guard.js` | `~/.pi/agent/extensions` |
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

`writable` includes all of `~/.cache`, which holds OpenCode's npm plugin store. Step 7 protects the store (section 9).

Planned Pi profile, written as TOML because Pi arrives after the Rust launcher:

```toml
name = "pi"
title = "Pi"
cli_names = ["pi", "omp"]                 # the shim's own name picks the runtime
binding_file = "executables.conf"
cli_search = ["/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
              "/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js"]
app_paths = []
writable = ["~/.npm", "~/.cache", "~/Library/Caches"]
state_hook = "pi_state_paths"
allow_fragment = "pi-allow.sb"
protected_paths = ["~/.pi/agent/extensions", "~/.pi/agent/settings.json",
                   "~/.pi/agent/auth.json", "~/.pi/agent/trust.json"]
protected_names = [".pi", ".omp", ".claude/extensions", ".claude/hooks", ".claude/tools",
                   ".codex/extensions", ".codex/hooks", ".codex/tools",
                   ".gemini/extensions", ".opencode/plugins"]   # Pi and OMP load these at start
protected_fragment = "pi-protected.sb"
env_set = ["NPM_CONFIG_USERCONFIG=/dev/null"]
prepare_hook = "pi_prepare"
launch_hook = "pi_launch_args"
start_folder = "git-toplevel"
plugin_dir = "~/.pi/agent/extensions"
check_hook = "pi_check"
```

The fragments carry pi-sandbox-guard's `sandbox/pi-sandbox.sb` as of PR #10:

- `pi-allow.sb`: the active Pi state root (`~/.pi/agent`, or a relocated root under `~/.pi`); for OMP, a positive allowlist of the runtime paths observed in OMP 17.2.10 under the active OMP root; `~/.pi/agent/security-events.log`.
- `pi-protected.sb`: in the active Pi state root and at `~/.pi/agent`, `extensions/`, `npm/`, `git/`, `skills/`, `settings.json`, `auth.json`, `trust.json`, `SYSTEM.md`, `APPEND_SYSTEM.md`, `models.json` and any `*prompt*.md` (the user package folders are protected since PR #9); OMP's extensions, hooks, tools, commands, skills, agents, prompts, rules, instructions, plugins and its config, model, MCP, SSH, token and `.env` files; the project's `.git/hooks`, the active hooks folder, submodule hooks and hooks in OMP's worktrees, with the re-allows listed in section 11; write denies on credential folders such as `~/.ssh` and `~/.aws`; read denies on credential files and on `.env` files anywhere.
- Sessions and theme JSON stay writable. OMP's `agent.db` holds both operational data and credentials and stays writable.

pi-sandbox-guard's pre-sandbox launch checks and executable bindings carry over with the Pi profile at step 10 (section 11). Whether the engine then applies them to every profile is decided in that step.

**Protected paths and names** are write-denied, including creation, rename and removal. A missing config file created by the agent and run at the next start was [CVE-2026-25725](https://nvd.nist.gov/vuln/detail/CVE-2026-25725) in Claude Code. OpenCode's names match anywhere on disk, including temp and OpenCode's own writable folders; the only exception is `~/.cc-safety-net/logs`. Planned for Pi: the same match-anywhere rule, except inside the harness's own state folders, so `.omp` does not cover OMP's state in `~/.omp`. pi-sandbox-guard matches these names only inside the project (PR #8). Matching everywhere also closes a route the project-only rule leaves open: building a `.pi` folder in `/private/tmp` and moving its parent into a project. A name must still be narrow enough not to cover other state the harness writes. Narrow exceptions go in the protected fragment, as `~/.cc-safety-net/logs` does.

**Symlinks.** Seatbelt checks the resolved path, so a link can carry a write past a name rule. At launch the engine resolves the engine folder, the list folder, the profile's `protected` entries, `~/Library/LaunchAgents`, the shell startup files and each of `protected_names` directly inside the launch folder (`$PWD`). Where one is a link, its target is write-denied and added to READ ONLY for the plugin. Elsewhere only the name is protected: the agent cannot create, replace or remove a link with that name, but writes through an existing link reach its target. The plugin refuses file edits through such a link; shell commands are not checked. `.cc-safety-net` is not in `protected_names`, so a `.cc-safety-net` link in the launch folder is not resolved. `opencode <project>` run from another folder gets no resolution for the project's names; `@project` (step 10) must resolve the same folder the harness opens. Stage 1 keeps these limits and the README says so. pi-sandbox-guard instead refuses to launch when `.pi` or `.omp` in the project or launch folder is a link, or holds a link to a writable place outside it (PR #8); the Pi profile keeps that.

**Every installed harness.** The base profile write-protects the engine folder (launcher, profiles, shims, vendored code, state), the list folder, `~/Applications/Agent Guard.app`, `~/Library/LaunchAgents` and eight shell startup files. It also stops home, `~/Library`, `~/Library/Application Support`, `~/.config` and `~/Applications` from being renamed or removed. The profile adds its own paths and names. Once a second profile exists (step 10), every launch also protects the `protected_paths` and `protected_names` of every installed profile, not only the one being launched, and the binding file. Otherwise an ALLOW entry could expose another harness's plugin or config.

**Executables and launch links.** Planned: the harness executable, its interpreter and every launch link on the way to them (shim, symlink) are protected against replacement and against renames of their parent folders. Homebrew's prefixes (`/opt/homebrew`, `/usr/local`) are owned by the installing user, so Seatbelt policy, not ownership, stops the agent writing there. Today the OpenCode executable is protected only by the base write deny: an ALLOW entry such as `/opt/homebrew` passes the list checks and makes it writable.

**Rule order** in the generated profile:

1. `(allow default)`, then deny all writes.
2. Allow writes to `writable`, `/private/tmp`, the per-user temp and cache folders and a few device files; `writable_gui` in `gui` mode. The planned `allow_fragment` goes here.
3. List rules: ALLOW and READ ONLY entries from least to most specific, then DENY entries (read and write), then symlink targets of protected paths, then pinned folders (section 4).
4. The final deny block: engine folder, list folder, `protected_paths`, `~/Library/LaunchAgents`, the app, shell startup files, the pinned home folders, then `protected_fragment`.
5. Deny `lsopen` and `job-creation`, and deny running `open`, `osascript`, `osacompile`, `codesign`, `diskutil`, `launchctl` and `sudo`.

Seatbelt applies the last matching rule, so the list cannot reopen a protected path, and a harness's allow fragment cannot reopen a DENY entry. A harness's denies go in `protected_fragment`, after the list, because an ALLOW entry covering the project would override Pi's hook and state denies if they came before it. A re-allow inside the protected fragment (Pi's hook scaffolding, section 11) also comes after the list, so it must stay narrow. Fragments are reviewed like engine code.

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

`@project` arrives at step 10, as one new entry valid only under ALLOW:

```
ALLOW - agents may create, change and delete things inside these:
@project
~/Projects
```

Step 10 first defines it for OpenCode: the positional project argument (`opencode [project]`), and what it means for the app launcher, whose working directory is unverified. For Pi it keeps pi-sandbox-guard's resolution: `PI_PROJECT` if set, else the git top level, else the launch folder. It also keeps Pi's refusal rules (`sandbox/pi-sandbox-preamble.zsh`). The launch is refused rather than widened if `@project`:

- is `/`, home, `/Users`, `/Volumes`, `/tmp`, `/private/tmp`, `/private` or `/var`;
- is or is inside `/etc`, `/usr`, `/bin`, `/sbin`, `/opt`, `/System`, `/Library` or `/Applications`;
- is or is inside `~/.ssh`, `~/.aws`, `~/.config`, `~/.docker`, `~/.gnupg`, `~/.kube`, `~/Library`, `~/Desktop`, `~/Documents` or `~/Downloads`;
- contains the guard;
- is inside a protected agent config folder (section 3).

The log shows what `@project` resolved to. New lists get `@project` commented out.

Every entry applies to every harness, so a list import is a policy change, not a copy. The installer shows the proposed list and what each harness gains or loses once, writes nothing until the user confirms, and never overwrites an existing `~/Agent Guard/Guard List.txt`. The OpenCode Guard import is in section 10, the Pi import and its effect on each harness in section 11.

## 5. Inner layer

Recommendation: cc-safety-net for shell commands in every harness, plus Agent Guard's plugin core for file paths. The inner layer is advisory; Seatbelt is the boundary.

The OpenCode plugin as built (`profiles/opencode/plugin.js`):

- **Guard probe.** It creates a file in the engine's `state/` folder. EPERM means guarded. Success, any other error, a missing folder or a symlinked folder means unguarded.
- **Unguarded refusal.** Unguarded, it refuses every tool except `invalid`, `question`, `todowrite`, `webfetch`, `websearch`, `plan_exit` and the status tool, with a message to quit and open Agent Guard or run `opencode` from a new terminal. `AGENT_GUARD_BYPASS=1` lifts the refusal; OpenCode Guard's `OPENCODE_GUARD_BYPASS` does not. This also covers any launcher that bypasses the guard, including custom wrappers.
- **Path checks.** Guarded, it refuses every tool if cc-safety-net fails to load. `read`, `glob`, `grep`, `list` and `lsp` are refused under DENY. `edit`, `write` and each path in `apply_patch` are refused when the path is protected (the engine folder, the list folder, `~/.config/opencode`, `~/.cc-safety-net` or a protected name on the path as typed or as resolved), under DENY or outside ALLOW and temp. Writes are refused when `state/rules.json` could not be read.
- **Release.** The plugin finds its release from its own real path (`realpathSync` of `import.meta.url`), whatever link OpenCode loaded it through. A copy whose real path is not inside a release folder in `releases/` loads no cc-safety-net: guarded, it refuses every tool, and it registers no status tool, so `check` fails.
- **Launch release.** Before anything else, the plugin reads `AGENT_GUARD_RELEASE`, which the launcher sets to its own release ID. OpenCode loads the plugin through `current`, so after an update a session started from the previous release would otherwise load the new release's plugin. If the value matches `[0-9A-Za-z.+-]+` (not `.` or `..`), differs from the plugin's own release and names a folder in `releases/` that holds `RELEASE` and whose `profiles/opencode/plugin.js` really lives there, the plugin imports that file and returns its plugin function instead of its own. That module is then in its own release, so it does not hand over again. If the named release is missing or fails to load, the plugin loads no cc-safety-net: guarded, it refuses every tool with "Agent Guard was updated; quit and reopen OpenCode."; unguarded, it refuses as usual. Any other value, and an unset variable (a bare `opencode`), leave the plugin on its own release. Only folders in the write-protected `releases/` qualify, so the variable cannot pick code from a writable place.
- **Shell commands** go to cc-safety-net 2.4.14, loaded from `vendor/` of the release the plugin resolves into. The profile sets `CC_SAFETY_NET_PARANOID_RM=1` and unsets `CC_SAFETY_NET_HOME`, `CC_SAFETY_NET_WORKTREE` and `SAFETY_NET_WORKTREE`. Guarded, the plugin also deletes those three from its own environment and sets `CC_SAFETY_NET_PARANOID_RM=1` before it loads cc-safety-net; unguarded, it leaves the environment alone. The installer adds an Agent Guard rulebook.
- **Status tool** `agent_guard_status` reports whether the guard is active, with that release's version and ID (`Agent Guard 0.2.0 (0.2.0-20261001T120000Z) is active.`); its description carries the same version and ID. `check` looks for it. It is registered only when cc-safety-net loaded.

cc-safety-net 2.4.14 ships entry points for OpenCode and Pi, and a hook mode for Claude Code, Codex, Copilot CLI, Cursor, Gemini CLI, Grok Build, Kimi Code, Antigravity CLI, Amp, OpenClaw and Hermes Agent. One upstream blocker is less to maintain than a second analyzer (pi-sandbox-guard's `src/validate-bash-command.sh`, 4,417 lines).

Pi keeps its analyzer as the Pi plugin through step 10; the Pi adapter adds the plugin core around it. Pi's unguarded behavior changes: today it only prints a FILTER-ONLY warning when `PI_SANDBOX_PROFILE_DIGEST` is absent, and Agent Guard refuses tools instead (section 11). Replacing the analyzer with cc-safety-net is a separate decision after the corpus run (section 15). Its cost, all on the Pi side:

- Pi's analyzer has an ask tier (confirm prompts). cc-safety-net only blocks or allows. Pi users lose the prompts.
- Pi's corpus has 383 cases with allow, ask and block verdicts. Every ask and block case goes through cc-safety-net, checked both interactively and headless (Pi turns ask into block when no one can confirm). Each case where cc-safety-net is weaker needs a written decision: a rule in an Agent Guard rulebook (cc-safety-net takes custom rules), an upstream report or an accepted change.
- Pi's fail-closed adapter behavior (its timeout kills the process group; a missing analyzer or helper blocks all bash) must be kept in the Pi adapter around cc-safety-net.
- Whether cc-safety-net's Pi extension loads in OMP is not verified.

## 6. Install, update and uninstall

### The installer as built

`profiles/opencode/install.sh` has three entries. The bootstrap runs `install.sh --stage <txn>` on the unpacked tree in `stage/<txn>/tree`, under the lock it took. From a checkout or an unpacked archive, `zsh install.sh [--projects DIR] [--gui]` copies the tree into `stage/<txn>/tree` (with `COMMIT` set to `checkout` when the tree has none) and runs that copy the same way. Recovery runs `state/txn/install.sh --recover <caller>` (below). Every function runs from `main` on the last line, so a file replaced or deleted mid-run is never read half-way.

Preflight changes nothing and stops on the first failure: required tools; the guard probe (an exclusive create in `state/`, refused with "run this from Terminal, outside any guard or sandbox" when Seatbelt denies it); the lock; recovery of an earlier run; OpenCode Guard's engine folder or `opencode-guard.js` (migration arrives in step 5); an install made before release folders (`$engine/launch` a regular file, removed with its own `"$engine/uninstall.sh"`); an unfinished PATH block in a startup file; any file the run replaces on another volume than the engine; the projects folder. Only then does a run name its release ID and open a transaction.

**Lock.** `state/lock/` holds `pid` and `start`, the owner's start time from `ps -o lstart=`. A lock is live when that pid runs zsh with the same start time; a lock without both files counts as held for 10 seconds, so a run that is still writing them is not taken over. A stale lock is taken over under an `fcntl` lock on `state/.lock-takeover`. The bootstrap, the installer and `agent-guard update` hand the lock on through `exec`, which keeps the pid. A recovery child adopts its parent's lock and refuses to run without it.

**Transaction.** The installer builds `state/txn.new/` with copies of `install.sh`, `account.zsh` and `uninstall.sh`, `plan.json` (release IDs, kind, stage, projects folder, app decision and the config files) and an empty `journal`, syncs, and renames it to `state/txn/`. The journal has one line per step, `<action> begun|done|undone [detail]`; a line of any other form, such as a torn last line, is ignored. Before a step changes a file it copies the original to `txn/backup/<name>/file` through a temporary name. Runs before the switch (assemble into `stage/<txn>/release` and rename to `releases/<rid>`, the rulebook and merged `rule.json` in the stage, the app build with `codesign --verify --strict` and a bundle ID check, the list, then `releases/<rid>/launch check staged`) touch nothing outside the engine folder and the list.

**Switch.** In order: rulebook folder, `rule.json`, app, `current`, plugin link, permission values, PATH blocks. Each step journals `begun` before it changes anything and `done` after, and each has an undo that uses the backup and the journal detail. The app is rebuilt only when its inputs (the AppleScript, which names `bin/opencode-gui` through `bin`, the bundle ID and the icon) differ from the stamp's `app_inputs`; otherwise the installed app is kept. The permission record is written before the config it describes, so a run stopped between the two writes leaves a record that matches either config state. `/bin/sync` runs after each `begun` line, after the transaction opens and after the stamp is written.

**Gate.** After the switch: `bin/agent-guard doctor` against the live install, then `bin/opencode --version` through the PATH shim with a 20-second limit, whose log must name the new release. With no OpenCode CLI the launch check is skipped and says so. Any failure rolls back.

**Rollback.** Journals `rollback begun`, undoes every step that began, in reverse order, journals `rollback done`, deletes the new release and closes the transaction. A rollback of a fresh install also removes the engine folder; a permission record that is not empty is first copied to `~/Agent Guard/permissions-backup.json`.

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

Lists, user edits and permission records survive failed runs and reruns. An existing `~/Agent Guard/Guard List.txt` is never overwritten; the installer copies the template only when the list is missing. A config file's permission values are recorded once, on the first run that changes them, so reruns keep the first `orig`. The installer does not read OpenCode Guard's record (section 10, rule 3).

### Commands

`agent-guard`, installed as `$engine/bin/agent-guard`:

- `doctor` runs the release's `launch check` (section 8). The gate runs it after the switch. It does not recover an interrupted run; `update` does.
- `version` prints `Agent Guard <version> (<tag>, commit <12 characters>), release <rid>, installed <UTC time>` from the stamp, then one line per stamped file or link that is missing or changed and per file added to the release folder. It exits 1 on any drift or when there is no stamp.
- `update` refuses inside a guard, takes the lock and runs recovery, then downloads the latest release's `install.sh` from the download base compiled into it. It requires the file's last line to be `{ agent_guard_bootstrap "$@" }` and exactly one release tag in it. When that tag is the stamp's, or older, it says so and changes nothing; otherwise it runs the bootstrap with `--update` under the same lock, and the full staged install follows. A failed update leaves the installed version working.
- `uninstall` refuses inside a guard, takes the lock and runs recovery as the uninstall caller, which rolls back an open switch. Recovery can delete the release this command runs from, so it then finds the uninstaller again: `current`'s, else the transaction's copy. When recovery rolled back a fresh install and only an empty state folder is left, it removes the engine folder itself.

### Uninstall

`profiles/opencode/uninstall.sh` runs in this order. Until the plugin goes, a start without a PATH block meets the plugin's unguarded refusal, and an old terminal still reaches working shims.

| Step | What |
|---|---|
| U1 | PATH blocks between the markers in `.zprofile`, `.zshrc` and `.bash_profile`, at each file's resolved target; an unfinished block is reported, not touched |
| U2 | Each recorded permission value, only where the current value still equals the recorded `wrote` value, so later user edits survive; an `orig` of null deletes the key. A file's entry leaves the record once the file is restored. |
| U4 | The launcher app |
| U5 | The `agent-guard` entry in `~/.cc-safety-net/rules/rule.json`, then the rulebook folder |
| U6 | The forwarders at old command paths (section 10; arrives with step 5) |
| U7 | If any value was not restored, the permission record is copied to `~/Agent Guard/permissions-backup.json`. If that copy fails, the engine is kept and uninstall exits 1. |
| U3 | The plugin, when it is a link into the engine folder or a regular file |
| U8 | The engine folder, renamed to `.AgentGuard.removing` and then deleted, so a rerun finds the whole folder or none of it |

Each step can be repeated, so a rerun after a failed or interrupted uninstall finishes the job. Uninstall exits 1 and names what is left when a PATH block or a permission value was not handled.

It leaves `~/Agent Guard` (list, logs, any permission backup); the wrapper entries (`env`, `exec`, `nice`, `nohup`, `setsid`, `stdbuf`, `time`, `timeout`) in `rule.json`'s `transparent_wrappers`; the `~/.config/opencode/.gitignore` and default `opencode.json` the launcher creates when missing; the writable folders the launcher creates.

What uninstall does with OpenCode Guard's retired files and the forwarders at old command paths is in section 10.

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

Constraints:

- Profiles are TOML embedded in the binary, with the same fields as the zsh profiles (section 3).
- Hooks are written in Rust.
- One module builds and applies the Seatbelt profile.
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
- Behavior the golden test does not cover matches the zsh engine: executable selection that skips every guard shim, old and new (section 10, rule 8); argument forwarding; environment unset and set; nested launch; exit status; app launch; log and state contents.

Admission: the work Mac's route for admitting a new binary is settled before this update reaches it (section 6).

The Rust update refuses to switch a Mac where the new binary cannot run. It runs the staged binary's self-test on that Mac first. If the binary is blocked, needs a newer macOS or fails its checks, the update fails, says why and leaves the zsh version working.

The zsh engine stays in the repository until both existing Macs run the Rust version. After it is removed, rollback artifacts are kept: the last zsh release stays installable. How a Mac is rolled back to it is settled in step 8.

## 8. Testing

Both current tests run outside any agent sandbox on macOS 15 or later, because Seatbelt profiles cannot nest:

```sh
node test/golden.mjs
zsh test/test.sh
```

**Golden fixtures.** `test/fixtures/opencode-guard-1.0.3` holds unmodified `engine/launch` and `engine/profile.sb` from OpenCode Guard v1.0.3, commit `9242c1ad45c895efd63e903e1b27d7bab53620ad`. `test/golden.mjs` first checks that the account lookups in the launcher and in `engine/account.zsh` return the real account home when `HOME` and `USER` are spoofed. It lays the staged tree out as a release folder with `current` pointing to it. It then generates the complete SBPL for an empty and a nested list with both launchers and compares them byte for byte, replacing only `OpenCodeGuard` and `OpenCode Guard` with the Agent Guard names. It proves profile bytes only. The fixtures stay unchanged. When a later step changes the profile on purpose (step 7's package-store protection, for example), the golden test compares against the fixture plus that step's recorded, reviewed difference, not an edited fixture.

**Engine adapter.** `test/test.sh` runs 164 checks in a disposable home: 89 shell checks (install refused with no change over OpenCode Guard's engine folder or plugin and over an install without release folders; `account.zsh` equal to the launcher's function; install and installed names; release layout, `current` and `bin` links and the plugin link, with no other plugin file; `agent-guard version` and usage; two reinstalls that each keep only the new and the previous release; permission merge, list refusals and log, the release ID in the log; a copied launcher and a release folder without `RELEASE` refused; real Seatbelt enforcement, CLI launch and nested launch with each nesting marker, the shim loop in both PATH orders and through symlinks, executables inside either engine folder skipped; a launch from the previous release logged under its ID while `current` names the new one; `check staged` refused for the current release, passing for a staged one without writing `rules.json` or OpenCode config, and failing when the staged plugin lacks the status tool while `doctor` passes on the live one; OpenCode Guard's PATH blocks, rulebook and plugin file left unchanged; uninstall) and 75 plugin checks from `test/plugin.mjs` in eight modes (unguarded, bypass, OpenCode Guard's bypass variable, guarded with the status text, run directly and through the previous release's launcher, which must report that release; `AGENT_GUARD_RELEASE` naming a deleted release, refused with the update message; the status text alone with `AGENT_GUARD_RELEASE` values outside the allowed form, which are ignored; a copy outside `releases/`; symlinked state folder). It needs Node and the OpenCode CLI. The shim loop checks install the unmodified v1.0.3 fixture launcher as OpenCode Guard and give up after 20 seconds, so a loop fails instead of hanging. Engine specifics sit behind an adapter, `test/engines/<name>.mjs`, with six functions: `name`; `stage`, which copies `engine/`, `profiles/`, `install.sh`, `LICENSE` and `VERSION` if present into a disposable tree and injects the test home into the copied launcher and `account.zsh`; `layout`, which lays a staged tree out as `releases/<rid>` with `current` pointing to it; `launcher`, the command that runs `current/launch` or a named release's `launch`; `identity`, which runs the unmodified account lookups; and `release`, which builds a release from the unmodified source with `scripts/release.sh --dev`, then applies the test seams to the archive's files and to its `install.sh` and rewrites the checksum (`test/bootstrap.sh` serves it from a local server). Both tests take `--engine NAME` (default `zsh`), so the same checks run against the zsh engine now and the Rust engine at step 8.

**Test-only home injection.** Today `test/fixture-home.mjs` rewrites the account lookup in a copied launcher, and the `account_home() {` line in a copied `account.zsh`, to a fixed home, and fails unless each occurs exactly once. The installed launcher has no environment variable or flag that chooses home. Rewriting source cannot work on a Rust binary, so the Rust launcher gets a home injection compiled only into test builds, and the release build is checked for its absence.

**Conformance suite.** One suite runs against every profile under the real `sandbox-exec`:

- the profile holds only the declared fields: plain assignments for a zsh profile, known keys for a TOML profile;
- each writable path is writable; home and the guard are not;
- each protected path and name is denied for write and for creation, directly and through a symlink;
- DENY entries are denied for reads;
- `open` and `osascript` are denied;
- the plugin loads inside the guard;
- tools are refused when the harness runs unguarded;
- a nested launch passes through or refuses as designed.

**`doctor` versus conformance tests.** `doctor` is the small check that runs on an installed Mac: the installer's self-test, `update` and step 6's per-Mac check. It is `agent-guard doctor`, which runs the release's `launch check`: a protected write is denied, a temp write is allowed, `open` is denied, then the OpenCode hook starts `opencode serve` under the guard and looks for the guard's status tool. It skips the plugin check, and still passes, when the OpenCode CLI is not found. Step 7 extends it to check that the configured plugins loaded (section 9). The conformance suite and the integration checks are development tests. They run from the repository in a disposable home and are not installed. This replaces the draft's plan to run the conformance suite as the installer's self-test.

**Pi suites, carried over at step 10.** From pi-sandbox-guard:

- `test/smoke.mjs`, `test/corpus.mjs`, `test/adapter.mjs` and `test/degraded.mjs` become Pi plugin tests.
- `test/shim.mjs` (executable resolution, TMPDIR policy, config pinning, nested launch) and `scripts/test-sandbox-profile.sh` become engine and Pi conformance cases.
- `scripts/test-ops.sh` (deploy and status) feeds the installer and migration tests.
- `scripts/check-launchers.mjs` runs once in `--sources` mode for the custom Pi wrapper scripts. Its `--deployed` mode expects zsh shims and would reject Rust ones, so launch behavior is verified by the conformance suite instead (section 11).
- Each case, including the manual `test/e2e-demo.mjs`, gets a new home or a written reason to retire it.

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

Step 5 builds the migration and step 6 runs it on the two existing installs, a home Mac and a work Mac, home Mac first. The rules below bind the step 5 installer. Section 6 covers the staged install and update it builds on.

OpenCode Guard v1.0.4 (tag `1ac39a2`, 2026-09-30) is v1.0.3 plus five commits (`2e93cf3`, `13a5aa1`, `14e0e85`, `3fd2703`, `85dc43f`): cc-safety-net 2.4.14, more cc-safety-net wrappers, clearing agent-set cc-safety-net home and worktree variables, and two `check` fixes. Step 3 ports them first, so a Mac on v1.0.4 loses no fix at the switch. They do not change the generated profile, so the v1.0.3 golden fixtures still apply.

### What an OpenCode Guard install contains

Every release from v1.0.0 to v1.0.4 installs to the same places (`install.sh` at each tag). None writes a version stamp, so the installer detects OpenCode Guard by its layout, not its version.

| Part | Location |
|---|---|
| Engine | `~/Library/Application Support/OpenCodeGuard/`: `launch`, `profile.sb`, `uninstall.sh`, `vendor/`, shims `bin/opencode` and `bin/opencode-gui`, `state/rules.json` |
| Permission record | `state/permissions.json` in the engine |
| Launcher app | `~/Applications/OpenCode Guard.app`, bundle ID `ai.opencodeguard.launcher`; it runs `bin/opencode-gui` |
| Plugin | `~/.config/opencode/plugins/opencode-guard.js` |
| cc-safety-net | `~/.cc-safety-net/rules/opencode-guard/`, plus `opencode-guard` in the `rules` of `~/.cc-safety-net/rules/rule.json` (v1.0.1 and later also add `env` to `transparent_wrappers`; v1.0.4 adds `exec`, `nice`, `nohup`, `setsid`, `stdbuf`, `time` and `timeout`) |
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
   - puts Agent Guard's plugin in `~/.config/opencode/plugins` and removes `opencode-guard.js`;
   - installs `~/Applications/Agent Guard.app` with Agent Guard's own bundle ID (`io.github.ebrindley.agentguard`, since step 3) and removes `OpenCode Guard.app`. A Dock item for the old app then fails to open; it cannot start OpenCode unguarded. The installer says to add the new app to the Dock.

   If a startup file has an old start marker without an end marker, the installer stops before the switch and names the file. Deleting that range would remove the rest of the file.
7. **Forwarders at the old command paths.** A terminal opened before the switch keeps OpenCode Guard's `bin/` first on its PATH. Deleting the old shims would send `opencode` there to the next `opencode` on PATH, which is unguarded. The forwarders run Agent Guard's launcher in the same mode (`cli` or `gui`) with the same arguments, through an absolute path written at install. Every launch write-protects them and their folders explicitly, like the engine folder. Agent Guard's profile does not name OpenCode Guard's paths today; they are unwritable only because nothing allows them. The added rule is step 5's recorded golden difference (section 8).
8. **The launcher skips every guard shim.** Before step 3, `next_cli` in `engine/launch` skipped only its own shim. With a forwarder and an Agent Guard shim both on PATH, each would find the other and they would call each other forever. Since step 3 it skips any candidate whose resolved path is inside Agent Guard's or OpenCode Guard's `bin/`, and since step 4 anything inside either guard's engine folder, which covers the forwarders and every release's `bin/`. The nested-launch path and the `check` plugin probe also call `next_cli`.
9. **Check, then retire.** After the switch the installer runs `doctor` and launches OpenCode through the new command path and a forwarder. When those pass it retires OpenCode Guard without running its uninstaller. That uninstaller would put back the original permission values Agent Guard relies on, and delete the old engine folder with the forwarders in it; v1.0.0's would also delete the permission record after a failed restore. Retirement removes:
   - the old engine's `launch`, `profile.sb`, `uninstall.sh`, `vendor/` and `state/`, once the imported record is written and read back;
   - `~/.cc-safety-net/rules/opencode-guard/` and `opencode-guard` from `rules` in `rule.json`, leaving `transparent_wrappers` as the old uninstaller does;
   - the copies kept at the switch.
10. **What stays.** `~/OpenCode Guard`, with its list, log and any permission backup, is never removed, as OpenCode Guard's own uninstaller keeps it. The forwarders stay until no shell started before the switch can remain: the installer records the switch time, and the first `update` after the Mac's boot time passes it removes them. Uninstall removes them too.
11. **Reruns.** Running the installer again at any point is safe. It resumes an interrupted switch rather than starting over, and never imports a record or list twice.

### Recovery testing

Recovery is tested against a real install of the latest OpenCode Guard release (v1.0.4 today), made by that release's own `install.sh` in a disposable home, and against the build the two Macs run if it is later. Fixtures cover:

- v1.0.0's failed restore: an install whose record was lost, then reinstalled;
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

Step 10, after `@project` is defined for OpenCode (section 4) and after the Rust launcher (section 7). The source is pi-sandbox-guard at #10 (commit `7ad441f`).

### What pi-sandbox-guard installs

| Part | Location |
|---|---|
| Protected shims | `~/.local/bin/pi` and `~/.local/bin/omp`, byte-identical; the runtime comes from the launcher's own name |
| Profile and preamble | `~/.local/bin/pi-sandbox.sb`, `~/.local/bin/pi-sandbox-preamble.zsh` |
| Extension (analyzer) | `~/.pi/agent/extensions/pi-sandbox-guard/`, with a `.deployed-version` stamp and the `.guard-node` binding |
| Executable bindings | `~/.config/pi-sandbox-guard/executables.conf` |
| Custom wrappers | Copies in `~/.local/bin/`, installed with `--extra-launchers <dir>` |

It has no uninstaller.

### What carries over

The Pi profile keeps this behavior. The Pi rows of section 3 show where each part lives.

- **#8, project agent config.** Writes, creation, renames and symlinks are denied for any `.pi` or `.omp` folder under the project, and for the folders OMP loads code from: `.claude` and `.codex` `extensions`, `hooks` and `tools`, `.gemini/extensions` and `.opencode/plugins`. The launcher refuses a project inside one of these and a symlinked `.pi` or `.omp` layout.
- **#9, user package and configuration state.** The active Pi state folder write-protects `npm/`, `git/`, `skills/`, `SYSTEM.md`, `APPEND_SYSTEM.md` and `models.json`, as well as `extensions/`, `settings.json`, `auth.json`, `trust.json` and any `*prompt*.md` under `~/.pi/agent`. Theme files stay writable. Package maintenance and edits to these files need an operator session outside the guard, the same cost as section 9.
- **#10, Homebrew Node bindings.** A Homebrew Node binding uses the formula's `opt` link when it resolves to the chosen Cellar executable, so a formula upgrade needs no rebind. The launcher resolves both Node bindings at each launch and refuses one whose target is inside a writable folder. Other installs keep resolved paths.
- **Executable bindings.** `executables.conf` records absolute paths for Pi, OMP and Node. A recorded path is trusted because it is operator-recorded and the agent cannot write it; the `PI_EXECUTABLE` environment variable keeps the trusted-prefix restriction. A stale binding fails closed. The installer imports the file into the write-protected engine folder.
- **Active git hooks protection.** Writes are denied to `.git/hooks` in the project, to the effective hooks folder resolved at launch (`core.hooksPath` or a linked worktree's shared hooks), to submodule hooks and to hooks in OMP's worktrees. Re-allowed so `git init` and ordinary source work: the project's `.git/hooks` folder node and `*.sample` files in it; submodule `hooks` folder nodes and `*.sample` files in them; in OMP's worktrees, `hooks` folder nodes and files with an extension (Git's hook names have none), so source such as `src/hooks/useFoo.ts` stays editable. The launch-time active hooks folder gets no re-allow. It stays on throughout the migration. Extending it to OpenCode would change behavior for OpenCode users and is not part of this step.
- **Relocated Pi and OMP state.** Pi's `PI_CODING_AGENT_DIR`, which must stay under `~/.pi`; OMP's `PI_CONFIG_DIR` (`.omp` or `.omp-*`) and its profile selector (`omp --profile <name>`, selector first, or `OMP_PROFILE`). OMP keeps its allowlist of runtime paths, with its configuration, plugins, hooks, tools, prompts and rules read-only. `agent.db` stays writable because OMP stores credentials in it with operational data; that limit carries over. XDG-split OMP state stays refused.
- **Launch checks.** Home from the system, not the environment; a pinned PATH before the sandbox; a validated `TMPDIR`; refusal of unsafe project roots; handling of nested launches.
- **Custom wrappers, their paths and their arguments.** A wrapper hands off to the `pi` next to it (`PI_SHIM="${0:A:h}/pi"`, then `exec "$PI_SHIM" "$@"`). Agent Guard's Pi and OMP entry points therefore take over `~/.local/bin/pi` and `~/.local/bin/omp`, the same paths, so each wrapper keeps its path and its arguments pass through unchanged. The same paths also mean terminals opened before the switch reach the new entry points without forwarders. The entry points and the wrappers are launch links, protected against replacement and ancestor renames (section 6). The launcher still injects the plugin explicitly and keeps it out of Pi's administrative commands.

### Checking custom wrappers

Before the switch, run pi-sandbox-guard's checker once against the custom wrappers, from a pi-sandbox-guard checkout:

```sh
node scripts/check-launchers.mjs --sources ~/.local/bin/<wrapper> ...
```

It checks that each wrapper uses `#!/bin/zsh -f`, hands off to the `pi` next to it and calls only permitted helpers before the sandbox. Do not run it with `--deployed` after the switch. That mode requires pi-sandbox-guard's own shim text (for example `PI_SANDBOX=1` and the profile path in `~/.local/bin`) and its profile and preamble, so it rejects a correct migration. Agent Guard's conformance suite (section 8) checks launch behavior of the new entry points, directly and through each wrapper.

### Unguarded refusal is a behavior change

Today the Pi extension only warns when the `PI_SANDBOX_PROFILE_DIGEST` environment marker is missing (`FILTER-ONLY: could not verify launch through the protected Pi/OMP Seatbelt shim`, `src/index.mjs`). It never blocks, and filter-only use (the extension deployed without the launchers, or installed as a Pi package) is a documented mode. The marker is ambient, so a project can set it and silence the warning.

Under Agent Guard the Pi plugin uses the behavioral probe (section 5). Unguarded, it refuses every tool except a safe set, with a message to relaunch through the guard. Filter-only use ends: running the real Pi or OMP binary directly, or any launcher that skips the entry points, gets refusals. Release notes and the Pi migration message state this as a behavior change. The Pi safe set is defined at step 10. An agent session started outside the guard on purpose needs the bypass variable (step 3).

### Analyzer

Pi's analyzer (`src/index.mjs`, `src/guard-core.mjs`, `src/validate-bash-command.sh`) stays as the Pi plugin, with Agent Guard's probe and refusal added. Its ask tier and its fail-closed mode (missing helpers block all bash) stay. Replacing it with cc-safety-net is a separate decision after the corpus run (section 5).

### List proposal

The installer proposes adding `@project` and Pi's credential read denies to the one Guard List. It shows the change and what each harness gains or loses, and writes nothing until the user confirms (section 4). For an existing list with `~/Projects` under ALLOW:

```
ALLOW - agents may create, change and delete things inside these:
@project
~/Projects

DENY - agents may not read, search, change or delete these:
~/.ssh
~/.aws/credentials
~/.aws/config
~/.docker/config.json
~/.kube/config
~/.gnupg
~/.config/gh
~/.config/gcloud
~/.netrc
~/.git-credentials
~/.config/git/credentials
~/.npmrc
~/.secrets
```

The DENY entries are the read denies in `sandbox/pi-sandbox.sb`. The installer proposes only those that exist, because a DENY entry that does not exist logs a warning at every launch (`engine/launch`).

What changes:

- **Pi.** `@project` takes the place of `PROJECT` (git top level, `PI_PROJECT` or the start folder). Other ALLOW entries apply to Pi too: with `~/Projects` listed, Pi can write to every project there, not only the one it started in.
- **OpenCode.** The DENY entries start applying. Git over SSH and cloud command-line tools stop working inside OpenCode's guard, as the list template warns.
- **No entry needed.** Pi's write denies on whole folders such as `~/.aws`, `~/.docker` and `~/.kube` need no list entry: nothing makes those folders writable unless an ALLOW entry covers them.
- **No list form.** The list takes paths, not names. Pi's `.env` read deny anywhere and its deny on reading back its security event log stay in the Pi fragment while name entries remain an open decision.

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

4. **Installer: install, update, uninstall.** Needs step 3. The one-liner downloads a complete release and verifies its checksum before it touches the install. The previous version stays until the new one passes its self-test; a failed self-test fails the install and leaves the previous version working. `update` and `uninstall` commands exist. `doctor` replaces `launch check`. A version stamp is written. Until step 5, the installer refuses to run over an OpenCode Guard install (section 6). Done when lists, user edits and permission records survive failed runs and reruns, and an interrupted update leaves the previous version working.

5. **OpenCode Guard migration.** Needs step 4. The installer follows the rules in section 10: import the permission record before any permission write, keep the new plugin out of the plugin folder until the switch, import the list once without overwriting an existing one, switch, leave write-protected forwarders at the old command paths, and retire OpenCode Guard's files without running its uninstaller. Done when recovery passes for failures before, during and after the switch, against a real install of the latest OpenCode Guard release plus the fixtures in section 10.

6. **First public release (OpenCode only) and the two Macs.** Needs step 5. Tracked files and history are reviewed, then the repository goes public with the files and settings in section 13. The home Mac switches first, then the work Mac. Done when the release is public and each Mac passes terminal launch, app launch, `doctor` and recovery.

   Private vulnerability reporting is available only on public repositories, so it is switched on right after the repository goes public, before either Mac uses the release.

   Collected before this step:

   - each Mac's chip, macOS version and OpenCode version;
   - which OpenCode Guard build each Mac runs (a tag or commit, found by comparing installed files with the tags, since it writes no version stamp);
   - whether the work Mac runs Santa or another allowlisting tool (`santactl status`), how it admits new binaries, and whether it admits an ad-hoc signed app built on the Mac (section 6).

   The work Mac's admission route gates step 8.

7. **Package-store protection (first policy update).** Needs step 6; it reaches both Macs through `update`. The current, legacy and XDG-relocated package stores are protected; the rest of the cache stays writable. Operator maintenance outside the guard is documented. `doctor` checks that the configured plugins loaded, not only the status tool (section 9). Done when configured plugins load, a representative npm language server works, the missing-package message is clear, and replacement and rename of the store are denied.

8. **Rust launcher, delivered as an update.** Needs step 6, and the work Mac's admission route before the update reaches that Mac. Constraints and parity are in section 7. The update refuses to switch a Mac where the new binary cannot run and leaves the zsh version working there. The zsh engine stays in the repository until both Macs run the Rust version; rollback artifacts are kept after that. Done when the Rust engine passes the golden and behavioral parity tests and both Macs run it.

9. **Per-launch state files.** Needs step 8, so it is built once. Each launch writes its own state file and passes its path to the plugin, which removes the shared `state/rules.json` race (section 2). Done when concurrent launches, missing or malformed state and cleanup of ended launches have defined, tested behavior.

10. **`@project`, then Pi and Oh My Pi (OMP).** Needs step 9, because `@project` makes the rules differ between launches started in different folders (inference from section 4). First `@project` is defined for OpenCode: its positional project argument (`opencode [project]`) and what the app launcher means by it; the app's working directory is unverified. Then the Pi profile carries over what section 11 lists, keeps Pi's analyzer as the Pi plugin and documents unguarded refusal as a behavior change. After Pi works, a short "adding a harness" guide is written from what Pi needed (section 14). Done when Pi runs under Agent Guard on the owner's Mac and the conformance suite passes for both profiles.

11. **Close out.** OpenCode Guard and pi-sandbox-guard each get a final release that says where to go and how to recover. Each repository is archived only after its migration works: OpenCode Guard after step 6, pi-sandbox-guard after step 10. Done when both are archived.

**End state for the existing OpenCode Guard installs.** Done when both Macs run the Rust release, OpenCode Guard's engine, shims, forwarders, plugin, app, rulebook entry and PATH blocks are gone from both, and uninstall has been tested. `~/OpenCode Guard`, with the old list, stays (section 10). They switch at step 6; steps 7 and 8 reach them through `update`.

**End state for open source and more harnesses.** Public from step 6. A harness is a profile (data), hook functions, a plugin adapter and a pass of the conformance suite (section 14). Pi is the first new harness; done when Pi runs under Agent Guard on the owner's Mac, the conformance suite passes for both profiles, and pi-sandbox-guard is archived. Later candidates are in section 14.

## 13. Open source

The repository is private until step 6 and open source from the first public release. The model is pi-sandbox-guard's (`CONTRIBUTING.md`, `SECURITY.md`, `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/`).

**License.** MIT, in `LICENSE`. Vendored cc-safety-net keeps its own `engine/vendor/cc-safety-net/LICENSE`, and every release carries the license notices (step 3).

**Contributions.** Issues are welcome. External pull requests are not accepted. `AGENTS.md` states this policy. `CONTRIBUTING.md` states it too and holds the bug-report guidance: reproduction steps, expected and actual behavior, and the macOS, harness and Agent Guard versions. That guidance does not go in `AGENTS.md`.

**Security reporting.** `SECURITY.md` sends vulnerabilities to the private advisory form (`/security/advisories/new`) and defines where a bug ends and a vulnerability begins, as pi-sandbox-guard's does. A link is not enough: GitHub accepts private reports only when private vulnerability reporting is switched on in the repository settings ([GitHub](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately)), which is possible only once the repository is public. If the form is missing, a reporter opens a public issue with no exploit details asking for a private channel. For that reason `.github/ISSUE_TEMPLATE/config.yml` keeps blank issues enabled and links the advisory form; `bug_report.yml` asks for the `CONTRIBUTING.md` fields.

**Repository settings and files.**

- Pull requests: "Collaborators only" ([GitHub](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/disabling-pull-requests)). In a personal repository a collaborator is anyone invited to it.
- Private vulnerability reporting: switched on.
- `.github/CODEOWNERS`: `* @ebrindley`, so review requests and advisory notifications reach the maintainer.

**Before going public.** Every tracked file and every commit in the history, including author metadata, is reviewed for credentials, personal details, account home paths and host names. The gitignored backlog archive is not published; what it holds that the design needs is in this document.

## 14. Adding a harness

A harness is four parts:

| Part | What it is |
|---|---|
| Profile | Data: the fields in section 3. zsh assignments now; TOML embedded in the binary from step 8. |
| Hooks | Functions for what data cannot express, such as OpenCode's permission merge or Pi's state roots. zsh in `hooks.zsh` now; Rust from step 8. |
| Plugin adapter | A thin layer between the harness's hook API and the plugin core (section 5). |
| Conformance pass | The suite in section 8, run against the new profile under the real `sandbox-exec`. |

A new harness's protected paths apply to every launch of every installed harness (section 3), so adding one also changes what the others can write.

Pi is the first case. What it needs beyond the OpenCode profile is in section 11: executable bindings, relocated Pi and OMP state, active git hooks protection, custom wrapper paths and arguments, and its own analyzer. The "adding a harness" guide is written after Pi works (step 10), from what Pi actually needed. Until then this section is the outline.

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
- **Two guards installed during migration.** Both plugins would issue competing refusals, the two launchers' shims can call each other, the app bundle ID is shared, and terminals opened earlier keep the old PATH. Section 10 gives the rule for each. The same applies to pi-sandbox-guard's shims and extension at step 10 (section 11).

Open decisions:

- **Notarize or stay unsigned.** The facts are in section 6. The work Mac's admission route, collected before step 6, decides this before step 8.
- **Name entries in the list**, such as `.env` anywhere under DENY. Pi denies reads of `.env` and `.env.*` files anywhere today; until this is decided that rule stays in the Pi profile.
- **Retiring Pi's analyzer.** Replacing it with cc-safety-net is decided after the corpus run (section 5), not as part of step 10.
- **Project config files that one harness reads from another** (`.mcp.json`, `.claude/settings.json`, `.codex/config.toml`, `opencode.json` and similar). They are bare file names that also appear in fixtures and examples, and their MCP commands run inside the sandbox.
