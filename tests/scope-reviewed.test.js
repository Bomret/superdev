'use strict';

// Suite for plugin/scripts/scope.js's reviewed-tip verbs (ADR 0273, INV-0201): `reviewed set`, `reviewed clear`, and
// `get reviewed`, the ledger's `**Reviewed:**` record of the scope tip a clean scope review judged beside a digest of
// `dod.md`'s criterion texts and tags. The git repository is built once and copied per case.

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { copyFixture, templateOnce } = require('./fixture-git');
const { call, sliceJson } = require('./scope-setup');

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' }).trim();

// A repository on `feat/demo` with two commits, and a live run root at `implementing` whose dod.md holds two criteria.
const template = templateOnce((dir) => {
  git(dir, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'a.txt'), '1\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'one');
  git(dir, 'switch', '-q', '-c', 'feat/demo');
  fs.writeFileSync(path.join(dir, 'a.txt'), '2\n');
  git(dir, 'commit', '-q', '-am', 'two');
  const root = path.join(dir, '.superdev', 'scopes', 'demo');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'dod.md'), '## Definition of Done\n\n- [ ] The first thing holds — #1\n- [ ] The second thing holds — scope\n');
  assert.ok(call(['init', 'feat/demo', 'implementing'], sliceJson, dir).ok, 'fixture init');
}, 'scope-reviewed-');

const made = [];
after(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

const fresh = () => {
  const repo = copyFixture(template(), 'scope-reviewed-case-');
  made.push(repo);
  const root = path.join(repo, '.superdev', 'scopes', 'demo');
  return { repo, root, R: ['--root', root], at: (cwdArgs) => call(cwdArgs, '', repo) };
};

test('reviewed set records the branch tip and the digest; get reviewed reads both back', () => {
  const { repo, R, at } = fresh();
  const tip = git(repo, 'rev-parse', 'feat/demo');
  const r = at(['reviewed', 'set', '--branch', 'feat/demo', ...R]);
  assert.ok(r.ok, 'reviewed set: ' + r.err);
  const got = at(['get', 'reviewed', ...R]).out.split(' ');
  assert.strictEqual(got.length, 2, 'get reviewed prints <sha> <digest>: ' + got.join(' '));
  assert.strictEqual(got[0], tip, 'the recorded sha is the full branch tip');
  assert.match(got[1], /^[0-9a-f]{64}$/, 'the digest is a hex hash');
});

const ledgerOf = (root) => fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');
const traceOf = (root) => fs.readFileSync(path.join(root, 'trace.log'), 'utf8');
const digestOf = (at, R) => at(['get', 'reviewed', ...R]).out.split(' ')[1];

test('reviewed set --tip records that ancestor\'s full sha', () => {
  const { repo, R, at } = fresh();
  const parent = git(repo, 'rev-parse', 'feat/demo~1');
  assert.ok(at(['reviewed', 'set', '--branch', 'feat/demo', '--tip', 'feat/demo~1', ...R]).ok, 'reviewed set --tip <ancestor>');
  assert.strictEqual(at(['get', 'reviewed', ...R]).out.split(' ')[0], parent, 'the recorded sha is the ancestor\'s full sha');
});

test('every refusal names one reason and writes nothing', () => {
  const cases = [
    ['dod.md missing', (f) => fs.rmSync(path.join(f.root, 'dod.md')), [], /dod\.md is missing or unreadable/],
    ['dod.md unreadable', (f) => { fs.rmSync(path.join(f.root, 'dod.md')); fs.mkdirSync(path.join(f.root, 'dod.md')); }, [], /dod\.md is missing or unreadable/],
    ['dod.md with no criterion', (f) => fs.writeFileSync(path.join(f.root, 'dod.md'), '## Definition of Done\n\nnothing yet\n'), [], /holds no criterion/],
    ['an unresolved branch', () => {}, ['--branch', 'feat/nope'], /branch "feat\/nope" does not resolve/],
    ['an unresolved --tip', () => {}, ['--tip', 'deadbeef'], /--tip "deadbeef" does not resolve/],
    ['a --tip that is no ancestor', (f) => {
      git(f.repo, 'switch', '-q', '-c', 'side', 'main');
      fs.writeFileSync(path.join(f.repo, 'b.txt'), 'b\n');
      git(f.repo, 'add', 'b.txt');
      git(f.repo, 'commit', '-q', '-m', 'side');
      git(f.repo, 'switch', '-q', 'feat/demo');
    }, ['--tip', 'side'], /--tip "side" is no ancestor/],
  ];
  for (const [name, arrange, extra, why] of cases) {
    const f = fresh();
    arrange(f);
    const args = extra.includes('--branch') ? extra : ['--branch', 'feat/demo', ...extra];
    const before = ledgerOf(f.root);
    const traceBefore = traceOf(f.root);
    const r = f.at(['reviewed', 'set', ...args, ...f.R]);
    assert.ok(!r.ok, `${name}: refused`);
    assert.match(r.err, why, `${name}: ${r.err}`);
    assert.strictEqual(r.err.split('\n').length, 1, `${name}: one reason line`);
    assert.strictEqual(ledgerOf(f.root), before, `${name}: the ledger is unchanged`);
    assert.strictEqual(traceOf(f.root), traceBefore, `${name}: no trace event`);
  }
});

test('reviewed clear removes the header; an absent header is no error and writes nothing', () => {
  const { root, R, at } = fresh();
  assert.ok(at(['reviewed', 'set', '--branch', 'feat/demo', ...R]).ok, 'set before clear');
  assert.ok(at(['reviewed', 'clear', ...R]).ok, 'reviewed clear');
  assert.strictEqual(at(['get', 'reviewed', ...R]).out, 'absent', 'cleared');
  assert.doesNotMatch(ledgerOf(root), /\*\*Reviewed:\*\*/, 'no header line left');
  const before = ledgerOf(root);
  const traceBefore = traceOf(root);
  assert.ok(at(['reviewed', 'clear', ...R]).ok, 'clearing an absent header succeeds');
  assert.strictEqual(ledgerOf(root), before, 'clearing an absent header leaves the ledger unchanged');
  assert.strictEqual(traceOf(root), traceBefore, 'clearing an absent header writes no trace event');
});

test('the digest ignores ticks, notes, and line endings, and follows every criterion change', () => {
  const base = '## Definition of Done\n\n- [ ] The first thing holds — #1\n- [ ] The second thing holds — scope\n- [ ] A third, untagged\n';
  const variants = {
    tick: '## Definition of Done\n\n- [x] The first thing holds — #1 — met: seen in the suite\n- [ ] The second thing holds — scope\n- [ ] A third, untagged\n',
    untick: '## Definition of Done\n\n- [ ] The first thing holds — #1 — not met: still red\n- [ ] The second thing holds — scope\n- [ ] A third, untagged\n',
    renote: '## Definition of Done\n\n- [ ] The first thing holds — #1 — ceiling: a different note — #2 — met: quoted\n- [ ] The second thing holds — scope\n- [x] A third, untagged — met: yes\n',
    crlf: base.replace(/\n/g, '\r\n'),
  };
  const changes = {
    added: base + '- [ ] A fourth\n',
    removed: '## Definition of Done\n\n- [ ] The first thing holds — #1\n- [ ] A third, untagged\n',
    reworded: base.replace('first thing', 'first item'),
    retagged: base.replace('— #1', '— #2'),
    reordered: '## Definition of Done\n\n- [ ] The second thing holds — scope\n- [ ] The first thing holds — #1\n- [ ] A third, untagged\n',
  };
  const f = fresh();
  const digestWith = (text) => {
    fs.writeFileSync(path.join(f.root, 'dod.md'), text);
    assert.ok(f.at(['reviewed', 'set', '--branch', 'feat/demo', ...f.R]).ok, 'reviewed set');
    return digestOf(f.at, f.R);
  };
  const d0 = digestWith(base);
  for (const [name, text] of Object.entries(variants)) assert.strictEqual(digestWith(text), d0, `a ${name} leaves the digest unchanged`);
  for (const [name, text] of Object.entries(changes)) assert.notStrictEqual(digestWith(text), d0, `a ${name} criterion changes the digest`);
});

test('a ledger without the header reads absent, and set inserts it without disturbing the other headers', () => {
  const { root, R, at } = fresh();
  assert.ok(at(['pr', 'set', '7', ...R]).ok, 'a header past the others');
  assert.strictEqual(at(['get', 'reviewed', ...R]).out, 'absent', 'an earlier release\'s ledger reads absent');
  const before = ledgerOf(root).split('\n');
  assert.ok(at(['reviewed', 'set', '--branch', 'feat/demo', ...R]).ok, 'reviewed set on that ledger');
  const after = ledgerOf(root).split('\n');
  const i = after.findIndex((l) => l.startsWith('**Reviewed:** '));
  assert.ok(i > after.findIndex((l) => l.startsWith('**PR:** ')), 'Reviewed lands after the last appended header');
  assert.deepStrictEqual(after.filter((_, k) => k !== i), before, 'every other line stays as it was');
});

test('both writes check the run digest first and trace the change they make', () => {
  const { root, R, at } = fresh();
  fs.appendFileSync(path.join(root, 'ledger.md'), '\nan outside edit\n');
  const origErr = process.stderr.write;
  process.stderr.write = () => true;
  try {
    assert.ok(at(['reviewed', 'set', '--branch', 'feat/demo', ...R]).ok, 'reviewed set after an outside edit');
  } finally {
    process.stderr.write = origErr;
  }
  const [sha, digest] = at(['get', 'reviewed', ...R]).out.split(' ');
  const lines = traceOf(root).trim().split('\n');
  const tamper = lines.findIndex((l) => / tamper ledger\.md$/.test(l));
  const set = lines.findIndex((l) => l.endsWith(` ledger reviewed set ${sha} ${digest}`));
  assert.ok(tamper >= 0 && set > tamper, 'the digest check reports the outside edit before reviewed set writes: ' + lines.slice(-3).join(' | '));
  const count = lines.length;
  assert.ok(at(['reviewed', 'set', '--branch', 'feat/demo', ...R]).ok, 'the same record again');
  assert.strictEqual(traceOf(root).trim().split('\n').length, count, 'a set that changes nothing writes no trace event');
  assert.ok(at(['reviewed', 'clear', ...R]).ok, 'reviewed clear');
  assert.match(traceOf(root).trim().split('\n').pop(), / ledger reviewed clear$/, 'reviewed clear traces its write');
});

test('the run-status pane\'s fixtures hold what scope.js writes (INV-0144) mods/superdev-view/hooks/ledger-fixtures.ts and trace-fixtures.ts carry the record with a placeholder sha and digest; the pins put this run\'s own sha and digest in their place and compare every line.', () => {
  const hooks = path.join(__dirname, '..', 'mods', 'superdev-view', 'hooks');
  const between = (file, marker) => {
    const src = fs.readFileSync(path.join(hooks, file), 'utf8');
    const open = `/* ${marker}:start */`;
    return JSON.parse(src.slice(src.indexOf(open) + open.length, src.indexOf(`/* ${marker}:end */`)));
  };
  const PLACEHOLDER = /0123456789abcdef0123456789abcdef01234567 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef/;
  const { repo } = fresh();
  const root = path.join(repo, '.superdev', 'scopes', 'view');
  const origLog = console.log;
  console.log = () => {};
  try {
    assert.ok(call(['init', 'feat/view', 'planned'], JSON.stringify({ anchor: '#9 — Show the pane', slices: [{ id: '01', issue: '#10', title: 'Draw the tiles', type: 'behavior', 'depends-on': '—' }] }), repo).ok, 'init view');
    fs.writeFileSync(path.join(root, 'dod.md'), '- [ ] The pane draws\n');
    for (const argv of [['stage', 'set', 'merged'], ['slice', '01', 'merged', '--range', 'a1b2c3d..e4f5a6b'], ['step', 'set', 'review'], ['reviewed', 'set', '--branch', 'feat/demo']]) {
      assert.ok(call([...argv, '--root', root], '', repo).ok, argv.join(' '));
    }
  } finally {
    console.log = origLog;
  }
  const rec = call(['get', 'reviewed', '--root', root], '', repo).out;
  const fill = (lines) => lines.map((l) => l.replace(PLACEHOLDER, rec));
  assert.deepStrictEqual(fs.readFileSync(path.join(root, 'ledger.md'), 'utf8').split('\n'), fill(between('ledger-fixtures.ts', 'ledger-reviewed')),
    'scope.js writes the ledger with a reviewed-tip record that superdev-view parses');
  assert.ok(call(['reviewed', 'clear', '--root', root], '', repo).ok, 'reviewed clear');
  const traced = traceOf(root).trim().split('\n').slice(-2).map((l) => l.replace(/^\S+ /, ''));
  assert.deepStrictEqual(traced, fill(between('trace-fixtures.ts', 'trace-reviewed')), 'scope.js traces the record\'s writes as superdev-view\'s fixture holds them');
});
