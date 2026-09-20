#!/usr/bin/env node
'use strict';

// slicetree-sweep: Stop hook. Deterministically removes finished superdev
// slicetrees so they don't pile up when the controller skips the prompted cleanup.
//
// superdev lays slicetrees out per scope run: .superdev/scopes/<scope>/slicetrees/<id>, on a
// scoped branch slice/<scope>/<id>. A slicetree is removed only when its branch is BOTH:
//   (a) fully merged into ITS OWN scope run's scope branch (integrated), AND
//   (b) "worked" — it has ≥1 commit not reachable from the repo's default branch.
// (a) is asked per scope run, not of the invoking checkout's current branch: a full run leaves the
// invoking checkout on the base branch throughout, so `git branch --merged` with no argument would
// never see a slicetree as merged at all. Each scope's branch is read from that scope's own
// ledger (the `**Branch:**` line, via `scripts/scope.js`'s shared `readLedgerHeader`, ADR 0022), so two
// scope runs present at once are judged independently, and a scope whose ledger is unreadable or names
// no branch sweeps nothing for itself while every other scope sweeps normally.
// (b) is the critical guard: a freshly-created slice branch with zero commits is
// trivially an ancestor of (hence "merged" into) its base, so `--merged` alone would
// sweep active, not-yet-committed slicetrees out from under running implementers. An
// unmerged in-progress slice fails (a); a fresh empty slice fails (b); only a genuinely
// integrated slice satisfies both. Safe to fire every turn, self-corrects on reverts.
// Best-effort and silent: any git error, a dirty slicetree, an unreadable ledger, or no .superdev/ →
// no-op for the affected scope (or the whole sweep, where the failure isn't scope-specific).

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// argv-based (no shell) — a repo-derived value (branch name, slicetree path) containing a
// quote/backtick/$() can't break out and inject.
function git(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
}

// The repo's default branch name (main/master), used as the "base" that worked slices
// have commits beyond. Null if undetectable → nothing is swept (safe).
function defaultBranch(cwd) {
  try {
    return git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], cwd).replace(/^origin\//, '');
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
// set, and the absolute path to ONE scope's own directory (`.superdev/scopes/<scope>`), return the
// {wt, br} entries safe to remove for that scope. `mergedSet` is that scope's own branch's merge
// state, so the porcelain scan must stay inside that same scope's directory too — scanning the whole
// `.superdev/` tree here would let a sibling scope's slicetree be judged by this scope's `mergedSet`,
// sweeping it whenever its slice branch happens to be an ancestor of this scope's branch as well.
function selectRemovable(porcelain, mergedSet, workedSet, scopeRoot) {
  const prefix = scopeRoot.endsWith(path.sep) ? scopeRoot : scopeRoot + path.sep;
  const out = [];
  for (const block of porcelain.split('\n\n')) {
    const wt = (block.match(/^worktree (.+)$/m) || [])[1];
    const br = (block.match(/^branch refs\/heads\/(.+)$/m) || [])[1];
    if (!wt || !br) continue; // detached or main worktree — skip
    if (!wt.startsWith(prefix)) continue; // only this scope's own slicetrees
    if (path.basename(path.dirname(wt)) !== 'slicetrees') continue; // .../<scope>/slicetrees/<id>
    if (!/^slice\//.test(br)) continue; // only slice/* branches
    if (!mergedSet.has(br)) continue; // (a) integrated into this scope's own branch
    if (!workedSet.has(br)) continue; // (b) has real committed work — not a fresh empty branch
    out.push({ wt, br });
  }
  return out;
}

// `scripts/scope.js` owns the ledger's schema, so it owns how a header value is read (ADR 0022).
// `hooks/scope-prune.js` already requires this export for the same reason. No fallback: a hook that
// cannot read a scope's branch must never guess it, so a require failure below leaves this null and
// main() sweeps nothing for any scope, silently — the same fail-closed direction a git error takes.
let readLedgerHeader = null;
try {
  ({ readLedgerHeader } = require('../scripts/scope.js'));
} catch {
  // Left null. main() checks this before doing anything below.
}

// The scope branch named by one scope run's ledger, or null when the ledger is unreadable or carries
// no `**Branch:**` line — a run this hook must leave untouched rather than guess about.
function scopeBranch(scopeDir) {
  try {
    return readLedgerHeader(fs.readFileSync(path.join(scopeDir, 'ledger.md'), 'utf8'), 'Branch');
  } catch {
    return null;
  }
}

function main(cwd) {
  if (!readLedgerHeader) return; // shared reader unavailable → sweep nothing, say nothing
  const superdevRoot = path.join(cwd, '.superdev');
  if (!fs.existsSync(superdevRoot)) return; // not a superdev run in this repo
  const def = defaultBranch(cwd);
  if (!def) return; // can't establish a base → don't risk sweeping

  let worked, porcelain;
  try {
    // slice branches with ≥1 commit not in the default branch = genuinely worked
    worked = new Set();
    const sliceBranches = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/slice'], cwd)
      .split('\n')
      .filter(Boolean);
    for (const b of sliceBranches) {
      if (git(['rev-list', '-n1', b, '--not', def], cwd)) worked.add(b);
    }
    porcelain = git(['worktree', 'list', '--porcelain'], cwd);
  } catch {
    return; // not a git repo / detached HEAD → bail quietly
  }

  const scopesRoot = path.join(superdevRoot, 'scopes');
  let scopeNames;
  try {
    scopeNames = fs
      .readdirSync(scopesRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return; // no scopes/ → nothing to sweep
  }

  // Each scope run is judged against its own scope branch, so two runs present at once never see each
  // other's merge state (references/scope-mode.md, `## The scope branch`).
  const toRemove = [];
  for (const scope of scopeNames) {
    const branch = scopeBranch(path.join(scopesRoot, scope));
    if (!branch) continue; // unreadable ledger, or no Branch line → sweep nothing for this scope

    let merged;
    try {
      merged = new Set(
        git(['branch', '--merged', branch], cwd)
          .split('\n')
          .map((s) => s.replace(/^[*+ ]+/, '').trim())
          .filter(Boolean)
      );
    } catch {
      continue; // the scope's branch doesn't resolve → sweep nothing for this scope
    }

    toRemove.push(...selectRemovable(porcelain, merged, worked, path.join(scopesRoot, scope)));
  }

  for (const { wt, br } of toRemove) {
    try {
      git(['worktree', 'remove', wt], cwd); // refuses if dirty → caught, left for later
      git(['branch', '-D', br], cwd);
    } catch {
      /* dirty / in use → leave it */
    }
  }
}

if (require.main === module) {
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

module.exports = { selectRemovable, main, git };
