'use strict';

// run-digest.js: the digest sidecar of a run root and the lock that keeps it in step with the files it seals (ADR 0225).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// `<run-root>/digest.json` is one JSON object: `ledger` and `trace` are each `{ size, sha256 }` of the whole file as scope.js and the hooks
// last wrote it. A key that is absent seals nothing, so the first check of that file seals it and reports nothing. An unreadable
// sidecar reads as an empty one. The sidecar and its lock are never pushed with the run state.
const SIDECAR = 'digest.json';
// `<run-root>/digest.lock` is created exclusively and removed when the holder is done. A holder keeps it for milliseconds, so a
// lock older than LOCK_STALE_MS belongs to a killed process and is broken. A waiter breaks any lock after LOCK_WAIT_MS, so a
// trace append lands within that bound, well inside a hook's time limit.
const LOCK = 'digest.lock';
const LOCK_STALE_MS = 2000;
const LOCK_WAIT_MS = 5000;

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// The file's bytes, or null when it is absent or unreadable.
function readBytes(file) {
  try {
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}

// The digest of some bytes, or null for no file.
const stateOf = (buf) => (buf === null ? null : { size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') });
const sameState = (a, b) => (a === null || a === undefined || b === null || b === undefined ? a == b : a.size === b.size && a.sha256 === b.sha256);

const validState = (s) => s && typeof s === 'object' && Number.isInteger(s.size) && typeof s.sha256 === 'string';

function readSide(root) {
  let side;
  try {
    side = JSON.parse(fs.readFileSync(path.join(root, SIDECAR), 'utf8'));
  } catch {
    return {};
  }
  if (!side || typeof side !== 'object') return {};
  const out = {};
  for (const k of ['ledger', 'trace']) if (validState(side[k])) out[k] = { size: side[k].size, sha256: side[k].sha256 };
  return out;
}

// Atomic, like the ledger write. A failure is silent: the work this records must not fail for its digest.
function writeSide(root, side) {
  const target = path.join(root, SIDECAR);
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(side) + '\n', 'utf8');
    fs.renameSync(tmp, target);
  } catch {
    // simplicity: silent by design; ceiling: a lost sidecar write leaves the old digest, which the next check reports as a tamper; upgrade: surface the error if that bites
    try { fs.rmSync(tmp, { force: true }); } catch { /* nothing to clean */ }
  }
}

function lockAge(lock) {
  try {
    return Date.now() - fs.statSync(lock).mtimeMs;
  } catch {
    return 0;
  }
}

// simplicity: two waiters that both judge one stale lock can each move it aside, and the later move may take a lock the first waiter
// just created; ceiling: two holders at once for a few milliseconds, which at worst yields one false tamper report; upgrade: a lock directory with an owner record.
function breakLock(lock) {
  const aside = `${lock}.broken-${process.pid}-${Date.now()}`;
  try {
    fs.renameSync(lock, aside);
    fs.rmSync(aside, { force: true });
  } catch { /* the holder released it first */ }
}

// Runs `fn` holding the run's lock. A root the lock cannot be created in (absent, read-only) runs `fn` unlocked.
function withRunLock(root, fn) {
  const lock = path.join(root, LOCK);
  const deadline = Date.now() + LOCK_WAIT_MS;
  let held = false;
  for (;;) {
    try {
      fs.closeSync(fs.openSync(lock, 'wx'));
      held = true;
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') break;
    }
    if (lockAge(lock) > LOCK_STALE_MS || Date.now() >= deadline) breakLock(lock);
    else sleep(5);
  }
  try {
    return fn();
  } finally {
    if (held) fs.rmSync(lock, { force: true });
  }
}

module.exports = { SIDECAR, LOCK, readBytes, stateOf, sameState, readSide, writeSide, withRunLock };
