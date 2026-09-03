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
