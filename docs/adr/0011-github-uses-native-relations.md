# 0011: GitHub uses its native relations for epic and dependency links, and the feature label still lists slices

**Status:** Accepted

**Context.** Every issue-backed slice store must answer three questions: how a slice points at its epic,
how a slice records what it depends on, and how `/implement` finds a feature's slices. GitHub models the
first two natively, each with a documented REST API: sub-issues for the parent-child link, and
`dependencies/blocked_by` for blocking. This repo's Forgejo rendering answers both with body text instead, because Forgejo's
issue-dependencies unit is disabled here.

**Decision.** On GitHub both relations are **native**: a slice is linked to its epic as a sub-issue
(`POST /repos/{owner}/{repo}/issues/{epic}/sub_issues`), and each `depends-on` edge is a real dependency
(`POST /repos/{owner}/{repo}/issues/{blocked}/dependencies/blocked_by`). The **feature label remains the
only listing path** (`GET /issues?labels=feat/<slug>&state=all`). The relations are structure, not lookup.

**Why.** Native relations render in GitHub's UI: the epic gets a progress rollup, a blocked issue shows
what blocks it. Body text cannot do that. Both APIs key on the global issue `id` that the create response
already yields for the sub-issue link, so the second relation adds no new bookkeeping. The alternative of
one shared mechanism across backends was never real: Jira already uses native "is blocked by" links, so
`depends-on` has always been per-backend.

The label survives as the listing path because a single-slice feature writes no epic (`plan-contract.md`,
ADR 0005). There would be no parent to enumerate from, so lookup-by-relation needs a second code path for
the epic-less shape, and the two would have to agree on the same slice set. One label query works in both.

**Considered options.**

- *An `**Epic:** #<n>` body line, mirroring Forgejo exactly*. Rejected: free in the create call, but it
  throws away the one relation GitHub models natively and readers see.
- *A `**Depends on:** #<n>` body line for dependencies*. Rejected once `dependencies/blocked_by` was
  confirmed to exist. Its remaining argument was that `/implement` could read the edge from an issue body
  it had already fetched, saving a request per slice. A rendered blocking relationship is worth more than
  that request.
- *Sub-issues for `depends-on`*. Rejected: the parent-child link is the wrong relation for blocking, and GitHub
  models the two separately.
- *Sub-issues as the listing path, dropping the feature label*. Rejected: requires an epic on every
  feature, contradicting the optional-epic rule.
- *`gh` as the seed's primary tooling*. Rejected: `gh issue create --parent` collapses create-and-link
  into one call, but it prints a URL rather than JSON, and both relation calls need the global `id` off
  the create response. REST returns it, and `gh` is documented as an alternative.

**Consequences.** Each relation costs one request per edge, fanned out in parallel once every slice exists.
The seed must capture **two** identifiers per slice: the `number` that is the slice `id`, and the global
`id` that `sub_issue_id` and `issue_id` take. Both relation calls mix them, taking a `number` in the
path and an `id` in the body. That distinction reads like a typo and is restated wherever it appears. The
two relations degrade differently: a failed sub-issue link is cosmetic and logged, while a failed
dependency write silently corrupts the execution order and stops the run instead. Backends differ in how a
slice reaches its epic and its blockers, so both mappings are per-seed rather than shared rules in
`plan-contract.md`.
