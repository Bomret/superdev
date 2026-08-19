#!/usr/bin/env node
'use strict';

// update-check: SessionStart notice when a newer superdev is published upstream.
// Compares the installed plugin.json version against the version on the marketplace's
// main branch (Codeberg raw). Best-effort and quiet: any error (offline, parse, non-200)
// exits 0 with no output. Throttled to one network check per 24h via a stamp file under
// CLAUDE_PLUGIN_DATA, so it never adds latency to a routine session start.

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const REMOTE = 'https://codeberg.org/bomret/superdev/raw/branch/main/plugin/.claude-plugin/plugin.json';
const CHECK_TTL_MS = 24 * 60 * 60 * 1000;

// Positive if a>b, negative if a<b, 0 equal — numeric collation compares each dotted segment as a
// number. The locale is fixed so the ordering never varies with the host.
function cmpVersion(a, b) {
  return String(a).localeCompare(String(b), 'en', { numeric: true });
}

function localVersion(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

function fetchRemoteVersion() {
  return new Promise((resolve) => {
    const req = https.get(REMOTE, { timeout: 2000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body).version);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

// true if the last check was within the TTL — skip the network this session.
function throttled(dataDir) {
  try {
    const age = Date.now() - fs.statSync(path.join(dataDir, '.update-check')).mtimeMs;
    return age < CHECK_TTL_MS;
  } catch {
    return false;
  }
}

function stampNow(dataDir) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, '.update-check'), '');
  } catch {
    /* ignore — a missing stamp just means we check again next session */
  }
}

async function main() {
  const root = process.env.CLAUDE_PLUGIN_ROOT;
  const dataDir = process.env.CLAUDE_PLUGIN_DATA || path.join(root || '.', '.data');
  if (!root || throttled(dataDir)) process.exit(0);
  const local = localVersion(root);
  if (!local) process.exit(0);
  const remote = await fetchRemoteVersion();
  stampNow(dataDir);
  if (remote && cmpVersion(remote, local) > 0) {
    process.stdout.write(
      `superdev ${remote} is available (you have ${local}) — update with ` +
        '`/plugin marketplace update superdev` then `/plugin update superdev@superdev`.\n'
    );
  }
  process.exit(0);
}

if (process.argv[2] === '--selftest') {
  const assert = require('node:assert');
  // The contract is the sign, not ±1 — localeCompare only promises negative/zero/positive, and the
  // one real caller tests `> 0`.
  assert.ok(cmpVersion('0.2.0', '0.1.0') > 0, 'newer minor');
  assert.ok(cmpVersion('0.1.0', '0.2.0') < 0, 'older minor');
  assert.equal(cmpVersion('0.2.0', '0.2.0'), 0, 'equal');
  assert.ok(cmpVersion('0.2.1', '0.2') > 0, 'a longer version with the same prefix is newer');
  assert.ok(cmpVersion('1.0.0', '0.9.9') > 0, 'major beats minor/patch');
  assert.ok(cmpVersion('0.10.0', '0.9.0') > 0, 'numeric, not lexical');
  console.log('update-check selftest ok');
} else {
  main();
}
