# 0011 — GitHub links an epic to its slices with native sub-issues; the feature label still lists them

**Status:** Accepted

**Context.** Every issue-backed slice store must answer two questions: how a slice points at its epic, and
how `/implement` finds a feature's slices. The Forgejo rendering answers both with body text and a label —
an `**Epic:** #<n>` line plus a `feat/<slug>` label — because Forgejo's issue-dependencies unit is disabled
on this repo. GitHub has a native parent/child relation (sub-issues) with a REST API, so the same answer
isn't forced.

**Decision.** On GitHub, a slice is linked to its epic as a **native sub-issue**
(`POST /repos/{owner}/{repo}/issues/{epic}/sub_issues`), and the **feature label remains the only listing
path** (`GET /issues?labels=feat/<slug>&state=all`). Sub-issues are additive structure, not the lookup
mechanism. `depends-on` stays a `**Depends on:** #<n>` body line.

**Why.** Sub-issues give GitHub readers the rollup and progress bar they expect, which body text cannot.
But they cannot be the listing path: a single-slice feature writes no epic (`plan-contract.md`; ADR 0005),
so there would be no parent to enumerate from, and `/implement` would need two lookup paths that must agree
on the same slice set. One label query works with and without an epic. `depends-on` gets no native
treatment because GitHub exposes no REST endpoint for issue dependencies — sub-issues model parent/child,
which is the epic relation, not a blocking one.

**Considered options.**

- *An `**Epic:** #<n>` body line, mirroring Forgejo exactly* — rejected: uniform across both Git hosts and
  free in the create call, but it throws away the one relation GitHub models natively and readers see.
- *Sub-issues as the listing path, dropping the feature label* — rejected: requires an epic on every
  feature, contradicting the optional-epic rule.
- *Sub-issues for `depends-on`* — rejected: parent/child is the wrong relation, and no REST API exists.
- *`gh` as the seed's primary tooling* — rejected: `gh issue create --parent` collapses create-and-link
  into one call, but it prints a URL rather than JSON, and `/plan` needs `number` (the slice id) and `id`
  (for `sub_issue_id`) off the create response. REST returns both; `gh` is documented as an alternative.

**Consequences.** Linking costs one extra request per slice, fanned out in parallel alongside the
`depends-on` body patches once every slice exists. The seed must capture **two** identifiers per slice —
the `number` that is the slice `id`, and the global `id` that `sub_issue_id` takes — a distinction that
reads like a typo and is worth stating wherever it appears. Backends now differ in how a slice reaches its
epic, so that mapping is per-seed rather than a shared rule in `plan-contract.md`.
