#!/usr/bin/env node
'use strict';

// run-lock: deterministic PreToolUse(Bash) guard for parallel-safe runs, at both tiers.
// When a bash command tries to create/enter a scopetree (.superdev/scopes/<scope>/scopetree),
// check if a fresh .superdev/scopes/<scope>/run.lock exists. If so, another session is live on
// this scope — block. If the lock is stale or absent, allow (crash resume or new run).
// The lock lives in the run root the command names: an absolute scopetree path names it outright
// (ADR 0080), a relative one resolves against the session cwd. The run root under the session's
// working directory is checked too, so a path the hook cannot expand (`~/`, `$HOME/`) still meets
// the lock (triage #910).
// simplicity: mtime staleness threshold is 1 hour; if long-running runs exceed this,
// add a heartbeat refresh loop inside the controller's run (or parameterize the
// threshold), but YAGNI for now.

const fs = require('fs');
const path = require('path');

// The shared shell module (ADR 0135) translates a Git Bash drive path (ADR 0150). When it cannot load, the
// guard fails closed like the other guardrails: it blocks a scopetree creation and says why (INV-0140).
let drivePath = null;
try {
  ({ drivePath } = require('./shell-words.js'));
} catch {
  // left null: decide() blocks a scopetree creation
}

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

function extractScopetree(cmd) {
  // Guard ONLY the create op: `git worktree add … .superdev/scopes/<scope>/scopetree`. Every other command
  // that names the path — `cd`/`grep`/`bun` in the scopetree, `git -C <scopetree> …`, `git worktree
  // remove` — is the owner working in its own tree and must never be blocked by its own lock. Keying
  // on the whole `git worktree add` phrase (not just the path) is what keeps the owner unblocked.
  // `prefix` is whatever precedes `.superdev` in the same path token: empty for a path relative to cwd.
  // A quoted token is read whole, spaces included, so a path like "/x/My Repo/…" keeps its full prefix.
  const add = cmd.match(/git\s+worktree\s+add\b([^\n]*)/);
  if (!add) return null;
  for (const t of add[1].matchAll(/"([^"]*)"|'([^']*)'|[^\s"']+/g)) {
    const m = (t[1] ?? t[2] ?? t[0]).match(/^(.*)\.superdev\/scopes\/([a-zA-Z0-9][a-zA-Z0-9_-]*)\/scopetree\b/);
    if (m) return { prefix: m[1], scope: m[2] };
  }
  return null;
}

function decide(input) {
  const cmd = (input && input.tool_input && input.tool_input.command) || '';
  const found = extractScopetree(cmd);

  if (!found) return { block: false }; // not a scopetree op → allow
  const { prefix, scope } = found;
  if (!drivePath) {
    return { block: true, reason: 'superdev: run-lock cannot load shell-words.js, so it cannot tell whether another session runs this scope. Reinstall the superdev plugin.' };
  }

  // Scopetree op detected. Check the lock. The session cwd is on the top-level payload
  // (`input.cwd`), not inside tool_input — the Bash tool_input carries only `command`.
  const cwd = (input && input.cwd) || process.cwd();
  // Fail closed: the run root the command names, and the run root under the session's working
  // directory. A prefix the hook cannot expand (`~/`, `$HOME/`) resolves under cwd and misses the
  // real root; cwd's own lock still blocks when the session stands in the main tree.
  const runRoots = [path.resolve(cwd, drivePath(prefix), '.superdev', 'scopes', scope), path.resolve(cwd, '.superdev', 'scopes', scope)];
  const runRoot = runRoots.find((root) => isLockFresh(path.join(root, 'run.lock')));

  if (runRoot) {
    return {
      block: true,
      reason:
        `superdev: another session is running this scope (${scope}). ` +
        `A fresh run.lock exists in ${runRoot}. ` +
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
