'use strict';

// Suite for plugin/hooks/scope-prune.js, `main()` end to end against real repositories: which run roots the hook
// prunes and which it leaves standing, and the entry guard that keeps a plain `require` from pruning.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { assertSpawnDecided } = require('./spawn-verdict');
const { hookPath, hook, TTL_MS, gitTest, makeRepo, makeScope } = require('./scope-prune-setup');
const { main } = hook;

// --- smoke test: main() end to end, against a real repository ---
//
// Every pure case in `scope-prune.test.js` calls the pure functions directly, with hand-built Sets and string arrays — never
// sh()/git()/main(). A shell-quoted git command that throws on every invocation (Critical 1: unquoted
// `%(refname)` hitting /bin/sh) would still pass all of them, because main()'s try/catch swallows the
// error and prunes nothing, silently. Only running main() against a real repository catches that.
{
  // #gone-and-closed: no branch named for this scope anywhere in the repo, ledger stage `closed`,
  // mtime past the TTL → main() removes the run root.
  const goneRepo = makeRepo();
  const goneScopeDir = makeScope(goneRepo, 'squashed');
  main(goneRepo);
  assert.equal(fs.existsSync(goneScopeDir), false, 'a gone, closed, stale scope is pruned end to end');
  fs.rmSync(goneRepo, { recursive: true, force: true });

  // #gone-and-shipped: same shape as #gone-and-closed — branch gone, mtime past the TTL — but the
  // ledger stage is `shipped`, the stage an older `/superdev:ship` left behind or today's version
  // writes before `/superdev:verify-ship`/`/superdev:wrap-up` run (ADR 0106). Only `/superdev:wrap-up`
  // moves the stage to `closed`, so main() must leave this run root alone whether or not its scope
  // checkout is still present.
  const shippedGoneRepo = makeRepo();
  const shippedGoneScopeDir = makeScope(shippedGoneRepo, 'still-shipped', '**Stage:** shipped\n');
  main(shippedGoneRepo);
  assert.equal(
    fs.existsSync(shippedGoneScopeDir),
    true,
    'a gone, stale scope at `shipped` (checkout already removed) is never pruned end to end'
  );
  fs.rmSync(shippedGoneRepo, { recursive: true, force: true });

  // Same `shipped` stage, but the scope checkout (`scopetree/`) is still standing — the shape a
  // `/superdev:ship` run leaves before an operator has run `/superdev:wrap-up` on it at all.
  const shippedCheckoutRepo = makeRepo();
  const shippedCheckoutScopeDir = makeScope(shippedCheckoutRepo, 'shipped-checkout', '**Stage:** shipped\n');
  fs.mkdirSync(path.join(shippedCheckoutScopeDir, 'scopetree'));
  main(shippedCheckoutRepo);
  assert.equal(
    fs.existsSync(shippedCheckoutScopeDir),
    true,
    'a `shipped` scope whose checkout is still present is never pruned end to end'
  );
  fs.rmSync(shippedCheckoutRepo, { recursive: true, force: true });

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
  const remoteScopeDir = makeScope(remoteRepo, 'onremote', '**Stage:** closed\n**Branch:** fix/onremote\n');
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
    '**Stage:** closed\n**Branch:** fix/onremote-squashed\n'
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
    '**Stage:** closed\n**Branch:** fix/divergent (PR #99 open)\n'
  );
  main(divergentRepo);
  assert.equal(
    fs.existsSync(divergentScopeDir),
    true,
    'a present, unmerged scope survives main() end to end even when the ledger Branch line carries trailing content'
  );
  fs.rmSync(divergentRepo, { recursive: true, force: true });

  // #ledger-named-branch-wired: every other fixture is closed with no `**Branch:**` line, so both the
  // readBranch and readStage lambdas main() wires selectPrunable to could be swapped for `() => null` /
  // `() => 'closed'` and still leave every case above green. `feature/alpha`'s type is not in
  // CHANGE_TYPES (only `feat` is), so the shape-scan fallback would misread it as gone; only the
  // ledger's exact `**Branch:**` line (readBranch, wired through) keeps it read as present.
  const alphaRepo = makeRepo();
  gitTest(['checkout', '-q', '-b', 'feature/alpha'], alphaRepo);
  fs.writeFileSync(path.join(alphaRepo, 'more.md'), 'y\n');
  gitTest(['add', '.'], alphaRepo);
  gitTest(['commit', '-q', '-m', 'wip'], alphaRepo);
  gitTest(['checkout', '-q', 'main'], alphaRepo);
  const alphaScopeDir = makeScope(alphaRepo, 'alpha', '**Stage:** closed\n**Branch:** feature/alpha\n');
  main(alphaRepo);
  assert.equal(
    fs.existsSync(alphaScopeDir),
    true,
    'a ledger-named branch the shape scan would misread as gone survives main() end to end'
  );
  fs.rmSync(alphaRepo, { recursive: true, force: true });

  // #reviewed-stage-wired: branch gone, mtime stale — every other gate would prune — but the ledger
  // stage is `reviewed`, not `closed`. Exercises the readStage lambda main() wires through, which the
  // fixture above cannot: it is already closed, so swapping that lambda for `() => 'closed'` changes
  // nothing there.
  const reviewedRepo = makeRepo();
  const reviewedScopeDir = makeScope(reviewedRepo, 'mid-review', '**Stage:** reviewed\n');
  main(reviewedRepo);
  assert.equal(
    fs.existsSync(reviewedScopeDir),
    true,
    'a scope whose ledger stage is not closed survives main() end to end'
  );
  fs.rmSync(reviewedRepo, { recursive: true, force: true });

  // #gone-closed-with-scopetree: same as #gone-and-closed — branch gone, stage `closed`, mtime past
  // the TTL — but the run root also holds a `scopetree/` dir: an interrupted cleanup, not a finished
  // run. main() must leave it for a human to look at, not delete it.
  const cleanupRepo = makeRepo();
  const cleanupScopeDir = makeScope(cleanupRepo, 'mid-cleanup');
  fs.mkdirSync(path.join(cleanupScopeDir, 'scopetree'));
  main(cleanupRepo);
  assert.equal(fs.existsSync(cleanupScopeDir), true, 'a run root with a scopetree/ dir survives main() end to end');
  fs.rmSync(cleanupRepo, { recursive: true, force: true });

  // #gone-closed-with-slicetrees: same as #gone-closed-with-scopetree, but the plural `slicetrees/` dir
  // — the full tier's layout (references/implement-full.md), which actually holds nested git
  // worktrees, and so is the more consequential half of the guard to lose.
  const cleanupFullRepo = makeRepo();
  const cleanupFullScopeDir = makeScope(cleanupFullRepo, 'mid-cleanup-full');
  fs.mkdirSync(path.join(cleanupFullScopeDir, 'slicetrees'));
  main(cleanupFullRepo);
  assert.equal(
    fs.existsSync(cleanupFullScopeDir),
    true,
    'a run root with a slicetrees/ dir survives main() end to end'
  );
  fs.rmSync(cleanupFullRepo, { recursive: true, force: true });

  // #for-each-ref-failure-prunes-nothing: pins "read the branch set eagerly, before absence or
  // containment is ever computed" (see the comment above the try in main()). A shimmed `git` on PATH
  // fails only `for-each-ref`, which aborts main() in its catch before `selectPrunable` runs at all. If
  // the for-each-ref read fell back to an empty Set instead of aborting the whole run, an empty branch
  // set reads as "every scope's branch is gone", and this gone/closed/stale scope — which main() must
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

// #require-guard: requiring this file (a suite reaching its internal functions) must never
// prune — only running it directly, as Claude Code's Stop hook does, may. Both directions use
// the same gone-and-closed fixture #gone-and-closed prunes above.
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
  fs.writeFileSync(ledger, '# ledger\n\n**Stage:** closed\n');
  const past = new Date(Date.now() - TTL_MS - 1000);
  fs.utimesSync(ledger, past, past);

  const required = cp.spawnSync(process.execPath, ['-e', `require(${JSON.stringify(hookPath)})`], {
    input: JSON.stringify({ cwd: repo }), encoding: 'utf8', timeout: 15000,
  });
  assertSpawnDecided(required, 'requiring scope-prune.js');
  assert.equal(required.status, 0, 'requiring scope-prune.js exits cleanly');
  assert.equal(required.stdout, '', 'requiring scope-prune.js prints nothing');
  assert.equal(fs.existsSync(scopeDir), true, 'requiring scope-prune.js prunes nothing');

  const spawned = cp.spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({ cwd: repo }), encoding: 'utf8', timeout: 15000,
  });
  assertSpawnDecided(spawned, 'spawning scope-prune.js directly');
  assert.equal(spawned.status, 0, 'spawning scope-prune.js directly still exits 0');
  assert.equal(fs.existsSync(scopeDir), false, 'spawning scope-prune.js directly still prunes the gone, closed, stale scope');

  fs.rmSync(repo, { recursive: true, force: true });
}

console.log('scope-prune-main tests ok');
