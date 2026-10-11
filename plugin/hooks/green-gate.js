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
//
// Each suite run the gate performs also appends one `run` line to the run trace (INV-0017, ADR 0117):
// traceSuiteRun() writes kind (`full` only for the full command), outcome, commit, and clean state, so
// `scope.js suite reusable` can accept a clean merge's tip. A run killed at its bound and a spawn that
// never started produced no verdict (INV-0009) and write nothing; a cwd outside every run tree writes
// nothing either.
// SUITE_MARGIN_MS is 30s: room for the hook's own JSON stdin read, doc read, and the process
// exit/output write around the spawn, comfortably inside the platform ceiling without eating into a
// slow-but-finishing suite's real budget. Deriving the bound from the manifest, instead of repeating
// its number as a second literal, is also what would catch SUITE_TIMEOUT_MS drifting past the
// platform's own ceiling — a hardcoded constant carried no such check.

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// scope.js owns the trace writer (ADR 0022, ADR 0117), and run-trace.js owns the run-tree attribution
// (`locate`) and the bounded commit and clean-state read (`treeState`), so the gate and the hook never
// disagree. The same fail-silent require as run-trace.js: no writer or reader, no recording.
let appendTrace = null;
let locate = null;
let treeState = null;
try {
  ({ appendTrace } = require('../scripts/scope.js'));
  ({ locate, treeState } = require('./run-trace.js'));
} catch {
  // left null: traceSuiteRun() records nothing
}

// The shared shell scanner (ADR 0135) reads the command. A scanner that cannot load leaves `shellWords`
// null, and parseMergeCommand() then reports `{ broken: true }`: the gate fails closed with a blind
// verification (INV-0140).
let shellWords = null;
try {
  shellWords = require('./shell-words.js');
} catch {
  // left null: every command reads as broken
}

// The raw-text rule for a command the scanner cannot read: the word `git`, then later the word `merge` (or `pull`, read in readMerge()).
const MERGE_WORD = /(?<![-\w])merge(?![-\w])/;
const PULL_WORD = /(?<![-\w])pull(?![-\w])/;

// A directory-changing builtin in command position. `cd <worktree> && git merge …`, a `pushd`, or a
// subshell that cds moves the merge somewhere the session cwd no longer names, and the command carries
// no `-C` saying where.
// simplicity: a shape test, not a resolution. Parsing the target would make such a command work, at the
// cost of a surface — chained `cd`s, variables, `~`, relative-on-relative, a `cd` inside a subshell
// that does not outlive it — where every wrong resolution runs the suite in the wrong tree and reports
// a confident green. Failing closed leaves the merge landed and unverified, named in the block message
// below, with `-C` the way to get a gated merge next time. Any `cd`, `pushd`, or `popd` command that the
// scanner lists before the merge counts, one in a subshell or an unrelated branch included. That direction
// is safe — the recovery is the same one `-C`.
const CHANGES_DIR = new Set(['cd', 'pushd', 'popd']);

// The `git merge` options that take their value as the next word (`-m msg`, `--into-name x`); the `=` and
// attached forms (`-mmsg`, `--into-name=x`) are one word and match nothing here. Git also accepts an
// unambiguous prefix of a long option (`--mess`) and a bundle of short options (`-nm`), so the test below
// reads both.
const MERGE_LONG_VALUE = ['message', 'file', 'strategy', 'strategy-option', 'into-name'];
// Every other long option `git merge` takes, so a prefix such as `--s` or `--f` reads as ambiguous.
const MERGE_LONG_OTHER = [
  'commit', 'no-commit', 'edit', 'no-edit', 'cleanup', 'ff', 'no-ff', 'ff-only', 'gpg-sign', 'no-gpg-sign', 'log',
  'no-log', 'signoff', 'no-signoff', 'stat', 'no-stat', 'summary', 'no-summary', 'compact-summary', 'squash',
  'no-squash', 'verify', 'no-verify', 'verify-signatures', 'no-verify-signatures', 'rerere-autoupdate',
  'no-rerere-autoupdate', 'allow-unrelated-histories', 'progress', 'no-progress', 'autostash', 'no-autostash',
  'overwrite-ignore', 'no-overwrite-ignore', 'quiet', 'verbose', 'abort', 'quit', 'continue', 'help',
];
function takesMergeValue(w) {
  if (/^-[A-Za-z]+$/.test(w)) {
    const i = w.search(/[mFsX]/);
    return i === w.length - 1; // a value letter mid-bundle takes the rest of the word, so no next word
  }
  const m = /^--([a-z-]+)$/.exec(w);
  if (!m) return false;
  if (MERGE_LONG_VALUE.includes(m[1])) return true;
  const hits = [...MERGE_LONG_VALUE, ...MERGE_LONG_OTHER].filter((o) => o.startsWith(m[1]));
  return hits.length === 1 && MERGE_LONG_VALUE.includes(hits[0]);
}

// What the command names: `null` when no merge candidate, else
//   { verb: 'merge' | 'commit' | 'pull', quoted, tokens, dirChanged }   a candidate read from the command's words (past
//                                                               its `NAME=` words and prefix wrappers, an inline alias resolved),
//   { stuck: true }                                             an unreadable command that holds a merge,
//   { stuck: true, verb: 'pull' }                               an unreadable command that holds a pull and no merge,
//   { broken: true }                                            a scanner that cannot load or run.
// `tokens` are the value-taking git global options of the candidate (`{ name, value }`), `dirChanged` is
// true when a directory-changing command comes before it at the command line's own level, and `quoted` is
// true when the candidate sits inside the text of a quoted word, a quoted text that reads as no command line
// included (readMerge() below). A merge the command runs itself (not
// inside quoted text) beats a commit or a pull, which beats a quoted merge, which beats a quoted commit or pull. A commit and
// a pull are gated only when the reflog shows a landed merge (decide()). `merge
// --abort` and `merge --quit`, in any option position before the first non-option word or `--` (and not as
// the value of an option such as `-m`), undo or abandon a merge — nothing new landed, so nothing to gate;
// `--continue` completes one and stays gated.
function parseMergeCommand(cmd) {
  // Every call into the scanner module sits in the try: a throw anywhere in the read is a broken install (INV-0140).
  try {
    if (!shellWords) return { broken: true };
    return readMerge(shellWords.scan(cmd, { quoted: true }), cmd);
  } catch {
    return { broken: true };
  }
}
// A quoted text that reads as no command line (`bash -c "git merge x; echo don't"`) runs its lines before the syntax error, so
// one naming `git … merge` by the raw-text rule is a quoted merge candidate, ranked as one: the reflog decides, in the session
// cwd. A commit message or a grep pattern holding such text (`git commit -m "don't git merge twice"`) then stays silent unless a
// merge landed. A heredoc body or here-string text (the scan's `texts`) naming `git … merge` is a quoted merge candidate the same
// way, whatever command receives it, a file sink included, when the line holds no unquoted `git merge`, `commit`, or `pull`: that candidate is
// returned first, so `git commit -F - <<E` with a body naming `git merge` is read as its unquoted `commit` candidate, never as a
// quoted merge. A body a known shell reads also gates as the command line it is.
// A quoted text naming `git … pull` the same way is a quoted pull candidate, ranked below a quoted merge. An unreadable command naming
// `git … pull` and no merge is a stuck pull: decide() reports its blind verification only when the reflog shows a landed merge.
function readMerge(r, cmd) {
  if (!r.readable) {
    if (shellWords.rawNamesVerb(cmd, MERGE_WORD)) return { stuck: true };
    return shellWords.rawNamesVerb(cmd, PULL_WORD) ? { stuck: true, verb: 'pull' } : null;
  }
  const best = bestCandidate(r);
  if (best && !best.quoted) return best;
  if (best && best.verb === 'merge') return best;
  const failed = (re) => r.failedQuoted.some((t) => shellWords.rawNamesVerb(t, re)) || r.texts.some((t) => shellWords.rawNamesVerb(t.text, re));
  if (failed(MERGE_WORD)) return { verb: 'merge', quoted: true, tokens: [], dirChanged: false };
  if (best) return best;
  return failed(PULL_WORD) ? { verb: 'pull', quoted: true, tokens: [], dirChanged: false } : null;
}
function bestCandidate(r) {
  let best = null;
  let rank = 4;
  let dirChanged = false;
  for (const c of r.commands) {
    if (c.level === 0 && c.words.length && CHANGES_DIR.has(c.words[0].value)) dirChanged = true;
    // The git command is read past the `NAME=` words and prefix wrappers (`nice -n 5`, `eval`, `sudo -u bob`), as merge-guard reads it.
    const words = c.words.slice(shellWords.commandStart(c.words));
    const g = shellWords.gitSubcommand(words);
    if (!g) continue;
    let verb = null;
    // A subcommand defined inline as an alias runs its value: `git -c alias.m=merge m`, or a `!` shell command naming `git … merge`.
    let sub = g.subcommand;
    if (g.alias !== null) {
      sub = g.alias.startsWith('!')
        ? (shellWords.rawNamesVerb(g.alias.slice(1), MERGE_WORD) ? 'merge' : shellWords.rawNamesVerb(g.alias.slice(1), PULL_WORD) ? 'pull' : null)
        : g.alias.trim().split(/\s+/)[0];
    }
    if (sub === 'merge') {
      // Every option word before the first non-option or `--` may be the `--abort` or `--quit`; the word after
      // a value-taking option is that option's value, whatever it reads like.
      let undoes = false;
      for (let k = g.index + 1; k < words.length; k++) {
        const w = words[k].value;
        if (w === '--' || !w.startsWith('-')) break;
        if (/^--(abort|quit)$/.test(w)) undoes = true;
        else if (takesMergeValue(w)) k++;
      }
      if (!undoes) verb = 'merge';
    } else if (sub === 'commit' || sub === 'pull') verb = sub;
    if (!verb) continue;
    const quoted = c.level > 0;
    const r2 = (quoted ? 2 : 0) + (verb === 'merge' ? 0 : 1);
    if (r2 < rank) {
      rank = r2;
      best = { verb, quoted, tokens: g.options, dirChanged };
    }
  }
  return best;
}

// The hook sees the command before the shell expands it, so a `-C` or `--work-tree` value holding
// `$NAME`, `${NAME}`, `$(…)`, a backtick, or a leading `~` names a path the hook cannot know.
// simplicity: tested on the unquoted word text, so a single-quoted or backslash-escaped `$` over-fires. That
// direction is safe (it blocks and names `-C` with a literal path); upgrade only with a shell parser.
const SHELL_EXPANSION = /[$`]|^~/;
function namesShellExpansion(tokens) {
  return ['-C', '--work-tree'].some((o) => optionValues(tokens, o).some((v) => SHELL_EXPANSION.test(v)));
}

// The merge's own working tree: a `--work-tree <path>` or `-C <path>` on the command, resolved
// against the session cwd (git itself resolves both relative to the shell's cwd at invocation, not to
// this hook's cwd), or the session cwd unchanged when the command names neither — a bare `git merge`
// keeps running where it always has. **`null` when the tree is unknowable**, in three shapes:
// the command changed directory before the merge and named no tree, it named only `--git-dir`, or a
// `-C` or `--work-tree` value holds shell syntax the hook sees unexpanded.
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
function resolveCwdFromTokens(tokens, dirChanged, sessionCwd) {
  const cValues = optionValues(tokens, '-C');
  if (namesShellExpansion(tokens)) return null;
  const cBase = cValues.reduce((base, v) => path.resolve(base, v), sessionCwd);
  const workTree = optionValue(tokens, '--work-tree');
  if (workTree) return path.resolve(cBase, workTree);
  if (optionValue(tokens, '--git-dir')) return null;
  if (cValues.length) return cBase;
  if (dirChanged) return null;
  return sessionCwd;
}

function resolveMergeCwd(cmd, sessionCwd) {
  const parsed = parseMergeCommand(cmd);
  if (!parsed || !parsed.tokens) return sessionCwd;
  return resolveCwdFromTokens(parsed.tokens, parsed.dirChanged, sessionCwd);
}

// Which of the two unknowable shapes a command is, for the blind reason resolveVerification() writes.
function namesOnlyGitDir(tokens) {
  return Boolean(optionValue(tokens, '--git-dir')) && !optionValue(tokens, '--work-tree');
}

// Which option resolveMergeCwd() actually took the resolved tree from, for the blind reason
// resolveVerification() writes when that tree turns out to carry no verification doc. Mirrors
// resolveCwdFromTokens()'s own precedence: `--work-tree` wins when present, `-C` otherwise — this is
// only called once resolveMergeCwd() has already returned a resolved (non-null, non-session) cwd, so
// one of the two is guaranteed to be there.
function resolvingOption(tokens) {
  return optionValue(tokens, '--work-tree') ? '--work-tree' : '-C';
}

// Every occurrence of one global option, in the order it appears, a value-less one left out.
function optionValues(tokens, option) {
  return tokens.filter((t) => t.name === option && t.value !== null).map((t) => t.value);
}

// One global option's value — the last occurrence, as git itself takes it.
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
// An unreadable command can be a shell syntax error (an unterminated quote, `$(`, `${`, or backtick) that
// ran nothing, so it claims no landed merge: an obedient revert would otherwise undo a real commit.
const SHELL_BLIND_STUCK =
  'superdev: if this command merged, nobody verified it. The command holds shell syntax ' +
  '(for example an unterminated quote, `$(`, `${`, or backtick, or nesting too deep) ' +
  'that the gate cannot read to its end, so it could not see the merge\'s working tree. ' +
  'If it merged, run the full test command in the merge\'s tree now, or revert that merge. ' +
  'Pass literal option values next time, such as a literal path: `git -C /abs/path merge …`.';
// The scanner behind every command read failed to load or to run (INV-0140).
const SHELL_BLIND_BROKEN =
  'superdev: green-gate could not read this command because the shared shell scanner (hooks/shell-words.js) ' +
  'failed to load or to run, so nobody can tell whether it merged. The superdev install is broken: ' +
  'reinstall or update the plugin. If this command merged, run the full test command in the merge\'s tree now.';

// What the gate runs, and where — or that it cannot tell. Both blind spots end here, because both are
// invisible to `decide()`: a tree it cannot name, and a resolved tree carrying no verification document
// while the session's does. The second is the asymmetry that matters — a `-C` path resolving somewhere
// other than the real merge tree reads exactly like an unconfigured repository, and the gate would go
// inert on a repository that configured it.
// Takes `parsed` — the caller's own parseMergeCommand(cmd) result — instead of parsing `cmd` itself, so
// a decision that also needs the cwd (main()'s own case) shares one parse across both.
function resolveVerification(parsed, cmd, sessionCwd) {
  const session = readVerification(sessionCwd);
  if (parsed && (parsed.stuck || parsed.broken)) {
    if (!session.full) return session;
    return { full: session.full, focused: session.focused, blind: parsed.broken ? SHELL_BLIND_BROKEN : SHELL_BLIND_STUCK };
  }
  const cwd = parsed ? resolveCwdFromTokens(parsed.tokens, parsed.dirChanged, sessionCwd) : sessionCwd;
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
// fence yields no block. scope.js and hooks/green-gate.js each carry this function, because the gate's
// decision never depends on scope.js loading (its scope.js require serves only the fail-silent trace
// write); tests/green-gate.test.js pins them byte-identical.
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
// happens once the cheap checks say this is a gated merge. It receives the one parseMergeCommand()
// result, so nothing parses the command twice; a caller that already parsed passes it as `parsed`.
// ADR 0123: a command naming `git merge` or `git commit` is a candidate, on PostToolUse and on
// PostToolUseFailure alike. A successful `git merge` call is gated from its command text alone. Every
// other candidate — a failed call, a `git commit`, or a merge found only inside the text of a quoted
// word (INV-0141) — runs the suite only when mergeLanded() finds a merge on top of the tree's HEAD reflog.
// For a quoted candidate decideMerge()'s mergeLanded() also requires that the gate has not run the suite on
// that HEAD yet (ranOnHead()), so a `grep "git merge"` after a gate run on that HEAD runs nothing.
function decide(input, getVerification, runTests, getChangedPaths, mergeInProgress, getCurrentBranch = () => '', mergeLanded = () => false, parsed) {
  if (input && input.agent_id) return { block: false }; // subagent → not our concern
  const cmd = (input && input.tool_input && input.tool_input.command) || '';
  if (parsed === undefined) parsed = parseMergeCommand(cmd);
  if (!parsed) return { block: false }; // names neither verb
  const stuck = Boolean(parsed.stuck || parsed.broken);
  // A stuck pull is probed like any pull: its blind verification needs a landed merge on the reflog.
  const stuckPull = Boolean(parsed.stuck && parsed.verb === 'pull');
  const namesMerge = (stuck && !stuckPull) || (parsed.verb === 'merge' && !parsed.quoted);
  const probe = !namesMerge || input.hook_event_name === 'PostToolUseFailure';
  const verification = getVerification(parsed);
  // A blind spot fails closed, before every check below: each of them — the configured command, the
  // branch read, the in-progress check — asks a question about a tree the gate could not resolve.
  // A candidate the reflog must decide has no tree to read it in, so it stays silent unless the
  // command is unreadable, whose reason already reads "if this command merged".
  if (verification && verification.blind) {
    return (stuck && (!stuckPull || mergeLanded())) || !probe ? { block: true, reason: verification.blind } : { block: false };
  }
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
    // notStarted keeps it out of the run trace: no process ran, so there is no verdict to record.
    if (e.status == null && e.signal == null) return { ok: false, notStarted: true, output: (e.message || '').trim() };
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
// `git commit` or `git merge --continue`), or `pull …` (a `git pull` that merged, fast-forwarded, or rebased).
// decide() has already ruled out a merge still waiting on a
// conflict. A repository with its reflog off, or no repository, yields no entry: not landed.
function mergeLanded(cwd) {
  try {
    const subject = execSync('git reflog -1 --format=%gs HEAD', { cwd, stdio: 'pipe', encoding: 'utf8' });
    return /^(merge |commit \(merge\)|pull[ :])/.test(subject);
  } catch {
    return false;
  }
}

// The HEAD sha the gate last ran a suite on, red or green, kept in a file of the tree's own git directory so
// it works in a run root and outside one. A merge named only inside quoted text (`grep -rn "git merge" .`)
// is gated for a landed merge the gate has not run the suite on yet: once a suite ran on this HEAD, and its
// result was reported, the same reflog entry gates nothing more. Any failure to read or write the marker
// reads as no run on this HEAD.
const RAN_HEAD_FILE = 'green-gate-ran-head';
function git(args, cwd) {
  return execSync(`git ${args}`, { cwd, stdio: 'pipe', encoding: 'utf8', timeout: 10000 }).trim();
}
function ranHeadFile(cwd) {
  return path.resolve(cwd, git(`rev-parse --git-path ${RAN_HEAD_FILE}`, cwd));
}
function ranOnHead(cwd) {
  try {
    return fs.readFileSync(ranHeadFile(cwd), 'utf8') === git('rev-parse HEAD', cwd);
  } catch {
    return false;
  }
}
function recordRanHead(cwd) {
  try {
    fs.writeFileSync(ranHeadFile(cwd), git('rev-parse HEAD', cwd));
  } catch {
    // no marker: the next quoted candidate gates the merge again, a cost of one suite run
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

// The full decision for one PostToolUse(Bash) input: parses the command once and
// shares that single parse between the cwd resolution and the verification lookup. main() calls this
// from the parsed stdin input; tests/green-gate.test.js calls it directly, so both run the same wiring
// instead of the suite re-deriving its own copy.
// INV-0017: the gate's own suite run is evidence the run trace carries, so `scope.js suite reusable`
// accepts a clean merge's tip. One `run` line in the run root that owns `cwd` (a scopetree or slicetree
// with a readable ledger): `full` only when the command run is the configured full command, the outcome,
// and the tree's commit and clean state. A run killed at its bound produced no verdict and records
// nothing; a cwd outside every run tree records nothing.
function traceSuiteRun(cwd, kind, result) {
  if (!appendTrace || !locate || !treeState || result.killed || result.notStarted) return;
  // A file under `cwd` locates the tree that owns it, so the tree root and any subpath of it attribute alike.
  const at = locate(path.join(cwd, 'x'));
  if (!at) return;
  // Budget: these two probes run after the suite, inside SUITE_MARGIN_MS. treeState() bounds each by
  // run-trace.js's GIT_BOUND_MS, far under the 30s margin, so a suite ending at its bound still leaves
  // the hook time to write its decision before the platform ceiling. The decision is written after the trace.
  const [sha, state] = treeState(at.tree);
  appendTrace(at.runRoot, { slice: at.slice, kind: 'run', fields: [kind, result.ok ? 'pass' : 'fail', sha, state, '-'] });
}

// timeoutMs is a test seam: undefined keeps runTests's production bound.
function decideMerge(input, sessionCwd, timeoutMs) {
  const cmd = (input && input.tool_input && input.tool_input.command) || '';
  const parsed = parseMergeCommand(cmd);
  // `null` when the tree is unknowable: resolveVerification() turns that into the blind reason
  // decide() blocks on, and the injected side effects below are never reached in that case.
  const cwd = parsed && parsed.tokens ? resolveCwdFromTokens(parsed.tokens, parsed.dirChanged, sessionCwd) : sessionCwd;
  let verification = null;
  return decide(
    input,
    (p) => (verification = resolveVerification(p, cmd, sessionCwd)),
    (tc) => {
      const result = runTests(tc, cwd, timeoutMs);
      traceSuiteRun(cwd, tc === verification.full ? 'full' : 'focused', result);
      if (!result.killed && !result.notStarted) recordRanHead(cwd);
      return result;
    },
    () => getChangedPaths(cwd),
    () => mergeInProgress(cwd),
    () => getCurrentBranch(cwd),
    // A pull that landed nothing leaves an older entry on top, so a pull, like a quoted candidate, gates only a HEAD not yet run on.
    () => mergeLanded(cwd) && !(parsed && (parsed.quoted || parsed.verb === 'pull') && ranOnHead(cwd)),
    parsed,
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
  readVerification,
  runTests,
  traceSuiteRun,
  mergeInProgress,
  mergeLanded,
  getChangedPaths,
  VERIFICATION_DOC,
  parseMergeCommand,
  resolveVerification,
  readHookTimeoutMs,
  suiteBoundMs,
  SUITE_MARGIN_MS,
  SUITE_TIMEOUT_MS,
};
