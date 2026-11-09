# 0222: The offer guard passes the running skill

**Status:** Accepted

**Amends:** [ADR 0213](0213-a-stop-hook-holds-the-offer.md) and
[ADR 0216](0216-the-offer-guard-reads-a-next-step-without-its-heading.md): the hook does not hold a turn whose
next command is the superdev skill still running.

## Context

On 2026-11-09 a `/superdev:brainstorm` session ended three interview turns with a line such as "**Next:**
confirm the problem … run `/superdev:brainstorm` to start over". The ADR 0216 reader took each line as a
next step, and `hooks/offer-guard.js` held each turn. Each held turn added one message that named the "same
skill as the one ending" exception and repeated the open question. ADR 0216 rejected a skill-aware rule on the
ground that the Stop input does not say which skill ran. The Stop input does carry `transcript_path`, and the
transcript records every skill start.

## Decision

At Stop, before it holds a turn, the hook reads the transcript through `lib/running-skill.js`. The running skill
is the last superdev skill the transcript started: a user message carrying
`<command-name>/superdev:<name></command-name>`, or a `Skill` tool call whose `skill` is `superdev:<name>`. Tool
results start no skill. When the next command equals the running skill, the turn passes. An unreadable
transcript names no running skill, so the turn is held as before.

`/superdev:brainstorm`'s closing-message rule applies to the exits of its hand-off step only. An interview turn
ends on its question, with no Next block.

## Considered options

- **Fix the skill prose only.** Rejected: any skill with a multi-turn interview can name itself beside the word
  "next", and the hold costs a turn each time.
- **Record the running skill in a marker at UserPromptSubmit.** Rejected: a `Skill` call starts a skill without a
  prompt, so the marker would miss it, and the transcript already holds both forms.

## Consequences

The "same skill as the one ending" exception is checked by the hook, not left to the model. A Stop reads the
whole transcript once when a Next block would otherwise be held. A skill that names itself as the next command
at its real exit, such as brainstorm stopped before ready, also passes, which that exception already allowed.

Verified 2026-11-10, on Claude Code 2.1.311 in the Claude desktop app: the transcript of the session above holds
the typed command as a user message whose content starts with
`<command-message>superdev:brainstorm</command-message>\n<command-name>/superdev:brainstorm</command-name>`.
