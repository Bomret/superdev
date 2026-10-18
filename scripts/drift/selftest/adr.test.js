'use strict';

// Selftest suite: the scanners over `docs/adr/` (`scanners/adr.js`) — status lines, unique numbers, and
// paired relation headers. Run by ./index.js.

const { scanAdrStatus, scanAdrNumbers, scanAdrRelations } = require('../scanners');
const { ADR_STATUSES } = require('../contracts');

module.exports = ({ assert, path, fixture }) => {
  // --- adr-status: every ADR states a status ---

  const adrBody = (status) =>
    `# 0099 — A decision\n\n${status ? `**Status:** ${status}\n\n` : ''}## Context\n\nSomething.\n`;

  const adrGaps1 = scanAdrStatus(fixture({ 'docs/adr/0099-a-decision.md': adrBody(null) }));
  assert.equal(adrGaps1.length, 1, 'flags an ADR that states no status');
  assert.equal(adrGaps1[0].source, path.join('docs', 'adr', '0099-a-decision.md'), 'names the ADR');
  assert.equal(scanAdrStatus(fixture({ 'docs/adr/0099-a.md': adrBody('Draft') })).length, 1, 'an unrecognised status value is flagged');
  assert.equal(scanAdrStatus(fixture({ 'docs/adr/0099-a.md': adrBody('accepted') })).length, 1, 'a lowercase status value is flagged');
  assert.equal(
    scanAdrStatus(fixture({ 'docs/adr/0099-a.md': '# 0099 — A\n\nThis ADR is Accepted in practice.\n' })).length,
    1,
    'a prose mention is not the status line',
  );
  for (const status of ADR_STATUSES) {
    assert.equal(scanAdrStatus(fixture({ 'docs/adr/0099-a.md': adrBody(status) })).length, 0, `\`${status}\` satisfies the contract`);
  }
  assert.deepEqual(
    scanAdrStatus(
      fixture({
        'docs/adr/0098-a.md': adrBody(null),
        'docs/adr/0099-b.md': adrBody('Accepted'),
        'docs/adr/0100-c.md': adrBody('accepted'),
      }),
    ).map((g) => path.basename(g.source)),
    ['0098-a.md', '0100-c.md'],
    'both offenders reported, in filename order, and the compliant ADR is not',
  );
  assert.equal(scanAdrStatus(fixture({ 'docs/adr/README.txt': 'no status here' })).length, 0, 'a non-markdown file is skipped');
  assert.equal(scanAdrStatus(fixture({ 'README.md': '# repo\n' })).length, 0, 'an absent ADR tree holds nothing to scan');

  // --- adr-numbers: no two ADRs share a number (ADR 0126) ---

  const dupGaps = scanAdrNumbers(
    fixture({ 'docs/adr/0007-a.md': '# 0007\n', 'docs/adr/0007-b.md': '# 0007\n', 'docs/adr/0008-c.md': '# 0008\n' }),
  );
  assert.equal(dupGaps.length, 1, 'flags one shared number once');
  assert.match(dupGaps[0].expectation, /0007/, 'names the number');
  assert.match(dupGaps[0].expectation, /0007-a\.md/, 'names the first file');
  assert.match(dupGaps[0].expectation, /0007-b\.md/, 'names the second file');
  assert.equal(
    scanAdrNumbers(fixture({ 'docs/adr/0007-a.md': '# 0007\n', 'docs/adr/0008-b.md': '# 0008\n' })).length,
    0,
    'distinct numbers pass',
  );
  assert.equal(scanAdrNumbers(fixture({ 'README.md': 'x\n' })).length, 0, 'no ADR directory passes');

  // --- adr-relations: a relation header pairs with the reverse header on its target (ADR 0156) ---

  const relAdr = (num, status, headers, body = '## Context\n\nSomething.\n') =>
    `# ${num}: A decision\n\n**Status:** ${status}\n\n${headers ? `${headers}\n\n` : ''}${body}`;
  const relFix = (a, b) =>
    fixture({ 'docs/adr/0001-a.md': a, 'docs/adr/0002-b.md': b, 'docs/adr/0003-c.md': relAdr('0003', 'Accepted', '') });
  const relGaps = (a, b) => scanAdrRelations(relFix(a, b));
  const a1 = (h, s = 'Accepted', body) => relAdr('0001', s, h, body);
  const b2 = (h, s = 'Accepted', body) => relAdr('0002', s, h, body);
  const toB = '[ADR 0002](0002-b.md)';
  const toA = '[ADR 0001](0001-a.md)';

  assert.deepEqual(relGaps(a1(`**Amends:** ${toB}`), b2(`**Amended by:** ${toA}`)), [], 'Amends pairs with Amended by');
  assert.deepEqual(relGaps(a1(`**Supersedes:** ${toB}`), b2(`**Superseded by:** ${toA}`, 'Superseded')), [], 'Supersedes pairs with Superseded by');
  assert.deepEqual(relGaps(a1(`**Amended by:** ${toB}`), b2(`**Amends:** ${toA}`)), [], 'Amended by pairs with Amends');

  for (const [mine, theirs, label] of [
    [`**Amends:** ${toB}`, '', 'Amends without Amended by'],
    ['', `**Amends:** ${toA}`, 'Amends on the target without Amended by'],
    [`**Amended by:** ${toB}`, '', 'Amended by without Amends'],
    [`**Supersedes:** ${toB}`, '', 'Supersedes without Superseded by'],
    ['', `**Superseded by:** ${toA}`, 'Superseded by without Supersedes'],
  ]) {
    const gaps = relGaps(a1(mine), b2(theirs, theirs.startsWith('**Superseded by') ? 'Superseded' : 'Accepted'));
    assert.equal(gaps.length, 1, `${label} fails once`);
    assert.match(gaps[0].expectation, /ADR 0001/, `${label} names ADR 0001`);
    assert.match(gaps[0].expectation, /ADR 0002/, `${label} names ADR 0002`);
  }

  assert.equal(
    relGaps(a1(`**Amends:** ${toB}`), b2(`**Superseded by:** ${toA}`, 'Superseded')).length,
    2,
    'Amends against Superseded by is two gaps, one per side',
  );

  // two targets on one header, and a header wrapped over lines: each target is checked
  const twoFix = (reverseOnC) =>
    fixture({
      'docs/adr/0001-a.md': a1(`**Amends:** ${toB}, and\n[ADR 0003](0003-c.md), whose text\nwraps over lines.`),
      'docs/adr/0002-b.md': b2(`**Amended by:** ${toA}`),
      'docs/adr/0003-c.md': relAdr('0003', 'Accepted', reverseOnC ? `**Amended by:** ${toA}` : ''),
    });
  const twoGaps = scanAdrRelations(twoFix(false));
  assert.equal(twoGaps.length, 1, 'only the target on the continuation line fails');
  assert.match(twoGaps[0].expectation, /ADR 0003/, 'names the unpaired target');
  assert.deepEqual(scanAdrRelations(twoFix(true)), [], 'both targets paired pass');

  assert.equal(
    scanAdrRelations(fixture({ 'docs/adr/0001-a.md': a1('**Amends:** [ADR 0009](0009-gone.md)') })).length,
    1,
    'a link to a missing ADR file fails',
  );
  const mismatch = relGaps(a1('**Amends:** [ADR 0003](0002-b.md)'), b2(`**Amended by:** ${toA}`));
  assert.ok(mismatch.some((g) => /0003/.test(g.expectation) && /0002/.test(g.expectation)), 'a text/target mismatch fails');

  const ext = relGaps(a1(`**Extends:** ${toB}`), b2(''));
  assert.equal(ext.length, 1, 'an unknown relation label fails');
  assert.match(ext[0].expectation, /Extends/, 'names the label');
  assert.equal(relGaps(a1(''), b2('', 'Superseded')).length, 1, 'Status Superseded without a Superseded by header fails');
  assert.equal(relGaps(a1(`**Superseded by:** ${toB}`), b2(`**Supersedes:** ${toA}`)).length, 1, 'a Superseded by header on an Accepted ADR fails');
  assert.deepEqual(
    relGaps(a1(`**Supersedes:** ${toB}`), b2(`**Superseded by:** ${toA}`, 'Superseded by ADR 0001.')),
    [],
    'Status Superseded with trailing text pairs with a Superseded by header',
  );
  const trailing = relGaps(a1(''), b2('', 'Superseded by ADR 0001.'));
  assert.equal(trailing.length, 1, 'Status Superseded with trailing text and no Superseded by header fails');
  assert.match(trailing[0].expectation, /carry a `\*\*Superseded by:\*\*` header/, 'the gap names the missing header');

  for (const h of ['**Amends:** ADR 0002', '**Amends:** nothing yet']) {
    const linkless = relGaps(a1(h), b2(''));
    assert.equal(linkless.length, 1, `a linkless header fails: ${h}`);
    assert.match(linkless[0].expectation, /ADR 0001/, 'names the ADR');
    assert.match(linkless[0].expectation, /Amends/, 'names the label');
  }
  assert.deepEqual(relGaps(a1('**Amends:** INV-0017, a rule'), b2('')), [], 'a plain INV target is skipped');
  for (const h of [
    '**Amends:** [the plan](../plan.md)',
    '**Amends:** [ADR 0002 decision](0002-b.md)',
    '**Amends:** [adr 0002](0002-b.md)',
    '**Amends:** ADR 0002 and INV-0017',
  ]) {
    const bad = relGaps(a1(h), b2(''));
    assert.equal(bad.length, 1, `a header with no ADR NNNN link fails once: ${h}`);
    assert.match(bad[0].expectation, /ADR 0001/, `names the ADR: ${h}`);
  }
  assert.deepEqual(
    relGaps(a1('**Amends:** [ADR 0002](./0002-b.md)'), b2('**Amended by:** [ADR 0001](./0001-a.md)')),
    [],
    'a ./-prefixed pair passes',
  );
  assert.equal(
    relGaps(a1(`**Amends:** ${toB}`), b2('**Amended by:** ADR 0001 [ADR 0001] (see above)')).length,
    2,
    'an ADR number outside a link is no reverse header target',
  );
  assert.deepEqual(relGaps(a1('**Amends:** [ADR 0002](0002-b.md#decision)'), b2(`**Amended by:** ${toA}`)), [], 'an anchored href passes');
  assert.deepEqual(
    relGaps(`# 0001: A decision\n\n**Date:** 2026-01-01\n\n**Status:** Accepted\n\n## Context\n\nx\n`, b2('')),
    [],
    'a bold label before Status is not a header',
  );
  assert.deepEqual(
    relGaps(`# 0001: A decision\n\n**Amends:** ${toB}\n\n**Status:** Accepted\n\n## Context\n\nx\n`, b2('')),
    [],
    'a relation label before Status is not a header',
  );
  assert.deepEqual(relGaps(a1('**Amends:** [INV-0017](../invariants.md), a rule'), b2('')), [], 'an INV target is skipped');
  assert.deepEqual(
    relGaps(a1('', 'Accepted', `## Context\n\n**Amended: ${toB}**\n\n**Supersede ADR 0004.**\n\n**Extends:** ${toB}\n`), b2('')),
    [],
    'bold labels in the body are not headers',
  );
  assert.deepEqual(relGaps(a1('', 'Accepted', `**Context.** Prose.\n\n**Amends:** ${toB}\n`), b2('')), [], 'a bold Context paragraph starts the body');
  assert.deepEqual(relGaps(a1('```\n**Amends:** [ADR 0002](0002-b.md)\n```'), b2('')), [], 'a header inside a fence is not a header');
  assert.deepEqual(scanAdrRelations(fixture({ 'README.md': 'x\n' })), [], 'no ADR directory passes');
};
