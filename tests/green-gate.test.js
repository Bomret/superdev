'use strict';

// Suite for plugin/hooks/green-gate.js. Requires the hook (silent, ADR 0059 / issue #442's
// require.main guard) and calls its exported internals directly, the way the hook's own inline
// --selftest used to before this suite moved off the shipped tree (ADR 0059).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');

const hookPath = require.resolve('../plugin/hooks/green-gate.js');
const {
  decide,
  decideMerge,
  resolveMergeCwd,
  unquoteArg,
  readVerification,
  runTests,
  mergeInProgress,
  getChangedPaths,
  IS_MERGE,
  ARG,
  VERIFICATION_DOC,
  parseMergeCommand,
  resolveVerification,
  resetOptionRegionWalks,
  getOptionRegionWalks,
  readHookTimeoutMs,
  suiteBoundMs,
  SUITE_MARGIN_MS,
} = require(hookPath);

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
// A merge reached by changing directory names no tree this hook can resolve, so the gate blocks on a
// GREEN suite: the block is the unknowable tree, never a verdict on the code.
{
  const blind = () => ({ full: 'npm test', focused: null, blind: 'superdev: cannot see the merge tree' });
  const suiteNotRun = () => {
    throw new Error('the suite should not run when the merge tree is unknowable');
  };
  const result = decide(merge('cd x && git merge y'), blind, suiteNotRun, notCalled);
  assert.equal(result.block, true, 'a merge whose tree is unknowable blocks with a green suite');
  assert.match(result.reason, /cannot see the merge tree/, 'the block carries the blind reason');
}
assert.equal(decide(merge('echo done\ngit merge --no-ff s'), full('npm test'), red, notCalled).block, true, 'merge on a later line');
assert.equal(decide(merge('git -C ../wt merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'git -C merge is gated');
assert.equal(decide(merge('git -C "path with spaces" merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'git -C <quoted path> merge is gated');
assert.equal(decide(merge("git -C 'path with spaces' merge slice/x/1"), full('npm test'), red, notCalled).block, true, 'git -C <single-quoted path> merge is gated');
assert.equal(decide(merge('git -C "a \\" b" merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'git -C <double-quoted path with escaped quote> merge is gated');
assert.equal(decide(merge('git -C ~/my\\ path merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'git -C <backslash-escaped space, unquoted> merge is gated');
assert.equal(decide(merge('git -c k="v w" merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'git -c <unquoted key, quoted value> merge is gated');
assert.equal(decide(merge('git --git-dir="a b" merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'git --git-dir="quoted value with space" merge is gated');
assert.equal(decide(merge('git --work-tree /wt merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'git --work-tree <path> merge (space form) is gated');
assert.equal(decide(merge('git --work-tree=/wt merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'git --work-tree=<path> merge is gated');
assert.equal(decide(merge('git --git-dir /wt/.git merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'git --git-dir <path> merge (space form) is gated');
assert.equal(decide(merge('git --git-dir /wt/.git --work-tree /wt merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'two space-form options before the verb');
assert.equal(decide(merge('git --work-tree "a b" merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'a quoted space-form value is one shell word');
assert.equal(decide(merge('git --no-pager merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'a valueless long option still reaches the verb');
assert.equal(decide(merge('git --no-replace-objects merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'another valueless long option reaches the verb');
assert.equal(decide(merge('git --exec-path merge slice/x/1'), full('npm test'), red, notCalled).block, true, '--exec-path (not enumerated — git itself takes no value there) still reaches the verb, via the --ARG fallback');
assert.equal(decide(merge('git --shallow-file /dev/null merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'git --shallow-file <path> merge (space form) is gated');
assert.equal(decide(merge('git --attr-source main merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'git --attr-source <tree> merge (space form) is gated');
assert.equal(IS_MERGE.test('git --version'), false, 'git --version is not a merge');
assert.equal(decide(merge('git --work-tree /wt status'), full('npm test'), red, notCalled).block, false, 'a space-form read command is not a merge');
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
assert.equal(runTests('kill -9 $$').ok, false, 'a killed suite (status null, signal set) carries no verdict — INV-0009 blocks, it does not fail open');
assert.equal(runTests('kill -9 $$').killed, 'SIGKILL', 'the killed result names the signal that ended the suite');
{
  // Same sink as the RED tail below, same treatment: the killed branch's output can run up to
  // maxBuffer (64 MiB) and must not land whole in the block reason.
  const killedOutput = runTests('for i in $(seq 1 100); do echo line$i; done; kill -9 $$').output;
  assert.equal(killedOutput.split('\n').length, 40, 'the killed branch tails its output the same way the RED branch does');
  assert.match(killedOutput, /^line61/, 'the tail keeps the last lines, not the first');
}
{
  // ENOBUFS: the suite may have been GREEN and merely chatty — maxBuffer was raised precisely so
  // that would not read as RED. The message names that case, rather than telling the operator to
  // find out why a suite that finished did not finish. maxBufferBytes overrides the production
  // 64 MiB so the test can trip ENOBUFS without writing that much output.
  const result = runTests(
    `node -e "process.stdout.write('x'.repeat(1024))"`,
    undefined,
    undefined,
    64,
  );
  assert.equal(result.killed, 'SIGKILL', 'a suite too chatty for maxBuffer is still killed, naming the signal');
  assert.match(
    result.killedReason,
    /more output than maxBuffer allows, not necessarily a failure/,
    'the ENOBUFS reason names that the suite may simply have been chatty, not RED'
  );
}
assert.equal(
  runTests('exit 0', '/definitely/does/not/exist-gg-selftest').ok,
  false,
  'a cwd that does not exist at all could not even start the suite — blocks rather than failing open',
);
assert.equal(
  runTests('exit 0', '/definitely/does/not/exist-gg-selftest').killed,
  undefined,
  'a spawn that never started is not "killed" — the two RED branches stay distinct',
);

// ADR 0086's headline case: a suite slower than the hook's own ceiling must be ended by the hook
// itself, not by Claude Code killing the hook process out from under it — otherwise the hook never
// reaches this catch, never returns `{ killed }`, and the merge proceeds silently. runTests's own
// execSync timeout is what makes that observable; the third argument overrides the production bound
// so the test doesn't wait for it.
{
  const result = runTests('sleep 5', undefined, 200);
  assert.equal(result.ok, false, 'a suite the hook itself times out is not GREEN');
  assert.equal(result.killed, 'SIGKILL', 'runTests names the signal its own timeout used to end the suite');
}

// readHookTimeoutMs: the suite bound derives from hooks.json's own green-gate entry, so raising
// that entry's timeout actually raises the ceiling runTests enforces — the escape hatch the header
// comment promises. A manifest-driven reader closes the gap a hardcoded constant could not: nothing
// caught SUITE_TIMEOUT_MS drifting past the platform's own ceiling, because nothing tied it to the
// manifest at all.
{
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'gg-manifest-'));
  const manifestAt = (body) => {
    const p = path.join(dir, `${Math.random()}.json`);
    fs.writeFileSync(p, body);
    return p;
  };
  const raised = manifestAt(JSON.stringify({
    hooks: { PostToolUse: [{ matcher: 'Bash', hooks: [
      { type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/green-gate.js"', timeout: 1200 },
    ] }] },
  }));
  assert.equal(readHookTimeoutMs(raised), 1200 * 1000, 'a raised entry timeout raises the derived ceiling');

  const missingFile = path.join(dir, 'does-not-exist.json');
  assert.equal(readHookTimeoutMs(missingFile), 600 * 1000, 'an unreadable manifest falls back to the platform default (600s), not zero or unbounded');

  const malformed = manifestAt('{ not json');
  assert.equal(readHookTimeoutMs(malformed), 600 * 1000, 'malformed JSON falls back to the platform default');

  const noEntry = manifestAt(JSON.stringify({ hooks: { PostToolUse: [] } }));
  assert.equal(readHookTimeoutMs(noEntry), 600 * 1000, 'no matching green-gate entry falls back to the platform default');

  const noTimeoutField = manifestAt(JSON.stringify({
    hooks: { PostToolUse: [{ matcher: 'Bash', hooks: [
      { type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/green-gate.js"' },
    ] }] },
  }));
  assert.equal(readHookTimeoutMs(noTimeoutField), 600 * 1000, 'an entry naming no timeout falls back to the platform default');

  // #607: the derived bound must never degenerate to unbounded. Node reads `timeout: 0` as no
  // timeout at all, so a consumer who *lowers* the entry below the margin — the field is theirs and
  // the header only discusses raising it — would silently get an unbounded suite spawn, which is the
  // failure INV-0009 exists to prevent reached through the code added to prevent it.
  assert.ok(suiteBoundMs(600 * 1000) > 0, 'the shipped ceiling yields a bounded suite');
  assert.equal(suiteBoundMs(600 * 1000), 600 * 1000 - SUITE_MARGIN_MS, 'and it is the margin below it');
  assert.ok(suiteBoundMs(30 * 1000) > 0, 'an entry equal to the margin still bounds the suite');
  assert.ok(suiteBoundMs(1000) > 0, 'and so does one far below it');
  assert.ok(suiteBoundMs(1000) <= 1000, 'without ever exceeding the ceiling it derives from');
  // The monotonicity fix (#608) dropped the explicit floor the max(1, …) used to carry — the only
  // assertion above that pins zero is suiteBoundMs(1000), a value the bug cannot reach.
  // suiteBoundMs(1) === 0 without it, and readHookTimeoutMs accepts any positive number.
  assert.ok(suiteBoundMs(1) > 0, 'the floor holds even at the smallest possible ceiling');

  // The bound must not fall as the ceiling it derives from rises: a consumer nudging the entry up
  // from 30s to 31s used to get a fifteen-times-tighter bound (15s → 1s), because the margin branch
  // fell off a cliff at exactly the margin.
  assert.ok(suiteBoundMs(31 * 1000) >= suiteBoundMs(30 * 1000), 'a higher ceiling never yields a lower bound');

  // The relation itself, which nothing pinned: the enforced bound stays strictly inside the
  // platform ceiling. An inverted margin was already caught; a *removed* one was not, because the
  // assertion below used to subtract the same constant it was checking.

  // The shipped hooks.json (default argument, no path) still yields the current 570s bound.
  const { SUITE_TIMEOUT_MS } = require(hookPath);
  assert.equal(SUITE_TIMEOUT_MS, 600 * 1000 - SUITE_MARGIN_MS, 'the production ceiling derives from the shipped hooks.json entry, margin below it');
  // The relation itself, which nothing pinned: a *removed* margin used to pass here, because the
  // assertion above subtracts the same constant it is checking. These two do not.
  assert.ok(SUITE_TIMEOUT_MS > 0, 'the enforced bound never degenerates to unbounded');
  assert.ok(SUITE_TIMEOUT_MS < readHookTimeoutMs(), 'and stays strictly inside the platform ceiling');
}

// INV-0009 / ADR 0086: a killed suite (no verdict) blocks the merge, naming that it was killed
// rather than claiming a failure the suite never produced.
{
  const killed = () => ({ ok: false, killed: 'SIGKILL', output: '' });
  const result = decide(merge('git merge --no-ff slice/s1'), full('npm test'), killed, notCalled);
  assert.equal(result.block, true, 'a killed suite blocks the merge');
  assert.match(result.reason, /killed/i, 'the reason names that the suite was killed');
  assert.doesNotMatch(result.reason, /\bfailed\b/i, 'the reason does not claim a failure the suite never produced');
}

// A killed(ENOBUFS) suite may have been GREEN and merely chatty — the block reason says so instead
// of asking the operator to find out why a suite that finished did not finish.
{
  const chatty = () => ({ ok: false, killed: 'SIGKILL', killedReason: 'the suite produced more output than maxBuffer allows, not necessarily a failure', output: '' });
  const result = decide(merge('git merge --no-ff slice/s1'), full('npm test'), chatty, notCalled);
  assert.match(result.reason, /more output than maxBuffer allows/i, 'the reason names the chatty-suite case, not just the kill');
}

// ARG mirrors merge-guard's token (the comment above owns why); hooks stay standalone, so pin
// the copy against the canonical one instead of sharing it — silent drift would be a bug.
{
  const sibling = fs.readFileSync(path.join(path.dirname(hookPath), 'merge-guard.js'), 'utf8');
  const m = sibling.match(/^const ARG = \/(.*)\/\.source;$/m);
  assert.ok(m, 'merge-guard.js declares its ARG token where this pin expects it');
  assert.equal(ARG, m[1], 'green-gate ARG is byte-identical to merge-guard ARG');
}

// a long run of enumerated option names with no verb must not backtrack exponentially (the comment
// above LONG_VALUE_OPT owns why) — a qualitative bound (AGENTS.md, ADR 0086): catastrophic
// backtracking is effectively unbounded, so this ceiling stays loose rather than tight
{
  const pathological = 'git ' + '--git-dir '.repeat(60) + 'x; git ' + 'merge main';
  const t0 = Date.now();
  IS_MERGE.test(pathological);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 5000, `a pathological long-option run must resolve quickly, took ${elapsed}ms`);
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

// --- the tree `--work-tree` names, and the bare `--git-dir` that fails closed ---
assert.equal(resolveMergeCwd('git --work-tree /wt merge s', '/session'), '/wt', '--work-tree <path> names the tree');
assert.equal(resolveMergeCwd('git --work-tree=/wt merge s', '/session'), '/wt', '--work-tree=<path> names the tree');
assert.equal(resolveMergeCwd('git --work-tree ../wt merge s', '/session'), '/wt', 'a relative --work-tree resolves against the session cwd');
assert.equal(
  resolveMergeCwd('git --work-tree "a b" merge s', '/session'),
  '/session/a b',
  'a quoted --work-tree value is unquoted before resolution',
);
assert.equal(
  resolveMergeCwd('git --git-dir /wt/.git --work-tree /wt merge s', '/session'),
  '/wt',
  '--work-tree names the tree with --git-dir also present',
);
assert.equal(resolveMergeCwd('git -C /a --work-tree /b merge s', '/session'), '/b', '--work-tree wins over a -C naming another path');
assert.equal(resolveMergeCwd('git --work-tree /b -C /a merge s', '/session'), '/b', 'and wins in either order');
assert.equal(
  resolveMergeCwd('git -C /a --work-tree relb merge s', '/session'),
  '/a/relb',
  'a relative --work-tree resolves against -C, applied first, not against the session cwd',
);
assert.equal(
  resolveMergeCwd('git -C /a -C b merge s', '/session'),
  '/a/b',
  'multiple -C options fold cumulatively, each resolved against the previous',
);
assert.equal(resolveMergeCwd('git --git-dir /wt/.git merge s', '/session'), null, 'a bare --git-dir is ambiguous: the tree is unknowable');
assert.equal(resolveMergeCwd('git --git-dir=/wt/.git merge s', '/session'), null, 'the = spelling too');
assert.equal(resolveMergeCwd('git --namespace foo merge s', '/session'), '/session', 'another value-taking option names no tree');

// --- a -c VALUE containing another option's own spelling must not be re-read as that option ---
assert.equal(
  resolveMergeCwd('git -c msg="a -C /elsewhere" merge s', '/session'),
  '/session',
  'a -C spelled inside a -c VALUE is that value, not a real -C redirecting the tree',
);
assert.equal(
  resolveMergeCwd('git -c "msg=a --work-tree /elsewhere" merge s', '/session'),
  '/session',
  'a --work-tree spelled inside a -c VALUE is that value, not a real --work-tree redirecting the tree',
);

// --- the unknowable tree: a directory change before the merge, with no -C to say where ---
assert.equal(resolveMergeCwd('cd /wt && git merge s', '/session'), null, 'a cd before the merge makes the tree unknowable');
assert.equal(resolveMergeCwd('pushd /wt && git merge s', '/session'), null, 'a pushd does the same');
assert.equal(resolveMergeCwd('popd && git merge s', '/session'), null, 'a popd does the same');
assert.equal(resolveMergeCwd('(cd /wt && git merge s)', '/session'), null, 'a subshell that cds does the same');
assert.equal(resolveMergeCwd('echo x && cd /wt && git status && git merge s', '/session'), null, 'a cd anywhere before the merge in a longer chain');
assert.equal(resolveMergeCwd('cd /wt\ngit merge s', '/session'), null, 'a cd on an earlier line');
assert.equal(resolveMergeCwd('cd /wt && git -C /other merge s', '/session'), '/other', 'an explicit -C names the tree even after a cd');
assert.equal(resolveMergeCwd('git merge s && cd /wt', '/session'), '/session', 'a cd after the merge leaves the merge tree knowable');
assert.equal(resolveMergeCwd('cdx /wt && git merge s', '/session'), '/session', 'a command merely starting with `cd` is not a directory change');
assert.equal(resolveMergeCwd('cd /wt && bun run test', '/session'), '/session', 'a non-merge command is untouched');
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

// empty changed-path set, focused command consuming no {paths} → still the focused command. It picks
// its own tests, so an empty set costs it nothing and the full-command fallback would charge a
// slow-suite repo for a merge that changed nothing (ADR 0074).
{
  let ran;
  const spy = (tc) => { ran = tc; return green(); };
  const verification = { full: 'pytest', focused: 'pytest tests/unit' };
  decide(merge('git merge --no-ff slice/s1'), () => verification, spy, () => []);
  assert.equal(ran, 'pytest tests/unit', 'empty changed-path set keeps a {paths}-less focused command');
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
// ADR 0085: one fenced block is a missing-configuration gap, not a safety gap — the gate runs the
// full command anyway and carries a one-line notice naming /superdev:setup, rather than the blind
// block a resolvable-but-unconfigured tree would otherwise get.
{
  const oneBlock = readVerification(dir);
  assert.equal(oneBlock.full, 'npm test', 'one fenced block still parses as the full command');
  assert.equal(oneBlock.focused, null, 'one fenced block → no focused command');
  assert.match(oneBlock.notice, /\/superdev:setup/, 'one fenced block carries a notice naming /superdev:setup');
}
assert.deepEqual(readVerification(path.join(dir, 'nope')), { full: null, focused: null }, 'missing doc → nulls');

fs.writeFileSync(
  path.join(dir, VERIFICATION_DOC),
  '# Verification\n\n```sh\nnpm test\n```\n\n```sh\nnpm test -- {paths}\n```\n',
);
assert.deepEqual(
  readVerification(dir),
  { full: 'npm test', focused: 'npm test -- {paths}' },
  'two fenced blocks parse as today, notice-free',
);

// ADR 0066: a `## Timing command` section holds its command in a backtick span, so the gate never
// sees it. A repository with a full command, no focused command, and a timing section keeps running
// the full command after a merge — a fenced timing block would land in the focused slot instead.
fs.writeFileSync(
  path.join(dir, VERIFICATION_DOC),
  '# Verification\n\n```sh\nnpm test\n```\n\n**No focused test command.**\n\n' +
    '## Timing command\n\n`npm test -- --reporter=verbose`\n',
);
{
  const timing = readVerification(dir);
  assert.equal(timing.full, 'npm test', 'a `## Timing command` backtick span is invisible to the gate');
  assert.equal(timing.focused, null, 'the timing command is never read as a focused command');
}
{
  let ran;
  const spy = (tc) => { ran = tc; return green(); };
  const result = decide(merge('git merge --no-ff slice/s1'), () => readVerification(dir), spy, () => ['a.js']);
  assert.equal(ran, 'npm test', 'the merge gate runs the full command, never the timing command');
  assert.equal(result.block, false, 'one fenced block never blocks the merge');
  assert.match(result.notice, /\/superdev:setup/, 'the decision carries the one-fenced-block notice');
}

// ADR 0105: a `## Whole-repo command` section holds its command in a backtick span too, so the gate
// picks the same full and focused commands whether or not a repository configures one.
fs.writeFileSync(
  path.join(dir, VERIFICATION_DOC),
  '# Verification\n\n```sh\nnx affected --target=test\n```\n\n```sh\nnx affected --target=test\n```\n\n' +
    '## Whole-repo command\n\n`nx run-many --target=test --all`\n',
);
{
  const withWholeRepo = readVerification(dir);
  assert.deepEqual(
    withWholeRepo,
    { full: 'nx affected --target=test', focused: 'nx affected --target=test' },
    'a `## Whole-repo command` backtick span is invisible to the gate, same as a repo without one',
  );
}
{
  let ran;
  const spy = (tc) => { ran = tc; return green(); };
  const result = decide(merge('git merge --no-ff slice/s1'), () => readVerification(dir), spy, () => ['a.js']);
  assert.equal(ran, 'nx affected --target=test', 'the merge gate runs the focused command, never the whole-repo one');
  assert.equal(result.block, false, 'a green run never blocks the merge');
  assert.equal(result.notice, undefined, 'two fenced blocks with a whole-repo section carry no one-fence notice');
}

// --- the option region is walked exactly once per decision — resolveVerification()'s own call
// graph used to walk it up to four times: once each for -C, --work-tree, and --git-dir inside
// resolveMergeCwd, once more inside namesOnlyGitDir or resolvingOption ---
{
  resetOptionRegionWalks();
  const gitDirCmd = 'git --git-dir /wt/.git merge x';
  resolveVerification(parseMergeCommand(gitDirCmd), gitDirCmd, dir);
  assert.equal(getOptionRegionWalks(), 1, 'a blind --git-dir decision walks the option region exactly once');

  resetOptionRegionWalks();
  const cTargetCmd = `git -C '${path.join(dir, 'does-not-exist')}' merge x`;
  resolveVerification(parseMergeCommand(cTargetCmd), cTargetCmd, dir);
  assert.equal(
    getOptionRegionWalks(),
    1,
    'a -C target carrying no verification doc walks the option region exactly once',
  );

  // A full decision — the cwd resolution AND the verification lookup together — must also walk the
  // region once. The two isolated resolveVerification() calls above never see this. Calling
  // decideMerge() itself, rather than re-assembling its steps here, is what makes this a real
  // regression test on main()'s own wiring: main() calls this exact function, so a future second
  // parseMergeCommand(cmd) call added inside it fails this assertion, not just a hand-rolled copy.
  resetOptionRegionWalks();
  const decisionCmd = 'git merge --no-ff slice/x/1';
  // `true`, not `npm test`: decideMerge() actually runs the configured full command (it is not
  // stubbed here, unlike decide()'s injected runTests elsewhere in this file), so the doc must
  // name something fast and side-effect-free.
  fs.writeFileSync(path.join(dir, VERIFICATION_DOC), '# Verification\n\n```sh\ntrue\n```\n');
  decideMerge(merge(decisionCmd), dir);
  assert.equal(
    getOptionRegionWalks(),
    1,
    "a full decision (cwd resolution + verification lookup) walks the option region exactly once, mirroring main()'s own wiring",
  );
}

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
    const result = cp.spawnSync(process.execPath, [hookPath], { input: JSON.stringify(inputObj), encoding: 'utf8', timeout: 15000 });
    assertSpawnDecided(result, 'spawning green-gate.js directly');
    return result;
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

  // the verification doc itself is read from the -C target, not the session — a scopetree
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

  // --- the tree `--work-tree` names is where the gate runs, in both spellings and with
  // `--git-dir` alongside. The session's own suite is green in each case, so a session-cwd run
  // would pass and mask the target's failure — the defect this slice closes.
  {
    for (const options of ['--work-tree %T', '--work-tree=%T', "--git-dir '%T/.git' --work-tree %T"]) {
      const session = tmp('gg-session-');
      const target = tmp('gg-target-');
      initRepo(session);
      commitFile(session, 'base.txt', 'x\n');
      initRepo(target);
      commitFile(target, 'base.txt', 'x\n');
      writeVerification(session, 'node -e "process.exit(0)"'); // session: always green
      writeVerification(target, `node -e "console.error('TARGET-CHECK'); process.exit(1)"`);
      const command = `git ${options.replace(/%T/g, `'${target}'`)} merge --no-ff other`;
      const result = runHook({ cwd: session, tool_input: { command } });
      assert.equal(result.status, 2, `a merge naming its tree with ${options} is gated in that tree`);
      assert.match(result.stderr, /TARGET-CHECK/, "the block quotes the target's own failure, not a session-cwd run");
      fs.rmSync(session, { recursive: true, force: true });
      fs.rmSync(target, { recursive: true, force: true });
    }
  }

  // the verification doc, the changed-path set, the in-progress check, and the branch read all come
  // from the --work-tree target: a doc introduced only there gates, and its own branch is what the
  // integration/ deferral reads
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
    // session carries no doc at all; only the target's own branch introduced one
    writeVerification(
      target,
      'node -e "process.exit(0)"',
      `node -e "console.error('PATHS:' + process.argv.slice(1).join(',')); process.exit(1)" {paths}`,
    );
    const introduced = runHook({ cwd: session, tool_input: { command: `git --work-tree '${target}' merge --no-ff other` } });
    assert.equal(introduced.status, 2, 'a verification doc introduced only on the --work-tree target still gates');
    assert.match(introduced.stderr, /PATHS:feature\.txt/, 'the changed-path set is computed against the --work-tree target');

    git2(['checkout', '-q', '-b', 'integration/foo'], target);
    const deferred = runHook({ cwd: session, tool_input: { command: `git --work-tree '${target}' merge --no-ff other` } });
    assert.equal(deferred.status, 0, 'a merge whose --work-tree target sits on integration/* is deferred');
    fs.rmSync(session, { recursive: true, force: true });
    fs.rmSync(target, { recursive: true, force: true });
  }

  // a merge naming only --git-dir updates files in one tree while reading refs from another
  // repository, so there is nothing honest to verify: it blocks, naming `git -C <path> merge`
  {
    const session = tmp('gg-session-');
    const target = tmp('gg-target-');
    initRepo(session);
    commitFile(session, 'base.txt', 'x\n');
    initRepo(target);
    commitFile(target, 'base.txt', 'x\n');
    writeVerification(session, 'node -e "process.exit(0)"'); // green: the block is the ambiguity
    for (const options of [`--git-dir '${target}/.git'`, `--git-dir='${target}/.git'`]) {
      const result = runHook({ cwd: session, tool_input: { command: `git ${options} merge --no-ff other` } });
      assert.equal(result.status, 2, `a merge naming only ${options} blocks`);
      assert.match(result.stderr, /git -C <path> merge/, 'the block names the way to run it');
      assert.match(result.stderr, /--git-dir/, 'the block names the option it could not resolve a tree from');
      assert.match(
        result.stderr,
        /this merge (?:has landed|landed).*(?:unverified|nobody verified it)/is,
        'the message states the merge already landed and nobody verified it',
      );
      assert.match(
        result.stderr,
        /run the (?:full )?test command.*(?:or revert this merge|or revert (?:the|this) merge)/is,
        'the message names the recovery: run the test command in that tree, or revert the merge',
      );
    }
    fs.rmSync(session, { recursive: true, force: true });
    fs.rmSync(target, { recursive: true, force: true });
  }

  // no verification doc anywhere → both command shapes stay inert, with no error and no block
  {
    const session = tmp('gg-session-');
    const target = tmp('gg-target-');
    initRepo(session);
    commitFile(session, 'base.txt', 'x\n');
    initRepo(target);
    commitFile(target, 'base.txt', 'x\n');
    for (const options of [`--work-tree '${target}'`, `--git-dir '${target}/.git'`]) {
      const result = runHook({ cwd: session, tool_input: { command: `git ${options} merge --no-ff other` } });
      assert.equal(result.status, 0, `no verification doc anywhere → inert on ${options}`);
      assert.equal(result.stderr, '', 'and prints nothing');
    }
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

  // a -C path carrying no verification doc, while the session's checkout carries one, is the
  // asymmetry that says the -C path is not the merge's tree — inert there would be a repository
  // that configured the gate silently losing it, so it blocks instead
  {
    const session = tmp('gg-session-');
    const target = path.join(tmp('gg-parent-'), 'does-not-exist');
    initRepo(session);
    commitFile(session, 'base.txt', 'x\n');
    writeVerification(session, 'node -e "process.exit(1)"');
    const result = runHook({ cwd: session, tool_input: { command: `git -C '${target}' merge --no-ff other` } });
    assert.equal(result.status, 2, 'a -C path with no verification doc, while the session has one, blocks');
    assert.match(result.stderr, /found no `docs\/agents\/verification\.md`/, 'the block names what it could not find');
    assert.match(
      result.stderr,
      /is not the tree the merge landed in/,
      'names the wrong-target reading: -C pointed somewhere other than the merge tree',
    );
    assert.match(
      result.stderr,
      /genuinely carries no/,
      'names the other reading: -C is the merge tree, and that tree carries no verification doc at all',
    );
    fs.rmSync(session, { recursive: true, force: true });
  }

  // the same asymmetry reached via --work-tree instead of -C: the block report names the option
  // that actually resolved the tree, not a hardcoded `-C` the command never carried
  {
    const session = tmp('gg-session-');
    const target = path.join(tmp('gg-parent-'), 'does-not-exist');
    initRepo(session);
    commitFile(session, 'base.txt', 'x\n');
    writeVerification(session, 'node -e "process.exit(1)"');
    const result = runHook({ cwd: session, tool_input: { command: `git --work-tree '${target}' merge --no-ff other` } });
    assert.equal(result.status, 2, 'a --work-tree path with no verification doc, while the session has one, blocks');
    assert.match(result.stderr, /`--work-tree` path is not/, 'names --work-tree, the option the command actually carried');
    assert.doesNotMatch(result.stderr, /`-C` path/, 'does not hardcode -C when the command carried none');
    fs.rmSync(session, { recursive: true, force: true });
  }

  // a directory-changing merge naming no -C: the tree is unknowable, so the gate blocks and names
  // `git -C <path> merge` as the way to run it — pushd and a subshell take the same path
  {
    const session = tmp('gg-session-');
    initRepo(session);
    commitFile(session, 'base.txt', 'x\n');
    writeVerification(session, 'node -e "process.exit(0)"'); // green: the block is the blind tree, not a verdict
    for (const command of [
      'cd ../other-worktree && git merge --no-ff slice/x/1',
      'pushd ../other-worktree && git merge --no-ff slice/x/1',
      '(cd ../other-worktree && git merge --no-ff slice/x/1)',
      'echo start && cd ../other-worktree && git status && git merge --no-ff slice/x/1',
    ]) {
      const result = runHook({ cwd: session, tool_input: { command } });
      assert.equal(result.status, 2, `a directory-changing merge blocks: ${command}`);
      assert.match(result.stderr, /git -C <path> merge/, 'the block names the way to run it');
      assert.match(
        result.stderr,
        /this merge (?:has landed|landed).*(?:unverified|nobody verified it)/is,
        'the message states the merge already landed and nobody verified it',
      );
      assert.match(
        result.stderr,
        /run the (?:full )?test command.*(?:or revert this merge|or revert (?:the|this) merge)/is,
        'the message names the recovery: run the test command in that tree, or revert the merge',
      );
    }
    // the same command with an explicit -C is knowable again, and gates on that target
    const withC = runHook({ cwd: session, tool_input: { command: `cd /tmp && git -C '${session}' merge --no-ff other` } });
    assert.equal(withC.status, 0, 'a directory change with an explicit -C resolves to the -C target and gates there');
    fs.rmSync(session, { recursive: true, force: true });
  }

  // a directory-changing merge in a repository carrying no verification doc at all stays inert:
  // there is no gate configured to fail closed on
  {
    const session = tmp('gg-session-');
    initRepo(session);
    commitFile(session, 'base.txt', 'x\n');
    const result = runHook({ cwd: session, tool_input: { command: 'cd ../elsewhere && git merge --no-ff other' } });
    assert.equal(result.status, 0, 'no verification doc anywhere → a directory-changing merge stays inert');
    assert.equal(result.stderr, '', 'and prints nothing');
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

  // ADR 0085: a verification.md carrying exactly one fenced block runs it as the full command and
  // never blocks on that condition. The notice reaches the operator on stdout, matching
  // update-check.js's precedent for a non-blocking notice.
  {
    const session = tmp('gg-session-');
    initRepo(session);
    commitFile(session, 'base.txt', 'x\n');
    writeVerification(session, 'node -e "process.exit(0)"'); // one fenced block, green
    const result = runHook({ cwd: session, tool_input: { command: 'git merge --no-ff other' } });
    assert.equal(result.status, 0, 'one fenced block never blocks the merge');
    assert.match(result.stdout, /\/superdev:setup/, 'the notice names /superdev:setup on stdout');
    assert.equal(result.stderr, '', 'the notice never lands on stderr on a non-blocking decision');
    fs.rmSync(session, { recursive: true, force: true });
  }

  // a red suite still blocks even with only one fenced block configured — the notice is about the
  // missing configuration, not a pass on the suite's own verdict. Claude Code reads stderr, not
  // stdout, on a blocking exit(2), so the notice folds into the stderr write beside the reason
  // instead of the stdout write the non-blocking case above uses.
  {
    const session = tmp('gg-session-');
    initRepo(session);
    commitFile(session, 'base.txt', 'x\n');
    writeVerification(session, 'node -e "process.exit(1)"'); // one fenced block, red
    const result = runHook({ cwd: session, tool_input: { command: 'git merge --no-ff other' } });
    assert.equal(result.status, 2, 'a red suite still blocks with one fenced block configured');
    assert.match(result.stderr, /\/superdev:setup/, 'the notice names /superdev:setup on stderr, where a blocking decision surfaces');
    assert.equal(result.stdout, '', 'the notice never lands on stdout on a blocking decision');
    fs.rmSync(session, { recursive: true, force: true });
  }

  // require.main guard: requiring this file must never run main()'s stdin/decide dispatch, and
  // spawning it directly (as Claude Code's hook invocation does) must still gate exactly as
  // before the guard was added.
  {
    const session = tmp('gg-session-');
    initRepo(session);
    commitFile(session, 'base.txt', 'x\n');
    fs.writeFileSync(path.join(session, 'fail-marker'), '');
    writeVerification(session, `node -e "process.exit(require('fs').existsSync('fail-marker') ? 1 : 0)"`);
    const inputObj = { cwd: session, tool_input: { command: 'git merge --no-ff other' } };

    const required = cp.spawnSync(process.execPath, ['-e', `require(${JSON.stringify(hookPath)})`], {
      input: JSON.stringify(inputObj), encoding: 'utf8', timeout: 15000,
    });
    assertSpawnDecided(required, 'requiring green-gate.js');
    assert.equal(required.status, 0, 'requiring green-gate.js never blocks');
    assert.equal(required.stdout, '', 'requiring green-gate.js prints nothing');
    assert.equal(required.stderr, '', 'requiring green-gate.js runs no suite');

    const spawned = runHook(inputObj);
    assert.equal(spawned.status, 2, 'spawning green-gate.js directly still gates the merge');
    fs.rmSync(session, { recursive: true, force: true });
  }

  // argv[2] === '--selftest' is a global-process condition, not "this file was invoked directly": a
  // parent process invoked as `node <parent>.js --selftest` that requires this hook must not run
  // this hook's own selftest as a side effect (issue #442 finding 1). Guarded by an env marker so
  // that, if the guard is broken, the recursively-triggered inner selftest doesn't spawn a further
  // generation of itself — it proves the leak exactly once instead of nesting indefinitely.
  if (!process.env.SUPERDEV_ARGV_GUARD_TEST) {
    const dir = tmp('green-gate-argv-');
    const wrapper = path.join(dir, 'req.js');
    fs.writeFileSync(wrapper, `require(${JSON.stringify(hookPath)});`);
    try {
      const outer = cp.spawnSync(process.execPath, [wrapper, '--selftest'], {
        encoding: 'utf8', timeout: 15000,
        env: Object.assign({}, process.env, { SUPERDEV_ARGV_GUARD_TEST: '1' }),
      });
      assertSpawnDecided(outer, 'a parent process requiring green-gate.js under --selftest');
      assert.equal(outer.status, 0, 'a parent whose own argv[2] is --selftest still exits cleanly when it requires green-gate.js');
      assert.equal(outer.stdout, '', "and never runs green-gate.js's own selftest as a side effect");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

console.log('green-gate tests ok');
