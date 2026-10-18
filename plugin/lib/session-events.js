'use strict';

// session-events.js: turns one session's entries into the intervals and point events of its run
// (human wait, idle, tool, subagent, hook, Bash, dispatch), cuts the session into phase segments, and
// measures each segment's time split (ADR 0103). Human wait and idle time never enter a machine total
// (INV-0102), and a tool call with no result carries no duration (INV-0103).

const path = require('path');
const { blocks, text } = require('./transcripts.js');

// The chain commands a run profile reports. Every other superdev command still ends a segment.
const CHAIN = new Set(['implement', 'review', 'document', 'submit-pr', 'ship']);
// A dispatch rejected at the permission prompt: its own tool_result carries this exact string in
// place of a usage object — a real result, reported by status like a failed or killed dispatch.
const REJECTED_INFO = 'User rejected tool use';
const HUMAN_TOOLS = new Set(['AskUserQuestion']);
const AGENT_TOOLS = new Set(['Agent', 'Task']);

// A superdev command invocation: a typed `/superdev:<cmd>` or a `Skill` tool call for one.
function marker(e) {
  if (e.type === 'user') {
    const m = /<command-name>\/superdev:([\w-]+)<\/command-name>/.exec(text(e));
    if (m) {
      const a = /<command-args>([\s\S]*?)<\/command-args>/.exec(text(e));
      return { command: m[1], args: a ? a[1].trim() : '' };
    }
  }
  for (const b of blocks(e)) {
    if (b.type === 'tool_use' && b.name === 'Skill' && b.input) {
      const m = /^(?:superdev:)([\w-]+)$/.exec(b.input.skill || '');
      if (m) return { command: m[1], args: String(b.input.args || '').trim() };
    }
  }
  return null;
}

// Harness-injected `user`-shape text, never something the operator typed: a task-notification (a
// background dispatch's own async result), and a local command's own stdout echoed back (e.g. `/model`).
const HARNESS_INJECTED_RE = /^<(?:task-notification|local-command-stdout)>/;
// The operator cut a turn short. Claude Code inserts this entry in the interrupted turn's place: it
// ends the turn right there, and is never itself a typed prompt.
const INTERRUPT_RE = /^\[Request interrupted by user(?: [^\]]*)?\]$/;
const isInterrupt = (e) => e.type === 'user' && !e.isMeta && INTERRUPT_RE.test(text(e).trim());
// A non-meta user entry an image block carries (the operator pasting a screenshot, with or without
// accompanying text) is a typed prompt too, even where it carries no text of its own.
const hasImage = (e) => blocks(e).some((b) => b.type === 'image');
// A compact summary — the harness's own injected recap after a context compaction — is never something
// the operator typed, whatever text it carries.
const isTypedPrompt = (e) =>
  e.type === 'user' && !e.isMeta && !isInterrupt(e) && !e.isCompactSummary &&
  !blocks(e).some((b) => b.type === 'tool_result') &&
  (text(e).trim() !== '' || hasImage(e)) && !HARNESS_INJECTED_RE.test(text(e).trim());
// A synthetic assistant entry — Claude Code's own stand-in message (a session- or spend-limit notice,
// a "No response requested." filler after a cut-off) — carries no model, only the literal marker.
const isSynthetic = (e) => e.type === 'assistant' && e.message && e.message.model === '<synthetic>';
// A Stop hook's own summary entry: when it follows the block's last real
// output, the walk-back stops there rather than continuing to that output, so the hook's own runtime —
// already counted separately as hook time — is never also folded into human wait or idle.
const isStopHookSummary = (e) => e.type === 'system' && e.subtype === 'stop_hook_summary';
const isTurnEnd = (e) =>
  e.type === 'system' || isInterrupt(e) || isSynthetic(e) ||
  (e.type === 'assistant' && !blocks(e).some((b) => b.type === 'tool_use'));
const isTaskNotification = (e) =>
  (e.type === 'attachment' && e.attachment && e.attachment.commandMode === 'task-notification') ||
  (e.type === 'user' && !e.isMeta && text(e).trim().startsWith('<task-notification>'));
// Harness filler that can sit between a turn's end and whatever closes the gap, carrying no signal of
// its own: an attachment (a hook result, a SessionStart context block on resume) — never a
// task-notification attachment, which is itself a wake — a compact summary (the harness's own injected
// recap after a context compaction), an isMeta note wrapped in a harness tag (a caveat ahead of a typed
// `/command`), or a non-meta harness-injected `user` entry that is not itself a task-notification (a
// local command's own echoed stdout).
const isIdleFiller = (e) =>
  (e.type === 'attachment' && !isTaskNotification(e)) ||
  (e.type === 'user' && !isTaskNotification(e) &&
    (e.isCompactSummary || (e.isMeta && /^</.test(text(e).trim())) ||
      (!e.isMeta && HARNESS_INJECTED_RE.test(text(e).trim()))));
// Whatever can close a gap: a `user` entry that carries no tool_result (a typed prompt, a peer-session
// message, a plain-text resumption note such as "Continue from where you left off."), or a
// task-notification attachment.
const canClose = (e) =>
  (e.type === 'user' && !blocks(e).some((b) => b.type === 'tool_result')) ||
  (e.type === 'attachment' && isTaskNotification(e));

// A task-notification's `<usage>` block, for the two shapes that carry a background dispatch's
// duration, tool count and tokens only as text (an attachment's own `prompt`, or a `user` entry's
// string content) rather than a structured `attachment.usage` field.
const USAGE_TEXT_RE = /<usage><subagent_tokens>(\d+)<\/subagent_tokens><tool_uses>(\d+)<\/tool_uses><duration_ms>(\d+)<\/duration_ms><\/usage>/;
// A failed or killed dispatch's own notification carries `<status>` and no `<usage>` block at all —
// still a real result, never "not yet notified" and never a zero duration (INV-0101).
function noteFromText(txt) {
  const id = /<tool-use-id>([^<]+)<\/tool-use-id>/.exec(txt);
  if (!id) return null;
  const status = /<status>([^<]+)<\/status>/.exec(txt);
  const u = USAGE_TEXT_RE.exec(txt);
  return {
    id: id[1],
    status: status ? status[1] : null,
    tokens: u ? Number(u[1]) : null,
    toolUses: u ? Number(u[2]) : null,
    durationMs: u ? Number(u[3]) : null,
  };
}

// The time of the first task-notification naming each tool-use id: a background Bash call's completion
// (ADR 0143). A later notification for the same call changes nothing.
function firstNotes(entries) {
  const at = new Map();
  for (const e of entries) {
    if (!isTaskNotification(e)) continue;
    const note = noteFromText(e.type === 'attachment' ? e.attachment.prompt || '' : text(e));
    if (note && !at.has(note.id)) at.set(note.id, e.t);
  }
  return at;
}

// --- interval arithmetic ------------------------------------------------------------------------
function measure(intervals) {
  const xs = intervals.filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  let total = 0;
  let cur = null;
  for (const [a, b] of xs) {
    if (!cur || a > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [a, b];
    } else cur[1] = Math.max(cur[1], b);
  }
  return cur ? total + cur[1] - cur[0] : total;
}
const clip = (intervals, start, end) =>
  intervals.map(([a, b]) => [Math.max(a, start), Math.min(b, end)]).filter(([a, b]) => b > a);

// Every interval and point event of one session, before it is split into segments.
function sessionEvents(s) {
  const uses = new Map();
  const results = new Map();
  const human = [];
  const idle = [];
  const hooks = []; // { t, name, ms, tool } — the wait a hook cost the session; parallel Stop hooks
  // collapse to their slowest member here, since the session waited for that one, not their sum.
  const hookBreakdown = []; // { t, name, ms } — every hook's own duration, for the per-name view;
  // several Stop hooks in one summary each keep their own entry, so this can sum to more than `hooks`.
  const notifications = new Map(); // toolUseId → { tokens, toolUses, durationMs } (an async dispatch's own result carries none of these, ADR 0103)
  s.entries.forEach((e, i) => {
    for (const b of blocks(e)) {
      if (b.type === 'tool_use') uses.set(b.id, { t: e.t, name: b.name, input: b.input || {} });
      if (b.type === 'tool_result') results.set(b.tool_use_id, { t: e.t, info: e.toolUseResult });
    }
    // Consecutive turn ends, with any filler between them, form one block; the gap this entry (if it
    // can close one) ends runs from the block's last real, non-synthetic assistant entry — the model's
    // own last real output — rather than an earlier turn end (a thinking block, a synthetic notice) that
    // carries no model output of its own. Machine work also stops at an interrupt entry, so
    // the walk-back stops there too, never crediting the model's own generation time up to the interrupt
    // to human wait; it likewise stops at a Stop hook summary that follows the
    // last real output, so that hook's own runtime is counted once, as hook time, never also folded into
    // this gap. A block with no real assistant entry still starts at its earliest
    // turn end. A typed prompt makes the gap human wait; anything else that closes it is idle.
    if (canClose(e) && !isTurnEnd(e) && !isIdleFiller(e)) {
      let j = i - 1;
      let start = null;
      while (j >= 0 && (isTurnEnd(s.entries[j]) || isIdleFiller(s.entries[j]))) {
        if (isTurnEnd(s.entries[j])) start = j;
        if (isInterrupt(s.entries[j]) || isStopHookSummary(s.entries[j]) ||
          (s.entries[j].type === 'assistant' && !isSynthetic(s.entries[j]))) break;
        j -= 1;
      }
      if (start !== null) {
        const gap = [s.entries[start].t, e.t];
        if (isTypedPrompt(e)) human.push(gap);
        else idle.push(gap);
      }
    }
    const a = e.attachment;
    if (e.type === 'attachment' && a && a.type === 'hook_success' && typeof a.durationMs === 'number') {
      const name = a.hookName || a.hookEvent || 'hook';
      hooks.push({ t: e.t, name, ms: a.durationMs, tool: /ToolUse/.test(a.hookEvent || '') });
      hookBreakdown.push({ t: e.t, name, ms: a.durationMs });
    }
    // Stop hooks run in parallel, so the session only waited for the slowest one — that is what
    // `hooks` carries — while the breakdown keeps every hook's own duration, to show which one is slow.
    if (e.type === 'system' && e.subtype === 'stop_hook_summary' && Array.isArray(e.hookInfos)) {
      let slowest = -1;
      for (const h of e.hookInfos) {
        if (typeof h.durationMs !== 'number') continue;
        hookBreakdown.push({ t: e.t, name: 'Stop', ms: h.durationMs });
        if (h.durationMs > slowest) slowest = h.durationMs;
      }
      if (slowest >= 0) hooks.push({ t: e.t, name: 'Stop', ms: slowest, tool: false });
    }
    if (e.type === 'attachment' && a && a.commandMode === 'task-notification') {
      const note = noteFromText(a.prompt || '');
      if (note) {
        notifications.set(note.id, a.usage
          ? { status: note.status, tokens: a.usage.totalTokens, toolUses: a.usage.toolUses, durationMs: a.usage.durationMs }
          : note);
      }
    } else if (e.type === 'user') {
      const t = text(e).trim();
      if (t.startsWith('<task-notification>')) {
        const note = noteFromText(t);
        if (note) notifications.set(note.id, note);
      }
    }
  });

  const noteAt = firstNotes(s.entries);
  const tool = [];
  const background = []; // a background Bash call, launch to completion: tool time that wins over idle
  const subagent = [];
  const unfinished = [];
  const bash = []; // { t, start, bg, command, ms } — t is the dispatch time for a subagent's own call
  const dispatches = []; // { t, id, start, end, meta, info }
  for (const [id, u] of uses) {
    const r = results.get(id);
    // A background call's own result returns at launch; its completion notification ends it.
    const bg = u.name === 'Bash' && u.input.run_in_background === true;
    const end = bg ? noteAt.get(id) : r && r.t;
    if (end === undefined) {
      unfinished.push({ t: u.t, tool: u.name });
      continue;
    }
    if (HUMAN_TOOLS.has(u.name)) human.push([u.t, end]);
    else if (AGENT_TOOLS.has(u.name)) {
      // A dispatch rejected at the permission prompt is the operator deciding, not the machine working
      // ; a denied or blocked one is the classifier or a hook, so it stays machine time.
      if (r.info === REJECTED_INFO) human.push([u.t, end]);
      else subagent.push([u.t, end]);
      const a = s.agents.get(id);
      const span = a && a.entries.length ? a.entries.map((e) => e.t) : [u.t, end];
      dispatches.push({ t: u.t, id, start: Math.min(...span), end: Math.max(...span), meta: (a && a.meta) || {}, info: r.info, file: s.file });
    } else if (bg) background.push([u.t, end]);
    else tool.push([u.t, end]);
    if (u.name === 'Bash') bash.push({ t: u.t, start: u.t, bg, command: String(u.input.command || '').trim(), ms: end - u.t });
  }
  for (const [id, a] of s.agents) {
    const dispatched = uses.has(id) ? uses.get(id).t : null;
    const au = new Map();
    for (const e of a.entries) {
      for (const b of blocks(e)) {
        if (b.type === 'tool_use' && b.name === 'Bash') {
          au.set(b.id, { t: e.t, command: String((b.input || {}).command || '').trim(), bg: (b.input || {}).run_in_background === true });
        }
        if (b.type === 'tool_result' && au.has(b.tool_use_id) && !au.get(b.tool_use_id).bg) {
          const u = au.get(b.tool_use_id);
          bash.push({ t: dispatched === null ? u.t : dispatched, start: u.t, bg: false, command: u.command, ms: e.t - u.t });
        }
      }
    }
    const notes = firstNotes(a.entries);
    for (const [bid, u] of au) {
      if (!u.bg) continue;
      const t = dispatched === null ? u.t : dispatched;
      if (notes.has(bid)) bash.push({ t, start: u.t, bg: true, command: u.command, ms: notes.get(bid) - u.t });
      else unfinished.push({ t, tool: 'Bash' });
    }
  }
  // A subagent's own transcript span covers a background dispatch whose call returned at once.
  const cwds = []; // { t, cwd } — the session's and its subagents', for attribution
  const modes = []; // { t, mode } — the permission mode a user entry records
  for (const e of s.entries) {
    if (e.cwd) cwds.push({ t: e.t, cwd: e.cwd });
    if (e.type === 'user' && e.permissionMode) modes.push({ t: e.t, mode: e.permissionMode });
  }
  for (const [id, a] of s.agents) {
    if (!a.entries.length) continue;
    const t = a.entries.map((e) => e.t);
    subagent.push([Math.min(...t), Math.max(...t)]);
    const dispatched = uses.has(id) ? uses.get(id).t : Math.min(...t);
    for (const e of a.entries) if (e.cwd) cwds.push({ t: dispatched, cwd: e.cwd });
  }
  return { human, idle, subagent, background, tool, hooks, hookBreakdown, unfinished, cwds, modes, bash, dispatches, notifications };
}

function segmentsOf(s) {
  const out = [];
  for (const e of s.entries) {
    const m = marker(e);
    if (!m) continue;
    if (out.length) out[out.length - 1].end = e.t;
    out.push({ ...m, session: path.basename(s.file, '.jsonl'), start: e.t, end: null });
  }
  const last = s.entries.length ? s.entries[s.entries.length - 1].t : 0;
  for (const seg of out) if (seg.end === null) seg.end = Math.max(seg.start, last);
  return out.filter((seg) => CHAIN.has(seg.command));
}

function times(seg, ev) {
  const { start, end } = seg;
  const H = clip(ev.human, start, end);
  const S = clip(ev.subagent, start, end);
  const B = clip(ev.background, start, end);
  const I = clip(ev.idle, start, end);
  const T = clip(ev.tool, start, end);
  const wall = end - start;
  const human = measure(H);
  const subagent = measure([...H, ...S]) - human;
  const bg = measure([...H, ...S, ...B]) - human - subagent;
  // Idle only claims what human wait, subagent time, and a background call left over: any of them
  // covering the same gap wins (human wait always does; a subagent interval or a background call wins
  // over idle).
  const idle = measure([...H, ...S, ...B, ...I]) - human - subagent - bg;
  const toolRaw = measure([...H, ...S, ...B, ...I, ...T]) - human - subagent - idle;
  const hooks = ev.hooks.filter((h) => h.t >= start && h.t < end);
  const byName = {};
  for (const h of ev.hookBreakdown.filter((h) => h.t >= start && h.t < end)) byName[h.name] = (byName[h.name] || 0) + h.ms;
  // The wait per name: parallel Stop hooks count once, at their slowest, as the time sinks read it.
  const waitByName = {};
  for (const h of hooks) waitByName[h.name] = (waitByName[h.name] || 0) + h.ms;
  const sum = (xs) => xs.reduce((n, h) => n + h.ms, 0);
  // simplicity: a hook's recorded duration is taken out of the time around it, capped so the split
  // still sums to wall-clock time; a hook fired inside a subagent stays subagent time.
  const toolHook = Math.min(sum(hooks.filter((h) => h.tool)), toolRaw);
  const rest = wall - human - subagent - idle - toolRaw;
  const otherHook = Math.min(sum(hooks.filter((h) => !h.tool)), rest);
  return {
    times: { wall, human, idle, subagent, tool: toolRaw - toolHook, hook: toolHook + otherHook, model: rest - otherHook },
    hooks: byName,
    hookWait: waitByName,
  };
}

module.exports = { measure, clip, sessionEvents, segmentsOf, times, REJECTED_INFO };
