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
it searched, or says the transcript format is not recognized — and stop.

## Print it

Print the report exactly as the script wrote it, its closing `Time sinks` section included. The script's
rules name every time sink and its lever (ADR 0143), so the report is the whole answer: add no reading,
summary, or remedy of your own.

End there. The profile sits outside the implement chain and names no
next command.
