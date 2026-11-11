# 0214: Only ship asks a started session for consent

**Status:** Accepted

**Amends:** [ADR 0176](0176-the-offer-recommends-a-new-session.md) point 5, and
[ADR 0201](0201-the-offer-puts-up-the-card-first.md) point 5.

**Amended by:** [ADR 0225](0225-ship-runs-a-card-start-without-a-question.md), which limits point 1's ask
to a brief start.

## Context

Under ADR 0176 and ADR 0201, `/superdev:ship`, `/superdev:verify-ship`, and `/superdev:wrap-up` each ask the
operator one yes when an offer's new-session prompt or another session's brief starts them. The operator
already agreed to the offer, so the second question repeats the first. Only ship acts on a decision a brief
cannot make for the operator: it merges the pull request. Verify-ship observes the deployed system.
Wrap-up closes records and takes down a run whose pull request is already merged.

## Decision

1. **Ship asks.** `/superdev:ship`, started from an offer's new-session prompt or from another session's
   brief, asks the operator one yes before any write or host call. A brief is never merge consent.
2. **Verify-ship and wrap-up ask no extra question.** They run on every start their start conditions list,
   a brief start included, with no confirming question.

## Considered options

- *Keep the ask in all three.* Every chain step past the pull request costs one extra click with no merge
  behind it.
- *Keep the ask in wrap-up only.* Wrap-up's store writes cannot be undone, but its own gates already refuse
  to run before the merge, the settled Definition of Done, and the deploy.

## Consequences

The marker line has one reader, ship. A model-written brief can start wrap-up, which closes the scope
anchor and its records without an operator yes; wrap-up's own gates bound when that can happen.
