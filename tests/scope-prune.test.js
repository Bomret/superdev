'use strict';

// Suite for plugin/hooks/scope-prune.js. Requires the hook (silent, ADR 0059 / issue #442's
// require.main guard) and calls its exported internals directly, the way the hook's own inline
// --selftest used to before this suite moved off the shipped tree (ADR 0059).

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const hookPath = require.resolve('../plugin/hooks/scope-prune.js');
const {
  TTL_MS,
  selectPrunable,
  shapeScanBranch,
  branchNamesFrom,
  readHeader,
  readStage,
  readBranch,
  main,
} = require(hookPath);

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

  const refExists = (repoDir, ref) =>
    spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: repoDir, stdio: 'ignore' }).status === 0;

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
  assert.equal(
    refExists(oldMergeRepo, 'refs/heads/fix/oldmerge'),
    false,
    'the branch reap follows the ancestry fallback too, on a git without --write-tree'
  );
  assert.equal(
    refExists(oldSquashRepo, 'refs/heads/fix/oldsquash'),
    true,
    'and leaves the branch the fallback cannot see as contained'
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

  // --- The branch reap: the run root's branch goes with it (ADR 0071) ---
  //
  // Every fixture above asserts only on the run root, so a hook that reaps the root and leaves the
  // branch standing passes all of them — which is exactly the state ADR 0053 recorded and this
  // decision closes. The cases below assert on the refs themselves.

  // #reap-both-refs: a squash-merged scope whose local branch and remote-tracking ref both survive the
  // host's own deletion — this repository's steady state. Both refs go with the run root, in one Stop.
  const reapRepo = makeRepo();
  const reapOriginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-origin-'));
  gitTest(['init', '-q', '--bare', '-b', 'main'], reapOriginDir);
  gitTest(['remote', 'add', 'origin', reapOriginDir], reapRepo);
  makeWorkBranch(reapRepo, 'feat/reaped', 'app.txt', 'v2\n');
  gitTest(['push', '-q', 'origin', 'feat/reaped'], reapRepo);
  gitTest(['merge', '--squash', 'feat/reaped'], reapRepo);
  gitTest(['commit', '-q', '-m', 'feat: reaped (#1)'], reapRepo);
  const reapScopeDir = makeScope(reapRepo, 'reaped', '**Stage:** shipped\n**Branch:** feat/reaped\n');
  // Spawned rather than called in process, because the delete path is the one that must stay silent:
  // it runs `git branch -D`, which prints to stdout when it succeeds.
  const reapRun = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({ cwd: reapRepo }), encoding: 'utf8', timeout: 15000,
  });
  assert.equal(reapRun.status, 0, 'the reap exits 0');
  assert.equal(reapRun.stdout, '', 'and prints nothing, delete included');
  assert.equal(fs.existsSync(reapScopeDir), false, 'the reaped scope loses its run root');
  assert.equal(refExists(reapRepo, 'refs/heads/feat/reaped'), false, 'and its local branch');
  assert.equal(
    refExists(reapRepo, 'refs/remotes/origin/feat/reaped'),
    false,
    "and its remote-tracking ref, which outlives the host's own deletion"
  );
  fs.rmSync(reapRepo, { recursive: true, force: true });
  fs.rmSync(reapOriginDir, { recursive: true, force: true });

  // #reap-needs-a-ledger-named-branch: the ledger carries no `**Branch:**` line, so the branch is
  // resolved by the shape scan, which can match a branch belonging to a different run whose slug
  // drifted. The run root is pruned exactly as it is today, and nothing is deleted from that guess.
  const guessRepo = makeRepo();
  makeWorkBranch(guessRepo, 'feat/guessed', 'app.txt', 'v2\n');
  gitTest(['merge', '--squash', 'feat/guessed'], guessRepo);
  gitTest(['commit', '-q', '-m', 'feat: guessed (#1)'], guessRepo);
  const guessScopeDir = makeScope(guessRepo, 'guessed', '**Stage:** shipped\n');
  main(guessRepo);
  assert.equal(fs.existsSync(guessScopeDir), false, 'a shape-scanned scope still loses its run root');
  assert.equal(
    refExists(guessRepo, 'refs/heads/feat/guessed'),
    true,
    'and keeps the branch only the shape scan named'
  );
  fs.rmSync(guessRepo, { recursive: true, force: true });

  // #reap-failure-keeps-the-run-root: another worktree holds the branch, so `git branch -D` refuses.
  // The ledger is the only record of the branch's name, so pruning the run root here would strand the
  // branch with nothing left to name it. Both survive, and both are reaped once the delete can succeed.
  const heldRepo = makeRepo();
  makeWorkBranch(heldRepo, 'feat/held', 'app.txt', 'v2\n');
  gitTest(['merge', '--squash', 'feat/held'], heldRepo);
  gitTest(['commit', '-q', '-m', 'feat: held (#1)'], heldRepo);
  const heldTree = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-held-'));
  fs.rmSync(heldTree, { recursive: true, force: true }); // git wants to create the path itself
  gitTest(['worktree', 'add', '-q', heldTree, 'feat/held'], heldRepo);
  const heldScopeDir = makeScope(heldRepo, 'held', '**Stage:** shipped\n**Branch:** feat/held\n');
  main(heldRepo);
  assert.equal(fs.existsSync(heldScopeDir), true, 'a scope whose branch cannot be deleted keeps its run root');
  assert.equal(refExists(heldRepo, 'refs/heads/feat/held'), true, 'and keeps the branch a worktree holds');
  gitTest(['worktree', 'remove', heldTree], heldRepo);
  main(heldRepo);
  assert.equal(fs.existsSync(heldScopeDir), false, 'and a later Stop reaps the run root once the delete can succeed');
  assert.equal(refExists(heldRepo, 'refs/heads/feat/held'), false, 'and the branch with it');
  fs.rmSync(heldRepo, { recursive: true, force: true });
}

// The hook `require`s `../scripts/scope.js` (below), and nothing else asserts that `scripts/` actually
// ships alongside `hooks/` in a real install. If a future packaging change stopped shipping it, this
// hook would fail closed and prune nothing, forever, with no signal beyond that silence.
assert.equal(
  fs.existsSync(path.join(path.dirname(hookPath), '..', 'scripts', 'scope.js')),
  true,
  'scripts/scope.js ships alongside this hook'
);

// --- one reader, shared with scripts/scope.js (ADR 0022) ---
//
// This hook carried its own header regex and it drifted on four axes — anchoring, capture width,
// whether the whitespace after the colon crossed a newline, and normalisation — while being hardened
// against defects on this very delete path. Every vector below is the same one `tests/scope.test.js`
// asserts, so agreement is a property of there being one implementation rather than of two staying
// in step.
{
  const scope = require(path.join(path.dirname(hookPath), '..', 'scripts', 'scope.js'));
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
  fs.copyFileSync(hookPath, path.join(away, 'scope-prune.js'));

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

// #require-guard: requiring this file (a suite reaching its internal functions) must never
// prune — only running it directly, as Claude Code's Stop hook does, may. Both directions use
// the same gone-and-shipped fixture #gone-and-shipped prunes above.
{
  const cp = require('node:child_process');
  const g = (args, cwd) => cp.execFileSync('git', args, { cwd, stdio: 'ignore' });
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-guard-'));
  g(['init', '-q', '-b', 'main'], repo);
  g(['config', 'user.email', 'test@example.com'], repo);
  g(['config', 'user.name', 'test'], repo);
  fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
  g(['add', '.'], repo);
  g(['commit', '-q', '-m', 'init'], repo);
  const scopeDir = path.join(repo, '.superdev', 'scopes', 'guard');
  fs.mkdirSync(scopeDir, { recursive: true });
  const ledger = path.join(scopeDir, 'ledger.md');
  fs.writeFileSync(ledger, '# ledger\n\n**Stage:** shipped\n');
  const past = new Date(Date.now() - TTL_MS - 1000);
  fs.utimesSync(ledger, past, past);

  const required = cp.spawnSync(process.execPath, ['-e', `require(${JSON.stringify(hookPath)})`], {
    input: JSON.stringify({ cwd: repo }), encoding: 'utf8', timeout: 15000,
  });
  assert.equal(required.status, 0, 'requiring scope-prune.js exits cleanly');
  assert.equal(required.stdout, '', 'requiring scope-prune.js prints nothing');
  assert.equal(fs.existsSync(scopeDir), true, 'requiring scope-prune.js prunes nothing');

  const spawned = cp.spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({ cwd: repo }), encoding: 'utf8', timeout: 15000,
  });
  assert.equal(spawned.status, 0, 'spawning scope-prune.js directly still exits 0');
  assert.equal(fs.existsSync(scopeDir), false, 'spawning scope-prune.js directly still prunes the gone, shipped, stale scope');

  fs.rmSync(repo, { recursive: true, force: true });
}

// argv[2] === '--selftest' is a global-process condition, not "this file was invoked directly": a
// parent process invoked as `node <parent>.js --selftest` that requires this hook must not run this
// hook's own selftest as a side effect (issue #442 finding 1). Guarded by an env marker so that, if
// the guard is broken, the recursively-triggered inner selftest doesn't spawn a further generation
// of itself — it proves the leak exactly once instead of nesting indefinitely.
if (!process.env.SUPERDEV_ARGV_GUARD_TEST) {
  const cp = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-argv-'));
  const wrapper = path.join(dir, 'req.js');
  fs.writeFileSync(wrapper, `require(${JSON.stringify(hookPath)});`);
  try {
    const outer = cp.spawnSync(process.execPath, [wrapper, '--selftest'], {
      encoding: 'utf8', timeout: 15000,
      env: Object.assign({}, process.env, { SUPERDEV_ARGV_GUARD_TEST: '1' }),
    });
    assert.equal(outer.status, 0, 'a parent whose own argv[2] is --selftest still exits cleanly when it requires scope-prune.js');
    assert.equal(outer.stdout, '', "and never runs scope-prune.js's own selftest as a side effect");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log('scope-prune tests ok');
