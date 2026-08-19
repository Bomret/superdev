#!/usr/bin/env node
'use strict';

// run-lock: deterministic PreToolUse(Bash) guard for parallel-safe lite runs.
// When a bash command tries to create/enter a scope worktree (.superdev/scopes/<scope>/worktree),
// check if a fresh .superdev/scopes/<scope>/run.lock exists. If so, another session is live on
// this scope — block. If the lock is stale or absent, allow (crash resume or new run).
// ponytail: mtime staleness threshold is 1 hour; if long-running lite sessions exceed this,
// add a heartbeat refresh loop inside the controller's lite-tier run (or parameterize the
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
  // Guard ONLY the create op: `git worktree add … .superdev/scopes/<scope>/worktree`. Every other command
  // that names the path — `cd`/`grep`/`bun` in the worktree, `git -C <worktree> …`, `git worktree
  // remove` — is the owner working in its own tree and must never be blocked by its own lock. Keying
  // on the whole `git worktree add` phrase (not just the path) is what keeps the owner unblocked.
  const match = cmd.match(/git\s+worktree\s+add\b[^\n]*?\.superdev\/scopes\/([a-zA-Z0-9][a-zA-Z0-9_-]*)\/worktree\b/);
  return match ? match[1] : null;
}

function decide(input) {
  const cmd = (input && input.tool_input && input.tool_input.command) || '';
  const scope = extractScope(cmd);

  if (!scope) return { block: false }; // not a scope worktree op → allow

  // Scope worktree op detected. Check the lock. The session cwd is on the top-level payload
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
  if (process.argv.includes('--selftest')) {
    selftest();
    return;
  }

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

function selftest() {
  const assert = require('node:assert');
  const tmpDir = require('os').tmpdir();
  const testScope = 'test-scope-' + Date.now();
  const testRunDir = path.join(tmpDir, testScope);
  const lockDir = path.join(testRunDir, '.superdev', 'scopes', testScope);
  const lockPath = path.join(lockDir, 'run.lock');

  fs.mkdirSync(lockDir, { recursive: true });

  try {
    // decide() reads the session cwd from the top-level payload (input.cwd), NOT tool_input —
    // this helper builds the payload matching the real Bash hook shape, so a regression in the cwd source fails.
    const at = (command) => decide({ tool_input: { command }, cwd: testRunDir });
    const add = `git worktree add .superdev/scopes/${testScope}/worktree `;

    // Test 1: fresh lock on the guarded create op → block
    fs.writeFileSync(lockPath, 'locked', 'utf8');
    assert.strictEqual(at(add).block, true, 'Test 1 FAIL: fresh lock should block');

    // Test 2: stale lock → allow
    const staleTime = Date.now() - STALENESS_MS - 1000; // 1 hour + 1 sec ago
    fs.utimesSync(lockPath, staleTime / 1000, staleTime / 1000);
    assert.strictEqual(at(add).block, false, 'Test 2 FAIL: stale lock should allow');

    // Test 3: absent lock → allow
    fs.unlinkSync(lockPath);
    assert.strictEqual(at(add).block, false, 'Test 3 FAIL: absent lock should allow');

    // Test 4: non-worktree command → allow (even under a fresh lock)
    fs.writeFileSync(lockPath, 'locked', 'utf8');
    assert.strictEqual(at('echo hello').block, false, 'Test 4 FAIL: non-worktree should allow');

    // Test 5: `git worktree remove` is not the guarded create op → allow
    assert.strictEqual(at(`git worktree remove .superdev/scopes/${testScope}/worktree`).block, false, 'Test 5 FAIL: worktree remove should not block');

    // Test 6: owner working IN its own worktree (cd/grep/bun) → allow, not blocked by its own lock
    assert.strictEqual(at(`cd .superdev/scopes/${testScope}/worktree && bun run test`).block, false, 'Test 6 FAIL: cd into worktree must not block on a fresh lock');

    // Test 7: `git -C <worktree> …` (and other non-add ops) → allow
    assert.strictEqual(at(`git -C .superdev/scopes/${testScope}/worktree status`).block, false, 'Test 7 FAIL: git -C worktree must not block on a fresh lock');

    // Test 8: the guarded create op still blocks under a fresh lock
    assert.strictEqual(at(`git worktree add .superdev/scopes/${testScope}/worktree -b b base`).block, true, 'Test 8 FAIL: git worktree add must block on a fresh lock');

    // Test 9: a slug leading outside `[a-zA-Z0-9]` is not canonical (references/scope-mode.md's
    // `[a-zA-Z0-9][a-zA-Z0-9_-]*`) — extractScope must return null for it. Proven with a fresh lock
    // sitting at that exact literal path: if extraction wrongly captured the slug, the fresh lock
    // would block; it doesn't, so no scope was extracted at all. One vector covers the class: `-`
    // and `_` fail the identical first-character test.
    const badLockDir = path.join(testRunDir, '.superdev', 'scopes', '-bad');
    fs.mkdirSync(badLockDir, { recursive: true });
    fs.writeFileSync(path.join(badLockDir, 'run.lock'), 'locked', 'utf8');
    assert.strictEqual(at('git worktree add .superdev/scopes/-bad/worktree').block, false, 'Test 9 FAIL: leading `-` must not be extracted as a scope');

    // Protocol validation (exit 2 on block, exit 0 on allow) is tested at hook invocation time by
    // Claude Code; this selftest covers the decide() logic. The fixed main() properly translates
    // decide() results to the hook protocol (stderr + exit code), validated by the next bun run test.
    console.log('run-lock selftest ok');
  } finally {
    fs.rmSync(testRunDir, { recursive: true, force: true });
  }
}

main();
