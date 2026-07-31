# Scope mode

`/superdev:review`, `/superdev:document`, and `/superdev:ship` share one rule (ADR 0013). Each reads this
file at runtime and keeps only what is specific to it. That is the stage it reads or writes, and what it
prints next.

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
