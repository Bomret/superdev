#!/usr/bin/env node
'use strict';

// kb-patch.js: the deterministic merge behind a staged page's `action: patch` (ADR 0027).
// Reads a live knowledge-base page and a staged page carrying ONE section, prints the merged
// markdown on stdout, and writes nothing. Exit nonzero with a one-line stderr reason on any
// refusal, the convention scripts/scope.js uses.
//
// `/superdev:publish-kb` holds the backend credential and calls this; `agents/doc-writer.md`
// stages the section and reaches no backend at all. Keeping the merge here rather than in the
// command's prose is the point: a reader-facing page is not edited by a model reading it.

const fs = require('fs');

function fail(msg) {
  const err = new Error(msg);
  err.isRefusal = true;
  throw err;
}

// A markdown ATX heading: up to 3 leading spaces (CommonMark's own limit — a fourth space makes it
// an indented code block, not a heading), 1-6 `#`, a space, then the text. Setext headings
// (`===`/`---` underlines) are still unsupported as a section marker — one notation is what makes
// "does the live page carry this heading" a string comparison rather than a parse. A staged body
// using one has no first ATX heading and refuses below. That reasoning does not extend to the
// *live* page, which is never validated the same way: merge() below separately refuses rather than
// silently swallowing a setext-titled live section into the region being replaced.
const HEADING = /^ {0,3}(#{1,6})\s+\S/;

// A setext heading's underline: 0-3 leading spaces, then a run of only `=` or only `-`, optional
// trailing spaces. CommonMark reads it as a heading only when it directly follows a non-blank line
// with no blank line between — the same shape a `---` divider used as plain content has, so this
// scanner cannot tell the two apart. Anywhere it appears inside the live region about to be
// dropped, merge() below refuses rather than risk deleting a section it cannot see the end of.
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;

function hasSetextHeading(maskedLines, start, end) {
  for (let i = start + 1; i < end; i += 1) {
    if (SETEXT_UNDERLINE.test(maskedLines[i]) && maskedLines[i - 1].trim() !== '') return true;
  }
  return false;
}

function headingLevel(line) {
  const m = line.match(HEADING);
  return m ? m[1].length : 0;
}

// CommonMark's closed-ATX spelling: an optional trailing closing sequence of one or more `#`,
// preceded by at least one space, itself followed by only spaces. "## A ##" and "## A" name the same
// heading; strip the closing sequence before comparing, same as the trailing-whitespace strip below.
function stripClosingAtx(line) {
  return line.replace(/\s+#+\s*$/, '');
}

// A single heading-identity key, so both sides of the `hits` scan below fold the same three surface
// spellings CommonMark itself treats as one heading: a trailing closed-ATX sequence, leading/trailing
// whitespace, and the whitespace between the marker and the text — CommonMark only requires "a space
// or tab", not exactly one, so "##  A" and "##\tA" name the same heading as "## A". The collapse is
// anchored to the marker at the very start of the line, so it never touches whitespace inside the
// heading text: "## A  B" and "## A B" differ in their text and stay distinct. It also never invents a
// closing sequence stripClosingAtx would not already strip: "## A#" and "## A #x" have no whitespace
// (or have trailing text) before their `#`, so that `#` is heading text, not a closing run, and both
// stay distinct from "## A".
function headingKeyOf(line) {
  return stripClosingAtx(line.trim())
    .trim()
    .replace(/^(#{1,6})\s+/, '$1 ');
}

// scope.js reads a CRLF ledger exactly as an LF one; a wiki page an editor or a web UI wrote gets
// the same treatment. Normalise on the way in, so every comparison below is on LF text.
function readLines(text) {
  return text.replace(/\r\n/g, '\n').split('\n');
}

// maskFencedLines(): a parallel array where every line inside a fenced code block (including the
// fence markers themselves) is blanked, so a `#`/`~~~` shown *inside* an example is never read as a
// heading — not in the staged body, not in the live section being replaced, and not by the `hits`
// duplicate scan. Index-for-index with the input, so a masked index still locates the real line.
// Follows CommonMark's closing-fence rule: a shorter inner fence never closes a longer outer one. An unterminated fence — an LLM or an editor dropping
// the closing marker is routine — would otherwise mask every line after it as fence content in both
// inputs: hiding a following staged section from the "more than one section" refusal, or hiding real
// live headings so the patch appends a duplicate and every later patch of that heading then refuses
// as a 2-times duplicate. Refuse outright instead of guessing where the fence would have closed.
// `verb` names what a caller's refusal describes as not happening — kb-patch.js's two call sites
// both merge, but scope.js's adopt (ADR 0022, ADR 0042) writes instead, so it passes its own verb
// rather than misreporting a write as a merge.
function maskFencedLines(lines, source, verb = 'merged') {
  let fence = null;
  const masked = lines.map((line) => {
    if (fence === null) {
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (!marker) return line;
      fence = { char: marker[1][0], len: marker[1].length };
      return '';
    }
    // CommonMark: a closing fence is the marker alone — a shown ```bash opener inside the open
    // block is content, not a closer.
    const closer = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
    if (closer && closer[1][0] === fence.char && closer[1].length >= fence.len) fence = null;
    return '';
  });
  if (fence !== null) fail(`${source} has an unterminated fenced code block — nothing is ${verb}`);
  return masked;
}

// YAML frontmatter is the staged file's envelope (title, action), never part of the page body.
function stripFrontmatter(text) {
  const t = text.replace(/\r\n/g, '\n');
  if (!t.startsWith('---\n')) return t;
  const end = t.indexOf('\n---', 3);
  if (end === -1) return t; // unterminated → treat the whole file as body; the no-heading refusal catches it
  return t.slice(t.indexOf('\n', end + 1) + 1);
}

// The staged section: its first heading, and everything until the next heading of the same or
// higher level. A deeper sub-heading belongs to the section; a sibling or a parent ends it. Heading
// detection runs on the fence-masked lines, so an example inside the section never starts or ends it;
// the body sliced out afterwards is the real, unmasked text.
function extractSection(stagedText) {
  const lines = readLines(stripFrontmatter(stagedText));
  const masked = maskFencedLines(lines, 'staged body');
  const start = masked.findIndex((l) => HEADING.test(l));
  if (start === -1) fail('staged page has no heading — a patch names its section by the heading in its body');
  for (let i = 0; i < start; i += 1) {
    if (lines[i].trim() !== '') {
      fail('staged body has content before its first heading — a patch stages one section, starting at its heading');
    }
  }
  const level = headingLevel(masked[start]);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const l = headingLevel(masked[i]);
    if (l > 0 && l <= level) {
      end = i;
      break;
    }
  }
  if (end !== lines.length) {
    fail('staged body carries more than one section — a patch stages exactly one, starting at its heading');
  }
  if (hasSetextHeading(masked, start, end)) {
    fail(
      'staged body may carry a setext-titled section before its next heading — cannot tell where it ' +
        'ends, so fix the staged file',
    );
  }
  // Trailing blank lines belong to the gap between sections, not to the section itself.
  const body = lines.slice(start, end);
  while (body.length > 1 && body[body.length - 1].trim() === '') body.pop();
  return { heading: lines[start], level, body };
}

// The merge. Replace the live section carrying the same heading line, or append when it has none.
// Sorting is deliberately absent: where a new section belongs is editorial, and appending is
// correct for the ascending-number case (`ADR summaries`) that motivated ADR 0027.
function merge(liveText, stagedText) {
  const { heading, level, body } = extractSection(stagedText);
  const live = readLines(liveText);
  const maskedLive = maskFencedLines(live, 'live page');

  // A hit must be a real heading line first (HEADING, which already caps indent at 3 spaces — a 4th
  // space or a leading tab makes it an indented code block under CommonMark, never a heading) and only
  // then compared by `headingKeyOf` above — a closed-ATX live heading ("## A ##") still counts as the
  // same heading as its open form, or it would sit on the page as a permanent duplicate: every later
  // patch of "## A" would only ever find the new, open-form section. Trailing whitespace: a wiki web
  // UI's trailing-space reformat of a heading still counts as the same section instead of missing and
  // appending a duplicate. Leading: HEADING accepts up to 3 spaces of indent as CommonMark's own
  // equivalent of a column-0 heading, and the staged heading this is compared against is always
  // column-0 (doc-writer never indents one) — so an indented live target still matches instead of
  // missing, appending a duplicate, and refusing every later patch of that heading as a 2-times
  // duplicate. Without the HEADING gate, an indented code-block line that merely *shows* the heading
  // text — a page documenting this very format is the plausible case — would count as a real hit too.
  const hits = [];
  const headingKey = headingKeyOf(heading);
  for (let i = 0; i < live.length; i += 1) {
    if (HEADING.test(maskedLive[i]) && headingKeyOf(maskedLive[i]) === headingKey) hits.push(i);
  }
  if (hits.length > 1) {
    fail(
      `live page carries "${heading}" ${hits.length} times — which one to replace cannot be resolved, ` +
        'so nothing is merged',
    );
  }

  if (hits.length === 0) {
    const out = live.slice();
    while (out.length && out[out.length - 1].trim() === '') out.pop();
    if (out.length) out.push('');
    return `${out.concat(body).join('\n')}\n`;
  }

  const start = hits[0];
  let end = live.length;
  for (let i = start + 1; i < live.length; i += 1) {
    const l = headingLevel(maskedLive[i]);
    if (l > 0 && l <= level) {
      end = i;
      break;
    }
  }
  if (hasSetextHeading(maskedLive, start, end)) {
    fail(
      `live page section "${heading.trim()}" may carry a setext-titled section before the next ` +
        'ATX heading — cannot tell where it ends, so nothing is merged',
    );
  }
  // Keep the blank-line gap the live page had before the next section, so replacing a section
  // leaves every other byte of the page alone.
  const tail = live.slice(end);
  const gap = [];
  for (let i = end - 1; i > start && live[i].trim() === ''; i -= 1) gap.unshift('');
  return `${live.slice(0, start).concat(body, gap, tail).join('\n')}`;
}

function readFileOrFail(p, what) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return fail(`cannot read the ${what} page at ${p}`);
  }
}

function main() {
  try {
    const [live, staged] = process.argv.slice(2);
    if (!live || !staged) fail('usage: kb-patch.js <live-page.md> <staged-page.md>');
    process.stdout.write(merge(readFileOrFail(live, 'live'), readFileOrFail(staged, 'staged')));
  } catch (err) {
    if (!err.isRefusal) throw err;
    process.stderr.write(`kb-patch: ${err.message}\n`);
    process.exit(1);
  }
}

// `scripts/scope.js` requires this for `maskFencedLines`, so its `adopt` verb's fence-awareness
// (ADR 0022's second-reader lesson, ADR 0042) reads a fenced `#`/marker line exactly as
// extractSection()/merge() above do, instead of growing a second copy of the same masking rule.
// `tests/kb-patch.test.js` requires this for `merge` besides (ADR 0059).
module.exports = { maskFencedLines, merge };

if (require.main === module) main();
