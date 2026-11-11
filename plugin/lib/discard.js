'use strict';

// discard.js: the `discard` verb (ADR 0208, INV-0181), the one sanctioned removal of a run's ledger and run trace. It removes
// `ledger.md`, `trace.log`, `run.lock`, and the digest sidecar and its lock from a run root that is `<main working tree>/.superdev/scopes/<scope>`, then removes the
// run root when that leaves it empty. It refuses a run whose stage is later than `planned`, and removes nothing on a refusal.
// An absent file or an absent root is no error.

const fs = require('fs');
const path = require('path');
const { fail } = require('./refusal.js');
const { readLedgerHeader } = require('./ledger.js');
const { mainWorkTree } = require('./main-work-tree.js');
const { drivePath } = require('./drive-path.js');

const RUN_FILES = ['ledger.md', 'trace.log', 'run.lock', 'digest.json', 'digest.lock'];

// A path with every existing ancestor's symlinks resolved, so a link inside the scopes directory is judged by its target.
function realish(p) {
  if (fs.existsSync(p)) return fs.realpathSync(p);
  const parent = path.dirname(p);
  return parent === p ? p : path.join(realish(parent), path.basename(p));
}

function verbDiscard(cwd, rootArg) {
  const mwt = mainWorkTree(cwd);
  if (mwt === null) fail(`discard: not inside a git repository (cwd: ${cwd})`);
  const scopes = realish(path.join(mwt, '.superdev', 'scopes'));
  const root = realish(path.resolve(cwd, drivePath(rootArg)));
  if (path.dirname(root) !== scopes) fail(`discard: ${rootArg} is no run root: it must be ${scopes}${path.sep}<scope>`);
  if (!fs.existsSync(root)) return;
  const ledger = path.join(root, 'ledger.md');
  if (fs.existsSync(ledger)) {
    const stage = readLedgerHeader(fs.readFileSync(ledger, 'utf8'), 'Stage');
    if (stage && stage !== 'planned') fail(`discard: the run at ${root} is at stage ${stage}; discard removes only a run at planned`);
  }
  for (const f of RUN_FILES) fs.rmSync(path.join(root, f), { force: true });
  if (fs.readdirSync(root).length === 0) fs.rmdirSync(root);
}

module.exports = { verbDiscard };
