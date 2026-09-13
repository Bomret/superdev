'use strict';

// Selftest for `runChecks`, the per-check walk `scripts/drift-check.js` exports: a thrown check must
// not crash the walk, and every check after it still runs.

module.exports = ({ assert }) => {
  const { runChecks } = require('../../drift-check');

  {
    const order = [];
    const checks = [
      { id: 'before', run: () => { order.push('before'); return []; } },
      { id: 'throws', run: () => { throw new Error('boom'); } },
      { id: 'after', run: () => { order.push('after'); return ['gap-after']; } },
    ];
    const results = runChecks(checks, '/tmp');

    assert.deepEqual(order, ['before', 'after'], 'a check after a throwing one still runs');

    const thrown = results.find((r) => r.check.id === 'throws');
    assert.ok(thrown.threw instanceof Error, 'a thrown error is captured on threw');
    assert.strictEqual(thrown.threw.message, 'boom');
    assert.deepEqual(thrown.gaps, [], 'a throwing check reports no gaps of its own');

    const after = results.find((r) => r.check.id === 'after');
    assert.strictEqual(after.threw, undefined, 'a non-throwing check carries no threw');
    assert.deepEqual(after.gaps, ['gap-after'], 'a non-throwing check after a throw still reports its own gaps');

    const before = results.find((r) => r.check.id === 'before');
    assert.strictEqual(before.threw, undefined, 'a non-throwing check carries no threw');
    assert.deepEqual(before.gaps, [], 'a clean check reports its own empty gaps unaffected');
  }

  console.log('drift-check selftest (runChecks) ok');
};
