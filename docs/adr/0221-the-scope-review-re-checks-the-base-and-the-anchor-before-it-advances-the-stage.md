# 0221: The scope review re-checks the base and the anchor before it advances the stage

**Status:** Accepted

**Amends:** [ADR 0173](0173-the-scope-review-brings-the-base-in-at-entry.md), under which the review brings
the base in at entry only, and [ADR 0206](0206-the-anchor-receives-ticks-from-the-review-on.md), under which
the review runs the anchor sync once, when its Definition-of-Done step opens.

## Context

A scope review can run for hours across fix cycles. The base branch can move in that time, and the entry merge
of ADR 0173 then leaves the scope branch behind the base it targets. A fix cycle can also land ticks in
`dod.md` after the entry sync, so the anchor's checklist lags behind `dod.md` when the stage advances.

ADR 0173 rejected a merge right before the fix loop's exit run, because `final-reviewer` would never review a
conflict resolution.

## Decision

1. **The anchor sync runs at review entry and again before each stage write.** The entry sync runs on every
   route and at every stage the review accepts, before the first dispatch of `final-reviewer`. A failed anchor
   call is reported once per run and stops nothing.
2. **The review checks for a moved base before every exit run and at the end of each fix cycle, at every stage
   it accepts.** It fetches the base and reads whether the scope branch holds the fetched tip.
3. **At a stage before `submitted`, the controller merges a moved base itself**, through the base step, never
   through a fix implementer. A finding whose remedy is that merge leaves every fix list.
4. **A merge that resolved a conflict takes a whole-range `final-reviewer` re-review before the exit run.** A
   merge with no conflict takes none, and the exit run verifies it.
5. **Neither the merge nor its re-review counts as a fix cycle** toward the 3-cycle cap.
6. **At `submitted`, the review merges nothing** and names the moved base for `/superdev:ship`, as ADR 0173
   states.

## Considered options

- **Merge right before the exit run with no re-review.** Rejected for a conflicted merge, for the reason ADR 0173
  gave: no reviewer would see the resolution. A clean merge carries no resolution, so the exit run alone gates it.
- **Re-review every moved-base merge.** Rejected: a merge with no conflict adds only base commits that the base
  branch already reviewed, and the exit run tests the merged tip.
- **Count the merge as a fix cycle.** Rejected: base movement is outside the scope's control, and counting it
  would let a busy base exhaust the cap.

## Consequences

- The stage advances on a scope branch that holds the base tip fetched before its exit run.
- The anchor's checklist agrees with `dod.md` at each stage write.
- A warm re-review's range ends at the scope tip before any moved-base merge.
