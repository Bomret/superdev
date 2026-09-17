# 0065: Containment refetches the base before it answers not contained

**Status:** Accepted

**Amends:** [ADR 0053](0053-containment-not-ancestry-decides-that-a-scope-branch-reached-base.md), whose
Decision states the containment test as a single pass against whatever `<base>` the caller resolves.

**Context.** ADR 0053 fixed the question the test asks: content, not ancestry, because a squash-merge
rewrites a branch's commits and leaves none of them reachable from base. It left the *ref* the question is
asked of untouched. Every caller resolves `<base>` to a local ref — `hooks/scope-prune.js` to `HEAD`,
`skills/publish-kb/SKILL.md` §3 and `## Cutting the scope branch` to the base branch named in
`docs/agents/code-management.md` — and nothing refreshes that ref.

A code host squash-merges the pull request. The operator's clone learns nothing until somebody pulls, so
the local base holds none of that work and the content test correctly reports that it does not. The
verdict is right about the ref and wrong about the world.

Reproduced 2026-09-17 on git 2.54.0, in a throwaway clone: a branch pushed, squash-merged on the remote,
and never pulled reads **not contained** against local `main`, and **contained** against what
`git fetch origin main` writes to `FETCH_HEAD`.

The cost lands on the callers ADR 0053 meant to fix. `/superdev:publish-kb` §3 asks "publish anyway?" on
every publish, which is the warning-fatigue ADR 0053 recorded, returned by a different route.
`/superdev:plan`'s refusal bullet blocks an append on a feature that shipped. The `appended` run kind
offers to rename a branch whose work is safe in base, and blocks outright under `--unattended`.

**Decision.** `references/scope-mode.md`'s `## Containment` section runs a second pass. The local test
runs first: contained ends it, and no network call happens. Not contained triggers one fetch of the base
branch from the remote named in `docs/agents/code-management.md`, a retest against `FETCH_HEAD`, and that
second verdict is the answer. The same second pass covers the `git merge-base --is-ancestor` fallback a
git older than 2.38 takes.

`FETCH_HEAD` is the retested ref, not `<remote>/<base>`: it is what the fetch just wrote, so it holds
whatever was fetched without assuming the clone's refspec maps the branch into `refs/remotes`.

`hooks/scope-prune.js` never fetches. It is a `Stop` hook firing on every finished turn, and a stale base
only defers a reap the seven-day TTL already delayed.

An `appended` reuse still re-points the branch to the local `<base>` with `git reset --hard`. The second
pass answers the containment question and never redefines what a caller means by base.

**Why.** Fetching only on a miss prices the network call where it changes an answer. A contained verdict
is already correct, and it is the common one on a repository whose operator works on base.

The section owns the test, so publish-kb §3, the plan refusal bullet, and the `appended` run kind inherit
the second pass without a line of their own — the same inheritance ADR 0053 established.

**Considered options.**
- *Fetch before every test.* Rejected: one code path, paid by every caller including the ones about to
  answer contained, and `hooks/scope-prune.js` would pay it on every turn.
- *Retest against `<remote>/<base>` without fetching.* Rejected: it helps only a clone something else
  already fetched, which is the clone least likely to be stale.
- *Also fix the conflicting-base case.* A base that edits the branch's files after taking its work
  conflicts against the fork point, exits 1, and reads not contained. Rejected: no git primitive decides
  whether a patch is already applied under later edits, so the test would need a heuristic that can be
  wrong in the unsafe direction.
- *`git fetch --prune`, so a host-deleted branch reads gone.* Rejected: nothing deletes the local
  `<type>/<scope>` branch, so the branch reads present whether or not the remote-tracking ref survives.

**Consequences.** A containment check can make a network call, and a caller that was silent and local is
neither in the miss case. Every such caller is operator-facing; the one that is not is excluded.

A fetch fails — offline, an unreachable host, a rejected credential, no such branch on the remote — or no
remote is configured at all. The local verdict stands and the caller says the second pass did not run,
which is today's behaviour plus an explanation.

`hooks/scope-prune.js` and the interactive callers can now disagree about one scope: the hook defers a
reap the operator's own `/superdev:publish-kb` treats as landed. The disagreement resolves itself the next
time anything updates the local base.
