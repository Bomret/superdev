'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `test` verb, the run line it records: status, kind, duration, and path set
// (ADR 0127, INV-0117, ADR 0139). Split by case group so the concurrent runner packs the slow suites.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { testVerbFixture, scopePath } = require('./scope-setup');

const { S, verif, sh, bash, verb, lines, reset, traceFile, end } = testVerbFixture();
try {
  // A failing suite piped into tail: the command's own status is recorded, once, on the slice at the tree's commit.
  verif('echo hello && exit 3', 'echo FOCUSED {paths}');
  let sha = sh(S, ['rev-parse', 'HEAD']);
  let r = bash(`node ${scopePath} test full | tail -1`);
  assert.equal(r.stdout.trim(), 'hello', 'the command output streams through');
  assert.deepEqual(lines(), [`03 main run full fail ${sha} clean - 3`], 'one run line with the real outcome, whatever the pipe');
  assert.equal(verb(['full']).status, 3, 'the verb exits with the command status');
  reset();
  verif('echo ok', 'echo FOCUSED {paths}');
  assert.equal(verb(['full']).status, 0);
  assert.match(lines()[0], /^03 main run full pass [0-9a-f]{40} clean - ok$/, 'a passing run records pass');
  // A configured command whose last path part is a reading command's name is a test run (INV-0129).
  reset();
  fs.mkdirSync(path.join(S, 'script'));
  fs.writeFileSync(path.join(S, 'script', 'test'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  verif('script/test', 'script/test {paths}');
  assert.equal(verb(['--', 'script/test']).status, 0, 'a configured script/test is not refused');
  assert.match(lines()[0] || '', /^03 main run full pass [0-9a-f]{40} clean - -$/, 'a configured script/test records a full run');

  // whole runs the configured whole-repo command; focused substitutes shell-quoted paths, and with none runs full.
  reset();
  verif('echo FULLRAN', 'echo FOCUSED {paths}', 'echo WHOLERAN');
  assert.equal(verb(['whole']).stdout.trim(), 'WHOLERAN');
  assert.match(lines()[0], / run whole pass /);
  fs.writeFileSync(path.join(S, 'a b.ts'), ''); // a path holding a space names an existing file (ADR 0217)
  r = verb(['focused', 'a b.ts', 'c.ts']);
  assert.equal(r.stdout.trim(), 'FOCUSED a b.ts c.ts', 'both paths substitute for {paths}');
  assert.match(lines()[1], / run focused pass /);
  // The run line ends with the command's arguments after the duration: the words the shell ran, one encoded set.
  assert.match(lines()[1], / FOCUSED,a\\x20b\.ts,c\.ts$/, 'a focused run records the arguments it ran with, a path holding a space escaped');
  assert.notEqual(lines()[0].split(' ').pop(), lines()[1].split(' ').pop(), 'runs that differ only in arguments read differently');
  assert.equal(verb(['focused', "it's.ts"]).stdout.trim(), "FOCUSED it's.ts", 'a path is shell-quoted');
  r = verb(['focused']);
  assert.equal(r.stdout.trim(), 'FULLRAN', 'no path runs the full command');
  assert.match(lines()[3], / run full pass /, 'and records full');
  assert.match(lines()[3], / - FULLRAN$/, 'a full run records no path set');

  // The drift-check command with and without `--selftest` are recorded as test runs whose lines differ in the arguments field.
  reset();
  verif('node scripts/drift-check.js', 'echo FOCUSED {paths}');
  fs.mkdirSync(path.join(S, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(S, 'scripts', 'drift-check.js'), '');
  assert.equal(verb(['--', 'node', 'scripts/drift-check.js']).status, 0, 'drift-check is a configured test run');
  assert.equal(verb(['--', 'node', 'scripts/drift-check.js', '--selftest']).status, 0, 'drift-check --selftest is a test run');
  {
    const [plain, selftest] = lines().map((l) => l.split(' '));
    assert.equal(plain[2] + selftest[2], 'runrun', 'both are run lines');
    assert.deepEqual([plain.pop(), selftest.pop()], ['scripts/drift-check.js', 'scripts/drift-check.js,%2D-selftest'], 'and differ in the arguments field');
  }

  // A run line records its duration in whole milliseconds as its last field (ADR 0182). The command sleeps, so the
  // duration is at least the sleep it ran; no ceiling is asserted (root AGENTS.md, ADR 0086).
  {
    const { readTrace } = require('../plugin/lib/trace-log.js');
    reset();
    verif('sleep 0.3');
    assert.equal(verb(['full']).status, 0);
    const e = readTrace(fs.readFileSync(traceFile, 'utf8')).filter((x) => x.kind === 'run').pop();
    assert.match(e.fields[5], /^\d+$/, 'the duration is a whole number of milliseconds');
    assert.ok(Number(e.fields[5]) >= 300, `the duration covers the command's own sleep: ${e.fields[5]} ms`);
    verif('echo FULLRAN', 'echo FOCUSED {paths}', 'echo WHOLERAN');
  }

  // A focused run records its path set, and the trace reader returns it whole for any path (ADR 0175).
  {
    const { readTrace, decodePaths } = require('../plugin/lib/trace-log.js');
    const lastRun = () => readTrace(fs.readFileSync(traceFile, 'utf8')).filter((e) => e.kind === 'run').pop();
    // The encoding's round trips for every kind of path are in-process, in scope-trace.test.js; one spawn shows the verb writes it.
    const set = ['x,y.ts', '-lead.ts', '100%.ts'];
    reset();
    assert.equal(verb(['focused', ...set]).status, 0);
    const e = lastRun();
    assert.equal(e.fields[0], 'focused');
    assert.deepEqual(decodePaths(e.fields[4]), set, 'the set reads back whole');
    reset();
    verb(['full']);
    assert.deepEqual(decodePaths(lastRun().fields[4]), [], 'a full run holds no path set');
    // An empty path argument is refused before anything runs, so it never reads as an absent or empty-member set.
    for (const bad of [[''], ['a', '']]) {
      reset();
      const r = verb(['focused', ...bad]);
      assert.notEqual(r.status, 0, `an empty path is refused: ${JSON.stringify(bad)}`);
      assert.match(r.stderr, /empty path/, 'the refusal names the empty path');
      assert.equal(lines().length, 0, 'nothing runs and no run line is written');
    }
  }
} finally {
  end();
}
