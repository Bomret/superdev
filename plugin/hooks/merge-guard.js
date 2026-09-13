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
// The optional group skips git's global options before the subcommand — `git -C <path> push`,
// `git -c k=v merge`, and `git --git-dir=<path> push` are the natural forms in a multi-worktree
// layout and must not slip past. Each option's argument is one shell word — ARG below — so a
// quoted `-C`/`-c` value (`-C "path with spaces"`), an unquoted value with a backslash-escaped
// space (`-C ~/my\ path`), and a partly-quoted `key=value` (`-c k="v w"`, `--git-dir="a b"`) are
// all matched as a single token, not just the first non-space run a bare `\S+` would stop at.
// The double-quoted alternative tolerates a backslash-escaped internal quote so an escaped `"`
// inside the value doesn't close the span early; single quotes have no escapes in POSIX shells, so
// `'[^']*'` stays literal.
const ARG = /(?:[^\s"'\\]|\\.|"(?:[^"\\]|\\.)*"|'[^']*')+/.source;
// A long global option takes its value in two spellings — `--work-tree=<path>` and `--work-tree
// <path>` — and `--${ARG}` alone only ever spans the first, so `git --work-tree /wt merge x` matched
// nothing at all and a subagent could integrate through it. The value-taking options are enumerated
// rather than accepting an optional following word after any long option: the general form is shorter
// but leans on backtracking to keep `git --no-pager merge x` matching, which makes `git --a --b --c …`
// with no verb ambiguous between "option with value" and "two options" at every step. The list is
// git's own set of value-taking global options, from `handle_options()` in git.c — re-derive it there.
// The space-form value is required not to start with `-` (`(?:=|\s+(?!-))`): without that restriction
// a run of enumerated names with no verb (`--git-dir --git-dir … x; git merge main`) keeps both
// readings of every adjacent pair live — "the first took the second as its value" and "both are bare"
// — and that ambiguity compounds across the run, exponentially: measured on this file's own regex, 26
// tokens took 25ms and 30 took 156ms, doubling every two tokens. `hooks.json` sets no `timeout` on this
// hook's entry, so it runs at the platform default, and a PreToolUse hook that exceeds its timeout
// fails OPEN — it never reached a verdict, so nothing blocks. The restriction collapses each pair to
// one live reading (a value can never itself look like another option), which is linear regardless of
// the run's length — 0ms at 400 tokens, measured. A valueless use of one of these (`git --exec-path
// merge x`) still matches, through the `--${ARG}` alternative that follows — `--exec-path` takes no
// value in git itself, so it stays out of this enumeration.
const LONG_VALUE_OPT = /--(?:git-dir|work-tree|namespace|config-env|shallow-file|attr-source)/.source;
const BLOCK = new RegExp(
  `(^|[;&|\\n])\\s*git(?:\\s+(?:-[cC]\\s+${ARG}|${LONG_VALUE_OPT}(?:=|\\s+(?!-))${ARG}|--${ARG}))*\\s+(merge|push|rebase)(?![-\\w])`,
  'm'
);
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

if (require.main === module) {
  main();
}

module.exports = { decide };
