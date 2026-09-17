# 0067: The grader-shape gate tracks the eval runner's capability

**Status:** Accepted

**Context.** `evals/*/case.yaml` and `evals/*/graders/*.md` have two readers. `claude plugin eval` accepts
six grader types. `scripts/eval-run.js`, the runner `bun run eval` invokes, grades `llm` and `regex` and
reports anything else as a grader error (ADR 0024 names those two deliberately).

`drift-check`'s `eval-shape` check landed on 2026-07-31, when `claude plugin eval` was the only reader, and
validated a grader's `type` against that reader's six. `eval-run.js` landed on 2026-08-12. Nothing narrowed
the gate, so a grader carrying one of the other four passes `bun run test` and then errors at run time.
`scoreArm` drops an errored grader from both arms of the fraction, and the report prints its row with a `—`
and no reason, which `evals/README.md` teaches the reader to read as a long transcript. The grader
contributes nothing to the comparison and looks ordinary doing it — after the run has spent its budget.

**Decision.** The gate validates a grader against what `scripts/eval-run.js` grades, not against what
`claude plugin eval` accepts. `GRADER_TYPES` holds `llm` and `regex`. A grader this repository could author
but not grade fails `bun run test`, which is the purpose the check was added for: a malformed grader fails
the suite instead of surfacing part-way through a paid run.

This narrows what superdev authors, never what the files are. ADR 0024's decision stands unqualified —
`case.yaml` and `graders/*.md` remain the single source both readers read, and `claude plugin eval` stays
available for a key-funded cross-check over every grader this repository writes.

## Considered options

- **Implement the four types in `eval-run.js`.** Full parity, so a case written for either reader runs
  under both. Rejected: ADR 0024 chose the two-type subset on purpose, and no case has used the other four
  across every grader file in `evals/`. It is four graders' worth of code, tests, and documentation for a
  capability nobody has asked for, and the gap it closes is closed more cheaply by refusing the type.
- **Leave both sets alone and make the report loud.** Strictly additive, and it keeps the gate legal for
  both readers. Rejected as the whole answer: it finds the fault after the spend, which is the failure the
  `eval-shape` check exists to prevent. Taken as the *other half* — a grader that errors for any reason
  now names itself and fails the run — because the report must still carry the faults a gate cannot
  predict, such as a regex that will not compile or a judge that never answers.

## Consequences

- A `file_exists`, `tool_order`, `tool_used`, or `baseline` grader can no longer be authored here. Writing
  one for the `claude plugin eval` cross-check alone means widening `GRADER_TYPES` again, deliberately, and
  reversing this decision.
- The gate is now stricter than the format. A future reader meeting a two-entry `GRADER_TYPES` beside a
  six-type reader would otherwise read it as an oversight and re-widen it, which is what this record
  prevents.
- The gate and the runner are now one fact in two places, and nothing links them. A type added to
  `eval-run.js` and not to `GRADER_TYPES` is a grader the runner can grade and the gate refuses — the
  inverse of this defect, and the cheaper direction to notice.
