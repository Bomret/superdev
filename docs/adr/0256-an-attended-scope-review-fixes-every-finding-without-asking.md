# 0256: An attended scope review fixes every finding without asking

**Status:** Accepted

**Amends:** [ADR 0098](0098-the-fix-loop-fixes-every-finding-and-only-correctness-holds-the-stage.md), whose
attended ask on every verdict is withdrawn. [ADR 0095](0095-an-operator-can-accept-an-unmet-criterion.md)'s accept
path stays, asked per broken criterion.

## Context

ADR 0098 made the scope review ask before its fix loop: fix every finding, fix the Critical and Important findings
only, or fix none. Between 2026-11-16 and 2026-11-18, across superdev 0.107 and 0.108 runs in four repositories,
the question was asked 29 times. The operator picked the recommended option all 29 times. Single waits on it reached
41 and 65 minutes while the operator was away, and the run did nothing until the answer came.

## Decision

An attended scope review fixes every finding it lists without asking: Critical, Important, and Minor findings,
warranted simplicity cuts, and red evidence. `--unattended` already did this. For each broken Definition-of-Done
criterion, the attended review asks one question before its first fix dispatch: fix it, or accept it as unmet with
the operator's own reason. Accepting it writes an `accepted:` note and takes the criterion out of the fix list.
`--unattended` never offers to accept a criterion. The early escape for unclosable or deferred findings, the
3-cycle cap, and the ad-hoc review's inline-fix yes (ADR 0228) stay as they were.

## Considered options

- *Keep the whole question when a criterion is broken.* Rejected: the other options went unused, and the only
  answer that needs the operator is the reason for accepting a criterion.
- *Keep the ask and let a timeout pick the recommended option.* Rejected: a wait still holds the run, and a
  timed default is the same decision with a delay.

## Consequences

A Minor-only verdict always runs a fix cycle, which is a warm cycle (ADR 0174). An operator who does not want a
finding fixed stops the run. Nothing records a declined finding, because no review declines one.
