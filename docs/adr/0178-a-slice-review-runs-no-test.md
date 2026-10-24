# 0178: A slice review runs no test

**Status:** Accepted

**Amends:** [ADR 0002](0002-metrics-are-proxies.md), whose slice-reviewer independently re-runs the suite,
and [ADR 0155](0155-a-slice-merge-runs-no-test-suite.md), whose inherited failure the slice-reviewer
establishes itself.

## Context

The slice-reviewer's Lens 2 re-ran the focused command over the slice once per review, so it did not trust
the implementer's reported green (ADR 0002, ADR 0114). It reached the full suite when a repository's focused
command cannot be narrowed, and nothing in its body or its dispatch ruled the full suite out.

Before a `behavior` slice's first review, the controller already runs `scope.js fail-to-pass <base>..<tip>`
(ADR 0134). The verb's control run runs the tests of every path the range changed, at the tip, in a clean
throwaway worktree. An outcome of `fail-to-pass` or `pass-to-pass` means that control run passed, and the run
trace records the line. The implementer writes none of that evidence. The reviewer's own run repeated it.

The verb does not run on every review. It skips a slice whose range does not change both a test-path file and
another file. A re-review's verb run covers only the fix cycle's range. A failing control run gives `unknown`.

## Decision

1. **The slice-reviewer runs no test.** It reviews against a **tip result** the controller hands it, and it
   verifies that result in the run trace.
2. **The tip result is one run at the reviewed tip, over every path changed from the review base.** The review
   base is the commit the slice branch was cut from, and the scope branch's tip when the sweep began for a
   Minor sweep review. Where the latest `fail-to-pass` line over that range reads `fail-to-pass` or
   `pass-to-pass`, its control run is the tip result. Otherwise the controller runs `scope.js test focused`
   once over those paths. A slice review never runs `test full` or `test whole`.
3. **A tip result that holds a failing test comes with a base run.** The controller runs each failing test file
   at the review base in a throwaway worktree. A test that fails in both runs is inherited (ADR 0155,
   INV-0157). A test whose file is absent at the review base is the slice's own.

## Considered options

- **Keep the reviewer's focused run, and forbid only the full suite.** It keeps a second run of tests the
  verb already ran at the same tip.
- **Let the reviewer read the implementer's runs from the trace.** A `run` line records only the test files
  among a focused run's paths, so it cannot show that the last run covered the whole changed-path set.
- **Let the reviewer judge an inherited failure by reading.** It is a judgment where a run at the base is
  exact.
- **Send a red tip back to the implementer before any review.** The reviewer would then never see an
  inherited failure, and the implementer's named failures reach it only through its report (INV-0114).

## Consequences

A behaviour slice's first review usually costs no test run beyond the fail-to-pass run. A re-review, and a
slice without a fail-to-pass run, costs one controller focused run, the run the reviewer made before. A red
tip costs one more run of the failing test files at the base. The reviewer's independence rests on the run
trace, which hooks and `scope.js` write, and not on its own run.
