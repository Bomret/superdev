#!/usr/bin/env node
'use strict';

// scope-prune: Stop hook. Deterministically removes a completed superdev scope run root
// (.superdev/scopes/<scope>/ — ledger.md, dod.md, the git-ignored post-mortem trail) once the run root
// has sat untouched past a staleness TTL, AND the ledger's `**Stage:**` line reads `closed`, AND its
// scope branch (<type>/<scope>) is **contained in** the current branch OR gone (ADR 0007, ADR 0053,
// ADR 0106).
// Containment is content, not ancestry: `git merge-tree --write-tree` yielding base's own tree. A
// squash merge rewrites the branch's commits into one new commit, so `git branch --merged` never lists
// the branch however completely base holds the work. Absence stands beside containment, for the hosts
// that delete the branch on merge — but it is read from *this clone's* refs, which outlive the host's own
// deletion, so containment is what carries nearly every reap.
// The same pass deletes the branch it just proved contained — the local ref and every remote-tracking
// copy — immediately before the run root, so the clone stops accumulating one dead branch per shipped
// feature (ADR 0071). `reapBranch` below states the bounds that delete keeps to.
// hooks/slicetree-sweep.js keeps ancestry alone one level down, correctly: a slice branch merges into the
// scope branch normally, so its ancestry survives.
// Same "safe by default" shape throughout: never touches a run whose branch is still there carrying
// content base does not hold (still active), never touches one whose scopetree or a slicetree is still
// present (an interrupted cleanup, not a finished run — leave it for a human to look at; an empty
// `slicetrees/` dir is a finished cleanup), and never
// touches one that isn't recorded as `closed` — a run mid-chain, at either tier, has its scopetree or
// slicetrees standing until `/superdev:wrap-up` removes it, so that guard alone already protects it;
// the stage gate is the second, independent signal (ADR 0013, ADR 0045, ADR 0106). A run root an older
// version left at `shipped` has both scopetree and slicetrees already gone, yet stays unreaped until an
// operator runs `/superdev:wrap-up` on it and moves the stage to `closed`.
// A decisive not-contained answer is remembered in `<run root>/not-contained`, one line naming the base commit (`HEAD`)
// and the commit of the ref `merge-tree` read, so a later Stop skips the containment test while both commits stay the
// same (INV-0199). A moved base or branch, or a record that is missing, empty, malformed, or unreadable, reruns it. The
// record never counts toward the staleness clock, and a gone branch reaps whatever record stands.
// simplicity: TTL is one flat value for every scope; a per-scope override would need its own config
// knob — add one if varying retention actually comes up, but YAGNI for now.
// Best-effort and silent: any git error, or no .superdev/scopes/ → no-op.

const fs = require('node:fs');
const path = require('node:path');

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days from the newest file mtime in the run root, `.DS_Store` and the not-contained record aside

// A scope branch is `<type>/<scope>` (`references/scope-mode.md`, `## The scope branch`); `lib/scope-branch.js` owns the shape
// rule and returns every match. It is loaded below through a guarded require. A pre-CLI ledger with no `**Branch:**` line
// leaves the shape scan as the only source of a branch name for the containment test.
// Returned by `resolveBranch` where the shape matches two branches: nothing says which is the scope's.
const AMBIGUOUS = Symbol('ambiguous');

// Normalises `git for-each-ref refs/heads refs/remotes` output to plain branch names, so a local branch
// and its remote-tracking copy compare equal. `lib/scope-branch.js`'s `parseBranchRefs`, loaded below, owns the parse.
function branchNamesFrom(refLines) {
  const { local, remote } = parseBranchRefs(refLines);
  return new Set([...local, ...remote]);
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

// Resolves `scope`'s branch **name** within `branchSet`, or null when nothing there is its branch.
// `exactBranch` (from `readBranch` below) is authoritative when the ledger carries a `**Branch:**` line
// — exact-name membership, no guessing (references/scope-mode.md, `## The scope branch`). The shape scan
// is the fallback, only for a pre-CLI ledger with no such line: it can misread a branch as gone that is
// really alive and carrying unlanded work, either because its type isn't a change type (`feature/x`
// vs `feat/x`) or because the slug in its name has drifted from the run-root's directory name — and
// reading "gone" here prunes a live run's root, not just skips a merge. Two shape matches return `AMBIGUOUS`:
// the caller prunes, reaps, and deletes nothing for that scope (INV-0003, INV-0106).
function resolveBranch(branchSet, scope, exactBranch) {
  if (exactBranch) return branchSet.has(exactBranch) ? exactBranch : null;
  const matches = shapeMatches(branchSet, scope);
  if (matches.length > 1) return AMBIGUOUS;
  return matches.length ? matches[0] : null;
}

// Pure: from the list of scope directory names, a predicate answering whether one branch's work is
// already in base (`makeContainmentTest` below), a function returning each
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
// for a delete. Absence reaches this test in two narrow shapes, and containment carries every other reap:
// a clone that has run `git fetch --prune` since the host deleted the branch, and this hook's own reap of
// a scope whose run root outlived its refs because the `rmSync` below failed (ADR 0071).
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
// Only a scope whose ledger stage is `closed` is prunable: that is the signal `/superdev:wrap-up`
// writes once its own gate passes, and it is stronger than containment on every tier. A run root at
// `shipped` — whether left there by `/superdev:ship`'s current stop-after-deploy behaviour or by an
// older version that closed the anchor itself — is never reaped; only `/superdev:wrap-up` moves it
// on. An unreadable ledger, or one with no stage line, is never prunable — that is not evidence a run
// finished, only evidence nothing can be read. The stage is also what keeps absence narrow: a branch
// deleted without ever merging looks identical here, and only `/superdev:wrap-up` writes `closed`,
// after its own gate passes.
function selectPrunable(scopeNames, isContained, mtimeOf, stageOf, allBranchSet, branchOf) {
  const out = [];
  for (const scope of scopeNames) {
    const mtime = mtimeOf(scope);
    if (mtime == null) continue; // unreadable → leave it, don't guess
    if (Date.now() - mtime < TTL_MS) continue; // not stale yet
    if (stageOf(scope) !== 'closed') continue; // not closed (or unreadable/no line) → never prunable
    // Required, not defaulted: a caller that forgets it should get a crash, not a silent fall-through
    // to the shape-scan guess (Important 3 removed that guess as the default; `() => null` opts a
    // caller into it deliberately).
    const branch = resolveBranch(allBranchSet, scope, branchOf(scope));
    if (branch === AMBIGUOUS) continue; // two branches match the shape → no way to tell which is this scope's
    // Gone → finished with. Present → only contained content counts as landed.
    if (branch !== null && !isContained(branch, scope)) continue;
    out.push(scope);
  }
  return out;
}

// Whether `<base>` — the current branch, exactly as `git branch --merged` with no argument already
// means — already holds every byte of `branch`'s work. Mirrors `references/scope-branch.md`'s
// `## Containment` section in JavaScript, and reads the same three outcomes off one call:
//
//   exit 0, tree equal to base's own tree → contained
//   exit 0, tree differing                → not contained (a clean merge that would still change base)
//   exit 1, a conflict                    → the probe below decides
//
// Comparing the tree is what separates the first two: a clean merge exits 0 whether or not it changes
// anything.
//
// A base that edits the branch's files after taking its work conflicts on a branch it holds in full, so
// the conflict alone is no answer (ADR 0082). `patchInBaseHistory` — the probe `lib/containment.js`
// exports, required below — asks whether base's history holds a commit whose diff is this branch's own
// cumulative diff, and a match is what a reap needs: the work sits in base's history, so deleting the
// branch loses nothing. Where no patch id matches, `commitInBaseHistory` (ADR 0248) runs this same tree
// comparison against each commit base gained since the fork point that touches the branch's paths, which
// reads a squash-merge onto a moved base contained. Each one absent leaves the tiers before it as the whole
// test, both absent leave the tree comparison alone, and a failed
// `rev-parse` below, or `git` itself missing or broken, answers `null`. The caller reads only `true` as
// contained, so the hook reaps nothing on either — fail closed, the direction everywhere else in this hook
// takes too.
//
// It answers `true`, `false`, or `null`. `false` is decisive: a `merge-tree` that exited 0 or 1, and every
// tier present answering a decisive `false`, so the same two commits always give it. `null` is a not
// contained that decided nothing: a `merge-tree` that exited otherwise, a failed `rev-parse`, or a tier
// whose git call failed. Only `false` is recorded (`testRecorded` below).
//
// The mirror stops at the local test. That section's second pass fetches the base and retests against
// `FETCH_HEAD` before it answers not contained, and names this hook as the one caller that never does
// (ADR 0065): a `Stop` hook fires on every finished turn, and a stale base only defers a reap ADR 0007's
// seven-day TTL has already delayed — the same direction every other failure here falls.
function containedInBase(branch, cwd) {
  const merged = localRead(['merge-tree', '--write-tree', 'HEAD', branch], cwd);
  if (merged.status !== 0) {
    let decided = merged.status === 1;
    for (const tier of [patchInBaseHistory, commitInBaseHistory]) {
      if (!tier) continue;
      const held = tier(cwd, 'HEAD', branch);
      if (held === true) return true;
      if (held !== false) decided = false;
    }
    return decided ? false : null;
  }
  const baseTree = localRead(['rev-parse', 'HEAD^{tree}'], cwd);
  if (baseTree.status !== 0) return null;
  return merged.stdout.trim() === baseTree.stdout.trim();
}

// The not-contained record (INV-0199): a file named `not-contained` in the scope's run root holding one line, the base
// commit (`HEAD`) and the commit of the ref `merge-tree` read, separated by a space. While both commits still equal the
// recorded ones, the containment test is skipped and the branch reads not contained. A moved base or branch, a commit that
// cannot be read, or a record that is missing, empty, malformed, or unreadable runs the test again. Only a decisive `false`
// from `containedInBase` writes it, and a failed write changes nothing else. The record sits inside the containment test,
// which only a present branch reaches, so a gone branch reaps whatever record stands. `newestMtimeMs` leaves it out of the
// staleness clock, and the reap removes it with the run root.
const RECORD = 'not-contained';
const RECORD_LINE = /^([0-9a-f]{40,64}) ([0-9a-f]{40,64})\n?$/;

function testRecorded(ref, cwd, runRoot) {
  const file = path.join(runRoot, RECORD);
  const base = resolveCommit('HEAD', cwd);
  const tip = base && resolveCommit(ref, cwd);
  if (tip) {
    let held = null;
    try {
      held = RECORD_LINE.exec(fs.readFileSync(file, 'utf8'));
    } catch {
      /* missing or unreadable: run the test */
    }
    if (held && held[1] === base && held[2] === tip) return false;
  }
  const answer = containedInBase(ref, cwd);
  if (answer === false && tip) {
    try {
      fs.writeFileSync(file, `${base} ${tip}\n`);
    } catch {
      /* unwritable: the next Stop runs the test again */
    }
  }
  return answer === true;
}

// `--write-tree` needs git 2.38 (2022-10-02). Probing costs one `merge-tree` of `HEAD` with itself,
// whose result tree already exists, so the probe writes no object of its own. An older git's
// `merge-tree` takes three tree-ish arguments and rejects the flag, which is the nonzero this reads.
function supportsWriteTree(cwd) {
  return localRead(['merge-tree', '--write-tree', 'HEAD', 'HEAD'], cwd).status === 0;
}

// The branch predicate `selectPrunable` calls, built lazily so nothing here runs until a scope has
// already passed the TTL and stage gates. Both the `--write-tree` support check and the older-git
// fallback set are memoised: a repository with nothing prunable makes no git call at all, and one with
// several prunable scopes probes support once. `patchInBaseHistory` (ADR 0082) and `commitInBaseHistory`
// (ADR 0248) are not memoised here — they run once per prunable branch that conflicts, inside
// `containedInBase`.
//
// **The fallback is today's ancestry test**, `git branch --merged`, so a git older than 2.38 prunes
// exactly what it prunes now rather than erroring. A failed read there yields an empty set, which reads
// as "nothing is contained" and prunes nothing — the same fail-closed direction as everywhere else. This
// path never reaches `containedInBase`, so the second tier is unreachable on a git this old here — unlike
// `lib/containment.js`'s own `--is-ancestor` fallback, a different primitive that does reach the probe.
//
// `qualify` (built from `qualifyBranchRefs` above) resolves a bare branch name to what
// `git merge-tree` can actually find before the containment test ever sees it — the ancestry fallback
// skips it, because `git branch --merged` never lists a remote-tracking ref by any name at all, qualified
// or not.
function makeContainmentTest(cwd, qualify, scopesRoot) {
  let supported = null;
  let mergedSet = null;
  return (branch, scope) => {
    if (supported === null) supported = supportsWriteTree(cwd);
    if (supported) {
      try {
        return testRecorded(qualify(branch), cwd, path.join(scopesRoot, scope));
      } catch (e) {
        // A ref read with no verdict (ADR 0290) skips this scope alone: no reap and no record.
        if (e.noVerdict) return false;
        throw e;
      }
    }
    if (mergedSet === null) mergedSet = readMergedSet(cwd);
    return mergedSet.has(branch);
  };
}

function readMergedSet(cwd) {
  const listed = localRead(['branch', '--merged'], cwd);
  if (listed.status !== 0) return new Set();
  return parseBranchList(listed.stdout);
}

// `lib/ledger.js` owns the ledger's schema, so it owns how a header value is read (ADR 0022). This
// hook carried its own regex and drifted from it on four axes while being hardened — anchoring, capture
// width, newline crossing, normalisation — and none of those fixes travelled back. There is one reader
// now, and no fallback: a fallback is the second reader again, and the second reader is the defect.
//
// `patchInBaseHistory` and `commitInBaseHistory` come from `lib/containment.js` through their own require,
// and they fall back differently from the ledger reader (ADR 0082, ADR 0248): the reader missing stops the
// sweep outright, while a missing tier only narrows the containment test to the tiers it keeps. That `try`
// covers the version-skewed install as well as the failed load: a module that lacks a tier leaves it `null`,
// exactly as a throwing `require` leaves both, and the reader stays loaded.
let readLedgerHeader = null;
let patchInBaseHistory = null;
let commitInBaseHistory = null;
try {
  ({ readLedgerHeader } = require('../lib/ledger.js'));
} catch {
  // Left null. main() prunes nothing below — the same fail-closed direction a git error takes, because
  // a hook that cannot read a stage must never conclude a scope is finished with.
}
try {
  ({ patchInBaseHistory = null, commitInBaseHistory = null } = require('../lib/containment.js'));
} catch {
  // Left null. The containment test below falls back to the tree comparison alone, silently.
}

// `lib/scope-branch.js` owns the shape rule and the ref-name parse (INV-0159, INV-0068). No fallback: without it the hook cannot
// tell a gone branch from one it cannot name, so a failed load, or a module carrying no `shapeMatches` or no `parseBranchRefs`,
// leaves both null and main() prunes nothing, silently.
let shapeMatches = null;
let parseBranchRefs = null;
try {
  const scopeBranchModule = require('../lib/scope-branch.js');
  if (typeof scopeBranchModule.shapeMatches === 'function' && typeof scopeBranchModule.parseBranchRefs === 'function') {
    ({ shapeMatches, parseBranchRefs } = scopeBranchModule);
  }
} catch {
  // Left null. main() checks it before doing anything below.
}

// `lib/git-spawn.js` owns the git calls (the status-reading spawn, the bounded local read, the throwing call, the
// `git branch` list parse, the commit a ref resolves to). No fallback: a hook that cannot run git must never conclude a
// scope is finished with, so a failed load, or a module missing any of them, leaves every one null and main() prunes
// nothing, silently. The names are taken only once the module carries every one, so a partial module reads as
// an unloaded one.
let gitSpawn = null;
let localRead = null;
let gitThrow = null;
let parseBranchList = null;
let resolveCommit = null;
try {
  const gitModule = require('../lib/git-spawn.js');
  if (
    [gitModule.gitSpawn, gitModule.localRead, gitModule.gitThrow, gitModule.parseBranchList, gitModule.resolveCommit].every(
      (f) => typeof f === 'function'
    )
  ) {
    ({ gitSpawn, localRead, gitThrow, parseBranchList, resolveCommit } = gitModule);
  }
} catch {
  // Left null. main() checks these before doing anything below.
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

// Whether `dir` holds anything besides a Finder `.DS_Store`. `/superdev:wrap-up` removes every slicetree
// from `slicetrees/`, so an empty one is a finished cleanup, not an interrupted one (triage #916). An
// unreadable dir counts as holding an entry: a dir this hook cannot read is never evidence of a clean finish.
function holdsEntry(dir) {
  if (!fs.existsSync(dir)) return false;
  try {
    return fs.readdirSync(dir).some((name) => name !== '.DS_Store');
  } catch {
    return true;
  }
}

function newestMtimeMs(dir) {
  let newest = null;
  for (const name of fs.readdirSync(dir)) {
    if (name === '.DS_Store') continue; // Finder writes it on a browse, which is no activity of the run (triage #916)
    if (name === RECORD) continue; // the not-contained record is the hook's own write, no activity of the run (INV-0199)
    const stat = fs.statSync(path.join(dir, name));
    if (!stat.isFile()) continue; // a scopetree/ or slicetrees/ dir here means an interrupted run — skip below
    if (newest === null || stat.mtimeMs > newest) newest = stat.mtimeMs;
  }
  return newest;
}

// Every ref `branch` still holds in this clone, read off the `for-each-ref` output the run already has:
// its own `refs/heads/<branch>`, and a `refs/remotes/<remote>/<branch>` for every remote that tracks it.
// The remote-tracking ref is parsed exactly as `branchNamesFrom` parses it — first segment is the remote,
// whatever it is called — so a remote named after part of a branch never swallows the comparison.
function refsFor(refLines, branch) {
  const refs = [];
  for (const raw of refLines) {
    const ref = raw.trim();
    if (ref === `refs/heads/${branch}`) {
      refs.push(ref);
      continue;
    }
    if (!ref.startsWith('refs/remotes/')) continue;
    const rest = ref.slice('refs/remotes/'.length);
    const cut = rest.indexOf('/');
    if (cut > 0 && rest.slice(cut + 1) === branch) refs.push(ref);
  }
  return refs;
}

// Deletes the refs of a scope branch the caller has already proved contained (ADR 0071), and reports
// whether the clone is now rid of it. True with nothing deleted is the honest answer in two cases: a
// ledger that names no branch — `resolveBranch`'s shape scan can match a foreign branch whose slug drifted,
// and a guess is never enough to delete on — and a branch already gone.
//
// `git branch -D` for the local ref, because its refusals are the safety this relies on: it declines a
// branch the invoking checkout or another worktree has checked out, and that refusal is what keeps the run
// root standing. `-d` would be the wrong verb entirely — it applies the ancestry test ADR 0053 replaced,
// so it refuses every squash-merged branch. A remote-tracking ref can be checked out nowhere, so
// `update-ref -d` deletes it directly.
function reapBranch(branch, refLines, cwd) {
  if (!branch) return true;
  for (const ref of refsFor(refLines, branch)) {
    const deleted = ref.startsWith('refs/heads/')
      ? gitSpawn(['branch', '-D', branch], cwd)
      : gitSpawn(['update-ref', '-d', ref], cwd);
    if (deleted.status !== 0) return false;
  }
  return true;
}

// Removes each `<pendingRoot>/<name>/` that holds no entry at all while no `<scopesRoot>/<name>/` run root exists
// (INV-0076). Only a real directory qualifies (lstat, so a symlink is never followed). `rmdirSync` is non-recursive:
// a directory that gains a staged page between the check and the removal fails and stays (INV-0122).
function reapEmptyStagedDirs(pendingRoot, scopesRoot) {
  let names;
  try {
    names = fs.readdirSync(pendingRoot);
  } catch {
    return;
  }
  for (const name of names) {
    const dir = path.join(pendingRoot, name);
    try {
      if (!fs.lstatSync(dir).isDirectory()) continue;
      if (fs.existsSync(path.join(scopesRoot, name))) continue;
      fs.rmdirSync(dir);
    } catch {
      /* not empty, unreadable, or gone: leave it */
    }
  }
}

// `lib/main-work-tree.js` owns the main-working-tree resolver (ADR 0080): every run root lives under it, whatever
// checkout the session stands in. No fallback to the session's cwd: a hook that cannot place the main tree must
// prune nothing, so a failed load leaves this null and main() prunes nothing, silently.
let mainWorkTree = null;
try {
  ({ mainWorkTree } = require('../lib/main-work-tree.js'));
} catch {
  // Left null. main() checks this before doing anything below.
}

// The bound on each git spawn the resolver makes; a spawn past it carries no verdict (INV-0009).
const RESOLVE_BOUND_MS = 5000;

function main(sessionCwd) {
  // shared reader, git module, or resolver unavailable → prune nothing, say nothing
  if (!readLedgerHeader || !shapeMatches || !parseBranchRefs || !gitSpawn || !localRead || !gitThrow || !parseBranchList || !resolveCommit || typeof mainWorkTree !== 'function') return;
  // The main working tree is the root of every git call below, `HEAD` included, so a session standing in a
  // scopetree does not read the scope branch as `HEAD`. `cwd` names it for the rest of this function.
  let cwd;
  try {
    cwd = mainWorkTree(sessionCwd, { timeout: RESOLVE_BOUND_MS });
  } catch (e) {
    if (e.noVerdict) return; // a read with no verdict (ADR 0290) → prune nothing, say nothing
    throw e;
  }
  if (!cwd) return; // not inside a git repository → prune nothing
  const scopesRoot = path.join(cwd, '.superdev', 'scopes');
  reapEmptyStagedDirs(path.join(cwd, '.superdev', 'kb-pending'), scopesRoot);
  if (!fs.existsSync(scopesRoot)) return; // no superdev runs in this repo

  let allBranches;
  let branchRefs;
  let refLines;
  try {
    // Throwing `gitThrow`, deliberately: an empty branch set would read as "every scope's branch is gone"
    // and prune the lot, so a failure here has to bail before absence is computed rather than yield one.
    // This call writes nothing, so it stays eager while the containment test below does not.
    refLines = gitThrow(['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes'], cwd).split('\n');
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
    makeContainmentTest(cwd, (name) => branchRefs.get(name) || name, scopesRoot),
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
    // Never prune while a scopetree or a slicetree is still present — that's an interrupted cleanup, not a finished run.
    if (fs.existsSync(path.join(dir, 'scopetree')) || holdsEntry(path.join(dir, 'slicetrees'))) continue;
    // The branch is contained by proof here, so it goes before the ledger that names it (ADR 0071). A
    // failed delete leaves the run root standing: the ledger is the only record of the name, so pruning
    // it now strands the branch with nothing left to find it by. The next Stop retries both.
    if (!reapBranch(readBranch(dir), refLines, cwd)) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* leave it, retry next Stop */
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

module.exports = {
  TTL_MS,
  selectPrunable,
  branchNamesFrom,
  readHeader,
  readStage,
  readBranch,
  main,
};

