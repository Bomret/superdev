'use strict';

// Selftest suite: RESPONSE_SHAPES_CONTRACTS (ADR 0113, INV-0111, INV-0112). The shipped documents carry
// every clause, and cutting the span one row matches out of its document reports exactly that row.

module.exports = ({ assert, fixture, realRoot }) => {
  const { RESPONSE_SHAPES_CONTRACTS } = require('../contracts');
  const { scanContract, readDoc, normalizeWhitespace } = require('../lib');

  assert.deepEqual(
    scanContract(realRoot, RESPONSE_SHAPES_CONTRACTS),
    [],
    'the shipped documents carry every response-shapes clause',
  );

  const docs = {};
  for (const [rel] of RESPONSE_SHAPES_CONTRACTS) docs[rel] = normalizeWhitespace(readDoc(realRoot, rel));
  assert.deepEqual(scanContract(fixture(docs), RESPONSE_SHAPES_CONTRACTS), [], 'a fixture carrying every clause reports no gap');

  for (const [rel, pattern, expectation] of RESPONSE_SHAPES_CONTRACTS) {
    const cut = { ...docs, [rel]: docs[rel].replace(pattern, 'Nothing here.') };
    assert.notEqual(cut[rel], docs[rel], `the row for ${rel} matches a span to cut: ${expectation}`);
    const gaps = scanContract(fixture(cut), RESPONSE_SHAPES_CONTRACTS);
    assert.equal(gaps.length, 1, `cutting the span for ${expectation} reports exactly one gap`);
    assert.equal(gaps[0].expectation, expectation, 'names the row whose span was cut');
  }
};
