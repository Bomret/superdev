# 0184: Brainstorm offers its drafts in one question, without delete

**Status:** Accepted

**Amends:** [ADR 0112](0112-brainstorm-writes-its-intent-as-it-settles.md). Its
decision stands, except for the bullet on how brainstorm offers its drafts.

## Context

ADR 0112 has brainstorm ask for an action first: resume a draft, delete a draft, or start fresh. Resume
and delete then ask a second question, which draft, and a delete offers the remaining drafts again. With
one draft the two questions merge, and with more drafts than options the question text names the rest.
A draft is a gitignored scratch file under `.superdev/brainstorm/`. The operator can remove one without
brainstorm.

## Decision

When a draft exists, brainstorm asks one `AskUserQuestion`. Each draft is a resume option, and its
description carries the draft's problem-statement line. **Start fresh** is the last option.
`AskUserQuestion` holds two to four options, so with more than three drafts the question text names the
rest, and the operator reaches them through the tool's free-text "Other". Brainstorm never selects a
draft itself. Resume and start fresh behave as ADR 0112 states.

Brainstorm offers no delete. The operator removes a draft file by hand.

## Considered options

- **Keep resume, delete, and start fresh (ADR 0112).** Rejected: the delete flow, the second question,
  and the re-offer after a delete cost more prose than a scratch file needs.

## Consequences

Brainstorm's §0 asks one question in every case. A stale draft stays until the operator removes the file
or resumes it to `status: ready`.
