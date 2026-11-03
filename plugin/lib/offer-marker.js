'use strict';

// offer-marker.js: the offer-guard hook's markers (ADR 0213, INV-0183): an offer call's PostToolUse writes one marker per
// offered command, keyed by session and turn, and the Stop reads and removes the turn's markers.

const fs = require('fs');
const os = require('os');
const path = require('path');

// The marker directory is per user: on a shared /tmp another account's 0700 directory is unusable. Windows has no uid, and
// its temporary directory is per user already.
const MARKER_DIR = process.getuid ? `superdev-offer-guard-${process.getuid()}` : 'superdev-offer-guard';
const ID = /^[A-Za-z0-9_-]+$/;
const NAME = /^[a-z][a-z-]*$/;
const STALE_MS = 24 * 60 * 60 * 1000;

// A marker file is `<session>.<prompt>.<command name>`; the ids are checked before any path is built.
function turnPrefix(sessionId, promptId) {
  return typeof sessionId === 'string' && ID.test(sessionId) && typeof promptId === 'string' && ID.test(promptId)
    ? `${sessionId}.${promptId}.`
    : null;
}
const markerDir = () => path.join(os.tmpdir(), MARKER_DIR);

// The directory is the hook's own only as a real directory owned by this user: on a shared /tmp another account can create
// that predictable name first, or a symlink at it. Windows has no uid to check.
function ownDir(dir) {
  try {
    const st = fs.lstatSync(dir);
    return st.isDirectory() && (!process.getuid || st.uid === process.getuid());
  } catch { return false; }
}

// Records that this turn offered the command `name` (`/superdev:<name>`). Every failure passes; the exclusive create never
// writes through a file or symlink already at the path.
function writeMarker(sessionId, promptId, name) {
  const prefix = turnPrefix(sessionId, promptId);
  if (!prefix || typeof name !== 'string' || !NAME.test(name)) return;
  const dir = markerDir();
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (!ownDir(dir)) return;
    fs.writeFileSync(path.join(dir, prefix + name), '', { flag: 'wx' });
  } catch { /* no marker: the Stop holds once */ }
}

// The command names this turn offered, with the turn's markers and every marker older than one day removed (a turn that
// never reaches Stop leaves its markers behind). Null when an id is unusable; an empty set on any other failure.
function takeMarkers(sessionId, promptId) {
  const offered = new Set();
  const prefix = turnPrefix(sessionId, promptId);
  if (!prefix) return null;
  const dir = markerDir();
  if (!ownDir(dir)) return offered;
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return offered; }
  for (const name of names) {
    const file = path.join(dir, name);
    let st;
    try { st = fs.lstatSync(file); } catch { continue; }
    if (name.startsWith(prefix)) {
      if (st.isFile()) offered.add(name.slice(prefix.length));
    } else if (Date.now() - st.mtimeMs <= STALE_MS) continue;
    try { fs.unlinkSync(file); } catch { /* gone */ }
  }
  return offered;
}

module.exports = { writeMarker, takeMarkers };
