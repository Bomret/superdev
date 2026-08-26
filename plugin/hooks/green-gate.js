#!/usr/bin/env node
'use strict';

// green-gate: deterministic PostToolUse(Bash) gate on the controller's merges.
// The full playbook's rule (references/implement-full.md, DAG loop) is "a focused suite runs on the
// merge, automatically" — prompted, so a model can skip it. This makes it deterministic: after a
// controller `git merge`, run the command references/test-selection.md picks (focused over this merge's
// changed paths, falling back to the full command per its own rules); a RED suite exits 2 so the
// controller MUST fix or revert before continuing.
//
// The full test command lives in the first fenced block of docs/agents/verification.md
// (written by /superdev:setup); an optional second fenced block is the focused command
// (references/test-selection.md owns the full-versus-focused rule). No file / no command →
// no gate (zero-config repos are unaffected). Subagents can't merge (merge-guard blocks
// them pre-run), so a merge here is always the controller's; the agent_id check is
// belt-and-suspenders. The doc read, the suite run, the changed-path diff, the in-progress
// check, and the branch read all run in the merge's own working tree: a `-C <path>` on the
// merge command when the controller merges from another worktree, resolveMergeCwd()'s job, or
// the session cwd unchanged for a bare `git merge`. A scope worktree carries its own
// `docs/agents/verification.md` on its own branch, so a full run reading it from the session's
// invoking checkout instead would gate a merged scope with a stale or absent command.
// ponytail: the suite runs inside the hook, under the 600s `timeout` hooks.json sets on this
// hook's entry. That is also Claude Code's own default for a `command` hook, and it is set
// explicitly so the ceiling is stated where the suite runs. A suite slower than it is killed and
// the gate silently doesn't fire. A consumer repo whose suite needs more raises the `timeout` on
// this hook's hooks.json entry.

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
// `-C`'s alternative carries its own capturing group — resolveMergeCwd() below reads it — while
// `-c` and `--flags` stay uncaptured; `-c`'s VALUE could itself contain `-C `, but only in the
// global-options position this alternation walks, never inside `-c`'s own alternative.
const ARG = /(?:[^\s"'\\]|\\.|"(?:[^"\\]|\\.)*"|'[^']*')+/.source;
// `--abort` and `--quit` undo or abandon a merge — nothing new landed, so nothing to gate.
// `--continue` completes one and stays gated.
const IS_MERGE = new RegExp(
  `(^|[;&|\\n])\\s*git(?:\\s+(?:-c\\s+${ARG}|-C\\s+(${ARG})|--${ARG}))*\\s+merge(?![-\\w])(?!\\s+--(?:abort|quit)\\b)`,
  'm'
);

// Unquotes a captured ARG token so it reaches path.resolve as a plain string. ARG (the comment
// above it) matches a run of concatenated pieces — unquoted, single-quoted, double-quoted — with
// no separating whitespace (`-C /base/"my dir"`, `-C "/base"/sub`), the same way a shell resolves
// one word built from several quoting styles. So this walks the token piece by piece instead of
// keying off raw[0]: a single-quoted span passes through untouched (no escapes in the shell), a
// double-quoted span un-escapes `\x` to `x`, and an unquoted run does the same un-escaping.
function unquoteArg(raw) {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === "'") {
      const end = raw.indexOf("'", i + 1);
      // ARG guarantees a balanced token, so this never fires in practice — but `end === -1` would
      // otherwise slice to -1 and rewind `i` to 0, spinning forever on the same unclosed quote.
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

// The merge's own working tree: a `-C <path>` on the command, resolved against the session cwd
// (git itself resolves -C relative to the shell's cwd at invocation, not to this hook's cwd), or
// the session cwd unchanged when the command carries no -C — a bare `git merge` keeps running
// where it always has.
function resolveMergeCwd(cmd, sessionCwd) {
  const m = IS_MERGE.exec(cmd);
  const raw = m && m[2];
  return raw ? path.resolve(sessionCwd, unquoteArg(raw)) : sessionCwd;
}
const VERIFICATION_DOC = 'docs/agents/verification.md';

// references/test-selection.md: the first fenced block is the full command, the optional
// second is the focused one. Both trimmed; { full: null } when the doc is missing.
function readVerification(cwd) {
  let raw;
  try {
    raw = fs.readFileSync(path.join(cwd, VERIFICATION_DOC), 'utf8');
  } catch {
    return { full: null, focused: null }; // no verification doc → no gate
  }
  const blocks = [...raw.matchAll(/```[a-zA-Z0-9]*\n([\s\S]*?)```/g)].map((m) => m[1].trim());
  return { full: blocks[0] || null, focused: blocks[1] || null };
}

// Single-quote a path so it reaches the shell as one argument, escaping embedded single quotes.
function shQuote(p) {
  return `'${p.replace(/'/g, `'\\''`)}'`;
}

// references/test-selection.md, "Fallback to the full command": no focused block, or an empty
// changed-path set, both run the full command instead.
function pickCommand(verification, getChangedPaths) {
  if (!verification.focused) return verification.full;
  const paths = getChangedPaths();
  if (!paths.length) return verification.full;
  if (!verification.focused.includes('{paths}')) return verification.focused;
  const quoted = paths.map(shQuote).join(' ');
  // A replacer function, not a plain string: a global regex substitutes every `{paths}` token, not
  // just the first, and a function's return value is inserted literally — a changed path containing a
  // `$`-pattern (`$&`, `$1`, …) would otherwise be reinterpreted as a replacement-string directive.
  return verification.focused.replace(/\{paths\}/g, () => quoted);
}

// decide() is pure over its inputs so it is unit-testable; getVerification, runTests,
// getChangedPaths, mergeInProgress, and getCurrentBranch inject the side effects. getVerification
// is a thunk — PostToolUse(Bash) fires on every Bash call, so the doc read only happens once the
// cheap checks say this is a gated merge.
function decide(input, getVerification, runTests, getChangedPaths, mergeInProgress, getCurrentBranch = () => '') {
  if (input && input.agent_id) return { block: false }; // subagent → not our concern
  const cmd = (input && input.tool_input && input.tool_input.command) || '';
  if (!IS_MERGE.test(cmd)) return { block: false }; // not a merge
  const verification = getVerification();
  if (!verification || !verification.full) return { block: false }; // no gate configured
  // ADR 0033: a merge whose checkout is on an integration branch is a wide refactor's batch merge —
  // green is promised at the integrate-and-verify merge into the scope branch, so the gate defers here
  // and fires there. The prefix check is on `integration/` with the slash: a branch merely named
  // `integration` gets no deferral.
  if (getCurrentBranch().startsWith('integration/')) return { block: false };
  // A conflicted merge left MERGE_HEAD behind: nothing merged yet, so a suite run would test the
  // unchanged (or conflicted) tree and blame the merge. Skip; the run-handoff full suite still runs.
  if (mergeInProgress && mergeInProgress()) return { block: false };
  const testCommand = pickCommand(verification, getChangedPaths);
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
    // maxBuffer well above Node's 1 MiB default: a chatty green suite killed with ENOBUFS would
    // land in the catch and read as RED.
    execSync(testCommand, { cwd, stdio: 'pipe', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return { ok: true, output: '' };
  } catch (e) {
    // status == null with no signal means the suite never started at all — e.g. a -C cwd that
    // doesn't exist (ENOENT): the OS never got as far as running a process to kill. That's not
    // "no verdict", it's "the merge's own working tree can't even run the suite", so it gates
    // like a RED verdict rather than failing open.
    if (e.status == null && e.signal == null) return { ok: false, output: (e.message || '').trim() };
    // status == null with a signal means the suite started and was killed (signal, ENOBUFS) — no
    // verdict, so fail open, same as the 600s hook timeout ceiling documented above.
    if (e.status == null) return { ok: true, output: '' };
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

// The merge target: the checkout's current branch. Empty when HEAD is detached inside rev-parse's
// error path or the cwd is no repo — both read as "not an integration branch", so the gate still fires.
function getCurrentBranch(cwd) {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

// references/test-selection.md, "The changed-path set": the merge's ORIG_HEAD against HEAD, not
// HEAD^1 — a conflicted merge leaves HEAD unmoved with ORIG_HEAD equal to it (an empty set, which
// decide()'s fallback catches), where HEAD^1 would instead return the previous commit's paths,
// stale. Falls back to HEAD^1 where ORIG_HEAD does not resolve.
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
    // read all happen in the merge's own working tree (resolveMergeCwd()'s -C, or the session cwd
    // with no -C).
    const sessionCwd = (input && input.cwd) || process.cwd();
    const cmd = (input && input.tool_input && input.tool_input.command) || '';
    const cwd = resolveMergeCwd(cmd, sessionCwd);
    const { block, reason } = decide(
      input,
      () => readVerification(cwd),
      (tc) => runTests(tc, cwd),
      () => getChangedPaths(cwd),
      () => mergeInProgress(cwd),
      () => getCurrentBranch(cwd),
    );
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
  // decide() takes the verification as a thunk; full() returns one.
  const full = (cmd) => () => ({ full: cmd, focused: null });
  const notCalled = () => {
    throw new Error('getChangedPaths should not be called when no focused command is configured');
  };

  assert.equal(decide(merge('git merge --no-ff slice/s1'), full('npm test'), green, notCalled).block, false, 'green passes');
  assert.equal(decide(merge('git merge --no-ff slice/s1'), full('npm test'), red, notCalled).block, true, 'red blocks');
  assert.equal(decide(merge('git merge --no-ff slice/s1'), full(null), red, notCalled).block, false, 'no command → no gate');
  assert.equal(decide(merge('git status'), full('npm test'), red, notCalled).block, false, 'non-merge ignored');
  assert.equal(decide(merge('git merge x', { agent_id: 'a1' }), full('npm test'), red, notCalled).block, false, 'subagent ignored');
  assert.equal(decide(merge('forgit merge'), full('npm test'), red, notCalled).block, false, 'no substring false positive');
  assert.equal(decide(merge('git merge-base main HEAD'), full('npm test'), red, notCalled).block, false, 'merge-base is read-only, not a merge');
  assert.equal(decide(merge('git merge-tree a b'), full('npm test'), red, notCalled).block, false, 'merge-tree is read-only');
  assert.equal(decide(merge('cd x && git merge y'), full('npm test'), red, notCalled).block, true, 'after &&');
  assert.equal(decide(merge('echo done\ngit merge --no-ff s'), full('npm test'), red, notCalled).block, true, 'merge on a later line');
  assert.equal(decide(merge('git -C ../wt merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'git -C merge is gated');
  assert.equal(decide(merge('git -C "path with spaces" merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'git -C <quoted path> merge is gated');
  assert.equal(decide(merge("git -C 'path with spaces' merge slice/x/1"), full('npm test'), red, notCalled).block, true, 'git -C <single-quoted path> merge is gated');
  assert.equal(decide(merge('git -C "a \\" b" merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'git -C <double-quoted path with escaped quote> merge is gated');
  assert.equal(decide(merge('git -C ~/my\\ path merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'git -C <backslash-escaped space, unquoted> merge is gated');
  assert.equal(decide(merge('git -c k="v w" merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'git -c <unquoted key, quoted value> merge is gated');
  assert.equal(decide(merge('git --git-dir="a b" merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'git --git-dir="quoted value with space" merge is gated');
  assert.equal(decide(merge('git -c core.editor=true commit -m x'), full('npm test'), red, notCalled).block, false, 'git -c commit ignored');
  assert.equal(decide(merge('git merge --abort'), full('npm test'), red, notCalled).block, false, 'merge --abort undoes a merge, not gated');
  assert.equal(decide(merge('git merge --quit'), full('npm test'), red, notCalled).block, false, 'merge --quit abandons a merge, not gated');
  assert.equal(decide(merge('git merge --continue'), full('npm test'), red, notCalled).block, true, 'merge --continue completes a merge, gated');

  // a merge left unresolved (MERGE_HEAD present) → skip; nothing merged yet to gate
  assert.equal(
    decide(merge('git merge conflicting'), full('npm test'), red, notCalled, () => true).block,
    false,
    'an in-progress conflicted merge is not gated',
  );

  // --- ADR 0033: a merge into an integration branch defers the gate ---
  {
    const onBranch = (name) => () => name;
    const suiteNotRun = () => {
      throw new Error('the suite should not run on an integration-branch merge');
    };
    assert.equal(
      decide(merge('git merge --no-ff slice/s1'), full('npm test'), suiteNotRun, notCalled, () => false, onBranch('integration/wide-rename')).block,
      false,
      'a merge on an integration/* branch is deferred, suite not run',
    );
    assert.equal(
      decide(merge('git merge --no-ff integration/wide-rename'), full('npm test'), red, notCalled, () => false, onBranch('refactor/wide-rename')).block,
      true,
      'the integrate-and-verify merge into the scope branch is gated',
    );
    assert.equal(
      decide(merge('git merge x'), full('npm test'), red, notCalled, () => false, onBranch('integration')).block,
      true,
      'a branch named exactly `integration` (no slash) gets no deferral',
    );
    assert.equal(
      decide(merge('git merge x'), full('npm test'), red, notCalled, () => false, onBranch('')).block,
      true,
      'an unreadable branch (detached HEAD, no repo) fails closed: still gated',
    );
  }

  // the verification doc is only read once the cheap checks pass — PostToolUse fires on every Bash call
  {
    const readNotCalled = () => {
      throw new Error('getVerification should not be called for a non-merge command');
    };
    assert.equal(decide(merge('git status'), readNotCalled, red, notCalled).block, false, 'non-merge never reads the verification doc');
  }

  // runTests: a verdict only when the suite actually ran to an exit code
  assert.equal(runTests('exit 0').ok, true, 'exit 0 is GREEN');
  assert.equal(runTests('exit 3').ok, false, 'a nonzero exit is RED');
  assert.equal(
    runTests(`node -e "process.stdout.write('x'.repeat(2 * 1024 * 1024))"`).ok,
    true,
    'a green suite with >1 MiB of output stays GREEN (maxBuffer above the Node default)',
  );
  assert.equal(runTests('kill -9 $$').ok, true, 'a killed suite (status null) is no verdict — fails open, not RED');
  assert.equal(
    runTests('exit 0', '/definitely/does/not/exist-gg-selftest').ok,
    false,
    'a cwd that does not exist at all could not even start the suite — blocks rather than failing open',
  );

  // ARG mirrors merge-guard's token (the comment above owns why); hooks stay standalone, so pin
  // the copy against the canonical one instead of sharing it — silent drift would be a bug.
  {
    const sibling = fs.readFileSync(path.join(__dirname, 'merge-guard.js'), 'utf8');
    const m = sibling.match(/^const ARG = \/(.*)\/\.source;$/m);
    assert.ok(m, 'merge-guard.js declares its ARG token where this pin expects it');
    assert.equal(ARG, m[1], 'green-gate ARG is byte-identical to merge-guard ARG');
  }

  // --- resolveMergeCwd(): the merge's own working tree, from -C or the session cwd fallback ---
  assert.equal(resolveMergeCwd('git merge --no-ff s', '/session'), '/session', 'no -C → the session cwd');
  assert.equal(resolveMergeCwd('git -C /wt merge slice/x/1', '/session'), '/wt', 'a bare -C path is used as-is (already absolute)');
  assert.equal(resolveMergeCwd('git -C ../wt merge slice/x/1', '/session'), '/wt', 'a relative -C path resolves against the session cwd');
  assert.equal(
    resolveMergeCwd('git -C "path with spaces" merge slice/x/1', '/session'),
    '/session/path with spaces',
    'a double-quoted -C path with spaces is unquoted before resolution',
  );
  assert.equal(
    resolveMergeCwd("git -C 'path with spaces' merge slice/x/1", '/session'),
    '/session/path with spaces',
    'a single-quoted -C path with spaces is unquoted before resolution',
  );
  assert.equal(
    resolveMergeCwd('git -C "a \\" b" merge slice/x/1', '/session'),
    '/session/a " b',
    'an escaped quote inside a double-quoted -C path survives unquoting',
  );
  assert.equal(
    resolveMergeCwd('git -C my\\ path merge slice/x/1', '/session'),
    '/session/my path',
    'a backslash-escaped space in an unquoted -C path is unescaped',
  );
  assert.equal(resolveMergeCwd('git merge -C /wt slice/x/1', '/session'), '/session', '-C after `merge` is a merge argument, not the global option');
  assert.equal(
    resolveMergeCwd('git -C /base/"my dir" merge slice/x/1', '/session'),
    '/base/my dir',
    'a -C path with a trailing quoted segment is unquoted across both the unquoted and quoted runs',
  );
  assert.equal(
    resolveMergeCwd('git -C "/base"/sub merge slice/x/1', '/session'),
    '/base/sub',
    'a -C path with a leading quoted segment is unquoted across both the quoted and unquoted runs',
  );

  // unquoteArg() is bounded even on a malformed, unbalanced token — ARG guarantees balance in
  // practice, so this is defensive: without the bound, an unclosed `'` rewinds `i` to 0 and an
  // unclosed `"` never meets its terminator, either way spinning forever instead of returning.
  assert.equal(unquoteArg("it's"), 'it', "an unclosed single quote terminates instead of spinning");
  assert.equal(
    unquoteArg('unterminated "double'),
    'unterminated double',
    'an unclosed double quote terminates instead of spinning',
  );

  // --- references/test-selection.md: full vs. focused command selection ---

  // no second fenced block configured → runs the full command, unchanged
  {
    let ran;
    const spy = (tc) => { ran = tc; return green(); };
    const result = decide(merge('git merge --no-ff slice/s1'), full('npm test'), spy, notCalled);
    assert.equal(ran, 'npm test', 'no focused block → runs the full command');
    assert.equal(result.block, false, 'green full run passes');
  }

  // focused block with {paths} → substitutes the shell-quoted changed-path set
  {
    let ran;
    const spy = (tc) => { ran = tc; return green(); };
    const verification = { full: 'npm test', focused: 'npm test -- {paths}' };
    decide(merge('git merge --no-ff slice/s1'), () => verification, spy, () => ['src/a.js', 'src/b.js']);
    assert.equal(ran, "npm test -- 'src/a.js' 'src/b.js'", 'focused {paths} token is substituted with the changed paths');
  }

  // focused block with no {paths} token → runs verbatim, for a runner that detects its own change set
  {
    let ran;
    const spy = (tc) => { ran = tc; return green(); };
    const verification = { full: 'npm test', focused: 'vitest --changed' };
    decide(merge('git merge --no-ff slice/s1'), () => verification, spy, () => ['src/a.js']);
    assert.equal(ran, 'vitest --changed', 'focused command with no {paths} token runs verbatim');
  }

  // empty changed-path set → falls back to the full command instead of a focused run over nothing
  {
    let ran;
    const spy = (tc) => { ran = tc; return green(); };
    const verification = { full: 'npm test', focused: 'npm test -- {paths}' };
    decide(merge('git merge --no-ff slice/s1'), () => verification, spy, () => []);
    assert.equal(ran, 'npm test', 'empty changed-path set falls back to the full command');
  }

  // a changed path with a space reaches the command as a single shell-quoted argument
  {
    let ran;
    const spy = (tc) => { ran = tc; return green(); };
    const verification = { full: 'npm test', focused: 'npm test -- {paths}' };
    decide(merge('git merge --no-ff slice/s1'), () => verification, spy, () => ['a b/c.js']);
    assert.equal(ran, "npm test -- 'a b/c.js'", 'a changed path with a space is a single quoted argument');
  }

  // a RED focused run blocks with the same message shape a RED full run blocks with, naming the command
  {
    const verification = { full: 'npm test', focused: 'npm test -- {paths}' };
    const result = decide(merge('git merge --no-ff slice/s1'), () => verification,red, () => ['src/a.js']);
    assert.equal(result.block, true, 'RED focused run blocks');
    assert.match(result.reason, /npm test -- 'src\/a\.js'/, 'block reason names the focused command it ran');
    assert.match(result.reason, /FAIL foo/, 'block reason carries the failure output');
  }

  // a focused command with two {paths} tokens gets both substituted, not just the first — a plain
  // `String.replace(str, ...)` only touches the first occurrence
  {
    let ran;
    const spy = (tc) => { ran = tc; return green(); };
    const verification = { full: 'npm test', focused: 'pytest {paths} && ruff check {paths}' };
    decide(merge('git merge --no-ff slice/s1'), () => verification, spy, () => ['x.py']);
    assert.equal(ran, "pytest 'x.py' && ruff check 'x.py'", 'both {paths} tokens are substituted');
  }

  // a changed path containing a `$`-pattern (`$&`, `$1`, …) survives substitution intact — a plain
  // `String.replace(str, str)` interprets those specially in the replacement string
  {
    let ran;
    const spy = (tc) => { ran = tc; return green(); };
    const verification = { full: 'npm test', focused: 'npm test -- {paths}' };
    decide(merge('git merge --no-ff slice/s1'), () => verification, spy, () => ['a$&b.js']);
    assert.equal(ran, "npm test -- 'a$&b.js'", 'a `$&` in a changed path is not treated as a replacement pattern');
  }

  // fenced-block parsing
  const tmp = require('node:os').tmpdir();
  const dir = fs.mkdtempSync(path.join(tmp, 'gg-'));
  fs.mkdirSync(path.join(dir, 'docs/agents'), { recursive: true });
  fs.writeFileSync(path.join(dir, VERIFICATION_DOC), '# Verification\n\n```sh\nnpm test\n```\n');
  assert.deepEqual(readVerification(dir), { full: 'npm test', focused: null }, 'parses full command, no focused block');
  assert.deepEqual(readVerification(path.join(dir, 'nope')), { full: null, focused: null }, 'missing doc → nulls');

  fs.writeFileSync(
    path.join(dir, VERIFICATION_DOC),
    '# Verification\n\n```sh\nnpm test\n```\n\n```sh\nnpm test -- {paths}\n```\n',
  );
  assert.deepEqual(
    readVerification(dir),
    { full: 'npm test', focused: 'npm test -- {paths}' },
    'parses both the full and the focused command',
  );

  // --- getChangedPaths(): a real git repo, exercising the ORIG_HEAD / HEAD^1 correction ---
  {
    const os = require('node:os');
    function gitTest(args, cwd) {
      require('node:child_process').execFileSync('git', args, { cwd, stdio: 'ignore' });
    }
    function commit(cwd, file, msg) {
      fs.writeFileSync(path.join(cwd, file), 'x\n');
      gitTest(['add', '.'], cwd);
      gitTest(['commit', '-q', '-m', msg], cwd);
    }

    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-repo-'));
    gitTest(['init', '-q', '-b', 'main'], repo);
    gitTest(['config', 'user.email', 'test@example.com'], repo);
    gitTest(['config', 'user.name', 'test'], repo);
    commit(repo, 'base.txt', 'base');

    gitTest(['checkout', '-q', '-b', 'feature'], repo);
    commit(repo, 'feature.txt', 'feature work');
    gitTest(['checkout', '-q', 'main'], repo);
    gitTest(['merge', '-q', '--no-ff', 'feature', '-m', 'merge feature'], repo);
    assert.deepEqual(
      getChangedPaths(repo),
      ['feature.txt'],
      'a --no-ff merge reports the paths the branch introduced, via ORIG_HEAD',
    );

    // a merge that leaves HEAD unmoved (ORIG_HEAD == HEAD) → an empty changed-path set
    gitTest(['update-ref', 'ORIG_HEAD', 'HEAD'], repo);
    assert.deepEqual(getChangedPaths(repo), [], 'ORIG_HEAD equal to HEAD → empty changed-path set');

    // mergeInProgress(): a conflicted merge leaves MERGE_HEAD behind; --abort clears it
    assert.equal(mergeInProgress(repo), false, 'no merge in progress on a clean tree');
    gitTest(['checkout', '-q', '-b', 'left'], repo);
    fs.writeFileSync(path.join(repo, 'base.txt'), 'left\n');
    gitTest(['commit', '-q', '-am', 'left'], repo);
    gitTest(['checkout', '-q', 'main'], repo);
    fs.writeFileSync(path.join(repo, 'base.txt'), 'right\n');
    gitTest(['commit', '-q', '-am', 'right'], repo);
    try {
      gitTest(['merge', 'left'], repo); // conflicts on base.txt
    } catch {
      // the conflict is the point
    }
    assert.equal(mergeInProgress(repo), true, 'a conflicted merge is detected via MERGE_HEAD');
    gitTest(['merge', '--abort'], repo);
    assert.equal(mergeInProgress(repo), false, 'merge --abort clears MERGE_HEAD');

    // no ORIG_HEAD ref at all → falls back to HEAD^1
    const repo2 = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-repo2-'));
    gitTest(['init', '-q', '-b', 'main'], repo2);
    gitTest(['config', 'user.email', 'test@example.com'], repo2);
    gitTest(['config', 'user.name', 'test'], repo2);
    commit(repo2, 'base.txt', 'base');
    commit(repo2, 'next.txt', 'next');
    assert.deepEqual(
      getChangedPaths(repo2),
      ['next.txt'],
      'no ORIG_HEAD ref → falls back to HEAD^1',
    );

    // neither ORIG_HEAD nor HEAD^1 resolves (a single initial commit, no ORIG_HEAD) → the
    // hard-coded [] return, not the () => [] stub decide()'s fallback test injects elsewhere
    const repo3 = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-repo3-'));
    gitTest(['init', '-q', '-b', 'main'], repo3);
    gitTest(['config', 'user.email', 'test@example.com'], repo3);
    gitTest(['config', 'user.name', 'test'], repo3);
    commit(repo3, 'base.txt', 'base');
    assert.deepEqual(
      getChangedPaths(repo3),
      [],
      'no ORIG_HEAD and no HEAD^1 (single initial commit) → empty changed-path set',
    );
    fs.rmSync(repo3, { recursive: true, force: true });

    // a quote, a backslash, a non-ASCII character, and a trailing space in a changed path all reach
    // the caller intact — git C-quotes these by default (core.quotePath), and a plain `.trim()` would
    // also corrupt the trailing-space one; -z disables the quoting and drops the trim
    const repo4 = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-repo4-'));
    gitTest(['init', '-q', '-b', 'main'], repo4);
    gitTest(['config', 'user.email', 'test@example.com'], repo4);
    gitTest(['config', 'user.name', 'test'], repo4);
    commit(repo4, 'base.txt', 'base');
    const weird = ['da"sh.js', 'back\\slash.js', 'ünïcödé.js', 'trailing space.js '];
    for (const f of weird) fs.writeFileSync(path.join(repo4, f), 'x\n');
    gitTest(['add', '.'], repo4);
    gitTest(['commit', '-q', '-m', 'weird names'], repo4);
    assert.deepEqual(
      getChangedPaths(repo4).sort(),
      [...weird].sort(),
      'a quote, a backslash, a non-ASCII character, and a trailing space all reach the caller unquoted and untrimmed',
    );
    fs.rmSync(repo4, { recursive: true, force: true });
  }

  // --- main()'s own -C wiring: spawn the hook, since only main() ties resolveMergeCwd() to the
  // suite run, the changed-path diff, the in-progress check, and the current-branch read ---
  {
    const os = require('node:os');
    const cp = require('node:child_process');
    function git2(args, cwd) {
      cp.execFileSync('git', args, { cwd, stdio: 'ignore' });
    }
    function initRepo(dir) {
      fs.mkdirSync(dir, { recursive: true });
      git2(['init', '-q', '-b', 'main'], dir);
      git2(['config', 'user.email', 'test@example.com'], dir);
      git2(['config', 'user.name', 'test'], dir);
    }
    function commitFile(dir, file, content) {
      fs.writeFileSync(path.join(dir, file), content);
      git2(['add', '.'], dir);
      git2(['commit', '-q', '-m', file], dir);
    }
    function writeVerification(dir, full, focused) {
      fs.mkdirSync(path.join(dir, 'docs/agents'), { recursive: true });
      const blocks = focused ? `\`\`\`sh\n${full}\n\`\`\`\n\n\`\`\`sh\n${focused}\n\`\`\`\n` : `\`\`\`sh\n${full}\n\`\`\`\n`;
      fs.writeFileSync(path.join(dir, VERIFICATION_DOC), `# Verification\n\n${blocks}`);
    }
    function runHook(inputObj) {
      return cp.spawnSync(process.execPath, [__filename], { input: JSON.stringify(inputObj), encoding: 'utf8', timeout: 15000 });
    }
    function tmp(prefix) {
      return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    }

    // `git -C <path> merge`: a suite that fails in <path> blocks, quoting that failure — not a
    // session-cwd failure, which would pass this test even on the bug this slice fixes
    {
      const session = tmp('gg-session-');
      const target = tmp('gg-target-');
      initRepo(session);
      commitFile(session, 'base.txt', 'x\n');
      initRepo(target);
      commitFile(target, 'base.txt', 'x\n');
      fs.writeFileSync(path.join(target, 'fail-marker'), '');
      writeVerification(target, `node -e "console.error('TARGET-CHECK'); process.exit(require('fs').existsSync('fail-marker') ? 1 : 0)"`);
      const result = runHook({ cwd: session, tool_input: { command: `git -C '${target}' merge --no-ff other` } });
      assert.equal(result.status, 2, 'a -C merge whose target suite fails blocks');
      assert.match(result.stderr, /TARGET-CHECK/, 'the block report quotes the -C target failure, not a session-cwd run');
      fs.rmSync(session, { recursive: true, force: true });
      fs.rmSync(target, { recursive: true, force: true });
    }

    // the verification doc itself is read from the -C target, not the session — a scope worktree
    // carries its own docs/agents/verification.md on its own branch, so a full run must gate on ITS
    // command. Two facets: a doc the target introduces (absent at session) still gates, and a doc
    // that differs from the session's runs the target's own command, never the session's.
    {
      const session = tmp('gg-session-');
      const target = tmp('gg-target-');
      initRepo(session);
      commitFile(session, 'base.txt', 'x\n');
      initRepo(target);
      commitFile(target, 'base.txt', 'x\n');
      // Session carries no verification doc at all; only the target's own branch introduced one.
      writeVerification(target, `node -e "console.error('TARGET-ONLY-DOC'); process.exit(1)"`);
      const introduced = runHook({ cwd: session, tool_input: { command: `git -C '${target}' merge --no-ff other` } });
      assert.equal(introduced.status, 2, 'a verification doc introduced only on the -C target still gates');
      assert.match(introduced.stderr, /TARGET-ONLY-DOC/, "the block report ran the target's own command");
      fs.rmSync(target, { recursive: true, force: true });

      initRepo(target);
      commitFile(target, 'base.txt', 'x\n');
      writeVerification(session, 'node -e "process.exit(0)"'); // session: always green
      writeVerification(target, `node -e "console.error('TARGET-COMMAND'); process.exit(1)"`); // target: always red
      const diverged = runHook({ cwd: session, tool_input: { command: `git -C '${target}' merge --no-ff other` } });
      assert.equal(diverged.status, 2, "the target's own (red) command runs, not the session's (green) one");
      assert.match(diverged.stderr, /TARGET-COMMAND/, "the block report quotes the target's own command output");
      fs.rmSync(session, { recursive: true, force: true });
      fs.rmSync(target, { recursive: true, force: true });
    }

    // a bare `git merge` still runs the suite in the session cwd, exactly as before
    {
      const session = tmp('gg-session-');
      initRepo(session);
      commitFile(session, 'base.txt', 'x\n');
      fs.writeFileSync(path.join(session, 'session-marker'), '');
      writeVerification(session, `node -e "process.exit(require('fs').existsSync('session-marker') ? 1 : 0)"`);
      const result = runHook({ cwd: session, tool_input: { command: 'git merge --no-ff other' } });
      assert.equal(result.status, 2, 'a bare merge still runs the suite in the session cwd');
      fs.rmSync(session, { recursive: true, force: true });
    }

    // the changed-path set (and so the focused-command substitution) is computed against the -C
    // target, not the session — a real merge in the target introduces feature.txt
    {
      const session = tmp('gg-session-');
      const target = tmp('gg-target-');
      initRepo(session);
      commitFile(session, 'base.txt', 'x\n');
      initRepo(target);
      commitFile(target, 'base.txt', 'x\n');
      git2(['checkout', '-q', '-b', 'feature'], target);
      commitFile(target, 'feature.txt', 'x\n');
      git2(['checkout', '-q', 'main'], target);
      git2(['merge', '-q', '--no-ff', 'feature', '-m', 'merge feature'], target);
      writeVerification(
        target,
        'node -e "process.exit(0)"',
        `node -e "console.error('PATHS:' + process.argv.slice(1).join(',')); process.exit(1)" {paths}`,
      );
      const result = runHook({ cwd: session, tool_input: { command: `git -C '${target}' merge --no-ff other` } });
      assert.equal(result.status, 2, 'the focused run over the -C target changed paths fails as configured');
      assert.match(result.stderr, /PATHS:feature\.txt/, 'the changed-path set is computed against the -C target, not the session');
      fs.rmSync(session, { recursive: true, force: true });
      fs.rmSync(target, { recursive: true, force: true });
    }

    // ADR 0033's integration/ deferral reads the -C target's own current branch
    {
      const session = tmp('gg-session-');
      const target = tmp('gg-target-');
      initRepo(session);
      commitFile(session, 'base.txt', 'x\n');
      initRepo(target);
      commitFile(target, 'base.txt', 'x\n');
      git2(['checkout', '-q', '-b', 'integration/foo'], target);
      writeVerification(target, 'node -e "process.exit(1)"');
      const deferred = runHook({ cwd: session, tool_input: { command: `git -C '${target}' merge --no-ff other` } });
      assert.equal(deferred.status, 0, 'a merge whose -C target sits on integration/* is deferred, not gated');

      // git's loose-ref storage can't hold both `integration/foo` and `integration` (a file where a
      // directory prefix already exists) — drop the first before creating the second
      git2(['checkout', '-q', 'main'], target);
      git2(['branch', '-D', 'integration/foo'], target);
      git2(['checkout', '-q', '-b', 'integration'], target); // exactly `integration`, no slash
      const gated = runHook({ cwd: session, tool_input: { command: `git -C '${target}' merge --no-ff other` } });
      assert.equal(gated.status, 2, "a -C target branch named exactly `integration` gets no deferral, still gated");
      fs.rmSync(session, { recursive: true, force: true });
      fs.rmSync(target, { recursive: true, force: true });
    }

    // a -C path that is not a git repository fails closed: reading its own verification doc needs
    // no git repository at all — just a real directory — so the gate still fires from that doc
    {
      const session = tmp('gg-session-');
      const target = tmp('gg-notrepo-');
      initRepo(session);
      commitFile(session, 'base.txt', 'x\n');
      writeVerification(target, 'node -e "process.exit(1)"');
      const result = runHook({ cwd: session, tool_input: { command: `git -C '${target}' merge --no-ff other` } });
      assert.equal(result.status, 2, 'a -C path that is not a git repository still gates rather than silently passing');
      fs.rmSync(session, { recursive: true, force: true });
      fs.rmSync(target, { recursive: true, force: true });
    }

    // a -C path that does not exist at all has no verification doc to read there either — the gate
    // stays inert, which is correct: `git -C <nonexistent>` already failed before merging anything,
    // so there is nothing this gate would be blocking.
    {
      const session = tmp('gg-session-');
      const target = path.join(tmp('gg-parent-'), 'does-not-exist');
      initRepo(session);
      commitFile(session, 'base.txt', 'x\n');
      writeVerification(session, 'node -e "process.exit(1)"');
      const result = runHook({ cwd: session, tool_input: { command: `git -C '${target}' merge --no-ff other` } });
      assert.equal(result.status, 0, 'a -C path that does not exist carries no verification doc, so the gate stays inert');
      fs.rmSync(session, { recursive: true, force: true });
    }

    // no verification doc configured → inert at both command shapes, no error
    {
      const session = tmp('gg-session-');
      const target = tmp('gg-target-');
      initRepo(session);
      commitFile(session, 'base.txt', 'x\n');
      initRepo(target);
      commitFile(target, 'base.txt', 'x\n');
      const bare = runHook({ cwd: session, tool_input: { command: 'git merge --no-ff other' } });
      assert.equal(bare.status, 0, 'no verification doc → inert on a bare merge');
      assert.equal(bare.stderr, '', 'and prints nothing');
      const withC = runHook({ cwd: session, tool_input: { command: `git -C '${target}' merge --no-ff other` } });
      assert.equal(withC.status, 0, 'no verification doc → inert on a -C merge too');
      assert.equal(withC.stderr, '', 'and prints nothing');
      fs.rmSync(session, { recursive: true, force: true });
      fs.rmSync(target, { recursive: true, force: true });
    }
  }

  console.log('green-gate selftest ok');
} else {
  main();
}
