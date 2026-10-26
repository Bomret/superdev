# 0192: The full suite runs once, after review comes back clean

**Status:** Accepted

**Supersedes:** [ADR 0152](0152-a-red-base-gate-lets-the-operator-name-the-slices-that-fix-it.md), whose
red-record pick has no gate left to answer.

**Amends:** [ADR 0025](0025-the-scope-review-owns-the-full-suite-run.md),
[ADR 0075](0075-the-scope-review-gates-on-a-full-suite-entering-and-leaving.md),
[ADR 0091](0091-the-definition-of-done-is-ticked-while-the-run-works.md),
[ADR 0120](0120-implement-brings-the-remote-base-into-the-scope-branch-before-the-first-slice.md),
[ADR 0173](0173-the-scope-review-brings-the-base-in-at-entry.md),
[ADR 0155](0155-a-slice-merge-runs-no-test-suite.md),
[ADR 0175](0175-a-green-suite-record-carries-across-a-delta-a-complete-focused-selector-covered.md),
[ADR 0177](0177-an-implementer-runs-only-the-tests-that-verify-its-work.md),
[ADR 0180](0180-a-loop-step-runs-its-test-file-where-the-focused-command-repeats-the-full-one.md),
[ADR 0182](0182-the-implementer-proves-its-change-and-the-controller-runs-only-suite-gates.md).

**Context.** A scope paid the full suite at implement's base step before the first slice, at run handoff
after every slice merged, at the scope review's entry when the record did not cover the tip, and at the
review's exit after its fix cycles. In 34 of 35 scopes that reached review across four repositories
(superdev, open-armada, open-settlers, proxmox-homelab, run traces read 2026-10-26), the review
dispatched fix cycles, so its exit run replaced run handoff's run almost every time. Plan writes no suite
record, so the base step's run also ran on every fresh scope.

**Decision.**

- **Implement runs no full or whole-repo suite.** The base step keeps its fetch, merge, collision,
  conflict, and degraded-fetch rules and drops its gate, the red-record pick, the unattended block on a
  non-green record, and the stop on `denied` or `none`. Run handoff keeps its handoff pass and drops its
  full-suite gate and its red-suite fix loop.
- **The scope review runs the focused command at entry.** It covers the paths the scope's range changes,
  as an ad-hoc review does (ADR 0179), and `final-reviewer` reads it as the suite result. A failing
  focused run is a Critical finding in the fix loop. It writes no suite record. Where the path set is empty,
  or the focused command repeats the full one, the entry runs no test and says why, so a scope never pays the
  full suite twice.
- **The scope review's exit run is the scope's one full run.** It runs once the verdict first comes back
  clean or the cap leaves only Minor findings, including after a clean first verdict, and verifies the
  slices, implement's base merge, and the review's own base merge together. A record the gate already
  accepts at the tip, the carry, and the recorded rerun still apply. A red result is a Critical finding
  counted toward the 3-cycle cap. A run that never finished carries no verdict (INV-0009): the stage does
  not advance, and the next invocation runs it again.
- **An inherited failure is named, not fixed, at both tiers.** The implementer, the slice reviewer, and
  the lite controller name a failing test their slice did not cause, and the scope review's fix loop
  repairs it (INV-0157).
- **Ship's moved-base gate, submit-pr's whole-repo run, and the ad-hoc review are unchanged.**

**Consequences.** A scope pays one full-suite run where it paid two or three. A red between slices or from
the base surfaces at the review's entry focused run, or, where the focused command misses it, after a clean
verdict, and then costs one more fix cycle and re-review. An unattended implement run builds every slice on
a red base and hands the red to review, where it blocked before the first slice. `final-reviewer` judges
the scope against a focused run, not a full one.

**Considered options.**

- *Keep run handoff's gate and drop only the base step's.* Rejected: it saves the pre-slice run, but the
  review's exit run replaces run handoff's run in nearly every scope, so most scopes still pay two.
- *Run no test at the review's entry.* Rejected: a red between slices then always surfaces after a clean
  verdict, and the focused run costs less than a full one.
- *Stop merging the base in implement.* Rejected: slices then build on a stale base and conflicts surface at
  review, which ADR 0120 exists to prevent.
