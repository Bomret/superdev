# 0251: Fail-to-pass settles from the run trace

**Status:** Accepted

**Amends:** [ADR 0134](0134-a-fail-to-pass-run-shows-a-change-s-tests-discriminate.md), whose double run
stays the answer when the trace cannot settle the range.

## Context

ADR 0134's fail-to-pass run shows that a change's tests discriminate. It prepares a throwaway worktree,
runs the tests at the change's tip, and runs them again with the change's non-test files put back. It reads
exit statuses only, so a test that calls a symbol the change adds reads `fail-to-pass` from a compile or
import failure alone.

Under ADR 0250 the run trace already holds, for every test file a slice changes, a failing run recorded
before that file's tests went green. That run happened against code that did not yet hold the change the
test checks. It is the same file-grain, exit-status evidence the double run produces, gathered in the live
checkout. Each fail-to-pass run costs a worktree, a prepare command, and one more test run, per slice and per
fix cycle.

## Decision

`scope.js fail-to-pass` first reads the run trace of the run root it writes to. It settles from the trace
only when every test-path file the range changes shows this sequence inside the range's own window, after
that file's last edit in the range:

1. a failing test run whose file list names that file alone;
2. then an edit outside the test paths;
3. then a passing run over that file, after the last edit outside the test paths in the window, recorded at the
   range's tip commit on a clean tree.

Only runs recorded at the tree root (directory `.`) count, the failing run and the passing run alike. A later
edit outside the test paths outdates the green run, and the file names of a run made in a subdirectory do not
resolve against the tree root.

The run's single outcome then belongs to that one file, the last test added to it was red after it was
written, and code outside the tests changed before it went green. The verb writes a `fail-to-pass` outcome
line whose reason field marks it as settled from the trace, and runs nothing. A settlement from the trace
is always `fail-to-pass`. In every other case the verb runs as ADR 0134 states. Outside a run root there is
no trace, and the verb always runs.

## Considered options

- *Always run the double run.* Rejected: it pays a worktree, a prepare, and a run to restate what the
  trace already shows.
- *Let the implementer report the red observation.* Rejected for the reason ADR 0134 gives: a self-report
  adds nothing a reviewer can check. The trace lines are written by the runner, not by the implementer.

## Consequences

A slice built test-first settles fail-to-pass with no run. A red run caused by leftovers in the live
checkout, which the clean worktree would have caught, can settle a range the double run would read
`pass-to-pass`. The review checklist's Tautological test entry still reads every test. A range whose test
files were edited without a recorded failing run, such as a fix cycle that strengthens an existing test,
still pays the double run.
