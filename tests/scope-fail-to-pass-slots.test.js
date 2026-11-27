'use strict';

// Fixture repositories commit regardless of the maintainer's global git config (#780).
const { test, after } = require('node:test');
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `fail-to-pass` verb and its Test slot (ADR 0291, INV-0212, INV-0139): the verb holds one
// slot for its whole call, its internal preparation included, takes it before any run bound starts, so a long wait ends in an
// outcome and the control's run line carries no wait, ends at once when interrupted while waiting, and a call the trace settles
// takes no slot. A `scope.js test` run from the scenario's main checkout holds the repository's only slot. Every scenario writes
// only inside the fixture's own temporary directory.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { f2pFixture, verif, scopePath, writeOperatorConfig } = require('./scope-setup');

const { appendTrace } = require(scopePath);
const { CMD, scenario, leftover, done } = f2pFixture();
after(() => {
  done();
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, what) {
  for (let i = 0; i < 1000; i++) {
    if (pred()) return;
    await sleep(20);
  }
  throw new Error('timed out waiting for ' + what);
}
const waits = (s) => (s.match(/waiting for a test slot/g) || []).length;
// A child process's stdout and stderr gathered; `done` resolves `{ code, signal, total }`, `total` its wall time.
function gather(child) {
  const t0 = performance.now();
  const out = { stdout: '', stderr: '', child };
  child.stdout.on('data', (d) => { out.stdout += d; });
  child.stderr.on('data', (d) => { out.stderr += d; });
  out.done = new Promise((resolve) => child.on('close', (code, signal) => resolve({ code, signal, total: performance.now() - t0 })));
  return out;
}
// `scope.js test path src.txt -- sh <script>` from the scenario's main checkout: a run holding the repository's slot until
// `<dir>/go` exists. `<dir>/held-done` marks its end.
function hold(s) {
  const dir = path.dirname(s.repo);
  const script = path.join(dir, 'hold.sh');
  fs.writeFileSync(script, `touch ${dir}/ready; while [ ! -e ${dir}/go ]; do sleep 0.05; done; touch ${dir}/held-done`);
  const h = gather(spawn(process.execPath, [scopePath, 'test', 'path', 'src.txt', '--', 'sh', script], { cwd: s.repo, stdio: ['ignore', 'pipe', 'pipe'] }));
  h.release = () => fs.writeFileSync(path.join(dir, 'go'), '');
  h.ready = () => waitFor(() => fs.existsSync(path.join(dir, 'ready')), 'the holder\'s command');
  return h;
}
const f2p = (s, env = {}) => gather(spawn(process.execPath, [scopePath, 'fail-to-pass', s.range, '--', CMD], {
  cwd: s.tree, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, F2P_LOG: s.log, F2P_DIR: path.dirname(s.repo), ...env },
}));

// The prepare command marks whether the holder had ended when it ran.
const prepared = {
  base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD, '\n## Prepare command\n\n`[ -e "$F2P_DIR/held-done" ] || touch "$F2P_DIR/early"`\n') },
  tip: { 'src.txt': 'b\n', 'tests/t.sh': 'grep -q b src.txt\n' },
};

test('#waits: at one slot, a call started while a test run holds the slot waits, says so, starts its preparation only after that run ended, completes with its preparation, and a wait past its control bound still ends in an outcome whose control line carries no wait.', async () => {
  const s = scenario(prepared);
  writeOperatorConfig(s.repo, { verification: { failToPassControlMs: 3000 } });
  const h = hold(s);
  let r, held, end;
  try {
    await h.ready();
    r = f2p(s);
    await waitFor(() => waits(r.stderr) === 1, 'the waiting line');
    const seen = performance.now();
    await sleep(3500);
    h.release();
    held = performance.now() - seen;
    end = await r.done;
  } finally {
    h.release();
    if (r) r.child.kill('SIGKILL');
    await h.done;
  }
  assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', r.stderr);
  assert.match(r.stderr, /^fail-to-pass: waiting for a test slot; held by test in /m);
  assert.equal(fs.existsSync(path.join(path.dirname(s.repo), 'early')), false, 'the preparation ran after the holder ended');
  const line = s.rawRunLines()[0].split(' ');
  const ms = Number(line[line.indexOf('run') + 6]);
  assert.ok(ms + held <= end.total, `the control's ${ms} ms excludes the wait of at least ${Math.round(held)} ms (total ${Math.round(end.total)} ms)`);
});

test('#interrupt: a waiter sent SIGINT ends at once, leaving no slot record of its own, no worktree, and no outcome line.', async () => {
  const s = scenario(prepared);
  const h = hold(s);
  try {
    await h.ready();
    const r = f2p(s);
    try {
      await waitFor(() => waits(r.stderr) === 1, 'the waiting line');
    } finally {
      r.child.kill('SIGINT');
    }
    const end = await r.done;
    assert.notEqual(end.code, 0);
    const pool = path.join(s.repo, '.git', 'superdev-test-slots');
    const pids = fs.readdirSync(pool).map((d) => JSON.parse(fs.readFileSync(path.join(pool, d, 'record.json'), 'utf8')).pid);
    assert.deepStrictEqual(pids, [h.child.pid], 'only the holder\'s record stands');
    assert.deepStrictEqual(leftover(s), [], 'no worktree');
    assert.deepStrictEqual(s.trace(), [], 'no outcome line');
  } finally {
    h.release();
    await h.done;
  }
});

test('#two-slots: at two slots, two calls in one repository overlap.', async () => {
  const s = scenario({
    base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
    tip: { 'src.txt': 'b\n', 'tests/t.sh': 'mkdir -p "$F2P_DIR/barrier"; touch "$F2P_DIR/barrier/$$"; for i in $(seq 100); do [ "$(ls "$F2P_DIR/barrier" | wc -l)" -ge 2 ] && { touch "$F2P_DIR/both"; break; }; sleep 0.05; done\ngrep -q b src.txt\n' },
  });
  writeOperatorConfig(s.repo, { verification: { testSlots: 2 } });
  const runs = [f2p(s), f2p(s)];
  await Promise.all(runs.map((r) => r.done));
  assert.ok(fs.existsSync(path.join(path.dirname(s.repo), 'both')), 'both controls ran at once: ' + runs.map((r) => r.stderr).join(''));
});

test('#settled: a call the trace settles prints its outcome with no wait while another run holds the only slot.', async () => {
  const s = scenario({
    base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD, '\n## Prepare command\n\n`none`\n') },
    tip: { 'src.txt': 'b\n', 'tests/t.sh': 'grep -q b src.txt\n' },
  });
  const T = 'tests/t.sh';
  for (const [kind, ...fields] of [['edit', 'test', T], ['run', 'path', 'fail', s.tipSha, 'clean', T, '40', CMD, '.'], ['edit', 'impl', 'src.txt'], ['run', 'path', 'pass', s.tipSha, 'clean', T, '40', CMD, '.']]) {
    appendTrace(s.root, { slice: '01', kind, fields });
  }
  const h = hold(s);
  await h.ready();
  try {
    const r = f2p(s);
    await r.done;
    assert.equal(r.stdout.trim(), 'fail-to-pass settled-from-trace', r.stderr);
    assert.equal(waits(r.stderr), 0, r.stderr);
  } finally {
    h.release();
    await h.done;
  }
});
