# 0216: The offer guard reads a next step without its heading

**Status:** Accepted

**Amends:** [ADR 0213](0213-a-stop-hook-holds-the-offer.md): the hook also holds a message that names its next
command without a `### Next` heading.

**Amended by:** [ADR 0222](0222-the-offer-guard-passes-the-running-skill.md): a next command that is the
skill still running passes. [ADR 0226](0226-the-offer-guard-reads-only-the-last-paragraph.md): only the
message's last paragraph is read.

## Context

`hooks/offer-guard.js` held a turn only when its last message carried a `### Next` heading. Transcripts of
2026-11-03 show that sessions an offer started (review, document) often end without that heading. They name
the next command in a fence ("To open the PR, run this: … `/superdev:submit-pr …`") or in prose ("Next would
be `/superdev:submit-pr`"). Those turns made no offer, and the hook never woke.

## Decision

When the last message has no `### Next` heading outside a fence, the hook collects the commands it names in two
forms: a fence whose body is one `/superdev:` line, and a `/superdev:` code span on a line that contains the
word "next". When those name exactly one command, the hook treats the message as a Next block naming it.

## Considered options

- **Hold every skill-ending turn without a Next block.** Rejected: the Stop input does not say which skill ran.
- **Match any `/superdev:` mention.** Rejected: prose that explains a command would be held.

## Consequences

A headless next step with no offer gets one block. A message that names two different commands in those forms
is not held. A message that discusses one command in a lone fence, or beside the word "next", costs one block.
