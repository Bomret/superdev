# 0010: A slice's assignee is slice-store configuration, not a plan field

**Status:** Accepted

**Context.** Slices and epics written to an issue-backed slice store are born unassigned. Sprint boards,
"assigned to me" filters, and notification routing all key on assignee rather than on the creator the store
already records. Where a shared or bot token files the issues, the creator says nothing about who is
accountable. Every field superdev's slices carry is declared in the plan-contract schema, so assignee
looks like it belongs there too.

**Decision.** The assignee is **slice-store configuration**: a single store-native identifier (a login for
Forgejo or GitHub, an `accountId` for Jira) recorded in `docs/agents/issue-tracker.md`, applied at creation to
the epic and every slice. Absent configuration resolves to the API token's own identity, and `none` disables
assignment. It is **not** a field in the plan-contract slice schema.

**Why.** Assignee names who owns work inside a tracker, a property of the store and the run, not of a
slice. Two slices differ in `spec` and `depends-on`. They do not differ in who owns them. The local-file
store has no assignee concept at all, so a schema field would be one that two of the three backends
ignore, and `/plan` and `/implement` would carry a field neither can act on generically.

**Considered options.**

- *An `assignee` field in the plan-contract slice schema*. Rejected: makes every backend declare a field
  only issue backends can honour, and invites per-slice assignment nobody asked for.
- *A list of assignees*. Rejected: Jira accepts exactly one, so a list is a field one backend must
  silently truncate. "Who owns this slice" is singular.
- *Leave issues unassigned when nothing is configured*. Rejected: every existing repo would stay broken
  until its owner re-ran `/superdev:setup`, and the token's own identity is strictly better than nobody.
- *Re-assign to the run's operator at `in-progress`*. Rejected: it would undo a deliberately configured
  fixed account, which is the case that motivated configurability. Nothing fails without it.

**Consequences.** Jira is the cardinality outlier: Forgejo and GitHub take an `assignees` array, which the
single configured value renders as one element. Both Git hosts can refuse an assignment **quietly**.
GitHub documents that assignees are silently dropped without push access, and Jira gates assignment on an
*Assign Issues* permission separate from *Edit Issues*. The assignee is therefore read back from the
create response the store already returns, and a refusal is reported once rather than assumed. The local-file
store is untouched.
