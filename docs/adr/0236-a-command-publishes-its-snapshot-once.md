# 0236: A command publishes its snapshot once

**Status:** Accepted

## Context

`run-state.md`'s `## Publishing run state` published the scope anchor's `## Run state` snapshot after every ledger
write the snapshot shows: a stage write, a degraded, unresolved, deferred, Minor-queue, docs, or pull-request record.
About 40 sites across the skills and references told the model to publish at the write. Each publish is a store read,
`scope.js publish`, `kb-patch.js merge`, and a store write, about four tool calls and two API calls, and a scope made
8 to 15 of them. A command that wrote three records published three times, and only the last publish was the state
another session could read when the command ended.

The Minor sweep's re-review took `opus` like every slice review, also when every finding of the cycle's fix list was
a rename, a rewrap, or a typo.

## Decision

1. **A command publishes once, as the last act of the exit that ends it**, after its closer, when it made at least
   one ledger write the snapshot shows. A write site records and does not publish. An exit that ends a command without a closer after such a write
   publishes there. Implement also publishes right after its entry writes `**Stage:** implementing`, so a session on
   another machine sees the run in flight during the hours it can take.
2. **A Minor sweep re-review takes `sonnet`** when every finding of the cycle's fix list was mechanical, and `opus`
   otherwise.

## Considered options

- **Publish from `scope.js` at `step clear` and `step block`.** Rejected: `scope.js` performs no store I/O, and the
  store's read and write calls are the active store's own prose rules.
- **Push the run-state ref only at a session handoff.** Rejected: every step end can hand off, since the offer can
  start the next command in a new session, and the push takes about a second per step end.
- **Narrow merge-guard to a lead word at a command position.** Rejected: it reads shell words, which ADR 0227 removed,
  and a lead word after a quote is how `bash -c "git push"` is caught.

## Consequences

A command's anchor shows its state when the command ends, with fewer store calls. A command killed mid-way leaves the
anchor at its entry state or the previous command's state, and the ledger and the run-state ref stay the source a resume reads.
