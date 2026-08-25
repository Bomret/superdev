# 0042: Run state is mirrored to the scope anchor

**Status:** Accepted

## Context

A run's state lives only in the invoking checkout. The run root is git-ignored, and
`hooks/scope-prune.js` reaps it seven days after the scope merges (ADR 0007). Three consequences follow,
all observed in real use:

- **The record does not outlive the run.** `/superdev:ship` ticks `<run-root>/dod.md`, the local copy of
  the Definition of Done that run init writes from the anchor. The anchor's own checklist is never
  ticked, so once the run root is reaped nothing durable says which criteria were verified. The
  `**Degraded:**`, `**Unresolved:**`, and `**Deferred:**` records reach the pull-request body and stop.
- **A run cannot be resumed on another machine.** A clean clone holds no ledger, so the chain has no
  stage to continue from and both playbooks' **Resume** paths have nothing to reconcile against.
- **Progress is invisible to anyone but the operator.** The store carries per-slice status labels,
  best-effort, and nothing scope-level.

## Decision

The anchor carries a **published snapshot** of the ledger. `<run-root>/ledger.md` stays the single source
of truth for control flow; the snapshot is a mirror, never a second authority.

**`scope.js` gains two verbs and performs no store I/O**, because slice-store I/O stays in-agent
(ADR 0022). `publish` reads the ledger and prints it on stdout as a single `## Run state` section, its
`# Ledger — <slug>` heading replaced by that section heading. `adopt` reads a whole anchor body on stdin,
extracts the `## Run state` section, validates it against the schema it already owns, and writes
`<run-root>/ledger.md`. The ledger is already labeled header lines plus a markdown table, so the snapshot
needs no wire format: it renders as a table for a human reader on the anchor and round-trips
byte-for-byte back into a ledger.

**`scripts/kb-patch.js` performs the merge, unchanged.** Its `merge` appends a section whose heading the
live document does not carry and replaces one it does, which is create-and-update for the anchor's body
exactly as it is for a knowledge-base page.

**Publishing follows every stage write.** One rule rather than a list of call sites: wherever a command
calls `scope.js stage set`, it publishes after. The anchor is then never more than one stage stale, which
is what lets an adopted run re-enter the chain at the right command. Publishing is **best-effort**, as
every store write in superdev is, because the ledger drives control flow.

**Slice rows are not published on their own.** Both playbooks' **Resume** cross-checks the ledger against
`git log <base>..<branch>` and the store's slice statuses, so a stale slice table in an adopted ledger
self-heals. Publishing each slice move would spend one store call per slice, and on the full tier would
race parallel slice agents against one anchor body.

**Run init adopts.** No local ledger and an anchor carrying a `## Run state` section whose stage is not
`shipped` is an **adopted** run: run init writes `<run-root>/dod.md` from the anchor as it already does,
adopts the ledger, and reports the run kind `resumed` — the ledger names unmerged slice work, which is
what `resumed` already means. `resumed` gains one step: a branch that does not verify locally is fetched
from the configured remote before the stop, because a fresh clone holds no scope branch.

**`/superdev:ship` ticks the anchor's own Definition of Done**, beside `<run-root>/dod.md`. The ticks then
survive the reap.

**Each store seed gains a `## Run state` section**, the same shape as its `## Scope anchor` section: where
the snapshot lives on that backend, how to write it, and how to read it back. Backends stay pluggable.

**The local-file store carries no snapshot**, and its section says so. That store's anchor is a tracked
plan file riding the scope branch, so a snapshot written into it is the rejected "commit the run root"
option under another name: it conflicts on every slice merge and lands in the pull request. A backend
whose anchor is a repository file therefore declares itself snapshot-less rather than accept either
outcome, and a run on it publishes nothing, adopts nothing, and ticks only its local Definition of Done.

## Considered options

- **The anchor becomes the source of truth** — a remote run-state backend behind `scope.js`, with
  `ledger.md` demoted to a cache. ADR 0022's consequences anticipate exactly this. It removes drift by
  construction, and it makes control flow depend on the network: every store write is best-effort
  precisely because the ledger drives control flow, `hooks/ledger-guard.js` cannot guard a remote
  document, concurrent runs race on one anchor body, and an offline run becomes impossible.
- **Commit the run root** — track `.superdev/scopes/<scope>/` on the scope branch. The full tier merges
  per-slice worktrees into that branch, so a tracked ledger conflicts on every merge; it lands in the
  pull-request diff, which `references/run-init.md` rules out; and it leaves the anchor as blank as before.
- **A comment on the anchor rather than a body section.** Append-only history of the run's progress, at
  the cost of no single truth: a reader hunts for the newest comment, and replacing the right one needs
  comment-id bookkeeping the ledger would have to carry.
- **Publish at run handoff and ship only.** Two call sites instead of a rule. The anchor then reads
  `merged` while the run sits at `documented`, so an adopted run repeats the review and the doc pass.
- **`/superdev:status` reads the anchor** when no local run root exists. One tool for both views, at the
  cost of store I/O in a read-only command whose no-op path is currently local and instant. The rendered
  anchor is already the remote view.

## Consequences

Two copies of the run's state exist, and the snapshot is stale between stage writes — bounded at one
stage, and only ever in the direction of naming an earlier stage than the truth. A failed publish leaves
the run unaffected and unrecorded, the same posture as a failed status label.

`interfaces.md` is not published, so an adopted full-tier run resuming mid-implement loses the cross-slice
interface record and rebuilds its own. This is the mirror's **ceiling**: the ledger and `git log` still
name every merged slice, so what is lost is the agreed interface text rather than knowledge of what
shipped.

`scripts/kb-patch.js` gains a second caller, so its ADR 0027 framing widens from a knowledge-base page's
`action: patch` to a deterministic section merge with two consumers. Its contract does not change.

`scope-prune`'s seven-day reap stops being lossy: the record it deletes is on the anchor, and `adopt`
rebuilds a ledger from it.

Drift-check gains one contract — that a `stage set` call site publishes after — rather than one per
command, because the rule is stated once in `references/scope-mode.md`.
