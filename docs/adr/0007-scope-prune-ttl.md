# 0007 — Completed scope run roots are pruned on a TTL, not kept forever

**Status:** Accepted

**Context.** ADR 0001 established the run root (`dod.md`, `ledger.md` under `.superdev/scopes/<scope>/`)
as a post-mortem trail that survives worktree removal — deliberately never deleted by `/implement` itself.
Nothing else deletes it either: it's git-ignored, so it never pollutes the repo, but it also never goes
away. A long-lived repo run through many `/superdev:implement` scopes accumulates one leftover directory
per scope indefinitely, with no built-in way to reclaim it short of a manual `rm -rf`.

**Decision.** A new `Stop` hook, `hooks/scope-prune.js`, silently deletes a scope's run root once **both**
hold: (a) the scope branch is merged into the current branch, and (b) the run root's
newest file is older than a 7-day TTL. It never touches a scope whose branch isn't merged (still active)
or whose `worktree`/`worktrees/` subdirectory is still present (an interrupted cleanup, not a finished
run — left for a human to look at, same caution `worktree-sweep.js` already applies at the per-slice
level). Mirrors `worktree-sweep.js`'s merged-branch check one level up: scope branch instead of slice
branch.

The hook recognises a scope branch by its shape — a change type leading the run root's own name
(`<type>/<scope>`) — per ADR 0021. A maintainer's `wip/<slug>` and a `slice/<scope>/<id>` branch never
count.

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
