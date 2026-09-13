#!/usr/bin/env node
'use strict';

// drift-check: the deterministic cross-document contract checks. Prose (skills/, agents/,
// references/, docs/) drifts from what it restates — a renamed reference file, a dropped clause, a
// glossary entry nobody executes — and no build step catches any of it. Every check that does is
// registered in `drift/checks.js`, in the order `scripts/AGENTS.md` numbers them; this file walks that
// registry and reports.
//
// `--selftest` runs the checks' own tests (drift/selftest/). Plain invocation runs them against this
// repository and exits nonzero on the first gap found.

const path = require('node:path');

const CHECKS = require('./drift/checks');

// Walks every check, catching a thrown run() as that check's own gap instead of crashing the whole
// walk and skipping every check after it in registry order.
function runChecks(checks, root) {
  return checks.map((check) => {
    try {
      return { check, gaps: check.run(root) };
    } catch (err) {
      return { check, gaps: [], threw: err };
    }
  });
}

function main() {
  const root = path.join(__dirname, '..');
  const results = runChecks(CHECKS, root);
  const failed = results.filter((r) => r.threw || r.gaps.length > 0);

  if (failed.length === 0) {
    console.log('drift-check ok: ' + CHECKS.map((c) => c.ok).join(', '));
    process.exit(0);
  }
  for (const { check, gaps, threw } of failed) {
    if (threw) {
      console.error(`${check.id}: run() threw — ${threw.message}`);
      continue;
    }
    for (const gap of gaps) console.error(check.format(gap));
  }
  process.exit(1);
}

module.exports = { runChecks };

if (require.main === module) {
  if (process.argv[2] === '--selftest') {
    require('./drift/selftest');
  } else {
    main();
  }
}
