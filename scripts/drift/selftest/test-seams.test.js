'use strict';

// Selftest suite: the test-seam scanner over the shipped JavaScript (`scanners/test-seams.js`, INV-0156,
// ADR 0154). Run by ./index.js.

const { scanTestSeams } = require('../scanners');

module.exports = ({ assert, path, fixture }) => {
  const tests = { 'tests/widget.test.js': '', 'tests/widget-setup.js': '' };
  const docs = { 'plugin/references/a.md': 'Set `DOCUMENTED_MS` to change the bound.\n' };
  const scan = (files) => scanTestSeams(fixture({ ...tests, ...docs, ...files }));

  // --- a reference to one of superdev's own test files ---
  for (const [label, src] of [
    ['a test file name in a string', "const f = 'widget.test.js';"],
    ['a path under tests/', "require('../../tests/widget-setup.js');"],
    ['a comment', '// exercised by widget.test.js\nconst a = 1;'],
    ['a glob over tests/ files', '// the `tests/widget-*.test.js` suites require it\nconst a = 1;'],
    ['a glob in a nested tests/ path', "const g = '../tests/sub/w?dget.js';"],
    ['a brace glob over tests/ files', "const g = 'tests/{widget,gadget}.test.js';"],
  ]) {
    const gaps = scan({ 'plugin/lib/deep/x/rogue.js': src });
    assert.equal(gaps.length, 1, `flags ${label}`);
    assert.equal(gaps[0].source, path.join('plugin', 'lib', 'deep', 'x', 'rogue.js'), `names the file for ${label}`);
    assert.ok(gaps[0].expectation.includes('INV-0156'), 'cites the invariant');
  }

  // --- a non-JavaScript file under tests/ is no test file ---
  assert.deepEqual(
    scanTestSeams(fixture({ ...tests, ...docs, 'tests/.DS_Store': '', 'plugin/lib/finder.js': "const skip = '.DS_Store';" })),
    [],
    'a stray .DS_Store under tests/ names no test file',
  );

  // --- an environment read no shipped document names ---
  for (const [label, src] of [
    ['direct property access', 'const v = process.env.SECRET_KNOB;'],
    ['bracket access with a literal name', "const v = process.env['SECRET_KNOB'];"],
    ['bracket access with a double-quoted name', 'const v = process.env["SECRET_KNOB"];'],
    ['optional-chained bracket access', "const v = process.env?.['SECRET_KNOB'];"],
    ['destructuring', 'const { SECRET_KNOB } = process.env;'],
    ['destructuring with a nested-brace default', 'const { CLAUDE_A = {}, SECRET_KNOB } = process.env;'],
    ['destructuring split across lines', 'const {\n  CLAUDE_A,\n  SECRET_KNOB,\n} = process.env;'],
    ['destructuring with a rename and a default', 'const { A_OK: x, SECRET_KNOB: y = 1 } = process.env;'],
  ]) {
    const gaps = scan({ 'plugin/hooks/rogue.js': src });
    assert.equal(gaps.length, label.startsWith('destructuring with a rename') ? 2 : 1, `flags ${label}`);
    assert.ok(gaps.some((g) => g.expectation.includes('SECRET_KNOB')), `names the variable for ${label}`);
  }

  // --- a SUPERDEV_ variable (ADR 0207, INV-0180) ---
  for (const [label, src] of [
    ['direct property access', 'const v = process.env.SUPERDEV_X_MS;'],
    ['bracket access', "const v = process.env['SUPERDEV_X_MS'];"],
    ['destructuring', 'const { SUPERDEV_X_MS } = process.env;'],
    ['a key of the environment handed to a child', "spawnSync('git', [], { env: { ...process.env, SUPERDEV_X_MS: '1' } });"],
    ['a quoted key of the environment handed to a child', "spawnSync('git', [], { env: { 'SUPERDEV_X_MS': '1' } });"],
    ['a KEY=value prefix in a spawned command', "spawnSync('sh', ['-c', 'SUPERDEV_X_MS=1 git status']);"],
    ['a write to the process environment', "process.env.SUPERDEV_X_MS = '1';"],
    ['a bracket write to an environment object', "env['SUPERDEV_X_MS'] = '1';"],
    ['a property read through an aliased environment object', 'const v = env.SUPERDEV_X_MS;'],
    ['a bracket read through an aliased environment object', "const v = opts.env['SUPERDEV_X_MS'];"],
    ['a destructuring of an aliased environment object', 'const { SUPERDEV_X_MS } = env;'],
    ['a computed key of the environment handed to a child', "spawnSync('git', [], { env: { ['SUPERDEV_X_MS']: '1' } });"],
    ['a shorthand key of the environment handed to a child', "spawnSync('git', [], { env: { ...process.env, SUPERDEV_X_MS } });"],
    ['a binding declaration', "const SUPERDEV_X_MS = '1';"],
    ['a nested destructuring', 'const { a: { SUPERDEV_X_MS } } = o;'],
    ['a destructuring default holding braces', 'const { SUPERDEV_X_MS = {} } = env;'],
  ]) {
    const gaps = scan({ 'plugin/hooks/rogue.js': src });
    assert.equal(gaps.length, 1, `flags a SUPERDEV_ variable by ${label}`);
    assert.ok(gaps[0].expectation.includes('SUPERDEV_X_MS'), `names the variable for ${label}`);
  }
  assert.equal(
    scan({ 'plugin/references/b.md': 'Set `SUPERDEV_X_MS` to change the bound.\n' }).length,
    1,
    'flags a SUPERDEV_ name in shipped Markdown',
  );
  assert.equal(
    scan({ 'plugin/references/b.md': 'Set `SUPERDEV_X_MS`, then `SUPERDEV_X_MS` again.\n' }).length,
    1,
    'reports a SUPERDEV_ name once per shipped Markdown file however often it is named',
  );
  assert.equal(
    scan({ 'plugin/references/b.md': 'Set `SUPERDEV_X_MS`.\n', 'plugin/hooks/rogue.js': 'const v = process.env.SUPERDEV_X_MS;' }).length,
    2,
    'a document naming the variable does not allow its read',
  );

  // --- what passes ---
  const clean = {
    'a documented setting': 'const v = process.env.DOCUMENTED_MS;',
    'a CLAUDE_ variable': 'const v = process.env.CLAUDE_PLUGIN_ROOT; const { CLAUDE_X } = process.env;',
    "the classifier's default test-directory glob": "const D = ['**/tests/', '**/test/', '*.test.*'];",
    'a glob over the whole tests/ tree': "const D = ['**/tests/**', '**/__tests__/*.js'];",
    'a runner node id example': '// `a.test.js:12` counts by its file part\nconst a = 1;',
    'a whole-env spread': 'const e = { ...process.env, GIT_TERMINAL_PROMPT: "0" };',
    'a write': "process.env.SECRET_KNOB = '1';",
    'a destructuring of a property of the env': 'const { length } = process.env.CLAUDE_PLUGIN_ROOT;',
    'a read in a comment': '// reads process.env.SECRET_KNOB once\nconst a = 1;',
    'the heredoc delimiter in shipped Markdown': null,
    'the heredoc delimiter in shipped code': "const t = 'cat <<\\'SUPERDEV_TEXT_EOF\\'\\nx\\nSUPERDEV_TEXT_EOF';",
    'a string that only names the text': "const stale = t.includes('SUPERDEV_KB_'); const m = `still name SUPERDEV_KB_ variables`;",
    'a read through a passed-in object': 'const v = env.SECRET_KNOB;',
  };
  for (const [label, src] of Object.entries(clean)) {
    if (src === null) {
      assert.deepEqual(scan({ 'plugin/agents/c.md': "cat <<'SUPERDEV_TEXT_EOF'\nx\nSUPERDEV_TEXT_EOF\n" }), [], `${label} is clean`);
      continue;
    }
    assert.deepEqual(scan({ 'plugin/lib/ok.js': src }), [], `${label} is clean`);
  }

  // --- reach ---
  assert.equal(scan({ 'plugin/newmod/sub/dir/rogue.js': 'const v = process.env.SECRET_KNOB;' }).length, 1, 'reads a module directory added later');
  assert.equal(scan({ 'plugin/newmod/rogue.mjs': 'const v = process.env.SECRET_KNOB;' }).length, 1, 'reads .mjs');
  assert.deepEqual(scanTestSeams(fixture({ '.keep': '' })), [], 'an empty tree holds nothing to scan');

  // --- directories are no files ---
  assert.deepEqual(
    scan({ 'tests/fixtures/a.js': '', 'plugin/lib/ok.js': '// loads the test fixtures\nconst a = 1;' }),
    [],
    'a tests/ subdirectory name is no test file name',
  );
  assert.deepEqual(
    scan({ 'plugin/foo.js/inner.txt': '', 'plugin/bar.md/inner.txt': '' }),
    [],
    'a directory named like a scanned file is skipped',
  );
};
