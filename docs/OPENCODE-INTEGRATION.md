# OpenCode integration requests

Agent Guard can normalize its command prelude, preserve agent roles and explain
the host-resolved permission arrays. Three improvements need a supported host
contract. These are proposals for upstream coordination; no upstream issue or
pull request has been submitted from this workstream.

## Approval mode

Expose a capability-preserving automatic-approval setting usable by desktop
launch/configuration, plus authoritative current-state reporting. It should
handle ASK requests without overriding effective DENYs, include child-session
behavior and explicit session overrides, and agree with the desktop indicator,
notifications and stored project/session choice.

OpenCode 1.18.33–1.19.0 stores desktop auto-accept in frontend state. Its public
server replies do not distinguish a manual `once` from an automatic one. A
backend replier would leave the desktop's notification behavior and indicator
inconsistent. Guard does not edit private desktop storage or use global scalar
`permission: "allow"` as a substitute.

## Permission provenance

Return the winning rule's source and location with resolved permissions or
approval requests, preserving provenance through global/project/environment/
managed and per-agent merges and appended session restrictions. Current rule
objects contain only permission, pattern and action. Guard's source matches are
candidates; it cannot establish a file/line from an identical resolved value.

## Command presentation

Provide a shell prelude separate from persisted `input.command`, while retaining
the executed form for expanded details. A smaller alternative is a separate
display-command field honored by desktop and TUI during pending, completed and
failed states. An environment hook alone does not guarantee wrapper precedence
after `.zshenv`. Generic tool-call grouping is a separate host UI feature.

Current Guard normalization removes only exact leading Guard exports, including
old release prefixes copied from history. It keeps one active export and leaves
other user shell setup untouched. The current renderer still displays that
executed command; normalization alone does not supply a clean display field.
