'use strict';

// Suite for plugin/hooks/worktree-sweep.js. Requires the hook (silent, ADR 0059 / issue #442's
// require.main guard) and calls its exported internals directly, the way the hook's own inline
// --selftest used to before this suite moved off the shipped tree (ADR 0059).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const hookPath = require.resolve('../plugin/hooks/worktree-sweep.js');
const { selectRemovable, main, git } = require(hookPath);

const root = '/repo/.superdev/scopes/self-improvements';
const porcelain = [
  'worktree /repo\nHEAD a\nbranch refs/heads/main',
  'worktree /repo/.superdev/scopes/self-improvements/worktrees/2\nHEAD b\nbranch refs/heads/slice/self-improvements/2',
  'worktree /repo/.superdev/scopes/self-improvements/worktrees/4\nHEAD c\nbranch refs/heads/slice/self-improvements/4',
  'worktree /repo/.superdev/scopes/self-improvements/worktrees/5\nHEAD d\nbranch refs/heads/slice/self-improvements/5',
].join('\n\n');
const merged = new Set(['main', 'slice/self-improvements/2', 'slice/self-improvements/4']);
const worked = new Set(['slice/self-improvements/2', 'slice/self-improvements/5']);
// #2: merged AND worked → remove. #4: merged but NOT worked (fresh) → skip (the bug).
// #5: worked but NOT merged → skip.
assert.deepEqual(
  selectRemovable(porcelain, merged, worked, root),
  [{ wt: '/repo/.superdev/scopes/self-improvements/worktrees/2', br: 'slice/self-improvements/2' }],
  'only the merged-AND-worked slice is swept'
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

  // #two-scopes-independent: `demo`'s slice/1 is folded onto scope/demo (`branch -f`, no checkout
  // needed) and worked → swept. `demo`'s slice/2 carries no commit beyond base, so it reads as
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

    const wtDone = path.join(repo, '.superdev/scopes/demo/worktrees/1');
    const wtFresh = path.join(repo, '.superdev/scopes/demo/worktrees/2');
    const wtOther = path.join(repo, '.superdev/scopes/other/worktrees/1');
    g(['worktree', 'add', '-q', '-b', 'slice/demo/1', wtDone], repo);
    g(['worktree', 'add', '-q', '-b', 'slice/demo/2', wtFresh], repo);
    g(['worktree', 'add', '-q', '-b', 'slice/other/1', wtOther], repo);
    fs.writeFileSync(path.join(wtDone, 's1.txt'), 'y\n');
    g(['add', '.'], wtDone);
    g(['commit', '-q', '-m', 's1'], wtDone);
    fs.writeFileSync(path.join(wtOther, 'o1.txt'), 'y\n');
    g(['add', '.'], wtOther);
    g(['commit', '-q', '-m', 'o1'], wtOther);
    // Folds slice/demo/1 into scope/demo without ever checking scope/demo out.
    g(['branch', '-f', 'scope/demo', 'slice/demo/1'], repo);

    assert.equal(git(['symbolic-ref', '--short', 'HEAD'], repo), 'main', 'HEAD is on the base branch');
    main(repo);
    assert.equal(git(['symbolic-ref', '--short', 'HEAD'], repo), 'main', 'main() never switches HEAD');
    assert.ok(!fs.existsSync(wtDone), 'the merged-and-worked slice worktree is removed while HEAD is base');
    assert.throws(
      () => g(['show-ref', '--verify', '--quiet', 'refs/heads/slice/demo/1'], repo),
      'the swept slice branch is deleted'
    );
    assert.ok(fs.existsSync(wtFresh), 'a slice with no commits beyond base is left for its implementer');
    assert.ok(fs.existsSync(wtOther), 'a worked slice never folded into its own scope branch is left alone');
    fs.rmSync(repo, { recursive: true, force: true });
  }

  // #cross-scope-ancestor-not-swept: scope `a`'s worked slice branch is folded into scope `b`'s own
  // branch, never into `a`'s own branch — an ancestor relationship `selectRemovable` must judge only
  // against the scope whose iteration it is, per its own worktrees-directory prefix, or scope `b`'s
  // iteration scans the whole porcelain list and sweeps `a`'s still-unmerged worktree using `b`'s
  // merge state. Reproduces the cross-scope leak the per-scope prefix now closes.
  {
    const repo = makeRepo();
    const g = (args, cwd) => git(args, cwd);
    g(['branch', 'scope/a'], repo);
    g(['branch', 'scope/b'], repo);
    makeScope(repo, 'a', '**Branch:** scope/a\n');
    makeScope(repo, 'b', '**Branch:** scope/b\n');

    const wtA = path.join(repo, '.superdev/scopes/a/worktrees/1');
    g(['worktree', 'add', '-q', '-b', 'slice/a/1', wtA], repo);
    fs.writeFileSync(path.join(wtA, 'a1.txt'), 'y\n');
    g(['add', '.'], wtA);
    g(['commit', '-q', '-m', 'a1'], wtA);
    // Folds slice/a/1 into scope/b — a different scope's branch — never into scope/a itself.
    g(['branch', '-f', 'scope/b', 'slice/a/1'], repo);

    main(repo);
    assert.ok(
      fs.existsSync(wtA),
      "a scope's worktree merged only into a sibling scope's branch is left standing for its own scope"
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

    const wtOk = path.join(repo, '.superdev/scopes/ok/worktrees/1');
    const wtNoLedger = path.join(repo, '.superdev/scopes/no-ledger/worktrees/1');
    const wtNoBranchLine = path.join(repo, '.superdev/scopes/no-branch-line/worktrees/1');
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
    g(['branch', '-f', 'scope/ok', 'slice/ok/1'], repo);

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

    const wtGhost = path.join(repo, '.superdev/scopes/ghost/worktrees/1');
    const wtPresent = path.join(repo, '.superdev/scopes/present/worktrees/1');
    g(['worktree', 'add', '-q', '-b', 'slice/ghost/1', wtGhost], repo);
    g(['worktree', 'add', '-q', '-b', 'slice/present/1', wtPresent], repo);
    for (const [wt, label] of [[wtGhost, 'ghost'], [wtPresent, 'present']]) {
      fs.writeFileSync(path.join(wt, 'w.txt'), `${label}\n`);
      g(['add', '.'], wt);
      g(['commit', '-q', '-m', `work on ${label}`], wt);
    }
    g(['branch', '-f', 'scope/present', 'slice/present/1'], repo);

    main(repo);
    assert.ok(fs.existsSync(wtGhost), 'a scope naming an unresolvable branch sweeps nothing for itself');
    assert.ok(!fs.existsSync(wtPresent), 'a sibling scope with a resolvable branch still sweeps normally');
    fs.rmSync(repo, { recursive: true, force: true });
  }

  // #singular-scope-worktree-never-swept: both tiers' singular `.superdev/scopes/<scope>/worktree`
  // holds the scope branch itself, not a `slice/*` branch — never a sweep candidate, whatever its
  // merge state.
  {
    const repo = makeRepo();
    const g = (args, cwd) => git(args, cwd);
    g(['branch', 'scope/lite'], repo);
    makeScope(repo, 'lite', '**Branch:** scope/lite\n');
    const scopeWorktree = path.join(repo, '.superdev/scopes/lite/worktree');
    g(['worktree', 'add', '-q', scopeWorktree, 'scope/lite'], repo);
    main(repo);
    assert.ok(fs.existsSync(scopeWorktree), 'the singular scope worktree is never swept');
    fs.rmSync(repo, { recursive: true, force: true });
  }

  // #reader-unavailable: the hook cannot load the shared `readLedgerHeader` reader → it sweeps nothing
  // and says nothing, the same fail-closed direction a git error already takes (scope-prune.js's own
  // `#reader-unavailable` case is the precedent).
  {
    const cp = require('node:child_process');
    const away = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-orphan-'));
    fs.copyFileSync(hookPath, path.join(away, 'worktree-sweep.js'));

    const repo = makeRepo();
    const g = (args, cwd) => git(args, cwd);
    g(['branch', 'scope/orphan'], repo);
    makeScope(repo, 'orphan', '**Branch:** scope/orphan\n');
    const wtOrphan = path.join(repo, '.superdev/scopes/orphan/worktrees/1');
    g(['worktree', 'add', '-q', '-b', 'slice/orphan/1', wtOrphan], repo);
    fs.writeFileSync(path.join(wtOrphan, 'w.txt'), 'y\n');
    g(['add', '.'], wtOrphan);
    g(['commit', '-q', '-m', 'work'], wtOrphan);
    g(['branch', '-f', 'scope/orphan', 'slice/orphan/1'], repo);

    const orphan = cp.spawnSync(process.execPath, [path.join(away, 'worktree-sweep.js')], {
      input: JSON.stringify({ cwd: repo }), encoding: 'utf8', timeout: 15000,
    });
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
    const wt = path.join(repo, '.superdev/scopes/guard/worktrees/1');
    g(['worktree', 'add', '-q', '-b', 'slice/guard/1', wt], repo);
    fs.writeFileSync(path.join(wt, 'w.txt'), 'y\n');
    g(['add', '.'], wt);
    g(['commit', '-q', '-m', 'work'], wt);
    g(['branch', '-f', 'scope/guard', 'slice/guard/1'], repo);

    const required = cp.spawnSync(process.execPath, ['-e', `require(${JSON.stringify(hookPath)})`], {
      input: JSON.stringify({ cwd: repo }), encoding: 'utf8', timeout: 15000,
    });
    assert.equal(required.status, 0, 'requiring worktree-sweep.js exits cleanly');
    assert.equal(required.stdout, '', 'requiring worktree-sweep.js prints nothing');
    assert.ok(fs.existsSync(wt), 'requiring worktree-sweep.js sweeps nothing');

    const spawned = cp.spawnSync(process.execPath, [hookPath], {
      input: JSON.stringify({ cwd: repo }), encoding: 'utf8', timeout: 15000,
    });
    assert.equal(spawned.status, 0, 'spawning worktree-sweep.js directly still exits 0');
    assert.ok(!fs.existsSync(wt), 'spawning worktree-sweep.js directly still sweeps the merged-and-worked slice');

    fs.rmSync(repo, { recursive: true, force: true });
  }

  // argv[2] === '--selftest' is a global-process condition, not "this file was invoked directly": a
  // parent process invoked as `node <parent>.js --selftest` that requires this hook must not run
  // this hook's own selftest as a side effect (issue #442 finding 1). Guarded by an env marker so
  // that, if the guard is broken, the recursively-triggered inner selftest doesn't spawn a further
  // generation of itself — it proves the leak exactly once instead of nesting indefinitely.
  if (!process.env.SUPERDEV_ARGV_GUARD_TEST) {
    const cp = require('node:child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-sweep-argv-'));
    const wrapper = path.join(dir, 'req.js');
    fs.writeFileSync(wrapper, `require(${JSON.stringify(hookPath)});`);
    try {
      const outer = cp.spawnSync(process.execPath, [wrapper, '--selftest'], {
        encoding: 'utf8', timeout: 15000,
        env: Object.assign({}, process.env, { SUPERDEV_ARGV_GUARD_TEST: '1' }),
      });
      assert.equal(outer.status, 0, 'a parent whose own argv[2] is --selftest still exits cleanly when it requires worktree-sweep.js');
      assert.equal(outer.stdout, '', "and never runs worktree-sweep.js's own selftest as a side effect");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

console.log('worktree-sweep tests ok');
