# 0206: The anchor receives ticks from the review on

**Status:** Accepted

**Amends:** [ADR 0091](0091-the-definition-of-done-is-ticked-while-the-run-works.md),
[ADR 0202](0202-run-state-lives-on-a-git-ref.md).

## Context

Under ADR 0091, every tick a controller writes lands in `dod.md` and on the scope anchor. In implement,
that is one anchor read and one body edit per ticked line after every slice merge, plus the same again in
run handoff's pass. The scope review's `final-reviewer` then judges every line again, so the anchor's
checklist shows ticks that the review can still take back. The operator wants fewer slice-store calls
during implement.

## Decision

Implement's per-slice ticks, on both tiers, and run handoff's pass write `<run-root>/dod.md` alone. They
are the only writers that skip the anchor. The scope review opens its Definition-of-Done step with the
**anchor sync**: it reads the anchor's checklist and rewrites each paired line whose verdict differs from
`dod.md`, through the store's `## Definition of Done ticks` section. A line's verdict is its note's
verdict, not the box alone. Every other tick and untick, in review, in the doc pass, and in verify-ship,
writes `dod.md` and the anchor as before. Verify-ship's sync before it observes is the same operation.

Two writes rebuild `dod.md` from the anchor: run init's **Write the DoD** on every implement entry, and
adopt. The anchor no longer holds implement's ticks, so both go through one **per-line merge**. The
anchor's text decides the criteria and their order. A line the anchor leaves without a note takes the
verdict another copy carries on the line it pairs with, when exactly one line pairs and it carries a note.
A noted anchor line wins.

- **Write the DoD** pipes the anchor's text to `scope.js dod-merge`, which merges it with an existing
  `dod.md`, so a resume on the same machine keeps implement's ticks.
- **The run-state ref** (ADR 0202) carries `dod.md` beside `trace.log`, `reports/`, and `interfaces.md`,
  and adopt's unpack merges the ref's copy into the one written from the anchor, so a resume on another
  machine keeps them too.
- **A `stage set` that closes the standing step sends the ref**, as `step clear` and `step block` do.
  Implement ends with `stage set merged` and review with a stage write, so without this the ref would
  carry the copy from plan time. `stage set closed` sends nothing: `/superdev:wrap-up` deletes the ref before that write.

## Considered options

- **Stop ticking in implement and run handoff altogether.** Review would become the first judge of every
  line. It drops the implementer's per-criterion report, the mapping gate, and the handoff pass's
  settling of `scope` lines, which are the inputs the review's re-tick and the stage gate read.
- **Keep the anchor write and batch it per slice.** It still writes the anchor before the review, which can
  take a tick back.
- **Accept the loss on adopt and record it.** A run resumed on another machine before review would lose
  every implement tick, and its `ceiling:` notes, which feed the pull request's post-merge checklist.
- **The ref's `dod.md` always wins on adopt.** The ref is as old as its last send. After review, or after
  `/superdev:plan` appended criteria, the anchor is newer, and a stale ref copy would overwrite review's
  verdicts and drop the appended lines.
- **Keep an existing `dod.md` as it is on resume.** Criteria appended to the epic since would never reach
  it.

## Consequences

Implement and run handoff make no slice-store call for a tick. The anchor sync costs one store tick call,
a read and an edit, per line that differs, so the saving is the calls review would have repeated anyway.

From plan to review, the anchor's checklist lacks implement's ticks. An operator who wants the run's
progress during implement reads `<run-root>/dod.md`. This gives back part of what ADR 0091 rejected
under *Snapshot-less stores tick `dod.md` only*: on any store, the slice store shows no implement ticks
until the review. A review that cannot reach the store leaves the anchor behind `dod.md`; verify-ship's
sync and wrap-up's disagreement check catch it.

A send that failed leaves the ref's `dod.md` older than the local copy. The merge takes its verdicts only
where the anchor has none, so a stale ref costs at most implement ticks that a review re-earns. A stage
write that closes a step now also sends the trace and reports, so the ref carries them at the end of
implement and of review as well.
