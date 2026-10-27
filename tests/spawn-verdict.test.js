'use strict';

// Suite for tests/spawn-verdict.js. Tests the assertSpawnDecided helper that guards against
// misattributing kills (timeout, signal) and launch failures to behaviour verdicts. Each case is a
// real spawnSync call — not a hand-built object literal — so what's asserted is the helper's
// verdict on what Node actually returns, the premise a hand-built literal only restates. That
// premise mattered here: an earlier revision of this suite hand-built the launch-failure shape as
// `{status: null, signal: null, error}`, which is also what a real ENOENT produces, but is NOT what
// a real EPIPE produces (`{status: 0, signal: null, error}` — a completed run) — the literal
// couldn't tell the two apart, and the helper's guard shipped reading every `error` as "never
// started" until a real spawn exposed the gap.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertSpawnDecided, boundFromSamples, shq } = require('./spawn-verdict');

// boundFromSamples: a fast sample floors the bound at 1000 ms, and each sample runs once per index 0..2.
{
  const seen = [];
  assert.equal(boundFromSamples((i) => seen.push(i)), 1000, 'a fast sample gives the 1000 ms floor');
  assert.deepStrictEqual(seen, [0, 1, 2], 'the sample runs three times');
}

// boundFromSamples: a slower sample lifts the bound to ten times the slowest run, measured in this same run (INV-0009).
{
  let slowest = 0;
  const bound = boundFromSamples(() => {
    const started = Date.now();
    const r = spawnSync('sleep', ['0.2']);
    assertSpawnDecided(r, 'boundFromSamples slow sample');
    slowest = Math.max(slowest, Date.now() - started);
  });
  assert.ok(bound >= 10 * slowest, `bound ${bound} ms is at least ten times the slowest sample, ${slowest} ms`);
}

// shq: a `$`, a backtick, a quote, a backslash, and a space reach `sh -c` as written (triage #1380).
{
  const weird = "a$HOME`true`'\"b c\\d";
  const echoed = spawnSync('sh', ['-c', `printf %s ${shq(weird)}`], { encoding: 'utf8', timeout: 15000 });
  assertSpawnDecided(echoed, 'shq round trip');
  assert.equal(echoed.stdout, weird, 'shq passes the string through the shell as written');
}

// shq: a shell script written under a hostile TMPDIR, the shape tests/scope-containment.test.js writes its git
// wrappers and payloads in, touches the marker it names (triage #1380).
{
  const hostile = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-$HOME `true` \'q-'));
  try {
    const marker = path.join(hostile, 'marker');
    const script = path.join(hostile, 'payload.sh');
    fs.writeFileSync(script, `#!/bin/sh\ntouch ${shq(marker)}\n`, { mode: 0o755 });
    const r = spawnSync(script, [], { timeout: 15000 });
    assertSpawnDecided(r, 'hostile TMPDIR script');
    assert.ok(fs.existsSync(marker), 'the script touched the marker inside the hostile directory');
  } finally {
    fs.rmSync(hostile, { recursive: true, force: true });
  }
}

// timeout kill: a real child outliving a short timeout. Node sets both signal (killSignal) and
// error (ETIMEDOUT). The helper must check signal first, so it names the kill, not "never started".
{
  const result = spawnSync('sleep', ['5'], { timeout: 100, killSignal: 'SIGKILL' });
  try {
    assertSpawnDecided(result, 'timeout kill test');
    assert.fail('timeout kill should throw');
  } catch (e) {
    assert.match(e.message, /killed by its own bound/, 'timeout kill message names the kill, not a behaviour');
    assert.match(e.message, /SIGKILL/, 'timeout kill message includes the signal name');
  }
}

// launch failure: a real nonexistent binary. status and signal are both null — the OS never got as
// far as running a process to report a status or kill.
{
  const result = spawnSync('this-binary-does-not-exist-spawn-verdict-selftest');
  try {
    assertSpawnDecided(result, 'launch failure test');
    assert.fail('launch failure should throw');
  } catch (e) {
    assert.match(e.message, /spawn never started/, 'launch failure message says it never started');
  }
}

// genuine decided failure: a real child that exits non-zero. status is set, signal and error are
// both absent. The helper must not throw — the call site's own assertion then checks the status.
{
  const result = spawnSync(process.execPath, ['-e', 'process.exit(1)']);
  assert.doesNotThrow(() => {
    assertSpawnDecided(result, 'genuine failure test');
  }, 'genuine decided failure must not throw');
}

// EPIPE on a completed run: a real child that exits before draining a payload larger than the pipe
// buffer. status is set (the process ran to completion) and error is EPIPE — a process that
// reported a status started, whatever error also carries. Not producible with a literal one-liner
// spawn portably (it depends on a pipe actually backing up before the writer notices the reader is
// gone), so this drives it directly: pipe stdin into a child that exits immediately without ever
// reading it.
{
  const result = spawnSync(process.execPath, ['-e', 'process.exit(0)'], {
    input: Buffer.alloc(2 * 1024 * 1024, 'x'), // larger than the OS pipe buffer
  });
  // Confirms the case this block claims to exercise actually happened — without this, a platform
  // that stops racing the EPIPE here would leave `doesNotThrow` trivially true on a plain success,
  // and the EPIPE-but-decided shape would silently drop out of coverage.
  assert.ok(result.error, 'the write must have raced an EPIPE for this case to test what it claims');
  assert.equal(result.error.code, 'EPIPE', 'the raced error is EPIPE specifically');
  assert.doesNotThrow(() => {
    assertSpawnDecided(result, 'EPIPE-on-success test');
  }, 'a completed run must not throw, even when writing its input raced an EPIPE');
}

// fixture-git.js appends to a pre-existing GIT_CONFIG_* set instead of clobbering it, and a second
// require adds nothing.
{
  const probe = "require('./tests/fixture-git');require('./tests/fixture-git');" +
    "const e=process.env;console.log([e.GIT_CONFIG_COUNT,e.GIT_CONFIG_KEY_0,e.GIT_CONFIG_KEY_1,e.GIT_CONFIG_VALUE_1].join());";
  const r = spawnSync(process.execPath, ['-e', probe], {
    cwd: require('node:path').join(__dirname, '..'),
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, GIT_FIXTURE_GPGSIGN: '', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'safe.directory', GIT_CONFIG_VALUE_0: '*' },
  });
  assertSpawnDecided(r, 'fixture-git probe');
  assert.equal(r.stdout.trim(), '2,safe.directory,commit.gpgsign,false', 'fixture-git keeps KEY_0 and appends gpgsign at index 1');
}
