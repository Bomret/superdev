#!/usr/bin/env node
'use strict';

// scope-prune: Stop hook. Deterministically removes a completed superdev scope run root
// (.superdev/scopes/<scope>/ — ledger.md, dod.md, the git-ignored post-mortem trail) once the run root
// has sat untouched past a staleness TTL, AND the ledger's `**Stage:**` line reads `shipped`, AND its
// scope branch (<type>/<scope>) is **contained in** the current branch OR gone (ADR 0007, ADR 0053).
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
// content base does not hold (still active), never touches one whose scopetree or slicetrees are still
// present (an interrupted cleanup, not a finished run — leave it for a human to look at), and never
// touches one that isn't recorded as `shipped` — a run mid-chain, at either tier, has its scopetree or
// slicetrees standing until `/superdev:ship` removes it, so that guard alone already protects it; the
// stage gate is the second, independent signal (ADR 0013, ADR 0045).
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
// already in base (`makeContainmentTest` below, or a stub in tests/scope-prune.test.js), a function returning each
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
//   exit 1, a conflict                    → the probe below decides
//
// Comparing the tree is what separates the first two: a clean merge exits 0 whether or not it changes
// anything.
//
// A base that edits the branch's files after taking its work conflicts on a branch it holds in full, so
// the conflict alone is no answer (ADR 0082). `baseHistoryHasPatch` — the probe `scripts/scope.js`
// exports, required below — asks whether base's history holds a commit whose diff is this branch's own
// cumulative diff, and a match is what a reap needs: the work sits in base's history, so deleting the
// branch loses nothing. The probe absent leaves the tree comparison as the whole test, and a failed
// `rev-parse` below, or `git` itself missing or broken, answers false the same way — fail closed, the
// direction everywhere else in this hook takes too.
//
// The mirror stops at the local test. That section's second pass fetches the base and retests against
// `FETCH_HEAD` before it answers not contained, and names this hook as the one caller that never does
// (ADR 0065): a `Stop` hook fires on every finished turn, and a stale base only defers a reap ADR 0007's
// seven-day TTL has already delayed — the same direction every other failure here falls.
function containedInBase(branch, cwd) {
  const merged = gitTry(['merge-tree', '--write-tree', 'HEAD', branch], cwd);
  if (merged.status !== 0) return baseHistoryHasPatch ? baseHistoryHasPatch(cwd, 'HEAD', branch) : false;
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
// already passed the TTL and stage gates. Both the `--write-tree` support check and the older-git
// fallback set are memoised: a repository with nothing prunable makes no git call at all, and one with
// several prunable scopes probes support once. `baseHistoryHasPatch` (ADR 0082) is not memoised here —
// it runs once per prunable branch that conflicts, inside `containedInBase`.
//
// **The fallback is today's ancestry test**, `git branch --merged`, so a git older than 2.38 prunes
// exactly what it prunes now rather than erroring. A failed read there yields an empty set, which reads
// as "nothing is contained" and prunes nothing — the same fail-closed direction as everywhere else. This
// path never reaches `containedInBase`, so the second tier is unreachable on a git this old here — unlike
// `scripts/scope.js`'s own `--is-ancestor` fallback, a different primitive that does reach the probe.
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
//
// `baseHistoryHasPatch` rides the same require, and the two fall back differently (ADR 0082): the
// ledger reader missing stops the sweep outright, while the probe missing only narrows the containment
// test back to the tree comparison. Destructuring both in one `try` covers the version-skewed install
// as well as the failed load — an older sibling carries the reader and no probe, which leaves this
// `null` and the hook silent, exactly as a throwing `require` would.
let readLedgerHeader = null;
let baseHistoryHasPatch = null;
try {
  ({ readLedgerHeader, baseHistoryHasPatch } = require('../scripts/scope.js'));
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
      ? gitTry(['branch', '-D', branch], cwd)
      : gitTry(['update-ref', '-d', ref], cwd);
    if (deleted.status !== 0) return false;
  }
  return true;
}

function main(cwd) {
  if (!readLedgerHeader) return; // shared reader unavailable → prune nothing, say nothing
  const scopesRoot = path.join(cwd, '.superdev', 'scopes');
  if (!fs.existsSync(scopesRoot)) return; // no superdev runs in this repo

  let allBranches;
  let branchRefs;
  let refLines;
  try {
    // Throwing `git()`, deliberately: an empty branch set would read as "every scope's branch is gone"
    // and prune the lot, so a failure here has to bail before absence is computed rather than yield one.
    // This call writes nothing, so it stays eager while the containment test below does not.
    refLines = git(['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes'], cwd).split('\n');
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
    // Never prune while a scopetree or slicetrees are still present — that's an interrupted cleanup, not a finished run.
    if (fs.existsSync(path.join(dir, 'scopetree')) || fs.existsSync(path.join(dir, 'slicetrees'))) continue;
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
  shapeScanBranch,
  branchNamesFrom,
  readHeader,
  readStage,
  readBranch,
  main,
};

