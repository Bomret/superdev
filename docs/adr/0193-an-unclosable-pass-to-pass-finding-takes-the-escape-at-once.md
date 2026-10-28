# 0193: An unclosable Pass-to-pass finding takes the escape at once

**Status:** Accepted

**Amended by:** [ADR 0196](0196-a-behaviour-preserving-change-is-a-third-unclosable-case.md).

**Amends:** [ADR 0125](0125-missing-red-never-blocks-a-slice-at-the-fix-cap.md),
[ADR 0134](0134-a-fail-to-pass-run-shows-a-change-s-tests-discriminate.md),
[ADR 0174](0174-minor-only-verdicts-batch-their-fixes-and-continue-warm.md).

**Context.** ADR 0125 lets a slice or scope whose only remaining Critical or Important findings are
Pass-to-pass or Missing fail-to-pass run proceed, but only at the 3-cycle fix cap. Some Pass-to-pass
findings no fix can close. In the review of scope `fix/linear-time-pin-remeasure` (triage #1416,
2026-10-28), the slice's whole behaviour change lived in `tests/linear-time.js`, a test-path file, so the
fail-to-pass run could put back only Markdown files and always read `pass-to-pass`. The controller had to
run fix cycles that changed nothing, only to reach the cap. A fix cycle with nothing to fix is never
necessary.

**Decision.**

- **A Pass-to-pass finding is unclosable in exactly two cases.** (a) The range's behaviour change lies
  wholly in test-path files, so the put-back carries none of it. (b) A test pins existing behaviour on
  purpose, so it passes before the change by design. The list is closed.
- **The reviewer that raises the finding marks it**, naming the case and its reason, and re-judges the
  mark at every dispatch. The finding stays Important. An implementer's claim of a case is input the
  reviewer checks, never a verdict it adopts.
- **An unclosable finding never enters a fix list or review's ask-once.** It takes ADR 0125's escape at
  once, attended and unattended, on every loop: `/superdev:review`'s fix loop, the full tier's per-slice
  loop and Minor sweep, and the lite tier. No fix cycle runs when no other finding is left to fix.
- **A re-review that reads only the latest cycle's range restates each unclosable finding.** A list of
  Minors beside an unclosable finding is a warm cycle (ADR 0174), and the Minor sweep's later re-reviews read
  only the newest commits. The continued `final-reviewer`, and the sweep's fresh `slice-reviewer` handed the
  findings, restate each one with its mark re-judged, so the combined verdict and the report still name it.
- **A Missing fail-to-pass run finding takes no early escape.** It closes on any outcome line, so one
  cycle that runs the verb always closes it.

**Considered options**

- **A mechanical test in the fail-to-pass verb** that reads a put-back of non-code files as unclosable.
  It loses because a put-back Markdown file can change a test's result in a repository whose tests read
  its prose, as this one's drift checks do.
- **An unclosable finding is no finding**, only a report note. It saves the combined-verdict wiring. It
  loses because it drops the Important severity from the `Ready to merge?` line, close to the option
  ADR 0125 rejected.
- **An open list of cases, each with a stated reason.** It catches cases not yet seen. It loses because a
  reviewer could then wave off any weak test as unclosable.

**Consequences.** A slice or scope no longer spends fix cycles on a finding it cannot close. The report
is the only place that names such a finding. A third unclosable shape, such as a behaviour-preserving
cut cycle (triage #1042), stays on the cap path until a later plan adds it to the list.
