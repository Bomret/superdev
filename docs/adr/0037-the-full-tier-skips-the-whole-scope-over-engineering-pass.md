# 0037: The full tier skips the whole-scope over-engineering pass

**Status:** Accepted

**Amended by:** [ADR 0118](0118-review-and-fix-model-tiers-follow-measured-evidence.md),
which moves `simplicity-reviewer` from `haiku` to `sonnet`.

**Amended by:** [ADR 0138](0138-the-per-slice-simplicity-pass-runs-beside-the-first-slice-review.md),
which runs the per-slice pass beside the slice's first review.

## Context

`superdev:simplicity-reviewer` is dispatched from two places. `references/implement-full.md` dispatches it
per slice, alongside the `slice-reviewer`, and the controller applies the cuts it warrants before the
slice merges. `commands/review.md`'s §2 dispatches it again over the whole scope range, in parallel with
`final-reviewer`.

On a `full`-tier run those two dispatches read the same lines. Every slice on the scope branch has already
been through a per-slice over-engineering pass whose findings were applied, so the whole-scope pass
re-reads cut-down code looking for cuts. Its one unique contribution is duplication that only the
integrated view reveals — the same logic re-implemented in two slices, an abstraction each slice
half-builds — and `agents/final-reviewer.md`'s **Brevity (whole-scope)** axis is already carved for exactly
that, explicitly deferring per-slice over-engineering to `simplicity-reviewer` and keeping only what spans
slices.

The `lite` tier is the opposite case. It dispatches nobody and holds no per-slice review at all, so the
whole-scope pass is the only over-engineering pass the run ever gets.

## Decision

**On a `full`-tier scope, `/superdev:review` skips `simplicity-reviewer`. On a `lite`-tier scope it
dispatches it.**

The tier is derived, not stored: the ledger's slice-table row count, under the same rule
`commands/implement.md` applies — three or fewer is `lite`, more than three is `full`. Both commands
derive it from the same loaded slice set, so they cannot disagree about which tier a run is.

The skip is unconditional within the tier. A review fix cycle can land commits that no per-slice pass ever
saw, and those commits get no over-engineering pass under this decision. That is accepted rather than
patched with a second condition: an over-engineering finding is advisory and gates nothing, so the pass
being dropped could not have blocked the fix anyway, the fix implementer already carries the minimalism
ladder, and `final-reviewer` still reviews the fix on all five of its axes.

A drift row pins the skip to `references/implement-full.md`'s per-slice dispatch. The skip is only safe
while that dispatch exists; if it were ever removed, a `full`-tier run would have no over-engineering pass
anywhere, and the drift row is what makes that a red suite instead of a silent hole.

## Considered options

- **Skip on the first pass, dispatch on a re-review that landed commits.** Scope the re-review dispatch to
  the fix commits, so no code goes unreviewed. It costs a second condition in the skip rule and asks
  `review.md` to track whether a fix cycle committed — state it already keeps, for the stage write and the
  inline-doc-pass record, so the cost is small. It loses because the coverage it buys is coverage that
  gates nothing: the findings are advisory by construction, and a rule with one condition is one a reader
  applies correctly.
- **Keep dispatching it on both tiers.** Costs nothing to decide and leaves the belt-and-braces pass in
  place. It loses on what the second pass actually reads: cut-down code, for cuts, with its unique lens
  already assigned to another reviewer.

## Consequences

A `full`-tier review dispatches one reviewer instead of two, so its report carries no
`### Over-engineering cuts` section and its `Simplicity:` line reads as not dispatched. The wall-clock
saving is modest — `simplicity-reviewer` runs on `haiku`, in parallel with an `opus` reviewer that gates
the report either way — so this is a redundancy removed rather than a latency fix.

Over-engineering coverage on a `full` run now lives entirely in the per-slice dispatch and
`final-reviewer`'s Brevity axis. That makes `implement-full.md`'s per-slice dispatch load-bearing for a
guarantee stated in a different file, which is why the drift row exists.

`references/review-checklist.md` and `agents/simplicity-reviewer.md` are unchanged: the reviewer's own
body already covers both dispatch shapes, and the `lite` tier still uses it whole-scope.
