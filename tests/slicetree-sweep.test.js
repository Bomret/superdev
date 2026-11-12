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
    // The same with a stub at the hook's own `../lib/ledger.js` that marks its load and throws.
    const stubbed = path.join(away, 'stubbed');
    fs.mkdirSync(path.join(stubbed, 'hooks'), { recursive: true });
    fs.mkdirSync(path.join(stubbed, 'lib'));
    fs.copyFileSync(hookPath, path.join(stubbed, 'hooks', 'slicetree-sweep.js'));
    const stubMarker = path.join(stubbed, 'stub-loaded');
    const gitSpawnMarker = path.join(stubbed, 'git-spawn-loaded');
    fs.writeFileSync(
      path.join(stubbed, 'lib', 'git-spawn.js'),
      `require('fs').writeFileSync(${JSON.stringify(gitSpawnMarker)}, 'x'); module.exports = require(${JSON.stringify(require.resolve('../plugin/lib/git-spawn.js'))});`
    );
    fs.writeFileSync(path.join(stubbed, 'lib', 'ledger.js'), `require('fs').writeFileSync(${JSON.stringify(stubMarker)}, 'x'); throw new Error('gone');`);
    const stubRun = cp.spawnSync(process.execPath, [path.join(stubbed, 'hooks', 'slicetree-sweep.js')], {
      input: JSON.stringify({ cwd: repo }), encoding: 'utf8', timeout: 15000,
    });
    assertSpawnDecided(stubRun, 'spawning slicetree-sweep.js with a throwing ledger module');
    assert.equal(stubRun.status, 0, 'a hook whose ledger module throws on load still exits 0');
    assert.equal(stubRun.stdout, '', 'and prints nothing');
    assert.ok(fs.existsSync(stubMarker), 'the stub at ../lib/ledger.js loaded');
    assert.ok(fs.existsSync(gitSpawnMarker), 'the stub at ../lib/git-spawn.js beside it loaded');
    assert.ok(fs.existsSync(wtOrphan), 'a slice that would otherwise be swept survives when the ledger module throws on load');
    // A ledger module that loads but whose reader throws: nothing sweeps.
    fs.rmSync(stubMarker);
    fs.writeFileSync(path.join(stubbed, 'lib', 'ledger.js'), `require('fs').writeFileSync(${JSON.stringify(stubMarker)}, 'x'); module.exports = { readLedgerHeader() { throw new Error('boom'); } };`);
    const throwRun = cp.spawnSync(process.execPath, [path.join(stubbed, 'hooks', 'slicetree-sweep.js')], {
      input: JSON.stringify({ cwd: repo }), encoding: 'utf8', timeout: 15000,
    });
    assertSpawnDecided(throwRun, 'spawning slicetree-sweep.js with a throwing ledger reader');
    assert.equal(throwRun.status, 0, 'a hook whose ledger reader throws still exits 0');
    assert.equal(throwRun.stdout, '', 'and prints nothing');
    assert.ok(fs.existsSync(stubMarker), 'the ledger stub with a throwing reader loaded');
    assert.ok(fs.existsSync(wtOrphan), 'a slice that would otherwise be swept survives when the ledger reader throws');
    fs.rmSync(away, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }

  // #git-spawn-posture: the hook takes `gitThrow` and `parseBranchList` from `../lib/git-spawn.js` (INV-0159).
  // With the module unloadable, with one of the two missing, or with one of them throwing, the hook sweeps
  // nothing, exits 0, and says nothing. Each case runs the fixture beside a pass-through control stub that does
  // sweep it, and confirms its own stub loaded before it asserts. Each case copies the hook to its own path,
  // because `require` caches by path.
  {
    const cp = require('node:child_process');
    const realGitSpawn = JSON.stringify(require.resolve('../plugin/lib/git-spawn.js'));

    // Runs the hook copied beside stubs, `gitSpawnBody` standing in for `../lib/git-spawn.js` (null: absent).
    // `twoScopes` adds a second scope `other` with its own folded slice, so a per-scope failure shows whether
    // the hook skips that scope or abandons the run.
    function run(caseName, gitSpawnBody, twoScopes = false) {
      const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ws-posture-')));
      fs.mkdirSync(path.join(dir, 'hooks'));
      fs.mkdirSync(path.join(dir, 'lib'));
      fs.copyFileSync(hookPath, path.join(dir, 'hooks', 'slicetree-sweep.js'));
      fs.writeFileSync(
        path.join(dir, 'lib', 'ledger.js'),
        `module.exports = require(${JSON.stringify(require.resolve('../plugin/lib/ledger.js'))});\n`
      );
      const loaded = path.join(dir, 'loaded');
      const called = path.join(dir, 'called');
      if (gitSpawnBody !== null) {
        fs.writeFileSync(
          path.join(dir, 'lib', 'git-spawn.js'),
          `const fs = require('fs');\nfs.writeFileSync(${JSON.stringify(loaded)}, 'x');\nconst CALLED = ${JSON.stringify(called)};\nconst real = require(${realGitSpawn});\n${gitSpawnBody}\n`
        );
      }
      const repo = makeRepo();
      git(['branch', 'scope/posture'], repo);
      makeScope(repo, 'posture', '**Branch:** scope/posture\n');
      const wt = path.join(repo, '.superdev/scopes/posture/slicetrees/1');
      git(['worktree', 'add', '-q', '-b', 'slice/posture/1', wt], repo);
      fs.writeFileSync(path.join(wt, 'w.txt'), 'y\n');
      git(['add', '.'], wt);
      git(['commit', '-q', '-m', 'work'], wt);
      fold(repo, 'scope/posture', 'slice/posture/1');
      const wtOther = path.join(repo, '.superdev/scopes/other/slicetrees/1');
      if (twoScopes) {
        git(['branch', 'scope/other'], repo);
        makeScope(repo, 'other', '**Branch:** scope/other\n');
        git(['worktree', 'add', '-q', '-b', 'slice/other/1', wtOther], repo);
        fs.writeFileSync(path.join(wtOther, 'w.txt'), 'y\n');
        git(['add', '.'], wtOther);
        git(['commit', '-q', '-m', 'work'], wtOther);
        fold(repo, 'scope/other', 'slice/other/1');
      }
      const ran = cp.spawnSync(process.execPath, [path.join(dir, 'hooks', 'slicetree-sweep.js')], {
        input: JSON.stringify({ cwd: repo }), encoding: 'utf8', timeout: 15000,
      });
      assertSpawnDecided(ran, `spawning slicetree-sweep.js (${caseName})`);
      assert.equal(ran.status, 0, `the hook exits 0 (${caseName})`);
      assert.equal(ran.stdout, '', `and prints nothing (${caseName})`);
      const result = { loaded: fs.existsSync(loaded), called: fs.existsSync(called), stands: fs.existsSync(wt), otherStands: fs.existsSync(wtOther) };
      fs.rmSync(repo, { recursive: true, force: true });
      fs.rmSync(dir, { recursive: true, force: true });
      return result;
    }

    const control = run('control', 'module.exports = real;');
    assert.equal(control.loaded, true, 'the control stub at ../lib/git-spawn.js loaded');
    assert.equal(control.stands, false, 'the control sweeps the fixture slice, so a surviving slice below is the posture');

    // A parseBranchList that throws for the first scope read only: that scope is skipped, the other still sweeps.
    const oneScope = run(
      'parseBranchList throws once of two scopes',
      "let n = 0;\nmodule.exports = { ...real, parseBranchList(...a) { if (n++ === 0) { fs.writeFileSync(CALLED, 'x'); throw new Error('boom'); } return real.parseBranchList(...a); } };",
      true
    );
    assert.equal(oneScope.loaded, true, 'the stub whose parseBranchList throws once loaded');
    assert.equal(oneScope.called, true, 'the throwing parseBranchList was called');
    assert.equal(oneScope.stands !== oneScope.otherStands, true, 'exactly one scope is skipped and the other is swept');

    const absent = run('git-spawn absent', null);
    assert.equal(absent.loaded, false, 'no stub sits at ../lib/git-spawn.js when the module is absent');
    assert.equal(absent.stands, true, 'a hook that cannot load git-spawn sweeps nothing');

    const unloadable = run('git-spawn throws on load', "throw new Error('gone');");
    assert.equal(unloadable.loaded, true, 'the stub at ../lib/git-spawn.js loaded before it threw');
    assert.equal(unloadable.stands, true, 'a hook whose git-spawn throws on load sweeps nothing');

    for (const fn of ['gitThrow', 'parseBranchList']) {
      const missing = run(`${fn} missing`, `const m = { ...real };\ndelete m.${fn};\nmodule.exports = m;`);
      assert.equal(missing.loaded, true, `the stub missing ${fn} loaded`);
      assert.equal(missing.stands, true, `a hook whose git-spawn carries no ${fn} sweeps nothing`);

      const throwing = run(
        `${fn} throws`,
        `module.exports = { ...real, ${fn}() { fs.writeFileSync(CALLED, 'x'); throw new Error('boom'); } };`
      );
      assert.equal(throwing.loaded, true, `the stub whose ${fn} throws loaded`);
      assert.equal(throwing.called, true, `the throwing ${fn} was called`);
      assert.equal(throwing.stands, true, `a hook whose ${fn} throws sweeps nothing`);
    }
  }

  // The default branch (the base a slice must have commits beyond) resolves from origin/HEAD, then
  // `main`, then `master`; with none the sweep removes nothing. Each scenario folds one worked slice
  // into its scope branch, so only the resolved default branch decides whether it is swept.
  function sweepScenario(initialBranch, prepare, afterSweep) {
    const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ws-def-')));
    git(['init', '-q', '-b', initialBranch], repo);
    git(['config', 'user.email', 'test@example.com'], repo);
    git(['config', 'user.name', 'test'], repo);
    fs.writeFileSync(path.join(repo, 'base.txt'), 'x\n');
    git(['add', '.'], repo);
    git(['commit', '-q', '-m', 'base'], repo);
    git(['branch', 'scope/d'], repo);
    makeScope(repo, 'd', '**Branch:** scope/d\n');
    const wt = path.join(repo, '.superdev/scopes/d/slicetrees/1');
    git(['worktree', 'add', '-q', '-b', 'slice/d/1', wt], repo);
    fs.writeFileSync(path.join(wt, 's1.txt'), 'y\n');
    git(['add', '.'], wt);
    git(['commit', '-q', '-m', 's1'], wt);
    fold(repo, 'scope/d', 'slice/d/1');
    if (prepare) prepare(repo);
    main(repo);
    const gone = !fs.existsSync(wt);
    if (afterSweep) afterSweep(repo);
    fs.rmSync(repo, { recursive: true, force: true });
    return { wt, gone };
  }

  assert.ok(sweepScenario('main').gone, 'with no origin/HEAD, the main fallback is the default branch and the slice is swept');
  assert.ok(sweepScenario('master').gone, 'with no main, the master fallback is the default branch and the slice is swept');
  assert.ok(!sweepScenario('trunk', null, (repo) => {
    git(['show-ref', '--verify', '--quiet', 'refs/heads/slice/d/1'], repo);
  }).gone, 'with neither origin/HEAD, main, nor master, the sweep removes nothing');
  // origin/HEAD names origin/trunk, which lacks the slice's commit, while local `trunk` holds it: only
  // the name stripped of `origin/` resolves to the holder, so the slice is not swept. Unstripped, it
  // would be swept, as the `main` fallback would also have swept it.
  assert.ok(!sweepScenario('main', (repo) => {
    git(['branch', 'trunk', 'scope/d'], repo);
    git(['update-ref', 'refs/remotes/origin/trunk', 'refs/heads/main'], repo);
    git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk'], repo);
  }).gone, 'origin/HEAD (stripped of origin/) wins over the main fallback');

  // A dirty slicetree: `git worktree remove` refuses, so no `branch -D` runs and the branch survives. Git itself also refuses
  // `branch -D` on a branch checked out in a worktree, so the case cannot isolate the hook's own guard.
  {
    const repo = makeRepo();
    git(['branch', 'scope/dirty'], repo);
    makeScope(repo, 'dirty', '**Branch:** scope/dirty\n');
    const wt = path.join(repo, '.superdev/scopes/dirty/slicetrees/1');
    git(['worktree', 'add', '-q', '-b', 'slice/dirty/1', wt], repo);
    fs.writeFileSync(path.join(wt, 's1.txt'), 'y\n');
    git(['add', '.'], wt);
    git(['commit', '-q', '-m', 's1'], wt);
    fold(repo, 'scope/dirty', 'slice/dirty/1');
    fs.writeFileSync(path.join(wt, 's1.txt'), 'uncommitted\n');
    main(repo);
    assert.ok(fs.existsSync(wt), 'a dirty slicetree survives the sweep');
    git(['show-ref', '--verify', '--quiet', 'refs/heads/slice/dirty/1'], repo); // throws if the branch went
    assert.equal(fs.readFileSync(path.join(wt, 's1.txt'), 'utf8'), 'uncommitted\n', 'its uncommitted work is intact');
    fs.rmSync(repo, { recursive: true, force: true });
  }

  // #no-slicetree-no-git: a scope with no slicetree, such as a closed run, asks git nothing about its branch.
  // The Stop hook fires every turn, and a repository keeps its closed run roots until scope-prune reaps them.
  {
    const repo = makeRepo();
    git(['branch', 'scope/closed'], repo);
    git(['branch', 'scope/live'], repo);
    makeScope(repo, 'closed', '**Branch:** scope/closed\n');
    makeScope(repo, 'live', '**Branch:** scope/live\n');
    const wt = path.join(repo, '.superdev/scopes/live/slicetrees/1');
    git(['worktree', 'add', '-q', '-b', 'slice/live/1', wt], repo);
    fs.writeFileSync(path.join(wt, 's1.txt'), 'y\n');
    git(['add', '.'], wt);
    git(['commit', '-q', '-m', 's1'], wt);
    fold(repo, 'scope/live', 'slice/live/1');
    const trace = path.join(repo, 'git-trace.log');
    process.env.GIT_TRACE = trace;
    try { main(repo); } finally { delete process.env.GIT_TRACE; }
    const merged = fs.readFileSync(trace, 'utf8').split('\n').filter((l) => / trace: built-in: git branch --merged /.test(l));
    assert.equal(merged.length, 1, `one --merged query, for the live scope alone: ${merged.join(' | ')}`);
    assert.match(merged[0], /scope\/live/, 'the query is the live scope\'s');
    assert.ok(!fs.existsSync(wt), 'the live scope still sweeps its merged slicetree');
    fs.rmSync(repo, { recursive: true, force: true });
  }

}

console.log('slicetree-sweep tests ok');
