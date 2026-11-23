#!/usr/bin/env node
'use strict';

// kb-patch.js: the deterministic merge behind a staged page's `action: patch` (ADR 0027).
// Reads a live knowledge-base page and a staged page carrying ONE section, prints the merged
// markdown on stdout, and writes nothing. Exit nonzero with a one-line stderr reason on any
// refusal, the convention scripts/scope.js uses; a missing page path, a third argument, or a flag other than
// `--help` / `-h` adds the usage. `--help` or `-h` anywhere prints the usage on stdout and exits 0, reading no page.
//
// `/superdev:publish-kb` holds the backend credential and calls this; `agents/doc-writer.md`
// stages the section and reaches no backend at all. Keeping the merge here rather than in the
// command's prose is the point: a reader-facing page is not edited by a model reading it.
// The merge and the fence masking live in `../lib/md-sections.js`, which the Definition-of-Done edit and
// the run-state adopt share.

const fs = require('fs');
const { fail } = require('../lib/refusal.js');
const { merge } = require('../lib/md-sections.js');

function readFileOrFail(p, what) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return fail(`cannot read the ${what} page at ${p}`);
  }
}

const USAGE = [
  'usage: node kb-patch.js <live-page.md> <staged-page.md>',
  '  prints the live page with the staged page\'s one section merged in, on stdout; writes nothing',
  '  --help, -h   this text; reads no page',
].join('\n');

function main() {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) {
      process.stdout.write(USAGE + '\n');
      return;
    }
    const extra = args.find((a, i) => a.startsWith('-') || i > 1);
    if (extra !== undefined) fail(`unrecognized argument "${extra}"\n${USAGE}`);
    const [live, staged] = args;
    if (!live || !staged) fail(USAGE);
    process.stdout.write(merge(readFileOrFail(live, 'live'), readFileOrFail(staged, 'staged')));
  } catch (err) {
    if (!err.isRefusal) throw err;
    process.stderr.write(`kb-patch: ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { merge };

if (require.main === module) main();
