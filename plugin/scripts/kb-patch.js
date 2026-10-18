#!/usr/bin/env node
'use strict';

// kb-patch.js: the deterministic merge behind a staged page's `action: patch` (ADR 0027).
// Reads a live knowledge-base page and a staged page carrying ONE section, prints the merged
// markdown on stdout, and writes nothing. Exit nonzero with a one-line stderr reason on any
// refusal, the convention scripts/scope.js uses.
//
// `/superdev:publish-kb` holds the backend credential and calls this; `agents/doc-writer.md`
// stages the section and reaches no backend at all. Keeping the merge here rather than in the
// command's prose is the point: a reader-facing page is not edited by a model reading it.
// The merge and the fence masking live in `../lib/md-sections.js`, which the Definition-of-Done edit and
// the run-state adopt share.

const fs = require('fs');
const { fail } = require('../lib/refusal.js');
const { maskFencedLines, merge, headingKeyOf } = require('../lib/md-sections.js');

function readFileOrFail(p, what) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return fail(`cannot read the ${what} page at ${p}`);
  }
}

function main() {
  try {
    const [live, staged] = process.argv.slice(2);
    if (!live || !staged) fail('usage: kb-patch.js <live-page.md> <staged-page.md>');
    process.stdout.write(merge(readFileOrFail(live, 'live'), readFileOrFail(staged, 'staged')));
  } catch (err) {
    if (!err.isRefusal) throw err;
    process.stderr.write(`kb-patch: ${err.message}\n`);
    process.exit(1);
  }
}

// `tests/kb-patch.test.js` requires this for `merge` (ADR 0059), and `publish-kb.js` takes the same
// three names from `../lib/md-sections.js`.
module.exports = { maskFencedLines, merge, headingKeyOf };

if (require.main === module) main();
