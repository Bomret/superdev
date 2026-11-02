'use strict';

// Suite for plugin/hooks/update-check.js. Requires the hook (silent, ADR 0059 / issue #442's
// require.main guard) and calls its exported cmpVersion() directly, the way the hook's own inline
// --selftest used to before this suite moved off the shipped tree (ADR 0059). Needs no network:
// a `node --require` preload replaces `https.get` in each spawned hook.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

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

// The hook's outcomes with `https.get` replaced by tests/fixtures/stub-https-get.js, a `node --require` preload in the
// spawned hook, so no request leaves the machine. The stub appends each requested URL to a marker file: its lines
// count the requests and prove the stub ran. The hook calls process.exit, so each case is a spawned child, run
// asynchronously.
const PUBLISHED = 'https://raw.githubusercontent.com/Bomret/superdev/main/plugin/.claude-plugin/plugin.json';

async function outcomes() {
  const stub = path.join(__dirname, 'fixtures', 'stub-https-get.js');
  const mk = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const marker = path.join(mk('update-check-marker-'), 'requests');
  fs.writeFileSync(marker, '');
  const requests = () => fs.readFileSync(marker, 'utf8').split('\n').filter(Boolean);
  const pluginRoot = mk('update-check-root-');
  fs.mkdirSync(path.join(pluginRoot, '.claude-plugin'));
  fs.writeFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), JSON.stringify({ version: '0.0.1' }));

  // One hook run: resolves with { status, signal, stdout, stderr } once the child exits.
  function run({ root = pluginRoot, dataDir, mode = 'newer', env: extra = {} }) {
    const env = Object.assign({}, process.env, {
      CLAUDE_PLUGIN_DATA: dataDir, STUB_HTTPS_MARKER: marker, STUB_HTTPS_MODE: mode,
    }, extra);
    delete env.CLAUDE_PLUGIN_ROOT;
    if (root) env.CLAUDE_PLUGIN_ROOT = root;
    return new Promise((resolve) => {
      const child = cp.spawn(process.execPath, ['--require', stub, hookPath], { env, timeout: 15000 });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (c) => (stdout += c));
      child.stderr.on('data', (c) => (stderr += c));
      child.on('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
    });
  }
  const stamp = (d) => path.join(d, '.update-check');
  const exitsClean = (r, label) => {
    assert.equal(r.signal, null, `${label}: decided before its bound`);
    assert.equal(r.status, 0, `${label}: exits 0`);
  };
  const quiet = (r, label) => {
    exitsClean(r, label);
    assert.equal(r.stdout, '', `${label}: prints nothing`);
  };

  // A newer remote prints the notice and stamps the check. The stub ran, and the one request names the published
  // manifest whatever the environment holds.
  {
    const d = mk('update-check-data-');
    const r = await run({ dataDir: d, env: { SUPERDEV_UPDATE_CHECK_REMOTE: 'https://127.0.0.1:1/plugin.json' } });
    exitsClean(r, 'a newer remote');
    assert.match(r.stdout, /^superdev 9\.0\.0 is available \(you have 0\.0\.1\) — update with /, 'the notice names both versions');
    assert.ok(fs.existsSync(stamp(d)), 'the check is stamped');
    assert.deepEqual(requests(), [PUBLISHED], 'the stub ran, and the request names the published manifest');
  }

  // Within 24 h of the stamp no request is made; past it the check runs again.
  {
    const d = mk('update-check-data-');
    fs.writeFileSync(stamp(d), '');
    const before = requests().length;
    quiet(await run({ dataDir: d }), 'a fresh stamp');
    assert.equal(requests().length, before, 'a fresh stamp skips the request');
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    fs.utimesSync(stamp(d), old, old);
    const r = await run({ dataDir: d });
    assert.equal(requests().length, before + 1, 'a stamp older than 24 h checks again');
    assert.match(r.stdout, /is available/, 'and prints the notice');
  }

  // No plugin root, or a root without a readable manifest: exit 0, no request, no stamp.
  {
    const d = mk('update-check-data-');
    const before = requests().length;
    quiet(await run({ root: null, dataDir: d }), 'a missing CLAUDE_PLUGIN_ROOT');
    const bare = mk('update-check-bare-');
    quiet(await run({ root: bare, dataDir: d }), 'a root with no plugin.json');
    fs.mkdirSync(path.join(bare, '.claude-plugin'));
    fs.writeFileSync(path.join(bare, '.claude-plugin', 'plugin.json'), '{ not json');
    quiet(await run({ root: bare, dataDir: d }), 'an unparseable plugin.json');
    assert.equal(requests().length, before, 'none of them makes a request');
    assert.equal(fs.existsSync(stamp(d)), false, 'none of them stamps');
    fs.rmSync(bare, { recursive: true, force: true });
  }

  // A version fetch that answers non-200, non-JSON, or never: quiet exit 0, and the check is stamped.
  for (const [label, mode] of [['a non-200 answer', '500'], ['a non-JSON answer', 'html'], ['no answer', 'hang']]) {
    const d = mk('update-check-data-');
    const before = requests().length;
    quiet(await run({ dataDir: d, mode }), label);
    assert.ok(fs.existsSync(stamp(d)), `${label} still stamps the check`);
    assert.equal(requests().length, before + 1, `${label}: the stub ran`);
  }

  fs.rmSync(pluginRoot, { recursive: true, force: true });
}

outcomes().then(
  () => console.log('update-check tests ok'),
  (e) => { console.error(e); process.exit(1); }
);
