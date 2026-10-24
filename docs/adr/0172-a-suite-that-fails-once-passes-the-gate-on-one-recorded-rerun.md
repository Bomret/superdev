# 0172: A suite that fails once passes the gate on one recorded rerun

**Status:** Accepted

**Amends:** [ADR 0128](0128-a-green-suite-record-carries-across-markdown-only-commits.md), under which no
later pass hides a failed full run at the tip.

## Context

A full run can fail in one suite for a reason the scope did not cause: a race under load, or a git race
between concurrent worktree creations (#1315, #1311). The suite passes when run alone. Today the
operator then runs the whole suite again, about 6 minutes here, and accepts its pass. Nothing records
the failure unless the controller files an observation.

## Decision

1. **Under the complete-selector declaration (ADR 0175), a full run at the tip T that failed in exactly
   one test file counts green at T** when all of the following hold:
   - a triage record quoting the failure was written before the rerun;
   - the controller attributes the failure to that one test file, from the run's own output;
   - a focused run over the scope's range passed at T on a clean tree after the failed run;
   - that test file, run alone at T on a clean tree after the failed run, passed, and every run of it
     alone at T after the failed run passed on a clean tree. A run of it recorded before the failed run
     counts for nothing, so an earlier RED run at the same commit never turns the rerun red;
   - the ledger records the rerun, naming the test file, the tip, and the triage record.
2. **Once per tip.** A second failed full run at T, a failure the controller cannot attribute to one test
   file, a failing rerun, or a failed run of another test file at T stays red.
3. **No step retries on its own.** Nothing reruns a failed suite in a loop, and nothing reruns a full
   run until it passes.

## Considered options

- **Never hide a failed full run.** Rejected: the operator's whole rerun accepts a pass no stronger than
  this one, costs about 6 minutes per flake, and leaves no record.
- **Retry a failing suite until it passes.** Rejected: it hides real intermittent defects and records
  nothing.
- **Allow the rerun in every repository.** Rejected: without a complete selector, the focused run over the
  scope's range does not show that the scope's own tests passed.

## Consequences

- Every flake that reaches a gate leaves a triage record.
- A real intermittent defect the scope introduced can pass the gate when it passes twice. A whole rerun
  accepts the same risk today.
- `scope.js suite reusable --base <base-branch>` judges the focused run against the scope's range: the run's
  path set must cover every path from the range base (`scope.js base resolve`) to the tip. Without `--base`
  a red record stays red.
- Whether exactly one test file failed is the controller's reading of the output, quoted in the triage
  record. `scope.js` checks the trace and the ledger, not the output.
