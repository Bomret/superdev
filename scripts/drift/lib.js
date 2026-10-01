'use strict';

// drift-check shared helpers: markdown handling, document reading, and the one table-driven
// scanner every contract table runs through. No check lives here — `scanners.js` holds the
// bespoke ones and `checks.js` orders them all.

const fs = require('node:fs');
const path = require('node:path');

// maskFences(): the same text with every fenced code block blanked to spaces. Line lengths and newlines
// are preserved, so every offset into the masked text is the same offset into the original. A `#` comment
// inside a fence is not a heading, and a heading search that treats it as one ends a section early —
// which reports a false RED for the elements below the fence, and a false GREEN for any store mechanism
// hiding there. An unterminated fence masks to end of file: the safe direction, because a section that
// runs long still carries its own content.
function maskFences(text) {
  let fence = null;
  return text
    .split('\n')
    .map((line) => {
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (fence === null) {
        if (!marker) return line;
        fence = { char: marker[1][0], len: marker[1].length };
      } else if (marker && marker[1][0] === fence.char && marker[1].length >= fence.len) {
        fence = null;
      }
      return line.replace(/\S/g, ' ');
    })
    .join('\n');
}

// maskedSentences(): a document's sentences, fenced examples masked out first and wrapped lines joined
// into one line, so a mention split across a hard wrap is still read as one sentence. Shared by every
// scanner that reasons sentence-by-sentence over prose (scanShipNoOpensPr) instead of
// each re-doing the same mask/join/split.
function maskedSentences(text) {
  return maskFences(text).replace(/\n/g, ' ').split(/(?<=[.!?])\s+/);
}

// extractSection(): the text from a heading match (inclusive) up to (but excluding) the next heading of
// level ≤3, or to EOF if there is none. Shared by the scanners that isolate one section before scanning
// its body. Both the heading and the terminator are found in the masked text and sliced out of the
// original, so a fenced example neither starts a section nor ends one.
function extractSection(text, headingPattern) {
  const masked = maskFences(text);
  const start = masked.search(headingPattern);
  if (start === -1) return null;
  const rest = masked.slice(start);
  // Skip past the heading's own line (not just one character) before searching for the next one — a
  // one-character skip leaves a level-2 `##` heading truncated to `#`, which still matches `#{1,3}` and
  // self-matches as its own "next" heading, collapsing the section to nothing.
  const firstLineEnd = rest.indexOf('\n');
  const searchFrom = firstLineEnd === -1 ? rest.length : firstLineEnd + 1;
  const nextHeading = rest.slice(searchFrom).search(/^#{1,3}\s/m);
  const end = nextHeading === -1 ? text.length : start + searchFrom + nextHeading;
  return text.slice(start, end);
}

// A scalar as a maintainer may legally write it: quoted or bare, with or without a trailing comment.
function scalar(raw) {
  const withoutComment = raw.replace(/\s+#.*$/, '').trim();
  const unquoted = withoutComment.match(/^(['"])(.*)\1$/);
  return unquoted ? unquoted[2] : withoutComment;
}

// The leading `---` fenced block, with its body captured. One literal, used by both readers below: a
// second copy of the same shape drifts from the first with nothing to catch it.
const FRONTMATTER_FENCE = /^---\n([\s\S]*?)\n---/;

// Frontmatter is the leading `---` fenced block; read it as lines rather than parsing YAML, since the
// hooks and scripts carry no dependencies. CRLF is normalised first, so a file authored on Windows is
// read rather than reported as having no frontmatter at all.
function frontmatter(text) {
  const match = text.replace(/\r\n/g, '\n').match(FRONTMATTER_FENCE);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (kv) fields[kv[1]] = scalar(kv[2]);
  }
  return fields;
}

// stripFrontmatter() returns text with its leading `---`-fenced frontmatter block removed (CRLF
// normalised first, matching frontmatter()). Text with no frontmatter is returned unchanged. Contracts
// that must be met by the prose body run over this, so an `argument-hint` echo cannot satisfy one (e.g.
// `[--unattended]`, which names the argument but is not a standing answer in the body).
function stripFrontmatter(text) {
  return text.replace(/\r\n/g, '\n').replace(FRONTMATTER_FENCE, '');
}

// normalizeWhitespace() collapses every run of whitespace, including a line break, to a single space.
// CONTEXT.md and references/scope-mode.md are hard-wrapped, so a canonical clause can straddle a line
// break in the real document; normalizing both the clause and the document before comparing makes that
// wrap invisible to the match instead of a false gap.
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

// readDoc(): one document's text, or null when it is not there. Every check skips a document it cannot
// read, so a fixture carries only the files it exercises and a partial checkout fails nothing. That
// convention is the reason no scanner may treat an absent file as a gap — the one exception is asserted
// on its own, as the pinned-paths check.
function readDoc(root, rel) {
  try {
    return fs.readFileSync(docPath(root, rel), 'utf8');
  } catch {
    return null;
  }
}

// storeDocuments(): every slice-store document — each `references/issue-tracker-*.md` seed plus this
// repo's own dogfooded `docs/agents/issue-tracker.md`. The anchor, append-mode, assignee, release, and
// triage-record contracts each run over this same list.
function storeDocuments(root, { dir, extra }) {
  const candidates = [...extra];
  try {
    for (const entry of fs.readdirSync(docPath(root, dir))) {
      if (!entry.startsWith('issue-tracker-') || !entry.endsWith('.md')) continue;
      candidates.push(path.join(dir, entry));
    }
  } catch {
    // no such dir → the seeds are not there to scan
  }
  return candidates;
}

// scanContract() is pure over a root dir and a contract table: reads each document the table names and
// reports the expectations it no longer meets. Absent files are skipped, so fixtures need only the
// documents they exercise. This is what lets a table mix a hardcoded plugin path with an optional
// `docs/agents/*.md` backend config file that a fresh consumer repo legitimately never created. A table's
// hardcoded path going missing for real — a rename that outran its pin — is not silent, though: the
// `pinned-paths` check (`scanPinnedPaths`, `drift/scanners.js`) walks every contract table's own literal
// paths and fails loudly on any that no longer exist, independently of this skip. The tables above share
// this one scanner — they differ in what they assert, not in how the assertion runs. `stripFrontmatterFirst`
// tests the body alone, so a document can't satisfy a body contract by echoing the token into its own
// `argument-hint` frontmatter — `FEATURE_ARG_CONTRACTS` needs the opposite (its first row asserts *inside*
// the frontmatter), so it leaves this off.
//
// A pattern that misses the raw text is retried against the whitespace-normalized text. The documents are
// hard-wrapped, so a clause a table spells with single spaces straddles a line break in the real file; the
// retry makes the wrap invisible to the match. Patterns that anchor per line (`^`/`$` with `m`) still see
// the raw text on the first attempt, so the retry only ever widens what passes, never narrows it.
function scanContract(root, contracts, { stripFrontmatterFirst = false } = {}) {
  const gaps = [];
  for (const [rel, pattern, expectation] of contracts) {
    let text = readDoc(root, rel);
    if (text === null) continue; // document absent (fixture / partial checkout) → nothing to scan
    if (stripFrontmatterFirst) text = stripFrontmatter(text);
    if (!pattern.test(text) && !pattern.test(normalizeWhitespace(text))) {
      gaps.push({ source: rel, expectation });
    }
  }
  return gaps;
}

module.exports = {
  docPath,
  readDoc,
  storeDocuments,
  maskFences,
  maskedSentences,
  extractSection,
  scalar,
  frontmatter,
  stripFrontmatter,
  normalizeWhitespace,
  scanContract,
};
