# 0120: Implement brings the remote base into the scope branch before the first slice

**Status:** Accepted

**Amended by:** [ADR 0126](0126-a-numbering-collision-is-found-by-number-not-by-conflict.md).

**Amends:** [ADR 0079](0079-a-planned-ledger-hands-the-scope-branch-from-plan-to-implement.md) for when the base reaches
the scope branch.

**Amended by:** [ADR 0152](0152-a-red-base-gate-lets-the-operator-name-the-slices-that-fix-it.md), which lets
the operator name the slices that fix a red full-suite record.

**Amended by:** [ADR 0173](0173-the-scope-review-brings-the-base-in-at-entry.md), under which
`/superdev:review` also brings the base into the scope branch at entry.

## Context

`/superdev:plan` cuts the scope branch from the local base branch and writes a `planned` ledger.
`/superdev:implement` then runs as `resumed` and cuts nothing. Its slices build on the base the branch
was cut from. The base can be stale in two ways. The local base can move after plan cut the branch, for
example because another scope shipped. The local base can also lag the remote, because the code host
squash-merged pull requests that this clone never fetched.

Only `/superdev:ship` §4 merges the base into the scope branch. A conflict or a red suite caused by
drift therefore surfaces after every slice, the review, and the documentation pass already ran against
the old base.

## Decision

- **Every implement invocation brings in the base, after the run lock and before the first slice.** A
  section of `references/scope-mode.md` states the step, and both execution playbooks call it. It runs
  at every run kind.
- **The fetched remote base tip is always the merge target, and the step records it.** The step fetches
  the base branch from the remote that `docs/agents/code-management.md` names, without a terminal prompt
  and under a time bound, and captures the fetched tip. It merges that tip into the scope branch in the
  scopetree whether or not the local base could advance to it, and records the tip with
  `scope.js base set` as the ledger's `**Base:**` header. Commits that only the local base carries are
  not brought in.
- **A scope's range base is the newer of `merge-base(<base>, <scope branch>)` and the recorded tip.** The
  recorded tip counts only when it resolves and is an ancestor of the scope branch. Where no usable record
  exists, or neither candidate holds the other, the range base is the merge-base. `scope.js base resolve`
  computes it, and `references/scope-mode.md`'s `## The scope's range base` states the rule once. Review,
  the doc pass, run handoff, resume's cross-check, ship's `deployment.md` diff, and the implementer's
  resume read it there, so every range holds only this scope's commits even while the local base lacks
  the merged tip. Containment keeps its own test.
- **The local base ref advances by a ref-only fast-forward.** The step runs
  `git fetch . <tip>:refs/heads/<base>`. Git refuses this when the base is checked out in any worktree,
  or when the update is not a fast-forward. A refusal is skipped and named in the report. No working
  tree outside the scopetree changes. INV-0001 admits this write as its only local-git write to the base
  branch. The merge in the previous decision runs after a refusal as it does after a success.
- **The `lite` tier skips the step while a slice is in progress.** A dirty scopetree with an
  `in-progress` slice holds that slice's uncommitted work, which the `lite` playbook's `## Resume`
  handles. The step skips and names the skip in the report, and the next invocation brings the base in.
  At the full tier any dirty scopetree stops the step.
- **The full suite gates the merge.** The result is recorded for the merged tip. A red result
  dispatches no slice, and each later invocation runs the full suite again until the record is green.
  A scope branch that already contains the tip, with a green record for its current tip, gets no merge
  and no suite run.
- **The controller resolves a conflict by intent**, per `references/merge-conflicts.md`. A colliding ADR
  or invariant number that this scope added moves to the next number free on both sides. A
  winner-picking overlap aborts the merge and escalates. An unattended run blocks.
- **A base that cannot be fetched is a degraded pass.** No remote, a failed fetch, an exhausted time
  bound, or a remote without the base branch: the run continues on the local base and records the
  reason in the degrade record, with no `**Base:**` record written. A local base can carry commits that
  were never pushed. The degraded pass brings those commits into the scope branch. This is an accepted
  exception to the rule that commits only the local base carries are not brought in.

## Considered options

- *Fast-forward the local base inside the operator's checkout* (`git -C <worktree> merge --ff-only`,
  when the checkout is clean). It covers the common case, where the base is checked out in the main
  working tree. Rejected: it writes the operator's working tree and fires the green-gate there.
- *Fast-forward the local base by any method, then merge the local base.* Rejected: it writes the base
  branch with local git, against INV-0001, to update a ref the pull request never reads.
- *Merge the fetched tip even when the fast-forward is refused.* Rejected: the tip then reaches the
  scope branch while the local base lacks it, so `merge-base(<base>, <scope branch>)` falls behind the
  tip and every range built on it (review, the doc pass, run handoff, ship) holds the remote's commits
  as well as this scope's.
- *Merge the local base instead of the fetched tip after a refused fast-forward.* Rejected: it keeps
  every range limited to this scope's commits, but the scope branch then lacks the remote's newer
  commits in the usual setup, where the base is checked out in a worktree and the fast-forward is
  always refused. The recorded tip and the range base rule keep the remote half and the ranges both.
- *Report the drift and leave the merge to the operator.* Rejected: it keeps the manual step that lets
  drift reach ship.
- *Merge only the local base, with no fetch.* Rejected: a local base that lags the remote stays stale.
- *Merge only on the first run after `planned`.* Rejected: drift that builds up during a run over
  several sessions would still reach ship. Every invocation costs one fetch, and a suite run only when
  the base moved.
- *Cut a `fresh` branch from the fetched tip.* It saves one merge call. Rejected: the cut's containment
  and reuse path would reason about a second base.
- *Append the step to the cut section.* It saves two playbook edits. Rejected: `/superdev:plan`'s own cut
  reads that section, and the merge would run before the run lock is written.
- *Abort on any conflict, as ship §4 does.* Rejected: the scope's design-docs commit and other scopes
  edit the same glossary, ADR, and invariant files, so most conflicts are additive. Ship aborts because
  a resolution there is unreviewed code. At implement, the review still follows.
- *Revert the merge on a red suite.* Rejected: a reverted merge makes a later merge of the same base tip
  a no-op, so the drift would come back unseen.

## Consequences

- Drift between plan and implement, and drift between sessions of one run, surfaces before slice work
  starts.
- Every implement invocation makes one fetch from the remote.
- A conflict that plan's design docs cause is resolved at implement, not at ship.
- After a refused fast-forward the scope branch holds the fetched remote tip, and the local base lags it
  until the operator pulls.
- Every chain range reads the range base through one verb, so a consumer that rebuilds a range from
  `merge-base` by hand takes the remote's commits as this scope's. A drift row pins each consumer's
  citation.
- One case stays open. When the local base holds commits never pushed and a merge brought it into the
  scope branch (ship §4 or the degraded path) while a tip is on record, the two candidates are
  incomparable. The fallback `merge-base` can then let the recorded tip's remote commits into the range.
- The ledger carries one more header, `**Base:**`, and it survives publish and adopt.
- Ship §4 still merges the base, for drift that arrives after implement.
