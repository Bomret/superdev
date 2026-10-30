'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `fail-to-pass` verb (ADR 0134): an interrupt, a kill included, ends the command's process
// group and removes the worktree; a started control that is still running leaves its marker, and the driver signals the
// verb once it exists. Every scenario writes only inside the fixture's own temporary directory (INV-0154).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { f2pFixture, verif } = require('./scope-setup');


{
  const { probe, CMD, scenario, checkout, leftover, hooked, drive, done } = f2pFixture();
  try {
    // A runner that traps SIGTERM and keeps going ends with its group too: nothing it started outlives the verb.
    const hang = 'echo $$ > "$F2P_PID"; touch "$F2P_MARK"; exec sleep 60';
    const stubborn = 'trap "" TERM; echo $$ > "$F2P_PID"; touch "$F2P_MARK"; while :; do sleep 0.2; done';
    // The SIGKILL row's pidfile names a background child of the runner, which the watcher ends with the rest of the group.
    const withChild = 'sleep 60 & echo $! > "$F2P_PID"; touch "$F2P_MARK"; wait';
    for (const [signal, exitStatus, command, label = signal] of [
      ['SIGTERM', 143, hang], ['SIGKILL', null, withChild], ['SIGHUP', 129, stubborn, 'SIGHUP on a runner that traps SIGTERM'],
    ]) {
      const s = scenario({
        base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
        tip: { 'src.txt': 'b\n', 'tests/t.sh': probe },
        cmd: `${CMD}; ${command}`,
      });
      // The snapshot comes first: `git status` itself fires the fixture's post-index-change hook.
      const before = [checkout(s.repo), checkout(s.tree)];
      const sentinelHere = hooked(s);
      const ended = drive({
        mode: 'signal', signal, cwd: s.tree, range: s.range, cmd: s.cmd, root: s.root,
        marker: path.join(path.dirname(s.repo), 'marker'), pidfile: path.join(path.dirname(s.repo), 'pid'),
        env: { F2P_MARK: path.join(path.dirname(s.repo), 'marker'), F2P_PID: path.join(path.dirname(s.repo), 'pid') },
      });
      assert.equal(ended.signal, signal === 'SIGKILL' ? 'SIGKILL' : null, `${label}:how the verb ended`);
      if (exitStatus) assert.equal(ended.code, exitStatus, `${label}:the verb exits 128 plus the signal`);
      if (signal !== 'SIGKILL') assert.deepEqual(ended.leftAtExit, [], `${label}:the worktree is gone when the verb exits`);
      assert.deepEqual(s.trace(), [], `${label}:an interrupted run writes no outcome line`);
      assert.deepEqual(leftover(s), [], `${label}:no worktree directory stays`);
      assert.ok(!fs.existsSync(sentinelHere), `${label}:no hook ran: ` + (fs.existsSync(sentinelHere) ? fs.readFileSync(sentinelHere, 'utf8') : ''));
      assert.deepEqual([checkout(s.repo), checkout(s.tree)], before, `${label}:the checkout keeps its state, and no worktree stays registered`);
    }
  } finally {
    done();
  }
}
