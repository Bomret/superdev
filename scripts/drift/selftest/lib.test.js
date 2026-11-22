'use strict';

// Selftest suite: the shared helpers in `lib.js` that every check reads text through — the fence mask
// (`maskFences`, which reads fences by `plugin/lib/md-sections.js`'s rule) and the comment stripper
// (`stripComments`). Run by ./index.js.

const { maskFences, scanContract } = require('../lib');

module.exports = ({ assert, fixture }) => {
  const masks = (text, what) => !maskFences(text).includes(what);

  // --- the fence rule is md-sections.js's: each spelling the two readers used to disagree on ---
  assert.ok(!masks('\t```\n## H\n```\n', '## H'), 'a tab before the marker opens no fence');
  assert.ok(!masks('```a`b\n## H\n', '## H'), 'a backtick opener whose info string holds a backtick opens no fence');
  assert.ok(masks('```\n## H\n`````\nafter\n', '## H') && !masks('```\n## H\n`````\nafter\n', 'after'), 'a longer closer closes the fence');
  assert.ok(masks('~~~\n## H\n~~~\nafter\n', '## H') && !masks('~~~\n## H\n~~~\nafter\n', 'after'), 'a tilde fence opens and closes');
  assert.ok(masks('````\n```\n## H\n````\nafter\n', '## H'), 'a shorter closer inside a longer fence is body');
  assert.ok(!masks('````\n```\n## H\n````\nafter\n', 'after'), 'and the longer closer still ends the fence');
  assert.ok(masks('   ```js\n## H\n   ```\n', '## H'), 'three spaces of indent still open and close a fence');
  assert.ok(!masks('    ```\n## H\n', '## H'), 'four spaces of indent open no fence');

  // --- an unclosed fence masks to end of file, and nothing throws ---
  assert.ok(masks('text\n```\n## H\nmore\n', '## H') && masks('text\n```\n## H\nmore\n', 'more'), 'an unclosed fence masks to end of file');
  assert.strictEqual(maskFences('```'), '   ', 'a file holding only an opener masks to spaces');

  // --- offsets: every line keeps its length, CRLF included ---
  for (const text of ['a\n```js\n# x\n```\nb\n', 'a\r\n```js\r\n# x\r\n```\r\nb\r\n']) {
    const masked = maskFences(text);
    assert.strictEqual(masked.length, text.length, 'the masked text keeps every offset');
    assert.ok(!masked.includes('# x'), 'the fenced heading is masked');
  }
  assert.strictEqual(
    maskFences('a\r\n```\r\n# x\r\n```\r\nb\r\n').replace(/\r/g, ''),
    maskFences('a\n```\n# x\n```\nb\n'),
    'a CRLF file masks like its LF form',
  );

  // --- a contract row tests fence-masked text; a `{ fenced: true }` row tests the fenced template too ---
  const doc = { 'skills/x/SKILL.md': '# X\n\n```markdown\n### Criteria\n```\n' };
  const plain = [['skills/x/SKILL.md', /^### Criteria$/m, 'carries a Criteria heading']];
  const fenced = [['skills/x/SKILL.md', /^### Criteria$/m, 'its template carries a Criteria heading', { fenced: true }]];
  assert.equal(scanContract(fixture(doc), plain).length, 1, 'a heading inside a fence does not satisfy a plain row');
  assert.equal(scanContract(fixture(doc), fenced).length, 0, 'a `{ fenced: true }` row reads the fenced template');
  assert.equal(
    scanContract(fixture({ 'skills/x/SKILL.md': '# X\n\n### Criteria\n' }), plain).length,
    0,
    'a heading outside any fence still satisfies a plain row',
  );
};
