'use strict';

// The selftest's contract-coverage verdict (index.js asserts it once, after every suite has run).
// `observed` maps a contract table to the set of documents any scan of it resolved; `registry` is the
// drift check list, where a table-driven check carries its table as `contracts`; `tableNames` maps a
// table back to the constant name contracts.js exports it under. A table is at fault when a document it
// pins was never resolved (its rows pass without being exercised), and when the registry declares it but
// no selftest ever scanned it. Every table at fault is reported in one list, never only the first.

const path = require('node:path');

function coverageFailures(observed, registry, tableNames) {
  const nameOf = (table) => tableNames.get(table) || 'an unnamed table';
  const failures = [];
  for (const [table, seen] of observed) {
    const missing = [...new Set(table.map(([rel]) => rel.split(path.sep).join('/')))].filter((rel) => !seen.has(rel));
    if (missing.length > 0) {
      failures.push(
        `${nameOf(table)}: its selftest fixtures never resolve ${missing.join(', ')}, so every row pinning that ` +
          'document passes without being exercised',
      );
    }
  }
  for (const { id, contracts } of registry) {
    if (contracts && !observed.has(contracts)) {
      failures.push(
        `${nameOf(contracts)} (check ${id}): the registry runs this table and no selftest scans it, so none of ` +
          'its rows is exercised',
      );
    }
  }
  return failures;
}

module.exports = { coverageFailures };
