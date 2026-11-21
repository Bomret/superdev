#!/usr/bin/env node
'use strict';

// operator-alert: a deterministic hook that makes the model send the operator alert at a blocking stop of an attended
// superdev session (ADR 0272, INV-0200).
// No hook can raise a notification itself. The hook stops the model once per wait instead. Its reason asks the model
// to call the PushNotification tool. The tool skips the send when the operator is at the terminal. The model may
// skip the call. The hook prompts an alert and never delivers one.
// Events: PreToolUse on AskUserQuestion, which it denies. Stop, which it blocks when the last message's last Next
// block carries a `Blocked:` or `First:` line before its fence (references/response-shapes.md). Stop passes under
// `stop_hook_active`. A stop is exit 2 with the reason on stderr.
// The hook reads the session transcript (`transcript_path`, JSONL). A session is attended when its newest superdev
// start carries no `--unattended` among its arguments. That start is a Skill tool call naming `superdev:*` or a typed
// `/superdev:` command.
// A wait starts at the operator's newest input: a typed prompt, or a non-error answer to an AskUserQuestion. A
// PushNotification call since then releases the wait. So does an earlier deny of this hook.
// That deny is an error result of an AskUserQuestion call. Its text opens with
// `PreToolUse:AskUserQuestion hook error: [<command>]: ` and the marker. The marker anywhere else releases nothing,
// in another tool's output or in a typed prompt.
// These pass: a call carrying `agent_id`, a missing or unreadable transcript, malformed input, and stdin that does
// not close within 5 s.
// The Stop path decides from `last_assistant_message` before it opens the transcript.

const fs = require('fs');

const MARKER = 'superdev: operator alert';
const LOAD = 'load it with ToolSearch query "select:PushNotification" if it is not loaded yet';
const MESSAGE = 'a one-line message under 200 characters that names the superdev scope and what the stop waits on, ' +
  'with no secret, token, or file contents';

const ASK_REASON =
  `${MARKER} — this question waits on the operator, who may not be watching. First call the PushNotification tool ` +
  `once (${LOAD}), with ${MESSAGE}. Then call AskUserQuestion again with the same questions and options, and choose ` +
  'no option yourself. If PushNotification is unavailable, ask again at once.';
const STOP_REASON =
  `${MARKER} — this message stops on the operator: its Next block carries a Blocked: or First: line. Call the ` +
  `PushNotification tool once (${LOAD}), with ${MESSAGE}. Then end the turn: write no further text, make no other ` +
  'tool call, and start no command.';

// Text a user entry carries that is no operator input: harness notices and command output.
const NOT_INPUT = /^\s*<(task-notification|system-reminder|local-command-)/;
// This hook's own deny as the error result of an AskUserQuestion call: Claude Code prefixes the hook's stderr.
const DENIAL = new RegExp(`^\\s*PreToolUse:AskUserQuestion hook error: \\[[^\\n]*\\]: ${MARKER}`);

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((b) => (b && typeof b.text === 'string' ? b.text : typeof b?.content === 'string' ? b.content : '')).join('\n');
}

function args(s) {
  return String(s || '').split(/\s+/).includes('--unattended');
}

// One forward pass over the transcript: the newest superdev start and whether the current wait is already released.
function readSession(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const askIds = new Set();
  let start = null; // { unattended }
  let released = false;
  for (const line of lines) {
    if (!line) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue; // a partly written line decides nothing
    }
    if (!e || e.isSidechain || !e.message) continue;
    const content = e.message.content;
    if (e.type === 'assistant' && Array.isArray(content)) {
      for (const b of content) {
        if (!b || b.type !== 'tool_use') continue;
        if (b.name === 'AskUserQuestion') askIds.add(b.id);
        else if (b.name === 'PushNotification') released = true;
        else if (b.name === 'Skill' && b.input && typeof b.input.skill === 'string' && b.input.skill.startsWith('superdev:')) {
          start = { unattended: args(b.input.args) };
        }
      }
      continue;
    }
    if (e.type !== 'user' || e.isMeta || e.isCompactSummary) continue;
    if (Array.isArray(content) && content.some((b) => b && b.type === 'tool_result')) {
      for (const b of content) {
        if (!b || b.type !== 'tool_result') continue;
        const body = textOf(b.content);
        if (!askIds.has(b.tool_use_id)) continue;
        if (b.is_error) {
          if (DENIAL.test(body)) released = true;
        } else {
          released = false; // the operator answered: a new wait starts
        }
      }
      continue;
    }
    const t = textOf(content);
    if (NOT_INPUT.test(t)) continue;
    released = false; // a typed prompt: a new wait starts
    if (/^\s*<command-(message|name)>/.test(t)) {
      const m = /<command-name>\/(superdev:[^<\s]+)<\/command-name>/.exec(t);
      if (m) start = { unattended: args((/<command-args>([\s\S]*?)<\/command-args>/.exec(t) || [])[1]) };
    }
  }
  return { attended: !!start && !start.unattended, released };
}

// True when the message's last `### Next` block carries a `Blocked:` or `First:` line before its first fence, or
// anywhere in it when it holds no fence.
function waitsOnOperator(message) {
  const lines = String(message).split(/\r?\n/);
  let at = -1;
  for (let i = 0; i < lines.length; i++) if (/^\s{0,3}###\s+Next\s*$/.test(lines[i])) at = i;
  if (at < 0) return false;
  for (let i = at + 1; i < lines.length; i++) {
    if (/^\s{0,3}(```|~~~)/.test(lines[i])) return false;
    if (/^\s*(Blocked|First):/.test(lines[i])) return true;
  }
  return false;
}

function decide(input) {
  if (!input || typeof input !== 'object' || input.agent_id) return null;
  const event = input.hook_event_name;
  let reason;
  if (event === 'PreToolUse' && input.tool_name === 'AskUserQuestion') reason = ASK_REASON;
  else if (event === 'Stop') {
    if (input.stop_hook_active !== false || typeof input.last_assistant_message !== 'string') return null;
    if (!waitsOnOperator(input.last_assistant_message)) return null;
    reason = STOP_REASON;
  } else return null;
  if (typeof input.transcript_path !== 'string' || !input.transcript_path) return null;
  const s = readSession(input.transcript_path);
  return s.attended && !s.released ? reason : null;
}

function main() {
  // Stdin that does not close within 5 s lets the call and the stop through: exit 0. The transcript read is synchronous,
  // so the bound covers the wait for stdin only.
  setTimeout(() => process.exit(0), 5000).unref();
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let reason = null;
    try {
      reason = decide(JSON.parse(raw || '{}'));
    } catch {
      reason = null; // malformed input or an unreadable transcript: never stop
    }
    if (reason) {
      process.stderr.write(reason + '\n');
      process.exit(2);
    }
    process.exit(0);
  });
}

if (require.main === module) main();
