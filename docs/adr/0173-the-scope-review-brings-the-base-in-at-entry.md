# 0173: The scope review brings the base in at entry

**Status:** Accepted

**Amended by:** [ADR 0192](0192-the-full-suite-runs-once-after-review-comes-back-clean.md), under which the review's base merge at entry is verified by its exit run, not its entry.

**Amends:** [ADR 0120](0120-implement-brings-the-remote-base-into-the-scope-branch-before-the-first-slice.md), under which only
`/superdev:implement` brings the base into the scope branch before ship.

## Context

Base moves while a scope is reviewed. An operator who merges it mid-review pays a full-suite gate for the
merge and then the fix loop's exit run, over nearly the same code. `/superdev:ship` merges a moved base
too, and gates that merge with its own run, after the review has seen none of the merged code.

## Decision

1. **On a live scope run at a stage before `submitted`, `/superdev:review` runs
   `references/scope-mode.md`'s `## Bringing the scope branch to base` before its entry suite check.** The
   step's conflict, numbering-collision, unattended-block, and degraded-fetch rules apply unchanged.
2. **The entry gate is the merge gate.** One suite run, or a carry (ADR 0175), gates both the merge and the
   review's entry.
3. **At `submitted`, review merges nothing.** `/superdev:ship`'s merge of a moved base owns that stage, and a
   merge there would move the pull request's head under it.

## Considered options

- **Merge right before the fix loop's exit run.** Rejected: the exit run would gate the merge, but
  `final-reviewer` would never review the merged code or a conflict resolution.
- **Leave base to implement and ship.** Rejected: a mid-review merge stays a manual step that pays its own
  gate.

## Consequences

- `final-reviewer` reviews the scope against the base it will merge into.
- `/superdev:ship` finds a moved base less often, because review brought base in closer to the merge.
- A review entered on an unreachable remote records a degraded pass and continues, as implement does.
