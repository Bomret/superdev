# 0283: Plan connects an absorbed triage record to its scope anchor

**Status:** Accepted

**Amends:** [ADR 0144](0144-plan-absorbs-open-triage-records.md), whose plan names an absorbed record on the scope
anchor only.

**Context.** `/superdev:plan` names every triage record it absorbs on the scope anchor's Absorbs line, and
`/superdev:wrap-up` closes the record when the scope ships. Until then the record itself shows nothing. On Jira an
absorbed record stays in its first status for the whole run and then moves straight to done, and a reader of the
record sees no scope working on it. Jira creates no issue link from a key in a description. On GitHub the Absorbs
line already creates a timeline cross-reference on the record (`Bomret/superdev` #417 shows one from epic #489,
checked 2026-11-25). Forgejo's documentation says a posted issue or comment is parsed for references, and says nothing
about an edited body (https://forgejo.org/docs/latest/user/linked-references/, checked 2026-11-25).

**Decision.** Once the scope anchor exists and its Absorbs line is written, `/superdev:plan` connects every record
this plan absorbed to the anchor. An append connects only the records it newly absorbs. An append that makes a
single-slice feature an epic also connects every record the moved Absorbs line names to the new epic, and leaves the
connection to the former lone slice in place.

- **Every store** posts a comment on the record through its triage record's **Comment on it** call. The comment
  names the scope anchor's reference and the feature label, and no pull request.
- **Jira** also links the record to the anchor with an issue link. Its link type is the store document's **Absorbs
  link type** value, a link type's name. A store document without that value posts the comment only, and
  `/superdev:setup`'s re-run offers the value as a seed gap.
- **GitHub and Forgejo** write no native link. GitHub's cross-reference already exists, and Forgejo offers no
  relation besides a dependency.
- **The record's lifecycle stays as it is.** The plan changes no status, parent, or label on the record, and
  `/superdev:wrap-up` closes it as ADR 0144 states.
- **Best-effort.** A failed comment or link is reported once, and the filed scope stands.

**Considered options.**

- *The record becomes a slice of the scope.* It moves through the scope's statuses with no extra call. It lost
  because a record does not map one-to-one onto a slice, and rewriting its body as a slice loses the finding.
- *The record becomes a child of the epic, and no slice.* It shows under the epic. It lost because the slice
  loaders read an epic's children, and a child that is no slice would have to be filtered out everywhere.
- *A native link only, and no comment.* It lost because GitHub and Forgejo would gain nothing on the record itself.
- *A fixed Jira link type, `Relates`.* It needs no configuration value. It lost because each Jira instance names its
  own link types.

**Consequences.** A reader of an absorbed record sees the scope working on it from the moment it is planned. The Jira
triage record carries an absorbs link to each anchor that absorbed it, where its shape allowed no issue link before. Every store seed
gains the connect step, and the Jira seed gains a configuration value that `/superdev:setup` offers to an existing
store document.
