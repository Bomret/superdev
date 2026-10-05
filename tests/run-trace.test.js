'use strict';

// Suite for plugin/hooks/run-trace.js (ADR 0117): stdin to trace line, through the spawned hook.

require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const { assertSpawnDecided } = require('./spawn-verdict');
const { inProgressSlices } = require('../plugin/scripts/scope.js');

const hookPath = require.resolve('../plugin/hooks/run-trace.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'run-trace-'));
const ledger = (rows) =>
  '# Ledger — demo\n\n**Stage:** implementing\n\n| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n' +
  rows.map(([id, st]) => `| ${id} | #${id} | t | behavior | — | ${st} | — |`).join('\n') + '\n';

// A repository with run roots `a` and `b`. Run `a` has slicetrees 02 and 03 and a scopetree.
function runRoot(name, rows) {
  const root = path.join(tmp, '.superdev', 'scopes', name);
  fs.mkdirSync(path.join(root, 'slicetrees', '03', 'docs', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(root, 'slicetrees', '03', 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'slicetrees', '02', 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scopetree'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ledger.md'), ledger(rows));
  return root;
}
const A = runRoot('a', [['02', 'todo'], ['03', 'in-progress']]);
const B = runRoot('b', [['01', 'in-progress'], ['02', 'in-progress']]);
const trace = (root) => {
  try { return fs.readFileSync(path.join(root, 'trace.log'), 'utf8').split('\n').filter(Boolean).map((l) => l.split(' ').slice(1)); } catch { return []; }
};
const reset = () => [A, B].forEach((r) => fs.rmSync(path.join(r, 'trace.log'), { force: true }));

// Runs the hook; returns its stdout, which holds only a Missing RED note (a test that expects none asserts '').
function runOut(input, raw) {
  const r = cp.spawnSync(process.execPath, [hookPath], { input: raw !== undefined ? raw : JSON.stringify(input), encoding: 'utf8', timeout: 10000 });
  assertSpawnDecided(r, 'run-trace.js');
  assert.equal(r.status, 0, 'always exits 0');
  assert.equal(r.stderr, '', 'prints nothing to stderr');
  return r.stdout;
}
function run(input, raw) {
  assert.equal(runOut(input, raw), '', 'prints nothing');
}
const edit = (file_path, extra) => run(Object.assign({ tool_name: 'Edit', tool_input: { file_path }, cwd: tmp }, extra));
const bash = (command, cwd) => run({ tool_name: 'Bash', tool_input: { command }, cwd: cwd || tmp });
const S3 = path.join(A, 'slicetrees', '03');

// inProgressSlices: ids at in-progress, table order.
assert.deepEqual(inProgressSlices(ledger([['01', 'merged'], ['02', 'in-progress'], ['03', 'in-progress']])), ['02', '03']);
assert.deepEqual(inProgressSlices('no table'), []);

// Slicetree edit: impl and test, attributed to the slice.
edit(path.join(S3, 'src', 'x.js'));
edit(path.join(S3, 'tests', 'x.test.js'));
assert.deepEqual(trace(A), [['03', 'main', 'edit', 'impl', 'src/x.js'], ['03', 'main', 'edit', 'test', 'tests/x.test.js']]);

// Agent id is named; NotebookEdit is recorded.
reset();
run({ tool_name: 'NotebookEdit', tool_input: { notebook_path: path.join(S3, 'n.ipynb') }, cwd: tmp, agent_id: 'ag1' });
assert.deepEqual(trace(A), [['03', 'ag1', 'edit', 'impl', 'n.ipynb']]);

// Scopetree: the one in-progress slice; none or two give `scope`.
reset();
edit(path.join(A, 'scopetree', 'f.js'));
assert.deepEqual(trace(A), [['03', 'main', 'edit', 'impl', 'f.js']]);
edit(path.join(B, 'scopetree', 'f.js'));
assert.deepEqual(trace(B), [['scope', 'main', 'edit', 'impl', 'f.js']], 'two in-progress rows record under scope');
fs.writeFileSync(path.join(A, 'ledger.md'), ledger([['02', 'todo'], ['03', 'merged']]));
reset();
edit(path.join(A, 'scopetree', 'f.js'));
assert.deepEqual(trace(A), [['scope', 'main', 'edit', 'impl', 'f.js']], 'no in-progress row records under scope');
fs.writeFileSync(path.join(A, 'ledger.md'), ledger([['02', 'todo'], ['03', 'in-progress']]));

// Two run roots: an edit lands only in its own run's trace.
reset();
edit(path.join(B, 'slicetrees', '02', 'x.js'));
assert.equal(trace(A).length, 0);
assert.deepEqual(trace(B), [['02', 'main', 'edit', 'impl', 'x.js']]);

// Outside every run root: nothing written, no trace.log created.
reset();
edit(path.join(tmp, 'elsewhere.js'));
edit(path.join(A, 'notes.md'));
bash('echo x > ' + path.join(tmp, 'plain.txt'));
assert.ok(!fs.existsSync(path.join(A, 'trace.log')) && !fs.existsSync(path.join(B, 'trace.log')));

// Shell writes: heredoc redirect, sed -i, cp into a slicetree.
reset();
bash(`cat > ${S3}/src/h.js <<'EOF'\n> ${S3}/src/inside-body.js\nEOF`);
bash(`sed -i 's/a/b/' ${S3}/tests/s.test.js`);
fs.writeFileSync(path.join(tmp, 'a.txt'), 'x');
bash(`cp ${tmp}/a.txt ${S3}/src/b.js`);
bash(`cp ${tmp}/a.txt ${S3}/src`);
bash(`cd ${S3}/src && echo y | tee c.js`);
bash(`git -C ${S3} apply p.patch`, tmp);
bash(`echo x >> y.js`, path.join(S3, 'src'));
assert.deepEqual(trace(A), [
  ['03', 'main', 'edit', 'impl', 'src/h.js'],
  ['03', 'main', 'edit', 'test', 'tests/s.test.js'],
  ['03', 'main', 'edit', 'impl', 'src/b.js'],
  ['03', 'main', 'edit', 'impl', 'src/a.txt'],
  ['03', 'main', 'edit', 'impl', 'src/c.js'],
  ['03', 'main', 'edit', 'impl', 'src/y.js'],
]);
reset();
fs.writeFileSync(path.join(tmp, 'p.patch'), '--- a/src/p.js\n+++ b/src/p.js\n@@\n');
bash(`git -C ${S3} apply ${tmp}/p.patch`);
assert.deepEqual(trace(A), [['03', 'main', 'edit', 'impl', 'src/p.js']]);

// Quoted `>` is data, not a redirect; a quoted redirect target still records.
reset();
const S3src = path.join(S3, 'src');
bash('git commit -m "fix a -> b thing"', S3src);
bash('echo "x > y"', S3src);
bash('grep "a>b" f', S3src);
assert.equal(trace(A).length, 0, 'a quoted > records no edit');
bash('echo x > "a b.txt"', S3src);
assert.deepEqual(trace(A), [['03', 'main', 'edit', 'impl', 'src/a\\x20b.txt']]);

// sed -i operand parsing: script is never a target.
for (const cmd of ['sed -i "" s/a/b/ f.js', "sed -i '' s/a/b/ f.js", 'sed -e s/a/b/ -i f.js', 'sed --in-place s/a/b/ f.js', 'sed -i.bak s/a/b/ f.js', 'sed --in-place=.bak s/a/b/ f.js', 'sed -i -e s/a/b/ f.js', 'sed -i -f s.sed f.js', 'sed --expression=s/a/b/ -i f.js']) {
  reset();
  bash(cmd, S3src);
  const got = trace(A).map((l) => l[4]);
  assert.deepEqual(got, ['src/f.js'], cmd);
}

// The command word must be in command position: arguments named like a command record nothing.
for (const cmd of ['npm install lodash', 'echo cp a b', 'grep sed x']) {
  reset();
  bash(cmd, S3src);
  assert.equal(trace(A).length, 0, cmd);
}
for (const cmd of ['FOO=1 cp a b', 'sudo cp a b', 'env FOO=1 time cp a b', 'git mv a b']) {
  reset();
  bash(cmd, S3src);
  assert.deepEqual(trace(A).map((l) => l[4]), ['src/b'], cmd);
}

// cp -t DIR sources
reset();
fs.mkdirSync(path.join(S3, 'src', 'd'), { recursive: true });
bash('cp -t d a.js b.js', S3src);
bash('mv --target-directory=d c.js', S3src);
assert.deepEqual(trace(A).map((l) => l[4]), ['src/d/a.js', 'src/d/b.js', 'src/d/c.js']);

// git mv must be the subcommand, not a later word: `git add mv x` records nothing.
reset();
bash('git add mv x', S3src);
assert.equal(trace(A).length, 0, 'git add mv x records nothing (mv is not subcommand)');
fs.mkdirSync(path.join(S3, 'src', 'sub'), { recursive: true });
bash('git -C sub mv ../d/c.js w.js', S3src);
assert.deepEqual(trace(A).map((l) => l[4]), ['src/sub/w.js'], 'git -C <dir> mv still records');

// Test paths: defaults without a section; a configured section overrides; a malformed entry is skipped.
reset();
const vf = path.join(S3, 'docs', 'agents', 'verification.md');
for (const f of ['a.spec.ts', 'pkg/__tests__/z.js', 'test_x.py', 'lib/x_test.go', 'spec/y.rb', 'src/main.js']) edit(path.join(S3, f));
assert.deepEqual(trace(A).map((l) => l[3]), ['test', 'test', 'test', 'test', 'test', 'impl'], 'defaults');
fs.writeFileSync(vf, '# V\n\n## Test paths\n\n- `check/`\n- `bad entry with spaces`\n- `/abs/**`\n- `lib/**/*.t.js`\n- scripts/run.js\n\n## Other\n\n- `src/`\n');
reset();
for (const f of ['check/a.js', 'lib/q/r.t.js', 'scripts/run.js', 'tests/x.test.js', 'src/main.js', 'other/scripts/run.js']) edit(path.join(S3, f));
assert.deepEqual(trace(A).map((l) => l[3]), ['test', 'test', 'test', 'impl', 'impl', 'impl'], 'configured section overrides defaults, malformed entries skipped');
fs.writeFileSync(vf, '# V\n\n## Test paths\n\n- `bad entry`\n');
reset();
edit(path.join(S3, 'tests', 'x.test.js'));
assert.deepEqual(trace(A).map((l) => l[3]), ['test'], 'a section with no usable entry applies the defaults');
fs.rmSync(vf);

// Test runs, reverts, restores (ADR 0117). S3 becomes a git repository so the run line carries a real sha.
const git = (...a) => cp.execFileSync('git', ['-C', S3, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' }).trim();
fs.writeFileSync(vf, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test\n```\n');
git('init', '-q');
git('add', '-A');
git('commit', '-q', '-m', 'base');
const sha = git('rev-parse', 'HEAD');
const post = (command, extra) => run(Object.assign({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command }, cwd: S3 }, extra));
const fail = (command) => post(command, { hook_event_name: 'PostToolUseFailure' });
const tail = (rows) => rows.map((l) => l.slice(2).join(' '));

reset();
post('bun run test');
fail('bun run test');
post('GITEA_TOKEN=abc bun run test');
assert.deepEqual(tail(trace(A)), [`run full pass ${sha} clean -`, `run full fail ${sha} clean -`, `run full pass ${sha} clean -`], 'full command, both events; env value and command text never recorded');
assert.ok(!fs.readFileSync(path.join(A, 'trace.log'), 'utf8').includes('abc'));

reset();
post('node tests/x.test.js');
post('grep foo tests/x.test.js');
post('cat tests/x.test.js');
post('git diff tests/x.test.js');
post('bun run test:unit');
assert.deepEqual(tail(trace(A)), [`run path pass ${sha} clean tests/x.test.js`], 'a path run records; reads and a sibling command record nothing');

reset();
for (const c of ['node tests/x.test.js | tail -5', 'node tests/x.test.js || true', 'node tests/x.test.js; true']) post(c);
assert.deepEqual(trace(A).map((l) => l[4]), ['unknown', 'unknown', 'unknown'], 'an exit status that hides the test reads unknown');
reset();
post('set -o pipefail; node tests/x.test.js | tail -5');
fail('set -o pipefail; node tests/x.test.js | tail -5');
assert.deepEqual(trace(A).map((l) => l[4]), ['pass', 'fail'], 'pipefail keeps the real outcome');

reset();
for (const c of ['set -o pipefail; bun run test 2>&1 | tail -5; echo done', 'set -o pipefail; bun run test 2>&1 | tail -5 || true']) post(c);
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['unknown', 'unknown'], 'a command after the pipeline hides the test status');

// Under pipefail only a pass-through pipe stage (tail, cat) keeps the test's status; any other stage decides it.
reset();
for (const c of ['set -o pipefail; bun run test 2>&1 | grep FAIL', 'set -o pipefail; bun run test | false', 'set -o pipefail; bun run test | head -20', 'set -o pipefail; bun run test | cat | grep x', 'set -o pipefail; set +o pipefail; bun run test | tail -5']) fail(c);
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['unknown', 'unknown', 'unknown', 'unknown', 'unknown'], 'a pipe stage that can fail on its own hides the test status; +o pipefail turns it off');
reset();
for (const c of ['set -o pipefail; bun run test 2>&1 | tail -5', 'set -o pipefail; bun run test | cat | tail -5', 'set -euo pipefail; bun run test | tail -5', 'set +o pipefail; set -o pipefail; bun run test | tail -5', 'set -o pipefail; bun run test 2>&1 | tail -5\n', 'set -o pipefail; bun run test 2>&1 | tail -5;']) fail(c);
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['fail', 'fail', 'fail', 'fail', 'fail', 'fail'], 'tail and cat stages, option groups, the last pipefail sign, and trailing separators keep the real outcome');

reset();
fs.writeFileSync(path.join(S3, 'src', 'dirty.js'), 'x');
post('bun run test');
assert.equal(trace(A)[0][6], 'dirty');
fs.rmSync(path.join(S3, 'src', 'dirty.js'));

// A git call killed at its bound records unknown for its field.
{
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'git'), '#!/bin/sh\nsleep 5\n', { mode: 0o755 });
  reset();
  const input = { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'bun run test' }, cwd: S3 };
  const r = cp.spawnSync(process.execPath, [hookPath], { input: JSON.stringify(input), encoding: 'utf8', timeout: 10000, env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, RUN_TRACE_GIT_BOUND_MS: '200' } });
  assertSpawnDecided(r, 'run-trace.js with a stalled git');
  assert.deepEqual(tail(trace(A)), ['run full pass unknown unknown -'], 'a killed git call records unknown');
}

reset();
post('git restore --source=main -- src/x.js');
post('git restore -- src/x.js');
post('git checkout HEAD -- src/x.js');
post('git checkout main -- src/x.js');
post('git checkout feature');
fail('git restore --source=main -- src/y.js');
assert.deepEqual(trace(A).map((l) => l.slice(2).join(' ')), ['revert src/x.js', 'restore src/x.js', 'restore src/x.js', 'revert src/x.js']);

// The tree comes from the effective directory at each segment, the input cwd only as the fallback.
{
  const S2 = path.join(A, 'slicetrees', '02');
  const git2 = (...a) => cp.execFileSync('git', ['-C', S2, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(S2, 'src', 'm.js'), 'm');
  fs.mkdirSync(path.join(S2, 'docs', 'agents'), { recursive: true });
  fs.copyFileSync(vf, path.join(S2, 'docs', 'agents', 'verification.md'));
  git2('init', '-q');
  git2('add', '-A');
  git2('commit', '-q', '-m', 'base2');
  const sha2 = git2('rev-parse', 'HEAD');
  assert.notEqual(sha, sha2);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'run-trace-out-'));
  reset();
  bash(`cd ${S3} && bun run test`, outside);
  bash(`git -C ${S3} restore --source=main -- f`, outside);
  assert.deepEqual(trace(A).map((l) => l.join(' ')), [`03 main run full pass ${sha} clean -`, '03 main revert f']);
  reset();
  bash(`cd ${S2} && bun run test`, S3);
  assert.deepEqual(trace(A).map((l) => l.join(' ')), [`02 main run full pass ${sha2} clean -`], 'a cd into another tree records in that tree');
  fs.rmSync(outside, { recursive: true, force: true });
}

// A pass names the test only where the test is the command's sole command.
reset();
for (const c of ['true || bun run test', 'bun run test &', 'bun run test; echo done', 'npm run build && bun run test', 'cd src || bun run test']) post(c);
post('cd src && bun run test');
assert.deepEqual(trace(A).map((l) => l[4]), ['unknown', 'unknown', 'unknown', 'unknown', 'unknown', 'pass'], 'a pass outside the sole-command shape reads unknown');
reset();
fail('true || bun run test');
fail('bun run test &');
fail('cd src && bun run test');
assert.deepEqual(trace(A).map((l) => l[4]), ['unknown', 'unknown', 'fail']);

// A lone `&` separates commands; `&&`, `&>`, `2>&1`, `|&`, and a quoted `&` do not.
reset();
for (const c of ['bun run test & wait', 'bun run test & echo x']) post(c);
assert.deepEqual(trace(A).map((l) => l[4]), ['unknown', 'unknown'], 'a background test names no outcome');
reset();
for (const c of ['bun run test &> out.log', 'set -o pipefail; bun run test 2>&1 | tail -5', 'bun run test |& tail -5', 'echo "a & b" && bun run test']) post(c);
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['pass', 'pass', 'unknown', 'unknown']);
reset();
fail('bun run test & wait');
fail('bun run test &> out.log');
assert.deepEqual(trace(A).filter((l) => l[2] === 'run').map((l) => l[4]), ['unknown', 'fail']);

// A failed chain names fail only where the test is the command's failure.
reset();
fail('npm run build && bun run test');
fail('bun run test && echo done');
fail('cd src && bun run test');
fail('bun run test');
assert.deepEqual(trace(A).map((l) => l[4]), ['unknown', 'unknown', 'fail', 'fail']);

// `git restore --staged` touches only the index.
reset();
post('git restore --staged src/x.js');
post('git restore -S src/x.js');
post('git restore --staged --worktree src/x.js');
assert.deepEqual(trace(A).map((l) => l.join(' ')), ['03 main restore src/x.js']);

// A command that writes a file and runs a test records both events.
reset();
post('echo x > src/w.js && bun run test');
assert.deepEqual(trace(A).map((l) => l[2]), ['run', 'edit']);

// Focused and whole-repo commands classify by kind; the longest match wins.
fs.writeFileSync(vf, '# V\n\n```sh\nnx affected -t test\n```\n\n```sh\nnx test --fast\n```\n\n## Whole-repo command\n\n`nx run-many -t test`\n');
reset();
for (const c of ['nx affected -t test', 'nx test --fast', 'nx run-many -t test']) post(c);
assert.deepEqual(trace(A).map((l) => l[3]), ['full', 'focused', 'whole']);

// No verification.md: no full run, still a path run.
fs.rmSync(vf);
reset();
post('bun run test');
post('node tests/x.test.js');
assert.deepEqual(tail(trace(A)).map((l) => l.split(' ').slice(0, 2).join(' ')), ['run path']);

// Missing RED note (ADR 0117): one note per test edit, on an impl edit or a passing run, behavior slices only.
{
  fs.writeFileSync(vf, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test\n```\n');
  const editOut = (f, extra) => runOut(Object.assign({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(S3, f) }, cwd: tmp }, extra));
  const postOut = (command, extra) => runOut(Object.assign({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command }, cwd: S3 }, extra));
  const ctx = (out) => JSON.parse(out).hookSpecificOutput;
  const T = 'tests/n.test.js';
  reset();
  assert.equal(editOut('src/first.js'), '', 'an impl edit before the first test edit gets no note');
  assert.equal(editOut(T), '', 'a test edit gets no note');
  const note = ctx(editOut('src/n.js'));
  assert.equal(note.hookEventName, 'PostToolUse');
  assert.ok(note.additionalContext.includes(T) && /failing test run/.test(note.additionalContext), 'the note names the test file and the missing failing run');
  assert.deepEqual(trace(A).filter((l) => l[2] === 'note'), [['03', 'main', 'note', T]], 'the note is recorded');
  assert.equal(editOut('src/n2.js'), '', 'one note per test edit');
  assert.equal(postOut('bun run test'), '', 'a later pass stays silent too');
  editOut(T);
  assert.ok(ctx(postOut('bun run test')).additionalContext.includes(T), 'a passing run after a test edit with no failing run notes');
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
  const spNote = ctx(editOut('src/n.js')).additionalContext;
  assert.ok(spNote.includes(SP), 'the note text shows the real path');
  const spLines = trace(A);
  assert.equal(spLines.find((l) => l[2] === 'note')[3], spLines.find((l) => l[2] === 'edit' && l[3] === 'test')[4], 'the note field equals the edit field');
  // Two implementation targets in one command: one note.
  reset();
  editOut(T);
  const two = ctx(postOut(`touch ${S3}/src/a.js ${S3}/src/b.js; echo x | tee ${S3}/src/c.js ${S3}/src/d.js`)).additionalContext;
  assert.equal(two.split('\n').length, 1, 'one note for two impl targets');
  assert.equal(trace(A).filter((l) => l[2] === 'note').length, 1);
  // A lone unknown run, then a pass: one note.
  reset();
  editOut(T);
  postOut('node tests/n.test.js | tail -1');
  assert.ok(postOut('bun run test').includes('Missing RED'));
  assert.equal(trace(A).filter((l) => l[2] === 'note').length, 1, 'one note across unknown then pass');
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

// A test run in a background Bash call returns before the test ran: its outcome is unknown, never pass.
{
  const vf2 = path.join(S3, 'docs', 'agents', 'verification.md');
  fs.writeFileSync(vf2, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test\n```\n');
  reset();
  run({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'bun run test', run_in_background: true }, cwd: S3 });
  run({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'bun run test' }, cwd: S3 });
  assert.deepEqual(trace(A).map((l) => l[4]), ['unknown', 'pass'], 'only the foreground run records pass');
  fs.rmSync(vf2);
}

// Subagent dispatches: SubagentStart records `dispatch`, SubagentStop the matching `dispatch-end`.
{
  reset();
  const start = (prompt, id, type, description) => run({ hook_event_name: 'SubagentStart', agent_id: id, agent_type: type || 'superdev:implementer', prompt, description: description || 'build it', cwd: tmp });
  const stop = (id, type) => run({ hook_event_name: 'SubagentStop', agent_id: id, agent_type: type || 'superdev:implementer', cwd: tmp });
  start(`Work in ${A}/slicetrees/04 please`, 'i1', 'superdev:implementer', 'two words');
  assert.deepEqual(trace(A), [['04', 'main', 'dispatch', 'superdev:implementer', 'i1', 'two\\x20words']]);
  stop('i1');
  assert.deepEqual(trace(A)[1], ['04', 'main', 'dispatch-end', 'superdev:implementer', 'i1']);
  start(`Append to ${A}/reports/04/progress.md`, 'r1', 'superdev:slice-reviewer');
  assert.deepEqual(trace(A)[2].slice(0, 5), ['04', 'main', 'dispatch', 'superdev:slice-reviewer', 'r1']);
  start(`${A}/slicetrees/04 and ${A}/reports/04/progress.md`, 'r2');
  assert.equal(trace(A)[3][0], '04', 'the slicetree and report path of one slice agree');
  start(`${A}/slicetrees/04 and ${A}/slicetrees/05`, 'r3');
  assert.equal(trace(A)[4][0], 'scope', 'two slice ids in one run record under scope');
  assert.equal(trace(A).length, 5);
  start('no run root here', 'n1');
  start(`${A}/slicetrees/04 and ${B}/slicetrees/01`, 'n2');
  start(`${path.join(tmp, '.superdev', 'scopes', 'nope')}/slicetrees/01`, 'n3');
  stop('unknown');
  assert.equal(trace(A).length, 5);
  assert.equal(trace(B).length, 0, 'a dispatch naming no run root or two records nothing');
  stop('r2');
  assert.deepEqual(trace(A)[5], ['04', 'main', 'dispatch-end', 'superdev:implementer', 'r2']);
  start(`Work in ${A}/. and ${A}, then ${A}/slicetrees/04.`, 'p1');
  assert.equal(trace(A).filter((l) => l[2] === 'dispatch' && l[4] === 'p1').length, 1, 'trailing punctuation after a run root path still records the dispatch');
}

// SubagentStop from a controller whose cwd is a subdirectory of the main checkout or a worktree of it.
{
  const R = fs.mkdtempSync(path.join(tmp, 'repo-'));
  const rg = (...a) => cp.execFileSync('git', ['-C', R, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
  rg('init', '-q');
  fs.mkdirSync(path.join(R, 'plugin'));
  fs.writeFileSync(path.join(R, 'plugin', 'f'), 'x');
  const C = path.join(R, '.superdev', 'scopes', 'c');
  fs.mkdirSync(C, { recursive: true });
  fs.writeFileSync(path.join(C, 'ledger.md'), ledger([['07', 'in-progress']]));
  fs.writeFileSync(path.join(R, '.gitignore'), '.superdev\n');
  rg('add', '-A');
  rg('commit', '-q', '-m', 'base');
  const WT = path.join(tmp, 'wt-' + path.basename(R));
  rg('worktree', 'add', '-q', WT, '-b', 'wt');
  const hook = (ev, id, cwd, extra) => run(Object.assign({ hook_event_name: ev, agent_id: id, agent_type: 'superdev:implementer', description: 'd', cwd }, extra));
  const ends = () => trace(C).filter((l) => l[2] === 'dispatch-end');
  hook('SubagentStart', 'w1', tmp, { prompt: `${C}/slicetrees/07` });
  hook('SubagentStop', 'w1', path.join(R, 'plugin'));
  assert.deepEqual(ends().map((l) => l.slice(0, 2).concat(l[4])), [['07', 'main', 'w1']], 'a subdirectory cwd of the main checkout records the end');
  hook('SubagentStart', 'w2', tmp, { prompt: `${C}/slicetrees/07` });
  hook('SubagentStop', 'w2', WT);
  assert.equal(ends().length, 2, 'a worktree cwd records the end');
  assert.equal(ends()[1][4], 'w2');

  // Windows backslash paths record like the forward-slash form; a newline in the description stays on one line.
  hook('SubagentStart', 'w3', tmp, { prompt: `${C}/slicetrees/07`.replace(/\//g, '\\'), description: 'a\nb' });
  const d = fs.readFileSync(path.join(C, 'trace.log'), 'utf8').split('\n').filter((l) => l.includes(' w3 '));
  assert.equal(d.length, 1, 'one line for the dispatch');
  assert.ok(d[0].includes(' dispatch superdev:implementer w3 a'), 'backslash prompt records the dispatch');
  assert.ok(d[0].endsWith(' a\\nb'), 'newline escaped on one line');
}

// Failure modes: malformed stdin, unreadable ledger, no verification.md. Exit 0, no output, no line.
reset();
run(null, 'not json');
run(null, '');
run({ tool_name: 'Edit' });
fs.rmSync(path.join(A, 'ledger.md'));
edit(path.join(S3, 'x.js'));
edit(path.join(A, 'scopetree', 'x.js'));
assert.equal(trace(A).length, 0, 'an unreadable ledger records nothing');
fs.writeFileSync(path.join(A, 'ledger.md'), ledger([['03', 'in-progress']]));
edit(path.join(S3, 'x.js'));
assert.equal(trace(A).length, 1, 'a missing verification.md still records, with defaults');

// The Missing RED remedy (agents/implementer.md): stage, revert to <base>, restore from the index. The
// uncommitted implementation survives, and a file absent at <base> goes away and comes back.
{
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'run-trace-remedy-'));
  const g = (...a) => cp.execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
  g('init', '-q');
  fs.writeFileSync(path.join(repo, 'impl.js'), 'old');
  g('add', '-A');
  g('commit', '-q', '-m', 'base');
  fs.writeFileSync(path.join(repo, 'impl.js'), 'new work');
  fs.writeFileSync(path.join(repo, 'added.js'), 'brand new');
  g('add', 'impl.js', 'added.js');
  g('restore', '--worktree', '--source=HEAD', '--', 'impl.js', 'added.js');
  assert.equal(fs.readFileSync(path.join(repo, 'impl.js'), 'utf8'), 'old', 'the revert shows the base');
  assert.equal(fs.existsSync(path.join(repo, 'added.js')), false, 'a path absent at base is deleted');
  g('restore', '--', 'impl.js', 'added.js');
  assert.equal(fs.readFileSync(path.join(repo, 'impl.js'), 'utf8'), 'new work', 'the restore returns the uncommitted implementation');
  assert.equal(fs.readFileSync(path.join(repo, 'added.js'), 'utf8'), 'brand new', 'the restore returns the new file');
  fs.rmSync(repo, { recursive: true, force: true });
}

// Requiring the hook prints nothing and dispatches nothing (INV-0068).
{
  const r = cp.spawnSync(process.execPath, ['-e', `require(${JSON.stringify(hookPath)})`], { input: JSON.stringify({ tool_input: { file_path: path.join(S3, 'q.js') } }), encoding: 'utf8', timeout: 5000 });
  assertSpawnDecided(r, 'requiring run-trace.js');
  assert.equal(r.status, 0);
  assert.equal(r.stdout + r.stderr, '', 'requiring run-trace.js prints nothing');
  assert.equal(trace(A).length, 1, 'requiring run-trace.js records nothing');
}

// Reading a large trace stays linear: the trace has no cap and every event re-reads it. The ceiling is
// relative to the same run's own baseline, a small trace read as often as it takes to cover the same
// line count, so scheduler noise scales both sides alike (ADR 0086).
{
  const { readTrace } = require('../plugin/scripts/scope.js');
  const line = '2026-01-01T00:00:00Z 02 implementer run test abc123 pass\n';
  const small = line.repeat(500);
  const large = line.repeat(50000);
  const time = (fn) => { const t = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t); };
  readTrace(small);
  const baseline = time(() => { for (let i = 0; i < 100; i++) readTrace(small); });
  const big = time(() => readTrace(large));
  assert.ok(big < baseline * 20 + 5e7, 'reading a trace of 50000 lines costs a small multiple of reading the same lines in small traces');
}

fs.rmSync(tmp, { recursive: true, force: true });
