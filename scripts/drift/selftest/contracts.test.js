'use strict';

// Selftest suite: the table-driven checks, which run through `lib.js`'s scanContract() over the tables in
// `contracts.js` — change-type, source-sections, and containment-delegation. Run by ./index.js.

const { scanContract } = require('../lib');
const {
  CHANGE_TYPE_CONTRACTS,
  SOURCE_SECTION_CONTRACTS,
  SPECIALISING_SECTIONS,
  specialisingGenericRows,
  CONTAINMENT_DELEGATION_CONTRACTS,
} = require('../contracts');

module.exports = ({ assert, path, fixture, found }) => {
  // --- change-type: the change-type set the prose lists, the hook matches, the glossary restates, and
  // lib/ledger.js validates is one set ---

  const changeType = (files) => found(scanContract(fixture(files), CHANGE_TYPE_CONTRACTS));
  for (const [rel, body, label] of [
    ['references/scope-mode.md', 'one of `feat`, `fix`, `refactor`, `docs`, `perf`, `test`.\n', 'a prose list the hook no longer matches'],
    ['hooks/scope-prune.js', 'const CHANGE_TYPES = /^(feat|fix)$/;\n', 'the hook narrowing away from the stated set'],
    ['lib/ledger.js', "const CHANGE_TYPES = ['feat', 'fix'];\n", 'lib/ledger.js narrowing CHANGE_TYPES away from the stated set'],
    ['CONTEXT.md', '**Change type** — one of `feat`, `fix`, or `docs`.\n', 'a glossary entry that drifted from the owned set'],
  ]) {
    const gaps = changeType({ [rel]: body });
    assert.equal(gaps.length, 1, `flags ${label}`);
    assert.equal(gaps[0].source, path.join(...rel.split('/')), `names ${rel}`);
  }
  assert.equal(
    changeType({
      'CONTEXT.md':
        '**Change type** — one of `feat`, `fix`, `refactor`,\n`docs`, `perf`, `test`, `build`, `ci`,\n`chore`, `style`, or\n`revert`.\n',
    }).length,
    0,
    'a re-wrapped but correct glossary line stays clean',
  );

  // --- source-sections: each canonical reference still carries the sections its readers are sent to ---

  const sourceSectionBodies = {
    'references/plan-contract.md':
      '# Plan contract\n\n## Fields\n\n' +
      '## Slice lifecycle & status\n\n## Scope anchor\n\n## Release\n\n' +
      '## Run state\n\n## Definition of Done ticks\n\n' +
      // the real document carries this one at `###`, with a trailing qualifier
      '### Assignee — store configuration, not a slice field\n\n## Feature label\n',
    'references/plan-authoring.md': '# Plan authoring\n\n## Epic visuals (optional, epic-only)\n\n## Append mode\n',
    'references/store-records.md': '# Store records\n\n## Triage record\n\n## Intent record\n',
    'references/test-selection.md': '# Test selection\n\n## The two commands\n\n## Fallback to the full command\n',
    'references/content-types.md': '# Content types\n\n## The four types\n\n## The conceptual layer\n',
    'references/controlled-prose.md': '# Controlled prose\n\n## Modes\n\n## Self-check\n',
    'references/review-checklist.md': '# Review checklist\n\n## Anti-patterns\n\n## Vulnerability classes\n',
    'references/review-design-lenses.md': '# Review design lenses\n\n## Reuse audit\n\n## Consistency\n',
    'references/prompt-concept-overlap.md': '# Prompt-concept overlap\n\n## Prompt-concept overlap\n',
    'references/scope-branch.md': '# Scope branch work\n\n## Pushing the scope branch\n',
    // the real body carries the output sections inside its fenced template
    'agents/final-reviewer.md':
      '## Scope dispatch\n\n### Judge every criterion\n\n```\n### Criteria\n\n### Ceiling\n\n' +
      '### Fail-to-pass unknown [scope dispatch only]\n```\n',
    'agents/slice-reviewer.md': '## Inherited failures\n',
    'agents/implementer.md': '## Documentation\n',
    'agents/doc-reader.md': '## Pass 1: cold read\n',
  };
  assert.equal(scanContract(fixture(sourceSectionBodies), SOURCE_SECTION_CONTRACTS).length, 0, 'every canonical reference and every cited agent body intact yields zero gaps');

  const pinnedHeadings = [
    ['references/plan-contract.md', '## Fields\n\n'],
    ['references/plan-authoring.md', '## Epic visuals (optional, epic-only)\n\n'],
    ['references/plan-contract.md', '## Slice lifecycle & status\n\n'],
    ['references/plan-authoring.md', '## Append mode\n'],
    ['references/plan-contract.md', '## Scope anchor\n\n'],
    ['references/plan-contract.md', '## Release\n\n'],
    ['references/plan-contract.md', '## Run state\n\n'],
    ['references/plan-contract.md', '## Definition of Done ticks\n\n'],
    ['references/store-records.md', '## Triage record\n\n'],
    ['references/store-records.md', '## Intent record\n'],
    ['references/plan-contract.md', '### Assignee — store configuration, not a slice field\n\n'],
    ['references/plan-contract.md', '## Feature label\n'],
    ['references/test-selection.md', '## The two commands\n\n'],
    ['references/test-selection.md', '## Fallback to the full command\n'],
    ['references/content-types.md', '## The four types\n\n'],
    ['references/content-types.md', '## The conceptual layer\n'],
    ['references/controlled-prose.md', '## Modes\n\n'],
    ['references/controlled-prose.md', '## Self-check\n'],
    ['references/review-checklist.md', '## Anti-patterns\n\n'],
    ['references/review-checklist.md', '## Vulnerability classes\n'],
    ['references/review-design-lenses.md', '## Reuse audit\n\n'],
    ['references/review-design-lenses.md', '## Consistency\n'],
    ['references/prompt-concept-overlap.md', '## Prompt-concept overlap\n'],
    ['references/scope-branch.md', '## Pushing the scope branch\n'],
    ['agents/final-reviewer.md', '### Judge every criterion\n\n'],
    ['agents/final-reviewer.md', '### Criteria\n\n'],
    ['agents/final-reviewer.md', '### Ceiling\n\n'],
    ['agents/final-reviewer.md', '### Fail-to-pass unknown [scope dispatch only]\n'],
    ['agents/slice-reviewer.md', '## Inherited failures\n'],
    ['agents/implementer.md', '## Documentation\n'],
    ['agents/doc-reader.md', '## Pass 1: cold read\n'],
  ];
  assert.equal(pinnedHeadings.length, SOURCE_SECTION_CONTRACTS.length, 'every row in the table has a negative fixture');
  for (const [rel, heading] of pinnedHeadings) {
    const gaps = scanContract(fixture({ ...sourceSectionBodies, [rel]: sourceSectionBodies[rel].replace(heading, '') }), SOURCE_SECTION_CONTRACTS);
    assert.equal(gaps.length, 1, `dropping \`${heading.trim()}\` flags exactly one gap`);
    assert.equal(gaps[0].source, rel, `the gap names ${rel}`);
  }
  assert.equal(
    scanContract(fixture({ ...sourceSectionBodies, 'references/test-selection.md': '# Test selection\n' }), SOURCE_SECTION_CONTRACTS).length,
    2,
    'a reference gutted to its title alone fails every row pinned to it',
  );

  // the generic-side rows are derived from SPECIALISING_SECTIONS: one name added yields its row
  const derivedForNewMember = specialisingGenericRows([...SPECIALISING_SECTIONS, 'Provisional shape']);
  assert.equal(derivedForNewMember.length, SPECIALISING_SECTIONS.length + 1, 'one name added to the list yields exactly one more row');
  const newMemberRow = derivedForNewMember[derivedForNewMember.length - 1];
  assert.equal(newMemberRow[0], path.join('references', 'plan-contract.md'), 'the derived row pins the generic document');
  assert.match('# c\n\n## Provisional shape\n', newMemberRow[1], "the derived row matches the new member's own heading");
  assert.match(newMemberRow[2], /Provisional shape/, 'the derived row names the new member in its expectation');

  // --- containment-delegation (ADR 0053, ADR 0069): lib/kb-containment.js imports and calls lib/containment.js's
  // testContainment rather than reimplementing the ancestry check ---

  const cdOwnTest = scanContract(
    fixture({
      'lib/kb-containment.js':
        'function checkContainment(mainCheckout, scope) {\n' +
        "  const res = spawnSync('git', ['merge-base', '--is-ancestor', branch, base], { cwd: mainCheckout });\n" +
        '  return { performed: true, ok: res.status === 0 };\n' +
        '}\n',
    }),
    CONTAINMENT_DELEGATION_CONTRACTS,
  );
  assert.equal(cdOwnTest.length, 1, 'flags a kb-containment.js that reimplements the ancestry check itself');
  assert.equal(cdOwnTest[0].source, path.join('lib', 'kb-containment.js'), 'names kb-containment.js');
  assert.equal(
    scanContract(
      fixture({ 'lib/kb-containment.js': "const { testContainment } = require('./containment.js');\n// containment is checked some other way below\n" }),
      CONTAINMENT_DELEGATION_CONTRACTS,
    ).length,
    1,
    'an imported but never-called testContainment is not a delegation',
  );
  assert.equal(
    scanContract(
      fixture({
        'lib/kb-containment.js':
          "const { testContainment } = require('./containment.js');\n\n" +
          'function checkContainment(mainCheckout, scope) {\n' +
          '  const verdict = testContainment(mainCheckout, base, branch);\n' +
          "  return { performed: true, ok: verdict === 'contained' };\n" +
          '}\n',
      }),
      CONTAINMENT_DELEGATION_CONTRACTS,
    ).length,
    0,
    'delegating to testContainment yields zero gaps',
  );

  // --- scanContract(): a clause the table spells with single spaces is met across a line break, and a
  // document the table names that is not there is a missing-document gap ---

  const wrapTable = [['skills/x/SKILL.md', /the clause this table pins/, 'state the clause']];
  assert.equal(scanContract(fixture({ 'skills/x/SKILL.md': 'the clause this table pins\n' }), wrapTable).length, 0, 'a clause on one line is met');
  assert.equal(scanContract(fixture({ 'skills/x/SKILL.md': 'the clause this\ntable pins\n' }), wrapTable).length, 0, 'the same clause wrapped across a line break is still met');
  assert.equal(scanContract(fixture({ 'skills/x/SKILL.md': 'the clause this table drops\n' }), wrapTable).length, 1, 'a document that does not state the clause is still a gap');
  assert.deepEqual(scanContract(fixture({ 'README.md': 'x\n' }), wrapTable), [{ source: 'skills/x/SKILL.md', missing: true }], 'an absent document is a missing-document gap');
};
