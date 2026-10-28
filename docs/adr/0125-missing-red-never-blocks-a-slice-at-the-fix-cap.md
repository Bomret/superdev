# 0125: Missing RED never blocks a slice at the fix cap

**Status:** Accepted

**Amends:** [ADR 0098](0098-the-fix-loop-fixes-every-finding-and-only-correctness-holds-the-stage.md),
[ADR 0117](0117-the-run-trace-is-hook-written-evidence.md).

**Amended by:** [ADR 0182](0182-the-implementer-proves-its-change-and-the-controller-runs-only-suite-gates.md), which removes Missing RED, so the escape path keeps
Pass-to-pass and Missing fail-to-pass run.

**Amended by:** [ADR 0193](0193-an-unclosable-pass-to-pass-finding-takes-the-escape-at-once.md), under which an unclosable
Pass-to-pass finding takes the escape at once, before the cap.

**Context.** ADR 0117 makes Missing RED an Important finding, and ADR 0098 blocks a slice whose
Important finding survives the 3-cycle fix cap. In a consumer run audited on 2026-10-07, two slices
reached the cap with Missing RED as their only remaining finding, after their code had passed review.
Both needed an operator override to merge. In another run, a controller deleted component sources
itself to produce a failing run.

**Decision.** Missing RED stays an Important finding, and its fix keeps the revert, failing run,
restore, and passing run that close it. At the cap, a slice whose only remaining finding is Missing RED
merges, and the review's report names the finding, the same treatment leftover Minor findings get. The
rule holds on both tiers. Only the implementer records a failing run; the controller never edits a
slice's tree to produce one.

**Considered options**

- **Evidence with no known outcome is no finding.** It saves every cycle spent on evidence gaps. It
  loses because an implementer could then avoid the finding by running tests outside `scope.js test`.

**Consequences.** Missing RED still costs a fix cycle when it is real, and no longer stops a slice whose
behaviour is correct. A slice can merge without a recorded TDD order. The report is then the only place
that says so.
