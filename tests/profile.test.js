'use strict';

// Suite for plugin/scripts/profile.js, the run profile (ADR 0103). Every fixture is a synthetic
// Claude Code transcript tree written to a temp dir, so each timing below is exact by construction.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict.js');

const SCRIPT = require.resolve('../plugin/scripts/profile.js');
const { profile, render } = require(SCRIPT);

const T0 = Date.parse('2026-09-28T10:00:00.000Z');
const ts = (s) => new Date(T0 + s * 1000).toISOString();

// --- transcript entry builders -----------------------------------------------------------------
const user = (s, cwd, content, extra = {}) =>
  ({ type: 'user', timestamp: ts(s), cwd, permissionMode: 'auto', message: { role: 'user', content }, ...extra });
const cmd = (s, cwd, name, args, extra) =>
  user(s, cwd, `<command-message>superdev:${name}</command-message>\n<command-name>/superdev:${name}</command-name>\n<command-args>${args}</command-args>`, extra);
const use = (s, cwd, id, name, input = {}) =>
  ({ type: 'assistant', timestamp: ts(s), cwd, message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
const result = (s, cwd, id, extra) =>
  user(s, cwd, [{ type: 'tool_result', tool_use_id: id, content: 'ok' }], extra);
const say = (s, cwd) =>
  ({ type: 'assistant', timestamp: ts(s), cwd, message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] } });
const interrupt = (s, cwd, text = '[Request interrupted by user]') =>
  user(s, cwd, [{ type: 'text', text }]);
const peerWake = (s, cwd) =>
  user(s, cwd, [{ type: 'text', text: 'Another Claude session sent a message: go on' }],
    { isMeta: true, origin: { kind: 'peer' } });
// A synthetic assistant entry — Claude Code's own stand-in message, never a real model turn — with no
// tool_use, so it is a turn end on that ground alone too.
const synthetic = (s, cwd, txt) =>
  ({ type: 'assistant', timestamp: ts(s), cwd, message: { role: 'assistant', model: '<synthetic>', content: [{ type: 'text', text: txt }] } });
// A plain-text isMeta continuation note the harness inserts on resume, never wrapped in a tag.
const metaResume = (s, cwd, txt) => user(s, cwd, [{ type: 'text', text: txt }], { isMeta: true });
// An assistant "thinking" entry: a real, non-synthetic assistant entry that carries no final text.
const think = (s, cwd, txt) =>
  ({ type: 'assistant', timestamp: ts(s), cwd, message: { role: 'assistant', content: [{ type: 'thinking', thinking: txt }] } });
// An image-only prompt the operator pastes (a screenshot), with no text block of its own.
const imagePrompt = (s, cwd) =>
  user(s, cwd, [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } }]);
// The harness's own injected recap after a context compaction, never something the operator typed.
const compactSummary = (s, cwd, txt) => user(s, cwd, txt, { isCompactSummary: true });
const hook = (s, cwd, event, name, ms) =>
  ({ type: 'attachment', timestamp: ts(s), cwd, attachment: { type: 'hook_success', hookEvent: event, hookName: name, durationMs: ms } });
const stopHooks = (s, cwd, ms) =>
  ({ type: 'system', subtype: 'stop_hook_summary', timestamp: ts(s), cwd, hookInfos: [{ command: 'node stop.js', durationMs: ms }] });

const jsonl = (entries) => entries.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join('\n') + '\n';

function writeTree(projectsDir, dirs) {
  for (const [dir, sessions] of Object.entries(dirs)) {
    for (const [id, s] of Object.entries(sessions)) {
      fs.mkdirSync(path.join(projectsDir, dir), { recursive: true });
      fs.writeFileSync(path.join(projectsDir, dir, `${id}.jsonl`), jsonl(s.entries));
      for (const [agentId, a] of Object.entries(s.agents || {})) {
        const sub = path.join(projectsDir, dir, id, 'subagents');
        fs.mkdirSync(sub, { recursive: true });
        fs.writeFileSync(path.join(sub, `agent-${agentId}.jsonl`), jsonl(a.entries));
        fs.writeFileSync(path.join(sub, `agent-${agentId}.meta.json`), JSON.stringify(a.meta));
      }
    }
  }
}

const enc = (p) => p.replace(/[^A-Za-z0-9]/g, '-');

// The fixture every phases assertion reads. REPO is the main working tree.
function alphaTree(REPO) {
  const SCOPE = path.join(REPO, '.superdev', 'scopes', 'alpha');
  const TREE = path.join(SCOPE, 'scopetree');
  const SLICE = path.join(SCOPE, 'slicetrees', '01');
  return {
    [enc(REPO)]: {
      s1: {
        entries: [
          cmd(0, REPO, 'plan', '.superdev/brainstorm/alpha.md'),
          say(5, REPO),
          // implement [10, 180): starts at the repo root, and only its subagent runs under the run root.
          cmd(10, REPO, 'implement', 'feat/alpha'),
          use(12, REPO, 'b1', 'Bash', { command: 'bun run test' }),
          hook(12, REPO, 'PreToolUse', 'PreToolUse:Bash', 1000),
          result(20, REPO, 'b1'),
          use(25, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
          result(90, REPO, 'a1', { toolUseResult: { totalDurationMs: 65000, totalToolUseCount: 3, totalTokens: 500 } }),
          use(95, REPO, 'q1', 'AskUserQuestion', {}),
          result(125, REPO, 'q1'),
          say(130, REPO),
          stopHooks(131, REPO, 2000),
          user(160, REPO, 'go on'),
          use(165, REPO, 'b2', 'Bash', { command: 'git status' }),
          result(175, REPO, 'b2'),
          // review [180, 210): prompting permission mode, one unfinished call.
          cmd(180, TREE, 'review', 'alpha', { permissionMode: 'default' }),
          use(185, TREE, 'b3', 'Bash', { command: 'bun run test' }),
          result(195, TREE, 'b3', { permissionMode: 'default' }),
          use(200, TREE, 'b4', 'Bash', { command: 'sleep 999' }),
          // review again [210, 230).
          cmd(210, TREE, 'review', 'alpha'),
          say(220, TREE),
          // a review of another scope in the same session [230, 240).
          cmd(230, REPO, 'review', 'feat/beta'),
          say(240, REPO),
        ],
        agents: {
          x1: {
            meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' },
            entries: [user(26, SLICE, 'Implement slice 01'), say(86, SLICE)],
          },
        },
      },
    },
    // A session started inside the scopetree lands in a sibling transcript directory.
    [enc(TREE)]: {
      s2: {
        entries: [
          cmd(300, TREE, 'document', 'alpha'),
          use(305, TREE, 'b5', 'Bash', { command: 'git diff' }),
          result(310, TREE, 'b5'),
          say(320, TREE),
        ],
      },
    },
    // A different repository whose encoded path shares the prefix is never read.
    [enc(REPO) + '-old']: {
      s3: { entries: [cmd(400, REPO + '-old', 'review', 'alpha'), say(410, REPO + '-old')] },
    },
  };
}

function tmp() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'profile-test-')));
}

function snapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = fs.readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
}

const REPO = '/repo';
const root = tmp();
const projectsDir = path.join(root, 'projects');
writeTree(projectsDir, alphaTree(REPO));

// --- phases view ---------------------------------------------------------------------------------
{
  const p = profile({ projectsDir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.slug, 'alpha');
  assert.deepEqual(p.segments.map((s) => s.command), ['implement', 'review', 'review', 'document'],
    'one row per chain segment in time order: plan and the other scope are left out, a second review is its own row, and the scopetree session is included');

  for (const s of p.segments) {
    const t = s.times;
    assert.equal(t.subagent + t.tool + t.hook + t.model + t.human + t.idle, t.wall, `${s.command}: the split sums to wall-clock time`);
  }

  const [impl, rev1, rev2, doc] = p.segments;
  // The assistant's final text (130) and the Stop hook's own system entry (131) are consecutive turn
  // ends with nothing between them, so they collapse into one block. The Stop hook summary follows the
  // last real output, so the gap to the next typed prompt (160) starts there, at 131, a 29s gap — the
  // 1s between the text and the summary is the hook's own runtime, counted once, as hook time, instead
  // of also being folded into human wait.
  assert.deepEqual(impl.times, { wall: 170000, human: 59000, subagent: 65000, tool: 17000, hook: 3000, model: 26000, idle: 0 },
    'implement: ask 30s + a 29s between-turn gap is human wait, the Agent window is subagent time, and a PreToolUse hook comes out of tool time');
  assert.deepEqual(impl.hooks, { 'PreToolUse:Bash': 1000, Stop: 2000 }, 'hook time is summed per hook name');
  assert.deepEqual(rev1.times, { wall: 30000, human: 0, subagent: 0, tool: 10000, hook: 0, model: 20000, idle: 0 });
  assert.equal(rev2.times.wall, 20000, 'the second review runs to the next superdev command');
  assert.equal(doc.times.tool, 5000);

  // human wait (INV-0102)
  assert.equal(rev1.promptingMode, 'default', 'a segment in a prompting permission mode names it');
  assert.equal(impl.promptingMode, null, 'an auto segment carries no notice');

  // unfinished calls (INV-0103)
  assert.deepEqual(p.unfinished.map((u) => [u.segment, u.tool]), [[1, 'Bash']], 'the call with no result is listed, by tool');
  assert.equal(rev1.times.tool, 10000, 'the unfinished call adds nothing to tool time');

  assert.deepEqual(p.unrecognized, []);
}

// --- idle: a turn end followed by a cross-session wake with nothing running is idle time, kept out
// of human wait and every machine total -----------------------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO), // the turn ends idle, nothing running
    peerWake(65, REPO), // a peer session wakes it 60s later
    say(70, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.idle, 60000, 'the gap from the turn end to the peer wake, with nothing running, is idle');
  assert.equal(p.segments[0].times.human, 0, 'a peer wake is not a typed prompt, so it starts no human wait');
}

// --- idle: a subagent running over the same gap keeps it subagent time, not idle ------
{
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
    result(6, REPO, 'a1', { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'ag1' } }),
    say(10, REPO), // the turn ends idle, waiting on the background dispatch
    peerWake(65, REPO), // a peer session wakes it while the dispatch is still running
    say(70, REPO),
  ], agents: { x1: {
    meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' },
    entries: [user(7, SLICE, 'go'), say(65, SLICE)],
  } } } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.subagent, 59000, 'the gap the background subagent ran through stays subagent time');
  assert.equal(p.segments[0].times.idle, 0, 'nothing is left over for idle once the subagent interval covers the gap');
}

// --- idle: a turn end followed by a typed prompt still gives human wait, not idle -----
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO),
    user(45, REPO, 'go on'),
    say(50, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 40000, 'a typed prompt still ends the gap as human wait');
  assert.equal(p.segments[0].times.idle, 0, 'and none of it is idle');
}

// --- an image-only prompt the operator pastes is a typed prompt, not idle -------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO),
    imagePrompt(50, REPO),
    say(55, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 45000, 'an image-only prompt with no text of its own is still a typed prompt, so the gap to it is human wait');
  assert.equal(p.segments[0].times.idle, 0);
}

// --- a compact summary is never a typed prompt; the harness injects it, so the walk-back looks
// straight past it to whatever really closes the gap -----------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO),
    compactSummary(50, REPO, 'This session is being continued from a previous conversation...'),
    user(90, REPO, 'go on'),
    say(95, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 85000,
    'the compact summary is filler, not the entry that closes the gap; the whole gap to the next typed prompt is human wait, from the turn end (5)');
  assert.equal(p.segments[0].times.idle, 0);
}

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
  assert.doesNotMatch(p, /overlap/, 'the totals no longer overlap, so no overlap notice');
  assert.match(p, /compound call's time is shared/i);
  assert.match(p, /Bash time of every call that ran a command/, 'the render names what the totals sum to');
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

// --- no slug: the scope whose segment ended last -------------------------------------------------
{
  const p = profile({ projectsDir, repoRoot: REPO });
  assert.equal(p.slug, 'alpha', 'the document segment in the scopetree session ended last');
}

// --- a free-form argument names no scope --------------------------------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'review', 'fix the alpha thing'), say(10, REPO),
    cmd(20, REPO, 'review', 'src/alpha'), say(30, REPO),
    cmd(40, REPO, 'review', 'feat/alpha --unattended'), say(50, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.segments.map((s) => s.start), [T0 + 40000], 'only the feature-label argument attributes the segment');
}

// --- a BASE..branch (or BASE...branch) argument names its right-hand scope -----------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/gamma'), say(5, REPO),
    cmd(10, REPO, 'review', '816f89fe..feat/gamma'), say(20, REPO),
    cmd(30, REPO, 'document', 'b6b86a06...feat/gamma'), say(40, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'gamma' });
  assert.deepEqual(p.segments.map((s) => s.command), ['implement', 'review', 'document'],
    'a two-dot or three-dot range argument names the scope of its right-hand <change-type>/<slug>');
}

// --- an explicitly named scope is never diluted by a leftover cwd from another scope --------------
{
  const OTHER = path.join(REPO, '.superdev', 'scopes', 'other', 'scopetree');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    // the session's cwd lags behind the scope named in the args — a real leftover from a prior
    // command run inside another scope's run root.
    cmd(0, OTHER, 'implement', 'feat/delta'),
    use(5, OTHER, 'b1', 'Bash', { command: 'bun run test' }), result(15, OTHER, 'b1'),
    say(20, OTHER),
  ] } } });
  const delta = profile({ projectsDir: dir, repoRoot: REPO, slug: 'delta' });
  assert.deepEqual(delta.segments.map((s) => s.command), ['implement'], 'the named scope still profiles');
  assert.throws(() => profile({ projectsDir: dir, repoRoot: REPO, slug: 'other' }), /no phase segment/,
    "the named scope's leftover cwd never leaks the segment into the other scope's profile");
}

// --- a lone bare argument names a scope only when otherwise evidenced (a fake scope stays out) ----
{
  const TREE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'scopetree');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    // "audit" is a document mode word, not a scope — no run root named "audit" ever appears.
    cmd(0, REPO, 'document', 'audit'), say(10, REPO),
    // "alpha" is evidenced: a run root under .superdev/scopes/alpha/ appears in this same session.
    cmd(20, REPO, 'review', 'alpha'), say(25, TREE),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.segments.map((s) => s.command), ['review'],
    'the unevidenced bare token "audit" names no scope, so it is left out of every scope\'s profile');
  assert.throws(() => profile({ projectsDir: dir, repoRoot: REPO, slug: 'audit' }), /no phase segment/,
    'a lone bare argument with no evidenced run root never becomes a fake scope');
}

// --- background dispatches read duration, tool count and tokens from the task-notification --------
{
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
    // an async launch returns at once, with no totalDurationMs.
    result(6, REPO, 'a1', { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'ag1' } }),
    // the task-notification arrives later, carrying the real figures, keyed by tool-use id.
    {
      type: 'attachment', timestamp: ts(120), cwd: REPO,
      attachment: {
        type: 'queued_command', commandMode: 'task-notification',
        prompt: '<task-notification>\n<task-id>ag1</task-id>\n<tool-use-id>a1</tool-use-id>\n<status>completed</status>\n<usage><subagent_tokens>1200</subagent_tokens><tool_uses>7</tool_uses><duration_ms>65000</duration_ms></usage>\n</task-notification>',
        usage: { totalTokens: 1200, toolUses: 7, durationMs: 65000 },
      },
    },
    say(125, REPO),
  ], agents: { x1: {
    meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' },
    entries: [user(7, SLICE, 'go'), say(60, SLICE)],
  } } } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.dispatches.map((d) => [d.duration, d.toolUses, d.tokens]), [[65000, 7, 1200]],
    'an async dispatch reads its duration, tool count and tokens off the task-notification usage block');
  assert.deepEqual(p.unrecognized, [], 'a notified async dispatch is not unrecognized');
}

// --- a background dispatch's figures also come off the text-only `<usage>` block, an attachment's
// own `prompt` with no structured `attachment.usage` field (Claude Code 2.1.251–2.1.278) -----------
{
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
    result(6, REPO, 'a1', { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'ag1' } }),
    {
      type: 'attachment', timestamp: ts(120), cwd: REPO,
      attachment: {
        type: 'queued_command', commandMode: 'task-notification',
        prompt: '<task-notification>\n<task-id>ag1</task-id>\n<tool-use-id>a1</tool-use-id>\n<status>completed</status>\n<usage><subagent_tokens>1200</subagent_tokens><tool_uses>7</tool_uses><duration_ms>65000</duration_ms></usage>\n</task-notification>',
        // no structured `usage` field — this build only ever put the figures in `prompt` text.
      },
    },
    say(125, REPO),
  ], agents: { x1: {
    meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' },
    entries: [user(7, SLICE, 'go'), say(60, SLICE)],
  } } } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.dispatches.map((d) => [d.duration, d.toolUses, d.tokens]), [[65000, 7, 1200]],
    'a text-only attachment.prompt notification is parsed for duration, tool count and tokens too');
  assert.deepEqual(p.unrecognized, [], 'a notified async dispatch is not unrecognized');
}

// --- a background dispatch's figures also come off a `user`-entry notification's own text (current,
// including 2.1.283) -------------------------------------------------------------------------------
{
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
    result(6, REPO, 'a1', { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'ag1' } }),
    user(120, REPO, '<task-notification>\n<task-id>ag1</task-id>\n<tool-use-id>a1</tool-use-id>\n<status>completed</status>\n<usage><subagent_tokens>1200</subagent_tokens><tool_uses>7</tool_uses><duration_ms>65000</duration_ms></usage>\n</task-notification>'),
    say(125, REPO),
  ], agents: { x1: {
    meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' },
    entries: [user(7, SLICE, 'go'), say(60, SLICE)],
  } } } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.dispatches.map((d) => [d.duration, d.toolUses, d.tokens]), [[65000, 7, 1200]],
    'a user-entry task-notification is parsed for duration, tool count and tokens too');
  assert.deepEqual(p.unrecognized, [], 'a notified async dispatch is not unrecognized');
}

// --- a task-notification landing as a `user` entry is not a typed prompt, so the idle gap it ends
// stays subagent time, never human wait (INV-0102) --------------------------------------------------
{
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
    result(6, REPO, 'a1', { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'ag1' } }),
    say(10, REPO), // the turn ends idle, waiting on the background dispatch
    user(70, REPO, '<task-notification>\n<task-id>ag1</task-id>\n<tool-use-id>a1</tool-use-id>\n<status>completed</status>\n<usage><subagent_tokens>500</subagent_tokens><tool_uses>4</tool_uses><duration_ms>60000</duration_ms></usage>\n</task-notification>'),
    say(75, REPO),
  ], agents: { x1: {
    meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' },
    entries: [user(7, SLICE, 'go'), say(65, SLICE)],
  } } } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 0, 'the notification is harness-injected, not a typed prompt, so it starts no human wait');
  assert.equal(p.segments[0].times.subagent, 59000, 'the gap the background subagent ran through stays subagent time instead');
}

// --- a local command's own echoed stdout is also never a typed prompt ------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO),
    user(60, REPO, '<local-command-stdout>Set model to `claude-opus-5[1m]`</local-command-stdout>'),
    say(65, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 0, 'a local command\'s own echoed output is harness-injected, not an operator prompt');
}

// --- the idle gap before a typed prompt is measured from the last real turn end, walking back over
// a caveat, a Stop hook attachment, or a SessionStart context attachment the harness inserts ahead of
// the prompt (INV-0102) ----------------------------------------------------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO), // the turn ends here; everything below is harness filler before the next typed prompt
    hook(30, REPO, 'Stop', 'Stop', 500),
    user(60, REPO, '<local-command-caveat>Caveat: …</local-command-caveat>', { isMeta: true }),
    cmd(65, REPO, 'review', 'feat/alpha'),
    say(70, REPO),
    hook(90, REPO, 'SessionStart', 'SessionStart', 200), // a resume's hook_additional_context attachment
    cmd(95, REPO, 'document', 'feat/alpha'),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 60000,
    'the caveat and the Stop hook attachment are filler, not the entry the idle gap ends at — the gap is measured back to the turn end');
  assert.equal(p.segments[1].times.human, 25000,
    'a SessionStart hook_additional_context attachment on resume is filler too');
}

// --- an interrupt is a turn end, not a typed prompt: the gap from it to the next typed prompt is
// human wait, never leaked into model time ---------------------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO), // a real turn end
    use(10, REPO, 'b1', 'Bash', { command: 'sleep 999' }), // interrupted mid-call, no tool_result
    interrupt(15, REPO),
    user(45, REPO, 'continue'), // the next typed prompt, 30s after the interrupt
    say(50, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 30000,
    'the interrupt ends the turn; the gap from it to the next typed prompt is human wait, not model time');
}

// --- the walk-back stops at the block's last real, non-synthetic assistant entry: a thinking entry
// followed by the model's real final text, then a typed prompt gives a gap that starts at the text
// entry, not the earlier thinking entry -----------------------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    think(5, REPO, 'reasoning...'),
    say(8, REPO), // the model's real, final output for the turn
    user(40, REPO, 'go on'),
    say(45, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 32000,
    'the gap to the next typed prompt runs from the last real assistant entry (8), not the earlier thinking entry (5) — the 3s from thinking to text stays model time');
}

// --- the walk-back also stops at an interrupt entry: a real assistant entry still streaming when the
// operator cuts it off, then the interrupt, then the next typed prompt gives a gap that starts at the
// interrupt — the machine's generation time up to the interrupt stays model time, not human wait
//  ------------------------------------------------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    think(5, REPO, 'reasoning, still streaming...'), // the model was mid-generation when interrupted
    interrupt(15, REPO),
    user(45, REPO, 'continue'),
    say(50, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 30000,
    'the gap runs from the interrupt (15), where machine work stopped, not from the earlier thinking entry (5) — the 10s the model spent generating before the interrupt stays out of human wait');
}

// --- a Stop hook summary that follows the block's last real output moves the gap's start to the
// summary itself, so the hook's own runtime is counted once, as hook time, never also as human wait
//  ------------------------------------------------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO), // the model's real, final output for the turn
    stopHooks(6, REPO, 1000), // the Stop hook runs between the turn's end and this summary
    user(40, REPO, 'go on'),
    say(45, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 34000,
    'the gap starts at the Stop hook summary (6), not the turn end before it (5) — the hook\'s own second stays out of human wait');
  assert.equal(p.segments[0].times.hook, 1000, 'the Stop hook\'s own duration still counts, as hook time');
}

// --- a variant interrupt message ("… for tool use") is recognized the same way ----------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO),
    use(10, REPO, 'b1', 'Bash', { command: 'sleep 999' }),
    interrupt(15, REPO, '[Request interrupted by user for tool use]'),
    user(20, REPO, 'continue'),
    say(25, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 5000, 'the "for tool use" variant is recognized as an interrupt too');
}

// --- a rate-limit or spend-limit resume gives idle: a synthetic assistant entry ends the turn, and the
// isMeta "Continue from where you left off." note that lands hours later is not a typed prompt — the
// one general rule replaces limit-reset resume behavior ------------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO),
    synthetic(10, REPO, "You've hit your org's monthly spend limit · your session limit resets 2:10am"),
    metaResume(14410, REPO, 'Continue from where you left off.'), // 4 hours later
    say(14415, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.idle, 14405000,
    'the synthetic limit notice is a turn end, consecutive with the real turn end before it; the plain-text resumption note is not a typed prompt, so the whole limit-reset gap — measured from the block\'s earliest entry — is idle');
  assert.equal(p.segments[0].times.human, 0);
}

// --- an interrupt, then a synthetic "No response requested." entry, then a typed retry: both are turn
// ends and collapse into one block, so the whole gap is human wait, measured from the interrupt, not
// merely from the synthetic entry closest to the retry ---------------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO),
    use(10, REPO, 'b1', 'Bash', { command: 'sleep 999' }),
    interrupt(15, REPO),
    synthetic(42735, REPO, 'No response requested.'), // 11h52m after the interrupt
    user(42740, REPO, 'retry'),
    say(42745, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.human, 42725000,
    'the interrupt and the synthetic entry are both turn ends and collapse into one block; the typed retry closes the whole gap as human wait, from the interrupt');
  assert.equal(p.segments[0].times.idle, 0);
}

// --- a task-notification wake ending an otherwise uncovered gap gives idle, the way a peer message
// does — anything that is not a typed prompt is idle --
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    say(5, REPO), // the turn ends idle, nothing running
    {
      type: 'attachment', timestamp: ts(65), cwd: REPO,
      attachment: {
        type: 'queued_command', commandMode: 'task-notification',
        prompt: '<task-notification>\n<task-id>ag9</task-id>\n<tool-use-id>zzz</tool-use-id>\n<status>completed</status>\n<usage><subagent_tokens>10</subagent_tokens><tool_uses>1</tool_uses><duration_ms>1000</duration_ms></usage>\n</task-notification>',
        usage: { totalTokens: 10, toolUses: 1, durationMs: 1000 },
      },
    }, // no matching dispatch — nothing else is running, so this wake covers no subagent interval
    say(70, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.segments[0].times.idle, 60000, 'the task-notification wake ends the uncovered gap as idle, not human wait');
  assert.equal(p.segments[0].times.human, 0);
}

// --- an async dispatch whose notification never arrived is not yet notified, never zero (INV-0101),
// and is not reported as a format problem -------------------------------------------------------
{
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
    result(6, REPO, 'a1', { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'ag1' } }),
    say(10, REPO),
  ], agents: { x1: {
    meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' },
    entries: [user(7, SLICE, 'go'), say(9, SLICE)],
  } } } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.dispatches.map((d) => [d.duration, d.pending]), [[null, true]], 'no notification means no duration, never zero, but marked pending — still running, not a format problem');
  assert.deepEqual(p.unrecognized, [], 'a dispatch still awaiting its notification is not reported unrecognized');
  assert.match(render(p), /not yet notified/, 'the report names it as not yet notified');
}

// --- a failed or killed background dispatch's notification carries a status and no usage — it is
// reported by that status, never as "not yet notified" and never as a zero duration (INV-0101) ------
{
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
    result(6, REPO, 'a1', { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'ag1' } }),
    user(30, REPO, '<task-notification>\n<task-id>ag1</task-id>\n<tool-use-id>a1</tool-use-id>\n<status>failed</status>\n<summary>Agent failed: an API error</summary>\n</task-notification>'),
    say(35, REPO),
  ], agents: { x1: {
    meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' },
    entries: [user(7, SLICE, 'go'), say(9, SLICE)],
  } } } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.dispatches.map((d) => [d.duration, d.pending, d.status]), [[null, false, 'failed']],
    'a failed notification carries no duration or usage, but is recorded by its status, not marked pending');
  assert.deepEqual(p.unrecognized, [], 'a failed notification is a real result, not a format problem');
  assert.match(render(p), /: failed,/, 'the report shows the failed status in place of a duration');
}

// --- a killed background dispatch's notification is reported by that status too, the same way a
// failed one is -------------------------------------------------------------------
{
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
    result(6, REPO, 'a1', { toolUseResult: { isAsync: true, status: 'async_launched', agentId: 'ag1' } }),
    user(30, REPO, '<task-notification>\n<task-id>ag1</task-id>\n<tool-use-id>a1</tool-use-id>\n<status>killed</status>\n<summary>Agent killed: exceeded its turn budget</summary>\n</task-notification>'),
    say(35, REPO),
  ], agents: { x1: {
    meta: { agentType: 'superdev:implementer', description: 'Implement slice 01', toolUseId: 'a1' },
    entries: [user(7, SLICE, 'go'), say(9, SLICE)],
  } } } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.dispatches.map((d) => [d.duration, d.pending, d.status]), [[null, false, 'killed']],
    'a killed notification carries no duration or usage, but is recorded by its status, not marked pending');
  assert.deepEqual(p.unrecognized, [], 'a killed notification is a real result, not a format problem');
  assert.match(render(p), /: killed,/, 'the report shows the killed status in place of a duration');
}

// --- a dispatch rejected at the permission prompt reports as rejected, the way failed and killed
// are reported: no duration, not zero, and not unrecognized --------------------------
{
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Implement slice 01' }),
    result(6, REPO, 'a1', { toolUseResult: 'User rejected tool use' }),
    say(10, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.dispatches.map((d) => [d.duration, d.pending, d.status]), [[null, false, 'rejected']],
    'a rejected dispatch carries no duration and no usage, but is recorded by its own status, never zero');
  assert.deepEqual(p.unrecognized, [], 'a rejected dispatch is a real result, not a format problem');
  assert.match(render(p), /: rejected,/, 'the report shows the rejected status in place of a duration');
  assert.equal(p.segments[0].times.human, 1000,
    "a rejected dispatch's window (tool_use to the rejection) is the operator deciding at the permission prompt, so it counts as human wait");
  assert.equal(p.segments[0].times.subagent, 0, 'and none of it is subagent time');
}

// --- a dispatch denied by the auto-mode classifier, or blocked by a PreToolUse:Agent hook, reports by
// that status too — no duration, not zero, not unrecognized — and its window stays machine time, since
// it is the classifier or a hook deciding, not the operator (, item 3) --------------------
{
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Review slice 01' }),
    result(6, REPO, 'a1', { toolUseResult: 'Error: Permission for this action was denied by the Claude Code auto mode classifier. Reason: Blocked by classifier.' }),
    use(8, REPO, 'a2', 'Agent', { description: 'Review slice 02' }),
    result(9, REPO, 'a2', { toolUseResult: 'Error: PreToolUse:Agent hook error: [node "model-explicit.js"]: superdev: dispatch to "superdev:final-reviewer" must set an explicit model.' }),
    say(15, REPO),
  ] } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.dispatches.map((d) => [d.duration, d.pending, d.status]), [[null, false, 'denied'], [null, false, 'blocked']],
    'a classifier denial and a hook block each carry no duration or usage, but are recorded by their own status, never zero and never unrecognized');
  assert.deepEqual(p.unrecognized, []);
  assert.match(render(p), /: denied,/, 'the report shows the denied status in place of a duration');
  assert.match(render(p), /: blocked,/, 'the report shows the blocked status in place of a duration');
  assert.equal(p.segments[0].times.subagent, 2000,
    'a denied or blocked dispatch is the classifier or a hook, not the operator, so its window stays machine time');
  assert.equal(p.segments[0].times.human, 0);
}

// --- a genuinely malformed synchronous result (no isAsync marker) is still a format problem -----
{
  const SLICE = path.join(REPO, '.superdev', 'scopes', 'alpha', 'slicetrees', '01');
  const dir = path.join(tmp(), 'projects');
  writeTree(dir, { [enc(REPO)]: { s: { entries: [
    cmd(0, REPO, 'implement', 'feat/alpha'),
    use(5, REPO, 'a1', 'Agent', { description: 'Review slice 01' }),
    result(6, REPO, 'a1', { toolUseResult: { totalToolUseCount: 2 } }),
    say(10, REPO),
  ], agents: { x1: {
    meta: { agentType: 'superdev:slice-reviewer', description: 'Review slice 01', toolUseId: 'a1' },
    entries: [user(6, SLICE, 'go'), say(9, SLICE)],
  } } } } });
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.deepEqual(p.dispatches.map((d) => [d.duration, d.pending]), [[null, false]], 'a returned, non-async result missing totalDurationMs is not pending');
  assert.ok(p.unrecognized.some((u) => /totalDurationMs/.test(u.reason)), 'so it is still reported unrecognized');
}

// --- unrecognized entries (INV-0101) -------------------------------------------------------------
{
  const dir = path.join(tmp(), 'projects');
  const tree = alphaTree(REPO);
  tree[enc(REPO)].s1.entries.push({ type: 'assistant', cwd: REPO, message: { role: 'assistant', content: [] } }, '{not json');
  writeTree(dir, tree);
  const p = profile({ projectsDir: dir, repoRoot: REPO, slug: 'alpha' });
  assert.equal(p.unrecognized.length, 2, 'an entry with no timestamp and a line that is no JSON are both reported');
  assert.equal(p.segments[0].times.wall, 170000, 'and neither is counted');

  const bad = path.join(tmp(), 'projects');
  writeTree(bad, { [enc(REPO)]: { s: { entries: [{ type: 'user', message: { content: '<command-name>/superdev:review</command-name>' } }] } } });
  assert.throws(() => profile({ projectsDir: bad, repoRoot: REPO, slug: 'alpha' }), /format not recognized/);
}

// --- the CLI: config dir, exit codes, and a read-only run ----------------------------------------
{
  const repo = tmp();
  const init = spawnSync('git', ['init', '-q', repo], { encoding: 'utf8', timeout: 30000 });
  assertSpawnDecided(init, 'git init');
  const home = tmp();
  const cfg = tmp();
  writeTree(path.join(cfg, 'projects'), alphaTree(repo));
  writeTree(path.join(home, '.claude', 'projects'), alphaTree(repo));

  const run = (args, env) => {
    const r = spawnSync(process.execPath, [SCRIPT, ...args], {
      cwd: repo, encoding: 'utf8', timeout: 30000, env: { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: '', ...env },
    });
    assertSpawnDecided(r, `profile ${args.join(' ')}`);
    return r;
  };

  const before = snapshot(cfg);
  const viaCfg = run(['alpha'], { CLAUDE_CONFIG_DIR: cfg });
  assert.equal(viaCfg.status, 0, viaCfg.stderr);
  assert.match(viaCfg.stdout, /Run profile — alpha/);
  assert.match(viaCfg.stdout, new RegExp(path.join(cfg, 'projects').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'reads $CLAUDE_CONFIG_DIR/projects when set');
  assert.match(viaCfg.stdout, /implement/);
  assert.match(viaCfg.stdout, /tool times include approval waits/);
  assert.match(viaCfg.stdout, /unfinished/i);
  assert.deepEqual(snapshot(cfg), before, 'the transcript directory is byte-identical after a run');

  const viaHome = run([], {});
  assert.equal(viaHome.status, 0, viaHome.stderr);
  assert.match(viaHome.stdout, /Run profile — alpha/, 'no slug profiles the most recent scope and names it');
  assert.match(viaHome.stdout, new RegExp(path.join(home, '.claude', 'projects').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'reads ~/.claude/projects when unset');

  const noScope = run(['gamma'], { CLAUDE_CONFIG_DIR: cfg });
  assert.notEqual(noScope.status, 0);
  assert.match(noScope.stderr, /gamma/);
  assert.match(noScope.stderr, new RegExp(enc(repo)));
  assert.equal(noScope.stdout, '', 'no table');

  const empty = tmp();
  const noDir = run(['alpha'], { CLAUDE_CONFIG_DIR: empty });
  assert.notEqual(noDir.status, 0);
  assert.match(noDir.stderr, /alpha/);
  assert.match(noDir.stderr, new RegExp(path.join(empty, 'projects').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(noDir.stdout, '');
}

console.log('profile.test.js ok');
