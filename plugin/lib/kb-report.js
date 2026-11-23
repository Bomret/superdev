'use strict';

// kb-report.js: renders a publish run's per-page results as the report text on stdout.

// A page's body never appears here — every line names a filename/title/reason, never stdout a
// backend returned. Every field that carries outside text (reason, title, filename, fix, parent, kept) passes through
// `printable`, this report's one definition of what text may reach the terminal: it strips terminal escape sequences (CSI and OSC),
// the C0 and C1 control characters, DEL, U+2028 and U+2029, and the bidirectional overrides, embeddings, isolates, and marks.
// Routing keeps its own definition (`lib/route.js`).
const printable = (v) =>
  String(v ?? '')
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?/g, '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g, '');
function renderReport(scope, backendKind, results, unmerged = false) {
  const lines = [`scope: ${scope}`, `backend: ${backendKind}`];
  if (unmerged) lines.push('unmerged: the ledger does not record this scope as shipped or closed — published with --allow-unmerged');
  for (const raw of results) {
    const r = { ...raw };
    for (const k of ['title', 'reason', 'filename', 'fix', 'parent']) if (r[k] !== undefined) r[k] = printable(r[k]);
    if (r.kind === 'created' || r.kind === 'updated') lines.push(`published (${r.kind}): ${r.title}`);
    else if (r.kind === 'deleted') lines.push(`deleted: ${r.title}`);
    else if (r.kind === 'already-absent') lines.push(`already absent, done: ${r.title}`);
    else if (r.kind === 'cleanup-failed') {
      const label = { created: 'published (created)', updated: 'published (updated)', deleted: 'deleted', 'already-absent': 'already absent, done' }[r.publishedKind];
      lines.push(`${label} but not cleared: ${r.title} — ${r.reason}`);
    }
    else if (r.kind === 'left-staged') lines.push(`left staged: ${r.title} — ${r.reason}`);
    else if (r.kind === 'not-linked') lines.push(`not linked: ${r.title} — ${r.reason} — fix: ${r.fix}; the page stays staged`);
    else if (r.kind === 'not-unlinked') lines.push(`not unlinked: ${r.title} — ${r.reason} — fix: ${r.fix}; the delete stays staged`);
    else if (r.kind === 'malformed') lines.push(`malformed frontmatter, left untouched: ${r.filename} — ${r.reason}`);
    else if (r.kind === 'untried') lines.push(`left staged, never tried: ${r.filename} — ${r.reason}`);
    for (const k of r.kept || []) lines.push(`link kept in parent "${r.parent}": ${printable(k)}`);
  }
  const untried = results.filter((r) => r.kind === 'untried').length;
  if (untried > 0) {
    lines.push(`stopped after a timeout: ${untried} page(s) left untried — retry once the host answers`);
  }
  if (results.length === 0) lines.push('nothing staged for this scope');
  return lines.join('\n');
}

module.exports = { renderReport };
