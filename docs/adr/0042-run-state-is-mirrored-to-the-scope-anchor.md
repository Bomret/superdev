# 0042: Run state is mirrored to the scope anchor

**Status:** Accepted

**Amended by:** [ADR 0124](0124-a-failed-verification-is-repaired-by-its-own-fix-feature.md), which adds
`scope.js adopt --shipped`: a command that needs a `shipped` original's missing run root adopts its
`shipped` snapshot, while run init and plain `adopt` keep refusing it as **Run init adopts** below states. And by [ADR 0167](0167-plan-pushes-the-scope-branch.md), which has `/superdev:plan` push the scope branch, so the
`resumed` fetch below finds a branch planned on another machine. And by [ADR 0202](0202-run-state-lives-on-a-git-ref.md), which puts
a run's trace, reports, and interface file on a git ref, so the rest of the run's machine state moves with
the snapshot's ledger.

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
takes the ledger back out of it, validates it against the schema it already owns, and writes
`<run-root>/ledger.md`. The ledger is already labeled header lines plus a markdown table, so the snapshot
needs no wire format: it renders as a table for a human reader on the anchor and round-trips
byte-for-byte back into a ledger.

**The payload's boundary is marked, never inferred.** `publish` wraps the ledger between
`<!-- superdev:run-state -->` and `<!-- /superdev:run-state -->`, and `adopt` reads what lies between
them, disregarding every heading in the body. An HTML comment does not render, so the anchor still shows
a table.

Inferring the boundary from heading structure — reading the `## Run state` section as ending at the next
heading, the way `kb-patch.js` bounds a section — cannot be made correct, and the two failures it produces
are opposites. Bound it loosely and a `#`-led line anywhere inside the payload silently truncates the
adopted ledger, dropping slice rows with a zero exit. Tighten it by refusing when the content past that
boundary still looks like ledger data, and an unrelated markdown table or a prose mention of
`**Degraded:**` further down the anchor makes the scope permanently un-adoptable. No heuristic separates
a stray heading inside the payload from a legitimate sibling section, because a truncated ledger is
itself a well-formed ledger. A marked boundary removes the question rather than answering it.

**The markers are the merge's payload, not its frame.** `kb-patch.js` still finds and replaces the
`## Run state` section by its heading, unchanged: the markers sit inside that section, so the section
merge and the payload boundary answer different questions and neither constrains the other.

**`scripts/kb-patch.js` performs the merge, unchanged.** Its `merge` appends a section whose heading the
live document does not carry and replaces one it does, which is create-and-update for the anchor's body
exactly as it is for a knowledge-base page.

**Publishing follows any ledger write the snapshot would show**, not `scope.js stage set` alone. One rule
rather than a list of call sites: `references/scope-mode.md`'s `## Publishing run state` states it once,
and every write that changes what the snapshot shows — a stage move, a `**Degraded:**`, `**Unresolved:**`,
or `**Deferred:**` bullet, a `**Docs:**` write — cites it. The anchor is then never more than one write
stale, which is what lets an adopted run re-enter the chain at the right command. Publishing is
**best-effort**, as every store write in superdev is, because the ledger drives control flow.

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

**A store whose anchor cannot safely carry a mirrored write declares itself snapshot-less**, in its own
`## Run state` section, and a run on it publishes nothing, adopts nothing, and ticks only its local
Definition of Done. The local-file store's anchor is a tracked plan file riding the scope branch, so a
snapshot written into it is the rejected "commit the run root" option under another name: it conflicts
on every slice merge and lands in the pull request. Jira's anchor is unsafe for a different reason: its
`description` field is Atlassian Document Format by default, which has no node for the section heading or
the fence markers a round trip needs, so a default Jira instance is snapshot-less too.

## Considered options

- **The anchor becomes the source of truth** — a remote run-state backend behind `scope.js`, with
  `ledger.md` demoted to a cache. ADR 0022's consequences anticipate exactly this. It removes drift by
  construction, and it makes control flow depend on the network: every store write is best-effort
  precisely because the ledger drives control flow, `hooks/ledger-guard.js` cannot guard a remote
  document, concurrent runs race on one anchor body, and an offline run becomes impossible.
- **Commit the run root** — track `.superdev/scopes/<scope>/` on the scope branch. The full tier merges
  per-slice slicetrees into that branch, so a tracked ledger conflicts on every merge; it lands in the
  pull-request diff, which `references/run-init.md` rules out; and it leaves the anchor as blank as before.
- **A comment on the anchor rather than a body section.** Append-only history of the run's progress, at
  the cost of no single truth: a reader hunts for the newest comment, and replacing the right one needs
  comment-id bookkeeping the ledger would have to carry.
- **Publish at run handoff and ship only.** Two call sites instead of a rule. The anchor then reads
  `merged` while the run sits at `documented`, so an adopted run repeats the review and the doc pass.
- **An inferred payload boundary** — `adopt` bounding the ledger by heading structure, reusing the rule
  `kb-patch.js` applies to a knowledge-base section. It needs no markers in the published text, and it is
  the option the *Decision* above rejects on evidence: two fix cycles moved the failure between silent
  truncation and false refusal without reaching a correct rule, because a truncated ledger is a
  well-formed ledger and nothing in the payload distinguishes the two.
- **A fenced payload** — `publish` wrapping the ledger in a code fence, which `adopt` reads through the
  fence-masking it already shares with `kb-patch.js`. Unambiguous, and the smallest change of the three,
  since it adds no new notation. It loses the rendered table: the anchor shows monospace text, and being
  readable at a glance is one of the three reasons the snapshot exists.
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

Drift-check gains three contracts — `publish-run-state`, that a ledger write which changes the snapshot
publishes after it; `adopt-run-state`, the mirror image, that run init adopts a live snapshot correctly;
and `resumed-scopetree-trigger`, that a `resumed` run reattaches its scopetree — rather than one per command,
because each rule is stated once in `references/scope-mode.md` or `references/run-init.md`.
