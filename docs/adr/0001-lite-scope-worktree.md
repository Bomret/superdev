# 0001: Lite runs execute in a dedicated scope worktree

**Status:** Accepted

**Amended by:** [ADR 0045](0045-the-full-tier-runs-in-a-scope-worktree.md), which discharges the
follow-on this record deferred: the `full` tier cuts its scope branch into the same scope worktree, so
neither tier switches the invoking checkout.

**Context.** Both tiers cut the scope branch with `git switch -c superdev/<scope> <base>` in the
*invoking checkout*, the repo's single shared working tree. (ADR 0021 later fixed that branch's name as
`<type>/<scope>`.) The lite tier then implements every slice
inline in that shared tree. So two superdev sessions in the same repo directory collide (the second `git
switch` yanks the tree out from under the first's uncommitted work), and the user's own checkout is
hijacked onto the scope branch.

**Decision.** superdev never switches the invoking checkout. A **lite** run cuts its scope branch into a
**dedicated scope worktree** at `.superdev/scopes/<scope>/worktree/` and does all inline implementation, commits,
and tests there. The **run root** (`dod.md`, `ledger.md`) stays in the invoking checkout's
`.superdev/scopes/<scope>/`, so it survives worktree removal as the post-mortem trail. A **deterministic hook**
enforces a same-scope run lock (`.superdev/scopes/<scope>/run.lock`): a *fresh* lock blocks a second concurrent
run of the same scope, and a *stale* lock is reclaimable (crash resume). Converting the **full** tier's
scope integration to a worktree is deferred to a follow-on, because full is already per-slice isolated.
Its only remaining offender is the scope switch and the merge in the invoking tree.

**Why.** Real trade-off: one `git worktree add` of overhead for lite versus the shared-tree simplicity it
gives up. Chosen so same-dir parallel sessions are safe and the user's checkout is left untouched
(still on main, still editable) while a run executes. Hard to reverse once runs depend on the
path-and-branch convention.

**Consequences.** Lite gains a single scope worktree (not per-slice). Run root and worktree are separate
locations (ledger in the invoking checkout, code in the worktree). The controller must use the worktree
as cwd for every git, file, and test operation, and the green-gate hook runs the test command there.
`hooks/worktree-sweep.js` is unaffected: it only reclaims `.superdev/scopes/<scope>/worktrees/<id>` (plural), so
it never touches the singular scope `worktree/`. Full-tier runs still switch the invoking checkout until
the deferred follow-on lands.
