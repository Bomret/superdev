'use strict';

// trace-log.js: the run trace's line layout (ADR 0117, INV-0117): the single writer of `<run-root>/trace.log`, its reader, and the field codec.

const fs = require('fs');
const path = require('path');
const { readBytes, stateOf, sameState, readSide, writeSide, withRunLock } = require('./run-digest.js');

// The run trace is `<run-root>/trace.log`, one event per line, space-separated:
//   <ISO-8601 UTC timestamp> <slice id|scope> <agent id|main> <kind> <kind fields...>
// `appendTrace` is its single writer. Kinds and their fields:
//   edit <test|impl> <path>
//   run <full|focused|whole|path> <pass|fail|unknown> <sha|unknown> <clean|dirty|unknown> <files> <ms> <command>   (written only by `scope.js test` and by the control run of `fail-to-pass`, which writes a `path` run; <files>: the run's test files, `encodePaths`, `-` for none; <ms>: the run's duration in whole milliseconds; <command>: the raw command as typed, through `traceField`, read with `untraceField`)
//   dispatch <agent_type> <tool_use_id> <description> <session_id|-> / dispatch-bind <agent_type> <tool_use_id> <agent_id> /
//   dispatch-end <agent_type> <tool_use_id> <completed|failed|denied|stopped|unknown|session-end>   (an end with no outcome reads completed, ADR 0140)
//   dispatch-resume <tool_use_id> <agent_id> <session_id|-> <sendmessage_tool_use_id|->   (a SendMessage resumed the dispatch's subagent: a new run, with its own dispatch-end)
//   ledger <verb> <args>     (written only by the ledger-writing verbs of this CLI, after they succeed)
//   fail-to-pass <base>..<tip> <fail-to-pass|pass-to-pass|unknown> <reason> <command>     (written only by `fail-to-pass`, which derives the first three fields and records its caller's command, ADR 0188; no test run)
//   tamper <ledger.md|trace.log>     (written only by a scope.js verb that writes to a run, when the file no longer matches the run's digest, ADR 0225)
// A trace an older release wrote can also hold `verdict` and `final-verdict` lines (ADR 0197), and `revert <paths>` and
// `restore <paths>` lines (ADR 0225): no writer appends them, and every reader tolerates them.
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

// A test command's arguments as the `run` line's last field: the path-set encoding, so a space, a comma, a `%`, and a leading
// `-` read back unchanged and an empty list is the absent field `-`. One empty argument is `%00`, which no other list encodes to
// (a `%` always encodes as `%25`), so it reads apart from no arguments. `decodeArgs` takes the field as `readTrace` returns it, and
// reads a line written without the field (`undefined`) as no arguments. Arguments are recorded verbatim, a secret passed as one included.
const encodeArgs = (args) => (args.length === 1 && args[0] === '' ? '%00' : encodePaths(args));
const decodeArgs = (field) => (field === '%00' ? [''] : decodePaths(field));

// event: { slice?, agent?, kind, fields? } as one trace line, newline included.
function traceLine(event) {
  const parts = [new Date().toISOString(), event.slice || 'scope', event.agent || 'main', event.kind, ...(event.fields || [])];
  return parts.map(traceField).join(' ') + '\n';
}

// event: { slice?, agent?, kind, fields? }. The append and the update of the trace's digest (`run-digest.js`) happen under the
// run's digest lock, so a check never reads a new line under an old digest. The digest moves only when the trace matched it
// before the append (or both were absent), so an outside edit stays visible to the next check. A failed write is swallowed:
// the trace never blocks the work it records. Returns whether the line was written, for the one caller that tells its user
// (`scope.js test`). A written line also refreshes the run lock (ADR 0220, INV-0186), so a run that keeps writing trace
// lines reads as live.
function appendTrace(runRoot, event) {
  try {
    const line = Buffer.from(traceLine(event), 'utf8');
    withRunLock(runRoot, () => {
      const file = path.join(runRoot, 'trace.log');
      const side = readSide(runRoot);
      const before = readBytes(file);
      const sealed = side.trace ? sameState(side.trace, stateOf(before)) : before === null;
      fs.appendFileSync(file, line);
      if (sealed) {
        side.trace = stateOf(before === null ? line : Buffer.concat([before, line]));
        writeSide(runRoot, side);
      }
    });
  } catch {
    // simplicity: silent by design (a recording failure must not fail a ledger verb); ceiling: a failed write loses that event; upgrade: add a stderr diagnostic if silent loss bites
    return false;
  }
  refreshLock(runRoot);
  return true;
}

// Sets `<runRoot>/run.lock`'s atime and mtime to now when it is a regular file. `lstat` and `lutimes` follow no
// symlink; nothing is created and the content is untouched. A failure is silent: the line already counts as written.
function refreshLock(runRoot) {
  try {
    const lock = path.join(runRoot, 'run.lock');
    if (!fs.lstatSync(lock).isFile()) return;
    const now = new Date();
    fs.lutimesSync(lock, now, now);
  } catch {
    // simplicity: silent by design (ADR 0220); ceiling: a failed refresh leaves the lock's age as it was
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

module.exports = { traceField, untraceField, encodePaths, decodePaths, encodeArgs, decodeArgs, traceLine, appendTrace, readTrace };
