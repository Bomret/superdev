'use strict';

// The drift checks' own cases: one section per check, each with its own seeded violation and its own
// clean fixture. A fixture carries only the files one assertion exercises, so a case on a check that
// reads named documents filters out the missing-document gaps with `found()`; the last section asserts
// those gaps on their own, for every check.
//
// Run by ./index.js, which owns the shared fixture() helper, realRoot, and the temp-dir cleanup.

const { scanContract, docPath } = require('../lib');
const {
  scan,
  scanRunRootPaths,
  scanScopetreeRunRootPaths,
  scanAdrStatus,
  scanAdrNumbers,
  scanAdrRelations,
  scanCommandRefs,
  scanKbNoBackendCall,
  scanAgentToolAgnostic,
  scanUnmappedPathsForms,
  scanHookLedgerParsers,
  scanShellSpawn,
  scanNoForceMerge,
  scanConflictConclusionNoCommit,
  scanTeaOnly,
  scanDeployRunnerExclusivity,
  scanNarrativeCoverage,
  scanMarketplaceSource,
  scanReadmeCommands,
  scanAuditSetGlobs,
  scanNoBaseBranchCommit,
  scanShipNoOpensPr,
  scanShipHumanOnly,
  scanDeriveNoDod,
} = require('../scanners');
const {
  ADR_STATUSES,
  CHANGE_TYPE_CONTRACTS,
  ARG_TOKEN_CONTRACTS,
  SOURCE_SECTION_CONTRACTS,
  SPECIALISING_SECTIONS,
  specialisingGenericRows,
  CONTAINMENT_DELEGATION_CONTRACTS,
} = require('../contracts');
const CHECKS = require('../checks');
const { formatGap } = require('../../drift-check');

module.exports = ({ assert, fs, path, fixture, found, realRoot }) => {
  // --- reference: every references/<name>.md a skill, agent, or reference names exists ---

  // fixture with a missing reference
  const tmp1 = fixture({
    'references/exists.md': '# exists\n',
    'skills/foo/SKILL.md':
      'See ${CLAUDE_PLUGIN_ROOT}/references/exists.md and ${CLAUDE_PLUGIN_ROOT}/references/missing.md\n',
  });
  const missing1 = scan(tmp1);
  assert.equal(missing1.length, 1, 'detects exactly one missing reference');
  assert.equal(missing1[0].reference, 'references/missing.md', 'names the missing reference');
  assert.equal(missing1[0].source, path.join('skills', 'foo', 'SKILL.md'), 'names the source file');

  // fixture with all references present
  const tmp2 = fixture({
    'references/exists.md': '# exists\n',
    'agents/bar.md': 'See ${CLAUDE_PLUGIN_ROOT}/references/exists.md\n',
  });
  assert.equal(scan(tmp2).length, 0, 'all-present fixture yields zero missing');

  // a bare (no ${CLAUDE_PLUGIN_ROOT} macro) reference to a missing file
  const missing3 = scan(fixture({ 'skills/baz/SKILL.md': 'Seed: `references/missing-bare.md`\n' }));
  assert.equal(missing3.length, 1, 'detects a bare-form missing reference');
  assert.equal(missing3[0].reference, 'references/missing-bare.md', 'names the bare reference');

  // one reference citing another dangles exactly like one in skills/ or agents/
  const missing3b = scan(
    fixture({
      'references/exists.md': '# exists\n',
      'references/playbook.md':
        'Read ${CLAUDE_PLUGIN_ROOT}/references/exists.md and ${CLAUDE_PLUGIN_ROOT}/references/gone.md\n',
    }),
  );
  assert.equal(missing3b.length, 1, 'scans references/ too, detecting one missing reference');
  assert.equal(missing3b[0].reference, 'references/gone.md', 'names the missing reference');
  assert.equal(missing3b[0].source, path.join('references', 'playbook.md'), 'names the reference file that cites it');

  // a mention carrying no references/ path component is not a pointer scan() can resolve
  assert.equal(
    scan(fixture({ 'references/playbook.md': 'per `gone.md` — no path\n' })).length,
    0,
    'a bare filename with no references/ component is not a reference',
  );

  // --- run-root: run-root artifacts use the absolute <run-root>/… form, never a checkout-relative
  // .superdev/scopes/<scope>/<artifact> path (wrong from a scopetree or slicetree cwd) ---

  const offenders4 = found(
    scanRunRootPaths(
      fixture({
        'references/implement-lite.md':
          'Update the ledger at `.superdev/scopes/<scope>/ledger.md` and check `.superdev/scopes/<scope>/run.lock`.\n',
      }),
    ),
  );
  assert.equal(offenders4.length, 2, 'flags both checkout-relative run-root artifact paths');
  assert.ok(offenders4.every((o) => o.source === 'references/implement-lite.md'), 'names the source doc');

  // the absolute <run-root>/… form plus scopetree/slicetree *directory* paths are clean
  const offenders5 = found(
    scanRunRootPaths(
      fixture({
        'references/implement-lite.md':
          'Update the ledger at `<run-root>/ledger.md`; cut `.superdev/scopes/<scope>/scopetree`.\n',
        'agents/implementer.md':
          'Append to `<run-root>/reports/<id>/progress.md`; slicetree at `.superdev/scopes/<scope>/slicetrees/<id>`.\n',
      }),
    ),
  );
  assert.equal(offenders5.length, 0, 'absolute form + scopetree/slicetree dir paths yield zero offenders');

  // --- scopetree-run-root (ADR 0080): the documents that address another run's scopetree from their own
  // cwd use the absolute <run-root>/scopetree form ---

  const offenders5b = found(
    scanScopetreeRunRootPaths(
      fixture({ 'skills/ship/SKILL.md': 'Remove this run\'s scopetree: `.superdev/scopes/<scope>/scopetree`.\n' }),
    ),
  );
  assert.equal(offenders5b.length, 1, 'flags the checkout-relative scopetree literal');
  assert.equal(offenders5b[0].source, path.join('skills', 'ship', 'SKILL.md'), 'names ship.md');

  // the absolute form is clean, and a document outside the list is never read
  assert.equal(
    found(
      scanScopetreeRunRootPaths(
        fixture({
          'skills/ship/SKILL.md': 'Remove this run\'s scopetree: `<run-root>/scopetree`.\n',
          'references/scope-mode.md': 'git worktree add `.superdev/scopes/<scope>/scopetree` -b <branch>\n',
        }),
      ),
    ).length,
    0,
    'the absolute form yields zero offenders',
  );

  // --- no-base-branch-commit (INV-0001): no shipped file under skills/ or references/ instructs a commit,
  // a push, or a merge to the base branch ---

  const noBase = (files) => found(scanNoBaseBranchCommit(fixture(files)));

  // a base-branch commit instruction is flagged, by file and line
  const offenders5d = noBase({
    'skills/plan/SKILL.md':
      'Ask the interview questions first.\n' +
      '**Commit the durable design docs** you wrote — `CONTEXT.md`, any ADRs (`docs/adr/`) — to the base branch.\n',
  });
  assert.equal(offenders5d.length, 1, 'flags the base-branch commit instruction');
  assert.equal(offenders5d[0].source, 'skills/plan/SKILL.md', 'names plan.md');
  assert.equal(offenders5d[0].line, 2, 'names the line the instruction starts on');

  // a caution *against* committing onto the base branch is not a violation
  assert.equal(
    noBase({
      'references/prototype.md':
        'Commit the prototype itself to a throwaway branch off the base — never onto the base branch — ' +
        'and leave a pointer to that branch where the decision landed.\n',
    }).length,
    0,
    'a never-onto-base caution is not itself a violation',
  );

  // a `push-only` PR-posture value near an unrelated "base branch" config field is not a violation
  assert.equal(
    noBase({
      'skills/setup/SKILL.md':
        'Confirm the default PR posture (`draft` | `ready` | `push-only`) and the\n' +
        '**base branch** (default `main`).\n',
    }).length,
    0,
    'a `push-only` config value near an unrelated base-branch field is not flagged',
  );

  // a `never` negating something else entirely is a live bypass, not a caution
  assert.equal(
    noBase({ 'skills/plan/SKILL.md': 'Commit the docs now (never mind the formatting) directly to the base branch.\n' }).length,
    1,
    'a `never` far from "base branch" does not excuse the instruction',
  );

  // the base branch named by its own configured name is still a target
  const offenders5h = noBase({
    'docs/agents/code-management.md': '- **Base branch:** `main`.\n',
    'skills/ship/SKILL.md': 'Commit the design docs directly onto `main`.\n',
    'references/run-init.md': 'git push origin main\n',
  });
  assert.equal(offenders5h.length, 2, 'flags both the backtick-named and the `origin`-pushed base branch');
  assert.deepEqual(
    offenders5h.map((g) => g.source).sort(),
    ['references/run-init.md', 'skills/ship/SKILL.md'],
    'names both offending files',
  );

  // an ordinary, non-git use of the base branch's own name is not a violation
  assert.equal(
    noBase({
      'docs/agents/code-management.md': '- **Base branch:** `main`.\n',
      'skills/backlog/SKILL.md':
        'Resolve the checkout once, not per anchor: the main checkout is the PARENT of the scopetree, and ' +
        'a run root never commits anything there.\n',
    }).length,
    0,
    'the adjective "main" near an unrelated commit is not flagged',
  );

  // simplicity: the sliding window is 4 lines / 150 chars — a heuristic, not a parser
  assert.equal(
    noBase({ 'skills/plan/SKILL.md': 'Commit\nthe\ndurable\ndesign\ndocs to the base branch.\n' }).length,
    0,
    'known ceiling: a 5-line-split instruction is missed',
  );

  // a `never` that negates the verb itself is a caution too
  assert.equal(noBase({ 'references/prototype.md': 'Never commit prototype code to the base branch.\n' }).length, 0, 'a never-before-the-verb caution is not a violation');
  assert.equal(noBase({ 'references/prototype.md': 'Never push a prototype branch to the base branch.\n' }).length, 0, 'a never-before-the-verb push caution is not a violation');
  assert.equal(
    noBase({ 'references/prototype.md': 'Do the work. This is fine, but never\ncommit it to the base branch afterwards.\n' }).length,
    0,
    'a never-before-the-verb caution split across a line break is not a violation',
  );

  // a genuine violation later in the same file is still reported after an excused caution
  const offenders5lc = noBase({
    'references/prototype.md':
      'Do the work. This is fine, but never\n' +
      'commit it to the base branch afterwards.\n' +
      'Later, actually commit this straight to the base branch for real.\n',
  });
  assert.equal(offenders5lc.length, 1, 'the later real violation is reported, not masked by the earlier caution');
  assert.equal(offenders5lc[0].line, 3, 'names the line the real violation starts on');

  // `merge` is a base-branch verb too (ADR 0096); ship's own host-API merge is the one admitted site
  assert.equal(noBase({ 'skills/plan/SKILL.md': 'Merge the finished work straight into the base branch yourself.\n' }).length, 1, 'flags a merge-to-base instruction outside ship');
  assert.equal(
    noBase({ 'skills/ship/SKILL.md': 'Then squash-merge it into the base branch through the host\'s merge API, pinned to that head.\n' }).length,
    0,
    "ship's own host-API merge onto base is admitted",
  );
  assert.equal(
    noBase({ 'skills/ship/SKILL.md': 'Merge the scope branch straight into the base branch yourself.\n' }).length,
    1,
    "ship's file is not itself an excuse — only the host-API wording is",
  );
  assert.equal(
    noBase({ 'skills/ship/SKILL.md': 'Merge base into the scope branch, in the scope checkout, by its literal absolute path.\n' }).length,
    0,
    "ship's own base-into-scope-branch merge is never mistaken for a commit onto base",
  );

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

  // --- command-resolution: a `/superdev:<name>` reference resolves to `skills/<name>/SKILL.md` ---

  const crGaps1 = scanCommandRefs(fixture({ 'skills/implement/SKILL.md': 'When every slice is merged, run `/superdev:ship <scope>`.\n' }));
  assert.equal(crGaps1.length, 1, 'flags a reference to a command with no file');
  assert.equal(crGaps1[0].command, '/superdev:ship', 'names the unresolved command');
  assert.equal(crGaps1[0].source, path.join('skills', 'implement', 'SKILL.md'), 'names the source document');
  assert.equal(
    scanCommandRefs(
      fixture({
        'skills/implement/SKILL.md': 'When every slice is merged, run `/superdev:ship <scope>`.\n',
        'skills/ship/SKILL.md': '# superdev ship\n',
      }),
    ).length,
    0,
    'a resolving reference yields zero gaps',
  );
  assert.equal(scanCommandRefs(fixture({ 'agents/doc-writer.md': 'Dispatched by `/superdev:nope`.\n' })).length, 1, 'an agent naming a missing command is flagged');
  assert.equal(
    scanCommandRefs(fixture({ 'skills/document/SKILL.md': 'Invoked as `/superdev:document audit` — see `/superdev:document`.\n' })).length,
    0,
    'a trailing argument is not read as part of the name',
  );
  assert.equal(
    scanCommandRefs(fixture({ 'skills/implement/SKILL.md': 'Then `/superdev:ship`.\n', 'skills/document/SKILL.md': 'Then `/superdev:ship`.\n' })).length,
    2,
    'each source naming a missing command is reported',
  );

  // --- no-second-reader: no hook carries a ledger-header regex of its own (ADR 0022) ---

  for (const [label, src] of [
    ['a template literal', 'const m = text.match(new RegExp(`\\\\*\\\\*${name}:\\\\*\\\\*[^\\\\S\\\\n]*(\\\\S+)`));'],
    ['a single-quoted string', "const re = new RegExp('^\\\\*\\\\*' + name + ':\\\\*\\\\*\\\\s*(.*)$');"],
  ]) {
    const gaps = scanHookLedgerParsers(fixture({ 'hooks/rogue.js': src }));
    assert.equal(gaps.length, 1, `flags a hook parsing a header with ${label}`);
    assert.equal(gaps[0].source, path.join('hooks', 'rogue.js'), 'names the hook');
  }
  assert.equal(
    scanHookLedgerParsers(
      fixture({
        'hooks/good.js':
          "const { readLedgerHeader } = require('../scripts/scope.js');\n" +
          "// reads the ledger's **Stage:** line through scope.js\n",
      }),
    ).length,
    0,
    'a hook using the shared reader, and naming a header in prose, is clean',
  );
  assert.equal(scanHookLedgerParsers(fixture({ 'README.md': '# repo\n' })).length, 0, 'no hooks dir holds nothing to scan');

  // --- shell-spawn: no shipped executable starts a shell against INV-0153 (ADR 0150) ---

  for (const [form, src] of [
    ['execSync', "const { execSync } = require('node:child_process');\nexecSync('x');"],
    ['exec', "const cp = require('node:child_process');\ncp.exec('x');"],
    ['absolute path', "spawnSync('/bin/sh', ['-c', cmd]);"],
    ['absolute path', 'execFileSync("/usr/bin/env", []);'],
    ['bash', "spawn('bash', ['-c', cmd]);"],
    ['shell option', "spawnSync('git', [], { shell: true });"],
    ['shell option', "spawnSync('git', [], { shell: process.platform === 'win32' });"],
    ['exec', "require('child_process').exec('x');"],
    ['execSync', "require('node:child_process').execSync('x');"],
    ['exec', "const { exec } = require('child_process');\nexec('x');"],
    ['exec', "const { exec: run } = require('child_process');\nrun('x');"],
    ['exec', "import { exec } from 'node:child_process';\nexec('x');"],
    ['exec', "import { exec as run } from 'child_process';\nrun('x');"],
    // Comment-like text inside a string or a `//` comment must not delete the live code after it.
    ['absolute path', "const g = 'docs/*.md';\nspawnSync('/bin/sh', ['-c', cmd]);\nconst e = '*/';"],
    ['absolute path', "// slice/* branches\nspawnSync('/bin/sh', ['-c', cmd]);\n// done */"],
    ['absolute path', "const s = 'a // b'; spawnSync('/bin/sh', []);"],
    ['exec', "const run = util.promisify(require('child_process').exec);"],
    ['execSync', "const run = wrap(require('node:child_process').execSync);"],
    ['exec', "const { exec } = await import('node:child_process');\nexec('x');"],
    ['execSync', "const { execSync: run } = await import('child_process');\nrun('x');"],
    ['shell option', "spawnSync('git', [], {\n  shell: true,\n});"],
    ['exec', "const cp = require('child_process');\nconst run = promisify(cp.exec);"],
    ['execSync', "const cp = require('node:child_process');\nwrap(cp.execSync);"],
    ['exec', "const { exec } = require('child_process');\nconst run = promisify(exec);"],
    ['exec', "const { exec: x } = require('child_process');\nconst run = promisify(x);"],
    ['exec', "import('child_process').then(({ exec }) => exec('x'));"],
    ['shell option', "spawnSync('git', [], { cwd, shell });"],
    ['shell option', "spawnSync('git', [], {\n  cwd: dir,\n  shell,\n});"],
  ]) {
    const gaps = scanShellSpawn(fixture({ 'scripts/rogue.js': src }));
    assert.equal(gaps.length, 1, `flags ${form}: ${src}`);
    assert.equal(gaps[0].source, path.join('scripts', 'rogue.js'), `names the file for ${form}`);
    assert.ok(gaps[0].expectation.includes(`(${form})`), `names the form ${form}`);
  }
  assert.equal(scanShellSpawn(fixture({ 'hooks/rogue.mjs': "execSync('x');" })).length, 1, 'scans .mjs under hooks');
  assert.equal(
    scanShellSpawn(
      fixture({
        'hooks/good.js':
          "spawnSync('sh', ['-c', cmd]);\nspawnSync('git', ['status']);\nspawn(process.execPath, [a]);\n" +
          "spawnSync('taskkill', ['/pid', '1']);\nconst m = re.exec(text);\nconst n = /x/.exec(text);\n" +
          "const node = { shell: undefined };\nspawnSync('git', []); // was execSync(x) once\n" +
          "const { exec: run } = require('child_process');\nconst other = 1;\n" +
          "const pick = ok ? shell : other;\nf(a, shell, b);\nconst { shell } = opts;\nconst cp = require('child_process');\ncp.spawnSync('git', []);\n" +
          "const o = { exec: 1 };\nobj.exec(x);\nconst t = 'a // b'; // trailing\n",
      }),
    ).length,
    0,
    'sh -c, git, process.execPath, taskkill, RegExp exec, `shell: undefined`, a trailing comment, an uncalled alias, and a `shell` ternary are clean',
  );
  assert.equal(scanShellSpawn(fixture({ 'README.md': '# repo\n' })).length, 0, 'no hooks or scripts dir holds nothing to scan');

  // --- ship-no-opens-pr: no shipped surface pairs `/superdev:ship` with opening the pull request
  // (ADR 0096) ---

  assert.equal(
    scanShipNoOpensPr(
      fixture({
        'skills/submit-pr/SKILL.md': '`/superdev:submit-pr` pushes the scope branch and opens the pull request.\n',
        'README.md':
          'Once the pull request is reviewed, `/superdev:ship` merges it, closes the scope anchor, and cleans up the run.\n',
      }),
    ).length,
    0,
    'ship paired with "merges" and submit-pr paired with "opens" are both clean',
  );
  for (const rel of ['skills/ship/SKILL.md', 'agents/doc-writer.md', 'references/scope-mode.md', 'README.md']) {
    const gaps = found(scanShipNoOpensPr(fixture({ [rel]: '`/superdev:ship` opens the pull request and merges it in one step.\n' })));
    assert.equal(gaps.length, 1, `catches the pairing in ${rel}`);
    assert.equal(gaps[0].source, rel, `names ${rel}`);
  }
  assert.equal(
    found(scanShipNoOpensPr(fixture({ 'docs/adr/0096-example.md': '`/superdev:ship` opens the pull request.\n' }))).length,
    0,
    'docs/adr/ is history, not a shipped surface',
  );
  assert.equal(
    scanShipNoOpensPr(
      fixture({
        'README.md': 'Once `/superdev:submit-pr` opens the pull request, `/superdev:ship` merges it and closes the anchor.\n',
      }),
    ).length,
    0,
    '`/superdev:submit-pr` opens it, `/superdev:ship` merely mentioned afterward, stays clean',
  );
  assert.deepEqual(
    scanShipNoOpensPr(fixture({ 'skills/ship/SKILL.md': '`/superdev:ship` merges the pull request.\n' })),
    [{ source: 'README.md', missing: true }],
    'a missing README.md is a missing-document gap',
  );

  // --- derive-no-dod: plan's derive dispatch hands no Definition of Done, and final-reviewer's derive
  // mode reads none (INV-0158, ADR 0158) ---

  const derivePlan = (bullet) =>
    '- **Write the draft** to `.superdev/dod-draft-<slug>.md` in the invoking checkout.\n' +
    `- **Dispatch \`superdev:final-reviewer\` in derive mode** in the background. ${bullet}\n` +
    '  It returns every derived criterion.\n' +
    '- **Compare** the result against `.superdev/dod-draft-<slug>.md`, the drafted Definition of Done.\n';
  const deriveAgent = (body) =>
    `## Derive mode\n\n${body}\n\n## Read-only review\n\nOpen \`<run-root>/dod.md\` and the DoD path.\n`;
  const deriveFixture = (plan, agent) =>
    fixture({ 'skills/plan/SKILL.md': plan, 'agents/final-reviewer.md': agent });
  assert.deepEqual(
    scanDeriveNoDod(deriveFixture(derivePlan('Hand it the problem statement and no Definition of Done.'), deriveAgent('Read no Definition of Done by any route.'))),
    [],
    'the draft named outside the dispatch bullet, and dod.md named outside derive mode, are clean',
  );
  for (const bullet of [
    'Hand it the path `.superdev/dod-draft-<slug>.md`.',
    'Hand it the **path** of the drafted Definition of Done, never inlined.',
    'Hand it the DoD path.',
  ]) {
    const gaps = found(scanDeriveNoDod(deriveFixture(derivePlan(bullet), deriveAgent('Read no Definition of Done.'))));
    assert.equal(gaps.length, 1, `catches a dispatch bullet that hands a Definition of Done: ${bullet}`);
    assert.equal(gaps[0].source, 'skills/plan/SKILL.md', 'names plan');
  }
  for (const body of ['**Then** open the DoD path.', 'Read no other `dod.md`.', 'Then open the Definition of Done.']) {
    const gaps = found(scanDeriveNoDod(deriveFixture(derivePlan('Hand it no Definition of Done.'), deriveAgent(body))));
    assert.equal(gaps.length, 1, `catches derive mode reading a Definition of Done: ${body}`);
    assert.equal(gaps[0].source, 'agents/final-reviewer.md', 'names final-reviewer');
  }
  assert.equal(
    found(scanDeriveNoDod(deriveFixture('- **Write the draft** somewhere.\n', deriveAgent('Read no Definition of Done.')))).length,
    1,
    'a plan with no derive dispatch bullet is a gap, so a renamed bullet cannot pass vacuously',
  );
  assert.equal(
    found(scanDeriveNoDod(deriveFixture(derivePlan('Hand it no Definition of Done.'), '## Read-only review\n\nx\n'))).length,
    1,
    'a final-reviewer with no `## Derive mode` section is a gap',
  );

  // --- narrative-coverage: scripts/AGENTS.md's drift-check table holds exactly one row per registered
  // check, and no row for an unregistered one. The `ids` parameter is passed explicitly, so the fixtures
  // stay fixed as the registry changes. ---

  const twoIds = ['alpha-check', 'beta-check'];
  const tableOf = (...ids) =>
    '# scripts/\n\n| Check | Tests | Class |\n|---|---|---|\n' +
    ids.map((id) => `| \`${id}\` | it tests ${id} | structural |\n`).join('') +
    '\nProse naming `gamma-check` outside the table is no row.\n';
  const narrative = (...ids) => fixture({ 'scripts/AGENTS.md': tableOf(...ids) });

  assert.deepEqual(scanNarrativeCoverage(narrative('alpha-check', 'beta-check'), twoIds), [], 'one row per id yields zero gaps');
  const noRow = scanNarrativeCoverage(narrative('alpha-check'), twoIds);
  assert.equal(noRow.length, 1, 'a registered check with no row is one gap');
  assert.match(noRow[0].expectation, /beta-check/, 'the gap names the id');
  assert.equal(noRow[0].source, path.join('scripts', 'AGENTS.md'), 'the gap names the document');
  const twoRows = scanNarrativeCoverage(narrative('alpha-check', 'beta-check', 'beta-check'), twoIds);
  assert.equal(twoRows.length, 1, 'a check with two rows is one gap');
  assert.match(twoRows[0].expectation, /beta-check[\s\S]*2/, 'the gap names the id and the row count');
  const stray = scanNarrativeCoverage(narrative('alpha-check', 'beta-check', 'deleted-check'), twoIds);
  assert.equal(stray.length, 1, 'a row for an unregistered id is one gap');
  assert.match(stray[0].expectation, /deleted-check/, 'the gap names the unregistered id');

  // --- marketplace-source: the manifest's source resolves to the shipped tree (ADR 0032, ADR 0131) ---

  const mkManifest = (source) => JSON.stringify({ name: 'm', plugins: [{ name: 'p', source }] });
  assert.equal(
    scanMarketplaceSource(
      fixture({
        '.claude-plugin/marketplace.json': mkManifest('./shipped'),
        'shipped/.claude-plugin/plugin.json': '{"name":"p","version":"0.0.0"}',
      }),
    ).length,
    0,
    'a resolving source yields zero gaps',
  );
  const msGaps = scanMarketplaceSource(
    fixture({
      '.claude-plugin/marketplace.json': mkManifest('./shippd'),
      'shipped/.claude-plugin/plugin.json': '{"name":"p","version":"0.0.0"}',
    }),
  );
  assert.equal(msGaps.length, 1, 'a source resolving to no plugin tree is a gap');
  assert.equal(msGaps[0].source, path.join('.claude-plugin', 'marketplace.json'), 'names the manifest');
  assert.match(msGaps[0].expectation, /\.\/shippd/, 'names the dead path');

  const pinned = (over = {}) =>
    ({ source: 'git-subdir', url: 'https://codeberg.org/bomret/superdev.git', path: 'shipped', ref: 'v1.2.3', ...over });
  const shippedTree = { 'shipped/.claude-plugin/plugin.json': '{"name":"p","version":"1.2.3"}' };
  const pinnedGaps = (over) =>
    scanMarketplaceSource(fixture({ '.claude-plugin/marketplace.json': mkManifest(pinned(over)), ...shippedTree }));

  assert.equal(pinnedGaps().length, 0, 'a pinned git-subdir source yields zero gaps');
  const pathTypo = pinnedGaps({ path: 'shippd' });
  assert.equal(pathTypo.length, 1, 'a git-subdir path resolving to no plugin tree is a gap');
  assert.match(pathTypo[0].expectation, /shippd/, 'names the dead path');
  const staleRef = pinnedGaps({ ref: 'v1.2.2' });
  assert.equal(staleRef.length, 1, 'a ref other than v<version> is a gap');
  assert.match(staleRef[0].expectation, /v1\.2\.2/, 'names the stale ref');
  assert.match(staleRef[0].expectation, /v1\.2\.3/, 'names the expected ref');
  const forkUrl = pinnedGaps({ url: 'https://example.org/o/r.git' });
  assert.equal(forkUrl.length, 1, 'a git-subdir url other than the canonical repository is a gap');
  assert.match(forkUrl[0].expectation, /example\.org/, 'names the wrong url');
  assert.ok(
    scanMarketplaceSource(fixture({ '.claude-plugin/marketplace.json': mkManifest({ source: 'github', repo: 'o/r' }) })).length >= 1,
    'an object source of another shape is a gap',
  );
  const unparsable = scanMarketplaceSource(fixture({ '.claude-plugin/marketplace.json': '{ not json' }));
  assert.equal(unparsable.length, 1, 'an unparsable manifest is a gap');
  assert.match(unparsable[0].expectation, /JSON/, 'the gap says the manifest is no JSON');

  // --- readme-commands: README.md and skills/ name the same command set ---

  assert.equal(
    scanReadmeCommands(
      fixture({
        'README.md': '# p\n\nRun `/superdev:plan`, then `/superdev:implement`.\n',
        'skills/plan/SKILL.md': '# plan\n',
        'skills/implement/SKILL.md': '# implement\n',
      }),
    ).length,
    0,
    'a README naming every command yields zero gaps',
  );
  const rcMissing = scanReadmeCommands(
    fixture({ 'README.md': '# p\n\nRun `/superdev:plan`.\n', 'skills/plan/SKILL.md': '# plan\n', 'skills/ship/SKILL.md': '# ship\n' }),
  );
  assert.equal(rcMissing.length, 1, 'an unmentioned command is one gap');
  assert.match(rcMissing[0].expectation, /\/superdev:ship/, 'the gap names the unmentioned command');
  const rcGhost = scanReadmeCommands(
    fixture({
      'README.md': '# p\n\nRun `/superdev:plan` and `/superdev:retired` (twice: `/superdev:retired`).\n',
      'skills/plan/SKILL.md': '# plan\n',
    }),
  );
  assert.equal(rcGhost.length, 1, 'a ghost command is one gap, deduped across repeated mentions');
  assert.match(rcGhost[0].expectation, /\/superdev:retired/, 'the gap names the ghost command');
  assert.equal(
    scanReadmeCommands(fixture({ 'README.md': '# p\n\nRun `/superdev:plan`.\n' })).length,
    1,
    'with no skills dir, every command the README names is a ghost',
  );

  // --- audit-set-globs: every pattern under `## Audit set` resolves to at least one file ---

  assert.equal(
    scanAuditSetGlobs(
      fixture({
        'plugin/skills/plan/SKILL.md': '# plan\n',
        'RELEASING.md': '# releasing\n',
        'docs/agents/documentation.md': '# doc\n\n## Audit set\n\n- `plugin/skills/*/SKILL.md`\n- `RELEASING.md`\n',
      }),
    ).length,
    0,
    'patterns that all resolve yield zero gaps',
  );
  const asStale = scanAuditSetGlobs(
    fixture({
      'plugin/skills/plan/SKILL.md': '# plan\n',
      'docs/agents/documentation.md': '# doc\n\n## Audit set\n\n- `commands/*.md`\n- `plugin/skills/*/SKILL.md`\n',
    }),
  );
  assert.equal(asStale.length, 1, 'a glob resolving to no file is one gap');
  assert.match(asStale[0].expectation, /`commands\/\*\.md`/, 'the gap names the unresolvable pattern');
  assert.equal(
    scanAuditSetGlobs(
      fixture({ 'plugin/agents/.keep': '', 'docs/agents/documentation.md': '# doc\n\n## Audit set\n\n- `plugin/agents/*.md`\n- `GONE.md`\n' }),
    ).length,
    2,
    'an empty directory and a missing file are both gaps',
  );
  assert.equal(
    scanAuditSetGlobs(
      fixture({
        'RELEASING.md': '# releasing\n',
        'docs/agents/documentation.md': '# doc\n\n## Audit set\n\n- `RELEASING.md`\n\n## Something else\n\n- `not/a/pattern.md`\n',
      }),
    ).length,
    0,
    'bullets past the section are not scanned',
  );
  const noSection = scanAuditSetGlobs(fixture({ 'docs/agents/documentation.md': '# doc\n\n## Writing standard\n' }));
  assert.equal(noSection.length, 1, 'a documentation.md with no `## Audit set` section is a gap');
  assert.match(noSection[0].expectation, /## Audit set/, 'the gap names the section');

  // --- agent-tool-agnostic: shipped agent prose names no concrete toolchain command ---

  assert.equal(
    scanAgentToolAgnostic(
      fixture({
        'agents/implementer.md':
          'Pipe noisy commands (`<test command> 2>&1 | tail -20`). Read `references/test-selection.md` ' +
          'and run the command it selects.\n',
      }),
    ).length,
    0,
    'the neutral placeholder yields no gap',
  );
  assert.equal(
    scanAgentToolAgnostic(fixture({ 'skills/setup/SKILL.md': 'e.g. `npm test`, `pytest -q`, `cargo test`\n' })).length,
    0,
    'skills/ examples stay out of scope',
  );
  const taGaps = scanAgentToolAgnostic(fixture({ 'agents/implementer.md': 'Pipe noisy commands (`bun run test 2>&1 | tail -20`).\n' }));
  assert.equal(taGaps.length, 1, 'flags a maintainer toolchain command in agent prose');
  assert.equal(taGaps[0].source, path.join('agents', 'implementer.md'), 'names the agent file');
  assert.match(taGaps[0].expectation, /bun run test/, 'the gap quotes the command it found');
  assert.equal(
    scanAgentToolAgnostic(fixture({ 'agents/new-agent.md': 'Re-run with `pytest -q`.\n' })).length,
    1,
    'a new agent file and a bare runner name are both caught',
  );

  // --- code-management-no-force (#683, INV-0092) ---

  const noForce = (files) => found(scanNoForceMerge(fixture(files)));
  const forceMergeGaps = noForce({ 'references/code-management-forgejo.md': 'POST .../merge with `{ "force_merge": true }`\n' });
  assert.equal(forceMergeGaps.length, 1, 'catches an actual `force_merge: true` invocation');
  assert.match(forceMergeGaps[0].expectation, /force_merge: true/, 'names the option');
  assert.equal(noForce({ 'references/code-management-forgejo.md': '{ "force_merge": true }\n' }).length, 1, 'catches `"force_merge": true` in JSON');
  assert.equal(noForce({ 'references/code-management-github.md': '`gh pr merge --squash --admin 42`\n' }).length, 1, 'catches an actual `--admin` invocation');
  assert.equal(
    noForce({ 'references/code-management-forgejo.md': 'Never send `force_merge` — this seed never sets it.\n' }).length,
    0,
    'a caution naming the forbidden option is not an invocation',
  );
  assert.equal(
    noForce({ 'references/code-management-github.md': 'Never pass `--admin` — this seed never sends it.\n' }).length,
    0,
    'the same caution shape passes for the GitHub option',
  );

  // --- conflict-conclusion-no-commit (ADR 0123) ---

  const conclusionLine = 'conclude a resolved conflict with `git -C <run-root>/scopetree merge --continue`';
  for (const [rel, body] of [
    ['references/implement-full.md', `${conclusionLine}, or \`git -C <run-root>/scopetree commit --no-edit\`.\n`],
    ['references/merge-conflicts.md', 'Stage the files, then run `git commit --no-edit`.\n'],
    ['skills/implement/SKILL.md', 'Once resolved, conclude it with\n`git -C <run-root>/scopetree commit`.\n'],
    ['agents/implementer.md', 'To conclude the merge, run `git commit` in the scopetree.\n'],
    ['references/implement-full.md', `${conclusionLine}. Or commit the merge with \`git -C <run-root>/scopetree commit\`.\n`],
    ['skills/implement/SKILL.md', 'Then commit the merge with `git commit`.\n'],
  ]) {
    const gaps = scanConflictConclusionNoCommit(fixture({ [rel]: body }));
    assert.equal(gaps.length, 1, `catches a commit conclusion in ${rel}`);
    assert.equal(gaps[0].source, path.join(...rel.split('/')), 'names the document');
    assert.match(gaps[0].expectation, /conclude a resolved conflict with `merge --continue`/, 'names the rule');
  }
  assert.equal(
    scanConflictConclusionNoCommit(
      fixture({
        'references/merge-conflicts.md': `${conclusionLine}.\n`,
        'references/scope-mode.md': "Plan's design-docs commit lands first; a `git commit` there is fine.\n",
      }),
    ).length,
    0,
    '`merge --continue`, and a `git commit` that concludes nothing, pass',
  );

  // --- forgejo-tea-only (ADR 0111, #794) ---

  const teaOnly = (files) => found(scanTeaOnly(fixture(files)));
  for (const [name, body] of [
    ['a token env var', 'Send it with `Authorization`-free calls, token from $GITEA_TOKEN.\n'],
    ['a FORGEJO token env var', 'export FORGEJO_TOKEN=abc\n'],
    ['an Authorization header', 'curl-free but: -H "Authorization: token x"\n'],
    ['a fenced curl at command position', '```bash\ncurl -s "$URL"\n```\n'],
    ['a piped curl', 'run `x | curl https://codeberg.org/api/v1/repos`\n'],
    ['curl with a flag mid-prose', 'call it with curl -X POST on the endpoint\n'],
  ]) {
    assert.equal(teaOnly({ 'docs/agents/issue-tracker.md': body }).length, 1, `catches ${name}`);
  }
  assert.equal(teaOnly({ 'references/code-management-forgejo.md': '  curl -X PUT "$U"\n' }).length, 1, 'catches a seed document too');
  assert.equal(
    teaOnly({
      'docs/agents/code-management.md':
        'Do not fall back to a token or a raw HTTP call (curl). Never fall back to a token, a raw HTTP call (curl), or another login.\n' +
        'No token env var, header, or raw HTTP call (curl) appears in this document.\n',
    }).length,
    0,
    'prohibition prose naming curl and a token is not an invocation',
  );

  // --- deploy-runner-exclusivity (ADR 0101, INV-0098) ---

  const deployRunnerGaps = scanDeployRunnerExclusivity(fixture({ 'skills/document/SKILL.md': 'This command runs each target\'s deploy command itself.\n' }));
  assert.equal(deployRunnerGaps.length, 1, 'flags a non-ship document claiming to run a target\'s command');
  assert.equal(deployRunnerGaps[0].source, 'skills/document/SKILL.md', 'names the offending document');
  assert.equal(
    scanDeployRunnerExclusivity(fixture({ 'skills/verify-ship/SKILL.md': "It runs no deploy target's command, and never runs a target's command.\n" })).length,
    0,
    'a denied run is not flagged',
  );
  assert.equal(
    scanDeployRunnerExclusivity(fixture({ 'skills/document/SKILL.md': "This command runs no deploy target's command.\n" })).length,
    0,
    'a denial in a document other than verify-ship is not flagged',
  );
  assert.equal(
    scanDeployRunnerExclusivity(fixture({ 'skills/verify-ship/SKILL.md': "It runs each target's deploy command itself.\n" })).length,
    1,
    'a non-denial in verify-ship is flagged',
  );
  assert.equal(
    scanDeployRunnerExclusivity(fixture({ 'skills/setup/SKILL.md': 'Only `/superdev:ship` runs each target\'s command, and only under `auto`.\n' })).length,
    0,
    'a mention attributed to ship is not a claim to run one itself',
  );
  assert.equal(
    scanDeployRunnerExclusivity(fixture({ 'skills/document/SKILL.md': '```\nThis command runs each target\'s deploy command itself.\n```\n' })).length,
    0,
    'a fenced example is not flagged',
  );
  assert.equal(
    scanDeployRunnerExclusivity(fixture({ 'skills/document/SKILL.md': 'This command runs the test suite itself.\n' })).length,
    0,
    'a sentence about an unrelated command is not flagged',
  );

  // --- ship-human-only (ADR 0132, INV-0093): the flag on ship alone, and no `--unattended` on all three ---

  const humanSkill = (extra) => ['---', 'name: x', 'disable-model-invocation: true', '---', '', extra, ''].join('\n');
  const openSkill = (extra) => ['---', 'name: x', '---', '', extra, ''].join('\n');
  const humanOnly = (files) => found(scanShipHumanOnly(fixture(files)));
  assert.equal(humanOnly({ 'skills/ship/SKILL.md': openSkill('Body.') }).length, 1, 'ship without disable-model-invocation is caught');
  assert.equal(humanOnly({ 'skills/ship/SKILL.md': humanSkill('Pass --unattended.') }).length, 1, 'ship naming --unattended is caught');
  assert.equal(humanOnly({ 'skills/ship/SKILL.md': humanSkill('Body.') }).length, 0, 'a human-only ship is clean');
  for (const name of ['verify-ship', 'wrap-up']) {
    assert.equal(humanOnly({ [`skills/${name}/SKILL.md`]: openSkill('Body.') }).length, 0, `${name} without disable-model-invocation is clean`);
    assert.equal(humanOnly({ [`skills/${name}/SKILL.md`]: openSkill('Pass --unattended.') }).length, 1, `${name} naming --unattended is caught`);
    assert.equal(humanOnly({ [`skills/${name}/SKILL.md`]: humanSkill('Body.') }).length, 0, `${name} carrying the flag adds no gap to this check`);
  }

  // --- kb-no-backend-call (ADR 0023): no document but publish-kb reaches a knowledge-base backend ---

  const kbCall = (files) => found(scanKbNoBackendCall(fixture(files)));
  const kbGaps2 = kbCall({
    'agents/doc-writer.md':
      'Write each page under the staging path, the one `scope.js staging <scope>` printed.\n' +
      'Then POST it to `/api/v1/repos/o/r/wiki/new` with `content_base64`.\n',
  });
  assert.ok(kbGaps2.length >= 1, 'a wiki call path is caught even beside a staging instruction');
  assert.equal(kbGaps2[0].source, path.join('agents', 'doc-writer.md'), 'names doc-writer.md');
  assert.equal(
    kbCall({ 'skills/document/SKILL.md': 'Stage under `.superdev/kb-pending/<scope>/`. The credential env var is `$CONFLUENCE_API_TOKEN`.\n' }).length,
    0,
    'naming a credential env var alone is not a call',
  );
  assert.equal(
    kbCall({ 'skills/publish-kb/SKILL.md': 'POST `/wiki/new` with `content_base64`, or PUT `<base>/api/v2/pages`.\n' }).length,
    0,
    'publish-kb may reach the backend — that is its job',
  );
  assert.ok(
    kbCall({
      'agents/doc-writer.md':
        'Publishing to a **KB/wiki** host via its API is not integration and is allowed.\n' +
        "Software backend (e.g. Confluence): find the existing page and update it (don't duplicate); " +
        'create pages only for genuinely new outline entries.\n',
    }).length >= 1,
    'the pre-ADR-0023 doc-writer.md text reads as a regression',
  );
  assert.ok(
    kbCall({ 'skills/document/SKILL.md': 'Publish each page to the backend, following docs/agents/knowledge-base.md.\n' }).length >= 1,
    'a "publish each page" instruction is caught',
  );
  assert.ok(
    kbCall({ 'agents/doc-writer.md': 'curl -X POST -H "Authorization: token $GITEA_TOKEN" "$KB_BASE/pages"\n' }).length >= 1,
    'a generic POST-to-pages call is caught with no backend literal',
  );
  assert.equal(
    kbCall({ 'skills/document/SKILL.md': 'A staged page waits until a human runs `/superdev:publish-kb`, once the feature reaches its readers.\n' }).length,
    0,
    'pointing the reader at /superdev:publish-kb is not a call',
  );
  assert.ok(kbCall({ 'skills/document/SKILL.md': 'Upsert each page at the backend.\n' }).length >= 1, 'an "upsert" instruction is caught');
  for (const [text, label] of [
    ['Each page is published to the wiki as part of the pass.\n', 'the passive "is published to the wiki"'],
    ['When updating the wiki page, keep the outline order.\n', 'the gerund "updating the wiki page"'],
    ['Creating pages for genuinely new outline entries is allowed.\n', 'the gerund "creating pages"'],
    ['Pages are created on the wiki during the pass.\n', 'the passive "are created on the wiki"'],
  ]) {
    assert.ok(kbCall({ 'skills/document/SKILL.md': text }).length >= 1, `${label} is caught`);
  }

  // --- unmapped-paths-form (ADR 0074): a `{paths}` form belongs to a runner that maps a source file to
  // the tests covering it ---

  const unmapped = (files) => found(scanUnmappedPathsForms(fixture(files)));
  const upGaps1 = unmapped({ 'skills/setup/SKILL.md': 'Derive the focused command, for example `pytest -- {paths}`.\n' });
  assert.equal(upGaps1.length, 1, 'flags a `pytest -- {paths}` proposal');
  assert.equal(upGaps1[0].source, path.join('skills', 'setup', 'SKILL.md'), 'names the proposing document');
  assert.match(upGaps1[0].expectation, /maps a source file/, 'the gap names the mapping requirement');
  for (const [form, label] of [
    ['`pytest {paths}`', 'a bare `pytest {paths}`'],
    ['`go test ./... {paths}`', 'a `{paths}` form carrying a path argument'],
    ['`pytest --rootdir=. {paths}`', 'a `{paths}` form whose flag carries a `=value`'],
    ['`PYTEST {paths}`', 'a `{paths}` form naming the runner in a different case'],
  ]) {
    assert.equal(unmapped({ 'references/test-selection.md': `For example ${form}.\n` }).length, 1, `flags ${label}`);
  }
  assert.equal(
    unmapped({ 'skills/setup/SKILL.md': 'Derive `npx vitest related --passWithNoTests {paths}`.\n' }).length,
    0,
    "a mapping runner's `{paths}` form stays silent",
  );
  assert.equal(
    unmapped({ 'skills/setup/SKILL.md': 'pytest maps no source file to its tests, so it takes no `{paths}` form at all.\n' }).length,
    0,
    'prose naming a non-mapping runner and `{paths}` in one sentence stays silent',
  );

  // --- change-type: the change-type set the prose lists, the hook matches, the glossary restates, and
  // scope.js validates is one set ---

  const changeType = (files) => found(scanContract(fixture(files), CHANGE_TYPE_CONTRACTS));
  for (const [rel, body, label] of [
    ['references/scope-mode.md', 'one of `feat`, `fix`, `refactor`, `docs`, `perf`, `test`.\n', 'a prose list the hook no longer matches'],
    ['hooks/scope-prune.js', 'const CHANGE_TYPES = /^(feat|fix)$/;\n', 'the hook narrowing away from the stated set'],
    ['scripts/scope.js', "const CHANGE_TYPES = ['feat', 'fix'];\n", 'scope.js narrowing CHANGE_TYPES away from the stated set'],
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

  // --- arg-token (ADR 0135): the Bash hooks read a command line through ./shell-words.js and declare no
  // shell-word reader of their own ---

  const SCANNER_REQUIRE = "const sw = require('./shell-words.js');\n";
  const argToken = (files) => found(scanContract(fixture(files), ARG_TOKEN_CONTRACTS));

  const argGaps1 = argToken({ 'hooks/merge-guard.js': SCANNER_REQUIRE + 'const ARG = /\\S+/.source;\n' });
  assert.equal(argGaps1.length, 1, 'flags a hook that declares its own ARG');
  assert.equal(argGaps1[0].source, path.join('hooks', 'merge-guard.js'), 'names the hook that drifted');
  for (const name of ['RAW_ARG', 'STUCK', 'STUCK_MERGE']) {
    assert.equal(argToken({ 'hooks/run-trace.js': SCANNER_REQUIRE + `const ${name} = /x/;\n` }).length, 1, `flags a hook that declares its own ${name}`);
  }
  assert.equal(
    argToken({ 'hooks/ledger-guard.js': SCANNER_REQUIRE + 'function stripHeredocs(s) { return s; }\n' }).length,
    1,
    'flags a hook that declares its own stripHeredocs',
  );
  assert.equal(
    argToken({ 'hooks/ledger-guard.js': SCANNER_REQUIRE + "const dash = text.replace(/(?<![$(])\\(\\(+/g, (r) => r.split('').join(' '));\n" }).length,
    1,
    'flags a hook that declares its own (( spread',
  );
  for (const spread of ['/\\({2,}/g', '/[(]{2,}/g', '/\\(+\\(/g', '/[(][(]/g']) {
    assert.equal(
      argToken({ 'hooks/run-trace.js': SCANNER_REQUIRE + `const dash = text.replace(${spread}, (r) => r.split('').join(' '));\n` }).length,
      1,
      `flags a hook that spreads (( written ${spread}`,
    );
  }
  assert.equal(
    argToken({ 'hooks/merge-guard.js': SCANNER_REQUIRE + '// `dash -c \\(\\(git\\ push\\)\\)` is read through dashReading\n' }).length,
    0,
    'a comment naming \\(\\( is no spread',
  );
  assert.equal(argToken({ 'hooks/run-trace.js': 'const x = 1;\n' }).length, 1, 'flags a hook that does not require ./shell-words.js');
  assert.equal(
    scanContract(
      fixture({
        'hooks/merge-guard.js': '// leading comment\n' + SCANNER_REQUIRE,
        'hooks/ledger-guard.js': SCANNER_REQUIRE,
        'hooks/run-trace.js': SCANNER_REQUIRE + 'const IS_MERGE = null;\n',
      }),
      ARG_TOKEN_CONTRACTS,
    ).length,
    0,
    'a require of ./shell-words.js in every hook yields zero gaps',
  );
  for (const decl of ['let ARG = /x/;\n', 'var STUCK = /x/;\n', 'const x = 1, ARG = /x/;\n', 'let a = 1,\n  stripHeredocs = (s) => s;\n']) {
    assert.equal(argToken({ 'hooks/merge-guard.js': SCANNER_REQUIRE + decl }).length, 1, `flags a hook that declares a reader through ${JSON.stringify(decl)}`);
  }
  for (const text of [
    "// const sw = require('./shell-words.js');\n",
    "/* const sw = require('./shell-words.js'); */\n",
    " * require('./shell-words.js')\n",
    "const x = 1; // require('./shell-words.js')\n",
  ]) {
    assert.equal(argToken({ 'hooks/run-trace.js': text }).length, 1, `flags a hook whose only require is commented out: ${JSON.stringify(text)}`);
  }
  for (const text of ["const sw = require( './shell-words.js' );\n", "({ scan } = require(\"./shell-words.js\"));\n"]) {
    assert.equal(argToken({ 'hooks/run-trace.js': text }).length, 0, `accepts the require ${JSON.stringify(text)}`);
  }

  // --- source-sections: each canonical reference still carries the sections its readers are sent to ---

  const sourceSectionBodies = {
    'references/plan-contract.md':
      '# Plan contract\n\n## Fields\n\n## Epic visuals (optional, epic-only)\n\n' +
      '## Slice lifecycle & status\n\n## Append mode\n\n## Scope anchor\n\n## Release\n\n' +
      '## Run state\n\n## Definition of Done ticks\n\n## Triage record\n\n' +
      // the real document carries this one at `###`, with a trailing qualifier
      '### Assignee — store configuration, not a slice field\n\n## Feature label\n',
    'references/test-selection.md': '# Test selection\n\n## The two commands\n\n## Fallback to the full command\n',
    'references/content-types.md': '# Content types\n\n## The four types\n\n## The conceptual layer\n',
    'references/controlled-prose.md': '# Controlled prose\n\n## Modes\n\n## Self-check\n',
    'references/review-checklist.md':
      '# Review checklist\n\n## Anti-patterns\n\n## Vulnerability classes\n\n## Reuse audit\n\n## Consistency\n',
  };
  assert.equal(scanContract(fixture(sourceSectionBodies), SOURCE_SECTION_CONTRACTS).length, 0, 'all five canonical references intact yields zero gaps');

  const pinnedHeadings = [
    ['references/plan-contract.md', '## Fields\n\n'],
    ['references/plan-contract.md', '## Epic visuals (optional, epic-only)\n\n'],
    ['references/plan-contract.md', '## Slice lifecycle & status\n\n'],
    ['references/plan-contract.md', '## Append mode\n\n'],
    ['references/plan-contract.md', '## Scope anchor\n\n'],
    ['references/plan-contract.md', '## Release\n\n'],
    ['references/plan-contract.md', '## Run state\n\n'],
    ['references/plan-contract.md', '## Definition of Done ticks\n\n'],
    ['references/plan-contract.md', '## Triage record\n\n'],
    ['references/plan-contract.md', '### Assignee — store configuration, not a slice field\n\n'],
    ['references/plan-contract.md', '## Feature label\n'],
    ['references/test-selection.md', '## The two commands\n\n'],
    ['references/test-selection.md', '## Fallback to the full command\n'],
    ['references/content-types.md', '## The four types\n\n'],
    ['references/content-types.md', '## The conceptual layer\n'],
    ['references/controlled-prose.md', '## Modes\n\n'],
    ['references/controlled-prose.md', '## Self-check\n'],
    ['references/review-checklist.md', '## Anti-patterns\n\n'],
    ['references/review-checklist.md', '## Vulnerability classes\n\n'],
    ['references/review-checklist.md', '## Reuse audit\n\n'],
    ['references/review-checklist.md', '## Consistency\n'],
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

  // --- containment-delegation (ADR 0053, ADR 0069): publish-kb.js imports and calls scope.js's
  // testContainment rather than reimplementing the ancestry check ---

  const cdOwnTest = scanContract(
    fixture({
      'scripts/publish-kb.js':
        'function checkContainment(mainCheckout, scope) {\n' +
        "  const res = spawnSync('git', ['merge-base', '--is-ancestor', branch, base], { cwd: mainCheckout });\n" +
        '  return { performed: true, ok: res.status === 0 };\n' +
        '}\n',
    }),
    CONTAINMENT_DELEGATION_CONTRACTS,
  );
  assert.equal(cdOwnTest.length, 1, 'flags a publish-kb.js that reimplements the ancestry check itself');
  assert.equal(cdOwnTest[0].source, path.join('scripts', 'publish-kb.js'), 'names publish-kb.js');
  assert.equal(
    scanContract(
      fixture({ 'scripts/publish-kb.js': "const { testContainment } = require('./scope.js');\n// containment is checked some other way below\n" }),
      CONTAINMENT_DELEGATION_CONTRACTS,
    ).length,
    1,
    'an imported but never-called testContainment is not a delegation',
  );
  assert.equal(
    scanContract(
      fixture({
        'scripts/publish-kb.js':
          "const { testContainment } = require('./scope.js');\n\n" +
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

  // --- every check that reads a named document fails, naming the path, when that document is missing.
  // A check that walks a directory reads whatever the directory holds, so an empty tree gives it nothing
  // to report. ---

  const DIRECTORY_WALKERS = new Set([
    'reference',
    'command-resolution',
    'adr-numbers',
    'adr-status',
    'adr-relations',
    'no-second-reader',
    'shell-spawn',
    'conflict-conclusion-no-commit',
    'agent-tool-agnostic',
    'deploy-runner-exclusivity',
  ]);
  const empty = fixture({ '.keep': '' });
  for (const check of CHECKS) {
    const gaps = check.run(empty);
    if (DIRECTORY_WALKERS.has(check.id)) {
      assert.deepEqual(gaps, [], `${check.id}: an empty tree gives a directory walker nothing to report`);
      continue;
    }
    const missing = gaps.filter((g) => g.missing);
    assert.ok(missing.length > 0, `${check.id}: a missing document it reads fails the check`);
    for (const g of missing) {
      assert.ok(typeof g.source === 'string' && g.source.length > 0, `${check.id}: the gap names a path`);
      const line = formatGap(check, g);
      assert.ok(line.includes(g.source) && line.includes(check.id), `${check.id}: the printed gap names the path and the check`);
    }
  }

  // A directory walker passes vacuously when its directory is gone, so every directory the walkers read
  // must exist in the real repository.
  const walkedDirs = [
    ...['skills', 'agents', 'references', 'hooks', 'scripts'].map((dir) => docPath(realRoot, dir)),
    path.join(realRoot, 'docs', 'adr'),
  ];
  for (const dir of walkedDirs) {
    assert.ok(fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory(), `the directory walkers read ${dir}`);
  }

  console.log('drift-check selftest (checks) ok');
};
