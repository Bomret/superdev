'use strict';

// containment.js: the containment test (ADR 0053, ADR 0065), whether `<base>` already holds `<branch>`'s work, judged on content rather than ancestry.

const { gitSpawn, refResolves } = require('./git-spawn.js');

// `references/scope-mode.md` `## Containment`. Exported for `publish-kb.js` and `hooks/scope-prune.js` to
// `require`, and no CLI verb, because this touches no ledger.
//
// A Containment verdict is one of three strings:
//   'contained'         — base already holds every byte of branch's work
//   'not-contained'     — branch carries content base does not hold, checked only after the refetch
//                          below has had its say
//   'could-not-resolve' — branch names no ref this repository can find at all: a different situation
//                          from "not contained" a consumer must warn about differently
//
// `hooks/scope-prune.js` mirrors the same git plumbing (`containedInBase`, `supportsWriteTree`,
// `qualifyBranchRefs`) without ADR 0065's refetch — it is a `Stop` hook firing on every finished turn,
// and a stale local base only defers a reap the TTL has already delayed. This export is not that hook:
// a not-contained verdict against the local base refetches `<base>` from `<remote>` and retests against
// `FETCH_HEAD` before it answers, because a code host squash-merges the pull request and the operator's
// clone learns nothing until somebody pulls.
//
// Every git call here is a real answer to read off its exit status (a conflict, an unresolved ref, a git
// without `--write-tree`), not an error to propagate. A git call that cannot even start (no git on PATH)
// reads as `status !== 0` exactly like a real nonzero exit, which keeps the fail-closed direction: this
// function never throws, and every path that cannot answer falls toward 'not-contained' or
// 'could-not-resolve', never toward 'contained'. The refetch alone also carries a `timeout` (below): a
// dropped VPN or a firewalled host leaves `git fetch` itself blocked on the network with nothing to read
// off, so the fail-closed exit status this comment describes never arrives on its own there.
//
// `--end-of-options` opens every args array below, ahead of `base`/`ref`/`branch` — every one of them a
// revision-shaped string, and nothing here requires it came from trusted config. Git's own option parser
// cannot otherwise tell `base = '--upload-pack=/some/script'` from a real option, and `git fetch` really
// does run whatever `--upload-pack` names.

// Short enough to be tolerable inside an interactive command, and an order of magnitude past a healthy
// LAN or VPN round trip to the code host: a black-holed remote degrades to the local verdict in seconds,
// never in the minutes a kernel TCP timeout would otherwise take.
const FETCH_TIMEOUT_MS = 5000;

// Bare name -> the ref `merge-tree`/`merge-base` can actually resolve: the bare name itself when a
// local `refs/heads/<name>` exists (gitrevisions(7) already walks to it), and `<remote>/<name>` for a
// name that survives only as a remote-tracking ref — mirroring `hooks/scope-prune.js`'s
// `qualifyBranchRefs`, because a bare name only ever resolves the unqualified `refs/remotes/<name>`
// shape on its own, never `refs/remotes/<remote>/<name>` (ADR 0053).
function qualifyBranch(branch, cwd) {
  if (refResolves(branch, cwd)) return branch;
  const refs = gitSpawn(['for-each-ref', '--format=%(refname)', 'refs/remotes'], cwd);
  if (refs.status !== 0) return branch;
  for (const raw of refs.stdout.split('\n')) {
    const ref = raw.trim();
    if (!ref.startsWith('refs/remotes/')) continue;
    const rest = ref.slice('refs/remotes/'.length);
    const cut = rest.indexOf('/');
    if (cut < 1) continue;
    if (rest.slice(cut + 1) === branch) return rest; // '<remote>/<branch>'
  }
  return branch;
}

// `--write-tree` needs git 2.38 (2022-10-02). Probing costs one `merge-tree` of `HEAD` with itself,
// whose result tree already exists, so the probe writes no object of its own.
function supportsWriteTree(cwd) {
  return gitSpawn(['merge-tree', '--write-tree', '--end-of-options', 'HEAD', 'HEAD'], cwd).status === 0;
}

// One local test against whatever `base` the caller hands (a branch name on the first pass,
// `FETCH_HEAD` on the second) — the tree comparison ADR 0053 states, or the ancestry fallback for a
// git without `--write-tree`. Three answers, because the second tier runs on only one of the two
// negatives (ADR 0082):
//   'contained'    — base already holds every byte of the branch's work
//   'differs'      — the merge is clean and would still change base, so the branch carries content
//                    base does not hold; decisive, and the probe never runs
//   'inconclusive' — the comparison could not settle it: a conflict, an unreadable tree, or the
//                    ancestry fallback, which a squash-merge defeats by construction
function containedAgainst(ref, base, cwd, writeTreeSupported) {
  if (writeTreeSupported) {
    const merged = gitSpawn(['merge-tree', '--write-tree', '--end-of-options', base, ref], cwd);
    if (merged.status !== 0) return 'inconclusive';
    // `--verify` ahead of `--end-of-options`: bare `rev-parse` echoes an unrecognized flag back on
    // stdout instead of treating it as the end-of-options marker, which would corrupt the tree-hash
    // comparison below for every caller, not only an option-shaped `base`.
    const baseTree = gitSpawn(['rev-parse', '--verify', '--quiet', '--end-of-options', base + '^{tree}'], cwd);
    if (baseTree.status !== 0) return 'inconclusive';
    return merged.stdout.trim() === baseTree.stdout.trim() ? 'contained' : 'differs';
  }
  return gitSpawn(['merge-base', '--is-ancestor', '--end-of-options', ref, base], cwd).status === 0
    ? 'contained'
    : 'inconclusive';
}

// The scan the probe below refuses to start past. A cap on commits, never on wall clock: one
// repository state gives one verdict, where a machine-load-dependent bound gives two (ADR 0082).
const PROBE_COMMIT_CAP = 1000;

// A patch stream over a range of up to `PROBE_COMMIT_CAP` commits runs well past `spawnSync`'s own 1 MiB
// default, and an overrun reports as a failed call — a not-contained verdict the repository did not earn.
const PROBE_MAX_BUFFER = 256 * 1024 * 1024;

// `git patch-id --stable` over `input`, returning the set of patch ids it hashed. One id per commit
// for a `git log -p` stream, and exactly one for a plain diff. Empty on any failure, and on an empty
// diff, which reads as "no id to match" at both call sites.
function patchIds(input, cwd) {
  // stdin is `pipe` here alone: `gitSpawn`'s own default ignores it, and every other call in this
  // module writes nothing to git.
  const hashed = gitSpawn(['patch-id', '--stable'], cwd, {
    input,
    stdio: ['pipe', 'pipe', 'ignore'],
    maxBuffer: PROBE_MAX_BUFFER,
  });
  if (hashed.status !== 0) return new Set();
  return new Set(
    hashed.stdout
      .split('\n')
      .map((line) => line.trim().split(' ')[0])
      .filter(Boolean)
  );
}

// The second tier (ADR 0082). Whether base's history holds a commit whose diff equals the branch's
// cumulative diff from their merge base — the neighbouring, exactly decidable question the first tier
// cannot answer once base has edited the branch's files after taking its work. `hooks/scope-prune.js`
// is the second caller, which is why this is exported rather than kept private to `testContainment`.
//
// Fails closed throughout, per INV-0003: a failed `merge-base`, `diff`, `patch-id`, `rev-list`, or
// `log`, an unreadable count, or a range past the cap each answer `false`, leaving the first tier's
// verdict standing. `--end-of-options` opens every revision-taking call for the same reason the rest
// of this module carries it — neither ref is required to have come from trusted config.
function baseHistoryHasPatch(cwd, base, branch) {
  const found = gitSpawn(['merge-base', '--end-of-options', base, branch], cwd);
  if (found.status !== 0) return false;
  const mergeBase = found.stdout.trim();
  if (!mergeBase) return false;

  // The range leads with the merge-base hash, so it is option-shaped under no `base` at all.
  const range = `${mergeBase}..${base}`;
  const counted = gitSpawn(['rev-list', '--count', '--end-of-options', range], cwd);
  if (counted.status !== 0) return false;
  const gained = Number(counted.stdout.trim());
  if (!Number.isInteger(gained) || gained < 1 || gained > PROBE_COMMIT_CAP) return false;

  const diffed = gitSpawn(['diff', '--end-of-options', mergeBase, branch], cwd, {
    maxBuffer: PROBE_MAX_BUFFER,
  });
  if (diffed.status !== 0) return false;
  const [wanted] = patchIds(diffed.stdout, cwd);
  if (!wanted) return false;

  // One `log -p` piped into one `patch-id`, never a subprocess pair per commit: measured at 0.12s
  // against 1.0s over a 64-commit range (ADR 0082).
  const walked = gitSpawn(['log', '-p', '--no-color', '--end-of-options', range], cwd, {
    maxBuffer: PROBE_MAX_BUFFER,
  });
  if (walked.status !== 0) return false;
  return patchIds(walked.stdout, cwd).has(wanted);
}

// The exported test. `remote` is the name `docs/agents/code-management.md` config names; a caller with
// no such config passes its own default. Never throws, and safe on any `base`/`branch` string, not only
// one sourced from trusted config: an option-shaped value (`--upload-pack=...`, `-C<path>`) never runs
// as an argument to any git subcommand this function calls, and a genuinely unreachable `remote` degrades
// to the local verdict within `FETCH_TIMEOUT_MS` rather than blocking on the network indefinitely.
function testContainment(cwd, base, branch, remote = 'origin') {
  return judgeContainment(cwd, base, branch, remote).verdict;
}

// The same test, returning what a caller that must tell an undecided verdict apart needs beside it (`push.js`,
// INV-0009): `verdict`, `refetch` (the refetch's spawn result, or null when no refetch ran), and `judgedBase`
// (the base the verdict was judged against: `base`, or the commit id the refetch brought). `fetchTimeoutMs`
// replaces the refetch's bound.
function judgeContainment(cwd, base, branch, remote = 'origin', { fetchTimeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const result = (verdict, refetch = null, judgedBase = base) => ({ verdict, refetch, judgedBase });
  const ref = qualifyBranch(branch, cwd);
  if (!refResolves(ref, cwd)) return result('could-not-resolve');

  const writeTreeSupported = supportsWriteTree(cwd);
  const local = containedAgainst(ref, base, cwd, writeTreeSupported);
  if (local === 'contained') return result('contained');
  if (local === 'inconclusive' && baseHistoryHasPatch(cwd, base, ref)) return result('contained');

  // Not contained against the local base — refetch before answering (ADR 0065). A fetch that fails
  // (no remote configured, an unreachable host, a rejected credential) leaves the local verdict
  // standing rather than erroring. `timeout`/`killSignal` bound a black-holed host to the same short
  // wait: `spawnSync` otherwise blocks on the connect for as long as the kernel's own TCP timeout runs,
  // which is minutes, not the "leaves the first verdict standing" scope-mode.md already promises.
  // The stderr is kept, in git's own English (the C locale), for a caller that reads why the refetch failed
  // (`push.js` tells a rejected credential from an unreachable remote); the verdict reads the status alone.
  const fetched = gitSpawn(['fetch', '--end-of-options', remote, base], cwd, {
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: fetchTimeoutMs,
    killSignal: 'SIGKILL',
  });
  if (fetched.status !== 0) {
    // The discriminator ADR 0086 names: `spawnSync` sets `signal` exactly when the `timeout`/
    // `killSignal` above ended the fetch before it could return a status of its own — a killed process
    // carries "No verdict" (INV-0009), never a duration to eyeball. `fetched.status !== 0` alone covers
    // every ordinary refetch failure too (no remote configured, offline, a rejected credential, all
    // expected above) — this line fires only on the one case issue #591 needs to self-diagnose: the
    // fetch was actually killed by its own bound. An unkilled failure says nothing here; there was no
    // bound in play to have a finding about.
    if (fetched.signal != null) {
      process.stderr.write(`refetch ended by its own bound (signal ${fetched.signal}) — no verdict\n`);
    }
    return result('not-contained', fetched);
  }
  // The fetched base as a commit id, read before anything else can overwrite FETCH_HEAD.
  const head = gitSpawn(['rev-parse', '--verify', '--quiet', 'FETCH_HEAD^{commit}'], cwd);
  const fetchedBase = head.status === 0 ? head.stdout.trim() : 'FETCH_HEAD';
  const fresh = containedAgainst(ref, fetchedBase, cwd, writeTreeSupported);
  if (fresh === 'contained') return result('contained', fetched, fetchedBase);
  if (fresh === 'inconclusive' && baseHistoryHasPatch(cwd, fetchedBase, ref)) return result('contained', fetched, fetchedBase);
  return result('not-contained', fetched, fetchedBase);
}

module.exports = { testContainment, judgeContainment, baseHistoryHasPatch, PROBE_MAX_BUFFER };
