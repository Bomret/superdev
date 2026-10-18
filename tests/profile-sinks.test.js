'use strict';

// Suite for the run profile's time sinks: fixed rules over a scope's machine time (ADR 0143, INV-0148, INV-0149).

const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const { profile, render } = require('../plugin/scripts/profile.js');
const { ts, user, cmd, use, result, say, hook, bgUse, bgNote, writeTree, enc, tmp, REPO } = require('./profile-setup.js');

// --- time sinks: fixed rules over the whole scope, each holding at least 20% of machine time (ADR 0143,
// INV-0148, INV-0149) ----------------------------------------------------------------------------
{
  const sinkRun = (entries, agents) => {
    const dir = path.join(tmp(), 'projects');
    writeTree(dir, { [enc(REPO)]: { s: { entries: [cmd(0, REPO, 'implement', 'feat/alpha'), ...entries], agents } } });
    return profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  };
  const names = (p) => p.sinks.map((s) => s.name);
  const sink = (p, name) => p.sinks.find((s) => s.name === name);
  const SC = 'node plugin/scripts/scope.js';
  const FOCUSED_LEVER = /^Lever: the focused command in `docs\/agents\/verification\.md`, which did not narrow for this change set\.$/;
  const REVIEW_TESTS_LEVER = /^Lever: `\/superdev:review-tests`/;
  const PERMISSION_LEVER = /^Lever: the permission mode\.$/;
  const NO_LEVER = /^The repository holds no lever for it\.$/;
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');

  // test runs and model time; model time at exactly 20% fires.
  let p = sinkRun([use(1, REPO, 't1', 'Bash', { command: `${SC} test full` }), result(81, REPO, 't1'), say(100, REPO)]);
  assert.equal(p.machine, 100000);
  assert.deepEqual(names(p), ['test runs', 'model time'], 'longest first; model time at exactly 20% fires');
  assert.equal(sink(p, 'test runs').ms, 80000);
  assert.match(sink(p, 'test runs').lever, REVIEW_TESTS_LEVER, 'one kind of run only: the lever is /superdev:review-tests');
  assert.match(sink(p, 'model time').lever, NO_LEVER);
  // just under 20%: model time 19.9 s of 99.9 s does not fire.
  p = sinkRun([use(1, REPO, 't1', 'Bash', { command: `${SC} test full` }), result(81, REPO, 't1'), say(99.9, REPO)]);
  assert.deepEqual(names(p), ['test runs'], 'a cause just under 20% does not fire');
  // ties list by name.
  p = sinkRun([use(0, REPO, 't1', 'Bash', { command: `${SC} test full` }), result(50, REPO, 't1'), say(100, REPO)]);
  assert.deepEqual(names(p), ['model time', 'test runs'], 'equal figures list by name');

  // the test-run lever: focused median at 80% of the full-or-whole median names the focused command.
  const runs = (focused, other, otherMode = 'full') => sinkRun([
    use(0, REPO, 'f1', 'Bash', { command: `${SC} test focused a.js` }), result(focused, REPO, 'f1'),
    use(focused, REPO, 'f2', 'Bash', { command: `${SC} test focused b.js` }), result(2 * focused, REPO, 'f2'),
    use(2 * focused, REPO, 'f3', 'Bash', { command: `${SC} test focused c.md` }), result(3 * focused, REPO, 'f3'),
    ...(other ? [use(3 * focused, REPO, 'u1', 'Bash', { command: `${SC} test ${otherMode}` }), result(3 * focused + other, REPO, 'u1')] : []),
    say(3 * focused + other + 1, REPO),
  ]);
  p = runs(10, 12.5);
  assert.match(sink(p, 'test runs').lever, FOCUSED_LEVER, 'focused median exactly 80% of the full median names the focused command');
  assert.match(sink(p, 'test runs').detail, /4 runs/);
  assert.match(sink(p, 'test runs').detail, /test focused 3×, 30s, median 10s/);
  assert.match(sink(p, 'test runs').detail, /test full 1×, 13s, median 13s/);
  assert.match(sink(runs(10, 12.5, 'whole'), 'test runs').lever, FOCUSED_LEVER, 'a whole run counts with the full runs');
  assert.match(sink(runs(10, 12.6), 'test runs').lever, REVIEW_TESTS_LEVER, 'below 80% names /superdev:review-tests');
  assert.match(sink(runs(10, 0), 'test runs').lever, REVIEW_TESTS_LEVER, 'focused runs alone name /superdev:review-tests');

  // the repository's configured verification commands, run directly, are test runs too.
  const verifiedRun = (fences, entries) => {
    const repo = tmp();
    fs.mkdirSync(path.join(repo, 'docs', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'docs', 'agents', 'verification.md'),
      `# Verification\n\n${fences.map((f) => `\`\`\`\n${f}\n\`\`\`\n`).join('\n')}`);
    const dir = path.join(tmp(), 'projects');
    writeTree(dir, { [enc(repo)]: { s: { entries: [cmd(0, repo, 'implement', 'feat/alpha'), ...entries(repo)] } } });
    return profile({ projectsDir: dir, repoRoot: repo, slug: 'alpha' });
  };
  p = verifiedRun(['bun run test'], (r) => [use(1, r, 't1', 'Bash', { command: 'bun run test' }), result(81, r, 't1'), say(100, r)]);
  assert.deepEqual(names(p), ['test runs', 'model time'], 'the configured full command is a test run, not a command sink');
  assert.equal(sink(p, 'test runs').ms, 80000);
  const directRuns = (focused, full) => verifiedRun(['bun run test', 'node scripts/run-tests.js --related {paths}'], (r) => [
    use(0, r, 'f1', 'Bash', { command: 'node scripts/run-tests.js --related a.js' }), result(focused, r, 'f1'),
    use(focused, r, 'f2', 'Bash', { command: 'node scripts/run-tests.js --related b.js c.md' }), result(2 * focused, r, 'f2'),
    use(2 * focused, r, 'f3', 'Bash', { command: 'bun run test' }), result(2 * focused + full, r, 'f3'),
    say(2 * focused + full + 1, r),
  ]);
  assert.match(sink(directRuns(10, 12.5), 'test runs').lever, FOCUSED_LEVER, 'the 80% lever rule reads the configured focused and full commands');
  assert.match(sink(directRuns(10, 12.5), 'test runs').detail, /3 runs/);
  assert.match(sink(directRuns(10, 12.6), 'test runs').lever, REVIEW_TESTS_LEVER, 'below 80% names /superdev:review-tests');
  assert.match(sink(directRuns(10, 12.5), 'test runs').detail, /test focused 2×, 20s, median 10s; test full 1×, 13s, median 13s/,
    'a configured run is labelled by its mode, comparable with the runner rows');
  // a full and a focused command sharing one key: each run's own text decides its mode.
  const pytestRuns = (focused, full) => verifiedRun(['pytest', 'pytest {paths}'], (r) => [
    use(0, r, 'f1', 'Bash', { command: 'pytest a.py' }), result(focused, r, 'f1'),
    use(focused, r, 'f2', 'Bash', { command: 'pytest b.py c.py' }), result(2 * focused, r, 'f2'),
    use(2 * focused, r, 'f3', 'Bash', { command: 'pytest a.py 2>&1 | tail -5' }), result(3 * focused, r, 'f3'),
    use(3 * focused, r, 'u1', 'Bash', { command: 'pytest' }), result(3 * focused + full, r, 'u1'),
    say(3 * focused + full + 1, r),
  ]);
  assert.match(sink(pytestRuns(10, 12.5), 'test runs').lever, FOCUSED_LEVER, 'focused runs sharing the full command\'s key still count as focused');
  assert.match(sink(pytestRuns(10, 12.6), 'test runs').lever, REVIEW_TESTS_LEVER);
  // a run of the focused command's program with no paths did not narrow: it is a full run.
  p = verifiedRun(['bun run test', 'node scripts/run-tests.js --related {paths}'], (r) => [
    use(1, r, 't1', 'Bash', { command: 'node scripts/run-tests.js' }), result(81, r, 't1'), say(100, r)]);
  assert.match(sink(p, 'test runs').detail, /; test full 1×/, 'a bare node scripts/run-tests.js is not labelled focused');

  // permission mode: tool time in a prompting phase.
  p = sinkRun([use(1, REPO, 'g1', 'Bash', { command: 'git status' }), result(61, REPO, 'g1', { permissionMode: 'default' }), say(70, REPO)]);
  assert.deepEqual(names(p), ['command: git status', 'permission mode']);
  assert.match(sink(p, 'permission mode').detail, /#1 implement/);
  assert.match(sink(p, 'permission mode').detail, /approval waits are inside this time/);
  assert.match(sink(p, 'permission mode').lever, PERMISSION_LEVER);
  assert.match(sink(p, 'command: git status').lever, NO_LEVER, 'a command sink carries no remedy');
  assert.match(sink(p, 'command: git status').detail, /1×, 1m00s/);
  p = sinkRun([use(1, REPO, 'g1', 'Bash', { command: 'git status' }), result(61, REPO, 'g1'), say(70, REPO)]);
  assert.ok(!names(p).includes('permission mode'), 'an auto-mode phase gives no permission sink');

  // subagent time per agent type.
  const agentRun = (end) => sinkRun([
    use(5, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
    result(end + 1, REPO, 'a1', { toolUseResult: { totalDurationMs: (end - 4) * 1000, totalToolUseCount: 1, totalTokens: 1 } }),
    say(100, REPO),
  ], { x1: { meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' }, entries: [user(6, SLICE, 'go'), say(end, SLICE)] } });
  p = agentRun(84);
  assert.equal(sink(p, 'subagent time: superdev:implementer').ms, 78000);
  assert.match(sink(p, 'subagent time: superdev:implementer').lever, NO_LEVER);
  assert.ok(!names(agentRun(9)).some((n) => n.startsWith('subagent time')), 'a short dispatch gives no subagent sink');

  // hook time per event.
  const hookRun = (ms) => sinkRun([use(1, REPO, 'b1', 'Bash', { command: 'git status' }), hook(1, REPO, 'PreToolUse', 'PreToolUse:Bash', ms),
    result(41, REPO, 'b1'), say(100, REPO)]);
  p = hookRun(30000);
  assert.equal(sink(p, 'hook time: PreToolUse:Bash').ms, 30000);
  assert.match(sink(p, 'hook time: PreToolUse:Bash').lever, NO_LEVER);
  assert.ok(!names(hookRun(1000)).some((n) => n.startsWith('hook time')), 'a short hook gives no hook sink');
  // parallel Stop hooks: the sink figure is the slowest one, the wait the session had.
  p = sinkRun([say(5, REPO),
    { type: 'system', subtype: 'stop_hook_summary', timestamp: ts(35), cwd: REPO,
      hookInfos: [{ command: 'node stop-a.js', durationMs: 30000 }, { command: 'node stop-b.js', durationMs: 30000 }] },
    user(60, REPO, 'go on'), say(100, REPO)]);
  assert.equal(sink(p, 'hook time: Stop').ms, 30000, 'two parallel 30 s Stop hooks are a 30 s sink, not 60 s');

  // a foreground loop polling a background test run fires no command sink; the test-run sink carries it.
  p = sinkRun([
    bgUse(1, REPO, 'g1', `${SC} test full`), result(2, REPO, 'g1'),
    use(3, REPO, 'p1', 'Bash', { command: 'sleep 30; tail -5 /tmp/log' }), result(33, REPO, 'p1'),
    use(34, REPO, 'p2', 'Bash', { command: 'sleep 30; tail -5 /tmp/log' }), result(64, REPO, 'p2'),
    use(65, REPO, 'p3', 'Bash', { command: 'sleep 30; tail -5 /tmp/log' }), result(95, REPO, 'p3'),
    say(96, REPO), bgNote(101, REPO, 'g1'), say(102, REPO),
  ]);
  assert.deepEqual(names(p), ['test runs'], 'the polling loop fires no command sink');
  assert.equal(sink(p, 'test runs').ms, 100000);
  p = sinkRun([use(1, REPO, 's1', 'Bash', { command: 'sleep 60' }), result(61, REPO, 's1'), say(70, REPO)]);
  assert.deepEqual(names(p), ['command: sleep'], 'the same loop with no background test run is a command sink');

  // the wait sink: alone when machine time is zero, and beside the machine sinks otherwise.
  p = sinkRun([say(0, REPO), user(60, REPO, 'go on')]);
  assert.equal(p.machine, 0);
  assert.deepEqual(names(p), ['human wait and idle'], 'with no machine time only the wait sink fires');
  assert.match(sink(p, 'human wait and idle').detail, /human wait 1m00s and idle 0\.0s exceed machine time 0\.0s; this time was not machine time/);
  assert.match(sink(p, 'human wait and idle').lever, NO_LEVER);
  p = sinkRun([say(5, REPO), user(65, REPO, 'go on'), say(70, REPO)]);
  assert.deepEqual(names(p), ['human wait and idle', 'model time']);
  assert.ok(!names(sinkRun([say(5, REPO), user(6, REPO, 'go on'), say(70, REPO)])).includes('human wait and idle'), 'a short wait gives no wait sink');

  // human wait and idle never enter a machine figure or the denominator (INV-0102).
  p = sinkRun([bgUse(1, REPO, 'g1', `${SC} test full`), result(2, REPO, 'g1'), say(10, REPO), user(50, REPO, 'go on'), say(52, REPO),
    bgNote(101, REPO, 'g1'), say(102, REPO)]);
  assert.equal(p.machine, 62000, 'the denominator is wall time less human wait and idle');
  assert.equal(sink(p, 'test runs').ms, 60000, 'the test run leaves out the human wait it spanned');

  // no rule fires; the exclusion note.
  const spread = ['git status', 'git log', 'git diff', 'ls', 'echo a', 'pwd']
    .flatMap((c, i) => [use(15 * i, REPO, `c${i}`, 'Bash', { command: c }), result(15 * i + 15, REPO, `c${i}`)]);
  p = sinkRun([...spread, say(100, REPO)]);
  assert.deepEqual(p.sinks, [], 'no cause holds 20%');
  let text = render(p);
  assert.match(text, /\nTime sinks/);
  assert.match(text, /No dominant cause was found\./);
  assert.doesNotMatch(text, /exclude/);
  p = sinkRun([...spread, use(95, REPO, 'r1', 'Read', {}), say(100, REPO)]);
  assert.match(render(p), /These figures exclude 1 unfinished call and 0 unrecognized entries\./);

  // the section prints each sink with its figures and its lever, after every other section.
  text = render(runs(10, 12.5));
  assert.match(text, /Time sinks — machine time 44s; a machine-time sink holds at least 20% of it\n {2}43s {2}test runs: 4 runs/);
  assert.match(text, /\n {2}Lever: the focused command in `docs\/agents\/verification\.md`, which did not narrow for this change set\.\n/);
  assert.ok(text.trimEnd().endsWith('this change set.'), 'the section closes the report');
}
console.log('profile-sinks.test.js ok');
