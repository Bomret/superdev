'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `fail-to-pass` verb (ADR 0134, #1315): runs at the same time in one run root, and the
// lock over the repository's worktree registry. Every scenario writes only inside the fixture's own temporary directory
// (INV-0154).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { f2pFixture, verif } = require('./scope-setup');


{
  const { D, CMD, scenario, checkout, leftover, drive, done } = f2pFixture();
  try {
    // Two runs at the same time in one run root do not collide: each runs in a worktree of its own, and the checkout keeps
    // its HEAD, branches, index, working tree, and worktrees.
    let s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': 'mkdir -p "$F2P_BARRIER"; touch "$F2P_BARRIER/$$"; for i in $(seq 200); do [ "$(ls "$F2P_BARRIER" | wc -l)" -ge 2 ] && break; sleep 0.1; done\npwd >> "$F2P_LOG"\ngrep -q b src.txt\n' },
    });
    let before = [checkout(s.repo), checkout(s.tree)];
    const both = drive({ mode: 'parallel', cwd: s.tree, range: s.range, cmd: s.cmd, root: s.root, env: { F2P_LOG: s.log, F2P_BARRIER: path.join(path.dirname(s.repo), 'barrier') } });
    assert.deepEqual(both.map((e) => e.code), [0, 0], 'both runs end with an outcome: ' + JSON.stringify(both));
    assert.deepEqual(both.map((e) => e.stdout.trim()), Array(2).fill('fail-to-pass control=0,put-back=1'));
    assert.equal(s.trace().length, 2, 'each run writes its own line');
    assert.equal(new Set(s.ran()).size, 2, 'in two different worktrees');
    assert.deepEqual(leftover(s), []);
    assert.deepEqual([checkout(s.repo), checkout(s.tree)], before, 'and the checkout keeps its state through both runs');

    // Two runs never edit the repository's worktree registry at the same time: git's `worktree add`, `remove`, and `prune`
    // of one run never overlap another's (a second `add` read the first one's half-written `commondir`, and a `prune`
    // could unregister a worktree being created, #1315). A `git` shim on the PATH holds each such call open for a moment,
    // logs its start and end, and runs the real git, so two calls that reach git within that moment of each other overlap
    // in the log.
    {
      const shimDir = path.join(D, 'shim');
      fs.mkdirSync(shimDir);
      const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
      fs.writeFileSync(path.join(shimDir, 'git'), `#!/bin/sh
for a in "$@"; do
  case "$a" in
    worktree) echo "start $$" >> "$F2P_SHIM_LOG"; sleep 0.3; "${realGit}" "$@"; st=$?; echo "end $$" >> "$F2P_SHIM_LOG"; exit $st ;;
  esac
done
exec "${realGit}" "$@"
`, { mode: 0o755 });
      s = scenario({
        base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
        tip: { 'src.txt': 'b\n', 'tests/t.sh': 'grep -q b src.txt\n' },
      });
      before = [checkout(s.repo), checkout(s.tree)];
      const shimLog = path.join(path.dirname(s.repo), 'shim.log');
      const pair = drive({ mode: 'parallel', cwd: s.tree, range: s.range, cmd: s.cmd, root: s.root, env: { PATH: shimDir + path.delimiter + process.env.PATH, F2P_SHIM_LOG: shimLog } });
      assert.deepEqual(pair.map((e) => e.code), [0, 0], 'both runs end with an outcome: ' + JSON.stringify(pair));
      let open = 0;
      let deepest = 0;
      for (const line of fs.readFileSync(shimLog, 'utf8').split('\n').filter(Boolean)) {
        open += line.startsWith('start') ? 1 : -1;
        deepest = Math.max(deepest, open);
      }
      assert.equal(deepest, 1, "no worktree call of one run overlaps another's");
      assert.equal(s.trace().length, 2, 'each run writes its own line');
      assert.deepEqual(leftover(s), []);
      assert.deepEqual([checkout(s.repo), checkout(s.tree)], before, 'and the checkout keeps its state');

      // The watcher of a killed run removes its worktree under the same lock: beside a second run creating its own, no
      // worktree call overlaps another's.
      s = scenario({
        base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
        tip: { 'src.txt': 'b\n', 'tests/t.sh': 'if [ -n "$F2P_HANG" ]; then touch "$F2P_MARK"; exec sleep 60; fi\ngrep -q b src.txt\n' },
      });
      before = [checkout(s.repo), checkout(s.tree)];
      const killLog = path.join(path.dirname(s.repo), 'shim.log');
      const killed = drive({
        mode: 'kill-beside', cwd: s.tree, range: s.range, cmd: s.cmd, root: s.root, marker: path.join(path.dirname(s.repo), 'marker'), shimLog: killLog,
        env: { PATH: shimDir + path.delimiter + process.env.PATH, F2P_SHIM_LOG: killLog, F2P_MARK: path.join(path.dirname(s.repo), 'marker') },
      });
      assert.equal(killed.first.signal, 'SIGKILL', 'the first run was killed');
      assert.equal(killed.second.code, 0, 'the second run ends with an outcome: ' + killed.second.stderr);
      let killOpen = 0;
      let killDeepest = 0;
      for (const line of fs.readFileSync(killLog, 'utf8').split('\n').filter(Boolean)) {
        killOpen += line.startsWith('start') ? 1 : -1;
        killDeepest = Math.max(killDeepest, killOpen);
      }
      assert.equal(killDeepest, 1, 'no worktree call of a killed run\'s watcher overlaps the second run\'s');
      assert.deepEqual(leftover(s), []);
      assert.deepEqual([checkout(s.repo), checkout(s.tree)], before, 'and the checkout keeps its state');

      // A `worktree add` that fails for another reason refuses with git's own message, the lock released.
      const failDir = path.join(D, 'failshim');
      fs.mkdirSync(failDir);
      fs.writeFileSync(path.join(failDir, 'git'), `#!/bin/sh
case "$*" in
  *"worktree add"*) echo "fatal: no room" >&2; exit 128 ;;
esac
exec "${realGit}" "$@"
`, { mode: 0o755 });
      s = scenario({
        base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
        tip: { 'src.txt': 'b\n', 'tests/t.sh': 'grep -q b src.txt\n' },
      });
      before = [checkout(s.repo), checkout(s.tree)];
      let r = s.run(s.range, { env: { PATH: failDir + path.delimiter + process.env.PATH } });
      assert.equal(r.status, 1, 'a failed worktree add is an error: ' + r.stdout + r.stderr);
      assert.match(r.stderr, /git could not create the worktree: fatal: no room/);
      assert.deepEqual(s.trace(), [], 'and writes no trace line');
      assert.deepEqual(leftover(s), []);
      assert.ok(!fs.existsSync(path.join(s.repo, '.git', 'superdev-worktree.lock')), 'and leaves no lock');
      assert.deepEqual([checkout(s.repo), checkout(s.tree)], before, 'and the checkout keeps its state');

      // A lock a killed holder left (its pid is gone) is taken over, however fresh, and the run ends with an outcome.
      s = scenario({
        base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
        tip: { 'src.txt': 'b\n', 'tests/t.sh': 'grep -q b src.txt\n' },
      });
      const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout.trim();
      const staleLock = path.join(s.repo, '.git', 'superdev-worktree.lock');
      fs.mkdirSync(staleLock);
      fs.writeFileSync(path.join(staleLock, 'pid'), dead);
      r = s.run(s.range, { timeout: 20000 });
      assert.equal(r.status, 0, 'a dead holder\'s lock is taken over: ' + r.stdout + r.stderr);
      assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1');
      assert.ok(!fs.existsSync(staleLock), 'and no lock stays');

      // Many waiters on a dead holder's lock: one takes it over, and no two ever hold it at once. Each holder creates a
      // marker exclusively and removes it on release, so a second holder inside the lock fails its create.
      const lockLib = require.resolve('../plugin/lib/run-supervision.js');
      const overlapLog = path.join(D, 'lock-overlap.log');
      const marker = path.join(D, 'lock-held');
      const holder = `const fs=require('fs');const {withWorktreeLock}=require(${JSON.stringify(lockLib)});
for (let i = 0; i < 3; i++) withWorktreeLock(${JSON.stringify(s.repo)}, () => {
  try { fs.writeFileSync(${JSON.stringify(marker)}, '', { flag: 'wx' }); } catch { fs.appendFileSync(${JSON.stringify(overlapLog)}, 'overlap\\n'); return; }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
  fs.rmSync(${JSON.stringify(marker)});
});`;
      for (let round = 0; round < 2; round++) {
        fs.mkdirSync(staleLock);
        fs.writeFileSync(path.join(staleLock, 'pid'), dead);
        const crowd = spawnSync('sh', ['-c', 'for i in 1 2 3 4 5 6 7 8; do node -e "$HOLDER" & done; wait'], {
          env: { ...process.env, HOLDER: holder }, encoding: 'utf8', timeout: 120000,
        });
        assertSpawnDecided(crowd, 'the crowd of lock waiters');
        assert.equal(crowd.status, 0, 'every waiter ends: ' + crowd.stderr);
      }
      assert.ok(!fs.existsSync(overlapLog), 'no two waiters held the lock at once: ' + (fs.existsSync(overlapLog) ? fs.readFileSync(overlapLog, 'utf8') : ''));
      assert.ok(!fs.existsSync(staleLock), 'and no lock stays');
    }
  } finally {
    done();
  }
}
