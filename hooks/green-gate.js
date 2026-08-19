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
// belt-and-suspenders.
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
const ARG = /(?:[^\s"'\\]|\\.|"(?:[^"\\]|\\.)*"|'[^']*')+/.source;
const IS_MERGE = new RegExp(
  `(^|[;&|\\n])\\s*git(?:\\s+(?:-[cC]\\s+${ARG}|--${ARG}))*\\s+merge(?![-\\w])`,
  'm'
);
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

// decide() is pure over its inputs (cmd + verification doc) so it is unit-testable; runTests and
// getChangedPaths inject the side effects.
function decide(input, verification, runTests, getChangedPaths) {
  if (input && input.agent_id) return { block: false }; // subagent → not our concern
  const cmd = (input && input.tool_input && input.tool_input.command) || '';
  if (!IS_MERGE.test(cmd)) return { block: false }; // not a merge
  if (!verification || !verification.full) return { block: false }; // no gate configured
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
    execSync(testCommand, { cwd, stdio: 'pipe', encoding: 'utf8' });
    return { ok: true, output: '' };
  } catch (e) {
    const out = ((e.stdout || '') + (e.stderr || '')).trim();
    // tail — the failing assertions are at the end, and we don't want to flood context
    return { ok: false, output: out.split('\n').slice(-40).join('\n') };
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
    const cwd = (input && input.cwd) || process.cwd();
    const verification = readVerification(cwd);
    const { block, reason } = decide(input, verification, (tc) => runTests(tc, cwd), () => getChangedPaths(cwd));
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
  const full = (cmd) => ({ full: cmd, focused: null });
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
    decide(merge('git merge --no-ff slice/s1'), verification, spy, () => ['src/a.js', 'src/b.js']);
    assert.equal(ran, "npm test -- 'src/a.js' 'src/b.js'", 'focused {paths} token is substituted with the changed paths');
  }

  // focused block with no {paths} token → runs verbatim, for a runner that detects its own change set
  {
    let ran;
    const spy = (tc) => { ran = tc; return green(); };
    const verification = { full: 'npm test', focused: 'vitest --changed' };
    decide(merge('git merge --no-ff slice/s1'), verification, spy, () => ['src/a.js']);
    assert.equal(ran, 'vitest --changed', 'focused command with no {paths} token runs verbatim');
  }

  // empty changed-path set → falls back to the full command instead of a focused run over nothing
  {
    let ran;
    const spy = (tc) => { ran = tc; return green(); };
    const verification = { full: 'npm test', focused: 'npm test -- {paths}' };
    decide(merge('git merge --no-ff slice/s1'), verification, spy, () => []);
    assert.equal(ran, 'npm test', 'empty changed-path set falls back to the full command');
  }

  // a verbatim focused command (no {paths} token) paired with an empty changed-path set still
  // falls back to the full command — pickCommand resolves the changed-path set before it checks
  // for the token, so this is the same fallback as the {paths} case above, not a separate path
  {
    let ran;
    const spy = (tc) => { ran = tc; return green(); };
    const verification = { full: 'npm test', focused: 'vitest --changed' };
    decide(merge('git merge --no-ff slice/s1'), verification, spy, () => []);
    assert.equal(ran, 'npm test', 'verbatim focused command + empty changed-path set falls back to the full command');
  }

  // a changed path with a space reaches the command as a single shell-quoted argument
  {
    let ran;
    const spy = (tc) => { ran = tc; return green(); };
    const verification = { full: 'npm test', focused: 'npm test -- {paths}' };
    decide(merge('git merge --no-ff slice/s1'), verification, spy, () => ['a b/c.js']);
    assert.equal(ran, "npm test -- 'a b/c.js'", 'a changed path with a space is a single quoted argument');
  }

  // a RED focused run blocks with the same message shape a RED full run blocks with, naming the command
  {
    const verification = { full: 'npm test', focused: 'npm test -- {paths}' };
    const result = decide(merge('git merge --no-ff slice/s1'), verification, red, () => ['src/a.js']);
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
    decide(merge('git merge --no-ff slice/s1'), verification, spy, () => ['x.py']);
    assert.equal(ran, "pytest 'x.py' && ruff check 'x.py'", 'both {paths} tokens are substituted');
  }

  // a changed path containing a `$`-pattern (`$&`, `$1`, …) survives substitution intact — a plain
  // `String.replace(str, str)` interprets those specially in the replacement string
  {
    let ran;
    const spy = (tc) => { ran = tc; return green(); };
    const verification = { full: 'npm test', focused: 'npm test -- {paths}' };
    decide(merge('git merge --no-ff slice/s1'), verification, spy, () => ['a$&b.js']);
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

  console.log('green-gate selftest ok');
} else {
  main();
}
