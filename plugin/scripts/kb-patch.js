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
function maskFencedLines(lines, source) {
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
  if (fence !== null) fail(`${source} has an unterminated fenced code block — nothing is merged`);
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
  if (process.argv.includes('--selftest')) {
    selftest();
    return;
  }
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

function selftest() {
  const assert = require('node:assert');

  const staged = (heading, body) => `---\ntitle: ADR summaries\naction: patch\n---\n\n${heading}\n\n${body}\n`;

  // --- replace: the live page carries the heading. Every other section survives byte-identical. ---
  const live =
    '# ADR summaries\n\n## 0009 — first\n\nnine.\n\n## 0010 — second\n\nold ten.\n\n## 0011 — third\n\neleven.\n';
  const replaced = merge(live, staged('## 0010 — second', 'new ten.'));
  assert.ok(replaced.includes('new ten.'), 'replaces the named section body');
  assert.ok(!replaced.includes('old ten.'), 'the replaced body is gone');
  assert.ok(replaced.includes('## 0009 — first\n\nnine.'), 'the section before survives');
  assert.ok(replaced.includes('## 0011 — third\n\neleven.'), 'the section after survives');
  assert.equal(
    (replaced.match(/^## /gm) || []).length,
    3,
    'replacing adds no section and drops none',
  );

  // --- append: the heading is absent, so the section lands at the end. ---
  const appended = merge(live, staged('## 0012 — fourth', 'twelve.'));
  assert.ok(appended.startsWith(live.trimEnd()), 'the whole live page survives ahead of the append');
  assert.ok(appended.trimEnd().endsWith('## 0012 — fourth\n\ntwelve.'), 'the new section is last');
  assert.equal((appended.match(/^## /gm) || []).length, 4, 'append adds exactly one section');

  // --- idempotent: merging the same patch over its own output changes nothing. This is what
  // makes a patch safe under /superdev:publish-kb's retry of a staged page whose call failed. ---
  const once = merge(live, staged('## 0012 — fourth', 'twelve.'));
  const twice = merge(once, staged('## 0012 — fourth', 'twelve.'));
  assert.equal(twice, once, 'a second identical merge is a no-op, byte for byte');
  const reReplaced = merge(replaced, staged('## 0010 — second', 'new ten.'));
  assert.equal(reReplaced, replaced, 'replacing with the same body twice is a no-op too');

  // --- a section spanning sub-headings: `###` belongs to it, the next `##` ends it. ---
  const deep =
    '# T\n\n## A\n\n### A.1\n\nnested.\n\n### A.2\n\nalso nested.\n\n## B\n\nbee.\n';
  const deepOut = merge(deep, staged('## A', 'flat now.'));
  assert.ok(!deepOut.includes('A.1') && !deepOut.includes('A.2'), 'sub-headings go with their section');
  assert.ok(deepOut.includes('## B\n\nbee.'), 'the next same-level section is untouched');

  // --- a deeper staged section stops at the next same-level heading, not the next heading at all. ---
  const subOut = merge(deep, staged('### A.1', 'replaced.'));
  assert.ok(subOut.includes('replaced.'), 'a sub-section replaces');
  assert.ok(subOut.includes('### A.2\n\nalso nested.'), 'its sibling survives');
  assert.ok(subOut.includes('## B\n\nbee.'), 'and so does the parent-level section after it');

  // --- refusals ---
  assert.throws(
    () => merge(live, '---\ntitle: x\naction: patch\n---\n\njust prose, no heading.\n'),
    /no heading/,
    'a staged body with no heading refuses',
  );
  assert.throws(
    () => merge('# T\n\n## dup\n\none.\n\n## dup\n\ntwo.\n', staged('## dup', 'three.')),
    /2 times/,
    'a heading the live page carries twice refuses rather than guessing',
  );
  assert.throws(
    () => merge(live, '---\ntitle: x\naction: patch\n---\n\n## A\n\naaa.\n\n## B\n\nbbb.\n'),
    /more than one section/,
    'a staged body with more than one section refuses instead of silently dropping the rest',
  );
  assert.throws(
    () => merge(live, '---\ntitle: x\naction: patch\n---\n\nleading paragraph.\n\n## A\n\naaa.\n'),
    /content before its first heading/,
    'a staged body with a leading paragraph refuses instead of silently dropping it',
  );

  // --- an empty live page comes back as the section alone. ---
  const fromEmpty = merge('', staged('## 0012 — fourth', 'twelve.'));
  assert.equal(fromEmpty, '## 0012 — fourth\n\ntwelve.\n', 'an empty live page yields just the section');

  // --- CRLF reads exactly as LF, the way scope.js reads a CRLF ledger. ---
  assert.equal(
    merge(live.replace(/\n/g, '\r\n'), staged('## 0010 — second', 'new ten.')),
    replaced,
    'a CRLF live page merges identically to an LF one',
  );
  assert.equal(
    merge(live, staged('## 0010 — second', 'new ten.').replace(/\n/g, '\r\n')),
    replaced,
    'a CRLF staged page merges identically too',
  );

  // --- a heading matches on the exact line, so a mention inside prose is not a section. ---
  const prose = '# T\n\n## real\n\nsee ## real elsewhere.\n\n## other\n\nx.\n';
  assert.ok(merge(prose, staged('## real', 'new.')).includes('## other\n\nx.'), 'prose mention is not a hit');

  // --- a live heading with trailing whitespace (a wiki web UI reformat) still matches, rather than
  // missing and appending a duplicate that then refuses every later patch as a 2-times duplicate. ---
  const trailingWs = '# T\n\n## real   \n\nold.\n\n## other\n\nx.\n';
  const trimmedMatch = merge(trailingWs, staged('## real', 'new.'));
  assert.ok(trimmedMatch.includes('## real\n\nnew.'), 'trailing-whitespace heading still counts as a match');
  assert.equal((trimmedMatch.match(/^## real/gm) || []).length, 1, 'no duplicate section is appended');

  // --- a closed-ATX live heading ("## A ##", CommonMark's own closing-sequence spelling of "## A")
  // still matches, rather than missing and leaving the stale section on the page forever — every
  // later patch of "## A" would only ever find the new one, never the closed-ATX original. ---
  const closedAtx = '# T\n\n## A ##\n\nold.\n\n## B\n\nbee.\n';
  const closedAtxOut = merge(closedAtx, staged('## A', 'new.'));
  assert.ok(closedAtxOut.includes('## A\n\nnew.'), 'closed-ATX heading counts as a match');
  assert.equal((closedAtxOut.match(/^## A/gm) || []).length, 1, 'no duplicate section is appended');

  // --- a live heading whose marker-to-text gap is more than one space, or a tab, still matches a
  // staged heading with a single space — CommonMark reads "##  A" and "##\tA" as the same heading text
  // ("A") as "## A", so a wider gap must not leave the stale section duplicated on the page forever. ---
  const gapLive = '# T\n\n##  A\n\nold.\n\n## B\n\nb.\n';
  const gapOut = merge(gapLive, staged('## A', 'new.'));
  assert.ok(gapOut.includes('## A\n\nnew.'), 'a two-space marker gap still counts as a match');
  assert.ok(!gapOut.includes('old.'), 'the stale section is replaced, not left as a duplicate');
  assert.equal((gapOut.match(/^##\s*A$/gm) || []).length, 1, 'no duplicate section is appended');

  const tabGapLive = '# T\n\n##\tA\n\nold.\n\n## B\n\nb.\n';
  const tabGapOut = merge(tabGapLive, staged('## A', 'new.'));
  assert.ok(tabGapOut.includes('## A\n\nnew.'), 'a tab marker gap still counts as a match');
  assert.equal((tabGapOut.match(/^##\s*A$/gm) || []).length, 1, 'no duplicate section is appended');

  // --- over-normalisation probes: the marker-gap collapse must not blur headings that genuinely differ.
  // "## A#" and "## A #x" are not closed-ATX ("#" needs whitespace before it to close), so their "#" is
  // heading text and each must stay distinct from "## A" — an append, not a replace. ---
  const hashTextLive = '# T\n\n## A#\n\nfoo.\n\n## A #x\n\nbar.\n\n## B\n\nb.\n';
  const hashTextOut = merge(hashTextLive, staged('## A', 'new.'));
  assert.ok(hashTextOut.includes('## A#\n\nfoo.'), '"## A#" is untouched — its text is "A#", not "A"');
  assert.ok(hashTextOut.includes('## A #x\n\nbar.'), '"## A #x" is untouched — its text is "A #x", not "A"');
  assert.ok(hashTextOut.trimEnd().endsWith('## A\n\nnew.'), 'the staged "## A" is appended, not merged into either');

  // --- "## A  B" and "## A B" differ in their text (the internal gap is content, not a marker gap) and
  // must stay distinct too — the collapse only ever touches the marker-to-text gap at the start. ---
  const innerGapLive = '# T\n\n## A  B\n\nold.\n\n## B\n\nb.\n';
  const innerGapOut = merge(innerGapLive, staged('## A B', 'new.'));
  assert.ok(innerGapOut.includes('## A  B\n\nold.'), '"## A  B" is untouched by a staged "## A B"');
  assert.ok(innerGapOut.trimEnd().endsWith('## A B\n\nnew.'), 'the staged "## A B" is appended, not merged in');

  // --- a live page carrying both "## A #" (closed-ATX, same heading as "## A") and "## A" is a genuine
  // duplicate and must still refuse — the marker-gap collapse must not blunt that existing check. ---
  assert.throws(
    () => merge('# T\n\n## A #\n\none.\n\n## A\n\ntwo.\n', staged('## A', 'three.')),
    /2 times/,
    '"## A #" and "## A" are the same heading (closed-ATX), so the live page still refuses as a duplicate',
  );

  // --- a `#` inside a fenced code block is not a heading — in the staged body, in the live section
  // being replaced, or in a fenced example the `hits` loop scans. ---

  // mode 1: a fenced `#` in the staged body must not end the section early.
  const runbooks = '# Runbooks\n\n## Deploy\n\nold.\n\n## Rollback\n\nroll.\n';
  const fencedStaged = merge(runbooks, staged('## Deploy', 'Run:\n\n```bash\n# install first\nnpm i\n```\n\ndone.'));
  assert.ok(fencedStaged.includes('# install first'), 'the fenced comment survives, unread as a heading');
  assert.ok(fencedStaged.includes('npm i\n```\n\ndone.'), 'the closing fence and trailing prose are kept');
  assert.ok(fencedStaged.includes('## Rollback\n\nroll.'), 'the next section is untouched, not swallowed');

  // mode 2: a fenced `#` inside the live section being replaced must not end the replaced region early.
  const runbooksFencedLive =
    '# Runbooks\n\n## Deploy\n\n```bash\n# not a heading\n```\n\nold.\n\n## Rollback\n\nroll.\n';
  const fencedLive = merge(runbooksFencedLive, staged('## Deploy', 'new.'));
  assert.ok(!fencedLive.includes('old.'), 'the whole old section, including its fence, is replaced');
  assert.ok(!fencedLive.includes('```bash'), 'no stray fence is left dangling in the live page');
  assert.ok(fencedLive.includes('## Deploy\n\nnew.'), 'the new section lands whole');
  assert.ok(fencedLive.includes('## Rollback\n\nroll.'), 'the section after is untouched');

  // mode 3: a fenced example that *shows* a heading line does not count as a `hits` match.
  const runbooksExample =
    '# Runbooks\n\n## Deploy\n\nsee example:\n\n```markdown\n## Deploy\n\nexample only.\n```\n\nreal body.\n\n' +
    '## Rollback\n\nroll.\n';
  const exampleOut = merge(runbooksExample, staged('## Deploy', 'new.'));
  assert.ok(exampleOut.includes('## Deploy\n\nnew.'), 'the real section is replaced, not refused as a duplicate');
  assert.equal((exampleOut.match(/^## Deploy$/gm) || []).length, 1, 'the fenced example heading is gone with it');

  // mode 4: a shown fence opener with an info string (```bash) inside an open block is content,
  // not a closer — CommonMark closes a fence only on the bare marker. The `# comment` after it must
  // stay masked, or it would read as a heading and end the section early.
  const shownOpener = merge(
    runbooks,
    staged('## Deploy', 'Run:\n\n````markdown\n```bash\n# not a heading\n```\n````\n\ndone.'),
  );
  assert.ok(shownOpener.includes('# not a heading'), 'the shown fenced comment survives, unread as a heading');
  assert.ok(shownOpener.includes('done.'), 'the prose after the outer fence is kept in the section');
  assert.ok(shownOpener.includes('## Rollback\n\nroll.'), 'the next section is untouched');
  assert.throws(
    () => merge(runbooks, staged('## Deploy', '```\n```bash\n# still open\n')),
    /unterminated fenced code block/,
    'a ```bash line inside an open ``` block does not close it — the block stays unterminated',
  );

  // --- a live section titled by an ATX heading indented 1-3 spaces (still a heading under
  // CommonMark) stops the replaced region — it does not vanish into the section ahead of it. ---
  const indentedLive =
    '# T\n\n## Z\n\nzed.\n\n   ## A\n\naaa.\n\n## B\n\nbee.\n';
  const indentedOut = merge(indentedLive, staged('## Z', 'new zed.'));
  assert.ok(indentedOut.includes('## A\n\naaa.'), 'the indented section survives, not swallowed');
  assert.ok(indentedOut.includes('## B\n\nbee.'), 'the section after it survives too');

  // --- an indented live target heading still matches a column-0 staged heading: leading indent up
  // to 3 spaces is CommonMark's own equivalent of column 0, so this replaces rather than missing and
  // appending a duplicate that then refuses every later patch as a 2-times duplicate. ---
  const indentedTarget = '# T\n\n  ## Z\n\nold.\n\n## B\n\nbee.\n';
  const indentedTargetOut = merge(indentedTarget, staged('## Z', 'new.'));
  assert.ok(indentedTargetOut.includes('## Z\n\nnew.'), 'the indented target section is replaced');
  assert.ok(!indentedTargetOut.includes('old.'), 'its old body is gone');
  assert.equal((indentedTargetOut.match(/## Z/gm) || []).length, 1, 'no duplicate section is appended');

  // --- a live heading indented 4 or more spaces, or by a tab, is an indented code block under
  // CommonMark, not a heading — it must not count as a `hits` match against the real, column-0
  // heading it merely shows as an example (e.g. on a page documenting this very format). It is part
  // of the same section's body, so it is replaced along with the rest of that body, same as any other
  // content there — the point is that the merge succeeds instead of refusing as a 2-times duplicate. ---
  const codeBlockLive4 = '# T\n\n## R\n\nx.\n\n    ## R\n\ny.\n';
  const codeBlockOut4 = merge(codeBlockLive4, staged('## R', 'new.'));
  assert.equal(codeBlockOut4, '# T\n\n## R\n\nnew.\n', 'a 4-space indented example does not refuse the merge');

  const codeBlockLiveTab = '# T\n\n## R\n\nx.\n\n\t## R\n\ny.\n';
  const codeBlockOutTab = merge(codeBlockLiveTab, staged('## R', 'new.'));
  assert.equal(codeBlockOutTab, '# T\n\n## R\n\nnew.\n', 'a tab-indented example does not refuse the merge either');

  // --- a setext-titled live section ahead of the next ATX heading cannot be told apart from
  // ordinary content ending in a `---`/`===` line, so the merge refuses rather than risk dropping it. ---
  const setextLive =
    '# T\n\n## Z\n\nzed.\n\nSubtitle\n========\n\nsub.\n\n## B\n\nbee.\n';
  assert.throws(
    () => merge(setextLive, staged('## Z', 'new zed.')),
    /setext/,
    'a setext heading inside the region about to be dropped refuses the merge',
  );

  // --- a setext underline inside the *staged* section is refused there too — on the re-runnable
  // staged file, not on the live page it would otherwise merge onto cleanly and then never be
  // patchable again. ---
  assert.throws(
    () => merge(live, staged('## A', 'Intro line\n---\n\nafter.')),
    /setext/,
    'a staged body carrying a setext underline in its own section refuses',
  );

  // --- a `---` thematic break, separated from the text above it by a blank line, is a rule, not a
  // setext underline — CommonMark requires no blank line before an underline, so this still merges. ---
  const thematicBreak = merge(live, staged('## A', 'Some para.\n\n---\n\nMore.'));
  assert.ok(thematicBreak.includes('## A\n\nSome para.\n\n---\n\nMore.'), 'a blank-line-separated rule merges');

  // --- a `---` inside a fenced code block in the staged body is masked before the setext scan, so
  // an example showing one still merges instead of refusing on a line that is never really content. ---
  const fencedDashes = merge(live, staged('## A', '```\n---\n```\n\ntext.'));
  assert.ok(fencedDashes.includes('## A\n\n```\n---\n```\n\ntext.'), 'a fenced ``---`` in the staged body still merges');

  // --- an unterminated fence, in either input, refuses rather than masking every line after it as
  // fence content — which would hide a following section from view. ---
  assert.throws(
    () => merge(live, staged('## 0010 — second', '```bash\nnpm i\n')),
    /unterminated fenced code block/,
    'a staged body with an unterminated fence refuses',
  );
  assert.throws(
    () => merge('# T\n\n## Z\n\n```bash\nnpm i\n\n## A\n\naaa.\n', staged('## Z', 'new.')),
    /unterminated fenced code block/,
    'a live page with an unterminated fence refuses',
  );

  console.log('kb-patch selftest ok');
}

if (require.main === module) main();
