'use strict';

// Suite for the Missing RED note of the run trace (ADR 0117): one note per test edit, on an implementation edit or a passing run.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { appendTrace } = require('../plugin/scripts/scope.js');
const { tmp, ledger, A, S3, trace, reset, runOut, run, edit, initS3, cleanup } = require('./run-trace-setup');
const vf = path.join(S3, 'docs', 'agents', 'verification.md');
initS3();

// Missing RED note (ADR 0117): one note per test edit, on an impl edit or a passing run, behavior slices only.
{
  fs.writeFileSync(vf, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test\n```\n');
  const editOut = (f, extra) => runOut(Object.assign({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(S3, f) }, cwd: tmp }, extra));
  const postOut = (command, extra) => runOut(Object.assign({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command }, cwd: S3 }, extra));
  const T = 'tests/n.test.js';
  fs.writeFileSync(path.join(S3, T), '');
  reset();
  assert.equal(editOut('src/first.js'), '', 'an impl edit before the first test edit gets no note');
  assert.equal(editOut(T), '', 'a test edit gets no note');
  const note = editOut('src/n.js');
  assert.ok(note.includes(T) && /failing test run/.test(note), 'the note names the test file and the missing failing run');
  assert.deepEqual(trace(A).filter((l) => l[2] === 'note'), [['03', 'main', 'note', T]], 'the note is recorded');
  assert.equal(editOut('src/n2.js'), '', 'one note per test edit');
  assert.equal(postOut('bun run test'), '', 'a later pass stays silent too');
  editOut(T);
  assert.ok(postOut('bun run test').includes(T), 'a passing run after a test edit with no failing run notes');
  assert.equal(runOut({ hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'bun run test' }, cwd: S3 }), '');
  reset();
  editOut(T);
  runOut({ hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'bun run test' }, cwd: S3 });
  assert.equal(editOut('src/n.js'), '', 'a failing run between the test edit and the impl edit');
  assert.equal(postOut('bun run test'), '');
  reset();
  editOut(T);
  postOut('node tests/n.test.js | tail -1');
  assert.ok(editOut('src/n.js').includes('Missing RED'), 'an unknown run is not a failing run');
  // A path with a space: the note line carries the edit line's field, and the text shows the real path.
  reset();
  const SP = 'tests/my file.test.js';
  editOut(SP);
  const spNote = editOut('src/n.js');
  assert.ok(spNote.includes(SP), 'the note text shows the real path');
  const spLines = trace(A);
  assert.equal(spLines.find((l) => l[2] === 'note')[3], spLines.find((l) => l[2] === 'edit' && l[3] === 'test')[4], 'the note field equals the edit field');
  // Two implementation targets in one command: one note.
  reset();
  editOut(T);
  const two = postOut(`touch ${S3}/src/a.js ${S3}/src/b.js; echo x | tee ${S3}/src/c.js ${S3}/src/d.js`);
  assert.equal(two.split('\n').length, 1, 'one note for two impl targets');
  assert.equal(trace(A).filter((l) => l[2] === 'note').length, 1);
  // A lone unknown run, then a pass: one note.
  reset();
  editOut(T);
  postOut('node tests/n.test.js | tail -1');
  assert.ok(postOut('bun run test').includes('Missing RED'));
  assert.equal(trace(A).filter((l) => l[2] === 'note').length, 1, 'one note across unknown then pass');
  // A `scope.js test` call records its own run (ADR 0127): the hook writes no run line, wrapped or piped, and still
  // sends the note after a foreground call that passed.
  const SCOPE = require.resolve('../plugin/scripts/scope.js');
  for (const c of [`node ${SCOPE} test full | tail -1`, `rtk node ${SCOPE} test focused a.ts`, `timeout 900 node ${SCOPE} test -- bun run test`, `cd ${S3} && node ${SCOPE} test full`, `FOO=1 node ${SCOPE} test whole 2>&1`, `node ${SCOPE} test -- node tests/n.test.js`, `node --no-warnings ${SCOPE} test -- node tests/n.test.js`,
    `node "${SCOPE}" test -- node tests/n.test.js`, `node '${SCOPE}' test full`, 'node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test -- node tests/n.test.js']) {
    reset();
    postOut(c);
    runOut({ hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: c }, cwd: S3 });
    assert.deepEqual(trace(A).filter((l) => l[2] === 'run'), [], 'the hook records no run for: ' + c);
  }
  reset();
  editOut(T);
  assert.ok(postOut(`node ${SCOPE} test full | tail -1`).includes('Missing RED'), 'a passing scope.js test run after a test edit notes');
  for (const q of [`node "${SCOPE}" test full`, 'node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test full']) {
    reset();
    editOut(T);
    assert.ok(postOut(q).includes('Missing RED'), 'the quoted invocation notes too: ' + q);
  }
  // The verb records in the tree of the command it classifies, and a Node option may take a value: the note follows both.
  for (const [c, cwd] of [[`node ${SCOPE} test -- 'cd ${S3} && node tests/n.test.js'`, tmp], [`node -r ${path.join(tmp, 'm.js')} ${SCOPE} test full`, S3]]) {
    reset();
    editOut(T);
    assert.ok(runOut({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: c }, cwd }).includes('Missing RED'), 'a passing call notes: ' + c);
    assert.deepEqual(trace(A).filter((l) => l[2] === 'run'), [], 'the hook records no run for: ' + c);
  }
  // Only the script word of `node` counts: a test file that merely has `scope.js test` among its arguments is a direct run, recorded.
  for (const c of [`node tests/n.test.js scope.js test`, `node tests/n.test.js --file plugin/scripts/scope.js test`, `node -e 'x' ${SCOPE} test`]) {
    reset();
    postOut(c);
    assert.equal(trace(A).filter((l) => l[2] === 'run').length, c.includes('-e') ? 0 : 1, 'one run line for: ' + c);
  }
  // A mixed command records the direct runs around the `scope.js test` call, never the call itself.
  for (const c of [`node tests/n.test.js && node ${SCOPE} test full`, `bun run test; node ${SCOPE} test full`, `node ${SCOPE} test full; node tests/n.test.js`]) {
    reset();
    editOut(T);
    assert.ok(postOut(c).includes('Missing RED'), 'the note still follows: ' + c);
    const runs = trace(A).filter((l) => l[2] === 'run');
    assert.equal(runs.length, 1, 'one run line, the direct run, for: ' + c);
    assert.equal(runs[0][4], 'unknown', 'a direct run beside another command reads unknown: ' + c);
  }
  reset();
  editOut(T);
  appendTrace(A, { slice: '03', kind: 'run', fields: ['full', 'fail', 'unknown', 'unknown', '-'] });
  assert.equal(postOut(`node ${SCOPE} test full`), '', 'a failing run line from the verb satisfies the RED step');
  // A fail-to-pass run is no test run (ADR 0134): a call of its verb records no run line, and its outcome line is no failing run.
  reset();
  editOut(T);
  assert.equal(postOut(`node ${SCOPE} fail-to-pass abc..def`), '', 'a fail-to-pass call after a test edit notes nothing');
  assert.deepEqual(trace(A).filter((l) => l[2] === 'run'), [], 'and records no run line');
  appendTrace(A, { slice: '03', kind: 'fail-to-pass', fields: ['abc..def', 'fail-to-pass', 'control=0,put-back=1'] });
  assert.ok(editOut('src/n.js').includes('Missing RED'), 'an outcome line does not satisfy the RED step');
  reset();
  editOut(T);
  const bg = `node ${SCOPE} test full`;
  assert.equal(runOut({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: bg, run_in_background: true }, cwd: S3 }), '', 'a background call has run nothing yet');
  postOut(`echo node ${SCOPE} test full`);
  assert.equal(trace(A).filter((l) => l[2] === 'note').length, 0, 'an echo of the command is no run');
  // One command that edits the test and then the implementation notes, and with an unwritable trace.log it notes
  // nothing: no line lands, so no note reaches the output either.
  reset();
  assert.ok(postOut(`echo x | tee ${T} src/n.js`).includes('Missing RED'), 'a test and an impl edit in one command note');
  reset();
  fs.mkdirSync(path.join(A, 'trace.log'));
  assert.equal(postOut(`echo x | tee ${T} src/n.js`), '', 'an unwritable trace.log gives no note');
  fs.rmSync(path.join(A, 'trace.log'), { recursive: true });
  // The same sequence on a mechanical slice, a docs slice, and a repository with no test command: no note.
  for (const type of ['mechanical', 'docs']) {
    fs.writeFileSync(path.join(A, 'ledger.md'), ledger([['02', 'todo'], ['03', 'in-progress']]).replace('| 03 | #03 | t | behavior', `| 03 | #03 | t | ${type}`));
    reset();
    editOut(T);
    assert.equal(editOut('src/n.js'), '', type);
    assert.equal(postOut('bun run test'), '', type);
  }
  // An edit in a slicetree the ledger has no row for: no note.
  fs.mkdirSync(path.join(A, 'slicetrees', '04', 'src'), { recursive: true });
  reset();
  runOut({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(A, 'slicetrees', '04', T) }, cwd: tmp });
  assert.equal(runOut({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(A, 'slicetrees', '04', 'src', 'n.js') }, cwd: tmp }), '', 'no ledger row, no note');
  fs.writeFileSync(path.join(A, 'ledger.md'), ledger([['02', 'todo'], ['03', 'in-progress']]));
  fs.rmSync(vf);
  reset();
  editOut(T);
  assert.equal(editOut('src/n.js'), '', 'no test command configured');

  // A slice title with an escaped pipe leaves the type cell where the ledger reader finds it: the note still fires.
  fs.writeFileSync(vf, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test\n```\n');
  fs.writeFileSync(path.join(A, 'ledger.md'), ledger([['02', 'todo'], ['03', 'in-progress']]).replace('| 03 | #03 | t |', '| 03 | #03 | a \\| b |'));
  reset();
  editOut(T);
  assert.ok(editOut('src/n.js').includes('Missing RED'), 'an escaped pipe in a title leaves the type readable');
  fs.writeFileSync(path.join(A, 'ledger.md'), ledger([['02', 'todo'], ['03', 'in-progress']]));
  fs.rmSync(vf);
}


cleanup();
