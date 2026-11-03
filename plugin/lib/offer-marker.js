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
const COMMAND = /^\/superdev:([a-z][a-z-]*)$/;

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

// Records that this turn offered `command` (`/superdev:<name>`). Every failure passes; the exclusive create never writes
// through a file or symlink already at the path.
function writeMarker(sessionId, promptId, command) {
  const prefix = turnPrefix(sessionId, promptId);
  const m = typeof command === 'string' && COMMAND.exec(command);
  if (!prefix || !m) return;
  const dir = markerDir();
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (!ownDir(dir)) return;
    fs.writeFileSync(path.join(dir, prefix + m[1]), '', { flag: 'wx' });
  } catch { /* no marker: the Stop holds once */ }
}

// The commands this turn offered, as `/superdev:<name>`, with the turn's markers removed; an empty set on any failure.
function takeMarkers(sessionId, promptId) {
  const offered = new Set();
  const prefix = turnPrefix(sessionId, promptId);
  const dir = markerDir();
  if (!prefix || !ownDir(dir)) return offered;
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return offered; }
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    try {
      if (fs.lstatSync(path.join(dir, name)).isFile()) offered.add(`/superdev:${name.slice(prefix.length)}`);
    } catch { /* gone */ }
    try { fs.unlinkSync(path.join(dir, name)); } catch { /* gone */ }
  }
  return offered;
}

module.exports = { writeMarker, takeMarkers };
