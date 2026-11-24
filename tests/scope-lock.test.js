'use strict';

// Suite for plugin/scripts/scope.js's `lock` verb (INV-0196, INV-0013): implement's entry liveness verdict from the ledger's
// stage and the run lock's age. The verb only reads, so each case builds its own run root in a temporary directory.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { call } = require('./scope-setup');

const HOUR = 60 * 60 * 1000;
const dirs = [];
process.on('exit', () => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

// A run root at `stage` (null writes no ledger) whose lock was last modified `ageMs` ago (null writes no lock).
function setup({ stage = 'implementing', ageMs = null, content = 'plan abc123\n' }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-lock-'));
  dirs.push(root);
  if (stage !== null) fs.writeFileSync(path.join(root, 'ledger.md'), `# Run state\n\n**Stage:** ${stage}\n`);
  if (ageMs !== null) {
    const lock = path.join(root, 'run.lock');
    fs.writeFileSync(lock, content);
    const t = new Date(Date.now() - ageMs);
    fs.utimesSync(lock, t, t);
  }
  return root;
}
const lock = (root) => call(['lock', '--root', root]);
const ok = (root) => {
  const r = lock(root);
  assert.ok(r.ok, 'lock should not refuse: ' + r.err);
  return r.out;
};

test('proceed: stage planned at any lock age, no lock, a lock over an hour old.', () => {
  assert.strictEqual(ok(setup({ stage: 'planned', ageMs: 1000 })), 'proceed planned', 'planned with a fresh lock');
  assert.strictEqual(ok(setup({ stage: 'planned', ageMs: 5 * HOUR })), 'proceed planned', 'planned with an old lock');
  assert.strictEqual(ok(setup({ stage: 'implementing' })), 'proceed absent', 'no lock');
  assert.strictEqual(ok(setup({ stage: 'implementing', ageMs: 2 * HOUR })), 'proceed stale 120m', 'a two-hour-old lock');
});

test('live: a ten-minute-old lock at implementing prints its age, the stage, and the content on one line.', () => {
  assert.strictEqual(
    ok(setup({ stage: 'implementing', ageMs: 10 * 60 * 1000, content: 'plan abc123\nsecond line\n' })),
    'live 10m implementing plan abc123 second line',
    'a fresh lock at another stage is live'
  );
});

test('The boundary is plan-open\'s: a lock of exactly one hour is stale, and a lock dated in the future is live.', () => {
  assert.strictEqual(ok(setup({ stage: 'implementing', ageMs: HOUR })), 'proceed stale 60m', 'exactly one hour old is stale');
  assert.strictEqual(ok(setup({ stage: 'implementing', ageMs: HOUR - 60 * 1000 })), 'live 59m implementing plan abc123', 'a minute under the bound is live');
  assert.strictEqual(ok(setup({ stage: 'implementing', ageMs: -10 * 60 * 1000 })), 'live -10m implementing plan abc123', 'a future-dated lock reads as fresh');
});

test('A lock that is no regular file is refused with one line naming it.', () => {
  const root = setup({ stage: 'implementing' });
  fs.mkdirSync(path.join(root, 'run.lock'));
  const r = lock(root);
  assert.ok(!r.ok && /run lock .*run\.lock.* a directory/.test(r.err) && !r.err.includes('\n'), 'a directory lock is refused: ' + r.err);
});

test('A symlink lock is refused', () => {
  const root = setup({ stage: 'implementing' });
  fs.writeFileSync(path.join(root, 'target'), 'x');
  fs.symlinkSync(path.join(root, 'target'), path.join(root, 'run.lock'));
  const r = lock(root);
  assert.ok(!r.ok && /symbolic link/.test(r.err) && !r.err.includes('\n'), 'a symlink lock is refused: ' + r.err);
});


test('The refusal holds at stage planned too, as `open` refuses it.', () => {
  const root = setup({ stage: 'planned' });
  fs.mkdirSync(path.join(root, 'run.lock'));
  const r = lock(root);
  assert.ok(!r.ok && /a directory/.test(r.err) && !r.err.includes('\n'), 'a directory lock is refused at planned: ' + r.err);
});

test('A symlink lock is refused at stage planned too', () => {
  const root = setup({ stage: 'planned' });
  fs.writeFileSync(path.join(root, 'target'), 'x');
  fs.symlinkSync(path.join(root, 'target'), path.join(root, 'run.lock'));
  const r = lock(root);
  assert.ok(!r.ok && /symbolic link/.test(r.err) && !r.err.includes('\n'), 'a symlink lock is refused at planned: ' + r.err);
});


test('An unreadable ledger is one `lock:` refusal line.', () => {
  const root = setup({ stage: null });
  fs.mkdirSync(path.join(root, 'ledger.md'));
  const r = lock(root);
  assert.ok(!r.ok && /^lock: cannot read the ledger/.test(r.err.trim()) && !r.err.trim().includes('\n'), 'an unreadable ledger is refused: ' + r.err);
});

test('An empty lock prints no trailing space.', () => {
  assert.strictEqual(ok(setup({ stage: 'implementing', ageMs: 10 * 60 * 1000, content: '' })), 'live 10m implementing', 'an empty lock leaves no trailing space');
});

test('A root that is no directory, and a leftover argument, are refused.', () => {
  assert.ok(!call(['lock', '--root', path.join(os.tmpdir(), 'scope-lock-no-such-dir')]).ok, 'a missing root is refused');
  assert.ok(!call(['lock', '--root', setup({}), 'extra']).ok, 'a leftover argument is refused');
});

test('The verb leaves the lock\'s mtime and content as they were.', () => {
  const root = setup({ stage: 'implementing', ageMs: 10 * 60 * 1000 });
  const p = path.join(root, 'run.lock');
  const before = fs.statSync(p).mtimeMs;
  ok(root);
  assert.strictEqual(fs.statSync(p).mtimeMs, before, 'mtime unchanged');
  assert.strictEqual(fs.readFileSync(p, 'utf8'), 'plan abc123\n', 'content unchanged');
  assert.ok(!fs.existsSync(path.join(root, 'trace.log')), 'no trace line written');
});

