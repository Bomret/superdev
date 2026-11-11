'use strict';

// Suite for the run-trace hook's failure posture (INV-0159): with any module it loads unloadable, or a function of a loaded
// module throwing, the hook records nothing. Each case confirms its stub loaded.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { readTrace, appendTrace } = require('../plugin/scripts/scope.js');
const { tmp, ledger, A, S3, trace, reset, run, edit, bash, hookPath, agentPre, cleanup } = require('./run-trace-setup');

// With trace-log.js unloadable, or a function of it throwing, the hook records nothing; a control run records.
{
  const preload = path.join(tmp, 'preload.js');
  const write = path.join(S3, 'src', 'unloadable.js');
  // `setup` runs in-process first, every module loadable; `events` are recorded in the spawned hook; returns the lines `events` added.
  const prepare = (events, setup) => {
    reset();
    if (setup) setup();
    return { before: trace(A).length, evs: events || [{ tool_name: 'Edit', tool_input: { file_path: write }, cwd: tmp }] };
  };
  // Spawned: a real process loads the hook with `patch` preloaded.
  const spawnRuns = (patch, events, setup) => {
    fs.writeFileSync(preload, patch);
    const { before, evs } = prepare(events, setup);
    const code = `const { record } = require(${JSON.stringify(hookPath)}); for (const e of ${JSON.stringify(evs)}) { try { record(e); } catch { /* main() never blocks the tool call */ } }`;
    const r = cp.spawnSync(process.execPath, ['-r', preload, '-e', code], { encoding: 'utf8', timeout: 10000 });
    assertSpawnDecided(r, 'run-trace.js with a broken module');
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
  const intercept = (body) => `const M = require('module'); const load = M._load; M._load = function (req, ...a) { if (${requests('trace-log')}) { require('fs').writeFileSync(${JSON.stringify(marker)}, 'x'); ${body} } return load.call(this, req, ...a); };`;
  const loaded = (what) => { assert.ok(fs.existsSync(marker), `the stub loaded: ${what}`); fs.rmSync(marker); };
  const unloadable = intercept("throw new Error('gone');");
  fs.rmSync(marker, { force: true });
  assert.deepEqual(spawnRuns(''), ['edit'], 'control: the write records');
  assert.ok(!fs.existsSync(marker), 'control: no stub loaded');
  // The one spawned failure row: the posture holds across a real process; every other row runs in-process.
  assert.deepEqual(spawnRuns(unloadable), [], 'trace-log.js unloadable records nothing, spawned');
  loaded('unloadable trace-log, spawned');
  // An in-process row restores the module loader and the require cache.
  const loadBefore = Module._load;
  const hookBefore = require.cache[hookPath];
  assert.deepEqual(hookRuns(unloadable), [], 'trace-log.js unloadable records nothing');
  loaded('unloadable trace-log');
  assert.equal(Module._load, loadBefore, 'the module loader is restored');
  assert.equal(require.cache[hookPath], hookBefore, 'the require cache is restored');
  assert.deepEqual(hookRuns(''), ['edit'], 'in-process control: the write records after a stubbed row');
  assert.ok(!fs.existsSync(marker), 'in-process control: no stub loaded');
  assert.deepEqual(hookRuns(intercept('return { appendTrace() { throw new Error("boom"); } };')), [], 'appendTrace throwing records nothing');
  loaded('appendTrace throwing');
  // Each module the hook loads, directly or through another module of lib/, each unloadable on its own: nothing records, and the
  // stub at its requiring module's request loaded.
  const MODULES = ['ledger', 'trace-log', 'verification', 'main-work-tree', 'run-tree', 'dispatch', 'dispatch-lines'];
  for (const mod of MODULES) {
    const stub = `const M = require('module'); const load = M._load; M._load = function (req, ...a) { if (${requests(mod)}) { require('fs').writeFileSync(${JSON.stringify(marker)}, 'x'); throw new Error('gone'); } return load.call(this, req, ...a); };`;
    assert.deepEqual(hookRuns(stub), [], `${mod}.js unloadable records nothing`);
    loaded(`unloadable ${mod}.js`);
  }
  const boom = (name) => `{ ${name}() { throw new Error("boom"); } }`;
  // A function that throws only for some inputs drops the whole event, not just the line that read that input.
  const only = (name, arg, args) => `{ ${name}: (...a) => { if (${arg} === ${JSON.stringify(args)}) throw new Error("boom"); return r.${name}(...a); } }`;
  // A dispatch event records nothing either: a bound slice-reviewer's stop writes no end.
  const bound = () => {
    run({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: 'ur1', tool_input: { prompt: `${S3}`, subagent_type: 'superdev:slice-reviewer', description: 'review' }, cwd: tmp });
    run({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: 'ur1', tool_response: { status: 'async_launched', agentId: 'aur1' }, cwd: tmp });
  };
  const review = [
    { hook_event_name: 'SubagentStop', agent_id: 'aur1', agent_type: 'superdev:slice-reviewer', cwd: tmp },
  ];
  control('the review records its end', review, bound, ['dispatch-end']);
  assert.deepEqual(hookRuns(unloadable, review, bound), [], 'trace-log.js unloadable records no dispatch-end');
  loaded('unloadable trace-log on a review');
  // A state module that loads but whose function throws: the event records nothing, and the stub at its requiring module's request loaded.
  const withLib = (mod, override) => `const M = require('module'); const load = M._load; M._load = function (req, ...a) { if (${requests(mod)}) { require('fs').writeFileSync(${JSON.stringify(marker)}, 'x'); const r = load.call(this, req, ...a); return Object.assign({}, r, ${override}); } return load.call(this, req, ...a); };`;
  const editEvs = [{ tool_name: 'Edit', tool_input: { file_path: write }, cwd: S3 }];
  control('an edit records', editEvs, undefined, ['edit']);
  assert.deepEqual(hookRuns(withLib('verification', boom('isTestPath')), editEvs), [], 'isTestPath throwing records nothing');
  loaded('isTestPath throwing');
  assert.deepEqual(hookRuns(withLib('trace-log', boom('readTrace')), review, bound), [], 'readTrace throwing records no dispatch-end');
  loaded('readTrace throwing on a review');
  assert.deepEqual(hookRuns(withLib('main-work-tree', boom('mainWorkTree')), review, bound), [], 'mainWorkTree throwing records no dispatch-end');
  loaded('mainWorkTree throwing on a review');
  // Every function a lib module hands the hook, absent or throwing, on the event that calls it: nothing records, and the stub at its
  // requiring module's request loaded. A review's report carries a verdict line, which records nothing (ADR 0197).
  const verdictText = '### Verdict: specification ✅ | quality: approved';
  const stopOnly = [{ hook_event_name: 'SubagentStop', agent_id: 'aur1', agent_type: 'superdev:slice-reviewer', last_assistant_message: verdictText, cwd: tmp }];
  const foreground = [{ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: 'ur1', tool_response: { status: 'completed', agentId: 'aur1', handbackReport: { text: verdictText } }, cwd: tmp }];
  const missing = (name) => `{ ${name}: undefined }`;
  const WRITE = { evs: editEvs, setup: undefined, real: ['edit'] };
  const matrix = [
    ...[['run-tree', 'locate'], ['run-tree', 'toolTarget'], ['run-tree', 'isTestPath'], ['trace-log', 'appendTrace']]
      .flatMap(([mod, fn]) => [[`${mod} ${fn} throwing`, mod, boom(fn), WRITE], [`${mod} ${fn} missing`, mod, missing(fn), WRITE]]),
    // `findDispatch` reaches the stop through the hook, and the foreground review through `bindAgentResult`, which calls its module's own copy.
    // `holds` reaches only the foreground review, through the bind check.
    ...[[stopOnly, 'a review stop', ['findDispatch']], [foreground, 'a foreground review', ['bindAgentResult', 'holds']]]
      .flatMap(([evs, on, [find, more]]) => [['dispatch', find], ['dispatch', 'endLine'], ['dispatch-lines', 'lastRunLine'], ...(more ? [['dispatch-lines', more]] : [])]
        .flatMap(([mod, fn]) => [[`${mod} ${fn} throwing on ${on}`, mod, boom(fn)], [`${mod} ${fn} missing on ${on}`, mod, missing(fn)]]
          .map((c) => [...c, { evs, setup: bound, real: ['dispatch-end'] }]))),
  ];
  // A foreground review whose first PostToolUse carries the agentId and the report has no earlier bind: the bind and the
  // end are one event, so a failure while building either drops both (INV-0159).
  const unboundSlice = () => run({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: 'ur1', tool_input: { prompt: `${S3}`, subagent_type: 'superdev:slice-reviewer', description: 'review' }, cwd: tmp });
  const unboundFinal = () => {
    appendTrace(A, { slice: 'scope', agent: 'main', kind: 'ledger', fields: ['step', 'set', 'review'] });
    run({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: 'ur1', tool_input: { prompt: `Review ${A}/scopetree`, subagent_type: 'superdev:final-reviewer', description: 'review' }, cwd: tmp });
  };
  const finalReport = { hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: 'ur1', tool_response: { status: 'completed', agentId: 'aur1', handbackReport: { text: 'Ready to merge? Yes' } }, cwd: tmp };
  const unbound = [
    ['slice-reviewer', unboundSlice, foreground, ['dispatch-bind', 'dispatch-end']],
    ['final-reviewer', unboundFinal, [finalReport], ['dispatch-bind', 'dispatch-end']],
  ];
  for (const [who, setup, evs, real] of unbound) {
    for (const [mod, fn] of [['dispatch', 'endLine'], ['dispatch-lines', 'lastRunLine'], ['dispatch-lines', 'holds']]) {
      matrix.push([`${mod} ${fn} throwing on an unbound foreground ${who}`, mod, boom(fn), { evs, setup, real }]);
    }
  }
  matrix.push(
    ['holds throwing for dispatch-bind only on an unbound foreground slice-reviewer', 'dispatch-lines', only('holds', 'a[1]', 'dispatch-bind'), { evs: foreground, setup: unboundSlice, real: unbound[0][3] }],
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
  }
  reset();
}


cleanup();
