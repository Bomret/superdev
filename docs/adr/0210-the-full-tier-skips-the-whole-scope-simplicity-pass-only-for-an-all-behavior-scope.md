# 0210: The full tier skips the whole-scope simplicity pass only for an all-behavior scope

**Status:** Accepted

**Amends:** [ADR 0037](0037-the-full-tier-skips-the-whole-scope-over-engineering-pass.md): the skip
holds only where every slice had a per-slice pass.

## Context

ADR 0037 lets the scope review skip `simplicity-reviewer` on a full-tier scope, because every slice on the
scope branch has already been through a per-slice pass. `implement-full.md` runs that per-slice pass for
`behavior` slices only. A `mechanical` or `docs` slice on a full-tier scope gets no over-engineering pass
anywhere, and a wide refactor, the change shape most prone to speculative abstraction, is usually
`mechanical` (triage #402).

## Decision

The scope review skips `simplicity-reviewer` on a full-tier scope only when every slice row in the ledger
reads `behavior`. A scope with a `mechanical` or `docs` slice, or a row whose type cannot be read, takes
the skip rules a lite scope takes. The decision is the same on the entry review and on every re-review.
The pass's findings stay advisory and go through the review's existing fix loop.

## Considered options

- **A per-slice pass for `mechanical` and `docs` slices.** Rejected: one dispatch per slice, and a new
  fix path in `implement-full.md` for slices that have no per-slice review loop.
- **Accept the gap and correct ADR 0037's premise.** Rejected: it leaves the change shape most prone to
  over-engineering with no pass.

## Consequences

A full-tier scope holding a non-`behavior` slice costs one more `sonnet` dispatch at the scope review, and
the pass re-reads the `behavior` slices that already had one. INV-0055 states the narrowed rule.
