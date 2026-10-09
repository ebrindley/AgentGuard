# OpenCode skills

This describes release 0.2.5. Releases before 0.2.2 also write-protect skill content.

OpenCode can create, edit, rename, move and delete skills and their supporting
files without adding each skill to the Guard List. The automatic global roots
are `~/.config/opencode/{skill,skills}`, `~/.opencode/{skill,skills}`,
`~/.claude/skills` and `~/.agents/skills`.

Project `.opencode/{skill,skills}`, `.claude/skills` and `.agents/skills` follow
the project's write permissions. Custom locations retain their existing
filesystem restrictions. Declaring a `skills.paths` entry does not grant access
outside authorized locations.

Reference files such as `opencode.json` inside the standard skill folders are
writable. Agent Guard's installed code, launchers, plugin, Guard List, checker
policy and activation remain protected. Ordinary OpenCode configuration, plugins,
MCP definitions, agents, tools and themes are writable too. The installed
`~/.opencode/bin` executable remains protected.

## Restrictions

Guard List DENY and READ ONLY entries take precedence over automatic grants,
including entries for folders that do not exist yet. The most specific
ALLOW/READ ONLY rule still applies to explicit list entries. Root containers
stay protected against replacement; individual skills remain maintainable.

Symlinks do not grant access to protected targets. Global configuration links
are resolved at launch; restart after changing the layout outside the guard.
Shared skills can affect instructions or scripts used by other agents in later
sessions. Agent Guard does not contain a later independent Claude or Codex
session.

## Preparation

The launcher initializes only pinned automatic root containers and the pinned
Guard plugin container. OpenCode creates ordinary files and subdirectories
inside Seatbelt. There is no outside-sandbox preparation worker or request
channel. Projects selected after startup use the same frozen filesystem scope.

Links inside editable configuration, including `skill` and `skills`, never
create new write grants on a later launch. Automatic root entries and their
ancestor entries are protected against replacement. Custom configuration and
skill locations retain Guard List permissions; environment variables and
`skills.paths` cannot add filesystem authority.

## Deletes and checker policy

New OpenCode sessions use cc-safety-net 2.6.0 at least at the strict preset.
Operator capability overrides and stronger environment settings remain effective.
The managed recursive-delete block is omitted from new-session policy only when
its definition matches Agent Guard's factory rule. User changes and additional
rules are preserved.

Literal `rm -r` and `rm -rf` can delete ordinary skills. When a shell tool selects
an outside working directory, the checker also analyzes the command from the
original session boundary. A refusal from either analysis wins. Standalone global skill roots and ordinary content folders inside global
configuration receive deletion allowances unless the operator's paranoid deletion policy
applies. Existing explicit allowances are retained. A repository's policy may
tighten these checks but cannot weaken them.

Each launch materializes policy and registered rulebooks in an engine-owned
snapshot; the checker's reader rejects links beneath its policy root. Snapshots
remain for child processes that inherited them; a staged release check removes
its own snapshot when it ends. Independent checker consumers
and older OpenCode sessions retain the shared legacy rulebook. New child
processes inherit their guarded session's checker policy.

Force-push and pipe-to-shell remain blocked. The current integration returns
allow or deny and does not provide an approval tier. Checker coverage differs
between file tools and custom tools, so Seatbelt still enforces filesystem
containment and guard integrity. Complete Git metadata integrity is not claimed.

## Validation coverage

Disposable homes exercise real Seatbelt, plugin checks, policy snapshots, custom
rules and an older checker consumer. Real OpenCode performs the skill lifecycle
and configuration lifecycle against a local model fixture through CLI and server
routes. Plugin initialization and a local MCP child attempt outside writes
without relying on the advisory hook. The GUI entry-point
fixture hosts the real backend; it does not exercise the desktop UI. Tests
require no additional macOS account.
