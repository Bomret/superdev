'use strict';

// The scanner for an unterminated fenced code block. `lib.js`'s `maskFences` blanks an unterminated fence to end of
// file, so every fence-masking check reads nothing below its opener, and a forbidden form there passes unreported.
// This scanner reports each Markdown file in its read set that holds such a fence, once, by the 1-based line of the
// opener from which the mask runs to end of file. It reads fences only through `lib.js`'s `fenceLines`, so it agrees
// with every fence-masking reader line for line. A file or directory it cannot read throws, so `drift-check.js`'s
// `runChecks` reports the check as failed. Its read set and walk rules are its `unterminated-fence` row in
// `scripts/AGENTS.md`.
// ceiling: a fence in a non-Markdown document a contract row masks (such as `lib/ledger.js`) is outside the read set.

const fs = require('node:fs');
const path = require('node:path');

const { fenceLines } = require('../lib');

const PRUNED = new Set(['node_modules', '.git']);

// Every `.md` file but a `README.md` at any depth below dir, as absolute paths. An absent dir holds none.
function markdownFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!PRUNED.has(entry.name)) files.push(...markdownFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
      files.push(full);
    }
  }
  return files;
}

// A named file's text, or null when it is absent.
function readIfPresent(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// The 1-based line of the opener of a fence that never closes, or null when every fence closes.
function unterminatedOpener(text) {
  let opener = null;
  fenceLines(text).forEach(({ role }, i) => {
    if (role === 'open') opener = i + 1;
    else if (role === 'close') opener = null;
  });
  return opener;
}

function scanUnterminatedFences(root) {
  const files = [
    ...markdownFiles(path.join(root, 'plugin')),
    ...markdownFiles(path.join(root, 'docs', 'adr')),
    path.join(root, 'docs', 'invariants.md'),
    path.join(root, 'CONTEXT.md'),
  ];
  const gaps = [];
  for (const file of files) {
    const text = readIfPresent(file);
    if (text === null) continue;
    const line = unterminatedOpener(text);
    if (line !== null) gaps.push({ source: path.relative(root, file).split(path.sep).join('/'), line });
  }
  return gaps.sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));
}

module.exports = { scanUnterminatedFences };
