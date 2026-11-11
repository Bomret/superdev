#!/usr/bin/env node
'use strict';

// merge-guard: deterministic PreToolUse(Bash) guard.
// Subagents must never integrate — only the controller merges. A subagent's tool
// call carries `agent_id` on the hook stdin; the controller's does not. So the guard checks
// the command of a call that carries `agent_id` and leaves the controller free.
//
// The check is one raw-text rule (ADR 0227) and reads no shell words, so the hook requires no module. After a
// backslash-newline is joined, a line is denied when it holds a lead word (`git`, `gh`, `tea`, or `scope.js`, in any
// letter case) and, later on that line, a verb word: `push`, `merge`, `rebase`, `pull`, or, after `tea`, its `m` merge
// alias. A lead word starts at the line's start, after whitespace, `/`, a backslash (`\git` skips an alias), a quote,
// or a shell operator character; a verb
// word is bounded on both sides by the line's ends, whitespace, `/`, a quote, a backtick, `;`, `&`, `|`, `)`, `<`, or `>`. So `-merge`
// (`dod-merge`), `push.ts`, and `merge-guard.js` hold no verb. `gh api -X PUT repos/o/r/pulls/1/merge` is denied
// through its trailing `/merge`.
//
// simplicity: a command built at run time (`G=git; $G push`) slips past. This is a deterministic guardrail against the
// model's normal output, not a sandbox; airtight subagent isolation is the platform's job (see AGENTS.md known issues).
// The text of a commit message that holds a verb is denied too, so the denial names the heredoc form that passes.

const LEAD = /(?<![^\s/\\"'`;&|(])(git|gh|tea|scope\.js)(?![\w-])/i;
const TEA = /(?<![^\s/\\"'`;&|(])tea(?![\w-])/i;
const VERB = /(?<![^\s/"'`;&|)<>])(?:push|merge|rebase|pull)(?![^\s/"'`;&|)<>])/;
const TEA_ALIAS = /(?<![^\s/"'`;&|)<>])m(?![^\s/"'`;&|)<>])/;

const INTEGRATE =
  'superdev: subagents must not integrate. A line naming `git`, `gh`, `tea`, or `scope.js` and later the word `push`, `merge`, ' +
  "`rebase`, or `pull` (or `m` after `tea`) is the controller's job — commit on your slice branch and report your status. " +
  'A commit message or PR body that holds one of those words passes when written through a heredoc on the lines after the ' +
  "command (`git commit -F - <<'EOF'`, then the message, then `EOF`), as long as no line of it holds one of those lead " +
  'words followed by one of those verbs. (merge-guard)';

function integrates(cmd) {
  for (const line of cmd.replace(/\\\r?\n/g, ' ').split(/\r?\n/)) {
    const lead = LEAD.exec(line);
    if (!lead) continue;
    if (VERB.test(line.slice(lead.index + lead[0].length))) return true;
    const tea = TEA.exec(line);
    if (tea && TEA_ALIAS.test(line.slice(tea.index + tea[0].length))) return true;
  }
  return false;
}

function decide(input) {
  if (!input || !input.agent_id) return { block: false }; // controller (or unknown) → allow
  const cmd = (input.tool_input && input.tool_input.command) || '';
  return integrates(String(cmd)) ? { block: true, reason: INTEGRATE } : { block: false };
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

if (require.main === module) {
  main();
}

module.exports = { decide };
