# 0260: The scope review merges a moved base at `submitted` too

**Status:** Accepted

**Amends:** [ADR 0173](0173-the-scope-review-brings-the-base-in-at-entry.md), under which review merges
nothing at `submitted`, and [ADR 0221](0221-the-scope-review-re-checks-the-base-and-the-anchor-before-it-advances-the-stage.md),
under which review names a moved base for `/superdev:ship` at `submitted` and merges nothing.

## Context

At `submitted`, `/superdev:ship` merges a moved base into the scope branch. When that merge conflicts, ship
aborts it, merges nothing, and points at `/superdev:review <scope>`, because a conflict resolution is
unreviewed code. Review at `submitted` ran no base step and merged nothing. It named the moved base for ship.
The two commands pointed at each other, and no command resolved the conflict. A scope in that state could not
ship without a merge the operator made by hand, outside the run trace.

ADR 0173 kept review from merging at `submitted` because a merge there would move the pull request's head.
Review pushes nothing (INV-0087). Its merge stays on the local scope branch until ship's gated push, the same
push that already carries a fix-loop commit review lands at `submitted`.

## Decision

1. **Review runs the base step at every stage before `shipped`, `submitted` included.** The entry base step,
   the preparation after it, and the moved-base merge before the review exits and at each fix cycle's end
   apply at `submitted` as they apply at earlier stages. A conflict is resolved per
   `references/merge-conflicts.md`, and a merge that resolved a conflict takes `final-reviewer`'s re-review
   of the merge range.
2. **Review still pushes nothing.** `/superdev:ship` finds the base already in the scope branch and pushes
   the merged tip through its gated push.
3. **Ship's conflict refusal keeps pointing at `/superdev:review <scope>`.** That review now resolves the
   conflict.
4. **At `shipped` and `closed`, review merges no base.** The pull request has merged, so no merge into the
   scope branch can reach it.

## Considered options

- **The operator merges and resolves by hand, then runs review and ship.** Rejected: the merge lands outside
  the run trace, and its resolution skips the merge-conflict discipline. The re-review over the merge range
  happens only because the whole range is reviewed.
- **Ship resolves the conflict itself.** Rejected: ship merges reviewed code only, and a resolution is
  unreviewed code.

## Consequences

- A scope at `submitted` whose base merge conflicts reaches ship through one review run when
  `references/merge-conflicts.md` resolves each conflict by the intent of both sides. A winner-picking overlap,
  where the two sides decide the same thing in incompatible ways, aborts the merge, and the review stops for the
  operator. An unattended review blocks.
- A review at `submitted` can move the scope branch's tip, so the pull request's head moves at ship's next
  push. Ship's full-suite evidence covers the merged tip, through the named checks or its local run.
