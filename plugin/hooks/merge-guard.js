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
// A command substitution (`$(…)`, one nested level), a parameter expansion (`${…}`), or a backtick group is
// one word however many spaces it holds: `git -C $(git rev-parse --show-toplevel)/wt merge x` or
// `git -C ${X:-a b} merge x` would otherwise end the word at the first space, match no verb, and let a
// subagent integrate. A plain `$` excludes the `$(` and `${` openers and the plain class excludes the
// backtick, so each character has exactly one live reading and the match stays linear. An unterminated `$(`,
// `${`, or backtick is a shell syntax error and ends the word. A `${…}` body reads quoted strings and
// backtick groups whole, so a quoted `}` stays inside it. It excludes `{`, so a nested `${…${…}…}` or a
// literal `{` (`${X:-{a}`) fails the piece. A quoted `)` inside a substitution (`$(echo ")")`) is one
// level, but ARG is blind to quotes and ends the group at that `)`. Past one level ARG cannot read the
// word to its end either: deeper nesting (`$(dirname $(dirname $(pwd)))/wt`) and nested arithmetic
// (`$((1+(2)))`). STUCK below catches those shapes and fails closed, as it does a value that leaves a
// non-space character after the match. STUCK misses a shape ARG misreads without leaving a non-space
// character (a quoted `)` before whitespace, a case or comment paren, a quoted substitution holding a
// double-quoted space, a `${…}` holding a `$(…)` with a bare `}`). It also misses a stuck value with a
// newline before the verb, because the verb lookahead `[^\n]*` stops at the newline. It also misses a
// quoted `)` before a later quote of the same kind, because the misread quote piece swallows the verb
// (triage #814).
const ARG = /(?:[^\s"'\\$`]|\$(?![({])|\\.|"(?:[^"\\]|\\.)*"|'[^']*'|\$\((?:[^()\\]|\\.|\((?:[^()\\]|\\.)*\))*\)|\$\{(?:[^{}\\"'`]|\\.|"(?:[^"\\]|\\.)*"|'[^']*'|`(?:[^`\\]|\\.)*`)*\}|`(?:[^`\\]|\\.)*`)+/.source;
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
const GLOBAL_OPTS = `(?:\\s+(?:-[cC]\\s+${ARG}|${LONG_VALUE_OPT}(?:=|\\s+(?!-))${ARG}|--${ARG}))*`;
const BLOCK = new RegExp(`(^|[;&|\\n])[ \\t]*git${GLOBAL_OPTS}\\s+(merge|push|rebase)(?![-\\w])`, 'm');
// A git global option whose value ARG cannot read to the end of its shell word — the next character is not
// whitespace — is unknowable: the command would otherwise split at the value's first space and slip past
// BLOCK. The atomic `(?=(ARG|))\2` takes ARG's greedy match once, so no shorter reading of the value can
// pass the `(?=\S)` test; a verb later on the line makes it an integration. Fails closed. The lead adds a
// generic `--<name>=` to the enumerated options: its value is stuck the same way (`--exec-path=$(a $(b c))`),
// and only the final option needs it, so the loop's own alternation stays unambiguous.
const VALUE_OPT_LEAD = `(?:-[cC]\\s+|${LONG_VALUE_OPT}(?:=|\\s+(?!-))|--[\\w-]+=)`;
const STUCK = new RegExp(
  `(^|[;&|\\n])[ \\t]*git${GLOBAL_OPTS}\\s+${VALUE_OPT_LEAD}(?=(${ARG}|))\\2(?=\\S)(?=[^\\n]*\\s(?:merge|push|rebase)(?![-\\w]))`,
  'm'
);
// Integration via the code-host CLI is the controller's job too: `gh pr merge` / `tea pr merge`.
// The REST-API path through `curl … /pulls/<n>/merge` can't be caught deterministically without
// false-positiving on legitimate read curls, so the `curl` forms stay a prose contract the subagent
// bodies carry. The `tea api` and `gh api` forms are caught: `tea api` is the documented pinned merge
// path (ADR 0111), so it cannot stay open, and `gh api` reaches the same endpoint (triage #793).
// The leading horizontal whitespace is `[ \t]*`, never `\s*`: a newline is itself a lead-in, and `\s*`
// after it re-scans every following newline from each one, which is quadratic on a long run of blank lines.
const BLOCK_CLI = /(^|[;&|\n])[ \t]*(gh|tea)\s+pr\s+merge\b/m;
// A `tea api` / `gh api` call merges when its endpoint names a pull request's `/merge` path and its method
// writes: an explicit `-X`/`--method`, or — with none — a body flag, which defaults the call to POST. A GET of
// the same endpoint (the merged-status read) is not a merge. Each call is one `;&|\n`-bounded segment, led by a
// line start, separator, `(`, backtick (so `$(` too), `{`, `!`, or a `if`/`then`/`do`/`while`/`until`/`elif`/`else` keyword.
// Known gap, like curl: a GraphQL route (`gh api graphql -f query='mutation{mergePullRequest…}'`) names no
// `/merge` endpoint and is not caught.
// `tea api` merges with POST only; `gh api` with PUT or POST (GitHub's merge endpoint is PUT).
const API_CALL = /(?:^|[;&|\n(`{!])[ \t]*(?:(?:if|then|do|while|until|elif|else)\s+)?(tea|gh)\s+api\b([^;&|\n]*)/gm;
const MERGE_ENDPOINT = /\/pulls\/[^\s/'"]+\/merge(?![\w/-])/;
const API_METHOD = /(?:^|\s)(?:-X\s*|--method(?:=|\s+))["']?([A-Za-z]+)/;
const API_BODY = {
  tea: /\s(?:-[dfF]|--(?:data|field|Field))(?![A-Za-z-])/,
  gh: /\s(?:-[fF]|--(?:field|raw-field|input))(?![A-Za-z-])/,
};
const API_MERGE_METHODS = { tea: ['POST'], gh: ['PUT', 'POST'] };
function isApiMerge(cmd) {
  // a backslash-newline continuation is one logical line
  for (const m of cmd.replace(/\\\r?\n/g, ' ').matchAll(API_CALL)) {
    if (!MERGE_ENDPOINT.test(m[2])) continue;
    const method = API_METHOD.exec(m[2]);
    if (method ? API_MERGE_METHODS[m[1]].includes(method[1].toUpperCase()) : API_BODY[m[1]].test(m[2])) return true;
  }
  return false;
}
// simplicity: catches the honest/common forms only. A leading token with no separator before `git`
// (`env FOO=1 git push`, `time git push`, `sudo git push`), a subshell (`$(git push)`), or an
// interpreter wrapper (`bash -c "git push"`) still slip past — the char before `git` isn't a line
// start or a `;`/`&`/`|`/`\n`. This is a deterministic guardrail against the model's normal output,
// not a sandbox; airtight subagent isolation is the platform's job (see AGENTS.md known issues).
// The `tea api` / `gh api` lead-ins also block text that merely quotes the call (`git commit -m "… (tea api -X POST
// …/merge)"`): a known false positive, accepted because it fails closed with a clear message.

function decide(input) {
  if (!input || !input.agent_id) return { block: false }; // controller (or unknown) → allow
  const cmd = (input.tool_input && input.tool_input.command) || '';
  if (BLOCK.test(cmd) || STUCK.test(cmd) || BLOCK_CLI.test(cmd) || isApiMerge(cmd)) {
    return {
      block: true,
      reason:
        "superdev: subagents must not integrate. `git merge`/`push`/`rebase`, `gh`/`tea pr merge`, and a `tea api` or `gh api` write to a pull request's /merge endpoint " +
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
