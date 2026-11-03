# 0213: A Stop hook holds the offer

**Status:** Accepted

**Amends:** [ADR 0157](0157-every-chain-command-offers-to-start-its-successor.md): the offer is enforced, not
only stated.

## Context

`references/response-shapes.md`'s `## The offer` states when a command offers its next command. Sessions in
the Claude desktop app often end on the Next block with no New task card. The app's system prompt tells
the model that a follow-up acting on the session's own findings stays in the session and is asked through
its wrap-up box. Late in a long run, that rule wins over a reference section the model read once.

## Decision

A Stop hook, `hooks/offer-guard.js`, blocks a turn once when its last message ends on a Next block whose
fence names one command that no offer call of the same turn named. An offer call is a
`mcp__ccd_session__start_session` call whose prompt carries the offer's marker line, or an
`AskUserQuestion` call with a `Start /superdev:` option. Its PostToolUse half records each such call by
session, turn (`prompt_id`), and command. The block reason names the offer and its exceptions, so the
model either makes the offer or states the exception. A Stop with `stop_hook_active` set passes.
`## The offer` states that it takes precedence over the app's own follow-up guidance and comes before the
wrap-up call.

## Considered options

- **Prose only.** Rejected: the prose already states the offer, and sessions skip it.
- **Read the tool calls from `transcript_path`.** Rejected: the hooks reference says the transcript may
  lag the conversation, so a made offer could read as missing.
- **Detect every exception in the hook.** Rejected: the arguments, the chained posture, and the ending
  skill are not in the Stop input, and recording them needs more hook state than one block costs.

## Consequences

A turn that skips the offer gets one more model turn. A legitimate exception the hook cannot see costs one
block. The Stop input carries no run posture, so every unattended chain command that ends on a single-command
Next block is held once, and its next turn names the unattended exception. A refused card call writes no
marker and costs one block too. A Stop removes every marker older than one day, so a turn that never reaches
Stop leaves no marker behind for longer.

## Platform verification

The hook relies on these Claude Code hook inputs: Stop carries `prompt_id`, `stop_hook_active`, and
`last_assistant_message`; PostToolUse carries the same `prompt_id` as the Stop of its turn.

Verified 2026-11-03, on Claude Code 2.1.310: the hooks reference
(<https://code.claude.com/docs/en/hooks.md>) lists `prompt_id` as a common input field, a "UUID identifying
the user prompt currently being processed", and names `last_assistant_message` on Stop. A captured
`claude -p` run with one Bash call gave a PostToolUse and a Stop input with the same `prompt_id`; the Stop
input carried `stop_hook_active: false` and a string `last_assistant_message`.

Not verified: that `prompt_id` stays the same after the operator answers an `AskUserQuestion` call in the
same turn. The reference does not say so, and a non-interactive capture cannot answer the question. If the
answer starts a new `prompt_id`, the Stop finds no marker and the turn is held once.
