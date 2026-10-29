# 0164: The backlog survey reads closed anchors and every snapshot stage

**Status:** Accepted

**Amended by:** [ADR 0198](0198-the-backlog-survey-drops-the-likely-resolved-bucket.md), which removes the
`likely resolved` bucket and the survey's read of closed anchors' bodies.

## Context

The backlog survey matches a triage record only against the Absorbs lines of open scope anchors
(ADR 0144). A record that a closed scope fixed, without an Absorbs line, stays in `needs planning`. Between
2026-09-20 and 2026-10-16 the survey recommended planning such a record three times: #379, which the closed
anchor #419 fixed, #814, which the closed anchor #1009 fixed, and #1059, which the closed anchor #1075
fixed. Each of those closed anchors names the record in its own body. A fourth record, #1077, duplicated
#1059, and no anchor names it.

The survey routes an open anchor with no local run root by its `## Run state` snapshot only when the
snapshot reads `shipped`. An open anchor whose snapshot read `implementing`, with the run on another
machine, fell through to `ready`, and the survey recommended `/superdev:implement` for it (#1115). An open
anchor whose snapshot reads `closed` falls through to `ready` the same way. Run init does not adopt a
`closed` snapshot, so implement would start that feature again.

## Decision

- **Evidence of a fix.** An open triage record whose reference appears in the body of a closed scope
  anchor, outside that body's `## Run state` section, takes a new bucket, `likely resolved`. The bucket
  sits after `absorbed` and before `needs planning`, so an open anchor's Absorbs line still wins. The row
  names every closed anchor that cites the record. Its act is to check that anchor and close the record if
  the fix holds. It can be the recommended move, and it ranks just ahead of `needs planning`. The
  `## Run state` section is excluded, because its `**Deferred:**` and `**Unresolved:**` lines name
  records that a run left open. A closed anchor whose own Absorbs line names the record is no evidence,
  because `/superdev:wrap-up` already decided whether to close that record. A closed scope anchor is a
  closed root the store document recognises, so the Forgejo seed recognises every closed
  `epic`-labelled issue under a feature label with no open issue as a closed root.
- **A run on another machine.** An open anchor with no local run root whose snapshot stage is past `planned`
  and short of `shipped` takes a new bucket, `elsewhere`. The row names the snapshot's
  stage and step. Its act is to finish the run on the machine that holds it, or, when no machine does, to
  run `/superdev:implement <feature-label>`, which adopts the snapshot. The survey cannot tell whether that
  run is live, so an `elsewhere` row is never the recommended move (INV-0167).
- **A closed run on an open anchor.** An open anchor whose run reads `closed`, in a local ledger or, with
  no local run root, in its snapshot, takes `blocked`. Its act is to close the anchor.
- A `planned` snapshot with no local run root stays `ready`, and a `shipped` snapshot routes as before. A
  store that carries no snapshot routes an anchor with no local run root as before.

## Considered options

- *Match only the Absorbs line and the `(triage <reference>)` notation on closed anchors.* Rejected: it
  gives no false match, but it catches none of the four observed records.
- *Match base-branch commit messages.* Rejected: release commits list every issue a release closed or
  filed, so a mention is no evidence of a fix.
- *Match open records against closed anchors by concept.* Rejected: it is one model judgment per record and
  closed anchor, and its result is not repeatable. Catching a duplicate such as #1077 is the job of the plan
  interview's triage audit.
- *Put a snapshot-only run in `in flight`.* Rejected: that bucket ranks ahead of `ready` and is often the
  recommended move, so the survey would recommend taking over a run that may be live on another machine.
- *Make `likely resolved` never the recommended move.* Rejected: closing a fixed record is finishing
  work, and the check is one read.

## Consequences

A closed anchor that names a record it did not fix, for example as a non-goal, moves that record to
`likely resolved`. The row still shows, and the act is a check, so the cost is one read.

On a store whose anchor listing returns no bodies, the survey reads each closed anchor's body through the
store's own read call. That is one read call per closed anchor in the store's history. The count has no
bound, and it grows with every feature the store ships.

The Forgejo seed change also reaches `/superdev:plan`. Its shipped-anchor refusal (ADR 0083) fires for a
feature label whose issues are all closed and whose root is a closed `epic` issue, and its Repairs lookup
resolves that label to the closed epic. Both are intended, and both agree with ADR 0083, whose gate
refuses on a closed scope anchor's status. A consumer whose `docs/agents/issue-tracker.md` came from the
earlier seed keeps the earlier rule until a `/superdev:setup` re-run offers the updated **Recognise one**
bullet as a seed gap (ADR 0107).
