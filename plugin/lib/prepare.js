'use strict';

// prepare.js: runs a repository's prepare command at a worktree's root, in a process group of its own (ADR 0218).

// Runs `command` at the root `tree` through `sup`, a supervisor from run-supervision.js's `superviseRuns`, whose stdio sends the
// command's output to stderr; an interrupt ends the command's group with the supervisor's. The sweep ends whatever the command
// left running in its group once it exits. Resolves `{ ok, reason }`: `ok` when the command exited 0, and `reason` its exit
// status, the signal that ended it, or `start-failed:<error code>` when it could not start.
async function runPrepare(sup, command, tree) {
  const { code, signal, error } = await sup.run(command, tree, true);
  if (error) return { ok: false, reason: `start-failed:${error}` };
  return { ok: !signal && code === 0, reason: signal || String(code) };
}

module.exports = { runPrepare };
