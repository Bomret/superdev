'use strict';

// kb-report.js: renders a publish run's per-page results as the report text on stdout.

// A page's body never appears here — every line names a filename/title/reason, never stdout a
// backend returned. The one exception is a `link kept in parent` line, which prints a line of the live
// parent body with its control characters and escape sequences stripped.
const printable = (s) => s.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\u0000-\u0008\u000a-\u001f\u007f-\u009f]/g, '');
function renderReport(scope, backendKind, results, unmerged = false) {
  const lines = [`scope: ${scope}`, `backend: ${backendKind}`];
  if (unmerged) lines.push('unmerged: the scope branch was not confirmed contained — published with --allow-unmerged');
  for (const r of results) {
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
