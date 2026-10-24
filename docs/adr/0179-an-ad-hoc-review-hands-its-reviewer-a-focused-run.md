# 0179: An ad-hoc review hands its reviewer a focused run

**Status:** Accepted

**Amends:** [ADR 0025](0025-the-scope-review-owns-the-full-suite-run.md) and
[ADR 0075](0075-the-scope-review-gates-on-a-full-suite-entering-and-leaving.md), whose ad-hoc branch left
`final-reviewer` its own suite re-run.

## Context

In ad-hoc mode, `/superdev:review` handed `final-reviewer` the test command and let it re-run the suite once
over the range. Its body named `test full` as one of the runs it could make. Six facts weigh against that run:

- A green full suite shows that the tests and the code agree in a tree. It does not show that a test reaches
  the reviewed change, and an ad-hoc range has no fail-to-pass run (ADR 0002, ADR 0134).
- `final-reviewer` runs in the invoking checkout. A range that ends at another commit, or another branch,
  is not the code that checkout's suite runs.
- Running a branch's suite runs that branch's code. A second opinion on someone else's branch is one of
  ad-hoc review's stated uses.
- A suite can write build output, caches, and snapshots, or reach the network. Ad-hoc review is read-only
  end to end, and verifying changes no system outside the repository (ADR 0084, INV-0006).
- Outside a run tree, `scope.js test` records nothing, so an ad-hoc run feeds no suite record and no gate.
- With no run at the base, a red result outside the range cannot be told from a failure the range caused.

## Decision

1. **`final-reviewer` runs no test, in either mode.** It reviews against the result the controller hands
   it, and judges whether that result covers the changed code.
2. **In ad-hoc mode, the review skill runs one focused run over the subject's changed paths**, from the
   invoking checkout, before the dispatch. It runs only where the subject's tip is the checked-out tree:
   the subject is the working tree's uncommitted changes, or its range ends at `HEAD` and the working tree
   is clean.
3. **Every other subject runs no test**, and the dispatch and the report name the reason. That covers a range
   that ends elsewhere, another branch, a dirty tree, and a standing-code target, which has no change.
4. **The full suite runs only when the operator asks for it**, under the same tip condition. `--chained`
   never runs it.

## Considered options

- **Keep the reviewer's own re-run, and forbid only the full suite.** It keeps the reviewer running code in
  a checkout whose tree may not be the subject's tip.
- **Run every subject's tip in a throwaway worktree.** It covers another branch and an older range. It also
  runs the code of a branch nobody has read yet, and it needs the repository's dependency install in every
  worktree.
- **Run the full suite on every ad-hoc review.** The six facts in the context weigh against it.

## Consequences

An ad-hoc review of the working tree, or of the checked-out branch, costs one focused run. A review of
another branch, an older range, or standing code runs no test, and its report says so. `/superdev:sweep`'s
code leg is a standing-code review, so a sweep runs no test through it.
