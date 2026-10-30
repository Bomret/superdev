'use strict';

// kb-parent-link.js: under `- **Hierarchy:** links`, edits a published page's link line into its
// parent's live body, and a deleted page's link line out of it (ADR 0168, INV-0170, INV-0164).
//
// The edit reads the parent fresh through `find` and `read`, changes exactly one list-item line, and
// writes it back through `update` under the parent's own title: every other byte stays as read, line
// endings included. `editParent` carries the read and the write and takes the one-line change as a
// function of the live body, so a removal of a link line is a second `edit`, not a second path.

const fs = require('fs');
const path = require('path');
const { maskFencedLines } = require('./md-sections.js');
const { runVerb, spawnFailure, exited, runFind, writeTempBody } = require('./kb-backend.js');

// A list item opens with at most three spaces of indent (four or more is indented code) and is not a
// thematic break (`* * *`, `- - -`, `***`).
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const LIST_ITEM_RE = /^ {0,3}(?:[-*+]|\d+[.)])\s+/;
const LIST_ITEM = { test: (line) => LIST_ITEM_RE.test(line) && !THEMATIC_BREAK.test(line) };
// The already-linked check also counts a list item nested under another one, at any indent or tab.
const NESTED_ITEM_RE = /^[ \t]*(?:[-*+]|\d+[.)])\s+/;
const NESTED_BREAK = /^[ \t]*([-*_])(?:\s*\1){2,}\s*$/;
const ANY_LIST_ITEM = (line) => NESTED_ITEM_RE.test(line) && !NESTED_BREAK.test(line);

// Which lines are list items for the already-linked check. An item indented to column 4 or deeper (a tab
// advances to the next tab stop, as `columnOf` reads it) counts only inside a list run, where the nearest
// earlier non-blank line is an item or its continuation, indented to column 2 or deeper. After a paragraph it is
// indented code.
function listItemFlags(masked) {
  let inList = false;
  return masked.map((l) => {
    if (!l.trim()) return false;
    const item = ANY_LIST_ITEM(l);
    const deep = indentWidth(l) >= 4;
    if (item && (!deep || inList)) {
      inList = true;
      return true;
    }
    if (!(inList && indentWidth(l) >= 2)) inList = false;
    return false;
  });
}

// The column a line prefix ends at, read from column 0: a tab advances to the next multiple of 4, as CommonMark
// expands it, and every other character advances one column.
const columnOf = (prefix) => {
  let col = 0;
  for (const c of prefix) col = c === '\t' ? col + 4 - (col % 4) : col + 1;
  return col;
};
const indentWidth = (l) => columnOf(l.match(/^\s*/)[0]);
// The column a list item's content starts at: its indent, marker, and the whitespace after the marker.
const contentColumn = (l) => columnOf(l.match(NESTED_ITEM_RE)[0]);
const ATX_HEADING = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const FENCE_OPEN = /^\s{0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^\s{0,3}(`{3,}|~{3,})\s*$/;

// The index of the last line the list item at `at` carries before `end`, or `at` when it carries none. A carried
// line is a nested item, a continuation line, or a fenced code block opened at least at the item's content column,
// blank lines between them included; a carried fence is carried whole, to its closing fence, so nothing lands inside
// it. `raw` holds the unmasked lines, where `masked` blanks every fence line. A non-blank line right below the
// item's paragraph text continues it too, as a lazy continuation, when it opens no heading, list item, thematic
// break, block quote, or fence. One pass from `at`, so the read stays linear.
function carriedEnd(masked, raw, at, end) {
  const column = contentColumn(masked[at]);
  let last = at;
  let paragraph = true;
  let fence = null;
  for (let j = at + 1; j < end; j += 1) {
    const l = raw[j];
    if (fence) {
      last = j;
      const closer = l.match(FENCE_CLOSE);
      if (closer && closer[1][0] === fence[0] && closer[1].length >= fence.length) fence = null;
      continue;
    }
    if (!l.trim()) continue;
    if (!masked[j].trim()) {
      // a fence opener, read by the rule `maskFencedLines` reads it with
      if (indentWidth(l) < column) break;
      fence = l.match(FENCE_OPEN)[1];
      last = j;
      paragraph = false;
      continue;
    }
    const lazy = j === last + 1 && paragraph && !ANY_LIST_ITEM(l) && !NESTED_BREAK.test(l) && !ATX_HEADING.test(l) && !/^ {0,3}>/.test(l);
    if (!lazy && indentWidth(l) < column) break;
    last = j;
    paragraph = true;
  }
  return last;
}

const refuse = (reason, fix, timedOut) => ({ ok: false, reason, fix, timedOut });

const isWrapped = (t) => t.length > 2 && /[*_`]/.test(t[0]) && t[0] === t[t.length - 1];

// The link readers below cap the link text, an inline link's target, and a wiki link's alias at LINK_TEXT_MAX
// characters each: an unbounded run re-scans the rest of the line from every `[`, quadratic on a line of unclosed
// brackets (`[a](` with no `)`, `[[a|` with no `]`).
const LINK_TEXT_MAX = 1000;
const LINK_TEXT = `((?:\\\\.|[^\\]\\\\]){0,${LINK_TEXT_MAX}})`;
const NOT_IMAGE = '(?<!(?<!\\\\)(?:\\\\\\\\)*!)';
const INLINE_LINK = new RegExp(`${NOT_IMAGE}\\[${LINK_TEXT}\\]\\([^)]{0,${LINK_TEXT_MAX}}\\)`, 'g');
const REFERENCE_LINK = new RegExp(`${NOT_IMAGE}\\[${LINK_TEXT}\\]\\[[^\\]]*\\]`, 'g');
const WIKI_LINK = new RegExp(`\\[\\[([^\\]|]{0,${LINK_TEXT_MAX}})(?:\\|[^\\]]{0,${LINK_TEXT_MAX}})?\\]\\]`, 'g');

// The text of every markdown link on one line, as it compares with a title: a backslash-escaped bracket
// is unescaped. Each link yields the text as written and the forms with a matched wrapper pair (`*`, `_`,
// or backtick on both ends) peeled off, but a `_` pair is peeled at most once. `**Child**` offers
// `Child`, `_Child_` offers `Child`, and `__init__` offers `_init_` and no further.
// A title that carries a wrapper pair itself matches only the text as written (`linksTitle`).
function linkTextsOf(line, peel = true) {
  const texts = [];
  // an image (`![alt](src)`) is no link; a `!` is an image marker when an even number of backslashes
  // (0, 2, …) precede it, and a literal when an odd number escape it
  // simplicity: link text and target are each read up to LINK_TEXT_MAX characters, so a line of unclosed `[` or `(`
  // scans in linear time; a title or a target longer than that never matches. Upgrade path: a one-pass bracket scanner.
  for (const m of line.matchAll(INLINE_LINK)) {
    let t = m[1].replace(/\\([[\]])/g, '$1').trim();
    texts.push(t);
    let unders = 0;
    while (peel && isWrapped(t) && (t[0] !== '_' || unders++ < 1)) {
      t = t.slice(1, -1).trim();
      texts.push(t);
    }
  }
  return texts;
}

// Whether a link on the line has the title as its text: as written, or, for a title that carries no
// wrapper pair itself, as one of the peeled forms above.
const linksTitle = (line, title) => linkTextsOf(line, !isWrapped(title)).includes(title);

// What is wrong with the staged page's parent fields, or null. A `parent-link` whose link text is not
// the page's title could never be found again by the already-linked check, so every run would add it.
function parentLinkRefusal(parsed) {
  if (parsed.parent === parsed.title) return refuse('the page names itself as its parent', 'correct parent: in the staged file');
  if (!parsed.parentSection) return refuse(`parent "${parsed.parent}" is named with no parent-section`, 'add parent-section: <a heading in the parent> to the staged file');
  const line = parsed.parentLink;
  if (!line) return refuse(`parent "${parsed.parent}" is named with no parent-link`, 'add parent-link: <one list-item line linking the page> to the staged file');
  if (/[\r\n]/.test(line)) return refuse('parent-link is more than one line', 'make parent-link one list-item line');
  if (!LIST_ITEM.test(line)) return refuse('parent-link is not a list item', 'start parent-link with "- "');
  if (!linksTitle(line, parsed.title)) {
    return refuse(`parent-link has no link whose text is the page title "${parsed.title}", or its link text or target is over ${LINK_TEXT_MAX} characters`,'write the link as [<title>](<target>) in parent-link');
  }
  return null;
}

// Whether the line links `title` by a reference (`[Child][c]`, `[Child][]`) or a wiki link (`[[Child]]`,
// `[[Child|alias]]`). Such a link is reported on a delete and never removed.
function refersTo(line, title) {
  const texts = [
    ...[...line.matchAll(REFERENCE_LINK)].map((m) => m[1]),
    ...[...line.matchAll(WIKI_LINK)].map((m) => m[1]),
  ];
  return texts.some((t) => t.replace(/\\([[\]])/g, '$1').trim() === title);
}

// An ATX heading's text from the rest of its line past the opening `#` run: trimmed, with a closing `#` run
// dropped when whitespace precedes it (`How it works ##`, not `How it works#`). A backward scan, so a line of
// long whitespace runs reads in linear time.
function headingText(rest) {
  const text = rest.trimEnd();
  let j = text.length;
  while (j > 0 && text[j - 1] === '#') j -= 1;
  return (j > 0 && j < text.length && /\s/.test(text[j - 1]) ? text.slice(0, j) : text).trim();
}

// The line range `[start, end)` under the one heading `section` in the masked lines, up to the next
// heading of the same or a higher level, or a refusal when the heading is missing or repeated. `ownEnd` ends
// the section's own content: the next heading of any level, so a subsection's lines are not in `[start, ownEnd)`.
function sectionRange(masked, section) {
  const headings = masked
    .map((l, i) => {
      const m = l.match(/^ {0,3}(#{1,6})(?:[ \t]+|$)/);
      return m ? { i, level: m[1].length, text: headingText(l.slice(m[0].length)) } : null;
    })
    .filter(Boolean);
  const hits = headings.filter((h) => h.text === section);
  if (hits.length !== 1) {
    return refuse(
      hits.length === 0 ? `the parent has no ATX (#) heading "${section}"` : `the parent has ${hits.length} ATX (#) headings "${section}"`,
      hits.length === 0
        ? `add an ATX heading "${section}" (a line opened by #) to the parent page, or correct parent-section; a setext heading is not read`
        : `leave one "${section}" heading in the parent page`,
    );
  }
  const next = headings.find((h) => h.i > hits[0].i && h.level <= hits[0].level);
  const sub = headings.find((h) => h.i > hits[0].i);
  return { ok: true, start: hits[0].i + 1, end: next ? next.i : masked.length, ownEnd: sub ? sub.i : masked.length };
}

// The live parent body with the line `lineFor()` gives after the last top-level list item of the section headed `section` and
// every line that item carries, in its own content ahead of any subsection heading (below the heading as the section's first list item when its
// own content holds none), or the same body unchanged (`changed: false`) when a list item outside fenced code already links
// `title`. A link counts by its text, whatever its target spelling (ADR 0168). `lineFor` returns
// `{ ok: true, line }` or a refusal, and runs only once the line is to be inserted, so a parent that already
// links the page costs no fill.
function addParentLink(body, section, lineFor, title) {
  const lines = body.split(/(?<=\n)/);
  const eolOf = (l) => (l.match(/\r?\n$/) || [''])[0];
  const raw = lines.map((l) => l.replace(/\r?\n$/, ''));
  let masked;
  try {
    masked = maskFencedLines(raw, 'the parent page', 'edited');
  } catch (e) {
    return refuse(e.message, 'close the code fence in the parent page');
  }
  if (listItemFlags(masked).some((on, i) => on && linksTitle(masked[i], title))) return { ok: true, changed: false };

  const range = sectionRange(masked, section);
  if (!range.ok) return range;
  const { start, ownEnd: end } = range;
  // the anchor is the last top-level item: the section's first list item, or one indented less than the content
  // column of the top-level item before it. An item indented to that column is nested in it and is no anchor.
  let at = -1;
  let column = 0;
  for (let i = start; i < end; i += 1) {
    if (!LIST_ITEM.test(masked[i]) || (at !== -1 && indentWidth(masked[i]) >= column)) continue;
    at = i;
    column = contentColumn(masked[i]);
  }
  // the lines the last item carries belong to it, across blank lines: the link follows the last of them
  if (at !== -1) at = carriedEnd(masked, raw, at, end);

  const filled = lineFor();
  if (!filled.ok) return filled;
  const linkLine = filled.line;
  if (at === -1) {
    // the section holds no list item yet: the link opens its list one blank line below the heading, and one
    // blank line above whatever follows, so neither the heading nor a following paragraph runs into it
    const h = start - 1;
    const headEol = eolOf(lines[h]);
    const eol = headEol || (body.includes('\r\n') ? '\r\n' : '\n');
    if (!headEol) {
      // the heading is the unterminated last line: the new last line stays unterminated too
      lines[h] += eol + eol + linkLine;
    } else {
      const next = lines[h + 1];
      lines.splice(h + 1, 0, eol + linkLine + eol + (next !== undefined && next.trim() ? eol : ''));
    }
    return { ok: true, changed: true, body: lines.join('') };
  }
  if (eolOf(lines[at])) {
    lines.splice(at + 1, 0, linkLine + eolOf(lines[at]));
  } else {
    // the anchor is the unterminated last line: the new last line stays unterminated too
    lines[at] += body.includes('\r\n') ? '\r\n' : '\n';
    lines.push(linkLine);
  }
  return { ok: true, changed: true, body: lines.join('') };
}

// Pure: the live body without the first list-item line in the section headed `section` whose single link
// has `title` as its text, or the same body unchanged (`changed: false`). Every other line linking
// `title`, in that section or elsewhere and of any shape, stays and comes back in `kept` so the report
// names it (ADR 0168, INV-0164), and so does the matching item itself when it carries a nested item, a continuation
// line, a lazy continuation line, or fenced code. A section's only list item, one blank line below its heading, takes that blank line with it, so a delete
// removes the blank line the add wrote above a section's first list item; the blank line the add wrote below it,
// above a following paragraph, stays. The search spans the section's subsections too; the only-item
// check reads the section's own content, as the add does.
function removeParentLink(body, section, title) {
  const lines = body.split(/(?<=\n)/);
  const raw = lines.map((l) => l.replace(/\r?\n$/, ''));
  let masked;
  try {
    masked = maskFencedLines(raw, 'the parent page', 'edited');
  } catch (e) {
    return refuse(e.message, 'close the code fence in the parent page');
  }
  const range = sectionRange(masked, section);
  if (!range.ok) return range;
  const flags = listItemFlags(masked);
  let at = -1;
  for (let i = range.start; i < range.end && at === -1; i += 1) {
    if (flags[i] && linksTitle(masked[i], title) && linkTextsOf(masked[i], false).length === 1) at = i;
  }
  // an item that carries lines of its own (a nested item, a continuation line, a lazy continuation, or fenced code,
  // as `carriedEnd` reads them) is not removed: removing its first line would orphan them. It stays and is reported kept.
  if (at !== -1 && carriedEnd(masked, raw, at, range.end) !== at) at = -1;
  const kept = masked.filter((l, i) => i !== at && (linksTitle(l, title) || refersTo(l, title)));
  if (at === -1) return { ok: true, changed: false, kept };
  const h = range.start - 1;
  // the only-item check counts every list item of the section's own content, nested ones included, as the add reads it
  let only = true;
  for (let i = range.start; i < range.ownEnd; i += 1) if (i !== at && flags[i]) only = false;
  if (only && at === h + 2 && !masked[h + 1].trim()) {
    // the section's only list item, one blank line below the heading: the shape `addParentLink` writes into a
    // section that held none. The blank line goes with it, and so does the line end the add appended to a heading
    // that was the unterminated last line.
    lines.splice(h + 1, 2);
    if (h + 1 === lines.length && !/\r?\n$/.test(body)) lines[h] = lines[h].replace(/\r?\n$/, '');
  } else {
    lines.splice(at, 1);
  }
  return { ok: true, changed: true, body: lines.join(''), kept };
}

// Reads the live parent through `find` and `read` (every call is bounded, and a timeout carries
// `timedOut` so the batch stops), applies `edit(body)` to it, and writes the result back through
// `update` under the parent's own title. `edit` returns `{ ok: true, changed, body }` or a refusal.
// `absentOk` makes a parent that is not there, or reads as an empty or whitespace-only body, a success with nothing to
// edit: it holds no link.
function editParent(parentTitle, templates, edit, absentOk = false) {
  const why = (r) => `parent page "${parentTitle}": ${r}`;
  const retry = 'run publish again once the parent page can be read and updated';
  if (!templates.read) return refuse(why('no read command configured'), 'add a read command to docs/agents/knowledge-base.md');
  const found = runFind(parentTitle, templates);
  if (found.verdict === 'absent' && absentOk) return { ok: true, kept: [] };
  if (found.verdict === 'absent') return refuse(`parent page "${parentTitle}" not found`, 'publish the parent page first, or correct parent: in the staged file');
  if (found.verdict === 'unknown') return refuse(why(found.reason), retry, found.timedOut);
  const read = runVerb(templates, 'read', { title: parentTitle, found: found.fields });
  if (read.error) {
    const f = spawnFailure('read', read);
    return refuse(why(f.reason), retry, f.timedOut);
  }
  if (read.status !== 0) return refuse(why(exited('read', read)), retry);
  if (!read.stdout.trim() && absentOk) return { ok: true, kept: [] };
  if (!read.stdout) return refuse(why('read returned an empty body'), retry);

  const edited = edit(read.stdout);
  if (!edited.ok) return edited;
  if (!edited.changed) return { ok: true, kept: edited.kept };
  if (!templates.update) return refuse(why('no update command configured'), 'add an update command to docs/agents/knowledge-base.md');
  const bodyFile = writeTempBody(edited.body);
  try {
    const res = runVerb(templates, 'update', { title: parentTitle, bodyFile, found: found.fields });
    if (res.error) {
      const f = spawnFailure('update', res);
      return refuse(why(f.reason), retry, f.timedOut);
    }
    if (res.status !== 0) return refuse(why(exited('update', res)), retry);
    return { ok: true, kept: edited.kept };
  } finally {
    try {
      fs.rmSync(path.dirname(bodyFile), { recursive: true, force: true });
    } catch {
      // the backend call already ran — a leftover temp dir must not abort the batch
    }
  }
}

// A non-markdown body format cannot take or give up a markdown link line: the refusal, or null. Checked before
// the page is sent, so a page that names a parent never lands, or goes, without its link (INV-0170).
function markdownRefusal(templates, action) {
  if (!templates.bodyFormat || templates.bodyFormat === 'markdown') return null;
  const what = action === 'delete' ? 'a markdown link line cannot be removed from it' : 'a markdown parent-link cannot be written into it';
  return refuse(`the backend's body format is ${templates.bodyFormat}, not markdown — ${what}`, 'declare Hierarchy: links only for a markdown backend');
}

// The staged parent-link with each `{sub_url}` in a link target replaced by the landed page's own `sub_url`, or a
// refusal. `fields` is what the page's own `find` returned; a page this run created has none on hand, so a fresh
// bounded `find` supplies them. A line with no placeholder comes back exactly as staged (ADR 0168).
const SUB_URL_TARGET = /\]\([^)]*\{sub_url\}[^)]*\)/;
function fillLinkTarget(parsed, templates, fields) {
  const line = parsed.parentLink;
  if (!SUB_URL_TARGET.test(line)) return { ok: true, line };
  const write = 'write the link target in full in parent-link';
  if (!fields) {
    const found = runFind(parsed.title, templates);
    if (found.verdict === 'absent') return refuse(`find reports "${parsed.title}" absent right after it landed, so {sub_url} has no value`, 'run publish again');
    if (found.verdict === 'unknown') return refuse(`find for "${parsed.title}": ${found.reason}, so {sub_url} has no value`, 'run publish again', found.timedOut);
    fields = found.fields;
  }
  const value = fields.sub_url;
  if (typeof value !== 'string' || !value) {
    return refuse(`parent-link carries {sub_url}, but find returned no sub_url for "${parsed.title}"`, `${write}; this backend's find emits no sub_url`);
  }
  // URL-safe only: RFC 3986 unreserved, the sub-delims but `(` and `)`, `%`, `/`, `:`, `@`, `?`, `#`. Anything else (an
  // unbalanced `(`, a `\`, a `<`, whitespace) can leave a line CommonMark reads as no link while linksTitle still does.
  if (!/^[A-Za-z0-9\-._~!$&'*+,;=%/:@?#]+$/.test(value)) {
    return refuse(`find returned a sub_url for "${parsed.title}" that holds a character outside the URL-safe set (letters, digits, and -._~!$&'*+,;=%/:@?#), which no link target can carry`, write);
  }
  return { ok: true, line: line.replace(/\]\([^)]*\)/g, (target) => target.split('{sub_url}').join(value)) };
}

// Links a landed page into its parent. The target is filled only once the live parent lacks the link.
function linkIntoParent(parsed, templates, fields) {
  const lineFor = () => fillLinkTarget(parsed, templates, fields);
  return editParent(parsed.parent, templates, (body) => addParentLink(body, parsed.parentSection, lineFor, parsed.title));
}

// Removes a deleted page's own link line from its parent. A parent that is gone holds no link.
function unlinkFromParent(parsed, templates) {
  return editParent(parsed.parent, templates, (body) => removeParentLink(body, parsed.parentSection, parsed.title), true);
}

const linksHierarchy = (templates) => templates.hierarchy === 'links';

// Under `links` the create does not nest, so the staged parent is withheld from `resolveParent`.
const nestingParent = (parsed, templates) => (linksHierarchy(templates) ? null : parsed.parent);

module.exports = {
  linksHierarchy,
  nestingParent,
  parentLinkRefusal,
  markdownRefusal,
  addParentLink,
  removeParentLink,
  fillLinkTarget,
  linkIntoParent,
  unlinkFromParent,
};
