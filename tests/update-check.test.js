'use strict';

// Suite for plugin/hooks/update-check.js. Requires the hook (silent, ADR 0059 / issue #442's
// require.main guard) and calls its exported cmpVersion() directly, the way the hook's own inline
// --selftest used to before this suite moved off the shipped tree (ADR 0059). Needs no network:
// SUPERDEV_UPDATE_CHECK_REMOTE overrides the remote to a loopback port.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

const { assertSpawnDecided } = require('./spawn-verdict');

const hookPath = require.resolve('../plugin/hooks/update-check.js');
const { cmpVersion } = require(hookPath);

// The contract is the sign, not ±1 — localeCompare only promises negative/zero/positive, and the
// one real caller tests `> 0`.
assert.ok(cmpVersion('0.2.0', '0.1.0') > 0, 'newer minor');
assert.ok(cmpVersion('0.1.0', '0.2.0') < 0, 'older minor');
assert.equal(cmpVersion('0.2.0', '0.2.0'), 0, 'equal');
assert.ok(cmpVersion('0.2.1', '0.2') > 0, 'a longer version with the same prefix is newer');
assert.ok(cmpVersion('1.0.0', '0.9.9') > 0, 'major beats minor/patch');
assert.ok(cmpVersion('0.10.0', '0.9.0') > 0, 'numeric, not lexical');

// require.main guard: requiring this hook must never run main() (no stamp file written, no
// stdout), and spawning it directly (as Claude Code's SessionStart invocation does) must still run
// it end to end — stampNow() always runs, network outcome aside, so its stamp file is a reliable
// witness that main() executed.
{
  const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'update-check-root-'));
  fs.mkdirSync(path.join(pluginRoot, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), JSON.stringify({ version: '0.0.1' }));

  const requiredDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-check-data-'));
  const required = cp.spawnSync(process.execPath, ['-e', `require(${JSON.stringify(hookPath)})`], {
    encoding: 'utf8', timeout: 5000,
    env: Object.assign({}, process.env, { CLAUDE_PLUGIN_ROOT: pluginRoot, CLAUDE_PLUGIN_DATA: requiredDataDir }),
  });
  assertSpawnDecided(required, 'requiring update-check.js');
  assert.equal(required.status, 0, 'requiring update-check.js exits cleanly');
  assert.equal(required.stdout, '', 'requiring update-check.js prints nothing');
  assert.equal(fs.existsSync(path.join(requiredDataDir, '.update-check')), false, 'requiring update-check.js checks nothing');

  const spawnedDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-check-data-'));
  const spawned = cp.spawnSync(process.execPath, [hookPath], {
    encoding: 'utf8', timeout: 5000,
    env: Object.assign({}, process.env, {
      CLAUDE_PLUGIN_ROOT: pluginRoot, CLAUDE_PLUGIN_DATA: spawnedDataDir,
      // loopback, nothing listens on this port → instant ECONNREFUSED, no real network reached
      SUPERDEV_UPDATE_CHECK_REMOTE: 'https://127.0.0.1:1/plugin.json',
    }),
  });
  assertSpawnDecided(spawned, 'spawning update-check.js directly');
  assert.equal(spawned.status, 0, 'spawning update-check.js directly still exits 0');
  assert.equal(fs.existsSync(path.join(spawnedDataDir, '.update-check')), true, 'spawning update-check.js directly still stamps the check');

  fs.rmSync(pluginRoot, { recursive: true, force: true });
  fs.rmSync(requiredDataDir, { recursive: true, force: true });
  fs.rmSync(spawnedDataDir, { recursive: true, force: true });
}

// argv[2] === '--selftest' is a global-process condition, not "this file was invoked directly": a
// parent process invoked as `node <parent>.js --selftest` that requires this hook must not run this
// hook's own selftest as a side effect (issue #442 finding 1). Guarded by an env marker so that, if
// the guard is broken, the recursively-triggered inner selftest doesn't spawn a further generation
// of itself — it proves the leak exactly once instead of nesting indefinitely.
if (!process.env.SUPERDEV_ARGV_GUARD_TEST) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-check-argv-'));
  const wrapper = path.join(dir, 'req.js');
  fs.writeFileSync(wrapper, `require(${JSON.stringify(hookPath)});`);
  try {
    const outer = cp.spawnSync(process.execPath, [wrapper, '--selftest'], {
      encoding: 'utf8', timeout: 5000,
      env: Object.assign({}, process.env, { SUPERDEV_ARGV_GUARD_TEST: '1' }),
    });
    assertSpawnDecided(outer, 'a parent process requiring update-check.js under --selftest');
    assert.equal(outer.status, 0, 'a parent whose own argv[2] is --selftest still exits cleanly when it requires update-check.js');
    assert.equal(outer.stdout, '', "and never runs update-check.js's own selftest as a side effect");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log('update-check tests ok');
