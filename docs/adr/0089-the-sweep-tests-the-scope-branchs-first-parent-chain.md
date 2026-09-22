# 0089: The slicetree sweep tests the scope branch's first-parent chain

**Status:** Accepted

**Records** the decision shipped in `f4fa2f7` (release 0.50.2), which carried no ADR of its own. The
measurements below were taken separately, while a competing repair was being built; both are recorded
here because each falsifies a claim the triage records carry, and because the alternative was measured
rather than argued.

**Context.** `plugin/hooks/slicetree-sweep.js` removes a slicetree once its work is integrated. It
selected on two conditions: the slice branch merged into its own run's scope branch, and the branch
**worked** — carrying at least one commit unreachable from the repository's default branch.

A slice branch is cut from the scope branch, not from the default branch. Past a run's first merge — or
its first design capture — the scope branch is ahead of base, so a freshly cut slice branch already
carries commits unreachable from `main`. It read as worked while holding nothing of its own, and was
trivially merged into the branch it was cut from. Both conditions passed, and the `Stop` hook removed the
slicetree before its implementer's first commit.

Recorded as triage #524 on 2026-09-18, under the hook's former name `worktree-sweep.js`, and
rediscovered and filed again as #619 on 2026-09-22 after three reproductions on one run. Both records are
now corrected, because both carried a false claim.

**No work is destroyed.** `git worktree remove` runs without `--force`, so git refuses a worktree holding
modified or untracked files; the call throws and the `git branch -D` after it never runs. Gitignored
files are the one exception: `git worktree remove` deletes them from an otherwise clean tree, so a
slicetree's own `node_modules/` does not stop a removal, though it holds no work in the sense this
section means.

The table below measures the hook **before** the decision below, on the two-condition guard the
Context section describes:

| Slicetree state | Result |
|---|---|
| Empty, freshly cut | reaped, slice branch force-deleted |
| One tracked file modified | survived, contents intact |
| One untracked file only | survived, contents intact |

The exposure window therefore closes at the implementer's **first write to disk**, not its first commit,
which is why every observation on both records is of an empty tree vanishing. The cost is turns — about a
third of one dispatch on the run that reported it — rather than work.

**Comparing the worked set against the scope branch does not fix it**, which is the remedy both records
proposed:

```
FRESH slice  — commits beyond scope branch = 0
MERGED slice — commits beyond scope branch = 0
MERGED slice — commits beyond main         = 2
```

A merged slice's commits are *in* the scope branch, so "commits beyond the scope branch" is empty for it
exactly as for a slice that has done nothing. The worked set would empty for every slice, nothing would
ever be selected, and the defect would close by disabling the sweep. The default branch is the only ref
against which a merged slice still shows commits, so the original code was paying the fresh-slice window
for the only content signal available to it. A trade, not an oversight.

**Decision.** Keep the content signal and sharpen it. A slicetree is removed when its branch is merged
into its own scope branch **and** is worked, where worked now means both that it carries a commit
unreachable from the default branch **and** that its tip is off the scope branch's own first-parent
chain.

The first-parent half is what recognises a fresh slice. A slice branch cut from the scope branch points
*at* a commit on that branch's first-parent chain, while the `--no-ff` merges a run makes carry slice
commits in as second parents — so, as long as every merge stays `--no-ff`, a slice that did work never has
its tip on that chain, and one that did nothing always does. (A fast-forwarded merge breaks the first half,
per Consequences below; a scope branch level with base breaks the second, since the chain is then empty and
the default-branch content check is what catches the fresh slice instead.) The chain is bounded by the
run's own commits rather than the repository's history.

Every path that cannot answer leaves the directory alone, per scope rather than per sweep: an unreadable
ledger, a ledger naming no branch, a branch that does not resolve. That direction is asymmetric on
purpose — leaving a directory behind costs disk, removing one costs an implementer its working tree
mid-dispatch.

**Consequences.** A **fast-forwarded** slice branch does land on the scope branch's first-parent chain and
is left standing. That is a slicetree outliving its slice, never one removed while live, and it is the
accepted cost of the sharper content test.

The hook keeps its existing shape: no new export, no new dependency, and `plugin/scripts/scope.js`
unchanged. The repair is 33 lines in the hook and 67 in its suite.

**Why the suite reported health throughout.** `tests/slicetree-sweep.test.js` covered this hook well —
two scopes judged independently, a cross-scope ancestor, an unreadable ledger, an unresolvable branch, a
singular scopetree, an unavailable reader. Every one of those fixtures created its scope branch **level
with base**. The defect requires a scope branch ahead of base, so no case in the suite could construct its
precondition, and a fresh slice branch failed the old guard for an accidental reason rather than the
stated one.

That generalises past this hook: a suite that cannot express the state a defect requires reports health
forever, and adding cases does not help, because what is missing is a fixture shape rather than a case.
When a defect survives a suite that appears to cover its subject, the fixture's construction is the thing
to distrust first.

**Considered options.**

- *Compare the worked set against the scope branch.* Rejected: measured to empty the set for every slice,
  which closes the defect by disabling the sweep. Named as the remedy by both triage records.
- *Take the slice's status from the run's own ledger, with containment as the second condition.* Built and
  measured on a branch that was not merged. It fixes the defect and keeps the sweep working, and its
  argument was that content answers *is this branch's work integrated* where the hook is deciding *is
  anyone standing in this directory*. Rejected on measurement: both designs behave identically on the
  defect and on a genuinely finished slice; the ledger design differs on two cases only. It survives a
  slicetree whose slice was `--no-ff` merged and then reopened at `in-progress` — a state
  `references/implement-full.md` forbids, since a merged slice is never re-dispatched and its slicetree is
  cleaned up instead. And on a ledger carrying no slice table it never sweeps that scope again, where the
  shipped design reaps correctly on unambiguous content. It also costs an export, a hook-to-script
  coupling, and five times the lines. A sharper content test that answers the same questions is the
  cheaper correct answer.
- *Leave the defect and document the empty-commit mitigation* — an empty commit on the slice branch right
  after `git worktree add`, which breaks containment and makes the slicetree ineligible from the moment it
  exists. Rejected: it costs every implementer a command and an explanation, and is invisible to anyone
  who has not hit the defect, which is how a four-day-old record came to be rediscovered rather than read.
