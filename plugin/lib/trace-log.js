'use strict';

// trace-log.js: the run trace's line layout (ADR 0117, INV-0117): the single writer of `<run-root>/trace.log`, its reader, and the field codec.

const fs = require('fs');
const path = require('path');

// The run trace is `<run-root>/trace.log`, one event per line, space-separated:
//   <ISO-8601 UTC timestamp> <slice id|scope> <agent id|main> <kind> <kind fields...>
// `appendTrace` is its single writer. Kinds and their fields:
//   edit <test|impl> <path>
//   run <full|focused|whole|path> <pass|fail|unknown> <sha|unknown> <clean|dirty|unknown> [<files>] [<ms>]   (written by `scope.js test`, and by the control run of `fail-to-pass` as a `path` run; <files>: a `path` run's test files comma-joined; a `scope.js test focused` run's path set, `encodePaths`; else `-`; <ms>: the run's duration in whole milliseconds, which those two writers record and the run-trace hook does not)
//   revert <paths> / restore <paths>
//   dispatch <agent_type> <tool_use_id> <description> <session_id|-> / dispatch-bind <agent_type> <tool_use_id> <agent_id> /
//   dispatch-end <agent_type> <tool_use_id> <completed|failed|denied|stopped|unknown|session-end>   (an end with no outcome reads completed, ADR 0140)
//   dispatch-resume <tool_use_id> <agent_id> <session_id|-> <sendmessage_tool_use_id|->   (a SendMessage resumed the dispatch's subagent: a new run, with its own dispatch-end)
//   verdict <reviewer tool_use_id> <pass|fail|unknown> <approved|changes-needed|unknown> <cycle> <implementer tool_use_id|->   (ADR 0136; at most one per review in sequential delivery, and a reader takes the first per dispatch)
//   ledger <verb> <args>     (written only by the ledger-writing verbs of this CLI, after they succeed)
//   fail-to-pass <base>..<tip> <fail-to-pass|pass-to-pass|unknown> <reason> <command>     (written only by `fail-to-pass`, which derives the first three fields and records its caller's command, ADR 0188; no test run)
// Every field is escaped so none holds a control character or a line separator: no field can start
// a new line. No CLI verb takes a caller-chosen event; `trace` only reads.
function traceField(v) {
  // An absent or empty field renders `-`, so every line keeps its field positions.
  if (v === undefined || v === null || v === '') return '-';
  return String(v).replace(/[\\\x00-\x20\x7f\u0085\u2028\u2029]/g, (c) => {
    if (c === '\\') return '\\\\';
    if (c === ' ') return '\\x20';
    if (c === '\n') return '\\n';
    if (c === '\r') return '\\r';
    if (c === '\t') return '\\t';
    return '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
  });
}

// The exact inverse of `traceField`, for a reader that re-writes a field it read back (`-` stays `-`).
function untraceField(v) {
  return String(v).replace(/\\(x20|n|r|t|u[0-9a-f]{4}|\\)/g, (m, c) => {
    if (c === '\\') return '\\';
    if (c === 'x20') return ' ';
    if (c === 'n') return '\n';
    if (c === 'r') return '\r';
    if (c === 't') return '\t';
    return String.fromCharCode(parseInt(c.slice(1), 16));
  });
}

// A changed-path set as one `run` line field (ADR 0175): each path with `%`, `,`, and a leading `-` as `%25`, `%2C`, `%2D`,
// joined by `,`, so a comma splits paths only and no path reads as the absent-field `-`. `traceField` then escapes the rest.
// An empty set is the absent field.
const encodePaths = (paths) => paths.map((p) => p.replace(/%|,|^-/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join(',');
// The inverse, from a field as `readTrace` returns it (still escaped): the exact set, `[]` for the absent field.
const decodePaths = (field) => (field === undefined || field === '-' ? [] : untraceField(field).split(',').map((p) => p.replace(/%(25|2C|2D)/g, (m, h) => String.fromCharCode(parseInt(h, 16)))));

// event: { slice?, agent?, kind, fields? }. One O_APPEND write per line, so concurrent writers never
// tear a line. A failed write is swallowed: the trace never blocks the work it records. Returns whether
// the line was written, for the one caller that tells its user (`scope.js test`).
function appendTrace(runRoot, event) {
  try {
    const parts = [new Date().toISOString(), event.slice || 'scope', event.agent || 'main', event.kind, ...(event.fields || [])];
    fs.appendFileSync(path.join(runRoot, 'trace.log'), parts.map(traceField).join(' ') + '\n', 'utf8');
    return true;
  } catch {
    // simplicity: silent by design (a recording failure must not fail a ledger verb); ceiling: a failed write loses that event; upgrade: add a stderr diagnostic if silent loss bites
    return false;
  }
}

// The trace's lines as events, oldest first: { ts, slice, agent, kind, fields }. Fields stay escaped
// (`untraceField` reverses one). The one reader of the line layout, shared by the hook and the verbs.
function readTrace(raw) {
  return raw.split('\n').filter(Boolean).map((l) => {
    const [ts, slice, agent, kind, ...fields] = l.split(' ');
    return { ts, slice, agent, kind, fields };
  });
}

module.exports = { traceField, untraceField, encodePaths, decodePaths, appendTrace, readTrace };
