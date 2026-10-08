'use strict';

// Suite for plugin/hooks/model-explicit.js. Requires the hook (silent, ADR 0059 / issue #442's
// require.main guard) and calls its exported decide() directly, the way the hook's own inline
// --selftest used to before this suite moved off the shipped tree (ADR 0059).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const { assertSpawnDecided } = require('./spawn-verdict');

const hookPath = require.resolve('../plugin/hooks/model-explicit.js');
const { decide, OURS } = require(hookPath);

const d = (tool_input, tool_name = 'Agent') => decide({ tool_name, tool_input });
assert.equal(d({ subagent_type: 'implementer' }).block, true, 'ours, no model → block');
assert.equal(d({ subagent_type: 'superdev:final-reviewer' }).block, true, 'namespaced, no model');
assert.equal(d({ subagent_type: 'implementer', model: 'sonnet' }).block, false, 'ours + model → allow');
assert.equal(d({ subagent_type: 'implementer', model: '   ' }).block, true, 'blank model → block');
assert.equal(d({ subagent_type: 'superdev:doc-writer' }).block, true, 'doc-writer is ours');
assert.equal(d({ subagent_type: 'superdev:doc-reader' }).block, true, 'doc-reader is ours, no model');
assert.equal(d({ subagent_type: 'doc-reader', model: 'sonnet' }).block, false, 'doc-reader + model → allow');
assert.equal(d({ subagent_type: 'Explore' }).block, false, 'not ours → allow');
assert.equal(d({ subagent_type: 'implementer' }, 'Bash').block, false, 'wrong tool → allow');

// Drift assertion: every agent basename under sibling agents/ must be covered by OURS, so a future
// agent added without guard coverage fails this suite.
const agentsDir = path.join(path.dirname(hookPath), '..', 'agents');
const basenames = fs
  .readdirSync(agentsDir)
  .filter((f) => f.endsWith('.md'))
  .map((f) => f.slice(0, -3));
const uncovered = basenames.filter((name) => !OURS.test(name));
assert.deepEqual(uncovered, [], `agents/ uncovered by OURS: ${uncovered.join(', ')}`);

// require.main guard: requiring this hook must never run main()'s stdin/decide dispatch, and
// spawning it directly (as Claude Code's hook invocation does) must still decide exactly as before
// the guard was added.
{
  const payload = JSON.stringify({ tool_name: 'Agent', tool_input: { subagent_type: 'implementer' } });
  const required = cp.spawnSync(process.execPath, ['-e', `require(${JSON.stringify(hookPath)})`], {
    input: payload, encoding: 'utf8', timeout: 5000,
  });
  assertSpawnDecided(required, 'requiring model-explicit.js');
  assert.equal(required.status, 0, 'requiring model-explicit.js never blocks');
  assert.equal(required.stdout, '', 'requiring model-explicit.js prints nothing');
  assert.equal(required.stderr, '', 'requiring model-explicit.js runs no decision');

  const spawned = cp.spawnSync(process.execPath, [hookPath], { input: payload, encoding: 'utf8', timeout: 5000 });
  assertSpawnDecided(spawned, 'spawning model-explicit.js directly');
  assert.equal(spawned.status, 2, 'spawning model-explicit.js directly still blocks a modelless dispatch');
  assert.match(spawned.stderr, /must set an explicit model/, 'and still reports the model-explicit reason');
}


console.log('model-explicit tests ok');
