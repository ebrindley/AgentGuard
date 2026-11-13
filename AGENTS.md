# Agent Guard

## Writing

Applies to commits, pull requests, issues, backlog items, release notes, documentation and code comments.

- Commit messages and pull request titles and bodies state what changed; include why only when needed to explain the change. Do not include review or check outcomes, evidence, verification commands or results, verification limitations, reviewer or model credits, rounds, verdicts, or process narration. Keep outcomes in their check and review records.
- Commit subject: imperative, under 72 characters, no trailing period. Add a body only for essential change details the subject cannot carry.
- Pull request title: leave room for GitHub's `(#<number>)` squash suffix so the final subject stays under 72 characters. Pull request body: describe the change and, when needed, why.
- Keep backlog item titles short enough for Build's `backlog: add ` prefix. Inspect the exact final subject and body before committing or merging.
- Documentation covers behavior, usage, limitations and recovery. Code comments explain intent or constraints the code does not show.
- Separate observed facts from inferences and proposals in documentation. Cite versions, files or sources when they help readers understand the guidance. State real uncertainty once.
- No filler, marketing, emoji, or summaries that restate the diff.
- No process narration. Name a tool or version only when the result depends on it.
- No AI attribution, "generated with" lines or co-author trailers. Keep upstream copyright, license and attribution notices.

## Shared code

- Shared helpers live in `engine/account.zsh` (account lookup), `installer/lib.zsh` and `installer/harness/pi.zsh` (installer helpers, which `engine/agent-guard` also loads for the profile command files), and `test/lib.zsh` and `test/fixture-home.mjs` for tests. A new module reuses them instead of copying a sibling.
- The launch policy exists twice, in the Pi launcher preamble `profiles/pi/sandbox/pi-sandbox-preamble.zsh` and in `engine/launch`. A fix to one is applied to both.

## Findings

Judge findings from reviews and audits, including other agents' reports, against docs/THREAT-MODEL.md sections 3 and 5 before proposing a change or an upstream report.

## Contributions

External pull requests are not accepted. Issues are welcome. Report vulnerabilities privately; see SECURITY.md.
