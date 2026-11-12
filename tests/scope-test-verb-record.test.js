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

const { D, S, verif, sh, bash, verb, lines, reset, traceFile, end } = testVerbFixture();
try {
  // A failing suite piped into tail: the command's own status is recorded, once, on the slice at the tree's commit.
  verif('echo hello && exit 3', 'echo FOCUSED {paths}');
  let sha = sh(S, ['rev-parse', 'HEAD']);
  let r = bash(`node ${scopePath} test full | tail -1`);
  assert.equal(r.stdout.trim(), 'hello', 'the command output streams through');
  assert.deepEqual(lines(), [`03 main run full fail ${sha} clean - echo\\x20hello\\x20&&\\x20exit\\x203 .`], 'one run line with the real outcome, whatever the pipe');
  assert.equal(verb(['full']).status, 3, 'the verb exits with the command status');
  reset();
  verif('echo ok', 'echo FOCUSED {paths}');
  assert.equal(verb(['full']).status, 0);
  assert.match(lines()[0], /^03 main run full pass [0-9a-f]{40} clean - echo\\x20ok \.$/, 'a passing run records pass');
  // A test file named with a space and a comma is recorded and read back exactly; the command is recorded as typed.
  reset();
  verif('echo ok', 'echo FOCUSED {paths}');
  {
    const { readTrace, decodePaths, untraceField } = require('../plugin/lib/trace-log.js');
    const odd = 'a b,c.test.js';
    fs.writeFileSync(path.join(S, odd), '');
    const cmd = `cat '${odd}' | wc -c`;
    assert.equal(verb(['path', odd, 'x-%.js', '--', cmd]).status, 0);
    const e = readTrace(fs.readFileSync(traceFile, 'utf8')).filter((x) => x.kind === 'run').pop();
    assert.equal(e.fields[0], 'path');
    assert.deepEqual(decodePaths(e.fields[4]), [odd, 'x-%.js'], 'the files read back exactly');
    assert.equal(untraceField(e.fields[6]), cmd, 'the command reads back as typed');
    assert.equal(e.fields[7], '.', 'a path run from the tree root records the root');
    fs.rmSync(path.join(S, odd));
  }

  // whole runs the configured whole-repo command; focused substitutes shell-quoted paths, and with none runs full.
  reset();
  verif('echo FULLRAN', 'echo FOCUSED {paths}', 'echo WHOLERAN');
  assert.equal(verb(['whole']).stdout.trim(), 'WHOLERAN');
  assert.match(lines()[0], / run whole pass /);
  fs.writeFileSync(path.join(S, 'a b.ts'), ''); // a path holding a space names an existing file (ADR 0217)
  r = verb(['focused', 'a b.ts', 'c.ts']);
  assert.equal(r.stdout.trim(), 'FOCUSED a b.ts c.ts', 'both paths substitute for {paths}');
  assert.match(lines()[1], / run focused pass /);
  // The run line ends with the command as run after the duration, escaped as a trace field.
  assert.match(lines()[1], / echo\\x20FOCUSED\\x20'a\\x20b\.ts'\\x20c\.ts \.$/, 'a focused run records the command it ran, a path holding a space escaped');
  assert.notEqual(lines()[0].split(' ').slice(-2)[0], lines()[1].split(' ').slice(-2)[0], 'runs that differ only in arguments read differently');
  assert.equal(verb(['focused', "it's.ts"]).stdout.trim(), "FOCUSED it's.ts", 'a path is shell-quoted');
  r = verb(['focused']);
  assert.equal(r.stdout.trim(), 'FULLRAN', 'no path runs the full command');
  assert.match(lines()[3], / run full pass /, 'and records full');
  assert.match(lines()[3], / - echo\\x20FULLRAN \.$/, 'a full run records no path set');
  // A direct run whose command is the full command's text is still a path run: the kind comes from the verb, never the text.
  assert.equal(verb(['path', 'a.js', '--', 'echo FULLRAN']).status, 0);
  assert.match(lines()[4], / run path pass .* echo\\x20FULLRAN \.$/, 'a path run of the full command text records kind path');

  // Two path runs over the same file that differ in the command differ in the command field.
  reset();
  assert.equal(verb(['path', 'a.js', '--', 'true']).status, 0);
  assert.equal(verb(['path', 'a.js', '--', 'true', '--only']).status, 0);
  {
    const [plain, only] = lines().map((l) => l.split(' '));
    assert.deepEqual([plain.at(-2), only.at(-2)], ['true', "true\\x20--only"], 'and differ in the command field');
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

  // A run line ends with the directory its command ran in, relative to the tree root, one value for every spelling of it.
  {
    const { readTrace } = require('../plugin/lib/trace-log.js');
    const lastDir = () => readTrace(fs.readFileSync(traceFile, 'utf8')).filter((x) => x.kind === 'run').pop().fields[7];
    const sub = path.join(S, 'pkg', 'inner');
    fs.mkdirSync(sub, { recursive: true });
    reset();
    verif('true', 'true');
    // Each case starts from an empty trace, so the line read back is the one the call just wrote.
    const runDir = (argv, cwd) => {
      reset();
      assert.equal(verb(argv, { cwd }).status, 0);
      assert.equal(lines().length, 1, 'the call wrote one run line');
      return lastDir();
    };
    assert.equal(runDir(['path', 'a.js', '--', 'true'], sub), 'pkg/inner', 'a path run from a subdirectory records it, relative to the tree root');
    assert.equal(runDir(['path', 'a.js', '--', 'true'], sub + '/'), 'pkg/inner', 'a trailing slash records the same value');
    const link = path.join(D, 'link');
    fs.symlinkSync(S, link);
    assert.equal(runDir(['path', 'a.js', '--', 'true'], path.join(link, 'pkg', 'inner')), 'pkg/inner', 'a symlinked spelling of the tree records the same value');
    for (const argv of [['full'], ['focused', 'a.js'], ['whole']]) {
      verif('true', 'true', 'true');
      assert.equal(runDir(argv, sub), '.', `${argv[0]} runs at the tree root and records it`);
    }
    // A directory outside the tree records as itself made relative, which no reader takes as `.`.
    const { relDir } = require('../plugin/lib/run-tree.js');
    const outside = relDir(S, path.join(D, 'elsewhere'));
    assert.ok(outside.startsWith('..') && outside.endsWith('elsewhere'), `outside the tree: ${outside}`);
    assert.equal(relDir(S, path.join(S, '..') + '/'), '..', 'a parent directory is never the root');
    assert.equal(relDir(S, S + '/'), '.', 'the root with a trailing slash is the root');
    // The two sides spelled differently (ADR 0150): a symlinked tree, a symlinked directory, a trailing slash on either side,
    // and the tree reached through its unresolved and its resolved temp spelling all give one value.
    assert.equal(relDir(link, sub), 'pkg/inner', 'a symlinked tree against the real directory');
    assert.equal(relDir(S, path.join(link, 'pkg', 'inner') + '/'), 'pkg/inner', 'the real tree against a symlinked, slash-ended directory');
    assert.equal(relDir(S + '/', sub), 'pkg/inner', 'a trailing slash on the tree side');
    assert.equal(relDir(fs.realpathSync(S), sub), 'pkg/inner', 'the resolved tree against the unresolved directory');
    assert.equal(relDir(S, fs.realpathSync(sub)), 'pkg/inner', 'the unresolved tree against the resolved directory');
    if (process.platform === 'win32') {
      const msys = '/' + S[0].toLowerCase() + S.slice(2).replace(/\\/g, '/');
      assert.equal(relDir(S, msys + '/pkg/inner'), 'pkg/inner', 'an MSYS drive path records the same value');
      assert.equal(relDir(msys, sub), 'pkg/inner', 'an MSYS drive path as the tree');
    }
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
