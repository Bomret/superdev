'use strict';

// Suite for plugin/scripts/scope.js's `windows` verb and the `--window` filter of `trace` (ADR 0261): a slice's implementer
// windows derived from the run trace's recorded order. The traces are written as raw lines, so a case controls every
// timestamp; the suite runs in a temporary directory of its own.

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { call, cleanup } = require('./scope-setup');
after(() => {
  cleanup();
});

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-windows-')));
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));

// A run root holding a ledger and exactly `lines` as its trace.
const runOf = (name, lines) => {
  const root = path.join(dir, name, '.superdev', 'scopes', 'demo');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'ledger.md'), '# Ledger — demo\n');
  fs.writeFileSync(path.join(root, 'trace.log'), lines.length ? lines.join('\n') + '\n' : '');
  return root;
};
const t = (n) => `2026-11-19T10:00:${String(n).padStart(2, '0')}.000Z`;
const files = (root) => Object.fromEntries(fs.readdirSync(root).map((f) => [f, fs.readFileSync(path.join(root, f), 'utf8')]));

// One slice's trace: a build run, a reviewer, a resumed implementer run with out-of-order times, a reviewer resume, and a fix
// dispatch left open. Another slice's dispatch sits inside the first run.
const L = [
  `${t(1)} 01 main ledger slice 01 in-progress`,
  `${t(2)} 01 main dispatch superdev:implementer tu1 build -`,
  `${t(3)} 01 a1 edit impl a.js`,
  `${t(4)} 01 main dispatch-end superdev:implementer tu1 completed`,
  `${t(5)} 01 main edit impl late.js`,
  `${t(6)} 02 main dispatch superdev:implementer tu9 other -`,
  `${t(7)} 01 main dispatch superdev:slice-reviewer tr1 review -`,
  `${t(8)} 01 main dispatch-end superdev:slice-reviewer tr1 completed`,
  `${t(9)} 01 main dispatch-resume tu1 a1 - sm1`,
  `${t(9)} 01 a1 edit impl b.js`,
  `${t(8)} 01 main dispatch-end superdev:implementer tu1 session-end`,
  `${t(7)} 01 main dispatch-resume tr1 r1 - sm2`,
  `${t(12)} 01 main dispatch implementer tu2 fix -`,
  `${t(13)} 01 a2 edit impl c.js`,
];

test('#windows: one line per run, in recorded order; a run ends at the first boundary of its own slice after its end.', () => {
  const root = runOf('windows', L);
  const before = files(root);
  const r = call(['windows', '--slice', '01', '--root', root]);
  assert.ok(r.ok, r.err);
  assert.deepEqual(r.out.split('\n'), [
    `tu1 01 ${t(2)} ${t(7)}`,
    `tu1 01 ${t(9)} ${t(7)}`,
    `tu2 01 ${t(12)} open`,
  ], 'a resumed dispatch prints one line per run, another slice\'s dispatch cuts nothing, a reviewer resume ends a run, and an open run prints open');
  assert.deepEqual(files(root), before, 'windows changes no file of the run root');
});

test('#trace-window: `trace --window` prints exactly the lines the listing assigns to that dispatch, by file position.', () => {
  const root = runOf('trace-window', L);
  const r = call(['trace', '--window', 'tu1', '--root', root]);
  assert.ok(r.ok, r.err);
  assert.deepEqual(r.out.split('\n'), [L[1], L[2], L[3], L[4], L[8], L[9], L[10]],
    'every line of slice 01 inside either run of tu1, byte-identical, the out-of-order times placed by position');
  const s = call(['trace', '--slice', '01', '--window', 'tu2', '--root', root]);
  assert.ok(s.ok, s.err);
  assert.deepEqual(s.out.split('\n'), [L[12], L[13]], 'an open run runs to the trace\'s end');
  const other = call(['trace', '--slice', '02', '--window', 'tu1', '--root', root]);
  assert.ok(!other.ok && /trace: --window tu1/.test(other.err) && /01/.test(other.err), 'a window of another slice is refused by name, naming the verb');
  const unknown = call(['trace', '--window', 'tr1', '--root', root]);
  assert.ok(!unknown.ok && /trace: --window tr1/.test(unknown.err), 'a reviewer dispatch names no window, and is refused by name, naming the verb');
});

test('#ends: a session-end, stopped, or missing end still closes a run at the next boundary; a dispatch-end with no outcome reads completed; the scope\'s fix cycles list like a slice\'s windows.', () => {
  const root = runOf('ends', [
    `${t(1)} scope main dispatch superdev:implementer f1 fix -`,
    `${t(2)} scope main dispatch-end superdev:implementer f1 stopped`,
    `${t(3)} scope main dispatch superdev:final-reviewer v1 review -`,
    `${t(4)} scope main dispatch superdev:implementer f2 fix -`,
    `${t(5)} scope main dispatch superdev:final-reviewer v2 review -`,
    `${t(6)} scope main dispatch superdev:implementer f3 fix -`,
    `${t(7)} scope main dispatch-end superdev:implementer f3`,
    `${t(8)} scope main edit impl x.js`,
    `${t(9)} scope main dispatch superdev:final-reviewer v3 review`,
  ]);
  const r = call(['windows', '--slice', 'scope', '--root', root]);
  assert.ok(r.ok, r.err);
  assert.deepEqual(r.out.split('\n'), [
    `f1 scope ${t(1)} ${t(3)}`,
    `f2 scope ${t(4)} ${t(5)}`,
    `f3 scope ${t(6)} ${t(9)}`,
  ], 'a stopped end, a missing end, and an end with no outcome each close at the next boundary, and an older dispatch line with no session field reads');
});

test('#readers: a resume or a fresh dispatch of a plan-time or brainstorm-time reader ends no run, where a slice-reviewer\'s resume or dispatch at the same place does: neither reader bounds a window.', () => {
  const lines = (reader) => [
    `${t(1)} 02 main dispatch ${reader} x1 read -`,
    `${t(2)} 02 main dispatch-end ${reader} x1 completed`,
    `${t(3)} 01 main dispatch superdev:implementer tu1 build -`,
    `${t(4)} 01 main dispatch-end superdev:implementer tu1 completed`,
    `${t(5)} 01 main dispatch-resume x1 a9 - sm1`,
  ];
  const windows = (reader) => {
    const r = call(['windows', '--slice', '01', '--root', runOf(`readers-${reader.replace(':', '-')}`, lines(reader))]);
    assert.ok(r.ok, r.err);
    return r.out;
  };
  assert.strictEqual(windows('superdev:slice-reviewer'), `tu1 01 ${t(3)} ${t(5)}`, 'control: a reviewer resume ends the run');
  for (const reader of ['superdev:slice-readiness-reviewer', 'superdev:intent-challenger']) {
    assert.strictEqual(windows(reader), `tu1 01 ${t(3)} open`, `a ${reader} resume ends no run`);
  }
  const fresh = (reader) => {
    const r = call(['windows', '--slice', '01', '--root', runOf(`readers-fresh-${reader.replace(':', '-')}`, [
      `${t(1)} 01 main dispatch superdev:implementer tu1 build -`,
      `${t(2)} 01 main dispatch-end superdev:implementer tu1 completed`,
      `${t(3)} 01 main dispatch ${reader} x1 read -`,
    ])]);
    assert.ok(r.ok, r.err);
    return r.out;
  };
  assert.strictEqual(fresh('superdev:slice-reviewer'), `tu1 01 ${t(1)} ${t(3)}`, 'control: a reviewer dispatch ends the run');
  for (const reader of ['superdev:slice-readiness-reviewer', 'superdev:intent-challenger', 'slice-readiness-reviewer', 'intent-challenger']) {
    assert.strictEqual(fresh(reader), `tu1 01 ${t(1)} open`, `a fresh ${reader} dispatch ends no run`);
  }
});

test('#none: a lite slice, with no implementer dispatch, says it has no window; refusals name their flag.', () => {
  const root = runOf('none', [
    `${t(1)} 03 main ledger slice 03 in-progress`,
    `${t(2)} 03 main edit impl lib.js`,
  ]);
  const r = call(['windows', '--slice', '03', '--root', root]);
  assert.ok(r.ok, r.err);
  assert.match(r.out, /^no window: slice 03 has no implementer dispatch$/, 'a lite slice prints that it has no implementer window');
  assert.ok(!call(['windows', '--root', root]).ok, 'windows needs --slice');
  const noValue = call(['windows', '--slice', '--root', root]);
  assert.ok(!noValue.ok && /--slice/.test(noValue.err), 'a --slice value starting with -- is refused naming --slice');
  const stray = call(['windows', '--slice', '03', 'extra', '--root', root]);
  assert.ok(!stray.ok && /extra/.test(stray.err), 'an unrecognized argument is refused');
  const noLedger = path.join(dir, 'no-such-run');
  const wrongRoot = call(['windows', '--slice', '03', '--root', noLedger]);
  assert.ok(!wrongRoot.ok && wrongRoot.err === `windows: "${noLedger}" holds no ledger.md, so it is no run root`,
    `a root with no ledger is refused by name, never read as a lite slice: ${wrongRoot.err || wrongRoot.out}`);
});

