#!/usr/bin/env node
'use strict';

// run-trace: deterministic PostToolUse hook that records every file edit of a superdev run into the
// run trace (ADR 0117), attributed to its run and slice and classified as test or implementation.
// Events: Edit/Write/NotebookEdit, and a Bash command writing a file through a redirect, `tee`,
// `sed -i`, `cp`/`mv`/`install`, `git mv`, or `git apply`; and a Bash command that runs tests (with
// outcome, commit, and tree state, on PostToolUse and PostToolUseFailure) or reverts or restores files.
// And every subagent dispatch and its end with an outcome (ADR 0140): PreToolUse on Agent, then PostToolUse, PostToolUseFailure,
// or PermissionDenied on Agent, SubagentStop, PostToolUse on TaskStop, or the main session's Stop, UserPromptSubmit, or SessionEnd.
// PreToolUse on SendMessage reopens an ended dispatch (`dispatch-resume`), and the resumed run ends again the same ways.
// PreToolUse on Bash only stashes the directory the command starts in, which its PostToolUse resolves the command from (ADR 0159).
// Any error exits 0 silently; the hook never blocks.
// simplicity: a write behind `bash -c` or a variable is not seen (a write inside `$( … )`, backticks, or a heredoc body a known
// shell reads on stdin, such as `bash <<E`, is); a guardrail-grade
// parse of the model's normal output, like ledger-guard's. Known limits within grade: a quoted option word (`command "-p"`), a
// wrapper or a git named by path (`/usr/bin/env`), and an abbreviated long option are read as the command word; `git mv a dir/`
// with dir absent records dir (fs.statSync only
// checks target existence, not trailing-slash intent). Edge cases; upgrade if they appear in real runs.
// The writers ledger-guard alone reads (a vi/vim script, `curl -o`, `wget -O`, `ditto`, `xxd`, `tar -x`, an interpreter's script, a
// here-string or echo text a shell reads) record no edit here.

const path = require('path');

// The modules in `lib/` own everything the hook records from: the trace writer, the Bash write and test-run readers over the
// shared command layer, the run locator, the dispatch lifecycle, and the stash. The same fail-silent require as scope-prune: no module, no recording. One `try`
// covers all of them, so a module that will not load leaves its names null, and record() records nothing for any of them. The stash
// loads under its own `try`: the PreToolUse stash and its removal in the PostToolUse hold whichever of the others loads.
// The hook re-exports the readers it exported before they moved to `lib/` (ADR 0151): `bashTargets`, `locate`, `treeState`,
// `testRuns`, and `verificationKind`. A re-export whose module did not load is null, like
// the names the hook uses itself, so requiring the hook stays silent.
let appendTrace = null;
let bashTargets = null;
let recordBash = null;
let locate = null;
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
let treeState = null;
let testRuns = null;
let verificationKind = null;
try {
  ({ appendTrace } = require('../lib/trace-log.js'));
  ({ bashTargets } = require('../lib/bash-writes.js'));
  ({ recordBash, testRuns, verificationKind } = require('../lib/test-runs.js'));
  ({ locate, isTestPath, treeState } = require('../lib/run-tree.js'));
  ({ recordDispatch, findDispatch, endLine, bindAgentResult, recordAgentEnd, recordTaskStop, recordSendMessage, recordSendMessageEnd, closeSession } = require('../lib/dispatch.js'));
} catch {
  // left null: record() records nothing
}
let stashStart = null;
let takeStart = null;
try {
  ({ stashStart, takeStart } = require('../lib/start-stash.js'));
} catch {
  // left null: record() records nothing
}

// Writes the lines an event built, skipping a line that is `undefined`: the caller builds every line first (INV-0159).
function writeLines(lines) {
  for (const line of lines) if (line) appendTrace(line[0], line[1]);
}

function record(input) {
  if (input && typeof input === 'object' && input.tool_name === 'Bash' && input.hook_event_name === 'PreToolUse') {
    if (stashStart) stashStart(input);
    return null;
  }
  // Every other Bash event takes the stash, before any guard below can return, so no path leaves it behind.
  const stashed = input && typeof input === 'object' && input.tool_name === 'Bash' && takeStart ? takeStart(input.tool_use_id) : null;
  const loaded = [appendTrace, bashTargets, recordBash, locate, isTestPath, recordDispatch, findDispatch,
    endLine, bindAgentResult, recordAgentEnd, recordTaskStop, recordSendMessage, recordSendMessageEnd, closeSession, stashStart, takeStart];
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
  const failed = input.hook_event_name === 'PostToolUseFailure';
  const agent = typeof input.agent_id === 'string' && input.agent_id ? input.agent_id : 'main';
  // A Bash command resolves from where it started; `cwd` is where it ended (ADR 0159).
  const start = stashed || cwd;
  // Every line this event produces is computed before any is written: a scanner function that throws leaves no partial trace (INV-0159).
  const lines = typeof ti.command === 'string' ? recordBash(ti.command, start, agent, failed, ti.run_in_background === true, cwd) : [];
  if (failed) {
    writeLines(lines);
    return null;
  }
  let targets = [];
  if (typeof ti.file_path === 'string') targets = [path.resolve(cwd, ti.file_path)];
  else if (typeof ti.notebook_path === 'string') targets = [path.resolve(cwd, ti.notebook_path)];
  else if (typeof ti.command === 'string') targets = bashTargets(ti.command, start, cwd);
  for (const abs of targets) {
    const at = locate(abs);
    if (!at) continue;
    const kind = isTestPath(at.tree, at.rel) ? 'test' : 'impl';
    lines.push([at.runRoot, { slice: at.slice, agent, kind: 'edit', fields: [kind, at.rel] }]);
  }
  // Every line the event built is written together (INV-0159).
  writeLines(lines);
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

module.exports = { record, bashTargets, verificationKind, locate, testRuns, treeState };
