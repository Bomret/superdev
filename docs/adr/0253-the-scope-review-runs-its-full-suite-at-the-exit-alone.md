# 0253: The scope review runs its full suite at the exit alone

**Status:** Accepted

**Amends:** [ADR 0234](0234-test-runs-overlap-and-skip-repeated-preparation.md): its decision 1 is withdrawn. The scope
review starts no full-suite run at entry. Decisions 2 to 4 stand.

## Context

ADR 0234 started the scope review's full-suite run at entry, in the background beside the first reviews, so a review
with no fix cycle paid one full run overlapped with its reviews. That run stands as the exit run's result only at a tip
no commit moved: a clean first verdict, or an ask-once answered with fix none. ADR 0192 counted 34 of 35 scopes
dispatching a fix cycle, and a fix cycle's commit moves the tip, so the exit run runs the full suite again. The
controller also waited for the entry run's end before the first fix cycle, so a slow suite delayed the fix loop by its
own length. The entry run answers no question the exit run does not answer later (ADR 0242).

## Decision

1. **The exit run is the scope review's one full-suite run.** The review starts its full-suite run only on a route that
   advances the stage, at the tip it would advance, and never while a fix cycle can still move that tip. The exit run's
   order stands: reuse, carry, full command, recorded rerun.
2. **Entry runs the reuse check alone.** Before the first `final-reviewer` dispatch the review runs
   `scope.js suite reusable`, which reads the suite record and the run trace and runs no test. The dispatch is handed
   the reused outcome, or no run with its reason. The carry, which runs a focused run, stays at the exit run.
3. **The preparation stays at entry.** The scopetree is prepared at review entry, because the fix implementer's focused
   and fail-to-pass runs use that tree.

## Considered options

- **Start the entry run and kill it when findings arrive.** Rejected: it keeps the overlap only for a clean first
  verdict, about 1 scope in 35, burns a partial run in the rest, and adds a killed-on-purpose outcome.
- **Run fix cycles while the entry run continues in a separate worktree.** Rejected: it still pays the run, adds a
  worktree, and its red lands on a tip the fixes already moved.
- **Take the carry at entry.** Rejected: the carry's focused run is a test run at a tip a fix cycle can still move,
  and the exit run takes the carry anyway when no cycle follows.
- **An entry focused run.** Rejected, as in ADR 0234: it repeats each slice's own focused run.

## Consequences

A review with no fix cycle runs its reviews and then the exit run in sequence, so its wall clock grows by the full
run's length, where ADR 0234 overlapped the two. A review with fix cycles saves one full run and starts its first cycle
as soon as the ask-once is answered. A red suite surfaces only at the exit, where it opens a fix cycle that counts
toward the 3-cycle cap. On a scope whose first verdict also has findings, a red between slices then costs one more
cycle than ADR 0234's entry run did, where it joined the first fix list. ADR 0192 rejected running no test at entry
because a red between slices would surface only after a clean verdict. That cost now holds for the full suite, and
the scope accepts it, because the entry run it would save is spent in nearly every scope.

A first `final-reviewer` dispatch is handed no run in nearly every scope. The reviewer reads that as a run still to
come at the exit, which gates the stage, and not as a gap in the change's testing.
