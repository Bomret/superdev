# 0226: The offer guard reads only the last paragraph

**Status:** Accepted

**Amends:** [ADR 0216](0216-the-offer-guard-reads-a-next-step-without-its-heading.md): the hook reads a next
step without its heading only in the message's last paragraph.

**Amended by:** [ADR 0240](0240-the-offer-guard-reads-only-a-next-line.md): a `/superdev:` code span names a
command only on a line whose first word is "next".

## Context

On 2026-11-11 a `/superdev:brainstorm` interview turn explained a skill's behaviour with the line "Its Next block
always names `/superdev:plan`" and ended on a numbered question to the operator. The ADR 0216 reader matched the
word "Next" beside the code span and held the turn. The model then answered the block with a line that only
explained why no offer applied. An interview turn is no exit and owes no offer, and the
running-skill exception of ADR 0222 did not apply, because the named command was plan, not brainstorm.

## Decision

When the last message has no `### Next` heading, the hook reads only its last paragraph: the lines after the
last blank line outside a fence that more text follows. A lone-command fence or a `/superdev:` code span on a
line saying "next" names a command only there.

## Considered options

- **Pass a message that ends on a question mark.** Rejected: the 2026-11-11 turn ended on a numbered list, so
  the rule would not have passed it.
- **Pass every turn while brainstorm or plan runs.** Rejected: the hook would carry a list of skill names, and
  a real closing of those skills without its heading would go unheld.

## Consequences

A next step stated in the closing paragraph is still held once. A command mentioned earlier in the message,
such as context ahead of a question, is not held. A closing that names its command and then adds a paragraph
after it passes unheld.
