# 0140: The run files record each step start and each dispatch end

**Status:** Accepted

**Amends:** [ADR 0136](0136-the-run-trace-records-each-slice-review-verdict.md).

**Amended by:** [ADR 0147](0147-every-chain-command-records-its-start-and-its-end.md).

**Context.** The superdev-view scope page draws a run from its ledger and run trace. A timeline prototype
of that page (shell-scanner, 2026-10-10) showed facts the plugin does not record. A stage names the last
completed step, so `/superdev:review`'s whole fix loop runs while the ledger reads `merged`. No record
marks a review invocation's start, so a second fix loop's first cycle reads as cycle 4. A final review's
outcome is not in the trace. `dispatch-end` is written only for a completed dispatch, so a failed, blocked,
or stopped dispatch reads as running for hours. Every one of those gaps leaves a reader to guess.

A hook probe (Claude Code 2.1.296, 2026-10-11, branch `prototype/hook-end-probe`) found which events
report a dispatch's end:

- A failed `Agent` call fires `PostToolUseFailure` with its `tool_use_id`.
- A `PreToolUse` hook block fires nothing further for the call.
- `TaskStop` on a background subagent fires no `SubagentStop`. Its own `PostToolUse` carries the
  subagent's agent id as `task_id`.
- `/exit` with a background subagent running fires `SessionEnd` and no `SubagentStop`.

The hooks reference states that `PermissionDenied` fires only in auto mode and carries `tool_use_id`.

A foreground `Agent` call that completes carries the subagent's full report in
`tool_response.handbackReport.text` (observed on Claude Code 2.1.295 in a transcript dated 2026-10-10, re-read 2026-10-11).

**Decision.**

- **Step.** The ledger gains a `**Step:**` line. `scope.js step set <name>` writes it, and the trace
  mirrors the write as a `ledger` line, the way it mirrors `stage set`. The step names a chain step that has
  started and not yet completed: `review`, `document`, `submit`, `ship`, `verify-ship`, or `wrap-up`. A
  stage write clears it. A step that completes with no stage write clears it with `scope.js step clear`. A
  blocked step keeps it. A slice's own step is its status, and the full-tier playbook writes the
  `in-review` status to the ledger as well as to the store.
- **Dispatch outcome.** Every `dispatch` line gets exactly one `dispatch-end`, which carries an outcome:
  `completed`, `failed` (`PostToolUseFailure`), `denied` (`PermissionDenied`), or `stopped` (`TaskStop`,
  matched through the `dispatch-bind` agent id). A dispatch with no `dispatch-bind` and no end ends at the
  main session's next `Stop`, `UserPromptSubmit`, or `SessionEnd`, outcome `unknown`: a foreground or
  blocked call cannot outlive its main turn. At `SessionEnd`, every dispatch the session left open ends,
  outcome `session-end`. The `dispatch` line carries the session id for that match. The first end wins.
  A `SendMessage` that resumes a finished subagent writes a `dispatch-resume` line, which opens a new run
  of the same dispatch, and that run gets its own end (issue #992). The resume finds the dispatch through its
  `dispatch-bind` line, which a foreground dispatch gets from its `completed` response's `agentId` and a background
  one from its `async_launched` response's. The line carries the `SendMessage`
  call's own `tool_use_id` as its last field, so only that call's failure or denial ends the run it opened.
- **Final-review verdict.** The run-trace hook writes a `final-verdict` line for each `final-reviewer`
  dispatch inside a `review` step, which runs from its `step set review` line to the next `step clear`, `step set`
  of another step. A stage write that removes the ledger's step also appends a `step clear` line to the trace, so
  step lines alone carry the window, and a stage line that kept the step leaves it open. The line carries the report's `Ready to merge?` answer and the
  review's cycle: the `final-reviewer` dispatches that completed inside the step. A foreground review reaches the hook through
  `handbackReport.text`, and the same path now covers a foreground `slice-reviewer`.
- **Readers.** A reader of dispatch ends treats only a `completed` end as a finished dispatch. The review
  coverage rule and both review cycle counts read it so, because a failed or denied review reviewed nothing.
  A fix cycle's window still ends at the first dispatch after its implementer's end, whatever the outcome. A
  resumed dispatch has one end per run: each cycle count counts distinct dispatches, and the window is read per run,
  from each `dispatch` or `dispatch-resume` line to the first dispatch after the end that closes that run.
- **Layout.** New fields are appended to existing line kinds, never inserted. A `dispatch-end` with no
  outcome field reads `completed`.

**Considered options.**

- A `reviewing` stage. Review also runs at `submitted`, and a stage never moves back.
- A new slice status such as `simplifying`. Every slice-store seed maps the status set. Since ADR 0138
  the simplicity pass runs inside the slice review, so `in-review` covers it.
- A per-slice step column in the ledger's slice rows. Parallel slices need one, but the slice status and
  the recorded dispatches already state each slice's step.
- A trace-only `scope.js step` verb. It is an exception to INV-0117 and needs a new `ledger-guard`
  refusal. A ledger write mirrored to the trace is the class `stage set` already belongs to.
- A hook that detects a step's start from `UserPromptSubmit` or the `Skill` tool. With several live
  scopes it cannot tell which run root is meant.
- A hook that infers the review step from the first `final-reviewer` dispatch. The review step starts
  with a suite run, before any dispatch.
- Ending a dispatch only where the platform sends an event. A blocked or session-end dispatch then stays
  open forever.
- A controller-written review cycle. It is a caller-chosen event, and prose compliance drifts.
- Numbering reviews, or timing out an agent with no end, in superdev-view. The view would draw facts the
  run files do not state.

**Consequences.** A reader tells the step a scope is in, each fix loop and its cycles, each final review's
outcome, and how each dispatch ended from the run files alone. Each step start rests on a prose call, which
a drift row pins. A missed call leaves a step unrecorded, the failure the `in-review` status showed before
this change. An `unknown` or `session-end` outcome carries the boundary's time, not the moment the dispatch
ended. A background subagent that outlives `/clear` gets a `session-end` end while it still runs, and its
later `SubagentStop` adds no second end. The probe left the foreground interrupt untested. The boundary
close ends such a dispatch whatever event the platform sends.
