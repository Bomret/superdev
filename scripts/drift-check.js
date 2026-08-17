#!/usr/bin/env node
'use strict';

// drift-check: the deterministic cross-document contract checks. Prose (commands/, agents/,
// references/, docs/) drifts from what it restates — a renamed reference file, a dropped clause, a
// glossary entry nobody executes — and no build step catches any of it. Every check that does is
// registered in `drift/checks.js`, in the order `scripts/AGENTS.md` numbers them; this file walks that
// registry and reports.
//
// `--selftest` runs the checks' own tests (drift/selftest/). Plain invocation runs them against this
// repository and exits nonzero on the first gap found.

const path = require('node:path');

const CHECKS = require('./drift/checks');

function main() {
  const root = path.join(__dirname, '..');
  const results = CHECKS.map((check) => ({ check, gaps: check.run(root) }));
  const failed = results.filter((r) => r.gaps.length > 0);

  if (failed.length === 0) {
    console.log('drift-check ok: ' + CHECKS.map((c) => c.ok).join(', '));
    process.exit(0);
  }
  for (const { check, gaps } of failed) {
    for (const gap of gaps) console.error(check.format(gap));
  }
  process.exit(1);
}

if (process.argv[2] === '--selftest') {
  require('./drift/selftest');
} else {
  main();
}
