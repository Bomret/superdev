# 0225: Ship runs a card start without a question

**Status:** Accepted

**Amends:** [ADR 0214](0214-only-ship-asks-a-started-session-for-consent.md) point 1: ship asks its one yes
only on a brief start. [ADR 0176](0176-the-offer-recommends-a-new-session.md) point 5 and
[ADR 0183](0183-the-offer-proposes-the-new-session-as-a-card.md)'s Consequences, whose new session asks one yes.

## Context

Under ADR 0214, `/superdev:ship` asks the operator one yes when an offer's new-session prompt starts it. The
operator already clicked the offer's card. The card shows only the `start_session` call's `title`, and the
offer's `prompt` and `background` carry nothing beyond the command, its marker line, and what the session
starts from (INV-0184). A card whose title names the pull request and says ship merges it makes the click a
merge consent, and the second question repeats that answer. A brief from another session carries no such operator click: a
model writes it.

## Decision

1. **A card start runs.** Ship started from an offer's new-session prompt, the command followed by the offer's
   marker line, asks no extra question. The card's click is the merge consent.
2. **A brief start asks.** Ship started from another session's brief, with no marker line, asks the operator
   one yes before any write or host call. A brief is never merge consent.
3. **The card names the merge.** An offer of ship's card `title` names the pull request by its number and says
   ship merges it. The title is outside INV-0184's bound on `prompt` and `background`.

## Considered options

- *Drop the ask on a brief start too.* A model-written brief could then merge a pull request with no operator
  answer.
- *Keep the ask on a card start.* The marker line is fixed public prose, so a model-written brief can carry it,
  and ship then merges with no operator answer. ADR 0183 kept the ask for that reason. The operator accepts
  that risk to remove the second click.

## Consequences

The marker line separates the two starts. It is no proof of a card click: a brief that copies it starts ship
with no yes, and only the model's adherence to the offer rules keeps the marker out of briefs. INV-0093's
`Check` names this gap.
