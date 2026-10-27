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

// The hook's outcomes against a loopback https server through the override. The hook calls
// process.exit, so each case is a spawned child, run asynchronously so this process can serve it.
// The server's certificate is a committed self-signed test-only pair for 127.0.0.1 (tests/fixtures/
// test-only-*.pem, valid 100 years, protects nothing), so the child skips verification; no request
// leaves the machine and no external binary is needed.
async function outcomes() {
  const https = require('node:https');
  const fixtures = path.join(__dirname, 'fixtures');

  let requests = 0;
  let answer = (res) => res.end(JSON.stringify({ version: '9.0.0' }));
  const server = https.createServer({
    key: fs.readFileSync(path.join(fixtures, 'test-only-key.pem')),
    cert: fs.readFileSync(path.join(fixtures, 'test-only-cert.pem')),
  }, (req, res) => {
    requests += 1;
    answer(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const remote = `https://127.0.0.1:${server.address().port}/plugin.json`;

  const mk = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const pluginRoot = mk('update-check-root-');
  fs.mkdirSync(path.join(pluginRoot, '.claude-plugin'));
  fs.writeFileSync(path.join(pluginRoot, '.claude-plugin', 'plugin.json'), JSON.stringify({ version: '0.0.1' }));

  // One hook run: resolves with { status, signal, stdout, stderr } once the child exits.
  function run({ root = pluginRoot, dataDir }) {
    const env = Object.assign({}, process.env, {
      CLAUDE_PLUGIN_DATA: dataDir, SUPERDEV_UPDATE_CHECK_REMOTE: remote, NODE_TLS_REJECT_UNAUTHORIZED: '0',
    });
    delete env.CLAUDE_PLUGIN_ROOT;
    if (root) env.CLAUDE_PLUGIN_ROOT = root;
    return new Promise((resolve) => {
      const child = cp.spawn(process.execPath, [hookPath], { env, timeout: 15000 });
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

  // A newer remote prints the notice and stamps the check.
  {
    const d = mk('update-check-data-');
    const r = await run({ dataDir: d });
    exitsClean(r, 'a newer remote');
    assert.match(r.stdout, /^superdev 9\.0\.0 is available \(you have 0\.0\.1\) — update with /, 'the notice names both versions');
    assert.ok(fs.existsSync(stamp(d)), 'the check is stamped');
  }

  // Within 24 h of the stamp no request is made; past it the check runs again.
  {
    const d = mk('update-check-data-');
    fs.writeFileSync(stamp(d), '');
    const before = requests;
    quiet(await run({ dataDir: d }), 'a fresh stamp');
    assert.equal(requests, before, 'a fresh stamp skips the request');
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    fs.utimesSync(stamp(d), old, old);
    const r = await run({ dataDir: d });
    assert.equal(requests, before + 1, 'a stamp older than 24 h checks again');
    assert.match(r.stdout, /is available/, 'and prints the notice');
  }

  // No plugin root, or a root without a readable manifest: exit 0, no request, no stamp.
  {
    const d = mk('update-check-data-');
    const before = requests;
    quiet(await run({ root: null, dataDir: d }), 'a missing CLAUDE_PLUGIN_ROOT');
    const bare = mk('update-check-bare-');
    quiet(await run({ root: bare, dataDir: d }), 'a root with no plugin.json');
    fs.mkdirSync(path.join(bare, '.claude-plugin'));
    fs.writeFileSync(path.join(bare, '.claude-plugin', 'plugin.json'), '{ not json');
    quiet(await run({ root: bare, dataDir: d }), 'an unparseable plugin.json');
    assert.equal(requests, before, 'none of them reaches the server');
    assert.equal(fs.existsSync(stamp(d)), false, 'none of them stamps');
    fs.rmSync(bare, { recursive: true, force: true });
  }

  // A version fetch that answers non-200, non-JSON, or never: quiet exit 0, and the check is stamped.
  for (const [label, handler] of [
    ['a non-200 answer', (res) => { res.statusCode = 500; res.end(JSON.stringify({ version: '9.0.0' })); }],
    ['a non-JSON answer', (res) => res.end('<html>nope</html>')],
    ['no answer', () => {}],
  ]) {
    answer = handler;
    const d = mk('update-check-data-');
    quiet(await run({ dataDir: d }), label);
    assert.ok(fs.existsSync(stamp(d)), `${label} still stamps the check`);
  }

  server.closeAllConnections();
  server.close();
  fs.rmSync(pluginRoot, { recursive: true, force: true });
}

outcomes().then(
  () => console.log('update-check tests ok'),
  (e) => { console.error(e); process.exit(1); }
);
