---
name: profile
description: Profile a slow scope run — where implement, review, and document spent their time, from Claude Code's own transcripts. Read-only.
argument-hint: "[slug]"
model: haiku
allowed-tools: Bash
---

# superdev profile

Show the operator where a scope run's wall-clock time went: the **run profile** (`CONTEXT.md`). It is
read from the session and subagent transcripts Claude Code already writes, so it works on any run whose
transcripts still exist, including a scope already shipped and reaped (ADR 0103). You write nothing, and
you change nothing.

## Run the profile

Take the slug from `$ARGUMENTS`: a bare slug as given, or the part after the `/` of a feature label
(`feat/run-profile` → `run-profile`). Empty → pass nothing, and the script profiles the scope whose phase
segment ended last. Run, from the repo root:

```sh
node "${CLAUDE_PLUGIN_ROOT}/scripts/profile.js" [slug]
```

**A non-zero exit is the whole answer.** Relay its message as it stands — it names the slug and the path
it searched, or says the transcript format is not recognized — and stop. Every number you state comes from
the report the script printed.

## Explain it

Print the report verbatim, then add a short reading of it:

- **The phase that took longest**, and which of its columns carried the time: subagent, tool, hook, or
  model. The report's per-hook breakdown can sum to more than the hook column: parallel Stop hooks count
  once toward it, as the slowest one, since that is the one the session waited for, while the breakdown
  still lists every hook's own duration.
- **The repeated command with the largest total**, with its count. A call that ran several commands
  shares its time among them, weighted by each command's solo runs across the repository's transcripts, so the total across all commands is the Bash time of every call that ran a command.
- **The slowest dispatch**, and whether it was the flagged member of a parallel batch — the one the run
  waited for. A background dispatch's own figures can arrive later than its report row: name one marked
  "not yet notified" as still awaiting its notification, and one marked "failed" or "killed" by that
  status. Name one marked "denied" or "blocked" by that status too — the auto-mode classifier or a
  PreToolUse:Agent hook refused it. None of these carry a duration.
- **Human wait, stated on its own.** It is time the run spent waiting for the operator — including a
  rejected dispatch's own window, the operator deciding at the permission prompt — and it is part of no
  machine figure you name. A phase the report marks as run in a prompting permission mode has tool times
  that include approval waits; say so when you name that phase's tool time.
- **Idle, stated on its own.** It is time the session sat at a turn end — or a run of consecutive turn
  ends — with nothing running until whatever closes the gap is anything other than a typed prompt: a
  message from another Claude Code session, a resumption note the harness inserts after a rate limit or a
  cut-off response, or a task notification arriving with no subagent covering the gap. It is part of no
  machine figure you name, and is never human wait: nobody typed anything to end it.

Name any unfinished calls and unrecognized entries the report lists. They carry no duration, so they
explain a gap rather than a cost.

End there. The profile sits outside the implement chain and names no
next command.
