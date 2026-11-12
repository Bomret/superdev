'use strict';

// dod-check.js: the `dod-check` verb, the check of an anchor body's Absorbs line against its `(triage <ref>)`
// citations, its `Reachable:` criterion, and its `Release risk:` categories (ADR 0233, INV-0189, INV-0137).

const { fail } = require('./refusal.js');
const { splitLines } = require('./ledger.js');
const { maskFencedLines } = require('./md-sections.js');
const { parseDodLineReadings, dodSectionRange } = require('./dod-line.js');
const { STORE_REF_RE } = require('./dod-tags.js');

const ABSORBS_MARKER = '**Absorbs:**';
const CITATION_RE = /\(triage (#\d+|[A-Z][A-Z0-9_]*-\d+)\)/g;
const CODE_SPAN_RE = /(`+)[\s\S]*?\1/g;
const RELEASE_RISK_CATEGORIES = ['rollback', 'deploy-window data compatibility', 'consumer compatibility', 'production visibility'];

// The criterion text of each checklist line, tag and verdict note dropped, inline code spans stripped.
function criterionTexts(masked) {
  const range = dodSectionRange(masked);
  const lo = range ? range.start + 1 : 0;
  const hi = range ? range.end : masked.length;
  const texts = [];
  for (let i = lo; i < hi; i += 1) {
    const [reading] = parseDodLineReadings(masked[i]);
    if (reading) texts.push(reading.criterion.replace(CODE_SPAN_RE, '').trim());
  }
  return texts;
}

// The entries of the first unfenced Absorbs line, store references only, each once; null with no such line.
function absorbsEntries(masked) {
  const line = masked.find((l) => l.trimStart().startsWith(ABSORBS_MARKER));
  if (line === undefined) return null;
  const entries = line.trimStart().slice(ABSORBS_MARKER.length).split(',').map((e) => e.trim());
  return [...new Set(entries.filter((e) => STORE_REF_RE.test(e)))];
}

function verbDodCheck(stdinRaw) {
  if (!stdinRaw || !stdinRaw.trim()) fail('dod-check refused: the input is empty');
  const masked = maskFencedLines(splitLines(stdinRaw), 'dod-check input', 'checked');
  const texts = criterionTexts(masked);
  const absorbs = absorbsEntries(masked);

  // Each reference with the number of criteria citing it, in first-citation order.
  const citedBy = new Map();
  for (const text of texts) {
    for (const ref of new Set([...text.matchAll(CITATION_RE)].map((m) => m[1]))) citedBy.set(ref, (citedBy.get(ref) || 0) + 1);
  }

  const problems = [];
  for (const ref of absorbs || []) if (!citedBy.has(ref)) problems.push(`Absorbs entry ${ref} is cited by no criterion`);
  for (const ref of citedBy.keys()) {
    if (absorbs === null) problems.push(`citation (triage ${ref}) with no Absorbs line`);
    else if (!absorbs.includes(ref)) problems.push(`citation (triage ${ref}) names no Absorbs entry`);
  }
  for (const [ref, count] of citedBy) if (count > 1) problems.push(`${ref} is cited by ${count} criteria`);
  if (!texts.some((t) => t.startsWith('Reachable:'))) problems.push('no criterion begins with Reachable:');
  const risk = texts.filter((t) => t.startsWith('Release risk:')).join('\n').toLowerCase();
  for (const category of RELEASE_RISK_CATEGORIES) {
    if (!risk.includes(category)) problems.push(`no Release risk: criterion names ${category}`);
  }
  if (problems.length) fail('dod-check refused:\n' + problems.join('\n'));
}

module.exports = { verbDodCheck };
