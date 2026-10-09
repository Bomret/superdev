#!/usr/bin/env node
'use strict';

// green-gate: deterministic PostToolUse(Bash) and PostToolUseFailure(Bash) gate on the controller's merges.
// The full playbook's rule (references/implement-full.md, DAG loop) is "a focused suite runs on the
// merge, automatically" — prompted, so a model can skip it. This makes it deterministic: after a
// controller `git merge`, run the command references/test-selection.md picks (focused over this merge's
// changed paths, falling back to the full command per its own rules); a RED suite exits 2 so the
// controller MUST fix or revert before continuing. A merge that landed inside a failed call, or that a
// `git commit` concluded after a conflict, is gated too: decide() reads the HEAD reflog for those (ADR 0123).
//
// The full test command lives in the first fenced block of docs/agents/verification.md
// (written by /superdev:setup); the second fenced block is the focused command, required for every
// repository with a suite (references/test-selection.md owns the full-versus-focused rule, ADR 0085).
// No file / no command → no gate (zero-config repos are unaffected). A file carrying only the first
// fence runs the full command and emits NOTICE_ONE_FENCE below, rather than blocking. Subagents can't merge (merge-guard blocks
// them pre-run), so a merge here is always the controller's; the agent_id check is
// belt-and-suspenders. The doc read, the suite run, the changed-path diff, the in-progress
// check, and the branch read all run in the merge's own working tree: a `-C <path>` or
// `--work-tree <path>` on the merge command when the controller merges from another scopetree,
// resolveMergeCwd()'s job, or the session cwd unchanged for a bare `git merge`. A scopetree
// carries its own `docs/agents/verification.md` on its own branch, so a full run reading it from
// the session's invoking checkout instead would gate a merged scope with a stale or absent command.
// simplicity: the suite runs inside the hook, under the 600s `timeout` hooks.json sets on this
// hook's entry. That is also Claude Code's own default for a `command` hook, and it is set
// explicitly so the ceiling is stated where the suite runs. A consumer repo whose suite needs more
// raises the `timeout` on this hook's hooks.json entry — readHookTimeoutMs() below reads that same
// entry back at hook startup, so raising it actually raises the bound `runTests` enforces, rather
// than a second, unread number.
//
// That 600s bound belongs to the platform, not to `runTests`: it is Claude Code's timeout on the
// hook *process*. An unbounded `execSync` would leave a suite slower than 600s to the platform's own
// kill, which reaches the hook process from outside — never `runTests`'s `catch`, never a `{ killed }`
// return, never a decision, the merge proceeding silently (the failure INV-0009 and ADR 0086 name).
// SUITE_TIMEOUT_MS bounds `execSync` itself, margin below whatever hooks.json's own entry says, so
// the hook always ends the suite and observes the signal before the platform ceiling could.
// SUITE_MARGIN_MS is 30s: room for the hook's own JSON stdin read, doc read, and the process
// exit/output write around the spawn, comfortably inside the platform ceiling without eating into a
// slow-but-finishing suite's real budget. Deriving the bound from the manifest, instead of repeating
// its number as a second literal, is also what would catch SUITE_TIMEOUT_MS drifting past the
// platform's own ceiling — a hardcoded constant carried no such check.

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
// Command substitutions, `${…}` expansions, and backtick groups are one word too; merge-guard.js
// explains the reading and its limits beside its copy.
// Which option named the tree is read back out of the matched option region by optionValue() below,
// not from a capture group: the reason sits at IS_MERGE.
const ARG = /(?:[^\s"'\\$`]|\$(?![({])|\\.|"(?:[^"\\]|\\.)*"|'[^']*'|\$\((?:[^()\\]|\\.|\((?:[^()\\]|\\.)*\))*\)|\$\{(?:[^{}\\"'`]|\\.|"(?:[^"\\]|\\.)*"|'[^']*'|`(?:[^`\\]|\\.)*`)*\}|`(?:[^`\\]|\\.)*`)+/.source;
// `--abort` and `--quit` undo or abandon a merge — nothing new landed, so nothing to gate.
// `--continue` completes one and stays gated.
// A long global option takes its value in two spellings — `--work-tree=<path>` and `--work-tree
// <path>` — and `--${ARG}` alone only ever spans the first, so `git --work-tree /wt merge x` tripped
// no matcher and the gate never fired. The value-taking options are enumerated rather than accepting an
// optional following word after any long option — the reasoning, and the list itself (git's own
// value-taking global options, from `handle_options()` in git.c), are merge-guard's own, beside its copy
// of this token, including why the space-form value is required not to start with `-`
// (`(?:=|\s+(?!-))`): unrestricted, a long run of enumerated names with no verb backtracks
// exponentially — the same shape as the pathological command the hook's own 600s timeout above exists
// to bound, and hitting that ceiling would mean this test never even runs. A valueless use of one of
// these (`git --exec-path merge x`) still matches, through the `--${ARG}` alternative that follows —
// `--exec-path` takes no value in git itself, so it stays out of this enumeration.
// No alternative captures. JS resets every capture group inside a quantified group on each iteration,
// so only the last option's own capture would survive a match — `git --work-tree /b -C /a merge` would
// lose `/b`. optionValue() below reads each option out of the matched option region instead.
const LONG_VALUE_OPT = /--(?:git-dir|work-tree|namespace|config-env|shallow-file|attr-source)/.source;
// A git global option whose value ARG cannot read to the end of its shell word — the next character is not
// whitespace, as past one `$(…)` nesting level — is unknowable: IS_MERGE would split the word at its first
// space and the gate would never see the merge. The atomic `(?=(ARG|))\2` takes ARG's greedy match once, so
// no shorter reading of the value can pass the `(?=\S)` test. Mirrors merge-guard's STUCK, including the
// generic `--<name>=` lead on the final option only; fails closed.
// STUCK_MERGE's and IS_MERGE's lead-in is `[ \t]*`, never `\s*`: a newline is itself a lead-in, and `\s*`
// after it re-scans every following newline from each one, which is quadratic on a long run of blank lines.
const GLOBAL_OPTS = `(?:\\s+(?:-[cC]\\s+${ARG}|${LONG_VALUE_OPT}(?:=|\\s+(?!-))${ARG}|--${ARG}))*`;
const VALUE_OPT_LEAD = `(?:-[cC]\\s+|${LONG_VALUE_OPT}(?:=|\\s+(?!-))|--[\\w-]+=)`;
// RTK's PreToolUse hook rewrites `git commit` to `rtk git commit`, and this PostToolUse hook sees the
// rewritten command (docs/known-issues.md). Each matcher therefore takes an optional `rtk` before `git`,
// with rtk's own value-less global options, so a merge or commit RTK rewrote is still a candidate. An
// optional run-anything subcommand follows (`proxy`, `err`, `run`, `summary`, `test`, rtk 0.51.0), each of
// which executes the command after it, with its value-less options and an optional `--` separator. The whole
// prefix repeats, so an rtk behind another rtk matches too. The groups capture nothing, so STUCK_MERGE's `\2`
// keeps its meaning.
// merge-guard carries a byte-identical copy for a hand-typed prefix, pinned by this hook's suite.
const RTK_PREFIX = `(?:rtk(?:[ \\t]+(?:-v+|--verbose|--ultra-compact|--skip-env))*[ \\t]+(?:(?:proxy|err|run|summary|test)(?:[ \\t]+(?:--ultra-compact|--skip-env))*(?:[ \\t]+--)?[ \\t]+)?)*`;
const STUCK_MERGE = new RegExp(
  `(^|[;&|\\n])[ \\t]*${RTK_PREFIX}git${GLOBAL_OPTS}\\s+${VALUE_OPT_LEAD}(?=(${ARG}|))\\2(?=\\S)(?=[^\\n]*\\smerge(?![-\\w])(?!\\s+--(?:abort|quit)\\b))`,
  'm'
);
const IS_MERGE = new RegExp(
  `(^|[;&|\\n])[ \\t]*${RTK_PREFIX}git${GLOBAL_OPTS}\\s+merge(?![-\\w])(?!\\s+--(?:abort|quit)\\b)`,
  'm'
);
// A `git commit` names a candidate too: it concludes a conflicted merge, and only the HEAD reflog says
// whether it did (mergeLanded() below). Same lead-in and option region as IS_MERGE.
const IS_COMMIT = new RegExp(`(^|[;&|\\n])[ \\t]*${RTK_PREFIX}git${GLOBAL_OPTS}\\s+commit(?![-\\w])`, 'm');

// Unquotes a captured ARG token so it reaches path.resolve as a plain string. ARG (the comment
// above it) matches a run of concatenated pieces — unquoted, single-quoted, double-quoted, and
// substitutions (`$(…)`, `${…}`, a backtick group) — with no separating whitespace
// (`-C /base/"my dir"`, `-C "/base"/sub`), the same way a shell resolves one word built from several
// quoting styles. A substitution never reaches here: resolveCwdFromTokens() returns null first. So this
// walks the token piece by piece instead of keying off raw[0]: a single-quoted span passes through
// untouched (no escapes in the shell), a double-quoted span un-escapes `\x` to `x`, and an unquoted
// run does the same un-escaping.
function unquoteArg(raw) {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === "'") {
      const end = raw.indexOf("'", i + 1);
      // resolveCwdFromTokens() returns null for any value holding `$` or a backtick, so every value reaching
      // here has balanced quotes and this never fires on ARG output — but `end === -1` would otherwise
      // slice to -1 and rewind `i` to 0, spinning forever on the same unclosed quote.
      if (end === -1) break;
      out += raw.slice(i + 1, end);
      i = end + 1;
    } else if (c === '"') {
      i += 1;
      // Bounded by raw.length too: an unclosed double quote would otherwise leave `raw[i]`
      // `undefined` forever, which is never `'"'`, spinning past the end of the string.
      while (i < raw.length && raw[i] !== '"') {
        if (raw[i] === '\\') {
          out += raw[i + 1];
          i += 2;
        } else {
          out += raw[i];
          i += 1;
        }
      }
      i += 1; // skip the closing quote
    } else if (c === '\\') {
      out += raw[i + 1];
      i += 2;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

// A directory-changing builtin in command position. `cd <worktree> && git merge …`, a `pushd`, or a
// subshell that cds moves the merge somewhere the session cwd no longer names, and the command carries
// no `-C` saying where.
// simplicity: a shape test, not a resolution. Parsing the target would make such a command work, at the
// cost of a surface — chained `cd`s, variables, `~`, relative-on-relative, a `cd` inside a subshell
// that does not outlive it — where every wrong resolution runs the suite in the wrong tree and reports
// a confident green. Failing closed leaves the merge landed and unverified, named in the block message
// below, with `-C` the way to get a gated merge next time. The regex also over-fires: `echo "note;
// cd nowhere" && git merge s` reads a quoted `cd` as a real one and blocks a command that never left the
// session cwd. That direction is safe — the recovery is the same one `-C` — so it is left uncorrected.
// Upgrade to resolution only with a shell parser, never with a regex.
const CHANGES_DIR = /(^|[;&|(\n])\s*(?:cd|pushd|popd)(\s|$)/;

// The merge's own working tree: a `--work-tree <path>` or `-C <path>` on the command, resolved
// against the session cwd (git itself resolves both relative to the shell's cwd at invocation, not to
// this hook's cwd), or the session cwd unchanged when the command names neither — a bare `git merge`
// keeps running where it always has. **`null` when the tree is unknowable**, in three shapes:
// the command changed directory before the merge and named no tree, it named only `--git-dir`, or a
// `-C` or `--work-tree` value holds shell syntax the hook sees unexpanded.
// A git option value ARG cannot read to its end (STUCK_MERGE) is not one of them: this function never sees
// that merge, and resolveVerification() fails it closed before any suite runs, whatever this returns.
//
// git applies every `-C` in order, each against the directory the previous one left, before it looks at
// `--work-tree` — so `-C` is folded cumulatively here too (`git -C /a -C b` lands at `/a/b`), and a
// relative `--work-tree` is resolved against that folded result, not against the session cwd (`git -C
// /a --work-tree relb merge x` is `/a/relb`). `--work-tree` still wins over a `-C` naming a different
// path outright (an absolute `--work-tree` overrides the fold): both sit in the same global-option slot,
// so resolving either needs no shell parsing and is exactly as safe.
//
// A `--work-tree` tree is judged verifiable, a bare `--git-dir` is not — not because the files land
// nowhere nameable (git defines the opposite: with a bare `--git-dir` and no `--work-tree`,
// `GIT_WORK_TREE`, or `core.worktree`, the current directory IS the top of the working tree — verified
// on git 2.50.1, `git --git-dir=<other>/.git rev-parse --show-toplevel` prints the cwd), but because
// this hook's own reads don't carry that `--git-dir`. The suite, `git diff`, the `MERGE_HEAD` check,
// and the branch read all run as plain `git` invocations in the resolved cwd, so each resolves the
// repository a normal upward `.git` search finds from there — not necessarily the repository the
// merge's own `--git-dir` pointed at. The files land exactly where the option said; the branch, the
// changed-path set, and the in-progress check can still come from a different repository than the one
// the merge advanced — there is no honest tree to pick. Failing closed on `--git-dir` alone leaves the
// merge landed and unverified, the same recovery the directory-changing block asks for. A `-C` alongside a bare
// `--git-dir` fails closed too: git would take the tree from `-C`, but a command whose repository and
// tree are named separately is exactly the split this gate cannot verify.
//
// Residual ceiling: a `--work-tree` is resolvable but not meaningful when it points at a tree that is
// not a checkout of the repository whose HEAD the merge is advancing — the gate cannot tell that case
// apart from a real one, and runs the suite over whatever tree the path names.
// How many times the merge command's option region has actually been walked (parseOptions() calls) —
// exactly one per parseMergeCommand() call below. tests/green-gate.test.js reads this counter through
// the getOptionRegionWalks()/resetOptionRegionWalks() exports below to prove one decision walks the
// region once, not the up-to-four separate walks that used to run when resolveMergeCwd,
// namesOnlyGitDir, and resolvingOption each re-matched IS_MERGE and re-parsed the region on their own.
let optionRegionWalks = 0;
function resetOptionRegionWalks() {
  optionRegionWalks = 0;
}
function getOptionRegionWalks() {
  return optionRegionWalks;
}

// Parses the merge command's global-option region once: the IS_MERGE match locates the region and
// where it starts in `cmd` (resolveCwdFromTokens()'s CHANGES_DIR check needs that start), then
// parseOptions() walks it into a token list. `null` when cmd is not a merge. resolveMergeCwd,
// namesOnlyGitDir, and resolvingOption all take that same token list instead of re-matching IS_MERGE
// and re-walking the region themselves.
function parseMergeCommand(cmd) {
  let verb = 'merge';
  let m = IS_MERGE.exec(cmd);
  if (!m) {
    verb = 'commit';
    m = IS_COMMIT.exec(cmd);
  }
  if (!m) return null;
  optionRegionWalks += 1;
  return { tokens: parseOptions(optionRegion(m, verb)), index: m.index };
}

// The hook sees the command before the shell expands it, so a `-C` or `--work-tree` value holding
// `$NAME`, `${NAME}`, `$(…)`, a backtick, or a leading `~` names a path the hook cannot know.
// simplicity: tested on the raw text, so a single-quoted or backslash-escaped `$` over-fires. That
// direction is safe (it blocks and names `-C` with a literal path); upgrade only with a shell parser.
const SHELL_EXPANSION = /[$`]|^~/;
function namesShellExpansion(tokens) {
  return ['-C', '--work-tree'].some((o) => optionValues(tokens, o).some((v) => SHELL_EXPANSION.test(v)));
}

function resolveCwdFromTokens(tokens, index, cmd, sessionCwd) {
  const cValues = optionValues(tokens, '-C');
  if (namesShellExpansion(tokens)) return null;
  const cBase = cValues.reduce((base, v) => path.resolve(base, unquoteArg(v)), sessionCwd);
  const workTree = optionValue(tokens, '--work-tree');
  if (workTree) return path.resolve(cBase, unquoteArg(workTree));
  if (optionValue(tokens, '--git-dir')) return null;
  if (cValues.length) return cBase;
  if (CHANGES_DIR.test(cmd.slice(0, index))) return null;
  return sessionCwd;
}

function resolveMergeCwd(cmd, sessionCwd) {
  const parsed = parseMergeCommand(cmd);
  if (!parsed) return sessionCwd;
  return resolveCwdFromTokens(parsed.tokens, parsed.index, cmd, sessionCwd);
}

// Which of the two unknowable shapes a command is, for the blind reason resolveVerification() writes.
// Takes the token list resolveVerification already parsed, rather than re-matching IS_MERGE and
// re-walking the region.
function namesOnlyGitDir(tokens) {
  return Boolean(optionValue(tokens, '--git-dir')) && !optionValue(tokens, '--work-tree');
}

// Which option resolveMergeCwd() actually took the resolved tree from, for the blind reason
// resolveVerification() writes when that tree turns out to carry no verification doc. Mirrors
// resolveCwdFromTokens()'s own precedence: `--work-tree` wins when present, `-C` otherwise — this is
// only called once resolveMergeCwd() has already returned a resolved (non-null, non-session) cwd, so
// one of the two is guaranteed to be there. Takes the already-parsed token list, same reason as
// namesOnlyGitDir above.
function resolvingOption(tokens) {
  return optionValue(tokens, '--work-tree') ? '--work-tree' : '-C';
}

// The command's global-option run: everything IS_MERGE or IS_COMMIT matched up to the verb it ends on.
function optionRegion(match, verb) {
  return match[0].slice(0, -verb.length);
}

// Walks the region option-by-option, using the same alternation IS_MERGE itself matched against —
// `-c`/`-C ARG`, a long value-taking option's ARG, or a bare `--ARG` — so each option's own value is
// consumed as one token and the scan resumes only past it. That is what closes the gap a flat
// `region.match(optionName)` scan left open: `-c msg="a -C /elsewhere"` or `-c "msg=a --work-tree
// /elsewhere"` used to read the quoted VALUE's own text as a second, real option, because the flat scan
// had no notion of "already inside another option's value" — matchAll's non-overlapping search
// advances past the whole consumed token, so the embedded text is never revisited.
const OPTION_TOKEN = new RegExp(
  `(-[cC])\\s+(${ARG})|(${LONG_VALUE_OPT})(?:=|\\s+(?!-))(${ARG})|--(${ARG})`,
  'g'
);
function parseOptions(region) {
  const tokens = [];
  for (const m of region.matchAll(OPTION_TOKEN)) {
    if (m[1]) tokens.push({ name: m[1], value: m[2] });
    else if (m[3]) tokens.push({ name: m[3], value: m[4] });
    else tokens.push({ name: `--${m[5]}`, value: null });
  }
  return tokens;
}

// Every occurrence of one global option, out of an already-parsed token list, in the order it
// appears — both spellings (`--opt=value`, `--opt value`).
function optionValues(tokens, option) {
  return tokens.filter((t) => t.name === option).map((t) => t.value);
}

// One global option's value, out of an already-parsed token list — the last occurrence, as git
// itself takes it.
function optionValue(tokens, option) {
  const values = optionValues(tokens, option);
  return values.length ? values[values.length - 1] : null;
}
const VERIFICATION_DOC = 'docs/agents/verification.md';
const SHELL_BLIND =
  'superdev: this merge has landed, and nobody verified it. A `-C` or `--work-tree` value holds shell syntax ' +
  '(`$`, a backtick, or `~`) that the gate cannot expand, so it could not see the merge\'s working tree. ' +
  'Run the full test command in the merge\'s tree now, or revert this merge. ' +
  'Pass literal option values next time, such as a literal path: `git -C /abs/path merge …`.';
// The STUCK_MERGE shape can be a shell syntax error (an unterminated `$(`, backtick, or quote) that ran
// nothing, so it claims no landed merge: an obedient revert would otherwise undo a real commit.
const SHELL_BLIND_STUCK =
  'superdev: if this command merged, nobody verified it. A git option value holds shell syntax ' +
  '(for example an unterminated quote, `$(`, `${`, or backtick, nesting too deep, ' +
  'or a quoted `)` or a literal `{` inside a substitution) ' +
  'that the gate cannot read to its end, so it could not see the merge\'s working tree. ' +
  'If it merged, run the full test command in the merge\'s tree now, or revert that merge. ' +
  'Pass literal option values next time, such as a literal path: `git -C /abs/path merge …`.';

// What the gate runs, and where — or that it cannot tell. Both blind spots end here, because both are
// invisible to `decide()`: a tree it cannot name, and a resolved tree carrying no verification document
// while the session's does. The second is the asymmetry that matters — a `-C` path resolving somewhere
// other than the real merge tree reads exactly like an unconfigured repository, and the gate would go
// inert on a repository that configured it.
// Takes `parsed` — the caller's own parseMergeCommand(cmd) result — instead of parsing `cmd` itself, so
// a decision that also needs the cwd (main()'s own case) shares one parse across both.
// `stuck` is decide()'s own STUCK_MERGE test of `cmd`; a direct caller leaves it out and it is tested here.
function resolveVerification(parsed, cmd, sessionCwd, stuck = STUCK_MERGE.test(cmd)) {
  const session = readVerification(sessionCwd);
  if (stuck) {
    if (!session.full) return session;
    return { full: session.full, focused: session.focused, blind: SHELL_BLIND_STUCK };
  }
  const cwd = parsed ? resolveCwdFromTokens(parsed.tokens, parsed.index, cmd, sessionCwd) : sessionCwd;
  if (cwd === null) {
    // No verification document anywhere → the repository configured no gate, so there is nothing to
    // fail closed about: stay inert, exactly as an unconfigured repository always has.
    if (!session.full) return session;
    return {
      full: session.full,
      focused: session.focused,
      blind: namesShellExpansion(parsed.tokens)
        ? SHELL_BLIND
        : namesOnlyGitDir(parsed.tokens)
        ? 'superdev: this merge has landed, and nobody verified it. The command names its repository ' +
          'with `--git-dir` and its working tree with nothing, so the files it updated and the refs it ' +
          'reads live apart — there was no one tree to run the suite over. Run the full test command in ' +
          'the merge\'s tree now, or revert this merge. Run it as `git -C <path> merge …` next time, or ' +
          'name the tree with `--work-tree <path>`.'
        : 'superdev: this merge has landed, and nobody verified it. The command changed directory and ' +
          'carried no `-C`, so the gate could not see the merge\'s working tree — it would have run the ' +
          'suite in the session\'s own checkout, a tree the merge never touched. Run the full test ' +
          'command in the merge\'s tree now, or revert this merge. Run it as `git -C <path> merge …` ' +
          'next time.',
    };
  }
  if (cwd === sessionCwd) return session;
  const target = readVerification(cwd);
  if (!target.full && session.full) {
    const option = resolvingOption(parsed.tokens);
    return {
      full: null,
      focused: null,
      blind:
        `superdev: green-gate found no \`${VERIFICATION_DOC}\` in the merge's own working tree ` +
        `(\`${cwd}\`), while this session's checkout carries one. Either the \`${option}\` path is not ` +
        `the tree the merge landed in — point \`${option}\` at the merge tree — or it is that tree and ` +
        `genuinely carries no \`${VERIFICATION_DOC}\` at all (a \`${option}\` subdirectory of this repo, ` +
        'or a branch cut before the document existed) — verify that tree by hand.',
    };
  }
  return target;
}

// ADR 0085: a repository that cannot supply a focused command records the full command a second
// time, with prose beside it. One a reader has not yet migrated stops with this notice instead —
// a hook cannot ask an operator, and the full command sitting in the first fence is still correct,
// so blocking the merge over the missing second fence would be worse than just running it.
const NOTICE_ONE_FENCE =
  'superdev: green-gate found one fenced command in docs/agents/verification.md and ran it as the ' +
  'full command. Run /superdev:setup to configure a focused command.';

// The fenced blocks of a document, read line by line. A fence opens on a line that starts, after at
// most three spaces of indentation, with three or more backticks or tildes and any info string (a
// backtick fence's info string holds no backtick, so an inline span such as ```x``` is no opener). It
// closes on a line with the same indentation limit, of the same character, at least as long as the
// opener. `blocks` holds each closed block's body, `outside` the text between blocks. An unclosed
// fence yields no block. scope.js and hooks/green-gate.js each carry this function, because hooks
// stay standalone; tests/green-gate.test.js pins them byte-identical.
function fenceBlocks(raw) {
  const blocks = [];
  const outside = [];
  let open = null;
  let body = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!open) {
      const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (m && !(m[1][0] === '`' && m[2].includes('`'))) { open = m[1]; body = []; } else outside.push(line);
    } else if (/^ {0,3}(`+|~+)\s*$/.test(line) && line.trim()[0] === open[0] && line.trim().length >= open.length) {
      blocks.push(body.join('\n'));
      open = null;
    } else body.push(line);
  }
  return { blocks, outside: outside.join('\n') };
}

// references/test-selection.md: the first fenced block is the full command, the second the
// focused one, required for every repository with a suite (ADR 0085). Both trimmed; { full: null }
// when the doc is missing. Exactly one fenced block carries `notice` (ADR 0085) instead of stopping.
function readVerification(cwd) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(cwd, VERIFICATION_DOC), 'utf8');
  } catch {
    return { full: null, focused: null }; // no verification doc → no gate
  }
  const blocks = fenceBlocks(raw).blocks.map((b) => b.trim());
  if (blocks.length === 1) return { full: blocks[0], focused: null, notice: NOTICE_ONE_FENCE };
  return { full: blocks[0] || null, focused: blocks[1] || null };
}

// Single-quote a path so it reaches the shell as one argument, escaping embedded single quotes.
function shQuote(p) {
  return `'${p.replace(/'/g, `'\\''`)}'`;
}

// references/test-selection.md, "Fallback to the full command": no focused block runs the full
// command, and so does an empty changed-path set — but only for a focused command that consumes
// `{paths}`, whose substitution over no paths would report green having tested nothing. A focused
// command carrying no such token runs verbatim on an empty set too: a fixed fast subset always
// collects its own tests, and a self-detecting runner flag computes the change set itself and
// collects nothing from an empty one — its own pass-with-no-tests flag, part of the configured
// command, is what keeps that case green (ADR 0074).
function pickCommand(verification, getChangedPaths) {
  if (!verification.focused) return verification.full;
  if (!verification.focused.includes('{paths}')) return verification.focused;
  const paths = getChangedPaths();
  if (!paths.length) return verification.full;
  const quoted = paths.map(shQuote).join(' ');
  // A replacer function, not a plain string: a global regex substitutes every `{paths}` token, not
  // just the first, and a function's return value is inserted literally — a changed path containing a
  // `$`-pattern (`$&`, `$1`, …) would otherwise be reinterpreted as a replacement-string directive.
  return verification.focused.replace(/\{paths\}/g, () => quoted);
}

// decide() is pure over its inputs so it is unit-testable; getVerification, runTests,
// getChangedPaths, mergeInProgress, getCurrentBranch, and mergeLanded inject the side effects.
// getVerification is a thunk — PostToolUse(Bash) fires on every Bash call, so the doc read only
// happens once the cheap checks say this is a gated merge. It receives the one STUCK_MERGE result,
// so nothing tests it twice.
// ADR 0123: a command naming `git merge` or `git commit` is a candidate, on PostToolUse and on
// PostToolUseFailure alike. A successful `git merge` call is gated from its command text alone. Every
// other candidate — a failed call, or a `git commit` — runs the suite only when mergeLanded() finds a
// merge on top of the tree's HEAD reflog.
function decide(input, getVerification, runTests, getChangedPaths, mergeInProgress, getCurrentBranch = () => '', mergeLanded = () => false) {
  if (input && input.agent_id) return { block: false }; // subagent → not our concern
  const cmd = (input && input.tool_input && input.tool_input.command) || '';
  const stuck = STUCK_MERGE.test(cmd);
  const namesMerge = stuck || IS_MERGE.test(cmd);
  if (!namesMerge && !IS_COMMIT.test(cmd)) return { block: false }; // names neither verb
  const probe = !namesMerge || input.hook_event_name === 'PostToolUseFailure';
  const verification = getVerification(stuck);
  // A blind spot fails closed, before every check below: each of them — the configured command, the
  // branch read, the in-progress check — asks a question about a tree the gate could not resolve.
  // A candidate the reflog must decide has no tree to read it in, so it stays silent unless the
  // command is a stuck merge shape, whose reason already reads "if this command merged".
  if (verification && verification.blind) return stuck || !probe ? { block: true, reason: verification.blind } : { block: false };
  if (!verification || !verification.full) return { block: false }; // no gate configured
  // ADR 0033: a merge whose checkout is on an integration branch is a wide refactor's batch merge —
  // green is promised at the integrate-and-verify merge into the scope branch, so the gate defers here
  // and fires there. The prefix check is on `integration/` with the slash: a branch merely named
  // `integration` gets no deferral.
  if (getCurrentBranch().startsWith('integration/')) return { block: false };
  // A conflicted merge left MERGE_HEAD behind: nothing merged yet, so a suite run would test the
  // unchanged (or conflicted) tree and blame the merge. Skip; the run-handoff full suite still runs.
  if (mergeInProgress && mergeInProgress()) return { block: false };
  if (probe && !mergeLanded()) return { block: false };
  const testCommand = pickCommand(verification, getChangedPaths);
  const result = runTests(testCommand);
  // ADR 0085: verification.notice (one fenced block, ADR 0085) rides along on whatever decision
  // the suite result produces — the missing focused command never blocks by itself.
  if (result.ok) return verification.notice ? { block: false, notice: verification.notice } : { block: false };
  if (result.killed) {
    return {
      block: true,
      reason:
        `superdev: scope suite was killed (${result.killed}) after merging, before it produced a verdict` +
        (result.killedReason ? ` — ${result.killedReason}` : '') +
        `. A killed suite is not a pass (INV-0009) — find out why it didn't finish \`${testCommand}\` before continuing.\n\n${result.output}`,
      ...(verification.notice ? { notice: verification.notice } : {}),
    };
  }
  return {
    block: true,
    reason:
      `superdev: scope suite is RED after merging. The green-gate re-ran \`${testCommand}\` and it failed — fix the break or revert this merge before continuing.\n\n${result.output}`,
    ...(verification.notice ? { notice: verification.notice } : {}),
  };
}

// hooks.json's own green-gate entry, read directly rather than assumed — the manifest is the one
// place the platform ceiling is configured, and a consumer who raises it there should raise the bound
// `runTests` actually enforces. 600s is also Claude Code's own default for a `command` hook: the
// fallback below when the entry can't be read at all, so a parse failure, a missing entry, or a
// missing file never leaves the suite unbounded.
const HOOKS_MANIFEST = path.join(__dirname, 'hooks.json');
const DEFAULT_HOOK_TIMEOUT_MS = 600 * 1000;

// manifestPath is a parameter (not read from HOOKS_MANIFEST directly) so tests can point it at a
// fixture manifest instead of the shipped one.
function readHookTimeoutMs(manifestPath = HOOKS_MANIFEST) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const groups = (manifest.hooks && manifest.hooks.PostToolUse) || [];
    for (const group of groups) {
      for (const hook of group.hooks || []) {
        if (typeof hook.command === 'string' && hook.command.includes('green-gate.js')) {
          return typeof hook.timeout === 'number' && hook.timeout > 0
            ? hook.timeout * 1000
            : DEFAULT_HOOK_TIMEOUT_MS;
        }
      }
    }
  } catch {
    // unreadable or malformed manifest → the platform default below
  }
  return DEFAULT_HOOK_TIMEOUT_MS;
}

// SUITE_TIMEOUT_MS bounds just the spawned suite, margin below the manifest's own ceiling, so the
// hook itself — not the platform — always ends a suite that runs too long.
const SUITE_MARGIN_MS = 30 * 1000;
// The margin comes off the ceiling, and the result is never allowed to reach zero: Node reads
// `timeout: 0` as no timeout at all, so a consumer who lowers this hook's `hooks.json` entry below
// the margin would otherwise get an unbounded suite spawn — the failure INV-0009 exists to prevent,
// arrived at through the code that prevents it. Below the margin the bound becomes a fraction of the
// ceiling instead, which keeps the hook alive to observe its own kill (#607).
function suiteBoundMs(hookTimeoutMs) {
  return Math.max(hookTimeoutMs - SUITE_MARGIN_MS, Math.floor(hookTimeoutMs / 2), 1);
}
const SUITE_TIMEOUT_MS = suiteBoundMs(readHookTimeoutMs());

// timeoutMs and maxBufferBytes are parameters (not read from the module constants directly) so
// tests can exercise the kill paths without waiting for the production bound or writing 64 MiB.
function runTests(testCommand, cwd, timeoutMs = SUITE_TIMEOUT_MS, maxBufferBytes = 64 * 1024 * 1024) {
  try {
    // maxBuffer well above Node's 1 MiB default: a chatty green suite killed with ENOBUFS would
    // land in the catch and read as RED.
    execSync(testCommand, {
      cwd,
      stdio: 'pipe',
      encoding: 'utf8',
      maxBuffer: maxBufferBytes,
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
    });
    return { ok: true, output: '' };
  } catch (e) {
    // status == null with no signal means the suite never started at all — e.g. a -C cwd that
    // doesn't exist (ENOENT): the OS never got as far as running a process to kill. That's not
    // "no verdict", it's "the merge's own working tree can't even run the suite", so it gates
    // like a RED verdict rather than failing open. A Spawn failure sits outside INV-0009, and this
    // gate answers it for its own reason (ADR 0087): it fires only on a merge, so blocking costs one
    // merge and leaves every other call free to repair the tree.
    if (e.status == null && e.signal == null) return { ok: false, output: (e.message || '').trim() };
    // status == null with a signal means the suite started and was killed (SUITE_TIMEOUT_MS,
    // ENOBUFS, or another signal) — it produced no verdict. INV-0009 / ADR 0086: no gate reads
    // that absence as a pass, so this blocks the merge like a RED result, naming the signal
    // rather than a failure the suite never produced.
    if (e.status == null) {
      const out = ((e.stdout || '') + (e.stderr || '')).trim();
      // Same reasoning as the RED tail below: the killed suite's own buffer can run up to
      // maxBuffer (64 MiB) and none of that floods the block reason.
      const reason = e.code === 'ENOBUFS'
        ? 'the suite produced more output than maxBuffer allows, not necessarily a failure'
        : null;
      return {
        ok: false,
        killed: e.signal,
        ...(reason ? { killedReason: reason } : {}),
        output: out.split('\n').slice(-40).join('\n'),
      };
    }
    const out = ((e.stdout || '') + (e.stderr || '')).trim();
    // tail — the failing assertions are at the end, and we don't want to flood context
    return { ok: false, output: out.split('\n').slice(-40).join('\n') };
  }
}

// MERGE_HEAD only exists while a merge sits unresolved in the working tree.
function mergeInProgress(cwd) {
  try {
    execSync('git rev-parse -q --verify MERGE_HEAD', { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ADR 0123: a merge landed when the top entry of the tree's HEAD reflog reads `merge …` (a completed
// merge, a fast-forward included) or `commit (merge)…` (a commit concluding a conflicted merge, from
// `git commit` or `git merge --continue`). decide() has already ruled out a merge still waiting on a
// conflict. A repository with its reflog off, or no repository, yields no entry: not landed.
function mergeLanded(cwd) {
  try {
    const subject = execSync('git reflog -1 --format=%gs HEAD', { cwd, stdio: 'pipe', encoding: 'utf8' });
    return /^(merge |commit \(merge\))/.test(subject);
  } catch {
    return false;
  }
}

// The merge target: the checkout's current branch. Empty when HEAD is detached inside rev-parse's
// error path or the cwd is no repo — both read as "not an integration branch", so the gate still fires.
function getCurrentBranch(cwd) {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

// references/test-selection.md, "The changed-path set": the merge's ORIG_HEAD against HEAD, read once
// the merge has landed (a merge still waiting is skipped, ADR 0123), not HEAD^1 — HEAD^1 is the fallback
// where ORIG_HEAD does not resolve. An empty set (a merge that changes nothing) goes to decide()'s
// fallback.
function getChangedPaths(cwd) {
  for (const ref of ['ORIG_HEAD', 'HEAD^1']) {
    try {
      // -z: NUL-terminated output with no path quoting. Without it git C-quotes a path holding a
      // quote, a backslash, or a non-ASCII byte (core.quotePath), and a plain `.trim()` on top would
      // also corrupt a path with a trailing space.
      const out = execSync(`git diff --name-only -z ${ref} HEAD`, { cwd, stdio: 'pipe', encoding: 'utf8' });
      return out.split('\0').filter(Boolean);
    } catch {
      // ref doesn't resolve → try the next one
    }
  }
  return [];
}

// The full decision for one PostToolUse(Bash) input: parses the command's option region once and
// shares that single parse between the cwd resolution and the verification lookup, exactly the
// sharing this slice exists to prove. main() calls this from the parsed stdin input;
// tests/green-gate.test.js calls it directly, so both run the same wiring instead of the suite
// re-deriving its own copy.
function decideMerge(input, sessionCwd) {
  const cmd = (input && input.tool_input && input.tool_input.command) || '';
  const parsed = parseMergeCommand(cmd);
  // `null` when the tree is unknowable: resolveVerification() turns that into the blind reason
  // decide() blocks on, and the injected side effects below are never reached in that case.
  const cwd = parsed ? resolveCwdFromTokens(parsed.tokens, parsed.index, cmd, sessionCwd) : sessionCwd;
  return decide(
    input,
    (stuck) => resolveVerification(parsed, cmd, sessionCwd, stuck),
    (tc) => runTests(tc, cwd),
    () => getChangedPaths(cwd),
    () => mergeInProgress(cwd),
    () => getCurrentBranch(cwd),
    () => mergeLanded(cwd),
  );
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
    // The doc read, the suite run, the changed-path diff, the in-progress check, and the branch
    // read all happen in the merge's own working tree (a `-C` or `--work-tree`, or the session cwd
    // when the command names neither) — decideMerge()'s job.
    const sessionCwd = (input && input.cwd) || process.cwd();
    const { block, reason, notice } = decideMerge(input, sessionCwd);
    // The notice (ADR 0085, one fenced block) rides on whichever stream the decision itself uses:
    // stdout on a non-blocking decision, matching update-check.js's precedent for a non-blocking
    // hook notice; folded into the stderr write beside `reason` on a blocking one, since Claude
    // Code reads stderr, not stdout, on exit(2).
    if (block) {
      process.stderr.write(reason + (notice ? '\n\n' + notice : '') + '\n');
      process.exit(2);
    }
    if (notice) process.stdout.write(notice + '\n');
    process.exit(0);
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  decide,
  decideMerge,
  resolveMergeCwd,
  unquoteArg,
  readVerification,
  runTests,
  mergeInProgress,
  mergeLanded,
  getChangedPaths,
  IS_MERGE,
  IS_COMMIT,
  STUCK_MERGE,
  ARG,
  VERIFICATION_DOC,
  parseMergeCommand,
  resolveVerification,
  resetOptionRegionWalks,
  getOptionRegionWalks,
  readHookTimeoutMs,
  suiteBoundMs,
  SUITE_MARGIN_MS,
  SUITE_TIMEOUT_MS,
};

