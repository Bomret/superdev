'use strict';

// Suite for `scope.js abandon inventory` (ADR 0288, INV-0211, INV-0009): the items a run owns, the marks that show lost
// work, the refusals, the run lock, and the token that hashes the item lines. Real git repositories, worktrees, and a real
// bare remote. The repository and its remote are built once into a template and copied for each case.

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { scopePath } = require('./scope-setup');
const { copyFixture, templateOnce } = require('./fixture-git');
const { assertSpawnDecided } = require('./spawn-verdict');
const { verbAbandon } = require('../plugin/lib/abandon.js');

const made = [];
after(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

const SCOPE = 'demo';
const BRANCH = `feat/${SCOPE}`;

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function commit(repo, file, body, msg) {
  fs.writeFileSync(path.join(repo, file), body);
  git(['add', '.'], repo);
  git(['commit', '-q', '-m', msg], repo);
  return git(['rev-parse', 'HEAD'], repo);
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
  fs.writeFileSync(path.join(repo, 'docs', 'agents', 'code-management.md'), '- **Remote:** `origin`.\n');
  commit(repo, 'README.md', 'x\n', 'init');
  git(['remote', 'add', 'origin', origin], repo);
  git(['push', '-q', 'origin', 'main'], repo);
}, 'scope-abandon-template-');

// A run at `implementing`: a scopetree on the scope branch pushed to origin and advanced past main, two slicetrees (the
// first with an untracked file), two slice branches, staged pages, and the run-state ref on origin.
function fixture({ stage = 'implementing', ledger } = {}) {
  const copy = copyFixture(template(), 'scope-abandon-');
  made.push(copy);
  const repo = path.join(copy, 'repo');
  const origin = path.join(copy, 'origin');
  git(['remote', 'set-url', 'origin', origin], repo);
  const root = path.join(repo, '.superdev', 'scopes', SCOPE);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'ledger.md'), ledger || `# Ledger — ${SCOPE}\n\n**Stage:** ${stage}\n**Branch:** ${BRANCH}\n`);
  const scopetree = path.join(root, 'scopetree');
  git(['worktree', 'add', '-q', '-b', BRANCH, scopetree, 'main'], repo);
  commit(scopetree, 'scope.md', 'work\n', 'feat: scope work');
  git(['push', '-q', 'origin', BRANCH], repo);
  git(['fetch', '-q', 'origin'], repo);
  for (const id of ['01', '02']) {
    const tree = path.join(root, 'slicetrees', id);
    git(['worktree', 'add', '-q', '-b', `slice/${SCOPE}/${id}`, tree, BRANCH], repo);
    commit(tree, `slice-${id}.md`, 'slice\n', `feat: slice ${id}`);
  }
  fs.writeFileSync(path.join(root, 'slicetrees', '01', 'untracked.txt'), 'new\n');
  const pending = path.join(repo, '.superdev', 'kb-pending', SCOPE);
  fs.mkdirSync(pending, { recursive: true });
  fs.writeFileSync(path.join(pending, 'page.md'), '# page\n');
  git(['push', '-q', 'origin', `${BRANCH}:refs/superdev/${SCOPE}`], repo);
  return { repo, origin, root, scopetree, copy };
}

function inv(f, { extra = ['--remote', 'origin'], cwd, root } = {}) {
  const result = spawnSync(process.execPath, [scopePath, 'abandon', 'inventory', '--root', root || f.root, '--base', 'main', ...extra], {
    cwd: cwd || f.repo, encoding: 'utf8', timeout: 120000, killSignal: 'SIGKILL',
  });
  assertSpawnDecided(result, 'scope.js abandon inventory');
  const lines = result.stdout.split('\n').filter(Boolean);
  const last = lines[lines.length - 1] || '';
  return {
    status: result.status,
    err: result.stderr,
    out: result.stdout,
    items: lines.filter((l) => !l.startsWith('token ')).map((l) => l.split('\t')),
    token: last.startsWith('token ') ? last.slice(6) : null,
  };
}

const find = (r, kind, subject) => r.items.find((i) => i[0] === kind && (!subject || i[1].includes(subject)));

test('#module: the verb\'s module exports the entry `scope.js abandon` calls.', () => {
  assert.strictEqual(typeof verbAbandon, 'function');
});

test('the inventory lists every item with its tip and marks the dirty tree, the uncontained branches, and the staged pages', () => {
  const f = fixture();
  const r = inv(f);
  assert.strictEqual(r.status, 0, r.err);
  const sliceTip = (id) => git(['rev-parse', `refs/heads/slice/${SCOPE}/${id}`], f.repo);
  const scopeTip = git(['rev-parse', `refs/heads/${BRANCH}`], f.repo);
  const w01 = find(r, 'worktree', 'slicetrees/01');
  assert.ok(w01.includes('dirty'), 'slicetree 01 is dirty');
  assert.ok(w01.some((m) => m.startsWith('status=')));
  assert.ok(!find(r, 'worktree', 'slicetrees/02').includes('dirty'));
  assert.strictEqual(find(r, 'worktree', 'scopetree')[2], scopeTip);
  assert.deepStrictEqual(find(r, 'slice-branch', '/01').slice(2), [sliceTip('01'), 'uncontained 2']);
  assert.strictEqual(find(r, 'slice-branch', '/02')[2], sliceTip('02'));
  assert.deepStrictEqual(find(r, 'scope-branch').slice(2), [scopeTip, 'uncontained 1']);
  assert.deepStrictEqual(find(r, 'scope-tracking').slice(2), [scopeTip, 'uncontained 1']);
  assert.deepStrictEqual(find(r, 'scope-remote').slice(1), ['origin refs/heads/feat/demo', scopeTip, 'uncontained 1']);
  assert.ok(find(r, 'run-state-ref', `refs/superdev/${SCOPE}`));
  assert.deepStrictEqual(find(r, 'kb-pending').slice(3), ['pages=1', 'loss']);
  assert.deepStrictEqual(r.items[r.items.length - 1].slice(0, 2), ['run-root', fs.realpathSync(f.root)]);
  assert.ok(r.items.findIndex((i) => i[0] === 'worktree') < r.items.findIndex((i) => i[0] === 'slice-branch'), 'worktrees print first');
  assert.ok(r.items.findIndex((i) => i[1].endsWith('scopetree')) > r.items.findIndex((i) => i[1].endsWith('slicetrees/02')), 'the scopetree follows the slicetrees');
});

test('a remote scope branch ahead of the local one is listed with its own tip and its own uncontained count', () => {
  const f = fixture();
  const other = path.join(f.copy, 'other');
  git(['clone', '-q', f.origin, other], f.copy);
  git(['config', 'user.email', 't@example.com'], other);
  git(['config', 'user.name', 't'], other);
  git(['checkout', '-q', BRANCH], other);
  commit(other, 'a.md', 'a\n', 'feat: a');
  const ahead = commit(other, 'b.md', 'b\n', 'feat: b');
  git(['push', '-q', 'origin', BRANCH], other);
  git(['fetch', '-q', 'origin'], f.repo);
  const r = inv(f);
  assert.deepStrictEqual(find(r, 'scope-remote').slice(2), [ahead, 'uncontained 3']);
  assert.strictEqual(find(r, 'scope-branch')[3], 'uncontained 1');
});

test('a remote tip whose commits are not fetched is marked unknown', () => {
  const f = fixture();
  const other = path.join(f.copy, 'other');
  git(['clone', '-q', f.origin, other], f.copy);
  git(['config', 'user.email', 't@example.com'], other);
  git(['config', 'user.name', 't'], other);
  git(['checkout', '-q', BRANCH], other);
  commit(other, 'a.md', 'a\n', 'feat: a');
  git(['push', '-q', 'origin', BRANCH], other);
  const r = inv(f);
  assert.match(find(r, 'scope-remote')[3], /^unknown /);
});

test('two inventories of an unchanged repository print the same token', () => {
  const f = fixture();
  assert.strictEqual(inv(f).token, inv(f).token);
  assert.match(inv(f).token, /^[0-9a-f]{64}$/);
});

test('a new commit on a listed branch, a new untracked file, or a new slice branch changes the token', () => {
  const f = fixture();
  const t0 = inv(f).token;
  commit(path.join(f.root, 'slicetrees', '02'), 'more.md', 'm\n', 'feat: more');
  const t1 = inv(f).token;
  assert.notStrictEqual(t1, t0);
  fs.writeFileSync(path.join(f.root, 'slicetrees', '01', 'second.txt'), 's\n');
  const t2 = inv(f).token;
  assert.notStrictEqual(t2, t1);
  git(['branch', `slice/${SCOPE}/03`, 'main'], f.repo);
  assert.notStrictEqual(inv(f).token, t2);
});

test('a run lock under an hour old refuses at planned and at implementing, naming the lock and when it goes stale', () => {
  for (const stage of ['planned', 'implementing']) {
    const f = fixture({ stage });
    fs.writeFileSync(path.join(f.root, 'run.lock'), 'plan abc123\n');
    const r = inv(f);
    assert.strictEqual(r.status, 1);
    assert.strictEqual(r.out, '');
    assert.match(r.err, /run\.lock/);
    assert.match(r.err, /plan abc123/);
    assert.match(r.err, /goes stale at \d{4}-\d\d-\d\dT/);
  }
});

test('a run lock over an hour old is listed and does not refuse', () => {
  const f = fixture();
  const lock = path.join(f.root, 'run.lock');
  fs.writeFileSync(lock, 'plan abc123\n');
  const old = new Date(Date.now() - 2 * 3600 * 1000);
  fs.utimesSync(lock, old, old);
  const r = inv(f);
  assert.strictEqual(r.status, 0, r.err);
  assert.ok(find(r, 'lock').includes('stale'));
});

test('a run lock that is a directory refuses', () => {
  const f = fixture();
  fs.mkdirSync(path.join(f.root, 'run.lock'));
  const r = inv(f);
  assert.strictEqual(r.status, 1);
  assert.match(r.err, /not a regular file/);
});

test('a run at shipped or closed refuses naming /superdev:wrap-up; documented-unreviewed and submitted are inventoried', () => {
  for (const stage of ['shipped', 'closed']) {
    const r = inv(fixture({ stage }));
    assert.strictEqual(r.status, 1);
    assert.match(r.err, /\/superdev:wrap-up/);
  }
  for (const stage of ['documented-unreviewed', 'submitted']) {
    const r = inv(fixture({ stage }));
    assert.strictEqual(r.status, 0, r.err);
    assert.ok(find(r, 'run-root').includes(`stage=${stage}`));
  }
});

test('an absent ledger, an unreadable ledger, and a stage outside the stage rank each refuse', () => {
  const none = fixture();
  fs.rmSync(path.join(none.root, 'ledger.md'));
  assert.match(inv(none).err, /no ledger/);
  const dir = fixture();
  fs.rmSync(path.join(dir.root, 'ledger.md'));
  fs.mkdirSync(path.join(dir.root, 'ledger.md'));
  const unreadable = inv(dir);
  assert.strictEqual(unreadable.status, 1);
  assert.match(unreadable.err, /cannot be read/);
  const odd = inv(fixture({ ledger: `**Stage:** sideways\n**Branch:** ${BRANCH}\n` }));
  assert.strictEqual(odd.status, 1);
  assert.match(odd.err, /sideways/);
});

test('a run whose ledger was edited outside scope.js is still inventoried', () => {
  const f = fixture();
  const edited = inv(f);
  fs.appendFileSync(path.join(f.root, 'ledger.md'), '\nedited by hand\n');
  fs.writeFileSync(path.join(f.root, 'digest.json'), '{"stale":true}\n');
  const r = inv(f);
  assert.strictEqual(r.status, 0, r.err);
  assert.strictEqual(r.items.length, edited.items.length);
});

test('a --root that is a symlink leading outside .superdev/scopes refuses', () => {
  const f = fixture();
  const outside = path.join(f.copy, 'elsewhere');
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'ledger.md'), `**Stage:** implementing\n**Branch:** ${BRANCH}\n`);
  const link = path.join(f.repo, '.superdev', 'scopes', 'linked');
  fs.symlinkSync(outside, link);
  const r = inv(f, { root: link });
  assert.strictEqual(r.status, 1);
  assert.match(r.err, /no run root/);
});

test('a **Branch:** line naming base, or not <type>/<scope>, refuses', () => {
  const named = inv(fixture({ ledger: '**Stage:** implementing\n**Branch:** main\n' }));
  assert.strictEqual(named.status, 1);
  assert.match(named.err, /names the base branch/);
  const refMain = inv(fixture({ ledger: '**Stage:** implementing\n**Branch:** refs/heads/main\n' }));
  assert.match(refMain.err, /names the base branch/);
  const odd = inv(fixture({ ledger: '**Stage:** implementing\n**Branch:** feat/other\n' }));
  assert.strictEqual(odd.status, 1);
  assert.match(odd.err, /not <type>\/demo/);
});

test('an unreachable remote marks the remote branch and the run-state ref unknown, and the inventory completes', () => {
  const f = fixture();
  git(['remote', 'set-url', 'origin', path.join(f.copy, 'no-such-remote')], f.repo);
  const r = inv(f);
  assert.strictEqual(r.status, 0, r.err);
  assert.match(find(r, 'scope-remote')[3], /^unknown /);
  assert.match(find(r, 'run-state-ref')[3], /^unknown /);
  assert.ok(r.token);
});

test('a branch of the run checked out in the main working tree is listed kept-checked-out', () => {
  const f = fixture();
  git(['branch', `slice/${SCOPE}/03`, 'main'], f.repo);
  git(['checkout', '-q', `slice/${SCOPE}/03`], f.repo);
  const r = inv(f);
  assert.ok(find(r, 'slice-branch', '/03').includes('kept-checked-out'));
  assert.ok(!find(r, 'slice-branch', '/01').includes('kept-checked-out'));
});

test('staged pages inside a listed worktree are marked as loss', () => {
  const f = fixture();
  const dir = path.join(f.root, 'slicetrees', '02', '.superdev', 'kb-pending', 'x');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'p.md'), 'p\n');
  const r = inv(f);
  assert.deepStrictEqual(find(r, 'kb-staged').slice(3), ['pages=1', 'loss']);
});

test('a stale worktree registration is listed as stale', () => {
  const f = fixture();
  fs.rmSync(path.join(f.root, 'slicetrees', '02'), { recursive: true });
  const r = inv(f);
  assert.ok(find(r, 'worktree', 'slicetrees/02').includes('stale'));
});

test('abandon apply is not implemented, and an unknown subverb refuses', () => {
  const f = fixture();
  for (const sub of ['apply', 'bogus']) {
    const r = spawnSync(process.execPath, [scopePath, 'abandon', sub], { cwd: f.repo, encoding: 'utf8' });
    assert.strictEqual(r.status, 1);
    assert.strictEqual(r.stdout, '');
  }
});
