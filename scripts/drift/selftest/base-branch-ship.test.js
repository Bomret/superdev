'use strict';

// Selftest suite: the scanners over the base-branch, ship, and derive wording (`scanners/base-branch-ship.js`).
// Run by ./index.js.

const { scanNoBaseBranchCommit, scanShipNoOpensPr, scanPastPrSkills, scanDeriveNoDod } = require('../scanners');

module.exports = ({ assert, fixture, found }) => {
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
      'skills/status/SKILL.md':
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

  // --- past-pr-skills (ADR 0157, INV-0066, INV-0093): every skill an offer starts past the open pull
  // request is model-invocable, verify-ship and wrap-up name no `--unattended`, and no `--from-ship` remains ---

  const humanSkill = (extra) => ['---', 'name: x', 'disable-model-invocation: true', '---', '', extra, ''].join('\n');
  const openSkill = (extra) => ['---', 'name: x', '---', '', extra, ''].join('\n');
  const pastPr = (files) => found(scanPastPrSkills(fixture(files)));
  for (const name of ['ship', 'verify-ship', 'wrap-up', 'publish-kb']) {
    assert.equal(pastPr({ [`skills/${name}/SKILL.md`]: openSkill('Body.') }).length, 0, `${name} on the model-invocable surface is clean`);
    assert.equal(pastPr({ [`skills/${name}/SKILL.md`]: humanSkill('Body.') }).length, 1, `${name} off the model-invocable surface is caught`);
    assert.equal(
      pastPr({ [`skills/${name}/SKILL.md`]: openSkill('Body.\ndisable-model-invocation: true\n') }).length,
      0,
      `${name}: the key outside the frontmatter does not count`,
    );
  }
  assert.equal(pastPr({ 'skills/ship/SKILL.md': openSkill('It refuses an `--unattended` argument.') }).length, 0, 'ship may name --unattended to refuse it');
  for (const name of ['verify-ship', 'wrap-up']) {
    assert.equal(pastPr({ [`skills/${name}/SKILL.md`]: openSkill('Pass --unattended.') }).length, 1, `${name} naming --unattended is caught`);
  }
  for (const rel of ['skills/ship/SKILL.md', 'skills/verify-ship/SKILL.md', 'references/response-shapes.md']) {
    assert.equal(pastPr({ [rel]: openSkill('Add `--from-ship` to the call.') }).length, 1, `${rel} naming --from-ship is caught`);
  }
};
