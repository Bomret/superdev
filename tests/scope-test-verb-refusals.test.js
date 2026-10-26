'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `test` verb, what it refuses: the free-command form, run-field options, and an
// unconfigured kind (ADR 0127, INV-0117, ADR 0139).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { testVerbFixture } = require('./scope-setup');

const { D, root, S, verif, sh, verb, lines, reset, end } = testVerbFixture();
try {
  verif('echo FULLRAN', 'echo FOCUSED {paths}', 'echo WHOLERAN');

  // The free-command form runs only a classified test run.
  reset();
  let r = verb(['--', 'echo', 'hi']);
  assert.notEqual(r.status, 0, 'a non-test command is refused');
  assert.ok(!r.stdout.includes('hi'), 'and nothing runs');
  assert.deepEqual(lines(), [], 'and nothing is recorded');
  r = verb(['--', 'command', '-pv', 'bats', 'services/x/tests/a.bats']);
  assert.notEqual(r.status, 0, 'a `command -v` lookup of a test run is refused');
  assert.deepEqual(lines(), [], 'and records nothing');
  r = verb(['--', 'bats', 'services/x/tests/a.bats']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(lines()[0], /^03 main run path pass [0-9a-f]{40} clean services\/x\/tests\/a\.bats$/, 'a path run records its file');
  reset();
  r = verb(['--', 'bats services/x/tests/a.bats | cat']);
  assert.match(lines()[0], / run path unknown /, 'a status the command shape hides records unknown');

  // No option sets outcome, kind, slice, or tree state.
  reset();
  for (const argv of [['--outcome', 'pass', 'full'], ['full', '--kind', 'whole'], ['--slice', '01', 'full'], ['bogus']]) {
    assert.notEqual(verb(argv).status, 0, argv.join(' ') + ' is refused');
  }
  assert.deepEqual(lines(), []);
  const usage = verb(['--help']).stdout.split('\n').filter((l) => /^ {2}test\b/.test(l)).join('\n');
  assert.ok(usage, 'usage lists the verb');
  assert.ok(!/--(outcome|kind|slice|tree|status|root)/.test(usage), 'its usage names no option that sets a run field');

  // An unconfigured kind is refused, naming the missing command.
  const root2 = path.join(D, '.superdev', 'scopes', 'bare');
  const S2 = path.join(root2, 'slicetrees', '01');
  fs.mkdirSync(S2, { recursive: true });
  fs.copyFileSync(path.join(root, 'ledger.md'), path.join(root2, 'ledger.md'));
  sh(S2, ['init', '-q']);
  r = verb(['full'], { cwd: S2 });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no full command/, 'the missing command is named');
  verif('echo ok', 'echo f', '');
  r = verb(['whole']);
  assert.match(r.stderr, /no whole command/, 'a missing whole command is named');
  assert.equal(fs.existsSync(path.join(root2, 'trace.log')), false);
} finally {
  end();
}
