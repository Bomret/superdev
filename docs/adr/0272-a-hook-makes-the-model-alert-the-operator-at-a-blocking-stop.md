# 0272: A hook makes the model alert the operator at a blocking stop

**Status:** Accepted

## Context

An attended superdev command stops on the operator in two ways. It asks an `AskUserQuestion`, or it ends its last
message on a Next block that carries a `Blocked:` or `First:` line (`references/response-shapes.md`). Nothing told
an operator who had walked away. Measured on 2026-11-21 over 27 scope-review loops in this repository, operator waits
totalled about 835 minutes against about 380 minutes of machine time. The longest waits, 59, 46, and 22 minutes, were
`/superdev:review` criterion questions that nobody saw.

Claude Code offers two mechanisms near this need. Verified 2026-11-21 on Claude Code 2.1.x against
code.claude.com/docs (`hooks.md#notification`, `tools-reference.md`, `remote-control.md`):

- A `Notification` hook receives the alerts Claude Code itself sends (`permission_prompt`, `idle_prompt`, and
  others). It cannot create one, and `AskUserQuestion` is not among its triggers. No hook output raises a
  notification.
- The `PushNotification` tool sends a desktop notification, and a phone push under Remote Control. The tool skips the
  send when the user is at the terminal, and the operator's own `/config` push settings govern it. Only the model
  can call it, and it is a deferred tool that the model loads through `ToolSearch`.

## Decision

- **`hooks/operator-alert.js` makes the model call `PushNotification`.** It is registered on PreToolUse for
  `AskUserQuestion` and on `Stop`. It reads the session transcript the hook input names.
- **It applies to a session whose newest superdev start is attended.** The newest superdev skill start in the
  transcript, by a Skill tool call or a typed `/superdev:` command, carries no `--unattended`. A mention of a
  command in prose or tool output is no start. A subagent's call carries `agent_id` and passes.
- **It denies or blocks once per wait.** A wait starts at the operator's last input: a typed prompt, or an answer to
  an `AskUserQuestion`. A `PushNotification` call since then, or an earlier denial of this hook since then, lets the
  stop pass. The hook knows its denial as the error result of an `AskUserQuestion` call whose text opens with
  `PreToolUse:AskUserQuestion hook error: [<command>]: ` and the hook's marker. The marker anywhere else, in another
  tool's output or in a typed prompt, releases nothing, and a typed prompt starts a new wait. A Stop block passes its
  own re-entry through `stop_hook_active`. A review loop that asks again after a long fix cycle therefore alerts again. The PreToolUse
  deny tells the model to send the alert and ask the same question again, choosing no option itself. The Stop block
  applies only to a last message whose Next block carries a `Blocked:` or `First:` line, and it tells the model to send the alert
  and end the turn with no further text.
- **The alert names the scope and what the stop waits on.** The model writes the message, because only the model
  knows both.
- **Any failure passes.** An unreadable transcript, a missing field, any error, or hook input whose stdin does not
  close within 5 s gives no decision. The transcript read is synchronous, so the 5 s bound covers only the wait for
  stdin. The Stop path tests the last message for a Next block before it reads the transcript.
- **The docs claim a prompt, not a delivery.** The model may skip the call, and the tool skips the send when the
  operator is at the terminal.

## Considered options

- *A rule in `references/response-shapes.md` that the model calls `PushNotification` at each such stop.* Rejected:
  skills read that file for their closing message, so a mid-run question, such as review's criterion question, can
  come before the model reads the rule.
- *A `Notification` hook that shells out to an OS notifier.* Rejected: Claude Code's own alerts do not include
  `AskUserQuestion`, and an OS notifier differs per platform, where `PushNotification` already reaches the desktop
  and the phone and honours the operator's settings.
- *The rule only after a scope-run command.* Rejected: a sweep's or `/superdev:review-tests`' agreement round comes
  after a long pass, which is when an operator walks away.
- *Once per operator turn, from the last typed prompt.* Rejected: an `AskUserQuestion` answer is no typed prompt,
  so the second criterion question of a review loop, asked after a long fix cycle, would raise no alert.
- *A ledger step marks a live command.* Rejected: `step block` keeps the step standing after a blocked run, and
  `/superdev:brainstorm` and `/superdev:sweep` have no run.

## Consequences

Each wait costs one extra model round trip. When the operator is at the terminal, `PushNotification` sends nothing, and the cost is only that round trip. A provider that offers no
`PushNotification` tool gets the deny once per wait, and the re-ask passes. An unattended run asks no question
(ADR 0016), and its blocked stops pass. The hook reads the transcript's JSONL entry shapes, which Claude Code does
not document. `docs/known-issues.md` records the shapes it relies on, with dated verification.
