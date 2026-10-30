# 0202: Run state lives on a git ref

**Status:** Accepted

**Amends:** [ADR 0042](0042-run-state-is-mirrored-to-the-scope-anchor.md), whose snapshot carries the
ledger only. This record puts the rest of a run's machine state on a git ref.

**Context.** A run's trace (`trace.log`), its per-slice reports (`reports/`), and its cross-slice interface
file (`interfaces.md`) exist only in one checkout's git-ignored run root. `git clean -fdX`, a lost disk, or
a fresh clone deletes them without a message. A run cannot move to another machine in the middle of
`/superdev:implement`, and a colleague cannot take it over. The ledger reaches the scope anchor through
the snapshot, and the Definition-of-Done ticks reach it through each store's tick write. A trace measures
up to 131 KB in past runs, and reports up to 1.6 MB, so neither fits an issue body or a comment.

**Decision.** `scope.js step clear` and `scope.js step block` push `trace.log`, `reports/`, and
`interfaces.md` to `refs/superdev/<scope>` on the remote that the `Remote:` line of
`docs/agents/code-management.md` names.

- **Each push is one parentless commit.** The remote ref holds only the latest state.
- **The push is a lease push.** A remote ref that moved since this machine last saw it is not
  overwritten: the push refuses and reports.
- **The push is best-effort.** A failed or refused push is reported, and the step write completes.
- **No `Remote:` line** means no push and one note.
- **`scope.js adopt` fetches the ref** and unpacks the three items into the run root. A missing ref is no
  error. Local `trace.log` or `reports/` found in the run root are kept, the unpack is skipped, and no
  fetched tip is recorded, so a later push refuses rather than overwrite the remote.
- **`/superdev:wrap-up` deletes the ref**, with no lease. An absent ref is no error.

The ledger and `dod.md` stay off the ref: the anchor is their one remote home.

## Considered options

- *Everything to the slice store and the knowledge base, with no git ref.* Rejected: a trace or a report
  does not fit an issue body or a comment, and attachments differ in each issue-tracker seed.
- *Everything to a git ref, intents included.* Rejected: an intent on a ref has no assignee and sends no
  notification, so it fails the handover to a colleague.
- *Commit the artifacts on the scope branch.* Rejected: they would merge into the base branch.
- *Push at every ledger write the snapshot publishes.* Rejected: past runs show about twice as many
  pushes as handoffs, and a crash still loses the trace lines written since the last ledger write.
- *Put `interfaces.md` on the scope anchor.* Rejected: only the controller reads it, and it would cost a
  new anchor section and a write call in each store seed.
- *Carry the ledger and `dod.md` on the ref too.* Rejected: two remote copies can disagree, and a rule for
  which wins adds work for no reader.
- *Block the handoff when the push fails.* Rejected: an unreachable remote would stop every run.
- *A separate verb that each skill calls before its step clear.* Rejected: prose can skip it, and no suite
  reaches the call sites.

ADR 0167 rejected `refs/superdev/<scope>` for the scope branch, because a custom ref needs host checks
for a push that carries no code. Here the ref carries no code either, and no branch can hold it. A push of
a `refs/superdev/` ref to Codeberg was verified on 2026-10-30. GitHub was verified on 2026-10-30, with
git 2.54.0, against a private repository over HTTPS. Through `run-state-ref.js`, it accepted the first send
and a second send, which left one commit on the ref. A second clone fetched the three files and sent. A
send from the first clone then refused with the lease. The delete removed the ref, and a second delete
exited normally.

## Consequences

`step clear` and `step block` make a network call, bounded like `push.js`. A slice id is validated before
any `reports/<id>/` path is built (triage #1342). INV-0179 keeps the push off every checkout.
