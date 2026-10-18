'use strict';

// Suite for plugin/hooks/run-trace.js (ADR 0117): the stdin-to-line contract of the hook. Edit attribution and Bash writes call the exported
// `record` in-process; the spawned hook covers exit 0, empty stderr, and the Missing RED output.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { inProgressSlices } = require('../plugin/scripts/scope.js');
const { tmp, ledger, A, B, S3, trace, reset, run, spawnOut, edit, bash, hookPath, cleanup } = require('./run-trace-setup');

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

// The stdin-to-line contract through the spawned hook: an edit line, a run line, and the Missing RED output.
{
  reset();
  const ver = path.join(S3, 'docs', 'agents', 'verification.md');
  fs.writeFileSync(ver, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test\n```\n');
  assert.equal(spawnOut({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(S3, 'tests', 'sp.test.js') }, cwd: tmp }), '');
  const out = JSON.parse(spawnOut({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'bun run test' }, cwd: S3 }));
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.ok(out.hookSpecificOutput.additionalContext.includes('Missing RED'), 'a passing run after a test edit prints the note as hook output');
  assert.deepEqual(trace(A).map((l) => l[2] + ' ' + l[3]), ['edit test', 'run full', 'note tests/sp.test.js']);
  fs.rmSync(ver);
}

// Failure modes: malformed stdin, unreadable ledger, no verification.md. Exit 0, no output, no line.
reset();
assert.equal(spawnOut(null, 'not json'), '');
assert.equal(spawnOut(null, ''), '');
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

// Requiring a module of lib/ the hook loads prints nothing, and records nothing (INV-0068).
for (const name of ['bash-command', 'bash-writes', 'dispatch', 'dispatch-lines', 'run-tree', 'start-stash', 'test-runs', 'verdicts']) {
  const r = cp.spawnSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(__dirname, '..', 'plugin', 'lib', name + '.js'))})`], { input: JSON.stringify({ tool_input: { file_path: path.join(S3, 'q.js') } }), encoding: 'utf8', timeout: 5000 });
  assertSpawnDecided(r, `requiring ${name}.js`);
  assert.deepStrictEqual([r.status, r.stdout, r.stderr], [0, '', ''], `requiring ${name}.js prints nothing`);
  assert.equal(trace(A).length, 1, `requiring ${name}.js records nothing`);
}

// Reading a large trace stays linear: the trace has no cap and every event re-reads it. The ceiling is
// relative to the same run's own baseline through timePair (ADR 0086, ADR 0149): 100 times the lines cost
// about 100 times when linear and about 10000 times when quadratic, so the 2000x ceiling falsifies only the latter.
{
  const { timePair } = require('./linear-time');
  const { readTrace } = require('../plugin/scripts/scope.js');
  const line = '2026-01-01T00:00:00Z 02 implementer run test abc123 pass\n';
  const [base, big] = timePair(readTrace, line.repeat(500), line.repeat(50000));
  assert.ok(big < base * 2000, `reading a trace of 50000 lines stays linear: 500 lines took ${base} ns, 50000 took ${big} ns`);
}

cleanup();
