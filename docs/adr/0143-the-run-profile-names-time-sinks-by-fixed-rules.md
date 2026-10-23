# 0143: The run profile names time sinks by fixed rules

**Status:** Superseded

**Superseded by:** [ADR 0171](0171-profile-and-prose-check-are-removed.md), which removes `/superdev:profile` and `/superdev:prose-check`.

**Context.** An operator runs `/superdev:profile` after a slow scope run to learn why it was slow and what
would make the next run faster. The report showed where the time went and left the cause and the remedy to
the operator. Its own grouping hid the largest cause: a full suite run in the background through
`scope.js test full` counted only its launch, about one second, while the loop that waited for it carried
the suite's minutes under `sleep`, `grep`, and `tail`. A background Bash call's own `tool_result` returns
at launch. Its completion arrives later as a `<task-notification>` whose `<tool-use-id>` names the launching
call and whose `<status>` reads `completed`, carried by a `queued_command` attachment.
Verified 2026-10-12, on Claude Code 2.1.295, against session `1822c7f9` under
`~/.claude/projects/-Users-stefan-Development-agents-superdev`: background task `bvddhxsa0` launched at
00:29:33 and its completion notification arrived at 00:38:56.

**Decision.** `plugin/scripts/profile.js` closes the report with a `Time sinks` section that a fixed rule
set produces. A cause is a sink when it holds at least 20% of the scope's machine time, the phases' wall
time less human wait and idle. The rules cover test runs, a phase run in a prompting permission mode, model
time, subagent time by agent type, hook time by event, any other large command, and human wait with idle
when together they exceed machine time. A test run is a `scope.js test` or `scope.js fail-to-pass` call,
whether a path or a shell variable names the script, or a direct run of the full, focused, or whole-repo
command in the repository's `docs/agents/verification.md`. The text of the run's own statement decides its
mode. A statement that matches the focused command, with `{paths}` standing for one or more words, is a
focused run. A statement equal to the full or whole-repo command is a run of that mode. Any other statement
that keys the same as a configured command did not narrow, so it is a whole-repo run when its key is the
whole-repo command's alone, and a full run otherwise. The test-run sink labels each of these runs by its mode,
as it labels a `scope.js test` run. Hook time by event
counts parallel Stop hooks once, at the slowest one, since the session waited for that one alone. With no
machine time, only the wait sink can fire. A command's sink
figure leaves out the time it overlaps a background test run, so a loop polling that run counts toward the
test-run sink alone. A remedy
names only a lever the operator controls in their own repository or session, and a sink with no such lever
is still named, with its figures. A background Bash call counts from its launch to its completion
notification, in the commands table and in the sinks alike, and the phases view counts that interval as
tool time: a turn-end gap it covers is tool time, never idle, as a subagent interval keeps a gap it covers. The skill prints the report as the script
writes it and adds no reading of its own.

**Considered options.**

- **Diagnosis in the skill's prose.** The model reasons over the report and the repository's
  configuration. Its answer differs between runs, no test can hold it, it needs a stronger model than
  `haiku`, and it can restate a figure wrongly.
- **Comparison against earlier runs.** It needs a store of past profiles, which the transcripts do not
  provide.
- **Reading the run trace for test-run facts.** `/superdev:wrap-up` reaps the run root that holds it, and
  the transcripts already carry each `scope.js test` command.
- **A rule for a slow hook.** A transcript names a hook only by its event, such as `PreToolUse:Bash`, so a
  repository's own hook cannot be told apart from superdev's.
- **Remedies aimed at superdev's own prose or hooks.** The operator who runs the profile cannot change
  them.

**Consequences.** A cause no rule covers, such as the time of a non-Bash tool, produces no sink, and the section then says no dominant cause
was found. The 20% threshold is measured against machine time, so a long human wait never hides a machine
cause. A background call's row can overlap the rows of calls that ran while it did, so the commands
table's totals no longer sum to the Bash time of the calls. The completion notification is undocumented
Claude Code behaviour: a background call that has none is reported as unfinished and carries no duration.
