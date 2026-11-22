'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `fail-to-pass` verb (ADR 0134, ADR 0142): the bound and the floor of the run with the
// files put back, whose cases wait on real sleeps and kill bounds. Every scenario writes only inside the fixture's own
// temporary directory (root AGENTS.md, *Every shipped executable has a suite in `tests/`, named for it*).

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { f2pFixture, verif, writeOperatorConfig } = require('./scope-setup');

const { failToPassBoundMs, failToPassFloorMs, failToPassControlMs } = require('../plugin/lib/fail-to-pass.js');

// A directory outside any repository, with no operator configuration: each reader's default.
const noConfig = fs.mkdtempSync(path.join(os.tmpdir(), 'f2p-bound-noconfig-'));

// Every case runs at the default floor of the bound unless its fixture's `.superdev/info.json` sets its own (ADR 0142, ADR 0207).
// A set environment variable of the removed name changes nothing.
process.env.SUPERDEV_FAIL_TO_PASS_FLOOR_MS = '1';

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
    const bounded = (sleepSeconds, floorMs = 1, env = {}) => {
      const b = scenario({
        base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) },
        tip: { 'src.txt': 'b\n', 'tests/t.sh': hangs },
      });
      writeOperatorConfig(b.repo, { verification: { failToPassFloorMs: floorMs } });
      const startedAt = Date.now();
      // A floor of 1 ms lets the factor alone set the bound, so a hanging run is killed without waiting the 10 000 ms floor.
      const out = b.run(b.range, { env: { F2P_SLEEP: String(sleepSeconds), ...env } });
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
    const slow = bounded(0.2, 1, { F2P_SLOW: '0.6' });
    assert.equal(slow.out.stdout.trim(), 'fail-to-pass control=0,put-back=1', slow.out.stderr);

    // The bound has a floor (ADR 0142, #1059). A control that finishes in milliseconds would give a bound shorter than the
    // delays a loaded machine adds. The floor is `verification.failToPassFloorMs`, 10 000 ms by default; the parse rules of
    // every operator bound are proven once, in tests/operator-config.test.js. A process run from the linked worktree reads
    // the main checkout's value, which proves the section and key. The default is read in process with the removed
    // variable set, which changes nothing.
    const floorOf = (config) => {
      const b = scenario({ base: { 'src.txt': 'a\n' }, tip: { 'src.txt': 'b\n' } });
      writeOperatorConfig(b.repo, config);
      const r = spawnSync(process.execPath, ['-e', "console.log(require(process.argv[1]).failToPassFloorMs(process.cwd()))", path.resolve(__dirname, '../plugin/lib/fail-to-pass.js')], { cwd: b.tree, encoding: 'utf8', timeout: 20000, killSignal: 'SIGKILL', env: { ...process.env, SUPERDEV_FAIL_TO_PASS_FLOOR_MS: '1' } });
      assertSpawnDecided(r, 'floor reader');
      return { floor: Number(r.stdout.trim()), err: r.stderr };
    };
    assert.deepEqual(floorOf({ verification: { failToPassFloorMs: 1500 } }), { floor: 1500, err: '' }, 'the floor read from the linked worktree');
    assert.equal(failToPassFloorMs(noConfig), 10000, 'the default floor, whatever the removed variable holds');
    // One verb row: the setting reaches the verb run from a linked worktree. A hanging run after a fast control is killed at the floor it names, never earlier.
    const atFloor = bounded(0.01, 1500);
    const floorBound = /^unknown control=0,put-back=SIGKILL,bound=(\d+)ms$/.exec(atFloor.out.stdout.trim());
    assert.ok(floorBound, 'a run killed at the floor records `unknown` naming the bound: ' + atFloor.out.stdout);
    assert.ok(Number(floorBound[1]) >= 1500, `the bound is at least the floor: ${floorBound[1]}ms`);
    assert.doesNotMatch(atFloor.out.stderr, /failToPassFloorMs/, 'a valid value says nothing on stderr');
    assertGone('no process the run killed at the floor started keeps running', path.join(atFloor.b.dir, 'pid'), path.join(atFloor.b.dir, 'child'));

    // The control run is bounded too (#26): 300 000 ms, or `verification.failToPassControlMs` (ADR 0207). A control that hangs
    // against the changed code is killed at its bound and records `unknown`, the put-back run never starts, and no run line is
    // written, so no later run reuses it. The expiry decides the outcome, whatever exit status the killed control reports.
    // Elapsed time is judged against the configured bound, never a fixed ceiling (ADR 0086). The help names the bound and key.
    const hangsAlways = 'echo started >> "$F2P_DIR/runs"; echo $$ > "$F2P_DIR/pid"; sleep 300 & echo $! > "$F2P_DIR/child"; wait; exit 0\n';
    const ctl = scenario({ base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD) }, tip: { 'src.txt': 'b\n', 'tests/t.sh': hangsAlways } });
    writeOperatorConfig(ctl.repo, { verification: { failToPassControlMs: 1500 } });
    const ctlStart = Date.now();
    const hung = ctl.run(ctl.range);
    const ctlElapsed = Date.now() - ctlStart;
    assert.equal(hung.status, 0, hung.stderr);
    assert.equal(hung.stdout.trim(), 'unknown control=SIGKILL,bound=1500ms', 'a control killed at its bound records `unknown` naming how it ended and the bound');
    assert.deepEqual(ctl.trace(), [`01 main fail-to-pass ${ctl.range} unknown control=SIGKILL,bound=1500ms`]);
    assert.deepEqual(ctl.runLines(), [], 'an expired control writes no run line');
    assert.equal(require('node:fs').readFileSync(path.join(ctl.dir, 'runs'), 'utf8'), 'started\n', 'the put-back run never starts');
    assert.deepEqual(leftover(ctl), []);
    assertGone('no process the expired control started keeps running', path.join(ctl.dir, 'pid'), path.join(ctl.dir, 'child'));
    assert.ok(ctlElapsed < 1500 * 10, `the verb ran ${ctlElapsed}ms against a configured control bound of 1500ms`);

    // The control bound's reader: a process run from the linked worktree reads `verification.failToPassControlMs` from the
    // main checkout, and the default, read in process, is 300 000 ms.
    const controlOf = (config) => {
      const b = scenario({ base: { 'src.txt': 'a\n' }, tip: { 'src.txt': 'b\n' } });
      writeOperatorConfig(b.repo, config);
      const r = spawnSync(process.execPath, ['-e', "console.log(require(process.argv[1]).failToPassControlMs(process.cwd()))", path.resolve(__dirname, '../plugin/lib/fail-to-pass.js')], { cwd: b.tree, encoding: 'utf8', timeout: 20000, killSignal: 'SIGKILL' });
      assertSpawnDecided(r, 'control bound reader');
      return { ms: Number(r.stdout.trim()), err: r.stderr };
    };
    assert.deepEqual(controlOf({ verification: { failToPassControlMs: 2000 } }), { ms: 2000, err: '' });
    assert.equal(failToPassControlMs(noConfig), 300000, 'the default control bound is 5 minutes');
    const help = spawnSync(process.execPath, [path.resolve(__dirname, '../plugin/scripts/scope.js'), 'help'], { encoding: 'utf8', timeout: 20000, killSignal: 'SIGKILL' });
    assertSpawnDecided(help, 'scope.js help');
    assert.match(help.stdout + help.stderr, /first run is bounded\s+at 300000 ms \(`verification\.failToPassControlMs` sets it/, 'the help names the control bound, its default, and the key');
  } finally {
    done();
    fs.rmSync(noConfig, { recursive: true, force: true });
  }
}
