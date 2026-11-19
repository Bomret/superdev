'use strict';

// run-lock.js: the run lock's reader and its one-hour bound, shared by `open` (lib/plan-open.js) and the `lock` verb, which prints
// `/superdev:implement`'s entry liveness verdict (references/scope-mode.md `## The run lock`, INV-0013). Reads only.

const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const { readLines, getHeader } = require('./ledger.js');

// The age past which a run lock is dead.
const STALENESS_MS = 60 * 60 * 1000;

// The lock's nonce, text, and age in ms, or null when there is no lock. Anything but a regular file or no file refuses.
function readLock(lockPath, verb) {
  let stat;
  let text;
  try {
    stat = fs.lstatSync(lockPath);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    fail(`${verb}: cannot read the run lock ${lockPath}: ${e.code || e.message}`);
  }
  if (!stat.isFile()) {
    const kind = stat.isDirectory() ? 'a directory (EISDIR)' : stat.isSymbolicLink() ? 'a symbolic link' : 'another file type';
    fail(`${verb}: the run lock ${lockPath} is ${kind}, not a regular file`);
  }
  try {
    text = fs.readFileSync(lockPath, 'utf8');
  } catch (e) {
    fail(`${verb}: cannot read the run lock ${lockPath}: ${e.code || e.message}`);
  }
  const m = text.match(/^plan ([0-9a-f]+)\s*$/m);
  return { nonce: m ? m[1] : null, age: Date.now() - stat.mtimeMs, text: text.trim() };
}

// Prints one verdict line for an existing run root: `proceed planned`, `proceed absent`, `proceed stale <age>`, or
// `live <age> <stage> <lock content>`. The age is whole minutes, rounded to the nearest, as `open` reports it, with a `m` suffix.
function verbLock(root) {
  const stage = fs.existsSync(path.join(root, 'ledger.md')) ? getHeader(readLines(root), 'Stage') || 'none' : 'none';
  if (stage === 'planned') return console.log('proceed planned');
  const held = readLock(path.join(root, 'run.lock'), 'lock');
  if (!held) return console.log('proceed absent');
  const age = `${Math.round(held.age / 60000)}m`;
  if (held.age >= STALENESS_MS) return console.log(`proceed stale ${age}`);
  console.log(`live ${age} ${stage} ${held.text.replace(/\s+/g, ' ')}`);
}

module.exports = { STALENESS_MS, readLock, verbLock };
