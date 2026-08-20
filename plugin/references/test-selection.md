# Test selection

The rule that picks between the full test command and the focused one (ADR 0025). Every prose caller
reads this file at runtime, the same shared-file-read-at-dispatch pattern as `references/scope-mode.md`.
`hooks/green-gate.js` is the exception: it reimplements the same rule in code, because a hook fires
without a dispatch to read a reference at.

## The two commands

`docs/agents/verification.md` carries one or two fenced code blocks.

- **The full command** is the first fenced block. Run it verbatim.
- **The focused command** is the optional second fenced block. It scopes a run to a set of changed
  paths. A second fenced block is **only ever** the focused command — never a watch command, a coverage
  command, or sample failure output. A watch command, a coverage command, sample failure output, or
  anything else a repository wants to keep in `verification.md` lives outside the first two fenced
  blocks.

## The `{paths}` token

Where the focused command contains the token `{paths}`, substitute the shell-quoted changed-path set
for it. Where it contains no such token, run the command verbatim, for a runner that detects the change
set on its own (for example `vitest --changed` or `jest -o`).

Quoting a changed path keeps the shell from word-splitting it; it does not keep the runner from reading
it as an option. A template puts `{paths}` after a `--` separator, where the runner supports one (for
example `pytest -- {paths}`), so a changed path shaped like `--config.js` still reaches the runner as a
path argument instead of a flag.

## The changed-path set

Each caller judges its own range and builds the set from it:

- **The implementer's TDD loop, and the lite tier's inline loop.** The slice base against the working
  tree.
- **The slice-reviewer's Lens 2.** The slice branch against the scope branch.
- **The green-gate hook.** `ORIG_HEAD` against `HEAD` — not the merge's first parent, because a
  conflicted merge leaves `HEAD` unmoved with `ORIG_HEAD` equal to it, an empty set the fallback below
  catches, where the first parent would instead return the previous commit's paths, stale. Falls back to
  the first parent where `ORIG_HEAD` does not resolve.

## Fallback to the full command

Two conditions fall back to the full command instead of the focused one:

- **No second fenced block is configured.** A repository that configures nothing keeps its full-suite
  behavior unchanged.
- **The changed-path set is empty.** A focused run over no paths would report green having tested
  nothing.
