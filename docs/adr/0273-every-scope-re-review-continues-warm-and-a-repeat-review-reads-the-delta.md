# 0273: Every scope re-review continues warm, and a repeat review reads the delta

**Status:** Accepted

**Amends:** [ADR 0174](0174-minor-only-verdicts-batch-their-fixes-and-continue-warm.md), whose warm scope re-review
after a Minor-only cycle becomes the re-review after every fix cycle, its implementer-side warm cycle and the Minor
sweep unchanged; [ADR 0137](0137-a-slice-re-review-reads-its-fix-cycle-s-changes.md), whose scope `final-reviewer`
no longer reads the whole range on every re-review; and
[ADR 0173](0173-the-scope-review-brings-the-base-in-at-entry.md) and
[ADR 0221](0221-the-scope-review-re-checks-the-base-and-the-anchor-before-it-advances-the-stage.md), whose
conflict-resolving merge takes a re-review of its resolution plus its reach instead of the whole range.

## Context

A scope review's wall clock is mostly model time. Measured from this repository's run traces and transcripts
(2026-11-16 to 2026-11-21): the entry `final-reviewer` takes a median 351 s, a fresh whole-range re-review after a
Critical or Important cycle a median ~163 s, and a warm re-review after a Minor-only cycle a median 36 s. A
`/superdev:review` that comes back after ship, red CI, a base merge, or a renumber re-reviews the whole range again,
7-11 min each. In 22 fresh re-reviews over 23 loops, the second whole read found 13 defects in pre-existing scope code
the entry review missed (2 Important), about 7 of them outside any read of the cycle's range; 5 of the 6 defects a
cycle caused outside its own range sat in code that range reaches.

## Decision

- **Every fix cycle's re-review continues the `final-reviewer` whose verdict it fixes**, whatever the fix list's
  severity mix. Its subject is the cycle's range plus its **Reach**, and it re-judges every Definition-of-Done
  criterion they touch; every other criterion keeps its recorded verdict. A fresh whole-range reviewer runs only when
  the resume fails, is denied, or ends other than `completed`. A conflict-resolving base merge is reviewed the same
  way, its `git show --remerge-diff` as the changed range, or the whole scope range on a git older than 2.36, which
  cannot show a remerge-diff.
- **A clean scope review records its tip.** The clean exit of a review that leaves no finding standing except
  deferred ones, the stage line written or left alone, records the **Reviewed tip**: the scope tip and a digest of `dod.md`'s criterion texts and tags. The
  final verdict counts whether it was warm or fresh. An exit that makes the standing-defect writes clears the record.
- **A repeat invocation reads the delta.** A `/superdev:review` whose reviewed tip is an ancestor of HEAD, with the
  criteria digest unchanged and git able to show a merge's remerge-diff, runs a **Delta review**: the first-parent
  commits from the tip, each base merge as its conflict resolution, the reach of the base's own changes inside the
  files the scope changes, and the reach of the delta. Any other state reads the whole range.

The loop trades second reads for speed knowingly: a defect in pre-existing scope code only a fresh second read would
find is left to later stages (a later review, ship, the pull request). The operator accepted this on 2026-11-21.

## Considered options

- **Split the entry `final-reviewer` into parallel lens passes (criteria / code issues).** A replay of one entry
  review (2026-11-21, opus) took 206 s and 326 s for the halves against 285 s for the single pass, at twice the
  tokens: the slowest half sets the wall clock.
- **A plus a parallel fresh whole-range read beside the next cycle's implementer.** Replayed over 27 loops: 340 min
  against A's 323 min, and 56.0M re-review tokens against A's 22.8M. Of A's 7 missed second-read finds it surfaces 5
  and fixes 2; 3 land at the cap, one an Important that blocks a run today's loop ended clean.
- **Keep the whole-range re-review after a Critical or Important cycle** (INV-0143 as it stood). It keeps the ~7
  second-read finds in 5 days and costs ~127 s per such cycle.
- **Record the tip on every stage-write route and hand the leftovers to the delta reviewer.** It lets more repeat
  invocations take the delta. It loses because it needs a new ledger record of standing findings.
- **Detect a compaction inside a resumed reviewer and dispatch fresh.** The 3-cycle cap bounds resumes per reviewer,
  and every invocation starts its own reviewer, so compaction stays an accepted risk.
- **A cheaper model or lower effort for `final-reviewer`.** ADR 0118's replays showed `opus` catching findings
  `sonnet` missed, and this is the gate.

## Consequences

The ledger gains a `**Reviewed:**` header, and a ledger an earlier release wrote carries none, so its next review
reads the whole range. A re-review's context holds the entry read plus every cycle's reads; nothing detects a
compaction. A reviewer that judges the fix to its own Critical finding holds its earlier verdict in context, which
makes it less adversarial than a fresh reader. A defect only a fresh second read finds now reaches ship or the pull request instead of the review loop.
