'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `fail-to-pass` verb: the control run it takes from the run trace in place of running
// one (ADR 0215). Every scenario writes only inside the fixture's own temporary directory (INV-0154).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { f2pFixture, verif, scopePath } = require('./scope-setup');

const { appendTrace } = require(scopePath);


{
  const { probe, CMD, scenario, done } = f2pFixture();
  try {
    const files = {
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD, '\n## Prepare command\n\n`none`\n') },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'grep -q b src.txt\n' },
    };
    const runs = (s) => (fs.existsSync(s.log) ? fs.readFileSync(s.log, 'utf8').split('\n').filter(Boolean).length : 0);

    // A passing run at the tip on a clean tree that covered every test file the range adds or modifies, with its duration,
    // is the control: the verb runs the command once, with the files put back, and writes no control run line of its own.
    let s = scenario(files);
    appendTrace(s.root, { slice: '01', kind: 'run', fields: ['path', 'pass', s.tipSha, 'clean', 'tests/t.sh,tests/other.sh', '40', CMD, '.'] });
    let r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', r.stderr);
    assert.equal(runs(s), 1, 'the command ran once, with the files put back');
    assert.equal(s.runLines().length, 1, 'no control run line is written beside the reused one');
    assert.match(r.stderr, /control reused/, 'the verb says it reused a run');

    // A recorded name is one file however it is spelled: `./` first, or absolute inside the tree (INV-0139).
    for (const spell of ['./tests/t.sh', (sc) => path.join(fs.realpathSync(sc.tree), 'tests', 't.sh')]) {
      s = scenario(files);
      appendTrace(s.root, { slice: '01', kind: 'run', fields: ['path', 'pass', s.tipSha, 'clean', typeof spell === 'function' ? spell(s) : spell, '40', CMD, '.'] });
      r = s.run(s.range);
      assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', r.stderr);
      assert.equal(runs(s), 1, `${typeof spell === 'function' ? 'an absolute' : 'a ./'} spelling is reused`);
    }

    // A second call over the same range reuses the control the first call wrote.
    s = scenario(files);
    s.run(s.range);
    assert.equal(runs(s), 2);
    assert.equal(s.run(s.range).stdout.trim(), 'fail-to-pass control=0,put-back=1');
    assert.equal(runs(s), 3, "the second call reuses the first call's control");

    // No reuse: a dirty tree, another commit, a failed run, a test file the run did not cover, a run line with no duration,
    // or a later failing run at the same tip.
    const misses = [
      ['a dirty tree', (t) => [['path', 'pass', t, 'dirty', 'tests/t.sh', '40', CMD, '.']]],
      ['another commit', (t, b) => [['path', 'pass', b, 'clean', 'tests/t.sh', '40', CMD, '.']]],
      ['a failed run', (t) => [['path', 'fail', t, 'clean', 'tests/t.sh', '40', CMD, '.']]],
      ['an uncovered test file', (t) => [['path', 'pass', t, 'clean', 'tests/u.sh', '40', CMD, '.']]],
      ['no duration', (t) => [['path', 'pass', t, 'clean', 'tests/t.sh']]],
      ['another command', (t) => [['path', 'pass', t, 'clean', 'tests/t.sh', '40', 'sh tests/t.sh --only one', '.']]],
      ['no command', (t) => [['path', 'pass', t, 'clean', 'tests/t.sh', '40']]],
      ['a later failing run', (t) => [['path', 'pass', t, 'clean', 'tests/t.sh', '40', CMD, '.'], ['path', 'fail', t, 'clean', 'tests/t.sh', '40', CMD, '.']]],
      ['no directory field', (t) => [['path', 'pass', t, 'clean', 'tests/t.sh', '40', CMD]]],
      ['a subdirectory run', (t) => [['path', 'pass', t, 'clean', 'tests/t.sh', '40', CMD, 'tests']]],
      ['a run from outside the tree', (t) => [['path', 'pass', t, 'clean', 'tests/t.sh', '40', CMD, '..']]],
      ['an absolute directory', (t) => [['path', 'pass', t, 'clean', 'tests/t.sh', '40', CMD, '/tmp']]],
      ['an empty directory marker', (t) => [['path', 'pass', t, 'clean', 'tests/t.sh', '40', CMD, '-']]],
      ['a name outside the tree', (t) => [['path', 'pass', t, 'clean', '../tests/t.sh', '40', CMD, '.']]],
      ['an absolute name outside the tree', (t) => [['path', 'pass', t, 'clean', '/elsewhere/tests/t.sh', '40', CMD, '.']]],
    ];
    for (const [label, lines] of misses) {
      s = scenario(files);
      for (const fields of lines(s.tipSha, s.baseSha)) appendTrace(s.root, { slice: '01', kind: 'run', fields });
      r = s.run(s.range);
      assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', `${label}: ${r.stderr}`);
      assert.equal(runs(s), 2, `${label}: the control runs`);
    }

    // A test file whose name holds a space and a comma is recorded by the control and matched exactly on the next call.
    const odd = 'tests/a b,c.sh';
    const oddCmd = `sh '${odd}'`;
    const oddFiles = { base: files.base, tip: { 'src.txt': 'b\n', [odd]: probe + 'grep -q b src.txt\n' } };
    s = scenario({ ...oddFiles, cmd: oddCmd });
    assert.equal(s.run(s.range).stdout.trim(), 'fail-to-pass control=0,put-back=1', 'the odd name runs');
    const { readTrace, decodePaths, untraceField } = require('../plugin/lib/trace-log.js');
    const rec = readTrace(fs.readFileSync(path.join(s.root, 'trace.log'), 'utf8')).filter((e) => e.kind === 'run').pop();
    assert.deepEqual(decodePaths(rec.fields[4]), [odd], 'the control records the name exactly');
    assert.equal(untraceField(rec.fields[6]), oddCmd, 'and its command as given');
    assert.equal(s.run(s.range).stdout.trim(), 'fail-to-pass control=0,put-back=1');
    assert.equal(runs(s), 3, 'the recorded control is reused by exact name');
  } finally {
    done();
  }
}
