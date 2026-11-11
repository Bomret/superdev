#!/usr/bin/env node
'use strict';

// run-trace: deterministic PostToolUse hook that records every file edit of a superdev run into the
// run trace (ADR 0117), attributed to its run and slice and classified as test or implementation.
// Events: Edit/Write/NotebookEdit. The hook reads no Bash command: a test run is recorded by `scope.js test` and
// `scope.js fail-to-pass`, and a Bash write is no edit line (ADR 0227).
// And every subagent dispatch and its end with an outcome (ADR 0140): PreToolUse on Agent, then PostToolUse, PostToolUseFailure,
// or PermissionDenied on Agent, SubagentStop, PostToolUse on TaskStop, or the main session's Stop, UserPromptSubmit, or SessionEnd.
// PreToolUse on SendMessage reopens an ended dispatch (`dispatch-resume`), and the resumed run ends again the same ways.
// Any error exits 0 silently; the hook never blocks.

// The modules in `lib/` own everything the hook records from: the trace writer, the run locator, and the dispatch lifecycle.
// The same fail-silent require as scope-prune: no module, no recording. One `try` covers all of them, so a module that will not
// load leaves its names null, and record() records nothing for any of them.
// A name whose module did not load is null, so requiring the hook stays silent.
let appendTrace = null;
let locate = null;
let toolTarget = null;
let isTestPath = null;
let recordDispatch = null;
let findDispatch = null;
let endLine = null;
let bindAgentResult = null;
let recordAgentEnd = null;
let recordTaskStop = null;
let recordSendMessage = null;
let recordSendMessageEnd = null;
let closeSession = null;
try {
  ({ appendTrace } = require('../lib/trace-log.js'));
  ({ locate, toolTarget, isTestPath } = require('../lib/run-tree.js'));
  ({ recordDispatch, findDispatch, endLine, bindAgentResult, recordAgentEnd, recordTaskStop, recordSendMessage, recordSendMessageEnd, closeSession } = require('../lib/dispatch.js'));
} catch {
  // left null: record() records nothing
}

// Writes the lines an event built, skipping a line that is `undefined`: the caller builds every line first (INV-0159).
function writeLines(lines) {
  for (const line of lines) if (line) appendTrace(line[0], line[1]);
}

function record(input) {
  const loaded = [appendTrace, locate, toolTarget, isTestPath, recordDispatch, findDispatch,
    endLine, bindAgentResult, recordAgentEnd, recordTaskStop, recordSendMessage, recordSendMessageEnd, closeSession];
  if (!loaded.every(Boolean) || !input || typeof input !== 'object') return null;
  const ti = input.tool_input || {};
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  if (input.tool_name === 'Agent') {
    if (input.hook_event_name === 'PreToolUse') writeLines([recordDispatch(input)]);
    else if (input.hook_event_name === 'PostToolUse') {
      const done = bindAgentResult(input, cwd);
      if (done) writeLines([done.bind, ...(done.completed ? [endLine(done.f.runRoot, done.f.events, done.f.d, 'completed')] : [])]);
    }
    else if (input.hook_event_name === 'PostToolUseFailure') writeLines([recordAgentEnd(input, cwd, 'failed')]);
    else if (input.hook_event_name === 'PermissionDenied') writeLines([recordAgentEnd(input, cwd, 'denied')]);
    return null;
  }
  if (input.tool_name === 'SendMessage') {
    if (input.hook_event_name === 'PreToolUse') {
      try { writeLines([recordSendMessage(input, cwd)]); } catch { /* no scopes dir or an unreadable run: nothing to reopen */ }
    } else if (input.hook_event_name === 'PostToolUseFailure' || input.hook_event_name === 'PermissionDenied') {
      try { writeLines([recordSendMessageEnd(input, cwd, input.hook_event_name === 'PermissionDenied' ? 'denied' : 'failed')]); } catch { /* no scopes dir or an unreadable run: nothing to end */ }
    }
    return null;
  }
  if (input.tool_name === 'TaskStop') {
    if (input.hook_event_name === 'PostToolUse') writeLines([recordTaskStop(input, cwd)]);
    return null;
  }
  if (input.hook_event_name === 'Stop' || input.hook_event_name === 'UserPromptSubmit' || input.hook_event_name === 'SessionEnd') {
    try { writeLines(closeSession(input, cwd)); } catch { /* no scopes dir or an unreadable run: nothing to end */ }
    return null;
  }
  if (input.hook_event_name === 'SubagentStop') {
    if (typeof input.agent_id === 'string' && input.agent_id) {
      // A stop another hook blocks fires again: endLine gives nothing for a dispatch already ended.
      const f = findDispatch(cwd, input.agent_id, true);
      if (f) writeLines([endLine(f.runRoot, f.events, f.d, 'completed')]);
    }
    return null;
  }
  if (input.hook_event_name === 'PostToolUseFailure') return null;
  const agent = typeof input.agent_id === 'string' && input.agent_id ? input.agent_id : 'main';
  // Every line this event produces is computed before any is written: a function that throws leaves no partial trace (INV-0159).
  const path = typeof ti.file_path === 'string' ? ti.file_path : ti.notebook_path;
  if (typeof path !== 'string') return null;
  const at = locate(toolTarget(cwd, path));
  if (!at) return null;
  const kind = isTestPath(at.tree, at.rel) ? 'test' : 'impl';
  writeLines([[at.runRoot, { slice: at.slice, agent, kind: 'edit', fields: [kind, at.rel] }]]);
  return null;
}

function main() {
  // A hook that cannot finish lets the tool call through: exit 0 at the bound.
  setTimeout(() => process.exit(0), 5000).unref();
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    try {
      record(JSON.parse(raw || '{}'));
    } catch {
      // never block the tool call
    }
    process.exit(0);
  });
}

if (require.main === module) main();

module.exports = { record };
