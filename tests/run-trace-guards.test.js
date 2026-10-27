'use strict';

// Suite for the run-trace hook's failure posture (INV-0140, INV-0159): with any module it loads unloadable, or a function of a loaded
// module throwing, the hook records nothing. Each case confirms its stub loaded.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { readTrace, appendTrace } = require('../plugin/scripts/scope.js');
const { tmp, ledger, A, S3, trace, reset, run, edit, bash, hookPath, agentPre, cleanup } = require('./run-trace-setup');

// With shell-words.js unloadable, or scan throwing, the hook records nothing; a control run records.
{
  const preload = path.join(tmp, 'preload.js');
  const write = path.join(S3, 'src', 'unloadable.js');
  // `setup` runs in-process first, scanner loadable; `events` are recorded in the spawned hook; returns the lines `events` added.
  const prepare = (events, setup) => {
    reset();
    if (setup) setup();
    return { before: trace(A).length, evs: events || [{ tool_name: 'Bash', tool_input: { command: `echo x > ${write}` }, cwd: tmp }] };
  };
  // Spawned: a real process loads the hook with `patch` preloaded.
  const spawnRuns = (patch, events, setup) => {
    fs.writeFileSync(preload, patch);
    const { before, evs } = prepare(events, setup);
    const code = `const { record } = require(${JSON.stringify(hookPath)}); for (const e of ${JSON.stringify(evs)}) { try { record(e); } catch { /* main() never blocks the tool call */ } }`;
    const r = cp.spawnSync(process.execPath, ['-r', preload, '-e', code], { encoding: 'utf8', timeout: 10000 });
    assertSpawnDecided(r, 'run-trace.js with a broken scanner');
    assert.equal(r.status, 0, r.stderr);
    return trace(A).slice(before).map((l) => l[2]);
  };
  // In-process: the hook and every module under plugin/ load afresh with `patch` run first, and `Module._load` and the require cache
  // come back as they were, whatever the hook does.
  const pluginDir = path.join(path.dirname(hookPath), '..') + path.sep;
  const Module = require('node:module');
  const hookRuns = (patch, events, setup) => {
    const { before, evs } = prepare(events, setup);
    const savedLoad = Module._load;
    const savedCache = Object.entries(require.cache).filter(([k]) => k.startsWith(pluginDir));
    const dropPlugin = () => { for (const k of Object.keys(require.cache)) if (k.startsWith(pluginDir)) delete require.cache[k]; };
    try {
      dropPlugin();
      new Function('require', patch)(require);
      const { record: fresh } = require(hookPath);
      for (const e of evs) { try { fresh(e); } catch { /* main() never blocks the tool call */ } }
    } finally {
      Module._load = savedLoad;
      dropPlugin();
      for (const [k, v] of savedCache) require.cache[k] = v;
    }
    return trace(A).slice(before).map((l) => l[2]);
  };
  // A scenario's control spawns once, however many failure rows share it.
  const controls = new Map();
  const control = (what, evs, setup, real) => {
    if (!controls.has(evs)) controls.set(evs, new Map());
    const bySetup = controls.get(evs);
    if (!bySetup.has(setup)) bySetup.set(setup, spawnRuns('', evs, setup));
    assert.deepEqual(bySetup.get(setup), real, `control: ${what}`);
  };
  // A stub matches only the request its requiring module makes for `mod`: the hook's own `../lib/<mod>.js`, or the `./<mod>.js` of
  // another module of lib/. It marks its load in the file named by `marker`.
  const marker = path.join(tmp, 'stub-loaded');
  const requests = (mod) => `/^(?:\\.\\.\\/lib|\\.)\\/${mod}\\.js$/.test(req)`;
  const intercept = (body) => `const M = require('module'); const load = M._load; M._load = function (req, ...a) { if (${requests('shell-words')}) { require('fs').writeFileSync(${JSON.stringify(marker)}, 'x'); ${body} } return load.call(this, req, ...a); };`;
  const loaded = (what) => { assert.ok(fs.existsSync(marker), `the stub loaded: ${what}`); fs.rmSync(marker); };
  const unloadable = intercept("throw new Error('gone');");
  fs.rmSync(marker, { force: true });
  assert.deepEqual(spawnRuns(''), ['edit'], 'control: the write records');
  assert.ok(!fs.existsSync(marker), 'control: no stub loaded');
  // The one spawned failure row: the posture holds across a real process; every other row runs in-process.
  assert.deepEqual(spawnRuns(unloadable), [], 'shell-words.js unloadable records nothing, spawned');
  loaded('unloadable scanner, spawned');
  // An in-process row restores the module loader and the require cache.
  const loadBefore = Module._load;
  const hookBefore = require.cache[hookPath];
  assert.deepEqual(hookRuns(unloadable), [], 'shell-words.js unloadable records nothing');
  loaded('unloadable scanner');
  assert.equal(Module._load, loadBefore, 'the module loader is restored');
  assert.equal(require.cache[hookPath], hookBefore, 'the require cache is restored');
  assert.deepEqual(hookRuns(''), ['edit'], 'in-process control: the write records after a stubbed row');
  assert.ok(!fs.existsSync(marker), 'in-process control: no stub loaded');
  assert.deepEqual(hookRuns(intercept('return { scan() { throw new Error("boom"); } };')), [], 'scan throwing records nothing');
  loaded('scan throwing');
  // Each module the hook loads, directly or through another module of lib/, each unloadable on its own: nothing records, and the
  // stub at its requiring module's request loaded.
  const MODULES = ['ledger', 'trace-log', 'verification', 'main-work-tree', 'bash-command', 'bash-writes', 'test-runs', 'run-tree', 'dispatch',
    'dispatch-lines', 'verdicts', 'start-stash'];
  for (const mod of MODULES) {
    const stub = `const M = require('module'); const load = M._load; M._load = function (req, ...a) { if (${requests(mod)}) { require('fs').writeFileSync(${JSON.stringify(marker)}, 'x'); throw new Error('gone'); } return load.call(this, req, ...a); };`;
    assert.deepEqual(hookRuns(stub), [], `${mod}.js unloadable records nothing`);
    loaded(`unloadable ${mod}.js`);
  }
  // A scanner that loads but whose function throws, or is absent, leaves no partial trace: an event's lines write together or not at all.
  const withScanner = (override) => intercept(`const r = load.call(this, req, ...a); return Object.assign({}, r, ${override});`);
  const verifyFile = path.join(S3, 'docs', 'agents', 'verification.md');
  const setupVerify = () => {
    fs.mkdirSync(path.dirname(verifyFile), { recursive: true });
    fs.writeFileSync(verifyFile, '# V\n\n```sh\nbun run test\n```\n\n```sh\nbun run test\n```\n');
  };
  const boom = (name) => `{ ${name}() { throw new Error("boom"); } }`;
  // Each event runs a test and one more command; the throwing function is one that command's scan calls.
  const both = [
    ['a write', `bun run test; echo x > ${write}`, ['run', 'edit'], [['drivePath throwing', boom('drivePath')], ['drivePath missing', '{ drivePath: undefined }'], ['gitSubcommand missing', '{ gitSubcommand: undefined }']]],
    ['a restore', 'bun run test; git checkout -- src/a.js', ['run', 'restore'], [['gitSubcommand throwing', boom('gitSubcommand')], ['drivePath missing', '{ drivePath: undefined }'], ['gitSubcommand missing', '{ gitSubcommand: undefined }']]],
  ];
  for (const [what, command, real, broken] of both) {
    const evs = [{ tool_name: 'Bash', tool_input: { command }, cwd: S3 }];
    control(`a test run and ${what} record`, evs, setupVerify, real);
    for (const [name, override] of broken) {
      assert.deepEqual(hookRuns(withScanner(override), evs, setupVerify), [], `${name} on a test run and ${what} records nothing`);
      loaded(`${name} on ${what}`);
    }
  }
  // A scanner function that throws only for some inputs drops the whole event too, not just the line that read that input.
  const only = (name, arg, args) => `{ ${name}: (...a) => { if (${arg} === ${JSON.stringify(args)}) throw new Error("boom"); return r.${name}(...a); } }`;
  const picky = [
    ['drivePath throwing for one patch file', `bun run test; git apply fix.diff`, ['run', 'edit'], only('drivePath', 'a[0]', 'fix.diff')],
    ['scan throwing for one word', `bun run test; echo x > ${write}`, ['run', 'edit'], only('scan', 'a[0]', write)],
  ];
  for (const [name, command, real, override] of picky) {
    const evs = [{ tool_name: 'Bash', tool_input: { command }, cwd: S3 }];
    fs.writeFileSync(path.join(S3, 'fix.diff'), '--- a/x\n+++ b/x\n');
    control(name, evs, setupVerify, real);
    assert.deepEqual(hookRuns(withScanner(override), evs, setupVerify), [], `${name} records nothing`);
    loaded(name);
    fs.rmSync(path.join(S3, 'fix.diff'), { force: true });
  }
  fs.rmSync(verifyFile, { force: true });
  // The core loads but its reader module is absent: the real core's own require throws.
  const readersGone = `const M = require('module'); const load = M._load; M._load = function (req, ...a) { if (req === './shell-word-readers.js') { require('fs').writeFileSync(${JSON.stringify(marker)}, 'x'); throw new Error('gone'); } return load.call(this, req, ...a); };`;
  assert.deepEqual(hookRuns(readersGone), [], 'a core without its reader module records nothing');
  loaded('missing reader module');
  // A non-Bash event records nothing either (INV-0140): a bound slice-reviewer's hand-back and stop write no verdict and no end.
  const bound = () => {
    run({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: 'ur1', tool_input: { prompt: `${S3}`, subagent_type: 'superdev:slice-reviewer', description: 'review' }, cwd: tmp });
    run({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: 'ur1', tool_response: { status: 'async_launched', agentId: 'aur1' }, cwd: tmp });
  };
  const review = [
    { hook_event_name: 'PostToolUse', tool_name: 'SubagentHandback', agent_id: 'aur1', agent_type: 'superdev:slice-reviewer', tool_input: { message: '### Verdict: specification ✅ | quality: approved' }, cwd: tmp },
    { hook_event_name: 'SubagentStop', agent_id: 'aur1', agent_type: 'superdev:slice-reviewer', cwd: tmp },
  ];
  control('the review records its verdict and end', review, bound, ['verdict', 'dispatch-end']);
  assert.deepEqual(hookRuns(unloadable, review, bound), [], 'shell-words.js unloadable records no verdict and no dispatch-end');
  loaded('unloadable scanner on a review');
  // A state module that loads but whose function throws: the event records nothing, and the stub at its requiring module's request loaded.
  const withLib = (mod, override) => `const M = require('module'); const load = M._load; M._load = function (req, ...a) { if (${requests(mod)}) { require('fs').writeFileSync(${JSON.stringify(marker)}, 'x'); const r = load.call(this, req, ...a); return Object.assign({}, r, ${override}); } return load.call(this, req, ...a); };`;
  const verifyEvs = [{ tool_name: 'Bash', tool_input: { command: `bun run test; echo x > ${write}` }, cwd: S3 }];
  control('a test run and a write record', verifyEvs, setupVerify, ['run', 'edit']);
  assert.deepEqual(hookRuns(withLib('verification', boom('verificationCommands')), verifyEvs, setupVerify), [], 'verificationCommands throwing records nothing');
  loaded('verificationCommands throwing');
  fs.rmSync(verifyFile, { force: true });
  assert.deepEqual(hookRuns(withLib('trace-log', boom('readTrace')), review, bound), [], 'readTrace throwing records no verdict and no dispatch-end');
  loaded('readTrace throwing on a review');
  assert.deepEqual(hookRuns(withLib('main-work-tree', boom('mainWorkTree')), review, bound), [], 'mainWorkTree throwing records no verdict and no dispatch-end');
  loaded('mainWorkTree throwing on a review');
  // Every function a lib module hands the hook, absent or throwing, on the event that calls it: nothing records, and the stub at its
  // requiring module's request loaded. A review's verdict and its dispatch-end are one event, so a failure on either side drops both.
  const verdictText = '### Verdict: specification ✅ | quality: approved';
  const stopOnly = [{ hook_event_name: 'SubagentStop', agent_id: 'aur1', agent_type: 'superdev:slice-reviewer', last_assistant_message: verdictText, cwd: tmp }];
  const foreground = [{ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: 'ur1', tool_response: { status: 'completed', agentId: 'aur1', handbackReport: { text: verdictText } }, cwd: tmp }];
  const handback = [review[0]];
  const missing = (name) => `{ ${name}: undefined }`;
  const WRITE = { evs: verifyEvs, setup: setupVerify, real: ['run', 'edit'] };
  const matrix = [
    ...[['bash-command', 'cmdSegments'], ['bash-command', 'dirTracker'], ['bash-command', 'segWords'], ['bash-command', 'drivePath'], ['bash-writes', 'bashTargets'],
      ['test-runs', 'recordBash'], ['run-tree', 'locate'], ['run-tree', 'isTestPath'], ['run-tree', 'treeState'], ['start-stash', 'takeStart']]
      .flatMap(([mod, fn]) => [[`${mod} ${fn} throwing`, mod, boom(fn), WRITE], [`${mod} ${fn} missing`, mod, missing(fn), WRITE]]),
    // `findDispatch` reaches the stop through the hook, and the foreground review through `bindAgentResult`, which calls its module's own copy.
    ...[[stopOnly, 'a review stop', 'findDispatch'], [foreground, 'a foreground review', 'bindAgentResult']]
      .flatMap(([evs, on, find]) => [['dispatch', find], ['dispatch', 'endLine'], ['dispatch-lines', 'holds'], ['dispatch-lines', 'lastRunLine'], ['verdicts', 'verdictLine']]
        .flatMap(([mod, fn]) => [[`${mod} ${fn} throwing on ${on}`, mod, boom(fn)], [`${mod} ${fn} missing on ${on}`, mod, missing(fn)]]
          .map((c) => [...c, { evs, setup: bound, real: ['verdict', 'dispatch-end'] }]))),
    ...[['dispatch-lines', 'holds'], ['verdicts', 'verdictLine']].flatMap(([mod, fn]) => [[`${mod} ${fn} throwing on a hand-back`, mod, boom(fn)], [`${mod} ${fn} missing on a hand-back`, mod, missing(fn)]]
      .map((c) => [...c, { evs: handback, setup: bound, real: ['verdict'] }])),
  ];
  // A foreground review whose first PostToolUse carries the agentId and the report has no earlier bind: the bind, the verdict and the
  // end are one event, so a failure while building any of them drops all three (INV-0159).
  const unboundSlice = () => run({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: 'ur1', tool_input: { prompt: `${S3}`, subagent_type: 'superdev:slice-reviewer', description: 'review' }, cwd: tmp });
  const unboundFinal = () => {
    appendTrace(A, { slice: 'scope', agent: 'main', kind: 'ledger', fields: ['step', 'set', 'review'] });
    run({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: 'ur1', tool_input: { prompt: `Review ${A}/scopetree`, subagent_type: 'superdev:final-reviewer', description: 'review' }, cwd: tmp });
  };
  const finalReport = { hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: 'ur1', tool_response: { status: 'completed', agentId: 'aur1', handbackReport: { text: 'Ready to merge? Yes' } }, cwd: tmp };
  const unbound = [
    ['slice-reviewer', unboundSlice, foreground, ['dispatch-bind', 'verdict', 'dispatch-end'], 'verdict'],
    ['final-reviewer', unboundFinal, [finalReport], ['dispatch-bind', 'final-verdict', 'dispatch-end'], 'final-verdict'],
  ];
  for (const [who, setup, evs, real, kind] of unbound) {
    for (const [mod, fn] of [['verdicts', 'verdictLine'], ['dispatch', 'endLine'], ['dispatch-lines', 'lastRunLine'], ['dispatch-lines', 'holds']]) {
      matrix.push([`${mod} ${fn} throwing on an unbound foreground ${who}`, mod, boom(fn), { evs, setup, real }]);
    }
    matrix.push([`holds throwing for ${kind} only on an unbound foreground ${who}`, 'dispatch-lines', only('holds', 'a[1]', kind), { evs, setup, real }]);
  }
  matrix.push(
    ['holds throwing for dispatch-bind only on an unbound foreground slice-reviewer', 'dispatch-lines', only('holds', 'a[1]', 'dispatch-bind'), { evs: foreground, setup: unboundSlice, real: unbound[0][3] }],
    ['holds throwing for verdict only on a review stop', 'dispatch-lines', only('holds', 'a[1]', 'verdict'), { evs: stopOnly, setup: bound, real: ['verdict', 'dispatch-end'] }],
    ['holds throwing for verdict only on a hand-back', 'dispatch-lines', only('holds', 'a[1]', 'verdict'), { evs: handback, setup: bound, real: ['verdict'] }],
    ['holds throwing for verdict only on a bound foreground slice-reviewer', 'dispatch-lines', only('holds', 'a[1]', 'verdict'), { evs: foreground, setup: bound, real: ['verdict', 'dispatch-end'] }],
  );
  // Stop closes every unbound dispatch of the session together: a function that throws while the second one's end is built drops the first's.
  const twoDispatches = () => {
    run(agentPre(`${S3}`, 't1', 'superdev:implementer', 'one', tmp, 'S'));
    run(agentPre(`${S3}`, 't2', 'superdev:implementer', 'two', tmp, 'S'));
  };
  const stopS = [{ hook_event_name: 'Stop', session_id: 'S', cwd: tmp }];
  const closeBoth = { evs: stopS, setup: twoDispatches, real: ['dispatch-end', 'dispatch-end'] };
  matrix.push(
    ['holds throwing for the second dispatch only on a Stop', 'dispatch-lines', only('holds', 'a[3]', 't2'), closeBoth],
    ['lastRunLine throwing for the second dispatch only on a Stop', 'dispatch-lines', only('lastRunLine', 'a[1]', 't2'), closeBoth],
    ['untraceField throwing for the second dispatch only on a Stop', 'trace-log', only('untraceField', 'a[0]', 't2'), closeBoth],
  );
  for (const [what, mod, override, { evs, setup, real }] of matrix) {
    control(what, evs, setup, real);
    assert.deepEqual(hookRuns(withLib(mod, override), evs, setup), [], `${what} records nothing`);
    loaded(what);
    fs.rmSync(verifyFile, { force: true });
  }
  reset();
}


cleanup();
