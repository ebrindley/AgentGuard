# Pi checker comparison

Keep Pi's current checker for now. Consolidation remains the intended direction,
but the tested cc-safety-net 2.6.0 Pi entry cannot preserve the required ASK
behavior, and some literal catastrophic operations still need coverage. This
comparison does not authorize a checker switch or broad parser pruning.

## Observations and reproduction

`test/checker-comparison.mjs` compares a caller-selected baseline, the working
Pi adapter and the bundled cc-safety-net Pi entry. It uses the launcher's actual
policy snapshot with strict protection and project tightening only. The snapshot
omits the legacy managed blanket recursive-rm rule, as current launches do.
Interactive and headless callbacks run; simulated confirmations are declined.
Commands and file-tool payloads are data and are never executed.

Use Node 24 outside a sandbox on macOS. Run the existing preflight, then:

```sh
sandbox-exec -p '(version 1)(allow default)' /usr/bin/true
node test/checker-comparison.mjs /private/tmp/guard-comparison-a BASELINE_REF
node test/checker-comparison.mjs /private/tmp/guard-comparison-b BASELINE_REF
cmp /private/tmp/guard-comparison-a/cases.jsonl /private/tmp/guard-comparison-b/cases.jsonl
cmp /private/tmp/guard-comparison-a/facts.json /private/tmp/guard-comparison-b/facts.json
```

Use fresh output directories on the same host/runtime and the same baseline
commit. Disposable homes and repositories live outside the analyzer's temp safe
roots. Only fake secrets are
created. Corpus paths with fixed parent counts are relocated to preserve their
intended `/etc` target; `measuredCommand` records that difference. Quoted tilde
data is left unchanged.

Keep the host awake during both runs, for example with `caffeinate -i -s node`
in place of `node`. Suspension can trigger fail-closed timeouts and invalidate
the comparison. The runner retains raw captures and refuses to emit compact
fixtures if any checker times out. Different home depths change `measuredCommand`
even when verdicts agree, so byte identity is a same-host reproducibility check.

Raw `rows.jsonl` and `result.json` include local paths, reasons and timings;
keep them outside Git. The runner's `cases.jsonl` and `facts.json` are the portable
generated observations committed under `test/fixtures/checker-comparison/`.
No separate refresh script is needed. Case records omit timings; facts include
source hashes and the normalized policy snapshot. Policy dispositions below are
separate from generated facts. This offline development tool is not a new gate
or a field false-positive measurement.

## Bounded policy dispositions

Preserve in-scope outcomes, rather than every historical corpus refusal. A
synthetic classifier example establishes behavior, not authority for a new
guardrail. Existing protections remain while these mappings are unresolved.

| Group | Required outcome and evidence | Disposition |
| --- | --- | --- |
| Remote history | ASK for literal force, delete, mirror, prune and lease forms. `push-prune` and `push-lease` lose Pi's ASK in the shared entry. | Retain Pi confirmations. Resolve through a supported matching interface before switching; no blanket conversion of shared blocks into ASK. |
| Local discard and hooks | Preserve existing ASK for destructive reset/clean and `core.hooksPath` changes. Reordered Git forms already expose Pi gaps. Checkout, restore, stash drop and branch deletion are legitimate operations requiring separate policy choices. | Keep current behavior pending an explicit bounded choice. A stricter shared verdict is not automatically accepted. No new Git parser. |
| Pipe to shell | Baseline severity is ASK. Pi blocks `pipe-shell` but allows `pipe-shell-chain`; the shared entry blocks both. | Severity and compound coverage remain unresolved. No silent ASK-to-DENY edit. |
| Catastrophic recursive targets | DENY literal catastrophic targets and natural wrappers, including executable heredocs and one substitution level. Protected ancestors can contain writable descendants. | Keep Pi coverage. The disposable Python canary below disproves blanket sandbox redundancy; exact Node/Ruby root-API behavior remains unverified. Evasion-only parsing is out of scope, but removal needs an in-scope coverage map. |
| Secret paths | DENY literal secret access through Bash and file tools. Pi's OS rules protect named secret paths; the shared checker also checks file tools. | Preserve named-path protections. Public `.pem` fixtures and data heredocs are not automatically secrets or executable payloads; shared refusals remain compatibility blockers. No DLP analysis. |
| Routine cleanup | ALLOW literal cleanup strictly inside an allowed project/temp root, preserving root, outside-target, symlink and protected-path restrictions. `corpus-131` records the absolute project-path refusal. | Deferred: absolute/tilde project cleanup fails the lexical-root check; `/private/tmp` cleanup also fails an earlier system-directory regex. A single reordering cannot fix both. Capture as one focused follow-up; no change here. |
| Wrapper failure behavior | Reject unusable cwd/input, fail closed on unhealthy checking, bound resource use, and never execute analyzed input. Existing smoke/degraded suites cover these invariants. | Preserve invariant tests during migration. Subprocess timeout, EPIPE, output caps and process-group cleanup tests retire only with their subprocess path. In-process synchronous work needs bounded-cost evidence; a Promise timeout cannot interrupt it. Qualification probes remain incomplete. |
| Benign scripts and quoted data | Routine environment changes, scripts and quoted command text should avoid needless confirmation. The benign group measures these costs. | Noted — no action beyond the focused chmod/chown boundary fix. Do not repair every historical over-ask in this change. |

The supported `cc-safety-net/api` declaration returns `allow` or `deny`, with one
`ruleId` for a denial. It takes only `command` and `cwd`; it exposes neither an
ASK result nor a per-call alternate rulebook. The bundled Pi adapter likewise
returns block/allow without consulting Pi's confirmation UI. A second ask-list
evaluation therefore remains a design qualification. Do not import private
minified exports, fork the vendor or add a parser to make this comparison pass.

## Native containment and limits

The separate native records describe Pi 1.4.0 on Node 24.22.1 and macOS 26.7.1,
with fixed local model responses and disposable homes. They are normalized
observations from native runs, not callback-comparison outputs. The baseline
uses the original checker; the candidate uses the final permission scanner,
whose analyzer and profile hashes are recorded in `native-pi.json`.

The baseline could not create Pi's project-settings directory lock and ignored
the project override. The candidate read it while settings writes, lock files,
lock symlinks, lock contents and unrelated locks remained denied. The 12-call
native session also allowed the benign permission-change compound while outside
writes, configuration changes and child-process outside writes remained denied.
`test/pi-settings-lock.mjs` exercises the lock exception directly.

The recursive-boundary canary ran Python `shutil.rmtree` only against a disposable
fixture home, with permission errors ignored. A writable project canary beneath
that ancestor was removed; a protected sibling survived. This illustrates
per-path enforcement, not a claim that an OS deny on an ancestor protects every
descendant. No operation targeted the real account home or system root.

These results do not qualify Linux containment, another Mac, OMP or release
readiness. Step 7e remains open for those environments and unresolved mappings.
Owner-provided aggregate ask/block counts may inform cost, but agents must not
read raw command logs; zero hits would not prove a protection redundant.

## Enforcement totals

The runtime fixes add one directory-node lock grant (0 to 1) and keep the two
recursive permission-change patterns (2 to 2), now scoped to commands. No checker
switches, rule families, dependencies or required checks are added. The hosted
required check remains one with eight file slices. This record and policy table
add no enforcement authority.
