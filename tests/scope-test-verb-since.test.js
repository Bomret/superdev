'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
const { test, after } = require('node:test');
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `test focused --since <ref>` and `test path --since <ref> -- <command>`: the changed-path
// set taken from a ref, what each records, and what each refuses (ADR 0259, INV-0017).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { testVerbFixture } = require('./scope-setup');
const { readTrace, decodePaths } = require('../plugin/lib/trace-log.js');

after(() => {
  end();
});

const { S, verif, sh, verb, lines, reset, traceFile, end } = testVerbFixture();
const write = (rel, text = 'x') => {
  fs.mkdirSync(path.dirname(path.join(S, rel)), { recursive: true });
  fs.writeFileSync(path.join(S, rel), text);
};
const lastRun = () => readTrace(fs.readFileSync(traceFile, 'utf8')).filter((e) => e.kind === 'run').pop();
// The focused command prints each path it got on its own line, so the substituted set reads back exactly.
verif('echo FULLRAN', "printf 'F<%s>\\n' {paths}");
write('.gitignore', 'ignored.txt\n');
write('lib/old.js');
write('tests/old.test.js');
write('tests/gone.test.js');
sh(S, ['add', '-A']);
sh(S, ['commit', '-q', '-m', 'base']);
const base = sh(S, ['rev-parse', 'HEAD']);
// A committed change, a test file deleted, an uncommitted tracked change, an untracked file, and an ignored one.
write('lib/committed.js');
write('tests/new.test.js');
fs.rmSync(path.join(S, 'tests', 'gone.test.js'));
sh(S, ['add', '-A']);
sh(S, ['commit', '-q', '-m', 'slice']);
write('lib/old.js', 'changed');
write('lib/un tracked.js');
write('lib/ünï.js');
write('ignored.txt');
const want = ['lib/committed.js', 'lib/old.js', 'lib/un tracked.js', 'lib/ünï.js', 'tests/gone.test.js', 'tests/new.test.js'];
const got = (r) => r.stdout.split('\n').filter((l) => l.startsWith('F<')).map((l) => l.slice(2, -1)).sort();

let r, e;
test('`focused --since` runs over every changed path, committed, uncommitted, and untracked, and records them; ignored files stay out.', () => {
  reset();
  r = verb(['focused', '--since', base]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(got(r), want, 'the focused command gets every changed path, shell-quoted, and no ignored file');
  e = lastRun();
  assert.equal(e.fields[0], 'focused', 'a ref-given run records kind focused');
  assert.deepEqual(decodePaths(e.fields[4]).slice().sort(), want, 'and names the paths it resolved');
});

test('From a subdirectory, and with `diff.relative=true`, the set is the same tree-root-relative one.', () => {
  sh(S, ['config', 'diff.relative', 'true']);
  sh(S, ['config', 'core.quotePath', 'true']);
  reset();
  r = verb(['focused', '--since', base], { cwd: path.join(S, 'lib') });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(got(r), want, 'a subdirectory caller under diff.relative gets the same root-relative set');
  assert.deepEqual(decodePaths(lastRun().fields[4]).slice().sort(), want, 'and records it');
  sh(S, ['config', '--unset', 'diff.relative']);
  sh(S, ['config', '--unset', 'core.quotePath']);
});

test('`path --since` runs over the changed test-path files that exist, appended to the command, and records them.', () => {
  reset();
  r = verb(['path', '--since', base, '--', 'printf', 'P<%s>\\n']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.stdout.split('\n').filter(Boolean), ['P<tests/new.test.js>'], 'only the existing changed test file reaches the command');
  e = lastRun();
  assert.equal(e.fields[0], 'path');
  assert.deepEqual(decodePaths(e.fields[4]), ['tests/new.test.js'], 'the path run names the test file, not the deleted one');
  assert.equal(e.fields[7], '.', 'from the tree root');
  // From a subdirectory the command gets the file as the cwd reaches it, and the run records that spelling and the directory.
  reset();
  r = verb(['path', '--since', base, '--', 'printf', 'P<%s>\\n'], { cwd: path.join(S, 'lib') });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.stdout.split('\n').filter(Boolean), ['P<../tests/new.test.js>'], 'the path is reachable from the cwd');
  assert.equal(lastRun().fields[7], 'lib');
});

test('Each refusal exits nonzero with its own message, runs nothing, and records nothing.', () => {
  const refusals = [
    [['focused', '--since', base, 'lib/old.js'], /--since takes no paths/],
    [['path', '--since', base, 'tests/new.test.js', '--', 'echo', 'RAN'], /--since takes no paths/],
    [['focused', 'lib/old.js', '--since', base], /--since takes no paths/],
    [['path', 'tests/new.test.js', '--since', base, '--', 'echo', 'RAN'], /--since takes no paths/],
    [['focused', '--since'], /--since needs a ref/],
    [['path', '--since', '--', 'echo', 'RAN'], /--since needs a ref/],
    [['focused', '--since', '-x'], /starts with a dash/],
    [['focused', '--since', 'no-such-ref'], /cannot resolve/],
    [['focused', '--since', 'HEAD~5000'], /cannot resolve/],
  ];
  for (const [argv, msg] of refusals) {
    reset();
    r = verb(argv);
    assert.notEqual(r.status, 0, argv.join(' ') + ' is refused');
    assert.match(r.stderr, msg, argv.join(' ') + ': ' + r.stderr);
    assert.ok(!/FULLRAN|F<|RAN/.test(r.stdout), argv.join(' ') + ': nothing runs');
    assert.deepEqual(lines(), [], argv.join(' ') + ': nothing is recorded');
  }
  // An empty set is refused, never run as the full command; a set with no test file is refused for `path`.
  sh(S, ['add', '-A']);
  sh(S, ['commit', '-q', '-m', 'all']);
  const tip = sh(S, ['rev-parse', 'HEAD']);
  reset();
  r = verb(['focused', '--since', tip]);
  assert.notEqual(r.status, 0, 'an empty set is refused');
  assert.match(r.stderr, /no path changed since/);
  assert.ok(!r.stdout.includes('FULLRAN'), 'and never runs the full command');
  assert.deepEqual(lines(), []);
  write('lib/only-code.js');
  reset();
  r = verb(['path', '--since', tip, '--', 'echo', 'RAN']);
  assert.notEqual(r.status, 0, 'a path set with no test file is refused');
  assert.match(r.stderr, /no test file changed since/);
  assert.ok(!r.stdout.includes('RAN'));
  assert.deepEqual(lines(), []);
});

test('The usage lists both forms.', () => {
  const usage = require('../plugin/lib/usage.js').usage();
  assert.match(usage, /test focused --since <ref>/);
  assert.match(usage, /test path --since <ref> -- <command>/);
});
