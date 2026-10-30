# 0200: A scope anchor names its seeding intent record

**Status:** Accepted

**Amends:** [ADR 0199](0199-a-ready-intent-lives-in-the-slice-store-as-an-intent-record.md), whose plan
links the scope anchor from the intent record only.

**Context.** `/superdev:plan` files a new scope anchor and closes the intent record it started from, or
keeps it open, with a comment that links the anchor. The link runs one way. From the anchor, a reader cannot
see which intent the feature came from, or reach that intent's discussion.

**Decision.** A plan seeded from an intent record writes an **Intent line**, `**Intent:** #<n>[, #<n>]`,
on the scope anchor, in the store's own reference notation. It is an anchor-only line, like the Absorbs
line (ADR 0144): written through each store document's own call, best-effort, moved to the epic when an
append turns a single-slice feature into a multi-slice one, and revised in place by an append seeded from
another intent record. It is written whether the intent was fully planned or not. A plan seeded from a local
intent file writes none. The intent record is settled as ADR 0199 states.

**Considered options.**

- *Promote the intent record into the scope anchor.* Plan would post the record's body as a comment,
  replace the body, swap the labels, and file no new anchor, so one idea keeps one issue. It lost because it
  takes several store calls with no transaction, a half-promoted state to handle, a new call in every store
  seed, and it cannot work on Jira, where each instance configures its own issue types per role. The
  history it would move is one link away once the anchor names the record.
- *Copy a summary of the record's comments into the anchor.* It lost because the copy goes stale and the
  link alone reaches the full discussion.
- *Keep the intent record open until wrap-up, like a triage record.* It lost because it adds a second open
  issue per feature and moves no history.

**Consequences.** A reader reaches the intent from the anchor and the anchor from the intent. Every store
document states a **Record the Intent line** call, and `/superdev:setup`'s re-run offers it to an older
document as a seed gap.
