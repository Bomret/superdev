# 0287: A prototype branch is pushed on a yes and torn down with its run

**Status:** Accepted

**Amends:** [ADR 0286](0286-a-prototype-detour-is-a-cross-exam-move-built-in-its-own-worktree.md).

**Context.** ADR 0286 commits a prototype on a local `prototype/<slug>` branch and names it in a slice `spec`, an
ADR, or brainstorm's intent record. Nothing pushes that branch, so the pointer resolves only in the planner's clone.
Its readers are people elsewhere: a teammate who claims the scope (ADR 0281), a reviewer, or an operator in a sibling
repository on a shared anchor (ADR 0285).

**Decision.** `/superdev:plan` asks once, at its end-of-run push, whether to push the prototype branches its slice
specs name. On yes, `scope.js` pushes each local `prototype/<slug>` to the scope branch's remote as
`prototype/<scope>/<slug>`, never by force, and records the branch and its pushed tip in the run's ledger. Every
`Prototype:` line is written to the store as local to the planner's clone, and plan rewrites a line to name the remote
branch only after its push is confirmed. `/superdev:wrap-up` deletes every recorded prototype branch in its cleanup,
whatever the scope branch's containment verdict, each under a lease on its recorded tip. `/superdev:brainstorm`
pushes nothing. An ADR names no prototype branch: it records the validated decision itself, because a pushed branch
lives only as long as its run.

**Considered options.**

- *Mark the pointer local-only and never push.* It keeps ADR 0286's exclusion intact. It lost because it leaves the
  prototype unreachable for exactly the readers the pointer is for.
- *Attach the prototype to the slice store as a comment or gist.* It needs no branch on the remote. It lost because
  each store seed would need its own call, under its own size limit.
- *Keep a prototype branch an ADR cites.* The ADR's evidence stays reachable. It lost because nothing would ever
  prune those branches.
- *Push from `/superdev:brainstorm` too.* It reaches a reader before any plan. It lost because brainstorm has no run,
  so nothing would tear down a branch whose intent never reaches a plan.
- *Ask and push before the store write.* Each line is written once, in final form. It lost because no ledger exists
  yet to record the push, so a failed store write leaves a pushed branch that nothing tracks.

**Consequences.** A prototype stays reachable from the plan's push until wrap-up, and no longer. A run that never
reaches wrap-up keeps its prototype branches on the remote, as it keeps its scope branch. The local branch keeps its
unscoped name, because a prototype is often cut before the feature label exists.
