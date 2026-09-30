'use strict';

// Selftest for `runChecks`, the per-check walk `scripts/drift-check.js` exports: a thrown check must
// not crash the walk, and every check after it still runs.

module.exports = ({ assert, fs, path, realRoot }) => {
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

  // Registry wiring: `table(id, contracts, ok, opts)` takes four parameters. A fifth or sixth argument
  // is a second check merged into the first one's call, and it registers nothing.
  {
    const src = fs.readFileSync(path.join(realRoot, 'scripts', 'drift', 'checks.js'), 'utf8');
    const argCount = (from) => {
      let depth = 0;
      let args = 1;
      let quote = null;
      for (let i = from; i < src.length; i++) {
        const c = src[i];
        if (quote) {
          if (c === '\\') i++;
          else if (c === quote) quote = null;
        } else if (c === "'" || c === '"' || c === '`') quote = c;
        else if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) {
          if (--depth < 0) return args;
        } else if (c === ',' && depth === 0 && !/^\s*\)/.test(src.slice(i + 1))) args++;
      }
      return args;
    };
    for (const m of src.matchAll(/^ {2}table\(/gm)) {
      const n = argCount(m.index + m[0].length);
      assert.ok(n <= 4, `checks.js: table() at offset ${m.index} carries ${n} arguments; a second check needs its own table() call`);
    }
    const contracts = require('../contracts');
    for (const name of Object.keys(contracts).filter((k) => k.endsWith('_CONTRACTS'))) {
      // A table is consumed by a check in checks.js or by a scanner; either one uses it beyond its import.
      const scanners = fs.readFileSync(path.join(realRoot, 'scripts', 'drift', 'scanners.js'), 'utf8');
      const uses = src.split(name).length + scanners.split(name).length - 2;
      assert.ok(uses >= 2, `${name} is exported by contracts.js but no check or scanner consumes it`);
    }
  }

  console.log('drift-check selftest (runChecks) ok');
};
