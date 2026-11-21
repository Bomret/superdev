# Known issues (Claude Code platform)

Platform behaviour superdev works around. Each entry states the issue, the mitigation the plugin ships,
and where the real fix belongs. Every claim here carries dated verification, per the root `AGENTS.md`
rule of that name.

## SessionStart system-prompt preambles leak into subagent tool outputs

Tracked as issue #32. When a subagent is dispatched, the Claude Code harness includes the main
conversation's SessionStart system-message in the subagent's prompt context. Examples are context-window
protection and tool-bootstrap guidance. This creates a prompt-injection surface, in two ways:

- Subagents receive meta-instructions they did not ask for.
- Tool-call outputs may arrive wrapped in system-prompt tags instead of staying opaque.

**Mitigation (implemented):** every subagent body carries explicit secret-hygiene discipline. Each agent
identifies and disregards any injected system-reminder block, and uses only the standard tools it was
given (`Read`, `Edit`, `Write`, `Bash`, and the rest). See `agents/implementer.md` for the pattern.

**Fix required at:** the Claude Code platform layer. Subagent prompts need isolation from the main
conversation's SessionStart preamble. Track this upstream with the Claude Code team.

Verified 2026-10-06, on Claude Code 2.1.289, from inside a dispatched subagent: the dispatch prompt carried
a hook-injected block, labeled "SubagentStart hook additional context", that opened with the banner
"PONYTAIL MODE ACTIVE — level: full" and held a full mode-instruction text, so hook-injected mode
instructions do reach a subagent's prompt. No block labeled SessionStart, and no context-window-protection
or tool-bootstrap preamble, appeared in the prompt or in its system reminders. The observation shows that
hook output reaches the subagent through the SubagentStart event, and it does not show the SessionStart
route the entry describes. The entry and its mitigation stay.

## A denied dispatch comes from the delegation handoff classifier

Auto mode runs a transcript classifier over tool calls, and a subagent handoff carries a classifier at
delegation that can deny, plus one at return that only warns. A SessionStart preamble denies nothing: it
is informational, and its contribution is to the user-message stream the classifier reads, which is the
leak above. A denial returns as a tool result carrying its reason, and three consecutive denials — or
twenty in a session — stop the model and escalate to the human, while headless `claude -p` terminates
instead. An unattended run stops itself before that, at the cap `references/scope-findings.md`'s
`## Degraded passes` section states, so the stop happens through superdev's own block procedure and
leaves a tracker record rather than a terminated session and a stranded run root (ADR 0041). The
documented stage-2 false-positive rate is 0.4%, so a denial is not by itself evidence of a real hazard.
Plugin subagents ignore the `permissionMode`, `hooks`, and `mcpServers` frontmatter fields, so superdev's
own agents cannot change any of this; the levers are the consumer's `permissions.allow` and a copy of the
agent under `.claude/agents/`. What the chain does about a denial is `references/scope-findings.md`'s
`## Degraded passes`, and ADR 0039 records the decision.

Verified 2026-08-23, against Anthropic's *How we built Claude Code auto mode* engineering post
(`https://www.anthropic.com/engineering/claude-code-auto-mode`) and the *Create custom subagents*
documentation (`https://code.claude.com/docs/en/sub-agents`), both read that day.

## The permission classifier can deny ship's merge call

Auto mode's classifier reads the main session's own tool calls, not only a subagent handoff. It can deny
`/superdev:ship`'s squash-merge call, with a reason such as `Merge Without Review`, even though the
operator typed the command. The denial returns as a tool result, and its text invites the model to reach
the same goal through another tool, such as the host's API in place of `gh`. `/superdev:ship` merges
nothing further on a denial, tries no other route, runs `step block`, publishes the run-state snapshot,
and names the denial and the mitigation (`plugin/skills/ship/SKILL.md`, section 4, the merge). Ship
refuses `--unattended`, so the denial always reaches an operator. The mitigation is the operator's: an
allow rule for the merge command in the permission settings, or running ship in a mode that prompts for
it. Plugin hooks and skills cannot change the classifier's verdict.

Fix required at: Claude Code. A classifier that treated the operator's own typed ship command as
consent to its merge would remove the denial.

Verified 2026-11-09, on Claude Code 2.1.317, in a session transcript of a ship run in another repository
(`open-settlers`, scope `head-on-pass`). Observed: the merge call's tool result read "Permission for this
action was denied by the Claude Code auto mode classifier. Reason: [Merge Without Review]." and went on
to say the model may attempt the action through other tools.

## SubagentStart carries no prompt, so the Agent tool's own events record a dispatch

The run trace maps a subagent dispatch to its run root and slice through the dispatch prompt (ADR 0117,
ADR 0127). `SubagentStart` carries `agent_id`, `agent_type`, and no `prompt`, so
`PreToolUse` on the `Agent` tool, which carries `tool_input.prompt` and `tool_input.subagent_type`, records
the dispatch, keyed by `tool_use_id`. The `PostToolUse` `tool_response` for `Agent` carries a `status` field:
`completed` for a foreground dispatch, `async_launched` with an `agentId` for a background one. The hooks
reference documents both fields (its `PostToolUse` section for the `Agent` tool, which lists the
`async_launched` field set and says subagents run in the background by default). A `completed` response carries the
`agentId` as well. `run-trace.js` ties the `agentId` of either status to the dispatch with one `dispatch-bind` line. The
first `SubagentStop` with that `agent_id` ends a background dispatch (a repeat writes no second end). A foreground
dispatch ends on its `completed` response, and its first run's `SubagentStop` fires before that response, while no bind
names the agent yet. A change to either field leaves a
dispatch without an end, and `final-reviewer`'s per-slice review check then reports the review missing.

**Mitigation:** the hook blocks no `Agent` event but a superdev dispatch with no explicit `model` (ADR 0245); a missing field records no end, which the check
reads as an unreviewed slice, never as a passed one.

Verified 2026-10-08, on Claude Code 2.1.294, against session transcripts written by Claude Code 2.1.x: an
`Agent` call result carried `status: "async_launched"` with `agentId`, `description`, and `prompt` for a
background dispatch, and `status: "completed"` with `prompt` for a foreground one. The hooks reference
(`https://code.claude.com/docs/en/hooks`) lists no `prompt` on `SubagentStart`. The `tool_response` shape the
hook receives mirrors that transcript `toolUseResult` and was not captured from a live hook payload.

Verified 2026-10-08, on Claude Code 2.1.294, against the hooks reference's `PostToolUse` section for the
`Agent` tool and this repository's live run trace (`.superdev/scopes/run-trace-evidence/trace.log` of the
main checkout): the agent id that run-trace's hook payloads carry inside a background subagent
(`a935f21b116529cc5`, 13 trace lines) equals the `agentId` the parent's `Agent` tool result returned for
that dispatch. Still open: no captured `SubagentStop` payload confirms that its `agent_id` carries the same
value.

Verified 2026-10-11, on Claude Code 2.1.296, against the live hook payloads of the resume probe (see "A SendMessage
resumes a finished subagent as a new run" below). The `PostToolUse` payload of a foreground `Agent` call carried
`tool_response.status: "completed"` with `agentId: "a2f6704ab6019b817"`, `agentType`, and `content`. That call's
`SubagentStart` and `SubagentStop` carried the same `agent_id`, and its `SubagentStop` fired before the
`PostToolUse`. This confirms the `SubagentStop` `agent_id` for a foreground subagent. A background one is still
unconfirmed.

## A subagent's report arrives through the SubagentHandback tool

On Claude Code 2.1.271 and later, a subagent that runs with the `SubagentHandback` tool delivers its report
through it, and Claude Code provides that tool in auto mode. The `Agent` tool's `content` then carries only a
short hand-back note, and the last assistant message of the subagent is the hand-back call, not the report. A
foreground subagent's `PostToolUse` payload on `Agent` carries the report in `tool_response.handbackReport.text`.

**Mitigation:** superdev reads no report from the run trace's hook events. The run trace records no review
verdict (ADR 0197), so `hooks.json` registers no hook on `SubagentHandback`, and `run-trace.js` reads neither
`tool_input.message`, `last_assistant_message`, nor `handbackReport`. The controller reads a reviewer's report from
the dispatch's own result, and the run trace records only the dispatch lines: `run-trace.js` ends a background
dispatch on `SubagentStop`, matched by its `agent_id`, and a foreground one on `PostToolUse` on `Agent`.

Verified 2026-10-10, on Claude Code 2.1.296, against the hooks reference
(`https://code.claude.com/docs/en/hooks`): it states that Claude Code provides `SubagentHandback` in auto mode,
and that a hook reads a hand-back report by matching `SubagentHandback` and reading `tool_input.message`.
Verified 2026-10-11, on Claude Code 2.1.295, in a session transcript dated 2026-10-10: the `Agent` tool result
of a foreground review has `status: completed` and `handbackReport` as an object, `{"text": "<report>"}`.

## A subagent dispatch can end with no SubagentStop

The run trace gives every dispatch one end with an outcome (ADR 0140). `SubagentStop` reports only a
subagent that finishes. A failed `Agent` call fires `PostToolUseFailure` with its `tool_use_id`. A
`TaskStop` on a background subagent fires no `SubagentStop`, and its own `PostToolUse` carries the
subagent's agent id as `tool_input.task_id`. A `PreToolUse` hook that blocks an `Agent` call fires no
event for that call afterward. `/exit` while a background subagent runs fires `SessionEnd` and no
`SubagentStop`.

**Mitigation:** `run-trace.js` ends a dispatch from the event that names it: `PostToolUseFailure` and
`PermissionDenied` on `Agent` by `tool_use_id`, and `PostToolUse` on `TaskStop` by the agent id a
`dispatch-bind` line recorded. A dispatch that no event names ends at the main session's next `Stop`,
`UserPromptSubmit`, or `SessionEnd` with the outcome `unknown`, or `session-end` where the session ends
while it runs. The `dispatch` line carries the session id for that match. The first end for a dispatch wins,
so a `SubagentStop` that fires after one of these ends adds none.

Verified 2026-10-11, on Claude Code 2.1.296, with the throwaway hook probe on branch
`prototype/hook-end-probe` (commit `a273217c`), which logged every hook event of four `claude -p` sessions
and one interactive session. An `Agent` call with a nonexistent subagent type fired `PreToolUse`, then
`PostToolUseFailure` carrying the same `tool_use_id`, then `Stop`. An `Agent` call that a `PreToolUse` hook
denied fired `PreToolUse`, then `Stop`, with no `PostToolUseFailure` and no `PermissionDenied`. A background
subagent stopped with `TaskStop` fired `PreToolUse` and `PostToolUse` on `TaskStop` with `task_id` equal to the
`agent_id` of its `SubagentStart`, then a `UserPromptSubmit` carrying a `<task-notification>`, then `Stop`, and
no `SubagentStop`. In the interactive session, a background subagent ran across four turns: each turn's `Stop`
listed it in `background_tasks` with status `running`, so a `Stop` is no end of a background dispatch. The
session then ended with `/exit` (`SessionEnd`, reason `prompt_input_exit`) while that subagent still ran, and
no `SubagentStop` for it followed.

`PermissionDenied` is not observed: the hooks reference (`https://code.claude.com/docs/en/hooks`) states that
it fires only in auto mode and carries `tool_use_id`, and the probe ran under `bypassPermissions`.

## A SendMessage resumes a finished subagent as a new run

A `SendMessage` to the agent id of a finished subagent resumes it, and the resumed run ends on its own
(issue #992). The dispatch's `Agent` call fired its events once, so only the `SendMessage` call and the
subagent's own start and stop events mark the new run.

**Mitigation:** `run-trace.js` reads `PreToolUse` on `SendMessage`. When `tool_input.to` names an agent id that
a `dispatch-bind` line ties to an ended dispatch, foreground or background, it appends a `dispatch-resume <tool_use_id> <agent_id>
<session_id> <sendmessage_tool_use_id>` line on that dispatch's slice, which opens a new run. The resumed run's `SubagentStop` writes its
own `dispatch-end`, and a session end with the resumed run open ends it `session-end`. The `SendMessage` call
that opened the run, named by the line's last field, ends that run `failed` or `denied` when it fails
(`PostToolUseFailure`) or is denied (`PermissionDenied`). A later `SendMessage` to the running dispatch ends
nothing, and a `TaskStop` ends the run `stopped`. A `SendMessage` to a
running dispatch or to an agent id no `dispatch-bind` names writes nothing. The hook reads `PreToolUse`, so the
resume line lands before the resumed run's `SubagentStop` can fire.

Verified 2026-10-11, on Claude Code 2.1.296, with a throwaway `claude -p` probe in the shape of branch
`prototype/hook-end-probe` (every hook event logged as one JSON line). A foreground `Agent` call (agent id
`a2f6704ab6019b817`) fired `PreToolUse` on `Agent`, `SubagentStart`, `SubagentStop`, and `PostToolUse` on `Agent`.
That `PostToolUse` response carried `status: "completed"` and the agent id as `agentId`, which binds the dispatch.
A `SendMessage` with `tool_input.to` equal to that agent id then fired `PreToolUse` and `PostToolUse` on
`SendMessage`. The `PostToolUse` response carried `success: true` and `resumedAgentId` equal to the agent id. A
`SubagentStart` and a second `SubagentStop` for the same `agent_id` followed. The `SendMessage` tool is deferred, so
the probe loaded it through `ToolSearch` first.

## A PreToolUse command rewrite reaches PostToolUse hooks

A PreToolUse hook can return `updatedInput`, which replaces a tool's arguments before the tool runs.
A PostToolUse or PostToolUseFailure hook then receives the rewritten `tool_input`, because that is the
command that ran. RTK, a third-party output filter, ships such a hook: it rewrites `bun run test` to
`rtk bun run test`. The run trace reads no Bash command (ADR 0227): it records a test run only from
`scope.js test` and `scope.js fail-to-pass`, which write the run line themselves, so a rewrite hides no run.

**Mitigation (implemented):** merge-guard reads each line as raw text and needs no `rtk` handling: a lead word
(`git`, `gh`, `tea`, or `scope.js`) followed later on the line by a verb word is denied wherever `rtk`, or any
other prefix, stands before it, so `rtk git push` and `rtk proxy git push` are denied alike.

The PreToolUse hooks are out of the rewrite's reach. Claude Code runs every matching hook of one event
in parallel, so `hooks/merge-guard.js` receives the
command as it was written, before RTK's hook rewrites it. `hooks/run-trace.js` denies a modelless dispatch on the Agent
tool, which RTK does not rewrite. `hooks/slicetree-sweep.js` and `hooks/scope-prune.js` run on Stop and
read no command.

An agent can still type the `rtk` prefix itself, and RTK runs the command behind it. `hooks/merge-guard.js`
denies a subagent's hand-typed `rtk git push`, `rtk gh pr merge`, `rtk proxy git push`, `rtk proxy -- git push`,
and `rtk proxy rtk git push` through the same raw-text rule, which names no prefix (#958).

**Fix required at:** no platform fix is due, because the hook sees the command that actually ran. A
different rewriting hook needs no change to `hooks/merge-guard.js`, which reads no prefix.

Verified 2026-10-08, on Claude Code 2.1.289 and rtk 0.51.0. Two session transcripts of that day show
RTK's PreToolUse hook rewriting `bun run test` to `rtk bun run test`, and the run-trace hook of superdev
0.66.1 recording no `run` line for either run. A full run that RTK did not rewrite, with the same working
directory, recorded its line. `rtk bun run t` on a script that exits 3 exited 3. The hooks reference
(`https://code.claude.com/docs/en/hooks`) states that `updatedInput` replaces the tool's arguments
before it runs.

Verified 2026-10-09, on Claude Code 2.1.289 and rtk 0.51.0. `rtk rewrite` printed `rtk git commit -m x`
for `git commit -m x`, and `rtk git add -A && rtk git commit --no-edit` for the compound form. It printed
nothing and exited 1 for `git merge x`, `git merge --abort`, and `git -C <path> merge --continue`, so
RTK leaves a merge as written. It rewrote `git push`, `git pull`, `git checkout`, `git stash`, and
`git worktree remove` too. The hooks reference states that all matching hooks run in parallel.

Verified 2026-10-09, on Claude Code 2.1.289 and rtk 0.51.0. `rtk --help` listed `-v`/`--verbose`,
`--ultra-compact`, and `--skip-env` as rtk's global options that take no value. `rtk rewrite` printed
`rtk git push origin x` for `git push origin x` and `rtk gh pr merge 5` for `gh pr merge 5`, and printed
nothing for `git rebase main` and `tea pr merge 5`. `rtk tea --version` ran `tea` and printed its version,
so rtk runs a command it does not filter as written.

Verified 2026-10-09, on Claude Code 2.1.289 and rtk 0.51.0. `rtk --help` described `proxy` as "Execute
command without filtering but track usage", `err` as "Run command and show only errors/warnings", `run`
as "Execute argv directly, or a command string through an explicit shell", `summary` as "Run command and
show heuristic summary", and `test` as "Run tests and show only failures". Each subcommand's own `--help`
listed `--ultra-compact` and `--skip-env` as options that take no value. `rtk proxy`, `rtk run`,
`rtk summary`, and `rtk test` each ran `git --version` and printed its version, and `rtk err touch <file>`
created the file. `rtk log` and `rtk pipe` read a file or stdin and run no command.

Verified 2026-10-09, on rtk 0.51.0. `rtk proxy -- git --version`, `rtk run -- git --version`,
`rtk test -- git --version`, and `rtk summary -- git --version` each printed git's version, and
`rtk err -- git --version` reported that the command completed. Each subcommand runs the command after
its `--` separator. `rtk proxy rtk git --version` printed git's version too, so an rtk behind another rtk
runs the command behind it.

## Native Windows runs superdev under Git Bash

Claude Code runs on native Windows, and with Git for Windows installed it uses Git Bash as its shell.
superdev's hooks and scripts run under native Node, which does not translate MSYS paths such as
`/c/Users/…`. A path that git prints, or that a command carries as text, can therefore differ from a path
Node builds. Windows without Git Bash, where Claude Code uses PowerShell, is not supported (triage #1113).

**Mitigation (implemented, ADR 0150, INV-0153):** a shell runs only an operator-supplied command, and
that shell is `sh` from PATH, which Git for Windows provides. superdev's own process supervision, worktree
cleanup, and git calls are Node code or direct spawns with an argument array. A run's process tree ends
with `taskkill /pid <pid> /t /f` on Windows and with a process-group kill on POSIX. A path from git output
or from command text is normalized before it is compared with a path Node builds. A Windows process whose
parent has already exited is outside the tree `taskkill /t` walks, so it can outlive a killed run.

**Smoke checklist (manual, on a Windows machine with Git for Windows and Node on PATH):**

- `/superdev:publish-kb` publishes a staged page, and a live page reads back.
- `scope.js test` records the test command's exit status, for a test command in POSIX syntax and for a
  focused command over quoted paths.
- `scope.js fail-to-pass` kills a run that exceeds its bound and leaves no worktree behind.
- The Stop hook sweeps a merged slicetree. It reaps a scope when four conditions hold:
  - the ledger reads `closed`;
  - the run root has sat unchanged past the seven-day staleness window;
  - the scope branch is contained in base or gone;
  - the run root holds no scopetree and no slicetree.
- A `/c/…` path in a command locates the ledger.
- `core.hooksPath=/dev/null` disables git hooks under Git for Windows.

**Fix required at:** no platform fix is due. Removing the Node prerequisite is a later feature
(triage #1113).

Verification: pending. Date it, with the Claude Code and Git for Windows versions, when the checklist runs.

## The desktop app's wrap-up guidance competes with the chain start

The Claude desktop app's system prompt tells the model that a follow-up acting on the session's own
findings stays in the session and is asked through its wrap-up box (`mcp__ccd_turn__wrap_up`). The next
command a superdev Next block names is such a follow-up. Late in a long run, that guidance can win over
`references/response-shapes.md`'s `## The chain start`, and the session ends on the Next block after a
wrap-up call, with the successor not started.

**Mitigation (implemented, ADR 0253):** `## The chain start` makes the start the first action of the
closing, ahead of the app's wrap-up call. No hook holds a missed start. A missed start costs the operator
one typed command, the one the Next block prints.

**Fix required at:** none in superdev. The app's guidance is the app's own.

Verified 2026-11-03, on Claude Code 2.1.310 in the Claude desktop app: the system prompt of a session
carried the guidance that one piece of work acting on what the session just found stays in the session and
is asked through `wrap_up`. Operator reports of attended sessions ending on a Next block after a `wrap_up`
call, with the next command not started, are the evidence ADR 0213 records.

## Code Mode refuses a tool call whose PreToolUse hook gives no decision

Code Mode is an experimental Claude Code setting (`CLAUDE_CODE_EXPERIMENTAL_CODE_MODE=1`, interactive
terminal sessions only). In it, Claude writes JavaScript that the `REPL` tool runs, and the code makes the
tool calls. Each call from code reaches the PreToolUse and PostToolUse hooks under its own tool name. A
subagent also works in Code Mode, and its calls carry `agent_id` and `agent_type`. `merge-guard.js`,
`tree-guard.js`, and `run-trace.js` therefore match and decide as they do outside Code Mode. Two behaviours
differ:

- A PreToolUse hook that fails without a decision refuses a call from code. Exit 126, exit 127, an exit
  above 128, and a timeout each refuse it. Exit 1, the exit of an uncaught Node exception, lets the call
  run with a non-blocking error, as it does outside Code Mode. superdev's hooks run under `node` from PATH.
  Where `node` is missing, every Bash, Edit, Write, NotebookEdit, Agent, and SendMessage call from code is
  refused.
- UserPromptSubmit fires at the end of each piece of code, with `source: "poll_event"`, in the main session
  and in a subagent. `run-trace.js` reads it as a turn boundary, and `closeSession` ends each open dispatch
  that has no `dispatch-bind`. An Agent call from code returns `async_launched`, and its PostToolUse, which
  writes the bind, arrives before the poll event. The dispatch stays open until its SubagentStop. A poll
  event that carries `agent_id` closes nothing.

**Mitigation:** none shipped. Node on PATH is a stated prerequisite (root `AGENTS.md` → Stack), and a
refusal fails closed. Not observed: a foreground Agent call that is still running in background code when
another piece of code ends. If that dispatch has no bind when the poll event arrives, `closeSession` ends
it `unknown`.

**Fix required at:** none in superdev while Code Mode is experimental.

Verified 2026-11-19, on Claude Code 2.1.327 in a terminal session, Opus 5.5, auto mode, in a scratch
repository whose project hooks logged every event. A PreToolUse Bash hook exiting 1, then throwing, then
exiting 127, was run from code. The first two calls ran. The third was refused with "PreToolUse:Bash hook
error: [node]: the hook failed, so this call was not run.", and a retry was refused the same way. Outside
Code Mode, on the same version, all three calls ran. An Agent dispatched from code logged PreToolUse(Agent),
PostToolUse(Agent), PostToolUse(REPL), then UserPromptSubmit with `source` `poll_event`. The subagent's own
`sleep 45` ran through its own REPL call, with `agent_id` and `agent_type` `general-purpose` on the hook
input. Its poll event carried the same `agent_id`.

## A subagent's foreground Bash call moves to the background after 180 s

Inside a dispatched subagent, Claude Code moves a foreground Bash call to the background once it has run for
180 s, even when the call passes `timeout` 600000. The tool result reads "Command was moved to the background
(ID: …) after running for 180s", names the output file, and says the subagent will be notified when the command
completes. In the main session, a foreground call with the same `timeout` runs past 180 s. The documentation
describes the move only at the call's own timeout, and states that a foreground subagent's moved command stops
when the subagent's run ends. It offers no tool that blocks until a background command ends. `implementer`'s
`tools` list holds neither `TaskStop` nor `Monitor`.

**Mitigation (implemented):** a subagent writes each test run's exit status into the run's output file, and
waits for that line with repeated Bash calls of under 180 s before it reads the outcome. It starts no second copy
of a moved run and ends no turn while the run lasts (`plugin/references/test-selection.md`'s
`## The two commands`, ADR 0264).

**Fix required at:** the Claude Code platform layer: a foreground subagent call that keeps its `timeout`, or a
blocking wait on a background command.

Verified 2026-11-20, from the local transcripts of 2026-11-14 to 2026-11-20 on Claude Code 2.1.321, 2.1.325, and
2.1.326. In subagent transcripts, 59 foreground Bash calls were moved to the background, 52 of them with "after
running for 180s", and 31 of the 59 were test runs. 4 subagent calls ran past 185 s in the foreground. In main-session transcripts, 29 foreground
calls ran past 185 s and none moved at 180 s. The documentation read that day
(`https://code.claude.com/docs/en/tools-reference.md`, `https://code.claude.com/docs/en/sub-agents.md`,
`https://code.claude.com/docs/en/env-vars.md`) names no 180 s limit.

## No hook can alert the operator, and AskUserQuestion raises no alert of its own

A command that stops on an `AskUserQuestion`, or on a Next block that carries a `Blocked:` or `First:` line, waits
for an operator who may have walked away. Claude Code's own alerts do not cover it. A `Notification` hook receives
the alerts Claude Code sends (`permission_prompt` after about six seconds, `idle_prompt` about 60 seconds after a
turn ends, and others), and `AskUserQuestion` is not among their triggers. A hook cannot create or change an alert,
and no hook output raises one. The `PushNotification` tool sends a desktop notification, and a phone push under
Remote Control. Only the model can call it, and it is a deferred tool. Its input is a `message`, under 200
characters, and an optional `status` of `proactive`. It skips the send when the operator is at the terminal, and
the operator's own push settings govern it.

**Mitigation (implemented):** `hooks/operator-alert.js` denies an attended superdev session's `AskUserQuestion`
call, or blocks its Stop on a `Blocked:` or `First:` Next block, once per wait. Its reason asks the model to load
and call `PushNotification` (ADR 0272). It reads the session transcript for that, and relies on these shapes:

- A typed prompt is a `user` entry with string content and no `isMeta`. A typed slash command opens with
  `<command-message>`, carries `<command-name>/superdev:<name></command-name>`, and carries `<command-args>` when
  it has arguments. The skill body it expands to is a separate `isMeta` entry.
- A Skill tool call is an `assistant` `tool_use` block named `Skill`, with input `skill` and `args`.
- An `AskUserQuestion` answer is a `user` entry whose content holds a `tool_result` block with that call's
  `tool_use_id`.
- A PreToolUse hook's deny lands as a `tool_result` with `is_error` set, whose text carries the hook's stderr after
  `PreToolUse:<tool> hook error: [<command>]: `.
- A compact summary carries `isCompactSummary`. Notices from the harness and other sessions carry `isMeta`, or open
  with `<task-notification>`, `<system-reminder>`, or `<local-command-`.
- The Stop input carries `last_assistant_message` and `stop_hook_active`.

The shape of a Stop hook's block reason in the transcript is not observed. The hook detects its own Stop re-entry
through `stop_hook_active` alone. A resumed session's new transcript may lack the superdev start, and the hook then
passes.

**Fix required at:** Claude Code, an alert on a pending `AskUserQuestion`. Until then the hook's prompt stands.

Verified 2026-11-21, on Claude Code 2.1.327 in the desktop app, against code.claude.com/docs (`hooks.md#notification`,
`hooks.md#stop`, `tools-reference.md`, `remote-control.md`), the `PushNotification` tool schema a session loaded,
and this repository's own session transcripts: a typed `/superdev:status` entry, a `Skill` call to `superdev:plan`
with its `args`, `AskUserQuestion` answers, `merge-guard.js` denials as `is_error` results, and a compact-summary
entry.
