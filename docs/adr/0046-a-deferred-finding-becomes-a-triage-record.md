# 0046: A deferred finding becomes a triage record in the slice store

**Status:** Accepted

## Context

ADR 0035 gave a deferred finding two homes: the review's own report, and the run's ledger, from where
`/superdev:ship` copies it into the pull-request body. That ADR's own Consequences section named the
remaining cost — "a follow-up in a pull-request body is a prompt, not a plan".

Both homes are temporary.

`hooks/scope-prune.js` deletes a run root once the ledger stage reads `shipped`, the scope branch is
merged or gone, and the staleness TTL has passed (ADR 0007). The `**Deferred:**` line goes with it. The
run-state mirror does not save it either: `## Run state` is published to the scope anchor's body
(ADR 0042), and `/superdev:ship` closes that anchor. What survives a shipped scope is the pull-request
body, and a merged pull request is a record rather than a work item — it appears in no backlog and no
query.

So the one record naming work nobody has planned ends up somewhere nobody looks, and acting on it depends
on the maintainer remembering it. That is the failure the record was created to prevent.

## Decision

**`/superdev:review` creates a triage record in the configured slice store at the moment it defers a
finding, and the ledger bullet carries that record's reference.**

A **triage record** is a store-native record for unplanned work: an issue carrying the store's `triage`
label on an issue backend, a file under `docs/plans/triage/` on the local plan-file store. It is
deliberately not a slice and not a scope anchor — it carries no feature label and no `ready` label, so
`/superdev:afk` and `/superdev:implement` never select it. Only a human, or a later `/superdev:plan`
interview a human starts, acts on it.

Three properties fix its shape:

- **The writer is `/superdev:review`, not `/superdev:ship`.** A run reviewed and then abandoned never
  reaches ship, and its run root is pruned with the findings still inside. The command that finds the
  work records it.
- **Provenance is what exists at defer time.** The record names the feature label, the scope branch, and
  the scope anchor's reference. It never names a pull request: `/superdev:review` runs before
  `/superdev:ship` opens one, and a patch-back pass to add the URL later would add a write and a failure
  mode to buy a link the anchor already leads to.
- **The write is best-effort, like every other store call.** A failure or a denial leaves the ledger
  bullet written and the review unblocked, reported once per run. The ledger stays authoritative, which
  is the same contract `## Publishing run state` already holds.

The existing homes stay. The ledger bullet is still written, and `/superdev:ship` still copies it into
the pull-request body — the bullets now carry a reference, so that copy links a live work item instead of
restating prose. Nothing is removed, because the two temporary homes are still the right ones for a run
in flight; what they lacked was an heir.

## Considered options

- **Create the records at `/superdev:ship`, in one batch from `scope.js get deferred`.** Fewer store
  calls, one place to change, and no per-finding deduplication to think about, since the ledger has
  already deduplicated by then. It loses on the case that matters: a scope reviewed and abandoned is
  exactly the scope whose findings most need an heir, and ship never runs on it.
- **A GitHub Projects draft issue.** The user's request named a draft or not-ready state, and GitHub has
  a literal one. Verified 2026-08-27 against GitHub's *Adding items to your project* documentation: a
  draft issue "exist[s] only in your project", carries no labels, milestones, or repository until it is
  converted, and is reachable only through GraphQL. The REST create-an-issue endpoint has no draft state,
  and Forgejo has none at all. A label is the one shape all four backends can express, so the plugin
  spells "not ready" as `triage` rather than pinning the concept to one host's project boards.
- **Stop pruning a run root that carries a deferred finding.** The smallest possible change: one condition
  in `hooks/scope-prune.js`. It loses because it preserves the record in a git-ignored scratch directory
  the maintainer never opens, and it makes the prune hook's fail-closed logic depend on ledger content
  beyond the stage line.
- **Have `/superdev:plan` read and close open triage records.** The loop's real closure. It is deferred
  rather than rejected: it adds a store read to every plan run, a close path, and a rule for a record only
  partly planned, and none of that is needed for the finding to reach a backlog. The record's body carries
  a copy-pasteable `/superdev:plan "<finding>"` line instead, which is the same bridge at no cost.

## Consequences

Unplanned work found by a review lands where the team already looks for work. A shipped, pruned scope
loses nothing, and a scope that never ships loses nothing either.

The store gains records nobody planned to create, which is the point and also the cost: a repository that
defers often accumulates a triage backlog, and nothing in the plugin grooms it. That is a human's job, by
the same reasoning that keeps `/superdev:afk` away from it.

Deduplication stays per-run. `/superdev:review` reads `scope.js get deferred` before writing, so one run
never creates two records for one finding, but two scopes that defer the same finding create two records.
Cross-run deduplication would need a store query per deferral and a matching rule for prose, which is more
machinery than a duplicate in a triage backlog costs.

The `triage` label itself is store configuration, a line in `docs/agents/issue-tracker.md` beside
`Feature label`, so a repository that already spends that word elsewhere renames it without touching the
commands.
