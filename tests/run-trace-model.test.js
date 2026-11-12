'use strict';

// Suite for the model guard of plugin/hooks/run-trace.js (ADR 0245). Requires the hook (silent, ADR 0059 / issue #442's
// require.main guard) and calls its exported decide() directly, then runs the hook as a process to check the deny's
// exit and stderr on PreToolUse(Agent), and that no other event denies.

const assert = require('node:assert');
const cp = require('node:child_process');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { assertSpawnDecided } = require('./spawn-verdict');


const hookPath = require.resolve('../plugin/hooks/run-trace.js');
const { decide, OURS } = require(hookPath);

const d = (tool_input, tool_name = 'Agent') => decide({ tool_name, tool_input });
assert.equal(d({ subagent_type: 'implementer' }).block, true, 'ours, no model → block');
assert.equal(d({ subagent_type: 'superdev:final-reviewer' }).block, true, 'namespaced, no model');
assert.equal(d({ subagent_type: 'implementer', model: 'sonnet' }).block, false, 'ours + model → allow');
assert.equal(d({ subagent_type: 'implementer', model: '   ' }).block, true, 'blank model → block');
assert.equal(d({ subagent_type: 'superdev:doc-writer' }).block, true, 'doc-writer is ours');
assert.equal(d({ subagent_type: 'superdev:doc-reader' }).block, true, 'doc-reader is ours, no model');
assert.equal(d({ subagent_type: 'doc-reader', model: 'sonnet' }).block, false, 'doc-reader + model → allow');
assert.equal(d({ subagent_type: 'superdev:test-gap-auditor' }).block, true, 'test-gap-auditor is ours, no model');
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


// Run as a process: PreToolUse(Agent) without a model exits 2 with the reason on stderr; with a model, or on PostToolUse,
// it exits 0 silently. cwd is an empty directory, so no run is recorded.
{
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'run-trace-model-'));
  process.on('exit', () => fs.rmSync(cwd, { recursive: true, force: true }));
  const run = (input) => {
    const r = cp.spawnSync(process.execPath, [hookPath], { input: JSON.stringify({ session_id: 's', cwd, ...input }), encoding: 'utf8', timeout: 30000 });
    assertSpawnDecided(r, 'running run-trace.js');
    return r;
  };
  const pre = (tool_input) => run({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_use_id: 't', tool_input });
  const denied = pre({ subagent_type: 'superdev:implementer', prompt: 'p' });
  assert.strictEqual(denied.status, 2, 'a modelless dispatch to our agent is denied');
  assert.strictEqual(denied.stderr, 'superdev: dispatch to "superdev:implementer" must set an explicit model (warrant-scaled). Omitting it inherits the session model — usually the most expensive tier. (model-explicit)\n');
  assert.deepStrictEqual([pre({ subagent_type: 'implementer', model: 'sonnet' }).status, pre({ subagent_type: 'Explore' }).status], [0, 0], 'a model, or not our agent, passes');
  const post = run({ hook_event_name: 'PostToolUse', tool_name: 'Agent', tool_use_id: 't', tool_input: { subagent_type: 'implementer' }, tool_response: {} });
  assert.deepStrictEqual([post.status, post.stderr], [0, ''], 'PostToolUse never denies');
  assert.deepStrictEqual([run({}).status, cp.spawnSync(process.execPath, [hookPath], { input: '{', encoding: 'utf8', timeout: 30000 }).status], [0, 0], 'no event, or malformed JSON, passes');
}

console.log('run-trace-model tests ok');
