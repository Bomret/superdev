'use strict';

// Suite for plugin/hooks/run-lock.js. Requires the hook (silent, ADR 0059 / issue #442's
// require.main guard) and calls its exported decide() directly, the way the hook's own inline
// --selftest used to before this suite moved off the shipped tree (ADR 0059).

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const { assertSpawnDecided } = require('./spawn-verdict');

const hookPath = require.resolve('../plugin/hooks/run-lock.js');
const { decide, STALENESS_MS } = require(hookPath);

const tmpDir = os.tmpdir();
const ROOT_PREFIX = 'test-scope-';
const tempRoot = () => fs.mkdtempSync(path.join(tmpDir, ROOT_PREFIX));
const testRunDir = tempRoot();
const testScope = path.basename(testRunDir);
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
  // `[a-zA-Z0-9][a-zA-Z0-9_-]*`) — extractScopetree must return null for it. Proven with a fresh lock
  // sitting at that exact literal path: if extraction wrongly captured the slug, the fresh lock
  // would block; it doesn't, so no scope was extracted at all. One vector covers the class: `-`
  // and `_` fail the identical first-character test.
  const badLockDir = path.join(testRunDir, '.superdev', 'scopes', '-bad');
  fs.mkdirSync(badLockDir, { recursive: true });
  fs.writeFileSync(path.join(badLockDir, 'run.lock'), 'locked', 'utf8');
  assert.strictEqual(at('git worktree add .superdev/scopes/-bad/scopetree').block, false, 'Test 9 FAIL: leading `-` must not be extracted as a scope');

  // Test 10: the lock is read from the run root the command names, not the session's directory.
  // A session in a subdirectory, or in a linked worktree elsewhere, names the main tree's run root
  // by absolute path (ADR 0080) and still meets the fresh lock there, with the root named in the reason.
  fs.writeFileSync(lockPath, 'locked', 'utf8');
  const absAdd = `git worktree add ${testRunDir}/.superdev/scopes/${testScope}/scopetree fix/x`;
  const sub = path.join(testRunDir, 'sub');
  const linked = fs.mkdtempSync(path.join(tmpDir, 'run-lock-linked-'));
  try {
    for (const cwd of [testRunDir, sub, linked]) {
      const r = decide({ tool_input: { command: absAdd }, cwd });
      assert.strictEqual(r.block, true, `Test 10 FAIL: absolute path from ${cwd} should block`);
      assert.ok(r.reason.includes(lockDir), `Test 10 FAIL: reason should name the run root ${lockDir}`);
    }
    // A stale or absent lock at the named root still allows from elsewhere.
    fs.utimesSync(lockPath, staleTime / 1000, staleTime / 1000);
    assert.strictEqual(decide({ tool_input: { command: absAdd }, cwd: sub }).block, false, 'Test 10 FAIL: stale lock should allow');
    fs.unlinkSync(lockPath);
    assert.strictEqual(decide({ tool_input: { command: absAdd }, cwd: sub }).block, false, 'Test 10 FAIL: absent lock should allow');
    fs.writeFileSync(lockPath, 'locked', 'utf8');
  } finally {
    fs.rmSync(linked, { recursive: true, force: true });
  }

  // Test 11: a quoted absolute path is read whole, spaces included; the named root, not a
  // whitespace-cut fragment of it, is where the lock is looked up. A quoted argument ahead of the
  // path does not leak into the prefix.
  const spaced = fs.mkdtempSync(path.join(tmpDir, 'run lock '));
  const spacedLockDir = path.join(spaced, '.superdev', 'scopes', testScope);
  fs.mkdirSync(spacedLockDir, { recursive: true });
  fs.writeFileSync(path.join(spacedLockDir, 'run.lock'), 'locked', 'utf8');
  const elsewhere = fs.mkdtempSync(path.join(tmpDir, 'run-lock-elsewhere-'));
  try {
    for (const quote of ['"', "'"]) {
      const r = decide({ tool_input: { command: `git worktree add -b "feat x" ${quote}${spaced}/.superdev/scopes/${testScope}/scopetree${quote} fix/x` }, cwd: elsewhere });
      assert.strictEqual(r.block, true, `Test 11 FAIL: ${quote}-quoted absolute path with a space should block`);
      assert.ok(r.reason.includes(spacedLockDir), 'Test 11 FAIL: reason should name the run root with the space');
    }
    fs.unlinkSync(path.join(spacedLockDir, 'run.lock'));
    assert.strictEqual(decide({ tool_input: { command: `git worktree add "${spaced}/.superdev/scopes/${testScope}/scopetree" fix/x` }, cwd: elsewhere }).block, false, 'Test 11 FAIL: absent lock at the spaced root should allow');

    // Test 12: a `~/` or `$HOME/` prefix is not expanded. The run root under the session's
    // working directory is the fail-closed backstop: from the main tree, where a fresh lock sits, both block.
    for (const home of ['~', '$HOME', '${HOME}']) {
      assert.strictEqual(at(`git worktree add ${home}/.superdev/scopes/${testScope}/scopetree fix/x`).block, true, `Test 12 FAIL: ${home} prefix from the main tree should block on its fresh lock`);
    }

    // Test 13: a relative path from a linked-worktree stand-in resolves against that cwd.
    // A fresh lock there blocks, naming that root; with none there, the main tree's lock is not read.
    const own = path.join(elsewhere, '.superdev', 'scopes', testScope);
    fs.mkdirSync(own, { recursive: true });
    assert.strictEqual(decide({ tool_input: { command: add }, cwd: elsewhere }).block, false, 'Test 13 FAIL: no lock in the linked cwd should allow');
    fs.writeFileSync(path.join(own, 'run.lock'), 'locked', 'utf8');
    const rel = decide({ tool_input: { command: add }, cwd: elsewhere });
    assert.strictEqual(rel.block, true, 'Test 13 FAIL: fresh lock in the linked cwd should block');
    assert.ok(rel.reason.includes(own), 'Test 13 FAIL: reason should name the linked cwd run root');
  } finally {
    fs.rmSync(spaced, { recursive: true, force: true });
    fs.rmSync(elsewhere, { recursive: true, force: true });
  }

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
    assertSpawnDecided(required, 'requiring run-lock.js');
    assert.equal(required.status, 0, 'requiring run-lock.js never blocks');
    assert.equal(required.stdout, '', 'requiring run-lock.js prints nothing');
    assert.equal(required.stderr, '', 'requiring run-lock.js runs no decision');

    const spawned = cp.spawnSync(process.execPath, [hookPath], { input: payload, encoding: 'utf8', timeout: 5000 });
    assertSpawnDecided(spawned, 'spawning run-lock.js directly');
    assert.equal(spawned.status, 2, 'spawning run-lock.js directly still blocks on a fresh lock');
    assert.match(spawned.stderr, /another session is running this scope/, 'and still reports the run-lock reason');

    // An absolute path over stdin from a cwd that is no run root: the spawned hook names the run root.
    const away = fs.mkdtempSync(path.join(tmpDir, 'run-lock-away-'));
    try {
      const abs = cp.spawnSync(process.execPath, [hookPath], {
        input: JSON.stringify({ tool_input: { command: absAdd }, cwd: away }), encoding: 'utf8', timeout: 5000,
      });
      assertSpawnDecided(abs, 'spawning run-lock.js with an absolute path');
      assert.equal(abs.status, 2, 'an absolute path blocks over stdin from any cwd');
      assert.ok(abs.stderr.includes(lockDir), 'and the stderr names the run root');
    } finally {
      fs.rmSync(away, { recursive: true, force: true });
    }
  }

  // Parallel slicetrees start their suites together, so the temp root must not be named by
  // `Date.now()`. Pin the clock, pre-create the directory a clock-named root would use, and check
  // tempRoot() neither reuses nor deletes it.
  {
    const realNow = Date.now;
    // A parallel copy of this suite may hold the same millisecond: bump until this run creates the
    // directory, so the cleanup below removes only a directory this run made.
    let now = realNow();
    let clockNamed;
    for (;; now++) {
      clockNamed = path.join(tmpDir, ROOT_PREFIX + now);
      try {
        fs.mkdirSync(clockNamed);
        break;
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
      }
    }
    Date.now = () => now;
    let root;
    try {
      root = tempRoot();
      assert.notStrictEqual(root, clockNamed, 'the temp root is named by Date.now(): shared between parallel runs');
    } finally {
      Date.now = realNow;
      if (root) fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(clockNamed, { recursive: true, force: true });
    }
  }

  // A Git Bash drive path names the run root as the Windows path on win32 (ADR 0150).
  {
    const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    fs.rmSync(lockPath, { force: true });
    const winRoot = path.join(testRunDir, 'C:', 'w', '.superdev', 'scopes', testScope);
    fs.mkdirSync(winRoot, { recursive: true });
    fs.writeFileSync(path.join(winRoot, 'run.lock'), 'locked', 'utf8');
    const cmd = `git worktree add /c/w/.superdev/scopes/${testScope}/scopetree`;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      assert.strictEqual(at(cmd).block, true, 'win32: /c/w resolves as C:/w');
    } finally {
      Object.defineProperty(process, 'platform', realPlatform);
    }
    assert.strictEqual(at(cmd).block, false, 'off win32 the drive path stays');
  }

  // The scanner module cannot load: the guard blocks a scopetree creation and says why (INV-0140).
  {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'rl-noscanner-'));
    try {
      // The copy sits in <dir>/hooks, so its `../lib/shell-words.js` is <dir>/lib/shell-words.js.
      fs.mkdirSync(path.join(dir, 'hooks'));
      fs.mkdirSync(path.join(dir, 'lib'));
      const lone = path.join(dir, 'hooks', 'run-lock.js');
      fs.copyFileSync(hookPath, lone);
      const marker = path.join(dir, 'stub-loaded');
      const scanner = path.join(dir, 'lib', 'shell-words.js');
      const probe = (label, stub) => {
        fs.rmSync(scanner, { force: true });
        fs.rmSync(marker, { force: true });
        // Each stub marks its load first, so the block below follows from the stub and not from a missing file.
        if (stub !== null) fs.writeFileSync(scanner, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x');\n${stub}`);
        const result = cp.spawnSync(process.execPath, [lone], { input: JSON.stringify({ cwd: testRunDir, tool_input: { command: add } }), encoding: 'utf8', timeout: 15000 });
        assertSpawnDecided(result, 'run-lock.js with ' + label);
        assert.strictEqual(fs.existsSync(marker), stub !== null, 'the stub at ../lib/shell-words.js loaded with ' + label);
        assert.strictEqual(result.status, 2, 'a scopetree creation is blocked with ' + label);
        assert.match(result.stderr, /cannot load lib\/shell-words\.js.*Reinstall/, 'and names the broken install with ' + label);
      };
      probe('no lib/shell-words.js', null);
      probe('a shell-words.js that throws on load', "throw new Error('boom');");
      probe('a drivePath that throws', "exports.drivePath = () => { throw new Error('boom'); };");
      // The core loads but its reader module is absent: the core's own require throws.
      probe('a core without lib/shell-word-readers.js', fs.readFileSync(path.join(__dirname, '..', 'plugin', 'lib', 'shell-words.js'), 'utf8'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log('run-lock tests ok');
} finally {
  fs.rmSync(testRunDir, { recursive: true, force: true });
}
