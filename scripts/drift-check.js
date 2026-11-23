#!/usr/bin/env node
'use strict';

// drift-check: the deterministic checks of mechanical facts and forbidden forms across the plugin's
// documents and code (ADR 0153) — a link that resolves to nothing, a duplicated ADR number, a shell
// started against INV-0153 — none of which a build step catches. Every check is registered in
// `drift/checks.js`; this file walks that registry and reports.
//
// `--selftest` runs the checks' own tests (drift/selftest/). Plain invocation runs them against this
// repository, reports every failed check (a check that throws included), then exits nonzero. `--help` or `-h`
// anywhere prints the usage and exits 0; any other argument prints the usage on stderr and exits 2. Either runs
// no check and no selftest.

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

const USAGE = [
  'usage: node scripts/drift-check.js [--selftest]',
  '  (no flag)    runs every registered check against this repository; exits 0 (no drift) or 1 (drift found)',
  '  --selftest   runs the checks\' own tests (scripts/drift/selftest/) instead',
  '  --help, -h   this text; runs nothing',
].join('\n');

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(USAGE);
  } else if (args.some((a) => a !== '--selftest')) {
    console.error(USAGE);
    process.exit(2);
  } else if (args.includes('--selftest')) {
    require('./drift/selftest');
  } else {
    main();
  }
}
