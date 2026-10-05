# 0116: Ship names wrap-up when nothing is left to verify

**Status:** Accepted

**Amends:** [ADR 0106](0106-verifying-and-closing-a-shipped-scope-are-separate-human-only-commands.md)
point 1.

## Context

ADR 0106 point 1 makes `/superdev:ship` print `/superdev:verify-ship <scope>` after every deploy. On most
scopes, no Definition-of-Done line is open after the merge, and no `manual` target waits for an answer.
`/superdev:verify-ship` then observes nothing, and the operator runs one command that does no work
before `/superdev:wrap-up`.

`/superdev:backlog` already decides the same question for a `shipped` run. It routes an open anchor to
`awaiting verification` or to `awaiting wrap-up`. That rule is stated inline in the backlog skill.

## Decision

- **One rule routes a `shipped` run.** `references/scope-mode.md` states it in its own section. The run
  needs `/superdev:verify-ship` while any of these holds: a Definition-of-Done line is neither ticked nor
  `accepted:`, a paired anchor line disagrees with `dod.md`, or a listed `manual` target is not recorded
  `deployed`. Otherwise it goes to `/superdev:wrap-up`. A `dod.md` line with no matching anchor line goes
  to wrap-up, after a hand-sync of the anchor's criterion text. A missing `dod.md` is judged from the
  anchor alone.
- **Ship, backlog, and document cite that section.** Ship applies it at its final hand-off, after every listed
  target is deployed. It prints `/superdev:wrap-up <scope>` when the rule routes there, and
  `/superdev:verify-ship <scope>` otherwise.
- **An unreadable anchor sends ship to verify-ship.** Ship then prints the command that ADR 0106 point 1
  prints. Backlog keeps its own `blocked` row for that case.
- **verify-ship and wrap-up are unchanged.** Ship observes no Definition-of-Done line and closes nothing.

## Considered options

- *Ship observes open lines inline after a successful deploy.* Rejected: ship would do two jobs, which
  ADR 0106 rejects. An observation right after a deploy can also be too early.
- *wrap-up observes open lines before its gate.* Rejected for the reasons ADR 0106 gives: verification can
  take several passes, and the close is permanent.
- *One `ship` whose behaviour depends on the state it finds.* Rejected for the reason ADR 0106 gives: what
  a command does follows from its name.
- *wrap-up asks the `manual` deploy question when no line is open.* It removes verify-ship from `manual`
  scopes too. Rejected: it adds a question to a gate command, and the smaller change covers the common
  case.
- *Ship asks whether a `manual` target deployed.* Rejected for the reason ADR 0101 gives: ship would wait
  for the whole manual deploy.
- *Ship judges from `dod.md` alone, without the anchor read.* It saves one store read. Rejected: ship and
  backlog could then name different commands for one run.
- *Ship restates the rule.* Rejected: two copies of one rule drift apart, and nothing fails.

## Consequences

- A scope with nothing left to verify goes from `/superdev:ship` straight to `/superdev:wrap-up`.
- A `manual` scope with a listed target still goes through `/superdev:verify-ship`, because ship records
  each such target `pending`.
- Ship makes one more store read at its end, the anchor's Definition-of-Done lines.
