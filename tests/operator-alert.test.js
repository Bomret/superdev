'use strict';

// Suite for plugin/hooks/operator-alert.js (ADR 0272, INV-0200). The hook makes the model send the operator alert at a
// blocking stop of an attended superdev session: it denies an AskUserQuestion call, or blocks a Stop whose Next block
// carries a `Blocked:` or `First:` line, once per wait on the operator. Each case spawns the hook with real hook input on
// stdin and a fixture JSONL transcript in a temporary directory this suite created; a stop is exit 2 with the reason on
// stderr, a pass is exit 0 with no output.

const assert = require('node:assert');
const cp = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { assertSpawnDecided } = require('./spawn-verdict');

const hookPath = require.resolve('../plugin/hooks/operator-alert.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'operator-alert-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));

let n = 0;
function transcript(entries) {
  const file = path.join(tmp, `t${n++}.jsonl`);
  fs.writeFileSync(file, entries.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join('\n') + '\n');
  return file;
}

function run(input, label) {
  const r = cp.spawnSync(process.execPath, [hookPath], { input: JSON.stringify(input), encoding: 'utf8', timeout: 60000 });
  assertSpawnDecided(r, label);
  return r;
}

// Transcript entries in the shapes Claude Code writes (docs/known-issues.md records them).
let id = 0;
const prompt = (text) => ({ type: 'user', isSidechain: false, message: { role: 'user', content: text } });
const meta = (text) => ({ type: 'user', isMeta: true, message: { role: 'user', content: text } });
const toolUse = (name, input) => {
  const tid = `toolu_${id++}`;
  return { tid, entry: { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: tid, name, input }] } } };
};
const result = (tid, text, isError) => ({
  type: 'user',
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: text, ...(isError ? { is_error: true } : {}) }] },
});
const skill = (name, args) => toolUse('Skill', args === undefined ? { skill: name } : { skill: name, args }).entry;
const typed = (name, args) =>
  prompt(`<command-message>${name.slice(1)}</command-message>\n<command-name>${name}</command-name>` +
    (args ? `\n<command-args>${args}</command-args>` : ''));
const push = () => toolUse('PushNotification', { message: 'superdev review x: criterion question waits on you' }).entry;
const text = (t) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: t }] } });

const ask = (file, extra) => ({
  hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion', session_id: 's', cwd: tmp,
  tool_input: { questions: [{ question: 'Fix it?', header: 'Criterion', multiSelect: false, options: [] }] },
  ...(file === undefined ? {} : { transcript_path: file }), ...extra,
});

function denied(r, label) {
  assert.strictEqual(r.status, 2, `${label}: expected a deny, got exit ${r.status} (${r.stderr})`);
  assert.match(r.stderr, /superdev: operator alert/, `${label}: the deny names the alert`);
  assert.match(r.stderr, /PushNotification/, `${label}: the deny names the tool`);
}
function passed(r, label) {
  assert.strictEqual(r.status, 0, `${label}: expected a pass, got exit ${r.status} (${r.stderr})`);
  assert.strictEqual(r.stdout, '', `${label}: a pass writes nothing`);
  assert.strictEqual(r.stderr, '', `${label}: a pass writes nothing`);
}

// ---- AskUserQuestion ----

{
  const f = transcript([prompt('review the scope'), skill('superdev:review', 'feat/x'), text('Asking.')]);
  const r = run(ask(f), 'first ask');
  denied(r, 'first ask in an attended superdev wait');
  assert.match(r.stderr, /no secret/, 'the deny tells the model to put no secret in the alert');
  assert.match(r.stderr, /same question/, 'the deny asks for the same question again');
  assert.match(r.stderr, /no option/, 'the deny tells the model to choose no option itself');
  assert.match(r.stderr, /ToolSearch/, 'the deny says how to load the deferred tool');
}
{
  const f = transcript([typed('/superdev:review', 'feat/x'), meta('Base directory for this skill: …'), text('Asking.')]);
  denied(run(ask(f), 'typed'), 'a typed superdev command starts an attended session');
}
{
  const q = toolUse('AskUserQuestion', {});
  const f = transcript([prompt('go'), skill('superdev:review', 'feat/x'), q.entry,
    result(q.tid, 'PreToolUse:AskUserQuestion hook error: [node "/x/hooks/operator-alert.js"]: superdev: operator alert — …', true)]);
  passed(run(ask(f), 're-ask after deny'), 'a re-ask after the denial passes, PushNotification or not');
}
{
  const f = transcript([prompt('go'), skill('superdev:review', 'feat/x'), push()]);
  passed(run(ask(f), 'after push'), 'an ask after a PushNotification call in the wait passes');
}
{
  const q = toolUse('AskUserQuestion', {});
  const f = transcript([prompt('go'), skill('superdev:review', 'feat/x'), push(), q.entry,
    result(q.tid, 'User has answered your questions: "Fix it?"="Fix"'), text('Fixing for 40 minutes.')]);
  denied(run(ask(f), 'after answer'), 'a question after an answered one starts a new wait');
}
{
  const f = transcript([prompt('go'), skill('superdev:review', 'feat/x'), push(), prompt('and the next one?')]);
  denied(run(ask(f), 'new prompt'), 'a new typed prompt starts a new wait');
}
{
  const f = transcript([prompt('go'), skill('superdev:review', 'feat/x'), push(),
    prompt('why did it say "superdev: operator alert — this question waits on the operator"?')]);
  denied(run(ask(f), 'quoted reason'), 'a typed prompt quoting the reason starts a new wait like any prompt');
}
{
  const b = toolUse('Bash', { command: 'grep -rn "superdev: operator alert" tests && false' });
  const c = toolUse('Bash', { command: 'grep -n "hook error" tests/operator-alert.test.js && false' });
  const f = transcript([prompt('go'), skill('superdev:review', 'feat/x'), b.entry,
    result(b.tid, 'Exit code 1\ntests/x.js:3: superdev: operator alert — …', true), c.entry,
    result(c.tid, 'PreToolUse:AskUserQuestion hook error: [node "/x/hooks/operator-alert.js"]: superdev: operator alert — …', true)]);
  denied(run(ask(f), 'bash error'), 'a failing tool call whose output carries the marker releases no wait');
}
{
  const f = transcript([prompt('go'), skill('superdev:review', 'feat/x'), push(),
    prompt('<task-notification>\n<task-id>a1</task-id>\n</task-notification>'),
    prompt('<system-reminder>x</system-reminder>'), prompt('<local-command-stdout>x</local-command-stdout>'),
    { type: 'user', isCompactSummary: true, message: { role: 'user', content: 'This session is being continued…' } },
    meta('Another Claude session sent a message')]);
  passed(run(ask(f), 'not input'), 'notifications, reminders, command output, a compact summary, and meta entries are no operator input');
}
{
  const f = transcript([prompt('go'), skill('superdev:review', 'feat/x --unattended')]);
  passed(run(ask(f), 'unattended'), 'an unattended newest start passes');
}
{
  const f = transcript([typed('/superdev:implement', 'feat/x --unattended')]);
  passed(run(ask(f), 'typed unattended'), 'a typed unattended start passes');
}
{
  const f = transcript([prompt('go'), skill('superdev:plan', 'x'), skill('superdev:implement', 'feat/x --unattended')]);
  passed(run(ask(f), 'newest unattended'), 'the newest start decides: unattended after attended passes');
}
{
  const f = transcript([prompt('go'), skill('superdev:implement', 'feat/x --unattended'), prompt('now'), skill('superdev:status')]);
  denied(run(ask(f), 'newest attended'), 'the newest start decides: attended after unattended denies');
}
{
  const f = transcript([prompt('what does /superdev:review do? <command-name>/superdev:review</command-name>'),
    text('It reviews. Run /superdev:review feat/x.'), skill('other:thing')]);
  passed(run(ask(f), 'mention'), 'a mention of a superdev command is no start');
}
{
  const f = transcript([prompt('go'), skill('superdev:review', 'feat/x')]);
  passed(run(ask(f, { agent_id: 'a1', agent_type: 'superdev:implementer' }), 'subagent'), 'a subagent call passes');
}
{
  passed(run(ask(undefined), 'no transcript field'), 'input without transcript_path passes');
  passed(run(ask(path.join(tmp, 'absent.jsonl')), 'missing'), 'a missing transcript passes');
  passed(run(ask(tmp), 'directory'), 'an unreadable transcript passes');
  const f = transcript([prompt('go'), skill('superdev:review', 'feat/x'), '{"type":"assistant","message":{"con']);
  denied(run(ask(f), 'partial'), 'a partly written last line is skipped and the rest still decides');
  const r = cp.spawnSync(process.execPath, [hookPath], { input: 'not json', encoding: 'utf8', timeout: 60000 });
  assertSpawnDecided(r, 'malformed');
  passed(r, 'malformed stdin passes');
}

// ---- Stop ----

const stop = (file, message, extra) => ({
  hook_event_name: 'Stop', session_id: 's', cwd: tmp, stop_hook_active: false, last_assistant_message: message,
  ...(file === undefined ? {} : { transcript_path: file }), ...extra,
});
const FENCE = '```';
const blocked = `Review stopped.\n\n### Next\n\nBlocked: the full suite is red\n\n${FENCE}\n/superdev:review feat/x\n${FENCE}\nResumes the review.`;
const first = `Done.\r\n\r\n### Next\r\nFirst: approve the deploy in the console\r\n${FENCE}\r\n/superdev:verify-ship feat/x\r\n${FENCE}\r\n`;
const plain = `Done.\n\n### Next\n\n${FENCE}\n/superdev:document feat/x\n${FENCE}\nReconciles the docs.\nOr: /superdev:status`;
const inFence = `Done.\n\n### Next\n\n${FENCE}\nBlocked: not a variant line\n${FENCE}\nx`;
const earlier = `### Next\nBlocked: an older block\n${FENCE}\nx\n${FENCE}\n\nLater.\n\n### Next\n\n${FENCE}\n/superdev:document feat/x\n${FENCE}`;
const beforeHeading = `Blocked: prose before the block\n\n### Next\n\n${FENCE}\n/superdev:document feat/x\n${FENCE}`;
const noFence = `Closed.\n\n### Next\n\nFirst: merge the pull request yourself\nNothing else.`;
const noNext = 'Blocked: but this message has no Next block.';
const attended = () => transcript([prompt('go'), skill('superdev:review', 'feat/x'), text('…')]);

{
  const f = attended();
  const r = run(stop(f, blocked), 'blocked');
  denied(r, 'a Blocked: Next block in an attended wait blocks the stop');
  assert.match(r.stderr, /no secret/, 'the block tells the model to put no secret in the alert');
  assert.match(r.stderr, /no further text/, 'the block tells the model to add no text after the Next block');
  denied(run(stop(f, first), 'first'), 'a First: Next block with CRLF line ends blocks the stop');
  denied(run(stop(f, noFence), 'no fence'), 'a First: line in a Next block with no fence blocks the stop');
  passed(run(stop(f, blocked, { stop_hook_active: true }), 'active'), 'the re-entry under stop_hook_active passes');
  passed(run(stop(f, blocked, { stop_hook_active: undefined }), 'no active field'), 'input lacking stop_hook_active passes');
  passed(run(stop(f, plain), 'plain'), 'a plain hand-off with an Or: line passes');
  passed(run(stop(f, inFence), 'in fence'), 'a Blocked: line inside the fence passes');
  passed(run(stop(f, earlier), 'earlier'), 'only the last Next block counts');
  passed(run(stop(f, beforeHeading), 'before heading'), 'a Blocked: line before the heading passes');
  passed(run(stop(f, noNext), 'no next'), 'a message with no Next block passes');
  passed(run(stop(f, undefined), 'no message'), 'input lacking last_assistant_message passes');
  passed(run(stop(f, blocked, { agent_id: 'a1' }), 'subagent stop'), 'a subagent stop passes');
}
{
  passed(run(stop(transcript([prompt('go'), skill('superdev:review', 'feat/x'), push()]), blocked), 'pushed'),
    'a stop after a PushNotification call in the wait passes');
  passed(run(stop(transcript([prompt('go'), skill('superdev:review', 'feat/x --unattended')]), blocked), 'unattended stop'),
    'an unattended run\'s blocked stop passes');
  passed(run(stop(transcript([prompt('go')]), blocked), 'no superdev'), 'a session that started no superdev command passes');
  passed(run(stop(path.join(tmp, 'absent.jsonl'), blocked), 'missing stop transcript'), 'a missing transcript passes');
}

// ---- Registration ----

{
  // The plugin's own hooks.json runs the hook on every AskUserQuestion call and every turn end, through the command it
  // registers, with CLAUDE_PLUGIN_ROOT set the way Claude Code sets it.
  const pluginRoot = path.dirname(path.dirname(hookPath));
  const hooks = require(path.join(pluginRoot, 'hooks', 'hooks.json')).hooks;
  const ours = (groups, tool) => groups
    .filter((g) => (tool === undefined ? !g.matcher : new RegExp(`^(?:${g.matcher})$`).test(tool)))
    .flatMap((g) => g.hooks.map((h) => h.command))
    .filter((c) => c.includes('/hooks/operator-alert.js'));
  const viaRegistration = (command, input, label) => {
    const r = cp.spawnSync('sh', ['-c', command], {
      input: JSON.stringify(input), encoding: 'utf8', timeout: 60000, env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
    });
    assertSpawnDecided(r, label);
    return r;
  };
  const askCommands = ours(hooks.PreToolUse, 'AskUserQuestion');
  assert.strictEqual(askCommands.length, 1, 'PreToolUse registers the hook once for AskUserQuestion');
  assert.strictEqual(ours(hooks.PreToolUse, 'Bash').length, 0, 'the hook is registered for no other tool');
  const stopCommands = ours(hooks.Stop);
  assert.strictEqual(stopCommands.length, 1, 'Stop registers the hook once');
  denied(viaRegistration(askCommands[0], ask(attended()), 'registered ask'), 'the registered command denies the first ask');
  denied(viaRegistration(stopCommands[0], stop(attended(), blocked), 'registered stop'), 'the registered command blocks the stop');
}

// ---- Stdin bound ----

// Spawned before the synchronous read-cost measurements so its 5 s bound overlaps them. Its assertions run at the end.
const held = new Promise((resolve, reject) => {
  // Stdin that never closes passes at the hook's 5 s bound: exit 0, no output. The suite asserts the outcome only.
  const child = cp.spawn(process.execPath, [hookPath], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 });
  let out = '';
  let err = '';
  child.stdout.on('data', (c) => (out += c));
  child.stderr.on('data', (c) => (err += c));
  child.stdin.write(JSON.stringify(ask(attended())).slice(0, 20));
  child.on('error', reject);
  child.on('close', (status, signal) => {
    try {
      assert.strictEqual(signal, null, 'stdin held open: the hook ended by its own bound, not the suite\'s kill');
      passed({ status, stdout: out, stderr: err }, 'stdin held open');
      resolve();
    } catch (e) {
      reject(e);
    }
  });
});

// ---- Read cost ----

{
  // The decision's cost grows linearly with the transcript. timePair (tests/linear-time.js) reads the CPU time of its own
  // thread, and the hook runs in a child process, so its reading would hold only the spawn. The pin reads the child's own
  // main-thread CPU time instead, through a `-r` preload this suite writes, and keeps timePair's rules: a same-run
  // baseline (a near-empty transcript's startup cost, subtracted), best of three samples, a ratio-4 input pair against a
  // ceiling of 10 between linear (4) and quadratic (16) growth, and up to three attempts so a load spike decides nothing.
  const preload = path.join(tmp, 'thread-cpu.js');
  fs.writeFileSync(preload,
    "process.on('exit', () => { const u = process.threadCpuUsage(); require('fs').writeSync(1, String(u.user + u.system)); });\n");
  const block = [text('x'.repeat(200)), (() => {
    const b = toolUse('Bash', { command: 'ls' });
    return [b.entry, result(b.tid, 'y'.repeat(500))];
  })()].flat().map((e) => JSON.stringify(e)).join('\n') + '\n';
  const head = [prompt('go'), skill('superdev:review', 'feat/x')].map((e) => JSON.stringify(e)).join('\n') + '\n';
  const sized = (k) => {
    const file = path.join(tmp, `cost${k}.jsonl`);
    fs.writeFileSync(file, head + block.repeat(k));
    return file;
  };
  const files = { base: sized(1), small: sized(8000), big: sized(32000) };
  const cpuUs = (file) => {
    const r = cp.spawnSync(process.execPath, ['-r', preload, hookPath], { input: JSON.stringify(ask(file)), encoding: 'utf8', timeout: 60000 });
    assertSpawnDecided(r, 'read cost');
    denied(r, 'read cost: the sized transcript decides the full path');
    return Number(r.stdout);
  };
  const best = (file) => Math.min(cpuUs(file), cpuUs(file), cpuUs(file));
  const CEILING = 10;
  let small;
  let big;
  for (let attempt = 0; attempt < 3; attempt++) {
    const base = best(files.base);
    small = best(files.small) - base;
    big = best(files.big) - base;
    if (big < small * CEILING) break;
  }
  assert.ok(small > 0, `read cost: the small transcript costs more than startup (${small} us)`);
  assert.ok(big < small * CEILING, `read cost must grow linearly: 8000 blocks took ${small} us, 32000 took ${big} us`);
}

held.then(() => console.log('operator-alert: ok'), (e) => {
  console.error(e);
  process.exitCode = 1;
});
