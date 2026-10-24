'use strict';

// Selftest suite: the scanners that join the drift registry to its other records (`scanners/register-join.js`):
// the invariant-register join (`invariant-register-join`). A register `Check:` line that
// names a drift id after `scripts/drift-check.js` must name a registered check, and a contract row whose
// expectation cites `INV-NNNN` must pin a document that invariant's `Paths:` covers.

module.exports = ({ assert, path, fixture, realRoot }) => {
  const { scanInvariantRegisterJoin } = require('../scanners');

  const entry = (id, { check = 'none', paths = 'plugin/skills/**' } = {}) =>
    `### ${id}\n\nClass: architecture\nConcepts: Scope branch\nStatement: A rule.\nBreaks: silently\n` +
    `Check: ${check}\n${paths === null ? '' : `Paths: ${paths}\n`}`;
  const register = (...entries) => `# Invariant register\n\n${entries.join('\n')}`;
  const idsOf = (check, ids = ['alpha', 'beta', 'doc-pass']) =>
    scanInvariantRegisterJoin(fixture({ 'docs/invariants.md': register(entry('INV-0001', { check })) }), {
      checkIds: ids,
      tables: {},
    }).map((g) => g.message);

  // Check ids resolve.
  assert.deepStrictEqual(idsOf('scripts/drift-check.js `alpha`, `beta`'), [], 'registered ids on one line pass');
  assert.deepStrictEqual(idsOf('`scripts/drift-check.js` `alpha`; `beta`'), [], 'a quoted path and a registered id pass');
  const bad = idsOf('scripts/drift-check.js `alpha`, `nope`, `beta`, `gone`');
  assert.strictEqual(bad.length, 2, 'every unregistered id on a multi-id line is reported');
  assert.ok(bad[0].includes('INV-0001') && bad[0].includes('`nope`'), 'the gap names the entry and the id');
  assert.ok(bad[1].includes('`gone`'), 'the second unregistered id is named too');
  assert.deepStrictEqual(idsOf('scripts/drift-check.js `alpha` (the `docs set` half) and `doc-pass`'), [], 'prose tokens that are no id shape are no ids');
  assert.strictEqual(idsOf('scripts/drift-check.js `alpha` (and `nope` in prose)').length, 1, 'an id followed by prose is still checked');
  assert.strictEqual(idsOf('tests/a.test.js `nope`; scripts/drift-check.js `nope`').length, 1, 'a segment without the path is not checked');
  assert.deepStrictEqual(idsOf('scripts/drift-check.js `alpha`; tests/x.test.js `nope`'), [], 'a token after `;` belongs to the next segment');
  assert.deepStrictEqual(idsOf('tests/spawn-verdict.test.js — the helper'), [], 'test paths pass');
  assert.deepStrictEqual(idsOf('none'), [], 'none passes');
  assert.deepStrictEqual(idsOf('scripts/drift-check.js — no id named here'), [], 'the path with no id passes');
  assert.deepStrictEqual(idsOf('drift-check `nope`'), [], 'a bare drift-check mention is no path');

  // Cited rows sit inside Paths.
  const rows = (rel, text) => ({ SOME_CONTRACTS: [[rel, /x/, text]] });
  const join = (files, tables, paths) =>
    scanInvariantRegisterJoin(
      fixture({ 'docs/invariants.md': register(entry('INV-0001', { paths })), ...files }),
      { checkIds: [], tables },
    ).map((g) => g.message);
  assert.deepStrictEqual(
    join({ 'plugin/skills/a/SKILL.md': 'x' }, rows('skills/a/SKILL.md', 'do it (INV-0001)'), 'plugin/skills/**'),
    [],
    'a plugin-relative row path covered by a plugin/ glob passes',
  );
  assert.deepStrictEqual(
    join({ 'docs/agents/d.md': 'x' }, rows('docs/agents/d.md', 'do it (INV-0001)'), 'plugin/skills/**, docs/agents/*.md'),
    [],
    'a repo-root row path covered by a later glob passes',
  );
  const out = join({ 'plugin/agents/b.md': 'x' }, rows('agents/b.md', 'do it (INV-0001)'), 'plugin/skills/**');
  assert.strictEqual(out.length, 1, 'a row whose document no glob covers fails');
  assert.ok(
    out[0].includes('INV-0001') && out[0].includes('SOME_CONTRACTS') && out[0].includes('plugin/agents/b.md'),
    'the gap names the entry, the table, and the document',
  );
  assert.strictEqual(
    join({ 'plugin/agents/b.md': 'x' }, rows('agents/b.md', 'a (INV-0001) and (INV-0007)'), 'plugin/agents/**').length,
    1,
    'a citation of an id the register does not carry fails',
  );
  assert.ok(
    join({ 'plugin/agents/b.md': 'x' }, rows('agents/b.md', 'see INV-0007'), 'plugin/agents/**')[0].includes('INV-0007'),
    'the gap names the missing id',
  );
  assert.deepStrictEqual(
    join({}, rows('agents/missing.md', 'do it (INV-0001)'), 'plugin/skills/**'),
    [],
    "a row whose document is absent is scanContract()'s to report",
  );
  assert.deepStrictEqual(
    join({ 'plugin/agents/b.md': 'x' }, rows('agents/b.md', 'no citation here'), 'plugin/skills/**'),
    [],
    'a row citing no invariant is not checked',
  );
  assert.deepStrictEqual(
    join({ 'plugin/agents/b.md': 'x' }, rows('agents/b.md', 'do it (INV-0001)'), null),
    [],
    'an entry with no Paths covers every path, as the register validator reads it',
  );
  assert.strictEqual(
    join({}, rows('docs/invariants.md', 'do it (INV-0001)'), null).length,
    1,
    'an entry with no Paths leaves the register itself out, as the register validator reads it',
  );

  // An absent register is a missing document the check reads.
  assert.deepStrictEqual(
    scanInvariantRegisterJoin(fixture({ 'plugin/agents/b.md': 'x' }), {
      checkIds: [],
      tables: rows('agents/b.md', 'do it (INV-0001)'),
    }),
    [{ source: 'docs/invariants.md', missing: true }],
    'a root with no register reports the register missing',
  );

  // The real repository passes under the real registry and tables.
  assert.deepStrictEqual(scanInvariantRegisterJoin(realRoot), [], 'the real register joins the real registry and tables');

  console.log('drift-check selftest (invariant register join) ok');
};
