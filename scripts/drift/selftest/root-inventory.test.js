'use strict';

// Selftest suite: the root AGENTS.md names no lib module, test suite, or superdev agent
// (`scanners/root-inventory.js`). Run by ./index.js.

const { scanRootNoInventory } = require('../scanners');

module.exports = ({ assert, fs, path, fixture, realRoot }) => {
  // A tree with one lib module, one suite, one test helper, and one agent, under the given root text.
  const names = {
    'plugin/lib/ledger.js': '',
    'tests/scope-ledger.test.js': '',
    'tests/fixture-git.js': '',
    'plugin/agents/implementer.md': '',
    'plugin/agents/AGENTS.md': '',
  };
  const tree = (rootText, extra = {}) => fixture({ ...names, 'AGENTS.md': rootText, ...extra });
  const gapsOf = (rootText, extra) => scanRootNoInventory(tree(rootText, extra));

  // --- flagged forms ---
  for (const [label, text, name, line = 3] of [
    ['a lib module name', 'The ledger lives in `ledger.js`.\n', 'ledger.js'],
    ['a lib module path', 'See plugin/lib/ledger.js for it.\n', 'ledger.js'],
    ['a suite name', 'Its cases sit in `tests/scope-ledger.test.js`.\n', 'scope-ledger.test.js'],
    ['a backticked agent', 'Dispatch `implementer` per slice.\n', 'implementer'],
    ['a superdev:<agent> form', 'It dispatches superdev:implementer.\n', 'implementer'],
    ['a name inside a fenced block', '```\nlib/   — ledger.js and the rest\n```\n', 'ledger.js', 4],
  ]) {
    const gaps = gapsOf(`# root\n\n${text}`);
    assert.equal(gaps.length, 1, `${label} is a gap: ${JSON.stringify(gaps)}`);
    assert.equal(gaps[0].source, 'AGENTS.md', `${label}: the gap names the root AGENTS.md`);
    assert.ok(gaps[0].expectation.includes(`\`${name}\``), `${label}: the gap names the offending name`);
    assert.match(gaps[0].expectation, new RegExp(`line ${line}\\b`), `${label}: the gap names the line`);
  }

  // --- forms left alone ---
  for (const [label, text] of [
    ['a clean root', 'Each directory states the rule that fills it.\n'],
    ['a glob', 'It runs every `tests/*.test.js` suite.\n'],
    ['a placeholder', 'Time one with `node tests/<suite>.test.js`, split as `tests/<entry>-<topic>.test.js`.\n'],
    ['a test helper', 'A fixture suite requires `tests/fixture-git.js` at its top.\n'],
    ['a superdev:<skill> form', 'Run `/superdev:implement`, or call the Skill tool with `superdev:implement`.\n'],
    ['the plain word implementer', 'A dispatched implementer writes inside its slicetree.\n'],
    ['a lib name inside a suite or a longer module name', 'See plan-ledger.test.js and scope-ledger.js.\n'],
  ]) {
    assert.deepEqual(gapsOf(`# root\n\n${text}`), [], `${label} is no gap`);
  }

  // --- a hyphenated agent name counts bare; an unhyphenated one does not ---
  const bare = gapsOf('# root\n\nThe doc-reader answers, and a dispatched implementer writes.\n', {
    'plugin/agents/doc-reader.md': '',
  });
  assert.equal(bare.length, 1, `a bare hyphenated agent name is a gap: ${JSON.stringify(bare)}`);
  assert.ok(bare[0].expectation.includes('`doc-reader`'), 'the bare-name gap names the hyphenated agent');
  assert.deepEqual(
    gapsOf('# root\n\nSee `doc-reader`, superdev:doc-reader, and plugin/agents/doc-reader.md.\n', {
      'plugin/agents/doc-reader.md': '',
    }).length,
    3,
    'a hyphenated agent name counts once per place it is named, in any form'
  );

  // --- the name sets are read at scan time, never fixed ---
  const later = gapsOf('# root\n\n`tier.js`, `scope-tier.test.js`, and `doc-reader` arrived later.\n', {
    'plugin/lib/tier.js': '',
    'tests/scope-tier.test.js': '',
    'plugin/agents/doc-reader.md': '',
  });
  assert.equal(later.length, 3, `a module, suite, and agent added to the tree are caught with no edit: ${JSON.stringify(later)}`);

  // --- no silent pass ---
  const noRoot = scanRootNoInventory(fixture(names));
  assert.equal(noRoot.length, 1, 'a missing root AGENTS.md is one gap');
  assert.ok(noRoot[0].missing && noRoot[0].source === 'AGENTS.md', 'a missing root AGENTS.md reports as a missing document');
  for (const [dir, label] of [['plugin/lib', 'lib'], ['tests', 'suite'], ['plugin/agents', 'agent']]) {
    const files = Object.fromEntries(Object.entries(names).filter(([rel]) => !rel.startsWith(`${dir}/`)));
    const gaps = scanRootNoInventory(fixture({ ...files, 'AGENTS.md': '# root\n' }));
    assert.equal(gaps.length, 1, `an absent ${dir} is a gap, never a pass: ${JSON.stringify(gaps)}`);
    assert.ok(!gaps[0].missing && gaps[0].expectation.includes(dir), `the ${label} gap names ${dir}`);
    const emptyDir = fixture({ ...files, 'AGENTS.md': '# root\n', [`${dir}/README.txt`]: '' });
    assert.equal(scanRootNoInventory(emptyDir).length, 1, `a ${dir} holding no ${label} name is a gap, never a pass`);
  }
  const fileForDir = fixture({ ...names, 'AGENTS.md': '# root\n' });
  fs.rmSync(path.join(fileForDir, 'plugin', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(fileForDir, 'plugin', 'agents'), '');
  assert.equal(scanRootNoInventory(fileForDir).length, 1, 'an unreadable name directory is a gap, never a pass');

  // --- the shipped root passes ---
  assert.deepEqual(scanRootNoInventory(realRoot), [], 'the repository root AGENTS.md names no lib module, suite, or agent');
};
