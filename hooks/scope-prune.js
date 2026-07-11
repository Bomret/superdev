#!/usr/bin/env node
'use strict';

// scope-prune: Stop hook. Deterministically removes a completed superdev scope run root
// (.superdev/scopes/<scope>/ — ledger.md, dod.md, the git-ignored post-mortem trail) once its
// scope branch (superdev/<scope>) is merged into the current branch AND the run root has sat
// untouched past a staleness TTL. Mirrors hooks/worktree-sweep.js's merged-branch check one level
// up (scope branch instead of slice branch) — same "safe by default" shape: never touches a run
// whose scope branch isn't merged yet (still active), and never touches one whose worktree is
// still present (an interrupted cleanup, not a finished run — leave it for a human to look at).
// ponytail: TTL is one flat value for every scope; a per-scope override would need its own config
// knob — add one if varying retention actually comes up, but YAGNI for now.
// Best-effort and silent: any git error, or no .superdev/scopes/ → no-op.

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days past scope-branch merge

function sh(cmd, cwd) {
  return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
}

// Pure: from the list of scope directory names, the merged-branch set, and a function returning
// each scope's newest-file mtime (ms, or null if unreadable), return the scope names prunable now.
function selectPrunable(scopeNames, mergedSet, mtimeOf) {
  const out = [];
  for (const scope of scopeNames) {
    if (!mergedSet.has(`superdev/${scope}`)) continue; // scope branch not merged → still active
    const mtime = mtimeOf(scope);
    if (mtime == null) continue; // unreadable → leave it, don't guess
    if (Date.now() - mtime < TTL_MS) continue; // not stale yet
    out.push(scope);
  }
  return out;
}

function newestMtimeMs(dir) {
  let newest = null;
  for (const name of fs.readdirSync(dir)) {
    const stat = fs.statSync(path.join(dir, name));
    if (!stat.isFile()) continue; // a worktree/ or worktrees/ dir here means an interrupted run — skip below
    if (newest === null || stat.mtimeMs > newest) newest = stat.mtimeMs;
  }
  return newest;
}

function main(cwd) {
  const scopesRoot = path.join(cwd, '.superdev', 'scopes');
  if (!fs.existsSync(scopesRoot)) return; // no superdev runs in this repo

  let merged;
  try {
    merged = new Set(
      sh('git branch --merged', cwd)
        .split('\n')
        .map((s) => s.replace(/^[*+ ]+/, '').trim())
        .filter(Boolean)
    );
  } catch {
    return; // not a git repo / detached HEAD → bail quietly
  }

  const scopeNames = fs
    .readdirSync(scopesRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const prunable = selectPrunable(scopeNames, merged, (scope) => {
    try {
      return newestMtimeMs(path.join(scopesRoot, scope));
    } catch {
      return null;
    }
  });

  for (const scope of prunable) {
    const dir = path.join(scopesRoot, scope);
    // Never prune while a worktree is still present — that's an interrupted cleanup, not a finished run.
    if (fs.existsSync(path.join(dir, 'worktree')) || fs.existsSync(path.join(dir, 'worktrees'))) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* leave it, retry next Stop */
    }
  }
}

if (process.argv[2] === '--selftest') {
  const assert = require('node:assert');
  const FRESH = Date.now();
  const STALE = Date.now() - TTL_MS - 1000;

  // #merged-and-stale: merged branch, mtime past TTL → prune.
  // #merged-and-fresh: merged branch, mtime within TTL → skip (too soon).
  // #unmerged: scope branch not merged (still active) → skip regardless of age.
  const mtimes = { 'merged-and-stale': STALE, 'merged-and-fresh': FRESH, unmerged: STALE };
  const merged = new Set(['main', 'superdev/merged-and-stale', 'superdev/merged-and-fresh']);
  assert.deepEqual(
    selectPrunable(Object.keys(mtimes), merged, (s) => mtimes[s]),
    ['merged-and-stale'],
    'only a merged AND stale scope is pruned'
  );
  assert.deepEqual(
    selectPrunable(['unknown-mtime'], merged, () => null),
    [],
    'unreadable mtime is never pruned'
  );
  console.log('scope-prune selftest ok');
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
