'use strict';

// Selftest suite: the contract-coverage observation itself. `lib.observeContracts` is the seam the
// selftest's coverage assertion installs, `coverageFailures` is the assertion's verdict, and the cases
// here pin what the two promise: an observer sees a call whichever module loaded first, restoring
// returns the previous observer, and a verdict names every unexercised table in one report.

module.exports = ({ assert, fixture }) => {
  const lib = require('../lib');
  const { coverageFailures } = require('./coverage');

  const TABLE = [['references/a.md', /alpha/, 'say alpha']];
  const OTHER = [['references/b.md', /beta/, 'say beta']];
  const root = fixture({ 'references/a.md': 'alpha\n', 'references/b.md': 'beta\n' });

  // A reference to scanContract taken before any observer exists — the way checks.js holds it — is
  // observed all the same: the seam is read inside the call, not at the reference.
  const held = lib.scanContract;
  {
    const seen = [];
    const restore = lib.observeContracts((r, contracts) => seen.push(contracts));
    held(root, TABLE);
    lib.scanContract(root, OTHER);
    restore();
    assert.deepEqual(seen, [TABLE, OTHER], 'an observer sees a call made through a reference held before it');
    held(root, TABLE);
    assert.strictEqual(seen.length, 2, 'after the restore call, nothing is observed');
  }

  // Restoring returns the previous observer, so a second observation in one process behaves like the first.
  {
    const outer = [];
    const inner = [];
    const restoreOuter = lib.observeContracts((r, contracts) => outer.push(contracts));
    const restoreInner = lib.observeContracts((r, contracts) => inner.push(contracts));
    held(root, TABLE);
    restoreInner();
    held(root, OTHER);
    restoreOuter();
    held(root, TABLE);
    assert.deepEqual(inner, [TABLE]);
    assert.deepEqual(outer, [OTHER], 'the outer observer is back once the inner one is restored');
  }

  // The verdict reports every table at fault in one run: a table with an unresolved document and a table
  // the registry declares but nothing scanned.
  {
    const names = new Map([[TABLE, 'TABLE_A'], [OTHER, 'TABLE_B']]);
    const registry = [{ id: 'a', contracts: TABLE }, { id: 'b', contracts: OTHER }, { id: 'no-table' }];
    const failures = coverageFailures(new Map([[TABLE, new Set()]]), registry, names);
    assert.strictEqual(failures.length, 2, 'both tables are reported in one run, not only the first');
    assert.match(failures[0], /TABLE_A.*references\/a\.md/);
    assert.match(failures[1], /TABLE_B.*no selftest scans/);
    assert.deepEqual(
      coverageFailures(new Map([[TABLE, new Set(['references/a.md'])], [OTHER, new Set(['references/b.md'])]]), registry, names),
      [],
      'a registry whose tables were all scanned against every pinned document reports nothing',
    );
  }

  // A table-driven check declares its table, so the verdict sees it.
  {
    const checks = require('../checks');
    const contracts = require('../contracts');
    const declared = {
      'source-sections': 'SOURCE_SECTION_CONTRACTS',
      'change-type': 'CHANGE_TYPE_CONTRACTS',
      'containment-delegation': 'CONTAINMENT_DELEGATION_CONTRACTS',
    };
    for (const [id, name] of Object.entries(declared)) {
      assert.strictEqual(checks.find((c) => c.id === id).contracts, contracts[name], `check ${id} declares ${name}`);
    }
  }
};
