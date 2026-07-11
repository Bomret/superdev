#!/usr/bin/env node
'use strict';

// worktree-sweep: Stop hook. Deterministically removes finished superdev slice
// worktrees so they don't pile up when the controller skips the prompted cleanup.
//
// superdev lays worktrees out per scope run: .superdev/scopes/<scope>/worktrees/<id>, on a
// scoped branch slice/<scope>/<id>. A worktree is removed only when its branch is BOTH:
//   (a) fully merged into the current branch (integrated), AND
//   (b) "worked" — it has ≥1 commit not reachable from the repo's default branch.
// (b) is the critical guard: a freshly-created slice branch with zero commits is
// trivially an ancestor of (hence "merged" into) its base, so `--merged` alone would
// sweep active, not-yet-committed worktrees out from under running implementers. An
// unmerged in-progress slice fails (a); a fresh empty slice fails (b); only a genuinely
// integrated slice satisfies both. Safe to fire every turn, self-corrects on reverts.
// Best-effort and silent: any git error, a dirty worktree, or no .superdev/ → no-op.

const { execSync, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function sh(cmd, cwd) {
  return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
}

// Like sh() but argv-based (no shell) — for any git call that includes a repo-derived value
// (branch name, worktree path). A name containing a quote/backtick/$() can't break out and inject.
function git(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
}

// The repo's default branch name (main/master), used as the "base" that worked slices
// have commits beyond. Null if undetectable → nothing is swept (safe).
function defaultBranch(cwd) {
  try {
    return sh('git symbolic-ref --short refs/remotes/origin/HEAD', cwd).replace(/^origin\//, '');
  } catch {
    for (const b of ['main', 'master']) {
      try {
        git(['show-ref', '--verify', '--quiet', `refs/heads/${b}`], cwd);
        return b;
      } catch {
        /* not this one */
      }
    }
    return null;
  }
}

// Pure: from `git worktree list --porcelain` text, the merged-branch set, the worked-branch
// set, and the absolute .superdev root, return the {wt, br} entries safe to remove.
function selectRemovable(porcelain, mergedSet, workedSet, superdevRoot) {
  const prefix = superdevRoot.endsWith(path.sep) ? superdevRoot : superdevRoot + path.sep;
  const out = [];
  for (const block of porcelain.split('\n\n')) {
    const wt = (block.match(/^worktree (.+)$/m) || [])[1];
    const br = (block.match(/^branch refs\/heads\/(.+)$/m) || [])[1];
    if (!wt || !br) continue; // detached or main worktree — skip
    if (!wt.startsWith(prefix)) continue; // only worktrees under .superdev/
    if (path.basename(path.dirname(wt)) !== 'worktrees') continue; // .../<scope>/worktrees/<id>
    if (!/^slice\//.test(br)) continue; // only slice/* branches
    if (!mergedSet.has(br)) continue; // (a) integrated into the current branch
    if (!workedSet.has(br)) continue; // (b) has real committed work — not a fresh empty branch
    out.push({ wt, br });
  }
  return out;
}

function main(cwd) {
  const superdevRoot = path.join(cwd, '.superdev');
  if (!fs.existsSync(superdevRoot)) return; // not a superdev run in this repo
  const def = defaultBranch(cwd);
  if (!def) return; // can't establish a base → don't risk sweeping
  let merged, worked, porcelain;
  try {
    merged = new Set(
      sh('git branch --merged', cwd)
        .split('\n')
        .map((s) => s.replace(/^[*+ ]+/, '').trim())
        .filter(Boolean)
    );
    // slice branches with ≥1 commit not in the default branch = genuinely worked
    worked = new Set();
    const sliceBranches = sh("git for-each-ref --format=%(refname:short) refs/heads/slice", cwd)
      .split('\n')
      .filter(Boolean);
    for (const b of sliceBranches) {
      if (git(['rev-list', '-n1', b, '--not', def], cwd)) worked.add(b);
    }
    porcelain = sh('git worktree list --porcelain', cwd);
  } catch {
    return; // not a git repo / detached HEAD → bail quietly
  }
  for (const { wt, br } of selectRemovable(porcelain, merged, worked, superdevRoot)) {
    try {
      git(['worktree', 'remove', wt], cwd); // refuses if dirty → caught, left for later
      git(['branch', '-D', br], cwd);
    } catch {
      /* dirty / in use → leave it */
    }
  }
}

if (process.argv[2] === '--selftest') {
  const assert = require('node:assert');
  const root = '/repo/.superdev';
  const porcelain = [
    'worktree /repo\nHEAD a\nbranch refs/heads/main',
    'worktree /repo/.superdev/self-improvements/worktrees/2\nHEAD b\nbranch refs/heads/slice/self-improvements/2',
    'worktree /repo/.superdev/self-improvements/worktrees/4\nHEAD c\nbranch refs/heads/slice/self-improvements/4',
    'worktree /repo/.superdev/self-improvements/worktrees/5\nHEAD d\nbranch refs/heads/slice/self-improvements/5',
  ].join('\n\n');
  const merged = new Set(['main', 'slice/self-improvements/2', 'slice/self-improvements/4']);
  const worked = new Set(['slice/self-improvements/2', 'slice/self-improvements/5']);
  // #2: merged AND worked → remove. #4: merged but NOT worked (fresh) → skip (the bug).
  // #5: worked but NOT merged → skip.
  assert.deepEqual(
    selectRemovable(porcelain, merged, worked, root),
    [{ wt: '/repo/.superdev/self-improvements/worktrees/2', br: 'slice/self-improvements/2' }],
    'only the merged-AND-worked slice is swept'
  );
  assert.deepEqual(selectRemovable(porcelain, merged, new Set(), root), [], 'no worked branches → nothing swept');
  assert.deepEqual(
    selectRemovable('worktree /repo/.superdev/x/worktrees/1\nbranch refs/heads/slice/x/1', new Set(['slice/x/1']), new Set(['slice/x/1']), root),
    [{ wt: '/repo/.superdev/x/worktrees/1', br: 'slice/x/1' }],
    'merged+worked under any scope'
  );
  console.log('worktree-sweep selftest ok');
} else {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let input = {};
    try {
      input = JSON.parse(raw || '{}');
    } catch {
      /* no/garbage stdin → fall back to cwd */
    }
    try {
      main(input.cwd || process.cwd());
    } catch {
      /* never let cleanup break the session */
    }
    process.exit(0);
  });
}
