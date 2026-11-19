'use strict';

// dod-gate.js: the check every entry to the `implementing` stage makes, that the run root holds a written Definition of Done.

const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const { dodCriterionLines } = require('./dod-line.js');

// Refuses, writing nothing, while the run root's dod.md is missing, empty, not a regular file, holds an unterminated fence,
// or holds no criterion line. A criterion line is read the way `dod-line` reads a body (`dodCriterionLines`).
function checkDodWritten(root) {
  const file = path.join(root, 'dod.md');
  const refuse = (problem) =>
    fail(`${file} ${problem} — the implementing stage needs the written Definition of Done (references/run-init.md, "Write the DoD")`);
  let st;
  try {
    st = fs.lstatSync(file);
  } catch (e) {
    if (e.code === 'ENOENT') refuse('is missing');
    throw e;
  }
  if (!st.isFile()) refuse('is not a regular file');
  const text = fs.readFileSync(file, 'utf8');
  if (!text.trim()) refuse('is empty');
  let found;
  try {
    found = dodCriterionLines(text, 'dod.md', 'checked').length > 0;
  } catch (e) {
    if (!e.isRefusal) throw e;
    refuse('has an unterminated fenced code block');
  }
  if (!found) refuse('holds no criterion line');
}

module.exports = { checkDodWritten };
