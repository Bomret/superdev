// The trace lines plugin/hooks/run-trace.js writes through lib/trace-log.js's appendTrace for four dispatches of
// session s1, with the ledger lines scope.js writes around them: the run's `init`, `step set plan`, `step clear`, `stage set implementing`,
// and `step set implement` first, slices 04 and 05 `in-progress` before tu1, slice 04 `merged` and slice 05 `blocked` after tu1, a `step set review` line before tu2, and
// a `step block review` line last, each without its leading timestamp (a `dispatch` line ends with the session id, a `dispatch-end`
// line with its outcome): tu1 a background dispatch on slice 04, bound to agent ag1 and ended
// by its SubagentStop, then resumed through a SendMessage (a `dispatch-resume` line: tool_use_id, agent id, session id, the SendMessage call's tool_use_id) and ended
// again by the resumed run's own SubagentStop; tu2 a background scope-level final-reviewer, bound to agent ag2, whose hand-back records its `final-verdict` line before its SubagentStop ends it, then resumed through a SendMessage, whose second hand-back records the resumed run's own `final-verdict` line; tu3 a dispatch on
// slice 05 still running; tu4 a background slice-reviewer on slice 04, bound to ag4, whose hand-back
// records its verdict on tu1 before its SubagentStop ends it. tests/run-trace-dispatch.test.js parses the JSON between the two markers and asserts the
// hook writes exactly these lines; parse.test.ts asserts `eventLog` reads them. A layout change on
// either side fails one suite, so edit this list, not either test.
export const TRACE_LINES: string[] = /* trace:start */ [
  "scope main ledger init feat/a planned",
  "scope main ledger step set plan",
  "scope main ledger step clear",
  "scope main ledger stage set implementing",
  "scope main ledger step set implement",
  "04 main ledger slice 04 in-progress",
  "05 main ledger slice 05 in-progress",
  "04 main dispatch superdev:implementer tu1 Build\\x20slice\\x2004 s1",
  "04 main dispatch-bind superdev:implementer tu1 ag1",
  "04 main dispatch-end superdev:implementer tu1 completed",
  "04 main dispatch-resume tu1 ag1 s1 sm1",
  "04 main dispatch-end superdev:implementer tu1 completed",
  "04 main ledger slice 04 merged a1b2c3d..e4f5a6b",
  "05 main ledger slice 05 blocked",
  "scope main ledger step set review",
  "scope main dispatch superdev:final-reviewer tu2 Final\\x20review s1",
  "scope main dispatch-bind superdev:final-reviewer tu2 ag2",
  "scope main final-verdict tu2 with-fixes 0",
  "scope main dispatch-end superdev:final-reviewer tu2 completed",
  "scope main dispatch-resume tu2 ag2 s1 sm2",
  "scope main final-verdict tu2 yes 0",
  "scope main dispatch-end superdev:final-reviewer tu2 completed",
  "05 main dispatch superdev:implementer tu3 Build\\x20slice\\x2005 s1",
  "04 main dispatch superdev:slice-reviewer tu4 Review\\x20slice\\x2004 s1",
  "04 main dispatch-bind superdev:slice-reviewer tu4 ag4",
  "04 main verdict tu4 fail changes-needed 0 tu1",
  "04 main dispatch-end superdev:slice-reviewer tu4 completed",
  "scope main ledger step block review"
] /* trace:end */
