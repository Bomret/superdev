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

// 1 if a>b, -1 if a<b, 0 equal — dotted numeric compare, missing parts count as 0.
function cmpVersion(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
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
  assert.equal(cmpVersion('0.2.0', '0.1.0'), 1, 'newer minor');
  assert.equal(cmpVersion('0.1.0', '0.2.0'), -1, 'older minor');
  assert.equal(cmpVersion('0.2.0', '0.2.0'), 0, 'equal');
  assert.equal(cmpVersion('0.2.1', '0.2'), 1, 'missing patch counts as 0');
  assert.equal(cmpVersion('1.0.0', '0.9.9'), 1, 'major beats minor/patch');
  assert.equal(cmpVersion('0.10.0', '0.9.0'), 1, 'numeric, not lexical');
  console.log('update-check selftest ok');
} else {
  main();
}
