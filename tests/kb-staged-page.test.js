'use strict';

// Suite for plugin/lib/kb-staged-page.js: parseStagedPage reads a staged page's frontmatter and refuses,
// by returning null, a file with no frontmatter or an unterminated block. A double-quoted scalar is unescaped where it is valid
// JSON, and read as the text between its quotes where it is not; a lone quote of either kind is read verbatim.
// markStagedCreate inserts one `created-by-publish` line before the closing ---, in the line ending of the file's opening
// line, changes no other byte, and leaves an already-marked file alone; a CRLF file marked and then restaged through
// restageLiveHash stays CRLF on every line.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseStagedPage, markStagedCreate, restageLiveHash } = require('../plugin/lib/kb-staged-page.js');

assert.equal(parseStagedPage('title: P\naction: upsert\n\nbody\n'), null, 'no leading --- is no frontmatter');
assert.equal(parseStagedPage('---\ntitle: P\naction: upsert\nbody\n'), null, 'a block with no closing --- is unterminated');

const page = parseStagedPage("---\ntitle: 'It''s here'\naction: upsert\n---\nbody\n");
assert.equal(page.title, "It's here", "a single-quoted scalar's '' is one quote");
assert.equal(page.action, 'upsert');
assert.equal(page.body, 'body\n');

// A double-quoted scalar that is valid JSON is unescaped; one that is not reads as the text between its quotes, backslash kept.
assert.equal(parseStagedPage('---\ntitle: "a\\"b"\n---\nbody\n').title, 'a"b', 'a valid double-quoted scalar is unescaped');
assert.equal(parseStagedPage('---\ntitle: "a\\qb"\n---\nbody\n').title, 'a\\qb', 'an invalid double-quoted scalar reads as the text between its quotes');
assert.equal(parseStagedPage('---\ntitle: ""\n---\nbody\n').title, null, 'an empty double-quoted scalar is no title');

// A lone quote of either kind is taken verbatim, in every field, whatever whitespace surrounds it.
assert.equal(parseStagedPage('---\ntitle: "\naction: upsert\n---\nbody\n').title, '"', 'a lone double quote is the title');
assert.equal(parseStagedPage('---\ntitle: T\nparent: "\n---\nbody\n').parent, '"', 'a lone double quote is the parent');
assert.equal(parseStagedPage('---\ntitle:   "  \n---\nbody\n').title, '"', 'a lone double quote amid whitespace is the title');
assert.equal(parseStagedPage("---\ntitle: '\n---\nbody\n").title, "'", 'a lone single quote is the title');

// markStagedCreate inserts one marker line before the closing ---, in the line ending of the file's opening
// line, and leaves every other byte as it was; a second mark changes nothing.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-staged-page-'));
  const marker = (eol) => new RegExp(`^created-by-publish: \\S+${eol}$`);
  for (const [label, eol] of [['CRLF', '\r\n'], ['LF', '\n']]) {
    const head = `---${eol}title: T${eol}action: upsert${eol}`;
    const tail = `---${eol}line one${eol}line two${eol}`;
    const f = path.join(dir, `${label}.md`);
    fs.writeFileSync(f, head + tail);
    assert.ok(markStagedCreate(f).ok, `${label}: the mark succeeds`);
    const once = fs.readFileSync(f, 'utf8');
    assert.ok(once.startsWith(head) && once.endsWith(tail), `${label}: every other byte is unchanged`);
    assert.match(once.slice(head.length, once.length - tail.length), marker(eol), `${label}: one marker line in the file's line ending`);
    assert.ok(markStagedCreate(f).ok, `${label}: a second mark succeeds`);
    assert.equal(fs.readFileSync(f, 'utf8'), once, `${label}: a second mark keeps the file byte-identical`);
  }

  // Mixed line endings: the marker takes the opening line's ending, whatever the later lines end in.
  for (const [label, head, tail, eol] of [
    ['LF opening, CRLF after', '---\ntitle: T\r\n', '---\r\nbody\r\n', '\n'],
    ['CRLF opening, LF after', '---\r\ntitle: T\n', '---\nbody\n', '\r\n'],
  ]) {
    const f = path.join(dir, `${label}.md`);
    fs.writeFileSync(f, head + tail);
    assert.ok(markStagedCreate(f).ok, `${label}: the mark succeeds`);
    const once = fs.readFileSync(f, 'utf8');
    assert.ok(once.startsWith(head) && once.endsWith(tail), `${label}: every other byte is unchanged`);
    assert.match(once.slice(head.length, once.length - tail.length), marker(eol), `${label}: the marker line ends as the opening line does`);
  }

  // A CRLF file marked and then restaged keeps CRLF on every line, and still reads both the marker and the hash.
  const g = path.join(dir, 'restaged.md');
  fs.writeFileSync(g, '---\r\ntitle: T\r\naction: upsert\r\n---\r\nbody\r\n');
  markStagedCreate(g);
  restageLiveHash(g, 'abc');
  const restaged = fs.readFileSync(g, 'utf8');
  assert.ok(!/(?<!\r)\n/.test(restaged), 'a marked then restaged CRLF file holds no bare LF');
  const read = parseStagedPage(restaged);
  assert.ok(read.createdByPublish, 'the marker reads back');
  assert.equal(read.liveHash, 'abc', 'the hash reads back');
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('kb-staged-page.test.js: all assertions passed');
