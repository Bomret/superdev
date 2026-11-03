# 0182: The implementer proves its change, and the controller runs only suite gates

**Status:** Accepted

**Amended by:** [ADR 0192](0192-the-full-suite-runs-once-after-review-comes-back-clean.md), under which the only controller suite gates are the scope review's exit run, submit-pr's whole-repo run, and ship's moved-base gate.

**Amends:** [ADR 0125](0125-missing-red-never-blocks-a-slice-at-the-fix-cap.md), whose escape path keeps
Pass-to-pass and Missing fail-to-pass run and loses Missing RED.
[ADR 0134](0134-a-fail-to-pass-run-shows-a-change-s-tests-discriminate.md), whose controller runs
the fail-to-pass run over the focused or the full command.
[ADR 0178](0178-a-slice-review-runs-no-test.md), whose controller hands each slice review a tip result.
[ADR 0175](0175-a-green-suite-record-carries-across-a-delta-a-complete-focused-selector-covered.md), whose
fail-to-pass control run stands in for a fix cycle's focused run.
[ADR 0117](0117-the-run-trace-is-hook-written-evidence.md), whose run-trace hook writes the Missing RED note.

**Amended by:** [ADR 0186](0186-an-accepted-run-at-the-tip-becomes-the-suite-record.md), under which the exact-tip
route writes the run it accepts as the suite record, and a green record at the tip takes the route too.

**Amended by:** [ADR 0187](0187-a-test-file-s-stem-names-it-to-the-fail-to-pass-verb.md), under which a slash-free
word also names the test file whose stem it is.

**Amended by:** [ADR 0188](0188-the-fail-to-pass-verb-reads-no-word-of-its-command.md), under which the verb reads
no word of its command, and the reviewer judges which test files the recorded command runs.

**Amended by:** [ADR 0215](0215-fail-to-pass-reuses-a-traced-control.md), under which a passing run of the range's
test files that the trace holds at the tip on a clean tree is the verb's control run.

## Context

The `fewer-suite-runs` scope had eight slices on the full tier. Its run trace records 19 implementer
dispatches, 11 of them fix cycles, 14 slice reviews, 3 of them approving, and 3 final-review rounds. It
records 5 full runs, 66 focused runs, 51 single-file runs, and 14 fail-to-pass outcomes. Each fail-to-pass
outcome stands for two runs. Where the focused command takes no `{paths}`, the fail-to-pass run uses the full
command, so slices that run in parallel each run the full suite twice, at the same time.

Every fix cycle adds an implementer dispatch, a fail-to-pass run, a re-review, and the test runs around them.
Two kinds of finding started cycles that found no defect:

- **Missing RED** reads the order of the implementer's edits and runs. Its remedy reverts the implementation,
  records a failing run, and restores it. That failing run often fails because the implementation file is
  absent (`MODULE_NOT_FOUND`), and any test fails that way, a vacuous one included.
- **Pass-to-pass on a fix cycle's range** was closed by a fail-to-pass run the controller ran after the cycle.

The defects that mattered came from a reviewer reading a test against the slice's `acceptance`: a vacuous
test, a missing assertion, and a fixture that could not tell two cases apart.

## Decision

superdev judges the tests that exist, not the way they were written. Two checks establish that the tests
verify the wanted behaviour. A fail-to-pass run shows that at least one test fails without the change, and
the reviewer reads the tests against the `acceptance`. The full-suite gates show that nothing else broke.

1. **The implementer proves its own change.** It works test-first on its own test files. Before it reports,
   it commits its work and runs `scope.js fail-to-pass <base>..HEAD -- <command>` over its own range, where
   the range changes a test-path file and another file. The command names the test files the range adds or
   modifies. On `pass-to-pass` it strengthens the tests and runs the verb again from the same base. This
   holds for a slice and for every fix cycle, on both tiers.
2. **The verb runs only the command it is given.** It refuses a command that leaves out a test-path file the
   range adds or modifies. It has no form that chooses the focused or the full command itself.
3. **The controller runs only the full-suite gates**, at the tips that move a stage: implement's base gate,
   run handoff, review's entry and exit, submit-pr's whole-repo gate, and ship's moved-base gate. It runs no
   fail-to-pass run, no tip result, no closing run, and no per-cycle focused run.
4. **A reviewer runs no test.** A slice review and a re-review read the run trace: the implementer's recorded
   runs and its fail-to-pass outcome line.
5. **A passing full-suite run at the exact tip meets a full-suite gate.** A `full` or `whole` run line on a
   clean tree at the tip, whoever wrote it, is reusable with or without a suite record. A `whole` gate takes
   only a `whole` line.
6. **Missing RED is no finding.** Test-first stays in the implementer's prompt as working practice.
7. **A `run` line records its duration**, so a later change can measure what a run costs.

## Considered options

- **Keep the controller's fail-to-pass run, and narrow it to the range's test files.** The evidence would
  stay outside the dispatch under review. A pass-to-pass result would still reach the implementer one review
  cycle later.
- **One fail-to-pass run over the whole scope range, at run handoff.** It reports one outcome for the range,
  so a slice whose tests pass without its change hides behind another slice's failing test, and a finding
  names no slice.
- **No fail-to-pass run outside fix cycles.** Nothing would then show that a slice's tests detect its change.
- **Keep Missing RED.** It checks the order of the work, and its remedy shows little about the tests.
- **Reuse each test file's last pass until a changed path reaches it.** It needs a selector that lists the
  files a path set reaches. It is left to a later decision, once run lines carry durations to measure it.

## Consequences

Where the focused command takes no `{paths}`, a slice costs two runs of its own test files instead of two
full-suite runs. A fix cycle costs the same. A pass-to-pass result is fixed in the dispatch that caused it.

A regression outside a slice's own test files surfaces at the next full-suite gate and is attributed to the
scope, not to the slice. ADR 0178 rejected reading the implementer's runs from the trace, because a `run`
line cannot show that the last run covered every changed path. This decision accepts that gap and leaves it
to the gates. The exit run of each fix loop catches a cycle's regression before the stage moves.

The evidence that a slice's tests detect its change comes from the dispatch under review. The verb writes
that evidence, and its file check refuses a command that leaves out a changed test file.

The fail-to-pass outcome judges only the range's own test files. An unrelated test that fails after the
put-back no longer reads `fail-to-pass`.
