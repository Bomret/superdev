'use strict';

// Selftest suite: the call-citation scanner (`scanners/call-citations.js`). It collects the bold call names the store,
// store plan, and code-host seeds define, and reports a citation of one in a skill, a non-seed reference, or an agent
// that names no backtick `## ` heading in its unit, or names only headings that do not hold the call in every seed of a
// family defining it. Run by ./index.js.

const { scanCallCitations } = require('../scanners');

module.exports = ({ assert, fixture, realRoot }) => {
  // Two store seeds, two store plan seeds, and two code-host seeds. **Read a slice** sits under a different heading in
  // each store seed, so it is exempt. **Close it** sits under `## Triage record` in the store seeds and under
  // `## Close the pull request` in the code-host seeds.
  const store = (conventions) =>
    `# Store\n\n## ${conventions}\n\n- **Read a slice:** read it.\n\n## Triage record\n\n- **List the records:** list.\n` +
    '- **Comment on it** and **Close it:** comment, then close.\n\n## Scope anchor\n\n### Recognise\n\n' +
    '- **List the candidates** (every label): list.\n- **Read an anchor\'s Absorbs line.** Read it.\n\n' +
    '```\n- **Fenced only:** not a call.\n```\n';
  const SEEDS = {
    'plugin/references/issue-tracker-alpha.md': store('REST conventions'),
    'plugin/references/issue-tracker-beta.md': store('tea conventions'),
    'plugin/references/issue-tracker-alpha-plan.md': '# Plan\n\n## Anchor lines\n\n- **Record the Intent line**: write it.\n',
    'plugin/references/issue-tracker-beta-plan.md': '# Plan\n\n## Anchor lines\n\n- **Record the Intent line**: write it.\n',
    'plugin/references/code-management-alpha.md': '# Host\n\n## Close the pull request\n\n- **Close it**: close.\n',
    'plugin/references/code-management-beta.md': '# Host\n\n## Close the pull request\n\n- **Close it**: close.\n',
  };
  const scan = (files, seeds = SEEDS) => scanCallCitations(fixture({ ...seeds, ...files }));
  const one = (text) => scan({ 'plugin/skills/x/SKILL.md': text });

  // --- a heading-less citation is flagged, naming the file, the line, and the call ---
  assert.deepEqual(
    one('# X\n\nRead them with the store\'s **List the records** call.\n'),
    [{ source: 'plugin/skills/x/SKILL.md', line: 3, call: 'List the records', named: [] }],
    'call-citations: a singular citation with no heading is one gap',
  );
  assert.deepEqual(
    one('# X\n\nText.\n\nUse the **List the candidates** and **Read an anchor\'s Absorbs line** calls.\n').map((g) => g.call),
    ['List the candidates', "Read an anchor's Absorbs line"],
    'call-citations: a conjoined citation with no heading flags both calls',
  );
  assert.deepEqual(
    scan({ 'plugin/agents/a.md': 'Close it through the **Close it** call.\n', 'plugin/references/r.md': 'Post with **Comment on it** call.\n' }).map((g) => g.source),
    ['plugin/agents/a.md', 'plugin/references/r.md'],
    'call-citations: agents and non-seed references are read too',
  );

  // --- a named heading must hold the call in every seed of a family defining it ---
  assert.deepEqual(
    one('Use the `## Scope anchor` **List the records** call.\n'),
    [{ source: 'plugin/skills/x/SKILL.md', line: 1, call: 'List the records', named: ['Scope anchor'] }],
    'call-citations: a heading that holds no such call is flagged',
  );
  const lopsided = { ...SEEDS, 'plugin/references/issue-tracker-beta.md': SEEDS['plugin/references/issue-tracker-beta.md'].replace('## Triage record', '## Triage records') };
  assert.equal(
    scan({ 'plugin/skills/x/SKILL.md': 'Use the `## Triage record` **List the records** call.\n' }, lopsided).length,
    0,
    'call-citations: a call whose heading differs between seeds is exempt',
  );
  const oneSeedOnly = { ...SEEDS, 'plugin/references/issue-tracker-gamma.md': '# S\n\n## Gamma\n\n- **Gamma only:** g.\n' };
  assert.equal(
    scan({ 'plugin/skills/x/SKILL.md': 'Make the **Gamma only** call.\n' }, oneSeedOnly).length,
    0,
    'call-citations: a call one seed of the family lacks is exempt',
  );
  const headingInOne = { ...SEEDS, 'plugin/references/issue-tracker-beta.md': SEEDS['plugin/references/issue-tracker-beta.md'] + '\n## Extra\n\n- **Note:** n.\n' };
  assert.equal(
    scan({ 'plugin/skills/x/SKILL.md': 'Use the `## Extra` **List the records** call.\n' }, headingInOne).length,
    1,
    'call-citations: a heading present in one seed only, holding another call, is flagged',
  );

  // --- what passes ---
  for (const [label, text] of [
    ['a citation whose heading sits on the previous wrapped line', 'Read them with the store\'s `## Triage\nrecord` **List the\nrecords** call.\n'],
    ['a citation whose heading sits on the previous line', 'Read them with `## Triage record`\n**List the records** call.\n'],
    ['an exempt call', 'Read it through the store document\'s **Read a slice** call.\n'],
    ['a bold name inside a fence', '```\nthe **List the records** call\n```\n'],
    ['a citation of a name no seed defines', 'Make the **Mark ready** call.\n'],
    ['a fenced-only seed name', 'Make the **Fenced only** call.\n'],
    ['a Close it citation under the store heading', 'Close it through the `## Triage record` **Close it** call.\n'],
    ['a Close it citation under the code-host heading', 'Close it through the `## Close the pull request` **Close it** call.\n'],
    ['a plan seed call under its heading', 'Write it through the `## Anchor lines` **Record the Intent line** call.\n'],
    ['a sentence that keeps going past e.g.', 'For a record, e.g. a triage record, use `## Triage record`, e.g. its **List the records** call.\n'],
    ['a sentence that keeps going past a bold label', '**The read.** Use `## Triage record` then **The list.** its **List the records** call.\n'],
    ['a sentence that keeps going past a period inside a code span', 'Use `## Triage record` and `a. b` with its **List the records** call.\n'],
  ]) {
    assert.deepEqual(one(text), [], `call-citations: ${label} passes`);
  }

  // --- units: a sentence, a table cell, and a list item each stand alone ---
  assert.equal(one('Read `## Triage record`. Then the **List the records** call.\n').length, 1, 'call-citations: a heading in the previous sentence does not count');
  assert.equal(one('| `## Triage record` | the **List the records** call |\n').length, 1, 'call-citations: a heading in another table cell does not count');
  assert.equal(one('- `## Triage record` here.\n- The **List the records** call.\n').length, 1, 'call-citations: a heading in another list item does not count');
  assert.equal(one('- The `## Triage record`\n  **List the records** call.\n').length, 0, 'call-citations: a list item continued on an indented line is one unit');

  // --- a new seed call name is checked with no edit to the check ---
  const withNew = Object.fromEntries(Object.entries(SEEDS).map(([k, v]) => [k, /issue-tracker-[a-z]+\.md$/.test(k) ? v + '\n## Fresh\n\n- **Frobnicate it:** f.\n' : v]));
  assert.equal(scan({ 'plugin/skills/x/SKILL.md': 'Make the **Frobnicate it** call.\n' }, withNew).length, 1, 'call-citations: a new seed call is checked');
  assert.equal(scan({ 'plugin/skills/x/SKILL.md': 'Make the `## Fresh` **Frobnicate it** call.\n' }, withNew).length, 0, 'call-citations: and passes under its heading');

  // --- the seeds themselves are never read as citing prose ---
  assert.equal(scan({ 'plugin/references/issue-tracker-alpha.md': SEEDS['plugin/references/issue-tracker-alpha.md'] + '\nUse the **List the records** call.\n' }).length, 0, 'call-citations: a seed is no citing document');

  // --- the message names the headings a unit named ---
  const check = require('../checks').find((c) => c.id === 'call-citations');
  assert.equal(
    check.format({ source: 'plugin/skills/x/SKILL.md', line: 1, call: 'List the records', named: ['Scope anchor'] }),
    'plugin/skills/x/SKILL.md:1 cites the **List the records** call under `## Scope anchor`, which no seed family holds it under in every seed — name the seed heading that holds it, so `scope.js section` fetches it',
    'call-citations: a wrong heading prints the headings the unit named',
  );

  // --- the shipped tree passes ---
  assert.deepEqual(scanCallCitations(realRoot), [], 'call-citations: every shipped call citation names a heading that holds the call');
};
