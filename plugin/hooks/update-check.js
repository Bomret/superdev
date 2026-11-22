#!/usr/bin/env node
'use strict';

// update-check: SessionStart notice when a newer superdev is published upstream.
// Compares the installed plugin.json version against the version on the marketplace's
// main branch (GitHub raw). Best-effort and quiet: any error (offline, parse, non-200)
// exits 0 with no output. Names a newer version only when the published `version` is a string of
// the shape major.minor.patch, each segment 1-9 digits, that is numerically greater segment by
// segment; any other value (prerelease, build metadata, non-string, text) prints nothing.
// Throttled to one network check per 24h via a stamp file under CLAUDE_PLUGIN_DATA, so it never
// adds latency to a routine session start. Without CLAUDE_PLUGIN_DATA (always exported by a Claude
// Code plugin hook, which places it outside the plugin root) it makes no request and writes no file.

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const REMOTE = 'https://raw.githubusercontent.com/Bomret/superdev/main/plugin/.claude-plugin/plugin.json';
const CHECK_TTL_MS = 24 * 60 * 60 * 1000;

const RELEASE = /^(\d{1,9})\.(\d{1,9})\.(\d{1,9})$/;

// true when `remote` is a plain release number greater than `local`, segment by segment.
function isNewer(remote, local) {
  const r = typeof remote === 'string' && RELEASE.exec(remote);
  const l = typeof local === 'string' && RELEASE.exec(local);
  if (!r || !l) return false;
  for (let i = 1; i <= 3; i++) {
    if (Number(r[i]) !== Number(l[i])) return Number(r[i]) > Number(l[i]);
  }
  return false;
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
  const dataDir = process.env.CLAUDE_PLUGIN_DATA;
  if (!root || !dataDir || throttled(dataDir)) process.exit(0);
  const local = localVersion(root);
  if (!local) process.exit(0);
  const remote = await fetchRemoteVersion();
  stampNow(dataDir);
  if (isNewer(remote, local)) {
    process.stdout.write(
      `superdev ${remote} is available (you have ${local}) — update with ` +
        '`/plugin marketplace update superdev` then `/plugin update superdev@superdev`.\n'
    );
  }
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { isNewer };
