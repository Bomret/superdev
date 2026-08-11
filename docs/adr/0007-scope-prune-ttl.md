# 0007 — Completed scope run roots are pruned on a TTL, not kept forever

**Status:** Accepted

**Context.** ADR 0001 established the run root (`dod.md`, `ledger.md` under `.superdev/scopes/<scope>/`)
as a post-mortem trail that survives worktree removal — deliberately never deleted by `/implement` itself.
Nothing else deletes it either: it's git-ignored, so it never pollutes the repo, but it also never goes
away. A long-lived repo run through many `/superdev:implement` scopes accumulates one leftover directory
per scope indefinitely, with no built-in way to reclaim it short of a manual `rm -rf`.

**Decision.** A `Stop` hook, `hooks/scope-prune.js`, silently deletes a scope's run root once **all**
hold: (a) the scope's work is finished with, (b) the ledger's stage reads `shipped`, and (c) the run
root's newest file is older than a 7-day TTL. It never touches a scope whose
`worktree`/`worktrees/` subdirectory is still present (an interrupted cleanup, not a finished run — left
for a human to look at, same caution `worktree-sweep.js` already applies at the per-slice level).

**A scope's work is finished with when its branch is merged into the current branch, or when the branch
is gone.** Ancestry alone is not enough, because a squash merge creates none: the branch's commits never
become ancestors of the base, so `git branch --merged` never lists it. A code host that squash-merges
also deletes the branch, which is why absence carries the signal that ancestry lost. Absence is read
offline, from local and remote-tracking refs together: an unfetched remote-tracking ref still present
means the hook does not prune, which fails closed.

`worktree-sweep.js` keeps ancestry alone at the per-slice level, correctly — a slice branch merges into
the scope branch normally, so its ancestry survives.

The hook reads the scope's branch from the ledger's `**Branch:**` line, written by `scope.js init` —
exact-name membership, no guessing (`references/scope-mode.md`, `## The scope branch`). A pre-CLI ledger
carries no such line; only then does the hook fall back to recognising a branch by its shape — a change
type leading the run root's own name (`<type>/<scope>`) — per ADR 0021. A maintainer's `wip/<slug>` and a
`slice/<scope>/<id>` branch never count, in either reading.

The hook narrows `references/scope-mode.md`'s general rule on purpose. That section falls back to the
shape scan on two triggers: no `**Branch:**` line, or a named branch that fails
`git rev-parse --verify`. A command resolving the branch for its own work cannot tell a dead run from a
live one that has not yet cut its branch. The hook falls back on the first trigger only. A named branch
that fails to verify is exactly the squash-merge signal it wants. The hook reads that failure as evidence
the branch is gone, rather than guessing from shape.

**Considered options** for recognising a squash merge, all rejected in favour of branch absence:

- **`git cherry <base> <branch>`.** Patch-id matching. Measured against a real squashed scope of twelve
  commits: every one came back `+`, unmatched. A squash of several commits produces no upstream commit
  whose patch equals any one of them.
- **Comparing the branch's tree against the base over the paths the branch touched.** Measured on the
  same scope, and it detects the merge correctly — but it needs the branch, and the branch is gone.
- **Asking the code host whether the pull request merged.** Authoritative, and it puts a network call and
  a token inside a deterministic hook, where a failure is silent (ADR 0023 rejects that shape).
- **`/superdev:ship` recording the pull-request number for a later check.** Moves the network call out of
  the hook without removing it, and helps no run shipped before the change.

**Why.** The trail's value is front-loaded — reviewing a run shortly after it lands, or resuming after a
crash — and drops off fast once the PR has been merged for a week. 7 days balances that against
unbounded disk growth. A flat TTL is simpler than a per-scope config knob nobody has asked for yet.
Piggybacking on the existing `Stop` hook lifecycle (same event, same best-effort/silent contract as
`worktree-sweep.js`) needed no new hook event or wiring beyond one more entry in `hooks.json`'s `Stop`
array.

**Consequences.** `hooks/hooks.json` gains a second `Stop` hook. `package.json`'s `test` script gains
`node hooks/scope-prune.js --selftest`. `README.md`'s guardrails list and hook count, and
`AGENTS.md`'s hook inventory/count, are updated. A user who wants a specific run root kept longer than 7
days past merge has no override yet — copy it elsewhere before the TTL elapses; add a config knob if that
need actually surfaces.

Reading absence as completion widens what the stage gate carries. A branch deleted without ever merging
looks the same to the hook, so a run whose work never landed loses its trail seven days after
`/superdev:ship` recorded `shipped`. The stage is what keeps that narrow: only `/superdev:ship` writes it,
and only after ticking the Definition of Done and opening a pull request.

`/superdev:status` prints a shipped scope as one line, without its slice tally, because a run the hook is
about to reap is not work in flight. Its degrade record and staged-page lines survive that collapse: a
degraded pass is otherwise recorded only in the pull-request body, which this same prune outlives, and a
page nobody publishes is invisible everywhere else (ADR 0023).
