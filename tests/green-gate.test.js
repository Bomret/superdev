'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

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
  readVerification,
  runTests,
  traceSuiteRun,
  mergeInProgress,
  getChangedPaths,
  VERIFICATION_DOC,
  parseMergeCommand,
  resolveVerification,
  readHookTimeoutMs,
  suiteBoundMs,
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
// ADR 0123: the blind branch of decide(). A candidate the reflog must decide (a failed call, or a
// `git commit`) has no tree to read it in when the tree is unknowable, so it stays silent. A successful
// `git merge` keeps the blind block, and so does a stuck merge shape on either event.
{
  const blind = () => ({ full: 'npm test', focused: null, blind: 'superdev: cannot see the merge tree' });
  const suiteNotRun = () => {
    throw new Error('the suite should not run when the tree is unknowable');
  };
  const reflogNotRead = () => {
    throw new Error('the reflog should not be read when the tree is unknowable');
  };
  const STUCK = 'git merge "y';
  assert.equal(parseMergeCommand(STUCK).stuck, true, 'the fixture is an unreadable command holding a merge');
  const verdict = (command, event) =>
    decide(merge(command, { hook_event_name: event }), blind, suiteNotRun, notCalled, () => false, () => '', reflogNotRead);
  assert.equal(verdict('cd x && git merge y', 'PostToolUseFailure').block, false, 'a failed call whose tree is unknowable stays silent');
  assert.equal(verdict('cd x && git commit --no-edit', 'PostToolUse').block, false, 'a git commit whose tree is unknowable stays silent');
  assert.equal(verdict('cd x && git commit --no-edit', 'PostToolUseFailure').block, false, 'a failed git commit whose tree is unknowable stays silent');
  assert.equal(verdict(STUCK, 'PostToolUseFailure').block, true, 'a stuck merge shape on a failed call blocks');
  assert.equal(verdict(STUCK, 'PostToolUse').block, true, 'a stuck merge shape on a successful call blocks');
  assert.equal(verdict('cd x && git merge y', 'PostToolUse').block, true, 'a successful git merge whose tree is unknowable blocks');
  assert.match(verdict('cd x && git merge y', 'PostToolUse').reason, /cannot see the merge tree/, 'with the blind reason');
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
assert.equal(decide(merge('git --exec-path merge slice/x/1'), full('npm test'), red, notCalled).block, true, '--exec-path (not enumerated — git itself takes no value there) still reaches the verb, read as a value-less option');
assert.equal(decide(merge('git --shallow-file /dev/null merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'git --shallow-file <path> merge (space form) is gated');
assert.equal(decide(merge('git --attr-source main merge slice/x/1'), full('npm test'), red, notCalled).block, true, 'git --attr-source <tree> merge (space form) is gated');
assert.equal(parseMergeCommand('git --version'), null, 'git --version is not a merge');
assert.equal(decide(merge('git --work-tree /wt status'), full('npm test'), red, notCalled).block, false, 'a space-form read command is not a merge');
assert.equal(decide(merge('git -c core.editor=true commit -m x'), full('npm test'), red, notCalled).block, false, 'git -c commit ignored');
assert.equal(decide(merge('git merge --abort'), full('npm test'), red, notCalled).block, false, 'merge --abort undoes a merge, not gated');
assert.equal(decide(merge('git merge --quit'), full('npm test'), red, notCalled).block, false, 'merge --quit abandons a merge, not gated');
assert.equal(decide(merge('git merge --continue'), full('npm test'), red, notCalled).block, true, 'merge --continue completes a merge, gated');
// A heredoc body a known shell reads on stdin is a command line (#1016): its merge is gated like a bare one.
for (const cmd of ['bash <<E\ngit merge x\nE', "sh <<'E'\ngit merge x\nE", 'cat <<E | sh\ngit merge x\nE', 'bash -s <<E\ngit merge x\nE',
  '{ cat <<E; } | sh\ngit merge x\nE', 'cat <<E | xargs sh -c\ngit merge x\nE', 'f() { cat <<E; }; f | sh\ngit merge x\nE', 'exec 3<<E; sh <&3\ngit merge x\nE',
  'cat <<E > >(sh)\ngit merge x\nE', 'cat <<E | sh -c "$(cat)"\ngit merge x\nE', 'exec 3<<E; sh <&3-\ngit merge x\nE']) {
  assert.equal(decide(merge(cmd), full('npm test'), red, notCalled).block, true, `a shell-fed heredoc merge is gated: ${JSON.stringify(cmd)}`);
}
// A heredoc body or here-string text no shell reads that names a merge is a quoted merge candidate: the reflog decides.
for (const cmd of ["cat <<'E'\ngit merge x\nE", 'cat <<E\ngit merge x\nE', 'cat <<<"git merge x"', 'cat > f <<E\ngit merge x\nE', 'git commit -F - <<E\ngit merge x\nE']) {
  assert.equal(decide(merge(cmd), full('npm test'), red, notCalled, () => false, () => '', () => true).block, true, `gated on a landed merge: ${JSON.stringify(cmd)}`);
  assert.equal(decide(merge(cmd), full('npm test'), red, notCalled, () => false, () => '', () => false).block, false, `silent without one: ${JSON.stringify(cmd)}`);
}
assert.equal(parseMergeCommand('cat <<E\nhello\nE'), null, 'a heredoc body naming no merge names no merge');
// A merge behind a prefix wrapper, or through an inline alias, is a merge; a `git pull` is gated when the reflog shows it landed.
for (const cmd of ['nice -n 5 git merge x', 'eval git merge x', 'sudo -u bob git merge x', 'git -c alias.m=merge m x', "git -c alias.m='!git merge x' m",
  'env' + "''".repeat(600) + ' git merge x']) {
  assert.equal(decide(merge(cmd), full('npm test'), red, notCalled).block, true, `gated: ${cmd}`);
}
for (const cmd of ['git pull', 'git pull --rebase origin main', 'git -c alias.p=pull p', 'nice git pull']) {
  assert.equal(decide(merge(cmd), full('npm test'), red, notCalled, () => false, () => '', () => true).block, true, `a pull that landed is gated: ${cmd}`);
  assert.equal(decide(merge(cmd), full('npm test'), red, notCalled, () => false, () => '', () => false).block, false, `a pull that landed nothing is silent: ${cmd}`);
}
// A here-string or `echo` text a shell reads is a quoted merge candidate: the reflog decides.
for (const cmd of ['echo git merge x | sh', 'bash <<<"git merge x"']) {
  assert.equal(decide(merge(cmd), full('npm test'), red, notCalled, () => false, () => '', () => true).block, true, `gated on a landed merge: ${cmd}`);
  assert.equal(decide(merge(cmd), full('npm test'), red, notCalled, () => false, () => '', () => false).block, false, `silent without one: ${cmd}`);
}
// RTK's PreToolUse hook rewrites `git commit` to `rtk git commit`, and PostToolUse sees the rewritten
// command (docs/known-issues.md). rtk 0.51.0 leaves `git merge` alone; the merge rows guard a later
// version that rewrites it too.
{
  const landed = () => true;
  const rtkGated = (cmd) => decide(merge(cmd), full('npm test'), red, notCalled, () => false, () => '', landed).block;
  assert.equal(rtkGated('rtk git commit --no-edit'), true, 'a commit RTK rewrote that concluded a merge is gated');
  assert.equal(rtkGated('rtk git add -A && rtk git commit --no-edit'), true, 'a rewritten commit in a later segment is gated');
  assert.equal(rtkGated('rtk git merge --no-ff slice/s1'), true, 'a merge behind rtk is gated');
  assert.equal(rtkGated('rtk -vv --ultra-compact git -C /wt merge slice/s1'), true, "a merge behind rtk's value-less options is gated");
  assert.equal(rtkGated('rtk git status'), false, 'a read behind rtk is not a merge');
  assert.equal(rtkGated('rtk git merge --abort'), false, 'merge --abort behind rtk is not gated');
  assert.equal(rtkGated('rtkx git merge slice/s1'), false, 'a word ending in rtk is no prefix');
  assert.equal(rtkGated('rtk proxy git merge --no-ff slice/s1'), true, "a merge behind rtk's run-anything subcommand is gated");
  assert.equal(rtkGated('rtk -v run --skip-env git commit --no-edit'), true, 'a commit behind rtk run and its options is gated');
  assert.equal(rtkGated('rtk err git merge --abort'), false, 'merge --abort behind rtk err is not gated');
  assert.equal(rtkGated('rtk proxyx git merge slice/s1'), false, 'a word starting with a subcommand name is no subcommand');
  assert.equal(rtkGated('rtk proxy -- git merge x'), true, "a merge behind rtk's `--` separator is gated");
  assert.equal(rtkGated('rtk run --skip-env -- git commit --no-edit'), true, "a commit behind rtk run's options and `--` is gated");
  assert.equal(rtkGated('rtk proxy rtk git merge slice/s1'), true, 'a merge behind a nested rtk is gated');
  assert.equal(rtkGated('rtk proxy -- git merge --abort'), false, 'merge --abort behind rtk proxy -- is not gated');
  assert.equal(rtkGated('rtk test -- bun run test'), false, 'a test run behind rtk test -- is not a merge');
}

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
assert.equal(
  runTests('exit 0', '/definitely/does/not/exist-gg-selftest').noSh,
  undefined,
  'a missing cwd is not a missing sh — noSh stays unset so the tree, not sh, is named',
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

// ADR 0150 / INV-0153: the configured command runs under `sh -c`, never Node's default shell.
assert.equal(runTests('FOO=1; test "$FOO" = 1 && exit 0').ok, true, 'POSIX syntax that passes is GREEN');
assert.equal(runTests('FOO=1 sh -c \'test "$FOO" = 2\' || exit 4').ok, false, 'POSIX syntax that fails is RED');
{
  // The probe exits 0 only when it received exactly one argument, the path as written.
  const probe = `node -e "process.exit(process.argv.length === 2 && process.argv[1] === \\"a b'c.txt\\" ? 0 : 1)" {paths}`;
  const decision = decide(
    { tool_input: { command: 'git merge feature' } },
    () => ({ full: 'exit 1', focused: probe }),
    (cmd) => runTests(cmd),
    () => ["a b'c.txt"], () => false, () => 'main', () => true,
  );
  assert.equal(decision.block, false, 'a path holding a space and a quote reaches the runner as one unquoted argument');
}
{
  // No `sh` on PATH: the gate is blind and names `sh`; it is neither RED nor a pass.
  const savedPath = process.env.PATH;
  const emptyDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'gg-nosh-'));
  process.env.PATH = emptyDir;
  let result;
  let decision;
  try {
    result = runTests('exit 0');
    decision = decide(
      { tool_input: { command: 'git merge feature' } },
      () => ({ full: 'exit 0' }),
      (cmd) => runTests(cmd),
      () => [], () => false, () => 'main', () => true,
    );
  } finally {
    process.env.PATH = savedPath;
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
  assert.equal(result.ok, false, 'a missing sh is not GREEN');
  assert.equal(result.notStarted, true, 'a missing sh never started the suite');
  assert.equal(decision.block, true, 'a missing sh blocks');
  assert.match(decision.reason, /`sh`/, 'the reason names sh');
  assert.doesNotMatch(decision.reason, /is RED/, 'a missing sh is blind, never RED');
}
{
  // The production call shape: an existing cwd, no `sh` on PATH. ENOENT here is the gate's own
  // blindness, so it reports noSh and never a RED suite.
  const savedPath = process.env.PATH;
  const emptyDir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'gg-nosh-cwd-'));
  process.env.PATH = emptyDir;
  let result;
  try {
    result = runTests('exit 0', require('node:os').tmpdir());
  } finally {
    process.env.PATH = savedPath;
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
  assert.equal(result.noSh, true, 'an existing cwd with no sh on PATH reports noSh');
  assert.equal(result.notStarted, true, 'a missing sh never started the suite');
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
  assert.equal(suiteBoundMs(600 * 1000), 570 * 1000, 'and it is the 30s margin below it');
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
  assert.equal(SUITE_TIMEOUT_MS, 570 * 1000, 'the production ceiling derives from the shipped hooks.json entry, margin below it');
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

// a long run of enumerated option names with no verb, and runs of substitution, parameter-expansion, and
// backtick units, parse in bounded time: a qualitative bound (AGENTS.md, ADR 0086) on a reading that is
// effectively unbounded when it backtracks, so the ceiling stays loose.
{
  const t0 = Date.now();
  assert.equal(parseMergeCommand('git ' + '--git-dir '.repeat(44) + 'x; git ' + 'merge main').verb, 'merge', 'the merge after the option run is found');
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 120000, `a pathological long-option run must resolve quickly, took ${elapsed}ms`);
}
{
  const t0 = Date.now();
  for (const [unit, repeats] of [
    ['git -C $(a $(b $(c))) x;', 2000],
    ['git -C $((1+(2))) x; ', 2000],
    ['git -C $(echo ")") x; ', 2400],
    ['git -C ${a b} x; ', 2000],
    ['git -C `a x; ', 2000],
  ]) {
    parseMergeCommand(unit.repeat(repeats));
  }
  for (const run of [
    'git -C ' + '$('.repeat(500) + ' x',
    'git -C ' + '${'.repeat(5000) + ' x; git merge y',
    'git -C ' + '${ '.repeat(5000) + 'x',
    'git -C ${ x; '.repeat(8000),
    'git -C ' + '${"'.repeat(20000),
    'git -C ' + '`'.repeat(5001) + ' x',
    'git --exec-path=' + '$(a '.repeat(2000) + 'x',
  ]) {
    parseMergeCommand(run);
  }
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 120000, `command-substitution runs must resolve quickly, took ${elapsed}ms`);
}

// A long run of blank lines parses in linear time, under a qualitative ceiling (AGENTS.md, ADR 0086).
{
  const t0 = Date.now();
  parseMergeCommand('\n'.repeat(256000) + 'x');
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 120000, `a long run of blank lines must answer in linear time, took ${elapsed}ms`);
}

// --- resolveMergeCwd(): the merge's own working tree, from -C or the session cwd fallback ---
for (const opt of ['-C', '--work-tree']) {
  assert.equal(resolveMergeCwd('git ' + opt + ' ${X:-a b} merge x', '/session'), null, opt + ' holding a parameter expansion with a space is unknowable');
}
const QUOTED_BRACE = ['${X:-"a } b"}', "${X:-'a } b'}", '${X:-"}"}', "${X:-'}'}", '${X:-`a } b`}'];
for (const opt of ['-C', '--work-tree']) {
  for (const value of QUOTED_BRACE) {
    assert.equal(resolveMergeCwd('git ' + opt + ' ' + value + ' merge s', '/session'), null, opt + ' ' + value + ' is unknowable');
  }
}
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

// a value the shell would expand is text the hook cannot resolve: unknowable, never a made-up path
for (const value of ['"$RR/scopetree"', '${RR}/wt', '"$(pwd)/wt"', '`pwd`/wt', '~/wt']) {
  assert.equal(resolveMergeCwd(`git -C ${value} merge --no-ff slice/demo/01`, '/session'), null, `-C ${value} names unexpanded shell syntax: unknowable`);
  assert.equal(resolveMergeCwd(`git --work-tree ${value} merge s`, '/session'), null, `--work-tree ${value} too`);
}
assert.equal(resolveMergeCwd('git --work-tree=$RR/wt merge s', '/session'), null, 'the = spelling too');
// a command substitution holding spaces is one word: the merge is seen, and its tree is unknowable
for (const value of ['$(git rev-parse --show-toplevel)/wt', '$(a $(b c))/wt', '`git rev-parse --show-toplevel`/wt']) {
  assert.equal(resolveMergeCwd(`git -C ${value} merge --no-ff s`, '/session'), null, `-C ${value} (spaces inside the substitution): unknowable`);
  assert.equal(resolveMergeCwd(`git --work-tree ${value} merge s`, '/session'), null, `--work-tree ${value} too`);
}
// at any nesting depth the merge is still seen, and its tree is unknowable
for (const value of ['$(dirname $(dirname $(pwd)))/wt', '$((1+(2)))/wt', '$(echo ")")/wt', '$(case x in a) y;; esac)/wt', '"$(echo "a b")"']) {
  assert.equal(resolveMergeCwd(`git -C ${value} merge s`, '/session'), null, `-C ${value} merge: seen as an unknowable merge`);
  assert.equal(resolveMergeCwd(`git --work-tree=${value} merge s`, '/session'), null, `--work-tree=${value} merge: seen as an unknowable merge`);
}
assert.equal(parseMergeCommand('git -C $(a $(b $(c))) log --grep merge'), null, 'a git command that is not a merge names no candidate');
assert.equal(parseMergeCommand('echo $(dirname $(dirname $(pwd))) && git -C /wt merge s').verb, 'merge', 'a merge after a substitution is found');
assert.equal(parseMergeCommand('git merge --abort'), null, 'merge --abort is no candidate');
assert.equal(parseMergeCommand('git merge --no-edit --abort'), null, 'merge --abort after another option is no candidate');
assert.equal(parseMergeCommand('git merge -q --quit'), null, 'merge --quit after another option is no candidate');
assert.equal(parseMergeCommand('git merge --no-edit x').verb, 'merge', 'a merge with options and a branch is a candidate');
assert.equal(parseMergeCommand('git merge x --abort').verb, 'merge', 'an --abort after the branch is a ref name, not the option');
for (const c of ['git merge -m --abort feature', 'git merge -m=--abort feature', 'git merge -F --quit feature', 'git merge -s --abort feature', 'git merge --into-name --abort feature', 'git merge -- --abort']) {
  assert.equal(parseMergeCommand(c).verb, 'merge', `${c}: an option value or a word after \`--\` is no abort, so the merge stays gated`);
}
for (const c of ['git merge --mess --abort feature', 'git merge --messa --quit feature', 'git merge --fi --abort feature', 'git merge --strategy-o --abort feature', 'git merge -nm --abort feature', 'git merge -qnF --quit feature']) {
  assert.equal(parseMergeCommand(c).verb, 'merge', `${c}: an abbreviated long option or a short bundle ending in a value letter takes the next word as its value, so the merge stays gated`);
}
for (const c of ['git merge --mess=x --abort', 'git merge -nmmsg --abort', 'git merge -n --abort', 'git merge --no-e --abort']) {
  assert.equal(parseMergeCommand(c), null, `${c}: an attached value or a no-value option leaves the abort an abort`);
}
for (const c of ['git merge -m msg --abort','git merge -mmsg --abort', 'git merge -X ours --quit', 'git merge --into-name=x --abort']) {
  assert.equal(parseMergeCommand(c), null, `${c}: the abort after a value-taking option is no candidate`);
}
assert.equal(parseMergeCommand('git merge s').quoted, false);
assert.equal(parseMergeCommand('sh -c "git merge s"').quoted, true, 'a merge inside a quoted word is a quoted candidate');
assert.deepEqual(parseMergeCommand('dash -c git\\ merge\\ x'), parseMergeCommand('dash -c "git merge x"'), 'a backslash-escaped merge is the candidate its quoted spelling is');
// dash runs `((…))` as nested subshells: a merge inside one is the quoted candidate its quoted spelling is (#1062)
assert.deepEqual(parseMergeCommand('dash -c "((git merge x))"'), parseMergeCommand('dash -c "git merge x"'), 'a (( merge is a quoted merge candidate');
for (const c of ['echo $((1 + 2))', '(( i++ ))', 'git log --grep "((push))"']) assert.equal(parseMergeCommand(c), null, `${c}: no candidate`);
// every re-read level is read as dash reads it, so a `((` merge escaped for a second shell level is the quoted candidate too
assert.deepEqual(parseMergeCommand('dash -c "dash -c \\\\(\\\\(git\\\\ merge\\\\ x\\\\)\\\\)"'), parseMergeCommand('dash -c "git merge x"'), 'a (( merge escaped for a second level is a quoted merge candidate');
// a run of backslashes in quoted text is no re-read level: the commit stays the candidate it is
assert.deepEqual(parseMergeCommand("git commit -m 'fix \\\\\\\\n in merge path'"), { verb: 'commit', quoted: false, tokens: [], dirChanged: false }, 'a backslash run leaves a commit candidate');
assert.equal(parseMergeCommand('sh -c "git commit" && git merge s').verb, 'merge', 'a merge the command runs beats a quoted commit');
assert.equal(parseMergeCommand('git merge "x').stuck, true, 'an unreadable command holding a merge is stuck');
assert.equal(parseMergeCommand('echo "x'), null, 'an unreadable command holding no merge is no candidate');
// A quoted text that reads as no command line and names `git … merge` is a quoted merge candidate: `sh -c` runs its lines
// before the syntax error, so the reflog decides.
assert.deepEqual(parseMergeCommand('bash -c "git merge x; echo don\'t"'), { verb: 'merge', quoted: true, tokens: [], dirChanged: false }, 'a failed quoted text holding a merge is a quoted merge');
assert.deepEqual(parseMergeCommand('bash -c "git pull; echo don\'t"'), { verb: 'pull', quoted: true, tokens: [], dirChanged: false }, 'a failed quoted text holding a pull is a quoted pull');
assert.equal(parseMergeCommand('bash -c "git pull; echo don\'t; git merge x"').verb, 'merge', 'a failed quoted merge beats a failed quoted pull');
// An unreadable command naming `git … pull` and no merge reports a blind verification only when the reflog shows a landed merge.
{
  assert.deepEqual(parseMergeCommand("git pull; echo '"), { stuck: true, verb: 'pull' }, 'an unreadable command holding a pull is a stuck pull');
  const blind = () => ({ full: 'npm test', focused: null, blind: 'superdev: cannot see the merge tree' });
  const suiteNotRun = () => {
    throw new Error('the suite should not run when the tree is unknowable');
  };
  const stuckPull = (landed) => decide(merge("git pull; echo '"), blind, suiteNotRun, notCalled, () => false, () => '', () => landed);
  assert.equal(stuckPull(true).block, true, 'a stuck pull that landed reports a blind verification');
  assert.equal(stuckPull(false).block, false, 'a stuck pull that landed nothing is silent');
}
assert.equal(parseMergeCommand('git commit -m "Merge (git merge x)"').verb, 'commit', 'a commit the command runs beats a failed quoted merge');
assert.equal(parseMergeCommand('git commit -m "don\'t push"').verb, 'commit', 'a failed quoted text holding no merge leaves the candidate');
assert.equal(parseMergeCommand('git merge s && git commit -m "why git merge isn\'t enough"').verb, 'merge', 'a merge the command runs beats a failed quoted text');
assert.equal(resolveMergeCwd('git -c "msg=$X" -C /wt merge s', '/session'), '/wt', 'a $ in another option\'s value is not a -C value');
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

// #903: the gate and scope.js read the same full and focused commands from every fence shape a
// verification document can carry: any info string, and `~~~` as well as backticks.
{
  const { verificationCommands } = require('../plugin/scripts/scope.js');
  const shapeDir = fs.mkdtempSync(path.join(tmp, 'gg-shape-'));
  fs.mkdirSync(path.join(shapeDir, 'docs/agents'), { recursive: true });
  const shapes = [
    ['```sh\nbun run test\n```\n\n```sh\nbun run test -- {paths}\n```\n', 'sh'],
    ['```shell-session\nbun run test\n```\n\n```shell-session\nbun run test -- {paths}\n```\n', 'shell-session'],
    ['```sh title="x"\nbun run test\n```\n\n```sh title="x"\nbun run test -- {paths}\n```\n', 'info string with attributes'],
    ['~~~sh\nbun run test\n~~~\n\n~~~\nbun run test -- {paths}\n~~~\n', 'tilde fence'],
  ];
  for (const [body, label] of shapes) {
    fs.writeFileSync(path.join(shapeDir, VERIFICATION_DOC), `# Verification\n\n${body}`);
    const gate = readVerification(shapeDir);
    const scope = verificationCommands(shapeDir);
    assert.equal(gate.full, 'bun run test', `${label}: full command (gate)`);
    assert.equal(gate.focused, 'bun run test -- {paths}', `${label}: focused command (gate)`);
    assert.equal(scope.full, 'bun run test', `${label}: full command (scope.js)`);
    assert.equal(scope.focused, 'bun run test -- {paths}', `${label}: focused command (scope.js)`);
  }
  // CommonMark: an opener and its closer may carry up to three leading spaces (a fence under a list item).
  fs.writeFileSync(path.join(shapeDir, VERIFICATION_DOC), '- run:\n\n  ```sh\n  bun run test\n  ```\n\n- focus:\n\n  ```sh\n  bun run test -- {paths}\n  ```\n');
  assert.deepEqual(readVerification(shapeDir), { full: 'bun run test', focused: 'bun run test -- {paths}' }, 'two-space-indented fences read in the gate');
  assert.equal(verificationCommands(shapeDir).full, 'bun run test', 'two-space-indented fences read in scope.js (full)');
  assert.equal(verificationCommands(shapeDir).focused, 'bun run test -- {paths}', 'two-space-indented fences read in scope.js (focused)');
  // Four spaces is an indented code block, not a fence.
  fs.writeFileSync(path.join(shapeDir, VERIFICATION_DOC), '    ```sh\n    bun run test\n    ```\n');
  assert.deepEqual(readVerification(shapeDir), { full: null, focused: null }, 'a four-space-indented fence is no fence');
  // An unclosed fence yields no block.
  fs.writeFileSync(path.join(shapeDir, VERIFICATION_DOC), '```sh\nbun run test\n');
  assert.deepEqual(readVerification(shapeDir), { full: null, focused: null }, 'an unclosed fence yields no block (gate)');
  assert.equal(verificationCommands(shapeDir).full, null, 'an unclosed fence yields no block (scope.js)');
  // A backtick opener whose info string holds a backtick is no opener.
  fs.writeFileSync(path.join(shapeDir, VERIFICATION_DOC), '```x``` inline\n\n```sh\nbun run test\n```\n\n```sh\nbun run test -- {paths}\n```\n');
  assert.deepEqual(readVerification(shapeDir), { full: 'bun run test', focused: 'bun run test -- {paths}' }, 'an inline triple-backtick span opens nothing (gate)');
  assert.equal(verificationCommands(shapeDir).full, 'bun run test', 'an inline triple-backtick span opens nothing (scope.js)');
  // A CRLF file reads like an LF one.
  fs.writeFileSync(path.join(shapeDir, VERIFICATION_DOC), '# V\r\n\r\n```sh\r\nbun run test\r\n```\r\n\r\n```sh\r\nbun run test -- {paths}\r\n```\r\n');
  assert.deepEqual(readVerification(shapeDir), { full: 'bun run test', focused: 'bun run test -- {paths}' }, 'CRLF fences read in the gate');
  assert.equal(verificationCommands(shapeDir).focused, 'bun run test -- {paths}', 'CRLF fences read in scope.js');
  // A `~~~~` opener read through scope.js closes only on a `~~~~` or longer line.
  fs.writeFileSync(path.join(shapeDir, VERIFICATION_DOC), '~~~~sh\nbun run test\n~~~\nstill inside\n~~~~\n');
  assert.equal(verificationCommands(shapeDir).full, 'bun run test ~~~ still inside', 'a longer tilde opener ignores a shorter tilde line (scope.js)');
  // A `## ` line inside a fence is no heading, so the whole-repo section stays open past it.
  fs.writeFileSync(path.join(shapeDir, VERIFICATION_DOC), '~~~sh\na\n~~~\n\n~~~sh\nb\n~~~\n\n## Whole-repo command\n\n```text\n## Notes\n```\n\n`c`\n');
  assert.equal(verificationCommands(shapeDir).whole, 'c', 'a `## ` line inside a fence does not end the whole-repo section');
  // A longer opener closes only on a line of at least its own length.
  fs.writeFileSync(path.join(shapeDir, VERIFICATION_DOC), '````sh\nbun run test\n```\nstill inside\n````\n');
  assert.equal(readVerification(shapeDir).full, 'bun run test\n```\nstill inside', 'a shorter fence line does not close a longer opener');
  // One fence keeps the full command and the notice; no fence at all is no gate.
  fs.writeFileSync(path.join(shapeDir, VERIFICATION_DOC), '# Verification\n\n~~~shell-session\nbun run test\n~~~\n');
  const one = readVerification(shapeDir);
  assert.equal(one.full, 'bun run test', 'a one-fence tilde document runs the full command');
  assert.match(one.notice, /\/superdev:setup/, 'a one-fence tilde document carries the notice');
  fs.writeFileSync(path.join(shapeDir, VERIFICATION_DOC), '# Verification\n\nNo commands here.\n');
  assert.deepEqual(readVerification(shapeDir), { full: null, focused: null }, 'no fence → no gate');
  // The whole-repo backtick span survives next to `~~~` fences in scope.js.
  fs.writeFileSync(path.join(shapeDir, VERIFICATION_DOC), '~~~sh\na\n~~~\n\n~~~sh\nb\n~~~\n\n## Whole-repo command\n\n`c`\n');
  assert.deepEqual(verificationCommands(shapeDir), { full: 'a', focused: 'b', whole: 'c' }, 'scope.js reads the whole-repo span beside tilde fences');
}

// The gate keeps its own copy of the fence parser so its decision never depends on scope.js loading; pin it to scope.js's
// source text. A one-byte difference fails here.
{
  const fenceSrc = (file) => {
    const m = /^function fenceBlocks\(raw\) \{\n[\s\S]*?^\}$/m.exec(fs.readFileSync(file, 'utf8'));
    assert.ok(m, `${path.basename(file)} declares fenceBlocks() where this pin expects it`);
    return m[0];
  };
  assert.equal(fenceSrc(hookPath), fenceSrc(require.resolve('../plugin/scripts/scope.js')), 'green-gate fenceBlocks is byte-identical to scope.js fenceBlocks');
  // The pin rejects a one-byte difference: the same extractor on two sources differing by one space.
  const extract = (src) => /^function fenceBlocks\(raw\) \{\n[\s\S]*?^\}$/m.exec(src)[0];
  const gateSrc = fs.readFileSync(hookPath, 'utf8');
  assert.notEqual(extract(gateSrc), extract(gateSrc.replace('const blocks = [];', 'const  blocks = [];')), 'a one-byte difference changes the extracted source');
}

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

// --- the scanner reads the command exactly once per decision. Calling decideMerge() itself, rather than
// re-assembling its steps here, makes this a regression test on main()'s own wiring: main() calls this exact
// function, so a second parseMergeCommand(cmd) call added inside it fails this assertion ---
{
  const words = require('../plugin/hooks/shell-words.js');
  const realScan = words.scan;
  let scans = 0;
  words.scan = (...args) => { scans += 1; return realScan(...args); };
  try {
    // `true`, not `npm test`: decideMerge() actually runs the configured full command (it is not
    // stubbed here, unlike decide()'s injected runTests elsewhere in this file), so the doc must
    // name something fast and side-effect-free.
    fs.writeFileSync(path.join(dir, VERIFICATION_DOC), '# Verification\n\n```sh\ntrue\n```\n');
    decideMerge(merge('git merge --no-ff slice/x/1'), dir);
    assert.equal(scans, 1, 'a full decision (cwd resolution + verification lookup) reads the command once');
    scans = 0;
    decideMerge(merge(`git -C '${path.join(dir, 'does-not-exist')}' merge x`), dir);
    assert.equal(scans, 1, 'a -C target carrying no verification doc reads the command once');
  } finally {
    words.scan = realScan;
  }
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

  // a -C naming a shell variable: the hook sees the unexpanded text, so the block names that cause
  // instead of a missing verification doc at a path that cannot exist
  {
    const session = tmp('gg-session-');
    initRepo(session);
    commitFile(session, 'base.txt', 'x\n');
    writeVerification(session, 'node -e "process.exit(0)"'); // green: the block is the unexpanded path
    for (const options of ['-C "$RR/scopetree"', '--work-tree "$RR/scopetree"']) {
      const result = runHook({ cwd: session, tool_input: { command: `git ${options} merge --no-ff other` } });
      assert.equal(result.status, 2, `a merge naming ${options} blocks`);
      assert.match(result.stderr, /shell/i, 'the block names the shell expansion as the cause');
      assert.match(result.stderr, /literal path/, 'the block asks for a literal path');
      assert.doesNotMatch(result.stderr, /docs\/agents\/verification\.md|\$RR/, 'it neither blames a missing doc nor prints the impossible path');
      assert.match(result.stderr, /nobody verified it/, 'the message states the merge landed unverified');
      assert.match(result.stderr, /A `-C` or `--work-tree` value holds shell syntax/, 'the block uses the landed-merge message');
      assert.match(result.stderr, /has landed/, 'the message states the merge has landed');
      assert.doesNotMatch(result.stderr, /if this command merged/, 'it is not the conditional stuck message');
    }
    fs.rmSync(session, { recursive: true, force: true });
  }

  // an unquoted command substitution, backtick group, or parameter expansion that the scanner reads as one word: the gate
  // still sees the merge and blocks it
  {
    const session = tmp('gg-session-');
    initRepo(session);
    commitFile(session, 'base.txt', 'x\n');
    writeVerification(session, 'node -e "process.exit(0)"'); // green: the block is the unexpanded path
    for (const value of ['$(git rev-parse --show-toplevel)/wt', '$(a $(b c))/wt', '`git rev-parse --show-toplevel`/wt', '${X:-a b}', ...QUOTED_BRACE]) {
      for (const opt of ['-C', '--work-tree']) {
        const result = runHook({ cwd: session, tool_input: { command: `git ${opt} ${value} merge --no-ff other` } });
        assert.equal(result.status, 2, `a merge naming ${opt} ${value} blocks`);
        assert.match(result.stderr, /shell/i, 'the block names the shell expansion as the cause');
        assert.match(result.stderr, /literal path/, 'the block asks for a literal path');
        assert.match(result.stderr, /A `-C` or `--work-tree` value holds shell syntax/, 'the block uses the landed-merge message');
        assert.match(result.stderr, /has landed/, 'the message states the merge has landed');
        assert.doesNotMatch(result.stderr, /if this command merged/, 'it is not the conditional stuck message');
      }
    }
    fs.rmSync(session, { recursive: true, force: true });
  }

  // past one nesting level, or behind a generic --opt=: the gate still blocks, with no suite run, and words the
  // block conditionally because the command may be a shell syntax error that merged nothing
  {
    const session = tmp('gg-session-');
    const marker = path.join(session, 'suite-ran.marker');
    initRepo(session);
    commitFile(session, 'base.txt', 'x\n');
    writeVerification(session, `node -e "require('fs').writeFileSync('${marker}', '')"`);
    const stuck = [];
    for (const value of ['$(dirname $(dirname $(pwd)))/wt', '$((1+(2)))/wt', '$(echo ")")/wt']) {
      for (const opt of ['-C', '--work-tree']) stuck.push(`git ${opt} ${value} merge s`);
    }
    // a readable merge whose -C value holds a substitution: the tree is unknowable, and the merge is claimed landed
    for (const command of stuck) {
      const result = runHook({ cwd: session, tool_input: { command } });
      assert.equal(result.status, 2, `${command} blocks`);
      assert.match(result.stderr, /literal path/, 'the block asks for a literal path');
      assert.match(result.stderr, /has landed/, 'the merge read as a real merge');
    }
    // a command the scanner cannot read to its end: the block is conditional, since it may have merged nothing
    for (const command of ['git -C $(pwd merge s', 'git -C `pwd merge x', 'git -C ${X:-a b merge x']) {
      const result = runHook({ cwd: session, tool_input: { command } });
      assert.equal(result.status, 2, `${command} blocks`);
      assert.match(result.stderr, /shell/i, 'the block names the shell syntax as the cause');
      assert.match(result.stderr, /literal path/, 'the block asks for a literal path');
      assert.match(result.stderr, /if this command merged, nobody verified it/i, 'the block is conditional: the command may have merged nothing');
      assert.doesNotMatch(result.stderr, /has landed/, 'the block does not claim the merge landed');
    }
    assert.equal(fs.existsSync(marker), false, 'no suite ran');
    const read = runHook({ cwd: session, tool_input: { command: 'git --exec-path=$(a $(b $(c))) log' } });
    assert.notEqual(read.status, 2, 'a stuck generic --opt= on a read command does not block');
    fs.rmSync(session, { recursive: true, force: true });
  }

  // --- the shared scanner reads the command (ADR 0135) ---
  // A session repository whose suite is red and whose HEAD reflog tops with a landed merge (`landed`) or a commit.
  const redSession = (landed) => {
    const session = tmp('gg-scan-');
    initRepo(session);
    commitFile(session, 'base.txt', 'x\n');
    git2(['checkout', '-q', '-b', 'other'], session);
    commitFile(session, 'o.txt', 'o\n');
    git2(['checkout', '-q', 'main'], session);
    commitFile(session, 'm.txt', 'm\n');
    if (landed) git2(['merge', '-q', '--no-ff', '-m', 'merge other', 'other'], session);
    writeVerification(session, `node -e "console.error('RED-CHECK'); process.exit(1)"`);
    return session;
  };
  {
    const landed = redSession(true);
    const notLanded = redSession(false);
    // a merge reached through any shape is verified
    for (const command of [
      'echo $(git merge x)',
      'echo `git merge x`',
      '(git merge x)',
      'cat <<E\n$(git merge x)\nE',
      'git -C $(echo a)/wt log && git merge x',
      'git -C "$(echo "a b")" log; git merge x',
      'x=1 git merge x',
    ]) {
      const result = runHook({ cwd: landed, tool_input: { command } });
      assert.equal(result.status, 2, `a merge in ${JSON.stringify(command)} is verified`);
      assert.match(result.stderr, /RED-CHECK/, 'the suite ran in the session tree');
    }
    // a git command that is not a merge reports nothing
    for (const command of ['git -C $(a $(b $(c))) log --grep merge', 'git -C $(case x in a) y;; esac)/wt log --grep merge', 'echo merge']) {
      const result = runHook({ cwd: landed, tool_input: { command } });
      assert.equal(result.status, 0, `${command} reports nothing`);
      assert.equal(result.stderr, '', 'and prints nothing');
    }
    // a merge found only in a quoted word is gated only when a readable tree's reflog shows a landed merge
    {
      // a landed merge the gate has not run the suite on yet: a quoted merge gates it, once
      const fresh = redSession(true);
      const first = runHook({ cwd: fresh, tool_input: { command: 'sh -c "git merge s"' } });
      assert.equal(first.status, 2, 'a quoted merge is gated on a landed reflog');
      assert.match(first.stderr, /RED-CHECK/, 'the gate run on this HEAD is red');
      // the gate already ran the suite on that HEAD, red or green, and reported it: quoted text naming a merge
      // verb (a grep, a log search) reruns nothing
      for (const command of ['grep -rn "git merge" .', 'git log --grep "git merge"', "rg 'git commit' .", 'sh -c "git merge s"']) {
        const again = runHook({ cwd: fresh, tool_input: { command } });
        assert.equal(again.status, 0, `${command} after a red gate run on the same HEAD is silent`);
        assert.equal(again.stderr, '', 'and prints nothing');
      }
      // a new merge lands: the quoted merge gates it again
      git2(['checkout', '-q', '-b', 'other2'], fresh);
      commitFile(fresh, 'o2.txt', 'o\n');
      git2(['checkout', '-q', 'main'], fresh);
      git2(['merge', '-q', '--no-ff', '-m', 'merge other2', 'other2'], fresh);
      assert.equal(runHook({ cwd: fresh, tool_input: { command: 'sh -c "git merge other2"' } }).status, 2, 'a quoted merge that lands a new merge is gated');
    }
    {
      // a merge inside dash's `((…))` subshells gates a landed merge as its quoted spelling does (#1062)
      const fresh = redSession(true);
      assert.equal(runHook({ cwd: fresh, tool_input: { command: 'dash -c "((git merge s))"' } }).status, 2, 'a (( merge is gated on a landed reflog');
      fs.rmSync(fresh, { recursive: true, force: true });
    }
    assert.equal(runHook({ cwd: notLanded, tool_input: { command: 'dash -c "((git merge s))"' } }).status, 0, 'a (( merge is silent without a landed merge');
    assert.equal(runHook({ cwd: notLanded, tool_input: { command: 'sh -c "git merge s"' } }).status, 0, 'a quoted merge is silent without a landed merge');
    assert.equal(runHook({ cwd: landed, tool_input: { command: 'cd /nonexistent && sh -c "git merge s"' } }).status, 0, 'a quoted merge after a cd has no readable tree: silent');
    assert.equal(runHook({ cwd: landed, tool_input: { command: 'sh -c "git -C \\"$X\\" merge s"' } }).status, 0, 'a quoted merge with an unexpanded -C is silent');
    // an unreadable command holding a merge reports a blind verification; any other one is silent
    const blind = runHook({ cwd: notLanded, tool_input: { command: 'git merge "x' } });
    assert.equal(blind.status, 2, 'an unreadable merge reports a blind verification');
    assert.match(blind.stderr, /if this command merged, nobody verified it/i);
    assert.equal(runHook({ cwd: notLanded, tool_input: { command: 'echo "unterminated' } }).status, 0, 'any other unreadable command is silent');
    // an unreadable or failed quoted `git … pull` is probed: silent without a landed merge, gated with one
    for (const command of ["git pull; echo '", 'bash -c "git pull; echo don\'t"']) {
      assert.equal(runHook({ cwd: notLanded, tool_input: { command } }).status, 0, `${command} without a landed merge is silent`);
      const fresh = redSession(true);
      assert.equal(runHook({ cwd: fresh, tool_input: { command } }).status, 2, `${command} after a landed merge is gated`);
      fs.rmSync(fresh, { recursive: true, force: true });
    }
    // a real merge whose -C value the hook cannot expand: a blind verification, not a conditional one
    const expanded = runHook({ cwd: landed, tool_input: { command: 'git -C $(case x in a) y;; esac)/wt merge s' } });
    assert.equal(expanded.status, 2);
    assert.match(expanded.stderr, /has landed/);
    // the scanner cannot be loaded: a blind verification (INV-0140)
    const dir = tmp('gg-noscanner-');
    try {
      const lone = path.join(dir, 'green-gate.js');
      fs.copyFileSync(hookPath, lone);
      const result = cp.spawnSync(process.execPath, [lone], { input: JSON.stringify({ cwd: notLanded, tool_input: { command: 'echo hi' } }), encoding: 'utf8', timeout: 15000 });
      assertSpawnDecided(result, 'green-gate.js without its scanner');
      assert.equal(result.status, 2, 'an unloadable scanner reports a blind verification');
      assert.match(result.stderr, /broken/i, 'and names the broken install');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    // the scanner throws: the same
    const words = require('../plugin/hooks/shell-words.js');
    const realScan = words.scan;
    words.scan = () => { throw new Error('boom'); };
    try {
      const v = decideMerge({ tool_input: { command: 'echo hi' } }, notLanded);
      assert.equal(v.block, true, 'a scan that throws reports a blind verification');
      assert.match(v.reason, /broken/i);
    } finally {
      words.scan = realScan;
    }
    // a helper of the scanner module throws after the scan: the same blind verification, never a crash
    for (const [name, command] of [['gitSubcommand', 'git merge s'], ['rawNamesVerb', 'git merge "x']]) {
      const real = words[name];
      words[name] = () => { throw new Error('boom'); };
      try {
        assert.deepEqual(parseMergeCommand(command), { broken: true }, `a throwing ${name} reads as broken`);
        const v = decideMerge({ tool_input: { command } }, notLanded);
        assert.equal(v.block, true, `a throwing ${name} reports a blind verification`);
        assert.match(v.reason, /broken/i);
      } finally {
        words[name] = real;
      }
    }
    // a quoted merge after a `cd` that names its tree with a literal -C is gated in that tree (slice 02, acceptance 6)
    {
      const named = redSession(true);
      const result = runHook({ cwd: notLanded, tool_input: { command: `cd /x && sh -c "git -C ${named} merge s"` } });
      assert.equal(result.status, 2, 'the quoted merge with a literal -C is gated');
      assert.match(result.stderr, /RED-CHECK/, 'the suite ran in the -C tree');
    }
    // a failed quoted text naming a merge is a quoted merge candidate: the reflog decides, never a blind verification
    for (const command of [
      'bash -c "git merge x; echo don\'t"',
      'git commit -m "fix: don\'t git merge twice"',
      'grep -rn "can\'t git merge" docs',
      'git commit -m "Merge (git merge x)"',
    ]) {
      const result = runHook({ cwd: notLanded, tool_input: { command } });
      assert.equal(result.status, 0, `${command} without a landed merge is silent`);
      assert.equal(result.stderr, '', 'and prints nothing');
    }
    {
      const fresh = redSession(true);
      const result = runHook({ cwd: fresh, tool_input: { command: 'bash -c "git merge x; echo don\'t"' } });
      assert.equal(result.status, 2, 'a merge in a failed quoted text is gated on a landed reflog');
      assert.match(result.stderr, /RED-CHECK/, 'the suite ran in the session tree');
      fs.rmSync(fresh, { recursive: true, force: true });
    }
    // a run of nested-substitution commands four times as long takes about four times the time against a same-run baseline (ADR 0086)
    // timePair repeats each sample to about 25 ms and takes the best of three, so neither a descheduled call nor a sub-millisecond
    // baseline sets the reading.
    const { timePair } = require('./linear-time');
    const nestedHeredocs = (d) => {
      let s = '';
      for (let k = d; k >= 1; k--) s = `cat <<E${k}\n$(${s})\nE${k}\n`;
      return s;
    };
    // Four times the input takes about four times as long when linear and sixteen times when quadratic; the ceiling sits at
    // nine, between them, loose for scheduler noise.
    const grows = (label, make, n) => {
      const [base, big] = timePair((command) => decide(merge(command), () => ({ full: null, focused: null }), red, notCalled), make(n), make(4 * n));
      assert.ok(big < base * 9, `${label}: time grows linearly: ${n} repeats took ${base} ns, ${4 * n} took ${big} ns`);
    };
    grows('nested substitutions', (n) => 'git -C $(a $(b $(c))) log; echo "$(x $(y))" ;'.repeat(n), 2000);
    grows('nested heredocs', nestedHeredocs, 400);
    grows('many (( runs', (n) => 'echo "((x))" ((y)) \\(\\(z\\)\\);'.repeat(n), 2000);
    fs.rmSync(landed, { recursive: true, force: true });
    fs.rmSync(notLanded, { recursive: true, force: true });
  }

  // a stuck merge abort/quit is no landed merge: nothing blocks
  {
    const session = tmp('gg-session-');
    initRepo(session);
    commitFile(session, 'base.txt', 'x\n');
    writeVerification(session, 'node -e "process.exit(0)"');
    for (const verb of ['--abort', '--quit']) {
      const result = runHook({ cwd: session, tool_input: { command: `git -C $(a $(b $(c)))/wt merge ${verb}` } });
      assert.equal(result.status, 0, `a stuck merge ${verb} does not block`);
    }
    fs.rmSync(session, { recursive: true, force: true });
  }

  // no verification doc anywhere → a stuck-shaped merge is inert
  {
    const session = tmp('gg-session-');
    initRepo(session);
    commitFile(session, 'base.txt', 'x\n');
    const result = runHook({ cwd: session, tool_input: { command: 'git -C $(a $(b $(c)))/wt merge s' } });
    assert.equal(result.status, 0, 'no verification doc anywhere → inert on a stuck-shaped merge');
    assert.equal(result.stderr, '', 'and prints nothing');
    fs.rmSync(session, { recursive: true, force: true });
  }

  // no verification doc anywhere → an unexpanded -C stays inert too
  {
    const session = tmp('gg-session-');
    initRepo(session);
    commitFile(session, 'base.txt', 'x\n');
    const result = runHook({ cwd: session, tool_input: { command: 'git -C "$RR/scopetree" merge --no-ff other' } });
    assert.equal(result.status, 0, 'no verification doc anywhere → inert on an unexpanded -C');
    assert.equal(result.stderr, '', 'and prints nothing');
    fs.rmSync(session, { recursive: true, force: true });
  }

  // a -c option with unexpandable shell syntax: the block names "a git option value", not -C or --work-tree
  {
    const session = tmp('gg-session-');
    initRepo(session);
    commitFile(session, 'base.txt', 'x\n');
    writeVerification(session, 'node -e "process.exit(0)"');
    const result = runHook({ cwd: session, tool_input: { command: 'git -c a=$(b $(c $(d))) merge --no-ff other' } });
    assert.equal(result.status, 0, 'a merge with -c holding a substitution names no tree: the session suite runs and passes');
    const unread = runHook({ cwd: session, tool_input: { command: 'git -c a=$(b $(c $(d)) merge --no-ff other' } });
    assert.equal(unread.status, 2, 'the same command with an unclosed substitution blocks');
    assert.match(unread.stderr, /shell/i, 'the block names the shell syntax as the cause');
    assert.match(unread.stderr, /if this command merged, nobody verified it/i, 'the block is conditional');
    assert.match(unread.stderr, /literal option value/, 'the advice names literal option values');
    fs.rmSync(session, { recursive: true, force: true });
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

  // --- ADR 0123: the gate tests every merge that landed, whatever the outcome of the Bash call that
  // landed it. Each case runs real git in a fixture repository, so the reflog the hook probes is the
  // one git wrote. A red suite stands for "the suite ran": exit 2 with SUITE-RAN on stderr.
  {
    const SUITE = `node -e "console.error('SUITE-RAN'); process.exit(1)"`;
    const OK = 'PostToolUse';
    const FAILED = 'PostToolUseFailure';
    const run = (cwd, event, command) => runHook({ hook_event_name: event, cwd, tool_input: { command } });
    const assertRan = (r, why) => {
      assert.equal(r.status, 2, `${why}: the suite runs and its red verdict blocks`);
      assert.match(r.stderr, /SUITE-RAN/, `${why}: the block quotes the suite`);
    };
    const assertIdle = (r, why) => {
      assert.equal(r.status, 0, `${why}: no block`);
      assert.equal(r.stderr, '', `${why}: no suite ran`);
    };
    const gitEnv = (dir, args) =>
      cp.execFileSync('git', args, { cwd: dir, stdio: 'ignore', env: Object.assign({}, process.env, { GIT_EDITOR: 'true' }) });
    // main and `other` fork from one base commit; `conflict` makes both change the same file.
    function forked(conflict, branch = 'main') {
      const dir = tmp('gg-landed-');
      initRepo(dir);
      commitFile(dir, 'c.txt', 'base\n');
      git2(['checkout', '-q', '-b', 'other'], dir);
      commitFile(dir, 'c.txt', 'other\n');
      git2(['checkout', '-q', 'main'], dir);
      if (conflict) commitFile(dir, 'c.txt', 'main\n');
      else commitFile(dir, 'm.txt', 'main\n');
      if (branch !== 'main') git2(['checkout', '-q', '-b', branch], dir);
      writeVerification(dir, SUITE);
      return dir;
    }
    const merged = (conflict, branch) => {
      const dir = forked(conflict, branch);
      gitEnv(dir, ['merge', '--no-ff', '--no-edit', 'other']);
      return dir;
    };
    const stopped = () => {
      const dir = forked(true);
      try {
        gitEnv(dir, ['merge', '--no-edit', 'other']);
      } catch {
        // the conflict stops the merge with MERGE_HEAD in place — that is the state under test
      }
      fs.writeFileSync(path.join(dir, 'c.txt'), 'resolved\n');
      return dir;
    };
    const rm = (...dirs) => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));

    {
      const dir = merged(false);
      assertRan(run(dir, OK, 'git merge --no-ff other'), 'a successful merge call');
      assertRan(run(dir, FAILED, 'git merge --no-ff other && git worktree remove gone'), 'a failed call whose merge landed');
      assertIdle(run(dir, FAILED, 'git status && false'), 'a failed call naming neither verb');
      assertIdle(run(dir, OK, 'git status'), 'a successful call naming neither verb');
      commitFile(dir, 'later.txt', 'x\n');
      assertIdle(run(dir, OK, 'git commit -m later'), 'a plain commit on a successful call');
      assertIdle(run(dir, FAILED, 'git commit -m later && false'), 'a plain commit on a failed call');
      rm(dir);
    }

    // a `git pull` that merged writes the reflog subject `pull …: Merge made by …`: it counts as landed, once per HEAD
    {
      const dir = forked(false);
      gitEnv(dir, ['pull', '-q', '--no-rebase', '--no-edit', '.', 'other']);
      assertRan(run(dir, OK, 'git pull . other'), 'a pull that merged');
      assertIdle(run(dir, OK, 'git pull . other'), 'a pull that landed nothing on a HEAD the gate already ran on');
      rm(dir);
    }

    // a failed merge that never started, with an older merge still on top of the reflog, runs the suite on it
    {
      const dir = merged(false);
      assertRan(run(dir, FAILED, 'git merge no-such-branch'), 'a failed merge call with an older merge on top of the reflog');
      rm(dir);
    }

    {
      const dir = stopped();
      assertIdle(run(dir, FAILED, 'git merge other'), 'a failed call whose merge stopped on a conflict');
      git2(['add', 'c.txt'], dir);
      git2(['commit', '--no-edit', '-q'], dir);
      assertRan(run(dir, OK, 'git commit --no-edit'), 'a conflicted merge concluded by git commit');
      assertRan(run(dir, FAILED, 'git commit --no-edit && false'), 'the same on a failed call');
      assertRan(run(dir, OK, 'rtk git commit --no-edit'), 'the same commit as RTK rewrote it');
      rm(dir);
    }

    {
      const dir = stopped();
      git2(['add', 'c.txt'], dir);
      gitEnv(dir, ['merge', '--continue']);
      assertRan(run(dir, OK, 'git merge --continue'), 'a conflicted merge concluded by merge --continue');
      assertRan(run(dir, FAILED, 'git merge --continue && false'), 'the same on a failed call');
      rm(dir);
    }

    // the probe reads the merge's resolved tree, not the session's
    {
      const session = merged(false);
      const target = forked(false);
      assertIdle(run(session, FAILED, `git -C '${target}' merge --no-ff other && false`), 'a -C tree whose reflog holds no merge, under a session whose reflog does');
      gitEnv(target, ['merge', '--no-ff', '--no-edit', 'other']);
      assertRan(run(session, FAILED, `git -C '${target}' merge --no-ff other && false`), 'a -C tree whose reflog tops on a merge');
      rm(session, target);
    }

    // a repository with its reflog off yields no entry: a successful `git merge` is still gated from its
    // command text, and a failed call whose merge landed stays silent (ADR 0123, Consequences)
    {
      const dir = forked(false);
      git2(['config', 'core.logAllRefUpdates', 'false'], dir);
      fs.rmSync(path.join(dir, '.git', 'logs'), { recursive: true, force: true });
      gitEnv(dir, ['merge', '--no-ff', '--no-edit', 'other']);
      assertRan(run(dir, OK, `git -C '${dir}' merge --no-ff other`), 'a successful merge call in a repository with the reflog off');
      assertIdle(run(dir, FAILED, `git -C '${dir}' merge --no-ff other && false`), 'a failed call whose merge landed, in a repository with the reflog off');
      rm(dir);
    }

    // a fast-forward writes the reflog subject `merge <ref>: Fast-forward`: it counts as landed
    {
      const dir = tmp('gg-ff-');
      initRepo(dir);
      commitFile(dir, 'c.txt', 'base\n');
      git2(['checkout', '-q', '-b', 'other'], dir);
      commitFile(dir, 'o.txt', 'other\n');
      git2(['checkout', '-q', 'main'], dir);
      writeVerification(dir, SUITE);
      git2(['add', '.'], dir);
      git2(['commit', '-q', '-m', 'doc'], dir);
      git2(['checkout', '-q', 'other'], dir);
      git2(['rebase', '-q', 'main'], dir);
      git2(['checkout', '-q', 'main'], dir);
      assertIdle(run(dir, FAILED, `git -C '${dir}' merge --ff-only other && false`), 'a failed call before any merge landed');
      gitEnv(dir, ['merge', '--ff-only', 'other']);
      assertRan(run(dir, FAILED, `git -C '${dir}' merge --ff-only other && false`), 'a failed call whose fast-forward merge landed');
      rm(dir);
    }

    // `git -C <quoted path> commit` concluding a conflicted merge: the probe reads that path's reflog
    {
      const session = merged(false);
      const spaced = stopped();
      git2(['add', 'c.txt'], spaced);
      const target = spaced + ' sp';
      fs.renameSync(spaced, target);
      assertIdle(run(session, FAILED, `git -C '${target}' commit --no-edit && false`), 'a -C commit whose tree has not concluded a merge, under a session whose reflog tops on one');
      git2(['commit', '--no-edit', '-q'], target);
      assertRan(run(session, FAILED, `git -C '${target}' commit --no-edit && false`), 'a -C <quoted path> commit that concluded a conflicted merge');
      assertRan(run(session, OK, `git -C '${target}' commit --no-edit`), 'the same on a successful call');
      rm(session, target);
    }

    // ADR 0033 deferral and the no-document case hold on both events
    for (const event of [OK, FAILED]) {
      const dir = merged(false, 'integration/wide');
      assertIdle(run(dir, event, 'git merge --no-ff other'), `a merge on an integration/ branch, ${event}`);
      rm(dir);
      const bare = merged(false);
      fs.rmSync(path.join(bare, VERIFICATION_DOC));
      assertIdle(run(bare, event, 'git merge --no-ff other'), `a repository with no verification document, ${event}`);
      rm(bare);
    }

    // the hook is registered on the failure event, with the success event's own timeout
    {
      const hooks = JSON.parse(fs.readFileSync(path.join(path.dirname(hookPath), 'hooks.json'), 'utf8')).hooks;
      const entry = (event) =>
        hooks[event]
          .filter((g) => g.matcher === 'Bash')
          .flatMap((g) => g.hooks)
          .find((h) => h.command.includes('green-gate.js'));
      assert.ok(entry(FAILED), 'green-gate is registered on PostToolUseFailure(Bash)');
      assert.equal(entry(FAILED).timeout, entry(OK).timeout, 'with the timeout entry readHookTimeoutMs() reads');
    }
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
}

// --- the gate's suite run lands in the run trace (INV-0017, ADR 0117) ---
{
  const os = require('node:os');
  const git = (args, cwd) => cp.execFileSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();
  // A scope run root holding a scopetree repo on `scope`, with a `feature` branch one commit ahead.
  function fixture(full, focused) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-trace-'));
    const runRoot = path.join(root, '.superdev', 'scopes', 's');
    const tree = path.join(runRoot, 'scopetree');
    fs.mkdirSync(tree, { recursive: true });
    git(['init', '-q', '-b', 'scope'], tree);
    git(['config', 'user.email', 'test@example.com'], tree);
    git(['config', 'user.name', 'test'], tree);
    fs.mkdirSync(path.join(tree, 'docs/agents'), { recursive: true });
    const fences = [full, focused].filter(Boolean).map((c) => `\`\`\`sh\n${c}\n\`\`\`\n`).join('\n');
    fs.writeFileSync(path.join(tree, VERIFICATION_DOC), `# Verification\n\n${fences}`);
    fs.writeFileSync(path.join(tree, 'a.txt'), 'a\n');
    git(['add', '.'], tree);
    git(['commit', '-q', '-m', 'base'], tree);
    git(['checkout', '-q', '-b', 'feature'], tree);
    fs.writeFileSync(path.join(tree, 'b.txt'), 'b\n');
    git(['add', '.'], tree);
    git(['commit', '-q', '-m', 'feature'], tree);
    git(['checkout', '-q', 'scope'], tree);
    git(['merge', '-q', '--no-ff', '-m', 'merge', 'feature'], tree);
    fs.writeFileSync(path.join(runRoot, 'ledger.md'), '# Scope\n');
    return { root, runRoot, tree };
  }
  const traceOf = (runRoot) => {
    try { return fs.readFileSync(path.join(runRoot, 'trace.log'), 'utf8'); } catch { return ''; }
  };
  const gate = (tree) => decideMerge({ tool_input: { command: 'git merge --no-ff feature' } }, tree);
  const scopeJs = require.resolve('../plugin/scripts/scope.js');

  // identical focused and full commands: the clean merge's green run backs `suite reusable`
  {
    const { root, runRoot, tree } = fixture('node -e ""', 'node -e ""');
    assert.equal(gate(tree).block, false, 'green gate run');
    const tip = git(['rev-parse', 'HEAD'], tree);
    assert.match(traceOf(runRoot), new RegExp(` scope main run full pass ${tip} clean`), 'the gate run is traced as a full pass at the tip');
    fs.writeFileSync(path.join(runRoot, 'ledger.md'), `# Scope\n\n**Suite:** green @ ${tip}\n`);
    const r = cp.spawnSync(process.execPath, [scopeJs, 'suite', 'reusable', '--branch', 'scope', '--root', runRoot], { cwd: tree, encoding: 'utf8', timeout: 15000 });
    assertSpawnDecided(r, 'scope.js suite reusable');
    assert.equal(r.status, 0, 'suite reusable accepts the merged tip: ' + r.stdout + r.stderr);
    fs.rmSync(root, { recursive: true, force: true });
  }

  // a red run records fail
  {
    const { root, runRoot, tree } = fixture('node -e "process.exit(1)"', 'node -e "process.exit(1)"');
    assert.equal(gate(tree).block, true, 'red gate run blocks');
    assert.match(traceOf(runRoot), / run full fail /, 'a red gate run appends run full fail');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // a scopetree run records under the one in-progress slice, as run-trace.js's locate() does
  {
    const { root, runRoot, tree } = fixture('node -e ""', 'node -e ""');
    fs.writeFileSync(path.join(runRoot, 'ledger.md'), '# Scope\n\n| id | title | deps | type | x | status |\n|---|---|---|---|---|---|\n| 03 | t | - | feature | x | in-progress |\n');
    assert.equal(gate(tree).block, false, 'green gate run');
    assert.match(traceOf(runRoot), / 03 main run full pass /, 'the lone in-progress slice owns the run');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // a slicetree run records under the slicetree's id
  {
    const { root, runRoot, tree } = fixture('node -e ""', 'node -e ""');
    const slicetree = path.join(runRoot, 'slicetrees', '07');
    fs.mkdirSync(path.dirname(slicetree), { recursive: true });
    fs.renameSync(tree, slicetree);
    assert.equal(gate(slicetree).block, false, 'green gate run');
    assert.match(traceOf(runRoot), / 07 main run full pass /, 'a slicetree run records under its id');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // a run killed at its bound appends nothing, driven through decideMerge
  {
    const { root, runRoot, tree } = fixture('node -e "setTimeout(()=>{},60000)"', null);
    const d = decideMerge({ tool_input: { command: 'git merge --no-ff feature' } }, tree, 300);
    assert.equal(d.block, true, 'a killed run blocks the merge');
    assert.equal(traceOf(runRoot), '', 'a killed run records nothing');
    assert.equal(
      fs.existsSync(path.resolve(tree, git(['rev-parse', '--git-path', 'green-gate-ran-head'], tree))),
      false,
      'a killed run writes no ran-HEAD marker, so a quoted candidate gates the merge again',
    );
    fs.rmSync(root, { recursive: true, force: true });
  }

  // different focused and full commands: the focused run is never `full`
  {
    const { root, runRoot, tree } = fixture('node -e "process.exit(1)"', 'node -e ""');
    assert.equal(gate(tree).block, false, 'the focused command ran green');
    assert.match(traceOf(runRoot), / run focused pass /, 'the focused run is traced as focused');
    assert.doesNotMatch(traceOf(runRoot), / run full /, 'no full line');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // a merge on a dirty tree records dirty, so `scope.js suite reusable` refuses it
  {
    const { root, runRoot, tree } = fixture('node -e ""', 'node -e ""');
    fs.writeFileSync(path.join(tree, 'untracked.txt'), 'x\n');
    assert.equal(gate(tree).block, false, 'green gate run');
    const tip = git(['rev-parse', 'HEAD'], tree);
    assert.match(traceOf(runRoot), new RegExp(` run full pass ${tip} dirty`), 'the dirty tree is recorded as dirty');
    fs.writeFileSync(path.join(runRoot, 'ledger.md'), `# Scope\n\n**Suite:** green @ ${tip}\n`);
    const r = cp.spawnSync(process.execPath, [scopeJs, 'suite', 'reusable', '--branch', 'scope', '--root', runRoot], { cwd: tree, encoding: 'utf8', timeout: 15000 });
    assertSpawnDecided(r, 'scope.js suite reusable');
    assert.notEqual(r.status, 0, 'suite reusable refuses a dirty tree');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // a run tree without ledger.md writes nothing
  {
    const { root, runRoot, tree } = fixture('node -e ""', 'node -e ""');
    fs.rmSync(path.join(runRoot, 'ledger.md'));
    assert.equal(gate(tree).block, false, 'green gate run');
    assert.equal(traceOf(runRoot), '', 'no ledger, no trace line');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // a spawn that never started produced no verdict (INV-0009): it records nothing
  {
    const { root, runRoot, tree } = fixture('node -e ""', null);
    const d = decideMerge({ tool_input: { command: `git -C '${path.join(tree, 'missing')}' merge --no-ff feature` } }, tree);
    assert.equal(d.block, true, 'a spawn that never started still gates the merge');
    assert.equal(traceOf(runRoot), '', 'a never-started spawn records nothing');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // the notStarted guard itself, driven straight at traceSuiteRun: a result of a spawn that never ran
  {
    const { root, runRoot, tree } = fixture('node -e ""', null);
    traceSuiteRun(tree, 'full', runTests('node -e ""', path.join(tree, 'missing-dir')));
    assert.equal(traceOf(runRoot), '', 'a notStarted result writes no trace line');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // a gate run in a subdirectory of the run tree is recorded, with the five run fields
  {
    const { root, runRoot, tree } = fixture('node -e ""', null);
    fs.mkdirSync(path.join(tree, 'sub'));
    traceSuiteRun(path.join(tree, 'sub'), 'full', { ok: true });
    assert.match(traceOf(runRoot), / run full pass [0-9a-f]{40,64} clean -$/m, 'a subpath cwd records one five-field run line');
    fs.rmSync(root, { recursive: true, force: true });
  }

  // outside every run tree nothing is written
  {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gg-trace-out-'));
    const tree = path.join(root, 'plain');
    fs.mkdirSync(tree);
    git(['init', '-q', '-b', 'main'], tree);
    git(['config', 'user.email', 'test@example.com'], tree);
    git(['config', 'user.name', 'test'], tree);
    fs.mkdirSync(path.join(tree, 'docs/agents'), { recursive: true });
    fs.writeFileSync(path.join(tree, VERIFICATION_DOC), '# V\n\n```sh\nnode -e ""\n```\n\n```sh\nnode -e ""\n```\n');
    fs.writeFileSync(path.join(tree, 'a.txt'), 'a\n');
    git(['add', '.'], tree);
    git(['commit', '-q', '-m', 'base'], tree);
    assert.equal(gate(tree).block, false, 'green run outside a run tree');
    assert.deepEqual(fs.readdirSync(root), ['plain'], 'no trace file appears anywhere beside the tree');
    assert.ok(!fs.existsSync(path.join(tree, 'trace.log')), 'no trace file appears inside the tree');
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// A Git Bash drive path in `-C` or `--work-tree` resolves as the Windows path on win32 (ADR 0150).
{
  const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  const onWin32 = (fn) => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try { return fn(); } finally { Object.defineProperty(process, 'platform', realPlatform); }
  };
  for (const opt of ['-C', '--work-tree']) {
    const cmd = `git ${opt} /c/repo merge x`;
    assert.equal(onWin32(() => resolveMergeCwd(cmd, '/session')), path.resolve('/session', 'C:/repo'), cmd);
    assert.equal(resolveMergeCwd(cmd, '/session'), '/c/repo', `${cmd} off win32`);
  }
  // Through the gate's entry, a merge naming the tree by a `/c/…` path reads that tree's verification doc and runs its command.
  const session = fs.mkdtempSync(path.join(tmp, 'gg-win-'));
  fs.mkdirSync(path.join(session, 'C:', 'repo', 'docs', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(session, 'C:', 'repo', VERIFICATION_DOC), '# Verification\n\n```sh\nwin-suite\n```\n');
  const cmd = 'git -C /c/repo merge x';
  const gate = () => {
    let ran = null;
    const spy = (c) => { ran = c; return { ok: true, output: '' }; };
    decide(merge(cmd), (parsed) => resolveVerification(parsed, cmd, session), spy, notCalled, () => false, () => '', () => true);
    return ran;
  };
  assert.equal(onWin32(gate), 'win-suite', 'win32: the verification doc under C:/repo is found');
  assert.equal(gate(), null, 'off win32 the /c/repo tree holds no verification doc');
  fs.rmSync(session, { recursive: true, force: true });
}

console.log('green-gate tests ok');
