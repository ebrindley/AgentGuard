# Security policy

## Reporting a vulnerability

Report vulnerabilities through the
[private security advisory form](https://github.com/ebrindley/AgentGuard/security/advisories/new).
It is the only private channel. No email address is published.

Include the Agent Guard version (`agent-guard version`), the macOS version and
chip, the harness and its version, the launch route (terminal or app) and the
steps that reproduce the problem. Do not include credentials or other secrets.

If that link does not show a report form, private reporting is not switched on.
Open a public issue that contains no exploit detail and asks for a private
channel; reporting will be switched on so you can file there.

This is a personal project with one maintainer. Reports are handled on a
best-effort basis. There is no bug bounty.

## Supported versions

Fixes go into the latest release only. `agent-guard update` installs it.

## What Agent Guard is

Agent Guard is a macOS Seatbelt write-containment boundary for terminal coding
agents. Release 0.1.1 supports OpenCode. The launcher runs OpenCode and every
process it starts under `/usr/bin/sandbox-exec` with a profile generated from the
Guard List (`~/Agent Guard/Guard List.txt`) at each launch. Under that profile the
agent can write only to ALLOW folders and the data, cache and temp folders
OpenCode needs, cannot read or write DENY entries, and cannot change the guard,
the list, OpenCode's global config and plugin folder (`~/.config/opencode`), the
shell startup files or `~/Library/LaunchAgents`. The exceptions are under
[Known limitations](#known-limitations-in-011): OpenCode's cached plugin packages,
downloaded tools and model catalog under `~/.cache`, remote-configuration entries
in OpenCode's `auth.json`, and the targets of symlinked project config names.

The OpenCode plugin and cc-safety-net are advisory. They refuse tool calls with
a clear message, but nothing depends on them for safety. The Seatbelt profile is
the boundary.

## What it does not cover

- Network access. Outbound connections are not restricted.
- Read confidentiality beyond DENY. The agent can read any file the macOS account
  can read unless a DENY entry covers it.
- Integrity of ALLOW folders. The agent is meant to change files there.
- Provider tokens and other secrets the harness itself uses.
- A VM, container or separate user identity.

## Known limitations in 0.1.1

- **OpenCode's package store, `bin` folder and model catalog are writable.** All
  of `~/.cache` is writable, including three parts of `~/.cache/opencode` that
  OpenCode runs or trusts (OpenCode 1.18.34):
  - the npm plugin store, whose code OpenCode imports at its next start;
  - `bin`, where OpenCode keeps the ripgrep and language-server binaries it
    downloads and runs them from;
  - the model catalog, `models.json` or `models-<hash>.json`, which sets each
    provider's API address and package.

  An agent can change any of them. A guarded restart runs changed code under
  the guard, and an OpenCode started later without the guard runs it with full
  authority. A rewritten catalog can also send a provider's API key to another
  host, with or without the guard, because outbound connections are not
  restricted. Planned: step 7 of the plan in
  [docs/DESIGN.md](docs/DESIGN.md#12-plan) write-protects all three.
- **OpenCode's `auth.json` can add remote configuration.** OpenCode's data
  folder, `~/.local/share/opencode`, is writable, including `auth.json`. A
  `wellknown` entry there makes OpenCode fetch configuration from the entry's URL
  at every start and merge it as global configuration, plugins and MCP commands
  included (OpenCode 1.18.34). An agent can add an entry for a server it
  controls. The next OpenCode start runs what that server names, under the guard
  for a guarded start and with full authority otherwise. Planned: before the
  composition release (step 10e of the plan), this is protected, checked at
  launch or accepted in writing ([docs/DESIGN.md](docs/DESIGN.md#9-code-in-writable-folders), section 9).
- **Concurrent launches share `state/rules.json`.** Each launch writes the
  resolved ALLOW, READ ONLY and DENY paths to one file in the engine folder, and
  each plugin reads it once at start. When two launches start close together, or
  start in folders whose symlinked config names differ, the first session's
  plugin can refuse and report against the second launch's rules. Seatbelt still
  enforces each session's own profile. Planned: step 9 of the plan in
  [docs/DESIGN.md](docs/DESIGN.md#12-plan) writes one state file per launch.
- **Symlinked project config names.** The names `.opencode`, `opencode.json`,
  `opencode.jsonc`, `tui.json` and `tui.jsonc` cannot be created, replaced or
  removed anywhere. When one of them is a symlink, its target is write-protected
  only when OpenCode starts from the folder that holds the link, in a terminal.
  Started from the app, or with `opencode <project>` from another folder, writes
  through the link reach its target. The plugin refuses file edits through such a
  link; shell commands are not checked. Not planned.
- **Anything in an ALLOW folder can be changed or deleted.** That includes git
  hooks, build scripts and other files that run later outside the guard, for
  example when you run `git commit` or a build in an unguarded terminal. Review
  changes before running them outside the guard. An ALLOW entry that covers an
  executable's folder, such as `/opt/homebrew`, makes that executable writable,
  OpenCode's included. Not planned: editing these folders is what the agent is for.
- **Reads are broad unless denied.** Without DENY entries the agent can read
  `~/.ssh`, `~/.aws` and every other file the account can read. Add DENY entries
  to the Guard List for what it must not read; denying `~/.ssh` also stops git
  over SSH inside the guard. A DENY or READ ONLY entry that is or contains a
  folder OpenCode needs (`/`, home, `~/Library`, `~/.config`, `~/.local`,
  `~/.cache`, `/usr`, `/bin`, `/sbin`, `/System`, `/Library`, `/private`, `/dev`,
  `/opt`, `/Applications`) is refused, not applied; each launch names refused
  and skipped entries in `~/Agent Guard/last-launch-opencode.log`. Not planned.

## Bug or vulnerability

A vulnerability is a reliable way for an agent running under the guard to do
what the profile should stop:

- write outside ALLOW and the folders OpenCode needs;
- read a DENY entry;
- change the guard, the Guard List, OpenCode's config or plugins, or another
  protected path or name;
- start OpenCode unguarded through an Agent Guard entry point (the `opencode`
  command, the app, or a forwarder left after the move from OpenCode Guard)
  without the plugin's refusal.

Report those through the advisory form.

Everything else is a bug and goes to a public issue (see
[CONTRIBUTING.md](CONTRIBUTING.md)): a refusal by the plugin or cc-safety-net that
should not happen, a destructive command cc-safety-net misses while Seatbelt
still holds, an install, update or uninstall failure, and the limitations above.
When unsure, use the advisory form.
