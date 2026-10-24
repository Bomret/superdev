# 0075: the scope review gates on a full suite entering and leaving its fix loop

**Status:** Accepted

**Amends:** [ADR 0025](0025-the-scope-review-owns-the-full-suite-run.md).

**Amended by:** [ADR 0105](0105-an-affected-full-command-and-a-whole-repo-gate-before-the-pull-request.md),
which runs the whole-repo command in place of the full one, entering and leaving the fix loop, while the
suite record reads red of kind `whole`.

**Amended by:** [ADR 0179](0179-an-ad-hoc-review-hands-its-reviewer-a-focused-run.md), under which
`final-reviewer` runs no test on an ad-hoc range either, and the review skill hands it a focused run.

## Context

ADR 0025 gave `/superdev:review` in scope mode the chain's one full-suite run, taken before the
`final-reviewer` dispatch so that a denied dispatch is a degraded review rather than a lost verification.
Its fix loop then re-ran that full suite after **any** fix cycle touching a red result.

The re-run was not loose wording. `final-reviewer` reviews a live scope against the result the controller
hands it and runs no suite of its own, so every re-review in the loop needs *a* result handed to it, and the
only result the review knew how to produce was the full one. A three-cycle review therefore paid four full
suites, and on the ten-minute suite this decision's parent was written for, three of those four proved a
tree the cycle before had already proved.

## Decision

**The review runs the full suite on entry and on the fix loop's exit, and the focused command inside each
cycle.** The entry run is unchanged from ADR 0025, including its degraded-pass handling. Each fix cycle runs
the focused command over the fix diff and hands that result to the re-review, labeled as focused. When a
verdict first comes back clean, one full suite confirms it, and that run is the gate the stage advances on.

**A red exit run is a Critical finding that re-enters the fix loop and counts toward the 3-strike cap.** It
has the shape the cap already describes — a cycle exposing a defect elsewhere — so the loop stays bounded
with no new mechanism and no new run-state field. The worst case is one full suite per strike plus the entry
run; the ordinary two-cycle review pays two instead of three.

**`final-reviewer` reviews against whichever result it is handed**, full or focused, and still runs no suite
of its own on a live scope. Its ad-hoc branch is untouched: a range with no controller-run suite behind it is
the one place its own re-run is the only verification there is.

## Considered options

- **Keep the entry run and add no exit run.** One full suite per scope, which is ADR 0025's invariant
  exactly. It loses because a fix that breaks a test outside its own diff would reach the pull request
  unseen, and the review is the chain's only whole-suite gate.
- **Keep the per-cycle full run, gated on the fix diff's size.** A one-file fix gets a focused run, a wide
  one gets the full suite. It loses on a threshold nobody can calibrate, and triage record #462 already
  records that superdev has no size-guard mechanism for a diff.

## Consequences

The invariant ADR 0025 stated as "one full-suite run per scope, at the review" becomes **one command owning
the scope's full-suite runs, one entering its fix loop and one leaving it**. The count moves; the ownership
does not. A scope review that finds nothing still runs exactly one full suite, because a clean entry verdict
is the loop's exit.

An all-`mechanical`/`docs` scope is unaffected. It skips the whole-scope review by design, and its run
handoff still attempts that scope's one full-suite run in place of the review.

Both halves of the new shape need pinning in `scripts/drift/contracts.js`, on the `skills/review/SKILL.md`
body and on the dispatch prose reaching `final-reviewer`. `FULL_SUITE_CONTRACTS` is where the one-sided pin
this repository's prompt-architecture rules warn about has already leaked to production once, and a shape
with two runs offers two more clauses to lose one-sidedly.

ADR 0025 keeps its decision and its `Accepted` status. This record narrows its run-count clause alone.
