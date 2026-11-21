'use strict';

// Suite for plugin/hooks/scope-prune.js, the containment test end to end against real repositories: a branch still
// present locally whose content base holds (ADR 0053), the second tier of the patch probe (ADR 0082), the third
// tier of a base commit holding the branch (ADR 0248), and a git without `--write-tree`.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  hook,
  gitTest,
  makeRepo,
  makeScope,
  refExists,
  makeWorkBranch,
  makeConflictingSquashRepo,
  withFakeGit,
} = require('./scope-prune-setup');
const { main } = hook;

{
  // --- Containment end to end: the branch is still present locally, and base holds its content ---
  //
  // Every case below keeps the scope branch standing, which is this repository's own steady state:
  // `/superdev:ship` leaves it (the pull request is open from it) and nothing later returns for it, so
  // the absence arm never fires and containment is the only thing that can (ADR 0053). Each fixture
  // reaches git for real, so it exercises `containedInBase` rather than a stub.

  // #squash-merged-branch-present: the epic's own red-capable case. `git branch --merged` lists `main`
  // alone here, and the branch is present, so both arms of the old test fail together and the run root
  // stood forever.
  const squashRepo = makeRepo();
  makeWorkBranch(squashRepo, 'fix/squashed', 'app.txt', 'v2\n');
  gitTest(['merge', '--squash', 'fix/squashed'], squashRepo);
  gitTest(['commit', '-q', '-m', 'fix: squashed (#1)'], squashRepo);
  // Base moves on after the squash, so a copy comparing against the branch's own tree reads not-contained.
  fs.writeFileSync(path.join(squashRepo, 'unrelated.txt'), 'later\n');
  gitTest(['add', '.'], squashRepo);
  gitTest(['commit', '-q', '-m', 'unrelated work on base'], squashRepo);
  const squashScopeDir = makeScope(squashRepo, 'squashed', '**Stage:** closed\n**Branch:** fix/squashed\n');
  main(squashRepo);
  assert.equal(
    fs.existsSync(squashScopeDir),
    false,
    'a squash-merged scope whose branch is still present locally is pruned'
  );
  fs.rmSync(squashRepo, { recursive: true, force: true });

  // The merge-commit and fast-forward verdicts are proven in tests/scope-containment.test.js's table; the
  // squash row above carries the base-moves-on shape on the hook's own `containedInBase`.

  // #present-and-carries-unlanded-content: a clean merge that would still change base. `merge-tree`
  // exits 0 here, so the exit status alone would read this as landed — the tree comparison is what
  // catches it, and getting it wrong deletes a live run's root.
  const unlandedRepo = makeRepo();
  makeWorkBranch(unlandedRepo, 'fix/unlanded', 'separate.txt', 'only on the branch\n');
  const unlandedScopeDir = makeScope(unlandedRepo, 'unlanded', '**Stage:** closed\n**Branch:** fix/unlanded\n');
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
  const conflictScopeDir = makeScope(conflictRepo, 'conflicting', '**Stage:** closed\n**Branch:** fix/conflicting\n');
  main(conflictRepo);
  assert.equal(
    fs.existsSync(conflictScopeDir),
    true,
    'a branch that would conflict with base is never pruned'
  );
  fs.rmSync(conflictRepo, { recursive: true, force: true });

  // --- The second tier end to end (ADR 0082) -----------------------------------------------------
  //
  // A base that edits the branch's files after taking its work conflicts with a branch it holds in
  // full, which is what left twenty shipped run roots and their branches standing. The hook calls the
  // probe `plugin/lib/containment.js` exports, keeping `HEAD` as its base and making no fetch.

  // #conflicting-squash-pruned: the epic's red-capable case for this surface. The tree comparison
  // conflicts, base's history holds the patch, and both the run root and the branch go.
  const tookItRepo = makeConflictingSquashRepo('fix/took-it');
  const tookItScopeDir = makeScope(tookItRepo, 'took-it', '**Stage:** closed\n**Branch:** fix/took-it\n');
  main(tookItRepo);
  assert.equal(
    fs.existsSync(tookItScopeDir),
    false,
    'a closed, past-TTL scope whose branch conflicts with HEAD but whose work HEAD holds is pruned'
  );
  assert.equal(
    refExists(tookItRepo, 'refs/heads/fix/took-it'),
    false,
    'and its branch goes with the run root'
  );
  fs.rmSync(tookItRepo, { recursive: true, force: true });

  // #squash-onto-moved-base-pruned: the third tier (ADR 0248). Base edits a line inside the branch's diff
  // context before the squash lands, so no patch id matches, and edits the branch's line afterward, so the
  // tree comparison conflicts. The squash commit's own tree holds the branch, and both the run root and the
  // branch go.
  const movedRepo = makeRepo();
  fs.writeFileSync(path.join(movedRepo, 'app.txt'), 'l1\nl2\nl3\nl4\nl5\n');
  gitTest(['add', '.'], movedRepo);
  gitTest(['commit', '-q', '-m', 'app'], movedRepo);
  makeWorkBranch(movedRepo, 'fix/moved', 'app.txt', 'l1\nl2\nB3\nl4\nl5\n');
  fs.writeFileSync(path.join(movedRepo, 'app.txt'), 'A1\nl2\nl3\nl4\nl5\n');
  gitTest(['commit', '-q', '-am', 'base edits a line inside the diff context'], movedRepo);
  gitTest(['merge', '--squash', 'fix/moved'], movedRepo);
  gitTest(['commit', '-q', '-m', 'fix: moved (#1)'], movedRepo);
  fs.writeFileSync(path.join(movedRepo, 'app.txt'), 'A1\nl2\nB3 revised\nl4\nl5\n');
  gitTest(['commit', '-q', '-am', 'base revises the same line'], movedRepo);
  const movedScopeDir = makeScope(movedRepo, 'moved', '**Stage:** closed\n**Branch:** fix/moved\n');
  main(movedRepo);
  assert.equal(
    fs.existsSync(movedScopeDir),
    false,
    'a closed, past-TTL scope squash-merged onto a moved HEAD, whose line HEAD edited afterward, is pruned'
  );
  assert.equal(refExists(movedRepo, 'refs/heads/fix/moved'), false, 'and its branch goes with the run root');
  fs.rmSync(movedRepo, { recursive: true, force: true });

  // #no-fetch-on-any-path: a `Stop` hook fires on every finished turn, so it stays off the network
  // whatever the probe decides (ADR 0065, ADR 0082).
  const noFetchRepo = makeConflictingSquashRepo('fix/nofetch');
  const noFetchMarker = path.join(noFetchRepo, 'fetch-ran');
  makeScope(noFetchRepo, 'nofetch', '**Stage:** closed\n**Branch:** fix/nofetch\n');
  withFakeGit(`if [ "$1" = "fetch" ]; then touch "${noFetchMarker}"; fi`, () => main(noFetchRepo));
  assert.equal(fs.existsSync(noFetchMarker), false, 'the hook makes no git fetch on any path');
  fs.rmSync(noFetchRepo, { recursive: true, force: true });

  // #gates-before-the-probe: the TTL and stage reads still gate every git call the probe would make,
  // so a repository with nothing prunable walks no patches. `git log` is probe-only here.
  for (const [scope, ledger, touchNow] of [
    ['not-closed', '**Stage:** reviewed\n**Branch:** fix/not-closed\n', false],
    ['still-fresh', '**Stage:** closed\n**Branch:** fix/still-fresh\n', true],
  ]) {
    const gateRepo = makeConflictingSquashRepo(`fix/${scope}`);
    const gateScopeDir = makeScope(gateRepo, scope, ledger);
    if (touchNow) fs.utimesSync(path.join(gateScopeDir, 'ledger.md'), new Date(), new Date());
    const gateMarker = path.join(gateRepo, 'log-ran');
    withFakeGit(`if [ "$1" = "log" ]; then touch "${gateMarker}"; fi`, () => main(gateRepo));
    assert.equal(fs.existsSync(gateScopeDir), true, `a ${scope} scope survives`);
    assert.equal(fs.existsSync(gateMarker), false, `a ${scope} scope is never probed at all`);
    fs.rmSync(gateRepo, { recursive: true, force: true });
  }

  // #probe-fails-closed: INV-0003 on this surface. Every git call the probe makes can fail, and each
  // failure leaves the scope standing rather than crashing the turn. The other steps are pinned in
  // tests/scope-containment.test.js's `#probe-fails-closed`; one row proves the hook leaves the scope standing.
  {
    const failing = 'merge-base';
    const failRepo = makeConflictingSquashRepo('fix/failing');
    const failScopeDir = makeScope(failRepo, 'failing', '**Stage:** closed\n**Branch:** fix/failing\n');
    withFakeGit(`if [ "$1" = "${failing}" ]; then exit 3; fi`, () => main(failRepo));
    assert.equal(
      fs.existsSync(failScopeDir),
      true,
      `a failing git ${failing} on a probe step leaves the scope standing`
    );
    assert.equal(
      refExists(failRepo, 'refs/heads/fix/failing'),
      true,
      `and leaves its branch standing too, on a failing git ${failing}`
    );
    fs.rmSync(failRepo, { recursive: true, force: true });
  }

  // #not-contained-record: INV-0199. A closed, stale scope whose branch conflicts with base and is not contained pays the
  // containment test once per base commit and branch commit. Every git call is counted through a fake git that logs its
  // arguments; nothing is timed (ADR 0086).
  {
    const RECORD = 'not-contained';
    const TIER = /^(merge-base|diff|log|patch-id|rev-list) /;
    // A branch that edits a line base rewrote its own way, never taken: merge-tree conflicts, and no tier holds it.
    const unheld = (branch) => {
      const dir = makeRepo();
      fs.writeFileSync(path.join(dir, 'app.txt'), 'l1\nl2\nl3\n');
      gitTest(['add', '.'], dir);
      gitTest(['commit', '-q', '-m', 'app'], dir);
      makeWorkBranch(dir, branch, 'app.txt', 'l1\nBRANCH\nl3\n');
      fs.writeFileSync(path.join(dir, 'app.txt'), 'l1\nBASE\nl3\n');
      gitTest(['commit', '-q', '-am', 'base writes its own line'], dir);
      return dir;
    };
    // One Stop with every git call logged; returns the logged argument lines.
    const stop = (repo, extra = '') => {
      const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-gitlog-')), 'log');
      fs.writeFileSync(log, '');
      withFakeGit(`printf '%s\\n' "$*" >> "${log}"\n${extra}`, () => main(repo));
      const lines = fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
      fs.rmSync(path.dirname(log), { recursive: true, force: true });
      return lines;
    };
    const testedBranch = (lines, branch) => lines.some((l) => l === `merge-tree --write-tree HEAD ${branch}`);
    const tierCalls = (lines) => lines.filter((l) => TIER.test(l));
    const takeBranchLine = (repo) => {
      fs.writeFileSync(path.join(repo, 'app.txt'), 'l1\nBRANCH\nl3\n');
      gitTest(['commit', '-q', '-am', 'base takes the branch line'], repo);
    };

    // The red-capable case: the second Stop on unchanged commits runs no merge-tree of the branch and no tier call.
    const repo = unheld('fix/unheld-rec');
    const scopeDir = makeScope(repo, 'unheld-rec', '**Stage:** closed\n**Branch:** fix/unheld-rec\n');
    const first = stop(repo);
    assert.ok(testedBranch(first, 'fix/unheld-rec'), 'the first Stop runs the containment test');
    assert.equal(fs.existsSync(scopeDir), true, 'a not-contained scope stands');
    const second = stop(repo);
    assert.equal(testedBranch(second, 'fix/unheld-rec'), false, 'the second Stop on unchanged commits runs no merge-tree of the branch');
    assert.deepEqual(tierCalls(second), [], 'and no tier call');
    assert.equal(fs.existsSync(path.join(scopeDir, RECORD)), true, 'the first Stop recorded the decisive not-contained answer');
    assert.equal(fs.existsSync(scopeDir), true, 'and reaps nothing');

    // A moved branch commit reruns the test.
    gitTest(['checkout', '-q', 'fix/unheld-rec'], repo);
    fs.writeFileSync(path.join(repo, 'other.txt'), 'o\n');
    gitTest(['add', 'other.txt'], repo);
    gitTest(['commit', '-q', '-m', 'branch moves'], repo);
    gitTest(['checkout', '-q', 'main'], repo);
    assert.ok(testedBranch(stop(repo), 'fix/unheld-rec'), 'a moved branch commit reruns the test');
    assert.equal(testedBranch(stop(repo), 'fix/unheld-rec'), false, 'and the new answer is recorded in turn');

    // A moved base commit reruns the test, and a branch now contained is reaped. The record is the run root's newest file,
    // and it does not hold off the reap.
    takeBranchLine(repo);
    gitTest(['checkout', '-q', 'fix/unheld-rec', '--', 'other.txt'], repo);
    gitTest(['commit', '-q', '-m', 'base takes the branch file'], repo);
    assert.ok(testedBranch(stop(repo), 'fix/unheld-rec'), 'a moved base commit reruns the test');
    assert.equal(fs.existsSync(scopeDir), false, 'a branch now contained is reaped, the fresh record notwithstanding');
    fs.rmSync(repo, { recursive: true, force: true });

    // A branch deleted after the record was written is reaped.
    {
      const goneRepo = unheld('fix/gone-rec');
      const goneDir = makeScope(goneRepo, 'gone-rec', '**Stage:** closed\n**Branch:** fix/gone-rec\n');
      stop(goneRepo);
      assert.equal(fs.existsSync(path.join(goneDir, RECORD)), true, 'control: the record was written');
      gitTest(['branch', '-D', 'fix/gone-rec'], goneRepo);
      stop(goneRepo);
      assert.equal(fs.existsSync(goneDir), false, 'a gone branch is reaped whatever record its run root holds');
      fs.rmSync(goneRepo, { recursive: true, force: true });
    }

    // A missing, empty, malformed, or unreadable record reruns the test.
    for (const [label, spoil] of [
      ['missing', (f) => fs.rmSync(f)],
      ['empty', (f) => fs.writeFileSync(f, '')],
      ['malformed', (f) => fs.writeFileSync(f, 'not a record\n')],
      ['unreadable', (f) => { fs.rmSync(f); fs.mkdirSync(f); }],
    ]) {
      const r = unheld(`fix/spoil-${label}`);
      const d = makeScope(r, `spoil-${label}`, `**Stage:** closed\n**Branch:** fix/spoil-${label}\n`);
      stop(r);
      spoil(path.join(d, RECORD));
      assert.ok(testedBranch(stop(r), `fix/spoil-${label}`), `a ${label} record reruns the test`);
      assert.equal(fs.existsSync(d), true, `and a ${label} record reaps nothing`);
      fs.rmSync(r, { recursive: true, force: true });
    }

    // A failed git call in the containment test writes no record, and the next Stop reruns the test.
    for (const [label, fail] of [
      ['merge-tree', 'if [ "$1" = "merge-tree" ] && [ "$4" != "HEAD" ]; then exit 3; fi'],
      ['merge-base', 'if [ "$1" = "merge-base" ]; then exit 3; fi'],
      ['patch-id', 'if [ "$1" = "patch-id" ]; then exit 3; fi'],
      ['commit read', 'case "$*" in *"^{commit}"*) exit 3;; esac'],
    ]) {
      const r = unheld('fix/failed-call');
      const d = makeScope(r, 'failed-call', '**Stage:** closed\n**Branch:** fix/failed-call\n');
      stop(r, fail);
      assert.equal(fs.existsSync(path.join(d, RECORD)), false, `a failed ${label} writes no record`);
      assert.equal(fs.existsSync(d), true, `and a failed ${label} reaps nothing`);
      assert.ok(testedBranch(stop(r), 'fix/failed-call'), `and the next Stop after a failed ${label} reruns the test`);
      fs.rmSync(r, { recursive: true, force: true });
    }

    // An unwritable run root leaves the hook's verdicts unchanged: every Stop runs the test and reaps nothing.
    if (typeof process.getuid !== 'function' || process.getuid() !== 0) {
      const r = unheld('fix/readonly-rec');
      const d = makeScope(r, 'readonly-rec', '**Stage:** closed\n**Branch:** fix/readonly-rec\n');
      fs.chmodSync(d, 0o555);
      try {
        for (const n of [1, 2]) {
          assert.ok(testedBranch(stop(r), 'fix/readonly-rec'), `Stop ${n} on an unwritable run root runs the test`);
          assert.equal(fs.existsSync(d), true, `and Stop ${n} reaps nothing`);
        }
      } finally {
        fs.chmodSync(d, 0o755);
      }
      assert.equal(fs.existsSync(path.join(d, RECORD)), false, 'and no record was written');
      takeBranchLine(r);
      stop(r);
      assert.equal(fs.existsSync(d), false, 'a contained branch is reaped as without a record');
      fs.rmSync(r, { recursive: true, force: true });
    }

    // A repository with nothing prunable makes no containment git call: no merge-tree and no commit read.
    {
      const r = unheld('fix/fresh-rec');
      const d = makeScope(r, 'fresh-rec', '**Stage:** closed\n**Branch:** fix/fresh-rec\n');
      fs.utimesSync(path.join(d, 'ledger.md'), new Date(), new Date());
      const lines = stop(r);
      assert.deepEqual(lines.filter((l) => l.startsWith('merge-tree') || l.includes('^{commit}') || TIER.test(l)), [], 'nothing prunable runs no containment git call');
      assert.equal(fs.existsSync(path.join(d, RECORD)), false, 'and writes no record');
      fs.rmSync(r, { recursive: true, force: true });
    }
  }

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
  const oldMergeScopeDir = makeScope(oldMergeRepo, 'oldmerge', '**Stage:** closed\n**Branch:** fix/oldmerge\n');

  const oldSquashRepo = makeRepo();
  makeWorkBranch(oldSquashRepo, 'fix/oldsquash', 'app.txt', 'v2\n');
  gitTest(['merge', '--squash', 'fix/oldsquash'], oldSquashRepo);
  gitTest(['commit', '-q', '-m', 'fix: oldsquash (#1)'], oldSquashRepo);
  const oldSquashScopeDir = makeScope(oldSquashRepo, 'oldsquash', '**Stage:** closed\n**Branch:** fix/oldsquash\n');

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
}

console.log('scope-prune-containment tests ok');
