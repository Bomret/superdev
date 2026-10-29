# 0112: Brainstorm writes its intent as it settles, and plan skips a draft

**Status:** Accepted

**Amended by:** [ADR 0184](0184-brainstorm-offers-its-drafts-in-one-question-without-delete.md), which
offers the drafts in one question and drops the delete action.

**Amended by:** [ADR 0199](0199-a-ready-intent-lives-in-the-slice-store-as-an-intent-record.md), which
moves the ready intent to the slice store as an intent record.

## Context

`/superdev:brainstorm` wrote its intent once, at the converge step, and the write was optional. Until
then the discovery lived only in the conversation. A compaction, a crash, or a closed session lost it.
The operator could not see the intent form in the editor. The end-of-session synthesis rebuilt the
intent from a long conversation, so an early rejected direction or commitment could be lost. A second
session started cold, because brainstorm read no existing intent.

`/superdev:plan` globs `.superdev/brainstorm/*.md` and offers every file it finds. `/superdev:review-tests`
and `/superdev:sweep` write their intents to the same directory, each in one write.

## Decision

- **Brainstorm writes the intent file once the problem is confirmed.** The write happens at the end of
  §1, before a direction is explored, and it is mandatory. The slug comes from the confirmed problem. The
  file carries YAML frontmatter `status: draft` and the intent headings. A slug that names an existing
  file gets a `-2` or `-3` suffix, and brainstorm never overwrites a file it did not create in the
  session.
- **Each settled point goes into its section in the turn it settles.** A direction still under
  discussion goes under the still-open decisions. A resumed session keeps the same rule.
- **The handoff sets `status: ready`.**
- **Brainstorm offers every draft at its start.** When a draft exists, it asks the operator to resume
  it, delete it, or start fresh, and never selects one itself. A resume reads the file again, summarizes
  it, skips §1, and continues at the first still-open decision. A delete removes only the picked draft. Each draft's option description
  carries its problem-statement line, so the operator can tell the drafts apart. `AskUserQuestion`
  holds two to four options. With one draft, brainstorm names it in the action options and skips the
  which-draft question. With more drafts than options, the question text names the rest, and the
  operator reaches them through the tool's free-text "Other".
- **Plan never offers or seeds from a draft.** The glob skips a file with `status: draft` and names each
  skipped draft in one line. An argument that names a draft is refused, and plan names both remedies:
  resume the brainstorm, or set `status: ready`.
- **Only `status: draft` marks a draft.** A file with no frontmatter, or with any other status, is
  ready. The intents that `/superdev:review-tests` and `/superdev:sweep` write carry no marker and need
  no change.

The operator steers through the conversation only. Brainstorm owns the file during the interview, and
an edit by hand during the interview is not supported.

## Considered options

- **An append-only decision log, with the intent built at the end.** Rejected: it protects edits by
  hand, which are not a need, and it shows a log instead of the intent, so the operator cannot see the
  intent form.
- **A shared file that both sides edit, read again every turn.** Rejected: the operator steers through
  the conversation only, so the repeated read and a conflict rule add nothing.
- **A script that owns the intent file, as `scope.js` owns the ledger.** Rejected: it adds a shipped
  executable and a suite, and `/superdev:review-tests` and `/superdev:sweep` would have to use it, for a
  scratch file that only `/superdev:plan`'s glob reads.
- **Plan offers a draft with a "(draft)" label.** Rejected: plan could seed from half an intent, and a
  stale draft would stay in plan's list.
- **Plan sends the operator back to brainstorm when it finds a draft in the glob.** Rejected: a skip with
  a one-line notice gives the same information without a stop.
- **A first-line HTML comment as the draft marker.** Rejected: YAML frontmatter is easier to parse.
- **Create the file on the first turn, with the slug from the argument.** Rejected: §1 often changes a
  solution-shaped argument into a problem, so the slug would name the first idea. The §1 exchange it
  would save is short.
- **Rename the file when the problem changes.** Rejected: a change that large is a new brainstorm. The
  content carries a smaller change, and a stable name keeps the resume simple.
- **Resume only on an explicit slug, or resume when the argument matches a draft.** Rejected: plan skips
  drafts, so a brainstorm that does not show them leaves an abandoned draft unseen. An offer at every
  start also gives the delete a place.

## Consequences

A brainstorm leaves a file from the end of §1, so an interrupted discovery survives and a later session
can resume it. A draft never reaches `/superdev:plan`. An abandoned draft stays in
`.superdev/brainstorm/` until the operator deletes it from brainstorm's start offer.
