'use strict';

// drift-check shared helpers: markdown handling, document reading, and the one table-driven
// scanner every contract table runs through. No check lives here — `scanners/` holds the
// bespoke ones and `checks.js` orders them all.

const fs = require('node:fs');
const path = require('node:path');
const { fenceOpener, fenceCloses } = require('../../plugin/lib/md-sections.js');

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
// outside a fence, and `open`, `body`, or `close` on a fence's lines. Fences are read only through
// `plugin/lib/md-sections.js`'s `fenceOpener` and `fenceCloses`, the rule every shipped markdown reader
// shares, so drift keeps no fence pattern of its own. A line's trailing `\r` is left out of the reading, so a
// CRLF file reads as its LF form. An unterminated fence runs to end of file.
function fenceLines(text) {
  let open = null;
  return text.split('\n').map((line) => {
    const bare = line.replace(/\r$/, '');
    if (open === null) {
      open = fenceOpener(bare);
      return { line, role: open === null ? 'text' : 'open' };
    }
    if (fenceCloses(bare, open)) {
      open = null;
      return { line, role: 'close' };
    }
    return { line, role: 'body' };
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
// path is tried first and plugin/ is the fallback. A file exists under one of the two. A directory can
// exist under both (`scripts/` and `plugin/scripts/`), so a walk of a shipped directory goes through
// shippedDir() instead.
function docPath(root, ...rel) {
  const direct = path.join(root, ...rel);
  return fs.existsSync(direct) ? direct : path.join(root, 'plugin', ...rel);
}

// shippedDir(): where a shipped executable directory (`hooks`, `scripts`, `lib`) lives under a root.
// `<root>/plugin/<dir>` wins when it exists, so this repository's maintainer `scripts/` never stands in
// for the shipped `plugin/scripts/`. A fixture with no `plugin/` falls back to `<root>/<dir>`.
function shippedDir(root, dir) {
  const shipped = path.join(root, 'plugin', dir);
  return fs.existsSync(shipped) ? shipped : path.join(root, dir);
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
// reports the expectations it no longer meets, and a document it cannot read as missing. A row is
// `[document, pattern, expectation]` or `[document, pattern, expectation, { fenced: true }]`; its pattern
// is anything with a `test(text)` method. A row tests the document's fence-masked text (`maskFences`), so
// a heading or clause shown only inside a fenced example does not satisfy it. A row carrying
// `{ fenced: true }` tests the unmasked text instead: its document's fenced template is what it checks.
//
// A pattern that misses the raw text is retried against the whitespace-normalized text. The documents are
// hard-wrapped, so a clause a table spells with single spaces straddles a line break in the real file; the
// retry makes the wrap invisible to the match. Patterns that anchor per line (`^`/`$` with `m`) still see
// the raw text on the first attempt, so the retry only ever widens what passes, never narrows it.
function scanContract(root, contracts) {
  if (contractObserver) contractObserver(root, contracts);
  const gaps = [];
  for (const [rel, pattern, expectation, { fenced = false } = {}] of contracts) {
    const raw = readDoc(root, rel);
    if (raw === null) {
      gaps.push(missingDoc(rel));
      continue;
    }
    const text = fenced ? raw : maskFences(raw);
    if (!pattern.test(text) && !pattern.test(normalizeWhitespace(text))) {
      gaps.push({ source: rel, expectation });
    }
  }
  return gaps;
}

// A `/` after one of these characters, or after one of REGEX_KEYWORDS, opens a regular-expression literal;
// after anything else it divides.
const REGEX_AFTER = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
const REGEX_KEYWORDS = /\b(?:return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;

// The text without its comments: a `//` comment to its line end, and a `/* … */` comment wherever it sits, an
// unclosed one to end of file. A comment marker inside a quoted string, a template literal (one spanning lines
// included), or a regular-expression literal is code, and stays. A block comment keeps its line breaks, so the
// code after it stays on its own line.
function stripComments(raw) {
  let out = '';
  let last = ''; // the last character of code that is not whitespace
  let i = 0;
  const copyQuoted = (close, multiline) => {
    out += raw[i++];
    while (i < raw.length) {
      const c = raw[i];
      if (c === '\\') {
        out += raw.slice(i, i + 2);
        i += 2;
        continue;
      }
      out += c;
      i++;
      if (c === close || (!multiline && c === '\n')) break;
    }
  };
  while (i < raw.length) {
    const c = raw[i];
    const next = raw[i + 1];
    if (c === '"' || c === "'") {
      copyQuoted(c, false);
      last = c;
    } else if (c === '`') {
      copyQuoted('`', true);
      last = c;
    } else if (c === '/' && next === '/') {
      while (i < raw.length && raw[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      const end = raw.indexOf('*/', i + 2);
      const stop = end === -1 ? raw.length : end + 2;
      out += raw.slice(i, stop).replace(/[^\n]/g, '');
      i = stop;
    } else if (c === '/' && (REGEX_AFTER.has(last) || REGEX_KEYWORDS.test(out.trimEnd()))) {
      let inClass = false;
      out += raw[i++];
      while (i < raw.length && raw[i] !== '\n') {
        const r = raw[i];
        if (r === '\\') {
          out += raw.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += r;
        i++;
        if (r === '[') inClass = true;
        else if (r === ']') inClass = false;
        else if (r === '/' && !inClass) break;
      }
      last = '/';
    } else {
      out += c;
      i++;
      if (!/\s/.test(c)) last = c;
    }
  }
  return out;
}

module.exports = {
  docPath,
  shippedDir,
  stripComments,
  readDoc,
  missingDoc,
  maskFences,
  maskedSentences,
  normalizeWhitespace,
  scanContract,
  observeContracts,
};
