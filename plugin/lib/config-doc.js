'use strict';

// config-doc.js: one `docs/agents/<name>` document read for a configuration value (INV-0213), from the working tree's top
// level or at a commit. A missing document reads as absent. A document that exists but cannot be read, a commit git does
// not hold, a document git cannot read at a held commit, and a git read a signal ended are refusals, never absent.

const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const { localRead, refuseKilled, resolveCommit, existsAt } = require('./git-spawn.js');
const { drivePath } = require('./drive-path.js');

// The text of `docs/agents/<name>`, or null where it is absent: at `at`, a commit-ish git resolves, where one is given;
// otherwise at the top level of the checkout holding `cwd`, so a call from a subdirectory reads the same document, and in
// `cwd` itself where git names no top level. `verb` opens each refusal message. An `at` that git would read as an option
// is refused before any git call. An empty document at a commit reads as absent, like a document the commit does not hold.
// A `show` a signal ended refuses with no verdict; where `show` fails otherwise, `existsAt` tells an absent document from a
// git that cannot read it.
function readConfigDoc(cwd, name, at, verb) {
  const rel = `docs/agents/${name}`;
  if (at !== undefined && at !== null) {
    if (at.startsWith('-')) fail(`${verb}: commit "${at}" starts with "-"; git would read it as an option`);
    const commit = resolveCommit(at, cwd);
    if (commit === null) fail(`${verb}: commit ${at} is not in this repository; fetch base first`);
    const shown = localRead(['show', `${commit}:${rel}`], cwd);
    refuseKilled('show', shown);
    const text = shown.status === 0 ? shown.stdout : existsAt(commit, rel, cwd) === false ? '' : null;
    if (text === null) fail(`${verb}: git cannot read ${rel} at ${at}`);
    return text === '' ? null : text;
  }
  const top = localRead(['rev-parse', '--show-toplevel'], cwd);
  refuseKilled('rev-parse', top);
  const root = top.status === 0 && top.stdout.trim() ? drivePath(top.stdout.trim()) : cwd;
  const read = readDocFile(root, name);
  if (read.failure) fail(`${verb}: ${read.failure}`);
  return read.text;
}

// `docs/agents/<name>` under the directory `root`, never throwing: `{ text }`, `{ text: null }` where the file is absent
// (ENOENT), or `{ failure }` naming the error for a file that exists but cannot be read. A library reader that reports
// rather than refuses (the run-state ref operations) takes this form.
function readDocFile(root, name) {
  try {
    return { text: fs.readFileSync(path.join(root, 'docs', 'agents', name), 'utf8') };
  } catch (e) {
    if (e.code === 'ENOENT') return { text: null };
    return { failure: `docs/agents/${name} cannot be read (${e.code || e.message})` };
  }
}

module.exports = { readConfigDoc, readDocFile };
