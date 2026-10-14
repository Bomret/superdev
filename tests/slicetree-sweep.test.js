'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/hooks/slicetree-sweep.js. Requires the hook (silent, ADR 0059 / issue #442's
// require.main guard) and calls its exported internals directly, the way the hook's own inline
// --selftest used to before this suite moved off the shipped tree (ADR 0059).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { assertSpawnDecided } = require('./spawn-verdict');

const hookPath = require.resolve('../plugin/hooks/slicetree-sweep.js');
const { selectRemovable, main, git } = require(hookPath);

const root = '/repo/.superdev/scopes/self-improvements';
const porcelain = [
  'worktree /repo\nHEAD a\nbranch refs/heads/main',
  'worktree /repo/.superdev/scopes/self-improvements/slicetrees/2\nHEAD b\nbranch refs/heads/slice/self-improvements/2',
  'worktree /repo/.superdev/scopes/self-improvements/slicetrees/4\nHEAD c\nbranch refs/heads/slice/self-improvements/4',
  'worktree /repo/.superdev/scopes/self-improvements/slicetrees/5\nHEAD d\nbranch refs/heads/slice/self-improvements/5',
].join('\n\n');
const merged = new Set(['main', 'slice/self-improvements/2', 'slice/self-improvements/4']);
const worked = new Set(['slice/self-improvements/2', 'slice/self-improvements/5']);
// #2: merged AND worked → remove. #4: merged but NOT worked (fresh) → skip (the bug).
// #5: worked but NOT merged → skip.
assert.deepEqual(
  selectRemovable(porcelain, merged, worked, root),
  [{ wt: '/repo/.superdev/scopes/self-improvements/slicetrees/2', br: 'slice/self-improvements/2' }],
  'only the merged-AND-worked slice is swept'
);

// Windows: git prints `C:/…`, Node builds `C:\…`; the compare ignores separator and drive-letter case,
// and matches on a separator boundary only.
{
  const wp = (p) => `worktree ${p}\nHEAD b\nbranch refs/heads/slice/s/01`;
  const m = new Set(['slice/s/01']);
  const own = 'C:/repo/.superdev/scopes/s/slicetrees/01';
  for (const sr of ['C:\\repo\\.superdev\\scopes\\s', 'c:\\repo\\.superdev\\scopes\\s', 'C:\\repo\\.superdev\\scopes\\s\\']) {
    assert.deepEqual(selectRemovable(wp(own), m, m, sr), [{ wt: own, br: 'slice/s/01' }], `selected for ${sr}`);
  }
  // Git prints a lower-case drive letter; the scope root carries the upper-case one.
  assert.deepEqual(
    selectRemovable(wp('c:/repo/.superdev/scopes/s/slicetrees/01'), m, m, 'C:\\repo\\.superdev\\scopes\\s'),
    [{ wt: 'c:/repo/.superdev/scopes/s/slicetrees/01', br: 'slice/s/01' }],
    'a lower-case drive in git output still selects the slicetree'
  );
  for (const other of ['s2', 'other']) {
    assert.deepEqual(
      selectRemovable(wp(`C:/repo/.superdev/scopes/${other}/slicetrees/01`), m, m, 'C:\\repo\\.superdev\\scopes\\s'),
      [],
      `${other} is never selected`
    );
  }
}

// POSIX paths compare as written: a backslash is a legal name character there, not a separator.
assert.deepEqual(
  selectRemovable(
    'worktree /repo/.superdev/scopes/s\\x/slicetrees/01\nHEAD b\nbranch refs/heads/slice/s/01',
    new Set(['slice/s/01']),
    new Set(['slice/s/01']),
    '/repo/.superdev/scopes/s'
  ),
  [],
  'a backslash-named POSIX sibling directory is never inside scope s'
);

// --- real-repo smoke: main() end to end, so a broken git invocation inside its try/catch can't
// hide behind the pure selectRemovable() cases (the gap class scope-prune's smoke test closes) ---
//
// The invoking checkout stays on the base branch throughout every scenario below — a full run never
// switches it. Each scope's own branch is resolved from its ledger's `**Branch:**` line, through the
// shared `readLedgerHeader` reader (ADR 0022), never from `git branch --merged` with no argument.
{
  const os = require('node:os');

  function makeRepo() {
    // realpath: git prints resolved worktree paths, and macOS's tmpdir is a symlink
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ws-')));
    git(['init', '-q', '-b', 'main'], dir);
    git(['config', 'user.email', 'test@example.com'], dir);
    git(['config', 'user.name', 'test'], dir);
    fs.writeFileSync(path.join(dir, 'base.txt'), 'x\n');
    git(['add', '.'], dir);
    git(['commit', '-q', '-m', 'base'], dir);
    return dir;
  }

  function makeScope(repoDir, scope, branchLine) {
    const scopeDir = path.join(repoDir, '.superdev', 'scopes', scope);
    fs.mkdirSync(scopeDir, { recursive: true });
    if (branchLine !== null) fs.writeFileSync(path.join(scopeDir, 'ledger.md'), `# ledger\n\n${branchLine}`);
    return scopeDir;
  }

  // Folds a slice branch into a scope branch the way a run's step 4 does — `git merge --no-ff`, in a
  // checkout of the scope branch — without moving the invoking checkout's own HEAD. The merge style is
  // load-bearing: it is what puts the slice's commits on the scope branch as second parents, which is
  // how the hook tells a worked slice from one freshly cut off that same branch.
  function fold(repoDir, scopeBranchName, sliceBranch) {
    const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ws-fold-')));
    const wt = path.join(tmp, 'wt');
    git(['worktree', 'add', '-q', wt, scopeBranchName], repoDir);
    git(['merge', '--no-ff', '-q', '-m', `merge ${sliceBranch}`, sliceBranch], wt);
    git(['worktree', 'remove', wt], repoDir);
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // #two-scopes-independent: `demo`'s slice/1 is folded onto scope/demo and worked → swept. `demo`'s
  // slice/2 carries no commit beyond base, so it reads as
  // trivially merged into everything but fails the "worked" guard → left for its implementer. `other`'s
  // slice/1 is worked but never folded into scope/other → left alone, independently of `demo`'s
  // outcome. HEAD never leaves `main` (the base branch) anywhere in this scenario.
  {
    const repo = makeRepo();
    const g = (args, cwd) => git(args, cwd);
    g(['branch', 'scope/demo'], repo);
    g(['branch', 'scope/other'], repo);
    makeScope(repo, 'demo', '**Branch:** scope/demo\n');
    makeScope(repo, 'other', '**Branch:** scope/other\n');

    const wtDone = path.join(repo, '.superdev/scopes/demo/slicetrees/1');
    const wtFresh = path.join(repo, '.superdev/scopes/demo/slicetrees/2');
    const wtOther = path.join(repo, '.superdev/scopes/other/slicetrees/1');
    g(['worktree', 'add', '-q', '-b', 'slice/demo/1', wtDone], repo);
    g(['worktree', 'add', '-q', '-b', 'slice/demo/2', wtFresh], repo);
    g(['worktree', 'add', '-q', '-b', 'slice/other/1', wtOther], repo);
    fs.writeFileSync(path.join(wtDone, 's1.txt'), 'y\n');
    g(['add', '.'], wtDone);
    g(['commit', '-q', '-m', 's1'], wtDone);
    fs.writeFileSync(path.join(wtOther, 'o1.txt'), 'y\n');
    g(['add', '.'], wtOther);
    g(['commit', '-q', '-m', 'o1'], wtOther);
    fold(repo, 'scope/demo', 'slice/demo/1');

    assert.equal(git(['symbolic-ref', '--short', 'HEAD'], repo), 'main', 'HEAD is on the base branch');
    main(repo);
    assert.equal(git(['symbolic-ref', '--short', 'HEAD'], repo), 'main', 'main() never switches HEAD');
    assert.ok(!fs.existsSync(wtDone), 'the merged-and-worked slicetree is removed while HEAD is base');
    assert.throws(
      () => g(['show-ref', '--verify', '--quiet', 'refs/heads/slice/demo/1'], repo),
      'the swept slice branch is deleted'
    );
    assert.ok(fs.existsSync(wtFresh), 'a slice with no commits beyond base is left for its implementer');
    assert.ok(fs.existsSync(wtOther), 'a worked slice never folded into its own scope branch is left alone');
    fs.rmSync(repo, { recursive: true, force: true });
  }

  // #scope-branch-ahead-of-base: the scope branch carries commits of its own — a plan's design-docs
  // commit, plus one already-merged slice — and a fresh slice is cut from that moved-on tip. It reaches
  // the scope branch's commits, so it has work "beyond the default branch" without having any of its
  // own, and it is trivially merged. Judged on those two alone it reads as integrated and is swept out
  // from under its running implementer, mid-run, with nothing committed yet.
  {
    const repo = makeRepo();
    const g = (args, cwd) => git(args, cwd);
    g(['branch', 'scope/ahead'], repo);
    makeScope(repo, 'ahead', '**Branch:** scope/ahead\n');

    // A design-docs commit on the scope branch, so it stands ahead of main before any slice runs.
    const docs = path.join(repo, '.superdev/scopes/ahead/scopetree');
    g(['worktree', 'add', '-q', docs, 'scope/ahead'], repo);
    fs.writeFileSync(path.join(docs, 'design.md'), 'plan\n');
    g(['add', '.'], docs);
    g(['commit', '-q', '-m', 'design docs'], docs);

    const wtFirst = path.join(repo, '.superdev/scopes/ahead/slicetrees/1');
    g(['worktree', 'add', '-q', '-b', 'slice/ahead/1', wtFirst], repo);
    fs.writeFileSync(path.join(wtFirst, 's1.txt'), 'y\n');
    g(['add', '.'], wtFirst);
    g(['commit', '-q', '-m', 's1'], wtFirst);
    // Merged in the scopetree, the checkout of the scope branch a run holds open — step 4 exactly.
    g(['merge', '--no-ff', '-q', '-m', 'merge slice/ahead/1', 'slice/ahead/1'], docs);

    // Slice 2 is cut from the scope branch as it now stands, and its implementer has committed nothing.
    const wtLive = path.join(repo, '.superdev/scopes/ahead/slicetrees/2');
    g(['worktree', 'add', '-q', '-b', 'slice/ahead/2', wtLive, 'scope/ahead'], repo);

    main(repo);
    assert.ok(fs.existsSync(wtLive), 'a slice cut from a scope branch ahead of base is left for its implementer');
    git(['show-ref', '--verify', '--quiet', 'refs/heads/slice/ahead/2'], repo); // throws if the branch went
    assert.ok(!fs.existsSync(wtFirst), 'the merged slice on that same scope branch is still swept');
    fs.rmSync(repo, { recursive: true, force: true });
  }

  // #cross-scope-ancestor-not-swept: scope `a`'s worked slice branch is folded into scope `b`'s own
  // branch, never into `a`'s own branch — an ancestor relationship `selectRemovable` must judge only
  // against the scope whose iteration it is, per its own slicetrees-directory prefix, or scope `b`'s
  // iteration scans the whole porcelain list and sweeps `a`'s still-unmerged slicetree using `b`'s
  // merge state. Reproduces the cross-scope leak the per-scope prefix now closes.
  {
    const repo = makeRepo();
    const g = (args, cwd) => git(args, cwd);
    g(['branch', 'scope/a'], repo);
    g(['branch', 'scope/b'], repo);
    makeScope(repo, 'a', '**Branch:** scope/a\n');
    makeScope(repo, 'b', '**Branch:** scope/b\n');

    const wtA = path.join(repo, '.superdev/scopes/a/slicetrees/1');
    g(['worktree', 'add', '-q', '-b', 'slice/a/1', wtA], repo);
    fs.writeFileSync(path.join(wtA, 'a1.txt'), 'y\n');
    g(['add', '.'], wtA);
    g(['commit', '-q', '-m', 'a1'], wtA);
    // Folds slice/a/1 into scope/b — a different scope's branch — never into scope/a itself.
    fold(repo, 'scope/b', 'slice/a/1');

    main(repo);
    assert.ok(
      fs.existsSync(wtA),
      "a scope's slicetree merged only into a sibling scope's branch is left standing for its own scope"
    );
    fs.rmSync(repo, { recursive: true, force: true });
  }

  // #ledger-unreadable-or-branchless: a scope with no ledger.md, and one whose ledger carries no
  // `**Branch:**` line, each sweep nothing for themselves — but a normal scope alongside them still
  // sweeps normally.
  {
    const repo = makeRepo();
    const g = (args, cwd) => git(args, cwd);
    g(['branch', 'scope/ok'], repo);
    makeScope(repo, 'ok', '**Branch:** scope/ok\n');
    makeScope(repo, 'no-ledger', null);
    makeScope(repo, 'no-branch-line', '**Stage:** implementing\n');

    const wtOk = path.join(repo, '.superdev/scopes/ok/slicetrees/1');
    const wtNoLedger = path.join(repo, '.superdev/scopes/no-ledger/slicetrees/1');
    const wtNoBranchLine = path.join(repo, '.superdev/scopes/no-branch-line/slicetrees/1');
    g(['worktree', 'add', '-q', '-b', 'slice/ok/1', wtOk], repo);
    g(['worktree', 'add', '-q', '-b', 'slice/no-ledger/1', wtNoLedger], repo);
    g(['worktree', 'add', '-q', '-b', 'slice/no-branch-line/1', wtNoBranchLine], repo);
    // Distinct content/message per worktree: identical trees + messages + same-second timestamps would
    // otherwise hash to the same commit object across branches, making them mutually "merged".
    for (const [wt, label] of [[wtOk, 'ok'], [wtNoLedger, 'no-ledger'], [wtNoBranchLine, 'no-branch-line']]) {
      fs.writeFileSync(path.join(wt, 'w.txt'), `${label}\n`);
      g(['add', '.'], wt);
      g(['commit', '-q', '-m', `work on ${label}`], wt);
    }
    fold(repo, 'scope/ok', 'slice/ok/1');

    main(repo);
    assert.ok(!fs.existsSync(wtOk), 'a normal scope sweeps its merged-and-worked slice as usual');
    assert.ok(fs.existsSync(wtNoLedger), 'a scope with no ledger sweeps nothing for itself');
    assert.ok(fs.existsSync(wtNoBranchLine), 'a scope whose ledger names no branch sweeps nothing for itself');
    fs.rmSync(repo, { recursive: true, force: true });
  }

  // #scope-branch-unresolvable: a scope whose ledger's `**Branch:**` line names a real-looking branch
  // that was never created (deleted, or a typo) sweeps nothing for itself — `git branch --merged
  // <that branch>` fails to resolve it and the per-scope `catch` must fire — while a sibling scope with
  // a valid branch sweeps normally in the same run.
  {
    const repo = makeRepo();
    const g = (args, cwd) => git(args, cwd);
    g(['branch', 'scope/present'], repo);
    makeScope(repo, 'ghost', '**Branch:** scope/does-not-exist\n');
    makeScope(repo, 'present', '**Branch:** scope/present\n');

    const wtGhost = path.join(repo, '.superdev/scopes/ghost/slicetrees/1');
    const wtPresent = path.join(repo, '.superdev/scopes/present/slicetrees/1');
    g(['worktree', 'add', '-q', '-b', 'slice/ghost/1', wtGhost], repo);
    g(['worktree', 'add', '-q', '-b', 'slice/present/1', wtPresent], repo);
    for (const [wt, label] of [[wtGhost, 'ghost'], [wtPresent, 'present']]) {
      fs.writeFileSync(path.join(wt, 'w.txt'), `${label}\n`);
      g(['add', '.'], wt);
      g(['commit', '-q', '-m', `work on ${label}`], wt);
    }
    fold(repo, 'scope/present', 'slice/present/1');

    main(repo);
    assert.ok(fs.existsSync(wtGhost), 'a scope naming an unresolvable branch sweeps nothing for itself');
    assert.ok(!fs.existsSync(wtPresent), 'a sibling scope with a resolvable branch still sweeps normally');
    fs.rmSync(repo, { recursive: true, force: true });
  }

  // #singular-scopetree-never-swept: both tiers' singular `.superdev/scopes/<scope>/scopetree`
  // holds the scope branch itself, not a `slice/*` branch — never a sweep candidate, whatever its
  // merge state.
  {
    const repo = makeRepo();
    const g = (args, cwd) => git(args, cwd);
    g(['branch', 'scope/lite'], repo);
    makeScope(repo, 'lite', '**Branch:** scope/lite\n');
    const scopetreeDir = path.join(repo, '.superdev/scopes/lite/scopetree');
    g(['worktree', 'add', '-q', scopetreeDir, 'scope/lite'], repo);
    main(repo);
    assert.ok(fs.existsSync(scopetreeDir), 'the singular scopetree is never swept');
    fs.rmSync(repo, { recursive: true, force: true });
  }

  // #reader-unavailable: the hook cannot load the shared `readLedgerHeader` reader → it sweeps nothing
  // and says nothing, the same fail-closed direction a git error already takes (scope-prune.js's own
  // `#reader-unavailable` case is the precedent).
  {
    const cp = require('node:child_process');
    const away = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-orphan-'));
    fs.copyFileSync(hookPath, path.join(away, 'slicetree-sweep.js'));

    const repo = makeRepo();
    const g = (args, cwd) => git(args, cwd);
    g(['branch', 'scope/orphan'], repo);
    makeScope(repo, 'orphan', '**Branch:** scope/orphan\n');
    const wtOrphan = path.join(repo, '.superdev/scopes/orphan/slicetrees/1');
    g(['worktree', 'add', '-q', '-b', 'slice/orphan/1', wtOrphan], repo);
    fs.writeFileSync(path.join(wtOrphan, 'w.txt'), 'y\n');
    g(['add', '.'], wtOrphan);
    g(['commit', '-q', '-m', 'work'], wtOrphan);
    fold(repo, 'scope/orphan', 'slice/orphan/1');

    const orphan = cp.spawnSync(process.execPath, [path.join(away, 'slicetree-sweep.js')], {
      input: JSON.stringify({ cwd: repo }), encoding: 'utf8', timeout: 15000,
    });
    assertSpawnDecided(orphan, 'spawning slicetree-sweep.js with an unavailable reader');
    assert.equal(orphan.status, 0, 'a hook that cannot load the reader still exits 0');
    assert.equal(orphan.stdout, '', 'and prints nothing');
    assert.ok(
      fs.existsSync(wtOrphan),
      'a slice that would otherwise be swept survives when the shared reader is unavailable'
    );
    fs.rmSync(away, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }

  // #require-guard: requiring this file (a suite reaching its internal functions) must never
  // sweep — only running it directly, as Claude Code's Stop hook does, may. Both directions use
  // the same merged-and-worked fixture the first scenario above sweeps.
  {
    const cp = require('node:child_process');
    const repo = makeRepo();
    const g = (args, cwd) => git(args, cwd);
    g(['branch', 'scope/guard'], repo);
    makeScope(repo, 'guard', '**Branch:** scope/guard\n');
    const wt = path.join(repo, '.superdev/scopes/guard/slicetrees/1');
    g(['worktree', 'add', '-q', '-b', 'slice/guard/1', wt], repo);
    fs.writeFileSync(path.join(wt, 'w.txt'), 'y\n');
    g(['add', '.'], wt);
    g(['commit', '-q', '-m', 'work'], wt);
    fold(repo, 'scope/guard', 'slice/guard/1');

    const required = cp.spawnSync(process.execPath, ['-e', `require(${JSON.stringify(hookPath)})`], {
      input: JSON.stringify({ cwd: repo }), encoding: 'utf8', timeout: 15000,
    });
    assertSpawnDecided(required, 'requiring slicetree-sweep.js');
    assert.equal(required.status, 0, 'requiring slicetree-sweep.js exits cleanly');
    assert.equal(required.stdout, '', 'requiring slicetree-sweep.js prints nothing');
    assert.ok(fs.existsSync(wt), 'requiring slicetree-sweep.js sweeps nothing');

    const spawned = cp.spawnSync(process.execPath, [hookPath], {
      input: JSON.stringify({ cwd: repo }), encoding: 'utf8', timeout: 15000,
    });
    assertSpawnDecided(spawned, 'spawning slicetree-sweep.js directly');
    assert.equal(spawned.status, 0, 'spawning slicetree-sweep.js directly still exits 0');
    assert.ok(!fs.existsSync(wt), 'spawning slicetree-sweep.js directly still sweeps the merged-and-worked slice');

    fs.rmSync(repo, { recursive: true, force: true });
  }

}

console.log('slicetree-sweep tests ok');
