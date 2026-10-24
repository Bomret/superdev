# 0186: An accepted run at the tip becomes the suite record

**Status:** Accepted

**Amends:** [ADR 0182](0182-the-implementer-proves-its-change-and-the-controller-runs-only-suite-gates.md) point 5,
whose exact-tip route leaves the suite record as it was.

## Context

Under ADR 0182, `scope.js suite reusable` accepts a passing `full` or `whole` run on a clean tree at the exact
tip, whoever wrote it. The route wrote nothing, so the ledger's `**Suite:**` record kept naming an older commit,
or a red result there. Three readers take that record at its word. The carry run (ADR 0175) measures its range
from the record's commit, so an older commit widens the carry. `get suite` and `/superdev:status` show a result
the gate no longer stands on. The route also skipped every record at the tip, so a green record without the
`whole` kind hid a passing whole run at the same tip from a `whole` gate.

## Decision

1. **The exact-tip route writes the run it accepts as the record:** `green @ <tip>`, with `whole` where the
   latest whole run at the tip passed on a clean tree. A record that already reads so stays untouched.
2. **A green record at the tip takes the route too.** A red, `denied`, or `none` record at the tip still decides
   on its own, so a red record stays the recorded rerun's (ADR 0172) and review's `none` invalidation still
   blocks ship.
3. **No other route of `suite reusable` writes.**

## Considered options

- *Leave the verb read-only and have every gate call `suite set` after an exit 0.* Each gate would repeat the
  kind rule, and a gate that forgets the call leaves the stale record this decision removes.

## Consequences

`suite reusable` is no longer a pure read: an exit 0 through the exact-tip route can change the ledger. The
record then names the commit the last accepted gate passed on, so the carry run measures from the tip that
last passed.
