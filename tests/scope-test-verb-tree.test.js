'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `test` verb, where it runs: a signal-ended command, a failed trace write, outside
// every run tree, a `cd` into or out of a tree, and the tree root (ADR 0127, INV-0117, ADR 0139).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { testVerbFixture } = require('./scope-setup');

const { D, S, bin, sh, verif, verb, lines, reset, traceFile, end } = testVerbFixture();
try {
  // A command ended by a signal writes no line.
  reset();
  verif('kill -TERM $$', 'true');
  assert.notEqual(verb(['full']).status, 0);
  assert.deepEqual(lines(), [], 'a signal-ended command records nothing');

  // A failed trace write prints a note on stderr and leaves the exit status alone.
  verif('exit 7', 'true');
  reset();
  fs.mkdirSync(traceFile);
  let r = verb(['full']);
  assert.equal(r.status, 7, 'the exit status is unchanged');
  assert.match(r.stderr, /trace/, 'a note names the failed write');
  fs.rmdirSync(traceFile);

  // Outside every run tree the verb runs the command, passes the status through, and writes nothing.
  const free = path.join(D, 'free');
  fs.mkdirSync(path.join(free, 'docs', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(free, 'docs', 'agents', 'verification.md'), '# V\n\n```sh\necho FREE; exit 4\n```\n');
  r = verb(['full'], { cwd: free });
  assert.equal(r.status, 4);
  assert.equal(r.stdout.trim(), 'FREE');
  r = verb(['--', 'echo', 'hi'], { cwd: free });
  assert.notEqual(r.status, 0, 'outside a run tree a non-test command is refused too');
  assert.ok(!r.stdout.includes('hi'), 'and nothing runs');
  fs.mkdirSync(path.join(free, 'tests'));
  fs.writeFileSync(path.join(free, 'tests', 'a.test.js'), 'process.exit(5);\n');
  r = verb(['--', 'node', 'tests/a.test.js'], { cwd: free });
  assert.equal(r.status, 5, 'a classified test command runs outside a run tree, and passes the status through');
  // A test path naming no file is no test run, as the hook reads it: the verb refuses it and runs nothing.
  r = verb(['--', 'node', 'tests/missing.test.js'], { cwd: free });
  assert.match(r.stderr, /not a test run/, 'a test path naming no file is refused');
  // A runner script named `test`, given as a path, is a test run: only the bare builtin `test` reads as no run.
  fs.writeFileSync(path.join(free, 'test'), '#!/bin/sh\nexit 6\n', { mode: 0o755 });
  r = verb(['--', './test', 'tests/a.test.js'], { cwd: free });
  assert.equal(r.status, 6, 'a runner script named test runs and passes its status through');
  fs.rmSync(path.join(free, 'test'));
  // A command that cd's into a run tree is that tree's run, wherever the verb stands: it records there.
  reset();
  fs.mkdirSync(path.join(S, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(S, 'tests', 'cd.test.js'), 'process.exit(0);\n');
  r = verb(['--', `cd ${S} && node tests/cd.test.js`], { cwd: free });
  assert.equal(r.status, 0);
  assert.match(lines()[0] || '', / run path pass [0-9a-f]{40} \w+ tests\/cd\.test\.js tests\/cd\.test\.js$/, 'a cd into a run tree records its run');
  fs.rmSync(path.join(S, 'tests', 'cd.test.js'));
  // A command that cd's out of every run tree is an out-of-tree run, wherever the verb stands: it runs and records nothing.
  reset();
  r = verb(['--', `cd ${free} && node tests/a.test.js`]);
  assert.equal(r.status, 5, 'a cd out of the run tree runs the test command and passes the status through: ' + r.stderr);
  assert.deepEqual(lines(), [], 'and records nothing');
  // A `cd` into a subdirectory classifies against that directory's repository top, where the commands are configured.
  const other = path.join(D, 'other');
  fs.mkdirSync(path.join(other, 'docs', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(other, 'sub'));
  fs.writeFileSync(path.join(other, 'docs', 'agents', 'verification.md'), '# V\n\n```sh\nchecker\n```\n');
  fs.writeFileSync(path.join(bin, 'checker'), '#!/bin/sh\nexit 6\n', { mode: 0o755 });
  sh(other, ['init', '-q']);
  r = verb(['--', 'cd sub && checker'], { cwd: other });
  assert.equal(r.status, 6, 'outside every run tree, a cd into a subdirectory runs the configured command: ' + r.stderr);
  reset();
  r = verb(['--', `cd ${path.join(other, 'sub')} && checker`]);
  assert.equal(r.status, 6, 'a cd into another repository\'s subdirectory runs the configured command: ' + r.stderr);
  assert.deepEqual(lines(), [], 'and records nothing');
  reset();
  assert.deepEqual(lines(), [], 'nothing is written');
  fs.rmSync(path.join(free, 'tests'), { recursive: true });
  assert.deepEqual(fs.readdirSync(free).sort(), ['docs'], 'and no file appears');

  // A configured kind runs at the tree root, from any subdirectory of the tree.
  reset();
  fs.writeFileSync(path.join(S, 'rootfile.txt'), 'ROOTMARK\n');
  fs.mkdirSync(path.join(S, 'sub'), { recursive: true });
  verif('cat rootfile.txt', 'cat rootfile.txt');
  r = verb(['full'], { cwd: path.join(S, 'sub') });
  assert.equal(r.stdout.trim(), 'ROOTMARK', 'a root-relative command runs from a subdirectory');
  assert.equal(r.status, 0);
} finally {
  end();
}
