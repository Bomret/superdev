#!/usr/bin/env node
'use strict';

// worktree-sweep: Stop hook. Deterministically removes finished superdev slice
// worktrees so they don't pile up when the controller skips the prompted cleanup.
//
// Safety: only removes a worktree under .superdev/worktrees/ whose branch (`slice/*`)
// is FULLY MERGED into the current branch — i.e. an already-integrated slice. An
// unmerged (in-progress) or reverted slice is left untouched, so this is safe to fire
// on every turn, mid-run included, and self-corrects if a merge is later reverted.
// Best-effort and silent: any git error, a dirty worktree, or no .superdev/ → no-op.

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function sh(cmd, cwd) {
  return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
}

// Pure: given `git worktree list --porcelain` text, the set of merged branch names,
// and the absolute .superdev/worktrees dir, return the {wt, br} entries safe to remove.
function selectRemovable(porcelain, mergedSet, wtDir) {
  const out = [];
  for (const block of porcelain.split('\n\n')) {
    const wt = (block.match(/^worktree (.+)$/m) || [])[1];
    const br = (block.match(/^branch refs\/heads\/(.+)$/m) || [])[1];
    if (!wt || !br) continue; // detached or main worktree — skip
    if (path.dirname(wt) !== wtDir) continue; // only superdev slice worktrees
    if (!/^slice\//.test(br)) continue; // only slice/* branches
    if (!mergedSet.has(br)) continue; // only fully-merged (integrated) slices
    out.push({ wt, br });
  }
  return out;
}

function main(cwd) {
  const wtDir = path.join(cwd, '.superdev', 'worktrees');
  if (!fs.existsSync(wtDir)) return; // not a superdev run in this repo
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
  for (const { wt, br } of selectRemovable(porcelain, merged, wtDir)) {
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
  const wtDir = '/repo/.superdev/worktrees';
  const porcelain = [
    'worktree /repo\nHEAD a\nbranch refs/heads/main',
    'worktree /repo/.superdev/worktrees/S1\nHEAD b\nbranch refs/heads/slice/S1',
    'worktree /repo/.superdev/worktrees/S2\nHEAD c\nbranch refs/heads/slice/S2',
    'worktree /repo/.superdev/worktrees/S3\nHEAD d\ndetached',
  ].join('\n\n');
  const merged = new Set(['main', 'slice/S1', 'slice/S3']);
  const got = selectRemovable(porcelain, merged, wtDir);
  assert.deepEqual(got, [{ wt: '/repo/.superdev/worktrees/S1', br: 'slice/S1' }], 'only merged slice/* under wtDir');
  // S2 unmerged → skipped; S3 detached → skipped; main not under wtDir → skipped
  assert.deepEqual(selectRemovable(porcelain, new Set(['main']), wtDir), [], 'nothing merged → nothing removed');
  assert.deepEqual(
    selectRemovable('worktree /other/x\nbranch refs/heads/slice/S1', new Set(['slice/S1']), wtDir),
    [],
    'slice branch but outside wtDir → skipped'
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
