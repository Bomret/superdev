'use strict';

// Suite for the review verdict lines of the run trace (ADR 0136, INV-0142, INV-0146). Calls `parseVerdict` and `parseFinalVerdict` of
// plugin/lib/verdicts.js and the hook's `record`.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { parseVerdict, parseFinalVerdict } = require('../plugin/lib/verdicts.js');
const { appendTrace } = require('../plugin/scripts/scope.js');
const { tmp, ledger, A, B, trace, reset, run, spawnOut, agentPre, agentPost, cleanup } = require('./run-trace-setup');

// Review verdicts (ADR 0136, INV-0142): a background slice-reviewer's report writes one `verdict` line
// carrying the review's tool_use_id, spec and quality verdicts, review cycle, and reviewed implementer.
{
  const PASS = 'Findings: none.\n\n### Verdict: specification ✅ | quality: approved';
  const FAIL = '- Critical: x\n\n### Verdict: specification ❌   |   quality: changes-needed';
  assert.deepEqual(parseVerdict(PASS), { spec: 'pass', quality: 'approved' });
  assert.deepEqual(parseVerdict(FAIL), { spec: 'fail', quality: 'changes-needed' });
  assert.deepEqual(parseVerdict('no verdict here'), { spec: 'unknown', quality: 'unknown' });
  assert.deepEqual(parseVerdict('### Verdict: specification ✅ | quality: maybe'), { spec: 'pass', quality: 'unknown' }, 'a part it cannot read is unknown');
  assert.deepEqual(parseVerdict('### Verdict: spec good'), { spec: 'unknown', quality: 'unknown' }, 'a malformed line is unknown in both parts');
  assert.deepEqual(parseVerdict(`Cycle 0 said:\n${FAIL}\nNow fixed.\n\n**### Verdict: specification ✅️ | quality: approved** (all closed)  `), { spec: 'pass', quality: 'approved' }, 'the last verdict line decides; bold, a variation selector, and trailing text are tolerated');
  assert.deepEqual(parseVerdict(undefined), { spec: 'unknown', quality: 'unknown' });

  // The verdict line slice-reviewer.md prescribes parses, both ways: a reworded line fails here.
  const tpl = fs.readFileSync(path.join(__dirname, '..', 'plugin', 'agents', 'slice-reviewer.md'), 'utf8').split('\n').find((l) => l.startsWith('### Verdict:'));
  assert.ok(tpl, 'slice-reviewer.md prescribes a `### Verdict:` line');
  const pick = (n) => tpl.replace(/(\S+) \/ (\S+)/g, (_, a, b) => (n ? b : a));
  assert.deepEqual(parseVerdict(pick(0)), { spec: 'pass', quality: 'approved' }, `parses ${pick(0)}`);
  assert.deepEqual(parseVerdict(pick(1)), { spec: 'fail', quality: 'changes-needed' }, `parses ${pick(1)}`);

  const handback = (ag, message, cwd) => run({ hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback', agent_id: ag, agent_type: 'superdev:slice-reviewer', tool_input: { message }, cwd: cwd || tmp });
  const stop = (ag, last) => run({ hook_event_name: 'SubagentStop', agent_id: ag, agent_type: 'superdev:slice-reviewer', last_assistant_message: last, cwd: tmp });
  const bg = (slice, tu, type, ag) => { run(agentPre(`${A}/slicetrees/${slice}`, tu, type)); run(agentPost(tu, { status: 'async_launched', agentId: ag })); };
  const verdicts = () => trace(A).filter((l) => l[2] === 'verdict');

  reset();
  bg('04', 'i1', 'superdev:implementer', 'ai1');
  handback('ai1', PASS);
  stop('ai1', PASS);
  assert.equal(verdicts().length, 0, 'an implementer gets no verdict line');
  bg('04', 'r1', 'superdev:slice-reviewer', 'ar1');
  bg('05', 'i5', 'superdev:implementer', 'ai5');
  stop('ai5');
  bg('05', 'r5', 'superdev:slice-reviewer', 'ar5');
  handback('ar1', FAIL);
  assert.deepEqual(verdicts(), [['04', 'main', 'verdict', 'r1', 'fail', 'changes-needed', '0', 'i1']]);
  stop('ar1', FAIL);
  assert.equal(verdicts().length, 1, 'a hand-back and a stop give one verdict line');
  handback('ar5', PASS);
  stop('ar5');
  assert.deepEqual(verdicts()[1], ['05', 'main', 'verdict', 'r5', 'pass', 'approved', '0', 'i5'], 'another slice numbers its own cycles');
  bg('04', 'i2', 'superdev:implementer', 'ai2');
  stop('ai2');
  bg('04', 'r2', 'superdev:slice-reviewer', 'ar2'); // interrupted: no hand-back, no stop
  bg('04', 'r3', 'superdev:slice-reviewer', 'ar3');
  handback('ar3', 'Lean.\n### Verdict: specification ✅ | quality: approved');
  assert.deepEqual(verdicts()[2], ['04', 'main', 'verdict', 'r3', 'pass', 'approved', '1', 'i2'], 'an unfinished review does not advance the cycle; the last finished implementer is reviewed');
  handback('ar3', FAIL);
  assert.equal(verdicts().length, 3, 'a repeated hand-back writes no second line');

  // No implementer before the review records `-`; a report with no verdict line records unknown.
  bg('06', 'r6', 'superdev:slice-reviewer', 'ar6');
  handback('ar6', 'I could not finish.');
  assert.deepEqual(verdicts()[3], ['06', 'main', 'verdict', 'r6', 'unknown', 'unknown', '0', '-']);

  // A reviewer answering in plain text: the stop's last message carries the verdict.
  bg('07', 'r7', 'superdev:slice-reviewer', 'ar7');
  stop('ar7', PASS);
  assert.deepEqual(verdicts()[4], ['07', 'main', 'verdict', 'r7', 'pass', 'approved', '0', '-']);
  assert.equal(trace(A).filter((l) => l[2] === 'dispatch-end' && l[4] === 'r7').length, 1, 'the stop still ends the dispatch');

  // Other reviewer types, a foreground reviewer, and a hand-back outside any run write nothing.
  bg('04', 's1', 'superdev:simplicity-reviewer', 'as1');
  handback('as1', PASS);
  bg('04', 'f1', 'superdev:final-reviewer', 'af1');
  handback('af1', PASS);
  run(agentPre(`${A}/slicetrees/04`, 'g1', 'superdev:slice-reviewer'));
  handback('ag-fg', PASS);
  run(agentPost('g1', { status: 'completed' }));
  handback('nobody', PASS);
  assert.equal(verdicts().length, 5, 'only bound slice-reviewer dispatches get a verdict line');
  assert.equal(trace(B).length, 0);

  // A malformed payload records nothing and prints nothing; the spawned hook exits 0.
  run({ hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback', cwd: tmp });
  run({ hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback', agent_id: 'ar6', tool_input: { message: 42 }, cwd: tmp });
  run({ hook_event_name: 'SubagentStop', agent_id: 'ar6', last_assistant_message: { x: 1 }, cwd: tmp });
  run({ hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback', agent_id: 'ar1', tool_input: { message: PASS }, cwd: path.join(tmp, 'no', 'such', 'dir') });
  assert.equal(verdicts().length, 5);
  assert.equal(spawnOut({ hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback', agent_id: 'ar9', tool_input: { message: PASS }, cwd: tmp }), '');
  assert.equal(spawnOut(null, '{not json'), '');

  // `scope.js trace` (what `/superdev:status --trace` prints) shows each verdict line.
  const shown = cp.spawnSync(process.execPath, [require.resolve('../plugin/scripts/scope.js'), 'trace', '--root', A], { encoding: 'utf8', timeout: 10000 });
  assertSpawnDecided(shown, 'scope.js trace');
  assert.equal(shown.status, 0, shown.stderr);
  assert.equal(shown.stdout.split('\n').filter((l) => /\bverdict\b/.test(l)).length, 5, 'the timeline carries every verdict line');

  // hooks.json registers run-trace.js for PostToolUse on SubagentHandback.
  const registered = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8')).hooks;
  assert.ok(registered.PostToolUse.some((g) => g.matcher.split('|').includes('SubagentHandback') && g.hooks.some((h) => h.command.includes('hooks/run-trace.js'))), 'PostToolUse on SubagentHandback runs run-trace.js');

  // Only a `completed` end finishes a dispatch: a stopped implementer is not the reviewed one, and a stopped reviewer is no
  // cycle. An end with no outcome field (a trace written before outcomes) reads `completed`.
  const taskStop = (task_id) => run({ hook_event_name: 'PostToolUse', tool_name: 'TaskStop', tool_input: { task_id }, cwd: tmp });
  bg('08', 'i8a', 'superdev:implementer', 'ai8a');
  stop('ai8a');
  bg('08', 'i8b', 'superdev:implementer', 'ai8b');
  taskStop('ai8b');
  bg('08', 'r8a', 'superdev:slice-reviewer', 'ar8a');
  taskStop('ar8a');
  appendTrace(A, { slice: '08', agent: 'main', kind: 'dispatch', fields: ['superdev:slice-reviewer', 'r8old', 'legacy'] });
  appendTrace(A, { slice: '08', agent: 'main', kind: 'dispatch-end', fields: ['superdev:slice-reviewer', 'r8old'] });
  bg('08', 'r8b', 'superdev:slice-reviewer', 'ar8b');
  handback('ar8b', PASS);
  assert.deepEqual(verdicts()[5], ['08', 'main', 'verdict', 'r8b', 'pass', 'approved', '1', 'i8a'], 'a stopped reviewer is no cycle, a legacy end counts, a stopped implementer is not reviewed');

  // A foreground slice review reports through `tool_response.handbackReport` at PostToolUse; one dispatch gets one line.
  run(agentPre(`Review ${A}/slicetrees/09`, 'r9', 'superdev:slice-reviewer'));
  run(agentPost('r9', { status: 'completed', handbackReport: { text: PASS } }));
  assert.deepEqual(verdicts()[6], ['09', 'main', 'verdict', 'r9', 'pass', 'approved', '0', '-'], 'a foreground slice review records its verdict');
  run(agentPost('r9', { status: 'completed', handbackReport: { text: FAIL } }));
  assert.equal(verdicts().length, 7, 'a repeated report writes no second line');

  // A resumed slice-reviewer ends once per run and counts as one cycle.
  reset();
  bg('04', 'q1', 'superdev:slice-reviewer', 'aq1');
  stop('aq1');
  run({ hook_event_name: 'PreToolUse', tool_name: 'SendMessage', tool_input: { to: 'aq1', message: 'again' }, session_id: 'S1', cwd: tmp });
  stop('aq1');
  bg('04', 'q2', 'superdev:slice-reviewer', 'aq2');
  handback('aq2', PASS);
  assert.equal(verdicts().pop()[6], '1', 'a resumed reviewer counts once in the cycle');
}
// Final-review verdicts (INV-0146): `final-verdict <tool_use_id> <answer> <cycle>` for a final-reviewer inside an open review step.
{
  const tpl = fs.readFileSync(path.join(__dirname, '..', 'plugin', 'agents', 'final-reviewer.md'), 'utf8').split('\n').find((l) => l.startsWith('Ready to merge?'));
  assert.ok(tpl, 'final-reviewer.md prescribes a `Ready to merge?` line');
  const options = /\[(.*)\]/.exec(tpl)[1].split('|').map((w) => w.trim());
  assert.deepEqual(options.map((w) => parseFinalVerdict(tpl.replace(/\[.*\]/, w))).sort(), ['no', 'with-fixes', 'yes'], `every answer ${tpl} offers parses`);
  assert.equal(parseFinalVerdict('Ready to merge? with-fixes'), 'with-fixes', 'a hyphen spells the answer');
  assert.equal(parseFinalVerdict('Ready to merge? WITH   FIXES'), 'with-fixes', 'any whitespace run and any case spell the answer');
  assert.equal(parseFinalVerdict('Ready to merge? With fixes'), 'with-fixes');
  assert.equal(parseFinalVerdict('Ready to merge? No\nReady to merge? **Yes**'), 'yes', 'the last line decides');
  assert.equal(parseFinalVerdict('Ready to merge? Maybe'), 'unknown');
  assert.equal(parseFinalVerdict(undefined), 'unknown');

  const fv = () => trace(A).filter((l) => l[2] === 'final-verdict');
  const step = (...fields) => appendTrace(A, { slice: 'scope', agent: 'main', kind: 'ledger', fields });
  const handback = (ag, message) => run({ hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback', agent_id: ag, tool_input: { message }, cwd: tmp });
  const bgFinal = (tu, ag) => { run(agentPre(`Review ${A}/scopetree`, tu, 'superdev:final-reviewer')); run(agentPost(tu, { status: 'async_launched', agentId: ag })); };
  const stopAg = (ag) => run({ hook_event_name: 'SubagentStop', agent_id: ag, agent_type: 'superdev:final-reviewer', cwd: tmp });

  reset();
  bgFinal('f0', 'af0');
  handback('af0', 'Ready to merge? With fixes');
  assert.equal(fv().length, 0, 'a final review before any review step line records nothing');
  step('step', 'set', 'review');
  bgFinal('f1', 'af1');
  handback('af1', 'Ready to merge? With fixes');
  assert.deepEqual(fv(), [['scope', 'main', 'final-verdict', 'f1', 'with-fixes', '0']], 'the review that opens the loop is cycle 0');
  stopAg('af1');
  handback('af1', 'Ready to merge? Yes');
  assert.equal(fv().length, 1, 'the hand-back and the stop path give one line');
  run(agentPre(`Review ${A}/scopetree`, 'f2', 'superdev:final-reviewer'));
  run(agentPost('f2', { status: 'async_launched', agentId: 'af2' }));
  run({ hook_event_name: 'PostToolUseFailure', tool_name: 'Agent', tool_use_id: 'f2', cwd: tmp });
  bgFinal('f3', 'af3');
  stopAg('af3');
  assert.deepEqual(fv()[1], ['scope', 'main', 'final-verdict', 'f3', 'unknown', '1'], 'a failed dispatch does not advance the cycle; an unreadable report is unknown');
  step('step', 'set', 'review'); // a repeated `step set review` is a new start (ADR 0147), with no clear between
  run(agentPre(`Review ${A}/scopetree`, 'f4', 'superdev:final-reviewer'));
  run(agentPost('f4', { status: 'completed', handbackReport: { text: 'Assessment\nReady to merge? Yes\nReasoning: ok' } }));
  assert.deepEqual(fv()[2], ['scope', 'main', 'final-verdict', 'f4', 'yes', '0'], 'a second review step line restarts the cycle; a foreground review reports through handbackReport');
  run(agentPost('f4', { status: 'completed', handbackReport: { text: 'Ready to merge? No' } }));
  assert.equal(fv().length, 3, 'a repeated foreground report writes no second line');
  run(agentPre(`Review ${A}/scopetree`, 'f5', 'superdev:final-reviewer'));
  run(agentPost('f5', { status: 'completed', handbackReport: 'Ready to merge? No' }));
  assert.deepEqual(fv()[3], ['scope', 'main', 'final-verdict', 'f5', 'no', '1'], 'a plain string report is read too');
  // The review-step window reads step lines only: a step clear, a step block, or another step closes it; a stage line never does.
  step('stage', 'set', 'merged');
  step('stage', 'set', 'merged');
  run(agentPre(`Review ${A}/scopetree`, 'f6', 'superdev:final-reviewer'));
  run(agentPost('f6', { status: 'completed', handbackReport: { text: 'Ready to merge? No' } }));
  assert.equal(fv()[4][3], 'f6', 'a same-value stage write keeps the review step');
  step('stage', 'set', 'reviewed');
  step('step', 'clear'); // what `scope.js stage set` mirrors when the stage change removes the step
  run(agentPre(`Review ${A}/scopetree`, 'f7', 'superdev:final-reviewer'));
  run(agentPost('f7', { status: 'completed', handbackReport: { text: 'Ready to merge? No' } }));
  assert.equal(fv().length, 5, 'a stage write that clears the step closes the review step');
  step('step', 'set', 'review');
  step('step', 'set', 'document');
  run(agentPre(`Review ${A}/scopetree`, 'f8', 'superdev:final-reviewer'));
  run(agentPost('f8', { status: 'completed', handbackReport: { text: 'Ready to merge? No' } }));
  assert.equal(fv().length, 5, 'another step closes the review step');
  step('step', 'set', 'review');
  step('step', 'clear');
  run(agentPre(`Review ${A}/scopetree`, 'f9', 'superdev:final-reviewer'));
  run(agentPost('f9', { status: 'completed', handbackReport: { text: 'Ready to merge? No' } }));
  assert.equal(fv().length, 5, 'a step clear closes the review step');
  step('step', 'set', 'review');
  step('step', 'block', 'review');
  run(agentPre(`Review ${A}/scopetree`, 'f9b', 'superdev:final-reviewer'));
  run(agentPost('f9b', { status: 'completed', handbackReport: { text: 'Ready to merge? No' } }));
  assert.equal(fv().length, 5, 'a step block closes the review step');
  step('step', 'set', 'review');
  run(agentPre(`Review ${A}/scopetree`, 'f10', 'superdev:final-reviewer'));
  run(agentPost('f10', { status: 'completed', handbackReport: { text: 'Ready to merge? No' } }));
  assert.deepEqual(fv()[5], ['scope', 'main', 'final-verdict', 'f10', 'no', '0'], 'a later review step reopens the window with a fresh cycle');
  // An `adopt` line, then the step, then a same-value stage write: the step stays open.
  reset();
  step('adopt');
  step('step', 'set', 'review');
  step('stage', 'set', 'merged');
  run(agentPre(`Review ${A}/scopetree`, 'g1', 'superdev:final-reviewer'));
  run(agentPost('g1', { status: 'completed', handbackReport: { text: 'Ready to merge? No' } }));
  assert.equal(fv().length, 1, 'a stage line that kept the ledger step leaves the review step open');
  reset();
  step('adopt');
  step('step', 'set', 'review');
  step('stage', 'set', 'reviewed');
  step('step', 'clear');
  run(agentPre(`Review ${A}/scopetree`, 'g2', 'superdev:final-reviewer'));
  run(agentPost('g2', { status: 'completed', handbackReport: { text: 'Ready to merge? No' } }));
  assert.equal(fv().length, 0, 'the step clear a stage write mirrors closes the review step');
  // A resumed final-reviewer ends once per run and counts as one cycle.
  reset();
  step('step', 'set', 'review');
  bgFinal('h1', 'ah1');
  stopAg('ah1');
  run({ hook_event_name: 'PreToolUse', tool_name: 'SendMessage', tool_input: { to: 'ah1', message: 'again' }, session_id: 'S1', cwd: tmp });
  stopAg('ah1');
  bgFinal('h2', 'ah2');
  handback('ah2', 'Ready to merge? Yes');
  assert.equal(fv().pop()[5], '1', 'a resumed final-reviewer counts once in the cycle');
}

cleanup();
