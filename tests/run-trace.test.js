'use strict';

// Suite for plugin/hooks/run-trace.js (ADR 0117): the stdin-to-line contract of the hook. Edit attribution and the Bash calls that add no line call the exported
// `record` in-process; the spawned hook covers exit 0, empty stderr, and empty stdout.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { inProgressSlices } = require('../plugin/scripts/scope.js');
const { tmp, ledger, A, B, S3, trace, reset, run, spawnOut, edit, bash, cleanup } = require('./run-trace-setup');

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
assert.ok(!fs.existsSync(path.join(A, 'trace.log')) && !fs.existsSync(path.join(B, 'trace.log')));

// A Bash call infers nothing (ADR 0225): a write through a redirect, `sed -i`, `cp`, `tee`, or `git apply` adds no line,
// and a test command run directly adds none either, on every hook event a Bash call can fire.
reset();
fs.writeFileSync(path.join(tmp, 'a.txt'), 'x');
const ver = path.join(S3, 'docs', 'agents', 'verification.md');
fs.writeFileSync(ver, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test\n```\n');
for (const command of [
  `echo x > ${S3}/src/h.js`,
  `sed -i 's/a/b/' ${S3}/tests/s.test.js`,
  `cp ${tmp}/a.txt ${S3}/src/b.js`,
  `cd ${S3}/src && echo y | tee c.js`,
  `git -C ${S3} apply p.patch`,
  `git -C ${S3} restore -- src/x.js`,
  `git -C ${S3} checkout HEAD~1 -- src/x.js`,
  'bun run test',
]) {
  for (const hook_event_name of ['PreToolUse', 'PostToolUse', 'PostToolUseFailure']) {
    run({ hook_event_name, tool_name: 'Bash', tool_use_id: 'b1', tool_input: { command }, cwd: S3 });
  }
  bash(command, path.join(S3, 'src'));
}
fs.rmSync(ver);
assert.ok(!fs.existsSync(path.join(A, 'trace.log')) && !fs.existsSync(path.join(B, 'trace.log')), 'a Bash call adds no trace line');

// hooks.json registers run-trace.js on no Bash matcher, and no shipped file names a module the hook dropped.
{
  const hooks = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8')).hooks;
  for (const [ev, groups] of Object.entries(hooks)) {
    for (const g of groups) {
      if (g.matcher && g.matcher.split('|').includes('Bash')) {
        assert.ok(!g.hooks.some((h) => h.command.includes('hooks/run-trace.js')), `${ev} on Bash does not run run-trace.js`);
      }
    }
  }
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const gone = ['bash', 'writes'].join('-') + '|' + ['start', 'stash'].join('-');
  for (const f of walk(path.join(__dirname, '..', 'plugin')).filter((p) => /\.(js|json)$/.test(p))) {
    assert.ok(!new RegExp(`${gone}`).test(fs.readFileSync(f, 'utf8')), `${path.relative(path.join(__dirname, '..'), f)} requires no deleted module`);
  }
}

// The stdin-to-line contract through the spawned hook: an edit line, and no output; a Bash call beside it adds none.
{
  reset();
  assert.equal(spawnOut({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(S3, 'tests', 'sp.test.js') }, cwd: tmp }), '');
  assert.equal(spawnOut({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'bun run test' }, cwd: S3 }), '', 'a Bash call prints nothing');
  assert.deepEqual(trace(A).map((l) => l[2] + ' ' + l[3]), ['edit test']);
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

// Reading a large trace stays linear: the trace has no cap and every event re-reads it. The ceiling is
// relative to the same run's own baseline through timePair (ADR 0086, ADR 0149): 100 times the lines cost
// about 100 times when linear and about 10000 times when quadratic, so the 2000x ceiling falsifies only the latter.
{
  const { timePair } = require('./linear-time');
  const { readTrace } = require('../plugin/scripts/scope.js');
  const line = '2026-01-01T00:00:00Z 02 implementer run test abc123 pass\n';
  const [base, big] = timePair(readTrace, line.repeat(500), line.repeat(50000), 2000);
  assert.ok(big < base * 2000, `reading a trace of 50000 lines stays linear: 500 lines took ${base} ns, 50000 took ${big} ns`);
}

cleanup();
