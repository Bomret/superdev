'use strict';

// config-doc.js: one `docs/agents/<name>` document read for a configuration value (INV-0213), from the working tree's top
// level or at a commit. A missing document reads as absent. A document that exists but cannot be read, a commit git does
// not hold, a document git cannot read at a held commit, and a git read a signal ended are refusals, never absent.

const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const { localRead, refuseKilled, resolveCommit, fileAt } = require('./git-spawn.js');
const { drivePath } = require('./drive-path.js');

// The text of `docs/agents/<name>`, or null where it is absent: at `at`, a commit-ish git resolves, where one is given;
// otherwise at the top level of the checkout holding `cwd`, so a call from a subdirectory reads the same document, and in
// `cwd` itself where git names no top level. `verb` opens each refusal message. An `at` that git would read as an option
// is refused before any git call. An empty document at a commit reads as absent, since `fileAt` answers '' for both.
function readConfigDoc(cwd, name, at, verb) {
  const rel = `docs/agents/${name}`;
  if (at !== undefined && at !== null) {
    if (at.startsWith('-')) fail(`${verb}: commit "${at}" starts with "-"; git would read it as an option`);
    const commit = resolveCommit(at, cwd);
    if (commit === null) fail(`${verb}: commit ${at} is not in this repository; fetch it first`);
    const text = fileAt(commit, rel, cwd);
    if (text === null) fail(`${verb}: git cannot read ${rel} at ${at}`);
    return text === '' ? null : text;
  }
  const top = localRead(['rev-parse', '--show-toplevel'], cwd);
  refuseKilled('rev-parse', top);
  const root = top.status === 0 && top.stdout.trim() ? drivePath(top.stdout.trim()) : cwd;
  try {
    return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    fail(`${verb}: ${rel} cannot be read (${e.code || e.message})`);
  }
}

module.exports = { readConfigDoc };
