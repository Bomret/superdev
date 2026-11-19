'use strict';

// Suite for plugin/scripts/scope.js's `section` verb: one markdown section of a file, its heading line read from stdin.
// The verb only reads, so every case shares one temporary directory of fixture files.

require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { call } = require('./scope-setup');

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-section-')));
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
const put = (name, text) => {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
};
const section = (file, heading, cwd) => call(['section', file], heading + '\n', cwd || dir);

const doc = put(
  'doc.md',
  [
    '# Title',
    '',
    '## A',
    'a1',
    '### A deeper',
    'a2',
    '```sh',
    '## not a heading',
    '```',
    'a3',
    '## B',
    'b1',
    '## A longer',
    'c1',
    '',
  ].join('\n'),
);

// The section runs from its heading to the next heading of the same or a higher level; a deeper heading stays inside.
{
  const r = section(doc, '## A');
  assert.equal(r.ok, true);
  assert.equal(r.out, ['## A', 'a1', '### A deeper', 'a2', '```sh', '## not a heading', '```', 'a3'].join('\n'));
}
{
  const r = section(doc, '### A deeper');
  assert.equal(r.out, ['### A deeper', 'a2', '```sh', '## not a heading', '```', 'a3'].join('\n'), 'a sibling or a higher heading ends it');
}
{
  const r = section(doc, '## A longer');
  assert.equal(r.out, ['## A longer', 'c1'].join('\n'), 'the last section ends at end of file');
}
{
  const r = section(doc, '# Title');
  assert.ok(r.out.includes('## B') && r.out.includes('c1'), 'a level-one section holds every deeper section');
}

// A heading inside a fence neither starts nor ends a section.
{
  const f = put('fence.md', ['## X', 'x1', '```md', '## X', '## Y', '```', 'x2', '## Z', 'z1'].join('\n'));
  assert.equal(section(f, '## X').out, ['## X', 'x1', '```md', '## X', '## Y', '```', 'x2'].join('\n'));
}

// The level and the whole heading text match: a longer heading sharing a prefix, or a deeper level, never matches.
{
  assert.equal(section(doc, '## A').out.includes('c1'), false, '## A never matches ## A longer');
  assert.equal(section(doc, '## A deeper').ok, false, '## A deeper is no heading of the file');
  assert.equal(section(doc, '### A').ok, false, '### A is no heading of the file');
}

// Closing #s, extra whitespace, and CRLF match the heading.
{
  assert.equal(section(doc, '##   A  ##').out.split('\n')[0], '## A');
  const f = put('crlf.md', '## A\r\na1\r\n## B\r\nb1\r\n');
  assert.equal(section(f, '## A').out, '## A\na1');
  const g = put('closing.md', '## A ##\na1\n## B\n');
  assert.equal(section(g, '## A').out, '## A ##\na1');
}
