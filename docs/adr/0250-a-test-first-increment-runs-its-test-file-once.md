# 0250: A test-first increment runs its test file once

**Status:** Accepted

**Amends:** [ADR 0139](0139-a-test-first-step-runs-the-tests-it-works-on.md) and
[ADR 0232](0232-the-loop-runs-test-files-and-the-focused-command-once.md), whose one focused run over the
slice's whole changed-path set stands.

## Context

An implementer builds a slice in tracer-bullet increments, one per acceptance criterion. Each increment made
a RED run and a GREEN run. After the last increment came a control run over the slice's test files, a
focused run over the whole changed-path set, and the fail-to-pass run. A slice of `n` increments made about
`2n + 3` runs. Between 2026-11-10 and 2026-11-17 implementers made about 1,720 test commands across 232
dispatches, at 12 to 14 minutes per slice in one consumer repository, and the operator asked five times why
so many tests ran.

A run of an increment's test file shows two facts at once: the new test fails, and the tests of earlier
increments still pass. The GREEN of an increment is therefore visible in the next increment's run, and the
GREEN of the last increment in the final changed-path run.

## Decision

The rule holds for an implementer's loop and for the lite tier's inline loop. Each increment runs its test
file once, through `scope.js test path`, after it writes the new test and before it writes the code that
makes it pass. The run shows the new test failing and every earlier test of the file passing. After the
last increment, one focused run over the slice's whole changed-path set is both the last GREEN and the final
check ADR 0232 requires. Where the focused fence repeats the full fence, that final run is one `test path`
run over every test file the slice changed, as ADR 0232 has the loop make no whole-set run there. The loop
makes no separate GREEN run per increment and no separate control run. A failing final run is a RED step:
the loop fixes the code, commits, and runs it again.

## Considered options

- *A RED run and a GREEN run per increment, narrowed to one test, without the control run.* Rejected: it
  keeps about `2n + 1` runs, and each narrowed run still pays the runner's build and start-up cost.
- *A RED run and a GREEN run over the test file, with no changed-path run.* Rejected: a slice that breaks a
  test in another file surfaces only at the scope review's full run, as a fix cycle.

## Consequences

A slice of `n` increments makes about `n + 1` runs before fail-to-pass. An increment whose code breaks an
earlier test of the same file shows that break in the next increment's run, not at once. The run trace
holds one failing run per changed test file before that file goes green, which ADR 0251 reads.
