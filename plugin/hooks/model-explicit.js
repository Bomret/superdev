#!/usr/bin/env node
'use strict';

// model-explicit: deterministic PreToolUse(Agent) guard.
// Every dispatch to one of superdev's own subagents must set an explicit model
// (warrant-scaled by the controller). An omitted model silently inherits the
// session model — usually the most expensive tier. We only police OUR agents, so
// the user's other subagent dispatches are untouched.

const OURS = /^(superdev[:_-])?(implementer|slice-reviewer|simplicity-reviewer|final-reviewer|doc-writer|doc-reader|test-auditor)$/;

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

if (require.main === module) {
  main();
}

module.exports = { decide, OURS };
