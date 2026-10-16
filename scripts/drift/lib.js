'use strict';

// drift-check shared helpers: markdown handling, document reading, and the one table-driven
// scanner every contract table runs through. No check lives here — `scanners.js` holds the
// bespoke ones and `checks.js` orders them all.

const fs = require('node:fs');
const path = require('node:path');

// maskFences(): the same text with every fenced code block blanked to spaces. Line lengths and newlines
// are preserved, so every offset into the masked text is the same offset into the original. A `#` comment
// inside a fence is not a heading, and a heading search that treats it as one ends a section early. An
// unterminated fence masks to end of file.
function maskFences(text) {
  return fenceLines(text)
    .map(({ line, role }) => (role === 'text' ? line : line.replace(/\S/g, ' ')))
    .join('\n');
}

// fenceLines(): every line of the text, tagged with its place in the fenced blocks. `role` is `text`
// outside a fence, and `open`, `body`, or `close` on a fence's lines; `fence` is the block's `{ char,
// len, tag }` (the same object on every line of one block, `tag` the info string's first word). A fence
// closes only on a bare marker line of the same character and at least the opening length, so a
// differently tagged marker line inside an open fence is body. An unterminated fence runs to end of file.
function fenceLines(text) {
  let fence = null;
  return text.split('\n').map((line) => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})\s*(\S*)/);
    if (fence === null) {
      if (!marker) return { line, fence: null, role: 'text' };
      fence = { char: marker[1][0], len: marker[1].length, tag: marker[2] };
      return { line, fence, role: 'open' };
    }
    const block = fence;
    if (marker && !marker[2] && marker[1][0] === block.char && marker[1].length >= block.len) {
      fence = null;
      return { line, fence: block, role: 'close' };
    }
    return { line, fence: block, role: 'body' };
  });
}

// maskedSentences(): a document's sentences, fenced examples masked out first and wrapped lines joined
// into one line, so a mention split across a hard wrap is still read as one sentence.
function maskedSentences(text) {
  return maskFences(text).replace(/\n/g, ' ').split(/(?<=[.!?])\s+/);
}

// normalizeWhitespace() collapses every run of whitespace, including a line break, to a single space,
// so a clause hard-wrapped in a real document still matches a pattern spelled with single spaces.
function normalizeWhitespace(text) {
  return text.replace(/\s+/g, ' ');
}

// docPath(): where a checked file lives under a root. The shipped tree sits in the repo's plugin/
// subdirectory (the marketplace's git-subdir source), so contract tables, scanners, and fixtures all
// name its files relative to the plugin root — skills/…, agents/…, hooks/…, references/…,
// scripts/scope.js — while root-level docs (CONTEXT.md, scripts/AGENTS.md, docs/) resolve at
// the repo root. Fixtures build plugin-relative paths directly under their tmp root, so the direct
// path is tried first and plugin/ is the fallback; the two never both exist for one file.
function docPath(root, ...rel) {
  const direct = path.join(root, ...rel);
  return fs.existsSync(direct) ? direct : path.join(root, 'plugin', ...rel);
}

// readDoc(): one document's text, or null when it is not there.
function readDoc(root, rel) {
  try {
    return fs.readFileSync(docPath(root, rel), 'utf8');
  } catch {
    return null;
  }
}

// missingDoc(): the gap a check reports for a named document it reads and cannot find. A check that
// skipped such a document would pass on a rename while the fact it tests went unchecked, so every check
// reading a named document reports it by path instead. `scripts/drift-check.js` prints it.
function missingDoc(rel) {
  return { source: rel, missing: true };
}

// The selftest's coverage observer, read inside scanContract() at call time. A reference to scanContract
// taken before an observer is installed (checks.js destructures it at load) still reaches the observer,
// so what the selftest records does not depend on which module loaded first. `observeContracts(fn)`
// installs `fn(root, contracts)` and returns the call that puts the previous observer back; a plain
// drift-check run installs none.
let contractObserver = null;
function observeContracts(fn) {
  const previous = contractObserver;
  contractObserver = fn;
  return () => {
    contractObserver = previous;
  };
}

// scanContract() is pure over a root dir and a contract table: reads each document the table names and
// reports the expectations it no longer meets, and a document it cannot read as missing. A row's
// pattern is anything with a `test(text)` method.
//
// A pattern that misses the raw text is retried against the whitespace-normalized text. The documents are
// hard-wrapped, so a clause a table spells with single spaces straddles a line break in the real file; the
// retry makes the wrap invisible to the match. Patterns that anchor per line (`^`/`$` with `m`) still see
// the raw text on the first attempt, so the retry only ever widens what passes, never narrows it.
function scanContract(root, contracts) {
  if (contractObserver) contractObserver(root, contracts);
  const gaps = [];
  for (const [rel, pattern, expectation] of contracts) {
    const text = readDoc(root, rel);
    if (text === null) {
      gaps.push(missingDoc(rel));
      continue;
    }
    if (!pattern.test(text) && !pattern.test(normalizeWhitespace(text))) {
      gaps.push({ source: rel, expectation });
    }
  }
  return gaps;
}

module.exports = {
  docPath,
  readDoc,
  missingDoc,
  maskFences,
  maskedSentences,
  normalizeWhitespace,
  scanContract,
  observeContracts,
};
