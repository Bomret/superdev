'use strict';

// verdicts.js: the review verdicts of the run trace (ADR 0136, INV-0142, INV-0146): a slice-reviewer's and a final-reviewer's report read into one `verdict` or `final-verdict` line.

const { untraceField } = require('./trace-log.js');
const { holds, completedEnd } = require('./dispatch-lines.js');

// The last `Verdict:` line of a slice-reviewer's report: ✅ or ❌ after `specification`, and the word after `quality`.
// A part it cannot read is `unknown`.
function parseVerdict(text) {
  const line = typeof text === 'string' ? text.split('\n').filter((l) => /Verdict:/.test(l)).pop() : undefined;
  const spec = line && /specification\W*?(✅|❌)/u.exec(line);
  const quality = line && /quality\W*(approved|changes-needed)\b/.exec(line);
  return { spec: spec ? (spec[1] === '✅' ? 'pass' : 'fail') : 'unknown', quality: quality ? quality[1] : 'unknown' };
}

// The last `Ready to merge?` line of a final-reviewer's report: yes, no, or with-fixes; `unknown` when unreadable.
function parseFinalVerdict(text) {
  const line = typeof text === 'string' ? text.split('\n').filter((l) => /Ready to merge\?/.test(l)).pop() : undefined;
  const m = line && /Ready to merge\?\W*(yes|no|with[-\s]+fixes)\b/i.exec(line);
  return m ? m[1].toLowerCase().replace(/[-\s]+/, '-') : 'unknown';
}

// A review's report (a background one's hand-back or its stop's last message, a foreground one's `handbackReport`) read into
// its one line, as `[runRoot, entry]`: a `verdict` line for a slice-reviewer, a `final-verdict` line for a final-reviewer, each
// once per dispatch; `undefined` when the report records none. The caller writes the line, so a throw from another module's
// function (`holds`, `untraceField`) reaches it before anything is written (INV-0159). A report the parsers cannot read gives
// `unknown` parts. The slice-reviewer's line is on its dispatch's slice. The cycle counts the slice's reviewer dispatches that
// completed before this one was dispatched; the reviewed implementer is the slice's last one to complete before it. A
// final-reviewer records only inside an open `review` step; its cycle counts the final-reviewer dispatches that completed inside
// that window before it (INV-0146).
// `f` is the dispatch `findDispatch` found, by `agentId` or by `tool_use_id`.
function verdictLine(f, text) {
  if (!f) return undefined;
  const tu = untraceField(f.d.fields[1]);
  if (untraceField(f.d.fields[0]) === 'superdev:final-reviewer') {
    const before = f.events.slice(0, f.events.indexOf(f.d));
    if (holds(f.events, 'final-verdict', 0, tu)) return undefined;
    // The review step is open from its `step set review` line to the first line that ends it: a `step clear`, a
    // `step block` (a stopped review), a `step set` of another step. A stage write that removes the ledger's step mirrors a `step clear` line, so
    // step lines alone carry the window.
    let open = false;
    // A resumed reviewer ends once per run, so the cycle counts distinct dispatches (`tool_use_id`).
    let done = new Set();
    for (const e of before) {
      if (e.kind === 'ledger' && e.fields[0] === 'step') {
        open = e.fields[1] === 'set' && e.fields[2] === 'review';
        done = new Set();
      } else if (open && completedEnd(e) && untraceField(e.fields[0]) === 'superdev:final-reviewer') done.add(untraceField(e.fields[1]));
    }
    if (!open) return undefined;
    return [f.runRoot, { slice: untraceField(f.d.slice), agent: 'main', kind: 'final-verdict', fields: [tu, parseFinalVerdict(text), String(done.size)] }];
  }
  if (untraceField(f.d.fields[0]) !== 'superdev:slice-reviewer') return undefined;
  if (holds(f.events, 'verdict', 0, tu)) return undefined;
  const slice = untraceField(f.d.slice);
  const reviewed = new Set(); // distinct dispatches: a resumed reviewer ends once per run
  let impl = '';
  for (const e of f.events.slice(0, f.events.indexOf(f.d))) {
    if (!completedEnd(e) || untraceField(e.slice) !== slice) continue;
    const type = untraceField(e.fields[0]);
    if (type === 'superdev:slice-reviewer') reviewed.add(untraceField(e.fields[1]));
    else if (type === 'superdev:implementer') impl = untraceField(e.fields[1]);
  }
  const v = parseVerdict(text);
  return [f.runRoot, { slice, agent: 'main', kind: 'verdict', fields: [tu, v.spec, v.quality, String(reviewed.size), impl] }];
}

module.exports = { parseVerdict, parseFinalVerdict, verdictLine };
