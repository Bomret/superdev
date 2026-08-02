# Scope mode

`/superdev:review`, `/superdev:document`, and `/superdev:ship` share one rule (ADR 0013). Each reads this
file at runtime and keeps only what is specific to it. That is the stage it reads or writes, and what it
prints next.

**`## Unattended` and `## The scope slug` below have a wider audience.** `/superdev:implement` and both
execution playbooks read `## Unattended`; `/superdev:implement` and `/superdev:afk` both read `## The
scope slug`. Neither reads anything else here. A run is unattended from its first command, so the token
cannot wait for the stage where the other rules begin.

## The scope slug

A scope slug must match `[a-zA-Z0-9][a-zA-Z0-9_-]*`. It becomes a branch name (`superdev/<slug>`) and a
run-root path segment (`.superdev/scopes/<slug>/`), and every source it comes from — a feature label
resolved from the slice store, an epic's feature label read off a tracker anchor — hands it over as
external input with no such guarantee: a stray `/`, a leading `-`, `..`, a space, or `~` are all legal
label characters, and none are safe in either place.

## A live scope run

A range or a scope slug names a live run when two conditions hold. Its head is `superdev/<scope>`. A run
root exists for that scope. A run root is a `.superdev/scopes/*/` directory that holds a `ledger.md`.

Capture `<run-root>` as the absolute path to `.superdev/scopes/<scope>/`. Do this while the invoking
checkout is still the current directory. Address every run-root artifact by that absolute path:
`<run-root>/ledger.md`, `<run-root>/dod.md`, and `<run-root>/run.lock`.

## The scope checkout

Find the working tree that holds the scope branch, from disk.

- `.superdev/scopes/<scope>/worktree` exists. That directory is the scope checkout, from a `lite` run. Run
  every git command that writes to the scope branch with it as the current directory.
- No such directory exists. The invoking checkout holds the branch, because a `full` run left it switched
  to `superdev/<scope>`. Confirm this with `git rev-parse --abbrev-ref HEAD`. A different branch means the
  checkout is wrong. Say so and stop. On a read-only command, review read-only instead.

## The run lock

Refresh `<run-root>/run.lock` if the file exists. Never create it.

`references/implement-lite.md` is the only place that creates the lock. The `run-lock` hook guards one
operation, `git worktree add` on a scope worktree. Only the `lite` tier runs that operation. A `full` run
has no worktree to guard, so it never gets a lock. A command that created one anyway would guard an
operation that never happens. `/superdev:ship` would then delete a file no run made.

The lock's mtime marks the run as live across the whole chain. The `run-lock` hook treats a lock older
than an hour as dead. Each command in the chain refreshes the mtime at its own step.

## Unattended

`--unattended` in a command's arguments means nobody is watching this invocation. `/superdev:afk` passes
it on every command it drives. It is an argument and never a run-root field, so it cannot outlive the run
that passed it (ADR 0016): a sweep interrupted at any point leaves the next command a maintainer types
asking its questions exactly as it always did.

**Take it out before parsing anything else.** The token is never part of the range, the area path, or the
scope slug a command resolves from its remaining arguments — strip it first, wherever it sits, then parse
what is left.

**A command carrying the token never asks a question, and never starts an interview command** (e.g.
`/superdev:setup`, `/superdev:plan`) **either** — nobody is there to answer that interview's questions
any more than this one's. At each stop where it would otherwise do either:

- **A standing answer is written at that stop** → take it. Each stop states its own, next to the question
  it replaces.
- **No standing answer is written** → **block**, and stop. This catch-all is what keeps a question added
  later from stalling a whole run: an unanswerable stop costs one epic, not the night.

**Blocking** means: move the slice, where one is in play, and the scope anchor to `blocked` per the status
map in `docs/agents/issue-tracker.md`; comment on the anchor naming the stop that was reached and why; then
stop, leaving the scope branch standing and unshipped. A store with no comment concept records the same
reason in the anchor's body. Both writes are best-effort, as every status write is — the ledger drives
control flow, so a failed write is logged and the block still holds.

**Without the token nothing changes.** Every command asks exactly what it asks today, in the same words.

## The stage never moves backwards

`/superdev:review` and `/superdev:document` both write the ledger's `**Stage:**` line, and each reads the
current value first: **a stage write never undoes completed work.** `shipped` is what stops
`/superdev:ship` from opening a second pull request, so a later command that overwrote it with an earlier
stage would disarm that check. `documented` and `shipped` are therefore terminal. No command in the chain
writes over either one.

The rule protects work that is still valid, not the ordering of the values. One move that reads as
backwards is sanctioned, because it records a fact rather than a distance: `/superdev:review` writes
`reviewed` over `documented-unreviewed` when its fix loop landed commits. The doc pass really did run, and
those commits made it stale, so the run needs it again. The stage is one scalar, so it cannot say "reviewed
and documented, but documented too early". `reviewed` is the value that gets the doc pass re-run, which is
the outcome that matters.

Each command keeps its own table of exactly what it writes for the stage it finds. This shared rule is the
one thing both tables honor.
