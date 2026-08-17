'use strict';

// The drift-check selftest. `node scripts/drift-check.js --selftest` runs this; it owns what every
// suite shares — the fixture helper, the real repository root, and the temp-dir cleanup — and calls the
// suites in turn. A suite asserts; it never creates a directory of its own.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// scripts/drift/selftest → scripts/drift → scripts → the repository root. Suites that assert against the
// shipped documents (rather than a fixture) read this.
const realRoot = path.join(__dirname, '..', '..', '..');

// A throwaway repository carrying only the documents one assertion exercises: `{ 'commands/x.md': '…' }`.
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

const context = { assert, fs, os, path, fixture, realRoot };

try {
  require('./scanners.test')(context);
  require('./chain.test')(context);
  require('./kb-plan.test')(context);
  console.log('drift-check selftest ok');
} finally {
  // A failed assertion leaves the same directories behind as a passing run, so cleanup is in `finally`.
  for (const dir of created) fs.rmSync(dir, { recursive: true, force: true });
}
