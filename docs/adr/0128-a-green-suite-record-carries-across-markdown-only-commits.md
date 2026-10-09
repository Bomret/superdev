# 0128: A green suite record carries across Markdown-only commits

**Status:** Accepted

**Amends:** [ADR 0025](0025-the-scope-review-owns-the-full-suite-run.md), whose documentation step
verifies its commits with the focused command while the merge gate demands a full-suite result on the
exact tip, and [ADR 0117](0117-the-run-trace-is-hook-written-evidence.md), under which a focused run never
backs a reused suite record.

## Context

`/superdev:review` records the full suite green on the review tip. `/superdev:document` then lands doc
commits on the scope branch and runs the focused command over them (ADR 0025). `/superdev:submit-pr` runs
no suite unless the repository configures a whole-repo command. `/superdev:ship` merges only on a green
suite record whose commit is the exact tip, backed by the run trace (INV-0017).

The doc commits move the tip past the recorded commit. `/superdev:ship` therefore refuses on almost
every scope whose doc pass landed commits, and the operator re-runs `/superdev:review` only to record a
new full-suite result. A full suite can hold integration and acceptance tests that run for a long time.
That cost is out of proportion to a Markdown change.

## Decision

1. **`scope.js suite reusable` accepts a green record on a later tip under one rule.** The record's
   commit R is not the tip T, and every condition below holds:
   - The run trace backs R: the latest full or whole run at R passed on a clean tree.
   - R is an ancestor of T.
   - Every path that differs between R and T ends in `.md`, case-sensitive. A rename counts as both of
     its paths.
   - No such path is a test path, per the `## Test paths` section of `docs/agents/verification.md` at
     commit T, or its defaults. The configuration is read from the commit, never from a working tree.
   - No such path is `docs/agents/verification.md`. A change to it can rewrite the test commands and the
     test paths this rule trusts.
   - The latest run of a configured test command at T passed on a clean tree. A focused run qualifies.
   - No full or whole run at T failed, and no run of a test file named directly at T failed. A later
     focused pass does not hide a red result.
   - Any git error while deciding the above refuses reuse.
2. **The rule is a read-time check.** No verb writes a carried record, and the ledger's suite record keeps
   its form. The record's kind carries unchanged, so a `whole` record at R satisfies a `--whole` caller at
   T.
3. **On a live scope run, the documentation step's changed-path set runs from R to the tip.** R is the
   suite record's commit when it is an ancestor of the tip. Otherwise the set stays the doc commits the
   step landed. The focused run then covers every path the carry vouches for, including a commit another
   author landed between the review and the doc pass.
4. **Every other tip move keeps today's rule.** A path that does not end in `.md`, a test path, a red,
   `unknown`, or dirty-tree run at T, or a record that is not green, gets no carry.

## Considered options

- **The documentation step runs the full suite after its commits.** Rejected: it adds a full-suite run
  for every doc pass, which is the cost this decision removes.
- **`/superdev:submit-pr` runs the full suite when the tip is not reusable.** Rejected for the same cost,
  paid one step later.
- **`/superdev:ship` runs the full suite itself.** Rejected for the same cost, and a red result appears
  only after the pull request is open.
- **Reuse across any Markdown-only diff, with no run at the tip.** Rejected: a Markdown commit can break a
  test that asserts prose. The focused run at the tip is the evidence that it did not.
- **A carry verb that writes `green @T from R` into the ledger.** Rejected: a new verb, a new record form,
  and new drift rows, for a check the reader can make from the ledger, git, and the run trace.
- **Provenance: carry only across the doc pass's own commits.** Rejected: the focused run over R to the
  tip already covers every commit in the range, so tracking who authored each commit adds nothing.
- **Code-host CI status as the merge gate.** Deferred: no code-host seed reads CI status, and each backend
  would need its own section.

## Consequences

- A scope whose doc pass landed only Markdown commits merges through `/superdev:ship` with no second
  full-suite run.
- A doc pass that touches a non-Markdown path or a test path still sends the operator back to
  `/superdev:review`.
- A focused run backs a reused suite record only through this rule (INV-0017, INV-0129).
- In a repository whose focused command collects no test for a Markdown path, the run at the tip proves
  only that nothing it selects broke. The decision accepts that. The run is still a trace-recorded pass on
  a clean tree.
