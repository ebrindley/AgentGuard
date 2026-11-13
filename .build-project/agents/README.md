# Agent personas

This directory holds optional agent persona files for this project. `build init`
creates the directory with this README only; the bundled example personas are
installed when you pass `--agent-personas`.

## How Build uses them

Build's agent registry looks for `*.md` files in this order, with earlier
directories taking precedence for the same name:

1. `.build-project/agents/` in the project
2. `~/.build/agents/`
3. `~/.claude/agents/`

Each file is Markdown with YAML frontmatter. Build reads two frontmatter
fields, `name` and `description`, and ignores any others:

```markdown
---
name: code-reviewer
description: Reviews a change for defects and missing tests. Use for code review.
---
The body is the persona's instructions.
```

The `description` drives routing: Build extracts task words (review, test,
debug, design, document, and so on) and language names from it and scores each
persona against a prompt. Build does not read the body; it is for the agents and
tools that load these files.

Routing hints are off by default. Turn them on for one run with
`build run --agent-hints`, or for every run by setting
`BUILD_AGENT_REGISTRY_HINTS=1` in the environment. When hints are off, the
files in this directory have no effect on Build.

## Bundled examples

`build init --agent-personas` installs five short personas written for the kinds
of work Build routes: `code-reviewer`, `debugger`, `test-automator`,
`architect`, and `documenter`. Edit them freely; Build never overwrites a file
that already exists here.

## Writing your own

Give each persona a `name` that matches its file name and a `description` that
says what it does and when to use it, using the task words above so routing can
match it. Keep the body focused on the output the persona should produce.
Personas that should apply to every project on this machine belong in
`~/.build/agents/`.
