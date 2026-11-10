'use strict';

// Suite for the subagent dispatch lines of the run trace (ADR 0117, ADR 0127, ADR 0140, INV-0133, INV-0136, INV-0145): attribution, binding,
// outcomes, and the superdev-view trace layout.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { appendTrace } = require('../plugin/scripts/scope.js');
const { encodePaths, encodeArgs } = require('../plugin/lib/trace-log.js');
const { tmp, ledger, A, B, trace, reset, run, spawnOut, hookPath, agentPre, agentPost, cleanup, GIT_SPAWN_BOUND_MS } = require('./run-trace-setup');

// Subagent dispatches: PreToolUse on Agent records `dispatch`, PostToolUse `completed` (or async_launched then SubagentStop) the `dispatch-end`.
// Dispatch prompts and the scope and slice each one attributes to (INV-0136). `{A}` and `{B}` stand for two run
// roots that hold a ledger, `{NOLEDGER}` for one that holds none. The `{A}.x` entry sits on lib/ledger.js's SLUG_RE
// boundary: a `.` ends the slug, so a slug pattern that admits it fails.
{
  const fixtures = [
    { "prompt": "Work in {A}/slicetrees/04 please", "root": "A", "slice": "04" },
    { "prompt": "Append to {A}/reports/04/progress.md", "root": "A", "slice": "04" },
    { "prompt": "{A}/slicetrees/04 and {A}/reports/04/progress.md", "root": "A", "slice": "04" },
    { "prompt": "{A}/slicetrees/04 and {A}/slicetrees/05", "root": "A", "slice": "scope" },
    { "prompt": "Review the scope at {A}/scopetree against {A}/dod.md", "root": "A", "slice": "scope" },
    { "prompt": "Work in {A}/. and {A}, then {A}/slicetrees/04.", "root": "A", "slice": "04" },
    { "prompt": "Work in {A}.x/slicetrees/04", "root": "A", "slice": "scope" },
    { "prompt": "no run root here", "root": null, "slice": null },
    { "prompt": "{A}/slicetrees/04 and {B}/slicetrees/01", "root": null, "slice": null },
    { "prompt": "{NOLEDGER}/slicetrees/01", "root": null, "slice": null }
  ];
  const roots = { A, B, NOLEDGER: path.join(tmp, '.superdev', 'scopes', 'nope') };
  assert.ok(fixtures.length > 0, 'the shared fixture list parses');
  fixtures.forEach((f, i) => {
    reset();
    run(agentPre(f.prompt.replace(/\{(A|B|NOLEDGER)\}/g, (_, k) => roots[k]), `fx${i}`));
    const got = [['A', A], ['B', B]].filter(([, r]) => trace(r).some((l) => l[2] === 'dispatch' && l[4] === `fx${i}`));
    assert.deepEqual(got.map(([k]) => k), f.root ? [f.root] : [], `fixture ${i} root: ${f.prompt}`);
    if (f.root) assert.equal(trace(f.root === 'A' ? A : B).find((l) => l[4] === `fx${i}`)[0], f.slice, `fixture ${i} slice: ${f.prompt}`);
  });
}
// The trace layout superdev-view's parse.ts reads: the hook writes exactly the shared lines, and the mod's
// suite parses the same lines into agents, so a layout change on either side fails one suite.
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'mods', 'superdev-view', 'hooks', 'trace-fixtures.ts'), 'utf8');
  const lines = JSON.parse(src.slice(src.indexOf('/* trace:start */') + 17, src.indexOf('/* trace:end */')));
  reset();
  // scope.js writes the ledger lines: the run's init, its stage, and a slice merged and one blocked.
  const scopeCli = (args, input) => {
    const r = cp.spawnSync(process.execPath, [require.resolve('../plugin/scripts/scope.js'), ...args], { cwd: tmp, input: input || '', encoding: 'utf8', timeout: 10000 });
    assertSpawnDecided(r, `scope.js ${args[0]}`);
    assert.equal(r.status, 0, r.stderr);
  };
  fs.rmSync(path.join(A, 'ledger.md'));
  scopeCli(['init', 'feat/a', 'planned'], JSON.stringify({ anchor: '#1 — A', slices: [{ id: '04', issue: '#4', title: 't', type: 'behavior', 'depends-on': '—' }, { id: '05', issue: '#5', title: 't', type: 'behavior', 'depends-on': '—' }] }));
  scopeCli(['step', 'set', 'plan', '--root', A]);
  scopeCli(['step', 'clear', '--root', A]);
  scopeCli(['stage', '--root', A, 'set', 'implementing']);
  scopeCli(['step', 'set', 'implement', '--root', A]);
  scopeCli(['slice', '--root', A, '04', 'in-progress']);
  scopeCli(['slice', '--root', A, '05', 'in-progress']);
  // `scope.js test focused` writes its run line through this writer, with the path set in `encodePaths`' field encoding (ADR 0175).
  appendTrace(A, { slice: '04', kind: 'run', fields: ['focused', 'pass', 'e4f5a6b', 'clean', encodePaths(['a b.ts', 'x,y.ts', '-lead.ts'])] });
  // The layout with the duration and the arguments field (`encodeArgs`), beside the one above without them.
  appendTrace(A, { slice: '04', kind: 'run', fields: ['path', 'fail', 'e4f5a6b', 'clean', 'tests/a.test.js', '120', encodeArgs(['tests/a.test.js', '--grep', 'a b'])] });
  run(agentPre(`Work in ${A}/slicetrees/04`, 'tu1', 'superdev:implementer', 'Build slice 04', undefined, 's1'));
  run(agentPost('tu1', { status: 'async_launched', agentId: 'ag1' }));
  run({ hook_event_name: 'SubagentStop', agent_id: 'ag1', agent_type: 'superdev:implementer', cwd: tmp });
  run({ hook_event_name: 'PreToolUse', tool_name: 'SendMessage', tool_use_id: 'sm1', tool_input: { to: 'ag1', message: 'go on' }, session_id: 's1', cwd: tmp });
  run({ hook_event_name: 'SubagentStop', agent_id: 'ag1', agent_type: 'superdev:implementer', cwd: tmp });
  scopeCli(['slice', '--root', A, '04', 'merged', '--range', 'a1b2c3d..e4f5a6b']);
  scopeCli(['slice', '--root', A, '05', 'blocked']);
  scopeCli(['step', 'set', 'review', '--root', A]);
  run(agentPre(`Review ${A}/scopetree`, 'tu2', 'superdev:final-reviewer', 'Final review', undefined, 's1'));
  run(agentPost('tu2', { status: 'async_launched', agentId: 'ag2' }));
  run({ hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback', agent_id: 'ag2', tool_input: { message: 'Ready to merge? With fixes' }, cwd: tmp });
  run({ hook_event_name: 'SubagentStop', agent_id: 'ag2', agent_type: 'superdev:final-reviewer', cwd: tmp });
  run({ hook_event_name: 'PreToolUse', tool_name: 'SendMessage', tool_use_id: 'sm2', tool_input: { to: 'ag2', message: 're-review' }, session_id: 's1', cwd: tmp });
  run({ hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback', agent_id: 'ag2', tool_input: { message: 'Ready to merge? Yes' }, cwd: tmp });
  run({ hook_event_name: 'SubagentStop', agent_id: 'ag2', agent_type: 'superdev:final-reviewer', cwd: tmp });
  run(agentPre(`Work in ${A}/slicetrees/05`, 'tu3', 'superdev:implementer', 'Build slice 05', undefined, 's1'));
  run(agentPre(`Review ${A}/slicetrees/04`, 'tu4', 'superdev:slice-reviewer', 'Review slice 04', undefined, 's1'));
  run(agentPost('tu4', { status: 'async_launched', agentId: 'ag4' }));
  run({ hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback', agent_id: 'ag4', tool_input: { message: '### Verdict: specification ❌ | quality: changes-needed' }, cwd: tmp });
  run({ hook_event_name: 'SubagentStop', agent_id: 'ag4', agent_type: 'superdev:slice-reviewer', cwd: tmp });
  scopeCli(['step', 'block', '--root', A]);
  assert.deepEqual(trace(A).map((l) => l.join(' ')), lines, 'the hook writes the trace lines superdev-view parses');
  fs.writeFileSync(path.join(A, 'ledger.md'), ledger([['02', 'todo'], ['03', 'in-progress']]));
}
{
  reset();
  const stop = (id, cwd) => run({ hook_event_name: 'SubagentStop', agent_id: id, agent_type: 'superdev:implementer', cwd: cwd || tmp });
  run(agentPre(`Work in ${A}/slicetrees/04 please`, 't1', 'superdev:implementer', 'two words'));
  assert.deepEqual(trace(A), [['04', 'main', 'dispatch', 'superdev:implementer', 't1', 'two\\x20words', '-']], 'a payload with no session id records `-` for it');
  run(agentPost('t1', { status: 'completed' }));
  assert.deepEqual(trace(A)[1], ['04', 'main', 'dispatch-end', 'superdev:implementer', 't1', 'completed'], 'a foreground dispatch ends on its PostToolUse');
  run(agentPre(`Append to ${A}/reports/04/progress.md`, 't2', 'superdev:slice-reviewer'));
  assert.deepEqual(trace(A)[2].slice(0, 5), ['04', 'main', 'dispatch', 'superdev:slice-reviewer', 't2']);
  run(agentPre(`${A}/slicetrees/04 and ${A}/reports/04/progress.md`, 't3'));
  assert.equal(trace(A)[3][0], '04', 'the slicetree and report path of one slice agree');
  run(agentPre(`${A}/slicetrees/04 and ${A}/slicetrees/05`, 't4'));
  assert.equal(trace(A)[4][0], 'scope', 'two slice ids in one run record under scope');
  assert.equal(trace(A).length, 5);
  run(agentPre('no run root here', 'n1'));
  run(agentPre(`${A}/slicetrees/04 and ${B}/slicetrees/01`, 'n2'));
  run(agentPre(`${path.join(tmp, '.superdev', 'scopes', 'nope')}/slicetrees/01`, 'n3'));
  run(agentPost('unknown', { status: 'completed' }));
  stop('unknown');
  assert.equal(trace(A).length, 5);
  assert.equal(trace(B).length, 0, 'a dispatch naming no run root or two records nothing');
  run(agentPre(`Work in ${A}/. and ${A}, then ${A}/slicetrees/04.`, 'p1'));
  assert.equal(trace(A).filter((l) => l[2] === 'dispatch' && l[4] === 'p1').length, 1, 'trailing punctuation after a run root path still records the dispatch');

  // A background dispatch: async_launched binds the agentId, SubagentStop with it ends the dispatch.
  reset();
  run(agentPre(`${A}/slicetrees/04`, 'b1', 'superdev:slice-reviewer'));
  run(agentPost('b1', { status: 'async_launched', agentId: 'ag1' }));
  assert.equal(trace(A).filter((l) => l[2] === 'dispatch-end').length, 0, 'a launch is no end');
  stop('other');
  assert.equal(trace(A).filter((l) => l[2] === 'dispatch-end').length, 0, 'an unbound agent id ends nothing');
  stop('ag1');
  assert.deepEqual(trace(A).filter((l) => l[2] === 'dispatch-end'), [['04', 'main', 'dispatch-end', 'superdev:slice-reviewer', 'b1', 'completed']]);

  // A SubagentStop another hook blocked fires again: one dispatch still gets one end.
  stop('ag1');
  assert.equal(trace(A).filter((l) => l[2] === 'dispatch-end').length, 1, 'a repeated SubagentStop writes no second end');

  // hooks.json registers run-trace.js for PreToolUse and PostToolUse on Agent.
  const registered = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8')).hooks;
  for (const ev of ['PreToolUse', 'PostToolUse']) {
    assert.ok(registered[ev].some((g) => g.matcher === 'Agent' && g.hooks.some((h) => h.command.includes('hooks/run-trace.js'))), `${ev} on Agent runs run-trace.js`);
  }

  // Parallel implementers for slices 01 and 02 ending in reverse order each end on their own slice.
  reset();
  run(agentPre(`${A}/slicetrees/01`, 'x1'));
  run(agentPre(`${A}/slicetrees/02`, 'x2'));
  run(agentPost('x2', { status: 'completed' }));
  run(agentPost('x1', { status: 'completed' }));
  assert.deepEqual(trace(A).filter((l) => l[2] === 'dispatch-end').map((l) => [l[0], l[4]]), [['02', 'x2'], ['01', 'x1']]);

  // A dispatch with no PostToolUse has no end yet; a PostToolUseFailure ends only its own dispatch.
  reset();
  run(agentPre(`${A}/slicetrees/01`, 'f1'));
  run(agentPre(`${A}/slicetrees/02`, 'f2'));
  run({ hook_event_name: 'PostToolUseFailure', tool_name: 'Agent', tool_use_id: 'f2', error: 'boom', cwd: tmp });
  assert.deepEqual(trace(A).filter((l) => l[2] === 'dispatch-end').map((l) => [l[0], l[4], l[5]]), [['02', 'f2', 'failed']]);
  assert.deepEqual(trace(A).filter((l) => l[2] === 'dispatch').map((l) => [l[0], l[4]]), [['01', 'f1'], ['02', 'f2']]);

  // Another status, a non-object tool_response, and async_launched without an agentId each write no end and print nothing.
  reset();
  run(agentPre(`${A}/slicetrees/01`, 'm1'));
  run(agentPre(`${A}/slicetrees/01`, 'm2'));
  run(agentPre(`${A}/slicetrees/01`, 'm3'));
  assert.equal(spawnOut(agentPost('m1', { status: 'error' })), '');
  assert.equal(spawnOut(agentPost('m2', 'boom')), '');
  assert.equal(spawnOut(agentPost('m3', { status: 'async_launched' })), '');
  stop('undefined');
  assert.equal(trace(A).filter((l) => l[2] === 'dispatch-end').length, 0);

  // A trace built from these events passes final-reviewer's check: the slice-reviewer dispatch-end follows the last implementer dispatch-end.
  reset();
  run(agentPre(`${A}/slicetrees/01`, 'k1'));
  run(agentPost('k1', { status: 'completed' }));
  run(agentPre(`${A}/slicetrees/01`, 'k2', 'superdev:slice-reviewer'));
  run(agentPost('k2', { status: 'completed' }));
  const ends = trace(A).filter((l) => l[2] === 'dispatch-end' && l[0] === '01');
  const typeOf = (tu) => trace(A).find((l) => l[2] === 'dispatch' && l[4] === tu)[3];
  assert.deepEqual(ends.map((l) => [l[4], typeOf(l[4])]), [['k1', 'superdev:implementer'], ['k2', 'superdev:slice-reviewer']], 'the review ends after the implementer');

  // Every Agent-tool event exits 0 with no decision, and a SubagentStart without a prompt writes nothing.
  assert.equal(spawnOut(agentPre(`${A}/slicetrees/01`, 'o1')), '');
  assert.equal(spawnOut(agentPost('o1', { status: 'completed' })), '');
  assert.equal(spawnOut({ hook_event_name: 'SubagentStart', agent_id: 'z', agent_type: 'superdev:implementer', cwd: tmp }), '');
  assert.equal(trace(A).filter((l) => l[4] === 'o1' && l[2] === 'dispatch-end').length, 1);
  assert.equal(trace(A).length, 6);
}

// Dispatch outcomes (ADR 0140, INV-0145): every dispatch gets one `dispatch-end` naming how it ended, shaped as the
// hook probe recorded the events (Claude Code 2.1.296): PostToolUseFailure and PermissionDenied on Agent carry the
// call's tool_use_id, TaskStop's PostToolUse carries the subagent's agent id as tool_input.task_id, and Stop,
// UserPromptSubmit, and SessionEnd carry the main session's session_id.
{
  const pre = (slice, tu, session, type) => run(agentPre(`${A}/slicetrees/${slice}`, tu, type, undefined, undefined, session));
  const bind = (tu, ag) => run(agentPost(tu, { status: 'async_launched', agentId: ag }));
  const boundary = (hook_event_name, session_id, extra) => run({ hook_event_name, session_id, cwd: tmp, ...extra });
  const ends = () => trace(A).filter((l) => l[2] === 'dispatch-end').map((l) => [l[4], l[5]]);
  const stopSub = (ag) => run({ hook_event_name: 'SubagentStop', agent_id: ag, agent_type: 'superdev:implementer', cwd: tmp });

  // completed: a foreground dispatch on its PostToolUse, a background one on its SubagentStop, each once.
  reset();
  pre('01', 'c1', 'S1');
  run(agentPost('c1', { status: 'completed' }));
  run(agentPost('c1', { status: 'completed' }));
  pre('01', 'c2', 'S1');
  bind('c2', 'agc2');
  stopSub('agc2');
  stopSub('agc2');
  assert.deepEqual(ends(), [['c1', 'completed'], ['c2', 'completed']], 'each completed dispatch ends once');
  assert.equal(trace(A).find((l) => l[2] === 'dispatch')[6], 'S1', 'the dispatch line ends with its session id');

  // failed and denied: matched by tool_use_id; a later end event for the dispatch writes nothing.
  reset();
  pre('01', 'x1', 'S1');
  pre('01', 'x2', 'S1');
  pre('01', 'x3', 'S1');
  run({ hook_event_name: 'PostToolUseFailure', tool_name: 'Agent', tool_use_id: 'x1', error: 'boom', cwd: tmp });
  run({ hook_event_name: 'PermissionDenied', tool_name: 'Agent', tool_use_id: 'x2', cwd: tmp });
  run({ hook_event_name: 'PermissionDenied', tool_name: 'Agent', tool_use_id: 'nobody', cwd: tmp });
  run({ hook_event_name: 'PostToolUseFailure', tool_name: 'Agent', tool_use_id: 'x2', cwd: tmp });
  run(agentPost('x1', { status: 'completed' }));
  assert.deepEqual(ends(), [['x1', 'failed'], ['x2', 'denied']], 'the first end wins, and a tool_use_id naming no dispatch writes nothing');

  // stopped: a TaskStop naming a bound agent ends its dispatch; one naming no bound agent writes nothing.
  reset();
  pre('01', 'k1', 'S1');
  bind('k1', 'agk1');
  const taskStop = (task_id) => run({ hook_event_name: 'PostToolUse', tool_name: 'TaskStop', tool_input: { task_id }, tool_response: { task_id }, cwd: tmp });
  taskStop('agother');
  assert.deepEqual(ends(), [], 'a TaskStop naming no bound agent writes nothing');
  taskStop('agk1');
  assert.deepEqual(ends(), [['k1', 'stopped']]);
  stopSub('agk1');
  taskStop('agk1');
  assert.deepEqual(ends(), [['k1', 'stopped']], 'a later SubagentStop or TaskStop writes no second end');

  // unknown: at the session's Stop, a dispatch with no bind ends; a bound one and another session's stay open.
  reset();
  pre('01', 'u1', 'S1');
  pre('01', 'u2', 'S1');
  bind('u2', 'agu2');
  pre('02', 'u3', 'S2');
  boundary('Stop', 'S1');
  assert.deepEqual(ends(), [['u1', 'unknown']], 'only the unbound dispatch of the session ends');
  boundary('Stop', 'S1');
  assert.deepEqual(ends(), [['u1', 'unknown']], 'a second Stop writes nothing');
  pre('01', 'u4', 'S1');
  boundary('UserPromptSubmit', 'S1', { prompt: 'go' });
  assert.deepEqual(ends(), [['u1', 'unknown'], ['u4', 'unknown']], 'UserPromptSubmit ends it too');
  boundary('Stop', 'S1', { agent_id: 'agu2' });
  assert.equal(ends().length, 2, 'a Stop that names a subagent ends nothing');

  // session-end: SessionEnd ends the session's open dispatches, bound ones `session-end` and unbound ones `unknown`;
  // a dispatch line with no session id and another session's dispatch stay open.
  pre('01', 'u5', 'S1');
  appendTrace(A, { slice: '01', agent: 'main', kind: 'dispatch', fields: ['superdev:implementer', 'old1', 'legacy'] });
  boundary('SessionEnd', 'S1', { reason: 'other' });
  assert.deepEqual(ends().slice(2), [['u2', 'session-end'], ['u5', 'unknown']], 'SessionEnd ends the session\'s open dispatches');
  assert.equal(ends().length, 4, 'a dispatch of another session and one with no session id stay open');
  stopSub('agu2');
  boundary('SessionEnd', 'S1');
  assert.equal(ends().length, 4, 'a SubagentStop after a session-end end writes no second end');
  boundary('SessionEnd', 'S2');
  assert.deepEqual(ends().slice(4), [['u3', 'unknown']]);

  // resumed (issue #992): a SendMessage naming the agent of an ended, bound dispatch opens a new run of it, with its own
  // end; one naming a running dispatch or an unbound agent writes nothing. Shaped as the resume probe recorded the
  // events (Claude Code 2.1.296): PreToolUse on SendMessage carries tool_input.to = the agent id, and the resumed run fires
  // SubagentStart and SubagentStop again.
  reset();
  const send = (to, session_id = 'S1', tool_use_id = 'sm') => run({ hook_event_name: 'PreToolUse', tool_name: 'SendMessage', tool_use_id, tool_input: { to, message: 'go' }, session_id, cwd: tmp });
  const resumes = () => trace(A).filter((l) => l[2] === 'dispatch-resume');
  pre('01', 'm1', 'S1');
  bind('m1', 'agm1');
  send('agm1');
  assert.deepEqual(resumes(), [], 'a SendMessage to a running dispatch writes nothing');
  stopSub('agm1');
  send('agnobody');
  assert.deepEqual(resumes(), [], 'a SendMessage to an unbound agent id writes nothing');
  send('agm1', 'S2');
  assert.deepEqual(resumes(), [['01', 'main', 'dispatch-resume', 'm1', 'agm1', 'S2', 'sm']], 'a SendMessage to an ended dispatch reopens it on its slice, carrying its own tool_use_id');
  send('agm1');
  assert.equal(resumes().length, 1, 'a SendMessage to the reopened, running dispatch writes nothing');
  stopSub('agm1');
  assert.deepEqual(ends(), [['m1', 'completed'], ['m1', 'completed']], 'the resumed run ends with its own completed end');
  stopSub('agm1');
  assert.equal(ends().length, 2, 'a repeated SubagentStop writes no third end');
  send('agm1', 'S2');
  boundary('SessionEnd', 'S1');
  assert.equal(ends().length, 2, 'a session other than the resuming one ends nothing');
  boundary('SessionEnd', 'S2');
  assert.deepEqual(ends().slice(2), [['m1', 'session-end']], 'a session end with the resumed run open ends it session-end');
  assert.equal(spawnOut({ hook_event_name: 'PreToolUse', tool_name: 'SendMessage', tool_input: { to: 5 }, cwd: tmp }), '', 'a malformed SendMessage writes nothing');

  // A warm cycle's edit (triage #992): an edit by the resumed implementer follows that dispatch's `dispatch-resume` line.
  reset();
  pre('02', 'w1', 'S1');
  bind('w1', 'agw1');
  stopSub('agw1');
  send('agw1');
  run({ hook_event_name: 'PostToolUse', tool_name: 'Edit', agent_id: 'agw1', tool_input: { file_path: path.join(A, 'slicetrees', '02', 'src', 'w.js') }, cwd: tmp });
  const kinds = trace(A).filter((l) => l[0] === '02').map((l) => l[2]);
  assert.ok(kinds.indexOf('edit') > kinds.indexOf('dispatch-resume') && kinds.indexOf('dispatch-resume') > 0, 'a resumed implementer edit sits after its dispatch-resume line');
  assert.equal(trace(A).find((l) => l[2] === 'edit')[1], 'agw1', 'the edit carries the resumed agent');

  // A SendMessage that fails or is denied leaves no subagent behind its resume line: it ends that run `failed` or `denied`.
  // A TaskStop ends a resumed run `stopped`. A failed SendMessage to a dispatch whose last run line is no resume writes nothing.
  reset();
  pre('01', 'n1', 'S1');
  bind('n1', 'agn1');
  const sendEnd = (hook_event_name, to, tool_use_id = 'sm') => run({ hook_event_name, tool_name: 'SendMessage', tool_use_id, tool_input: { to, message: 'go' }, cwd: tmp });
  sendEnd('PostToolUseFailure', 'agn1');
  assert.deepEqual(ends(), [], 'a failed SendMessage to a running dispatch ends nothing');
  stopSub('agn1');
  send('agn1');
  sendEnd('PostToolUseFailure', 'agn1');
  assert.deepEqual(ends(), [['n1', 'completed'], ['n1', 'failed']], 'a failed SendMessage ends the resumed run it opened');
  sendEnd('PostToolUseFailure', 'agn1');
  assert.equal(ends().length, 2, 'a second failure writes no third end');
  send('agn1');
  sendEnd('PermissionDenied', 'agn1');
  assert.deepEqual(ends().slice(2), [['n1', 'denied']], 'a denied SendMessage ends the resumed run it opened');
  send('agn1');
  run({ hook_event_name: 'PostToolUse', tool_name: 'TaskStop', tool_input: { task_id: 'agn1' }, cwd: tmp });
  assert.deepEqual(ends().slice(3), [['n1', 'stopped']], 'a TaskStop ends a resumed run stopped');

  // A second SendMessage to a resumed, still-running dispatch opened no run: its failure or denial ends nothing, and the
  // run's own SubagentStop still writes `completed`.
  reset();
  pre('01', 'p1', 'S1');
  bind('p1', 'agp1');
  stopSub('agp1');
  send('agp1', 'S1', 'sm1');
  send('agp1', 'S1', 'sm2');
  sendEnd('PostToolUseFailure', 'agp1', 'sm2');
  sendEnd('PermissionDenied', 'agp1', 'sm2');
  assert.deepEqual(ends(), [['p1', 'completed']], 'a failed or denied second SendMessage ends no live run');
  stopSub('agp1');
  assert.deepEqual(ends(), [['p1', 'completed'], ['p1', 'completed']], 'the live run still ends with its own SubagentStop');

  // A foreground dispatch binds too: its completed PostToolUse carries the agentId (the resume probe, Claude Code 2.1.296,
  // saw the first run's SubagentStop fire before that PostToolUse). A SendMessage to that agent reopens the dispatch, the
  // resumed run's SubagentStop ends it, a turn boundary leaves the resumed run open, and a session end ends it.
  reset();
  pre('01', 'q1', 'S1');
  stopSub('agq1');
  run(agentPost('q1', { status: 'completed', agentId: 'agq1' }));
  run(agentPost('q1', { status: 'completed', agentId: 'agq1' }));
  assert.deepEqual(ends(), [['q1', 'completed']], 'the first run of a foreground dispatch ends once');
  assert.equal(trace(A).filter((l) => l[2] === 'dispatch-bind').length, 1, 'a foreground dispatch gets one bind');
  send('agq1', 'S1', 'smq1');
  assert.deepEqual(resumes(), [['01', 'main', 'dispatch-resume', 'q1', 'agq1', 'S1', 'smq1']], 'a SendMessage reopens a completed foreground dispatch');
  stopSub('agq1');
  assert.deepEqual(ends(), [['q1', 'completed'], ['q1', 'completed']], 'the resumed run of a foreground dispatch ends with its own completed end');
  send('agq1', 'S1', 'smq2');
  boundary('Stop', 'S1');
  assert.equal(ends().length, 2, 'a turn boundary leaves the resumed run open');
  boundary('SessionEnd', 'S1');
  assert.deepEqual(ends().slice(2), [['q1', 'session-end']], 'a session end with the resumed run open ends it session-end');

  // A payload outside every run root or malformed records nothing; the spawned hook exits 0 with no output.
  const before = fs.readFileSync(path.join(A, 'trace.log'), 'utf8');
  pre('01', 'z1', 'S9');
  const withZ = fs.readFileSync(path.join(A, 'trace.log'), 'utf8');
  for (const ev of ['Stop', 'UserPromptSubmit', 'SessionEnd']) {
    assert.equal(spawnOut({ hook_event_name: ev, session_id: 'S9', cwd: path.join(tmp, 'no', 'such', 'dir') }), '');
    assert.equal(spawnOut({ hook_event_name: ev, cwd: tmp }), '', `${ev} with no session id`);
    assert.equal(spawnOut({ hook_event_name: ev, session_id: 9, cwd: tmp }), '', `${ev} with a non-string session id`);
    assert.equal(spawnOut({ hook_event_name: ev, session_id: 'S9', cwd: 42 }), '', `${ev} with a malformed cwd`);
  }
  const away = path.join(tmp, 'no', 'such', 'dir');
  for (const ev of [{ hook_event_name: 'PostToolUseFailure', tool_name: 'Agent', tool_use_id: 'z1' }, { hook_event_name: 'PermissionDenied', tool_name: 'Agent', tool_use_id: 'z1' }, { hook_event_name: 'PostToolUse', tool_name: 'TaskStop', tool_input: { task_id: 'agz1' } }]) {
    assert.equal(spawnOut({ ...ev, session_id: 'S9', cwd: away }), '', `${ev.hook_event_name} ${ev.tool_name} outside every run root`);
  }
  assert.equal(spawnOut(null, '{"hook_event_name":"Stop"'), '');
  assert.equal(fs.readFileSync(path.join(A, 'trace.log'), 'utf8'), withZ, 'none of them wrote a line');
  assert.ok(withZ.startsWith(before));
  for (const ev of [{ hook_event_name: 'PostToolUseFailure', tool_name: 'Agent' }, { hook_event_name: 'PermissionDenied', tool_name: 'Agent', tool_use_id: 7 }, { hook_event_name: 'PostToolUse', tool_name: 'TaskStop' }, { hook_event_name: 'PostToolUse', tool_name: 'TaskStop', tool_input: { task_id: 5 } }]) {
    assert.equal(spawnOut({ ...ev, cwd: tmp }), '');
  }
  assert.equal(fs.readFileSync(path.join(A, 'trace.log'), 'utf8'), withZ, 'a malformed end event wrote nothing');

  // hooks.json runs the turn and session boundaries in every repository: one with no `.superdev/scopes` directory gets
  // nothing written, and the hook exits 0 silently.
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'run-trace-bare-'));
  cp.execFileSync('git', ['init', '-q', bare]);
  for (const ev of ['Stop', 'UserPromptSubmit', 'SessionEnd']) assert.equal(spawnOut({ hook_event_name: ev, session_id: 'S9', cwd: bare }), '', `${ev} in a repository with no run`);
  assert.deepEqual(fs.readdirSync(bare), ['.git'], 'the boundaries wrote nothing in a repository with no run');
  fs.rmSync(bare, { recursive: true, force: true });

  // hooks.json registers the end events for run-trace.js.
  const hooks = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8')).hooks;
  const runsTrace = (g) => g.hooks.some((h) => h.command.includes('hooks/run-trace.js'));
  for (const ev of ['PostToolUseFailure', 'PermissionDenied']) for (const tool of ['Agent', 'SendMessage']) assert.ok(hooks[ev].some((g) => g.matcher.split('|').includes(tool) && runsTrace(g)), `${ev} on ${tool} runs run-trace.js`);
  assert.ok(hooks.PostToolUse.some((g) => g.matcher.split('|').includes('TaskStop') && runsTrace(g)), 'PostToolUse on TaskStop runs run-trace.js');
  for (const ev of ['Stop', 'UserPromptSubmit', 'SessionEnd']) assert.ok(hooks[ev].some(runsTrace), `${ev} runs run-trace.js`);
  assert.ok(hooks.PreToolUse.some((g) => g.matcher === 'SendMessage' && runsTrace(g)), 'PreToolUse on SendMessage runs run-trace.js');
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
  const hook = (ev, id, cwd, extra) => {
    if (ev === 'Dispatch') { run(agentPre(extra.prompt, 't-' + id, 'superdev:implementer', extra.description || 'd')); run(agentPost('t-' + id, { status: 'async_launched', agentId: id }, R)); return; }
    run(Object.assign({ hook_event_name: ev, agent_id: id, agent_type: 'superdev:implementer', description: 'd', cwd }, extra));
  };
  const ends = () => trace(C).filter((l) => l[2] === 'dispatch-end');
  hook('Dispatch', 'w1', tmp, { prompt: `${C}/slicetrees/07` });
  hook('SubagentStop', 'w1', path.join(R, 'plugin'));
  assert.deepEqual(ends().map((l) => l.slice(0, 2).concat(l[4])), [['07', 'main', 't-w1']], 'a subdirectory cwd of the main checkout records the end');
  hook('Dispatch', 'w2', tmp, { prompt: `${C}/slicetrees/07` });
  hook('SubagentStop', 'w2', WT);
  assert.equal(ends().length, 2, 'a worktree cwd records the end');
  assert.equal(ends()[1][4], 't-w2');

  // Windows backslash paths record like the forward-slash form; a newline in the description stays on one line.
  hook('Dispatch', 'w3', tmp, { prompt: `${C}/slicetrees/07`.replace(/\//g, '\\'), description: 'a\nb' });
  const d = fs.readFileSync(path.join(C, 'trace.log'), 'utf8').split('\n').filter((l) => l.includes(' t-w3 ') && l.includes(' dispatch '));
  assert.equal(d.length, 1, 'one line for the dispatch');
  assert.ok(d[0].includes(' dispatch superdev:implementer t-w3 a'), 'backslash prompt records the dispatch');
  assert.ok(d[0].endsWith(' a\\nb -'), 'newline escaped on one line, and no session id reads `-`');
}

// A git call that stalls while SubagentStop resolves the main checkout ends at the bound and records nothing.
{
  const R = fs.mkdtempSync(path.join(tmp, 'stall-'));
  const C = path.join(R, '.superdev', 'scopes', 'c');
  fs.mkdirSync(path.join(R, 'sub'), { recursive: true });
  fs.mkdirSync(C, { recursive: true });
  cp.execFileSync('git', ['init', '-q'], { cwd: R });
  fs.writeFileSync(path.join(C, 'ledger.md'), ledger([['07', 'in-progress']]));
  const ev = (name, cwd, extra) => Object.assign({ hook_event_name: name, agent_id: 'st1', agent_type: 'superdev:implementer', description: 'd', cwd }, extra);
  run(agentPre(`${C}/slicetrees/07`, 'tst1'));
  run(agentPost('tst1', { status: 'async_launched', agentId: 'st1' }, R));
  const bin = path.join(tmp, 'stall-bin');
  fs.mkdirSync(bin, { recursive: true });
  // exec leaves no grandchild holding the stdout pipe once the bound kills the stub.
  const marker = path.join(bin, 'called');
  fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\necho git >> '${marker}'\nexec sleep 20\n`, { mode: 0o755 });
  const r = cp.spawnSync(process.execPath, [hookPath], { input: JSON.stringify(ev('SubagentStop', path.join(R, 'sub'))), encoding: 'utf8', timeout: GIT_SPAWN_BOUND_MS, env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH } });
  assertSpawnDecided(r, 'run-trace.js SubagentStop with a stalled git');
  assert.ok(fs.existsSync(marker), 'the hook reached the stalled git stub');
  assert.deepEqual(trace(C).filter((l) => l[2] === 'dispatch-end'), [], 'a killed git call records no dispatch-end');
}

// SubagentStop from inside a submodule resolves the submodule's own checkout, never `.git/modules`.
{
  const gitIn = (cwd, ...a) => cp.execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'protocol.file.allow=always', ...a], { cwd, stdio: 'ignore' });
  const lib = fs.mkdtempSync(path.join(tmp, 'lib-'));
  const sup = fs.mkdtempSync(path.join(tmp, 'sup-'));
  gitIn(lib, 'init', '-q');
  gitIn(lib, 'commit', '-q', '--allow-empty', '-m', 'x');
  gitIn(sup, 'init', '-q');
  gitIn(sup, 'submodule', 'add', '-q', lib, 'vendor/lib');
  const sub = path.join(sup, 'vendor', 'lib');
  const S = path.join(sub, '.superdev', 'scopes', 's');
  fs.mkdirSync(S, { recursive: true });
  fs.writeFileSync(path.join(S, 'ledger.md'), ledger([['09', 'in-progress']]));
  run(agentPre(`${S}/slicetrees/09`, 'tsm1'));
  run(agentPost('tsm1', { status: 'async_launched', agentId: 'sm1' }, sub));
  run({ hook_event_name: 'SubagentStop', agent_id: 'sm1', agent_type: 'superdev:implementer', cwd: sub });
  assert.deepEqual(trace(S).filter((l) => l[2] === 'dispatch-end').map((l) => l[4]), ['tsm1'], 'a submodule cwd records the end under the submodule checkout');
}


// No review writes a verdict line (ADR 0197): a background review's hand-back and stop, a foreground review's report, and a
// resumed review write only their dispatch lines, and hooks.json runs no hook on a hand-back. A trace an older release
// wrote, carrying `verdict` and `final-verdict` lines, still prints through `scope.js trace`.
{
  reset();
  const PASS = '### Verdict: specification ✅ | quality: approved';
  const bg = (slice, tu, type, ag) => { run(agentPre(`${A}/${slice}`, tu, type)); run(agentPost(tu, { status: 'async_launched', agentId: ag })); };
  const stop = (ag, type, last) => run({ hook_event_name: 'SubagentStop', agent_id: ag, agent_type: type, last_assistant_message: last, cwd: tmp });
  appendTrace(A, { slice: 'scope', agent: 'main', kind: 'ledger', fields: ['step', 'set', 'review'] });
  bg('slicetrees/04', 'v1', 'superdev:slice-reviewer', 'av1');
  run({ hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback', agent_id: 'av1', tool_input: { message: PASS }, cwd: tmp });
  stop('av1', 'superdev:slice-reviewer', PASS);
  bg('scopetree', 'v2', 'superdev:final-reviewer', 'av2');
  stop('av2', 'superdev:final-reviewer', 'Ready to merge? Yes');
  run({ hook_event_name: 'PreToolUse', tool_name: 'SendMessage', tool_use_id: 'smv', tool_input: { to: 'av2', message: 'again' }, session_id: 'S1', cwd: tmp });
  stop('av2', 'superdev:final-reviewer', 'Ready to merge? No');
  run(agentPre(`Review ${A}/slicetrees/05`, 'v3', 'superdev:slice-reviewer'));
  run(agentPost('v3', { status: 'completed', agentId: 'av3', handbackReport: { text: PASS } }));
  run(agentPre(`Review ${A}/scopetree`, 'v4', 'superdev:final-reviewer'));
  run(agentPost('v4', { status: 'completed', handbackReport: 'Ready to merge? With fixes' }));
  const kinds = trace(A).map((l) => l[2]);
  assert.ok(!kinds.includes('verdict') && !kinds.includes('final-verdict'), 'no review writes a verdict line');
  assert.deepEqual(trace(A).filter((l) => l[2] !== 'ledger').map((l) => `${l[2]} ${l[l[2] === 'dispatch-resume' ? 3 : 4]}`),
    ['dispatch v1', 'dispatch-bind v1', 'dispatch-end v1', 'dispatch v2', 'dispatch-bind v2', 'dispatch-end v2', 'dispatch-resume v2', 'dispatch-end v2',
      'dispatch v3', 'dispatch-bind v3', 'dispatch-end v3', 'dispatch v4', 'dispatch-end v4'], 'every dispatch line is written');
  const registered = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8')).hooks;
  assert.ok(!Object.values(registered).flat().some((g) => (g.matcher || '').split('|').includes('SubagentHandback')), 'no hook runs on a hand-back');
  appendTrace(A, { slice: '04', agent: 'main', kind: 'verdict', fields: ['v1', 'pass', 'approved', '0', '-'] });
  appendTrace(A, { slice: 'scope', agent: 'main', kind: 'final-verdict', fields: ['v2', 'yes', '0'] });
  const shown = cp.spawnSync(process.execPath, [require.resolve('../plugin/scripts/scope.js'), 'trace', '--root', A], { encoding: 'utf8', timeout: 10000 });
  assertSpawnDecided(shown, 'scope.js trace');
  assert.equal(shown.status, 0, shown.stderr);
  assert.ok(/\bverdict v1 pass approved\b/.test(shown.stdout) && /\bfinal-verdict v2 yes\b/.test(shown.stdout), 'an old trace\'s verdict lines still print');
}

cleanup();
