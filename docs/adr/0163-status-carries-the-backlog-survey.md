# 0163: `/superdev:status` carries the backlog survey

**Status:** Accepted

## Context

An operator asking where the work stands and what to do next had two commands. `/superdev:status` printed
the local run ledgers through `scope.js status`. `/superdev:backlog` surveyed the slice store, gave each
scope one row, recommended one move, and sent per-slice detail back to `/superdev:status`. Operators had to
pick one, often ran both, and every session carried two skill descriptions for one question.

## Decision

`/superdev:status` is the one command. With no argument it prints the `scope.js status` output verbatim,
then the backlog survey table and its one recommended move, with the survey's buckets and ranking
unchanged (ADR 0049). `/superdev:status <scope> --trace` keeps printing one run's trace and reads no slice
store. The ledger blocks print before any store call. An unconfigured store or a failed listing prints
one line in place of the table and the move, so a store problem never hides local run state and never
reads as an empty backlog. `plugin/skills/backlog/` is removed with no shim, which the pre-1.0 rule
permits. The skill runs on `sonnet`, because the survey's bucketing needs it.

The survey reads each run root's liveness, not its stage alone. A run root whose ledger carries a standing
`**Step:**` line (ADR 0147) and whose `run.lock` is under an hour old is live in another session. It takes
the `running` bucket ahead of every other bucket, stranded included, and is never the recommended move. A
stage stays at its entry value while review, ship, verify-ship, or plan runs, so before this rule the
survey recommended work already running on this machine: eight times between 2026-10-10 and 2026-10-14,
and a plan run whose anchor was still pending got a `stranded` row that suggested deleting it.

## Considered options

- **The survey behind a flag on a fast local `/superdev:status`.** It keeps the offline, `haiku` path, but
  the operator still chooses, now between flags instead of commands.
- **Keep both commands and cross-link them.** It removes neither the choice nor the second description.
- **Keep `/superdev:backlog` as the surviving name.** "Status" is the word for the question, and
  `--trace` already lives there.
- **Liveness from the lock alone.** A lock also goes fresh when a session only recreates or refreshes a
  scopetree, with no command running.
- **Drop a run whose last trace step line is `step block`.** It saves the hour a blocked stop reads as live,
  at the cost of a trace read per run root.
- **Fold the slice tally into the survey row.** It removes the duplicate display of a run-root scope, but
  rewrites the row format and needs a second, table-less layout for the offline case.

## Consequences

Every status call pays model and network latency that the ledger report alone did not. A run-root scope
shows twice: as a ledger block for detail and as a table row for its next act.
