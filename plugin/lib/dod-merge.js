'use strict';

// dod-merge.js: the merge of two copies of one Definition of Done, line by line, and the `dod-merge` verb that
// writes `<run-root>/dod.md` through it (references/dod-ticks.md, ADR 0206).

const fs = require('fs');
const path = require('path');
const { splitLines } = require('./ledger.js');
const { parseDodLineReadings, dodLineHasNote, collapseWhitespace } = require('./dod-line.js');
const { fail } = require('./refusal.js');

// `base` decides the criteria and their order. A base checklist line with no note takes the line of `other` it
// pairs with by criterion text, when exactly one line pairs and that line carries a note. Every other base line
// stays. Returns the merged text and how many verdicts it took from `other`.
function mergeDod(base, other) {
  const noted = splitLines(other).filter(dodLineHasNote);
  let kept = 0;
  const lines = splitLines(base).map((line) => {
    const readings = parseDodLineReadings(line);
    if (!readings.length || dodLineHasNote(line)) return line;
    const keys = new Set(readings.map((r) => collapseWhitespace(r.criterion)));
    const hits = noted.filter((o) => parseDodLineReadings(o).some((r) => keys.has(collapseWhitespace(r.criterion))));
    if (hits.length !== 1) return line;
    kept += 1;
    return hits[0];
  });
  return { text: lines.join('\n'), kept };
}

// Writes the anchor's Definition of Done to `<run-root>/dod.md`, keeping each verdict an existing copy carries
// on a line the anchor leaves without a note.
function verbDodMerge(root, anchorText) {
  if (!anchorText.trim()) fail('dod-merge needs the Definition of Done on stdin');
  const file = path.join(root, 'dod.md');
  let local = null;
  try {
    local = fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const { text, kept } = local === null ? { text: anchorText, kept: 0 } : mergeDod(anchorText, local);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(file, text);
  console.log(`dod-merge: kept ${kept} verdict${kept === 1 ? '' : 's'} from the existing dod.md`);
}

module.exports = { mergeDod, verbDodMerge };
