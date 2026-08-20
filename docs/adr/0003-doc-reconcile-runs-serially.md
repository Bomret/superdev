# 0003 — The doc reconcile runs serially after the final review

**Status:** Accepted

**Context.** `/superdev:implement`'s final phase runs two whole-scope steps: the `final-reviewer`
(read-only; computes the integrated diff `BASE..HEAD` where HEAD = the scope tip) and the
`/superdev:document` doc reconcile (dispatches `doc-writer`, which **commits** doc updates on the scope
branch). The lite tier previously dispatched both **concurrently** in one message to save a round-trip
of wall-clock, on the premise that they read the same diff and are independent when the review is clean.

**Decision.** Both tiers run the doc reconcile **serially, after** the final review and its fix loop —
never concurrent with the review. On a clean review the reconcile runs once; on Critical/Important
findings it runs after the fixes land, so it always describes the final state.

**Why.** The two steps are not independent: `doc-writer` commits move the scope tip while the
`final-reviewer` is computing `BASE..HEAD` against that same tip. Run concurrently, the reviewer reads a
shifting diff — possibly including half-written doc commits — so the "independent when clean" premise
does not hold. The one review at the end of a scope is not worth a moving-diff hazard; serial ordering
removes it by construction. The saved round-trip was a single wall-clock step at the very end of a run.

**Consequences.** The final phase is identical across tiers: review → fix loop → doc reconcile → PR.
The lite tier loses its concurrent-dispatch optimization. The `final-reviewer` always reads a stable
diff. Anyone re-introducing concurrency as a speed-up reopens the race this ADR closes.

ADR 0031 moves the lite tier's doc reconcile earlier, before run handoff rather than after the review.
The race this ADR closes stays closed there: the lite tier runs no `final-reviewer`, so no reviewer diff
moves under a `doc-writer` commit. The serial rule above holds unchanged for the `full` tier.
