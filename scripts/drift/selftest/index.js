'use strict';

// The drift-check selftest. `node scripts/drift-check.js --selftest` runs this; it owns what every
// suite shares — the fixture helper, the real repository root, the temp-dir cleanup, and the
// fixture-coverage assertion — and calls the suites in turn. A suite asserts; it never creates a
// directory of its own.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// scripts/drift/selftest → scripts/drift → scripts → the repository root. Suites that assert against the
// shipped documents (rather than a fixture) read this.
const realRoot = path.join(__dirname, '..', '..', '..');

// A throwaway repository carrying only the documents one assertion exercises: `{ 'skills/x/SKILL.md': '…' }`.
// Every scanner skips a file it cannot read, so a fixture never carries a document it does not test.
// Each directory is recorded and removed below, instead of being left in os.tmpdir() per run.
const created = [];
const fixture = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
  created.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  return dir;
};

// A contract table's "every clause present yields zero gaps" assertion is only worth what its suite's
// fixtures cover: `scanContract()` skips a document it cannot read, so a row whose document no fixture
// ever names is never exercised — the assertion passes vacuously, and the row could match nothing at
// all. Rather than trust a hand-typed list of paths to describe what a suite's fixtures cover — a list
// the fixtures could silently stop matching — `scanContract` is wrapped for the run below, and every
// document a call actually resolves (via `readDoc`, so a `realRoot` call counts too) is recorded against
// the table it belongs to. `tableNames` maps a table back to the constant name `contracts.js` exports it
// under, so the map below never needs one of its own.
const lib = require('../lib');
const tableNames = new Map();
for (const [key, value] of Object.entries(require('../contracts'))) {
  if (Array.isArray(value)) tableNames.set(value, key);
}

const observed = new Map();
const originalScanContract = lib.scanContract;
lib.scanContract = (root, contracts, opts) => {
  let seen = observed.get(contracts);
  if (!seen) {
    seen = new Set();
    observed.set(contracts, seen);
  }
  for (const [rel] of contracts) {
    if (lib.readDoc(root, rel) !== null) seen.add(rel.split(path.sep).join('/'));
  }
  return originalScanContract(root, contracts, opts);
};

const context = { assert, fs, os, path, fixture, realRoot };

try {
  require('./scanners.test')(context);
  require('./chain.test')(context);
  require('./kb-plan.test')(context);
  require('./opencode.test')(context);
  require('./drift-check.test')(context);

  // Every table any suite above scanned gets checked here, once, against what it actually observed —
  // not a curated subset. A table pins rows across many documents, and "a fixture is incomplete" leaves
  // the reader to find which, so both the table and the document are in the message.
  for (const [table, seen] of observed) {
    const name = tableNames.get(table) || 'an unnamed table';
    const missing = [...new Set(table.map(([rel]) => rel.split(path.sep).join('/')))]
      .filter((rel) => !seen.has(rel));
    assert.deepEqual(
      missing,
      [],
      `${name}: its selftest fixtures never resolve ${missing.join(', ')}, so every row pinning that ` +
        'document passes without being exercised',
    );
  }

  console.log('drift-check selftest ok');
} finally {
  lib.scanContract = originalScanContract;
  // A failed assertion leaves the same directories behind as a passing run, so cleanup is in `finally`.
  for (const dir of created) fs.rmSync(dir, { recursive: true, force: true });
}
