#!/usr/bin/env node
'use strict';

// run-tests: the maintainer-only runner behind `bun run test`. It finds the suites under tests/ by
// their `*.test.js` name, so a suite added to the tree runs with no edit to package.json, runs each
// under `node` (the hooks' production runtime) in name order, and then the fixed tail: the invariant
// register check, the drift selftest, drift-check, and plugin manifest validation. The first failure
// stops the run and exits nonzero, naming what failed. Pure Node, no shell.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const TAIL = [
  [process.execPath, ['scripts/invariant-check.js', '--root', '.']],
  [process.execPath, ['scripts/drift-check.js', '--selftest']],
  [process.execPath, ['scripts/drift-check.js']],
  ['claude', ['plugin', 'validate', './plugin']],
];

// A suite is a `*.test.js` file directly under `dir`. A shared helper (`spawn-verdict.js`) and a
// fixtures directory carry no such name or are not files, so neither runs as a suite.
function discoverSuites(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.test.js'))
    .map((e) => path.join(dir, e.name))
    .sort();
}

// Returns the exit code. A child that was killed or never started carries no status, and that is a
// failure, never a pass (INV-0009).
function runStep(command, args, cwd, label, out) {
  out(`run-tests: ${label}`);
  const r = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (r.status === 0) return 0;
  const why = r.signal ? `killed by ${r.signal}` : r.error ? `did not start: ${r.error.message}` : `exit ${r.status}`;
  out(`run-tests: FAILED ${label} (${why})`);
  return r.status || 1;
}

function runAll({ root, tail = TAIL, out = console.log }) {
  const suites = discoverSuites(path.join(root, 'tests'));
  if (suites.length === 0) {
    out(`run-tests: no suite found under ${path.join(root, 'tests')}`);
    return 1;
  }
  for (const file of suites) {
    const code = runStep(process.execPath, [file], root, path.relative(root, file), out);
    if (code !== 0) return code;
  }
  for (const [command, args] of tail) {
    const code = runStep(command, args, root, [path.basename(command), ...args].join(' '), out);
    if (code !== 0) return code;
  }
  return 0;
}

module.exports = { discoverSuites, runAll, TAIL };

if (require.main === module) {
  process.exitCode = runAll({ root: path.join(__dirname, '..') });
}
