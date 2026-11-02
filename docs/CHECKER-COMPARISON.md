# Pi checker comparison

This comparison is the evidence behind moving Pi and OMP from pi-sandbox-guard's
analyzer to cc-safety-net, which shipped as the switch of step 10d (DESIGN.md
section 12). Decision D13 (DESIGN.md section 15) settles the verdicts the first
version of this record left open: no confirmations, routine Git work allowed,
whole-tree discards and remote-history rewrites denied. The generated fixtures
compare the analyzer as it was before the switch (the baseline) with the
extension that ships, which runs cc-safety-net 2.6.0 on the session copy of the
D13 policy.

## Observations and reproduction

`test/checker-comparison.mjs` compares the Pi extension and analyzer of a
caller-selected baseline commit, the working tree's Pi extension and the bundled
cc-safety-net Pi entry. The working tree's extension and the entry use the session
copy the Pi launcher builds: the release's builder (`engine/checker/snapshot.zsh`)
run over the factory `~/.cc-safety-net`, at the strict level with project
tightening only, so the policy has D13's ten built-in rules switched off and Agent
Guard's Git rulebook, and no recursive-rm rule. Interactive and headless callbacks
run; the baseline's simulated confirmations are declined, and the extension never
asks. Commands and file-tool payloads are data and are never executed.

Use Node 24 outside a sandbox on macOS. Run the existing preflight, then:

```sh
sandbox-exec -p '(version 1)(allow default)' /usr/bin/true
node test/checker-comparison.mjs /private/tmp/guard-comparison-a BASELINE_REF
node test/checker-comparison.mjs /private/tmp/guard-comparison-b BASELINE_REF
cmp /private/tmp/guard-comparison-a/cases.jsonl /private/tmp/guard-comparison-b/cases.jsonl
cmp /private/tmp/guard-comparison-a/facts.json /private/tmp/guard-comparison-b/facts.json
```

The committed fixtures were generated with BASELINE_REF `f098322`, the last commit
whose Pi extension calls the analyzer; two runs gave identical files. Use fresh
output directories on the same host/runtime and the same baseline commit.
Disposable homes and repositories live outside the analyzer's temp safe roots.
Only fake secrets are created. Corpus paths with fixed parent counts are relocated
to preserve their intended `/etc` target; `measuredCommand` records that
difference. Quoted tilde data is left unchanged.

Keep the host awake during both runs, for example with `caffeinate -i -s node`
in place of `node`. Suspension can trigger fail-closed timeouts and invalidate
the comparison. The runner retains raw captures and refuses to emit compact
fixtures if any checker times out. Different home depths change `measuredCommand`
even when verdicts agree, so byte identity is a same-host reproducibility check.
The run ends with a check that the extension and the bundled entry agree on every
case.

Raw `rows.jsonl` and `result.json` include local paths, reasons and timings;
keep them outside Git. The runner's `cases.jsonl` and `facts.json` are the portable
generated observations committed under `test/fixtures/checker-comparison/`.
No separate refresh script is needed. Case records omit timings; facts include
source hashes and the normalized policy snapshot. This offline development tool
is not a new gate or a field false-positive measurement. In the case records
`baseline`, `pi` and `shared` hold the interactive and headless verdicts of the
baseline analyzer, the extension and the bundled entry.

## Measurements

Per call, over the 473 cases in interactive and headless mode (946 calls per
checker in each of two runs, on one developer Mac with Node 24.22.2; each cell
gives the two runs' range):

| Checker | p50 | p95 | Calls over 2 seconds | Timeouts |
| --- | --- | --- | --- | --- |
| Pi extension on cc-safety-net 2.6.0 | 1.5 to 1.8 ms | 1.9 to 3.3 ms | 0 | 0 |
| Bundled entry alone | 1.1 to 1.3 ms | 1.4 to 2.9 ms | 0 | 0 |
| Analyzer before the switch | 149 to 221 ms | 296 to 388 ms | 0 | 0 |

The extension has no subprocess and no time limit of its own: cc-safety-net's
checks run in process and synchronously, and no call came near the analyzer's
2-second limit. Start-up, in a fresh process, is about 0.5 ms to import the
extension and 19 to 20 ms for its first call, which loads cc-safety-net's entry
and runs the probe `git config core.hooksPath agent-guard-probe`; Pi's start is
not delayed, because the first tool call waits for the load. At launch the
preamble's session copy takes about 45 ms.

## Verdict changes

Of the 473 cases, 227 keep their verdict and 246 change. `baseline` is the
analyzer's interactive verdict; the extension returns only allow or block. The
three file-tool rows keep their verdict, because the extension forwards shell
commands only.

| Group | Same | Ask, now allowed | Ask, now blocked | Block, now allowed | Allow, now blocked |
| --- | --- | --- | --- | --- | --- |
| Characterization (414) | 199 | 43 | 31 | 134 | 7 |
| In scope (34) | 13 | 3 | 7 | 1 | 10 |
| Benign (25) | 15 | 6 | 0 | 2 | 2 |

- **Ask, now blocked (38):** the whole-tree and forced Git forms D13 denies
  (`git reset --hard`, `git clean -fd[x]`, force, mirror and `+` pushes, and
  `core.hooksPath` changes, in every spelling the corpus holds), `rm -rf` of the
  working folder, its parents, `$HOME`, `/*` and dynamic targets, and
  `find -delete`, `find -exec rm` and `xargs`/`parallel` forms the strict level
  refuses. The analyzer could be answered by the operator; these now run only
  outside the guard.
- **Ask, now allowed (52):** `--force-with-lease`, `git push --delete`, `-d`, a
  `:ref` refspec and `--prune`, `export PATH=...` and `unset`, `curl -o`, `sudo`
  (Seatbelt denies running it), interpreter one-liners (`python3 -c`, `node -e`,
  `awk`) including ones that delete under the project, `xargs rm` and `parallel
  rm` forms, `git -c core.hooksPath=... status`, and the benign cases the analyzer
  asked about (`git commit -m "...reset --hard..."`, `export PYTHONPATH`).
- **Block, now allowed (137):** writes to `/etc`, `/System`, `/Library`, `/usr/local`
  and `/dev` by redirects, `truncate`, `chmod -R`, `chown -R`, `time -o`, `mv`,
  `cp`, interpreters, `wipefs` and `mkfs`, and `rm -rf {REPO}/build`. No session
  can write those places; Seatbelt denies them. The records are in `cases.jsonl`.
- **Allow, now blocked (19):** `git -C repo reset --hard`, `git reset HEAD --hard`,
  `git clean -d -f`, `git checkout -- .`, `git restore .`, the `$(pwd)` and
  `$(git branch ...)` force pushes and the pipe-to-shell chain, which the analyzer
  missed; an ANSI-C quoted `rm -rf /`; `rm -rf .`; `eval "$VAR"`, `python3 -c "$CODE"` and `node -e "$(...)"`;
  `shred`; `cat .env` and `cat ~/.ssh/...`, which Seatbelt already denied reads of;
  and two benign cases: `cat server.pem` (key and certificate file names are
  secret paths in bash) and `cat <<EOF` of text that holds `rm -rf /`. The three
  file-tool rows (`.env`, `~/.ssh` and `server.pem` reads) are allowed, as before.

Not in the corpus, found by hand: `python3 - <<'PY' ... PY` and `node <<'JS' ... JS`
(an interpreter reading its program from a heredoc) are blocked as
`analysis.unsupported-heredoc`, where the analyzer allowed them; a heredoc that
only writes a file is allowed. `.npmrc`, `.pypirc`, `.netrc`,
`.git-credentials`, `.env.*` variants, `*.key`, `*.p12`, `*.pfx`, `*.jks`,
`*.keystore`, `*.kdbx` and `id_rsa`-style names would be refused for file reads and
writes anywhere by the bundled entry, including a project's own `.npmrc` and test
fixtures; the extension does not forward file tools, so they are not.

## Dispositions under D13

| Group | Verdict now |
| --- | --- |
| Remote history | Denied: `--force`, `-f`, `+` refspec, `--mirror`, also behind `-C`, `--git-dir`, `$(pwd)` and redirections. Allowed: `--force-with-lease`, `--delete`, `-d`, `:ref`, `--prune`. |
| Local discard and hooks | Denied: `git reset --hard` in any order or with `-C`, `git clean -f` in any spelling, `git checkout .` and `git restore .`, and `git config core.hooksPath` in the corpus's spellings. Allowed: path-scoped `git restore` and `git checkout -- <path>`, `git stash drop`, `git branch -D`. `git -c core.hooksPath=<dir> <command>` and `git -C <dir> restore .` are not caught (DESIGN.md section 5). |
| Pipe to shell | Denied, with and without a following command (`pipe-shell`, `pipe-shell-chain`); the analyzer allowed the second. |
| Catastrophic recursive targets | Denied by cc-safety-net's strict rules: root, home, the working folder, its parents and dynamic targets. Writes to system folders and devices by other means are not checked and rest on Seatbelt. |
| Secret paths | Denied in `bash` (`cat .env`, `cat ~/.ssh/...`, `cat server.pem`). The extension does not forward file tools, so a file-tool read is decided by Seatbelt alone, which denies `.env` files and the credential set. |
| Routine cleanup | Allowed: literal paths below the working folder, absolute or relative (`corpus-131` is now allowed), and in temp. Denied: `*`, `$DIR` and `$(...)` targets. |
| Wrapper failure behavior | An unusable cwd, a malformed payload or a checker error blocks; an unhealthy checker blocks every call. `profiles/pi/test/checker.mjs` covers these, and `test/pi-launch.mjs` covers the launch. The analyzer's subprocess timeout, EPIPE, output-cap and process-group tests retire with the analyzer's files. |
| Benign scripts and quoted data | Environment changes, `curl -o` and interpreter one-liners are allowed. `cat <<EOF` of quoted `rm -rf /`, `python3 - <<'PY'`, `node <<'JS'`, `cat server.pem` and `eval "$(tool init -)"` are denied; the operator runs them outside the guard. |

The supported `cc-safety-net/api` declaration returns `allow` or `deny`, with one
`ruleId` for a denial. It takes only `command` and `cwd`; it exposes neither an
ASK result nor a per-call alternate rulebook, and the bundled Pi entry returns
block or allow without consulting Pi's confirmation UI. D13 removes the second
ask-list evaluation this record once named as a qualification. Nothing imports
private minified exports, forks the vendor or adds a parser.

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

The switch adds one health probe at load to Pi and OMP and no checker path: the
extension forwards shell commands only, as the analyzer checked them. It
adds no switch, rule family or dependency (cc-safety-net was already bundled) and no
required check; the hosted required check remains one with eight file slices. It
ends Pi's confirmations and removes the analyzer from the extension's path, with
its files still in the release. The per-launch session copy replaces no control. The
earlier runtime fixes keep their one directory-node lock grant (0 to 1) and their
two recursive permission-change patterns (2 to 2).
