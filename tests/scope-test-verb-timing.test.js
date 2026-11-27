'use strict';

// Fixture repositories commit regardless of the maintainer's global git config.
const { test, after } = require('node:test');
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `test timing` kind: it runs the `## Timing command` span of `verification.md` from the
// tree root under a Test slot, passes the output through, exits with the command's own status, records a `timing` run line
// inside a run tree and nothing outside one, prints its own run time, and refuses an unconfigured command or any further
// argument before it takes a slot (ADR 0291, INV-0212, INV-0069).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { testVerbFixture } = require('./scope-setup');

const { D, root, S, sh, verb, lines, reset, end } = testVerbFixture();
after(() => end());

// `verification.md` with the given trailing text after a full and a focused fence, committed.
function config(tail) {
  fs.writeFileSync(path.join(S, 'docs', 'agents', 'verification.md'),
    '# V\n\n```sh\necho FULLRAN\n```\n\n```sh\necho FOCUSED {paths}\n```\n' + tail);
  sh(S, ['add', '-A']);
  sh(S, ['commit', '-q', '--allow-empty', '-m', 'v']);
  return sh(S, ['rev-parse', 'HEAD']);
}
const timing = (span) => `\n## Timing command\n\n\`${span}\`\n`;

let r;
test('`test timing` runs the timing command from the tree root, passes its output through, and exits with its status, red included.', () => {
  config(timing('pwd; echo TIMINGRAN; exit 4'));
  reset();
  fs.mkdirSync(path.join(S, 'sub'), { recursive: true });
  r = verb(['timing'], { cwd: path.join(S, 'sub') });
  assert.equal(r.status, 4, r.stderr);
  assert.match(r.stdout, /TIMINGRAN/, 'the output streams through');
  assert.equal(r.stdout.split('\n')[0], fs.realpathSync(S), 'the command runs from the tree root');
});

test('`test timing` with no `verification.md`, no `## Timing command` section, a section holding no span, or a span only inside a fence refuses naming `## Timing command` and starts nothing.', () => {
  const file = path.join(S, 'docs', 'agents', 'verification.md');
  for (const [label, tail] of [
    ['no section', ''],
    ['no span', '\n## Timing command\n\nThe suite has no timing command.\n'],
    ['fenced span', '\n## Timing command\n\n```sh\n`echo TIMINGRAN`\n```\n'],
    ['no file', null],
  ]) {
    if (tail === null) fs.rmSync(file); else config(tail);
    reset();
    r = verb(['timing']);
    assert.notEqual(r.status, 0, label);
    assert.match(r.stderr, /## Timing command/, label + ': the refusal names the section: ' + r.stderr);
    assert.ok(!r.stdout.includes('TIMINGRAN'), label + ': and nothing runs');
    assert.deepEqual(lines(), [], label + ': and nothing is recorded');
  }
  sh(S, ['checkout', '-q', '--', 'docs']);
});

test('`test timing extra` and `test timing --since HEAD` are refused, starting nothing.', () => {
  config(timing('echo TIMINGRAN'));
  reset();
  for (const argv of [['timing', 'extra'], ['timing', '--since', 'HEAD']]) {
    r = verb(argv);
    assert.notEqual(r.status, 0, argv.join(' '));
    assert.match(r.stderr, /test full\|whole\|timing/, argv.join(' ') + ': the refusal names the kind: ' + r.stderr);
    assert.ok(!r.stdout.includes('TIMINGRAN'), argv.join(' ') + ': and nothing runs');
  }
  assert.deepEqual(lines(), []);
});

// The `<ms>` of a `test: timing ran <ms> ms` stderr line, or null where the output holds none.
const ranMs = (stderr) => { const m = /^test: timing ran (\d+) ms$/m.exec(stderr); return m && Number(m[1]); };

test('Inside a run tree a `timing` run appends one run line of kind `timing`, and its stderr run-time line carries the line\'s own <ms>.', () => {
  const sha = config(timing('echo TIMINGRAN'));
  reset();
  r = verb(['timing']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(lines(), [`03 main run timing pass ${sha} clean - echo\\x20TIMINGRAN .`], 'one timing run line');
  const raw = fs.readFileSync(path.join(root, 'trace.log'), 'utf8').trim().split(' ');
  assert.equal(ranMs(r.stderr), Number(raw[raw.indexOf('run') + 6]), 'the stderr line and the run line carry the same <ms>: ' + r.stderr);
});

test('Outside every run tree a `timing` run appends nothing and still prints its run time.', () => {
  const P = path.join(D, 'plain');
  fs.mkdirSync(path.join(P, 'docs', 'agents'), { recursive: true });
  fs.copyFileSync(path.join(S, 'docs', 'agents', 'verification.md'), path.join(P, 'docs', 'agents', 'verification.md'));
  sh(P, ['init', '-q']);
  reset();
  r = verb(['timing'], { cwd: P });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /TIMINGRAN/);
  assert.notEqual(ranMs(r.stderr), null, 'the run time is printed: ' + r.stderr);
  assert.deepEqual(lines(), [], 'and nothing is recorded');
  assert.equal(fs.existsSync(path.join(P, '.superdev')), false, 'and no run root appears');
});

test('A signal-ended timing run and one whose `sh` cannot start print no run-time line; the other kinds print none either.', () => {
  config(timing('kill -TERM $$'));
  reset();
  r = verb(['timing']);
  assert.equal(r.status, 143, r.stderr);
  assert.equal(ranMs(r.stderr), null, 'a signal-ended run prints no run time: ' + r.stderr);
  r = verb(['timing'], { env: { PATH: '' } });
  assert.equal(r.status, 127, r.stderr);
  assert.equal(ranMs(r.stderr), null, 'a run that could not start prints no run time: ' + r.stderr);
  r = verb(['full']);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /ran \d+ ms/, 'the full kind prints no run-time line');
});

test('`scope.js test --help` names the timing kind.', () => {
  r = verb(['--help']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout + r.stderr, /test full\|whole\|timing/);
});
