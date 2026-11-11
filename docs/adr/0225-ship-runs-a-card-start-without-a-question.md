# 0225: Ship runs a card start without a question

**Status:** Accepted

**Amends:** [ADR 0214](0214-only-ship-asks-a-started-session-for-consent.md) point 1: ship asks its one yes
only on a brief start.

## Context

Under ADR 0214, `/superdev:ship` asks the operator one yes when an offer's new-session prompt starts it. The
operator already clicked the offer's card, whose description names the pull request and says it merges it.
The second question repeats that answer. A brief from another session carries no such operator click: a
model writes it.

## Decision

1. **A card start runs.** Ship started from an offer's new-session prompt, the command followed by the offer's
   marker line, asks no extra question. The card's click is the merge consent.
2. **A brief start asks.** Ship started from another session's brief, with no marker line, asks the operator
   one yes before any write or host call. A brief is never merge consent.

## Considered options

- *Drop the ask on a brief start too.* A model-written brief could then merge a pull request with no operator
  answer.

## Consequences

The marker line separates the two starts. The new-session option of an offer of ship says it merges with no
further question.
