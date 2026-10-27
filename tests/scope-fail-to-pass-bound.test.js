'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `fail-to-pass` verb (ADR 0134, ADR 0142): the bound and the floor of the run with the
// files put back, whose cases wait on real sleeps and kill bounds. Every scenario writes only inside the fixture's own
// temporary directory (INV-0154).

const assert = require('node:assert');
const path = require('node:path');
const { f2pFixture, verif } = require('./scope-setup');

const { failToPassBoundMs, failToPassFloorMs } = require('../plugin/lib/fail-to-pass.js');

// Every case runs at the default floor of the bound unless it sets its own (ADR 0142).
delete process.env.SUPERDEV_FAIL_TO_PASS_FLOOR_MS;

{
  const { CMD, scenario, leftover, assertGone, done } = f2pFixture();
  try {
    // The run with the files put back is bounded at ten times the duration the control took in the same invocation. The
    // control sleeps $F2P_SLEEP seconds, so it took at least that long, and the bound is read back from the outcome's reason:
    // every assertion compares it with what that invocation itself ran, never with a fixed ceiling (root AGENTS.md, ADR 0086).
    // The run with the files put back hangs, and its whole process group dies at the bound, the shell and the `sleep` it started.
    // The bound's factor and floor are pinned on `failToPassBoundMs` below, with no clock: the control's measured duration
    // includes its own start-up, which load stretches by seconds, so no wall-clock reading pins the factor (#1219).
    const hangs = [
      'if grep -q b src.txt; then sleep "$F2P_SLEEP"; exit 0; fi',
      'if [ -n "$F2P_SLOW" ]; then sleep "$F2P_SLOW"; exit 1; fi',
      'echo $$ > "$F2P_DIR/pid"; sleep 300 & echo $! > "$F2P_DIR/child"; wait',
    ].join('\n') + '\n';
    const bounded = (sleepSeconds, env = {}) => {
      const b = scenario({
        base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
        tip: { 'src.txt': 'b\n', 'tests/t.sh': hangs },
      });
      const startedAt = Date.now();
      // A floor of 1 ms lets the factor alone set the bound, so a hanging run is killed without waiting the 10 000 ms floor.
      const out = b.run(b.range, { env: { F2P_SLEEP: String(sleepSeconds), SUPERDEV_FAIL_TO_PASS_FLOOR_MS: '1', ...env } });
      return { b, out, elapsedMs: Date.now() - startedAt };
    };
    const longRun = bounded(0.2);
    assert.equal(longRun.out.status, 0, longRun.out.stderr);
    const m = /^unknown control=0,put-back=SIGKILL,bound=(\d+)ms$/.exec(longRun.out.stdout.trim());
    assert.ok(m, 'a run killed at its bound records `unknown` naming the signal and the bound: ' + longRun.out.stdout);
    const longBound = Number(m[1]);
    assert.ok(longBound >= 10 * 0.2 * 1000, `the bound is at least ten times the control's 0.2s sleep: ${longBound}ms`);
    assert.deepEqual(longRun.b.trace(), [`01 main fail-to-pass ${longRun.b.range} ${longRun.out.stdout.trim()}`], 'and the line is written');
    assert.deepEqual(leftover(longRun.b), []);
    assertGone('no process the run with the files put back started keeps running', path.join(longRun.b.dir, 'pid'), path.join(longRun.b.dir, 'child'));
    // The kill lands at the reported bound. The control took a tenth of the bound, and a kill armed several bounds late would
    // let the whole verb run for far more than that plus three bounds. The ceiling comes from the bound the same run reported.
    // The verb's fixed work (node start, git, the worktree, the trace write) does not scale with the bound, so the 0.2 s
    // control keeps the bound at 2 s or more, leaving seconds of slack for a stalled machine (ADR 0086).
    assert.ok(longRun.elapsedMs <= longBound / 10 + 3 * longBound, `the verb ran ${longRun.elapsedMs}ms against a reported bound of ${longBound}ms: the second run is killed at its bound`);
    // The bound is ten times the control's duration, rounded up, or the floor, whichever is larger (ADR 0142). Every input is
    // exactly representable, so no binary tail moves the round-up.
    for (const [controlMs, floorMs, bound] of [[100, 1, 1000], [100.5, 1, 1005], [12.25, 1, 123], [5, 1500, 1500], [150, 1500, 1500], [151, 1500, 1510], [0.5, 10000, 10000]]) {
      assert.equal(failToPassBoundMs(controlMs, floorMs), bound, `the bound for a ${controlMs}ms control at a ${floorMs}ms floor`);
    }
    // A run that takes three times the control's duration ends inside its bound and reads a verdict.
    const slow = bounded(0.2, { F2P_SLOW: '0.6' });
    assert.equal(slow.out.stdout.trim(), 'fail-to-pass control=0,put-back=1', slow.out.stderr);

    // The bound has a floor (ADR 0142, #1059). A control that finishes in milliseconds would give a bound shorter than the
    // delays a loaded machine adds. The floor setting's parsing is proven in-process over `failToPassFloorMs`: an unset or
    // empty value says nothing, a rejected one (not a number, zero, negative, above 2147483647, the longest
    // delay Node's timer holds) falls back to 10 000 ms and is named once on stderr. An unset, empty, or whitespace-only value
    // (trimmed to empty) falls back silently. `5s` is the non-numeric one, because a leading-digit parse would read it as 5 ms.
    const savedFloor = process.env.SUPERDEV_FAIL_TO_PASS_FLOOR_MS;
    const savedWrite = process.stderr.write;
    try {
      for (const [value, floor, notes] of [
        [undefined, 10000, 0], ['', 10000, 0], ['1500', 1500, 0], [' 1500 ', 1500, 0], ['2147483647', 2147483647, 0],
        ['5s', 10000, 1], ['0', 10000, 1], ['-5', 10000, 1], ['   ', 10000, 0], ['2147483648', 10000, 1],
      ]) {
        if (value === undefined) delete process.env.SUPERDEV_FAIL_TO_PASS_FLOOR_MS; else process.env.SUPERDEV_FAIL_TO_PASS_FLOOR_MS = value;
        let err = '';
        process.stderr.write = (chunk) => { err += chunk; return true; };
        let got;
        try { got = failToPassFloorMs(); } finally { process.stderr.write = savedWrite; }
        assert.equal(got, floor, `the floor for ${JSON.stringify(value)}`);
        assert.equal((err.match(/SUPERDEV_FAIL_TO_PASS_FLOOR_MS/g) || []).length, notes, `a rejected override is named once on stderr, an unset, blank, or valid one never (${JSON.stringify(value)}): ${err}`);
        if (notes) assert.match(err, /SUPERDEV_FAIL_TO_PASS_FLOOR_MS=.*10000 ms/, 'the note names the value fallen back to');
      }
    } finally {
      if (savedFloor === undefined) delete process.env.SUPERDEV_FAIL_TO_PASS_FLOOR_MS; else process.env.SUPERDEV_FAIL_TO_PASS_FLOOR_MS = savedFloor;
    }
    // One verb row: the environment setting reaches the verb. A hanging run after a fast control is killed at the floor it names, never earlier.
    const atFloor = bounded(0.01, { SUPERDEV_FAIL_TO_PASS_FLOOR_MS: '1500' });
    const floorBound = /^unknown control=0,put-back=SIGKILL,bound=(\d+)ms$/.exec(atFloor.out.stdout.trim());
    assert.ok(floorBound, 'a run killed at the floor records `unknown` naming the bound: ' + atFloor.out.stdout);
    assert.ok(Number(floorBound[1]) >= 1500, `the bound is at least the floor: ${floorBound[1]}ms`);
    assert.doesNotMatch(atFloor.out.stderr, /SUPERDEV_FAIL_TO_PASS_FLOOR_MS/, 'a valid override says nothing on stderr');
    assertGone('no process the run killed at the floor started keeps running', path.join(atFloor.b.dir, 'pid'), path.join(atFloor.b.dir, 'child'));
  } finally {
    done();
  }
}
