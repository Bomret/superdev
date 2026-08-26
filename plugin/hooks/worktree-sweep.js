#!/usr/bin/env node
'use strict';

// worktree-sweep: Stop hook. Deterministically removes finished superdev slice
// worktrees so they don't pile up when the controller skips the prompted cleanup.
//
// superdev lays worktrees out per scope run: .superdev/scopes/<scope>/worktrees/<id>, on a
// scoped branch slice/<scope>/<id>. A worktree is removed only when its branch is BOTH:
//   (a) fully merged into ITS OWN scope run's scope branch (integrated), AND
//   (b) "worked" — it has ≥1 commit not reachable from the repo's default branch.
// (a) is asked per scope run, not of the invoking checkout's current branch: a full run leaves the
// invoking checkout on the base branch throughout, so `git branch --merged` with no argument would
// never see a slice worktree as merged at all. Each scope's branch is read from that scope's own
// ledger (the `**Branch:**` line, via `scripts/scope.js`'s shared `readLedgerHeader`, ADR 0022), so two
// scope runs present at once are judged independently, and a scope whose ledger is unreadable or names
// no branch sweeps nothing for itself while every other scope sweeps normally.
// (b) is the critical guard: a freshly-created slice branch with zero commits is
// trivially an ancestor of (hence "merged" into) its base, so `--merged` alone would
// sweep active, not-yet-committed worktrees out from under running implementers. An
// unmerged in-progress slice fails (a); a fresh empty slice fails (b); only a genuinely
// integrated slice satisfies both. Safe to fire every turn, self-corrects on reverts.
// Best-effort and silent: any git error, a dirty worktree, an unreadable ledger, or no .superdev/ →
// no-op for the affected scope (or the whole sweep, where the failure isn't scope-specific).

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// argv-based (no shell) — a repo-derived value (branch name, worktree path) containing a
// quote/backtick/$() can't break out and inject.
function git(args, cwd) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
}

// The repo's default branch name (main/master), used as the "base" that worked slices
// have commits beyond. Null if undetectable → nothing is swept (safe).
function defaultBranch(cwd) {
  try {
    return git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], cwd).replace(/^origin\//, '');
  } catch {
    for (const b of ['main', 'master']) {
      try {
        git(['show-ref', '--verify', '--quiet', `refs/heads/${b}`], cwd);
        return b;
      } catch {
        /* not this one */
      }
    }
    return null;
  }
}

// Pure: from `git worktree list --porcelain` text, the merged-branch set, the worked-branch
// set, and the absolute path to ONE scope's own directory (`.superdev/scopes/<scope>`), return the
// {wt, br} entries safe to remove for that scope. `mergedSet` is that scope's own branch's merge
// state, so the porcelain scan must stay inside that same scope's directory too — scanning the whole
// `.superdev/` tree here would let a sibling scope's worktree be judged by this scope's `mergedSet`,
// sweeping it whenever its slice branch happens to be an ancestor of this scope's branch as well.
function selectRemovable(porcelain, mergedSet, workedSet, scopeRoot) {
  const prefix = scopeRoot.endsWith(path.sep) ? scopeRoot : scopeRoot + path.sep;
  const out = [];
  for (const block of porcelain.split('\n\n')) {
    const wt = (block.match(/^worktree (.+)$/m) || [])[1];
    const br = (block.match(/^branch refs\/heads\/(.+)$/m) || [])[1];
    if (!wt || !br) continue; // detached or main worktree — skip
    if (!wt.startsWith(prefix)) continue; // only this scope's own worktrees
    if (path.basename(path.dirname(wt)) !== 'worktrees') continue; // .../<scope>/worktrees/<id>
    if (!/^slice\//.test(br)) continue; // only slice/* branches
    if (!mergedSet.has(br)) continue; // (a) integrated into this scope's own branch
    if (!workedSet.has(br)) continue; // (b) has real committed work — not a fresh empty branch
    out.push({ wt, br });
  }
  return out;
}

// `scripts/scope.js` owns the ledger's schema, so it owns how a header value is read (ADR 0022).
// `hooks/scope-prune.js` already requires this export for the same reason. No fallback: a hook that
// cannot read a scope's branch must never guess it, so a require failure below leaves this null and
// main() sweeps nothing for any scope, silently — the same fail-closed direction a git error takes.
let readLedgerHeader = null;
try {
  ({ readLedgerHeader } = require('../scripts/scope.js'));
} catch {
  // Left null. main() checks this before doing anything below.
}

// The scope branch named by one scope run's ledger, or null when the ledger is unreadable or carries
// no `**Branch:**` line — a run this hook must leave untouched rather than guess about.
function scopeBranch(scopeDir) {
  try {
    return readLedgerHeader(fs.readFileSync(path.join(scopeDir, 'ledger.md'), 'utf8'), 'Branch');
  } catch {
    return null;
  }
}

function main(cwd) {
  if (!readLedgerHeader) return; // shared reader unavailable → sweep nothing, say nothing
  const superdevRoot = path.join(cwd, '.superdev');
  if (!fs.existsSync(superdevRoot)) return; // not a superdev run in this repo
  const def = defaultBranch(cwd);
  if (!def) return; // can't establish a base → don't risk sweeping

  let worked, porcelain;
  try {
    // slice branches with ≥1 commit not in the default branch = genuinely worked
    worked = new Set();
    const sliceBranches = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/slice'], cwd)
      .split('\n')
      .filter(Boolean);
    for (const b of sliceBranches) {
      if (git(['rev-list', '-n1', b, '--not', def], cwd)) worked.add(b);
    }
    porcelain = git(['worktree', 'list', '--porcelain'], cwd);
  } catch {
    return; // not a git repo / detached HEAD → bail quietly
  }

  const scopesRoot = path.join(superdevRoot, 'scopes');
  let scopeNames;
  try {
    scopeNames = fs
      .readdirSync(scopesRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return; // no scopes/ → nothing to sweep
  }

  // Each scope run is judged against its own scope branch, so two runs present at once never see each
  // other's merge state (references/scope-mode.md, `## The scope branch`).
  const toRemove = [];
  for (const scope of scopeNames) {
    const branch = scopeBranch(path.join(scopesRoot, scope));
    if (!branch) continue; // unreadable ledger, or no Branch line → sweep nothing for this scope

    let merged;
    try {
      merged = new Set(
        git(['branch', '--merged', branch], cwd)
          .split('\n')
          .map((s) => s.replace(/^[*+ ]+/, '').trim())
          .filter(Boolean)
      );
    } catch {
      continue; // the scope's branch doesn't resolve → sweep nothing for this scope
    }

    toRemove.push(...selectRemovable(porcelain, merged, worked, path.join(scopesRoot, scope)));
  }

  for (const { wt, br } of toRemove) {
    try {
      git(['worktree', 'remove', wt], cwd); // refuses if dirty → caught, left for later
      git(['branch', '-D', br], cwd);
    } catch {
      /* dirty / in use → leave it */
    }
  }
}

if (process.argv[2] === '--selftest') {
  const assert = require('node:assert');
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
      fs.copyFileSync(__filename, path.join(away, 'worktree-sweep.js'));

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
  }

  console.log('worktree-sweep selftest ok');
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
