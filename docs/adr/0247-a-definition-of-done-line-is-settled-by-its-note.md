# 0247: A Definition-of-Done line is settled by its note

**Status:** Accepted

## Context

A `dod.md` line carries a checkbox and a verdict note (`met:`, `not met:`, `ceiling:`, `accepted:`). `/superdev:wrap-up`
and the first step of `shipped-run.md`'s routing judged a line by its note. Seven other surfaces judged it by its box
("neither ticked nor `accepted:`"). They are `/superdev:verify-ship`, the routing's Verify-ship and Wrap-up routes,
`/superdev:ship`, `/superdev:document`, the doc pass, and the doc-writer. A `[x]` line noted `ceiling:` or `not met:` was then open for wrap-up and
settled for verify-ship. Wrap-up named verify-ship, verify-ship found nothing open and routed back, and no command
settled the line (triage #126). `scope.js dod-line` always draws the box from the verdict, so only a hand edit or a
legacy line reaches that state.

## Decision

1. **The note decides a line's state everywhere.** A **Settled line** is one noted `met:` or `accepted:`. An **Open
   line** is one noted `not met:` or `ceiling:`, or one with no note.
2. **A bare `[x]` with no note is open.** A bare tick is invalid (INV-0014) and states no verdict, so
   `/superdev:verify-ship` observes it and writes a verdict.
3. **One definition, held by a drift check.** `dod-ticks.md`'s note rule and the glossary define both terms once.
   Every surface that judges a line cites that definition, and a drift check forbids the box-based wording in shipped
   prose.
4. **"Settled" has one meaning at every stage.** Before merge a `ceiling:` or `accepted:` line holds no stage:
   `/superdev:submit-pr`, the scope review's stage hold, and run handoff let the stage advance past it, and say so
   in those words. A `ceiling:` line is not called settled at any stage.

## Considered options

- **The box decides.** Rejected: it calls a `[x]` line noted `not met:` settled, so wrap-up would close a scope whose
  criterion was observed false.
- **The box decides a line with no note.** Rejected: it keeps two rules in play, and a legacy bare tick was never
  judged.
- **Scope "settled" to shipped runs.** Rejected: the glossary would carry one term with two rules, and a reader of
  either stage would apply the other stage's rule.
- **A `scope.js` verb that prints a run's open lines.** Rejected: the defect was disagreeing prose definitions, and a
  single definition with a forbidden-form check removes it without a new verb and suite.

## Consequences

A run whose `dod.md` holds a bare `[x]`, or a `[x]` noted `ceiling:` or `not met:`, routes to `/superdev:verify-ship`,
which observes the line and rewrites it through `scope.js dod-line`. Such a run takes one more observation before
wrap-up than it did under the box rule.
