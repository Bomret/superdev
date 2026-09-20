# 0080 — Run roots anchor to the repository's main working tree

**Status:** Accepted

## Context

Every superdev surface addresses a run root as `.superdev/scopes/<scope>/`, relative to the invoking
checkout. That resolves correctly from the repository's main working tree and nowhere else. A command
invoked from a scopetree or a slicetree — a linked git worktree superdev itself created — resolves the
path inside that worktree, so a second run root nests inside another scope's checkout, invisible to
every survey command and reaped with the tree that holds it.

`/superdev:plan` made the breakage visible, because it stopped outright: its design-docs step read
`git rev-parse --abbrev-ref HEAD`, found the scope branch rather than the base, and refused. Now that
plan cuts a scopetree and writes a ledger (ADR 0079), the same invocation would create the nested run
root instead of stopping.

## Decision

A run root lives in the repository's **main working tree**, whatever checkout the command was invoked
from. `scope.js` gains a **`root`** verb that resolves it: `git rev-parse --git-common-dir` names the
shared git directory, its parent is the main working tree, and the run root is
`<main-worktree>/.superdev/scopes/<slug>/`. The verb prints one absolute path.

Every surface that needs a run-root path calls the verb rather than building the path from its own cwd.
The resolution is one function with one test suite, so a surface cannot get it subtly wrong in prose.

## Considered options

- **State the resolution in `references/scope-mode.md` and let each surface follow it.** Lost: the rule
  is arithmetic on git output, every surface would redo it, and prose cannot be tested.
- **Stop when the invoking checkout is a linked worktree.** Lost: the stop is the reported defect, and
  it forbids the ordinary case of planning the next feature from the checkout you are working in.

## Consequences

- A command run from any worktree of the repository addresses the same run roots, so a plan, a review,
  or a status read is invocation-independent.
- `hooks/run-lock.js` matches `.superdev/scopes/<scope>/scopetree` as a substring, so an absolute path
  from the verb is still guarded.
- A run root created before this decision, inside a linked worktree, is not migrated. It stays where it
  is until a human removes it.
