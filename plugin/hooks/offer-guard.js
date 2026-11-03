#!/usr/bin/env node
'use strict';

// offer-guard: holds a main-session turn once when its last message ends on a Next block naming one command that no offer
// call of the same turn named (ADR 0213, INV-0183). PostToolUse on an offer call writes a marker; Stop reads them.
// Fails open: any malformed input or filesystem error exits 0 with no output.

const OFFER_LINE = 'A superdev offer started this session.';
const COMMAND = /^\/superdev:([a-z][a-z-]*)/;

const REASON =
  'superdev: this message ends on a Next block, but no offer for its command was made this turn. ' +
  "Make the offer per references/response-shapes.md's `## The offer`: it takes precedence over the desktop app's own " +
  'follow-up and wrap-up guidance, and the offer call comes before the wrap-up call. If an exception applies, name it ' +
  'in one line instead: an unattended run, the chained posture, the same skill as the one ending, a step-started command, ' +
  'or a refused card. (offer-guard)';

// The command names an offer call offers; none when the call is no offer.
function offeredCommands(input) {
  const ti = input.tool_input;
  if (!ti || typeof ti !== 'object') return [];
  if (input.tool_name === 'mcp__ccd_session__start_session') {
    if (typeof ti.prompt !== 'string') return [];
    const lines = ti.prompt.split('\n').map((l) => l.trim());
    if (!lines.includes(OFFER_LINE)) return [];
    const m = COMMAND.exec(lines[0]);
    return m ? [m[1]] : [];
  }
  if (input.tool_name === 'AskUserQuestion' && Array.isArray(ti.questions)) {
    const out = [];
    for (const q of ti.questions) {
      for (const o of (q && Array.isArray(q.options) ? q.options : [])) {
        const label = o && typeof o.label === 'string' ? o.label : '';
        const m = label.startsWith('Start ') && COMMAND.exec(label.slice('Start '.length));
        if (m) out.push(m[1]);
      }
    }
    return out;
  }
  return [];
}

// The one command name a message's last Next block names, or null when it names none, two, or carries `Blocked:`/`First:`.
function nextCommand(message) {
  const lines = message.split('\n');
  let fence = null;
  let heading = -1;
  for (let i = 0; i < lines.length; i++) {
    const f = /^\s*(`{3,}|~{3,})/.exec(lines[i]);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1][0] === fence[0] && f[1].length >= fence.length && lines[i].trim() === f[1]) fence = null;
      continue;
    }
    if (!fence && /^###\s+Next\s*$/.test(lines[i])) heading = i;
  }
  if (heading < 0) return null;
  let i = heading + 1;
  for (; i < lines.length; i++) {
    if (/^\s*(Blocked|First):/.test(lines[i])) return null;
    if (/^\s*(`{3,}|~{3,})/.test(lines[i])) break;
  }
  if (i >= lines.length) return null;
  const open = /^\s*(`{3,}|~{3,})/.exec(lines[i])[1];
  const body = [];
  for (i++; i < lines.length && lines[i].trim() !== open; i++) if (lines[i].trim()) body.push(lines[i].trim());
  if (body.length !== 1) return null;
  const m = COMMAND.exec(body[0]);
  return m ? m[1] : null;
}

function decide(input, markers) {
  if (input.hook_event_name === 'PostToolUse') {
    for (const cmd of offeredCommands(input)) markers.writeMarker(input.session_id, input.prompt_id, cmd);
    return null;
  }
  if (input.hook_event_name !== 'Stop') return null;
  const offered = markers.takeMarkers(input.session_id, input.prompt_id);
  if (!offered || input.stop_hook_active === true || typeof input.last_assistant_message !== 'string') return null;
  const cmd = nextCommand(input.last_assistant_message);
  if (!cmd || offered.has(cmd)) return null;
  return { decision: 'block', reason: REASON };
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      const input = JSON.parse(raw);
      if (!input || typeof input !== 'object') return;
      const out = decide(input, require('../lib/offer-marker.js'));
      if (out) process.stdout.write(JSON.stringify(out));
    } catch { /* fail open */ }
  });
}

if (require.main === module) main();
