#!/usr/bin/env node
'use strict';

// merge-guard: deterministic PreToolUse(Bash) guard.
// Subagents must never integrate — only the controller merges. A subagent's tool
// call carries `agent_id` on the hook stdin; the controller's does not. So we block
// `git merge`/`push`/`rebase` ONLY when agent_id is present, leaving the controller free.
// one regex, one rule, no deps.

// (?![-\w]) so the subcommand is exactly `merge`/`push`/`rebase` — not read-only helpers
// like `git merge-base` / `merge-tree` (a `\b` would match those, blocking them as false positives).
// The lead-in class includes `\n` (+ `m` flag) so a `git push` on its own line of a multi-line
// command string is caught, not just one after `;`/`&`/`|` or at string start.
const BLOCK = /(^|[;&|\n])\s*git\s+(merge|push|rebase)(?![-\w])/m;
// Integration via the code-host CLI is the controller's job too: `gh pr merge` / `tea pr merge`.
// (The REST-API path — `curl … /pulls/<n>/merge` — can't be caught deterministically without
// false-positiving on legitimate read curls; the subagent bodies carry that as an explicit contract.)
const BLOCK_CLI = /(^|[;&|\n])\s*(gh|tea)\s+pr\s+merge\b/m;
// ponytail: catches the honest/common forms only. A leading token with no separator before `git`
// (`env FOO=1 git push`, `time git push`, `sudo git push`), a subshell (`$(git push)`), or an
// interpreter wrapper (`bash -c "git push"`) still slip past — the char before `git` isn't a line
// start or a `;`/`&`/`|`/`\n`. This is a deterministic guardrail against the model's normal output,
// not a sandbox; airtight subagent isolation is the platform's job (see AGENTS.md known issues).

function decide(input) {
  if (!input || !input.agent_id) return { block: false }; // controller (or unknown) → allow
  const cmd = (input.tool_input && input.tool_input.command) || '';
  if (BLOCK.test(cmd) || BLOCK_CLI.test(cmd)) {
    return {
      block: true,
      reason:
        'superdev: subagents must not integrate. `git merge`/`push`/`rebase` and `gh`/`tea pr merge` ' +
        "are the controller's job — commit on your slice branch and report your status. (merge-guard)",
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
  const assert = require('node:assert');
  const sub = (command) => ({ agent_id: 'a1', tool_input: { command } });
  assert.equal(decide({}).block, false, 'no agent_id → allow');
  assert.equal(decide({ tool_input: { command: 'git merge scope' } }).block, false, 'controller merges');
  assert.equal(decide(sub('npm test')).block, false);
  assert.equal(decide(sub('git commit -m "x"')).block, false);
  assert.equal(decide(sub('git status')).block, false);
  assert.equal(decide(sub('forgit push')).block, false, 'no false positive on substrings');
  assert.equal(decide(sub('git merge-base main HEAD')).block, false, 'merge-base is read-only, not a merge');
  assert.equal(decide(sub('git merge-tree a b')).block, false, 'merge-tree is read-only');
  assert.equal(decide(sub('git merge scope')).block, true);
  assert.equal(decide(sub('  git push -u origin s')).block, true, 'leading spaces');
  assert.equal(decide(sub('cd x && git push')).block, true, 'after &&');
  assert.equal(decide(sub('git rebase main')).block, true);
  assert.equal(decide(sub('git add -A\ngit commit -m x\ngit push')).block, true, 'push on a later line');
  assert.equal(decide(sub('gh pr merge 5 --squash')).block, true, 'gh pr merge');
  assert.equal(decide(sub('tea pr merge 5')).block, true, 'tea pr merge');
  assert.equal(decide(sub('gh pr view 5')).block, false, 'gh read is fine');
  console.log('merge-guard selftest ok');
} else {
  main();
}
