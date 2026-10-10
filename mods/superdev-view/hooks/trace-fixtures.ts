// The trace lines plugin/hooks/run-trace.js writes through scope.js's appendTrace for three dispatches,
// each without its leading timestamp: tu1 a background dispatch on slice 04, bound to agent ag1 and ended
// by its SubagentStop; tu2 a foreground scope-level dispatch, ended when it completes; tu3 a dispatch on
// slice 05 still running. tests/run-trace.test.js parses the JSON between the two markers and asserts the
// hook writes exactly these lines; parse.test.ts asserts `traceAgents` reads them. A layout change on
// either side fails one suite, so edit this list, not either test.
export const TRACE_LINES: string[] = /* trace:start */ [
  "04 main dispatch superdev:implementer tu1 Build\\x20slice\\x2004",
  "04 main dispatch-bind superdev:implementer tu1 ag1",
  "04 main dispatch-end superdev:implementer tu1",
  "scope main dispatch superdev:final-reviewer tu2 Final\\x20review",
  "scope main dispatch-end superdev:final-reviewer tu2",
  "05 main dispatch superdev:implementer tu3 Build\\x20slice\\x2005"
] /* trace:end */
