# 0180: A loop step runs its test file where the focused command repeats the full one

**Status:** Accepted

**Amended by:** [ADR 0192](0192-the-full-suite-runs-once-after-review-comes-back-clean.md), under which the whole-set runs a loop step skips are covered by the scope review's exit run.

**Amends:** [ADR 0139](0139-a-test-first-step-runs-the-tests-it-works-on.md), which states which paths a
test-first step passes, and [ADR 0177](0177-an-implementer-runs-only-the-tests-that-verify-its-work.md), which
bounds an implementer's runs.

## Context

ADR 0177 keeps an implementer's runs to the tests that verify its work, through `scope.js test focused <paths>`
with at least one path. Where no cheaper subset exists, `/superdev:setup` writes the full command into the
focused fence again, with prose stating why (ADR 0085). That focused command carries no `{paths}` token, so
`test focused <paths>` runs the whole suite at every failing-test and passing-test step. The bound of ADR 0177
then saves nothing in exactly the repositories where a suite run costs most.

`scope.js test -- <command>` already runs one test command the runner recognizes, and the implementer can name
one test file to its runner. Every flow that takes an implementer's work also runs a suite over that
work at a controller gate: the slice review's tip result in the full tier, the controller's focused run after a
review fix cycle or a run handoff fix, and run handoff's full-suite run after the lite tier's last slice.

## Decision

1. **Where the focused fence repeats the full fence, a failing-test or passing-test step runs its test file
   through `scope.js test -- <command>`.** The command is the runner's own invocation of that one file. A step
   that works on more than one test file runs one `test --` call per file.
2. **The run before the implementer reports, and before the lite tier commits a slice, does not run in that
   case.** It would be the full suite again. The controller's next gate runs it.
3. **A step that works on no test file runs no test in that case.** It leaves the run to the same gate.

## Considered options

- **Document the case as a limit.** It leaves the full-suite cost of ADR 0177's motivating incident in the
  repositories where that cost is highest.
- **Add a one-file command to `verification.md`.** It needs a new configuration slot, a `/superdev:setup`
  probe, and a seed gap for every configured repository. The implementer can already derive the one-file
  invocation from the full command.

## Consequences

In such a repository, an implementer's report and a lite slice commit rest on the step runs alone. A failure in a
test the step runs did not cover surfaces at the controller's next gate. In the lite tier that gate is run handoff's
full-suite run, after the last slice.
