# 0199: A ready intent lives in the slice store as an intent record

**Status:** Accepted

**Amends:** [ADR 0112](0112-brainstorm-writes-its-intent-as-it-settles.md), whose ready intent stays a
file under `.superdev/brainstorm/`. This record moves the ready intent to the slice store. The draft rule
of ADR 0112 stands.

**Context.** `/superdev:brainstorm`, `/superdev:sweep`, and `/superdev:review-tests` hand their intents to
`/superdev:plan` as git-ignored files under `.superdev/brainstorm/`. `git clean -fdX`, a lost disk, or a
fresh clone deletes them without a message, and another machine or a colleague cannot plan from them.
`/superdev:plan` deletes a seeded intent after planning even when it planned only part of it, and a
same-day sweep overwrites the previous sweep's file (triage #920).

**Decision.** A ready intent is written to the slice store as an **intent record**: an ordinary issue
carrying the store's own `intent` label, created unassigned. It is neither a slice, a scope anchor, nor a
triage record.

- **The handoff writes it, then deletes the local file.** Brainstorm writes the record when it sets
  `status: ready`. Sweep and review-tests write it at their handoff. A draft stays a local file only.
- **A failed write keeps the file.** When the write fails, or the store document describes no intent
  record, the file stays `ready`, and the report says that the intent exists only in this checkout.
  `/superdev:plan` still offers a local ready file.
- **Plan asks whether the intent is fully planned.** Once the scope is filed, plan either closes the
  record with a comment that links the scope anchor, or keeps it open with a comment that links the anchor
  and names what was planned. A record kept open stays listed for the next plan.
- **Status shows open intent records**, and no store reads an intent record as an untriaged item.

**Considered options.**

- *A variant of the triage record.* It lost because a triage record is absorbed into a Definition of Done
  and closed by `/superdev:wrap-up` (ADR 0144), while an intent record is closed by `/superdev:plan`. Every
  triage consumer would have to tell the two apart.
- *A scope anchor before planning.* It lost because an anchor is recognised by its feature label, which
  names one scope branch. A sweep intent can seed several features, and no change type exists before plan.
- *The intent on a git ref.* It lost because a ref carries no assignee and sends no notification, so a
  colleague cannot take the intent over.
- *The intent committed on the scope branch.* It lost because an intent exists before any scope branch,
  and the file would merge into the base branch.
- *Drafts in the store too.* It lost because brainstorm edits the intent on every settled point, and a
  draft in the store needs a draft signal that plan and status filter on.

**Consequences.** Each slice-store seed carries an `## Intent record` section, and `/superdev:setup`
offers it to an existing store document as a seed gap (ADR 0107). A store document without the section
keeps today's local-file handoff.
