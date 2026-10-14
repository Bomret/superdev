# 0091: The Definition of Done is ticked while the run works

**Status:** Accepted

**Amends:** [ADR 0025](0025-the-scope-review-owns-the-full-suite-run.md),
[ADR 0077](0077-invariants-live-in-one-central-register.md).

**Context.** A scope's Definition of Done read 0/N on its anchor through all of `/superdev:implement` and
`/superdev:review`, then filled at once in `/superdev:ship` §4. The operator watching a run could not see
which criteria it had reached, and ship found an unmet criterion only after the review gate had already
passed. Across 26 superdev scopes (251 criteria), 65% of criteria were delivered by one slice, 8% by
several, and about 25% were scope-level: `Reachable:`, unchanged-behaviour, sweep, and preservation
claims. A tick at slice merge alone would have been wrong in `no-verdict-gates`, where a slice's own
acceptance claimed coverage it did not have, and preservation claims hold at one merge and break at a
later one. In `proxmox-homelab`, two anchors closed with seven criteria at the verification ceiling never
ticked.

**Decision.** A criterion is ticked by a controller, from an implementer's report, while the run works,
and every later step can take a tick back:

- `/superdev:plan` tags every epic criterion with the slice ids that deliver it, or `scope`. The tag
  decides which criteria a slice's report *can* tick; the report decides whether they *do*.
- An implementer reports each criterion mapped to its slice as met with evidence, not met with a reason,
  or verifiable only after a deploy with any partial evidence (ADR 0092). The controller ticks a mapped
  criterion reported met, on the anchor and in `dod.md`, with the evidence as its note. A claim on an
  unmapped criterion is noted and waits. The lite tier's controller reports to itself and ticks the same
  way. Every judged line carries a note (INV-0014), and only a controller writes one (INV-0015).
- Implement's run handoff runs every scope's full suite once and records the result with the commit it
  ran on. A red result is fixed there, in handoff's own fix loop, before review. The controller then
  settles every `scope` criterion and re-checks the earlier ticks.
- Every scope passes `/superdev:review`, all-`mechanical`/`docs` scopes included. The final reviewer
  judges every criterion, ticked or not, and the review's controller unticks a broken one and repairs it
  in the fix loop, re-ticking only from the fix implementer's report after a clean re-review. A `holds`
  verdict on a criterion that stands unmet ticks it straight from that verdict, with its own evidence as
  the note — a joint criterion a slice under-reported, or an implementer that misjudged its own work, both
  close this way without a fix cycle. The stage never advances past review while a criterion stands
  unmet, except one at the verification ceiling (INV-0016). Review never adds a criterion: a missing one
  is a deferred finding (ADR 0035, INV-0004).
- Slice implementers and fix cycles run only the focused command. The full suite runs at handoff and
  after review's clean re-review, and a recorded green on the same commit, or on an earlier commit that
  differs only in the store's own plan files, is reused (INV-0017).
- `/superdev:document` re-checks the ticked criteria its own changes could touch and unticks a broken
  one with a note.
- `/superdev:ship` ticks nothing. It copies the criteria left unticked at the verification ceiling into
  the pull-request body as a post-merge checklist.
- The tick on the anchor's own checklist is independent of the run-state snapshot: every store ticks it,
  a snapshot-less one included.

This supersedes ADR 0025's skip of the whole-scope review for an all-`mechanical`/`docs` scope, and its
stand-in suite run at run handoff. It amends ADR 0013 (ship is no longer the tick's home), ADR 0042 (the
anchor tick moves off ship and off the snapshot), ADR 0075 (review's entry run is reused from the handoff
record when the commit matches), ADR 0084 (ship's suite-criterion logic goes: no step ticks from a
stage any more), and ADR 0077 (a held register match no longer becomes a Definition-of-Done criterion
under its own id: the id routes into the touching slice's `spec` and `acceptance` instead, the epic's own
criterion states the behaviour the entry protects, and `final-reviewer` judges an entry covered by
either half of that routing).

**Considered options.**

- *Tick slice `acceptance` and shrink the DoD to scope-level criteria.* The epic would lose its one-page
  statement of what the feature is.
- *Rename the layers: acceptance criteria on the epic, a DoD per slice.* Conflicts with the Scrum Guide's
  meaning of DoD and with the rule that a criterion states behaviour, not a procedure; churns 39 files for
  no change in behaviour.
- *Keep verifying the DoD at ship.* Too late: the chain has already passed its gate.
- *The mapping as a hint, the report decides alone.* The mapping would carry no weight.
- *The mapping alone, ticking every mapped criterion on merge.* The over-claim `no-verdict-gates` showed.
- *Review hands a broken tick back to implement.* Needs a stage rollback, which `scope.js` refuses; so
  does running the full implement playbook per fix cycle.
- *A full-suite run in every fix cycle.* On a server project this costs minutes per cycle, where one run
  after the clean verdict catches the same failures at most one cycle later. Handoff's own fix loop takes
  the same shape as review's.
- *A lighter review mode, or a cheaper model, for `mechanical`/`docs` scopes.* A second review shape for
  little saving; lite runs have shipped defects a review would have caught.
- *Review may amend the DoD with a criterion it finds missing.* Pools a criterion only review verified
  with criteria the whole run verified, against INV-0004.
- *Ship verifies the ticks and blocks on a broken one.* Puts a verification step back into ship, the step
  this decision moves out of it.
- *Snapshot-less stores tick `dod.md` only.* The tick is one checkbox edit the store already permits for
  status or content; tying it to the snapshot's merge markers hid progress on exactly the stores where the
  operator cannot read the local file.
