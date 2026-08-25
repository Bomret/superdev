# 0044: A denial reset returns the budget and keeps the record

**Status:** Accepted

**Amends:** [ADR 0041](0041-the-unattended-run-caps-its-own-denials-at-two.md)

## Context

ADR 0041 stops an unattended run on its second denied verification dispatch, counting the `denied: `
bullets on its own ledger. The count is append-only and nothing removes a bullet.

That leaves a capped run with no way back. The block is meant to be actionable: it quotes the classifier's
refusal so a maintainer can tell a genuine safety block from one of the false positives auto mode is
documented to produce, add the dispatch to the consumer's `permissions.allow`, and resume. A resumed run
reads its own ledger, finds two `denied: ` bullets, and blocks again on the next denial from any cause —
with `/superdev:document` and `/superdev:ship` still ahead of it. Fixing the cause changes nothing, so the
only way to finish that scope is to run the rest of the chain attended.

The count and the record are the same data. Every `denied: ` bullet is both a unit of budget and an entry
in the `**Degraded:**` line that `/superdev:ship` copies into the pull-request body and `scope.js publish`
mirrors to the scope anchor (ADR 0042). Deleting bullets would buy budget by destroying the audit trail
those two exist to carry.

## Decision

**A reset marker returns the budget and leaves every bullet standing.**
`scope.js degraded reset-denials '<reason>'` appends a `denials reset: <reason>` bullet under the same
`**Degraded:**` line, and `get denials` counts the `denied: ` bullets that follow the **last** such marker.
A ledger with no marker counts them all, exactly as before.

The marker is a bullet like any other, so `get degraded` prints it, `/superdev:ship` copies it into the
pull-request body, and `scope.js publish` mirrors it to the anchor — each without a step of its own. What
a reader sees is the whole history: every denial, the reset, and the reason it was granted.

**The reason is required**, on the same grounds the refusal quote is: a reset is a human overriding a
safety stop, and the words are what let a reviewer judge whether the override was warranted.

**A reset is a human act.** The block procedure names the command in its comment, so the maintainer who
fixed the cause finds the way back where they are already reading.

**Both prefixes become structural on the write path.** `degraded add` refuses a text beginning `denied: `
or `denials reset: `, naming the subcommand that owns it. `get denials` reads meaning from those prefixes,
so a plain bullet able to carry one is a bullet able to move the count.

## Why

The audit trail is the reason the cap is tolerable at all. A stop that leaves no record is what ADR 0041
set out to prevent, and a reset that erases records would reintroduce the same loss one level down — the
pull request would show a run that sailed through, with no sign it was ever stopped or why it was let go.

Counting after the last marker keeps one list doing both jobs. The alternative is a second counter beside
the bullets, which is the same fact in two places and drifts the first time one is written without the
other.

Requiring the reason costs a maintainer a sentence and gives the reviewer the only thing that separates
"the classifier was wrong and I checked" from "I wanted the sweep to finish".

## Consequences

- A capped scope can be finished unattended, after a human has addressed the cause and said so.
- The pull-request body of a run that was capped and released carries every denial, the reset, and its
  reason, so the release is reviewed rather than invisible.
- A second reset supersedes the first: the count runs from the last marker, so a run stopped twice needs
  two deliberate acts.
- A reset on a run carrying no denials is allowed and writes its marker. Nothing needs it, and refusing it
  would add a check that guards nothing.
- **Ceiling.** The marker returns the *whole* budget rather than part of it. A maintainer who resets
  without fixing the cause gets two more denials before the next stop, and the record is what makes that
  visible afterwards rather than a mechanism that prevents it.

## Considered options

- *Delete the `denied: ` bullets, or add `degraded clear`.* Rejected: it buys budget by destroying the
  audit trail `/superdev:ship` and `scope.js publish` carry, which is the loss ADR 0041 exists to prevent.
- *Reset on stage advance, with `stage set` writing the marker.* Rejected: it needs no new verb and no
  human action, but it does not fix the recorded case — a review that blocks is resumed at the same stage,
  which never advances, so the budget stays at zero exactly where it was stranded.
- *Count consecutive denials rather than the run's total, matching the platform's own rule.* Rejected: it
  needs every successful verification dispatch recorded, which nothing records today, and it weakens
  ADR 0041's deliberate property that a run resumed by a later invocation counts what the earlier one saw.
- *A separate `**Denials:**` counter header, independent of the bullets.* Rejected: the same fact in two
  places, drifting the first time one is written without the other.
