#!/usr/bin/env node
'use strict';

// green-gate: deterministic PostToolUse(Bash) gate on the controller's merges.
// The full playbook's rule (references/implement-full.md, DAG loop) is "re-run the suite on scope after merging" —
// prompted, so a model can skip it. This makes it deterministic: after a controller
// `git merge`, run the configured test command; a RED suite exits 2 so the controller
// MUST fix or revert before continuing.
//
// The test command lives in the first fenced block of docs/agents/verification.md
// (written by /superdev:setup). No file / no command → no gate (zero-config repos are
// unaffected). Subagents can't merge (merge-guard blocks them pre-run), so a merge here
// is always the controller's; the agent_id check is belt-and-suspenders.
// ponytail: the suite runs inside the hook, under the 600s `timeout` hooks.json sets on this
// hook's entry (Claude Code's own default hook timeout is 60s) — a suite slower than that is
// killed and the gate silently doesn't fire. A consumer repo whose suite needs more raises the
// `timeout` on this hook's hooks.json entry.

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// (?![-\w]) so read-only helpers `git merge-base` / `merge-tree` don't trip the gate (a `\b` would
// match them — mirror merge-guard). `\n` lead-in + `m` so a merge on a later line of a multi-line
// command is still gated. The optional group skips git's global options (`-C <path>`, `-c k=v`,
// inline `--flags`) so `git -C <path> merge` is gated too — mirror merge-guard. Each option's
// argument is one shell word — ARG below — so a quoted `-C`/`-c` value, an unquoted value with a
// backslash-escaped space, and a partly-quoted `key=value` (`-c k="v w"`, `--git-dir="a b"`) are
// all matched as a single token, not just the first non-space run a bare `\S+` would stop at.
const ARG = /(?:[^\s"'\\]|\\.|"(?:[^"\\]|\\.)*"|'[^']*')+/.source;
const IS_MERGE = new RegExp(
  `(^|[;&|\\n])\\s*git(?:\\s+(?:-[cC]\\s+${ARG}|--${ARG}))*\\s+merge(?![-\\w])`,
  'm'
);
const VERIFICATION_DOC = 'docs/agents/verification.md';

// First fenced code block's contents, trimmed — the test command.
function readTestCommand(cwd) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(cwd, VERIFICATION_DOC), 'utf8');
  } catch {
    return null; // no verification doc → no gate
  }
  const m = raw.match(/```[a-zA-Z0-9]*\n([\s\S]*?)```/);
  const cmd = m && m[1].trim();
  return cmd || null;
}

// decide() is pure over its inputs (cmd + resolved test command) so it is unit-testable;
// runTests injects the side effect.
function decide(input, testCommand, runTests) {
  if (input && input.agent_id) return { block: false }; // subagent → not our concern
  const cmd = (input && input.tool_input && input.tool_input.command) || '';
  if (!IS_MERGE.test(cmd)) return { block: false }; // not a merge
  if (!testCommand) return { block: false }; // no gate configured
  const result = runTests(testCommand);
  if (result.ok) return { block: false };
  return {
    block: true,
    reason:
      `superdev: scope suite is RED after merging. The green-gate re-ran \`${testCommand}\` and it failed — fix the break or revert this merge before continuing.\n\n${result.output}`,
  };
}

function runTests(testCommand, cwd) {
  try {
    execSync(testCommand, { cwd, stdio: 'pipe', encoding: 'utf8' });
    return { ok: true, output: '' };
  } catch (e) {
    const out = ((e.stdout || '') + (e.stderr || '')).trim();
    // tail — the failing assertions are at the end, and we don't want to flood context
    return { ok: false, output: out.split('\n').slice(-40).join('\n') };
  }
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
    const cwd = (input && input.cwd) || process.cwd();
    const testCommand = readTestCommand(cwd);
    const { block, reason } = decide(input, testCommand, (tc) => runTests(tc, cwd));
    if (block) {
      process.stderr.write(reason + '\n');
      process.exit(2);
    }
    process.exit(0);
  });
}

if (process.argv[2] === '--selftest') {
  const assert = require('node:assert');
  const green = () => ({ ok: true, output: '' });
  const red = () => ({ ok: false, output: 'FAIL foo' });
  const merge = (command, extra) => Object.assign({ tool_input: { command } }, extra);

  assert.equal(decide(merge('git merge --no-ff slice/s1'), 'npm test', green).block, false, 'green passes');
  assert.equal(decide(merge('git merge --no-ff slice/s1'), 'npm test', red).block, true, 'red blocks');
  assert.equal(decide(merge('git merge --no-ff slice/s1'), null, red).block, false, 'no command → no gate');
  assert.equal(decide(merge('git status'), 'npm test', red).block, false, 'non-merge ignored');
  assert.equal(decide(merge('git merge x', { agent_id: 'a1' }), 'npm test', red).block, false, 'subagent ignored');
  assert.equal(decide(merge('forgit merge'), 'npm test', red).block, false, 'no substring false positive');
  assert.equal(decide(merge('git merge-base main HEAD'), 'npm test', red).block, false, 'merge-base is read-only, not a merge');
  assert.equal(decide(merge('git merge-tree a b'), 'npm test', red).block, false, 'merge-tree is read-only');
  assert.equal(decide(merge('cd x && git merge y'), 'npm test', red).block, true, 'after &&');
  assert.equal(decide(merge('echo done\ngit merge --no-ff s'), 'npm test', red).block, true, 'merge on a later line');
  assert.equal(decide(merge('git -C ../wt merge slice/x/1'), 'npm test', red).block, true, 'git -C merge is gated');
  assert.equal(decide(merge('git -C "path with spaces" merge slice/x/1'), 'npm test', red).block, true, 'git -C <quoted path> merge is gated');
  assert.equal(decide(merge("git -C 'path with spaces' merge slice/x/1"), 'npm test', red).block, true, 'git -C <single-quoted path> merge is gated');
  assert.equal(decide(merge('git -C "a \\" b" merge slice/x/1'), 'npm test', red).block, true, 'git -C <double-quoted path with escaped quote> merge is gated');
  assert.equal(decide(merge('git -C ~/my\\ path merge slice/x/1'), 'npm test', red).block, true, 'git -C <backslash-escaped space, unquoted> merge is gated');
  assert.equal(decide(merge('git -c k="v w" merge slice/x/1'), 'npm test', red).block, true, 'git -c <unquoted key, quoted value> merge is gated');
  assert.equal(decide(merge('git --git-dir="a b" merge slice/x/1'), 'npm test', red).block, true, 'git --git-dir="quoted value with space" merge is gated');
  assert.equal(decide(merge('git -c core.editor=true commit -m x'), 'npm test', red).block, false, 'git -c commit ignored');

  // fenced-block parsing
  const tmp = require('node:os').tmpdir();
  const dir = fs.mkdtempSync(path.join(tmp, 'gg-'));
  fs.mkdirSync(path.join(dir, 'docs/agents'), { recursive: true });
  fs.writeFileSync(path.join(dir, VERIFICATION_DOC), '# Verification\n\n```sh\nnpm test\n```\n');
  assert.equal(readTestCommand(dir), 'npm test', 'parses fenced command');
  assert.equal(readTestCommand(path.join(dir, 'nope')), null, 'missing doc → null');

  console.log('green-gate selftest ok');
} else {
  main();
}
