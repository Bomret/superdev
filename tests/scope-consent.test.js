'use strict';

// Suite for plugin/scripts/scope.js's `consent` verb (ADR 0268): the operator's carried merge consent, read from a run root's
// trace.log and its digest sidecar. The verb only reads, so every case writes its own run root in one temporary directory and
// checks that the root holds the same files and bytes afterwards.

const { test, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { call, scopePath, cleanup } = require('./scope-setup');
after(() => {
  cleanup();
});
const { assertSpawnDecided } = require('./spawn-verdict');

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-consent-')));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

// One ledger trace line per step event, in the layout `lib/trace-log.js` writes.
const line = (fields) => fields === 'tamper-trace'
  ? '2026-11-20T12:00:00.000Z scope main tamper trace.log\n'
  : `2026-11-20T12:00:00.000Z scope main ledger ${fields}\n`;
const SUBMIT = ['step set submit', 'step clear'];
const SHIP_BLOCKED = ['step set ship', 'step block ship'];

let n = 0;
// A run root holding a ledger, and a trace of the given step events sealed by a matching digest. `trace: null` writes no trace;
// `digest: 'wrong'` seals the trace with another file's digest.
const rootWith = (events, { trace = true, digest = 'match' } = {}) => {
  const root = path.join(dir, 'run' + n++);
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, 'ledger.md'), '# Ledger\n\n**Stage:** submitted\n');
  if (!trace) return root;
  const bytes = Buffer.from(events.map(line).join(''), 'utf8');
  fs.writeFileSync(path.join(root, 'trace.log'), bytes);
  const sealed = digest === 'match' ? bytes : Buffer.concat([bytes, Buffer.from('x')]);
  const state = { size: sealed.length, sha256: crypto.createHash('sha256').update(sealed).digest('hex') };
  fs.writeFileSync(path.join(root, 'digest.json'), JSON.stringify({ trace: state }) + '\n');
  return root;
};
// Every file of a root, with its bytes, so a case can show the verb wrote nothing.
const snapshot = (root) => Object.fromEntries(fs.readdirSync(root).sort().map((f) => [f, fs.readFileSync(path.join(root, f), 'hex')]));
const verdict = (root) => {
  const before = snapshot(root);
  const r = call(['consent', '--root', root]);
  assert.ok(r.ok, `consent should not refuse: ${r.err}`);
  assert.deepStrictEqual(snapshot(root), before, 'consent writes no file in the run root');
  return r.out;
};

test('Carried: the latest ship step after the last submit step ended in a block naming ship.', () => {
  assert.strictEqual(verdict(rootWith([...SUBMIT, ...SHIP_BLOCKED])), 'carried', 'a ship blocked after the last submit carries');
  assert.strictEqual(verdict(rootWith([...SUBMIT, ...SHIP_BLOCKED, 'step set review', 'step clear', 'step set document', 'step clear'])),
    'carried', 'the clean exits of review and document keep the consent');
  assert.strictEqual(verdict(rootWith([...SUBMIT, ...SHIP_BLOCKED, 'step set review', 'stage set documented', 'step clear'])),
    'carried', 'a step clear a stage move writes keeps the consent');
});

test('None: no trace at all, an empty trace, and a trace with no submit step.', () => {
  assert.strictEqual(verdict(rootWith([], { trace: false })), 'none', 'no trace carries nothing');
  assert.strictEqual(verdict(rootWith([])), 'none', 'an empty trace carries nothing');
  assert.strictEqual(verdict(rootWith(SHIP_BLOCKED)), 'none', 'a trace with no submit step carries nothing');
});

test('None: the block came before the last submit, or a later ship step ended another way.', () => {
  assert.strictEqual(verdict(rootWith([...SUBMIT, ...SHIP_BLOCKED, ...SUBMIT])), 'none', 'a block before the last submit carries nothing');
  assert.strictEqual(verdict(rootWith([...SUBMIT, ...SHIP_BLOCKED, 'step set ship', 'step clear'])), 'none',
    'a later ship that ended in step clear withdraws the consent');
  assert.strictEqual(verdict(rootWith([...SUBMIT, ...SHIP_BLOCKED, 'step set ship', 'step set review'])), 'none',
    'a later ship replaced by another step set with no block withdraws the consent');
});

test('None: a block that names no ship step.', () => {
  assert.strictEqual(verdict(rootWith([...SUBMIT, 'step set review', 'step block review'])), 'none', 'a block naming another step is no consent');
  assert.strictEqual(verdict(rootWith([...SUBMIT, 'step set ship', 'step block'])), 'none', 'a nameless block is no consent');
});

test('None: a trace that differs from its digest sidecar.', () => {
  assert.strictEqual(verdict(rootWith([...SUBMIT, ...SHIP_BLOCKED], { digest: 'wrong' })), 'none', 'a trace that differs from its digest carries nothing');
});

// The hand append is followed by one writing call, whose digest check records a `tamper trace.log` line and seals the
// trace again; that line after the last submit step withdraws the consent.
test('None: a forged trace a writing verb re-sealed.', () => {
  const root = rootWith(SUBMIT);
  fs.appendFileSync(path.join(root, 'trace.log'), [...SUBMIT, ...SHIP_BLOCKED].map(line).join(''));
  const r = call(['step', 'clear', '--root', root]);
  assert.ok(r.ok, `step clear should not refuse: ${r.err}`);
  assert.strictEqual(verdict(root), 'none', 'a tamper line naming trace.log after the last submit carries nothing');
});

test('Carried: a tamper line before the last submit step leaves the consent read after it.', () => {
  assert.strictEqual(verdict(rootWith(['tamper-trace', ...SUBMIT, ...SHIP_BLOCKED])), 'carried', 'a tamper line before the last submit leaves the consent');
});

test('Refusals: a missing --root, a non-directory --root, and an extra argument each exit 1.', () => {
  const refused = (argv) => {
    const r = call(argv);
    assert.ok(!r.ok, `${argv.join(' ')} should refuse`);
    assert.strictEqual(r.exitCode || 1, 1, `${argv.join(' ')} exits 1`);
  };
  refused(['consent']);
  const file = path.join(dir, 'not-a-dir');
  fs.writeFileSync(file, '');
  refused(['consent', '--root', file]);
  refused(['consent', '--root', path.join(dir, 'absent')]);
  refused(['consent', 'extra', '--root', rootWith([...SUBMIT, ...SHIP_BLOCKED])]);
});

test('`scope.js --help` lists the verb.', () => {
  const help = cp.spawnSync(process.execPath, [scopePath, '--help'], { cwd: dir, encoding: 'utf8', timeout: 30000 });
  assertSpawnDecided(help, 'scope.js --help');
  assert.ok(/^\s+consent --root <run-root>/m.test(help.stdout), 'scope.js --help lists consent: ' + help.stdout);
});

