'use strict';

// run-roots.js: the one scan of `.superdev/scopes/*/` for run roots, resolved through the main working tree (INV-0024), shared by `status` and `candidates`.

const fs = require('fs');
const path = require('path');
const { scopesDirFor } = require('./main-work-tree.js');

// The scopes directory and the names of its run roots: each `.superdev/scopes/*/` directory that holds a `ledger.md`. A missing scopes
// directory holds none.
function scanRunRoots(cwd) {
  const scopesDir = scopesDirFor(cwd);
  let names = [];
  try {
    names = fs
      .readdirSync(scopesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((n) => fs.existsSync(path.join(scopesDir, n, 'ledger.md')));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return { scopesDir, names };
}

module.exports = { scanRunRoots };
