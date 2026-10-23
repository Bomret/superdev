# 0174: Minor-only verdicts batch their fixes and continue warm

**Status:** Accepted

**Amends:** [ADR 0098](0098-the-fix-loop-fixes-every-finding-and-only-correctness-holds-the-stage.md),
[ADR 0137](0137-a-slice-re-review-reads-its-fix-cycle-s-changes.md).

**Context.** ADR 0098 made both fix loops fix every finding, Minors included, and repeat until the review
lists none. Transcripts of runs in this repository, open-armada, and open-settlers, read on 2026-10-23,
show the cost. Fix cycles take 43% of implement's subagent time and 81% to 85% of scope review's. A
re-review almost always finds a new Minor: open-armada's slice re-reviews returned 26 Minor-only verdicts,
10 blocking, and 1 clean; this repository's scope re-reviews returned 102 Minor-only, 46 blocking, and
14 clean. A loop that runs until the review is clean therefore runs to the cap. In one open-armada run,
12 of 16 slices reached cycle 3, and cycles 2 and 3 were fixes of one to two minutes, each a fresh
implementer dispatch and a fresh re-review, serial on the slice's critical path. The scope review's
re-review reads the whole scope range every time (ADR 0137, INV-0143), and each whole read finds Minors
the last one did not, the effect ADR 0170 already answered for Prompt-concept overlap findings. Dropping
Minors is no remedy: before ADR 0098, Minors accumulated across runs.

**Decision.** Every Minor is still fixed and reviewed inside the run, unless it remains at the sweep's cap or
is deferred like any other finding. What changes is when, and by which dispatch.

- **The Minor queue.** On the full tier, a slice review whose remaining findings are only Minor, warranted
  simplicity cuts included, merges the slice with no further per-slice fix cycle. Its Minors go to the
  run's Minor queue, a ledger record the controller writes through `scope.js`. A review that leaves any
  Critical or Important finding runs the per-slice loop as before, fixing its Minors in the same cycles.
- **The Minor sweep.** Once every slice is merged, and before run handoff's full-suite run, a non-empty
  queue gets one sweep. The controller collects each queued slice's open Minors into the run's sweep log,
  and the sweep's dispatches name that log and no slice's progress log, so the run trace files them under
  `scope`. One implementer fix carries every collected Minor, judged by a slice review over the sweep's
  range. The sweep runs under slice rules: it fixes every finding, Minors it introduced included,
  and stops at 3 cycles. Minors left at its cap are named in the report (INV-0094); a Critical or
  Important finding left at its cap blocks the run. An attended `/superdev:implement` run reopens a blocked
  sweep: the sweep log records the reopen's base, and the sweep starts cycle 1 again from the scope branch's tip.
- **Warm cycles.** In scope review and in the sweep, a fix cycle whose fix list holds only Minor findings
  continues the loop's previous fix implementer through SendMessage, with its context intact. In scope
  review it also continues the final-reviewer whose verdict it fixes, the entry review's on cycle 1, where only
  the implementer dispatches fresh. The sweep's re-review stays a fresh
  slice-reviewer, which keeps its blind pass before it reads the logs (INV-0113, INV-0114). With no earlier
  implementer, a model the rule would change, or a resume that fails, the cycle dispatches fresh. Each run
  of a resumed final-reviewer gets its own `final-verdict` line (INV-0146), with the open review step and the
  cycle judged at the run's own `dispatch-resume` line.
- **The scope re-review after a Minor-only cycle reads that cycle's range.** It closes or keeps each
  listed Minor, reports any defect the cycle's commits introduced, and judges the criteria the cycle's
  changes touch; every other criterion keeps its last whole-range verdict. The verdict it follows already
  read the whole scope range and found nothing blocking. A cycle with any other finding keeps the whole-range
  re-review (INV-0143).

**Considered options**

- **A Minor-only verdict ends the loop, and leftover Minors are reported.** It is the cheapest. It loses
  because it is the state ADR 0098 replaced, and Minors accumulated across runs.
- **Minors start the first fix cycle only.** ADR 0098 rejected it, because the Minors a fix introduces
  are the likeliest to cause follow-up work. The sweep keeps fixing those.
- **The queue joins scope review's first fix list.** It saves one implementer and one reviewer dispatch
  per run. It loses because the scope reviewer then judges the closure of findings another reviewer's lens
  raised, and implement no longer hands review a branch with its slice findings settled.
- **The queue lives only in the progress logs.** It needs no new verb and no ledger change. It loses
  because a resumed run would re-derive the queue from prose, and `/superdev:status` could not show it.
- **The sweep's re-reviewer resumes warm too.** It saves a cold start per sweep cycle. It loses because a
  resumed slice-reviewer has already read the progress logs, so its blind pass is gone, and the sweep runs
  at most 3 cycles per run.
- **Warm cycles keep the whole-range scope re-review.** It leaves INV-0143 unchanged. It loses because a
  whole read keeps finding new Minors, so the loop still runs to the cap.

**Consequences.** A slice with only Minor findings no longer waits on its own fix cycles, so slices that
depend on it start earlier, and the run pays one sweep instead of up to three cycles per slice. A slice
reaches the scope branch with known Minors until the sweep runs, and a run that stops before the sweep
keeps them in the ledger. A warm cycle's reviewer holds its earlier verdict in context; INV-0114 still
keeps every implementer report out of it. The ledger gains a section, so superdev-view's ledger parser
changes with it, and a ledger an earlier release wrote reads as an empty queue.

**Platform claim.** A SendMessage to a finished subagent resumes it with its context intact, and
run-trace records the resume as a `dispatch-resume` line. Verified 2026-10-23, on Claude Code 2.1.302:
the Agent tool's own result names SendMessage as the way to continue an agent, and
`tests/run-trace-dispatch.test.js` pins the `dispatch-resume` line.
