#!/usr/bin/env node
'use strict';

// scope-prune: Stop hook. Deterministically removes a completed superdev scope run root
// (.superdev/scopes/<scope>/ — ledger.md, dod.md, the git-ignored post-mortem trail) once its
// scope branch (<type>/<scope>) is merged into the current branch AND the run root has sat
// untouched past a staleness TTL AND the ledger's `**Stage:**` line reads `shipped`. Mirrors
// hooks/worktree-sweep.js's merged-branch check one level up (scope branch instead of slice branch) —
// same "safe by default" shape: never touches a run whose scope branch isn't merged yet (still active),
// never touches one whose worktree is still present (an interrupted cleanup, not a finished run — leave
// it for a human to look at), and never touches one that isn't recorded as `shipped` — a full run leaves
// its invoking checkout ON the scope branch until `/superdev:ship` §6 returns it to base, and cuts no
// worktree meanwhile, so the TTL and the worktree guard alone would let it prune a scope still mid-chain
// (ADR 0013).
// ponytail: TTL is one flat value for every scope; a per-scope override would need its own config
// knob — add one if varying retention actually comes up, but YAGNI for now.
// Best-effort and silent: any git error, or no .superdev/scopes/ → no-op.

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days past scope-branch merge

// A scope branch is `<type>/<scope>`, where `<type>` is the change type — the Conventional Commits type
// of the work (`references/scope-mode.md`, `## The change type`). The run-root directory name carries the
// slug alone, so the branch cannot be rebuilt from it: match the last segment against the scope and the
// leading segment against the type set instead. `slice/<scope>/<id>` never matches — its last segment is
// the slice id.
const CHANGE_TYPES = /^(feat|fix|refactor|docs|perf|test|build|ci|chore|style|revert)$/;

function isScopeBranchMerged(mergedSet, scope) {
  for (const branch of mergedSet) {
    const cut = branch.lastIndexOf('/');
    if (cut < 1) continue; // no type segment → not a scope branch
    if (branch.slice(cut + 1) === scope && CHANGE_TYPES.test(branch.slice(0, cut))) return true;
  }
  return false;
}

function sh(cmd, cwd) {
  return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
}

// Pure: from the list of scope directory names, the merged-branch set, a function returning each
// scope's newest-file mtime (ms, or null if unreadable), and a function returning each scope's ledger
// stage (or null if the ledger is unreadable or carries no `**Stage:**` line), return the scope names
// prunable now. `git branch --merged` also lists the branch a full run's invoking checkout is switched
// to mid-chain (the current branch itself, until `/superdev:ship` §6 switches it back to base), and a
// full run leaves no `worktree`/`worktrees` dir for the guard below to catch — so the TTL was the only
// remaining protection until this stage gate. Only a scope whose
// ledger stage is `shipped` is prunable: that is the signal `/superdev:ship` writes at the end of the
// chain, and it is stronger than "merged" on every tier. An unreadable ledger, or one with no stage line,
// is never prunable — that is not evidence a run finished, only evidence nothing can be read.
function selectPrunable(scopeNames, mergedSet, mtimeOf, stageOf) {
  const out = [];
  for (const scope of scopeNames) {
    if (!isScopeBranchMerged(mergedSet, scope)) continue; // scope branch not merged → still active
    const mtime = mtimeOf(scope);
    if (mtime == null) continue; // unreadable → leave it, don't guess
    if (Date.now() - mtime < TTL_MS) continue; // not stale yet
    if (stageOf(scope) !== 'shipped') continue; // not shipped (or unreadable/no line) → never prunable
    out.push(scope);
  }
  return out;
}

// Reads the ledger's `**Stage:**` line for one scope. Returns the stage value, or null when the ledger
// is unreadable or carries no such line.
function readStage(scopeDir) {
  try {
    const text = fs.readFileSync(path.join(scopeDir, 'ledger.md'), 'utf8');
    const match = text.match(/\*\*Stage:\*\*\s*(\S+)/);
    // Strip markup and trailing punctuation: `/superdev:ship` §5 writes the value in backticks
    // (`` `shipped` ``), and a bare capture would then never match the plain stage names below. Two
    // sequential strips rather than one alternation, because one pass cannot remove a marker that a
    // neighbouring marker hides: in `` `shipped`. `` the trailing backtick sits behind the period, so an
    // alternation anchored on the end of the string never reaches it.
    return match ? match[1].replace(/^[`*]+/, '').replace(/[`*.,;:]+$/, '') : null;
  } catch {
    return null;
  }
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

  const prunable = selectPrunable(
    scopeNames,
    merged,
    (scope) => {
      try {
        return newestMtimeMs(path.join(scopesRoot, scope));
      } catch {
        return null;
      }
    },
    (scope) => readStage(path.join(scopesRoot, scope)),
  );

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

  // #merged-and-stale: merged branch, mtime past TTL, ledger stage `shipped` → prune.
  // #merged-and-fresh: merged branch, mtime within TTL → skip (too soon), regardless of stage.
  // #unmerged: scope branch not merged (still active) → skip regardless of age or stage.
  const shipped = () => 'shipped';
  const mtimes = { 'merged-and-stale': STALE, 'merged-and-fresh': FRESH, unmerged: STALE };
  const merged = new Set(['main', 'fix/merged-and-stale', 'docs/merged-and-fresh']);
  assert.deepEqual(
    selectPrunable(Object.keys(mtimes), merged, (s) => mtimes[s], shipped),
    ['merged-and-stale'],
    'only a merged AND stale AND shipped scope is pruned'
  );
  assert.deepEqual(
    selectPrunable(['unknown-mtime'], merged, () => null, shipped),
    [],
    'unreadable mtime is never pruned'
  );

  // A full-tier run leaves the invoking checkout on the scope branch until `/superdev:ship` §6 returns
  // it to base, so `git branch --merged` lists it as merged from the moment `/superdev:implement`
  // finishes — long before the run is done. A full run also cuts no per-scope worktree, so the guard
  // below never fires either. The TTL was the only remaining protection, and a human-paced chain can sit
  // past it while still mid-review. This is the RED case: a merged, stale scope whose ledger stage is
  // `reviewed` (review ran, ship never did) must not be pruned.
  // The branch matcher takes the change type from the branch, because the run root's directory name is
  // the slug alone. Only a Conventional Commits type counts: a slice branch (`slice/<scope>/<id>`) and a
  // maintainer's own `wip/<scope>` both name the scope somewhere, and pruning a run root on either one
  // would delete a live run's ledger.
  assert.equal(isScopeBranchMerged(new Set(['refactor/exports']), 'exports'), true, 'a typed scope branch counts');
  assert.equal(isScopeBranchMerged(new Set(['wip/exports']), 'exports'), false, 'an untyped branch does not');
  assert.equal(isScopeBranchMerged(new Set(['slice/exports/03']), 'exports'), false, 'a slice branch does not');
  assert.equal(isScopeBranchMerged(new Set(['exports']), 'exports'), false, 'a bare branch name does not');

  const mergedStaleUnshipped = new Set(['main', 'feat/parked-mid-chain']);
  assert.deepEqual(
    selectPrunable(['parked-mid-chain'], mergedStaleUnshipped, () => STALE, () => 'reviewed'),
    [],
    'a merged, stale scope whose ledger stage is not `shipped` is never pruned'
  );

  // An unreadable ledger, or one with no `**Stage:**` line, is not evidence a run finished — it is
  // evidence nothing can be read. Never prune on a guess.
  assert.deepEqual(
    selectPrunable(['parked-mid-chain'], mergedStaleUnshipped, () => STALE, () => null),
    [],
    'a scope with no readable stage is never pruned'
  );

  // --- readStage: reads the ledger's `**Stage:**` line, or null when unreadable/absent ---
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-'));
  fs.writeFileSync(path.join(tmp, 'ledger.md'), '# ledger\n\n**Stage:** shipped\n');
  assert.equal(readStage(tmp), 'shipped', 'reads the stage value off the ledger line');
  assert.equal(readStage(path.join(tmp, 'no-such-dir')), null, 'an unreadable ledger yields null');
  fs.rmSync(tmp, { recursive: true, force: true });

  // `/superdev:ship` §5 sets the stage line with the value in backticks (`` **Stage:** `shipped` ``), so
  // an agent may well write it that way. The capture must still read `shipped`, or the gate never
  // matches and pruning is silently disabled forever.
  const tmpBacktick = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-'));
  fs.writeFileSync(path.join(tmpBacktick, 'ledger.md'), '# ledger\n\n**Stage:** `shipped`\n');
  assert.equal(readStage(tmpBacktick), 'shipped', 'strips backticks from the captured stage value');
  const backtickMerged = new Set(['main', 'chore/backticked']);
  assert.deepEqual(
    selectPrunable(['backticked'], backtickMerged, () => STALE, () => readStage(tmpBacktick)),
    ['backticked'],
    'a ledger whose stage line wraps the value in backticks is still prunable'
  );
  fs.rmSync(tmpBacktick, { recursive: true, force: true });

  // The two spellings a maintainer or an agent also plausibly writes: a backticked value followed by a
  // period, and an emphasized value. Both must normalize, or the gate silently stops matching and the
  // scope is never pruned. Every one of these is a real stage line, so the strip must not care in which
  // order the markers appear.
  for (const [line, label] of [
    ['**Stage:** `shipped`.', 'a backticked value with a trailing period'],
    ['**Stage:** **shipped**', 'an emphasized value'],
    ['**Stage:** shipped.', 'a plain value with a trailing period'],
    ['**Stage:** `shipped`', 'a backticked value'],
    ['**Stage:** shipped', 'a plain value'],
  ]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-'));
    fs.writeFileSync(path.join(dir, 'ledger.md'), `# ledger\n\n${line}\n`);
    assert.equal(readStage(dir), 'shipped', `normalizes ${label}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // The strip must not turn a different stage into `shipped`. Every one of these stays itself, so a scope
  // that has not shipped is never pruned by a normalization accident.
  for (const [line, expected] of [
    ['**Stage:** documented-unreviewed', 'documented-unreviewed'],
    ['**Stage:** `reviewed`', 'reviewed'],
    ['**Stage:** unshipped', 'unshipped'],
    ['**Stage:** not-shipped', 'not-shipped'],
  ]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-'));
    fs.writeFileSync(path.join(dir, 'ledger.md'), `# ledger\n\n${line}\n`);
    assert.equal(readStage(dir), expected, `leaves \`${expected}\` as itself`);
    assert.notEqual(readStage(dir), 'shipped', `never reads \`${expected}\` as shipped`);
    fs.rmSync(dir, { recursive: true, force: true });
  }

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
