'use strict';

// Suite for plugin/scripts/scope.js's `tier` verb: the execution tier and the simplicity skip, read from the ledger's slice rows.
// The verb only reads, so every case writes its own ledger in one temporary directory.

const { test, after } = require('node:test');
require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { call, cleanup } = require('./scope-setup');
after(() => {
  cleanup();
});

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-tier-')));
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));

const HEAD = ['# Run state', '', '**Stage:** implement', '', '| id | issue | title | type | depends-on | status | range |', '|----|-------|-------|------|------------|--------|-------|'];
let n = 0;
// A run root whose ledger holds the given `[type, status]` rows (a string is one raw row line).
const rootWith = (rows) => {
  const root = path.join(dir, 'run' + n++);
  fs.mkdirSync(root);
  const body = rows.map((r, i) => (typeof r === 'string' ? r : `| ${String(i + 1).padStart(2, '0')} | #${i + 1} | t${i + 1} | ${r[0]} | — | ${r[1] || 'todo'} | — |`));
  fs.writeFileSync(path.join(root, 'ledger.md'), [...HEAD, ...body, ''].join('\n'));
  return root;
};
const tier = (rows) => {
  const root = rootWith(rows);
  const r = call(['tier', '--root', root]);
  assert.ok(r.ok, 'tier should not refuse: ' + r.err);
  return r.out.split('\n');
};
const B = ['behavior'];

test('Up to three behavior rows are lite; four are full', () => {
  assert.deepStrictEqual(tier([B, B, B]).slice(0, 2), ['tier: lite', 'simplicity: dispatch'], '3 behavior rows are lite');
  assert.deepStrictEqual(tier([B, B, B, B]).slice(0, 2), ['tier: full', 'simplicity: skip'], '4 all-behavior rows are full with the skip');
  assert.deepStrictEqual(tier([B]).slice(0, 2), ['tier: lite', 'simplicity: dispatch'], 'one behavior row is lite');
});

test('mechanical and docs rows never count, and a full tier holding one dispatches the simplicity reviewer.', () => {
  assert.deepStrictEqual(tier([B, B, B, ['mechanical'], ['docs']]).slice(0, 2), ['tier: lite', 'simplicity: dispatch'], 'mechanical and docs rows do not count');
  assert.deepStrictEqual(tier([B, B, B, B, ['mechanical']]).slice(0, 2), ['tier: full', 'simplicity: dispatch'], 'a mixed full run does not skip simplicity');
  assert.deepStrictEqual(tier([B, B, B, B, ['docs']]).slice(0, 2), ['tier: full', 'simplicity: dispatch'], 'a docs row blocks the skip');
});

test('Rows of every status count, merged ones included.', () => {
  assert.deepStrictEqual(tier([['behavior', 'merged'], ['behavior', 'merged'], ['behavior', 'done'], ['behavior', 'todo']]).slice(0, 2), ['tier: full', 'simplicity: skip'], 'merged rows count');
});

test('A run of only mechanical and docs rows has 3 or fewer behavior rows: lite.', () => {
  assert.deepStrictEqual(tier([['mechanical'], ['docs']]), ['tier: lite', 'simplicity: dispatch'], 'zero behavior rows is lite');
});

test('unknown: no rows, a malformed row, a type outside the three (case-sensitive), each naming its cause.', () => {
  const none = tier([]);
  assert.deepStrictEqual(none.slice(0, 2), ['tier: unknown', 'simplicity: dispatch'], 'no rows is unknown');
  assert.ok(/no slice rows/.test(none[2]), 'the reason names the absence: ' + none[2]);
});

test('a malformed row is unknown', () => {
  const bad = tier([B, B, B, B, '| 05 | #5 | broken | behavior | — |']);
  assert.deepStrictEqual(bad.slice(0, 2), ['tier: unknown', 'simplicity: dispatch'], 'a malformed row is unknown');
  assert.ok(bad[2].includes('| 05 | #5 | broken | behavior | — |'), 'the reason names the malformed row: ' + bad[2]);
});

test('A test-applicability outside the three, or cased differently, is unknown and named', () => {
  const cased = tier([B, B, B, B, ['Behavior']]);
  assert.deepStrictEqual(cased.slice(0, 2), ['tier: unknown', 'simplicity: dispatch'], '`Behavior` is unknown');
  assert.ok(/05/.test(cased[2]) && cased[2].includes('Behavior'), 'the reason names the row and its type: ' + cased[2]);
  assert.strictEqual(tier([B, B, B, B, ['feature']])[0], 'tier: unknown', 'a type outside the three is unknown');
});

test('Refusals: no --root, a missing ledger.', () => {
  assert.ok(!call(['tier']).ok, 'tier needs --root');
  assert.ok(!call(['tier', '--root', path.join(dir, 'absent')]).ok, 'tier refuses a root with no ledger');
});

test('The verb writes nothing: the run root\'s files are byte-identical after a call.', () => {
  const root = rootWith([B, B]);
  const snap = () => fs.readdirSync(root).map((f) => [f, fs.readFileSync(path.join(root, f), 'utf8')]);
  const before = snap();
  call(['tier', '--root', root]);
  assert.deepStrictEqual(snap(), before, 'tier wrote no file in the run root');
});
