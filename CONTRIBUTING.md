# Contributing to Agent Guard

## Issues are welcome

Report bugs and request features through [GitHub Issues](https://github.com/ebrindley/AgentGuard/issues).
A bug report needs:

- the steps that reproduce it;
- what you expected and what happened instead, with the exact message;
- the macOS version and chip (`sw_vers -productVersion` and `uname -m`);
- the harness and its version (`opencode --version`, `pi --version` or `omp --version`);
- the Agent Guard version (`agent-guard version`);
- the launch route: `opencode` in a terminal, the Agent Guard app, `pi`, `omp` or a custom wrapper;
- the output of `agent-guard doctor`.

Remove credentials, tokens and private paths before you post.

Check the [known limitations](SECURITY.md#known-limitations-in-020) first. They are
documented, not unnoticed.

## Pull requests are not accepted

External pull requests are not accepted. Agent Guard has a single maintainer
and is a security-sensitive tool: every change needs an argument against the
threat model and adversarial review before it lands, and that does not scale to
outside contributions. This is not a judgment of any contribution.

If you want a change:

- **Open an issue** that describes the problem and the change you suggest.
- **Fork the repository** and maintain your own version, as the MIT license
  permits.

## Security issues

Do not open a public issue for a vulnerability. Use the
[private security advisory form](https://github.com/ebrindley/AgentGuard/security/advisories/new);
see [SECURITY.md](SECURITY.md).

A vulnerability is a reliable way for an agent under the guard to do what its
harness's profile should stop: write where the harness may not, read a denied
path, change the guard or the harness's config and plugins, or start the harness
unguarded through an Agent Guard entry point. SECURITY.md lists these
[for each harness](SECURITY.md#bug-or-vulnerability). A wrong refusal, a
destructive command cc-safety-net or Pi's analyzer misses while Seatbelt still
holds, an install, update or uninstall failure, and the documented limitations
are bugs. When unsure, use the advisory form.

## If you fork

The development tests run from a checkout, outside any agent sandbox, on
macOS 15 or later; see [Tests](docs/DEVELOPMENT.md#tests). `node test/golden.mjs`
compares generated Seatbelt profiles against OpenCode Guard v1.0.3 fixtures, so a
profile change shows up there first. Record an intended profile change as a
difference in `test/fixtures/differences/` rather than editing the fixtures.
