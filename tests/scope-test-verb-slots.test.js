'use strict';

// Fixture repositories commit regardless of the maintainer's global git config.
const { test, after } = require('node:test');
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `test` verb and its Test slot (plugin/lib/test-slots.js, ADR 0291, INV-0212): runs from
// two checkouts of one repository share the repository's pool and never overlap past its count, two repositories never wait on
// each other, a dead or rebooted holder's slot is reclaimed, a command that outlives its verb keeps its slot until its group is
// empty, a waiter says once what it waits on and ends at once on SIGINT, a refusal never waits, and the wait reaches no field
// of the run line. Each case drives `scope.js test path <file> -- sh <script>` with a script of its own.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { testVerbFixture, scopePath } = require('./scope-setup');

const one = testVerbFixture();
const two = testVerbFixture();
const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-test-slots-outside-')));
after(() => {
  one.end();
  two.end();
  fs.rmSync(outside, { recursive: true, force: true });
});

const FILE = 'services/x/tests/a.bats';
for (const f of [one, two]) {
  f.verif('true', 'true');
  fs.appendFileSync(path.join(f.S, '.git', 'info', 'exclude'), '.superdev/\n');
}
const W = path.join(one.D, 'wt');
one.sh(one.S, ['worktree', 'add', '-q', '--detach', W]);
const pool = path.join(one.S, '.git', 'superdev-test-slots');
const bootStamp = () => Date.now() - os.uptime() * 1000;

let n = 0;
// A fresh case directory K, an empty pool and trace, and the operator configuration `info` (none when undefined).
function fresh(info) {
  const K = path.join(one.D, `k${++n}`);
  fs.mkdirSync(K);
  fs.rmSync(pool, { recursive: true, force: true });
  one.reset();
  const infoFile = path.join(one.S, '.superdev', 'info.json');
  fs.rmSync(infoFile, { force: true });
  if (info !== undefined) {
    fs.mkdirSync(path.dirname(infoFile), { recursive: true });
    fs.writeFileSync(infoFile, JSON.stringify(info));
  }
  const script = (name, body) => {
    const p = path.join(K, name);
    fs.writeFileSync(p, body);
    return p;
  };
  return { K, script };
}

// `scope.js test path <FILE> -- sh <script>` started in `cwd`, its stderr gathered; `done` resolves `{ code, signal }`.
function start(cwd, script, env = one.env) {
  const child = spawn(process.execPath, [scopePath, 'test', 'path', FILE, '--', 'sh', script], { cwd, env, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  const done = new Promise((resolve) => child.on('close', (code, signal) => resolve({ code, signal })));
  return { child, err: () => err, done };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, what) {
  for (let i = 0; i < 1000; i++) {
    if (pred()) return;
    await sleep(20);
  }
  throw new Error('timed out waiting for ' + what);
}
const waits = (s) => (s.match(/waiting for a test slot/g) || []).length;
const records = () => (fs.existsSync(pool) ? fs.readdirSync(pool).map((d) => fs.readFileSync(path.join(pool, d, 'record.json'), 'utf8')) : []);

// A script that marks itself running, waits up to 2 s for a second run to be marked, and records whether it saw one.
const overlapScript = (K) => `touch ${K}/run.$$; i=0; while [ $(ls ${K} | grep -c '^run\\.') -lt 2 ] && [ $i -lt 40 ]; do sleep 0.05; i=$((i+1)); done;` +
  ` [ $(ls ${K} | grep -c '^run\\.') -ge 2 ] && touch ${K}/overlap; sleep 0.1; rm ${K}/run.$$`;

test('#one-slot: with no testSlots set, runs from two worktrees of one repository never overlap.', async () => {
  const { K, script } = fresh();
  const s = script('o.sh', overlapScript(K));
  const a = start(one.S, s);
  const b = start(W, s);
  const [ra, rb] = await Promise.all([a.done, b.done]);
  assert.deepStrictEqual([ra.code, rb.code], [0, 0], a.err() + b.err());
  assert.equal(fs.existsSync(path.join(K, 'overlap')), false, 'the second command starts only after the first ended');
  assert.equal(waits(a.err()) + waits(b.err()), 1, 'one of them waited: ' + a.err() + b.err());
});

test('#timing: at one slot, a `timing` run and a `full` run from two worktrees of one repository never overlap.', async () => {
  const { K, script } = fresh();
  const s = script('o.sh', overlapScript(K));
  const cfg = '# V\n\n```sh\nsh ' + s + '\n```\n\n```sh\ntrue\n```\n\n## Timing command\n\n`sh ' + s + '`\n';
  for (const tree of [one.S, W]) fs.writeFileSync(path.join(tree, 'docs', 'agents', 'verification.md'), cfg);
  const run = (cwd, kind) => {
    const child = spawn(process.execPath, [scopePath, 'test', kind], { cwd, env: one.env, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    return { err: () => err, done: new Promise((resolve) => child.on('close', (code) => resolve(code))) };
  };
  try {
    const a = run(one.S, 'timing');
    const b = run(W, 'full');
    assert.deepStrictEqual(await Promise.all([a.done, b.done]), [0, 0], a.err() + b.err());
    assert.equal(fs.existsSync(path.join(K, 'overlap')), false, 'the second command starts only after the first ended');
    assert.equal(waits(a.err()) + waits(b.err()), 1, 'one of them waited: ' + a.err() + b.err());
  } finally {
    for (const tree of [one.S, W]) one.sh(tree, ['checkout', '-q', '--', 'docs']);
  }
});

test('#two-slots: with testSlots 2, two runs of one repository overlap.', async () => {
  const { K, script } = fresh({ verification: { testSlots: 2 } });
  const s = script('o.sh', overlapScript(K));
  const a = start(one.S, s);
  const b = start(W, s);
  await Promise.all([a.done, b.done]);
  assert.ok(fs.existsSync(path.join(K, 'overlap')), 'both ran at once: ' + a.err() + b.err());
});

test('#two-repositories: two repositories at one slot each run at the same time.', async () => {
  const { K, script } = fresh();
  fs.rmSync(path.join(two.S, '.git', 'superdev-test-slots'), { recursive: true, force: true });
  const s = script('o.sh', overlapScript(K));
  const a = start(one.S, s);
  const b = start(two.S, s, two.env);
  await Promise.all([a.done, b.done]);
  assert.ok(fs.existsSync(path.join(K, 'overlap')), 'neither waits on the other: ' + a.err() + b.err());
  assert.equal(waits(a.err()) + waits(b.err()), 0);
});

test('#waiting-line: a waiter says once which run holds the slot and where its record lies; the queued run line carries the command\'s own duration, the tree state at its start, its own outcome, and the verb exits with the command\'s status.', async () => {
  const { K, script } = fresh();
  const s = script('h.sh', `touch ${K}/ready; while [ ! -e ${K}/go ]; do sleep 0.05; done; exit $(cat ${K}/code)`);
  fs.writeFileSync(path.join(K, 'code'), '0');
  const a = start(W, s);
  await waitFor(() => fs.existsSync(path.join(K, 'ready')), 'the holder\'s command');
  const bStarted = performance.now();
  const b = start(one.S, s);
  await waitFor(() => waits(b.err()) === 1, 'the waiting line');
  const seen = performance.now();
  await sleep(2000);
  fs.writeFileSync(path.join(K, 'code'), '3');
  fs.writeFileSync(path.join(K, 'go'), '');
  const held = performance.now() - seen;
  const [ra, rb] = await Promise.all([a.done, b.done.then((r) => ({ ...r, total: performance.now() - bStarted }))]);
  assert.equal(waits(a.err()), 0, 'a run that gets a slot at once says nothing: ' + a.err());
  assert.equal(waits(b.err()), 1, 'said once: ' + b.err());
  assert.ok(b.err().includes(`test: waiting for a test slot; held by test in ${fs.realpathSync(W)} (pid ${a.child.pid}), record ${path.join(fs.realpathSync(pool), '1', 'record.json')}`), b.err());
  assert.deepStrictEqual([ra.code, rb.code], [3, 3], 'each verb exits with its command\'s status');
  const raw = fs.readFileSync(one.traceFile, 'utf8').split('\n').filter((l) => l.includes(' run '));
  assert.equal(raw.length, 1, 'only the run in the run tree writes a line: ' + raw);
  const w = raw[0].split(' ');
  const at = w.indexOf('run');
  assert.deepStrictEqual([w[at + 1], w[at + 2], w[at + 4]], ['path', 'fail', 'clean'], raw[0]);
  // The waiter spent at least `held` waiting and its command's own time running, both inside its total wall time, so a duration
  // that excludes the wait fits beside the wait in that total, and one that included it would not.
  assert.ok(Number(w[at + 6]) + held <= rb.total, `the duration ${w[at + 6]} ms excludes the wait of at least ${Math.round(held)} ms (total ${Math.round(rb.total)} ms)`);
});

test('#timing-wait: a queued `timing` run\'s printed run time excludes its wait for the slot.', async () => {
  const { K, script } = fresh();
  fs.writeFileSync(path.join(one.S, 'docs', 'agents', 'verification.md'), '# V\n\n```sh\ntrue\n```\n\n## Timing command\n\n`true`\n');
  let a;
  try {
    a = start(W, script('h.sh', `touch ${K}/ready; while [ ! -e ${K}/go ]; do sleep 0.05; done`));
    await waitFor(() => fs.existsSync(path.join(K, 'ready')), 'the holder\'s command');
    const bStarted = performance.now();
    const child = spawn(process.execPath, [scopePath, 'test', 'timing'], { cwd: one.S, env: one.env, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    const b = new Promise((resolve) => child.on('close', (code) => resolve({ code, total: performance.now() - bStarted })));
    await waitFor(() => waits(err) === 1, 'the waiting line');
    const seen = performance.now();
    await sleep(2000);
    fs.writeFileSync(path.join(K, 'go'), '');
    const held = performance.now() - seen;
    const [, rb] = await Promise.all([a.done, b]);
    assert.equal(rb.code, 0, err);
    const m = /^test: timing ran (\d+) ms$/m.exec(err);
    assert.ok(m, 'the run time is printed: ' + err);
    assert.ok(Number(m[1]) + held <= rb.total, `the run time ${m[1]} ms excludes the wait of at least ${Math.round(held)} ms (total ${Math.round(rb.total)} ms)`);
  } finally {
    // The holder ends on every exit, a failed wait included, so a failing case never leaves it running.
    fs.writeFileSync(path.join(K, 'go'), '');
    if (a) await a.done;
    one.sh(one.S, ['checkout', '-q', '--', 'docs']);
  }
});

test('#stale-records: a record naming a dead pid with no live group, or a boot stamp of another boot, is reclaimed with no wait.', () => {
  const dead = spawnSync('true').pid;
  for (const rec of [{ pid: dead, group: dead, boot: bootStamp() }, { pid: process.pid, group: null, boot: bootStamp() - 3600000 }]) {
    const { K, script } = fresh();
    fs.mkdirSync(path.join(pool, '1'), { recursive: true });
    fs.writeFileSync(path.join(pool, '1', 'record.json'), JSON.stringify({ ...rec, kind: 'test', tree: '/x' }));
    const r = one.verb(['path', FILE, '--', 'sh', script('t.sh', 'exit 0')]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(waits(r.stderr), 0, JSON.stringify(rec) + ': ' + r.stderr);
    assert.deepStrictEqual(records(), [], 'the run frees its slot when it ends');
  }
});

test('#live-holder: a record of this boot, its stamp within the margin, naming a live pid stays held until that pid and its group end.', async () => {
  const { K, script } = fresh();
  const holder = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
  fs.mkdirSync(path.join(pool, '1'), { recursive: true });
  fs.writeFileSync(path.join(pool, '1', 'record.json'), JSON.stringify({ pid: holder.pid, group: holder.pid, boot: bootStamp() + 60000, kind: 'test', tree: '/x' }));
  const b = start(one.S, script('t.sh', `touch ${K}/ran`));
  await waitFor(() => waits(b.err()) === 1, 'the waiting line');
  await sleep(600);
  assert.equal(fs.existsSync(path.join(K, 'ran')), false, 'a live holder keeps the slot');
  process.kill(-holder.pid, 'SIGKILL');
  assert.equal((await b.done).code, 0, b.err());
  assert.ok(fs.existsSync(path.join(K, 'ran')));
});

for (const [label, sig, body] of [
  ['killed', 'SIGKILL', (K) => `trap '' TERM; touch ${K}/ready; sleep 2; touch ${K}/done1`],
  ['interrupted', 'SIGINT', (K) => `trap 'sleep 1; touch ${K}/done1; exit 0' TERM; touch ${K}/ready; sleep 30 & wait`],
]) {
  test(`#outlived: a verb ${label} while its command runs on leaves the slot held until the command's group is empty. (${label})`, async () => {
    const { K, script } = fresh();
    const a = start(W, script('a.sh', body(K)));
    await waitFor(() => fs.existsSync(path.join(K, 'ready')), 'the first command');
    await sleep(200);
    a.child.kill(sig);
    await a.done;
    const b = start(one.S, script('b.sh', `[ -e ${K}/done1 ] && touch ${K}/ok`));
    assert.equal((await b.done).code, 0, b.err());
    assert.ok(fs.existsSync(path.join(K, 'ok')), 'the second command starts after the first ended: ' + b.err());
  });
}

test('#waiter-interrupt: a waiter sent SIGINT ends at once, leaves no slot record, and writes no run line.', async () => {
  const { K, script } = fresh();
  const a = start(W, script('h.sh', `touch ${K}/ready; while [ ! -e ${K}/go ]; do sleep 0.05; done`));
  await waitFor(() => fs.existsSync(path.join(K, 'ready')), 'the holder\'s command');
  const b = start(one.S, script('t.sh', `touch ${K}/ran`));
  await waitFor(() => waits(b.err()) === 1, 'the waiting line');
  b.child.kill('SIGINT');
  const rb = await b.done;
  assert.notEqual(rb.code, 0);
  const recs = records().map((r) => JSON.parse(r).pid);
  assert.deepStrictEqual(recs, [a.child.pid], 'only the holder\'s record stands');
  assert.deepStrictEqual(one.lines(), [], 'no run line');
  assert.equal(fs.existsSync(path.join(K, 'ran')), false);
  fs.writeFileSync(path.join(K, 'go'), '');
  await a.done;
});

test('#refusals: a malformed call refuses with no wait while another run holds the only slot.', async () => {
  const { K, script } = fresh();
  const a = start(W, script('h.sh', `touch ${K}/ready; while [ ! -e ${K}/go ]; do sleep 0.05; done`));
  await waitFor(() => fs.existsSync(path.join(K, 'ready')), 'the holder\'s command');
  try {
    for (const argv of [['path', '--', 'true'], ['path', '--since', 'nope', '--', 'true'], ['whole'], ['timing'], ['timing', 'extra'], ['timing', '--since', 'HEAD']]) {
      const r = one.verb(argv);
      assert.notEqual(r.status, 0, argv.join(' '));
      assert.equal(waits(r.stderr), 0, argv.join(' ') + ': ' + r.stderr);
    }
  } finally {
    fs.writeFileSync(path.join(K, 'go'), '');
    await a.done;
  }
});

for (const [label, plant] of [
  ['no record', (dir) => dir],
  ['empty record', (dir) => { const f = path.join(dir, 'record.json'); fs.writeFileSync(f, ''); return f; }],
  ['unparseable record', (dir) => { const f = path.join(dir, 'record.json'); fs.writeFileSync(f, '{"pid":'); return f; }],
]) {
  test(`#partial: a slot with ${label} younger than 10 s is not reclaimed; one older is. (${label})`, async () => {
    const { K, script } = fresh();
    const dir = path.join(pool, '1');
    fs.mkdirSync(dir, { recursive: true });
    const aged = plant(dir);
    const b = start(one.S, script('t.sh', `touch ${K}/ran`));
    await waitFor(() => waits(b.err()) === 1, 'the waiting line');
    await sleep(600);
    assert.equal(fs.existsSync(path.join(K, 'ran')), false, 'a young partial slot stays held');
    const old = (Date.now() - 20000) / 1000;
    fs.utimesSync(aged, old, old);
    assert.equal((await b.done).code, 0, b.err());
    assert.ok(fs.existsSync(path.join(K, 'ran')), 'an old partial slot is reclaimed');
  });
}

test('#no-pool: a run outside a git repository, or where the pool cannot be written, runs with no slot and says so once.', () => {
  fs.writeFileSync(path.join(outside, 'f'), '');
  const r = spawnSync(process.execPath, [scopePath, 'test', 'path', 'f', '--', 'true'], { cwd: outside, encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stderr.match(/test: not in a git repository; the run takes no test slot/g) || []).length, 1, r.stderr);
  const { script } = fresh();
  fs.writeFileSync(pool, '');
  try {
    const s = one.verb(['path', FILE, '--', 'sh', script('t.sh', 'exit 0')]);
    assert.equal(s.status, 0, s.stderr);
    assert.equal((s.stderr.match(/cannot be written/g) || []).length, 1, s.stderr);
  } finally {
    fs.rmSync(pool, { force: true });
  }
});

test('#invalid-count: an invalid testSlots value is named once on stderr and the run takes the one slot.', () => {
  const { script } = fresh({ verification: { testSlots: 0 } });
  const r = one.verb(['path', FILE, '--', 'sh', script('t.sh', 'exit 0')]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal((r.stderr.match(/verification\.testSlots is not a whole number from 1 to 64/g) || []).length, 1, r.stderr);
});
