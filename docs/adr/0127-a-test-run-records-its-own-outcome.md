# 0127: A test run records its own outcome

**Status:** Accepted

**Amends:** [ADR 0117](0117-the-run-trace-is-hook-written-evidence.md).

**Amended by:** [ADR 0150](0150-shipped-code-starts-a-shell-only-for-an-operator-command.md), which replaces the
pipe handshake below with a Node watcher that starts the command itself.

**Context.** ADR 0117 infers a test run's outcome from the shape of the Bash command. The outcome is
known only when the test command is the whole command. On 2026-10-07, 24 consumer run traces held 921
run lines, and 657 of them (71%) read `unknown`. The causes were piped or exit-captured runs, background
runs, configured commands that are themselves compound (`a && b`), and wrapper rewrites. Claude Code
fires no hook when a background command finishes, and the Bash tool caps a foreground call at 600 s, so
a suite slower than that can never record an outcome through the hook. The same traces held no
`dispatch` line at all: `SubagentStart` carries no `prompt`, which ADR 0117's platform basis claimed it
did.

**Decision.** `scope.js test` runs a test command itself and appends the run line with the command's
own exit status. `full`, `focused`, and `whole` run the command `docs/agents/verification.md`
configures, verbatim. `-- <command>` runs the given command and classifies it the way the hook does.
Agents and controllers run tests through the verb, so piping, backgrounding, or wrapping the call no
longer changes the outcome. The hook still records a direct run, and skips a `scope.js test` call (the
script word of `node`, the call's own segment, never the commands around it) so that no run is recorded twice. The
verb holds its command on a pipe until its kill watcher has the command's process group, so a verb killed at
any instant leaves no command running. A suite run that `green-gate` performs also appends a run line, except a run killed at its bound or a spawn that never started, which carry
no verdict (INV-0009). A
dispatch is recorded from `PreToolUse` on the `Agent` tool, which carries the prompt. Its end is
recorded from `PostToolUse` on the `Agent` tool for a foreground subagent, and from `SubagentStop` for a
background one, matched through the `agentId` the launch result carries.

*Update 2026-10-14:* the pipe handshake above is superseded by
[ADR 0150](0150-shipped-code-starts-a-shell-only-for-an-operator-command.md). The verb starts a Node watcher
process with an IPC channel, and the watcher starts the command, so a verb killed before the watcher exists
starts no command. When the verb dies, its channel closes, and the watcher ends the command's process group
on POSIX, or its process tree through `taskkill` on Windows.

**Platform basis.** Verified 2026-10-07 against https://code.claude.com/docs/en/hooks: `SubagentStart`
documents `agent_id`, `agent_type`, and `cwd`, and no `prompt`. `PreToolUse` on the `Agent` tool
documents `tool_input.prompt`. No hook event reports the end of a background Bash command. The `Agent`
tool result carries `agentId` and `prompt` for both a background launch (`status: async_launched`) and
a finished foreground run (`status: completed`). This field was observed in 488
local transcript results on Claude Code 2.1.29x.

*Update 2026-10-08, Claude Code 2.1.294:* the hooks reference's `PostToolUse` section for the `Agent` tool
documents `status` and `agentId`, including the `async_launched` field set, so the field is documented.
Its agent id matches the one run-trace's hook payloads carry inside the background subagent (see
`docs/known-issues.md`). That no captured `SubagentStop` payload confirms its `agent_id` carries the same
value stays open.

**Considered options**

- **Better hook heuristics alone.** Match compound configured commands across segments, and strip known
  wrappers. It needs no change to agent prose. It loses because a background run and a piped run without
  `pipefail` stay `unknown`, so a slow suite never records an outcome.
- **Teach agents to run tests unpiped.** The reviewer prose already asks for it, and 71% of runs still
  read `unknown`.
- **Record the suite record from the verb.** It loses because an implementer's run in a slicetree would
  overwrite the scope's suite record. Once the runner records real outcomes, `suite set` and the trace
  agree without it.

**Consequences.** A run line written by the verb carries the real outcome whatever the caller does
around the call. A run killed before it finishes writes no line, because an unfinished process carries
no verdict (INV-0009). The verb records only the outcome of a command it ran itself, so INV-0117 still
holds: no caller chooses an event. A caller can still run a command that exits non-zero on a test file
to forge a failing run, the ceiling ADR 0117 already names. The dispatch record rests on a result
field of the `Agent` tool. If that field changes, the trace loses dispatch lines again and final-reviewer's
per-slice review check reports the gap.
