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

  // `test path <file>... -- <command>` runs the command as given and records one path run (ADR 0225).
  reset();
  let r = verb(['path', 'services/x/tests/a.bats', '--', 'bats', 'services/x/tests/a.bats']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(lines()[0], /^03 main run path pass [0-9a-f]{40} clean services\/x\/tests\/a\.bats bats\\x20services\/x\/tests\/a\.bats$/, 'a path run records its file and its command');
  reset();
  r = verb(['path', 'services/x/tests/a.bats', '--', 'echo hi; exit 3']);
  assert.equal(r.status, 3, 'a failing command exits with its own status');
  assert.match(lines()[0], / run path fail /, 'and records fail');

  // No file, no `--`, or no command is refused and runs nothing; the old form names `test path`.
  reset();
  for (const argv of [['path', '--', 'echo', 'RAN'], ['path', 'a.bats', 'echo', 'RAN'], ['path', 'a.bats', '--'], ['path'], ['path', '--']]) {
    r = verb(argv);
    assert.notEqual(r.status, 0, argv.join(' ') + ' is refused');
    assert.ok(!r.stdout.includes('RAN'), 'and nothing runs');
  }
  r = verb(['--', 'node', 'x.js']);
  assert.notEqual(r.status, 0, 'files-less `test --` is refused');
  assert.match(r.stderr, /test path <file>… -- <command>/, 'the refusal names the new form');
  assert.deepEqual(lines(), [], 'and nothing is recorded');

  // A command `sh` cannot start exits 127, naming the failure, and records nothing.
  reset();
  r = verb(['full'], { env: { PATH: '' } });
  assert.equal(r.status, 127, 'a missing sh exits 127');
  assert.match(r.stderr, /test: cannot run sh: /, 'and says so');
  assert.deepEqual(lines(), [], 'and records nothing');

  // A run line that cannot be written says so and leaves the command's own exit status.
  reset();
  const traceDir = path.join(root, 'trace.log');
  fs.mkdirSync(traceDir);
  try {
    r = verb(['full']);
    assert.equal(r.status, 0, 'the command passed, so the verb exits 0');
    assert.match(r.stderr, /the run line could not be written to the run trace/, 'the failed write is named');
    assert.match(r.stdout, /FULLRAN/, 'and the command ran');
  } finally {
    fs.rmdirSync(traceDir);
  }

  // No option sets outcome, kind, slice, or tree state.
  reset();
  for (const argv of [['--outcome', 'pass', 'full'], ['full', '--kind', 'whole'], ['--slice', '01', 'full'], ['bogus']]) {
    assert.notEqual(verb(argv).status, 0, argv.join(' ') + ' is refused');
  }
  assert.deepEqual(lines(), []);
  const usage = require('../plugin/lib/usage.js').usage().split('\n').filter((l) => /^ {2}test\b/.test(l)).join('\n');
  assert.ok(usage, 'usage lists the verb');
  assert.ok(!/--(outcome|kind|slice|tree|status|root)/.test(usage), 'its usage names no option that sets a run field');

  // A focused argument holding several whitespace-joined paths is refused before anything runs: the command would read it
  // as one path, select nothing, and pass. An argument with whitespace that names an existing file is one path.
  reset();
  r = verb(['focused', 'AGENTS.md services/x/tests/a.bats ']);
  assert.notEqual(r.status, 0, 'a whitespace-joined path list is refused');
  assert.match(r.stderr, /test focused: the argument .* holds whitespace and names no file/, 'the refusal names the cause');
  assert.ok(!r.stdout.includes('FOCUSED'), 'and nothing runs');
  r = verb(['focused', 'a.bats\nb.bats']);
  assert.notEqual(r.status, 0, 'a newline-joined path list is refused');
  assert.deepEqual(lines(), [], 'and nothing is recorded');
  fs.writeFileSync(path.join(S, 'has space.md'), 'x');
  r = verb(['focused', 'has space.md']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /FOCUSED has space\.md/, 'an existing file with a space in its name runs');
  fs.rmSync(path.join(S, 'has space.md'));

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
