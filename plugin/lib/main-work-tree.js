'use strict';

// main-work-tree.js: the resolver of a repository's main working tree (ADR 0080) and of the paths under its `.superdev/`.

const path = require('path');
const { gitSpawn } = require('./git-spawn.js');
const { fail } = require('./refusal.js');

// Every run root lives under the repository's main working tree, whatever checkout the command was
// invoked from: `git rev-parse --git-common-dir` names the shared git directory, and its parent is
// the main working tree. A submodule's shared git directory sits under the superproject's `.git/modules`,
// so its parent is no checkout; there the directory's own `core.worktree` names the checkout (`git
// worktree list` reports the git directory itself for a submodule, which is why it is not the source).
// This is what keeps a plan's scopetree, a slicetree, and the main checkout
// all naming the same run root for one scope. `verbInit` and `verbStatus` resolve their own run-root
// paths through this same function (review finding, ADR 0080) — building them from `cwd` directly, as
// `verbRoot` alone used to, is exactly the divergence that leaves a ledger `init` writes from inside a
// scopetree or slicetree invisible to a `root <slug>` call — or a `status` scan — made from the main
// working tree.
//
// Returns `null` rather than failing when `cwd` is not inside a git repository: `init` and `status`
// both tolerate that (a `status` scan of a plain, non-superdev directory reports "no runs found" rather
// than refusing), so they fall back to `cwd` itself on a `null`. `verbRoot` is the one caller that turns
// a `null` into a refusal — a bare path with no git repository behind it answers a question `root`'s one
// caller (`references/run-init.md`, `skills/plan/SKILL.md`) never asks outside a checkout.
//
// `opts.timeout` bounds each git spawn (a hook must not hang, INV-0009); a spawn killed at the bound
// carries no verdict and gives `null`.
function mainWorkTree(cwd, opts) {
  const commonDir = gitSpawn(['rev-parse', '--git-common-dir'], cwd, opts);
  if (commonDir.status !== 0) return null;
  const gitDir = path.resolve(cwd, commonDir.stdout.trim());
  const configured = gitSpawn(['config', '--file', path.join(gitDir, 'config'), '--get', 'core.worktree'], cwd, opts);
  // A spawn killed at its bound carries no verdict: no answer, never the parent-directory guess.
  if (configured.status === null) return null;
  return configured.status === 0 && configured.stdout.trim() ? path.resolve(gitDir, configured.stdout.trim()) : path.dirname(gitDir);
}

function scopesDirFor(cwd) {
  return path.join(mainWorkTree(cwd) || cwd, '.superdev', 'scopes');
}

// The main working tree joined with `.superdev/<area>/<slug>`, for a slug that cannot leave that area.
// Refuses outside a git repository rather than fall back to `cwd`, which would name a directory inside
// whatever checkout the caller happens to stand in.
function mainTreePath(cwd, verb, area, slug) {
  if (!slug) fail(`${verb} needs a <slug>`);
  if (slug.includes('/') || slug.includes('\\')) fail(`slug "${slug}" must not contain a path separator`);
  if (slug.startsWith('.')) fail(`slug "${slug}" must not start with "."`);
  const mwt = mainWorkTree(cwd);
  if (mwt === null) fail(`not inside a git repository (cwd: ${cwd})`);
  return path.join(mwt, '.superdev', area, slug);
}

module.exports = { mainWorkTree, scopesDirFor, mainTreePath };
