Review changed behavior for concrete defects. State the input, resulting harm
and source evidence. Keep comments concise; omit summaries and style-only findings.

- Follow SECURITY.md's boundaries and accepted limitations. Seatbelt is the
  containment boundary; the OpenCode plugin and command analyzers are advisory.
- Preserve Guard-owned code, policy, bootstrap entries, executable bindings and
  pinned root identities. Check launcher, installation and recovery behavior.
- Ordinary OpenCode configuration, plugins, MCPs and skills remain editable
  where its policy grants access. Do not recommend blanket configuration denies.
- Pi and OMP have their own, intentionally stricter policy. Do not apply
  OpenCode's customization permissions to them.
- Distinguish a stale test assertion from a production regression using the
  current implementation and documented contract. Preserve meaningful coverage.
- Report plausible deployment failures rather than hypothetical evasions,
  speculative hardening, naming, formatting or unrelated refactoring.
