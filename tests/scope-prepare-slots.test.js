'use strict';

// Fixture repositories commit regardless of the maintainer's global git config (#780).
const { test, after } = require('node:test');
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `prepare <tree>` verb and its Test slot (ADR 0291, INV-0212): the verb waits for a slot
// only when it is about to run its command, so a waiter says so and runs after the holder, ends at once when interrupted, and a
// stamp that holds, a missing section, or `none` runs nothing and waits for nothing, and two preparations of one tree queued
// together run the command once, even where the reads before the stamp write outlast the slot poll. A `scope.js test` run from the repository's
// main checkout holds the only slot. Every case writes only inside its own temporary directory.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { scopePath } = require('./scope-setup');

const D = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prepare-slots-')));
after(() => {
  fs.rmSync(D, { recursive: true, force: true });
});

const git = (cwd, argv) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...argv], { cwd, encoding: 'utf8', timeout: 20000 });
  assertSpawnDecided(r, 'git ' + argv[0]);
  assert.equal(r.status, 0, 'git ' + argv.join(' ') + ': ' + r.stderr);
  return r.stdout.trim();
};
const verification = (extra) => '# V\n\n```sh\ntrue\n```\n\n```sh\ntrue {paths}\n```\n' + extra;
const repo = path.join(D, 'repo');
fs.mkdirSync(path.join(repo, 'docs', 'agents'), { recursive: true });
git(repo, ['init', '-q', '-b', 'main']);
fs.writeFileSync(path.join(repo, 'docs', 'agents', 'verification.md'), verification(''));
fs.writeFileSync(path.join(repo, 'f'), '');
git(repo, ['add', '-A']);
git(repo, ['commit', '-q', '-m', 'base']);
let n = 0;
// A worktree of its own whose `verification.md` carries `extra`, and a case directory K.
const worktree = (extra) => {
  const name = `w${++n}`;
  const tree = path.join(D, name);
  git(repo, ['worktree', 'add', '-q', '-b', name, tree]);
  fs.writeFileSync(path.join(tree, 'docs', 'agents', 'verification.md'), verification(extra));
  git(tree, ['commit', '-q', '--allow-empty', '-am', name]);
  const K = path.join(D, `k${n}`);
  fs.mkdirSync(K);
  return { tree, K };
};
const section = (body) => `\n## Prepare command\n\n${body}\n`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred, what) {
  for (let i = 0; i < 1000; i++) {
    if (pred()) return;
    await sleep(20);
  }
  throw new Error('timed out waiting for ' + what);
}
const waits = (s) => (s.match(/waiting for a test slot/g) || []).length;
function gather(child) {
  const out = { stderr: '', child };
  child.stderr.on('data', (d) => { out.stderr += d; });
  out.done = new Promise((resolve) => child.on('close', (code, signal) => { out.ended = true; resolve({ code, signal }); }));
  return out;
}
// A `scope.js test` run from the main checkout holding the only slot until `<K>/go` exists; `<K>/held-done` marks its end.
async function hold(K) {
  const script = path.join(K, 'hold.sh');
  fs.writeFileSync(script, `touch ${K}/ready; while [ ! -e ${K}/go ]; do sleep 0.05; done; touch ${K}/held-done`);
  const h = gather(spawn(process.execPath, [scopePath, 'test', 'path', 'f', '--', 'sh', script], { cwd: repo, stdio: ['ignore', 'ignore', 'pipe'] }));
  h.release = async () => {
    fs.writeFileSync(path.join(K, 'go'), '');
    await h.done;
  };
  await waitFor(() => fs.existsSync(path.join(K, 'ready')), 'the holder\'s command');
  return h;
}
const prepare = (tree, env = process.env) => gather(spawn(process.execPath, [scopePath, 'prepare', tree], { cwd: repo, env, stdio: ['ignore', 'ignore', 'pipe'] }));
// An environment whose `git`, first on PATH, takes a second over every listing of the untracked files git does not ignore,
// as a tree with very many untracked files does, and passes every call to the real git.
function slowListing(K) {
  const real = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  const bin = path.join(K, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\ncase " $* " in *" --exclude-standard "*) sleep 1;; esac\nexec "${real}" "$@"\n`, { mode: 0o755 });
  return { ...process.env, PATH: bin + path.delimiter + process.env.PATH };
}
const prepareSync = (tree) => {
  const r = spawnSync(process.execPath, [scopePath, 'prepare', tree], { cwd: repo, encoding: 'utf8', timeout: 20000 });
  assertSpawnDecided(r, 'scope.js prepare');
  return r;
};

test('#waits: at one slot, a preparation started while a test run holds the slot says so and runs its command only after that run ended.', async () => {
  const { tree, K } = worktree('');
  fs.writeFileSync(path.join(tree, 'docs', 'agents', 'verification.md'), verification(section(`\`[ -e ${K}/held-done ] || touch ${K}/early; touch ${K}/ran\``)));
  git(tree, ['commit', '-q', '-am', 'prep']);
  const h = await hold(K);
  let p;
  try {
    p = prepare(tree);
    // A verb that runs at once has ended or run its command: that fails the case at once, with no wait for the line.
    await waitFor(() => waits(p.stderr) === 1 || p.ended || fs.existsSync(path.join(K, 'ran')), 'the waiting line');
    assert.equal(waits(p.stderr), 1, 'the preparation waits: ' + p.stderr);
    await sleep(500);
    assert.equal(fs.existsSync(path.join(K, 'ran')), false, 'the command waits for the slot');
  } finally {
    await h.release();
  }
  assert.equal((await p.done).code, 0, p.stderr);
  assert.match(p.stderr, /^prepare: waiting for a test slot; held by test in /m);
  assert.ok(fs.existsSync(path.join(K, 'ran')));
  assert.equal(fs.existsSync(path.join(K, 'early')), false, 'the command ran after the holder ended');
});

test('#interrupt: a waiter sent SIGINT ends at once and leaves no slot record of its own and no stamp.', async () => {
  const { tree, K } = worktree('');
  fs.writeFileSync(path.join(tree, 'docs', 'agents', 'verification.md'), verification(section(`\`touch ${K}/ran\``)));
  git(tree, ['commit', '-q', '-am', 'prep']);
  const h = await hold(K);
  try {
    const p = prepare(tree);
    try {
      await waitFor(() => waits(p.stderr) === 1 || p.ended || fs.existsSync(path.join(K, 'ran')), 'the waiting line');
      assert.equal(waits(p.stderr), 1, 'the preparation waits: ' + p.stderr);
    } finally {
      p.child.kill('SIGINT');
    }
    assert.notEqual((await p.done).code, 0);
    const pool = path.join(repo, '.git', 'superdev-test-slots');
    const pids = fs.readdirSync(pool).map((d) => JSON.parse(fs.readFileSync(path.join(pool, d, 'record.json'), 'utf8')).pid);
    assert.deepStrictEqual(pids, [h.child.pid], 'only the holder\'s record stands');
    const gitDir = git(tree, ['rev-parse', '--absolute-git-dir']);
    assert.equal(fs.existsSync(path.join(gitDir, 'superdev-prepare.json')), false, 'no stamp');
    assert.equal(fs.existsSync(path.join(K, 'ran')), false);
  } finally {
    await h.release();
  }
});

test('#no-command: a stamp that holds, a missing section, and `none` each run nothing and wait for nothing while another run holds the only slot.', async () => {
  const stamped = worktree('');
  fs.writeFileSync(path.join(stamped.tree, 'docs', 'agents', 'verification.md'), verification(section('`true`')));
  git(stamped.tree, ['commit', '-q', '-am', 'prep']);
  assert.equal(prepareSync(stamped.tree).status, 0, 'the first preparation leaves a stamp');
  const absent = worktree('');
  const none = worktree(section('`none`'));
  const h = await hold(stamped.K);
  try {
    const skip = prepareSync(stamped.tree);
    assert.equal(skip.status, 0, skip.stderr);
    assert.match(skip.stderr, /^prepare: skipped /m);
    for (const r of [skip, prepareSync(absent.tree), prepareSync(none.tree)]) {
      assert.equal(r.status, 0, r.stderr);
      assert.equal(waits(r.stderr), 0, r.stderr);
    }
  } finally {
    await h.release();
  }
});

test('#queued-twice: two preparations of one tree queued behind a test run holding the only slot run the command once, even where the reads before the stamp write are slow.', async () => {
  const { tree, K } = worktree('');
  fs.writeFileSync(path.join(tree, 'docs', 'agents', 'verification.md'), verification(section(`\`echo x >> ${K}/runs\``)));
  git(tree, ['commit', '-q', '-am', 'prep']);
  // The slow listing outlasts the slot poll, so a slot freed before the stamp is written lets the second preparation run too.
  const env = slowListing(K);
  const h = await hold(K);
  let a;
  let b;
  try {
    a = prepare(tree, env);
    b = prepare(tree, env);
    await waitFor(() => (waits(a.stderr) === 1 || a.ended) && (waits(b.stderr) === 1 || b.ended), 'both waiting lines');
    assert.equal(waits(a.stderr) + waits(b.stderr), 2, 'both preparations wait: ' + a.stderr + b.stderr);
  } finally {
    await h.release();
  }
  assert.equal((await a.done).code, 0, a.stderr);
  assert.equal((await b.done).code, 0, b.stderr);
  assert.equal(fs.readFileSync(path.join(K, 'runs'), 'utf8'), 'x\n', 'the command ran once');
  assert.match(a.stderr + b.stderr, /^prepare: skipped /m, 'the later preparation prints the skip note');
});
