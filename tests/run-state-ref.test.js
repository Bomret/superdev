'use strict';

// Suite for the run-state push of `scope.js step clear` and `step block` (ADR 0202, INV-0179, INV-0009). Real
// repositories and a real bare remote throughout. Each case builds its own fixture.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { scopePath, writeOperatorConfig } = require('./scope-setup');
const { copyFixture, templateOnce } = require('./fixture-git');
const { assertSpawnDecided } = require('./spawn-verdict');
const { pushRunState } = require('../plugin/lib/run-state-ref.js');

const SCOPE = 'push-scope';
const made = [];

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
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
  fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
  git(['add', '.'], repo);
  git(['commit', '-q', '-m', 'init'], repo);
  git(['remote', 'add', 'origin', origin], repo);
}, 'run-state-ref-template-');

function fixture({ scope = SCOPE, files = true, doc = true } = {}) {
  const copy = copyFixture(template(), 'run-state-ref-');
  made.push(copy);
  const repo = path.join(copy, 'repo');
  const origin = path.join(copy, 'origin');
  git(['remote', 'set-url', 'origin', origin], repo);
  if (!doc) fs.rmSync(path.join(repo, 'docs'), { recursive: true });
  const root = path.join(repo, '.superdev', 'scopes', scope);
  fs.mkdirSync(path.join(root, 'reports', 'S1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ledger.md'), '# Ledger — x\n\n**Stage:** planned\n**Step:** implement\n');
  if (files) {
    fs.writeFileSync(path.join(root, 'dod.md'), 'dod\n');
    fs.writeFileSync(path.join(root, 'trace.log'), '2026-01-01T00:00:00Z a b\n');
    fs.writeFileSync(path.join(root, 'interfaces.md'), 'iface\n');
    fs.writeFileSync(path.join(root, 'reports', 'S1', 'progress.md'), 'p\n');
  } else {
    fs.rmSync(path.join(root, 'reports'), { recursive: true });
  }
  return { repo, origin, root };
}

function step(f, sub = 'clear', env = {}) {
  const r = spawnSync(process.execPath, [scopePath, 'step', sub, '--root', f.root], {
    cwd: f.repo,
    encoding: 'utf8',
    timeout: 120000,
    killSignal: 'SIGKILL',
    env: { ...process.env, ...env },
  });
  assertSpawnDecided(r, 'scope.js step ' + sub);
  return r;
}

const refName = `refs/superdev/${SCOPE}`;
const remoteTip = (f, scope = SCOPE) => {
  const r = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/superdev/${scope}`], { cwd: f.origin, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};
const remoteFiles = (f) => git(['ls-tree', '-r', '--name-only', refName], f.origin).split('\n').filter(Boolean);
const ledgerOf = (f) => fs.readFileSync(path.join(f.root, 'ledger.md'), 'utf8');

try {
  // #first-push: the ref is absent; the tree holds exactly the handoff items, byte for byte.
  {
    const f = fixture();
    const r = step(f);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /run-state: sent/);
    assert.deepStrictEqual(remoteFiles(f), ['dod.md', 'interfaces.md', 'reports/S1/progress.md', 'trace.digest', 'trace.log']);
    assert.strictEqual(git(['show', `${refName}:interfaces.md`], f.origin), 'iface');
    assert.strictEqual(git(['show', `${refName}:reports/S1/progress.md`], f.origin), 'p');
  }

  // #block and #parentless: block pushes the same way; a second push is a parentless commit.
  {
    const f = fixture();
    step(f, 'block');
    const first = remoteTip(f);
    assert.ok(first, 'block pushes');
    fs.appendFileSync(path.join(f.root, 'interfaces.md'), 'more\n');
    const r = step(f, 'block');
    assert.match(r.stdout, /run-state: sent/);
    assert.notStrictEqual(remoteTip(f), first);
    assert.strictEqual(git(['rev-list', '--count', refName], f.origin), '1', 'no history');
    assert.strictEqual(git(['rev-list', '--parents', '-n1', refName], f.origin), remoteTip(f), 'no parent');
  }

  // #stage-ends-step: a stage write that closes the standing step sends the ref, so implement's ticks in dod.md
  // reach it (ADR 0206); a stage write with no standing step sends nothing.
  {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, 'dod.md'), '- [x] works — S1 — met: green\n');
    const set = (stage) => {
      const r = spawnSync(process.execPath, [scopePath, 'stage', 'set', stage, '--root', f.root], { cwd: f.repo, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL' });
      assertSpawnDecided(r, 'scope.js stage set');
      return r;
    };
    const r = set('merged');
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /run-state: sent/, r.stdout);
    assert.strictEqual(git(['show', `${refName}:dod.md`], f.origin), '- [x] works — S1 — met: green');
    const tip = remoteTip(f);
    const again = set('reviewed');
    assert.strictEqual(again.status, 0, again.stderr);
    assert.doesNotMatch(again.stdout, /run-state:/, 'no standing step, nothing sent');
    assert.strictEqual(remoteTip(f), tip);
  }

  // #closed-sends-nothing: wrap-up deletes the ref before its `stage set closed`, which closes the standing step;
  // that write sends nothing, so a closed run leaves no ref on the remote.
  {
    const f = fixture();
    fs.writeFileSync(path.join(f.root, 'ledger.md'), '# Ledger — x\n\n**Stage:** shipped\n**Step:** wrap-up\n');
    pushRunState(f.root, f.repo);
    assert.ok(remoteTip(f), 'ref sent');
    const del = spawnSync(process.execPath, [scopePath, 'run-state', 'delete', '--root', f.root], { cwd: f.repo, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL' });
    assertSpawnDecided(del, 'scope.js run-state delete');
    assert.strictEqual(remoteTip(f), null, 'ref deleted');
    const r = spawnSync(process.execPath, [scopePath, 'stage', 'set', 'closed', '--root', f.root], { cwd: f.repo, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL' });
    assertSpawnDecided(r, 'scope.js stage set');
    assert.strictEqual(r.status, 0, r.stderr);
    assert.doesNotMatch(ledgerOf(f), /\*\*Step:\*\*/, 'the step closed');
    assert.doesNotMatch(r.stdout, /run-state:/, r.stdout);
    assert.strictEqual(remoteTip(f), null, 'no ref after close');
  }

  // #lease: another clone moved the ref; the push refuses, the remote stays, the ledger write is done.
  {
    const f = fixture();
    step(f, 'block');
    const other = path.join(path.dirname(f.repo), 'other');
    git(['clone', '-q', f.origin, other], path.dirname(f.repo));
    git(['config', 'user.email', 't@e.com'], other);
    git(['config', 'user.name', 't'], other);
    git(['fetch', '-q', 'origin', `${refName}:refs/tmp/x`], other);
    fs.writeFileSync(path.join(other, 'z'), 'z');
    git(['add', 'z'], other);
    git(['commit', '-q', '-m', 'z'], other);
    git(['push', '-q', '--force', 'origin', `HEAD:${refName}`], other);
    const moved = remoteTip(f);
    const r = step(f, 'clear');
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /run-state: refused/);
    assert.strictEqual(remoteTip(f), moved, 'remote unchanged');
    assert.doesNotMatch(ledgerOf(f), /\*\*Step:\*\*/, 'ledger write done');
  }

  // #unreachable and #unknown remote: reported, status 0, ledger written.
  {
    const f = fixture();
    git(['remote', 'set-url', 'origin', path.join(f.origin, 'missing')], f.repo);
    const r = step(f);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /run-state: not sent/);
    assert.doesNotMatch(ledgerOf(f), /\*\*Step:\*\*/);
    const g = fixture();
    git(['remote', 'remove', 'origin'], g.repo);
    const r2 = step(g);
    assert.strictEqual(r2.status, 0);
    assert.match(r2.stdout, /run-state: not sent/);
  }

  // #hung: a pre-push hook outlasts the bound.
  {
    const f = fixture();
    const hook = path.join(f.repo, '.git', 'hooks', 'pre-push');
    fs.writeFileSync(hook, '#!/bin/sh\nexec sleep 8\n');
    fs.chmodSync(hook, 0o755);
    writeOperatorConfig(f.repo, { 'code-host': { pushTimeoutMs: 1500 } });
    const r = step(f, 'clear');
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /bound of 1500 ms \(code-host\.pushTimeoutMs in \.superdev\/info\.json/);
    assert.strictEqual(remoteTip(f), null);
    assert.doesNotMatch(ledgerOf(f), /\*\*Step:\*\*/);
  }

  // #hung-worktree: the same bound, with `info.json` only in the main checkout, read by a step run from a linked worktree.
  {
    const f = fixture();
    const hook = path.join(f.repo, '.git', 'hooks', 'pre-push');
    fs.writeFileSync(hook, '#!/bin/sh\nexec sleep 8\n');
    fs.chmodSync(hook, 0o755);
    writeOperatorConfig(f.repo, { 'code-host': { pushTimeoutMs: 1500 } });
    const wtDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-state-ref-wt-'));
    made.push(wtDir);
    const wt = path.join(wtDir, 'tree');
    git(['worktree', 'add', '-q', '--detach', wt], f.repo);
    const r = step({ ...f, repo: wt });
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /bound/);
    assert.strictEqual(remoteTip(f), null);
  }

  // #no-doc and #no-remote-value: nothing pushed, one note.
  {
    const f = fixture({ doc: false });
    const r = step(f);
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout.trim().split('\n').length, 1);
    assert.match(r.stdout, /no docs\/agents\/code-management.md/);
    assert.strictEqual(remoteTip(f), null);
    const g = fixture();
    fs.writeFileSync(path.join(g.repo, 'docs', 'agents', 'code-management.md'), '# CM\n');
    const r2 = step(g);
    assert.match(r2.stdout, /no Remote: value/);
    assert.strictEqual(remoteTip(g), null);
  }

  // #checkout-untouched (INV-0179): status, index, and HEAD are unchanged across a push.
  {
    const f = fixture();
    git(['add', '-A', '--', 'docs'], f.repo);
    const snap = () => [git(['status', '--porcelain'], f.repo), git(['write-tree'], f.repo), git(['rev-parse', 'HEAD'], f.repo), git(['symbolic-ref', 'HEAD'], f.repo)];
    const before = snap();
    step(f, 'block');
    assert.ok(remoteTip(f));
    assert.deepStrictEqual(snap(), before);
  }

  // #bad-ref-name: a scope git rejects pushes nothing and says so.
  {
    const f = fixture({ scope: 'bad..name' });
    const r = step(f);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /no usable ref name/);
    assert.strictEqual(git(['for-each-ref', 'refs/superdev'], f.origin), '');
  }

  // #empty: no item exists, an empty tree is pushed.
  {
    const f = fixture({ files: false });
    const r = step(f);
    assert.match(r.stdout, /run-state: sent/);
    assert.deepStrictEqual(remoteFiles(f), ['trace.digest', 'trace.log'], 'only the trace the step itself wrote, with its digest');
  }

  // #url-remote: a `Remote:` given as a URL records a seen tip, so a second push succeeds.
  {
    const f = fixture();
    const url = 'file://' + f.origin;
    fs.writeFileSync(path.join(f.repo, 'docs', 'agents', 'code-management.md'), `# CM\n\n- **Remote:** \`${url}\`.\n`);
    assert.match(step(f, 'block').stdout, /run-state: sent/);
    fs.appendFileSync(path.join(f.root, 'interfaces.md'), 'more\n');
    const r = step(f, 'block');
    assert.match(r.stdout, /run-state: sent/, r.stdout);
    assert.doesNotMatch(r.stdout, /seen tip/);
  }

  // #seed-remote: the seeds' `- **Remote**: ` spelling (colon outside the bold) names the remote too.
  {
    const f = fixture();
    fs.writeFileSync(path.join(f.repo, 'docs', 'agents', 'code-management.md'), '# CM\n\n- **Remote**: `origin` (GitHub). Confirm with `git remote -v`.\n');
    const r = step(f, 'clear');
    assert.match(r.stdout, /run-state: sent/, r.stdout);
    assert.ok(remoteTip(f), 'the ref is on the remote');
  }

  // #seen-unwritable:the push lands but the seen tip cannot be recorded; the line says the next push refuses.
  {
    const f = fixture();
    fs.writeFileSync(path.join(f.repo, '.git', 'refs', 'superdev-seen'), 'blocker');
    const r = step(f, 'block');
    assert.match(r.stdout, /run-state: sent .*\(recording the seen tip failed, the next send will refuse\)/, r.stdout);
  }

  // #empty-tree: a root with none of the handoff items pushes an empty tree.
  {
    const f = fixture({ files: false });
    fs.rmSync(path.join(f.root, 'trace.log'), { force: true });
    const out = pushRunState(f.root, f.repo);
    assert.match(out, /run-state: sent/, out);
    assert.deepStrictEqual(remoteFiles(f), []);
  }
  // #delete: `scope.js run-state delete` removes the remote ref and the local seen ref; no lease.
  {
    const del = (f) => {
      const r = spawnSync(process.execPath, [scopePath, 'run-state', 'delete', '--root', f.root], { cwd: f.repo, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL' });
      assertSpawnDecided(r, 'scope.js run-state delete');
      return r;
    };
    const f = fixture();
    step(f);
    assert.ok(remoteTip(f), 'sent');
    const r = del(f);
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /run-state: deleted/, r.stdout);
    assert.strictEqual(remoteTip(f), null, 'remote ref gone');
    assert.strictEqual(git(['for-each-ref', 'refs/superdev-seen'], f.repo), '', 'seen ref cleared');
    // A remote ref that moved since this machine saw it is deleted all the same: no lease.
    assert.match(pushRunState(f.root, f.repo), /run-state: sent/);
    const moved = git(['-c', 'user.name=t', '-c', 'user.email=t@e', 'commit-tree', git(['rev-parse', `${refName}^{tree}`], f.origin), '-m', 'moved'], f.origin);
    git(['update-ref', refName, moved], f.origin);
    assert.strictEqual(del(f).status, 0);
    assert.strictEqual(remoteTip(f), null, 'moved ref deleted');
    // Already absent: no error.
    const again = del(f);
    assert.strictEqual(again.status, 0, again.stderr);
    assert.match(again.stdout, /run-state: (no ref|deleted)/, again.stdout);
    // A remote that fails a delete with the missing-ref wording reports no ref, exit 0 (a local bare repository exits 0 for a missing ref, so a hook stands in).
    assert.match(pushRunState(f.root, f.repo), /run-state: sent/);
    const gone = path.join(f.origin, 'hooks', 'pre-receive');
    fs.writeFileSync(gone, '#!/bin/sh\necho "error: unable to delete: remote ref does not exist" >&2\nexit 1\n', { mode: 0o755 });
    const absent = del(f);
    assert.strictEqual(absent.status, 0, absent.stderr);
    assert.match(absent.stdout, /run-state: no ref /, absent.stdout);
    fs.rmSync(gone);
    git(['update-ref', '-d', refName], f.origin);
    // A real failure whose text says "unable to delete" is not an absent ref: reported as not deleted, exit 0.
    assert.match(pushRunState(f.root, f.repo), /run-state: sent/);
    const hook = path.join(f.origin, 'hooks', 'pre-receive');
    fs.writeFileSync(hook, '#!/bin/sh\necho "unable to delete: locked" >&2\nexit 1\n', { mode: 0o755 });
    const locked = del(f);
    assert.strictEqual(locked.status, 0, locked.stderr);
    assert.match(locked.stdout, /run-state: not deleted: /, locked.stdout);
    assert.ok(remoteTip(f), 'ref kept');
    fs.rmSync(hook);
    // No Remote: value: no error.
    const g = fixture({ doc: false });
    const n = del(g);
    assert.strictEqual(n.status, 0, n.stderr);
    assert.match(n.stdout, /run-state: not deleted, /, n.stdout);
    // Unreachable remote: reported, exit 0.
    const h = fixture();
    git(['remote', 'set-url', 'origin', path.join(h.repo, 'nonexistent')], h.repo);
    const u = del(h);
    assert.strictEqual(u.status, 0, u.stderr);
    assert.match(u.stdout, /run-state: not deleted: /, u.stdout);
  }
} finally {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
}
console.log('run-state-ref: ok');
