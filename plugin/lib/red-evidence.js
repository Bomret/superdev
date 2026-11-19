'use strict';

// red-evidence.js: the `red-evidence` verb, the scope review's red-evidence reading (`references/review-scope-mode.md`'s
// `### 4.2 Red evidence`): the ledger's red suite record and the check status of a pull-request head, read and judged without a
// write to the run, the ledger, or git.

const path = require('path');
const { fail } = require('./refusal.js');
const { readLines, getHeader } = require('./ledger.js');
const { drivePath } = require('./drive-path.js');
const { traceFlags } = require('./trace-window.js');
const { gitReads, failedRecord } = require('./suite-base-get.js');

// The ledger's suite record as `{ result, sha }`, or null where the ledger holds none; refuses an unreadable record.
function suiteRecord(root) {
  const raw = getHeader(readLines(root), 'Suite');
  if (!raw) return null;
  const m = raw.match(/^(\S+)\s+@\s+(\S+)(?:\s+whole)?$/);
  if (!m) fail(`red-evidence: unreadable suite record: ${raw}`);
  return { result: m[1], sha: m[2] };
}

// The lines the local suite record raises: `red <sha> files=<failed files>` where the record reads red at the tip or at an ancestor
// of it. The `Failed` record names files only where it carries the record's own full SHA.
function localLines(g, root, branch, record) {
  const tip = g.commit(branch);
  if (!tip) fail(`red-evidence: branch "${branch}" does not resolve to a commit`);
  if (record.result !== 'red') return [];
  if (record.sha !== tip && !g.isAncestor(record.sha, tip)) return [];
  const failed = failedRecord(root);
  const files = failed && failed.sha === record.sha ? failed.files : [];
  return [`red ${record.sha} files=${files.join(' ')}`];
}

// `red-evidence --root <run-root> --branch <branch> --base <base-ref>`, run in the scope checkout: prints one line per finding,
// `none` where it read and found nothing, and `nothing-to-read` where the ledger holds no suite record.
function verbRedEvidence(cwd, args) {
  const { flags } = traceFlags('red-evidence', args, ['--root', '--branch', '--base'], false);
  for (const need of ['--root', '--branch', '--base']) if (!flags[need]) fail(`red-evidence needs ${need} <value>`);
  const root = path.resolve(cwd, drivePath(flags['--root']));
  const g = gitReads(cwd);
  const record = suiteRecord(root);
  if (!record) {
    console.log('nothing-to-read');
    return;
  }
  const lines = localLines(g, root, flags['--branch'], record);
  console.log(lines.length ? lines.join('\n') : 'none');
}

module.exports = { verbRedEvidence };
