#!/usr/bin/env node
'use strict';

// model-explicit: deterministic PreToolUse(Agent) guard.
// Every dispatch to one of superdev's own subagents must set an explicit model
// (warrant-scaled by the controller). An omitted model silently inherits the
// session model — usually the most expensive tier. We only police OUR agents, so
// the user's other subagent dispatches are untouched.

const OURS = /^(superdev[:_-])?(implementer|slice-reviewer|simplicity-reviewer|final-reviewer|doc-writer|doc-reader)$/;

function decide(input) {
  if (!input || input.tool_name !== 'Agent') return { block: false };
  const ti = input.tool_input || {};
  const type = ti.subagent_type || '';
  if (!OURS.test(type)) return { block: false }; // not our agent → not our rule
  const model = ti.model;
  if (model && String(model).trim()) return { block: false };
  return {
    block: true,
    reason:
      `superdev: dispatch to "${type}" must set an explicit model (warrant-scaled). Omitting it inherits the session model — usually the most expensive tier. (model-explicit)`,
  };
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let input;
    try {
      input = JSON.parse(raw || '{}');
    } catch {
      process.exit(0);
    }
    const { block, reason } = decide(input);
    if (block) {
      process.stderr.write(reason + '\n');
      process.exit(2);
    }
    process.exit(0);
  });
}

if (process.argv[2] === '--selftest') {
  const assert = require('node:assert');
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

  // Drift assertion: every agent basename under sibling agents/ must be covered by OURS,
  // so a future agent added without guard coverage fails this selftest.
  const fs = require('node:fs');
  const path = require('node:path');
  const agentsDir = path.join(__dirname, '..', 'agents');
  const basenames = fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -3));
  const uncovered = basenames.filter((name) => !OURS.test(name));
  assert.deepEqual(uncovered, [], `agents/ uncovered by OURS: ${uncovered.join(', ')}`);

  console.log('model-explicit selftest ok');
} else {
  main();
}
