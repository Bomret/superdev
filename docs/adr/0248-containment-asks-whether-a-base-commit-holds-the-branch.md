# 0248: Containment asks whether a base commit holds the branch

**Status:** Accepted

**Amends:** [ADR 0082](0082-containment-asks-whether-base-history-took-the-patch.md), whose second tier is the
last answer an inconclusive tree comparison gets.

## Context

`/superdev:publish-kb --scope suite-gate-before-ship-offer` refused a scope whose pull request had been
squash-merged into `main` as `a2ea84c7`, naming its branch "not contained in main". Measured on this
repository 2026-11-17, on git 2.54.0.

Both tiers missed it. `main` had gained commits in the branch's files after the merge, so the tree
comparison conflicted. `main` had also gained commits in those files between the branch's fork point and
the squash, so the squash commit's diff carried different context lines than the branch's cumulative diff.
`git patch-id --stable` hashes context lines, so the ids differed and the second tier found no match. A
host that squash-merges a long-lived branch onto a busy base meets both conditions routinely.

The squash commit itself held the branch: `git merge-tree --write-tree a2ea84c7 <branch>` yielded
`a2ea84c7`'s own tree.

## Decision

`references/scope-branch.md`'s `## Containment` runs a third tier where the second tier finds no match and
`--write-tree` runs. It lists the commits base gained since the merge base that touch a path the branch
changed, and runs the first tier's tree comparison against each one. A commit whose tree comparison reads
contained answers **contained**. None answers **not contained**.

The second tier's cap of 1000 commits bounds the candidate list. A failed `merge-base`, `diff`, or
`rev-list` answers not contained (INV-0003). `plugin/lib/containment.js` implements the tier as
`baseCommitHoldsBranch` and runs it inside `judgeContainment`, so `testContainment` and every caller of either
reads it. `hooks/scope-prune.js` requires it beside the second tier's probe and calls it with `HEAD` as its
base and no fetch, as ADR 0082 has the hook call the probe.

## Why

The tier decides an exact proposition: some commit in base's history holds every byte of the branch's
work. It is the first tier's own test, asked of an earlier point in base's history, so it adds no
heuristic. It is the proposition ADR 0082 names for both kinds of caller: a feature merged into base
reached its readers, and a branch whose work sits in base's history carries nothing unique.

The path filter keeps the cost on the commits that can hold the work. A commit that touches none of the
branch's paths has the fork point's content there, so it cannot hold a branch that changed them.

## Considered options

- *Ask the code host whether the pull request merged.* Rejected: the containment test is backend-agnostic,
  and a host answer says nothing about a branch that reached base outside a pull request.
- *Hash patch ids with no context lines.* Rejected: `git patch-id` has no such mode, and a hand-built hash of
  bare hunks matches unrelated changes that touch the same lines.
- *Leave `hooks/scope-prune.js` on the first two tiers.* Rejected for the reason ADR 0082 gives for the
  probe: a branch whose work a commit in base's history holds carries nothing the delete would lose, and the
  hook would otherwise leave such a branch and its run root standing past the TTL.

## Consequences

`/superdev:publish-kb`, `/superdev:wrap-up`'s push-only check, `scope.js push`, and `scope.js open` read a
branch squash-merged onto a moved base as contained. A conflicting branch that base never took pays one
tree comparison per candidate commit before it reads not contained, on the local pass and again after the
refetch. `hooks/scope-prune.js` pays the same per-candidate cost, only for a closed scope past its TTL
whose branch conflicts with `HEAD`, and reaps a branch squash-merged onto a moved base with its run root.
A module that lacks the tier leaves the hook on the tiers before it.
