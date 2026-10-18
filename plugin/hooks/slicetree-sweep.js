#!/usr/bin/env node
'use strict';

// slicetree-sweep: Stop hook. Deterministically removes finished superdev
// slicetrees so they don't pile up when the controller skips the prompted cleanup.
//
// superdev lays slicetrees out per scope run: .superdev/scopes/<scope>/slicetrees/<id>, on a
// scoped branch slice/<scope>/<id>. A slicetree is removed only when its branch is BOTH:
//   (a) fully merged into ITS OWN scope run's scope branch (integrated), AND
//   (b) "worked" — it has ≥1 commit not reachable from the repo's default branch, AND its tip is
//       off the scope branch's own first-parent chain.
// (a) is asked per scope run, not of the invoking checkout's current branch: a full run leaves the
// invoking checkout on the base branch throughout, so `git branch --merged` with no argument would
// never see a slicetree as merged at all. Each scope's branch is read from that scope's own
// ledger (the `**Branch:**` line, via `lib/ledger.js`'s shared `readLedgerHeader`, ADR 0022), so two
// scope runs present at once are judged independently, and a scope whose ledger is unreadable or names
// no branch sweeps nothing for itself while every other scope sweeps normally.
// (b) is the critical guard: a freshly-created slice branch with zero commits is
// trivially an ancestor of (hence "merged" into) its base, so `--merged` alone would
// sweep active, not-yet-committed slicetrees out from under running implementers. An
// unmerged in-progress slice fails (a); a fresh empty slice fails (b); only a genuinely
// integrated slice satisfies both. Safe to fire every turn, self-corrects on reverts.
// The default-branch half of (b) only recognises a fresh slice while the scope branch still sits at the
// default branch. Past the run's first merge, a slice cut from the moved-on scope branch reaches that
// branch's own commits, so it reads as worked with nothing on it — and, being trivially merged, gets
// swept out from under its implementer. The first-parent half is what recognises it: a slice branch cut
// from the scope branch points AT a commit on that branch's first-parent chain, while the `--no-ff`
// merges the run makes carry slice commits in as second parents, so a slice that did work never has its
// tip on that chain. A fast-forwarded slice branch does land on it, and is left standing — a slicetree
// that outlives its slice, never one removed while live.
// Best-effort and silent: any git error, a dirty slicetree, an unreadable ledger, or no .superdev/ →
// no-op for the affected scope (or the whole sweep, where the failure isn't scope-specific).

const fs = require('node:fs');
const path = require('node:path');

// `lib/git-spawn.js` owns the git calls: `gitThrow` is argv-based (no shell), so a repo-derived value (branch
// name, slicetree path) containing a quote/backtick/$() can't break out and inject, and `parseBranchList` reads
// the `git branch` listing. No fallback: a hook that cannot run git sweeps nothing, so a failed load, or a module
// missing either name, leaves both null and main() sweeps nothing, silently. The names are taken only once the
// module carries both, so a partial module reads as an unloaded one. `git` is the name this hook and its suite
// call `gitThrow` by.
let git = null;
let parseBranchList = null;
try {
  const gitModule = require('../lib/git-spawn.js');
  if (typeof gitModule.gitThrow === 'function' && typeof gitModule.parseBranchList === 'function') {
    ({ gitThrow: git, parseBranchList } = gitModule);
  }
} catch {
  // Left null. main() checks these before doing anything below.
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
  // Git prints `C:/…` on Windows where Node builds `C:\…`: compare with `\` as `/` and a lower-cased
  // drive letter. `wt` itself stays as git printed it, since that is what `git worktree remove` takes.
  // Only a drive-letter path is Windows-shaped; a POSIX path compares as written, where `\` is a name character.
  const norm = (p) =>
    /^[A-Za-z]:/.test(p) ? p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, (d) => d.toLowerCase()) : p;
  const prefix = norm(scopeRoot).replace(/\/?$/, '/');
  const out = [];
  for (const block of porcelain.split('\n\n')) {
    const wt = (block.match(/^worktree (.+)$/m) || [])[1];
    const br = (block.match(/^branch refs\/heads\/(.+)$/m) || [])[1];
    if (!wt || !br) continue; // detached or main worktree — skip
    const nwt = norm(wt);
    if (!nwt.startsWith(prefix)) continue; // only this scope's own slicetrees
    if (path.posix.basename(path.posix.dirname(nwt)) !== 'slicetrees') continue; // .../<scope>/slicetrees/<id>
    if (!/^slice\//.test(br)) continue; // only slice/* branches
    if (!mergedSet.has(br)) continue; // (a) integrated into this scope's own branch
    if (!workedSet.has(br)) continue; // (b) has real committed work — not a fresh empty branch
    out.push({ wt, br });
  }
  return out;
}

// `lib/ledger.js` owns the ledger's schema, so it owns how a header value is read (ADR 0022).
// `hooks/scope-prune.js` already requires this export for the same reason. No fallback: a hook that
// cannot read a scope's branch must never guess it, so a require failure below leaves this null and
// main() sweeps nothing for any scope, silently — the same fail-closed direction a git error takes.
let readLedgerHeader = null;
try {
  ({ readLedgerHeader } = require('../lib/ledger.js'));
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
  if (!readLedgerHeader || !git || !parseBranchList) return; // shared reader or git module unavailable → sweep nothing, say nothing
  const superdevRoot = path.join(cwd, '.superdev');
  if (!fs.existsSync(superdevRoot)) return; // not a superdev run in this repo
  const def = defaultBranch(cwd);
  if (!def) return; // can't establish a base → don't risk sweeping

  let worked, tips, porcelain;
  try {
    // slice branches with ≥1 commit not in the default branch = genuinely worked
    worked = new Set();
    tips = new Map(); // branch -> tip sha, for the per-scope first-parent test below
    const sliceBranches = git(['for-each-ref', '--format=%(objectname) %(refname:short)', 'refs/heads/slice'], cwd)
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split(' '));
    for (const [sha, b] of sliceBranches) {
      tips.set(b, sha);
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

    let merged, mainline;
    try {
      merged = parseBranchList(git(['branch', '--merged', branch], cwd));
      // The scope branch's own first-parent chain, past the default branch: every commit a slice can be
      // cut from without doing any work of its own. Bounded by the run's own commits, not the repo's.
      mainline = new Set(git(['rev-list', '--first-parent', branch, '--not', def], cwd).split('\n').filter(Boolean));
    } catch {
      continue; // the scope's branch doesn't resolve → sweep nothing for this scope
    }

    // A slice branch still parked on that chain has no commit of its own, whatever the default-branch
    // test said, so it is not worked for this scope.
    const workedHere = new Set([...worked].filter((b) => !mainline.has(tips.get(b))));

    toRemove.push(...selectRemovable(porcelain, merged, workedHere, path.join(scopesRoot, scope)));
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
