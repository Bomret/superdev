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
    appendTrace(s.root, { slice: '01', kind: 'run', fields: ['path', 'pass', s.tipSha, 'clean', 'tests/t.sh,tests/other.sh', '40'] });
    let r = s.run(s.range);
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', r.stderr);
    assert.equal(runs(s), 1, 'the command ran once, with the files put back');
    assert.equal(s.runLines().length, 1, 'no control run line is written beside the reused one');
    assert.match(r.stderr, /control reused/, 'the verb says it reused a run');

    // A second call over the same range reuses the control the first call wrote.
    s = scenario(files);
    s.run(s.range);
    assert.equal(runs(s), 2);
    assert.equal(s.run(s.range).stdout.trim(), 'fail-to-pass control=0,put-back=1');
    assert.equal(runs(s), 3, "the second call reuses the first call's control");

    // No reuse: a dirty tree, another commit, a failed run, a test file the run did not cover, a run line with no duration,
    // or a later failing run at the same tip.
    const misses = [
      ['a dirty tree', (t) => [['path', 'pass', t, 'dirty', 'tests/t.sh', '40']]],
      ['another commit', (t, b) => [['path', 'pass', b, 'clean', 'tests/t.sh', '40']]],
      ['a failed run', (t) => [['path', 'fail', t, 'clean', 'tests/t.sh', '40']]],
      ['an uncovered test file', (t) => [['path', 'pass', t, 'clean', 'tests/u.sh', '40']]],
      ['no duration', (t) => [['path', 'pass', t, 'clean', 'tests/t.sh']]],
      ['a later failing run', (t) => [['path', 'pass', t, 'clean', 'tests/t.sh', '40'], ['path', 'fail', t, 'clean', 'tests/t.sh', '40']]],
    ];
    for (const [label, lines] of misses) {
      s = scenario(files);
      for (const fields of lines(s.tipSha, s.baseSha)) appendTrace(s.root, { slice: '01', kind: 'run', fields });
      r = s.run(s.range);
      assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', `${label}: ${r.stderr}`);
      assert.equal(runs(s), 2, `${label}: the control runs`);
    }
  } finally {
    done();
  }
}
