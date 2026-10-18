'use strict';

// dispatch-lines.js: the dispatch lines of a run trace: whether a trace holds a line for a dispatch, which line last opened or closed its run, and whether a line completed it.

const { untraceField } = require('./trace-log.js');

// Whether a trace holds an event of `kind` whose first-keyed field (index `at`) names the dispatch `tu`.
const holds = (events, kind, at, tu) => events.some((e) => e.kind === kind && e.fields[at] !== undefined && untraceField(e.fields[at]) === tu);

// The last line that opened or closed a run of the dispatch `tu`: its `dispatch`, a `dispatch-resume` (whose first field is
// the `tool_use_id`), or a `dispatch-end`. The dispatch is running unless that line is an end.
function lastRunLine(events, tu) {
  let last;
  for (const e of events) {
    const at = e.kind === 'dispatch-resume' ? 0 : 1;
    if ((e.kind === 'dispatch' || e.kind === 'dispatch-resume' || e.kind === 'dispatch-end') && e.fields[at] !== undefined && untraceField(e.fields[at]) === tu) last = e;
  }
  return last;
}

// A `dispatch-end` line finishes its dispatch only when it reads `completed`; an end with no outcome field, written before
// outcomes, reads `completed`.
const completedEnd = (e) => e.kind === 'dispatch-end' && (e.fields[2] === undefined || untraceField(e.fields[2]) === 'completed');

module.exports = { holds, lastRunLine, completedEnd };
