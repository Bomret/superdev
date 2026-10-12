# 0147: Every chain command records its start and its end

**Status:** Accepted

**Amends:** [ADR 0140](0140-the-run-files-record-each-step-start-and-each-dispatch-end.md).

**Context.** The superdev-view event log draws each chain command from its recorded start to its recorded
end (ADR 0141). An audit of every run trace in this repository (2026-10-12) found three commands whose
start or end the run files do not record:

- `/superdev:plan` records neither. The view starts plan at the run's first `ledger init` and ends it
  at the `implementing` stage, so a plan finished on Monday and implemented on Wednesday reads as a
  48-hour plan (triage #1069).
- `/superdev:implement` has no step. Its start is the `implementing` stage and its end is the `merged`
  stage. A resumed run writes no start, because a same-stage write traces nothing, and a run that stops
  with a slice blocked writes no end.
- A step that stops blocked keeps its step (ADR 0140), and the trace records no stop. The view draws
  that command as running after its session has ended.

INV-0144 forbids the mod to derive these facts, so the plugin must record them.

**Decision.**

- **`plan` and `implement` are steps.** `scope.js step set` accepts them beside `review` through
  `wrap-up`. `/superdev:plan` sets `plan` right after its first `scope.js init … planned` and clears it as
  its last act, after the release question. `/superdev:implement` sets `implement` on every entry into a
  run, a resumed one included. The `merged` stage write clears it, as every stage write clears a step.
- **Every `step set` records a start.** `step set` appends its trace line even when the ledger already
  carries that step, because each invocation of a command is a start of its own.
- **`init` keeps the step on a planned rewrite.** An `init` with entry stage `planned` that overwrites a
  `planned` ledger keeps its `**Step:**` line. An `init` with entry stage `implementing` writes no step.
- **A stop that leaves the step standing records it.** `scope.js step block` appends a `ledger step
  block <step>` trace line and leaves the ledger unchanged, so a resumed step still reads its own name.
  Every command exit that ends on a `Blocked:` or `First:` Next block, with its step still standing,
  runs it first.
- **Readers.** A command ends at its `step clear`, its `step block`, a stage write, or the next `step
  set`. Until a `ledger step set plan` line has passed, the first `ledger init … planned` starts plan,
  and until a `ledger step set implement` line has passed, the first `implementing` stage write starts
  implement, as before. A step line of that command with no log line since that start moves the start
  to the step line, and otherwise ends that start and opens a new one, so a run from before the step
  lines keeps its header when a later run writes one.

**Consequences.** Plan's start is recorded only once its run root exists, at the scope-branch cut or at
§6, so interview time before the cut stays unrecorded. A session that ends without reaching an exit, by
a crash or `/exit`, still records no end: a step carries no session id to match the way a dispatch does,
and the view draws that command as running until the next `step set` or stage write. An install of
superdev-view older than this change draws a second header for a trace that carries the plan or
implement step.

**Considered options.**

- A trace-only line kind, `plan-start` and `plan-end`. It leaves `init` and the step semantics
  unchanged, but it gives the view a second read path for the one command that would not be a step.
- Clearing the step on a blocked stop. The ledger's current step is what `/superdev:status` shows and
  what `publish` and `adopt` carry, so a clear would report a stopped command as no command started. No
  resume logic reads the step.
