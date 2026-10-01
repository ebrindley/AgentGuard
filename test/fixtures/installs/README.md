Unmodified OpenCode Guard release trees for the migration tests (`test/migrate.sh`),
extracted with `git archive` of the OpenCode Guard repository:

| Folder | Tag | Commit |
|---|---|---|
| `opencode-guard-1.0.0` | v1.0.0 | `82867e5e6bd38dbe94142a7bb647ccccdac2a995` |
| `opencode-guard-1.0.1` | v1.0.1 | `669ffd2d16cec91eb62cdbe78d5633512a59512f` |
| `opencode-guard-1.0.3` | v1.0.3 | `9242c1ad45c895efd63e903e1b27d7bab53620ad` |
| `opencode-guard-1.0.4` | v1.0.4 | `1ac39a24030658b6f681b8d49d8f78640c2c3f2b` |

Each holds `install.sh`, `uninstall.sh`, `LICENSE`, `engine/`, `plugin/`,
`templates/`, `vendor/` and `assets/OpenCodeGuard.icns` at that tag, nothing else.
The tests run each tree's own `install.sh` and `uninstall.sh` with `HOME` set to a
disposable home; both take home from `$HOME`. MIT licensed; see each `LICENSE`.
