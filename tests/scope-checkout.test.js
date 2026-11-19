'use strict';

// Suite for plugin/scripts/scope.js's `checkout` verb (INV-0196): one scope-checkout verdict from the scope branch's resolution,
// `git worktree list`, and the ledger's stage. The verb only reads, so each case builds its own repository copy and run root.

const { copyFixture, templateOnce } = require('./fixture-git');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { call } = require('./scope-setup');

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const template = templateOnce((dir) => {
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.email', 't@t'], dir);
  git(['config', 'user.name', 't'], dir);
  fs.writeFileSync(path.join(dir, 'f'), 'x\n');
  git(['add', 'f'], dir);
  git(['commit', '-q', '-m', 'init'], dir);
}, 'scope-checkout-template-');

const copies = [];
process.on('exit', () => copies.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

// A repository copy with branch `feat/x` and a run root `x` whose ledger carries `stage`.
function setup({ stage = 'implementing' } = {}) {
  const repo = copyFixture(template(), 'scope-checkout-');
  copies.push(repo);
  git(['branch', 'feat/x'], repo);
  const root = path.join(repo, '.superdev', 'scopes', 'x');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'ledger.md'), `# Run state\n\n**Stage:** ${stage}\n**Branch:** feat/x\n`);
  return { repo, root, tree: path.join(root, 'scopetree') };
}
const verdict = (s, root = s.root) => {
  const r = call(['checkout', '--root', root], '', s.repo);
  assert.ok(r.ok, 'checkout should not refuse: ' + r.err);
  return r.out;
};
const real = (p) => fs.realpathSync(p);

// A registered scopetree on the scope branch is present, and the path is the scopetree.
{
  const s = setup();
  git(['worktree', 'add', '-q', s.tree, 'feat/x'], s.repo);
  assert.strictEqual(verdict(s), `present ${real(s.tree)}`, 'a registered scopetree on the branch prints present');
}

// A scopetree reached through a symlinked prefix still reads present.
{
  const s = setup();
  git(['worktree', 'add', '-q', s.tree, 'feat/x'], s.repo);
  const link = path.join(path.dirname(s.repo), path.basename(s.repo) + '-link');
  fs.symlinkSync(s.repo, link);
  copies.push(link);
  const out = verdict(s, path.join(link, '.superdev', 'scopes', 'x'));
  assert.ok(out.startsWith('present '), 'a symlinked prefix reads present, got: ' + out);
}

// A missing scopetree is absent before shipped, and absent-terminal at shipped and closed.
assert.strictEqual(verdict(setup()), 'absent', 'a missing scopetree at implementing prints absent');
assert.strictEqual(verdict(setup({ stage: 'shipped' })), 'absent-terminal shipped', 'absent at shipped is terminal');
assert.strictEqual(verdict(setup({ stage: 'closed' })), 'absent-terminal closed', 'absent at closed is terminal');

// Another working tree holding the branch prints its path.
{
  const s = setup();
  const other = path.join(path.dirname(s.repo), path.basename(s.repo) + '-other');
  git(['worktree', 'add', '-q', other, 'feat/x'], s.repo);
  copies.push(other);
  assert.strictEqual(verdict(s), `held-elsewhere ${real(other)}`, 'a branch held by another tree prints held-elsewhere and its path');
}

// A leftover directory, a tree on another branch or detached, and a registration whose directory is gone are unregistered.
{
  const s = setup();
  fs.mkdirSync(s.tree);
  assert.ok(/^unregistered .*not a registered/.test(verdict(s)), 'a leftover directory prints unregistered');
}
{
  const s = setup();
  git(['worktree', 'add', '-q', '-b', 'other', s.tree], s.repo);
  assert.ok(/^unregistered .*other/.test(verdict(s)), 'a scopetree on another branch prints unregistered naming it');
}
{
  const s = setup();
  git(['worktree', 'add', '-q', '--detach', s.tree], s.repo);
  assert.ok(/^unregistered .*detached/.test(verdict(s)), 'a detached scopetree prints unregistered');
}
{
  const s = setup();
  git(['worktree', 'add', '-q', s.tree, 'feat/x'], s.repo);
  fs.rmSync(s.tree, { recursive: true, force: true });
  assert.ok(/^unregistered .*gone/.test(verdict(s)), 'a registration whose directory is gone prints unregistered');
}

// Branch verdicts pass through; a guess names the branch it checks.
{
  const s = setup();
  git(['branch', '-D', 'feat/x'], s.repo);
  assert.strictEqual(verdict(s), 'none', 'no branch prints none');
}
{
  const s = setup();
  git(['branch', 'fix/x'], s.repo);
  fs.writeFileSync(path.join(s.root, 'ledger.md'), '# Run state\n\n**Stage:** implementing\n');
  assert.strictEqual(verdict(s), 'ambiguous feat/x fix/x', 'several shape matches print ambiguous');
}
{
  const s = setup();
  fs.writeFileSync(path.join(s.root, 'ledger.md'), '# Run state\n\n**Stage:** implementing\n');
  git(['worktree', 'add', '-q', s.tree, 'feat/x'], s.repo);
  assert.strictEqual(verdict(s), `present ${real(s.tree)}`, 'a guessed branch is the branch checked');
}

// A git failure passes through as git-failed, from the run read outside any repository.
{
  const s = setup();
  const outside = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'scope-checkout-outside-'));
  copies.push(outside);
  const r = call(['checkout', '--root', s.root], '', outside);
  assert.ok(r.ok, 'checkout should not refuse: ' + r.err);
  assert.ok(/^git-failed /.test(r.out), 'a failing git prints git-failed, got: ' + r.out);
}

// The verb changes no ref, registration, or file.
{
  const s = setup();
  fs.mkdirSync(s.tree);
  const snap = () => [git(['worktree', 'list', '--porcelain'], s.repo), git(['for-each-ref'], s.repo), git(['status', '--porcelain', '-uall'], s.repo), fs.readdirSync(s.root).join()].join('\n');
  const before = snap();
  verdict(s);
  assert.strictEqual(snap(), before, 'the verb writes nothing');
}

// Argument handling matches the branch verb.
{
  const s = setup();
  assert.ok(!call(['checkout', '--root', s.root, 'extra'], '', s.repo).ok, 'a leftover argument is refused');
  assert.ok(!call(['checkout', '--root', path.join(s.root, 'nope')], '', s.repo).ok, 'a root that is no directory is refused');
}

console.log('scope-checkout: ok');
