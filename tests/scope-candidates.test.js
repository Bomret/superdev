'use strict';

// Suite for plugin/scripts/scope.js's `candidates` verb (INV-0196): the empty-argument cascade's verdict over the run roots
// under the main working tree's `.superdev/scopes/*/`, for the stages the caller names. The verb only reads, so each case builds
// its own run roots under a repository made once and copied per case.

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
}, 'scope-candidates-template-');

const copies = [];
process.on('exit', () => copies.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

// A repository copy whose `.superdev/scopes/` holds one run root per `roots` entry: a string is the ledger text, `null` is a
// directory with no ledger, and `'unreadable'` is a `ledger.md` that is a directory.
function setup(roots) {
  const repo = copyFixture(template(), 'scope-candidates-');
  copies.push(repo);
  for (const [slug, ledger] of Object.entries(roots)) {
    const root = path.join(repo, '.superdev', 'scopes', slug);
    fs.mkdirSync(root, { recursive: true });
    if (ledger === 'unreadable') fs.mkdirSync(path.join(root, 'ledger.md'));
    else if (ledger !== null) fs.writeFileSync(path.join(root, 'ledger.md'), ledger);
  }
  return repo;
}
const ledgerAt = (stage) => `# Run state\n\n**Stage:** ${stage}\n`;
const run = (repo, stage, cwd) => {
  const r = call(['candidates', '--stage', stage], '', cwd || repo);
  assert.ok(r.ok, 'candidates should not refuse: ' + r.err);
  return r.out;
};

// One qualifying run root: `one <slug> <stage>`, whatever the other roots hold.
{
  const repo = setup({ a: ledgerAt('merged'), b: ledgerAt('shipped') });
  assert.strictEqual(run(repo, 'merged,documented-unreviewed'), 'one a merged');
}

// Two qualifying run roots: `several`, then one `<slug> <stage>` line each, in slug order.
{
  const repo = setup({ b: ledgerAt('documented-unreviewed'), a: ledgerAt('merged'), c: ledgerAt('shipped') });
  assert.strictEqual(run(repo, 'merged,documented-unreviewed'), 'several\na merged\nb documented-unreviewed');
}

// No qualifying run root: `none`, then every run root with its stage; a directory with no ledger is no run root.
{
  const repo = setup({ a: ledgerAt('shipped'), b: ledgerAt('closed'), loose: null });
  assert.strictEqual(run(repo, 'merged'), 'none\na shipped\nb closed');
}

// A repository with no run root at all: `none` alone.
{
  const repo = setup({});
  assert.strictEqual(run(repo, 'merged'), 'none');
}

// A ledger with no stage and an unreadable ledger never qualify, even beside the only other candidate, and are listed
// as `absent` and `unreadable`.
{
  const repo = setup({ a: '# Run state\n\nno header here\n', b: 'unreadable', c: ledgerAt('merged') });
  assert.strictEqual(run(repo, 'merged'), 'one c merged');
  assert.strictEqual(run(repo, 'implementing'), 'none\na absent\nb unreadable\nc merged');
}

// Every verdict word stays one token: a run root whose directory name fails the slug charset is left out, and a stage value
// outside the ledger's stages reads `unreadable` and never qualifies.
{
  const repo = setup({ 'two words': ledgerAt('merged'), 'line\nbreak': ledgerAt('merged'), b: ledgerAt('implementing-ish'), c: ledgerAt('merged') });
  assert.strictEqual(run(repo, 'merged'), 'one c merged');
  assert.strictEqual(run(repo, 'implementing'), 'none\nb unreadable\nc merged');
}

// An unknown stage name is refused, with no verdict printed.
{
  const repo = setup({ a: ledgerAt('merged') });
  const r = call(['candidates', '--stage', 'merged,bogus'], '', repo);
  assert.strictEqual(r.ok, false);
  assert.match(r.err, /bogus/);
  assert.strictEqual(r.out, '');
}

// A missing or empty `--stage`, and a stray argument, are refused.
{
  const repo = setup({ a: ledgerAt('merged') });
  assert.strictEqual(call(['candidates'], '', repo).ok, false);
  assert.strictEqual(call(['candidates', '--stage', ''], '', repo).ok, false);
  for (const extra of ['extra', '--bogus']) {
    const r = call(['candidates', '--stage', 'merged', extra], '', repo);
    assert.strictEqual(r.ok, false, `${extra} refuses`);
    assert.strictEqual(r.out, '', `a refused ${extra} prints no verdict`);
  }
}

// The same result from the main checkout and from a scopetree: the scan resolves through the main working tree.
{
  const repo = setup({ a: ledgerAt('merged'), b: ledgerAt('merged') });
  const tree = path.join(repo, '.superdev', 'scopetrees', 'x');
  fs.mkdirSync(path.dirname(tree), { recursive: true });
  git(['worktree', 'add', '-q', '-b', 'feat/x', tree], repo);
  assert.strictEqual(run(repo, 'merged', tree), run(repo, 'merged'));
  assert.strictEqual(run(repo, 'merged', tree), 'several\na merged\nb merged');
}

// The verb writes nothing: the run roots hold the same entries before and after.
{
  const repo = setup({ a: ledgerAt('merged') });
  const before = fs.readdirSync(path.join(repo, '.superdev', 'scopes', 'a')).join();
  run(repo, 'merged');
  assert.strictEqual(fs.readdirSync(path.join(repo, '.superdev', 'scopes', 'a')).join(), before);
}

console.log('scope-candidates: ok');
