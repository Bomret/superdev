# 0103: The run profile reads Claude Code's transcripts

**Status:** Accepted

**Context.** `/superdev:implement` and `/superdev:review` sometimes take a long time, and nothing in
superdev records where the time goes. Claude Code already writes one transcript per session under
`${CLAUDE_CONFIG_DIR:-~/.claude}/projects/<encoded path>/<session>.jsonl`, and one per subagent under
`<session>/subagents/`. Every entry carries a `timestamp` and a `cwd`. A foreground `Agent` result
carries `totalDurationMs`, `totalToolUseCount`, and `totalTokens` itself; a background
(`run_in_background`) dispatch's own result carries none of them, and its figures arrive later in a
task-notification, in one of three shapes: a structured `attachment.usage` field, a text-only `<usage>`
block inside that same attachment's own `prompt`, or a text-only `<usage>` block inside a plain `user`
entry's content. A hook's `hook_success` attachment and a `stop_hook_summary` carry each hook's
`durationMs`. `<encoded path>` is the working tree's absolute path with every non-alphanumeric character
replaced by `-`. Claude Code documents none of this layout.
Verified 2026-09-28, on Claude Code 2.1.283, against this repository's own session transcripts under
`~/.claude/projects/-Users-stefan-Development-agents-superdev`: the structured `attachment.usage` shape
and the text-only `user`-entry shape both appear as recently as 2.1.283, and the text-only
`attachment.prompt` shape appears from 2.1.217 through 2.1.283 — the three shapes coexist rather than
one superseding another.

**Decision.** `plugin/scripts/profile.js` measures a scope run by reading those transcripts after the
fact. superdev adds no instrumentation of its own. The script reads the transcript directory and writes
nothing to it. An entry that lacks a field the script reads is reported as unrecognized, and it is never
counted as zero.

**Considered options.**

- **Hook telemetry.** A PreToolUse and PostToolUse hook appends each tool call's duration to a
  `timing.jsonl` in the run root. It adds a process spawn to every tool call. It measures only runs made
  after it ships, and it cannot see model time between calls. The transcripts already carry the same
  data.
- **Ledger phase stamps.** `scope.js` stamps each stage's start and end into `ledger.md`. It is too
  coarse: it shows that a review was slow, and it cannot show why.
- **A timing section in `/superdev:status`.** It would make status depend on a Claude Code format, and
  it would slow a command that reads one ledger per scope today.

**Consequences.** The report works on any run whose transcripts still exist, including runs from before
it shipped and scopes whose run root is already reaped. It depends on a format Claude Code can change
without notice, so a changed format produces a named "not recognized" report instead of wrong numbers.
The report is specific to Claude Code.
