# 0240: The offer guard reads only a Next line

**Status:** Accepted

**Amends:** [ADR 0226](0226-the-offer-guard-reads-only-the-last-paragraph.md): in the last paragraph of a
message with no `### Next` heading, a `/superdev:` code span names a command only on a line whose first word is
"next".

## Context

ADR 0216 and ADR 0226 read a `/superdev:` code span as a next step when its line contains the word "next"
anywhere. On 2026-11-12 a turn ended on the prose sentence "Adopters will see that as a seed gap on the next
`/superdev:setup` run." The word "next" described a future run of the command, and the sentence named no next
step. `hooks/offer-guard.js` held the turn. The forms ADR 0216 records each open their line with the word:
"Next would be `/superdev:submit-pr`" and "**Next:** answer it".

## Decision

A `/superdev:` code span names a command only on a **Next line**: a line whose first word is "next", in any
case, after optional leading whitespace, an optional list marker (`-`, `*`, `+`, or a number with `.` or `)`),
and optional `*` or `_` emphasis markers. The lone-command fence form and the last-paragraph rule of ADR 0226
are unchanged.

## Considered options

- **Keep "next" anywhere on the line and exclude "the next".** Rejected: "on the next run" and "in the next
  session" show that prose uses the word in many shapes, and each exclusion would add a pattern.
- **Read only a line that starts with "Next:".** Rejected: "Next would be `/superdev:submit-pr`", the prose
  form ADR 0216 records, carries no colon.

## Consequences

Prose that uses "next" inside a sentence beside a command passes unheld. A closing that names its next step in
a sentence that does not open with "next", such as "The next step is `/superdev:submit-pr`", also passes
unheld. A closing in a lone-command fence, a `### Next` block, or a line opening with "Next" is still held
once.
