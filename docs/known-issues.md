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
instead. An unattended run stops itself before that, at the cap `references/scope-mode.md`'s
`## Degraded passes` section states, so the stop happens through superdev's own block procedure and
leaves a tracker record rather than a terminated session and a stranded run root (ADR 0041). The
documented stage-2 false-positive rate is 0.4%, so a denial is not by itself evidence of a real hazard.
Plugin subagents ignore the `permissionMode`, `hooks`, and `mcpServers` frontmatter fields, so superdev's
own agents cannot change any of this; the levers are the consumer's `permissions.allow` and a copy of the
agent under `.claude/agents/`. What the chain does about a denial is `references/scope-mode.md`'s
`## Degraded passes`, and ADR 0039 records the decision.

Verified 2026-08-23, against Anthropic's *How we built Claude Code auto mode* engineering post
(`https://www.anthropic.com/engineering/claude-code-auto-mode`) and the *Create custom subagents*
documentation (`https://code.claude.com/docs/en/sub-agents`), both read that day.

## SubagentStart carries no prompt, so the Agent tool's own events record a dispatch

The run trace maps a subagent dispatch to its run root and slice through the dispatch prompt (ADR 0117,
ADR 0127). `SubagentStart` carries `agent_id`, `agent_type`, and no `prompt`, so
`PreToolUse` on the `Agent` tool, which carries `tool_input.prompt` and `tool_input.subagent_type`, records
the dispatch, keyed by `tool_use_id`. The `PostToolUse` `tool_response` for `Agent` carries a `status` field:
`completed` for a foreground dispatch, `async_launched` with an `agentId` for a background one. The hooks
reference documents both fields (its `PostToolUse` section for the `Agent` tool, which lists the
`async_launched` field set and says subagents run in the background by default). `run-trace.js` ties the `agentId` to the dispatch with a
`dispatch-bind` line, and the first `SubagentStop` with that `agent_id` ends it (a repeat writes no second end). A change to either field leaves a
dispatch without an end, and `final-reviewer`'s per-slice review check then reports the review missing.

**Mitigation:** the hook never blocks on an `Agent` event; a missing field records no end, which the check
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

## A subagent's report arrives through the SubagentHandback tool

The run trace records a slice review's verdict from the reviewer's own report (ADR 0136). On Claude Code
2.1.271 and later, a subagent that runs with the `SubagentHandback` tool delivers its report through it, and
Claude Code provides that tool in auto mode. The `Agent` tool's `content` then carries only a short hand-back
note. The report is that tool's `tool_input.message`,
and the last assistant message of the subagent is the hand-back call, not the report. `run-trace.js` therefore
reads the verdict from `PostToolUse` on `SubagentHandback`, matched in `hooks.json`, and falls back to
`SubagentStop`'s `last_assistant_message` for a reviewer that answers in plain text. Both events carry the
reviewer's `agent_id`, which the `dispatch-bind` line ties to its dispatch. A foreground reviewer has no
`dispatch-bind` when its hand-back fires, so it gets no `verdict` line.

**Mitigation:** the hook never blocks on either event. A report it cannot read records `unknown`, and a
review whose events never arrive records no `verdict` line, which a reader treats as a verdict not
recorded.

Verified 2026-10-10, on Claude Code 2.1.296, against the hooks reference
(`https://code.claude.com/docs/en/hooks`): its `SubagentStop` input lists `agent_id`, `agent_type`,
`agent_transcript_path`, and `last_assistant_message`, and its `PostToolUse` section for the `Agent` tool says
that a hook reads a hand-back report by matching `SubagentHandback` and reading `tool_input.message`. Observed
in a session transcript written by Claude Code 2.1.295: slice reviewer `a2376f9e567dfb4a5` ended with a
`SubagentHandback` call whose message ends in `### Verdict: specification ✅ | quality: approved`, and no
assistant text followed it. The `PostToolUse` payload for `SubagentHandback` was not captured from a live
hook.

Verified 2026-10-10, on the same hooks reference: it states that Claude Code provides `SubagentHandback` in auto
mode. Whether a run outside auto mode ever has the tool was not tested.

## A PreToolUse command rewrite reaches PostToolUse hooks

A PreToolUse hook can return `updatedInput`, which replaces a tool's arguments before the tool runs.
A PostToolUse or PostToolUseFailure hook then receives the rewritten `tool_input`, because that is the
command that ran. RTK, a third-party output filter, ships such a hook: it rewrites `bun run test` to
`rtk bun run test`. `hooks/run-trace.js` matches the configured verification command at the segment's
command word, after the wrappers it knows. Before it knew `rtk`, it read `rtk` as the command and
recorded no run line, so `scope.js suite reusable` refused a green tip (#955).

**Mitigation (implemented):** `hooks/run-trace.js` reads `rtk` as a prefix wrapper, as it reads `nice`
or `nohup`, and it skips rtk's `proxy` subcommand after it. RTK passes the wrapped command's exit status
through, so the run records its outcome. `hooks/run-trace.js` skips none of rtk's other subcommands
that run a command: `rtk err`, `rtk run`, `rtk summary`, or `rtk test` in front of the configured
verification command records no configured-command run, and a named test file still records a `path`
run (triage #941). `RTK_PREFIX` in `hooks/green-gate.js` and `hooks/merge-guard.js` takes all five.
`hooks/ledger-guard.js` knows `rtk` too, because `tests/ledger-guard.test.js` pins that it knows every
wrapper `run-trace.js` knows. `hooks/run-trace.js` reads a `git restore` or `git checkout` behind `rtk`
through the same wrapper list. `hooks/green-gate.js` takes an optional `rtk`, with rtk's value-less
global options, before `git` in its merge and commit matchers. RTK rewrites `git commit` to
`rtk git commit`, so without the prefix a commit that concluded a conflicted merge ran no suite (#957).
A rewrite by another hook that puts an unknown word in front of the command still hides the run.

The PreToolUse hooks are out of the rewrite's reach. Claude Code runs every matching hook of one event
in parallel, so `hooks/merge-guard.js`, `hooks/run-lock.js`, and `hooks/ledger-guard.js` receive the
command as it was written, before RTK's hook rewrites it. `hooks/model-explicit.js` matches the Agent
tool, which RTK does not rewrite. `hooks/slicetree-sweep.js` and `hooks/scope-prune.js` run on Stop and
read no command.

An agent can still type the `rtk` prefix itself, and RTK runs the command behind it. `hooks/merge-guard.js`
therefore takes the same optional `rtk`, with rtk's value-less global options, before `git` in its merge,
push, and rebase matchers and before `gh` or `tea` in its pull-request merge and API merge matchers.
Without the prefix, a subagent's hand-typed `rtk git push` or `rtk gh pr merge` passed the guard (#958).
rtk's run-anything subcommands, `proxy`, `err`, `run`, `summary`, and `test`, execute the command after
them, so `RTK_PREFIX` also takes one of them, with its value-less options and an optional `--`
separator, after rtk's global options. The whole prefix repeats, so an rtk behind another rtk matches
too. Without these, `rtk proxy git push`, `rtk proxy -- git push`, and `rtk proxy rtk git push` passed
the guard. `tests/green-gate.test.js` pins the two hooks'
`RTK_PREFIX` declarations byte-identical.

**Fix required at:** no platform fix is due, because the hook sees the command that actually ran. A
different rewriting hook needs its prefix added to the wrapper lists and to the `RTK_PREFIX` that
`hooks/green-gate.js` and `hooks/merge-guard.js` both carry.

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
