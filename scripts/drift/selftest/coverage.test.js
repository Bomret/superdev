'use strict';

// Selftest suite: the one harness every contract table that needs no bespoke fixture goes through. A
// table whose pinned documents no fixture resolves passes without being exercised (index.js's coverage
// assertion names it). Each table named in COVERED_TABLES gets two cases: a fixture carrying every clause
// scans clean, and a fixture cutting the span one row matches reports that row. The fixture's documents
// are this repository's own, at the plugin-relative paths the table spells. Every exported contract
// table, covered or not, also scans clean over a fixture without its documents. The real tree is
// drift-check's to scan, never a selftest's.

const COVERED_TABLES = [
  'AFFECTED_FORM_CONTRACTS',
  'WHOLE_REPO_SHIP_CONTRACTS',
  'PLAN_DEPLOY_CONTRACTS',
  'REPAIRS_LINE_CONTRACTS',
  'PLAN_REPAIR_CONTRACTS',
  'REPAIR_ROUTING_CONTRACTS',
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
  'RESPONSE_SHAPES_CONTRACTS',
  'AGENT_LENS_LIST_CONTRACTS',
  'DEPLOYMENT_CONTRACTS',
  'FIX_BOUNDARY_CONTRACTS',
  'PLAN_DERIVES_CRITERIA_CONTRACTS',
  'FIX_LOOP_FIXES_EVERY_FINDING_CONTRACTS',
  'BLIND_SLICE_REVIEW_CONTRACTS',
  'RUN_TRACE_ORDER_CONTRACTS',
  'SETUP_TEST_PATHS_CONTRACTS',
  'DEPENDENCY_RECORD_CONTRACTS',
  'CONFLICT_CONCLUSION_CONTRACTS',
  'SHIP_OFFER_CONTRACTS',
  'INVOCATION_START_CONTRACTS',
];

// Rows no edit isolates, as `TABLE row N` (the span cut and every single-character drop both report a
// neighbouring row too): another row's pattern contains the row's clause, so every edit that breaks it
// breaks that neighbour too. Such a row only has to be among the gaps of its own document.
// A row missing from this list is held to exactly one gap, and a listed row that an edit now isolates
// fails the harness until it leaves the list.
const NOT_ISOLATABLE = new Set([
  'AFFECTED_FORM_CONTRACTS row 10',
  'SHIP_DEPLOY_CONTRACTS row 17',
  'PLAN_DERIVES_CRITERIA_CONTRACTS row 7',
  'PLAN_DERIVES_CRITERIA_CONTRACTS row 15',
]);

module.exports = ({ assert, fixture, realRoot }) => {
  const { scanContract, readDoc, docPath, normalizeWhitespace, observeContracts } = require('../lib');
  const fs = require('node:fs');
  const contracts = require('../contracts');

  // Variants of `text` with one character of `pattern`'s match deleted, at the same offset in every place
  // the pattern matches (a clause stated twice in one document needs both cut), tried across the match.
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

    const root = fixture(docs);
    assert.deepEqual(scanContract(root, table), [], `${name}: every clause present yields zero gaps`);

    table.forEach(([rel, pattern, expectation], i) => {
      const row = `${name} row ${i}`;
      // Editing one document changes only the rows pinned on it, so only those are scanned, this row
      // first and the rest only while no other row has gapped yet.
      const ownRows = table.filter(([r]) => r === rel);
      const rest = ownRows.filter((r) => r[2] !== expectation);
      const alone = (cut) => {
        // One fixture per table: only the cut document is rewritten, and restored for the next row.
        fs.writeFileSync(docPath(root, rel), cut);
        try {
          const own = scanContract(root, [[rel, pattern, expectation]]);
          if (own.length === 0) return { gaps: [], isolated: false };
          const others = [];
          for (const r of rest) {
            others.push(...scanContract(root, [r]));
            if (others.length > 0) break;
          }
          return { gaps: [...own, ...others], isolated: others.length === 0 };
        } finally {
          fs.writeFileSync(docPath(root, rel), docs[rel]);
        }
      };
      // First try: cut the span the row matches, everywhere it matches, in the document's own text or,
      // when the pattern only matches across wrapped lines, in its whitespace-normalized text.
      const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
      const text = pattern.test(docs[rel]) ? docs[rel] : normalizeWhitespace(docs[rel]);
      const cut = text.replace(new RegExp(pattern.source, flags), '');
      assert.notStrictEqual(cut, text, `${row}: ${rel} holds a span the row matches`);
      const first = alone(cut);
      let isolated = first.isolated;
      if (!isolated) {
        // Second try: the smallest edit that stops this row matching, which can leave a neighbour's
        // clause whole where the span cut took it along.
        for (const drop of singleCharDrops(docs[rel], pattern)) {
          if (alone(drop).isolated) {
            isolated = true;
            break;
          }
        }
      }
      if (isolated) {
        assert.ok(!NOT_ISOLATABLE.has(row), `${row}: an edit isolates it, so it leaves NOT_ISOLATABLE`);
        return;
      }
      assert.ok(NOT_ISOLATABLE.has(row), `${row}: no edit to ${rel} makes the scan report that row alone`);
      assert.ok(
        first.gaps.some((g) => g.expectation === expectation && g.source === rel),
        `${row}: cutting its span from ${rel} makes the scan report it`,
      );
    });
  }

  // `scanContract()` skips a document it cannot read, so an empty fixture yields no gap from any table.
  // The scans below resolve no document, so they stay out of the coverage observation (a table only
  // scanned here would read as scanned and left unexercised).
  const empty = fixture({});
  const restore = observeContracts(() => {});
  try {
    for (const [name, table] of Object.entries(contracts)) {
      if (!name.endsWith('_CONTRACTS') || !Array.isArray(table)) continue;
      assert.deepEqual(scanContract(empty, table), [], `${name}: a fixture without the documents reports no gap`);
    }
  } finally {
    restore();
  }
};
