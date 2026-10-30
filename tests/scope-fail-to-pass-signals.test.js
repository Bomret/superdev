'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `fail-to-pass` verb (ADR 0134, INV-0009): a run ended by a signal, and the background
// processes a run leaves behind, each polled until gone. Every scenario writes only inside the fixture's own temporary
// directory (INV-0154).

const assert = require('node:assert');
const path = require('node:path');
const { f2pFixture, verif } = require('./scope-setup');


{
  const { probe, CMD, scenario, leftover, assertGone, done } = f2pFixture();
  try {
    // The command starts `sleep 300` in the background and records its pid in `$F2P_DIR/child`. The sleep's output goes to
    // /dev/null, so a survivor never holds the verb's stderr pipe open and the failure shows at the liveness poll.
    const background = 'sleep 300 >/dev/null 2>&1 & echo $! >> "$F2P_DIR/child"';

    // A control ended by a signal carries no exit status: it records `unknown` naming the signal. The process group it ran in
    // dies with it, a background process included.
    let s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe },
      cmd: `${CMD}; ${background}; kill -KILL $$`,
    });
    let r = s.run(s.range);
    assert.equal(r.status, 0, 'an `unknown` is an outcome that was read and printed, a signal-ended control included: ' + r.stderr);
    assert.equal(r.stdout.trim(), 'unknown control=SIGKILL', r.stderr);
    assert.deepEqual(s.trace(), [`01 main fail-to-pass ${s.range} unknown control=SIGKILL`]);
    assert.deepEqual(s.runLines(), [], 'a control a signal ended writes no run line');
    assert.deepEqual(leftover(s), [], 'and no worktree stays');
    assertGone('a signal-ended control leaves no process of its group running', path.join(s.dir, 'child'));

    // A run ended by a signal has no exit status: no verdict (INV-0009), so it records `unknown` naming the signal and the
    // bound it ran under. Its whole process group dies with it, a background process included.
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe },
      cmd: `${CMD}; grep -q b src.txt || { ${background}; kill -KILL $$; }`,
    });
    r = s.run(s.range);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout.trim(), /^unknown control=0,put-back=SIGKILL,bound=\d+ms$/);
    assert.deepEqual(s.trace(), [`01 main fail-to-pass ${s.range} ${r.stdout.trim()}`]);
    assert.deepEqual(leftover(s), []);
    assertGone('a signal-ended run before the change leaves no process of its group running', path.join(s.dir, 'child'));

    // A run that exits on its own and leaves a background process behind leaves none running once the run is over, so
    // nothing writes into a worktree the verb removes, or into the files the second run puts back.
    s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe },
      cmd: `${CMD}; ${background}`,
    });
    r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'pass-to-pass control=0,put-back=0', r.stderr);
    assertGone('both runs leave no background process running', path.join(s.dir, 'child'));
  } finally {
    done();
  }
}
