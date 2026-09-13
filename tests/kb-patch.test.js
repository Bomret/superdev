'use strict';

// Suite for plugin/scripts/kb-patch.js. Requires the module (silent — kb-patch.js already guards
// its CLI entry with require.main === module, per ADR 0059) and calls its exported merge()
// directly, the way the script's own inline --selftest used to before this suite moved off the
// shipped tree (ADR 0059).

const assert = require('node:assert');

const kbPatchPath = require.resolve('../plugin/scripts/kb-patch.js');
const { merge } = require(kbPatchPath);

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


console.log('kb-patch tests ok');
