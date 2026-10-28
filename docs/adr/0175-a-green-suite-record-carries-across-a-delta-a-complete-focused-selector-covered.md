# 0175: A green suite record carries across a delta a complete focused selector covered

**Status:** Accepted

**Amended by:** [ADR 0192](0192-the-full-suite-runs-once-after-review-comes-back-clean.md), under which implement's base gate and run handoff's suite run are gone; the carry serves the scope review's exit run and ship's moved-base gate.

**Amended by:** [ADR 0194](0194-ship-carries-a-post-review-delta-before-it-refuses.md), under which every ship gate whose `suite reusable` call refuses takes the carry before it refuses.

**Amends:** [ADR 0128](0128-a-green-suite-record-carries-across-markdown-only-commits.md), whose carry
admits only Markdown paths, and [ADR 0134](0134-a-fail-to-pass-run-shows-a-change-s-tests-discriminate.md),
under which a fail-to-pass run records no test run.

**Amended by:** [ADR 0182](0182-the-implementer-proves-its-change-and-the-controller-runs-only-suite-gates.md), under which a fail-to-pass control run writes a `path`
line and stands in for no fix cycle's focused run, and [ADR 0189](0189-no-test-runs-after-review-and-none-in-setup.md),
under which a carry to a commit M chains once with a Markdown-only carry from M to the tip.

## Context

A scope pays the full suite at implement's base gate, at run handoff, at review's entry and at its fix
loop's exit, and at ship's merge of a moved base. In this repository the full suite takes about
6 minutes. Most of these runs follow a green full run on an ancestor commit, and the commits between
the two are a fix cycle or a base merge.

`scope.js suite reusable` reuses a green record only on its exact commit, or across a Markdown-only
range (ADR 0128). Every other tip move pays a whole run again, even where the focused command, run over
the paths changed since the record, selects every test those paths can affect.

The focused command is not always such a selector. `references/test-selection.md` also admits a fixed
fast subset and a self-detecting runner flag. Where it takes `{paths}`, whether it selects every
affected test depends on the runner. This repository's `scripts/run-tests.js --related` runs every suite
for a code path no rule places. A runner that only collects test files from the substituted paths does
not.

Each fix cycle also runs the focused command over its commits, and then `scope.js fail-to-pass` over the
same range. That verb's control run is the same focused run, at the same tip, on a clean worktree.

## Decision

1. **A repository opts in with a complete-selector declaration.** A section of
   `docs/agents/verification.md` states that the focused command, given the changed-path set, selects
   every test any changed path can affect. It may list the selector's own files. It takes effect only
   where the focused command carries `{paths}`, and it is read from the tip commit, never from a working
   tree. `/superdev:setup` asks for it only where the focused command carries `{paths}`, names what a yes
   trusts, and writes it only on an explicit yes. This repository declares it, naming
   `scripts/run-tests.js`.
2. **Under the declaration, a green record at A carries to a later tip T** when the run trace backs A as
   ADR 0128 requires, A is an ancestor of T, the trace records at T a passing focused run on a clean tree
   whose recorded path set covers every path changed in A..T, and no full, whole, or direct test-file run
   at T failed. No path changed in A..T may be `docs/agents/verification.md` or a file the declaration
   lists. The record's kind carries.
3. **The carry is a read-time check.** No verb writes a carried record. The record stays at A, so a later
   tip needs a focused run over everything changed since A. No carry builds on another.
4. **A focused run records the path set it ran over.** `scope.js test focused` writes it into its run
   line, encoded so that every path reads back whole. A focused run the run-trace hook records from a
   direct Bash call carries no path set and backs no carry.
5. **Every gate accepts the carry.** A gate whose record does not carry to its tip runs the focused
   command over the paths changed since the record first, when the declaration holds and the record is an
   ancestor of the tip. It runs the full command only when that still leaves no carry. A failing focused
   run there is the gate's red result.
6. **A fail-to-pass run's control run writes a run line** of the kind it ran, carrying its result, the
   tip, its tree state (`dirty` where the worktree's HEAD left the tip or its tree was dirty at either end, as
   `scope.js test` reads it), and its path set. Review's fix loop and run handoff's fix loop skip their own focused
   run for a cycle whose commits a fail-to-pass run covered. A cycle without one keeps its focused run.

## Considered options

- **Carry wherever the focused command takes `{paths}`.** Rejected: superdev cannot judge a consumer's
  selector, and a runner that collects only substituted test files proves nothing about a source change.
- **`/superdev:submit-pr` runs a true full run before the pull request opens.** Rejected: it restores
  about one full run per scope, the cost this decision removes. The declaration is the operator's
  statement that the selector makes that run redundant.
- **Ship refuses a carried record.** Rejected: every review would then pay a true full run at the final
  tip again.
- **Record a range in the focused run line instead of a path set.** Rejected: a fix cycle's focused run
  and a fail-to-pass control run are handed paths, not always the range since the record. A path set
  lets any caller's run back a carry that it actually covers.
- **Hand the control run's result over in prose only.** Rejected: the carry reads trace lines, so a
  result that never reaches the trace backs nothing.

## Consequences

- In a declaring repository, review's exit run and most base-merge gates cost a focused run instead of a
  full run.
- A repository without the declaration keeps ADR 0128's rule exactly.
- A run trace an earlier release wrote carries no path set on its focused lines, so it backs no carry.
- A selector that misses an affected test now lets a defect reach the merge without a full run behind
  it. The declaration puts that risk on the repository that states it.
- `test/fast-full-suite` (#1189) names the focused command in place of the full one as a non-goal,
  because it changes what the run proves. This decision changes what a gate proves only where a
  repository declares its selector complete.
