'use strict';

// Suite for scripts/run-tests.js, the maintainer-only runner behind `bun run test`. Every case builds a
// throwaway tree under the OS temp dir, so the runner is exercised on suites this repository does not
// carry.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { discoverSuites, runAll } = require('../scripts/run-tests');

const realTests = path.join(__dirname);

const made = [];

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-tests-'));
  made.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

// A suite that appends its own name to <root>/log, then exits with `code`.
const suite = (name, code = 0) =>
  `require('node:fs').appendFileSync(require('node:path').join(__dirname, '..', 'log'), '${name}\\n');` +
  `process.exit(${code});`;

const logOf = (root) => (fs.existsSync(path.join(root, 'log')) ? fs.readFileSync(path.join(root, 'log'), 'utf8') : '');

const tailEntry = (root, name, code = 0) => [
  process.execPath,
  [
    '-e',
    `require('node:fs').appendFileSync(${JSON.stringify(path.join(root, 'log'))}, '${name}\\n');process.exit(${code});`,
  ],
];

function go(root, tail) {
  const lines = [];
  const status = runAll({ root, tail, out: (line) => lines.push(line) });
  return { status, out: lines.join('\n') };
}

// A suite added at tests/<name>.test.js is found, a helper and a fixtures directory are not.
{
  const root = tree({
    'tests/b.test.js': '',
    'tests/a.test.js': '',
    'tests/helper.js': '',
    'tests/fixtures/x.test.js': '',
    'tests/sub/y.test.js': '',
  });
  const found = discoverSuites(path.join(root, 'tests')).map((f) => path.basename(f));
  assert.deepStrictEqual(found, ['a.test.js', 'b.test.js'], 'suites only, in a stable order');
  fs.writeFileSync(path.join(root, 'tests', 'c.test.js'), '');
  assert.deepStrictEqual(
    discoverSuites(path.join(root, 'tests')).map((f) => path.basename(f)),
    ['a.test.js', 'b.test.js', 'c.test.js'],
    'a suite added to the tree is picked up with no other edit',
  );
}

// An absent or empty tests/ directory finds no suite, and the runner says so and exits nonzero.
{
  const absent = tree({});
  assert.deepStrictEqual(discoverSuites(path.join(absent, 'tests')), []);
  const r = go(absent, []);
  assert.notStrictEqual(r.status, 0, 'no suite is a failure, never a silent pass');
  assert.match(r.out, /no suite/i);
  const empty = tree({ 'tests/helper.js': '' });
  assert.notStrictEqual(go(empty, []).status, 0);
}

// Suites run in order, then the tail; the same tree gives the same order twice.
{
  const root = tree({ 'tests/b.test.js': suite('b'), 'tests/a.test.js': suite('a') });
  const first = go(root, [tailEntry(root, 'tail1'), tailEntry(root, 'tail2')]);
  assert.strictEqual(first.status, 0);
  assert.strictEqual(logOf(root), 'a\nb\ntail1\ntail2\n', 'suites first, then the tail, in order');
  fs.rmSync(path.join(root, 'log'));
  go(root, [tailEntry(root, 'tail1'), tailEntry(root, 'tail2')]);
  assert.strictEqual(logOf(root), 'a\nb\ntail1\ntail2\n', 'the same tree runs in the same order');
}

// A failing suite stops the run, names itself, exits nonzero, and runs nothing after it.
{
  const root = tree({
    'tests/a.test.js': suite('a'),
    'tests/b.test.js': suite('b', 3),
    'tests/c.test.js': suite('c'),
  });
  const r = go(root, [tailEntry(root, 'tail')]);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.out, /b\.test\.js/, 'the failure names the suite');
  assert.strictEqual(logOf(root), 'a\nb\n', 'nothing runs after the failing suite, the tail included');
}

// A failing tail command stops the run, names itself, exits nonzero, and runs nothing after it.
{
  const root = tree({ 'tests/a.test.js': suite('a') });
  const r = go(root, [tailEntry(root, 'tail1', 1), tailEntry(root, 'tail2')]);
  assert.notStrictEqual(r.status, 0);
  assert.strictEqual(logOf(root), 'a\ntail1\n');
  assert.match(r.out, /tail/i);
}

// A command that never started reads as a failure, not a pass (INV-0009).
{
  const root = tree({ 'tests/a.test.js': suite('a') });
  const r = go(root, [['/nonexistent/binary-for-run-tests', []]]);
  assert.notStrictEqual(r.status, 0, 'a tail command that cannot start fails the run');
}

// This repository's own roster still carries every suite the hand-written chain listed.
{
  const chained = [
    'spawn-verdict', 'merge-guard', 'run-lock', 'model-explicit', 'green-gate', 'update-check',
    'slicetree-sweep', 'scope-prune', 'ledger-guard', 'scope', 'kb-patch', 'publish-kb',
    'md-to-storage', 'profile', 'invariant-check',
  ];
  const found = discoverSuites(realTests).map((f) => path.basename(f));
  for (const name of chained) assert.ok(found.includes(`${name}.test.js`), `${name}.test.js is discovered`);
  assert.ok(!found.includes('spawn-verdict.js'), 'the shared helper is not a suite');
  assert.ok(!found.includes('fixture-git.js'), 'the shared helper is not a suite');
}

for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });

console.log('run-tests.test.js ok');
