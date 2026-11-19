'use strict';

// trace-window.js: the one derivation of a slice's implementer windows from the run trace, and the one slice and edit-path
// comparison and flag parser the read-only trace verbs share (ADR 0261, INV-0195, INV-0196).

const fs = require('fs');
const path = require('path');
const { readTrace, untraceField } = require('./trace-log.js');
const { rootRelative } = require('./run-tree.js');
const { fail } = require('./refusal.js');

// The domain shapes, named as CONTEXT.md names them.
//
// @typedef {object} RunTrace
//   lines:  the trace's lines exactly as recorded, oldest first, no empty line.
//   events: `readTrace` of the same lines, index for index: { ts, slice, agent, kind, fields }, fields still escaped.
//
// @typedef {object} Window
//   One run of an `implementer` dispatch, for one slice or `scope`.
//   id:    the dispatch's tool_use_id, as the trace records it.
//   slice: the slice field of the run's lines, decoded.
//   start: the index of the run's `dispatch` or `dispatch-resume` line.
//   until: the index of the boundary line that ends it, or null where it runs to the trace's end.
//   A line belongs to the window when its index lies in [start, until) and its slice is the window's slice: membership goes by
//   position in the file, never by timestamp.

const REVIEWERS = new Set(['final-reviewer', 'slice-reviewer', 'simplicity-reviewer']);

// The run trace of `root`; an absent file reads as an empty trace.
function readRunTrace(root) {
  let raw = '';
  try {
    raw = fs.readFileSync(path.join(root, 'trace.log'), 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const lines = raw.split('\n').filter(Boolean);
  return { lines, events: readTrace(raw) };
}

// A line's slice field, decoded the way `fail-to-pass.js` decodes it.
const sliceOf = (e) => untraceField(e.slice);

// An `edit` line's path as a root-relative POSIX path (MSYS paths included, ADR 0150), or null; `top` reads the tree root lazily.
const editPath = (e, top) => (e.kind === 'edit' && e.fields[1] !== undefined ? rootRelative(untraceField(e.fields[1]), top) : null);

// The name part of an agent type: `superdev:implementer` reads `implementer`.
const agentName = (type) => untraceField(type || '').split(':').pop();

// Every implementer window of `slice`, in recorded order. A run starts at a `dispatch` line, or at a `dispatch-resume` whose
// dispatch (the `dispatch` line with the same tool_use_id) is an implementer's. It ends at the first boundary line after its
// own `dispatch-end` (any outcome; an end with no outcome reads completed), or after its start when no end of its own follows
// before the dispatch's next run, or it runs to the trace's end. A boundary line is a line of the same slice that is a
// `dispatch` line, or a `dispatch-resume` of a reviewer's dispatch.
function windowsOf(events, slice) {
  const typeOf = new Map();
  for (const e of events) if (e.kind === 'dispatch' && !typeOf.has(e.fields[1])) typeOf.set(e.fields[1], agentName(e.fields[0]));
  const startsRun = (e) => (e.kind === 'dispatch' ? agentName(e.fields[0]) === 'implementer' : e.kind === 'dispatch-resume' && typeOf.get(e.fields[0]) === 'implementer');
  const boundary = (e) => sliceOf(e) === slice && (e.kind === 'dispatch' || (e.kind === 'dispatch-resume' && REVIEWERS.has(typeOf.get(e.fields[0]))));
  const idOf = (e) => (e.kind === 'dispatch' ? e.fields[1] : e.fields[0]);
  const out = [];
  events.forEach((e, start) => {
    if (sliceOf(e) !== slice || !startsRun(e)) return;
    const id = idOf(e);
    let end = start;
    for (let i = start + 1; i < events.length; i++) {
      const x = events[i];
      if (x.kind === 'dispatch-resume' && x.fields[0] === id) break;
      if (x.kind === 'dispatch-end' && x.fields[1] === id) { end = i; break; }
    }
    let until = null;
    for (let i = end + 1; i < events.length; i++) if (boundary(events[i])) { until = i; break; }
    out.push({ id, slice, start, until });
  });
  return out;
}

// The slice an implementer dispatch belongs to: the slice field of its `dispatch` line, or null where `id` names no
// implementer dispatch.
function dispatchSlice(events, id) {
  const d = events.find((e) => e.kind === 'dispatch' && e.fields[1] === id);
  return d && agentName(d.fields[0]) === 'implementer' ? sliceOf(d) : null;
}

// The indexes every run of dispatch `id` covers, for `slice`: a Set. `refuse` receives the message where `id` names no
// implementer dispatch, or one of another slice than `slice`.
function windowIndexes(events, id, slice, refuse) {
  const own = dispatchSlice(events, id);
  if (own === null) refuse(`--window ${id} names no implementer dispatch in this run's trace`);
  if (slice !== undefined && own !== slice) refuse(`--window ${id} is a dispatch of slice ${own}, not of --slice ${slice}`);
  const set = new Set();
  for (const w of windowsOf(events, own)) {
    if (w.id !== id) continue;
    const until = w.until === null ? events.length : w.until;
    for (let i = w.start; i < until; i++) if (sliceOf(events[i]) === own) set.add(i);
  }
  return set;
}

// The flag parser of the read-only trace verbs. Returns `{ flags, positional }`: the value of each of `names` given, each at
// most once and never empty or starting with `--`, and the arguments that start with no `--` where `takesPositional` holds.
// Any other argument is refused, every message naming `verb`.
function traceFlags(verb, args, names, takesPositional) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (takesPositional && !a.startsWith('--')) { positional.push(a); continue; }
    if (!names.includes(a)) fail(`${verb}: unrecognized argument "${a}"`);
    const v = args[i + 1];
    if (v === undefined || v === '' || v.startsWith('--')) fail(`${verb}: ${a} needs a value`);
    if (a in flags) fail(`${verb}: ${a} given twice`);
    flags[a] = v;
    i++;
  }
  return { flags, positional };
}

module.exports = { readRunTrace, sliceOf, editPath, windowsOf, windowIndexes, traceFlags };
