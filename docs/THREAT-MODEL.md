# Threat model

What Agent Guard is trying to prevent, who it trusts, and what a reviewer has to
demonstrate before calling something a defect.

Agent Guard exists to stop a coding agent causing damage that cannot be undone.
Not to keep secrets, not to sandbox for its own sake: to put a limit on the
destructive reach of a process that writes files and runs shell commands on
someone's working machine.

[SECURITY.md](../SECURITY.md) enumerates what each release protects, what it does
not cover, the known limitations and the line between a vulnerability and a bug.
This document states the assumptions behind those lists. It does not repeat them.

For AI-agent work in this repository, this document tailors the baseline threat
model in the agent configuration root (`base-threat-model.md`). Tightenings below
need no justification; where this document scopes a baseline item out, it names
the item, the repository fact behind the decision and the accepted risk. Where
this document is silent, the baseline applies.

## 1. The damage that counts

Ordered by how hard it is to recover from, which is not the same as ordered by how
much of it the profile can stop. Section 3 maps each class to the layer that
covers it, and two of the top three have no boundary under them.

1. **Destruction of work that exists nowhere else.** Uncommitted changes,
   unpushed branches, local-only files, a folder the agent was never meant to
   touch. A recursive delete or a blind overwrite. Unrecoverable, immediately and
   completely.
2. **Destruction of version-control history.** Locally: `reset --hard`,
   `checkout -- .`, `clean -fd`, `stash drop`, `branch -D`. Remotely: force-push,
   branch deletion, mirror push. The remote cases reach other people's clones and
   CI, and recovery ranges from awkward to impossible.
3. **Damage to system and installed state.** Writes into executable folders,
   launch agents, shell startup files, installed CLIs, package stores. Recovery
   means reinstalling, and the breakage often surfaces later with no obvious
   cause.
4. **Code planted for later unguarded execution.** Startup files, launch agents,
   git hooks, configuration and extensions, npm configuration in the cache. The
   damage is deferred and unbounded, because what runs next runs with the
   operator's full authority rather than inside a profile.
5. **Loss of the guard's own ability to enforce.** Changing the engine, the
   profile, the Guard List or the records a launch depends on. Not damage by
   itself; it makes every class above available without limit.
6. **Re-aiming or disarming an operator rule.** Arranging, by writing state the
   session is allowed to write, for a Guard List entry to resolve somewhere else
   at the next launch. An operator-believed DENY stops covering its target, or an
   ALLOW grants a folder the operator never named, which is class 1 with the
   brakes off.

Recoverable annoyance is not in this list. A session deleting its own scratch
files, or a refusal that should not have fired, is a bug.

Confidentiality is not on this list. See section 4.

## 2. Trust boundaries

Not trusted: the guarded harness process, every process it starts, and every file
any of them writes. That covers the agent loop, plugins, MCP children, shell
commands and anything a session leaves on disk for later.

Intent is not modelled. A session that re-aims an operator's rule is treated the
same whether it was confused, following poisoned content, or deliberate. The
guard cannot tell those apart and does not try.

Trusted by assumption:

- The operator, and anything the operator writes outside a guarded session: the
  Guard List, an installer or update run, the contents of the engine folder.
- macOS and `/usr/bin/sandbox-exec`. A Seatbelt defect or an OS privilege
  escalation is out of scope.
- The harness vendors' released code. Agent Guard confines OpenCode, Pi and OMP;
  it does not audit them. A malicious harness release is out of scope.
- Other processes running as the same macOS account outside a guarded session.
  Pre-existing malware on the machine is out of scope.

The inversion is worth stating plainly. General agent-safety tooling treats
same-user actors as trusted and writes off planting and race attacks. Here the
guarded session *is* a same-user actor and is the thing being contained. So:

- State a guarded session can write, which the launcher or a later process reads,
  is attacker-controlled input. Planting it is in scope.
- A failure that requires winning a timing race against a concurrent process is
  out of scope, because that process is trusted. A window a session can set up in
  advance by writing state it is permitted to write is in scope. The two are easy
  to confuse; a finding should say which it needs.

Everything the launcher resolves from disk before `exec` — list entries, link
targets, roots, recorded executables — is read in a context where the previous
session's writes are already present. What the guard reads at launch is as much
attack surface as what it denies at runtime.

## 3. Which layer covers which class

The profile bounds *where* writes may land. It does not bound *what* happens
inside the area it permits, and it cannot see the network at all. That is the
central limitation of this design, and classes 1 and 2 above are where it bites.

| Damage class | What covers it |
| --- | --- |
| 1, outside the grant | The Seatbelt profile. Enforced. |
| 1, inside the grant | cc-safety-net and Pi's analyzer, then operator review. No boundary. |
| 2, local history | cc-safety-net and Pi's analyzer. No boundary. |
| 2, remote history | cc-safety-net and Pi's analyzer. Seatbelt cannot reach it. |
| 3 | The Seatbelt profile. Enforced. |
| 4 | The profile, for the assets it names; the exceptions in SECURITY.md are accepted. |
| 5, 6 | The Seatbelt profile. Enforced. |

Two consequences follow, and they pull in opposite directions.

SECURITY.md's statement that the in-process checkers are advisory and "nothing
depends on them for safety" means they are not a containment boundary and must
never be the stated defence for a class the profile could enforce. A
boundary-class invariant is defended in the profile or it is not defended;
adding an advisory check for it manufactures the appearance of a control.

But for classes 1-inside-the-grant and 2 there is no boundary to fall back on,
by design — editing the folders the agent is for is the whole point, and
SECURITY.md lists integrity of those folders under what the guard does not cover.
So coverage of ordinary, literal destructive spellings in those checkers carries
real weight, because nothing is underneath it. A missed literal spelling is a
genuine gap in the only coverage that exists. It is still not a vulnerability by
SECURITY.md's definition, and the response is still not to extend the matchers
toward evasive, quoted or nested forms: an evader who has to cooperate with the
parser is not a threat model, and the parser grows without bound. Cover the
spellings an agent emits naturally; document the rest.

## 4. Not this product's subject

**Confidentiality and credential disclosure.** This scopes out a baseline
protected outcome, so it is recorded here rather than left implied. Repository
fact: `engine/profile.sb` opens with `(allow default)`, and the only read denies
in a generated OpenCode profile are those Guard List DENY entries produce
(`engine/launch` renders each as `deny file-read* file-write*`). Reason: the
product's subject is destructive reach, and a coding agent has to read the machine
it works on; read-deny-by-default for OpenCode would need a per-user allowlist of
every toolchain path. The operator opts in per path. Accepted risk: credential
material is readable by default under OpenCode and the operator carries the duty
to deny it. Pi and OMP differ — their fixed profile denies named credential paths
— so a read of one of those under Pi is in scope. SECURITY.md states both.

**Exfiltration of anything a session can read.** Outbound network is unrestricted
for every harness. No read restriction here implies a confidentiality guarantee,
and a finding that a session could send a file somewhere adds nothing to the
finding that it could read it.

**Evasive spellings against the advisory checkers.** See section 3.

**Timing races against trusted processes.** A failure needing a guarded session to
win a race against the installer, an update or another local process is out of
scope; those are trusted and the operator starts them. The installer's own case is
already recorded and accepted in SECURITY.md: it follows a link at OpenCode's
global configuration and cannot tell a dotfiles link from one a session made.

**Supply-chain ordering.** An adversary who can publish can bump a version, so
version gates do not defend the cache and `.npmrc` limitation.

**Secrets the harness itself holds.** Provider tokens the harness needs are
outside the guard's reach by design.

**OpenCode inside a sandbox Agent Guard did not create.** The terminal launcher
steps aside there (DESIGN.md section 15, D10): it runs OpenCode under the existing
sandbox without its own profile and without reading the Guard List. This turns a
launch failure into a pass-through, so it is recorded here. Repository fact:
`engine/launch` takes this path only when its `sandbox-exec` probe fails with
`sandbox_apply: Operation not permitted` and no engine marker is set, and macOS
cannot apply a second profile (section 6). No Agent Guard protection is lost:
these launches failed before OpenCode started. Accepted risk: such a session is
confined only as far as the enclosing sandbox's rules reach, which may cover
fewer of the classes in section 1 than Agent Guard's profile; the tool that
applied that sandbox owns its policy. Any other probe failure keeps the normal
path, which fails before OpenCode runs.

**A VM, container or separate identity.** Agent Guard is a profile over one
account and is not an isolation substitute.

## 5. What a finding has to show

Beyond the baseline's requirement of concrete inputs leading to plausible damage:

- **Which damage class**, from section 1. A finding with no class is an
  observation.
- **Which layer**, from section 3. A finding against an advisory layer is a bug
  unless it also defeats the profile — but see the weight that layer carries for
  classes 1-inside and 2.
- **Which actor.** A guarded session, or another local process. The second is out
  of scope per section 2.
- **A probe, for any claim about Seatbelt filter semantics.** How `subpath`,
  `literal`, `regex`, link handling, hard links and case folding behave is not
  settled by reading the profile or reasoning about SBPL. Run it under
  `sandbox-exec` in a disposable directory and record the result. This rule comes
  from a recorded failure: in the 2026-10-22 design review, six of roughly
  twenty-nine candidates asserted Seatbelt behaviour — hard-link aliasing of a
  write-denied file, case-sensitive name denies — that probes refuted, and the
  refuting cost more than the review.
- **Separation of observation from inference.** SECURITY.md marks its inferences
  as such; findings should too.

Removing an existing control follows the baseline disposition rule: show it is out
of scope, redundant in the same enforcement path, or disproportionate, and map
each in-scope invariant it covered to what remains.

## 6. Established platform behaviour

Observations from probes under `sandbox-exec`, recorded so they are not
re-derived. All on macOS 26 (Darwin 25.6) arm64, case-insensitive APFS, 2026-10.

- `file-write*` is evaluated against the path a write names, not against a file's
  other links. Hard-linking a write-denied file into a writable folder is refused
  at the link call, so a hard link cannot alias a protected file into a grant.
- `subpath` and `regex` filters match case-insensitively on a case-insensitive
  volume, for reads and for creates. DESIGN.md section 9 records the `subpath`
  observation; `regex` was confirmed to behave the same way.
- `sandbox-exec` cannot nest inside an enclosing Seatbelt profile; the inner apply
  fails with `Operation not permitted`. Probes have to run outside any agent
  sandbox.

## 7. Gaps between this model and current behaviour

Each needs its own item; this is not a backlog. Ranked by the damage class they
touch.

- The skill-content carve-out in `profiles/opencode/protected.sb` reaches a
  `.cc-safety-net` component inside a skill tree, which DESIGN.md section 5 states
  is not writable. This touches the layer that covers classes 1-inside and 2,
  where there is no boundary underneath, so it matters more than its size
  suggests. `CC_SAFETY_NET_PROJECT_TIGHTEN_ONLY=1` limits the current effect to a
  stale claim and a narrow hardening gap.
- Shell startup protection (class 4) covers the eight files named directly in
  `$HOME` (`engine/profile.sb`). SECURITY.md's enumeration is accurate; the
  shorter phrasing earlier in that document reads as a general guarantee. With
  `ZDOTDIR` set, zsh reads startup files elsewhere and they get no guard-owned
  deny.
- The `process-exec` denies name seven absolute paths. They are a secondary layer;
  the operation-class denies (`lsopen`, `job-creation`) and setuid semantics carry
  the guarantee. A claim that a copied binary defeats the path deny is a finding
  only if the underlying capability is shown to be reachable.
- The profile restricts `mach-lookup` for one service, `com.apple.authd`, and only
  with `GUI=1`. It stops guarded desktop processes, in practice OpenCode's
  updater, from raising administrator authorization prompts (observed 2026-10-24).
  That is a recorded failure of a process that has no legitimate need for such a
  prompt. Other Mach services stay reachable, and a claim about one of them needs
  its own recorded failure.
- With `GUI=1` the profile also denies the `device-microphone` operation. The
  recorded failure is a prompt naming Agent Guard that appeared 155 ms after
  OpenCode Desktop played its "agent finished" sound (observed 2026-10-24).
  Desktop 2.1.4 has no audio capture, so nothing in use is lost. The cost is that
  a future OpenCode microphone feature, such as voice input, would not work under
  the guard. Camera access and other operations are not restricted.
- Guard List entries are compared as written, after escape and link resolution.
  Unicode normalization differences between an entry and the path on disk are in
  scope under class 6 and have not been tested.
