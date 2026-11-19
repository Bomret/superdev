'use strict';

// Suite for plugin/scripts/scope.js's `branch` verb (INV-0196): one scope-branch verdict from the ledger's `**Branch:**` line
// or the shape scan, and the shared shape rule in plugin/lib/scope-branch.js. The verb only reads, so each case builds its own
// run root under a repository made once and copied per case.

const { copyFixture, templateOnce } = require('./fixture-git');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { call } = require('./scope-setup');
const { shapeMatches } = require('../plugin/lib/scope-branch.js');

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const template = templateOnce((dir) => {
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.email', 't@t'], dir);
  git(['config', 'user.name', 't'], dir);
  fs.writeFileSync(path.join(dir, 'f'), 'x\n');
  git(['add', 'f'], dir);
  git(['commit', '-q', '-m', 'init'], dir);
}, 'scope-branch-template-');

const copies = [];
process.on('exit', () => copies.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

// A repository copy holding the given local branches and remote-tracking names, and a run root for `slug` whose ledger
// carries `ledger` text (null writes none).
function setup({ slug = 'x', local = [], remote = [], tags = [], ledger = null }) {
  const repo = copyFixture(template(), 'scope-branch-');
  copies.push(repo);
  for (const b of local) git(['branch', b], repo);
  for (const t of tags) git(['tag', t], repo);
  for (const r of remote) git(['update-ref', `refs/remotes/origin/${r}`, 'HEAD'], repo);
  const root = path.join(repo, '.superdev', 'scopes', slug);
  fs.mkdirSync(root, { recursive: true });
  if (ledger !== null) fs.writeFileSync(path.join(root, 'ledger.md'), ledger);
  return { repo, root };
}
const ledgerOf = (branch) => `# Run state\n\n**Stage:** implement\n**Branch:** ${branch}\n`;
const verdict = (s) => {
  const r = call(['branch', '--root', s.root], '', s.repo);
  assert.ok(r.ok, 'branch should not refuse: ' + r.err);
  return r.out;
};

// The ledger's branch, present locally, is the verdict, whatever the shape scan would find.
assert.strictEqual(verdict(setup({ local: ['feat/x'], ledger: ledgerOf('feat/x') })), 'ledger feat/x', 'a local ledger branch prints ledger');
assert.strictEqual(
  verdict(setup({ local: ['feature/x', 'feat/x', 'fix/x'], ledger: ledgerOf('feature/x') })),
  'ledger feature/x',
  'the ledger branch wins over a shape-ambiguous scan, and its type need not be a change type'
);

// A ledger branch that does not exist, or that names a tag, falls back to the scan.
assert.strictEqual(verdict(setup({ local: ['fix/x'], ledger: ledgerOf('feat/never-cut') })), 'guess fix/x', 'a ledger branch never cut falls back to the scan');
assert.strictEqual(verdict(setup({ local: ['fix/x'], tags: ['v1'], ledger: ledgerOf('v1') })), 'guess fix/x', 'a tag in the ledger line falls back to the scan');
assert.strictEqual(verdict(setup({ local: ['fix/x'], ledger: ledgerOf('refs/tags/zz') })), 'guess fix/x', 'a ref path in the ledger line falls back');
const sha = (() => {
  const s = setup({});
  return git(['rev-parse', 'HEAD'], s.repo);
})();
assert.strictEqual(verdict(setup({ local: ['fix/x'], ledger: ledgerOf(sha) })), 'guess fix/x', 'a SHA in the ledger line falls back to the scan');
// A remote-tracking name in the ledger line is no local branch.
assert.strictEqual(verdict(setup({ remote: ['feat/x'], ledger: ledgerOf('feat/x') })), 'guess-remote feat/x', 'a ledger branch only on the remote is a remote guess');

// The shape scan: no ledger, a ledger with no branch line, one match, a remote-only match, ambiguity, none.
assert.strictEqual(verdict(setup({ local: ['feat/x'] })), 'guess feat/x', 'one local match is a guess');
assert.strictEqual(verdict(setup({ local: ['feat/x'], ledger: '# Run state\n\n**Stage:** implement\n' })), 'guess feat/x', 'a ledger without a Branch line scans');
assert.strictEqual(verdict(setup({ remote: ['refactor/x'] })), 'guess-remote refactor/x', 'a match only on the remote is guess-remote');
assert.strictEqual(verdict(setup({ local: ['feat/x'], remote: ['feat/x'] })), 'guess feat/x', 'a local branch with its remote copy is one local match');
assert.strictEqual(verdict(setup({ local: ['feat/x', 'fix/x'] })), 'ambiguous feat/x fix/x', 'two change types for one slug are ambiguous, naming both');
assert.strictEqual(verdict(setup({ local: ['feat/x'], remote: ['fix/x'] })), 'ambiguous feat/x fix/x', 'a local and a remote-only match are ambiguous');
assert.strictEqual(verdict(setup({ local: ['wip/x', 'slice/x/01', 'feature/x', 'x', 'feat/xy', 'feat/y/x2'] })), 'none', 'no shape match is none');
assert.strictEqual(verdict(setup({ local: ['feat/y'] })), 'none', 'another scope\'s branch is none');
assert.strictEqual(verdict(setup({ slug: 'my-slug', local: ['feat/my-slug'] })), 'guess feat/my-slug', 'the slug is the run root directory name');

// The verdict is one line.
assert.ok(!verdict(setup({ local: ['feat/x', 'fix/x'] })).includes('\n'), 'one verdict, one line');

// A failing branch listing is git-failed with its reason, never none (INV-0194, INV-0043).
{
  const notRepo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-branch-norepo-')));
  copies.push(notRepo);
  const root = path.join(notRepo, '.superdev', 'scopes', 'x');
  fs.mkdirSync(root, { recursive: true });
  const r = call(['branch', '--root', root], '', notRepo);
  assert.ok(r.ok, 'a failed listing is a verdict, not a refusal');
  assert.match(r.out, /^git-failed .*status 128/, 'git-failed names how the listing failed');
  assert.doesNotMatch(r.out, /^none/, 'a failed listing is never none');
  const withLedger = (() => {
    fs.writeFileSync(path.join(root, 'ledger.md'), ledgerOf('feat/x'));
    return call(['branch', '--root', root], '', notRepo).out;
  })();
  assert.match(withLedger, /^git-failed /, 'a failed listing is git-failed with a ledger branch too');
}

// Usage refusals.
{
  const s = setup({});
  assert.strictEqual(call(['branch'], '', s.repo).ok, false, 'no --root refuses');
  assert.strictEqual(call(['branch', '--root', s.root, 'extra'], '', s.repo).ok, false, 'an extra argument refuses');
}

// A relative --root resolves against the cwd, so the ledger is read from a cwd other than the repository root.
{
  const s = setup({ local: ['feat/x', 'fix/x'], ledger: ledgerOf('fix/x') });
  const r = call(['branch', '--root', path.join('scopes', 'x')], '', path.join(s.repo, '.superdev'));
  assert.ok(r.ok, 'a relative root is no refusal: ' + r.err);
  assert.strictEqual(r.out, 'ledger fix/x', 'a relative --root reads the ledger against the cwd');
}

// A --root that names no directory is refused with one line naming the path, never a scan verdict for its basename.
{
  const s = setup({ local: ['feat/x'] });
  const missing = path.join(s.repo, '.superdev', 'scopes', 'gone');
  const r = call(['branch', '--root', missing], '', s.repo);
  assert.strictEqual(r.ok, false, 'a missing root refuses');
  assert.ok(r.err.includes(missing) && !r.err.includes('\n'), 'the refusal is one line naming the path');
  assert.strictEqual(r.out, '', 'a refused root prints no verdict');
  const file = path.join(s.repo, 'f');
  assert.strictEqual(call(['branch', '--root', file], '', s.repo).ok, false, 'a file as root refuses');
}

// The shared rule returns every match, in listing order, and only change-typed scope branches.
assert.deepStrictEqual(shapeMatches(['feat/x', 'fix/x', 'wip/x', 'slice/x/03', 'x'], 'x'), ['feat/x', 'fix/x'], 'shapeMatches returns every match');
assert.deepStrictEqual(shapeMatches(new Set(['refactor/exports']), 'exports'), ['refactor/exports'], 'a typed scope branch counts');
assert.deepStrictEqual(shapeMatches(new Set(['wip/exports', 'slice/exports/03', 'exports']), 'exports'), [], 'untyped, slice, and bare names do not');

// Read-only: ledger, trace, digest, refs, and the run.lock mtime stay as they were.
{
  const s = setup({ local: ['feat/x'], ledger: ledgerOf('feat/x') });
  const files = { 'trace.log': 'a\n', 'digest': 'd\n', 'run.lock': 'l\n' };
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(s.root, name), text);
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  fs.utimesSync(path.join(s.root, 'run.lock'), old, old);
  const snap = () => ({
    refs: git(['for-each-ref'], s.repo),
    files: fs.readdirSync(s.root).sort().map((f) => [f, fs.readFileSync(path.join(s.root, f), 'utf8'), fs.statSync(path.join(s.root, f)).mtimeMs]),
    worktrees: git(['worktree', 'list'], s.repo),
  });
  const before = snap();
  verdict(s);
  assert.deepStrictEqual(snap(), before, 'the verb changes no ref, run-root file or mtime, or worktree');
}
