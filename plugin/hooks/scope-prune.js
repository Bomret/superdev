#!/usr/bin/env node
'use strict';

// scope-prune: Stop hook. Deterministically removes a completed superdev scope run root
// (.superdev/scopes/<scope>/ — ledger.md, dod.md, the git-ignored post-mortem trail) once the run root
// has sat untouched past a staleness TTL, AND the ledger's `**Stage:**` line reads `shipped`, AND its
// scope branch (<type>/<scope>) is **contained in** the current branch OR gone (ADR 0007, ADR 0053).
// Containment is content, not ancestry: `git merge-tree --write-tree` yielding base's own tree. A
// squash merge rewrites the branch's commits into one new commit, so `git branch --merged` never lists
// the branch however completely base holds the work. Absence stands beside containment, for the hosts
// that delete the branch on merge — but it is read from *this clone's* refs, and neither the local
// branch nor a stale remote-tracking ref goes away on its own, so absence alone never arrived here.
// hooks/worktree-sweep.js keeps ancestry alone one level down, correctly: a slice branch merges into the
// scope branch normally, so its ancestry survives.
// Same "safe by default" shape throughout: never touches a run whose branch is still there carrying
// content base does not hold (still active), never touches one whose worktree is still present (an
// interrupted cleanup, not a finished run — leave it for a human to look at), and never touches one that
// isn't recorded as `shipped` — a run mid-chain, at either tier, has its scope worktree standing until
// `/superdev:ship` removes it, so the worktree guard alone already protects it; the stage gate is the
// second, independent signal (ADR 0013, ADR 0045).
// ponytail: TTL is one flat value for every scope; a per-scope override would need its own config
// knob — add one if varying retention actually comes up, but YAGNI for now.
// Best-effort and silent: any git error, or no .superdev/scopes/ → no-op.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days past scope-branch merge

// A scope branch is `<type>/<scope>`, where `<type>` is the change type — the Conventional Commits type
// of the work (`references/scope-mode.md`, `## The change type`). The run-root directory name carries the
// slug alone, so the branch cannot be rebuilt from it: match the last segment against the scope and the
// leading segment against the type set instead. `slice/<scope>/<id>` never matches — its last segment is
// the slice id.
const CHANGE_TYPES = /^(feat|fix|refactor|docs|perf|test|build|ci|chore|style|revert)$/;

// The shape scan, returning the branch **name** rather than a bare yes: the containment test below needs
// something to hand git, and a pre-CLI ledger with no `**Branch:**` line leaves the scan as the only
// source of one.
function shapeScanBranch(branchSet, scope) {
  for (const branch of branchSet) {
    const cut = branch.lastIndexOf('/');
    if (cut < 1) continue; // no type segment → not a scope branch
    if (branch.slice(cut + 1) === scope && CHANGE_TYPES.test(branch.slice(0, cut))) return branch;
  }
  return null;
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

// Maps a bare branch name to the exact ref `git merge-tree` can resolve: the bare name itself when a
// local `refs/heads/<name>` exists (gitrevisions(7) already walks to it from the bare name), and
// `<remote>/<name>` for a name that survives only as a remote-tracking ref. A bare name only ever
// resolves the unqualified `refs/remotes/<name>` shape on its own, never `refs/remotes/<remote>/<name>`,
// so handing `merge-tree` the bare name of a branch whose local ref is gone fails to resolve it at all
// ("not something we can merge", exit 1) and reads as not contained however completely base holds the
// work — the gap ADR 0053's Context named and Important 3 of a later fix cycle closed. A name absent from
// this map (a local branch, or one this repo has never seen) is qualified as itself.
function qualifyBranchRefs(refLines) {
  const local = new Set();
  for (const raw of refLines) {
    const ref = raw.trim();
    if (ref.startsWith('refs/heads/')) local.add(ref.slice('refs/heads/'.length));
  }
  const qualified = new Map();
  for (const raw of refLines) {
    const ref = raw.trim();
    if (!ref.startsWith('refs/remotes/')) continue;
    const rest = ref.slice('refs/remotes/'.length);
    const cut = rest.indexOf('/');
    if (cut < 1) continue;
    const remote = rest.slice(0, cut);
    const name = rest.slice(cut + 1);
    if (name === 'HEAD' || local.has(name) || qualified.has(name)) continue;
    qualified.set(name, `${remote}/${name}`);
  }
  return qualified;
}

// execFileSync, not execSync: no shell in between, so `%(refname)` and anything else git's own
// argument-parsing wants never crosses a shell that would treat `(` as a metacharacter.
function git(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
}

// Resolves `scope`'s branch **name** within `branchSet`, or null when nothing there is its branch.
// `exactBranch` (from `readBranch` below) is authoritative when the ledger carries a `**Branch:**` line
// — exact-name membership, no guessing (references/scope-mode.md, `## The scope branch`). The shape scan
// is the fallback, only for a pre-CLI ledger with no such line: it can misread a branch as gone that is
// really alive and carrying unlanded work, either because its type isn't in `CHANGE_TYPES` (`feature/x`
// vs `feat/x`) or because the slug in its name has drifted from the run-root's directory name — and
// reading "gone" here prunes a live run's root, not just skips a merge.
function resolveBranch(branchSet, scope, exactBranch) {
  if (exactBranch) return branchSet.has(exactBranch) ? exactBranch : null;
  return shapeScanBranch(branchSet, scope);
}

// Pure: from the list of scope directory names, a predicate answering whether one branch's work is
// already in base (`makeContainmentTest` below, or a stub in the selftest), a function returning each
// scope's newest-file mtime (ms, or null if unreadable), a function returning each scope's ledger stage
// (or null if the ledger is unreadable or carries no `**Stage:**` line), the set of every branch this
// repository knows (local and remote-tracking, `branchNamesFrom` above), and a function returning each
// scope's exact branch name from its ledger (`readBranch` below, or null for a pre-CLI ledger), return
// the scope names prunable now.
//
// A scope's work is finished with when its branch is **contained in base or gone** (ADR 0007, ADR 0053).
// Ancestry answers the wrong question: a squash merge rewrites the branch's commits into one new commit,
// so none of them is ever an ancestor of base and `git branch --merged` never lists the branch, however
// completely base holds the work. Absence stands beside containment for the hosts that delete the branch
// on merge, and it is read from refs *this clone* already holds, so an unfetched remote-tracking ref
// still counts as present and the scope survives — this fails closed, which is the only safe direction
// for a delete. Absence on its own never arrived, which is the gap ADR 0053 measured: nothing removes
// the local `<type>/<scope>` branch, and the stale `origin/<type>/<scope>` ref outlives the host's
// deletion until somebody runs `git fetch --prune`.
//
// `git merge-tree --write-tree HEAD <branch>` also trivially yields HEAD's own tree when `<branch>` is
// HEAD itself. Neither tier ever switches the invoking checkout onto the scope branch (ADR 0045), so
// this only matters for a scope worked by hand, outside superdev's chain.
//
// **The gates run cheapest-first, and that order is load-bearing.** `--write-tree` writes tree objects
// into the object database, and this is a `Stop` hook firing on every finished turn, so the TTL read and
// the stage read — a stat and a file read, both local — gate it. A repository with nothing prunable runs
// no containment test at all and writes no objects.
//
// Only a scope whose ledger stage is `shipped` is prunable: that is the signal `/superdev:ship` writes at
// the end of the chain, and it is stronger than containment on every tier. An unreadable ledger, or one
// with no stage line, is never prunable — that is not evidence a run finished, only evidence nothing can
// be read. The stage is also what keeps absence narrow: a branch deleted without ever merging looks
// identical here, and only `/superdev:ship` writes `shipped`, after ticking the DoD and opening a pull
// request.
function selectPrunable(scopeNames, isContained, mtimeOf, stageOf, allBranchSet, branchOf) {
  const out = [];
  for (const scope of scopeNames) {
    const mtime = mtimeOf(scope);
    if (mtime == null) continue; // unreadable → leave it, don't guess
    if (Date.now() - mtime < TTL_MS) continue; // not stale yet
    if (stageOf(scope) !== 'shipped') continue; // not shipped (or unreadable/no line) → never prunable
    // Required, not defaulted: a caller that forgets it should get a crash, not a silent fall-through
    // to the shape-scan guess (Important 3 removed that guess as the default; `() => null` opts a
    // caller into it deliberately).
    const branch = resolveBranch(allBranchSet, scope, branchOf(scope));
    // Gone → finished with. Present → only contained content counts as landed.
    if (branch !== null && !isContained(branch)) continue;
    out.push(scope);
  }
  return out;
}

// Whether `<base>` — the current branch, exactly as `git branch --merged` with no argument already
// means — already holds every byte of `branch`'s work. Mirrors `references/scope-mode.md`'s
// `## Containment` section in JavaScript, and reads the same three outcomes off one call:
//
//   exit 0, tree equal to base's own tree → contained
//   exit 0, tree differing                → not contained (a clean merge that would still change base)
//   exit 1, a conflict                    → not contained
//
// Comparing the tree is what separates the first two: a clean merge exits 0 whether or not it changes
// anything. Every other outcome — a git that has no `--write-tree`, a broken repository, no git at all —
// is false, which fails closed: a hook that cannot answer must never conclude a scope is finished with.
function containedInBase(branch, cwd) {
  const merged = gitTry(['merge-tree', '--write-tree', 'HEAD', branch], cwd);
  if (merged.status !== 0) return false;
  const baseTree = gitTry(['rev-parse', 'HEAD^{tree}'], cwd);
  if (baseTree.status !== 0) return false;
  return merged.stdout.trim() === baseTree.stdout.trim();
}

// spawnSync, not the throwing `git()` above: a conflict is exit 1 and a real answer, not an error, so
// the caller needs the status rather than an exception.
function gitTry(args, cwd) {
  return spawnSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
}

// `--write-tree` needs git 2.38 (2022-10-02). Probing costs one `merge-tree` of `HEAD` with itself,
// whose result tree already exists, so the probe writes no object of its own. An older git's
// `merge-tree` takes three tree-ish arguments and rejects the flag, which is the nonzero this reads.
function supportsWriteTree(cwd) {
  return gitTry(['merge-tree', '--write-tree', 'HEAD', 'HEAD'], cwd).status === 0;
}

// The branch predicate `selectPrunable` calls, built lazily so nothing here runs until a scope has
// already passed the TTL and stage gates. Both the probe and the older-git fallback set are memoised:
// a repository with nothing prunable makes no git call at all, and one with several prunable scopes
// probes once.
//
// **The fallback is today's ancestry test**, `git branch --merged`, so a git older than 2.38 prunes
// exactly what it prunes now rather than erroring. A failed read there yields an empty set, which reads
// as "nothing is contained" and prunes nothing — the same fail-closed direction as everywhere else.
//
// `qualify` (`qualifyBranchRefs` above, or the identity default) resolves a bare branch name to what
// `git merge-tree` can actually find before the containment test ever sees it — the ancestry fallback
// skips it, because `git branch --merged` never lists a remote-tracking ref by any name at all, qualified
// or not.
function makeContainmentTest(cwd, qualify = (name) => name) {
  let supported = null;
  let mergedSet = null;
  return (branch) => {
    if (supported === null) supported = supportsWriteTree(cwd);
    if (supported) return containedInBase(qualify(branch), cwd);
    if (mergedSet === null) mergedSet = readMergedSet(cwd);
    return mergedSet.has(branch);
  };
}

function readMergedSet(cwd) {
  const listed = gitTry(['branch', '--merged'], cwd);
  if (listed.status !== 0) return new Set();
  return new Set(
    listed.stdout
      .split('\n')
      .map((s) => s.replace(/^[*+ ]+/, '').trim())
      .filter(Boolean)
  );
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

  let allBranches;
  let branchRefs;
  try {
    // Throwing `git()`, deliberately: an empty branch set would read as "every scope's branch is gone"
    // and prune the lot, so a failure here has to bail before absence is computed rather than yield one.
    // This call writes nothing, so it stays eager while the containment test below does not.
    const refLines = git(['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes'], cwd).split(
      '\n'
    );
    allBranches = branchNamesFrom(refLines);
    branchRefs = qualifyBranchRefs(refLines);
  } catch {
    return; // not a git repo / detached HEAD → bail quietly
  }

  const scopeNames = fs
    .readdirSync(scopesRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const prunable = selectPrunable(
    scopeNames,
    makeContainmentTest(cwd, (name) => branchRefs.get(name) || name),
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

  // `isContained` in these pure cases is a stub over a set of branch names: the real one talks to git,
  // and is exercised by the end-to-end fixtures below.
  const containedIn = (...names) => {
    const set = new Set(names);
    return (branch) => set.has(branch);
  };

  // #merged-and-stale: contained branch, mtime past TTL, ledger stage `shipped` → prune.
  // #merged-and-fresh: contained branch, mtime within TTL → skip (too soon), regardless of stage.
  // #unmerged: scope branch not contained (still active) → skip regardless of age or stage.
  const shipped = () => 'shipped';
  const mtimes = { 'merged-and-stale': STALE, 'merged-and-fresh': FRESH, unmerged: STALE };
  const merged = containedIn('fix/merged-and-stale', 'docs/merged-and-fresh');
  // Every scope here still has its branch, so containment is the question being asked of each.
  const present = new Set(['main', 'fix/merged-and-stale', 'docs/merged-and-fresh', 'feat/unmerged']);
  assert.deepEqual(
    selectPrunable(Object.keys(mtimes), merged, (s) => mtimes[s], shipped, present, () => null),
    ['merged-and-stale'],
    'only a contained AND stale AND shipped scope is pruned'
  );
  assert.deepEqual(
    selectPrunable(['unknown-mtime'], merged, () => null, shipped, present, () => null),
    [],
    'unreadable mtime is never pruned'
  );

  // The gates run cheapest-first, and `--write-tree` writes tree objects into the object database on
  // every call, in a `Stop` hook that fires on every finished turn. A scope that fails the TTL check or
  // the stage check must therefore never reach the containment test at all (ADR 0053). Counting the
  // calls is the only way to pin an ordering: every ordering returns the same answer.
  {
    let calls = 0;
    const counted = (branch) => {
      calls += 1;
      return containedIn('fix/counted')(branch);
    };
    const alive = new Set(['main', 'fix/too-fresh', 'fix/mid-chain']);
    assert.deepEqual(
      selectPrunable(
        ['too-fresh', 'mid-chain'],
        counted,
        (s) => (s === 'too-fresh' ? FRESH : STALE),
        (s) => (s === 'too-fresh' ? 'shipped' : 'reviewed'),
        alive,
        () => null,
      ),
      [],
      'a fresh scope and an unshipped scope are both skipped'
    );
    assert.equal(calls, 0, 'neither the TTL nor the stage rejection reaches the containment test');

    // And the same test *is* reached once every cheap gate passes, or the assertion above would pass
    // just as well against a containment test nothing ever calls.
    assert.deepEqual(
      selectPrunable(['counted'], counted, () => STALE, shipped, new Set(['main', 'fix/counted']), () => null),
      ['counted'],
      'a scope past both cheap gates does reach the containment test'
    );
    assert.equal(calls, 1, 'and reaches it exactly once');
  }

  // Neither tier switches the invoking checkout onto the scope branch (ADR 0045), and both leave a scope
  // worktree standing until `/superdev:ship` removes it, so the containment test and the worktree guard
  // already protect a run mid-chain. The stage gate is the second, independent signal, exercised here on
  // its own: a merged, stale scope whose ledger stage is `reviewed` (review ran, ship never did) must
  // still not be pruned, whatever the branch or worktree checks would otherwise say.
  // The branch matcher takes the change type from the branch, because the run root's directory name is
  // the slug alone. Only a Conventional Commits type counts: a slice branch (`slice/<scope>/<id>`) and a
  // maintainer's own `wip/<scope>` both name the scope somewhere, and pruning a run root on either one
  // would delete a live run's ledger.
  assert.notEqual(shapeScanBranch(new Set(['refactor/exports']), 'exports'), null, 'a typed scope branch counts');
  assert.equal(shapeScanBranch(new Set(['wip/exports']), 'exports'), null, 'an untyped branch does not');
  assert.equal(shapeScanBranch(new Set(['slice/exports/03']), 'exports'), null, 'a slice branch does not');
  assert.equal(shapeScanBranch(new Set(['exports']), 'exports'), null, 'a bare branch name does not');

  const parkedAll = new Set(['main', 'feat/parked-mid-chain']);
  const parkedContained = containedIn('feat/parked-mid-chain');
  assert.deepEqual(
    selectPrunable(['parked-mid-chain'], parkedContained, () => STALE, () => 'reviewed', parkedAll, () => null),
    [],
    'a contained, stale scope whose ledger stage is not `shipped` is never pruned'
  );

  // An unreadable ledger, or one with no `**Stage:**` line, is not evidence a run finished — it is
  // evidence nothing can be read. Never prune on a guess.
  assert.deepEqual(
    selectPrunable(['parked-mid-chain'], parkedContained, () => STALE, () => null, parkedAll, () => null),
    [],
    'a scope with no readable stage is never pruned'
  );

  // --- readStage: reads the ledger's `**Stage:**` line, or null when unreadable/absent ---
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
  const backtickAll = new Set(['main', 'chore/backticked']);
  assert.deepEqual(
    selectPrunable(['backticked'], containedIn('chore/backticked'), () => STALE, () => readStage(tmpBacktick), backtickAll, () => null),
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

  // --- Gone, and present-but-not-contained: the two halves of the branch decision ---
  //
  // Absence stays a landed signal beside containment (ADR 0007, ADR 0053), for the hosts that delete the
  // branch on merge. It is read from *this clone's* refs, which is why it never arrived on its own:
  // nothing removes the local branch, and a stale remote-tracking ref outlives the host's deletion.
  const ALL = (...names) => new Set(['main', ...names]);
  const nothingContained = () => false;

  assert.deepEqual(
    selectPrunable(['squashed'], nothingContained, () => STALE, shipped, ALL(), () => null),
    ['squashed'],
    'a gone branch, shipped and past the TTL, is prunable'
  );
  assert.deepEqual(
    selectPrunable(['squashed'], nothingContained, () => STALE, () => 'reviewed', ALL(), () => null),
    [],
    'a gone branch whose stage is not `shipped` is never prunable'
  );
  assert.deepEqual(
    selectPrunable(['squashed'], nothingContained, () => FRESH, shipped, ALL(), () => null),
    [],
    'a gone branch inside the TTL is never prunable'
  );
  assert.deepEqual(
    selectPrunable(['squashed'], nothingContained, () => STALE, () => null, ALL(), () => null),
    [],
    'a gone branch with no readable stage is never prunable'
  );

  // Present-but-not-contained is the case absence must not swallow: the branch exists and carries
  // content base does not hold, so the work is still in flight.
  assert.deepEqual(
    selectPrunable(['live'], nothingContained, () => STALE, shipped, ALL('feat/live'), () => null),
    [],
    'a branch that exists but is not contained is never prunable'
  );
  assert.deepEqual(
    selectPrunable(['landed'], containedIn('feat/landed'), () => STALE, shipped, ALL('feat/landed'), () => null),
    ['landed'],
    'a branch that exists and is contained is prunable'
  );

  // A remote-tracking ref the user has not pruned counts as present, so an unfetched repository asks
  // containment about it — and a branch base does not hold keeps the scope alive. Failing closed is the
  // whole point: absence is only evidence when the refs are current.
  assert.deepEqual(
    selectPrunable(['unfetched'], nothingContained, () => STALE, shipped, ALL('fix/unfetched'), () => null),
    [],
    'a stale remote-tracking ref whose content base lacks keeps the scope alive — absence fails closed'
  );

  // Absence is matched by the same shape rule as before: only a change-typed branch names this scope.
  // A `slice/<scope>/<id>` or a maintainer's `wip/<scope>` must not read as the scope branch, or its
  // presence would keep a finished run's root forever.
  assert.deepEqual(
    selectPrunable(['exports'], nothingContained, () => STALE, shipped, ALL('slice/exports/03', 'wip/exports'), () => null),
    ['exports'],
    'a slice branch and a wip branch do not count as the scope branch being present'
  );

  // --- readBranch / resolveBranch: the ledger's `**Branch:**` line is authoritative, the shape scan is
  // only the pre-CLI fallback (references/scope-mode.md, `## The scope branch`) ---
  //
  // The shape scan alone reads a live, unmerged branch as gone in two ordinary ways: a change type it
  // doesn't recognise, or a slug that drifted from the run-root's directory name. Both would prune a run
  // still mid-flight, because "gone" and "shipped" together mean prunable.
  {
    // `feature/alpha`: the type is not in CHANGE_TYPES (only `feat` is), so the shape scan reads
    // `alpha`'s branch as gone even though it exists and is unmerged.
    const alphaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-branch-'));
    fs.writeFileSync(path.join(alphaDir, 'ledger.md'), '# ledger\n\n**Branch:** feature/alpha\n');
    assert.equal(readBranch(alphaDir), 'feature/alpha', 'reads the exact branch off the ledger line');
    const alphaAll = new Set(['main', 'feature/alpha']);
    assert.deepEqual(
      selectPrunable(['alpha'], nothingContained, () => STALE, shipped, alphaAll, () => readBranch(alphaDir)),
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
      selectPrunable(['delta'], nothingContained, () => STALE, shipped, deltaAll, () => readBranch(deltaDir)),
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
      selectPrunable(['precli'], containedIn('fix/precli'), () => STALE, shipped, preAll, () => readBranch(preDir)),
      ['precli'],
      'a pre-CLI ledger falls back to the shape scan, which reads a merged branch as prunable'
    );
    fs.rmSync(preDir, { recursive: true, force: true });

    // A hand-written ledger's `**Branch:**` line may carry the same markup `/superdev:ship` §5 writes on
    // `**Stage:**` — hand-written is exactly the population that produces it. Unlike Stage, Branch's
    // failure direction is destructive: an unstripped value matches nothing in the branch set,
    // `resolveBranch` reads a live, unmerged branch as gone, and the run root is deleted instead of
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
        selectPrunable(['x'], nothingContained, () => STALE, shipped, alive, () => readBranch(markupDir)),
        [],
        `a scope whose branch is ${expected}, alive and unmerged, is never pruned`
      );
      fs.rmSync(markupDir, { recursive: true, force: true });
    }

    // An empty `**Branch:**` line (the CLI writes the header before the value is known) must read as
    // absent, not spill into the next header's name. `\s` matches `\n`, so an ungated `\s*` after the
    // colon lets a value-less `**Branch:**` line capture the following line's `**Anchor:**` token,
    // stripped down to `Anchor` — truthy, and present in no real branch set, so `resolveBranch` reads a
    // live, unmerged branch as gone. Gone + shipped + past TTL prunes a run root with a live branch.
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-branch-'));
    fs.writeFileSync(
      path.join(emptyDir, 'ledger.md'),
      '# ledger\n\n**Stage:** shipped\n**Branch:**\n**Anchor:** #197 — Epic\n'
    );
    assert.equal(readBranch(emptyDir), null, 'an empty Branch line never captures the next line\'s token');
    const emptyAll = new Set(['main', 'feat/emptybranch']);
    assert.deepEqual(
      selectPrunable(['emptybranch'], nothingContained, () => STALE, shipped, emptyAll, () => readBranch(emptyDir)),
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
      selectPrunable(['exports'], nothingContained, () => STALE, shipped, exclusiveAll, () => 'fix/renamed-away'),
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

    // #remote-only-branch: the scope branch is gone locally but its remote-tracking ref is still there,
    // and base never received its content → main() leaves the run root alone. This is the fail-closed
    // rule, and it is the one delete-path property the pure cases above cannot pin: they hand
    // `selectPrunable` a ready-made branch set, and `branchNamesFrom` a ready-made string array, so
    // neither sees which refs main() actually asks git for. Narrow that read to `refs/heads` and every
    // case above stays green while a live remote-only scope's run root is deleted. This is the "unlanded"
    // arm; `#remote-only-branch-contained` below is the other.
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
      'a branch gone locally but present as a remote-tracking ref, whose content base lacks, is never pruned'
    );
    fs.rmSync(remoteRepo, { recursive: true, force: true });
    fs.rmSync(originDir, { recursive: true, force: true });

    // #remote-only-branch-contained: same shape, but base already holds the branch's content by squash
    // merge before the local branch is deleted. `git merge-tree --write-tree HEAD fix/onremote-squashed`
    // cannot resolve the bare name once only `origin/fix/onremote-squashed` survives — gitrevisions(7)
    // never checks `refs/remotes/<remote>/<name>` for a bare name, only the unqualified
    // `refs/remotes/<name>` shape — so without `qualifyBranchRefs` mapping it to the qualified
    // `origin/fix/onremote-squashed` form, this scope reads not-contained forever even though base holds
    // every byte (ADR 0053, Important 3).
    const remoteContainedRepo = makeRepo();
    const remoteContainedOriginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-origin-'));
    gitTest(['init', '-q', '--bare', '-b', 'main'], remoteContainedOriginDir);
    gitTest(['remote', 'add', 'origin', remoteContainedOriginDir], remoteContainedRepo);
    gitTest(['checkout', '-q', '-b', 'fix/onremote-squashed'], remoteContainedRepo);
    fs.writeFileSync(path.join(remoteContainedRepo, 'remote-squash.txt'), 'z\n');
    gitTest(['add', '.'], remoteContainedRepo);
    gitTest(['commit', '-q', '-m', 'work on the remote branch'], remoteContainedRepo);
    gitTest(['push', '-q', 'origin', 'fix/onremote-squashed'], remoteContainedRepo);
    gitTest(['checkout', '-q', 'main'], remoteContainedRepo);
    gitTest(['merge', '--squash', 'fix/onremote-squashed'], remoteContainedRepo);
    gitTest(['commit', '-q', '-m', 'fix: onremote-squashed (#1)'], remoteContainedRepo);
    // local gone, origin/fix/onremote-squashed stays — the same shape as #remote-only-branch, but base
    // already holds its content.
    gitTest(['branch', '-q', '-D', 'fix/onremote-squashed'], remoteContainedRepo);
    const remoteContainedScopeDir = makeScope(
      remoteContainedRepo,
      'onremote-squashed',
      '**Stage:** shipped\n**Branch:** fix/onremote-squashed\n'
    );
    main(remoteContainedRepo);
    assert.equal(
      fs.existsSync(remoteContainedScopeDir),
      false,
      'a branch gone locally but present as a remote-tracking ref, whose content base already holds, is pruned'
    );
    fs.rmSync(remoteContainedRepo, { recursive: true, force: true });
    fs.rmSync(remoteContainedOriginDir, { recursive: true, force: true });

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

    // --- Containment end to end: the branch is still present locally, and base holds its content ---
    //
    // Every case below keeps the scope branch standing, which is this repository's own steady state:
    // `/superdev:ship` leaves it (the pull request is open from it) and nothing later returns for it, so
    // the absence arm never fires and containment is the only thing that can (ADR 0053). Each fixture
    // reaches git for real, so it exercises `containedInBase` rather than a stub.
    function makeWorkBranch(repoDir, branch, file, body) {
      gitTest(['checkout', '-q', '-b', branch], repoDir);
      fs.writeFileSync(path.join(repoDir, file), body);
      gitTest(['add', '.'], repoDir);
      gitTest(['commit', '-q', '-m', `work on ${branch}`], repoDir);
      gitTest(['checkout', '-q', 'main'], repoDir);
    }

    // #squash-merged-branch-present: the epic's own red-capable case. `git branch --merged` lists `main`
    // alone here, and the branch is present, so both arms of the old test fail together and the run root
    // stood forever.
    const squashRepo = makeRepo();
    makeWorkBranch(squashRepo, 'fix/squashed', 'app.txt', 'v2\n');
    gitTest(['merge', '--squash', 'fix/squashed'], squashRepo);
    gitTest(['commit', '-q', '-m', 'fix: squashed (#1)'], squashRepo);
    const squashScopeDir = makeScope(squashRepo, 'squashed', '**Stage:** shipped\n**Branch:** fix/squashed\n');
    main(squashRepo);
    assert.equal(
      fs.existsSync(squashScopeDir),
      false,
      'a squash-merged scope whose branch is still present locally is pruned'
    );
    fs.rmSync(squashRepo, { recursive: true, force: true });

    // #merge-commit: ancestry would have caught this one, and containment still must.
    const mergeRepo = makeRepo();
    makeWorkBranch(mergeRepo, 'fix/mergecommit', 'app.txt', 'v2\n');
    gitTest(['merge', '-q', '--no-ff', '-m', 'merge', 'fix/mergecommit'], mergeRepo);
    const mergeScopeDir = makeScope(mergeRepo, 'mergecommit', '**Stage:** shipped\n**Branch:** fix/mergecommit\n');
    main(mergeRepo);
    assert.equal(fs.existsSync(mergeScopeDir), false, 'a merge-commit-merged scope is pruned');
    fs.rmSync(mergeRepo, { recursive: true, force: true });

    // #fast-forward: base and branch end at the same commit, so the merge tree is trivially base's.
    const ffRepo = makeRepo();
    makeWorkBranch(ffRepo, 'fix/fastforward', 'app.txt', 'v2\n');
    gitTest(['merge', '-q', '--ff-only', 'fix/fastforward'], ffRepo);
    const ffScopeDir = makeScope(ffRepo, 'fastforward', '**Stage:** shipped\n**Branch:** fix/fastforward\n');
    main(ffRepo);
    assert.equal(fs.existsSync(ffScopeDir), false, 'a fast-forward-merged scope is pruned');
    fs.rmSync(ffRepo, { recursive: true, force: true });

    // #contained-after-base-moves-on: the tree comparison is against base's *current* tree, so an
    // unrelated commit landing on base after the merge changes that tree. Containment must survive it,
    // or every scope stops being prunable the moment anyone else pushes.
    const movedRepo = makeRepo();
    makeWorkBranch(movedRepo, 'fix/moved', 'app.txt', 'v2\n');
    gitTest(['merge', '--squash', 'fix/moved'], movedRepo);
    gitTest(['commit', '-q', '-m', 'fix: moved (#1)'], movedRepo);
    fs.writeFileSync(path.join(movedRepo, 'unrelated.txt'), 'later\n');
    gitTest(['add', '.'], movedRepo);
    gitTest(['commit', '-q', '-m', 'unrelated work on base'], movedRepo);
    const movedScopeDir = makeScope(movedRepo, 'moved', '**Stage:** shipped\n**Branch:** fix/moved\n');
    main(movedRepo);
    assert.equal(
      fs.existsSync(movedScopeDir),
      false,
      'a contained scope stays prunable after base moves on with unrelated commits'
    );
    fs.rmSync(movedRepo, { recursive: true, force: true });

    // #present-and-carries-unlanded-content: a clean merge that would still change base. `merge-tree`
    // exits 0 here, so the exit status alone would read this as landed — the tree comparison is what
    // catches it, and getting it wrong deletes a live run's root.
    const unlandedRepo = makeRepo();
    makeWorkBranch(unlandedRepo, 'fix/unlanded', 'separate.txt', 'only on the branch\n');
    const unlandedScopeDir = makeScope(unlandedRepo, 'unlanded', '**Stage:** shipped\n**Branch:** fix/unlanded\n');
    main(unlandedRepo);
    assert.equal(
      fs.existsSync(unlandedScopeDir),
      true,
      'a branch carrying content base does not hold is never pruned, whatever its stage says'
    );
    fs.rmSync(unlandedRepo, { recursive: true, force: true });

    // #present-and-conflicting: `merge-tree` exits 1. That is a real answer — not contained — and not an
    // error to fall through on.
    const conflictRepo = makeRepo();
    makeWorkBranch(conflictRepo, 'fix/conflicting', 'README.md', 'branch side\n');
    fs.writeFileSync(path.join(conflictRepo, 'README.md'), 'base side\n');
    gitTest(['add', '.'], conflictRepo);
    gitTest(['commit', '-q', '-m', 'diverge on base'], conflictRepo);
    const conflictScopeDir = makeScope(conflictRepo, 'conflicting', '**Stage:** shipped\n**Branch:** fix/conflicting\n');
    main(conflictRepo);
    assert.equal(
      fs.existsSync(conflictScopeDir),
      true,
      'a branch that would conflict with base is never pruned'
    );
    fs.rmSync(conflictRepo, { recursive: true, force: true });

    // #no-write-tree-support: a git older than 2.38 has no `--write-tree`, and the hook must prune
    // exactly what it prunes today rather than error. Shimmed rather than version-gated, because the
    // property under test is the fallback path, not this machine's git. Both arms are asserted from one
    // shim: the merge-commit scope still prunes (ancestry finds it), and the squash-merged one does not
    // (ancestry never did) — which is precisely "current behaviour".
    const oldGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-oldgit-'));
    const realGitPath = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
    fs.writeFileSync(
      path.join(oldGitDir, 'git'),
      `#!/bin/sh\nif [ "$1" = "merge-tree" ]; then exit 129; fi\nexec "${realGitPath}" "$@"\n`
    );
    fs.chmodSync(path.join(oldGitDir, 'git'), 0o755);

    const oldMergeRepo = makeRepo();
    makeWorkBranch(oldMergeRepo, 'fix/oldmerge', 'app.txt', 'v2\n');
    gitTest(['merge', '-q', '--no-ff', '-m', 'merge', 'fix/oldmerge'], oldMergeRepo);
    const oldMergeScopeDir = makeScope(oldMergeRepo, 'oldmerge', '**Stage:** shipped\n**Branch:** fix/oldmerge\n');

    const oldSquashRepo = makeRepo();
    makeWorkBranch(oldSquashRepo, 'fix/oldsquash', 'app.txt', 'v2\n');
    gitTest(['merge', '--squash', 'fix/oldsquash'], oldSquashRepo);
    gitTest(['commit', '-q', '-m', 'fix: oldsquash (#1)'], oldSquashRepo);
    const oldSquashScopeDir = makeScope(oldSquashRepo, 'oldsquash', '**Stage:** shipped\n**Branch:** fix/oldsquash\n');

    const pathBeforeShim = process.env.PATH;
    process.env.PATH = `${oldGitDir}${path.delimiter}${pathBeforeShim}`;
    try {
      main(oldMergeRepo);
      main(oldSquashRepo);
    } finally {
      process.env.PATH = pathBeforeShim;
    }
    assert.equal(
      fs.existsSync(oldMergeScopeDir),
      false,
      'without --write-tree, an ancestry-merged scope prunes exactly as it does today'
    );
    assert.equal(
      fs.existsSync(oldSquashScopeDir),
      true,
      'without --write-tree, a squash-merged scope is left alone exactly as it is today — no error'
    );
    fs.rmSync(oldMergeRepo, { recursive: true, force: true });
    fs.rmSync(oldSquashRepo, { recursive: true, force: true });
    fs.rmSync(oldGitDir, { recursive: true, force: true });

    // #for-each-ref-failure-prunes-nothing: pins "read the branch set eagerly, before absence or
    // containment is ever computed" (see the comment above the try in main()). A shimmed `git` on PATH
    // fails only `for-each-ref`, which aborts main() in its catch before `selectPrunable` runs at all. If
    // the for-each-ref read fell back to an empty Set instead of aborting the whole run, an empty branch
    // set reads as "every scope's branch is gone", and this gone/shipped/stale scope — which main() must
    // otherwise leave untouched, because the read it needs failed — gets pruned.
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
      'a git for-each-ref failure prunes nothing, aborting before absence is ever computed'
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
    const scope = require('../scripts/scope.js');
    const mk = (body) => {
      const d = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-hdr-'));
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

    assert.equal(readHeader(path.join(os.tmpdir(), 'no-such-scope-dir'), 'Stage'), null, 'an unreadable ledger is null');
  }

  // #reader-unavailable: the hook cannot load the shared reader → it prunes nothing and says nothing.
  // A copy of this file outside the plugin cannot resolve `../scripts/scope.js`, which is exactly the
  // failure being tested. This proves the fail-closed property holds when the reader is unavailable — not
  // that the explicit `if (!readLedgerHeader) return;` guard in main() is what causes it: `readHeader`'s
  // own try/catch already yields null for every header in that case, and a null stage is never prunable
  // either way. The guard stays as explicit intent. Fail-closed is the same direction the hook already
  // takes on a git error: a hook that cannot read a stage must never conclude a scope is finished.
  {
    const cp = require('node:child_process');
    const away = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-orphan-'));
    fs.copyFileSync(__filename, path.join(away, 'scope-prune.js'));

    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-orphan-repo-'));
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
