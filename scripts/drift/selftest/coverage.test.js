'use strict';

// Selftest suite: contract tables that run in the registry and are exercised nowhere else. A table
// whose pinned documents no fixture resolves passes without being exercised (index.js's coverage
// assertion names it). Each table below gets the three cases every other table has: a fixture carrying
// every clause scans clean, a fixture dropping one row's clause reports exactly that row, and a fixture
// without the pinned documents reports nothing. The fixture's documents are this repository's own, at
// the plugin-relative paths the table spells; a row's clause is dropped by cutting the text its pattern
// matches out of its document.

const COVERED_TABLES = [
  'AFFECTED_FORM_CONTRACTS',
  'WHOLE_REPO_SHIP_CONTRACTS',
  'PLAN_DEPLOY_CONTRACTS',
  'PUBLISH_KB_INVOCATION_CONTRACTS',
  'BACKLOG_SUBMITTED_CONTRACTS',
  'BACKLOG_VERIFY_WRAP_UP_CONTRACTS',
  'DEPLOY_STEP_VISIBILITY_CONTRACTS',
  'CONTAINMENT_PROBE_CONTRACTS',
  'CRITERION_STATES_A_REQUIREMENT_CONTRACTS',
  'ALWAYS_REVIEW_CONTRACTS',
  'CODE_MANAGEMENT_MERGE_CONTRACTS',
  'CODE_MANAGEMENT_HEAD_BRANCH_LOOKUP_CONTRACTS',
  'CODE_MANAGEMENT_PR_BODY_EDIT_CONTRACTS',
  'DEFERRED_RESOLVE_CONTRACTS',
  'SHIP_TESTED_PUSH_CONTRACTS',
  'SHIP_MERGE_PIN_CONTRACTS',
  'SHIP_LEGACY_SHIPPED_CONTRACTS',
  'SHIP_DEPLOY_CONTRACTS',
  'DOCUMENT_SUBMITTED_CONTRACTS',
];

module.exports = ({ assert, fixture, realRoot }) => {
  const { scanContract, readDoc, normalizeWhitespace } = require('../lib');
  const contracts = require('../contracts');

  // Variants of `text` with one character of `pattern`'s match deleted, at the same offset in every place
  // the pattern matches (a clause stated twice in one document needs both cut). Cutting the whole match
  // would take clauses of neighbouring rows with it (the patterns span up to hundreds of characters and
  // overlap), so the drop is the smallest edit that stops this row's pattern matching, tried across the
  // match.
  function* singleCharDrops(text, pattern) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    for (const candidate of [text, normalizeWhitespace(text)]) {
      const found = [...candidate.matchAll(new RegExp(pattern.source, flags))].filter((m) => m[0].length > 0);
      if (found.length === 0) continue;
      const span = Math.min(...found.map((m) => m[0].length));
      for (let offset = 0; offset < span; offset++) {
        let out = candidate;
        for (const m of [...found].reverse()) out = out.slice(0, m.index + offset) + out.slice(m.index + offset + 1);
        yield out;
      }
      return;
    }
  }

  for (const name of COVERED_TABLES) {
    const table = contracts[name];
    assert.ok(Array.isArray(table) && table.length > 0, `${name} is a contract table`);
    const docs = {};
    for (const [rel] of table) {
      docs[rel] = readDoc(realRoot, rel);
      assert.notStrictEqual(docs[rel], null, `${name}: ${rel} exists in the repository`);
    }

    assert.deepEqual(scanContract(fixture(docs), table), [], `${name}: every clause present yields zero gaps`);

    table.forEach(([rel, pattern, expectation], i) => {
      // Exactly that row, when some edit isolates it. A row whose clause sits inside another row's
      // (`run the affected form once on the base branch's own tip` inside a longer pinned sentence)
      // cannot lose its clause alone: the fewest gaps any edit gets is the best bound, and it still
      // has to include this row.
      let best = null;
      for (const cut of singleCharDrops(docs[rel], pattern)) {
        const gaps = scanContract(fixture({ ...docs, [rel]: cut }), table);
        if (!gaps.some((g) => g.expectation === expectation)) continue;
        if (!best || gaps.length < best.length) best = gaps;
        if (best.length === 1) break;
      }
      assert.ok(best, `${name} row ${i}: some edit to its clause in ${rel} makes the scan report it`);
      const own = best.find((g) => g.expectation === expectation);
      assert.strictEqual(own.source, rel, `${name} row ${i}: the gap names ${rel}`);
      assert.ok(best.every((g) => g.source === rel), `${name} row ${i}: every extra gap is a row of ${rel}`);
    });

    assert.deepEqual(scanContract(fixture({}), table), [], `${name}: a fixture without the documents reports no gap`);
  }
};
