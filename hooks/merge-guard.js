#!/usr/bin/env node
'use strict';

// merge-guard: deterministic PreToolUse(Bash) guard.
// Subagents must never integrate — only the controller merges. A subagent's tool
// call carries `agent_id` on the hook stdin; the controller's does not. So we block
// `git merge`/`push`/`rebase` ONLY when agent_id is present, leaving the controller free.
// one regex, one rule, no deps.

const BLOCK = /(^|[;&|])\s*git\s+(merge|push|rebase)\b/;

function decide(input) {
  if (!input || !input.agent_id) return { block: false }; // controller (or unknown) → allow
  const cmd = (input.tool_input && input.tool_input.command) || '';
  if (BLOCK.test(cmd)) {
    return {
      block: true,
      reason:
        'superdev: subagents must not integrate. `git merge`/`push`/`rebase` are the ' +
        "controller's job — commit on your slice branch and report your status. (merge-guard)",
    };
  }
  return { block: false };
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
      process.exit(0); // not our shape → never block
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
  const assert = require('assert');
  const sub = (command) => ({ agent_id: 'a1', tool_input: { command } });
  assert.equal(decide({}).block, false, 'no agent_id → allow');
  assert.equal(decide({ tool_input: { command: 'git merge scope' } }).block, false, 'controller merges');
  assert.equal(decide(sub('npm test')).block, false);
  assert.equal(decide(sub('git commit -m "x"')).block, false);
  assert.equal(decide(sub('git status')).block, false);
  assert.equal(decide(sub('forgit push')).block, false, 'no false positive on substrings');
  assert.equal(decide(sub('git merge scope')).block, true);
  assert.equal(decide(sub('  git push -u origin s')).block, true, 'leading spaces');
  assert.equal(decide(sub('cd x && git push')).block, true, 'after &&');
  assert.equal(decide(sub('git rebase main')).block, true);
  console.log('merge-guard selftest ok');
} else {
  main();
}
