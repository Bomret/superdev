'use strict';

// Suite for plugin/hooks/scope-prune.js, the branch reap against real repositories: the run root's branch goes with
// it (ADR 0071), and a reap that cannot finish leaves both standing.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { assertSpawnDecided } = require('./spawn-verdict');
const { hookPath, hook, gitTest, makeRepo, makeScope, refExists, makeWorkBranch } = require('./scope-prune-setup');
const { main } = hook;

{
  // --- The branch reap: the run root's branch goes with it (ADR 0071) ---
  //
  // Every fixture in the other suites asserts only on the run root, so a hook that reaps the root and leaves the
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
  const reapScopeDir = makeScope(reapRepo, 'reaped', '**Stage:** closed\n**Branch:** feat/reaped\n');
  // Spawned rather than called in process, because the delete path is the one that must stay silent:
  // it runs `git branch -D`, which prints to stdout when it succeeds.
  const reapRun = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({ cwd: reapRepo }), encoding: 'utf8', timeout: 15000,
  });
  assertSpawnDecided(reapRun, 'spawning scope-prune.js to reap a merged scope');
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
  const guessScopeDir = makeScope(guessRepo, 'guessed', '**Stage:** closed\n');
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
  const heldScopeDir = makeScope(heldRepo, 'held', '**Stage:** closed\n**Branch:** feat/held\n');
  main(heldRepo);
  assert.equal(fs.existsSync(heldScopeDir), true, 'a scope whose branch cannot be deleted keeps its run root');
  assert.equal(refExists(heldRepo, 'refs/heads/feat/held'), true, 'and keeps the branch a worktree holds');
  gitTest(['worktree', 'remove', heldTree], heldRepo);
  main(heldRepo);
  assert.equal(fs.existsSync(heldScopeDir), false, 'and a later Stop reaps the run root once the delete can succeed');
  assert.equal(refExists(heldRepo, 'refs/heads/feat/held'), false, 'and the branch with it');
  fs.rmSync(heldRepo, { recursive: true, force: true });
}

console.log('scope-prune-reap tests ok');
