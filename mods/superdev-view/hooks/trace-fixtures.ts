// The trace lines plugin/hooks/run-trace.js writes through scope.js's appendTrace for four dispatches of
// session s1 (plus a `ledger step set review` line before tu2), each without its leading timestamp (a `dispatch` line ends with the session id, a `dispatch-end`
// line with its outcome): tu1 a background dispatch on slice 04, bound to agent ag1 and ended
// by its SubagentStop, then resumed through a SendMessage (a `dispatch-resume` line: tool_use_id, agent id, session id, the SendMessage call's tool_use_id) and ended
// again by the resumed run's own SubagentStop; tu2 a foreground scope-level final-reviewer, bound to agent ag2 when it completes, whose report records its `final-verdict` line before its end; tu3 a dispatch on
// slice 05 still running; tu4 a background slice-reviewer on slice 04, bound to ag4, whose hand-back
// records its verdict on tu1 before its SubagentStop ends it. tests/run-trace.test.js parses the JSON between the two markers and asserts the
// hook writes exactly these lines; parse.test.ts asserts `traceAgents` reads them. A layout change on
// either side fails one suite, so edit this list, not either test.
export const TRACE_LINES: string[] = /* trace:start */ [
  "04 main dispatch superdev:implementer tu1 Build\\x20slice\\x2004 s1",
  "04 main dispatch-bind superdev:implementer tu1 ag1",
  "04 main dispatch-end superdev:implementer tu1 completed",
  "04 main dispatch-resume tu1 ag1 s1 sm1",
  "04 main dispatch-end superdev:implementer tu1 completed",
  "scope main ledger step set review",
  "scope main dispatch superdev:final-reviewer tu2 Final\\x20review s1",
  "scope main dispatch-bind superdev:final-reviewer tu2 ag2",
  "scope main final-verdict tu2 with-fixes 0",
  "scope main dispatch-end superdev:final-reviewer tu2 completed",
  "05 main dispatch superdev:implementer tu3 Build\\x20slice\\x2005 s1",
  "04 main dispatch superdev:slice-reviewer tu4 Review\\x20slice\\x2004 s1",
  "04 main dispatch-bind superdev:slice-reviewer tu4 ag4",
  "04 main verdict tu4 fail changes-needed 0 tu1",
  "04 main dispatch-end superdev:slice-reviewer tu4 completed"
] /* trace:end */
