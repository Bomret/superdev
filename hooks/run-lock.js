#!/usr/bin/env node
'use strict';

// run-lock: deterministic PreToolUse(Bash) guard for parallel-safe lite runs.
// When a bash command tries to create/enter a scope worktree (.superdev/<scope>/worktree),
// check if a fresh .superdev/<scope>/run.lock exists. If so, another session is live on
// this scope — block. If the lock is stale or absent, allow (crash resume or new run).
// ponytail: mtime staleness threshold is 1 hour; if long-running lite sessions exceed this,
// add a heartbeat refresh loop inside the controller's lite-path run (or parameterize the
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
  } catch (e) {
    if (e.code === 'ENOENT') return false; // no lock = not fresh (lock absent)
    throw e; // other errors propagate
  }
}

function extractScope(cmd) {
  // Guard ONLY the create op: `git worktree add … .superdev/<scope>/worktree`. Every other command
  // that names the path — `cd`/`grep`/`bun` in the worktree, `git -C <worktree> …`, `git worktree
  // remove` — is the owner working in its own tree and must never be blocked by its own lock. Keying
  // on the whole `git worktree add` phrase (not just the path) is what keeps the owner unblocked.
  const match = cmd.match(/git\s+worktree\s+add\b[^\n]*?\.superdev\/([a-zA-Z0-9_-]+)\/worktree\b/);
  return match ? match[1] : null;
}

function decide(input) {
  const cmd = (input && input.tool_input && input.tool_input.command) || '';
  const scope = extractScope(cmd);

  if (!scope) return { block: false }; // not a scope worktree op → allow

  // Scope worktree op detected. Check the lock.
  const cwd = (input.tool_input && input.tool_input.cwd) || process.cwd();
  const lockPath = path.join(cwd, '.superdev', scope, 'run.lock');

  if (isLockFresh(lockPath)) {
    return {
      block: true,
      reason:
        `superdev: another session is running this scope (${scope}). ` +
        `A fresh .superdev/${scope}/run.lock exists. ` +
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
    } catch (e) {
      process.stderr.write('run-lock: malformed hook input\n');
      process.exit(1);
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
  const lockDir = path.join(testRunDir, '.superdev', testScope);
  const lockPath = path.join(lockDir, 'run.lock');

  require('child_process').execSync(`mkdir -p "${lockDir}"`);

  try {
    // Test decide() logic (unit tests)
    // Test 1: fresh lock (should block)
    fs.writeFileSync(lockPath, 'locked', 'utf8');
    const freshLocked = decide({
      tool_input: {
        command: `git worktree add .superdev/${testScope}/worktree `,
        cwd: testRunDir,
      },
    });
    assert.strictEqual(freshLocked.block, true, 'Test 1 FAIL: fresh lock should block');

    // Test 2: stale lock (should allow)
    const now = Date.now();
    const staleTime = now - STALENESS_MS - 1000; // 1 hour + 1 sec ago
    fs.utimesSync(lockPath, staleTime / 1000, staleTime / 1000);
    const staleLocked = decide({
      tool_input: {
        command: `git worktree add .superdev/${testScope}/worktree `,
        cwd: testRunDir,
      },
    });
    assert.strictEqual(staleLocked.block, false, 'Test 2 FAIL: stale lock should allow');

    // Test 3: no lock (should allow)
    fs.unlinkSync(lockPath);
    const noLock = decide({
      tool_input: {
        command: `git worktree add .superdev/${testScope}/worktree `,
        cwd: testRunDir,
      },
    });
    assert.strictEqual(noLock.block, false, 'Test 3 FAIL: absent lock should allow');

    // Test 4: non-worktree command (should allow)
    fs.writeFileSync(lockPath, 'locked', 'utf8');
    const notWorktree = decide({
      tool_input: {
        command: 'echo hello',
        cwd: testRunDir,
      },
    });
    assert.strictEqual(notWorktree.block, false, 'Test 4 FAIL: non-worktree should allow');

    // Test 5: remove command should not match (doesn't trigger guard)
    const removeCmd = decide({
      tool_input: {
        command: `git worktree remove .superdev/${testScope}/worktree`,
        cwd: testRunDir,
      },
    });
    assert.strictEqual(removeCmd.block, false, 'Test 5 FAIL: worktree remove should not block');

    // Test 6: owner operating IN its own worktree (cd/grep/bun) must NOT be blocked by its own fresh
    // lock — the lock guards only the `git worktree add` create op, not every command naming the path.
    fs.writeFileSync(lockPath, 'locked', 'utf8');
    const cdInto = decide({
      tool_input: { command: `cd .superdev/${testScope}/worktree && bun run test`, cwd: testRunDir },
    });
    assert.strictEqual(cdInto.block, false, 'Test 6 FAIL: cd into worktree must not block on a fresh lock');

    // Test 7: `git -C <worktree> …` (and other non-add ops) must NOT block either.
    const gitC = decide({
      tool_input: { command: `git -C .superdev/${testScope}/worktree status`, cwd: testRunDir },
    });
    assert.strictEqual(gitC.block, false, 'Test 7 FAIL: git -C worktree must not block on a fresh lock');

    // Test 8: the create op it DOES guard still blocks under a fresh lock.
    const addBlocked = decide({
      tool_input: { command: `git worktree add .superdev/${testScope}/worktree -b b base`, cwd: testRunDir },
    });
    assert.strictEqual(addBlocked.block, true, 'Test 8 FAIL: git worktree add must block on a fresh lock');

    // Protocol validation (exit 2 on block, exit 0 on allow) is tested at hook invocation time by
    // Claude Code; this selftest covers the decide() logic. The fixed main() properly translates
    // decide() results to the hook protocol (stderr + exit code), validated by the next bun run test.
    console.log('run-lock selftest ok');
  } finally {
    require('child_process').execSync(`rm -rf "${testRunDir}"`);
  }
}

main();
