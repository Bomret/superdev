# 0121: A run resolves a deferred finding it later fixes

**Status:** Accepted

**Amends:** [ADR 0035](0035-a-review-fix-changes-how-not-what.md),
[ADR 0088](0088-an-observation-is-recorded-where-it-is-met.md).

**Amended by:** [ADR 0211](0211-a-deferred-finding-re-enters-at-the-scope-review.md),
which places re-entry at the scope review.

**Context.** ADR 0035 gives the ledger's `**Deferred:**` record no `clear`. It argues that unplanned work
stays unplanned until somebody plans it, so nothing in a run can discover that a deferred bullet is no
longer true. That argument does not cover a finding that the same run goes on to fix. In the scope
`fix/staged-pages-at-close` (anchor #862), the first review pass deferred a Minor finding to triage #871,
because its remedy looked like a new scanner. A later fix cycle found a guard-rail remedy (ADR 0097), new
rows in an existing drift table, and fixed it in commit 3aec7772. The ledger bullet still named #871 as
open work. `ledger-guard` blocks a hand edit of `ledger.md`, so the bullet reached `/superdev:status`, the
run-state snapshot on the scope anchor, and the pull-request body as follow-up work that did not exist
(triage #879).

**Decision.** A deferred finding re-enters a fix loop only when a later review names a guard-rail remedy
for it. The boundary that deferred it is applied again, attended and unattended. A remedy that still adds a
capability keeps the finding deferred.

When a fix cycle carried a re-entered finding, the fix implementer's report names the fixing commit, and a
later re-review no longer lists the finding, the controller resolves it:

1. `scope.js deferred resolve -` removes the bullet. It reads the exact bullet text on stdin and matches
   it literally. It removes every identical bullet, refuses text that matches none, and drops the
   `**Deferred:**` line when no bullet remains.
2. When the bullet names a triage record, the controller closes that record with a comment that names the
   fixing commit.
3. When the ledger records an open pull request, the controller rebuilds that pull request's
   `## Deferred to a plan` section from the remaining bullets and leaves every other section unchanged.

Steps 2 and 3 are best-effort store and code-host writes. A failure, or a configuration that defines no
such call, is reported once per run, and the bullet stays removed.

**Considered options**

- **Mark the bullet resolved instead of removing it.** It keeps an in-ledger audit trail. It loses because
  every reader of the record (`/superdev:submit-pr`, `/superdev:status`, the snapshot, the dedup read)
  would need a filter. The closed triage record, with its comment naming the commit, already carries the
  trail.
- **Match the bullet by its triage-record reference.** The call is shorter. It loses because each store
  writes its reference in its own format, and a bullet whose record create failed carries no reference.
- **Let an attended operator pull any deferred finding back into the loop.** It saves the
  reclassification judgment. It loses because it reopens, late in a run, the door ADR 0035 closes on
  unplanned capability.
- **Resolve on the implementer's report alone.** The bullet goes one cycle earlier. It loses because the
  re-review is the loop's evidence bar for every other finding, and a fix the reviewer rejects would leave
  no record.

**Consequences.** The deferred record, the triage backlog, and an open pull request's body stop listing a
finding the run fixed. Every store seed gains a call that closes a triage record, and every code-host seed
gains a call that edits an open pull request's body. The judgment that a deferred finding now has a
guard-rail remedy is the same prose-carried judgment ADR 0097 already accepts. A pull request's
`## Unresolved defects` section can still go stale after submit, because this decision rebuilds only the
deferred section.
