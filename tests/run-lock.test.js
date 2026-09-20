'use strict';

// Suite for plugin/hooks/run-lock.js. Requires the hook (silent, ADR 0059 / issue #442's
// require.main guard) and calls its exported decide() directly, the way the hook's own inline
// --selftest used to before this suite moved off the shipped tree (ADR 0059).

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const hookPath = require.resolve('../plugin/hooks/run-lock.js');
const { decide, STALENESS_MS } = require(hookPath);

const tmpDir = os.tmpdir();
const testScope = 'test-scope-' + Date.now();
const testRunDir = path.join(tmpDir, testScope);
const lockDir = path.join(testRunDir, '.superdev', 'scopes', testScope);
const lockPath = path.join(lockDir, 'run.lock');

fs.mkdirSync(lockDir, { recursive: true });

try {
  // decide() reads the session cwd from the top-level payload (input.cwd), NOT tool_input —
  // this helper builds the payload matching the real Bash hook shape, so a regression in the cwd source fails.
  const at = (command) => decide({ tool_input: { command }, cwd: testRunDir });
  const add = `git worktree add .superdev/scopes/${testScope}/scopetree `;

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

  // Test 4: non-scopetree command → allow (even under a fresh lock)
  fs.writeFileSync(lockPath, 'locked', 'utf8');
  assert.strictEqual(at('echo hello').block, false, 'Test 4 FAIL: non-scopetree should allow');

  // Test 5: `git worktree remove` is not the guarded create op → allow
  assert.strictEqual(at(`git worktree remove .superdev/scopes/${testScope}/scopetree`).block, false, 'Test 5 FAIL: worktree remove should not block');

  // Test 6: owner working IN its own scopetree (cd/grep/bun) → allow, not blocked by its own lock
  assert.strictEqual(at(`cd .superdev/scopes/${testScope}/scopetree && bun run test`).block, false, 'Test 6 FAIL: cd into scopetree must not block on a fresh lock');

  // Test 7: `git -C <scopetree> …` (and other non-add ops) → allow
  assert.strictEqual(at(`git -C .superdev/scopes/${testScope}/scopetree status`).block, false, 'Test 7 FAIL: git -C scopetree must not block on a fresh lock');

  // Test 8: the guarded create op still blocks under a fresh lock
  assert.strictEqual(at(`git worktree add .superdev/scopes/${testScope}/scopetree -b b base`).block, true, 'Test 8 FAIL: git worktree add must block on a fresh lock');

  // Test 9: a slug leading outside `[a-zA-Z0-9]` is not canonical (references/scope-mode.md's
  // `[a-zA-Z0-9][a-zA-Z0-9_-]*`) — extractScope must return null for it. Proven with a fresh lock
  // sitting at that exact literal path: if extraction wrongly captured the slug, the fresh lock
  // would block; it doesn't, so no scope was extracted at all. One vector covers the class: `-`
  // and `_` fail the identical first-character test.
  const badLockDir = path.join(testRunDir, '.superdev', 'scopes', '-bad');
  fs.mkdirSync(badLockDir, { recursive: true });
  fs.writeFileSync(path.join(badLockDir, 'run.lock'), 'locked', 'utf8');
  assert.strictEqual(at('git worktree add .superdev/scopes/-bad/scopetree').block, false, 'Test 9 FAIL: leading `-` must not be extracted as a scope');

  // Protocol validation (exit 2 on block, exit 0 on allow) is tested at hook invocation time by
  // Claude Code; this suite covers the decide() logic. The main() function properly translates
  // decide() results to the hook protocol (stderr + exit code), validated below.

  // require.main guard: requiring this hook must never run main()'s stdin/decide dispatch, and
  // spawning it directly (as Claude Code's hook invocation does) must still decide exactly as before
  // the guard was added.
  {
    fs.writeFileSync(lockPath, 'locked', 'utf8');
    const payload = JSON.stringify({ tool_input: { command: add }, cwd: testRunDir });
    const required = cp.spawnSync(process.execPath, ['-e', `require(${JSON.stringify(hookPath)})`], {
      input: payload, encoding: 'utf8', timeout: 5000,
    });
    assert.equal(required.status, 0, 'requiring run-lock.js never blocks');
    assert.equal(required.stdout, '', 'requiring run-lock.js prints nothing');
    assert.equal(required.stderr, '', 'requiring run-lock.js runs no decision');

    const spawned = cp.spawnSync(process.execPath, [hookPath], { input: payload, encoding: 'utf8', timeout: 5000 });
    assert.equal(spawned.status, 2, 'spawning run-lock.js directly still blocks on a fresh lock');
    assert.match(spawned.stderr, /another session is running this scope/, 'and still reports the run-lock reason');
  }

  // argv[2] === '--selftest' is a global-process condition, not "this file was invoked directly": a
  // parent process invoked as `node <parent>.js --selftest` that requires this hook must not run this
  // hook's own selftest as a side effect (issue #442 finding 1). Guarded by an env marker so that, if
  // the guard is broken, the recursively-triggered inner selftest doesn't spawn a further generation
  // of itself — it proves the leak exactly once instead of nesting indefinitely.
  if (!process.env.SUPERDEV_ARGV_GUARD_TEST) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-lock-argv-'));
    const wrapper = path.join(dir, 'req.js');
    fs.writeFileSync(wrapper, `require(${JSON.stringify(hookPath)});`);
    try {
      const outer = cp.spawnSync(process.execPath, [wrapper, '--selftest'], {
        encoding: 'utf8', timeout: 5000,
        env: Object.assign({}, process.env, { SUPERDEV_ARGV_GUARD_TEST: '1' }),
      });
      assert.equal(outer.status, 0, 'a parent whose own argv[2] is --selftest still exits cleanly when it requires run-lock.js');
      assert.equal(outer.stdout, '', "and never runs run-lock.js's own selftest as a side effect");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log('run-lock tests ok');
} finally {
  fs.rmSync(testRunDir, { recursive: true, force: true });
}
