'use strict';

// scope-checkout.js: the scope-checkout verdict (ADR 0263, INV-0196). `scope.js`'s `checkout` verb prints it. It reads the scope branch
// (`scope-branch.js`), `git worktree list`, and the ledger's stage, and writes nothing.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { readLedgerHeader } = require('./ledger.js');
const { drivePath } = require('./drive-path.js');
const { resolveScopeBranch } = require('./scope-branch.js');

// A path in one comparable spelling (ADR 0150): drive path translated, symlinks resolved (the macOS `/private` prefix included)
// through the nearest existing ancestor, so a directory that is gone still compares by where it was.
function normalize(p) {
  let abs = path.resolve(drivePath(p));
  const tail = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(abs), ...tail.reverse());
    } catch {
      const parent = path.dirname(abs);
      if (parent === abs) return path.join(abs, ...tail.reverse());
      tail.push(path.basename(abs));
      abs = parent;
    }
  }
}

// The registered working trees as `{ path, branch, detached, bare }` (`branch` the short name), or `{ failure }` when git cannot list them.
function listWorktrees(cwd) {
  const res = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd, encoding: 'utf8' });
  if (res.error) return { failure: `worktree list could not run (${res.error.code || res.error.message})` };
  if (res.status !== 0) return { failure: `worktree list exited with status ${res.status}` };
  const trees = [];
  let cur = null;
  for (const line of res.stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      cur = { path: line.slice('worktree '.length), branch: null, detached: false, bare: false };
      trees.push(cur);
    } else if (cur && line.startsWith('branch ')) cur.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    else if (cur && line === 'detached') cur.detached = true;
    else if (cur && line === 'bare') cur.bare = true;
  }
  return { trees };
}

// The verdict for the run root `root` (absolute), read in `cwd`: `{ verdict, detail? }` with `verdict` one of `present` (detail the scopetree
// path), `absent`, `absent-terminal` (detail the stage), `held-elsewhere` (detail the holding tree's path), `unregistered` (detail the reason),
// or the branch verdicts `none`, `ambiguous` (detail the branches), `git-failed` (detail the reason). A `guess` or `guess-remote` branch
// is the scope branch checked, as a `ledger` one is.
function scopeCheckout(cwd, root) {
  const b = resolveScopeBranch(cwd, root);
  if (b.verdict === 'none') return { verdict: 'none' };
  if (b.verdict === 'ambiguous') return { verdict: 'ambiguous', detail: b.branches.join(' ') };
  if (b.verdict === 'git-failed') return { verdict: 'git-failed', detail: b.reason };
  const listing = listWorktrees(cwd);
  if (listing.failure) return { verdict: 'git-failed', detail: listing.failure };
  const treePath = normalize(path.join(root, 'scopetree'));
  const mine = listing.trees.find((t) => normalize(t.path) === treePath);
  if (mine) {
    if (mine.branch !== b.branch) {
      return { verdict: 'unregistered', detail: `the scopetree is registered ${mine.detached ? 'detached' : `on ${mine.branch || 'no branch'}`}, not on ${b.branch}` };
    }
    if (!fs.existsSync(treePath)) return { verdict: 'unregistered', detail: 'the scopetree is registered but its directory is gone' };
    return { verdict: 'present', detail: treePath };
  }
  const holder = listing.trees.find((t) => t.branch === b.branch);
  if (holder) return { verdict: 'held-elsewhere', detail: normalize(holder.path) };
  if (fs.existsSync(treePath)) return { verdict: 'unregistered', detail: 'the scopetree directory is not a registered working tree of the repository' };
  let stage = null;
  try {
    stage = readLedgerHeader(fs.readFileSync(path.join(root, 'ledger.md'), 'utf8'), 'Stage');
  } catch {
    stage = null;
  }
  if (stage === 'shipped' || stage === 'closed') return { verdict: 'absent-terminal', detail: stage };
  return { verdict: 'absent' };
}

module.exports = { scopeCheckout };
