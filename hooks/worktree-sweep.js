#!/usr/bin/env node
'use strict';

// worktree-sweep: Stop hook. Deterministically removes finished superdev slice
// worktrees so they don't pile up when the controller skips the prompted cleanup.
//
// superdev lays worktrees out per scope run: .superdev/<scope>/worktrees/<id>, on a
// scoped branch slice/<scope>/<id>. This hook removes any such worktree whose branch
// is FULLY MERGED into the current branch — i.e. an already-integrated slice. An
// unmerged (in-progress) or reverted slice is left untouched, so it is safe to fire on
// every turn, mid-run included, and self-corrects if a merge is later reverted.
// Best-effort and silent: any git error, a dirty worktree, or no .superdev/ → no-op.

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function sh(cmd, cwd) {
  return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
}

// Pure: from `git worktree list --porcelain` text, the set of merged branch names, and
// the absolute .superdev root, return the {wt, br} entries safe to remove — a slice/*
// branch, fully merged, whose worktree sits in a `worktrees/` dir under .superdev/.
function selectRemovable(porcelain, mergedSet, superdevRoot) {
  const prefix = superdevRoot.endsWith(path.sep) ? superdevRoot : superdevRoot + path.sep;
  const out = [];
  for (const block of porcelain.split('\n\n')) {
    const wt = (block.match(/^worktree (.+)$/m) || [])[1];
    const br = (block.match(/^branch refs\/heads\/(.+)$/m) || [])[1];
    if (!wt || !br) continue; // detached or main worktree — skip
    if (!wt.startsWith(prefix)) continue; // only worktrees under .superdev/
    if (path.basename(path.dirname(wt)) !== 'worktrees') continue; // .../<scope>/worktrees/<id>
    if (!/^slice\//.test(br)) continue; // only slice/* branches
    if (!mergedSet.has(br)) continue; // only fully-merged (integrated) slices
    out.push({ wt, br });
  }
  return out;
}

function main(cwd) {
  const superdevRoot = path.join(cwd, '.superdev');
  if (!fs.existsSync(superdevRoot)) return; // not a superdev run in this repo
  let merged, porcelain;
  try {
    merged = new Set(
      sh('git branch --merged', cwd)
        .split('\n')
        .map((s) => s.replace(/^[*+ ]+/, '').trim())
        .filter(Boolean)
    );
    porcelain = sh('git worktree list --porcelain', cwd);
  } catch {
    return; // not a git repo / detached HEAD → bail quietly
  }
  for (const { wt, br } of selectRemovable(porcelain, merged, superdevRoot)) {
    try {
      sh(`git worktree remove "${wt}"`, cwd); // refuses if dirty → caught, left for later
      sh(`git branch -D "${br}"`, cwd);
    } catch {
      /* dirty / in use → leave it */
    }
  }
}

if (process.argv[2] === '--selftest') {
  const assert = require('node:assert');
  const root = '/repo/.superdev';
  // scope names may contain slashes (e.g. superdev/featA) → nested dirs and branch refs
  const porcelain = [
    'worktree /repo\nHEAD a\nbranch refs/heads/main',
    'worktree /repo/.superdev/superdev/featA/worktrees/01\nHEAD b\nbranch refs/heads/slice/superdev/featA/01',
    'worktree /repo/.superdev/superdev/featB/worktrees/01\nHEAD c\nbranch refs/heads/slice/superdev/featB/01',
    'worktree /repo/.superdev/superdev/featA/worktrees/02\nHEAD d\ndetached',
  ].join('\n\n');
  const merged = new Set(['main', 'slice/superdev/featA/01']);
  assert.deepEqual(
    selectRemovable(porcelain, merged, root),
    [{ wt: '/repo/.superdev/superdev/featA/worktrees/01', br: 'slice/superdev/featA/01' }],
    'only the merged, non-detached slice worktree under .superdev/**/worktrees/'
  );
  assert.deepEqual(selectRemovable(porcelain, new Set(['main']), root), [], 'nothing merged → nothing removed');
  assert.deepEqual(
    selectRemovable('worktree /other/x\nbranch refs/heads/slice/s/01', new Set(['slice/s/01']), root),
    [],
    'slice worktree outside .superdev/ → skipped'
  );
  assert.deepEqual(
    selectRemovable('worktree /repo/.superdev/x/01\nbranch refs/heads/slice/x/01', new Set(['slice/x/01']), root),
    [],
    'not under a worktrees/ dir → skipped'
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
