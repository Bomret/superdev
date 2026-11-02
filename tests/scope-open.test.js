'use strict';

// Suite for `scope.js open`: how a `/superdev:plan` run is set up or rejoined in one call — the lock check, the cut
// or reuse of the scope branch, the run lock, the empty `planned` ledger, and the plan step. Real git repositories
// and a real bare remote throughout. Each case builds its own fixture.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { scopePath, call } = require('./scope-setup');
const { copyFixture, templateOnce } = require('./fixture-git');
const { assertSpawnDecided } = require('./spawn-verdict');
const { STALENESS_MS } = require('../plugin/lib/plan-open.js');
const hook = require('../plugin/hooks/run-lock.js');

const BRANCH = 'feat/open-me';
const made = [];

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function tmp(prefix) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  made.push(dir);
  return dir;
}

function commit(repo, file, body, msg) {
  fs.writeFileSync(path.join(repo, file), body);
  git(['add', file], repo);
  git(['commit', '-q', '-m', msg], repo);
  return git(['rev-parse', 'HEAD'], repo);
}

// A repository with `main` pushed to a bare `origin`.
// It is built once into a template and copied for each case.
const template = templateOnce((dir) => {
  const repo = path.join(dir, 'repo');
  const origin = path.join(dir, 'origin');
  fs.mkdirSync(repo);
  fs.mkdirSync(origin);
  git(['init', '-q', '--bare', '-b', 'main'], origin);
  git(['init', '-q', '-b', 'main'], repo);
  git(['config', 'user.email', 'test@example.com'], repo);
  git(['config', 'user.name', 'test'], repo);
  commit(repo, 'README.md', 'x\n', 'init');
  git(['remote', 'add', 'origin', origin], repo);
  git(['push', '-q', 'origin', 'main'], repo);
}, 'scope-open-template-');

function fixture() {
  const copy = copyFixture(template(), 'scope-open-');
  made.push(copy);
  const repo = path.join(copy, 'repo');
  const origin = path.join(copy, 'origin');
  git(['remote', 'set-url', 'origin', origin], repo);
  const root = path.join(repo, '.superdev', 'scopes', 'open-me');
  return { repo, origin, root, scopetree: path.join(root, 'scopetree'), lock: path.join(root, 'run.lock') };
}

function open(f, extra = [], label = BRANCH) {
  const result = spawnSync(process.execPath, [scopePath, 'open', label, '--base', 'main', ...extra], {
    cwd: f.repo,
    encoding: 'utf8',
    timeout: 120000,
    killSignal: 'SIGKILL',
  });
  assertSpawnDecided(result, 'scope.js open');
  const lines = result.stdout.split('\n');
  const nonce = (lines.find((l) => l.startsWith('lock ')) || '').slice('lock '.length);
  return { status: result.status, out: result.stdout, err: result.stderr, word: lines[0], nonce };
}

const ledger = (f) => fs.readFileSync(path.join(f.root, 'ledger.md'), 'utf8');
const trace = (f) => fs.readFileSync(path.join(f.root, 'trace.log'), 'utf8');
const count = (text, re) => (text.match(re) || []).length;
const scope = (f, ...argv) => execFileSync(process.execPath, [scopePath, ...argv, '--root', f.root], { cwd: f.repo, encoding: 'utf8' });
const age = (file, ms) => {
  const t = (Date.now() - ms) / 1000;
  fs.utimesSync(file, t, t);
};

try {
  // #fresh-cut: no branch, no ledger — the branch is cut from base into the scopetree, and the lock, the empty
  // planned ledger, and the plan step are written.
  {
    const f = fixture();
    const r = open(f);
    assert.strictEqual(r.status, 0, `open exits 0: ${r.err}`);
    assert.strictEqual(r.word, 'cut', `prints the outcome first: ${r.out}`);
    assert.ok(r.out.includes(`root ${f.root}`), `prints the run root: ${r.out}`);
    assert.match(r.nonce, /^[0-9a-f]+$/, 'prints the lock nonce');
    assert.strictEqual(git(['rev-parse', '--abbrev-ref', 'HEAD'], f.scopetree), BRANCH, 'the scopetree holds the scope branch');
    assert.strictEqual(git(['rev-parse', 'HEAD'], f.scopetree), git(['rev-parse', 'main'], f.repo), 'cut from base');
    assert.strictEqual(fs.readFileSync(f.lock, 'utf8'), `plan ${r.nonce}\n`, 'the lock names the nonce');
    const l = ledger(f);
    assert.match(l, /\*\*Stage:\*\* planned/, 'the ledger enters at planned');
    assert.match(l, /\*\*Anchor:\*\* pending/, 'the anchor reads pending');
    assert.match(l, /\*\*Step:\*\* plan/, 'the plan step stands');
    assert.match(fs.readFileSync(path.join(f.repo, '.gitignore'), 'utf8'), /^\.superdev\/$/m, '.superdev/ is git-ignored');
    assert.strictEqual(count(trace(f), /\binit\b.*\bplanned\b/g), 1, 'the init is traced');
    assert.strictEqual(count(trace(f), /\bstep\b.*\bset\b.*\bplan\b/g), 1, 'the step is traced');

    // #repeat: the same run calls again with its nonce — nothing is cut, the step is not traced twice.
    const again = open(f, ['--lock', r.nonce]);
    assert.strictEqual(again.status, 0, `the repeat exits 0: ${again.err}`);
    assert.strictEqual(again.word, 'existing', `the repeat reads existing: ${again.out}`);
    assert.strictEqual(again.nonce, r.nonce, 'the repeat keeps the nonce');
    assert.strictEqual(count(trace(f), /\bstep\b.*\bset\b.*\bplan\b/g), 1, 'a repeat call records no second start');

    // #locked: another session, while the step stands and the lock is fresh, is stopped and writes nothing.
    const before = ledger(f);
    const other = open(f);
    assert.strictEqual(other.status, 3, `a second session exits 3: ${other.out}`);
    assert.strictEqual(other.word, 'locked', `prints locked: ${other.out}`);
    assert.strictEqual(ledger(f), before, 'the ledger is unchanged');
    assert.strictEqual(fs.readFileSync(f.lock, 'utf8'), `plan ${r.nonce}\n`, 'the lock is unchanged');

    // #finished-run: once the earlier run cleared its step, a fresh lock no longer holds the run.
    scope(f, 'step', 'clear');
    const next = open(f);
    assert.strictEqual(next.status, 0, `a later run exits 0: ${next.err}`);
    assert.strictEqual(next.word, 'existing', `a later run reads existing: ${next.out}`);
    assert.notStrictEqual(next.nonce, r.nonce, 'a later run writes its own nonce');
    assert.strictEqual(count(trace(f), /\bstep\b.*\bset\b.*\bplan\b/g), 2, 'a later run records a start of its own');

    // #stale-lock: a lock past the bound holds nothing, even with a step standing.
    age(f.lock, STALENESS_MS + 60000);
    const late = open(f);
    assert.strictEqual(late.status, 0, `a stale lock lets the run in: ${late.err}`);
    assert.strictEqual(late.word, 'existing');
  }

  // #locked-before-cut: a fresh lock with no ledger stops the run before anything is cut.
  {
    const f = fixture();
    fs.mkdirSync(f.root, { recursive: true });
    fs.writeFileSync(f.lock, 'plan abc123\n');
    const r = open(f);
    assert.strictEqual(r.status, 3, `exits 3: ${r.out}`);
    assert.strictEqual(r.word, 'locked');
    assert.ok(!fs.existsSync(f.scopetree), 'no scopetree is cut');
    assert.ok(!fs.existsSync(path.join(f.root, 'ledger.md')), 'no ledger is written');
    assert.strictEqual(spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${BRANCH}`], { cwd: f.repo }).status, 1, 'no branch is created');
  }

  // #reused: the name exists and base holds its content — the branch is reused and re-pointed to base.
  {
    const f = fixture();
    git(['branch', BRANCH, 'main'], f.repo);
    commit(f.repo, 'later.md', 'y\n', 'later');
    const r = open(f);
    assert.strictEqual(r.status, 0, `exits 0: ${r.err}`);
    assert.strictEqual(r.word, 'reused', `prints reused: ${r.out}`);
    assert.strictEqual(git(['rev-parse', 'HEAD'], f.scopetree), git(['rev-parse', 'main'], f.repo), 're-pointed to base');
  }

  // #not-contained: the name exists with commits base never took — the commits and the rename remedy are named,
  // and nothing is written.
  {
    const f = fixture();
    git(['checkout', '-q', '-b', BRANCH], f.repo);
    commit(f.repo, 'work.md', 'w\n', 'real work');
    git(['checkout', '-q', 'main'], f.repo);
    const r = open(f);
    assert.strictEqual(r.status, 3, `exits 3: ${r.out}`);
    assert.strictEqual(r.word, 'not-contained');
    assert.match(r.out, /real work/, 'lists the commit at risk');
    assert.match(r.out, new RegExp(`remedy: git branch -m ${BRANCH} ${BRANCH}-\\d{4}-\\d{2}-\\d{2}`), 'names the rename remedy');
    assert.ok(!fs.existsSync(f.root), 'nothing is written');
  }

  // #dirty: a contained branch whose scopetree holds an uncommitted change stops before the reset.
  {
    const f = fixture();
    git(['branch', BRANCH, 'main'], f.repo);
    git(['worktree', 'add', '-q', f.scopetree, BRANCH], f.repo);
    fs.writeFileSync(path.join(f.scopetree, 'scratch.md'), 'keep me\n');
    const r = open(f);
    assert.strictEqual(r.status, 3, `exits 3: ${r.out}`);
    assert.strictEqual(r.word, 'dirty');
    assert.match(r.out, /scratch\.md/, 'names what status reported');
    assert.ok(fs.existsSync(path.join(f.scopetree, 'scratch.md')), 'the change survives');
    assert.ok(!fs.existsSync(path.join(f.root, 'ledger.md')), 'no ledger is written');
  }

  // #held: a different worktree holds the branch.
  {
    const f = fixture();
    git(['branch', BRANCH, 'main'], f.repo);
    const elsewhere = path.join(tmp('scope-open-elsewhere-'), 'wt');
    git(['worktree', 'add', '-q', elsewhere, BRANCH], f.repo);
    const r = open(f);
    assert.strictEqual(r.status, 3, `exits 3: ${r.out}`);
    assert.strictEqual(r.word, 'held');
    assert.ok(r.out.includes(elsewhere), 'names the holding worktree');
  }

  // #closed: a closed ledger from a retired label is rotated aside, and the run is cut fresh.
  {
    const f = fixture();
    fs.mkdirSync(f.root, { recursive: true });
    fs.writeFileSync(path.join(f.root, 'ledger.md'), `# Ledger — open-me\n\n**Stage:** closed\n**Branch:** ${BRANCH}\n`);
    const r = open(f);
    assert.strictEqual(r.status, 0, `exits 0: ${r.err}`);
    assert.strictEqual(r.word, 'cut');
    assert.match(ledger(f), /\*\*Stage:\*\* planned/, 'a new planned ledger');
    assert.ok(fs.readdirSync(f.root).some((n) => /^ledger-closed-/.test(n)), 'the closed ledger is rotated aside');
  }

  // #refusals: a later stage, a branch the planned ledger does not name, and a missing --base refuse with exit 1.
  {
    const f = fixture();
    fs.mkdirSync(f.root, { recursive: true });
    fs.writeFileSync(path.join(f.root, 'ledger.md'), `# Ledger — open-me\n\n**Stage:** implementing\n**Branch:** ${BRANCH}\n`);
    const r = open(f);
    assert.strictEqual(r.status, 1, 'a later stage refuses');
    assert.match(r.err, /stage "implementing"/);
    fs.writeFileSync(path.join(f.root, 'ledger.md'), `# Ledger — open-me\n\n**Stage:** planned\n**Branch:** fix/open-me\n`);
    const other = open(f);
    assert.strictEqual(other.status, 1, 'another branch refuses');
    assert.match(other.err, /names the branch fix\/open-me/);
    const noBase = spawnSync(process.execPath, [scopePath, 'open', BRANCH], { cwd: f.repo, encoding: 'utf8', timeout: 60000, killSignal: 'SIGKILL' });
    assertSpawnDecided(noBase, 'scope.js open without --base');
    assert.strictEqual(noBase.status, 1, 'a missing --base refuses');
    assert.match(noBase.stderr, /--base/);
  }

  // #in-process refusals: an unresolvable base and a scopetree git cannot read refuse with exit 1 and write nothing.
  {
    const refused = (f, argv) => {
      const r = call(argv, '', f.repo);
      assert.strictEqual(r.ok, false, `${argv.join(' ')} refuses`);
      assert.strictEqual(r.out, '', `${argv.join(' ')} prints nothing`);
      return r;
    };
    const f = fixture();
    const err = refused(f, ['open', BRANCH, '--base', 'nope']);
    assert.match(err.err, /open: the base nope does not resolve to a commit/);
    assert.strictEqual(err.exitCode, undefined, 'a refusal exits 1');
    assert.ok(!fs.existsSync(f.root), 'an unresolvable base writes no run root');
    assert.strictEqual(git(['branch', '--list', BRANCH], f.repo), '', 'and cuts no branch');

    const g = fixture();
    assert.strictEqual(open(g).status, 0, 'a first open cuts the branch');
    fs.rmSync(path.join(g.root, 'ledger.md'));
    fs.rmSync(g.lock);
    fs.writeFileSync(path.join(g.scopetree, '.git'), 'gitdir: /nonexistent/gitdir\n');
    const broken = refused(g, ['open', BRANCH, '--base', 'main']);
    assert.match(broken.err, /open: git status in .* failed/);
    assert.ok(!fs.existsSync(path.join(g.root, 'ledger.md')) && !fs.existsSync(g.lock), 'an unreadable scopetree writes no ledger and no lock');
  }

  // #unreadable: a run lock or a ledger open cannot read refuses with one `open:` line and no stack trace.
  const refusal = (r, ...names) => {
    assert.strictEqual(r.status, 1, `exits 1: ${r.out}${r.err}`);
    const lines = r.err.trimEnd().split('\n');
    assert.strictEqual(lines.length, 1, `one stderr line: ${r.err}`);
    assert.match(lines[0], /^open: /, `the line starts open: ${r.err}`);
    for (const n of names) assert.ok(lines[0].includes(n), `the line names ${n}: ${r.err}`);
  };
  const noCut = (f) => {
    assert.ok(!fs.existsSync(f.scopetree), 'no scopetree is cut');
    assert.strictEqual(git(['branch', '--list', BRANCH], f.repo), '', 'no branch is cut');
  };

  // #lock-dir: a directory at the lock path.
  {
    const f = fixture();
    fs.mkdirSync(f.lock, { recursive: true });
    refusal(open(f), f.lock, 'EISDIR');
    noCut(f);
    assert.ok(!fs.existsSync(path.join(f.root, 'ledger.md')), 'no ledger is written');
    assert.ok(fs.statSync(f.lock).isDirectory(), 'the directory stays in place');
  }

  // #lock-symlink: a dangling symlink at the lock path; nothing is written through it.
  {
    const f = fixture();
    fs.mkdirSync(f.root, { recursive: true });
    const target = path.join(f.repo, 'elsewhere.lock');
    fs.symlinkSync(target, f.lock);
    refusal(open(f), f.lock, 'symbolic link');
    noCut(f);
    assert.ok(!fs.existsSync(target), 'the link target still does not exist');
    assert.ok(fs.lstatSync(f.lock).isSymbolicLink(), 'the link stays in place');
  }

  // #ledger-unreadable: a directory at the ledger path.
  {
    const f = fixture();
    const ledgerAt = path.join(f.root, 'ledger.md');
    fs.mkdirSync(ledgerAt, { recursive: true });
    refusal(open(f), ledgerAt, 'EISDIR');
    noCut(f);
  }

  // #lock-write-fails: the lock write after the branch is set up fails; a second open once the cause is gone reuses it.
  if (process.platform !== 'win32' && process.getuid() !== 0) {
    const f = fixture();
    assert.strictEqual(open(f).status, 0, 'a first open cuts the branch');
    scope(f, 'step', 'clear');
    fs.rmSync(f.lock);
    fs.chmodSync(f.root, 0o555);
    let r;
    try {
      r = open(f);
    } finally {
      fs.chmodSync(f.root, 0o755);
    }
    refusal(r, f.lock, 'EACCES', BRANCH, f.scopetree);
    const again = open(f);
    assert.strictEqual(again.status, 0, `a second open succeeds: ${again.err}`);
    assert.strictEqual(again.word, 'existing', `reuses the branch: ${again.out}`);
  }

  // #lock-write-fails, fresh run: the lock write after cut() fails before any ledger exists; a second open reuses the cut.
  if (process.platform !== 'win32' && process.getuid() !== 0) {
    const f = fixture();
    fs.mkdirSync(f.scopetree, { recursive: true });
    fs.chmodSync(f.root, 0o555);
    let r;
    try {
      r = open(f);
    } finally {
      fs.chmodSync(f.root, 0o755);
    }
    refusal(r, f.lock, 'EACCES', BRANCH, f.scopetree);
    const again = open(f);
    assert.strictEqual(again.status, 0, `a second open of a fresh run succeeds: ${again.err}`);
    assert.strictEqual(again.word, 'reused', `reuses the branch and scopetree: ${again.out}`);
  }

  // #lock-bound: the lock ages out at the same bound the run-lock hook applies.
  assert.strictEqual(STALENESS_MS, hook.STALENESS_MS, 'open and hooks/run-lock.js share one staleness bound');

  console.log('scope-open: all checks passed');
} finally {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
}
