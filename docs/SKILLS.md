# OpenCode skills

This describes 0.2.2. Releases before 0.2.2 write-protect OpenCode's skill
folders.

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
policy and activation remain protected. Other OpenCode configuration and plugin
folders remain protected.

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

The launcher prepares global containers. A launch-scoped worker prepares project
containers when the plugin selects a writable project or first uses its skill
path. This covers projects selected after a server starts. The worker remains
outside Seatbelt and can only create missing skill containers and OpenCode's
constant `.gitignore`. It cannot execute requested commands, overwrite existing
configuration, or grant new filesystem access. It stops when the guarded launch
ends. No service or account is installed.

The worker uses the frozen Guard List. A request outside its writable boundary
is refused. If preparation cannot respond, the tool reports that failure.

## Deletes and checker policy

New OpenCode sessions use cc-safety-net 2.6.0 at least at the strict preset.
Operator capability overrides and stronger environment settings remain effective.
The managed recursive-delete block is omitted from new-session policy only when
its definition matches Agent Guard's factory rule. User changes and additional
rules are preserved.

Literal `rm -r` and `rm -rf` can delete ordinary skills. When a shell tool selects
an outside working directory, the checker also analyzes the command from the
original session boundary. A refusal from either analysis wins. Global skill
roots receive deletion allowances unless the operator's paranoid deletion policy
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
against a local model fixture through CLI and server routes. The GUI entry-point
fixture hosts the real backend; it does not exercise the desktop UI. Tests
require no additional macOS account.
