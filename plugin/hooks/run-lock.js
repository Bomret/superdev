#!/usr/bin/env node
'use strict';

// run-lock: deterministic PreToolUse(Bash) guard for parallel-safe runs, at both tiers.
// When a bash command tries to create/enter a scopetree (.superdev/scopes/<scope>/scopetree),
// check if a fresh .superdev/scopes/<scope>/run.lock exists. If so, another session is live on
// this scope — block. If the lock is stale or absent, allow (crash resume or new run).
// simplicity: mtime staleness threshold is 1 hour; if long-running runs exceed this,
// add a heartbeat refresh loop inside the controller's run (or parameterize the
// threshold), but YAGNI for now.

const fs = require('fs');
const path = require('path');

// 1 hour in ms = staleness threshold. A lock mtime older than this is considered stale/crashed.
const STALENESS_MS = 60 * 60 * 1000;

function isLockFresh(lockPath) {
  try {
    const stat = fs.statSync(lockPath);
    const age = Date.now() - stat.mtimeMs;
    return age < STALENESS_MS; // fresh if less than 1 hour old
  } catch {
    // ENOENT, EACCES, or anything else: a lock this hook cannot stat is not evidence of a live
    // run, and an uncaught throw here would crash the hook instead of answering.
    return false;
  }
}

function extractScope(cmd) {
  // Guard ONLY the create op: `git worktree add … .superdev/scopes/<scope>/scopetree`. Every other command
  // that names the path — `cd`/`grep`/`bun` in the scopetree, `git -C <scopetree> …`, `git worktree
  // remove` — is the owner working in its own tree and must never be blocked by its own lock. Keying
  // on the whole `git worktree add` phrase (not just the path) is what keeps the owner unblocked.
  const match = cmd.match(/git\s+worktree\s+add\b[^\n]*?\.superdev\/scopes\/([a-zA-Z0-9][a-zA-Z0-9_-]*)\/scopetree\b/);
  return match ? match[1] : null;
}

function decide(input) {
  const cmd = (input && input.tool_input && input.tool_input.command) || '';
  const scope = extractScope(cmd);

  if (!scope) return { block: false }; // not a scopetree op → allow

  // Scopetree op detected. Check the lock. The session cwd is on the top-level payload
  // (`input.cwd`), not inside tool_input — the Bash tool_input carries only `command`.
  const cwd = (input && input.cwd) || process.cwd();
  const lockPath = path.join(cwd, '.superdev', 'scopes', scope, 'run.lock');

  if (isLockFresh(lockPath)) {
    return {
      block: true,
      reason:
        `superdev: another session is running this scope (${scope}). ` +
        `A fresh .superdev/scopes/${scope}/run.lock exists. ` +
        'If the lock is stale (crashed run), remove it manually and retry.',
    };
  }

  return { block: false };
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let input;
    try {
      input = JSON.parse(raw || '{}');
    } catch {
      process.exit(0); // not our shape → never block
    }

    const result = decide(input);
    if (result.block) {
      process.stderr.write(result.reason + '\n');
      process.exit(2); // exit 2 signals block to Claude Code
    }
    process.exit(0); // allow
  });
}

if (require.main === module) {
  main();
}

module.exports = { decide, STALENESS_MS };
