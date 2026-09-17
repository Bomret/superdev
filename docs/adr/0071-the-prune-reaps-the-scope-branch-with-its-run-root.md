# 0071: The prune reaps the scope branch with its run root

**Status:** Accepted

**Amends:** [ADR 0007](0007-scope-prune-ttl.md), which gave the reap its TTL and its subject — the run
root alone. [ADR 0053](0053-containment-not-ancestry-decides-that-a-scope-branch-reached-base.md)'s
Context records "Nothing removes the local `<type>/<scope>` branch … and no later step returns for it."
It treats that as an observed fact about the clone, not as a gap anybody owns.
[ADR 0065](0065-containment-refetches-the-base-before-it-answers-not-contained.md)'s rejected
`git fetch --prune` option reasons that "nothing deletes the local `<type>/<scope>` branch," an assumption
this decision retires.

**Context.** `/superdev:ship` leaves the scope branch standing, correctly: the pull request is open from
it, and deleting it closes the request. Nothing else in superdev returns for it. The local
`<type>/<scope>` branch therefore outlives its own squash-merge indefinitely, and the
`origin/<type>/<scope>` remote-tracking ref outlives the host's deletion of the branch until somebody runs
`git fetch --prune`, which superdev neither runs nor may assume. On this repository both sets grow by one
per shipped feature and nothing ever removes either.

`hooks/scope-prune.js` already establishes exactly what a delete needs, for a different purpose. Before it
removes a run root it has proved four things: the run root has sat untouched past the seven-day TTL, its
ledger stage reads `shipped`, no worktree remains under it, and its branch is contained in the base by
content or gone (ADR 0053, ADR 0065). It reads the branch name off the ledger to run that containment test,
and it resolves the exact ref — local, or `<remote>/<name>` — to hand git. A branch that survives all four
gates is redundant by proof, and the hook is holding its name at the moment it discards the only record of
it.

**Decision.** The prune deletes the branch it just proved contained, in the same pass, immediately before
it removes the run root:

```sh
git branch -D <branch>                              # the local ref
git update-ref -d refs/remotes/<remote>/<branch>    # the remote-tracking ref, when one exists
```

`-D`, not `-d`: `-d` applies the ancestry test that ADR 0053 replaced, so it refuses every squash-merged
branch. Containment by tree is the stronger proof and it has already been made.

Three bounds hold the delete to what the hook can prove:

- **Only a ledger-named branch is deleted.** `resolveBranch`'s shape scan exists for a pre-CLI ledger
  carrying no `**Branch:**` line, and it can match a branch belonging to a different run whose slug drifted.
  A shape-scanned name still gates the run-root prune exactly as today, and is never deleted.
- **A failed delete keeps the run root.** The ledger is the only record of the branch's name, so removing
  it after a failed delete strands the branch with nothing left to name it. Both are retried on the next
  `Stop`.
- **The delete is local and silent.** No host call, no fetch, no output — the hook's existing contract
  (ADR 0023, ADR 0053, and ADR 0065's rule that this hook never fetches).

**Why.** The four gates are a containment proof that the hook already pays for, and it currently spends
that proof on the cheaper half of the cleanup. Deleting the run root while keeping the branch leaves the
clone in the one state where nothing can recover the association: the branch is anonymous the moment its
ledger is gone. Doing both together means the two never disagree, costs one git call per reaped scope, and
adds no gate, no config, and no schedule.

**Considered options.** *Delete on containment alone, ahead of the TTL.* The branch is redundant as soon
as base holds its content, so a second earlier pass would reap it within a turn of the merge. Rejected: it
needs its own selection path and its own tests, and it inverts the ordering above — the run root then
outlives its branch for a week with a `**Branch:**` line pointing at nothing. *Delete on the shape scan
too*, which is the only way to reach a branch whose ledger predates the CLI. Rejected: a wrongly pruned run
root is recoverable from the slice store, a wrongly deleted branch only from the reflog. *Reap the branches
already stranded*, whose run roots were pruned before this decision. Rejected as a non-goal: they carry no
ledger and no run root, so any reaper for them deletes on the shape scan by definition, to clear a set that
never grows again. A human clears them once. *Ask the code host whether the pull request merged*, and
delete on that. Rejected for the reason ADR 0053 already recorded: a network call and a token inside a
deterministic `Stop` hook.

**Consequences.** A clone's branch list stops growing by one per shipped feature. `git branch -a` shows the
work in flight instead of every feature since the repository began, and `/superdev:plan`'s append refusal,
`/superdev:implement`'s `appended` run kind, and `/superdev:publish-kb` §3 each meet a smaller, truer ref
set — every one of them already treats a gone branch as finished with.

`references/scope-mode.md`'s `fresh` run kind states that a squash-merged scope's branch stands until
`hooks/scope-prune.js` reaps it with its run root. It stands indefinitely only where that reap cannot name
it (ADR 0007, ADR 0071). The collision it warns about is `-b` failing on a name already taken. That still
survives on the two paths this decision leaves untouched: a shape-scanned name, and a branch whose delete
failed. The stop it prescribes is unchanged; its reasoning is narrower.

The reap stays invisible, so a branch deleted in error is recovered from the reflog, and only within the
reflog's own expiry. That is the same exposure the run-root reap has carried since ADR 0007, against a
stronger proof than that reap requires of itself.
