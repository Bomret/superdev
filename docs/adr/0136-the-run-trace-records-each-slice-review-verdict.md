# 0136: The run trace records each slice review's verdict

**Status:** Accepted

**Amends:** [ADR 0117](0117-the-run-trace-is-hook-written-evidence.md), [ADR 0127](0127-a-test-run-records-its-own-outcome.md).

**Context.** A full-tier slice review leaves no machine-readable record of its outcome. The verdict
exists only as the `### Verdict:` line that ends `slice-reviewer`'s report, and as the copy the reviewer
appends to `<run-root>/reports/<id>/progress.md`. That copy is unreliable: in the shell-scanner scope,
slice 03 has 7 `slice-reviewer` dispatches and 6 verdict lines in its progress log. The fix cycle appears
only in free-form dispatch descriptions, and no id ties a review to the implementer dispatch it covered.
A reader of a scope's run state, such as the superdev-view pane, therefore cannot group a slice's agents
into review cycles with a pass or fail mark (triage #1028).

**Decision.** `hooks/run-trace.js` writes one `verdict` line per completed background `slice-reviewer`
dispatch: `verdict <reviewer tool_use_id> <spec pass|fail|unknown> <quality approved|changes-needed|unknown>
<cycle> <implementer tool_use_id|->`, on the slice of the reviewer's own `dispatch` line. It reads the
report from `PostToolUse` on the `SubagentHandback` tool inside the reviewer, and falls back to
`SubagentStop`'s `last_assistant_message` for a reviewer that answers in plain text. It maps the
reviewer's agent id to its dispatch through the `dispatch-bind` line. The last `### Verdict:` line in
the report decides, and a part it cannot read is `unknown`. The cycle is the number of earlier
`slice-reviewer` dispatches on the same slice that have a `dispatch-end` before this review's `dispatch`
line. The reviewed implementer is the slice's last `superdev:implementer` dispatch whose `dispatch-end`
precedes this review's `dispatch` line. In sequential delivery, each review gets at most one `verdict`
line. A reader takes the first `verdict` line per reviewer dispatch, so a duplicate written by two
concurrent hook runs changes nothing a reader sees (INV-0142).

**Platform basis.** Verified 2026-10-10 against https://code.claude.com/docs/en/hooks: `SubagentStop`
documents `agent_id`, `agent_type`, `agent_transcript_path`, and `last_assistant_message`. The `Agent`
tool's `PostToolUse` section says that on Claude Code 2.1.271 or later, a subagent reporting through
`SubagentHandback` returns only a short note in `content`, and that a hook reads the report from that
tool's `tool_input.message`. Observed on Claude Code 2.1.295: reviewer `a2376f9e567dfb4a5` ended its
transcript with a `SubagentHandback` call whose message ends in `### Verdict: specification ✅ | quality:
approved`, and no assistant text followed it.

**Considered options**

- **A controller verb.** `scope.js` gains a verb that the implement controller calls after each review.
  It loses on pairing, because the model never sees a `tool_use_id` and cannot name the dispatches. It also
  rests on prose compliance, which the progress-log count above shows drifts. INV-0117 allows no
  caller-chosen trace event.
- **A verdict line with no derived fields.** Each reader derives the cycle and the reviewed implementer
  from trace order. It loses because every reader would carry its own copy of the rule, and superdev-view
  would need a second shared fixture pin.
- **Cover foreground reviewer dispatches.** The hand-back fires inside the subagent before the parent's
  `PostToolUse` names its `agentId`, so covering it needs a pending record keyed by agent id. All 43
  observed `slice-reviewer` dispatches were background, so the cost buys no observed case.
- **Count recorded verdicts as the cycle.** A review with no `verdict` line would shift every later cycle.
  Counting finished reviewer dispatches keeps the number right when a foreground or unparseable review
  writes no line, and a retried, interrupted review keeps its cycle.

**Consequences.** A reader groups a slice's reviews into cycles and marks each pass or fail from the
trace alone. A foreground reviewer dispatch, and one that ends with neither a hand-back nor a stop event,
gets no `verdict` line. A reader treats that absence as a verdict not recorded. A rewording of
`slice-reviewer`'s verdict line breaks the parser, so a test reads the agent's own line through it. A
lite run has no per-slice review and records no `verdict` line. If the hand-back payload changes, every
line reads `unknown` until the parser follows it.
