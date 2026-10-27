#!/usr/bin/env node
'use strict';

// drift-check: the deterministic checks of mechanical facts and forbidden forms across the plugin's
// documents and code (ADR 0153) — a link that resolves to nothing, a duplicated ADR number, a shell
// started against INV-0153 — none of which a build step catches. Every check is registered in
// `drift/checks.js`; this file walks that registry and reports.
//
// `--selftest` runs the checks' own tests (drift/selftest/). Plain invocation runs them against this
// repository, reports every failed check (a check that throws included), then exits nonzero.

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

// A gap a check marks `missing` names a document the check reads and cannot find; every other gap is
// printed by the check's own format.
function formatGap(check, gap) {
  return gap.missing ? `${gap.source} is missing — the \`${check.id}\` check reads it` : check.format(gap);
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
    for (const gap of gaps) console.error(formatGap(check, gap));
  }
  process.exit(1);
}

module.exports = { runChecks, formatGap };

if (require.main === module) {
  if (process.argv[2] === '--selftest') {
    require('./drift/selftest');
  } else {
    main();
  }
}
