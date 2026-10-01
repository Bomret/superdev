# 0048: A local-store triage record needs its scope to ship

**Status:** Superseded

**Superseded by:** [ADR 0110](0110-the-local-file-slice-store-is-removed.md), which removes the local-file
slice store.

**Amends:** [ADR 0046](0046-a-deferred-finding-becomes-a-triage-record.md).

## Context

ADR 0046's Consequences section claims "a shipped, pruned scope loses nothing, and a scope that never
ships loses nothing either." That holds on an issue-tracker backend, where the create call
(`docs/agents/issue-tracker.md`'s `## Triage record` section) reaches the backend directly. The record is
a live issue in the backlog from the moment it is created, independent of the scope branch's own fate.

The local plan-file store keeps no such independence. `references/issue-tracker-local.md`'s own
`## Triage record` section states it: "`/superdev:review` commits the file on the scope branch, in the
scope checkout, the moment it creates it — like every other plan file here." A shipped scope merges that
commit, and the record lands in `docs/plans/triage/` on the branch everyone reads. A scope reviewed and
then abandoned never merges. ADR 0046's Decision section names that exact case as the one a review-time
write exists to cover.

The record still exists: it is a real commit on a real branch, findable by anyone who checks that branch
out. It sits in no listing `/superdev:afk` walks and no directory a human browsing `docs/plans/` on the
default branch sees. It also sits in no `git log` anyone reads without first knowing the abandoned
branch's name. It is present, but exactly as unreachable as the pull-request-body-only home ADR 0046
exists to replace.

## Decision

**On the local plan-file store, a triage record is only as durable as the scope branch it was committed
to.** ADR 0046's "a scope that never ships loses nothing either" holds only for a store whose
triage-record write is independent of the scope branch. That store is an issue-tracker backend, where
the create call lands server-side the moment it runs. It does not hold for the local store. There, an
abandoned scope's triage record needs that scope to ship before it reaches anywhere a listing or a human
would find it. Shipping means merging the scope branch.

This is a narrow qualification, not a reversal: the write itself, the record's shape, and the writer
(`/superdev:review`, not `/superdev:ship`) all stand as ADR 0046 decided. What changes is the claim about
what an abandoned scope loses on one specific backend.

## Consequences

ADR 0046's Consequences section keeps its general claim for every backend whose record write is
backend-side and branch-independent, and loses its universal "either" for the local store, where the
record rides the scope branch like every other plan file that store keeps.

Nothing in the plugin merges an abandoned scope branch on its own, and nothing here adds that: recovering
a local-store triage record left on an abandoned branch is the same manual `git log`/`git show` a
maintainer would already reach for to recover any other uncommitted work on that branch. The qualification
records the limit; it does not close it.

A team that wants a triage record to survive an abandoned scope regardless of merge state configures an
issue-tracker backend instead of the local store — the same trade-off `references/issue-tracker-local.md`
already states for release gating ("A team that wants a release gate on plan files configures a different
store").

## Considered options

**Make the local store commit the triage record directly to the default branch, bypassing the scope
checkout.** Rejected: it would write to a branch `/superdev:review` never checks out, outside every other
write this command makes, and it reintroduces exactly the merge-conflict risk `references/
issue-tracker-local.md`'s `## Run state` section rejected a run-root commit for — "conflicts on every
slice merge and lands in the pull request."

**Edit ADR 0046 in place.** Rejected, per `references/domain-modeling.md`'s revise-in-place rule: the
decision still stands and gains one condition, so this is the amend case, not the edit case.
