'use strict';

// Suite for plugin/scripts/profile.js, the run profile (ADR 0103): repeated commands, command keying, and background Bash calls.

const assert = require('node:assert');
const path = require('node:path');
const { profile, render } = require('../plugin/scripts/profile.js');
const { ts, user, cmd, use, result, say, peerWake, hook, bgUse, bgNote, writeTree, enc, alphaTree, tmp, REPO } = require('./profile-setup.js');

const projectsDir = path.join(tmp(), 'projects');
writeTree(projectsDir, alphaTree(REPO));

// --- repeated commands and dispatches ----------------------------------------------------------
{
  const SLICE = (n) => path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', n);
  const agentResult = (sec, cwd, id, r) => result(sec, cwd, id, { toolUseResult: r });
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: {
    entries: [
      cmd(0, REPO, 'implement', 'feat/alpha'),
      use(1, REPO, 't1', 'Bash', { command: 'bun run test' }), result(11, REPO, 't1'),
      use(12, REPO, 't2', 'Bash', { command: 'cd /x && FORCE=1 bun run test 2>&1 | tail -60' }), result(22, REPO, 't2'),
      use(23, REPO, 'g1', 'Bash', { command: 'git status; bun run test >/tmp/log 2>&1' }), result(24, REPO, 'g1'),
      use(25, REPO, 'g2', 'Bash', { command: 'git status' }),
      // two dispatches in one message overlap; the third runs after both
      { type: 'assistant', timestamp: ts(30), cwd: REPO, message: { role: 'assistant', content: [
        { type: 'tool_use', id: 'a1', name: 'Agent', input: { description: 'Implement slice 01' } },
        { type: 'tool_use', id: 'a2', name: 'Agent', input: { description: 'Implement slice 02' } },
      ] } },
      agentResult(70, REPO, 'a1', { totalDurationMs: 40000, totalToolUseCount: 7, totalTokens: 1200 }),
      agentResult(90, REPO, 'a2', { totalDurationMs: 60000, totalToolUseCount: 9, totalTokens: 3400 }),
      use(100, REPO, 'a3', 'Agent', { description: 'Review slice 01' }),
      agentResult(120, REPO, 'a3', { totalToolUseCount: 2 }),
      say(130, REPO),
    ],
    agents: {
      x1: { meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' }, entries: [
        user(31, SLICE('01'), 'go'),
        use(32, SLICE('01'), 'u1', 'Bash', { command: 'bun run test' }), result(52, SLICE('01'), 'u1'),
        say(69, SLICE('01')),
      ] },
      x2: { meta: { agentType: 'superdev:implementer', description: 'Implement slice 02', toolUseId: 'a2' }, entries: [
        user(31, SLICE('02'), 'go'),
        use(33, SLICE('02'), 'u2', 'Bash', { command: 'bun run test' }), result(63, SLICE('02'), 'u2'),
        say(89, SLICE('02')),
      ] },
      x3: { meta: { agentType: 'superdev:slice-reviewer', description: 'Review slice 01', toolUseId: 'a3' }, entries: [
        user(101, SLICE('01'), 'go'), say(119, SLICE('01')),
      ] },
    },
  } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.commands, [
    { command: 'bun run test', count: 5, total: 70500 },
    { command: 'git status', count: 1, total: 500 },
  ], 'each command inside a call is its own group, whatever wraps it (cd, assignments, redirections, a pipe into tail); a compound call splits its time across the groups it contains (git status has no solo call, so it takes the mean of the other weights); groups span the orchestrator and its subagents, largest total first; the unfinished git status is not counted');

  assert.deepEqual(p.dispatches.map((d) => [d.agentType, d.description, d.duration, d.toolUses, d.tokens, d.segment, d.batch, d.slowest]), [
    ['superdev:implementer', 'Implement slice 01', 40000, 7, 1200, 0, 1, false],
    ['superdev:implementer', 'Implement slice 02', 60000, 9, 3400, 0, 1, true],
    ['superdev:slice-reviewer', 'Review slice 01', null, 2, null, 0, null, false],
  ], 'the two overlapping dispatches form batch 1 with the longer flagged; the third is unmarked');
  assert.ok(p.unrecognized.some((u) => /totalDurationMs/.test(u.reason)), 'a result lacking totalDurationMs is reported unrecognized (INV-0101)');

  const text = render(p);
  assert.match(text, /Repeated commands/);
  assert.match(text, /Dispatches/);
}

// A leading `time` is dropped, so a timed call still groups under its real program.
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(1, REPO, 't1', 'Bash', { command: 'time bun run test' }), result(11, REPO, 't1'),
    use(12, REPO, 't2', 'Bash', { command: 'bun run test' }), result(22, REPO, 't2'),
    say(30, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.commands, [{ command: 'bun run test', count: 2, total: 20000 }],
    'a leading `time` is dropped rather than kept as the group\'s program');
}

// A heredoc body line never groups as its own command: only the real command that opens it does.
// A `node -e` inline one-liner keys by its inline-source flag, not the bare
// interpreter alone.
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(1, REPO, 't1', 'Bash', { command: "cat <<'EOF' > /tmp/x.js\nconst x = 1;\ngit status\nEOF" }), result(11, REPO, 't1'),
    use(12, REPO, 't2', 'Bash', { command: 'cat <<EOF > /tmp/y.js\nconst y = 2;\nEOF' }), result(22, REPO, 't2'),
    use(23, REPO, 't3', 'Bash', { command: "node -e '\nconst z = 3;\nconsole.log(z);\n'" }), result(24, REPO, 't3'),
    // A heredoc opened inside a double-quoted `$(...)` command substitution — the shape a
    // `git commit -m "$(cat <<'EOF' … EOF )"` or `gh … --body "$(cat <<'EOF' …)"` call takes
    // : the body lines never become keys, and the `)"` line that closes the
    // heredoc's own quote contributes nothing either.
    use(25, REPO, 't4', 'Bash', { command: "git commit -m \"$(cat <<'EOF'\nCo-Authored-By: X\nEOF\n)\"" }), result(26, REPO, 't4'),
    say(30, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.commands, [
    { command: 'cat', count: 2, total: 20000 },
    { command: 'node -e', count: 1, total: 1000 },
    { command: 'git commit', count: 1, total: 1000 },
  ], 'a quoted heredoc, an unquoted heredoc, a multi-line node -e argument, and a heredoc inside a double-quoted $(...) all give only the real command keys, never a body line such as "const", "git status", or "Co-Authored-By:"');
}

// A closing quote's own line never swallows the real command after it: the statement past the closing
// quote is its own key too .
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(1, REPO, 't1', 'Bash', { command: 'git commit -q -m "subject\n\nbody\nCo-Authored-By: X" && git log --oneline -1' }), result(11, REPO, 't1'),
    say(20, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.commands, [{ command: 'git commit', count: 1, total: 5000 }, { command: 'git log', count: 1, total: 5000 }],
    'the "git log" statement after the closing quote is its own key, not swallowed by the multi-line commit message');
}

// A `#` at a word start outside any quote is a comment to the end of the line, so an apostrophe inside
// it never opens a quote that swallows the following linestem 1).
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(1, REPO, 't1', 'Bash', { command: "# don't touch\ngit status\nbun run test" }), result(11, REPO, 't1'),
    say(20, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.commands, [{ command: 'git status', count: 1, total: 5000 }, { command: 'bun run test', count: 1, total: 5000 }],
    "the apostrophe in the comment opens no quote, so the following lines are read as real commands, not swallowed");
}

// A backslash-escaped quote never closes the string it is inside, so the real close on the same line is
// what ends it, and the command still parses instead of swallowing the next line .
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(1, REPO, 't1', 'Bash', { command: 'echo "a\\"b"\ngit status' }), result(11, REPO, 't1'),
    say(20, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.commands, [{ command: 'echo', count: 1, total: 5000 }, { command: 'git status', count: 1, total: 5000 }],
    'the escaped quote inside "a\\"b" is not the close, so the real closing quote ends the string on the same line and "git status" is its own key');
}

// An even run of backslashes before a closing quote is an escaped backslash, not an escaped quote, so
// the quote still closes and the rest of the call is not lost with it.
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(1, REPO, 't1', 'Bash', { command: 'echo "a\\\\" && git log\ngit status' }), result(11, REPO, 't1'),
    say(20, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.commands, [
    { command: 'echo', count: 1, total: 10000 / 3 },
    { command: 'git log', count: 1, total: 10000 / 3 },
    { command: 'git status', count: 1, total: 10000 / 3 },
  ], 'the two backslashes before the quote escape each other, not the quote, so it closes and "git status" on the next line is its own key');
}

// A `<<WORD` inside plain quoted text opens no heredoc, only one after a `$(` still open in the same
// quoted span does.
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(1, REPO, 't1', 'Bash', { command: 'echo "use <<EOF here" && git log' }), result(11, REPO, 't1'),
    say(20, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.commands, [
    { command: 'echo', count: 1, total: 5000 },
    { command: 'git log', count: 1, total: 5000 },
  ], 'the "<<EOF" inside the quoted string is not a heredoc, so the quote closes normally and "git log" is not lost');
}

// An operator inside quoted text never splits the statement there: a quoted argument that carries a `;`
// still keys once, as the real command, never as a fragment of the broken-open quote.
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(1, REPO, 't1', 'Bash', { command: 'git commit -m "subject; wip\nbody"' }), result(11, REPO, 't1'),
    say(20, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.commands, [{ command: 'git commit', count: 1, total: 10000 }],
    'the ";" inside the quoted commit message never splits the statement, so there is one key, "git commit", not a fragment per stray quote character');
}

// A shell keyword never keys on its own: a leading one is dropped so the real command after it on the
// same statement keys instead, and a statement left with nothing after the drop keys nothing at all
// (not lost).
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(1, REPO, 't1', 'Bash', { command: 'do bun run test\ndone\nthen git log\nfi\n{ git status; }\n( git diff )' }), result(21, REPO, 't1'),
    say(30, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.commands, [
    { command: 'bun run test', count: 1, total: 5000 },
    { command: 'git log', count: 1, total: 5000 },
    { command: 'git status', count: 1, total: 5000 },
    { command: 'git diff', count: 1, total: 5000 },
  ], '"do", "done", "then", "fi", "{" and "}" and "(" and ")" never key on their own; the command after a leading keyword on the same statement keys instead');
}

// A whole `VAR=$(cmd …)` statement keys the command inside the substitution, not the assignment's own
// leftover word (not lost).
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(1, REPO, 't1', 'Bash', { command: 'SHA=$(git rev-parse HEAD)' }), result(11, REPO, 't1'),
    say(20, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.commands, [{ command: 'git rev-parse', count: 1, total: 10000 }],
    '"SHA=$(git rev-parse HEAD)" keys "git rev-parse", the command run inside the substitution, not "rev-parse"');
}

// An interpreter's script argument named by a `$`-prefixed variable keys as written, quoted or not
// (version variations).
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(1, REPO, 't1', 'Bash', { command: 'node $S root' }), result(11, REPO, 't1'),
    use(12, REPO, 't2', 'Bash', { command: 'node "$S" get' }), result(22, REPO, 't2'),
    say(30, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.commands, [{ command: 'node $S', count: 2, total: 20000 }],
    'a variable script argument, quoted or not, keys "node $S" both times, rather than falling back to the bare "node"');
}

// A quoted absolute script path under a version-numbered plugin cache directory keys past that
// directory, so different plugin versions running the same script group under one key.
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(1, REPO, 't1', 'Bash', { command: 'node "/Users/x/.claude/plugins/cache/superdev/superdev/0.41.0/scripts/scope.js" root' }), result(11, REPO, 't1'),
    use(12, REPO, 't2', 'Bash', { command: 'node "/Users/x/.claude/plugins/cache/superdev/superdev/0.42.0/scripts/scope.js" get' }), result(22, REPO, 't2'),
    say(30, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.commands, [{ command: 'node scripts/scope.js', count: 2, total: 20000 }],
    'the path keys past the version directory, so 0.41.0 and 0.42.0 running the same script group under one key, not two');
}

// The test runner keys by its mode: `scope.js test full|whole|focused|--` and `scope.js fail-to-pass`
// each make their own row, whatever path ran the script, and paths, the wrapped command, and the range
// never enter the key. Every other scope.js verb keys as before.
{
  const keysOf = (commands) => {
    const dir = path.join(tmp(), 'projects');
    const entries = [cmd(0, REPO, 'implement', 'feat/alpha')];
    commands.forEach((command, i) => entries.push(use(10 * i + 1, REPO, `t${i}`, 'Bash', { command }), result(10 * i + 1 + (i + 1), REPO, `t${i}`)));
    entries.push(say(10 * commands.length + 5, REPO));
    writeTree(dir, { [enc(REPO)]: { s: { entries } } });
    return profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' }).commands
      .map((c) => [c.command, c.count, c.total]).sort((a, b) => a[0].localeCompare(b[0]));
  };
  assert.deepEqual(keysOf([
    'node plugin/scripts/scope.js test full',
    'node plugin/scripts/scope.js test whole',
    'node plugin/scripts/scope.js test focused a.js b.js',
    'node plugin/scripts/scope.js test -- node tests/x.test.js',
    'node plugin/scripts/scope.js fail-to-pass abc..def',
  ]), [
    ['scope.js fail-to-pass', 1, 5000],
    ['scope.js test --', 1, 4000],
    ['scope.js test focused', 1, 3000],
    ['scope.js test full', 1, 1000],
    ['scope.js test whole', 1, 2000],
  ], 'one row per mode, each with its own count and total');
  assert.deepEqual(keysOf([
    'node plugin/scripts/scope.js test focused a.js',
    'node plugin/scripts/scope.js test focused b.js c.md',
  ]), [['scope.js test focused', 2, 3000]], 'two focused runs with different paths share one row');
  assert.deepEqual(keysOf([
    'node plugin/scripts/scope.js test full',
    'node /Users/x/superdev/plugin/scripts/scope.js test full',
    'node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test full',
    'node "/Users/x/.claude/plugins/cache/superdev/superdev/0.70.0/scripts/scope.js" test full',
  ]), [['scope.js test full', 4, 10000]], 'a relative, absolute, quoted, and versioned plugin-cache path share one row');
  assert.deepEqual(keysOf([
    'node "$SCOPE" test full',
    'node $SCOPE test focused a.js',
    'node "$SCOPE" fail-to-pass abc..def',
    'node "$SCOPE" root alpha',
  ]), [
    ['node $SCOPE', 1, 4000],
    ['scope.js fail-to-pass', 1, 3000],
    ['scope.js test focused', 1, 2000],
    ['scope.js test full', 1, 1000],
  ], 'a shell-variable script argument followed by a test mode or fail-to-pass keys as the mode row; any other verb keys as before');
  assert.deepEqual(keysOf([
    'node plugin/scripts/scope.js slice 01 merged',
    'node "/Users/x/.claude/plugins/cache/superdev/superdev/0.70.0/scripts/scope.js" root alpha',
    'node tests/profile.test.js',
  ]), [
    ['node plugin/scripts/scope.js', 1, 1000],
    ['node scripts/scope.js', 1, 2000],
    ['node tests/profile.test.js', 1, 3000],
  ], 'every other scope.js verb and every other script keys exactly as before');
}

// Parallel Stop hooks: the session only waited for the slowest one, so that is the hook time, but the
// per-name breakdown keeps each hook's own duration, so it can sum to more than the hook column
// (parallel hook timing).
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO),
    { type: 'system', subtype: 'stop_hook_summary', timestamp: ts(6), cwd: REPO,
      hookInfos: [{ command: 'node stop-a.js', durationMs: 600 }, { command: 'node stop-b.js', durationMs: 700 }] },
    user(40, REPO, 'go on'),
    say(45, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.hook, 700, 'the hook time is the slowest of the two parallel Stop hooks, not their sum');
  assert.deepEqual(p.segments[0].hooks, { Stop: 1300 }, "the per-name breakdown carries both hooks' own durations, summing past the hook column");
}

// An interpreter keys by its first non-flag argument when that argument is a script path, so every
// interpreter call keys by its own script instead of collapsing into one key.
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(1, REPO, 't1', 'Bash', { command: 'node tests/profile.test.js' }), result(11, REPO, 't1'),
    use(12, REPO, 't2', 'Bash', { command: 'node plugin/scripts/profile.js' }), result(22, REPO, 't2'),
    use(23, REPO, 't3', 'Bash', { command: "python3 -c 'print(1)'" }), result(24, REPO, 't3'),
    use(25, REPO, 't4', 'Bash', { command: 'bun run test' }), result(35, REPO, 't4'),
    say(40, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.commands, [
    { command: 'node tests/profile.test.js', count: 1, total: 10000 },
    { command: 'node plugin/scripts/profile.js', count: 1, total: 10000 },
    { command: 'bun run test', count: 1, total: 10000 },
    { command: 'python3 -c', count: 1, total: 1000 },
  ], 'two node calls key by their own script path, an inline python3 -c keys by its flag, and bun run test — whose first argument is neither — keeps the plain-word key');
}

// A `for`/`select` header and a `case … in` header key nothing; the loop body and each case arm's
// command key. A quote escaped by a backslash opens no quoted span. A quoted or exported `$(…)`
// assignment keys the inner command. A backslash-newline continues a statement, and a `(` or `{`
// attached to the first word is dropped.
{
  const keysOf = (command) => {
    const dir = path.join(tmp(), 'projects');
    writeTree(dir, { [enc(REPO)]: { s: { entries: [
      cmd(0, REPO, 'implement', 'feat/alpha'),
      use(1, REPO, 't1', 'Bash', { command }), result(11, REPO, 't1'),
      say(20, REPO),
    ] } } });
    return profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' }).commands.map((c) => c.command).sort();
  };
  assert.deepEqual(keysOf('for f in a b; do git log; done'), ['git log'], 'a for header keys nothing, its body keys');
  assert.deepEqual(keysOf('for f in a b\ndo\n  git log\ndone'), ['git log'], 'a multi-line for loop keys only its body');
  assert.deepEqual(keysOf('while true; do git status; done'), ['git status', 'true'], 'a while condition and its body key');
  assert.deepEqual(keysOf('case $x in a) git log ;; b) git status ;; esac'), ['git log', 'git status'], 'each case arm keys its command, the header and patterns key nothing');
  assert.deepEqual(keysOf('case $x in\n  a) git log ;;\n  *) git status ;;\nesac'), ['git log', 'git status'], 'a multi-line case keys each arm');
  assert.deepEqual(keysOf("echo don\\'t; git log -1"), ['echo', 'git log'], 'an escaped quote opens no quoted span');
  assert.deepEqual(keysOf('X="$(git rev-parse HEAD)"'), ['git rev-parse'], 'a quoted substitution assignment keys the inner command');
  assert.deepEqual(keysOf('export X=$(git rev-parse HEAD)'), ['git rev-parse'], 'an exported assignment keys the inner command');
  assert.deepEqual(keysOf('local X="$(git log -1)"'), ['git log'], 'a local assignment keys the inner command');
  assert.deepEqual(keysOf('curl -s \\\n  -H x \\\n  -d y'), ['curl'], 'a backslash-newline continues the statement');
  assert.deepEqual(keysOf('(cd dir && git log)'), ['git log'], 'a parenthesis attached to the first word is dropped');
  assert.deepEqual(keysOf('for f in a b; do case "$f" in *.js) git log;; esac; done'), ['git log'], 'a case after a leading do keys its arm command');
  assert.deepEqual(keysOf('git commit -m "subject \\\nmore" && git log'), ['git commit', 'git log'], 'a backslash-newline inside an open quote joins nothing, so the statement after the close survives');
  assert.deepEqual(keysOf('{ n=$((n+1)); }'), [], 'an arithmetic assignment keys nothing');
  assert.deepEqual(keysOf('n=$((n+1))'), [], 'a bare arithmetic assignment keys nothing');
  assert.deepEqual(keysOf('node ${S}'), ['node ${S}'], 'a braced variable keeps its closing brace');
  assert.deepEqual(keysOf('node ${S} arg'), ['node ${S}'], 'a braced variable with an argument keys the same row');
}

// A compound call splits its duration by the median single-key duration of each key; the per-key
// totals sum to the Bash time of every call that ran a command.
{
  const run = (calls) => {
    const dir = path.join(tmp(), 'projects');
    let t = 1;
    const entries = [cmd(0, REPO, 'implement', 'feat/alpha')];
    calls.forEach(([command, secs], i) => {
      entries.push(use(t, REPO, `t${i}`, 'Bash', { command }), result(t + secs, REPO, `t${i}`));
      t += secs + 1;
    });
    entries.push(say(t + 1, REPO));
    writeTree(dir, { [enc(REPO)]: { s: { entries } } });
    return profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' }).commands;
  };
  const sum = (cs) => cs.reduce((a, c) => a + c.total, 0);
  let cs = run([['echo x', 1], ['bun run test', 90], ['echo x; bun run test', 91]]);
  assert.deepEqual(cs.map((c) => [c.command, c.count]), [['bun run test', 2], ['echo x', 2]], 'the count is the number of calls that ran the command');
  assert.ok(Math.abs(cs[0].total - 180000) < 1e-6 && Math.abs(cs[1].total - 2000) < 1e-6, 'bun run test takes 90 of the compound call\'s 91 seconds');
  assert.ok(Math.abs(sum(cs) - (1000 + 90000 + 91000)) < 1e-6, 'the per-key totals sum to the Bash time of every call that ran a command');
  cs = run([['git status; git log', 10]]);
  assert.deepEqual(cs.map((c) => c.total), [5000, 5000], 'keys with no single-key call split evenly');
  cs = run([['git status; git log', 10], ['git log', 4]]);
  assert.ok(Math.abs(cs.find((c) => c.command === 'git status').total - 5000) < 1e-6, 'a key with no single-key call takes the mean of the other weights');
  cs = run([['a; b; c', 6], ['a', 1], ['b', 3]]);
  assert.deepEqual(['a', 'b', 'c'].map((k) => cs.find((c) => c.command === k).total), [2000, 6000, 2000], 'a key with no solo run takes the mean of the other weights: the 6 s call splits 1:3:2 (plus the solo runs), where an even split gives thirds');
  cs = run([['cd /tmp', 5], ['echo x', 2]]);
  assert.deepEqual(cs.map((c) => c.total), [2000], 'a call that ran no command is in no per-key total');
  cs = run([['echo x; git log', 0]]);
  assert.deepEqual(cs.map((c) => c.total), [0, 0], 'all-zero weights split evenly');
  const p = render({ ...profile({ projectsDir: (() => { const d = path.join(tmp(), 'projects'); writeTree(d, { [enc(REPO)]: { s: { entries: [cmd(0, REPO, 'implement', 'feat/alpha'), use(1, REPO, 'a', 'Bash', { command: 'git status; git log' }), result(5, REPO, 'a'), say(9, REPO)] } } }); return d; })(), repoRoot: REPO, slug: 'alpha' }) });
  assert.match(p, /compound call's time is shared/i);
  assert.match(p, /can overlap other rows/, 'the render says a background row can overlap the others');
}

// A key's weight comes from its solo calls in every session of the repository, not only the profiled
// scope's segments.
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, {
    [enc(REPO)]: {
      s: { entries: [cmd(0, REPO, 'implement', 'feat/alpha'), use(1, REPO, 'c', 'Bash', { command: 'echo x; bun run test' }), result(92, REPO, 'c'), say(93, REPO)] },
      other: { entries: [use(1, REPO, 'o1', 'Bash', { command: 'bun run test' }), result(91, REPO, 'o1'), use(100, REPO, 'o2', 'Bash', { command: 'echo x' }), result(100.1, REPO, 'o2')] },
    },
  });
  const cs = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' }).commands;
  assert.deepEqual(cs.map((c) => [c.command, c.count]), [['bun run test', 1], ['echo x', 1]], 'the count stays the number of the scope\'s calls');
  assert.ok(Math.abs(cs[0].total - 91000 * 90 / 90.1) < 1e-6, 'bun run test takes 90 of the 90.1 weighted seconds of the compound call');
  assert.ok(Math.abs(cs[0].total + cs[1].total - 91000) < 1e-6, 'the totals still sum to the scope\'s Bash time');
}

// A run with no overlapping dispatches marks nothing.
{
  const p = profile({ projectsDir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.dispatches.length, 1);
  assert.equal(p.dispatches[0].batch, null);
  assert.equal(p.dispatches[0].slowest, false);
}


// --- a background Bash call counts from its launch to its completion notification (ADR 0143) ------

{
  const run = (entries) => {
    const dir = path.join(tmp(), 'projects');
    writeTree(dir, { [enc(REPO)]: { s: { entries: [cmd(0, REPO, 'implement', 'feat/alpha'), ...entries] } } });
    return profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  };
  // completed: the call runs from 1 to the notification at 63; the turn-end gap it covers is tool time.
  let p = run([bgUse(1, REPO, 'g1', 'bun run test'), result(2, REPO, 'g1'), say(3, REPO), bgNote(63, REPO, 'g1'), say(65, REPO)]);
  assert.deepEqual(p.commands, [{ command: 'bun run test', count: 1, total: 62000 }], 'a background call counts from launch to its completion notification');
  assert.equal(p.segments[0].times.idle, 0, 'the turn-end gap the background call runs across is not idle');
  assert.equal(p.segments[0].times.tool, 62000, 'the background call is tool time from launch to notification');
  assert.deepEqual(p.unfinished, []);

  // failed and killed end the call the same way; a second notification changes nothing; a notification
  // naming no call adds nothing and is not unrecognized.
  for (const status of ['failed', 'killed']) {
    p = run([bgUse(1, REPO, 'g1', 'bun run test'), result(2, REPO, 'g1'), say(3, REPO), bgNote(21, REPO, 'g1', status),
      say(22, REPO), bgNote(40, REPO, 'g1'), bgNote(41, REPO, 'nobody'), say(45, REPO)]);
    assert.deepEqual(p.commands, [{ command: 'bun run test', count: 1, total: 20000 }], `a ${status} notification ends the call, and the first notification wins`);
    assert.deepEqual(p.unrecognized, [], 'a notification naming no call is not unrecognized');
  }

  // no notification: unfinished, and nothing counts, its launch included.
  p = run([bgUse(1, REPO, 'g1', 'bun run test'), result(2, REPO, 'g1'), say(3, REPO), user(30, REPO, 'go on'), say(35, REPO)]);
  assert.deepEqual(p.unfinished.map((u) => [u.segment, u.tool]), [[0, 'Bash']], 'a background call with no notification is unfinished');
  assert.deepEqual(p.commands, [], 'and adds nothing to the commands table');
  assert.equal(p.segments[0].times.tool, 0, 'nor to tool time, its launch included');

  // a gap no background call or subagent runs across stays idle.
  p = run([bgUse(1, REPO, 'g1', 'bun run test'), result(2, REPO, 'g1'), bgNote(10, REPO, 'g1'), say(12, REPO), peerWake(40, REPO), say(45, REPO)]);
  assert.equal(p.segments[0].times.idle, 28000, 'a gap after the background call ended stays idle');

  // a call spanning two phase segments adds to each only the part inside it.
  p = run([bgUse(5, REPO, 'g1', 'bun run test'), result(6, REPO, 'g1'), cmd(20, REPO, 'review', 'feat/alpha'),
    say(21, REPO), bgNote(30, REPO, 'g1'), say(31, REPO)]);
  assert.deepEqual(p.segments.map((s) => s.times.tool), [15000, 10000], 'each segment holds only its own part of the call');

  // human wait is never tool time (INV-0102).
  p = run([bgUse(5, REPO, 'g1', 'bun run test'), result(6, REPO, 'g1'), say(10, REPO), user(50, REPO, 'go on'), say(52, REPO),
    bgNote(100, REPO, 'g1'), say(101, REPO)]);
  assert.equal(p.segments[0].times.human, 40000, 'the typed-prompt gap stays human wait');
  assert.equal(p.segments[0].times.tool, 55000, 'the background call is tool time only outside it');

  // a subagent's own background call counts the same way, and one with no notification is unfinished.
  {
    const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
    const dir = path.join(tmp(), 'projects');
    writeTree(dir, { [enc(REPO)]: { s: { entries: [
      cmd(0, REPO, 'implement', 'feat/alpha'),
      use(5, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
      result(90, REPO, 'a1', { toolUseResult: { totalDurationMs: 85000, totalToolUseCount: 2, totalTokens: 10 } }),
      say(91, REPO),
    ], agents: { x1: {
      meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' },
      entries: [user(6, SLICE, 'go'), bgUse(7, SLICE, 'h1', 'bun run test'), result(8, SLICE, 'h1'),
        bgUse(9, SLICE, 'h2', 'git log'), result(10, SLICE, 'h2'), bgNote(67, SLICE, 'h1'), say(89, SLICE)],
    } } } } });
    p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
    assert.deepEqual(p.commands, [{ command: 'bun run test', count: 1, total: 60000 }], "a subagent's background call counts launch to notification");
    assert.deepEqual(p.unfinished.map((u) => [u.segment, u.tool]), [[0, 'Bash']], "a subagent's background call with no notification is unfinished");
  }

  // the footnote names the new reading.
  const text = render(run([bgUse(1, REPO, 'g1', 'bun run test'), result(2, REPO, 'g1'), say(3, REPO), bgNote(63, REPO, 'g1'), say(65, REPO)]));
  assert.match(text, /background call counts from its launch to its completion and can overlap other rows/);
  assert.doesNotMatch(text, /sum to the Bash time/, 'the totals no longer claim to sum to the Bash time');
}
console.log('profile.test.js ok');
