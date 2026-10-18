'use strict';

// start-stash.js: the run-trace hook's starting-directory stash (ADR 0159, INV-0160): a Bash call's PreToolUse writes the directory it starts in, and its PostToolUse reads it once.

const fs = require('fs');
const os = require('os');
const path = require('path');

// The starting-directory stash (ADR 0159): a Bash call's PostToolUse `cwd` is the directory the command ended in, so its
// PreToolUse writes the `cwd` it started in to a file named by the call's `tool_use_id`, and the PostToolUse reads it once.
// The directory is per user: on a shared /tmp another account's 0700 directory is unusable. Windows has no uid, and its
// temporary directory is per user already.
const STASH_DIR = process.getuid ? `superdev-run-trace-${process.getuid()}` : 'superdev-run-trace';
const stashPath = (id) => (typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id) ? path.join(os.tmpdir(), STASH_DIR, id) : null);
// The stash directory is the hook's own only as a real directory owned by this user: `mkdirSync` accepts one already there,
// and on a shared /tmp another account can create that predictable name first, or a symlink at it. Windows has no uid to check.
function ownDir(dir) {
  try {
    const st = fs.lstatSync(dir);
    return st.isDirectory() && (!process.getuid || st.uid === process.getuid());
  } catch { return false; }
}

// Writes the stash and nothing else: no trace line, no ledger, git, or verification read. Every failure passes (INV-0160).
// The exclusive create never writes through a file or symlink already at the path.
function stashStart(input) {
  const p = stashPath(input.tool_use_id);
  if (!p || typeof input.cwd !== 'string' || !path.isAbsolute(input.cwd)) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
    if (!ownDir(path.dirname(p))) return;
    fs.writeFileSync(p, input.cwd, { flag: 'wx' });
  } catch { /* no stash: the PostToolUse resolves against its own cwd */ }
}

// The stashed starting directory, removed once read; null for none, a symlink, a directory not the hook's own, or content
// that is no absolute path.
function takeStart(id) {
  const p = stashPath(id);
  if (!p || !ownDir(path.dirname(p))) return null;
  let dir = null;
  try {
    const fd = fs.openSync(p, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    try { dir = fs.readFileSync(fd, 'utf8'); } finally { fs.closeSync(fd); }
  } catch { /* unreadable or a symlink */ }
  try { fs.unlinkSync(p); } catch { /* none there */ }
  return dir && path.isAbsolute(dir) ? dir : null;
}

module.exports = { stashStart, takeStart };
