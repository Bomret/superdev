'use strict';

// Suite for the run-state fetch of `scope.js adopt` (ADR 0202, INV-0179, INV-0009). Real repositories and a
// real bare remote throughout. Each case builds its own fixture.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { scopePath, sliceJson } = require('./scope-setup');
const { copyFixture, templateOnce } = require('./fixture-git');
const { assertSpawnDecided } = require('./spawn-verdict');
const { pushRunState } = require('../plugin/lib/run-state-ref.js');
const { publishText } = require('../plugin/lib/run-state.js');

const SCOPE = 'push-scope';
const ref = `refs/superdev/${SCOPE}`;
const made = [];

function git(args, cwd, input) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'ignore'] }).trim();
}

const template = templateOnce((dir) => {
  const repo = path.join(dir, 'repo');
  const origin = path.join(dir, 'origin');
  fs.mkdirSync(repo);
  fs.mkdirSync(origin);
  git(['init', '-q', '--bare', '-b', 'main'], origin);
  git(['init', '-q', '-b', 'main'], repo);
  git(['config', 'user.email', 'test@example.com'], repo);
  git(['config', 'user.name', 'test'], repo);
  fs.mkdirSync(path.join(repo, 'docs', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs', 'agents', 'code-management.md'), '# CM\n\n- **Remote:** `origin`. Confirm.\n');
  git(['add', '.'], repo);
  git(['commit', '-q', '-m', 'init'], repo);
  git(['remote', 'add', 'origin', origin], repo);
  git(['push', '-q', 'origin', 'main'], repo);
}, 'run-state-adopt-template-');

// `a`: the machine that ran the scope and pushed its state. `b`: a fresh clone of the remote.
function fixture() {
  const copy = copyFixture(template(), 'run-state-adopt-');
  made.push(copy);
  const origin = path.join(copy, 'origin');
  const a = path.join(copy, 'repo');
  git(['remote', 'set-url', 'origin', origin], a);
  const b = path.join(copy, 'clone');
  git(['clone', '-q', origin, b], copy);
  const rootA = path.join(a, '.superdev', 'scopes', SCOPE);
  const rootB = path.join(b, '.superdev', 'scopes', SCOPE);
  return { a, b, origin, rootA, rootB };
}

function run(args, cwd, input, env = {}) {
  const r = spawnSync(process.execPath, [scopePath, ...args], {
    cwd, input, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL', env: { ...process.env, ...env },
  });
  assertSpawnDecided(r, 'scope.js ' + args[0]);
  return r;
}

// Machine A holds a ledger, a trace, reports, and an interface file, and has pushed them. Returns the snapshot.
function seed(f) {
  const r = run(['init', `feat/${SCOPE}`, 'planned'], f.a, sliceJson);
  assert.strictEqual(r.status, 0, r.stderr);
  fs.writeFileSync(path.join(f.rootA, 'trace.log'), '2026-01-01T00:00:00Z a b\n');
  fs.writeFileSync(path.join(f.rootA, 'interfaces.md'), 'iface\n');
  fs.mkdirSync(path.join(f.rootA, 'reports', 'S1'), { recursive: true });
  fs.writeFileSync(path.join(f.rootA, 'reports', 'S1', 'progress.md'), 'p\n');
  fs.writeFileSync(path.join(f.rootA, 'reports', 'S1', 'blob.bin'), Buffer.from([0, 255, 254, 10, 0]));
  assert.match(pushRunState(f.rootA, f.a), /run-state: sent/);
  return publishText(f.rootA);
}

// Replaces the remote ref with a parentless commit of the given `mktree` lines.
function plant(f, lines) {
  const tree = git(['mktree', '--missing'], f.origin, lines.join('\n') + '\n');
  const c = git(['-c', 'user.name=x', '-c', 'user.email=x@x', 'commit-tree', tree, '-m', 'x'], f.origin);
  git(['update-ref', ref, c], f.origin);
}

function listing(dir) {
  const out = [];
  const walk = (d) => {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) walk(p);
      else out.push(path.relative(dir, p));
    }
  };
  walk(dir);
  // trace.log: adopt's own ledger event creates it, so its content is judged where it matters.
  return out.filter((n) => n !== 'trace.log').sort();
}

try {
  // #fresh-clone: the ref's files come back byte for byte, and the next push succeeds.
  {
    const f = fixture();
    const body = seed(f);
    const r = run(['adopt', '--root', f.rootB], f.b, body);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /run-state: fetched/, r.stdout);
    for (const p of ['trace.log', 'interfaces.md', 'reports/S1/progress.md', 'reports/S1/blob.bin']) {
      const a = fs.readFileSync(path.join(f.rootA, p));
      const b = fs.readFileSync(path.join(f.rootB, p));
      // adopt's own ledger event may append to the trace after the unpack.
      assert.ok(p === 'trace.log' ? b.subarray(0, a.length).equals(a) : b.equals(a), p);
    }
    // The next `step clear` push, driven through the CLI, succeeds.
    assert.strictEqual(run(['step', 'set', 'review', '--root', f.rootB], f.b).status, 0);
    const cleared = run(['step', 'clear', '--root', f.rootB], f.b);
    assert.strictEqual(cleared.status, 0, cleared.stderr);
    assert.match(cleared.stdout, /run-state: sent/, cleared.stdout);
  }

  // #stale-stage: a .run-state-* staging directory a killed adopt left in the root is removed.
  {
    const f = fixture();
    const body = seed(f);
    fs.mkdirSync(path.join(f.rootB, '.run-state-old', 'reports'), { recursive: true });
    fs.writeFileSync(path.join(f.rootB, '.run-state-old', 'reports', 'x'), 'x\n');
    const r = run(['adopt', '--root', f.rootB], f.b, body);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /run-state: fetched/, r.stdout);
    assert.ok(!fs.readdirSync(f.rootB).some((n) => n.startsWith('.run-state-')), fs.readdirSync(f.rootB).join(' '));
  }

  // #keep-local-interfaces: a local interfaces.md stays, the unpack names it, and the rest still unpacks.
  {
    const f = fixture();
    const body = seed(f);
    fs.mkdirSync(f.rootB, { recursive: true });
    fs.writeFileSync(path.join(f.rootB, 'interfaces.md'), 'local\n');
    const r = run(['adopt', '--root', f.rootB], f.b, body);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /run-state: fetched .*kept the local interfaces\.md/, r.stdout);
    assert.strictEqual(fs.readFileSync(path.join(f.rootB, 'interfaces.md'), 'utf8'), 'local\n');
    assert.ok(fs.existsSync(path.join(f.rootB, 'reports', 'S1', 'progress.md')));
    assert.deepStrictEqual(fs.readdirSync(f.rootB).filter((n) => n.startsWith('.')), [], 'no staging dir left');
  }

  // #no-ref: no ref on the remote adopts as before, with one note.
  {
    const f = fixture();
    const body = seed(f);
    git(['update-ref', '-d', ref], f.origin);
    const r = run(['adopt', '--root', f.rootB], f.b, body);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /run-state: not fetched, no .*ref/, r.stdout);
    assert.ok(fs.existsSync(path.join(f.rootB, 'ledger.md')));
    assert.deepStrictEqual(listing(f.rootB), ['ledger.md']);
  }

  // #no-remote: no `Remote:` value adopts as before, with one note.
  {
    const f = fixture();
    const body = seed(f);
    fs.writeFileSync(path.join(f.b, 'docs', 'agents', 'code-management.md'), '# CM\n');
    const r = run(['adopt', '--root', f.rootB], f.b, body);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /run-state: not fetched/, r.stdout);
    assert.deepStrictEqual(listing(f.rootB), ['ledger.md']);
  }

  // #keep-local: a local trace.log keeps, the unpack is skipped and said, and the next push refuses.
  {
    const f = fixture();
    const body = seed(f);
    fs.mkdirSync(f.rootB, { recursive: true });
    fs.writeFileSync(path.join(f.rootB, 'trace.log'), 'local\n');
    const r = run(['adopt', '--root', f.rootB], f.b, body);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /run-state: kept/, r.stdout);
    assert.ok(fs.readFileSync(path.join(f.rootB, 'trace.log'), 'utf8').startsWith('local\n'));
    assert.ok(!fs.existsSync(path.join(f.rootB, 'interfaces.md')));
    assert.match(pushRunState(f.rootB, f.b), /refused/);
  }

  // #keep-local-reports: a local reports/ keeps the same way.
  {
    const f = fixture();
    const body = seed(f);
    fs.mkdirSync(path.join(f.rootB, 'reports'), { recursive: true });
    const r = run(['adopt', '--root', f.rootB], f.b, body);
    assert.match(r.stdout, /run-state: kept/, r.stdout);
    assert.ok(!fs.existsSync(path.join(f.rootB, 'interfaces.md')));
  }

  // #refuse-entries: a symlink, a submodule, an absolute path, or a `..` path refuses and writes nothing.
  {
    const blobSha = (f, text) => git(['hash-object', '-w', '--stdin'], f.origin, text);
    const bad = {
      symlink: (f, b) => [`100644 blob ${b}\ttrace.log`, `120000 blob ${b}\tinterfaces.md`],
      submodule: (f, b) => [`100644 blob ${b}\ttrace.log`, `160000 commit ${'1'.repeat(40)}\treports`],
      dotdot: (f, b) => [`100644 blob ${b}\ttrace.log`, `100644 blob ${b}\t..`],
      nested: (f, b) => {
        const inner = git(['mktree'], f.origin, `100644 blob ${b}\t..\n`);
        return [`100644 blob ${b}\ttrace.log`, `040000 tree ${inner}\treports`];
      },
    };
    for (const [name, mk] of Object.entries(bad)) {
      const f = fixture();
      const body = seed(f);
      plant(f, mk(f, blobSha(f, 'x\n')));
      const outside = path.join(f.b, '.superdev', 'scopes');
      const r = run(['adopt', '--root', f.rootB], f.b, body);
      assert.match(r.stdout, /run-state: not fetched, .*refus/i, `${name}: ${r.stdout}`);
      assert.deepStrictEqual(listing(f.rootB), ['ledger.md'], name);
      assert.ok(!fs.existsSync(path.join(outside, 'trace.log')), name);
    }
  }

  // #hung: a remote that outlasts the bound ends within it, and adopt reports it.
  {
    const f = fixture();
    const body = seed(f);
    const hang = path.join(f.b, 'hang.sh');
    fs.writeFileSync(hang, '#!/bin/sh\nexec sleep 8\n');
    fs.chmodSync(hang, 0o755);
    git(['config', 'remote.origin.uploadpack', hang], f.b);
    const r = run(['adopt', '--root', f.rootB], f.b, body, { SUPERDEV_PUSH_TIMEOUT_MS: '1500' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /bound/, r.stdout);
    assert.deepStrictEqual(listing(f.rootB), ['ledger.md']);
  }
} finally {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
}
console.log('run-state-ref-adopt: ok');
