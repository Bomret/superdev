# 0223: A skill adds no offer condition of its own

**Status:** Accepted

**Amends:** [ADR 0157](0157-every-chain-command-offers-to-start-its-successor.md): decision 6 no longer limits
verify-ship's offer to the settled exit.

## Context

On 2026-11-10 a `/superdev:ship` run refused at the suite gate and pointed at `/superdev:review <scope>`. It put
up no offer card. Ship's `## 5. After the merge` carried a **No offer** rule for a refused ship, a route to repair
or re-verify, and a pending or failed deploy. verify-ship limited its offer to the exit where every line is
settled. `references/response-shapes.md` let a skill add offer conditions of its own, and listed "an exit where
the skill's own offer conditions make no offer" as an exception. ADR 0157 itself states that a refusal exit
offers the same way as any other exit.

## Decision

The conditions in `references/response-shapes.md`'s `## The offer` alone decide whether an exit offers. A skill
adds none. Ship and verify-ship offer the next command their Next block prints at every exit, a refusal
included. The general exceptions stay: an unattended run, the chained posture, a `Blocked:` or `First:` line, the
same skill as the one ending, a step-started command, and a refused card. `hooks/offer-guard.js`'s block reason
drops the skill-condition exception.

## Considered options

- **Also offer past a `First:` or `Blocked:` line, or for the same skill.** Rejected by the operator: a `First:`
  line names a manual step the card cannot perform, and a same-skill offer restarts the command that is ending.

## Consequences

A refused ship offers `/superdev:review <scope>` or `/superdev:submit-pr`, and a repair route offers
`/superdev:plan`. A ship stopped by a failed deploy prints `/superdev:ship <scope>` and meets the same-skill
exception. A `manual` posture's pending targets no longer withhold the verify-ship offer, since verify-ship asks
the operator about each pending target.
