'use strict';

// Fixture repositories commit regardless of the maintainer's global git config (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `fail-to-pass` verb: the settlement from the run trace, with no test run (ADR 0251).
// Every scenario writes only inside the fixture's own temporary directory.

const assert = require('node:assert');
const { f2pFixture, verif, scopePath } = require('./scope-setup');

const { appendTrace } = require(scopePath);

const { probe, CMD, scenario, done } = f2pFixture();
try {
  const files = {
    base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD, '\n## Prepare command\n\n`none`\n') },
    tip: { 'src.txt': 'b\n', 'tests/t.sh': probe + 'grep -q b src.txt\n', 'tests/u.sh': probe + 'true\n' },
  };
  const T = 'tests/t.sh';
  const U = 'tests/u.sh';
  // A trace line is `[slice, kind, ...fields]`; the fixture's one in-progress slice, `01`, is the slice of its scopetree's own lines.
  const edit = (p, slice = '01') => [slice, 'edit', p.startsWith('tests/') ? 'test' : 'impl', p];
  // `TIP` stands for the scenario's tip commit, which `attempt` writes in its place.
  const run = (outcome, names, slice = '01', dir = '.', at = 'TIP', tree = 'clean') => [slice, 'run', 'path', outcome, at, tree, names, '40', CMD, dir];
  const sequence = (name) => [edit(name), run('fail', name), edit('src.txt'), run('pass', name)];
  // A passing run over a file counts only after the window's last edit outside the test paths, so a trace holding several
  // sequences ends in a run naming the files whose passing run an earlier sequence's later edit would otherwise outdate.
  const ledgerStart = ['01', 'ledger', 'slice', '01', 'in-progress'];
  const attempt = (lines) => {
    const s = scenario(files);
    for (const [slice, kind, ...fields] of lines) appendTrace(s.root, { slice, kind, fields: fields.map((f) => (f === 'TIP' ? s.tipSha : f)) });
    return { s, r: s.run(s.range) };
  };

  // The rule holds for every test file the range changes: no test runs, and one `fail-to-pass` line marks its settlement.
  let { s, r } = attempt([...sequence(T), ...sequence(U), run('pass', `${T},${U}`)]);
  assert.equal(r.stdout.trim(), 'fail-to-pass settled-from-trace', r.stderr);
  assert.deepEqual(s.ran(), [], 'no test ran');
  assert.equal(s.runLines().length, 5, 'the verb writes no control run line beside the five the trace holds');
  const outcomes = s.rawTrace().filter((l) => l.split(' ')[2] === 'fail-to-pass');
  assert.equal(outcomes.length, 1, 'one outcome line');
  assert.equal(outcomes[0].replace(/ \S+$/, ''), `01 main fail-to-pass ${s.range} fail-to-pass settled-from-trace`, 'the existing layout, the reason marking the settlement');

  // Names compare normalized (`./` first), and a passing run over several files names each of them.
  ({ s, r } = attempt([...sequence(U), edit(T), run('fail', './tests/t.sh'), edit('src.txt'), run('pass', `${U},${T}`)]));
  assert.equal(r.stdout.trim(), 'fail-to-pass settled-from-trace', r.stderr);
  assert.deepEqual(s.ran(), []);

  // Every variant that breaks the rule runs both runs as before, and none settles.
  // `withU` surrounds the lines under test with a settled sequence for U and a closing passing run over U.
  const withU = (lines) => [...sequence(U), ...lines, run('pass', U)];
  const dispatched = (agent) => ['01', 'dispatch', agent, 'tu9', 'x', 's1'];
  const variants = [
    ['a failing run naming two files', withU([edit(T), run('fail', `${T},${U}`), edit('src.txt'), run('pass', T)])],
    ['no non-test edit between red and green', withU([edit(T), run('fail', T), run('pass', T)])],
    ['only a test edit between red and green', withU([edit(T), run('fail', T), edit(U), run('pass', T)])],
    ['a test-file edit after the last red run', withU([run('fail', T), edit(T), edit('src.txt'), run('pass', T)])],
    ['a red run from an earlier slice', withU([edit(T), run('fail', T, '03'), edit('src.txt'), run('pass', T)])],
    ['a red run before the implementer was dispatched', [edit(T), run('fail', T), dispatched('superdev:implementer'), ...sequence(U), edit('src.txt'), run('pass', `${T},${U}`)]],
    ['a red run before the slice reviewer was dispatched', [edit(T), run('fail', T), dispatched('superdev:slice-reviewer'), ...sequence(U), edit('src.txt'), run('pass', `${T},${U}`)]],
    ['a red run before the slice was set in-progress', [edit(T), run('fail', T), ledgerStart, ...sequence(U), edit('src.txt'), run('pass', `${T},${U}`)]],
    ['no passing run after the non-test edit', withU([edit(T), run('fail', T), edit('src.txt')])],
    ['no failing run', withU([edit(T), edit('src.txt'), run('pass', T)])],
    ['a non-test edit after the passing run', [...sequence(U), ...sequence(T), edit('src.txt'), run('pass', U)]],
    ['a failing run made in a subdirectory', withU([edit(T), run('fail', T, '01', 'pkg'), edit('src.txt'), run('pass', T)])],
    ['a passing run made in a subdirectory', withU([edit(T), run('fail', T), edit('src.txt'), run('pass', T, '01', 'pkg')])],
    ['a passing run at another commit', withU([edit(T), run('fail', T), edit('src.txt'), run('pass', T, '01', '.', 'abc')])],
    ['a passing run on a dirty tree', withU([edit(T), run('fail', T), edit('src.txt'), run('pass', T, '01', '.', 'TIP', 'dirty')])],
    ['a second test file with no sequence', sequence(T)],
    ['no trace at all', []],
  ];
  for (const [label, lines] of variants) {
    ({ s, r } = attempt(lines));
    assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', `${label}: ${r.stderr}`);
    // A passing run at the tip that names every test file is a reusable control (ADR 0215), so the put-back alone runs then.
    assert.equal(s.ran().length, r.stderr.includes('control reused from the run trace') ? 1 : 2, `${label}: both runs ran, or the put-back beside a reused control`);
    assert.ok(!s.rawTrace().some((l) => l.includes('settled-from-trace')), `${label}: nothing settled`);
  }

  // The window is a fix cycle's: a dispatch-resume after the earlier red starts a new window.
  ({ s, r } = attempt([...sequence(T), ...sequence(U), ['01', 'dispatch-resume', 'tu1', 'ag1', 's1', 'sm1'], edit(U), run('pass', U)]));
  assert.equal(r.stdout.trim(), 'fail-to-pass control=0,put-back=1', r.stderr);
  assert.equal(s.ran().length, 2, 'a cycle that edits a test with no red of its own runs both runs');
} finally {
  done();
}
