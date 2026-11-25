'use strict';

// Selftest suite: the unterminated-fence scanner (`scanners/unterminated-fence.js`). It reports each Markdown file in
// its read set holding a fenced code block that opens and never closes, by the opener's line. Run by ./index.js.

const { scanUnterminatedFences, scanBackgroundRuleNamesLimit } = require('../scanners');

module.exports = ({ assert, fs, path, fixture, found }) => {
  const scan = (files) => scanUnterminatedFences(fixture(files));

  // --- an unclosed fence is reported by its opener's line ---
  assert.deepEqual(
    scan({ 'plugin/references/open.md': '# Open\n\n```\nnever closed\n' }),
    [{ source: 'plugin/references/open.md', line: 3 }],
    'unterminated-fence: a fence opened at line 3 and never closed is one gap at line 3',
  );
  assert.deepEqual(
    scan({ 'plugin/references/two.md': '```\nclosed\n```\n\ntext\n~~~\nopen\n' }),
    [{ source: 'plugin/references/two.md', line: 6 }],
    'unterminated-fence: a closed fence followed by an unclosed one names the second opener',
  );

  // --- what closes nothing: each is reported at its opener ---
  for (const [label, text] of [
    ['a four-backtick opener "closed" by three backticks', '````\nbody\n```\n'],
    ['a tilde opener "closed" by backticks', '~~~\nbody\n```\n'],
    ['a closer carrying an info string', '```\nbody\n```js\n'],
    ['a closer indented four spaces', '```\nbody\n    ```\n'],
  ]) {
    assert.deepEqual(scan({ 'plugin/references/x.md': text }), [{ source: 'plugin/references/x.md', line: 1 }], `unterminated-fence: reports ${label}`);
  }
  assert.deepEqual(
    scan({ 'plugin/references/x.md': 'text\n```' }),
    [{ source: 'plugin/references/x.md', line: 2 }],
    'unterminated-fence: reports an opener on the last line with no trailing newline',
  );

  // --- what is clean ---
  for (const [label, text] of [
    ['a backtick fence that closes', '```\nbody\n```\n'],
    ['a tilde fence that closes', '~~~\nbody\n~~~\n'],
    ['a longer outer fence holding a shorter inner one', '````\n```\ninner\n```\n````\n'],
    ['a CRLF file whose closer ends in \\r', '# T\r\n\r\n```\r\nbody\r\n```\r\n'],
    ['an empty file', ''],
    ['a file with no fence', '# T\n\nPlain text.\n'],
  ]) {
    assert.deepEqual(scan({ 'plugin/references/x.md': text }), [], `unterminated-fence: ${label} is clean`);
  }

  // --- the read set ---
  const open = '```\nnever closed\n';
  const read = ['plugin/agents/x.md', 'plugin/references/AGENTS.md', 'docs/adr/0001-x.md', 'docs/invariants.md', 'CONTEXT.md'];
  const unread = ['README.md', 'plugin/README.md', 'scripts/AGENTS.md', 'docs/agents/x.md', 'plugin/node_modules/x/y.md', 'plugin/.git/x.md'];
  assert.deepEqual(
    scan(Object.fromEntries([...read, ...unread].map((rel) => [rel, open]))).map((g) => g.source),
    [...read].sort(),
    'unterminated-fence: reads plugin/ Markdown with its AGENTS.md files, the ADRs, docs/invariants.md, and CONTEXT.md, sorted by path, and nothing else',
  );
  assert.deepEqual(scan({ 'scripts/x.md': open, 'docs/known-issues.md': open }), [], 'unterminated-fence: a fixture with none of the read-set paths yields no gap');

  // --- an unreadable directory throws, never reads as clean ---
  if (process.platform !== 'win32' && process.getuid?.() !== 0) {
    const root = fixture({ 'plugin/references/x.md': '# X\n' });
    const locked = path.join(root, 'plugin', 'references');
    fs.chmodSync(locked, 0o000);
    try {
      assert.throws(() => scanUnterminatedFences(root), { code: 'EACCES' }, 'unterminated-fence: a directory the walk cannot read throws');
    } finally {
      fs.chmodSync(locked, 0o755);
    }
  }

  // --- the blind spot it closes: a fence-masking check reads nothing below an unclosed fence ---
  const blind = fixture({
    'plugin/references/AGENTS.md': '# References\n',
    'plugin/references/x.md': "# X\n\n```\nRun it in the background when it outlasts the Bash tool's time limit.\n",
  });
  assert.deepEqual(
    found(scanBackgroundRuleNamesLimit(blind)).filter((g) => g.source.endsWith('x.md')),
    [],
    'unterminated-fence: the fence-masking background-rule check passes a forbidden form below an unclosed fence',
  );
  assert.deepEqual(
    scanUnterminatedFences(blind),
    [{ source: 'plugin/references/x.md', line: 3 }],
    'unterminated-fence: and this check reports that file',
  );

  console.log('drift-check selftest (unterminated-fence) ok');
};
