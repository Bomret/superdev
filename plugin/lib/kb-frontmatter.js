'use strict';

// kb-frontmatter.js: the one splitter for a staged page's YAML frontmatter, shared by the staged-page parser, the
// `created-by-publish` marker, the live-hash restager, and the section reader's frontmatter strip.
//
// The frontmatter opens with a first line of exactly `---` and closes on the next line that is exactly `---`. A trailing CR
// on either line is tolerated, and the closing line needs no newline after it. A line such as `---x` or `----` inside the
// frontmatter closes nothing. Returns `null` for text with no opening line or no closing line, else
// `{ fm, closeAt, bodyAt }`: `fm` is the text between the two lines, `closeAt` the offset of the closing line, `bodyAt` the offset
// just past it and its newline.
function splitFrontmatter(text) {
  const open = /^---\r?\n/.exec(text);
  if (!open) return null;
  let pos = open[0].length;
  for (;;) {
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? text.length : nl;
    if (text.slice(pos, lineEnd).replace(/\r$/, '') === '---') {
      return { fm: text.slice(open[0].length, pos), closeAt: pos, bodyAt: nl === -1 ? text.length : nl + 1 };
    }
    if (nl === -1) return null;
    pos = nl + 1;
  }
}

module.exports = { splitFrontmatter };
