'use strict';

// Suite for plugin/lib/kb-staged-page.js: parseStagedPage reads a staged page's frontmatter and refuses,
// by returning null, a file with no frontmatter or an unterminated block. A double-quoted scalar is unescaped where it is valid
// JSON, and read as the text between its quotes where it is not.

const assert = require('node:assert');
const { parseStagedPage } = require('../plugin/lib/kb-staged-page.js');

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

console.log('kb-staged-page.test.js: all assertions passed');
