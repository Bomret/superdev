#!/usr/bin/env node
'use strict';

// scope-prune: Stop hook. Deterministically removes a completed superdev scope run root
// (.superdev/scopes/<scope>/ — ledger.md, dod.md, the git-ignored post-mortem trail) once its
// scope branch (<type>/<scope>) is merged into the current branch OR gone, AND the run root has sat
// untouched past a staleness TTL, AND the ledger's `**Stage:**` line reads `shipped` (ADR 0007).
// Absence counts because a squash merge leaves no ancestry for `git branch --merged` to find, and a code
// host that squash-merges deletes the branch — so the deletion is the merge's only local trace.
// hooks/worktree-sweep.js keeps ancestry alone one level down, correctly: a slice branch merges into the
// scope branch normally, so its ancestry survives.
// Same "safe by default" shape throughout: never touches a run whose branch is still there and unmerged
// (still active), never touches one whose worktree is still present (an interrupted cleanup, not a
// finished run — leave it for a human to look at), and never touches one that isn't recorded as
// `shipped` — a full run leaves its invoking checkout ON the scope branch until `/superdev:ship` §6
// returns it to base, and cuts no worktree meanwhile, so the TTL and the worktree guard alone would let
// it prune a scope still mid-chain (ADR 0013).
// ponytail: TTL is one flat value for every scope; a per-scope override would need its own config
// knob — add one if varying retention actually comes up, but YAGNI for now.
// Best-effort and silent: any git error, or no .superdev/scopes/ → no-op.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days past scope-branch merge

// A scope branch is `<type>/<scope>`, where `<type>` is the change type — the Conventional Commits type
// of the work (`references/scope-mode.md`, `## The change type`). The run-root directory name carries the
// slug alone, so the branch cannot be rebuilt from it: match the last segment against the scope and the
// leading segment against the type set instead. `slice/<scope>/<id>` never matches — its last segment is
// the slice id.
const CHANGE_TYPES = /^(feat|fix|refactor|docs|perf|test|build|ci|chore|style|revert)$/;

function hasScopeBranch(branchSet, scope) {
  for (const branch of branchSet) {
    const cut = branch.lastIndexOf('/');
    if (cut < 1) continue; // no type segment → not a scope branch
    if (branch.slice(cut + 1) === scope && CHANGE_TYPES.test(branch.slice(0, cut))) return true;
  }
  return false;
}

// Normalises `git for-each-ref refs/heads refs/remotes` output to plain branch names, so a local branch
// and its remote-tracking copy compare equal. `refs/remotes/<remote>/HEAD` is a symbolic ref rather than
// a branch, and drops out.
function branchNamesFrom(refLines) {
  const names = new Set();
  for (const raw of refLines) {
    const ref = raw.trim();
    if (ref.startsWith('refs/heads/')) {
      names.add(ref.slice('refs/heads/'.length));
      continue;
    }
    if (!ref.startsWith('refs/remotes/')) continue;
    const rest = ref.slice('refs/remotes/'.length);
    const cut = rest.indexOf('/'); // drop the remote name, whatever it is called
    if (cut < 1) continue;
    const name = rest.slice(cut + 1);
    if (name !== 'HEAD') names.add(name);
  }
  return names;
}

// execFileSync, not execSync: no shell in between, so `%(refname)` and anything else git's own
// argument-parsing wants never crosses a shell that would treat `(` as a metacharacter.
function git(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
}

// Pure: from the list of scope directory names, the merged-branch set, a function returning each
// scope's newest-file mtime (ms, or null if unreadable), a function returning each scope's ledger
// stage (or null if the ledger is unreadable or carries no `**Stage:**` line), the set of every branch
// this repository knows (local and remote-tracking, `branchNamesFrom` above), and a function returning
// each scope's exact branch name from its ledger (`readBranch` below, or null for a pre-CLI ledger),
// return the scope names prunable now.
//
// A scope's work is finished with when its branch is **merged or gone** (ADR 0007). Ancestry alone
// misses a squash merge, which creates none: the branch's commits never become ancestors of the base, so
// `git branch --merged` never lists it and nothing downstream of this guard ever runs. A code host that
// squash-merges also deletes the branch, so absence carries the signal ancestry lost. Absence is read
// from refs the repository already holds, so an unfetched remote-tracking ref still counts as present
// and the scope survives — this fails closed, which is the only safe direction for a delete.
//
// `git branch --merged` also lists the branch a full run's invoking checkout is switched
// to mid-chain (the current branch itself, until `/superdev:ship` §6 switches it back to base), and a
// full run leaves no `worktree`/`worktrees` dir for the guard below to catch — so the TTL was the only
// remaining protection until this stage gate. Only a scope whose
// ledger stage is `shipped` is prunable: that is the signal `/superdev:ship` writes at the end of the
// chain, and it is stronger than "merged" on every tier. An unreadable ledger, or one with no stage line,
// is never prunable — that is not evidence a run finished, only evidence nothing can be read. The stage
// is also what keeps absence narrow: a branch deleted without ever merging looks identical here, and only
// `/superdev:ship` writes `shipped`, after ticking the DoD and opening a pull request.
// Whether `scope`'s branch is present in `branchSet`. `exactBranch` (from `readBranch` below) is
// authoritative when the ledger carries a `**Branch:**` line — exact-name membership, no guessing
// (references/scope-mode.md, `## The scope branch`). The shape scan (`hasScopeBranch`) is the fallback,
// only for a pre-CLI ledger with no such line: it can misread a branch as gone that is really alive and
// unmerged, either because its type isn't in `CHANGE_TYPES` (`feature/x` vs `feat/x`) or because the
// slug in its name has drifted from the run-root's directory name — and reading "gone" here prunes a
// live run's root, not just skips a merge.
function branchPresent(branchSet, scope, exactBranch) {
  return exactBranch ? branchSet.has(exactBranch) : hasScopeBranch(branchSet, scope);
}

function selectPrunable(scopeNames, mergedSet, mtimeOf, stageOf, allBranchSet, branchOf) {
  const out = [];
  for (const scope of scopeNames) {
    // Required, not defaulted: a caller that forgets it should get a crash, not a silent fall-through
    // to the shape-scan guess (Important 3 removed that guess as the default; `() => null` opts a
    // caller into it deliberately).
    const exact = branchOf(scope);
    // Present but unmerged → still active. Gone → finished with, whatever ancestry says.
    if (!branchPresent(mergedSet, scope, exact) && branchPresent(allBranchSet, scope, exact)) continue;
    const mtime = mtimeOf(scope);
    if (mtime == null) continue; // unreadable → leave it, don't guess
    if (Date.now() - mtime < TTL_MS) continue; // not stale yet
    if (stageOf(scope) !== 'shipped') continue; // not shipped (or unreadable/no line) → never prunable
    out.push(scope);
  }
  return out;
}

// `scripts/scope.js` owns the ledger's schema, so it owns how a header value is read (ADR 0022). This
// hook carried its own regex and drifted from it on four axes while being hardened — anchoring, capture
// width, newline crossing, normalisation — and none of those fixes travelled back. There is one reader
// now, and no fallback: a fallback is the second reader again, and the second reader is the defect.
let readLedgerHeader = null;
try {
  ({ readLedgerHeader } = require('../scripts/scope.js'));
} catch {
  // Left null. main() prunes nothing below — the same fail-closed direction a git error takes, because
  // a hook that cannot read a stage must never conclude a scope is finished with.
}

function readHeader(scopeDir, name) {
  try {
    return readLedgerHeader(fs.readFileSync(path.join(scopeDir, 'ledger.md'), 'utf8'), name);
  } catch {
    return null;
  }
}

// Reads the ledger's `**Stage:**` line for one scope. Returns the stage value, or null when the ledger
// is unreadable or carries no such line.
function readStage(scopeDir) {
  return readHeader(scopeDir, 'Stage');
}

// Reads the ledger's `**Branch:**` line for one scope. Returns the branch name, or null when the ledger
// is unreadable or carries no such line — a pre-CLI ledger, written before `scope.js init` started
// recording it.
function readBranch(scopeDir) {
  return readHeader(scopeDir, 'Branch');
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
  if (!readLedgerHeader) return; // shared reader unavailable → prune nothing, say nothing
  const scopesRoot = path.join(cwd, '.superdev', 'scopes');
  if (!fs.existsSync(scopesRoot)) return; // no superdev runs in this repo

  let merged;
  let allBranches;
  try {
    merged = new Set(
      git(['branch', '--merged'], cwd)
        .split('\n')
        .map((s) => s.replace(/^[*+ ]+/, '').trim())
        .filter(Boolean)
    );
    // Read in the same try as the merged set, so a git failure bails before absence is computed. An
    // empty branch set would otherwise read as "every scope's branch is gone" and prune the lot.
    allBranches = branchNamesFrom(
      git(['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes'], cwd).split('\n')
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
    allBranches,
    (scope) => readBranch(path.join(scopesRoot, scope)),
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
  // Every scope here still has its branch, so ancestry is the question being asked of each.
  const present = new Set([...merged, 'feat/unmerged']);
  assert.deepEqual(
    selectPrunable(Object.keys(mtimes), merged, (s) => mtimes[s], shipped, present, () => null),
    ['merged-and-stale'],
    'only a merged AND stale AND shipped scope is pruned'
  );
  assert.deepEqual(
    selectPrunable(['unknown-mtime'], merged, () => null, shipped, present, () => null),
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
  assert.equal(hasScopeBranch(new Set(['refactor/exports']), 'exports'), true, 'a typed scope branch counts');
  assert.equal(hasScopeBranch(new Set(['wip/exports']), 'exports'), false, 'an untyped branch does not');
  assert.equal(hasScopeBranch(new Set(['slice/exports/03']), 'exports'), false, 'a slice branch does not');
  assert.equal(hasScopeBranch(new Set(['exports']), 'exports'), false, 'a bare branch name does not');

  const mergedStaleUnshipped = new Set(['main', 'feat/parked-mid-chain']);
  assert.deepEqual(
    selectPrunable(['parked-mid-chain'], mergedStaleUnshipped, () => STALE, () => 'reviewed', mergedStaleUnshipped, () => null),
    [],
    'a merged, stale scope whose ledger stage is not `shipped` is never pruned'
  );

  // An unreadable ledger, or one with no `**Stage:**` line, is not evidence a run finished — it is
  // evidence nothing can be read. Never prune on a guess.
  assert.deepEqual(
    selectPrunable(['parked-mid-chain'], mergedStaleUnshipped, () => STALE, () => null, mergedStaleUnshipped, () => null),
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
    selectPrunable(['backticked'], backtickMerged, () => STALE, () => readStage(tmpBacktick), backtickMerged, () => null),
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

  // --- A squash-merged scope: the branch is gone, and ancestry never recorded the merge ---
  //
  // `git branch --merged` reads ancestry, and a squash merge creates none — the branch's commits never
  // become ancestors of the base. A code host that squash-merges also deletes the branch, so absence is
  // the signal ancestry lost (ADR 0007). Measured on a real squashed scope of twelve commits: every one
  // came back `+` from `git cherry`, and the tree comparison that does detect it needs a branch that no
  // longer exists.
  const ALL = (...names) => new Set(['main', ...names]);

  assert.deepEqual(
    selectPrunable(['squashed'], ALL(), () => STALE, shipped, ALL(), () => null),
    ['squashed'],
    'a gone branch, shipped and past the TTL, is prunable'
  );
  assert.deepEqual(
    selectPrunable(['squashed'], ALL(), () => STALE, () => 'reviewed', ALL(), () => null),
    [],
    'a gone branch whose stage is not `shipped` is never prunable'
  );
  assert.deepEqual(
    selectPrunable(['squashed'], ALL(), () => FRESH, shipped, ALL(), () => null),
    [],
    'a gone branch inside the TTL is never prunable'
  );
  assert.deepEqual(
    selectPrunable(['squashed'], ALL(), () => STALE, () => null, ALL(), () => null),
    [],
    'a gone branch with no readable stage is never prunable'
  );

  // Present-but-unmerged is the case absence must not swallow: the branch exists, so the work is still
  // in flight and ancestry is the right question to ask about it.
  assert.deepEqual(
    selectPrunable(['live'], ALL(), () => STALE, shipped, ALL('feat/live'), () => null),
    [],
    'a branch that exists but is unmerged is never prunable'
  );
  assert.deepEqual(
    selectPrunable(['landed'], ALL('feat/landed'), () => STALE, shipped, ALL('feat/landed'), () => null),
    ['landed'],
    'a branch that exists and is merged is still prunable, exactly as before'
  );

  // A remote-tracking ref the user has not pruned counts as present, so an unfetched repository prunes
  // nothing. Failing closed is the whole point: absence is only evidence when the refs are current.
  assert.deepEqual(
    selectPrunable(['unfetched'], ALL(), () => STALE, shipped, ALL('fix/unfetched'), () => null),
    [],
    'a stale remote-tracking ref keeps the scope alive — absence fails closed'
  );

  // Absence is matched by the same shape rule as ancestry: only a change-typed branch names this scope.
  // A `slice/<scope>/<id>` or a maintainer's `wip/<scope>` must not read as the scope branch, or its
  // presence would keep a finished run's root forever.
  assert.deepEqual(
    selectPrunable(['exports'], ALL(), () => STALE, shipped, ALL('slice/exports/03', 'wip/exports'), () => null),
    ['exports'],
    'a slice branch and a wip branch do not count as the scope branch being present'
  );

  // --- readBranch / branchPresent: the ledger's `**Branch:**` line is authoritative, the shape scan is
  // only the pre-CLI fallback (references/scope-mode.md, `## The scope branch`) ---
  //
  // The shape scan alone reads a live, unmerged branch as gone in two ordinary ways: a change type it
  // doesn't recognise, or a slug that drifted from the run-root's directory name. Both would prune a run
  // still mid-flight, because "gone" and "shipped" together mean prunable.
  {
    const os = require('node:os');

    // `feature/alpha`: the type is not in CHANGE_TYPES (only `feat` is), so the shape scan reads
    // `alpha`'s branch as gone even though it exists and is unmerged.
    const alphaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-branch-'));
    fs.writeFileSync(path.join(alphaDir, 'ledger.md'), '# ledger\n\n**Branch:** feature/alpha\n');
    assert.equal(readBranch(alphaDir), 'feature/alpha', 'reads the exact branch off the ledger line');
    const alphaAll = new Set(['main', 'feature/alpha']);
    assert.deepEqual(
      selectPrunable(['alpha'], new Set(['main']), () => STALE, shipped, alphaAll, () => readBranch(alphaDir)),
      [],
      'an unrecognised-type branch the ledger names as present is never read as gone'
    );
    fs.rmSync(alphaDir, { recursive: true, force: true });

    // `fix/delta-v2`: the type is recognised, but the run-root directory name (`delta`) is not the
    // branch's last segment (`delta-v2`), so the shape scan misses it too.
    const deltaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-branch-'));
    fs.writeFileSync(path.join(deltaDir, 'ledger.md'), '# ledger\n\n**Branch:** fix/delta-v2\n');
    const deltaAll = new Set(['main', 'fix/delta-v2']);
    assert.deepEqual(
      selectPrunable(['delta'], new Set(['main']), () => STALE, shipped, deltaAll, () => readBranch(deltaDir)),
      [],
      'a drifted-slug branch the ledger names as present is never read as gone'
    );
    fs.rmSync(deltaDir, { recursive: true, force: true });

    // A pre-CLI ledger carries no `**Branch:**` line: readBranch returns null, and selectPrunable falls
    // back to the shape scan exactly as before this change.
    const preDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-branch-'));
    fs.writeFileSync(path.join(preDir, 'ledger.md'), '# ledger\n\n**Stage:** shipped\n');
    assert.equal(readBranch(preDir), null, 'a pre-CLI ledger carries no Branch line');
    const preAll = new Set(['main', 'fix/precli']);
    assert.deepEqual(
      selectPrunable(['precli'], preAll, () => STALE, shipped, preAll, () => readBranch(preDir)),
      ['precli'],
      'a pre-CLI ledger falls back to the shape scan, which reads a merged branch as prunable'
    );
    fs.rmSync(preDir, { recursive: true, force: true });

    // A hand-written ledger's `**Branch:**` line may carry the same markup `/superdev:ship` §5 writes on
    // `**Stage:**` — hand-written is exactly the population that produces it. Unlike Stage, Branch's
    // failure direction is destructive: an unstripped value matches nothing in the branch set,
    // `branchPresent` reads a live, unmerged branch as gone, and the run root is deleted instead of
    // skipped. RED without the shared `readHeader` strip: each of these branches is present and unmerged,
    // so the scope must never be pruned.
    for (const [line, expected] of [
      ['**Branch:** `fix/bt`', 'fix/bt'],
      ['**Branch:** **fix/em**', 'fix/em'],
      ['**Branch:** fix/period.', 'fix/period'],
    ]) {
      const markupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-branch-'));
      fs.writeFileSync(path.join(markupDir, 'ledger.md'), `# ledger\n\n${line}\n`);
      assert.equal(readBranch(markupDir), expected, `readBranch strips markup down to ${expected}`);
      const alive = new Set(['main', expected]);
      assert.deepEqual(
        selectPrunable(['x'], new Set(['main']), () => STALE, shipped, alive, () => readBranch(markupDir)),
        [],
        `a scope whose branch is ${expected}, alive and unmerged, is never pruned`
      );
      fs.rmSync(markupDir, { recursive: true, force: true });
    }

    // An empty `**Branch:**` line (the CLI writes the header before the value is known) must read as
    // absent, not spill into the next header's name. `\s` matches `\n`, so an ungated `\s*` after the
    // colon lets a value-less `**Branch:**` line capture the following line's `**Anchor:**` token,
    // stripped down to `Anchor` — truthy, and present in no real branch set, so `branchPresent` reads a
    // live, unmerged branch as gone. Gone + shipped + past TTL prunes a run root with a live branch.
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-branch-'));
    fs.writeFileSync(
      path.join(emptyDir, 'ledger.md'),
      '# ledger\n\n**Stage:** shipped\n**Branch:**\n**Anchor:** #197 — Epic\n'
    );
    assert.equal(readBranch(emptyDir), null, 'an empty Branch line never captures the next line\'s token');
    const emptyAll = new Set(['main', 'feat/emptybranch']);
    assert.deepEqual(
      selectPrunable(['emptybranch'], new Set(['main']), () => STALE, shipped, emptyAll, () => readBranch(emptyDir)),
      [],
      'a scope with an empty Branch line and a live, unmerged branch is never pruned'
    );
    fs.rmSync(emptyDir, { recursive: true, force: true });

    // The exact-branch read is exclusive, not a fallback union with the shape scan: when the ledger
    // names a branch, only that literal name counts as present. A different, shape-matching branch
    // alive in the repo (`fix/exports`, matching the scope by name) must not rescue a scope whose
    // ledger names a branch (`fix/renamed-away`) that is actually gone — that branch was renamed, and
    // the shape match is a coincidence, not evidence the named one survived.
    const exclusiveAll = new Set(['main', 'fix/exports']);
    assert.deepEqual(
      selectPrunable(['exports'], new Set(['main']), () => STALE, shipped, exclusiveAll, () => 'fix/renamed-away'),
      ['exports'],
      'a ledger-named branch that is gone is never rescued by an unrelated shape-matching branch'
    );
  }

  // --- branchNamesFrom: normalises `git for-each-ref` output to comparable branch names ---
  const refs = [
    'refs/heads/main',
    'refs/heads/fix/local-only',
    'refs/remotes/origin/main',
    'refs/remotes/origin/fix/on-remote',
    'refs/remotes/origin/HEAD',
    'refs/remotes/upstream/feat/other-remote',
    '',
  ];
  const names = branchNamesFrom(refs);
  assert.equal(names.has('fix/local-only'), true, 'a local branch keeps its name');
  assert.equal(names.has('fix/on-remote'), true, 'a remote-tracking ref drops its remote prefix');
  assert.equal(names.has('feat/other-remote'), true, 'a second remote is handled the same way');
  assert.equal(names.has('HEAD'), false, "origin/HEAD is a symbolic ref, not a branch");
  assert.equal(names.has('origin/main'), false, 'no name keeps its remote prefix');

  // --- smoke test: main() end to end, against a real repository ---
  //
  // Every case above calls the pure functions directly, with hand-built Sets and string arrays — never
  // sh()/git()/main(). A shell-quoted git command that throws on every invocation (Critical 1: unquoted
  // `%(refname)` hitting /bin/sh) would still pass all of them, because main()'s try/catch swallows the
  // error and prunes nothing, silently. Only running main() against a real repository catches that.
  {
    const os = require('node:os');

    function gitTest(args, cwd) {
      execFileSync('git', args, { cwd, stdio: 'ignore' });
    }

    function makeRepo() {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-smoke-'));
      gitTest(['init', '-q', '-b', 'main'], dir);
      gitTest(['config', 'user.email', 'test@example.com'], dir);
      gitTest(['config', 'user.name', 'test'], dir);
      fs.writeFileSync(path.join(dir, 'README.md'), 'x\n');
      gitTest(['add', '.'], dir);
      gitTest(['commit', '-q', '-m', 'init'], dir);
      return dir;
    }

    function makeScope(repoDir, scope, ledgerBody = '**Stage:** shipped\n') {
      const scopeDir = path.join(repoDir, '.superdev', 'scopes', scope);
      fs.mkdirSync(scopeDir, { recursive: true });
      const ledger = path.join(scopeDir, 'ledger.md');
      fs.writeFileSync(ledger, `# ledger\n\n${ledgerBody}`);
      const past = new Date(Date.now() - TTL_MS - 1000);
      fs.utimesSync(ledger, past, past);
      return scopeDir;
    }

    // #gone-and-shipped: no branch named for this scope anywhere in the repo, ledger stage `shipped`,
    // mtime past the TTL → main() removes the run root.
    const goneRepo = makeRepo();
    const goneScopeDir = makeScope(goneRepo, 'squashed');
    main(goneRepo);
    assert.equal(fs.existsSync(goneScopeDir), false, 'a gone, shipped, stale scope is pruned end to end');
    fs.rmSync(goneRepo, { recursive: true, force: true });

    // #remote-only-branch: the scope branch is gone locally but its remote-tracking ref is still there →
    // main() leaves the run root alone. This is the fail-closed rule, and it is the one delete-path
    // property the pure cases above cannot pin: they hand `selectPrunable` a ready-made branch set, and
    // `branchNamesFrom` a ready-made string array, so neither sees which refs main() actually asks git
    // for. Narrow that read to `refs/heads` and every case above stays green while a live remote-only
    // scope's run root is deleted.
    const remoteRepo = makeRepo();
    const originDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-origin-'));
    gitTest(['init', '-q', '--bare', '-b', 'main'], originDir);
    gitTest(['remote', 'add', 'origin', originDir], remoteRepo);
    gitTest(['checkout', '-q', '-b', 'fix/onremote'], remoteRepo);
    fs.writeFileSync(path.join(remoteRepo, 'remote.md'), 'z\n');
    gitTest(['add', '.'], remoteRepo);
    gitTest(['commit', '-q', '-m', 'work on the remote branch'], remoteRepo);
    gitTest(['push', '-q', 'origin', 'main', 'fix/onremote'], remoteRepo);
    gitTest(['checkout', '-q', 'main'], remoteRepo);
    gitTest(['branch', '-q', '-D', 'fix/onremote'], remoteRepo); // local gone, origin/fix/onremote stays
    const remoteScopeDir = makeScope(remoteRepo, 'onremote', '**Stage:** shipped\n**Branch:** fix/onremote\n');
    main(remoteRepo);
    assert.equal(
      fs.existsSync(remoteScopeDir),
      true,
      'a branch gone locally but present as a remote-tracking ref is never pruned'
    );
    fs.rmSync(remoteRepo, { recursive: true, force: true });
    fs.rmSync(originDir, { recursive: true, force: true });

    // #present-and-unmerged: the scope branch exists and carries a commit `main` does not have → main()
    // leaves the run root alone, regardless of stage or staleness.
    const liveRepo = makeRepo();
    gitTest(['checkout', '-q', '-b', 'fix/live'], liveRepo);
    fs.writeFileSync(path.join(liveRepo, 'more.md'), 'y\n');
    gitTest(['add', '.'], liveRepo);
    gitTest(['commit', '-q', '-m', 'wip'], liveRepo);
    gitTest(['checkout', '-q', 'main'], liveRepo);
    const liveScopeDir = makeScope(liveRepo, 'live');
    main(liveRepo);
    assert.equal(fs.existsSync(liveScopeDir), true, 'a present, unmerged scope survives main() end to end');
    fs.rmSync(liveRepo, { recursive: true, force: true });

    // #present-and-unmerged-divergent-branch-value: same shape as #present-and-unmerged, but the ledger's
    // `**Branch:**` line carries trailing content after the real branch name — exactly what a hand-written
    // ledger produces (Important 1). A reader that captures past the first token never finds
    // `fix/divergent` in the branch set, reads the branch as gone, and main() deletes a run root whose
    // branch is alive and unmerged.
    const divergentRepo = makeRepo();
    gitTest(['checkout', '-q', '-b', 'fix/divergent'], divergentRepo);
    fs.writeFileSync(path.join(divergentRepo, 'more.md'), 'y\n');
    gitTest(['add', '.'], divergentRepo);
    gitTest(['commit', '-q', '-m', 'wip'], divergentRepo);
    gitTest(['checkout', '-q', 'main'], divergentRepo);
    const divergentScopeDir = makeScope(
      divergentRepo,
      'divergent',
      '**Stage:** shipped\n**Branch:** fix/divergent (PR #99 open)\n'
    );
    main(divergentRepo);
    assert.equal(
      fs.existsSync(divergentScopeDir),
      true,
      'a present, unmerged scope survives main() end to end even when the ledger Branch line carries trailing content'
    );
    fs.rmSync(divergentRepo, { recursive: true, force: true });

    // #ledger-named-branch-wired: every other fixture is shipped with no `**Branch:**` line, so both the
    // readBranch and readStage lambdas main() wires selectPrunable to could be swapped for `() => null` /
    // `() => 'shipped'` and still leave every case above green. `feature/alpha`'s type is not in
    // CHANGE_TYPES (only `feat` is), so the shape-scan fallback would misread it as gone; only the
    // ledger's exact `**Branch:**` line (readBranch, wired through) keeps it read as present.
    const alphaRepo = makeRepo();
    gitTest(['checkout', '-q', '-b', 'feature/alpha'], alphaRepo);
    fs.writeFileSync(path.join(alphaRepo, 'more.md'), 'y\n');
    gitTest(['add', '.'], alphaRepo);
    gitTest(['commit', '-q', '-m', 'wip'], alphaRepo);
    gitTest(['checkout', '-q', 'main'], alphaRepo);
    const alphaScopeDir = makeScope(alphaRepo, 'alpha', '**Stage:** shipped\n**Branch:** feature/alpha\n');
    main(alphaRepo);
    assert.equal(
      fs.existsSync(alphaScopeDir),
      true,
      'a ledger-named branch the shape scan would misread as gone survives main() end to end'
    );
    fs.rmSync(alphaRepo, { recursive: true, force: true });

    // #reviewed-stage-wired: branch gone, mtime stale — every other gate would prune — but the ledger
    // stage is `reviewed`, not `shipped`. Exercises the readStage lambda main() wires through, which the
    // fixture above cannot: it is already shipped, so swapping that lambda for `() => 'shipped'` changes
    // nothing there.
    const reviewedRepo = makeRepo();
    const reviewedScopeDir = makeScope(reviewedRepo, 'mid-review', '**Stage:** reviewed\n');
    main(reviewedRepo);
    assert.equal(
      fs.existsSync(reviewedScopeDir),
      true,
      'a scope whose ledger stage is not shipped survives main() end to end'
    );
    fs.rmSync(reviewedRepo, { recursive: true, force: true });

    // #gone-shipped-with-worktree: same as #gone-and-shipped — branch gone, stage `shipped`, mtime past
    // the TTL — but the run root also holds a `worktree/` dir: an interrupted cleanup, not a finished
    // run. main() must leave it for a human to look at, not delete it.
    const cleanupRepo = makeRepo();
    const cleanupScopeDir = makeScope(cleanupRepo, 'mid-cleanup');
    fs.mkdirSync(path.join(cleanupScopeDir, 'worktree'));
    main(cleanupRepo);
    assert.equal(fs.existsSync(cleanupScopeDir), true, 'a run root with a worktree/ dir survives main() end to end');
    fs.rmSync(cleanupRepo, { recursive: true, force: true });

    // #gone-shipped-with-worktrees: same as #gone-shipped-with-worktree, but the plural `worktrees/` dir
    // — the full tier's layout (references/implement-full.md), which actually holds nested git
    // worktrees, and so is the more consequential half of the guard to lose.
    const cleanupFullRepo = makeRepo();
    const cleanupFullScopeDir = makeScope(cleanupFullRepo, 'mid-cleanup-full');
    fs.mkdirSync(path.join(cleanupFullScopeDir, 'worktrees'));
    main(cleanupFullRepo);
    assert.equal(
      fs.existsSync(cleanupFullScopeDir),
      true,
      'a run root with a worktrees/ dir survives main() end to end'
    );
    fs.rmSync(cleanupFullRepo, { recursive: true, force: true });

    // #for-each-ref-failure-prunes-nothing: pins "read both git calls in the same try" (see the comment
    // above the try in main()). A shimmed `git` on PATH fails only `for-each-ref`; `branch --merged`
    // still succeeds. If the for-each-ref read fell back to an empty Set instead of aborting the whole
    // run, an empty branch set reads as "every scope's branch is gone", and this gone/shipped/stale scope
    // — which main() must otherwise leave untouched, because the read it needs failed — gets pruned.
    const failRepo = makeRepo();
    const failScopeDir = makeScope(failRepo, 'branch-read-fails');
    const fakeBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-fakebin-'));
    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    fs.writeFileSync(
      path.join(fakeBinDir, 'git'),
      `#!/bin/sh\nif [ "$1" = "for-each-ref" ]; then exit 1; fi\nexec "${realGit}" "$@"\n`
    );
    fs.chmodSync(path.join(fakeBinDir, 'git'), 0o755);
    const originalPath = process.env.PATH;
    process.env.PATH = `${fakeBinDir}${path.delimiter}${originalPath}`;
    try {
      main(failRepo);
    } finally {
      process.env.PATH = originalPath;
    }
    assert.equal(
      fs.existsSync(failScopeDir),
      true,
      'a git for-each-ref failure prunes nothing, even though branch --merged succeeded'
    );
    fs.rmSync(failRepo, { recursive: true, force: true });
    fs.rmSync(fakeBinDir, { recursive: true, force: true });
  }

  // The hook `require`s `../scripts/scope.js` (below), and nothing else asserts that `scripts/` actually
  // ships alongside `hooks/` in a real install. If a future packaging change stopped shipping it, this
  // hook would fail closed and prune nothing, forever, with no signal beyond that silence.
  assert.equal(
    fs.existsSync(path.join(__dirname, '..', 'scripts', 'scope.js')),
    true,
    'scripts/scope.js ships alongside this hook'
  );

  // --- one reader, shared with scripts/scope.js (ADR 0022) ---
  //
  // This hook carried its own header regex and it drifted on four axes — anchoring, capture width,
  // whether the whitespace after the colon crossed a newline, and normalisation — while being hardened
  // against defects on this very delete path. Every vector below is the same one `scope.js --selftest`
  // asserts, so agreement is a property of there being one implementation rather than of two staying
  // in step.
  {
    const os2 = require('node:os');
    const scope = require('../scripts/scope.js');
    const mk = (body) => {
      const d = fs.mkdtempSync(path.join(os2.tmpdir(), 'scope-prune-hdr-'));
      fs.writeFileSync(path.join(d, 'ledger.md'), body);
      return d;
    };

    for (const [line, name, expected, label] of [
      ['**Stage:** shipped', 'Stage', 'shipped', 'a plain token'],
      ['**Stage:** `shipped`.', 'Stage', 'shipped', 'a backticked token with a period'],
      ['**Stage:** **shipped**', 'Stage', 'shipped', 'an emphasised token'],
      ['**Stage:** reviewed', 'Stage', 'reviewed', 'a non-shipped stage, unchanged'],
      ['**Branch:** `fix/x`', 'Branch', 'fix/x', 'a backticked branch'],
      // The capture-width difference: the hook used to take the first token, so an anchor title
      // stopped at its first space. `scope.js` takes the rest of the line, and now so does this.
      ['**Anchor:** #208 — Epic: one reader, shared.', 'Anchor', '#208 — Epic: one reader, shared.', 'a prose anchor title'],
    ]) {
      const dir = mk(`# ledger\n\n${line}\n`);
      const viaHook = readHeader(dir, name);
      const viaScope = scope.readLedgerHeader(`# ledger\n\n${line}\n`, name);
      assert.equal(viaHook, expected, `hook reads ${label}`);
      assert.equal(viaHook, viaScope, `hook and scope.js agree on ${label}`);
      fs.rmSync(dir, { recursive: true, force: true });
    }

    // A CRLF ledger — one an editor or `core.autocrlf` wrote — reads exactly as the LF one does, on
    // both sides. The hook reaching a different answer here is what would let it miss `shipped` and
    // never reap a finished run root, silently.
    const crlf = mk('# ledger\r\n\r\n**Stage:** shipped\r\n**Branch:** fix/crlf\r\n');
    assert.equal(readStage(crlf), 'shipped', 'the hook reads a CRLF Stage');
    assert.equal(readBranch(crlf), 'fix/crlf', 'the hook reads a CRLF Branch');
    assert.equal(
      readStage(crlf),
      scope.readLedgerHeader('# ledger\r\n\r\n**Stage:** shipped\r\n**Branch:** fix/crlf\r\n', 'Stage'),
      'hook and scope.js agree under CRLF'
    );
    fs.rmSync(crlf, { recursive: true, force: true });

    // A value-less header line reads as absent, and never reaches the next line's token.
    const empty = mk('# ledger\n\n**Stage:** shipped\n**Branch:**\n**Anchor:** #208 — Epic\n');
    assert.equal(readHeader(empty, 'Branch'), null, 'an empty Branch line is absent');
    assert.equal(readHeader(empty, 'Stage'), 'shipped', 'its neighbours still read');
    assert.equal(readBranch(empty), null, 'readBranch agrees');
    assert.equal(readStage(empty), 'shipped', 'readStage agrees');
    fs.rmSync(empty, { recursive: true, force: true });

    assert.equal(readHeader(path.join(os2.tmpdir(), 'no-such-scope-dir'), 'Stage'), null, 'an unreadable ledger is null');
  }

  // #reader-unavailable: the hook cannot load the shared reader → it prunes nothing and says nothing.
  // A copy of this file outside the plugin cannot resolve `../scripts/scope.js`, which is exactly the
  // failure being tested. This proves the fail-closed property holds when the reader is unavailable — not
  // that the explicit `if (!readLedgerHeader) return;` guard in main() is what causes it: `readHeader`'s
  // own try/catch already yields null for every header in that case, and a null stage is never prunable
  // either way. The guard stays as explicit intent. Fail-closed is the same direction the hook already
  // takes on a git error: a hook that cannot read a stage must never conclude a scope is finished.
  {
    const os2 = require('node:os');
    const cp = require('node:child_process');
    const away = fs.mkdtempSync(path.join(os2.tmpdir(), 'scope-prune-orphan-'));
    fs.copyFileSync(__filename, path.join(away, 'scope-prune.js'));

    const repo = fs.mkdtempSync(path.join(os2.tmpdir(), 'scope-prune-orphan-repo-'));
    const g = (args) => cp.execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
    g(['init', '-q', '-b', 'main']);
    g(['config', 'user.email', 'test@example.com']);
    g(['config', 'user.name', 'test']);
    fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
    g(['add', '.']);
    g(['commit', '-q', '-m', 'init']);
    const doomed = path.join(repo, '.superdev', 'scopes', 'gone');
    fs.mkdirSync(doomed, { recursive: true });
    const led = path.join(doomed, 'ledger.md');
    fs.writeFileSync(led, '# ledger\n\n**Stage:** shipped\n');
    const past = new Date(Date.now() - TTL_MS - 1000);
    fs.utimesSync(led, past, past);

    const orphan = cp.spawnSync(process.execPath, [path.join(away, 'scope-prune.js')], {
      input: JSON.stringify({ cwd: repo }), encoding: 'utf8', timeout: 15000,
    });
    assert.equal(orphan.status, 0, 'a hook that cannot load the reader still exits 0');
    assert.equal(orphan.stdout, '', 'and prints nothing');
    assert.equal(
      fs.existsSync(doomed),
      true,
      'a scope that would otherwise be pruned survives when the shared reader is unavailable'
    );
    fs.rmSync(away, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
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
