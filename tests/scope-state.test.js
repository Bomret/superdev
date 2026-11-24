'use strict';

// Suite for plugin/scripts/scope.js's `state` verb: every field `get` knows in one read-only call, in text and in
// `--json`, equal to what `get <field>` prints. The shared directory, `call`, and the init payload come from
// tests/scope-setup.js.

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { tmp, call, sliceJson, scopePath, writeDod, scopeRoot } = require('./scope-setup');

const made = [];
after(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

const FIELDS = ['stage', 'step', 'branch', 'anchor', 'docs', 'pr', 'reviewed', 'slices', 'unresolved', 'degraded', 'deferred', 'minors', 'denials', 'suite', 'failed'];
const LISTS = ['slices', 'unresolved', 'degraded', 'deferred', 'minors', 'failed'];

const spawnState = (args, env) => {
  const res = cp.spawnSync(process.execPath, [scopePath, 'state', ...args], { cwd: tmp, encoding: 'utf8', timeout: 30000, env });
  assertSpawnDecided(res, 'state ' + args.join(' '));
  return res;
};

// Every file of the run root, name to bytes.
const snapshot = (root) => Object.fromEntries(fs.readdirSync(root).sort().map((n) => [n, fs.readFileSync(path.join(root, n)).toString('base64')]));

let root, R, ledger, text, at;
test('A run fixture carrying every ledger field initialises', () => {
  writeDod(scopeRoot('state'));
  assert.ok(call(['init', 'feat/state', 'implementing'], sliceJson).ok, 'init');
  root = path.join(tmp, '.superdev', 'scopes', 'state');
  R = ['--root', root];
  for (const a of [
    ['step', 'set', 'review'],
    ['docs', 'set', 'done'],
    ['pr', 'set', '#42'],
    ['unresolved', 'add', 'first, with a comma'],
    ['unresolved', 'add', 'second'],
    ['degraded', 'add', 'pass degraded (2026-08-06)'],
    ['deferred', 'add', 'later thing'],
    ['minors', 'add', '01'],
  ]) {
    const [verb, ...rest] = a;
    assert.ok(call([verb, ...(verb === 'step' ? [...R, ...rest] : [...rest, ...R])]).ok, a.join(' '));
  }
  // `suite set` and `suite failed` need a git repository, so the two header lines are written into the fixture ledger.
  ledger = path.join(root, 'ledger.md');
  text = fs.readFileSync(ledger, 'utf8');
  at = text.indexOf('**Stage:**');
  fs.writeFileSync(ledger, text.slice(0, at) + '**Suite:** green @ abc123 whole\n**Failed:** a.test.js b.test.js @ abc123\n' + text.slice(at));
});

let get;
test('get reads every field on the full fixture, including its suite and failed records', () => {
  get = (f) => call(['get', f, ...R]);
  for (const f of FIELDS) assert.ok(get(f).ok, `get ${f} reads on the full fixture`);
  assert.strictEqual(get('suite').out, 'green abc123 whole', 'the fixture carries a suite record');
  assert.strictEqual(get('failed').out, 'a.test.js b.test.js @ abc123', 'the fixture carries a failed record');
});

const lines = (f) => (get(f).out === '' ? [] : get(f).out.split('\n'));

test('--json: one object, one key per field, list fields arrays, each value what `get` prints.', () => {
  const json = JSON.parse(call(['state', ...R, '--json']).out);
  assert.deepStrictEqual(Object.keys(json), FIELDS, 'one key per field, in get order');
  for (const f of FIELDS) {
    if (f === 'failed') {
      assert.deepStrictEqual(json.failed, ['a.test.js', 'b.test.js'], 'json failed is the array of failed test files, the `@ <sha>` part left to get failed');
    } else if (LISTS.includes(f)) {
      assert.ok(Array.isArray(json[f]), `${f} is an array`);
      assert.deepStrictEqual(json[f], lines(f), `json ${f} equals get ${f}`);
    } else {
      assert.strictEqual(json[f], get(f).out, `json ${f} equals get ${f}`);
    }
  }
  assert.deepStrictEqual(json.unresolved, ['first, with a comma', 'second'], 'a bullet with a comma stays whole');
});

test('text: each field labelled, scalars inline, lists as indented lines under their label.', () => {
  const out = call(['state', ...R]).out.split('\n');
  for (const f of FIELDS) {
    if (LISTS.includes(f)) {
      const i = out.indexOf(`${f}:`);
      assert.ok(i >= 0, `text labels ${f}`);
      lines(f).forEach((l, k) => assert.strictEqual(out[i + 1 + k], `  ${l}`, `text ${f} line ${k} equals get ${f}`));
    } else {
      assert.ok(out.includes(`${f}: ${get(f).out}`), `text ${f} equals get ${f}`);
    }
  }
});

test('An empty list prints its label and nothing under it; an absent header spells the way get does.', () => {
  assert.ok(call(['minors', 'clear', ...R]).ok);
  assert.deepStrictEqual(JSON.parse(call(['state', ...R, '--json']).out).minors, [], 'an empty list is an empty array');
  assert.ok(!call(['state', '--root', path.join(tmp, 'nope')]).ok, 'a root with no ledger is refused');
  assert.ok(!call(['state', ...R, 'extra']).ok, 'an unrecognized argument is refused');
});

test('A ledger with no suite record prints a bare `suite:` label, with no trailing space.', () => {
  const withRecords = fs.readFileSync(ledger, 'utf8');
  fs.writeFileSync(ledger, text);
  assert.ok(call(['state', ...R]).out.split('\n').includes('suite:'), 'no suite record prints a bare label');
  fs.writeFileSync(ledger, withRecords);
});

test('A malformed slice row is named; every other field and row still prints.', () => {
  const bad = fs.readFileSync(ledger, 'utf8').replace('| 02 | #189 | ledger-guard hook | behavior | 01 | todo | — |', '| 02 | #189 | broken row |');
  assert.notStrictEqual(bad, fs.readFileSync(ledger, 'utf8'), 'the fixture row was broken');
  fs.writeFileSync(ledger, bad);
  const broken = JSON.parse(call(['state', ...R, '--json']).out);
  assert.deepStrictEqual(broken.malformed, ['| 02 | #189 | broken row |'], 'the bad row is named');
  assert.strictEqual(broken.slices.length, 1, 'the good row still prints');
  assert.strictEqual(broken.pr, '#42', 'other fields still print');
  assert.deepStrictEqual(broken.unresolved, ['first, with a comma', 'second']);
  assert.match(call(['state', ...R]).out, /malformed slice row: \| 02 \| #189 \| broken row \|/, 'text names the bad row');
  assert.ok(!get('slices').ok, 'get slices still refuses the same ledger');
  fs.writeFileSync(ledger, text.slice(0, at) + '**Suite:** green @ abc123 whole\n**Failed:** a.test.js b.test.js @ abc123\n' + text.slice(at));
});

test('Read-only: the run root is byte-identical afterwards, and no git process starts (a git shim on PATH records each call).', () => {
  const shim = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-state-shim-'));
  made.push(shim);
  const marker = path.join(shim, 'git-called');
  fs.writeFileSync(path.join(shim, 'git'), `#!/bin/sh\necho called >> "${marker}"\nexit 1\n`, { mode: 0o755 });
  const env = { ...process.env, PATH: shim + path.delimiter + process.env.PATH };
  const still = snapshot(root);
  for (const args of [[...R], [...R, '--json']]) {
    const res = spawnState(args, env);
    assert.strictEqual(res.status, 0, 'state exits 0: ' + res.stderr);
    assert.match(res.stdout, /stage"?: "?implementing/, 'the spawned state prints');
  }
  assert.deepStrictEqual(snapshot(root), still, 'state leaves every file of the run root byte-identical');
  assert.ok(!fs.existsSync(marker), 'state spawns no git process');
  fs.rmSync(shim, { recursive: true, force: true });
});

test('help lists state.', () => {
  const help = cp.spawnSync(process.execPath, [scopePath, '--help'], { encoding: 'utf8', timeout: 30000 });
  assertSpawnDecided(help, 'help');
  assert.match(help.stdout, /^ {2}state \[--json\]/m, 'the usage lists state');
  // state's field set is the field set the usage's get line names, and the set get's refusal names.
  const usageFields = help.stdout.match(/^ {2}get (\S+) --root/m)[1].split('|');
  assert.deepStrictEqual(Object.keys(JSON.parse(call(['state', ...R, '--json']).out)), usageFields, 'state reads every field the usage names for get');
  assert.ok(call(['get', 'nope', ...R]).err.includes(`use ${usageFields.join('|')}`), 'get refuses with the same field set');
});
