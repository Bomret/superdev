# 0144: Plan absorbs open triage records into the scope it plans

**Status:** Accepted

**Amends:** [ADR 0046](0046-a-deferred-finding-becomes-a-triage-record.md), whose Considered options
deferred "Have `/superdev:plan` read and close open triage records". This record takes that option.

**Context.** On 2026-10-12, `bomret/superdev` held 185 triage records, 82 of them open. 74 were created in
ISO week 41 alone. The 9 scopes that created the most records closed 33 and created 44. `/superdev:plan`'s
prior-art audit reads the repository and `.out-of-scope/`, and never the store's own open triage records
(triage #611). A scope that changes a subsystem therefore leaves that subsystem's known open records out
of its Definition of Done. Its reviews then meet the same defects again and file them again.

**Decision.** `/superdev:plan`'s prior-art audit also checks the open triage records. It reads every
open triage record through the store document's listing call, matches the records against the intent by
domain concept, and offers every match to the operator. A record that an open scope anchor already
absorbs is not offered again; the audit names that anchor.

- **The operator picks.** A record the operator absorbs is cited by its reference in exactly one
  Definition-of-Done criterion. One criterion may cite several records of one class. The plan absorbs no
  record the operator did not pick.
- **The citation has one form.** The plan writes `(triage <reference>)` in the criterion text, for
  example `(triage #611)`. `/superdev:wrap-up` finds the citing criterion by this form.
- **An absorbed record stays in the fix loop.** A review finding that plainly states the same defect as
  a record this run's anchor absorbs is in scope for the fix loop. The fix loop never defers that
  finding, because a criterion already cites the record.
- **The anchor carries an Absorbs line**, `**Absorbs:** #<n>[, #<n>]`, in each store's own reference
  notation. It is written and read like the Repairs line (ADR 0124), with two differences. An append that
  absorbs more records revises the line in place, as it revises the deploy line. Each entry is read on
  its own: a malformed entry is ignored, and a repeated entry counts once.
- **`/superdev:backlog` shows an absorbed record in its own `absorbed` bucket** while the absorbing anchor
  is open. Once that anchor is closed, a record still open returns to `needs planning`.
- **`/superdev:wrap-up` closes an absorbed record** whose citing criterion's verdict is `met:`, with a
  comment naming the merge commit and the scope anchor. For a criterion settled `accepted:`, it asks per
  record whether to close or keep open. These closes are best-effort: a failure is reported and wrap-up
  continues.
- **Only wrap-up closes an absorbed record.** A run that resolves a deferred finding (ADR 0121, ADR 0145)
  never closes a record that an open scope anchor absorbs. It comments on that record and leaves it open.
- **A store document that describes no Absorbs line** gets the matches listed and none absorbed, with
  `/superdev:setup` named, whose seed-gap pass offers the section.

**Considered options**

- **Absorb after the derive pass, matched against the files the scope touches.** The match is sharper.
  It loses because an absorbed record then arrives after the Definition of Done is drafted, and the
  derive pass has to run again.
- **Cite the record in the criterion text only, with no anchor line.** It needs no new seed section. It
  loses because each store writes references in its own notation, and a criterion can cite a record for
  context without absorbing it. ADR 0121 rejected matching by reference for the same reason.
- **A value bar, or an operator filter, on writing a triage record.** It cuts the count directly. It loses
  because it cuts the count by not filing valid issues.
- **Close stale records after a fixed age.** It drops records by age, not by value.
- **Let a run absorb a gap mid-flight**, appending a slice and growing the Definition of Done. It amends
  INV-0004 and ADR 0083, and it puts scope questions to the operator late in a run, where ADR 0035 found
  attention is lowest.
- **Cluster the records in `/superdev:backlog` only.** It lowers the cost of reading the backlog and
  prevents no record.

**Consequences.** A scope builds the known open defects in the code it changes, and closes their records
when it ships. Every store seed gains an Absorbs-line write and read, which `/superdev:setup` offers to an
existing store document. Every plan adds one paged store read. Whether this makes the records a scope
closes at least as many as the records it creates is measured on the scopes planned after it ships, and
is no criterion of this feature.
