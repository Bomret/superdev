'use strict';

// dod-open.js: the `dod-open` verb, a run's Definition-of-Done criteria listed by the note rule (references/dod-ticks.md's
// `## The note rule`, INV-0190). It reads `<run-root>/dod.md` and writes nothing.

const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const { maskFencedLines, readLines } = require('./md-sections.js');
const { parseDodLineReadings, dodSectionRange, takeOption, DOD_LINE_RE } = require('./dod-line.js');

// The citation `/superdev:verify-ship` ends a `not met:` note with (references/shipped-run.md's `## Routing a shipped run`).
const OBSERVED_RE = /\(observed(?:; after [^)]*)?\)$/;

// One criterion line as dod-line.js reads it: the first reading's criterion, tag, note verdict, and note. `not met` prints
// as `not-met`, the spelling of dod-line's own `--verdict`.
function readCriterion(line) {
  const [reading] = parseDodLineReadings(line);
  const label = reading.verdict ? reading.verdict.replace(' ', '-') : 'none';
  return {
    criterion: reading.criterion.trim(),
    tag: reading.tag,
    label,
    settled: label === 'met' || label === 'accepted',
    citation: label === 'not-met' && OBSERVED_RE.test(reading.note),
  };
}

// `dod-open --root <run-root> [--tag docs]`: one `<open|settled>\t<label>\t<tag|->\t<repair-citation|->\t<criterion>` line per
// criterion, then `stage-hold: yes|no`. `--tag docs` prints the open `docs` lines alone.
function verbDodOpen(args) {
  const rest = [...args];
  const root = takeOption(rest, '--root');
  if (!root || root.startsWith('--')) fail('dod-open needs --root <run-root>');
  const hasTag = rest.includes('--tag');
  const tagFilter = takeOption(rest, '--tag');
  if (hasTag && tagFilter !== 'docs') fail('dod-open --tag takes docs');
  if (rest.length) fail(`dod-open takes no argument "${rest[0]}"`);
  const file = path.join(root, 'dod.md');
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    fail(`dod-open: ${file} could not be read: ${e.code || e.message}`);
  }
  const lines = readLines(text);
  const masked = maskFencedLines(lines, file, 'listed');
  const range = dodSectionRange(masked);
  const criteria = [];
  for (let i = range ? range.start : 0; i < (range ? range.end : lines.length); i += 1) {
    if (masked[i].match(DOD_LINE_RE)) criteria.push(readCriterion(masked[i]));
  }
  if (criteria.length === 0) fail('no criteria');
  const rows = tagFilter ? criteria.filter((c) => c.tag === 'docs' && !c.settled) : criteria;
  const out = rows.map((c) =>
    [c.settled ? 'settled' : 'open', c.label, c.tag || '-', c.citation ? 'repair-citation' : '-', c.criterion].join('\t'));
  if (!tagFilter) {
    const hold = criteria.some((c) => !c.settled && c.label !== 'ceiling' && c.tag !== 'docs');
    out.push(`stage-hold: ${hold ? 'yes' : 'no'}`);
  }
  if (out.length) console.log(out.join('\n'));
}

module.exports = { verbDodOpen };
