# Lite execution playbook (≤3 slices)

The controller `Read`s this after computing tier = `lite` (see `commands/implement.md`). Small plans
don't need per-slice worktrees or subagents: you (the controller) implement every slice yourself,
inline, test-first, in a single dedicated scope worktree. This is the one deliberate exception to the
"controller never implements inline" invariant (ADR 0001). Honor the controller's **Invariants**
throughout. Return to the controller's **Final phase** once every slice is committed.

## Branch model

- **Base committed + pushed** per the controller's Phase 0 (design docs on base, base pushed) — do it
  before cutting the worktree.
- **Cut the scope branch into a dedicated worktree:**
  `git worktree add .superdev/scopes/<scope>/worktree -b superdev/<scope> <base>` (base from
  `code-management.md`, default `main`). The invoking checkout is **never switched** — it stays on main
  (or wherever it was), so a second session can run in the same repo. All inline implementation happens
  **in this worktree**, never in the invoking checkout. Then move the **scope anchor** issue →
  `in-progress` (per `issue-tracker.md`; best-effort).

## Run lock

Before implementing the first slice, write `<run-root>/run.lock` (the absolute Phase-0 run-root path in
the invoking checkout — never a `.superdev/scopes/<scope>/…` path from the worktree cwd, which resolves
one level too deep). The lock's mtime marks this run as live; the **run-lock** hook uses
it to stop a second concurrent run of the same scope from creating its own scope worktree, enforcing
same-scope mutual exclusion. Remove the lock at the end of the controller's **Final phase** (after the
PR).

## Implement

- **In `depends-on` order, inline, test-first.** For each slice, in dependency order: read its `spec` +
  `acceptance`, then carry the same tracer-bullet discipline an implementer subagent would (one RED test,
  minimal GREEN code, repeat) yourself, **directly in the scope worktree at
  `.superdev/scopes/<scope>/worktree/`**. All file edits, test runs, `git` commands, and commits happen **in the
  scope worktree as the cwd** — never in the invoking checkout. `mechanical` / `docs` slices need no new
  test — the existing suite is the net.
- **Carry the implementer's escalation discipline.** If you can't get a slice green after reasonable
  effort, treat it as the Invariants' BLOCKED / 3-strike case — it's a **wrong cut**, not something to
  force through. Move the slice → `blocked` and escalate (re-slice or hand to the human) rather than
  grinding on it inline.
- **Commit per slice** on the scope branch (Conventional Commits) as each one goes green — all commits in
  the scope worktree. Update the ledger (`todo` → `in-progress` → `merged`; `merged` here means "committed
  to the scope branch" — there is no separate slice branch to merge) and the tracker status. **Skip the
  `in-review` transition** — lite has no per-slice review, so move each slice straight from `in-progress`
  to `merged`/done once its commit lands.
- **No per-slice review, no per-slice progress log.** Your own context is the record of how each slice
  unfolded; the ledger is the durable trace once that context is gone.

## Resume

Read `<run-root>/ledger.md` and cross-check it against `git log <base>..superdev/<scope>` in the
scope worktree — a slice the ledger marks `merged` (already committed there) is done; pick up at the next
`todo` slice in `depends-on` order. An interrupted `in-progress` slice may have left partial, uncommitted
changes in the scope worktree. Before resuming, check `<run-root>/run.lock`: if it exists and is
fresh (mtime under 1 hour old — the run-lock hook's staleness threshold), another session is live in this
worktree — escalate or wait. If the lock is stale or absent, it's a crash resume; run `git status` /
`git diff` in the scope worktree and decide whether to continue that in-progress slice's uncommitted work
or discard it, before resuming.

## Final cleanup (worktree)

Remove the scope worktree: `git worktree remove .superdev/scopes/<scope>/worktree`. Keep the run root
(`.superdev/scopes/<scope>/`) with its ledger and DoD — the post-mortem trail. **Never** delete the scope branch
itself: the PR is from it.
