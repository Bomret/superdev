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

const { D, S, verif, verb, lines, reset, traceFile, end } = testVerbFixture();
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
  fs.mkdirSync(path.join(free, 'tests'));
  fs.writeFileSync(path.join(free, 'tests', 'a.test.js'), 'process.exit(5);\n');
  r = verb(['path', 'tests/a.test.js', '--', 'node', 'tests/a.test.js'], { cwd: free });
  assert.equal(r.status, 5, 'outside a run tree the command runs from the cwd and its status passes through');
  // A run tree's own run records from the cwd, whichever subdirectory it stands in.
  reset();
  fs.mkdirSync(path.join(S, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(S, 'tests', 'cd.test.js'), 'process.exit(0);\n');
  r = verb(['path', 'tests/cd.test.js', '--', 'node tests/cd.test.js'], { cwd: S });
  assert.equal(r.status, 0, r.stderr);
  assert.match(lines()[0] || '', / run path pass [0-9a-f]{40} \w+ tests\/cd\.test\.js node\\x20tests\/cd\.test\.js$/, 'a run in a run tree records its run');
  reset();
  r = verb(['path', 'cd.test.js', '--', 'node cd.test.js'], { cwd: path.join(S, 'tests') });
  assert.equal(r.status, 0, r.stderr);
  assert.match(lines()[0] || '', / run path pass [0-9a-f]{40} \w+ cd\.test\.js node\\x20cd\.test\.js$/, 'a run from a subdirectory of the tree records its run, with the files as typed');
  fs.rmSync(path.join(S, 'tests', 'cd.test.js'));
  // The command runs from the cwd as given: a run outside every run tree records nothing, wherever the verb stands.
  reset();
  r = verb(['path', 'tests/a.test.js', '--', 'node tests/a.test.js'], { cwd: free });
  assert.equal(r.status, 5, r.stderr);
  assert.deepEqual(lines(), [], 'and records nothing');
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
