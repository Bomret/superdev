# 0261: Mechanical review grading lives in read-only verbs

**Status:** Accepted

**Amended by:** ADR 0262

## Context

Reviewers graded fail-to-pass runs and untraced writes from reference prose. `references/fail-to-pass.md` and
`references/untraced-writes.md` had each reviewer derive every **Window** from `dispatch` and `dispatch-end` times, copy
the bounds into `scope.js untraced`, and decide Pass-to-pass and Missing fail-to-pass run by reading outcome lines.
Measured superdev runs show the cost: subagents piped most `scope.js trace` calls through ad-hoc `grep`, `tail`, and
`awk` filters, and read both references dozens of times per run.

## Decision

A grading step that the run trace and git decide is a read-only `scope.js` verb, and its output is the verdict.
`scope.js windows` lists a slice's windows. `trace`, `untraced`, and `fail-to-pass-check` take `--window <dispatch id>`,
and `untraced` loses `--from` and `--until`. `fail-to-pass-check` prints the mechanical fail-to-pass verdict for a range.
The reviewer keeps the judgments no verb can make: whether a command covers the range's test files, whether a change
adds behaviour, and the unclosable cases. Each verb change deletes the prose procedure it replaces in the same change.

## Considered options

- **One grading verb per slice** that prints every mechanical finding. It saves more calls, but it must map commits to
  windows itself, a heuristic the prose deliberately avoids. Rejected.
- **Remove superdev's JS on newer models.** The hooks print nothing outside a denial and `lib/` never reaches context,
  so removal saves no tokens. It also drops what prose cannot hold: denials, a trace written independently of the
  model, and cleanup after the agent's turn. Rejected.

## Consequences

The verdict vocabulary of `fail-to-pass-check` becomes a contract the reviewer prose reads. A change to it updates
`fail-to-pass.md` in the same change.
