# Poetic Project Directory

This `.poetic/` directory contains project-local configuration and runtime artifacts for the Poetic CLI.

## Directory Structure (High-Level)

```
.poetic/
 .artifacts/                      # Legacy/generated artifacts (gitignored)
 config/
    poetic.config.jsonc         # Project configuration
    project-context.json        # Project detection output
 telemetry/
    state/                      # Per-run competition/variant state (repo-local; gitignored)
    logs/                       # Flywheel workflow JSONL only (repo-local; gitignored)
 state/                          # Runtime markers/locks (gitignored)
 worktrees/                      # Temporary worktrees (gitignored)
 .gitignore                      # Ignores runtime artifacts
 README.md                       # This file
```

## Configuration

- Provider settings for this project live in the `providers` block of `.poetic/config/poetic.config.jsonc`; `poetic config resolved` shows the effective values.
- Registry-level overrides that should apply to every project on this machine (available models, per-provider defaults, timeouts) belong in `~/.poetic/config/providers.yaml`, not in this directory.
- The same file holds advanced settings such as quality gates and execution tuning.

Live SQLite databases (`variants.db`, `validations.db`, `invocations.db`) and the
main JSONL log stream live under the Poetic data root (`~/.poetic/data/telemetry/`
by default), not in this checkout. `poetic doctor --verbose` prints the resolved
directory. Do not delete the whole `.poetic/telemetry/` tree: `state/` is still
the live per-run store.

## Useful Commands

```bash
poetic doctor
poetic doctor --verbose
poetic doctor --fix
poetic config resolved
```
