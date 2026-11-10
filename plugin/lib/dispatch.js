'use strict';

// dispatch.js: the subagent dispatch lifecycle of the run trace (ADR 0117, ADR 0127, ADR 0140): a dispatch line, its bind to an agent, its resume, and its one end per run.

const fs = require('fs');
const path = require('path');
const { readTrace, untraceField } = require('./trace-log.js');
const { SLUG_RE, splitLines, tableRowIndexes, splitRow } = require('./ledger.js');
const { mainWorkTree } = require('./main-work-tree.js');
const { GIT_BOUND_MS } = require('./run-tree.js');
const { holds, lastRunLine } = require('./dispatch-lines.js');

// PreToolUse on Agent: the one run root named in the prompt (counted only with a readable ledger) and the one slice id
// named under it (`slicetrees/<id>` or `reports/<id>/`, an id the run's ledger lists), else `scope`. No run root or two records nothing. The dispatch
// is keyed by the call's `tool_use_id`: the platform sends SubagentStart no prompt, and a dispatch has no agent id yet.
// Writes nothing: every writer of this module gives its line as `[runRoot, entry]`, `undefined` for none, and the hook writes the
// lines of an event together (INV-0159).
function recordDispatch(input) {
  const ti = input.tool_input || {};
  const prompt = typeof ti.prompt === 'string' ? ti.prompt.replace(/\\/g, '/') : '';
  const roots = new Set();
  const ids = new Set();
  const slug = SLUG_RE.source.replace(/^\^|\$$/g, ''); // one slug definition: lib/ledger.js's
  const re = new RegExp(`((?:/[^\\s"'\`<>()]*?)?/\\.superdev/scopes/${slug})(?:/(?:slicetrees/([\\w-]+)|reports/([\\w-]+)/))?`, 'g');
  for (let m; (m = re.exec(prompt));) {
    let content;
    try { content = fs.readFileSync(path.join(m[1], 'ledger.md'), 'utf8'); } catch { continue; }
    roots.add(m[1]);
    // Only an id the ledger lists is a slice: `reports/review/` and any other directory name read `scope`.
    const id = m[2] || m[3];
    const lines = id ? splitLines(content) : [];
    if (id && tableRowIndexes(lines).some((i) => splitRow(lines[i])[0] === id)) ids.add(id);
  }
  if (roots.size !== 1) return undefined;
  // The session id is the last field: the boundary close (`closeSession`) matches a dispatch to the session that made it.
  return [[...roots][0], { slice: ids.size === 1 ? [...ids][0] : 'scope', agent: 'main', kind: 'dispatch', fields: [ti.subagent_type, input.tool_use_id, ti.description, typeof input.session_id === 'string' ? input.session_id : undefined] }];
}

// The runs under the scopes dir of cwd's repository, as { runRoot, events }: each run with a readable ledger and trace.
function runsOf(cwd) {
  const m = /^(.*?\/\.superdev)\/scopes\//.exec(cwd.replace(/\\/g, '/'));
  // The main working tree holds the scopes dir, whatever checkout or subdirectory the controller stands in.
  const main = m ? null : mainWorkTree(cwd, { timeout: GIT_BOUND_MS }) || cwd;
  const scopes = path.join(m ? m[1] : path.join(main, '.superdev'), 'scopes');
  const runs = [];
  for (const name of fs.readdirSync(scopes)) {
    const runRoot = path.join(scopes, name);
    try {
      fs.readFileSync(path.join(runRoot, 'ledger.md'));
      runs.push({ runRoot, events: readTrace(fs.readFileSync(path.join(runRoot, 'trace.log'), 'utf8')) });
    } catch { continue; }
  }
  return runs;
}

// The run whose trace holds a `dispatch` line, found among the scopes dir's runs: by its `tool_use_id`, or (`viaAgent`) by the
// `dispatch-bind` line that tied an `agentId` to one. Returns { runRoot, d, events } or undefined.
function findDispatch(cwd, key, viaAgent) {
  for (const { runRoot, events } of runsOf(cwd)) {
    let id = key;
    if (viaAgent) {
      const bind = events.find((e) => e.kind === 'dispatch-bind' && e.fields[2] !== undefined && untraceField(e.fields[2]) === key);
      id = bind && untraceField(bind.fields[1]);
    }
    const d = id && events.find((e) => e.kind === 'dispatch' && e.fields[1] !== undefined && untraceField(e.fields[1]) === id);
    if (d) return { runRoot, d, events };
  }
}


// Ends the run of the dispatch line `d` with `outcome`. The first end of a run wins (INV-0145): a run that already has one
// gets nothing, and a resumed run (`dispatch-resume`) has its own.
// `endLine` builds the end as `[runRoot, entry]` (`undefined` when the run already ended) without writing it: the caller writes
// it with the other lines of its event (INV-0159).
function endLine(runRoot, events, d, outcome) {
  const tu = untraceField(d.fields[1]);
  const last = lastRunLine(events, tu);
  if (last && last.kind === 'dispatch-end') return undefined;
  return [runRoot, { slice: untraceField(d.slice), agent: 'main', kind: 'dispatch-end', fields: [untraceField(d.fields[0]), tu, outcome] }];
}

// PostToolUse on Agent: both statuses carry the subagent's `agentId`, and the first one seen binds it to the dispatch
// (one `dispatch-bind` per dispatch) for the SubagentStop, TaskStop, and SendMessage that name the agent. `completed`
// ends the dispatch; an `async_launched` one ends on its SubagentStop. A foreground run's own SubagentStop fires before
// this event, while no bind names it yet, so its one end is this one.
// A failed (PostToolUseFailure) or denied (PermissionDenied) call ends it through `recordAgentEnd`.
// Writes nothing. It gives `{ f, bind, completed }` for a dispatch it found, or `undefined`: `f` is the dispatch
// `findDispatch` found, `bind` the `dispatch-bind` line as `[runRoot, entry]` (`undefined` when the result carries no `agentId` or
// the dispatch is bound already), and `completed` whether the result is a `completed` one. The caller builds the end (`endLine`)
// too, then writes every line of the event together (INV-0159).
function bindAgentResult(input, cwd) {
  const r = input.tool_response;
  if (!r || typeof r !== 'object' || typeof input.tool_use_id !== 'string') return undefined;
  const f = r.status === 'completed' || r.status === 'async_launched' ? findDispatch(cwd, input.tool_use_id) : null;
  if (!f) return undefined;
  const bind = typeof r.agentId === 'string' && r.agentId && !holds(f.events, 'dispatch-bind', 1, input.tool_use_id)
    ? [f.runRoot, { slice: untraceField(f.d.slice), agent: 'main', kind: 'dispatch-bind', fields: [untraceField(f.d.fields[0]), input.tool_use_id, r.agentId] }]
    : undefined;
  return { f, bind, completed: r.status === 'completed' };
}

// PostToolUseFailure and PermissionDenied on Agent: the call's `tool_use_id` names the dispatch it ends.
function recordAgentEnd(input, cwd, outcome) {
  if (typeof input.tool_use_id !== 'string') return undefined;
  const f = findDispatch(cwd, input.tool_use_id);
  return f ? endLine(f.runRoot, f.events, f.d, outcome) : undefined;
}

// PostToolUse on TaskStop: `task_id` is the stopped subagent's agent id, which a `dispatch-bind` tied to its dispatch.
function recordTaskStop(input, cwd) {
  const id = input.tool_input && input.tool_input.task_id;
  if (typeof id !== 'string' || !id) return undefined;
  const f = findDispatch(cwd, id, true);
  return f ? endLine(f.runRoot, f.events, f.d, 'stopped') : undefined;
}

// PreToolUse on SendMessage: `to` is the agent id the message resumes (the probe saw `SubagentStart` and a second
// `SubagentStop` follow). An ended, bound dispatch is running again, so its `dispatch-resume` line (the dispatch's
// `tool_use_id`, the agent id, the resuming session, and the `SendMessage` call's own `tool_use_id`) reopens it on its slice.
// A running dispatch or an unbound agent id writes nothing.
function recordSendMessage(input, cwd) {
  const to = input.tool_input && input.tool_input.to;
  if (typeof to !== 'string' || !to) return undefined;
  const f = findDispatch(cwd, to, true);
  const tu = f && untraceField(f.d.fields[1]);
  const last = f && lastRunLine(f.events, tu);
  if (!last || last.kind !== 'dispatch-end') return undefined;
  return [f.runRoot, { slice: untraceField(f.d.slice), agent: 'main', kind: 'dispatch-resume', fields: [tu, to, typeof input.session_id === 'string' ? input.session_id : undefined, typeof input.tool_use_id === 'string' ? input.tool_use_id : undefined] }];
}

// PostToolUseFailure and PermissionDenied on SendMessage: a message that failed or was denied reaches no subagent, so the
// run its `dispatch-resume` opened ends with `outcome`. Only the call whose `tool_use_id` the open resume line carries ends
// it: a later message to the still-running resumed dispatch opened no run, so its failure leaves the live run alone.
function recordSendMessageEnd(input, cwd, outcome) {
  const to = input.tool_input && input.tool_input.to;
  if (typeof to !== 'string' || !to || typeof input.tool_use_id !== 'string') return undefined;
  const f = findDispatch(cwd, to, true);
  const last = f && lastRunLine(f.events, untraceField(f.d.fields[1]));
  return last && last.kind === 'dispatch-resume' && last.fields[3] !== undefined && untraceField(last.fields[3]) === input.tool_use_id ? endLine(f.runRoot, f.events, f.d, outcome) : undefined;
}

// Stop, UserPromptSubmit, and SessionEnd of the main session end the session's dispatches that no event named: a dispatch
// with no `dispatch-bind` and no end is a foreground or blocked call that cannot outlive its turn (`unknown`; a foreground
// one is bound only by the PostToolUse that ends it), and at SessionEnd a bound one still open ends `session-end`. A background dispatch is left open at a turn boundary. A dispatch
// line with no session id, written before ids, matches no session. These events fire on every turn of every session, so
// a payload this cannot read, or a repository with no run, records nothing. It writes nothing: it gives every end it builds as
// `[runRoot, entry]`, for the hook to write together, so a failure while building one drops them all (INV-0159).
function closeSession(input, cwd) {
  const sid = input.session_id;
  const lines = [];
  if (typeof sid !== 'string' || !sid || sid === '-' || input.agent_id) return lines;
  for (const { runRoot, events } of runsOf(cwd)) {
    for (const d of events) {
      if (d.kind !== 'dispatch') continue;
      // The session of the open run: the dispatch's own, or the one that resumed it.
      const last = lastRunLine(events, untraceField(d.fields[1]));
      const at = last.kind === 'dispatch-resume' ? 2 : 3;
      if (last.kind === 'dispatch-end' || last.fields[at] === undefined || untraceField(last.fields[at]) !== sid) continue;
      const bound = holds(events, 'dispatch-bind', 1, untraceField(d.fields[1]));
      if (!bound) lines.push(endLine(runRoot, events, d, 'unknown'));
      else if (input.hook_event_name === 'SessionEnd') lines.push(endLine(runRoot, events, d, 'session-end'));
    }
  }
  return lines;
}

module.exports = { recordDispatch, findDispatch, endLine, bindAgentResult, recordAgentEnd, recordTaskStop, recordSendMessage, recordSendMessageEnd, closeSession };
