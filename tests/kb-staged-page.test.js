'use strict';

// Suite for plugin/lib/kb-staged-page.js: parseStagedPage reads a staged page's frontmatter and refuses,
// by returning null, a file with no frontmatter or an unterminated block.

const assert = require('node:assert');
const { parseStagedPage } = require('../plugin/lib/kb-staged-page.js');

assert.equal(parseStagedPage('title: P\naction: upsert\n\nbody\n'), null, 'no leading --- is no frontmatter');
assert.equal(parseStagedPage('---\ntitle: P\naction: upsert\nbody\n'), null, 'a block with no closing --- is unterminated');

const page = parseStagedPage("---\ntitle: 'It''s here'\naction: upsert\n---\nbody\n");
assert.equal(page.title, "It's here", "a single-quoted scalar's '' is one quote");
assert.equal(page.action, 'upsert');
assert.equal(page.body, 'body\n');

console.log('kb-staged-page.test.js: all assertions passed');
