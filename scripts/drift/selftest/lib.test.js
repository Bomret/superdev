'use strict';

// Selftest suite: the shared helpers in `lib.js` that every check reads text through — the fence mask
// (`maskFences`, which reads fences by `plugin/lib/md-sections.js`'s rule) and the comment stripper
// (`stripComments`). Run by ./index.js.

const { maskFences, scanContract, stripComments } = require('../lib');

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

  // --- stripComments: comments go, code beside comment markers in a string, template, or regex stays ---
  const kept = (src, code, label) => assert.ok(stripComments(src).includes(code), `${label}: keeps \`${code}\` (got ${JSON.stringify(stripComments(src))})`);
  const gone = (src, comment, label) => assert.ok(!stripComments(src).includes(comment), `${label}: strips \`${comment}\` (got ${JSON.stringify(stripComments(src))})`);
  gone('const a = 1; /* spawn("sh") */ const b = 2;', 'spawn', 'a mid-line block comment');
  kept('const a = 1; /* spawn("sh") */ const b = 2;', 'const b = 2;', 'the code after a mid-line block comment');
  gone('const a = 1;\n/* spawn("sh")\nexecSync()\n', 'execSync', 'an unclosed block comment, to end of file');
  gone("const a = 'x';// spawn('sh')", 'spawn', 'a line comment directly after a closing quote');
  gone('/* a\n   b */\nconst c = 3;', ' b ', 'a block comment at a line start');
  gone('const a = 1; // spawn("sh")', 'spawn', 'a trailing line comment');
  kept("const g = '**/*.js'; spawn('sh');", "spawn('sh')", "a `'**/*.js'` string");
  kept('const s = "a // b"; spawn("sh");', 'spawn("sh")', 'a string holding //');
  kept('const t = `a /* b\n c */ d`; spawn("sh");', 'spawn("sh")', 'a template literal holding /* across lines');
  kept('const t = `a /* b\n c */ d`; spawn("sh");', 'c */ d', 'the template literal text itself');
  kept('const r = /\\/\\*/; spawn("sh");', 'spawn("sh")', 'a regex literal holding \\/\\*');
  kept("const r = /'/; spawn('sh'); // x", "spawn('sh')", 'a regex literal holding a quote');
  kept('const r = x / 2; const y = 4 / 2; spawn("sh");', 'spawn("sh")', 'division is no regex');
};
