# 0224: Verify-ship starts wrap-up when every line settles

**Status:** Accepted

**Amends:** [ADR 0132](0132-ship-is-the-only-human-only-skill-and-offers-the-rest.md) point 5, and
[ADR 0157](0157-every-chain-command-offers-to-start-its-successor.md) decision 6: verify-ship starts wrap-up at
its settled exit instead of offering it.

## Context

When `/superdev:verify-ship` settles every open Definition-of-Done line, the operator still runs
`/superdev:wrap-up` as its own step: a second offer, one more turn, the scope resolved again, and the gate read
again. That step adds no judgment. Verification and the close stay separate commands (ADR 0106, ADR 0116) so that
verification can take several passes and the permanent close keeps its own gate. Wrap-up's gate already refuses
every unsettled line, every pending deploy target, and every staged file left in a run checkout. It asks the
operator about each standing unresolved defect and each `accepted:` absorbed record.

## Decision

1. **Verify-ship starts wrap-up at its settled exit.** When every line is settled, no line waits for a
   hand-sync of the anchor's criterion text, and the anchor's lines were read, verify-ship clears its step, prints its summary, and starts
   `/superdev:wrap-up <scope>` through the Skill tool in the same turn. It asks no question first, and it makes
   no offer of wrap-up.
2. **Every other exit is unchanged.** The hand-sync `First:` wait, re-verify, repair, the Otherwise exit, a
   refusal, and a blocked stop start no wrap-up. Each keeps its Next block and its offer.
3. **Every start of verify-ship chains.** A typed verify-ship, one the operator asked for, one an offer started,
   and one another session's brief started each start wrap-up at the settled exit. ADR 0214 already lets a brief
   start wrap-up with no yes, so starting verify-ship is consent to close a fully settled scope.
4. **Wrap-up keeps every gate and every ask.** A wrap-up started this way bypasses none of them, and its refusal
   reaches the operator unchanged. A wrap-up the operator types runs as before.
5. **Wrap-up owns the hand-off.** Its last message is the last message of the chain. It offers the command its
   Next block names, as a typed wrap-up does, and verify-ship prints nothing after it returns.
   `references/response-shapes.md`'s step-started condition keeps the hand-off with the starting command only
   when that command goes on after the started one returns. Verify-ship names no staged pages on this exit.
   Wrap-up names them in its last message, whether it finishes, refuses, or stops, so the operator reads them
   once on every outcome of the chain.
6. **A failed start falls back.** When the Skill tool refuses or fails the start, verify-ship prints
   `/superdev:wrap-up <scope>` as its next command and makes its usual offer.

## Considered options

- **Merge verify-ship and wrap-up into one command.** It reverses ADR 0106 and ADR 0116, and it changes every
  shipped-run router (ship, status, document, run init, the shipped-run reference), the repair route, drift
  pins, and tests. It removes the same round trip that one chained step removes.
- **Verify-ship asks one yes before it starts wrap-up.** It saves little over the card's Do it here button,
  so the round trip stays.
- **Ship observes inline after the deploy.** ADR 0116 rejected it: an observation right after a deploy can come
  too early, and the step from verify-ship to wrap-up stays.
- **Wrap-up asks the manual-deploy question.** It removes verify-ship only for `manual` scopes with no open
  line, and ADR 0116 rejected it.
- **Verify-ship owns the hand-off after wrap-up returns.** It keeps the step-started rule as written, but
  verify-ship then reads wrap-up's outcome and offers its next command again, which repeats wrap-up's routing.

## Consequences

A verify-ship pass that settles every line ends the scope in one turn, on wrap-up's Next block. ADR 0132 point 5
no longer holds: a typed verify-ship can start wrap-up. `hooks/offer-guard.js` needs no change: the chain's
last message is wrap-up's, so its Next block names wrap-up, the skill the transcript last started, or a command
wrap-up's own offer named. Verify-ship's `step clear` runs before wrap-up's `step set`, and `step set` writes
on every call, so the two steps in one turn are two traced starts.

An offer or a brief that names only verify-ship can now end in a close. The close still needs every line
settled, and wrap-up's gate and asks still run. A verify-ship that could not read the anchor does not know
whether a line waits for a hand-sync, so it starts no wrap-up and prints the command as before.
`lib/running-skill.js` reads any `Skill` call as a start, a refused one included, so the guard passes the
fallback's Next block whether or not verify-ship made its offer. That fallback offer rests on the skill's prose
alone.
