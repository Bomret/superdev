# 0215: Fail-to-pass reuses a traced control

**Status:** Accepted

**Amends:** [ADR 0182](0182-the-implementer-proves-its-change-and-the-controller-runs-only-suite-gates.md): the verb's control run can come from
the run trace, and the implementer's last GREEN run of the range's test files is the verb's control.

## Context

An implementer ran a slice's two test files green, committed, and then ran `scope.js fail-to-pass`. The verb's first
run repeated the green run against the same files and the same code, about three minutes on a bats suite. Nothing in
the playbooks said the verb's control already is a green gate, and the verb read nothing from the trace.

## Decision

The verb takes its control from the run trace where the trace already proves it. The last `path` run line at `<tip>`
on a clean tree, naming every test file the range adds or modifies and a duration, is the control when it passed and
no failing `path` run at `<tip>` follows it. The verb then runs only the second run, bounds it with that line's
duration, writes no control run line of its own, and says on stderr which line it reused.

The playbooks state the order that makes a separate green run unnecessary: an implementer commits its GREEN code and
runs the verb as the last GREEN run of the range's test files. A control that does not pass is a RED step.

## Considered options

- **Prose only.** Rejected by the operator: a run that ignores the prose still pays the repeat.
- **Record a content hash on every run line.** Rejected: the hook would pay a git call on every traced test run, and
  the trace layout, with the mod's parser fixtures, would change. Without it, a green run on an uncommitted tree
  cannot be matched to the commit made from it.

## Consequences

A second call over the same range reuses the first call's control. A green run on a dirty tree is never reused.
A run line the `run-trace.js` hook writes carries no duration, so only `scope.js test --` and the verb's own control
lines are reusable. A suite that calls the verb twice over one range in one run root clears the trace between calls
when it means to run both.
