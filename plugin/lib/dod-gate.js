'use strict';

// dod-gate.js: the check every entry to the `implementing` stage makes, that the run root holds a written Definition of Done.

const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const { splitLines } = require('./ledger.js');
const { maskFencedLines } = require('./md-sections.js');
const { parseDodLineReadings, dodSectionRange } = require('./dod-line.js');

// What `<root>/dod.md` lacks, or null when it holds a criterion line. Reads the file the way `dod-line` reads a body:
// a criterion line is one outside a fence, inside the `## Definition of Done` section when the file has one, anywhere otherwise.
function dodProblem(root) {
  const file = path.join(root, 'dod.md');
  let st;
  try {
    st = fs.lstatSync(file);
  } catch (e) {
    if (e.code === 'ENOENT') return 'is missing';
    throw e;
  }
  if (!st.isFile()) return 'is not a regular file';
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) return 'is empty';
  const lines = splitLines(text);
  const masked = maskFencedLines(lines, 'dod.md', 'checked');
  const range = dodSectionRange(masked);
  const found = masked.slice(range ? range.start : 0, range ? range.end : masked.length).some((l) => parseDodLineReadings(l).length > 0);
  return found ? null : 'holds no criterion line';
}

// Refuses, writing nothing, while the run root's dod.md is missing, empty, not a regular file, or holds no criterion line.
function checkDodWritten(root) {
  const problem = dodProblem(root);
  if (problem) {
    fail(`${path.join(root, 'dod.md')} ${problem} — the implementing stage needs the written Definition of Done (references/run-init.md, "Write the DoD")`);
  }
}

module.exports = { checkDodWritten };
