'use strict';

// The bespoke scanners: every check whose assertion is more than "this document still matches this
// pattern". One section per scanner, each carrying its own positive and negative fixtures.
//
// Run by ./index.js, which owns the shared fixture() helper, realRoot, and the temp-dir cleanup.

const { scanContract } = require('../lib');
const {
  scan,
  scanRunRootPaths,
  scanScopetreeRunRootPaths,
  scanNoBaseBranchCommit,
  scanAssigneeContract,
  scanAnchorContract,
  scanAppendContract,
  scanReleaseContract,
  scanRunStateContract,
  scanTriageRecordContract,
  scanUntriagedContract,
  scanSpecialisingCitations,
  scanAfkSelectionNeutrality,
  scanAfkAnchorCount,
  scanWritingStandardContract,
  scanContentTypesContract,
  scanCommandRefs,
  scanChainHandoff,
  scanAfkInvocations,
  scanShipGateContract,
  scanUnresolvedGlossaryContract,
  scanHookLedgerParsers,
  scanAdrStatus,
  scanForcingBranchFlag,
  scanNarrativeCoverage,
  scanReturnToController,
  scanMarketplaceSource,
  scanReadmeCommands,
  scanAuditSetGlobs,
  scanPinnedPaths,
  scanAgentToolAgnostic,
  scanGlossarySpecialisingCitations,
  scanOrphanLensPlacement,
  scanTestCostLensPlacement,
  scanAgentLensNoDesignSmell,
} = require('../scanners');
const {
  ADR_STATUSES,
  DOC_PASS_CONTRACTS,
  PLAYBOOK_EDGE_CONTRACTS,
  SPECIALISING_SECTIONS,
  GLOSSARY_ENTRY_TITLES,
  REACHABLE_CRITERION_CONTRACTS,
  REVIEW_RANGE_SHAPES_CONTRACTS,
  EMPTY_ARGUMENT_CONTRACTS,
  AGENT_LENS_LIST_CONTRACTS,
  STANDING_CODE_LENS_CONTRACTS,
  CHAINED_CODE_REVIEW_CONTRACTS,
  CHAINED_DOC_AUDIT_CONTRACTS,
  CHAINED_TEST_AUDIT_CONTRACTS,
  SWEEP_CHAINED_LEG_CONTRACTS,
  SETUP_CHECK_CONTRACTS,
  SETUP_CHECK_RULES_CONTRACTS,
} = require('../contracts');
const CHECKS = require('../checks');

module.exports = ({ assert, fs, path, fixture, realRoot }) => {
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

  const missing2 = scan(tmp2);
  assert.equal(missing2.length, 0, 'all-present fixture yields zero missing');

  // fixture with a bare (no ${CLAUDE_PLUGIN_ROOT} macro) reference to a missing file — the prose
  // form used e.g. in skills/setup/SKILL.md ("Seed: `references/issue-tracker-local.md`")
  const tmp3 = fixture({ 'skills/baz/SKILL.md': 'Seed: `references/missing-bare.md`\n' });

  const missing3 = scan(tmp3);
  assert.equal(missing3.length, 1, 'detects a bare-form missing reference');
  assert.equal(missing3[0].reference, 'references/missing-bare.md', 'names the bare reference');

  // fixture where one reference cites another: the execution playbooks and scope-mode.md point at each
  // other, so a rename inside references/ dangles exactly like one in skills/ or agents/
  const tmp3b = fixture({
    'references/exists.md': '# exists\n',
    'references/playbook.md':
      'Read ${CLAUDE_PLUGIN_ROOT}/references/exists.md and ${CLAUDE_PLUGIN_ROOT}/references/gone.md\n',
  });

  const missing3b = scan(tmp3b);
  assert.equal(missing3b.length, 1, 'scans references/ too, detecting one missing reference');
  assert.equal(missing3b[0].reference, 'references/gone.md', 'names the missing reference');
  assert.equal(
    missing3b[0].source,
    path.join('references', 'playbook.md'),
    'names the reference file that cites it',
  );

  // a mention carrying no references/ path component stays invisible — the citation form the prose uses
  // in passing ("per `scope-mode.md`") is not a pointer scan() can resolve, and flagging it wholesale
  // would bury the real dangling ones
  const tmp3c = fixture({ 'references/playbook.md': 'per `gone.md` — no path\n' });

  assert.equal(scan(tmp3c).length, 0, 'a bare filename with no references/ component is not a reference');

  // --- scanRunRootPaths: run-root artifacts must use the absolute <run-root>/… form, never a
  // checkout-relative .superdev/scopes/<scope>/<artifact> path (wrong from a scopetree or slicetree cwd) ---

  // positive: an execution doc with checkout-relative run-root artifact paths is flagged
  const tmp4 = fixture({
    'references/implement-lite.md':
      'Update the ledger at `.superdev/scopes/<scope>/ledger.md` and check `.superdev/scopes/<scope>/run.lock`.\n',
  });
  const offenders4 = scanRunRootPaths(tmp4);
  assert.equal(offenders4.length, 2, 'flags both checkout-relative run-root artifact paths');
  assert.ok(
    offenders4.every((o) => o.source === 'references/implement-lite.md'),
    'names the source doc',
  );

  // negative: the absolute <run-root>/… form plus scopetree/slicetree *directory* paths are clean
  const tmp5 = fixture({
    'references/implement-lite.md':
      'Update the ledger at `<run-root>/ledger.md`; cut `.superdev/scopes/<scope>/scopetree`.\n',
    'agents/implementer.md':
      'Append to `<run-root>/reports/<id>/progress.md`; slicetree at `.superdev/scopes/<scope>/slicetrees/<id>`.\n',
  });
  const offenders5 = scanRunRootPaths(tmp5);
  assert.equal(offenders5.length, 0, 'absolute form + scopetree/slicetree dir paths yield zero offenders');

  // --- scanScopetreeRunRootPaths (ADR 0080): the four documents that address another run's scopetree
  // from their own cwd must use the absolute <run-root>/scopetree form, never the checkout-relative
  // .superdev/scopes/<scope>/scopetree literal RUN_ROOT_ARTIFACT_PATTERN above deliberately never
  // catches (most of its occurrences elsewhere are real git-worktree commands run from the checkout on
  // purpose). ---

  // positive: ship.md reverts to the checkout-relative literal
  const tmp5b = fixture({
    'skills/ship/SKILL.md': 'Remove this run\'s scopetree: `.superdev/scopes/<scope>/scopetree`.\n',
  });
  const offenders5b = scanScopetreeRunRootPaths(tmp5b);
  assert.equal(offenders5b.length, 1, 'flags the checkout-relative scopetree literal');
  assert.equal(offenders5b[0].source, path.join('skills', 'ship', 'SKILL.md'), 'names ship.md');

  // negative: the absolute <run-root>/scopetree form is clean, and a plain checkout-relative scopetree
  // *directory* cut elsewhere (e.g. scope-mode.md's own git-worktree command) is out of this scanner's
  // four-document list entirely, so it is never even read
  const tmp5c = fixture({
    'skills/ship/SKILL.md': 'Remove this run\'s scopetree: `<run-root>/scopetree`.\n',
    'references/scope-mode.md': 'git worktree add `.superdev/scopes/<scope>/scopetree` -b <branch>\n',
  });
  assert.equal(scanScopetreeRunRootPaths(tmp5c).length, 0, 'the absolute form yields zero offenders');

  // --- scanNoBaseBranchCommit (INV-0001, docs/invariants.md): no shipped file under skills/ or
  // references/ instructs a commit or a push to the base branch — every write a run makes lands on the
  // run's own scope branch, in its own scopetree. ---

  // positive: reintroducing the retired base-branch commit instruction is flagged, by file and line
  const tmp5d = fixture({
    'skills/plan/SKILL.md':
      'Ask the interview questions first.\n' +
      '**Commit the durable design docs** you wrote — `CONTEXT.md`, any ADRs (`docs/adr/`) — to the base branch.\n',
  });
  const offenders5d = scanNoBaseBranchCommit(tmp5d);
  assert.equal(offenders5d.length, 1, 'flags the reintroduced base-branch commit instruction');
  assert.equal(offenders5d[0].source, 'skills/plan/SKILL.md', 'names plan.md');
  assert.equal(offenders5d[0].line, 2, 'names the line the instruction starts on');

  // negative: a caution *against* committing onto the base branch reads correct, not as a violation —
  // references/prototype.md carries exactly this shape
  const tmp5e = fixture({
    'references/prototype.md':
      'Commit the prototype itself to a throwaway branch off the base — never onto the base branch — ' +
      'and leave a pointer to that branch where the decision landed.\n',
  });
  assert.equal(scanNoBaseBranchCommit(tmp5e).length, 0, 'a never-onto-base caution is not itself a violation');

  // negative: a `push-only` PR-posture value sitting near an unrelated "base branch" config field is not
  // a violation either — skills/setup/SKILL.md and the code-management seeds carry exactly this shape
  const tmp5f = fixture({
    'skills/setup/SKILL.md':
      'Confirm the default PR posture (`draft` | `ready` | `push-only`) and the\n' +
      '**base branch** (default `main`).\n',
  });
  assert.equal(scanNoBaseBranchCommit(tmp5f).length, 0, "a `push-only` config value near an unrelated base-branch field is not flagged");

  // positive: a `never` sitting between the verb and "base branch" but negating something else entirely
  // is a live bypass, not a caution — the exclusion only holds for a `never` that sits right next to
  // "base branch" itself (the shape prototype.md's own caution carries), not one anywhere in the window
  const tmp5g = fixture({
    'skills/plan/SKILL.md': 'Commit the docs now (never mind the formatting) directly to the base branch.\n',
  });
  const offenders5g = scanNoBaseBranchCommit(tmp5g);
  assert.equal(offenders5g.length, 1, 'a `never` far from "base branch" does not excuse the instruction');

  // positive: the base branch named by its own configured name (read from docs/agents/code-management.md's
  // `**Base branch:**` bullet), rather than the words "base branch", is still an instruction to commit or
  // push onto it
  const tmp5h = fixture({
    'docs/agents/code-management.md': '- **Base branch:** `main`.\n',
    'skills/ship/SKILL.md': 'Commit the design docs directly onto `main`.\n',
    'references/run-init.md': 'git push origin main\n',
  });
  const offenders5h = scanNoBaseBranchCommit(tmp5h);
  assert.equal(offenders5h.length, 2, 'flags both the backtick-named and the `origin`-pushed base branch');
  assert.deepEqual(
    offenders5h.map((g) => g.source).sort(),
    ['references/run-init.md', 'skills/ship/SKILL.md'],
    'names both offending files',
  );

  // negative: an ordinary, non-git use of the base branch's own name is not itself a violation — "main"
  // is common English too, and only a backtick-quoted or `origin`-pushed mention is a git target
  const tmp5i = fixture({
    'docs/agents/code-management.md': '- **Base branch:** `main`.\n',
    'skills/backlog/SKILL.md':
      'Resolve the checkout once, not per anchor: the main checkout is the PARENT of the scopetree, and ' +
      'a run root never commits anything there.\n',
  });
  assert.equal(scanNoBaseBranchCommit(tmp5i).length, 0, 'the adjective "main" near an unrelated commit is not flagged');

  // ponytail: the sliding window is 4 lines / 150 chars — a proven heuristic, not a parser. An
  // instruction split across 5 or more lines is missed; lift the ceiling by widening
  // BASE_BRANCH_COMMIT_WINDOW (and, in step, the 150-char proximity bound) if that shape shows up for
  // real.
  const tmp5j = fixture({
    'skills/plan/SKILL.md':
      'Commit\n' +
      'the\n' +
      'durable\n' +
      'design\n' +
      'docs to the base branch.\n',
  });
  assert.equal(scanNoBaseBranchCommit(tmp5j).length, 0, 'known ceiling: a 5-line-split instruction is missed');

  // negative: a `never` that negates the *verb* itself, sitting right before it rather than right
  // before the target, is a caution too — the most natural phrasing of one
  const tmp5k = fixture({
    'references/prototype.md': 'Never commit prototype code to the base branch.\n',
  });
  assert.equal(scanNoBaseBranchCommit(tmp5k).length, 0, 'a never-before-the-verb caution is not a violation');

  const tmp5l = fixture({
    'references/prototype.md': 'Never push a prototype branch to the base branch.\n',
  });
  assert.equal(scanNoBaseBranchCommit(tmp5l).length, 0, 'a never-before-the-verb push caution is not a violation');

  // negative: a never-before-the-verb caution split across a line break is still a caution — `negated()`
  // must test the full document up to the match's absolute offset, never only the sliding window that
  // happened to find it, or the same physical instruction re-matches with no negating context once the
  // window's own start has slid past the `never` line (review finding).
  const tmp5lb = fixture({
    'references/prototype.md': 'Do the work. This is fine, but never\ncommit it to the base branch afterwards.\n',
  });
  assert.equal(
    scanNoBaseBranchCommit(tmp5lb).length,
    0,
    'a never-before-the-verb caution split across a line break is not a violation',
  );

  // positive: a genuine violation later in the same file must still be reported even though an earlier,
  // correctly-excused caution shares its exact verb/target shape — the scan must not stop at its first
  // hit, negated or not (review finding).
  const tmp5lc = fixture({
    'references/prototype.md':
      'Do the work. This is fine, but never\n' +
      'commit it to the base branch afterwards.\n' +
      'Later, actually commit this straight to the base branch for real.\n',
  });
  const offenders5lc = scanNoBaseBranchCommit(tmp5lc);
  assert.equal(offenders5lc.length, 1, 'the later real violation is reported, not masked by the earlier caution');
  assert.equal(offenders5lc[0].line, 3, 'names the line the real violation starts on');

  // negative: docs/agents/code-management.md missing, or carrying no `**Base branch:**` bullet, degrades
  // to phrase-based matching ("base branch") rather than throwing — the base's own name simply never
  // gets its own pattern
  const tmp5m = fixture({
    'skills/plan/SKILL.md': 'Ask the interview questions first.\n',
  });
  assert.doesNotThrow(() => scanNoBaseBranchCommit(tmp5m), 'no code-management.md at all does not throw');
  assert.equal(scanNoBaseBranchCommit(tmp5m).length, 0, 'and reports nothing when no instruction is present');

  // --- scanAssigneeContract: an issue-backend doc that describes creating an issue must carry the
  // `## Assignee` section, and must NOT carry a `- **Assignee:**` configuration bullet. The assignee is
  // read from `.superdev/info.json` (ADR 0073), so a tracked bullet is a personal identifier committed to
  // a shared repository — the leak the decision removes. The local-file store is exempt from both halves.
  // The cases below each isolate one half by satisfying the other, so a fixture reports the gap it is
  // about. ---

  // negative: an issue-backend seed carrying the section and no config bullet is the target state
  const tmp6 = fixture({
    'references/issue-tracker-acme.md':
      '**Create a slice issue**: `POST /api/v1/repos/o/r/issues` with `{ "title": "...", "labels": [] }`.\n\n' +
      '## Assignee\n\nRead from `.superdev/info.json`, applied at creation.\n',
  });
  const gaps6 = scanAssigneeContract(tmp6);
  assert.equal(gaps6.length, 0, 'a seed with the section and no config bullet yields zero gaps');

  // positive: the same seed re-growing the tracked config bullet is flagged
  const tmp7 = fixture({
    'references/issue-tracker-acme.md':
      '- **Assignee:** `<login>` — the account every issue a run creates is assigned to.\n\n' +
      '**Create a slice issue**: `POST /api/v1/repos/o/r/issues` with `{ "title": "...", "assignees": ["x"] }`.\n\n' +
      '## Assignee\n\nApplied at creation.\n',
  });
  const gaps7 = scanAssigneeContract(tmp7);
  assert.equal(gaps7.length, 1, 'flags a seed carrying a tracked assignee config bullet');
  assert.equal(gaps7[0].source, path.join('references', 'issue-tracker-acme.md'), 'names the seed');
  assert.match(gaps7[0].expectation, /bullet/, 'the gap names the bullet half');

  // the local-file store creates slice FILES, not issues, and is exempt even though it is an
  // issue-tracker-*.md document
  const tmp8 = fixture({
    'references/issue-tracker-local.md':
      'Create an issue file per slice under `docs/plans/<feature>/`. `POST /issues` is not used.\n',
  });
  const gaps8 = scanAssigneeContract(tmp8);
  assert.equal(gaps8.length, 0, 'the local-file store is exempt from the assignee contract');

  // positive: a seed describing the `gh issue create` CLI form (no "create an issue" prose, no
  // `POST .../issues`) still creates issues and must carry the section too — every
  // references/issue-tracker-*.md not in ASSIGNEE_EXEMPT is an issue backend by definition, so the
  // filename alone is the trigger
  const tmp9 = fixture({
    'references/issue-tracker-ghcli.md': '`gh issue create -t "<title>" -b "<body>" -l "<label>"`\n',
  });
  const gaps9 = scanAssigneeContract(tmp9);
  assert.equal(gaps9.length, 1, 'flags a gh-issue-create seed with no assignee section');
  assert.match(gaps9[0].expectation, /section/, 'the gap names the section half');

  // a **bolded** mention in running prose is not a config bullet. The forbidden form is the
  // `- **Assignee:** <value>` list item; prose that refers to "the **Assignee** value" states no
  // tracked configuration and is left alone.
  const tmp11 = fixture({
    'references/issue-tracker-prose.md':
      '## Assignee\n\nThe **Assignee** is read from `.superdev/info.json` and applied to every slice.\n',
  });
  const gaps11 = scanAssigneeContract(tmp11);
  assert.equal(gaps11.length, 0, 'a bolded prose mention is not a config bullet');

  // both real spellings of the config bullet are caught, so neither survives as a loophole
  const tmp12 = fixture({
    'references/issue-tracker-colon-inside.md':
      '- **Assignee:** `someone` — the account every issue is assigned to.\n\n## Assignee\n\nApplied at creation.\n',
    'references/issue-tracker-colon-outside.md':
      '- **Assignee**: `<accountId>` — the account every issue is assigned to.\n\n## Assignee\n\nApplied at creation.\n',
  });
  const gaps12 = scanAssigneeContract(tmp12);
  assert.equal(gaps12.length, 2, 'both `**Assignee:**` and `**Assignee**:` bullets are flagged');

  // --- the contract still has two halves, and this scanner asserts both. `ASSIGNEE_PATTERN` pins the
  // forbidden `- **Assignee:**` configuration bullet; `specialisingHeading('Assignee')` pins the required
  // `## Assignee` section the store renders for `plan-contract.md`'s generic contract. Without the section
  // half the section stays deletable with every check green: the citation contract skips a store rendering
  // no section, which is the same branch that correctly exempts one that carries none by design. ---

  // the bullet present and the section gone reports both halves, rather than stopping at the first
  const asBulletOnly = fixture({
    'references/issue-tracker-acme.md':
      '# acme\n\n## Configuration\n\n- **Assignee:** `<login>`\n\nNo section anywhere.\n',
  });
  const asBulletOnlyGaps = scanAssigneeContract(asBulletOnly);
  assert.equal(asBulletOnlyGaps.length, 2, 'a document carrying the bullet and no section reports both gaps');
  assert.equal(
    asBulletOnlyGaps[0].source,
    path.join('references', 'issue-tracker-acme.md'),
    'names the document',
  );

  // the two halves report apart: a document carrying neither is missing only the section
  const asSectionOnly = scanAssigneeContract(
    fixture({ 'references/issue-tracker-acme.md': '# acme\n\nSlices are issues.\n' }),
  );
  assert.equal(asSectionOnly.length, 1, 'flags a store document carrying neither the bullet nor the section');
  assert.match(asSectionOnly[0].expectation, /section/, 'the gap says which half is missing');
  assert.notStrictEqual(
    asSectionOnly[0].expectation,
    asBulletOnlyGaps.find((g) => /bullet/.test(g.expectation)).expectation,
    'the two halves do not report as the same gap',
  );

  // a `###` heading satisfies the section half, the same latitude every family heading takes —
  // `specialisingHeading()` spans `#{2,3}`, so no second copy of the pattern lives here
  assert.equal(
    scanAssigneeContract(
      fixture({
        'references/issue-tracker-acme.md': '# acme\n\n### Assignee\n\nApplied at creation.\n',
      }),
    ).length,
    0,
    'a deeper heading level still carries the section',
  );

  // a heading shown only inside a fenced code example is not the section, and a bullet shown only inside
  // one is not tracked configuration. Both halves read fence-masked text, defensively: the store seeds do
  // render headings inside fenced examples elsewhere.
  const asFenced = scanAssigneeContract(
    fixture({
      'references/issue-tracker-acme.md':
        '# acme\n\n```markdown\n## Assignee\n\n- **Assignee:** `x`\n```\n',
    }),
  );
  assert.equal(asFenced.length, 1, 'a fenced example satisfies neither half and trips neither');
  assert.match(asFenced[0].expectation, /section/, 'and the gap names the section half');

  // the local-file store is exempt from both halves, through the one ASSIGNEE_EXEMPT set: it has no
  // assignee concept, so it renders neither the section nor a bullet
  assert.equal(
    scanAssigneeContract(
      fixture({ 'references/issue-tracker-local.md': '# store\n\nA slice is a file under `docs/plans/`.\n' }),
    ).length,
    0,
    'the local-file store is exempt from the section half too',
  );

  // this repo's own dogfooded store config is held to both halves alongside the seeds
  const asDogfood = scanAssigneeContract(
    fixture({ 'docs/agents/issue-tracker.md': '# Slice store\n\n- **Assignee:** `<login>`\n\n## Assignee\n\nApplied.\n' }),
  );
  assert.equal(asDogfood.length, 1, 'the dogfooded store config is checked too');
  assert.equal(asDogfood[0].source, path.join('docs', 'agents', 'issue-tracker.md'), 'names it');
  assert.match(asDogfood[0].expectation, /bullet/, 'a tracked identifier in the dogfooded config is the gap');

  // a seed added to references/ later is covered without editing this scanner
  assert.equal(
    scanAssigneeContract(
      fixture({ 'references/issue-tracker-newstore.md': '# newstore\n\n- **Assignee:** `x`\n' }),
    ).length,
    2,
    'a seed this scanner has never seen before is held to both halves',
  );

  // an absent document is skipped, matching every other presence contract on a partial checkout
  assert.equal(
    scanAssigneeContract(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'an absent document is skipped rather than reported',
  );

  // the real tree is green: every non-exempt store document carries the section and no config bullet
  assert.equal(
    scanAssigneeContract(realRoot).length,
    0,
    'every store document in the real tree carries the section and no tracked assignee bullet',
  );

  // --- scanWritingStandardContract: the documentation seed must carry the `## Writing standard`
  // section. A seed that loses it makes /superdev:setup write a doc convention with no standard, and
  // the doc agents silently fall back to no standard at all — the same silent-drop failure the
  // assignee contract exists to prevent. ---

  // positive: a seed with no `## Writing standard` section is flagged
  const tmp13 = fixture({
    'references/documentation.md':
      '# Documentation: in-repo technical docs\n\n- **Hierarchy.** Root `AGENTS.md` holds the index.\n',
  });
  const wsGaps13 = scanWritingStandardContract(tmp13);
  assert.equal(wsGaps13.length, 1, 'flags a documentation seed with no writing-standard section');
  assert.equal(
    wsGaps13[0].source,
    path.join('references', 'documentation.md'),
    'names the seed',
  );

  // negative: the same seed carrying the section is clean
  const tmp14 = fixture({
    'references/documentation.md':
      '# Documentation\n\n## Writing standard\n\n**Standard:** `<controlled | path | none>`\n',
  });
  const wsGaps14 = scanWritingStandardContract(tmp14);
  assert.equal(wsGaps14.length, 0, 'a seed carrying the section yields zero gaps');

  // a bare prose mention is not the section — the contract is a heading `/setup` fills in, and prose
  // that merely refers to "the writing standard" says nothing about whether the seed offers one
  const tmp15 = fixture({
    'references/documentation.md':
      '# Documentation\n\nThe writing standard governs prose the doc agents write.\n',
  });
  const wsGaps15 = scanWritingStandardContract(tmp15);
  assert.equal(wsGaps15.length, 1, 'a prose mention is not the section');

  // an absent seed is skipped, so partial fixtures do not fail the check
  const tmp16 = fixture({ 'references/other.md': '# another reference\n' });
  const wsGaps16 = scanWritingStandardContract(tmp16);
  assert.equal(wsGaps16.length, 0, 'an absent seed is skipped');

  // --- scanContentTypesContract: both doc agents must wire the content-type lens. scan() above catches
  // a reference pointing at a file that does not exist; it cannot catch the reverse, an agent that stops
  // referencing a file which still exists. That leaves the reference present, the suite green, and the
  // lens dead in every dispatch (ADR 0014). ---

  // fixture() builds a throwaway repo tree for a selftest case: given a `files` object (a checkout-
  // relative path → its content), it creates each file's parent directory as needed and writes it,
  // returning the tmp root. Shared by every fixture below (content-types, stage, command-refs,
  // chain-handoff) — one general helper instead of four near-identical ones that only differed in which
  // directory they mkdir'd upfront.
  const wired = 'Read `${CLAUDE_PLUGIN_ROOT}/references/content-types.md` and apply it.\n';
  const unwired = '# doc agent\n\nNo lens here.\n';

  // positive: doc-reader dropped its wire
  const ct17 = fixture({
    'references/doc-pass.md': wired,
    'agents/doc-reader.md': unwired,
  });
  const ctGaps17 = scanContentTypesContract(ct17);
  assert.equal(ctGaps17.length, 1, 'flags the agent that dropped the content-types reference');
  assert.equal(ctGaps17[0].source, path.join('agents', 'doc-reader.md'), 'names doc-reader');

  // positive: the doc-pass reference dropped its wire — the same failure from the other side
  const ct18 = fixture({
    'references/doc-pass.md': unwired,
    'agents/doc-reader.md': wired,
  });
  const ctGaps18 = scanContentTypesContract(ct18);
  assert.equal(ctGaps18.length, 1, 'flags doc-pass.md when it is the one that dropped the wire');
  assert.equal(ctGaps18[0].source, path.join('references', 'doc-pass.md'), 'names doc-pass.md');

  // negative: both wired is clean
  const ct19 = fixture({
    'references/doc-pass.md': wired,
    'agents/doc-reader.md': wired,
  });
  assert.equal(scanContentTypesContract(ct19).length, 0, 'both agents wired yields zero gaps');

  // a bare prose path counts too, matching how scan() accepts either form
  const ct20 = fixture({
    'references/doc-pass.md': 'Read `references/content-types.md` before your first edit.\n',
    'agents/doc-reader.md': wired,
  });
  assert.equal(scanContentTypesContract(ct20).length, 0, 'a bare reference path satisfies the contract');

  // the path alone is not a wire: an agent that mentions the file in passing but never instructs itself
  // to read it has already lost the lens, which is the drift this check exists to catch
  const ct21 = fixture({
    'references/doc-pass.md': 'The lens lives in `references/content-types.md` and matters here.\n',
    'agents/doc-reader.md': wired,
  });
  assert.equal(
    scanContentTypesContract(ct21).length,
    1,
    'a passing mention with no read instruction is still a gap',
  );

  // an absent agent file is skipped, so a fixture carries only the files it exercises
  const ct22 = fixture({ 'references/doc-pass.md': wired });
  assert.equal(scanContentTypesContract(ct22).length, 0, 'an absent doc file is skipped');

  // --- DOC_PASS_CONTRACTS: every caller of the documentation pass reads the reference that states it
  // (ADR 0031). The lens, staging, and aggregate contracts above all moved onto that reference with the
  // prose, so they stay green for a caller that dropped the read — this is the check that does not. ---

  // positive: the writer keeps its brief but stops reading the pass it performs
  const dp1 = fixture({
    'agents/doc-writer.md': '# doc-writer\n\nYou reconcile documentation with reality.\n',
  });
  const dpGaps1 = scanContract(dp1, DOC_PASS_CONTRACTS);
  assert.equal(dpGaps1.length, 1, 'flags a doc-writer that no longer reads references/doc-pass.md');
  assert.equal(dpGaps1[0].source, path.join('agents', 'doc-writer.md'), 'names doc-writer.md');

  // positive: naming the reference in passing is not reading it, the same rule content-types applies
  const dp2 = fixture({
    'agents/doc-writer.md': 'The pass is stated in `references/doc-pass.md`, which matters here.\n',
  });
  assert.equal(
    scanContract(dp2, DOC_PASS_CONTRACTS).length,
    1,
    'a passing mention with no read instruction is still a gap',
  );

  // negative: either path form satisfies it, since the agent resolves both at dispatch
  const dp3 = fixture({
    'agents/doc-writer.md': 'Read `references/doc-pass.md` and perform the pass it states.\n',
  });
  assert.equal(scanContract(dp3, DOC_PASS_CONTRACTS).length, 0, 'a bare reference path satisfies it');

  // positive: the lite playbook keeps its inline doc step but stops reading the pass it performs
  const dp6 = fixture({
    'references/implement-lite.md': '## Documentation\n\nReconcile the docs your slice touched.\n',
  });
  const dpGaps6 = scanContract(dp6, DOC_PASS_CONTRACTS);
  assert.equal(dpGaps6.length, 1, 'flags an implement-lite.md doc step that no longer reads references/doc-pass.md');
  assert.equal(dpGaps6[0].source, path.join('references', 'implement-lite.md'), 'names implement-lite.md');

  // positive: the dispatching command paraphrases the pass instead of naming the reference that owns it.
  // This is the dispatch-prose half of the same contract (ADR 0035): a controller writes its dispatch from
  // what `skills/document/SKILL.md` says the writer does, so a paraphrase here is what reaches the writer —
  // and the row above, on the agent alone, stays green while the two descriptions drift apart.
  const dp4 = fixture({
    'skills/document/SKILL.md':
      'Dispatch `superdev:doc-writer`. It runs two passes (in-repo docs, then the knowledge base), ' +
      'deleting stale text, and commits on the current branch.\n',
  });
  const dpGaps4 = scanContract(dp4, DOC_PASS_CONTRACTS);
  assert.equal(dpGaps4.length, 1, 'flags a document.md whose dispatch paraphrases the pass');
  assert.equal(dpGaps4[0].source, path.join('skills', 'document', 'SKILL.md'), 'names document.md');

  // negative: the dispatch names the reference as the authority the writer performs
  const dp5 = fixture({
    'skills/document/SKILL.md':
      'It performs the pass `references/doc-pass.md` states. **Name that reference in the dispatch**: it ' +
      'owns the pass end to end.\n',
  });
  assert.equal(
    scanContract(dp5, DOC_PASS_CONTRACTS).length,
    0,
    'a dispatch that names the reference satisfies the row',
  );

  // --- scanAfkAnchorCount: `skills/afk/SKILL.md`'s paragraph introducing `## Scope anchor` states how many
  // things that section carries for this backend (ADR 0040 made it five, naming the anchor dependency as
  // the fifth). Both elements are independent, and the scan is narrowed to the one paragraph — a
  // restatement anywhere else in the same section must not satisfy a stale paragraph. ---

  // positive: the stale "four things" paragraph, naming only the original four, is two gaps
  const aacStale = fixture({
    'skills/afk/SKILL.md':
      '`docs/agents/issue-tracker.md` carries a `## Scope anchor` section stating four things for this ' +
      'backend: how to recognise an anchor, how to list the candidates, how to list the slices beneath ' +
      'one, and how to tell that an anchor is itself a slice.\n',
  });
  const aacGaps = scanAfkAnchorCount(aacStale);
  assert.equal(aacGaps.length, 2, 'the stale paragraph fails the count row and the naming row independently');

  // positive: the count fixed but the fifth thing still unnamed is one gap
  const aacCountOnly = fixture({
    'skills/afk/SKILL.md':
      '`docs/agents/issue-tracker.md` carries a `## Scope anchor` section stating five things for this ' +
      'backend: how to recognise an anchor, how to list the candidates, how to list the slices beneath ' +
      'one, and how to tell that an anchor is itself a slice.\n',
  });
  assert.equal(
    scanAfkAnchorCount(aacCountOnly).length,
    1,
    'fixing the count alone still leaves the fifth thing unnamed',
  );

  // negative: both the count and the fifth element are named
  const aacFixed = fixture({
    'skills/afk/SKILL.md':
      '`docs/agents/issue-tracker.md` carries a `## Scope anchor` section stating five things for this ' +
      'backend: how to recognise an anchor, how to list the candidates, how to list the slices beneath ' +
      'one, how to tell that an anchor is itself a slice, and how to read an anchor\'s own dependencies.\n',
  });
  assert.equal(scanAfkAnchorCount(aacFixed).length, 0, 'the fixed paragraph satisfies both rows');

  // narrowing: a restatement elsewhere in §2's body (a second paragraph, separated by a blank line) that
  // carries both phrases must not save a stale intro paragraph — a section-wide or document-wide match
  // would pass this fixture, which is exactly the false green extractParagraph() exists to prevent
  const aacNarrowed = fixture({
    'skills/afk/SKILL.md':
      '`docs/agents/issue-tracker.md` carries a `## Scope anchor` section stating four things for this ' +
      'backend: how to recognise an anchor, how to list the candidates, how to list the slices beneath ' +
      'one, and how to tell that an anchor is itself a slice.\n\n' +
      'Later in this same section, unrelated to the paragraph above: the section in fact states five ' +
      "things for this backend, the fifth being how to read an anchor's own dependencies.\n",
  });
  assert.equal(
    scanAfkAnchorCount(aacNarrowed).length,
    2,
    'a restatement elsewhere in the section does not save a stale intro paragraph',
  );

  // the real repository's own afk.md satisfies both rows
  assert.equal(
    scanAfkAnchorCount(realRoot).length,
    0,
    "this repo's own afk.md states five things and names the anchor dependency",
  );

  // --- scanAdrStatus: every ADR must state a status. An ADR with no status line reads as accepted
  // whether or not anything implements it, which is how a decision gets documented as live while the
  // code has none of it. ---

  const adrBody = (status) =>
    `# 0099 — A decision\n\n${status ? `**Status:** ${status}\n\n` : ''}## Context\n\nSomething.\n`;

  // positive: an ADR with no status line at all
  const adr1 = fixture({ 'docs/adr/0099-a-decision.md': adrBody(null) });
  const adrGaps1 = scanAdrStatus(adr1);
  assert.equal(adrGaps1.length, 1, 'flags an ADR that states no status');
  assert.equal(adrGaps1[0].source, path.join('docs', 'adr', '0099-a-decision.md'), 'names the ADR');

  // positive: a status outside the recognised set is not a status
  assert.equal(
    scanAdrStatus(fixture({ 'docs/adr/0099-a.md': adrBody('Draft') })).length,
    1,
    'an unrecognised status value is flagged',
  );

  // positive: capitalization is pinned — a lowercase value greps and sorts apart from the rest
  assert.equal(
    scanAdrStatus(fixture({ 'docs/adr/0099-a.md': adrBody('accepted') })).length,
    1,
    'a lowercase status value is flagged',
  );

  // positive: prose that merely mentions a status is not the line
  assert.equal(
    scanAdrStatus(
      fixture({ 'docs/adr/0099-a.md': '# 0099 — A\n\nThis ADR is Accepted in practice.\n' }),
    ).length,
    1,
    'a prose mention is not the status line',
  );

  // negative: each recognised value satisfies the check
  for (const status of ADR_STATUSES) {
    assert.equal(
      scanAdrStatus(fixture({ 'docs/adr/0099-a.md': adrBody(status) })).length,
      0,
      `\`${status}\` satisfies the contract`,
    );
  }

  // every offender is reported, not just the first
  const adrMany = fixture({
    'docs/adr/0098-a.md': adrBody(null),
    'docs/adr/0099-b.md': adrBody('Accepted'),
    'docs/adr/0100-c.md': adrBody('accepted'),
  });
  assert.deepEqual(
    scanAdrStatus(adrMany).map((g) => path.basename(g.source)),
    ['0098-a.md', '0100-c.md'],
    'both offenders reported, in filename order, and the compliant ADR is not',
  );

  // a non-markdown file in the ADR tree is not an ADR
  assert.equal(
    scanAdrStatus(fixture({ 'docs/adr/README.txt': 'no status here' })).length,
    0,
    'a non-markdown file is skipped',
  );

  // an absent ADR tree is skipped, so a fixture carries only the files it exercises
  assert.equal(scanAdrStatus(fixture({ 'README.md': '# repo\n' })).length, 0, 'absent ADR tree is skipped');

  // --- scanAnchorContract: every slice-store document must state how to identify a feature's scope
  // anchor (ADR 0017). `/superdev:afk` selects by anchor and reads that contract instead of encoding one
  // store's shape, so a document without it leaves the sweep blind in that backend. The local-file store
  // is NOT exempt here, unlike the assignee contract — it has an anchor, its `00-epic-*.md` file. ---

  const anchorSection =
    '## Scope anchor\n\n' +
    'The anchor is the feature root: the issue that is nobody\'s sub-issue.\n\n' +
    '- **Recognise one.** It carries no parent link.\n' +
    '- **List the candidates.** Query per feature label and keep the roots.\n' +
    '- **List the slices beneath it.** The same query returns them.\n' +
    '- **Tell an anchor that is itself a slice.** It carries a test-applicability label.\n' +
    "- **Read an anchor's dependencies.** The `waits-on` field on the root issue.\n";

  // positive: a store document with no anchor section is flagged
  const an1 = fixture({ 'references/issue-tracker-acme.md': '# acme\n\nSlices are issues.\n' });
  const anGaps1 = scanAnchorContract(an1);
  assert.equal(anGaps1.length, 1, 'flags a store document with no anchor contract');
  assert.equal(anGaps1[0].source, path.join('references', 'issue-tracker-acme.md'), 'names the seed');

  // negative: the same document carrying the section, with every element named, is clean
  const an2 = fixture({ 'references/issue-tracker-acme.md': anchorSection });
  assert.equal(scanAnchorContract(an2).length, 0, 'a document naming every element yields zero gaps');

  // positive: the heading alone, with no elements, is not the contract — this is the empty-section gap
  // that shipped finding #4 unnoticed
  const anEmpty = fixture({
    'references/issue-tracker-acme.md':
      '## Scope anchor\n\nThe anchor is the feature root: the issue that is nobody\'s sub-issue.\n',
  });
  assert.equal(scanAnchorContract(anEmpty).length, 5, 'a heading naming no element flags all five');

  // positive: the section is missing just one element — only that one is flagged
  const anPartial = fixture({
    'references/issue-tracker-acme.md': anchorSection.replace(
      '- **List the slices beneath it.** The same query returns them.\n',
      '',
    ),
  });
  const anPartialGaps = scanAnchorContract(anPartial);
  assert.equal(anPartialGaps.length, 1, 'flags exactly the one missing element');
  assert.match(anPartialGaps[0].expectation, /beneath/, 'names the missing element');

  // positive: the dependency element alone is missing (ADR 0040). The other four are stated, so a
  // document written before that decision reports exactly the one thing it never said.
  const anNoDeps = fixture({
    'references/issue-tracker-acme.md': anchorSection.replace(
      "- **Read an anchor's dependencies.** The `waits-on` field on the root issue.\n",
      '',
    ),
  });
  const anNoDepsGaps = scanAnchorContract(anNoDeps);
  assert.equal(anNoDepsGaps.length, 1, 'flags the missing dependency element alone');
  assert.match(anNoDepsGaps[0].expectation, /dependenc/, 'names the dependency element');

  // positive: intro prose discussing dependencies is not the element. Two real store documents open this
  // section by saying the native issue-dependencies unit is disabled, which states no way to read the
  // relation — a pattern free of the bullet lead-in would pass on exactly that sentence.
  const anDepsProse = fixture({
    'references/issue-tracker-acme.md': anchorSection.replace(
      "- **Read an anchor's dependencies.** The `waits-on` field on the root issue.\n",
      'The native issue-dependencies unit is disabled on this instance.\n',
    ),
  });
  const anDepsProseGaps = scanAnchorContract(anDepsProse);
  assert.equal(anDepsProseGaps.length, 1, 'prose about dependencies satisfies the element not at all');
  assert.match(anDepsProseGaps[0].expectation, /dependenc/, 'names the dependency element');

  // the local-file store is NOT exempt — it has an anchor concept, so it must state one
  const an3 = fixture({ 'references/issue-tracker-local.md': 'Slices live in `docs/plans/<feature>/`.\n' });
  assert.equal(
    scanAnchorContract(an3).length,
    1,
    'the local-file store is not exempt from the anchor contract',
  );

  // this repo's own dogfooded store config is checked alongside the seeds
  const an4 = fixture({ 'docs/agents/issue-tracker.md': '# Slice store\n\nIssues.\n' });
  const anGaps4 = scanAnchorContract(an4);
  assert.equal(anGaps4.length, 1, 'the dogfooded store config is checked too');
  assert.equal(anGaps4[0].source, path.join('docs', 'agents', 'issue-tracker.md'), 'names it');

  // a prose mention is not the section: the contract is a heading `/superdev:setup` carries across, and
  // prose that merely refers to an anchor says nothing about how this backend identifies one
  const an5 = fixture({
    'references/issue-tracker-acme.md': 'The scope anchor is the epic, usually.\n',
  });
  assert.equal(scanAnchorContract(an5).length, 1, 'a prose mention is not the section');

  // every store document is reported, so one pass names them all
  const an6 = fixture({
    'references/issue-tracker-acme.md': '# acme\n',
    'references/issue-tracker-beta.md': '# beta\n',
    'docs/agents/issue-tracker.md': anchorSection,
  });
  assert.equal(scanAnchorContract(an6).length, 2, 'each document missing the contract is reported');

  // an absent document is skipped, so a fixture carries only the docs it exercises
  assert.equal(scanAnchorContract(fixture({ 'README.md': '# repo\n' })).length, 0, 'absent docs skipped');

  // a `#` comment inside a fenced block is not a heading, so it must not end the section. Without
  // fence-awareness the elements below the fence are unseen and every one of them reports as missing.
  const anFenced = fixture({
    'references/issue-tracker-acme.md':
      '## Scope anchor\n\n' +
      '- **Recognise one.** It carries no parent link.\n\n' +
      '```sh\n# list every candidate\ncurl -s "$API/issues?labels=$FEATURE"\n```\n\n' +
      '- **List the candidates.** Query per feature label and keep the roots.\n' +
      '- **List the slices beneath it.** The same query returns them.\n' +
      '- **Tell an anchor that is itself a slice.** It carries a test-applicability label.\n' +
      "- **Read an anchor's dependencies.** The `waits-on` field on the root issue.\n\n" +
      '## Assignee\n\nSomeone.\n',
  });
  assert.equal(scanAnchorContract(anFenced).length, 0, 'a fenced `#` comment does not end the section');

  // a fence closes only on a marker at least as long as the one that opened it (CommonMark). A shorter
  // inner fence of the same character must not close the outer one — closing early unmasks the `#`
  // comment below it, which then reads as a heading and truncates the section before the elements after it
  const anNestedFence = fixture({
    'references/issue-tracker-acme.md':
      '## Scope anchor\n\n' +
      '- **Recognise one.** It carries no parent link.\n\n' +
      '````md\ncurl -s "$API/issues?labels=$FEATURE"\n```\n# comment inside the outer fence\n````\n\n' +
      '- **List the candidates.** Query per feature label and keep the roots.\n' +
      '- **List the slices beneath it.** The same query returns them.\n' +
      '- **Tell an anchor that is itself a slice.** It carries a test-applicability label.\n' +
      "- **Read an anchor's dependencies.** The `waits-on` field on the root issue.\n\n" +
      '## Assignee\n\nSomeone.\n',
  });
  assert.equal(
    scanAnchorContract(anNestedFence).length,
    0,
    'a shorter inner fence does not close a longer outer fence',
  );

  // the elements stated only in intro prose, with no bullets, is not the contract: every pattern
  // matched anywhere in the section, so prose alone satisfied them all and finding #4 shipped twice over
  const anProse = fixture({
    'references/issue-tracker-acme.md':
      '## Scope anchor\n\n' +
      'This section explains how to recognise an anchor, how to list the candidates, how to list the\n' +
      "slices beneath one, how to tell an anchor that is itself a slice, and how to read an anchor's\n" +
      'dependencies.\n',
  });
  assert.equal(scanAnchorContract(anProse).length, 5, 'intro prose with no bullets satisfies nothing');

  // the repo's writing standard declares American spelling, so the element patterns must accept it —
  // a document is not wrong for writing `recognize`, `under`, or `also a slice`
  const anAmerican = fixture({
    'references/issue-tracker-acme.md':
      '## Scope anchor\n\n' +
      '- **Recognize one.** It carries no parent link.\n' +
      '- **List the candidates.** Query per feature label and keep the roots.\n' +
      '- **List the slices under it.** The same query returns them.\n' +
      '- **Tell an anchor that is also a slice.** It carries a test-applicability label.\n' +
      "- **Read an anchor's dependencies.** The `waits-on` field on the root issue.\n",
  });
  assert.equal(scanAnchorContract(anAmerican).length, 0, 'American spellings satisfy the contract');

  // `*` is CommonMark's other unordered-list marker; a document is not wrong for writing it instead of `-`
  const anStarBullets = fixture({
    'references/issue-tracker-acme.md':
      '## Scope anchor\n\n' +
      '* **Recognise one.** It carries no parent link.\n' +
      '* **List the candidates.** Query per feature label and keep the roots.\n' +
      '* **List the slices beneath it.** The same query returns them.\n' +
      '* **Tell an anchor that is itself a slice.** It carries a test-applicability label.\n' +
      "* **Read an anchor's dependencies.** The `waits-on` field on the root issue.\n",
  });
  assert.equal(scanAnchorContract(anStarBullets).length, 0, '`*` bullets satisfy the contract');

  // a section that is the last in its file, one with an empty body, and a file whose fence is never
  // closed all extract without throwing — the fence masking runs over every one of them
  assert.equal(
    scanAnchorContract(fixture({ 'references/issue-tracker-acme.md': anchorSection })).length,
    0,
    'a section at EOF extracts',
  );
  assert.equal(
    scanAnchorContract(fixture({ 'references/issue-tracker-acme.md': '## Scope anchor\n' })).length,
    5,
    'an empty section extracts and reports every element',
  );
  assert.equal(
    scanAnchorContract(
      fixture({
        'references/issue-tracker-acme.md': `${anchorSection}\n\`\`\`sh\n# never closed\n`,
      }),
    ).length,
    0,
    'an unterminated fence does not throw',
  );

  // --- scanAfkSelectionNeutrality: afk's selection step reads the store's anchor contract and names no
  // backend's own mechanism (ADR 0017). Naming one is right on a single store and wrong on the rest, and
  // it surfaces as a sweep that finds nothing rather than as an error. ---

  const selection = (body) => `# afk\n\n## 2. Select the next scope anchor\n\n${body}\n\n## 3. Next\n\nGo.\n`;
  const neutral = "Per the store's `## Scope anchor` contract, list the candidates and take the oldest.";

  // negative: a neutral selection that points at the contract is clean
  assert.equal(
    scanAfkSelectionNeutrality(fixture({ 'skills/afk/SKILL.md': selection(neutral) })).length,
    0,
    'a neutral selection naming the contract is clean',
  );

  // positive: each store mechanism is caught on its own
  for (const [snippet, why] of [
    ['Take the issue labelled `epic`.', 'the epic label'],
    ['Strip the `feat/` prefix to get the slug.', 'the feat prefix'],
    // the local store's filename carries `epic`, so the one epic row reports it — a second `/00-epic/`
    // row would report the same sentence twice
    ['Look for `00-epic-*.md` in the plan directory.', 'the local filename'],
    ['The anchor is nobody\'s sub-issue.', 'the GitHub relation'],
    ['Check that `fields.parent` is absent.', 'the Jira parent field'],
  ]) {
    const gaps = scanAfkSelectionNeutrality(
      fixture({ 'skills/afk/SKILL.md': selection(`${neutral} ${snippet}`) }),
    );
    assert.equal(gaps.length, 1, `flags ${why} in the selection step`);
    assert.match(gaps[0].expectation, /select without naming/, 'reports it as a mechanism');
  }

  // positive: naming no mechanism is only half — a selection pointing at no contract has nothing to
  // select by, so silence must not satisfy the check
  const silent = scanAfkSelectionNeutrality(
    fixture({ 'skills/afk/SKILL.md': selection('Take the oldest candidate and go.') }),
  );
  assert.equal(silent.length, 1, 'a selection naming no contract is a gap');
  assert.match(silent[0].expectation, /point its selection at/, 'reports the missing contract');

  // a concrete label is a change-type prefix like any other. The two path strings this step legitimately
  // carries are excluded by name, so naming one real label no longer slips past as a path would.
  const concreteLabel = scanAfkSelectionNeutrality(
    fixture({
      'skills/afk/SKILL.md': selection(
        `${neutral} Select the anchor labelled \`feat/self-improvements\`.`,
      ),
    }),
  );
  assert.equal(concreteLabel.length, 1, 'a concrete feature label is a change-type prefix');
  assert.match(concreteLabel[0].expectation, /change-type label prefix/, 'reports the prefix mechanism');

  // `docs/plans-refactor` is the string the two-literal allowlist this rule replaced let through —
  // `plans\b` matched it before its hyphen, since a word boundary sits there too. The structural rule
  // must still catch it: no further `/`-delimited segment follows `docs/`, so it reads as a label.
  const hyphenatedSlug = scanAfkSelectionNeutrality(
    fixture({
      'skills/afk/SKILL.md': selection(`${neutral} Select the anchor labelled \`docs/plans-refactor\`.`),
    }),
  );
  assert.equal(hyphenatedSlug.length, 1, 'a hyphenated slug past the type is still a change-type prefix');
  assert.match(hyphenatedSlug[0].expectation, /change-type label prefix/, 'reports the prefix mechanism');

  // …while the store-config path the step is meant to point at, and the local store's plan root, both
  // pass — each carries a further `/`-delimited segment right after the type, so the structural rule
  // reads both as a path being cited rather than a feature label
  assert.equal(
    scanAfkSelectionNeutrality(
      fixture({
        'skills/afk/SKILL.md': selection(
          'Read `docs/agents/issue-tracker.md`\'s `## Scope anchor` contract; a local store keeps plans under `docs/plans/`.',
        ),
      }),
    ).length,
    0,
    'the excluded path strings are not prefixes',
  );

  // an ADR citation is a doc pointer, not a label — `docs/adr/0021-….md` has the same further-segment
  // shape as `docs/agents/…`, so the structural rule passes it too. The two-literal allowlist this rule
  // replaced flagged it as a false "change-type label prefix".
  assert.equal(
    scanAfkSelectionNeutrality(
      fixture({
        'skills/afk/SKILL.md': selection(
          `${neutral} See \`docs/adr/0021-change-type-branch.md\` for why.`,
        ),
      }),
    ).length,
    0,
    'an ADR citation is not a change-type label prefix',
  );

  // a mechanism outside the selection section is fine — the rest of the command may discuss an epic as a
  // domain concept, it just may not test for one when selecting
  assert.equal(
    scanAfkSelectionNeutrality(
      fixture({
        'skills/afk/SKILL.md':
          selection(neutral) + '\n## 4. Blocks\n\nLabel the `epic` blocked and move on.\n',
      }),
    ).length,
    0,
    'a mechanism outside the selection section is not a gap',
  );

  // `epic` in plain prose is the same mechanism as a backticked one — the selection step is meant to
  // name no epic at all, so backticks must not be what decides it
  const plainEpic = scanAfkSelectionNeutrality(
    fixture({ 'skills/afk/SKILL.md': selection(`${neutral} Take the epic issue.`) }),
  );
  assert.equal(plainEpic.length, 1, 'an unbackticked `epic` is still a mechanism');
  assert.match(plainEpic[0].expectation, /select without naming/, 'reports it as a mechanism');

  // a fenced `#` comment hides a mechanism from this scan — the worse direction of finding #143,
  // because this scanner is the only automated guard on the neutrality ADR 0017 requires
  assert.equal(
    scanAfkSelectionNeutrality(
      fixture({
        'skills/afk/SKILL.md': selection(
          `${neutral}\n\n\`\`\`sh\n# candidates\nls docs/plans/\n\`\`\`\n\nTake the issue labelled \`epic\`.`,
        ),
      }),
    ).length,
    1,
    'a mechanism below a fenced `#` comment is still scanned',
  );

  // an absent afk.md is skipped here; its existence is asserted by `pinned-paths`
  assert.equal(
    scanAfkSelectionNeutrality(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'an absent afk.md is skipped',
  );

  // positive: a missing, renumbered, or retitled selection heading is itself a gap — each of these three
  // mutations previously silenced the whole neutrality check (the section was skipped, not flagged),
  // hiding whatever store mechanism the selection step went on to name
  for (const [why, body] of [
    ['renumbered', `# afk\n\n## 3. Select the next scope anchor\n\nTake the \`epic\` label.\n\n## 4. Next\n\nGo.\n`],
    ['retitled', `# afk\n\n## 2 Pick the work\n\nTake the \`epic\` label.\n\n## 3. Next\n\nGo.\n`],
    ['deleted', `# afk\n\nTake the \`epic\` label.\n\n## 3. Next\n\nGo.\n`],
  ]) {
    const gaps = scanAfkSelectionNeutrality(fixture({ 'skills/afk/SKILL.md': body }));
    assert.equal(gaps.length, 1, `flags a ${why} selection heading`);
    assert.match(gaps[0].expectation, /selection heading/, `names the missing heading for ${why}`);
  }

  // --- scanCommandRefs: a `/superdev:<name>` reference must resolve to `skills/<name>/SKILL.md`. The chain
  // hands the user from one command to the next by printing its name (ADR 0013), so a reference to a
  // command that does not exist sends the reader to a dead end. Same failure shape as scan() one level
  // over: that one resolves references/ paths, this one resolves command names. ---

  // positive: a command points at one that does not exist
  const cr1 = fixture({
    'skills/implement/SKILL.md': 'When every slice is merged, run `/superdev:ship <scope>`.\n',
  });
  const crGaps1 = scanCommandRefs(cr1);
  assert.equal(crGaps1.length, 1, 'flags a reference to a command with no file');
  assert.equal(crGaps1[0].command, '/superdev:ship', 'names the unresolved command');
  assert.equal(crGaps1[0].source, path.join('skills', 'implement', 'SKILL.md'), 'names the source document');

  // negative: the same reference resolves once the command exists
  const cr2 = fixture({
    'skills/implement/SKILL.md': 'When every slice is merged, run `/superdev:ship <scope>`.\n',
    'skills/ship/SKILL.md': '# superdev ship\n',
  });
  assert.equal(scanCommandRefs(cr2).length, 0, 'a resolving reference yields zero gaps');

  // an agent may name a command too, and its references resolve by the same rule
  const cr3 = fixture({ 'agents/doc-writer.md': 'Dispatched by `/superdev:nope`.\n' });
  assert.equal(scanCommandRefs(cr3).length, 1, 'an agent naming a missing command is flagged');

  // a command naming itself resolves, and a trailing argument is not part of the name
  const cr4 = fixture({
    'skills/document/SKILL.md': 'Invoked as `/superdev:document audit` — see `/superdev:document`.\n',
  });
  assert.equal(scanCommandRefs(cr4).length, 0, 'a trailing argument is not read as part of the name');

  // one missing command named by two documents is reported once per document, so every dead end is
  // fixable from the report alone
  const cr5 = fixture({
    'skills/implement/SKILL.md': 'Then `/superdev:ship`.\n',
    'skills/document/SKILL.md': 'Then `/superdev:ship`.\n',
  });
  assert.equal(scanCommandRefs(cr5).length, 2, 'each source naming a missing command is reported');

  // --- scanChainHandoff: each command in the chain must name its successor. scanCommandRefs above
  // catches a handoff that points at a command with no file; it cannot catch a command that names no
  // successor at all. That drift leaves every reference resolvable and the suite green, and the chain
  // then dead-ends silently at whichever command dropped its line (ADR 0013). ---

  const handsOff = (next) => `When it is clean, print \`${next} <range>\` as the next step.\n`;

  // positive: review.md stopped naming its successor
  const ch1 = fixture({
    'references/run-handoff.md': handsOff('/superdev:review'),
    'skills/review/SKILL.md': '# review\n\nReport the findings and stop.\n',
    'skills/document/SKILL.md': handsOff('/superdev:ship'),
  });
  const chGaps1 = scanChainHandoff(ch1);
  assert.equal(chGaps1.length, 1, 'flags the command that names no successor');
  assert.equal(chGaps1[0].source, path.join('skills', 'review', 'SKILL.md'), 'names review.md');
  assert.equal(chGaps1[0].next, '/superdev:document', 'names the successor it should have');

  // negative: a fully wired chain is clean
  const ch2 = fixture({
    'references/run-handoff.md': handsOff('/superdev:review'),
    'skills/review/SKILL.md': handsOff('/superdev:document'),
    'skills/document/SKILL.md': handsOff('/superdev:ship'),
  });
  assert.equal(scanChainHandoff(ch2).length, 0, 'a fully wired chain yields zero gaps');

  // every link is checked, not just the first: two broken handoffs are both reported
  const ch3 = fixture({
    'references/run-handoff.md': '# implement\n\nMerge the slices and stop.\n',
    'skills/review/SKILL.md': handsOff('/superdev:document'),
    'skills/document/SKILL.md': '# document\n\nReconcile the docs and stop.\n',
  });
  assert.equal(scanChainHandoff(ch3).length, 2, 'each broken link is reported');

  // naming some other command is not the handoff — the chain's order is what this check pins, and
  // /superdev:plan is a legitimate reference that says nothing about the successor
  const ch4 = fixture({
    'references/run-handoff.md': handsOff('/superdev:review'),
    'skills/review/SKILL.md': 'To act on findings, run `/superdev:plan`, then `/superdev:implement`.\n',
    'skills/document/SKILL.md': handsOff('/superdev:ship'),
  });
  assert.equal(scanChainHandoff(ch4).length, 1, 'naming an unrelated command is not a handoff');

  // an absent document is skipped, so a fixture carries only the links it exercises
  const ch5 = fixture({ 'skills/document/SKILL.md': handsOff('/superdev:ship') });
  assert.equal(scanChainHandoff(ch5).length, 0, 'an absent chain document is skipped');

  // --- scanAfkInvocations: every stage-table row that invokes one of the four chain commands must carry
  // the token on that same row (ADR 0015). A row that loses it asks a question nobody answers, and the
  // sweep stops there reporting no failure. The real table carries five rows — two of them
  // `/superdev:review` — so this checks per row, not once per command name. ---

  // a fixture modeled on skills/afk/SKILL.md §3's stage table plus its footnote and §5's maintainer-resume
  // mention, both of which name a command on the same line as `--unattended` without being a table row
  const stageTable = (rows) =>
    '| Stage | Start at |\n' +
    '|---|---|\n' +
    rows.map(([stage, cmd]) => `| \`${stage}\` | \`${cmd}\` |\n`).join('') +
    '\n`documented-unreviewed` routes to the review, not the ship, because `/superdev:ship --unattended` ' +
    'refuses a scope whose review never ran.\n\n' +
    'A maintainer runs `/superdev:ship <slug>` once the host is reachable.\n';

  const fullRows = [
    ['no run root, or `implementing`', '/superdev:implement feat/<label> --unattended'],
    ['merged', '/superdev:review <BASE>..superdev/<slug> --unattended'],
    ['reviewed', '/superdev:document <BASE>..superdev/<slug> --unattended'],
    ['documented-unreviewed', '/superdev:review <BASE>..superdev/<slug> --unattended'],
    ['documented', '/superdev:ship <slug> --unattended'],
  ];

  // negative: every row carrying the token, plus the footnote and the §5 mention with no token, is clean
  const afk1 = fixture({ 'skills/afk/SKILL.md': stageTable(fullRows) });
  assert.equal(scanAfkInvocations(afk1).length, 0, 'a fully wired stage table is clean');

  // positive: each of the five rows is checked on its own — mutate one at a time, confirm it alone goes
  // red, and that the sibling row of the same command (`review` appears twice) does not mask it
  for (let i = 0; i < fullRows.length; i++) {
    const mutated = fullRows.map((row, j) => (j === i ? [row[0], row[1].replace(' --unattended', '')] : row));
    const afk = fixture({ 'skills/afk/SKILL.md': stageTable(mutated) });
    const gaps = scanAfkInvocations(afk);
    assert.equal(gaps.length, 1, `mutating row ${i} (${fullRows[i][1]}) is caught on its own`);
    assert.match(gaps[0].expectation, new RegExp(fullRows[i][1].split(' ')[0].replace('/', '\\/')));
  }

  // the ship-command prose footnote (name + token on one line, not a table row) does not mask a missing
  // token on the actual ship table row
  const afkShipMasked = fixture({
    'skills/afk/SKILL.md': stageTable(
      fullRows.map((row) =>
        row[1].startsWith('/superdev:ship') ? [row[0], row[1].replace(' --unattended', '')] : row,
      ),
    ),
  });
  const shipGaps = scanAfkInvocations(afkShipMasked);
  assert.equal(shipGaps.length, 1, 'the ship footnote does not mask the ship row losing the token');
  assert.match(shipGaps[0].expectation, /\/superdev:ship/, 'names the ship row');

  // §5's maintainer-resume mention (`/superdev:ship <slug>`, no token, not a table row) stays green on
  // its own — it is prose, not an invocation
  const afkResumeOnly = fixture({
    'skills/afk/SKILL.md': 'A maintainer runs `/superdev:ship <slug>` once the host is reachable.\n',
  });
  const resumeGaps = scanAfkInvocations(afkResumeOnly);
  assert.ok(
    resumeGaps.every((g) => /carry a stage-table row/.test(g.expectation)),
    'the maintainer-resume prose is never read as an invocation that lost its token',
  );

  // a row that stops existing is caught too — inspecting only the rows present says nothing about a step
  // afk silently dropped, which would make it skip reviewing or shipping and still report a clean sweep
  for (const dropped of ['implement', 'review', 'document', 'ship']) {
    const afkMissing = fixture({
      'skills/afk/SKILL.md': stageTable(fullRows.filter(([, cmd]) => !cmd.startsWith(`/superdev:${dropped} `))),
    });
    const gaps = scanAfkInvocations(afkMissing);
    assert.equal(gaps.length, 1, `dropping every /superdev:${dropped} row is caught`);
    assert.match(gaps[0].expectation, /carry a stage-table row/, 'reports it as a missing row');
    assert.match(gaps[0].expectation, new RegExp(`superdev:${dropped}`), `names /superdev:${dropped}`);
  }

  // an absent afk.md is skipped, matching every other contract scanner
  assert.equal(
    scanAfkInvocations(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'an absent afk.md is skipped',
  );

  // --- scanHookLedgerParsers: no hook carries a ledger-header regex of its own (ADR 0022) ---

  // The exact line this scope deleted from hooks/scope-prune.js, in both quotings it appears in.
  for (const [label, src] of [
    ['a template literal', 'const m = text.match(new RegExp(`\\\\*\\\\*${name}:\\\\*\\\\*[^\\\\S\\\\n]*(\\\\S+)`));'],
    ['a single-quoted string', "const re = new RegExp('^\\\\*\\\\*' + name + ':\\\\*\\\\*\\\\s*(.*)$');"],
  ]) {
    const gaps = scanHookLedgerParsers(fixture({ 'hooks/rogue.js': src }));
    assert.equal(gaps.length, 1, `flags a hook parsing a header with ${label}`);
    assert.equal(gaps[0].source, path.join('hooks', 'rogue.js'), 'names the hook');
  }

  // A hook that reads through the shared export is clean, and so is ordinary hook code that happens to
  // mention a header in prose — the check looks for the marker being built as a pattern, not named.
  assert.equal(
    scanHookLedgerParsers(fixture({
      'hooks/good.js':
        "const { readLedgerHeader } = require('../scripts/scope.js');\n" +
        "// reads the ledger's **Stage:** line through scope.js\n",
    })).length,
    0,
    'a hook using the shared reader, and naming a header in prose, is clean',
  );

  assert.equal(scanHookLedgerParsers(fixture({ 'README.md': '# repo\n' })).length, 0, 'no hooks dir is skipped');

  // --- SHIP_GATE_ELEMENTS: /superdev:ship §3 gates on a standing unresolved defect — asked about once
  // attended, refused under --unattended (ADR 0026). §3 also carries an unrelated, pre-existing gate (the
  // missing-review/document warning) that uses the identical **ask once** and `--unattended` → refuse
  // phrasing for a different question. Every fixture below carries that unrelated gate too, so a scanner
  // that tested the whole file instead of the "Entries standing." paragraph alone would wrongly pass. ---

  const SHIP_UNRELATED_GATE =
    '## 3. Stage gate\n\n' +
    'Name what has not run and **ask once** whether to ship anyway. Declined → stop. Confirmed → ' +
    'proceed. **`--unattended` → refuse**: name what is missing, open no pull request, and stop.\n\n';

  // positive (RED reproduction): the entries-standing paragraph drops its own ask-once clause, while the
  // unrelated stage gate above it still carries an "ask once" phrase for a different question — a
  // whole-file test is satisfied by that unrelated phrase and misses the drop
  const sg1 = fixture({
    'skills/ship/SKILL.md':
      SHIP_UNRELATED_GATE +
      '**Entries standing.** Name every bullet. Declined → stop. Confirmed → proceed. **`--unattended` → ' +
      'refuse**: name what stands, open no pull request, and stop.\n\n' +
      '## 4. Definition of Done\n',
  });
  const sgGaps1 = scanShipGateContract(sg1);
  assert.equal(
    sgGaps1.length,
    1,
    'flags a ship.md whose entries-standing paragraph drops the ask-once clause, even with the unrelated ' +
      'stage gate above it still carrying one',
  );
  assert.equal(sgGaps1[0].source, path.join('skills', 'ship', 'SKILL.md'), 'names ship.md');

  // positive (RED reproduction, the reviewer's exact case): the entries-standing paragraph drops its own
  // unattended-refuse clause, while the unrelated stage gate above it still carries the identical
  // `--unattended` → refuse phrase — the whole-file test used to pass wrongly here
  const sg2 = fixture({
    'skills/ship/SKILL.md':
      SHIP_UNRELATED_GATE +
      '**Entries standing.** Name every bullet and **ask once** whether to ship with it standing. ' +
      'Declined → stop. Confirmed → proceed.\n\n' +
      '## 4. Definition of Done\n',
  });
  const sgGaps2 = scanShipGateContract(sg2);
  assert.equal(
    sgGaps2.length,
    1,
    'flags a ship.md whose entries-standing paragraph drops the unattended-refuse clause, even with the ' +
      'unrelated stage gate above it still carrying the identical phrase',
  );
  assert.equal(sgGaps2[0].source, path.join('skills', 'ship', 'SKILL.md'), 'names ship.md');

  // negative: both halves carried in the entries-standing paragraph itself
  const sg3 = fixture({
    'skills/ship/SKILL.md':
      SHIP_UNRELATED_GATE +
      '**Entries standing.** Name every bullet and **ask once** whether to ship with it standing. ' +
      'Declined → stop. Confirmed → proceed. **`--unattended` → refuse**: name what stands, open no ' +
      'pull request, and stop.\n\n' +
      '## 4. Definition of Done\n',
  });
  assert.equal(
    scanShipGateContract(sg3).length,
    0,
    'both gate halves carried in the entries-standing paragraph itself yields zero gaps',
  );

  // positive: no entries-standing paragraph at all
  const sg4 = fixture({ 'skills/ship/SKILL.md': SHIP_UNRELATED_GATE + '## 4. Definition of Done\n' });
  const sgGaps4 = scanShipGateContract(sg4);
  assert.equal(sgGaps4.length, 1, 'flags a ship.md with no entries-standing paragraph at all');
  assert.equal(sgGaps4[0].source, path.join('skills', 'ship', 'SKILL.md'), 'names ship.md');

  // absent files are skipped, matching every other contract scanner
  assert.equal(
    scanShipGateContract(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'absent files are skipped',
  );

  // --- UNRESOLVED_GLOSSARY_CONTRACTS: CONTEXT.md's Degraded pass and Unresolved defect entries agree
  // with references/scope-mode.md about which record covers a failure of the code under review (ADR
  // 0026) — the fact this scope's own history let drift for three fix cycles with the suite green. ---

  // positive: scope-mode.md drops the degraded-pass disclaimer CONTEXT.md's Degraded pass entry restates,
  // while keeping its Unresolved-defects half (verbatim) so only the dropped row is flagged
  const ug1 = fixture({
    'references/scope-mode.md':
      'A degraded pass is a step that did not get the assurance the chain promises.\n\n' +
      'Distinct from a Degraded pass — this one says whether the branch is sound.\n',
  });
  const ugGaps1 = scanUnresolvedGlossaryContract(ug1);
  assert.equal(ugGaps1.length, 1, "flags scope-mode.md for dropping the degraded-pass disclaimer");
  assert.equal(ugGaps1[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');

  // positive: CONTEXT.md's Degraded pass entry drops the disclaimer scope-mode.md states, while keeping
  // its Unresolved defect half verbatim
  const ug2 = fixture({
    'CONTEXT.md':
      '**Degraded pass** — a step of the chain that did not get the assurance it promises.\n\n' +
      '**Unresolved defect** — distinct from a Degraded pass, which says how much of the chain ran, ' +
      'rather than whether the branch is sound (ADR 0026).\n',
  });
  const ugGaps2 = scanUnresolvedGlossaryContract(ug2);
  assert.equal(ugGaps2.length, 1, "flags CONTEXT.md for dropping the degraded-pass disclaimer");
  assert.equal(ugGaps2[0].source, 'CONTEXT.md', 'names CONTEXT.md');

  // positive: scope-mode.md's Unresolved defects section drops the branch-soundness clause, while keeping
  // its Degraded-passes half verbatim
  const ug3 = fixture({
    'references/scope-mode.md':
      'Neither shape is a failure of the code under review.\n\n' +
      'An unresolved defect is a defect the run finds in the code and leaves standing.\n',
  });
  const ugGaps3 = scanUnresolvedGlossaryContract(ug3);
  assert.equal(ugGaps3.length, 1, 'flags scope-mode.md for dropping the branch-soundness clause');
  assert.equal(ugGaps3[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');

  // positive: CONTEXT.md's Unresolved defect entry drops the branch-soundness clause, while keeping its
  // Degraded pass half verbatim
  const ug4 = fixture({
    'CONTEXT.md':
      '**Degraded pass** — the code under review did not fail; the chain\'s own assurance came up short.\n\n' +
      '**Unresolved defect** — a defect the run finds in the code and leaves standing.\n',
  });
  const ugGaps4 = scanUnresolvedGlossaryContract(ug4);
  assert.equal(ugGaps4.length, 1, 'flags CONTEXT.md for dropping the branch-soundness clause');
  assert.equal(ugGaps4[0].source, 'CONTEXT.md', 'names CONTEXT.md');

  // positive: CONTEXT.md's Unresolved defect entry negates the branch-soundness clause outright — a
  // literal match on the affirmative clause cannot appear inside a sentence that denies it
  const ug6 = fixture({
    'CONTEXT.md':
      '**Degraded pass** — the code under review did not fail; the chain\'s own assurance came up short.\n\n' +
      '**Unresolved defect** — this record does not answer whether the branch is sound; that is a ' +
      'different question.\n',
  });
  const ugGaps6 = scanUnresolvedGlossaryContract(ug6);
  assert.equal(ugGaps6.length, 1, 'flags a CONTEXT.md entry that negates the branch-soundness clause');
  assert.equal(ugGaps6[0].source, 'CONTEXT.md', 'names CONTEXT.md');

  // positive: CONTEXT.md's Unresolved defect entry negates the branch-soundness clause as an "X, not Y"
  // contrastive coordination — the genuine contradiction a character-window look-behind let through,
  // because it reads as a correct sentence when the only difference from the real one is which word
  // ("rather than" vs. "not") sits in front of the shared "whether the branch is sound" fragment
  const ug7 = fixture({
    'CONTEXT.md':
      '**Degraded pass** — the code under review did not fail; the chain\'s own assurance came up short.\n\n' +
      '**Unresolved defect** — distinct from a **Degraded pass**, which says how much of the chain ran, ' +
      'not whether the branch is sound (ADR 0026).\n',
  });
  const ugGaps7 = scanUnresolvedGlossaryContract(ug7);
  assert.equal(ugGaps7.length, 1, 'flags the "X, not Y" contrastive negation as a contradiction');
  assert.equal(ugGaps7[0].source, 'CONTEXT.md', 'names CONTEXT.md');

  // positive: rewording the canonical clause fails too — the accepted cost of a literal-phrase guard,
  // the same shape every other contract in this file already accepts
  const ug8 = fixture({
    'references/scope-mode.md':
      'Neither shape counts as a failure of the code under review.\n\n' +
      'Distinct from a Degraded pass — this one says whether the branch is sound.\n',
  });
  const ugGaps8 = scanUnresolvedGlossaryContract(ug8);
  assert.equal(ugGaps8.length, 1, 'flags a reworded canonical clause as a gap');
  assert.equal(ugGaps8[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');

  // negative: both documents carry the full agreement verbatim, wrapped across a line break the way the
  // real files wrap — whitespace normalization makes the wrap invisible to the match
  const ug5 = fixture({
    'references/scope-mode.md':
      'Neither shape is a failure of the code\nunder review.\n\n' +
      'Distinct from a Degraded pass — this one says\nwhether the branch is sound.\n',
    'CONTEXT.md':
      '**Degraded pass** — the code under review did\nnot fail; the chain\'s own assurance came up short.\n\n' +
      '**Unresolved defect** — distinct from a Degraded pass, which says how much of the chain ran, rather ' +
      'than whether the branch\nis sound (ADR 0026).\n',
  });
  assert.equal(
    scanUnresolvedGlossaryContract(ug5).length,
    0,
    'both documents carrying the full agreement, wrapped across a line break, yields zero gaps',
  );

  // absent files are skipped, matching every other contract scanner
  assert.equal(
    scanUnresolvedGlossaryContract(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'absent files are skipped',
  );

  // --- scanAppendContract: every slice-store document must render `/plan`'s append-mode contract for
  // its own backend (ADR 0004, `plan-contract.md` → *Append mode*): create only new slice records, never
  // edit/close/delete a merged one, promote a single-slice feature by creating the epic first, name
  // amending a promoted epic's own body as the one sanctioned edit, and — ADR 0043's exception — migrate
  // a promoted lone slice's anchor-dependency line to the new epic. Same candidate-document list and
  // section-extraction shape as scanAnchorContract. ---

  const appendSection =
    '## Append mode\n\n' +
    "Extends a feature that already has slices, without touching what's already merged.\n\n" +
    '- **Create only new records; never edit, close, or delete a merged slice.** One issue-create call ' +
    'per new slice.\n' +
    "- **Create the epic first when none exists.** Copy the lone slice's `acceptance` into it as the " +
    'global DoD, leaving that slice untouched. **One exception:** an anchor dependency the lone slice ' +
    'carries **migrates to the new epic** and is removed from the slice.\n' +
    "- **Amend the epic's own body — the one sanctioned edit.** Folds the interview's new criteria into " +
    "the epic's Definition of Done in place.\n";

  const apEpicFirstBullet =
    "- **Create the epic first when none exists.** Copy the lone slice's `acceptance` into it as the " +
    'global DoD, leaving that slice untouched. **One exception:** an anchor dependency the lone slice ' +
    'carries **migrates to the new epic** and is removed from the slice.\n';

  // positive: a store document with no append section is flagged
  const ap1 = fixture({ 'references/issue-tracker-acme.md': '# acme\n\nSlices are issues.\n' });
  const apGaps1 = scanAppendContract(ap1);
  assert.equal(apGaps1.length, 1, 'flags a store document with no append contract');
  assert.equal(apGaps1[0].source, path.join('references', 'issue-tracker-acme.md'), 'names the seed');

  // negative: the same document carrying all four universal elements is clean
  assert.equal(
    scanAppendContract(fixture({ 'references/issue-tracker-acme.md': appendSection })).length,
    0,
    'a document naming all four elements yields zero gaps',
  );

  // positive: losing the never-edit clause is flagged on its own
  const apNoNeverEdit = fixture({
    'references/issue-tracker-acme.md': appendSection.replace(
      '- **Create only new records; never edit, close, or delete a merged slice.** One issue-create ' +
        'call per new slice.\n',
      '',
    ),
  });
  const apGapsNoNeverEdit = scanAppendContract(apNoNeverEdit);
  assert.equal(apGapsNoNeverEdit.length, 1, 'flags exactly the missing never-edit clause');
  assert.match(apGapsNoNeverEdit[0].expectation, /never-edit/, 'names the never-edit clause');

  // positive: losing the epic-promotion clause is flagged on its own
  const apNoEpicFirst = fixture({
    'references/issue-tracker-acme.md': appendSection.replace(apEpicFirstBullet, ''),
  });
  const apGapsNoEpicFirst = scanAppendContract(apNoEpicFirst);
  assert.equal(apGapsNoEpicFirst.length, 2, 'flags the epic-promotion and migration clauses together');
  assert.match(apGapsNoEpicFirst[0].expectation, /epic-promotion/, 'names the epic-promotion clause');

  // positive: keeping the epic-promotion bullet but dropping its anchor-dependency exception is flagged
  // on its own — the migration is what ADR 0040 needs and ADR 0043 excepts from ADR 0004's immutability
  // rule, and a store document that returns to the unqualified rule strands a dependent feature
  const apNoMigration = fixture({
    'references/issue-tracker-acme.md': appendSection.replace(
      ' **One exception:** an anchor dependency the lone slice carries **migrates to the new epic** and ' +
        'is removed from the slice.',
      '',
    ),
  });
  const apGapsNoMigration = scanAppendContract(apNoMigration);
  assert.equal(apGapsNoMigration.length, 1, 'flags exactly the missing anchor-dependency migration');
  assert.equal(
    apGapsNoMigration[0].source,
    path.join('references', 'issue-tracker-acme.md'),
    'names the document that dropped the migration clause',
  );
  assert.match(apGapsNoMigration[0].expectation, /migration/, 'names the migration clause');

  // positive: stating the migration in running prose alone, with no bolded lead-in, satisfies nothing —
  // the same anchoring every other append element uses
  const apProseMigration = fixture({
    'references/issue-tracker-acme.md': appendSection.replace(
      '**One exception:** an anchor dependency the lone slice carries **migrates to the new epic** and ' +
        'is removed from the slice.',
      'An anchor dependency the lone slice carries migrates to the new epic and is removed from the ' +
        'slice.',
    ),
  });
  const apGapsProse = scanAppendContract(apProseMigration);
  assert.equal(apGapsProse.length, 1, 'running prose alone still flags the migration clause');
  assert.match(apGapsProse[0].expectation, /migration/, 'names the migration clause');

  // positive: an unrelated bolded run that merely starts with "migrat" satisfies nothing — the pattern
  // must anchor on the real clause ("migrates ... to the new ...") rather than on the bolded word alone
  const apWrongMigration = fixture({
    'references/issue-tracker-acme.md': appendSection.replace(
      '**migrates to the new epic**',
      '**migrates the ledger**',
    ),
  });
  const apGapsWrongMigration = scanAppendContract(apWrongMigration);
  assert.equal(apGapsWrongMigration.length, 1, 'an unrelated bolded "migrat" run still flags the gap');
  assert.match(apGapsWrongMigration[0].expectation, /migration/, 'names the migration clause');

  // each of the scanned documents is named individually: one seed dropping the clause reports that
  // seed, and leaves a sibling seed carrying it silent
  const apOneSeedShort = fixture({
    'references/issue-tracker-acme.md': appendSection,
    'references/issue-tracker-github.md': appendSection.replace(apEpicFirstBullet, ''),
  });
  const apGapsOneSeed = scanAppendContract(apOneSeedShort);
  assert.equal(
    apGapsOneSeed.every((g) => g.source === path.join('references', 'issue-tracker-github.md')),
    true,
    'reports only the seed that dropped the clause',
  );

  // positive: losing the epic-amendment clause is flagged on its own, with the other three silent
  const apNoAmend = fixture({
    'references/issue-tracker-acme.md': appendSection.replace(
      "- **Amend the epic's own body — the one sanctioned edit.** Folds the interview's new criteria " +
        "into the epic's Definition of Done in place.\n",
      '',
    ),
  });
  const apGapsNoAmend = scanAppendContract(apNoAmend);
  assert.equal(apGapsNoAmend.length, 1, 'flags exactly the missing epic-amendment clause');
  assert.match(apGapsNoAmend[0].expectation, /epic-amendment/, 'names the epic-amendment clause');

  // an absent document is skipped, so a fixture carries only the docs it exercises
  assert.equal(
    scanAppendContract(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'an absent document is skipped rather than reported',
  );

  // the local-file store alone needs a numbering-continuation clause — its `id` is a file number `/plan`
  // assigns, unlike an issue backend's server-assigned key
  const apLocalNoContinuation = fixture({ 'references/issue-tracker-local.md': appendSection });
  const apGapsLocal = scanAppendContract(apLocalNoContinuation);
  assert.equal(apGapsLocal.length, 1, 'flags the local store missing its continuation clause');
  assert.match(apGapsLocal[0].expectation, /continuation/, 'names the continuation clause');

  // negative: the local store carrying the continuation clause too is clean
  const localAppendSection =
    appendSection +
    '- **Continue numbering from the highest file number already present; never reuse one.** New slices ' +
    'take the next `NN`.\n';
  assert.equal(
    scanAppendContract(fixture({ 'references/issue-tracker-local.md': localAppendSection })).length,
    0,
    'the local store carrying all three elements yields zero gaps',
  );

  // an issue-backend seed carrying no continuation clause is not held to that rule — its id is
  // server-assigned already
  assert.equal(
    scanAppendContract(fixture({ 'references/issue-tracker-github.md': appendSection })).length,
    0,
    'an issue-backend seed is not held to the local-only continuation clause',
  );

  // --- scanReleaseContract: every slice-store document states how its backend expresses a release
  // (`plan-contract.md` → *Release*), and `skills/plan/SKILL.md`, `skills/implement/SKILL.md`, and
  // `skills/afk/SKILL.md` each name that section. Both halves fail silently, so both are asserted. ---

  // positive: a store document with no release section is flagged
  const rl1 = fixture({ 'references/issue-tracker-acme.md': '# acme\n\nSlices are issues.\n' });
  const rlGaps1 = scanReleaseContract(rl1);
  assert.equal(rlGaps1.length, 1, 'flags a store document with no release section');
  assert.equal(rlGaps1[0].source, path.join('references', 'issue-tracker-acme.md'), 'names the seed');
  assert.equal(rlGaps1[0].expectation, undefined, 'a missing section carries no expectation');

  // negative: the same document carrying the section is clean
  assert.equal(
    scanReleaseContract(
      fixture({
        'references/issue-tracker-acme.md':
          '# acme\n\n## Release\n\nLabel `released` on the scope anchor.\n',
      }),
    ).length,
    0,
    'a store document carrying the section yields zero gaps',
  );

  // positive: prose about releasing is not the section — the heading is what `/superdev:setup` carries
  assert.equal(
    scanReleaseContract(
      fixture({ 'references/issue-tracker-acme.md': '# acme\n\nA released plan may be built.\n' }),
    ).length,
    1,
    'a prose mention is not the section',
  );

  // positive: a consumer that no longer names the section is flagged, with the store half silent
  const rlConsumer = fixture({ 'skills/plan/SKILL.md': '# plan\n\nWrite the slices, then hand off.\n' });
  const rlGapsConsumer = scanReleaseContract(rlConsumer);
  assert.equal(rlGapsConsumer.length, 1, 'flags the consumer that dropped the reference');
  assert.equal(rlGapsConsumer[0].source, path.join('skills', 'plan', 'SKILL.md'), 'names the consumer');
  assert.match(rlGapsConsumer[0].expectation, /`## Release`/, 'names the section it must read');

  // negative: the same consumer naming the backticked section is clean — and the bare word alone is not,
  // since "release" recurs in ordinary prose
  assert.equal(
    scanReleaseContract(
      fixture({ 'skills/plan/SKILL.md': "# plan\n\nRead `docs/agents/issue-tracker.md`'s `## Release`.\n" }),
    ).length,
    0,
    'a consumer naming the backticked section yields zero gaps',
  );

  // all three consumers are held to it, so dropping the reference everywhere reports three gaps
  const rlAllThree = fixture({
    'skills/plan/SKILL.md': '# plan\n',
    'skills/implement/SKILL.md': '# implement\n',
    'skills/afk/SKILL.md': '# afk\n',
  });
  assert.equal(scanReleaseContract(rlAllThree).length, 3, 'every consumer is held to the reference');

  // an absent document is skipped, so a fixture carries only the docs it exercises
  assert.equal(
    scanReleaseContract(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'an absent document is skipped rather than reported',
  );

  // --- scanRunStateContract: every slice-store document carries its own `## Run state` section
  // (`plan-contract.md` → *Run state*), over the same storeDocuments() candidate list the anchor,
  // append, release and triage contracts already walk. No store is exempt: a snapshot-less backend
  // declares itself snapshot-less *inside* that section, which is the single yes-or-no answer
  // `references/run-init.md` reads before it adopts, so a store without the section leaves that
  // question unanswerable rather than answered "no". ---

  // positive: a store document with no run-state section is flagged
  const rsSeed1 = fixture({ 'references/issue-tracker-acme.md': '# acme\n\nSlices are issues.\n' });
  const rsGaps1 = scanRunStateContract(rsSeed1);
  assert.equal(rsGaps1.length, 1, 'flags a store document with no run-state section');
  assert.equal(rsGaps1[0].source, path.join('references', 'issue-tracker-acme.md'), 'names the seed');

  // negative: the same document carrying the section is clean
  assert.equal(
    scanRunStateContract(
      fixture({
        'references/issue-tracker-acme.md':
          '# acme\n\n## Run state\n\nThe snapshot lives in the anchor body.\n',
      }),
    ).length,
    0,
    'a store document carrying the section yields zero gaps',
  );

  // a seed heading may carry the `(fill in at setup)` suffix the Jira seed uses on the sections a
  // consumer must complete. The suffix is the seed-template convention, not a different section, so a
  // pattern anchored to end-of-line would report the one store that most needs the section — the
  // snapshot-less one, whose whole declaration lives in it — as carrying none at all.
  assert.equal(
    scanRunStateContract(
      fixture({
        'references/issue-tracker-jira.md':
          '# jira\n\n## Run state (fill in at setup)\n\nThis store carries **no snapshot** by default.\n',
      }),
    ).length,
    0,
    'a heading suffixed `(fill in at setup)` still carries the section',
  );

  // positive: prose about run state is not the section — the heading is what `/superdev:setup` carries
  assert.equal(
    scanRunStateContract(
      fixture({ 'references/issue-tracker-acme.md': '# acme\n\nThe run state mirrors the ledger.\n' }),
    ).length,
    1,
    'a prose mention is not the section',
  );

  // positive: one of the real seeds loses it, and the gap names that seed
  const runStateSection = '# store\n\n## Run state\n\n`plan-contract.md` → *Run state*.\n';
  const rsGaps = scanRunStateContract(
    fixture({
      'references/issue-tracker-forgejo.md': runStateSection,
      'references/issue-tracker-github.md': runStateSection,
      'references/issue-tracker-jira.md': runStateSection,
      'references/issue-tracker-local.md': '# store\n\nA plan file records its own run.\n',
    }),
  );
  assert.equal(rsGaps.length, 1, 'flags the seed that dropped the section');
  assert.equal(
    rsGaps[0].source,
    path.join('references', 'issue-tracker-local.md'),
    'names the seed that dropped it',
  );

  // a `###` heading satisfies the row too, the same latitude every other section pattern allows
  assert.equal(
    scanRunStateContract(
      fixture({ 'references/issue-tracker-jira.md': '# store\n\n### Run state\n\nNo snapshot.\n' }),
    ).length,
    0,
    'a deeper heading level still carries the section',
  );

  // this repo's own dogfooded store config is checked alongside the seeds
  const rsDogfood = scanRunStateContract(fixture({ 'docs/agents/issue-tracker.md': '# Slice store\n\nIssues.\n' }));
  assert.equal(rsDogfood.length, 1, 'the dogfooded store config is checked too');
  assert.equal(rsDogfood[0].source, path.join('docs', 'agents', 'issue-tracker.md'), 'names it');

  // a fifth backend seed dropped into references/ is covered without any change to this scanner
  assert.equal(
    scanRunStateContract(
      fixture({ 'references/issue-tracker-newstore.md': '# newstore\n\nNo run-state section here.\n' }),
    ).length,
    1,
    'a seed this scanner has never seen before is still held to the contract',
  );

  // an absent document is skipped, so a fixture carries only the docs it exercises
  assert.equal(
    scanRunStateContract(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'an absent document is skipped rather than reported',
  );

  // a heading shown only inside a fenced code example is not the real section — defensive: no store
  // document renders one this way today, but the store seeds' own habit of showing a heading inside a
  // fenced example elsewhere makes it plausible
  assert.equal(
    scanRunStateContract(
      fixture({
        'references/issue-tracker-local.md':
          '# store\n\nA seed renders it like this:\n\n```markdown\n## Run state (fill in at setup)\n' +
          'This store carries no snapshot.\n```\n',
      }),
    ).length,
    1,
    'a heading shown only inside a fenced code example is not the real section',
  );

  // the real tree is green: every store document it ships carries the section
  assert.equal(
    scanRunStateContract(realRoot).length,
    0,
    'every store document in the real tree carries its `## Run state` section',
  );

  // --- scanTriageRecordContract: every slice-store document states where a deferred finding's triage
  // record lives (ADR 0046), over the same storeDocuments() candidate list scanAnchorContract and
  // scanReleaseContract already walk — so a fifth backend seed, or this repo's own dogfooded
  // docs/agents/issue-tracker.md, gets the requirement without a second hardcoded row. ---

  // positive: a store document with no triage-record section is flagged
  const trSeed1 = fixture({ 'references/issue-tracker-acme.md': '# acme\n\nSlices are issues.\n' });
  const trSeedGaps1 = scanTriageRecordContract(trSeed1);
  assert.equal(trSeedGaps1.length, 1, 'flags a store document with no triage-record section');
  assert.equal(trSeedGaps1[0].source, path.join('references', 'issue-tracker-acme.md'), 'names the seed');

  // negative: the same document carrying the section and both its elements is clean
  assert.equal(
    scanTriageRecordContract(
      fixture({
        'references/issue-tracker-acme.md':
          '# acme\n\n## Triage record\n\nAn issue carrying the `triage` label.\n\n' +
          '- **List the records:** `GET /issues?labels=triage`.\n' +
          "- **No feature label and no `ready` label.** Those two are what `/superdev:afk`'s candidate " +
          'listing selects on.\n',
      }),
    ).length,
    0,
    'a store document carrying the section and both its elements yields zero gaps',
  );

  // positive: the section is there and states only how to create a record, never how to read one back —
  // the gap `/superdev:backlog` opens when a store never states its listing call
  const trCreateOnly = scanTriageRecordContract(
    fixture({
      'references/issue-tracker-acme.md':
        '# acme\n\n## Triage record\n\n- **Create it:** `POST /issues` with the `triage` label.\n' +
        "- **No feature label and no `ready` label.** Those two are what `/superdev:afk`'s candidate " +
        'listing selects on.\n',
    }),
  );
  assert.equal(trCreateOnly.length, 1, 'flags a section that states creation but no listing');
  assert.match(trCreateOnly[0].expectation, /list this backend's triage records/, 'names the missing element');

  // positive: the section states creation and listing but never why the record stays out of
  // /superdev:afk's candidate listing — the outcome plan-contract.md's own generic section already
  // promises ("No candidate listing and no slice loader ever selects it")
  const trNoExclusion = scanTriageRecordContract(
    fixture({
      'references/issue-tracker-acme.md':
        '# acme\n\n## Triage record\n\n- **Create it:** `POST /issues` with the `triage` label.\n' +
        '- **List the records:** `GET /issues?labels=triage`.\n',
    }),
  );
  assert.equal(trNoExclusion.length, 1, 'flags a section stating creation and listing but no exclusion rule');
  assert.match(trNoExclusion[0].expectation, /candidate listing/, 'names the missing exclusion element');

  // negative: the same document, carrying the exclusion vocabulary too, is clean
  assert.equal(
    scanTriageRecordContract(
      fixture({
        'references/issue-tracker-acme.md':
          '# acme\n\n## Triage record\n\n- **Create it:** `POST /issues` with the `triage` label.\n' +
          '- **List the records:** `GET /issues?labels=triage`.\n' +
          "- **No feature label and no `ready` label.** Those two are what `/superdev:afk`'s candidate " +
          'listing selects on.\n',
      }),
    ).length,
    0,
    'a section stating the exclusion vocabulary too is clean',
  );

  // the real tree is green: every seed's exclusion bullet already carries the vocabulary
  assert.equal(
    scanTriageRecordContract(realRoot).length,
    0,
    'every store document in the real tree states its exclusion rule',
  );

  // the local seed's existing bullet says a record is *invisible* to /superdev:afk's "candidate listing".
  // A bare `list` anchor would read that exclusion rule as the listing contract, so it must not satisfy it.
  assert.equal(
    scanTriageRecordContract(
      fixture({
        'references/issue-tracker-local.md':
          '# store\n\n## Triage record\n\n' +
          "- **`docs/plans/triage/<slug>.md` is invisible to `/superdev:afk`'s candidate listing** by\n" +
          '  construction.\n',
      }),
    ).length,
    1,
    'an exclusion bullet mentioning a listing does not satisfy the listing element',
  );

  // the element is scoped to the section: a listing bullet elsewhere in the document does not satisfy it
  assert.equal(
    scanTriageRecordContract(
      fixture({
        'references/issue-tracker-acme.md':
          '# acme\n\n## Scope anchor\n\n- **List the records:** `GET /issues`.\n\n' +
          '## Triage record\n\n- **Create it:** `POST /issues`.\n' +
          "- **No feature label and no `ready` label.** Those two are what `/superdev:afk`'s candidate " +
          'listing selects on.\n',
      }),
    ).length,
    1,
    'a listing bullet outside the section does not satisfy the element',
  );

  // positive: one of the real seeds loses it, and the gap names that seed
  const triageSection =
    '# store\n\n## Triage record\n\nAn issue carrying the `triage` label.\n\n' +
    '- **List the records:** `GET /issues?labels=triage`.\n' +
    "- **No feature label and no `ready` label.** Those two are what `/superdev:afk`'s candidate " +
    'listing selects on.\n';
  const trDropped = {
    'references/issue-tracker-forgejo.md': triageSection,
    'references/issue-tracker-github.md': triageSection,
    'references/issue-tracker-jira.md': triageSection,
    'references/issue-tracker-local.md': '# store\n\nA plan file is a triage record when somebody says so.\n',
  };
  const trGaps = scanTriageRecordContract(fixture(trDropped));
  assert.equal(trGaps.length, 1, 'flags the seed that dropped the section');
  assert.equal(
    trGaps[0].source,
    path.join('references', 'issue-tracker-local.md'),
    'names the seed that dropped it',
  );

  // a `###` heading satisfies the row too, the same latitude every other section pattern allows
  assert.equal(
    scanTriageRecordContract(
      fixture({
        'references/issue-tracker-jira.md':
          '# store\n\n### Triage record\n\nAn issue.\n\n- **List the records:** `GET /search`.\n' +
          "- **No feature label and no ready status or label.** Those are what `/superdev:afk`'s " +
          'candidate listing selects on.\n',
      }),
    ).length,
    0,
    'a deeper heading level still carries the section',
  );

  // this repo's own dogfooded store config is checked alongside the seeds
  const trDogfood = scanTriageRecordContract(fixture({ 'docs/agents/issue-tracker.md': '# Slice store\n\nIssues.\n' }));
  assert.equal(trDogfood.length, 1, 'the dogfooded store config is checked too');
  assert.equal(trDogfood[0].source, path.join('docs', 'agents', 'issue-tracker.md'), 'names it');

  // a fifth backend seed dropped into references/ is covered without any change to this scanner
  const trFifth = scanTriageRecordContract(
    fixture({ 'references/issue-tracker-acme.md': '# acme\n\nNo triage-record section here.\n' }),
  );
  assert.equal(trFifth.length, 1, 'a seed this scanner has never seen before is still held to the contract');

  // an absent document is skipped, so a fixture carries only the docs it exercises
  assert.equal(
    scanTriageRecordContract(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'an absent document is skipped rather than reported',
  );

  // --- scanUntriagedContract: every slice-store document states how to recognise, list, and read the
  // age of an untriaged item (an open record superdev never wrote), over the same storeDocuments()
  // candidate list scanTriageRecordContract already walks. Modeled directly on that scanner. ---

  // positive: a store document with no untriaged-item section is flagged
  const unSeed1 = fixture({ 'references/issue-tracker-acme.md': '# acme\n\nSlices are issues.\n' });
  const unGaps1 = scanUntriagedContract(unSeed1);
  assert.equal(unGaps1.length, 1, 'flags a store document with no untriaged-item section');
  assert.equal(unGaps1[0].source, path.join('references', 'issue-tracker-acme.md'), 'names the seed');

  // negative: the same document carrying the section and its listing and age elements is clean
  assert.equal(
    scanUntriagedContract(
      fixture({
        'references/issue-tracker-acme.md':
          '# acme\n\n## Untriaged item\n\n' +
          '- **Recognise one.** An open issue with no feature label and no triage label.\n' +
          '- **List them:** `GET /issues?state=open`, keeping the ones matching the rule above.\n' +
          "- **Read its age:** the issue's `created_at` field.\n",
      }),
    ).length,
    0,
    'a store document carrying the section and its recognition, listing, and age elements yields zero gaps',
  );

  // positive: the section states recognition and age, never how to list them
  const unRecogniseOnly = scanUntriagedContract(
    fixture({
      'references/issue-tracker-acme.md':
        '# acme\n\n## Untriaged item\n\n' +
        '- **Recognise one.** An open issue carrying neither a feature label nor the triage label.\n' +
        "- **Read its age:** the issue's `created_at` field.\n",
    }),
  );
  assert.equal(unRecogniseOnly.length, 1, 'flags a section that states recognition but no listing');
  assert.match(unRecogniseOnly[0].expectation, /list this backend's untriaged items/, 'names the missing element');

  // positive: the section states recognition and listing, never how to read one's age — the gap
  // /superdev:backlog opens when a store never states how to order and select untriaged rows by age
  const unAgeMissing = scanUntriagedContract(
    fixture({
      'references/issue-tracker-acme.md':
        '# acme\n\n## Untriaged item\n\n' +
        '- **Recognise one.** An open issue carrying neither a feature label nor the triage label.\n' +
        '- **List them:** `GET /issues?state=open`, keeping the ones matching the rule above.\n',
    }),
  );
  assert.equal(unAgeMissing.length, 1, 'flags a section that states listing but no age');
  assert.match(unAgeMissing[0].expectation, /read an untriaged item's age/, 'names the missing element');

  // positive: the section states listing and age, never how to recognise one
  const unRecogniseMissing = scanUntriagedContract(
    fixture({
      'references/issue-tracker-acme.md':
        '# acme\n\n## Untriaged item\n\n' +
        '- **List them:** `GET /issues?state=open`, keeping the ones matching the rule above.\n' +
        "- **Read its age:** the issue's `created_at` field.\n",
    }),
  );
  assert.equal(unRecogniseMissing.length, 1, 'flags a section that states listing and age but no recognition');
  assert.match(
    unRecogniseMissing[0].expectation,
    /recognise an untriaged item/,
    'names the missing element',
  );

  // the element is scoped to the section: a listing bullet elsewhere in the document does not satisfy it
  assert.equal(
    scanUntriagedContract(
      fixture({
        'references/issue-tracker-acme.md':
          '# acme\n\n## Scope anchor\n\n- **List them:** `GET /issues`.\n\n' +
          '## Untriaged item\n\n' +
          '- **Recognise one.** An open issue with neither label.\n' +
          "- **Read its age:** the issue's `created_at` field.\n",
      }),
    ).length,
    1,
    'a listing bullet outside the section does not satisfy the element',
  );

  // positive: one of the real seeds loses it, and the gap names that seed
  const untriagedSection =
    '# store\n\n## Untriaged item\n\n' +
    '- **Recognise one.** An open issue with no feature label and no triage label.\n' +
    '- **List them:** `GET /issues?state=open`.\n' +
    "- **Read its age:** the issue's `created_at` field.\n";
  const unDropped = {
    'references/issue-tracker-forgejo.md': untriagedSection,
    'references/issue-tracker-github.md': untriagedSection,
    'references/issue-tracker-jira.md': untriagedSection,
    'references/issue-tracker-local.md': '# store\n\nNo inbox here.\n',
  };
  const unGaps = scanUntriagedContract(fixture(unDropped));
  assert.equal(unGaps.length, 1, 'flags the seed that dropped the section');
  assert.equal(
    unGaps[0].source,
    path.join('references', 'issue-tracker-local.md'),
    'names the seed that dropped it',
  );

  // a `###` heading satisfies the row too, the same latitude every other section pattern allows
  assert.equal(
    scanUntriagedContract(
      fixture({
        'references/issue-tracker-jira.md':
          '# store\n\n### Untriaged item\n\n- **Recognise one.** An issue with neither label.\n' +
          '- **List them:** `GET /search`.\n' +
          "- **Read its age:** the issue's `created` field.\n",
      }),
    ).length,
    0,
    'a deeper heading level still carries the section',
  );

  // this repo's own dogfooded store config is checked alongside the seeds
  const unDogfood = scanUntriagedContract(fixture({ 'docs/agents/issue-tracker.md': '# Slice store\n\nIssues.\n' }));
  assert.equal(unDogfood.length, 1, 'the dogfooded store config is checked too');
  assert.equal(unDogfood[0].source, path.join('docs', 'agents', 'issue-tracker.md'), 'names it');

  // a fifth backend seed dropped into references/ is covered without any change to this scanner
  const unFifth = scanUntriagedContract(
    fixture({ 'references/issue-tracker-acme.md': '# acme\n\nNo untriaged-item section here.\n' }),
  );
  assert.equal(unFifth.length, 1, 'a seed this scanner has never seen before is still held to the contract');

  // an absent document is skipped, so a fixture carries only the docs it exercises
  assert.equal(
    scanUntriagedContract(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'an absent document is skipped rather than reported',
  );

  // the real tree is green: every store document it ships carries the section and its listing element
  assert.equal(
    scanUntriagedContract(realRoot).length,
    0,
    'every store document in the real tree carries its `## Untriaged item` section',
  );

  // --- scanSpecialisingCitations: every store document cites the generic contract each section it
  // carries specialises. The rows SPECIALISING_SECTIONS derives in SOURCE_SECTION_CONTRACTS pin the
  // generic side and the six store-side presence contracts pin the store side; this is the citation
  // between them. Both this loop and those rows come off the one membership list, so a member added
  // there is exercised here with no edit. ---

  const citingDoc = (omit) =>
    SPECIALISING_SECTIONS.map(
      (n) => `## ${n}\n\n` + (n === omit ? 'nothing points anywhere.\n' : `\`plan-contract.md\` → *${n}*. text\n`),
    ).join('\n');

  // positive: each member fails on its own, and the gap names the document that dropped it
  for (const name of SPECIALISING_SECTIONS) {
    const gaps = scanSpecialisingCitations(fixture({ 'references/issue-tracker-acme.md': citingDoc(name) }));
    assert.equal(gaps.length, 1, `dropping the \`## ${name}\` citation flags exactly one gap`);
    assert.equal(gaps[0].source, 'references/issue-tracker-acme.md', `the \`## ${name}\` gap names its document`);
  }

  // every citation present yields zero gaps
  assert.equal(
    scanSpecialisingCitations(fixture({ 'references/issue-tracker-acme.md': citingDoc(null) })).length,
    0,
    'a store document citing every member yields zero gaps',
  );

  // a section the store legitimately does not carry is skipped, never flagged: the local-file store has
  // no assignee concept and carries no `## Assignee` at all, which is a documented choice, not a gap
  assert.equal(
    scanSpecialisingCitations(
      fixture({ 'references/issue-tracker-acme.md': '## Scope anchor\n\n`plan-contract.md` → *Scope anchor*. only this one\n' }),
    ).length,
    0,
    'a section the store does not carry is skipped rather than reported',
  );

  // the real local-file seed is that case: it renders no `## Assignee`, so the newest member of the
  // family costs it nothing
  assert.equal(
    scanSpecialisingCitations(realRoot).length,
    0,
    'every store document in the real tree cites the generic contract for every section it carries',
  );

  // the citation is prose and wraps — references/issue-tracker-local.md carries `*Append\nmode*`, and a
  // literal-space pattern would report that real document as drift
  assert.equal(
    scanSpecialisingCitations(
      fixture({
        'references/issue-tracker-acme.md':
          '## Append mode\n\ntext (`plan-contract.md` → *Append\nmode*, ADR 0004).\n',
      }),
    ).length,
    0,
    'a citation wrapped across two lines still counts',
  );

  // the citation is prose and wraps at either space around the arrow too, not just inside the section
  // name: a rewrap that breaks the line between `` `plan-contract.md` `` and `→`, or between `→` and
  // `*Release*`, must not turn a correct citation red
  assert.equal(
    scanSpecialisingCitations(
      fixture({
        'references/issue-tracker-acme.md':
          '## Release\n\ntext (`plan-contract.md`\n→\n*Release*, ADR 0034).\n',
      }),
    ).length,
    0,
    'a citation wrapped at either arrow joint still counts',
  );

  // a citation sitting only inside a fenced code block does not count: extractSection() masks fences to
  // find the section's boundaries, but the citation test must run on fence-masked content too
  assert.equal(
    scanSpecialisingCitations(
      fixture({
        'references/issue-tracker-acme.md':
          '## Release\n\n```markdown\n`plan-contract.md` → *Release*.\n```\n',
      }),
    ).length,
    1,
    'a citation shown only inside a fenced example is not a real citation',
  );

  // the comma form is not accepted: one notation is pinned, never an alternation
  assert.equal(
    scanSpecialisingCitations(
      fixture({ 'references/issue-tracker-acme.md': '## Release\n\ntext (`plan-contract.md`, *Release*, ADR 0034).\n' }),
    ).length,
    1,
    'the comma citation form is drift, not a second accepted spelling',
  );

  // a fifth backend seed is covered without any change to this scanner
  assert.equal(
    scanSpecialisingCitations(fixture({ 'references/issue-tracker-newstore.md': citingDoc('Release') })).length,
    1,
    'a seed this scanner has never seen before is still held to the contract',
  );

  // an absent document is skipped, matching every other contract table on a partial checkout
  assert.equal(
    scanSpecialisingCitations(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'an absent document is skipped rather than reported',
  );

  // --- scanGlossarySpecialisingCitations: CONTEXT.md's glossary entries cite the generic contract
  // each specialises too, the same citation scanSpecialisingCitations() already pins on the store
  // side. GLOSSARY_ENTRY_TITLES maps a SPECIALISING_SECTIONS member to its glossary entry's own
  // title, since the two names diverge for one member (`Run state` is titled "Published snapshot")
  // and `Append mode` maps to `null` — no glossary entry at all — so it is skipped rather than
  // flagged. The `null`-mapped members are filtered out below before building a fixture document,
  // since there is no glossary entry to render for them. ---

  const glossaryTitles = Object.entries(GLOSSARY_ENTRY_TITLES).filter(([, title]) => title !== null);

  const glossaryDoc = (omit) =>
    glossaryTitles
      .map(([name, title]) =>
        title === omit
          ? `**${title}**: prose with no citation at all.\n`
          : `**${title}**: prose. \`plan-contract.md\` → *${name}*. more prose.\n`,
      )
      .join('\n');

  // positive: each glossary entry fails on its own, and the gap names CONTEXT.md
  for (const [, title] of glossaryTitles) {
    const gaps = scanGlossarySpecialisingCitations(fixture({ 'CONTEXT.md': glossaryDoc(title) }));
    assert.equal(gaps.length, 1, `dropping the **${title}** citation flags exactly one gap`);
    assert.equal(gaps[0].source, 'CONTEXT.md', `the **${title}** gap names CONTEXT.md`);
  }

  // every citation present yields zero gaps
  assert.equal(
    scanGlossarySpecialisingCitations(fixture({ 'CONTEXT.md': glossaryDoc(null) })).length,
    0,
    'a glossary citing every member it names yields zero gaps',
  );

  // `Append mode` has no glossary entry at all — costs nothing, same as a store section a document
  // legitimately does not carry
  assert.equal(
    scanGlossarySpecialisingCitations(
      fixture({ 'CONTEXT.md': '**Scope anchor**: prose. `plan-contract.md` → *Scope anchor*. only this one\n' }),
    ).length,
    0,
    'a member with no glossary entry is skipped rather than reported',
  );

  // a citation sitting only inside a fenced code block, in the same paragraph, does not count —
  // matching scanSpecialisingCitations()'s own fence-masking rule
  assert.equal(
    scanGlossarySpecialisingCitations(
      fixture({
        'CONTEXT.md': '**Release**: prose.\n```markdown\n`plan-contract.md` → *Release*.\n```\nmore prose.\n',
      }),
    ).length,
    1,
    'a citation shown only inside a fenced example is not a real citation',
  );

  // an absent CONTEXT.md is skipped, matching every other contract table on a partial checkout
  assert.equal(
    scanGlossarySpecialisingCitations(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'an absent CONTEXT.md is skipped rather than reported',
  );

  // the real repo's CONTEXT.md cites plan-contract.md for every member it has a glossary entry for
  assert.equal(
    scanGlossarySpecialisingCitations(realRoot).length,
    0,
    "the real CONTEXT.md cites plan-contract.md for every member it glosses",
  );

  // GLOSSARY_ENTRY_TITLES is total against SPECIALISING_SECTIONS: every member is a key, either a
  // glossary title (a string) or `null` (a documented absence, like `Append mode`). A member missing
  // from the map entirely (not even a `null` entry) is a coding error the scanner above must not read
  // the same as a documented absence — this catches the gap before a 7th member ever reaches it.
  assert.deepEqual(
    [...Object.keys(GLOSSARY_ENTRY_TITLES)].sort(),
    [...SPECIALISING_SECTIONS].sort(),
    'GLOSSARY_ENTRY_TITLES has exactly one key per SPECIALISING_SECTIONS member',
  );

  // --- Store-side presence coverage (a selftest, not a registered check — running the whole registry
  // from inside the registry would recurse). scanSpecialisingCitations() above pins the citation between
  // the generic and store sides; the six store-side scanners above each pin their own member's section.
  // Neither half asks whether a member with NO store-side scanner at all — the presence contract itself,
  // not any one element of it — would ever be missed. This is the hole `Assignee` already cost once
  // (issue #386): the section was deletable with every check green until scanAssigneeContract's own
  // heading half was written.
  //
  // One fixture renders every member as a bare `## <name>` heading plus its citation — the same shape
  // citingDoc() above builds — so a member added to SPECIALISING_SECTIONS needs no fixture edit here: the
  // loop below reads the real list. For each member, the fixture is rebuilt with that member's whole
  // section omitted, the full `scripts/drift/checks.js` registry is run over both, and the two gap sets
  // are compared by identity (`checkId::JSON.stringify(gap)`) rather than by count, since a check whose
  // gap *shape* changes (an element gap swapping for a whole-section gap) is still a real signal even when
  // its count does not change. The member is CAUGHT when the omitted run carries an identity the full run
  // does not.
  //
  // This fixture carries one document. Every check that scans a document this fixture does not carry — all
  // but the seven store-side checks above — reads no such document (`readDoc()`/`readdirSync()` return
  // nothing) and contributes no gap either way, the same skip-on-absence convention every scanner in this
  // file already follows. Nothing here swallows an error to reach that zero: an absent document is a
  // normal, already-tested branch, not a caught exception, so the comparison below only ever attributes a
  // caught member to a check that actually read this fixture.
  const familyMember = (name) => `## ${name}\n\n\`plan-contract.md\` → *${name}*. text\n`;
  const familyDoc = (omit) => SPECIALISING_SECTIONS.filter((n) => n !== omit).map(familyMember).join('\n');
  const familyGapIds = (root) =>
    new Set(CHECKS.flatMap((check) => check.run(root).map((gap) => `${check.id}::${JSON.stringify(gap)}`)));
  const familyBaseline = familyGapIds(fixture({ 'references/issue-tracker-familycoupling.md': familyDoc(null) }));

  for (const name of SPECIALISING_SECTIONS) {
    const omittedGaps = familyGapIds(
      fixture({ 'references/issue-tracker-familycoupling.md': familyDoc(name) }),
    );
    const caught = [...omittedGaps].some((id) => !familyBaseline.has(id));
    assert.equal(
      caught,
      true,
      `no check in the registry reports a new gap when the store-side \`## ${name}\` section is entirely ` +
        'absent — this member has no store-side presence contract',
    );
  }

  // positive: every forcing-flag spelling is actually caught, not just `switch -C` / `worktree add -B`
  for (const flagged of [
    'git switch -C <type>/<scope> <base>',
    'git switch --force-create <type>/<scope> <base>',
    'git checkout -B <type>/<scope> <base>',
    'git worktree add <path> -B <type>/<scope> <base>',
    'git worktree add <path> --force-create <type>/<scope> <base>',
  ]) {
    const flaggedRoot = fixture({ 'references/implement-full.md': `Cut the branch:\n\n\`${flagged}\`\n` });
    const flaggedGaps = scanForcingBranchFlag(flaggedRoot);
    assert.equal(flaggedGaps.length, 1, `catches the forcing flag in "${flagged}"`);
    assert.match(flaggedGaps[0].expectation, /name no forcing branch flag/, 'names the rule');
  }

  // both playbooks are read, not just the first one
  const bothFlagged = scanForcingBranchFlag(
    fixture({
      'references/implement-full.md': 'git switch -C <type>/<scope> <base>\n',
      'references/implement-lite.md': 'git checkout -B <type>/<scope> <base>\n',
    }),
  );
  assert.equal(bothFlagged.length, 2, 'reports each playbook on its own');

  // `git switch -c` (the non-forcing form both playbooks actually use) is not a hit, or the check would
  // fire on every correct playbook there is
  assert.equal(
    scanForcingBranchFlag(fixture({ 'references/implement-full.md': 'git switch -c <type>/<scope> <base>\n' }))
      .length,
    0,
    'the non-forcing `-c` form passes',
  );

  // absent file is skipped, matching every other scanner
  assert.equal(scanForcingBranchFlag(fixture({ 'README.md': '# repo\n' })).length, 0, 'absent playbook is skipped');

  // positive: a playbook that instructs a return to the command body is reported, naming the document
  const returnRoot = fixture({
    'references/implement-full.md': 'Once the fix loop caps out, return to the controller.\n',
  });
  const returnGaps = scanReturnToController(returnRoot);
  assert.equal(returnGaps.length, 1, 'flags the return-to-controller instruction');
  assert.equal(returnGaps[0].source, path.join('references', 'implement-full.md'), 'names the document');

  // positive: every phrasing a hurried edit reaches for is caught, not just "return to the controller"
  for (const flagged of [
    'return to the controller',
    'Return to the controller',
    'go back to the controller',
    'return to the **Final phase**',
    'return to the Final phase',
  ]) {
    const flaggedRoot = fixture({ 'references/implement-lite.md': `Once done, ${flagged} for the next step.\n` });
    const flaggedGaps = scanReturnToController(flaggedRoot);
    assert.equal(flaggedGaps.length, 1, `catches the return instruction in "${flagged}"`);
    assert.match(flaggedGaps[0].expectation, /return to the command body/, 'names the rule');
  }

  // positive: nine reintroductions a future edit could reach for, none of them the two historical
  // wordings above — each pairs a directional verb (hand back, resume, continue, go back up, jump back,
  // return, back to) with a return target (the controller, the command body, /superdev:implement, or
  // skills/implement/SKILL.md) the two-verb/two-target net above would let straight through
  for (const flagged of [
    'Once the loop caps out, hand control back to /superdev:implement.',
    'Once the loop caps out, resume at the controller.',
    'Continue in skills/implement/SKILL.md from where this left off.',
    'Go back up to the command body to finish Final phase.',
    'Jump back to Final phase in the controller.',
    'When done, return to Final Phase.',
    'Hand off execution back to /superdev:implement now.',
    'back to the command body',
    'return to skills/implement/SKILL.md',
  ]) {
    const flaggedRoot = fixture({ 'references/implement-lite.md': `${flagged}\n` });
    const flaggedGaps = scanReturnToController(flaggedRoot);
    assert.equal(flaggedGaps.length, 1, `catches the reintroduced return jump in "${flagged}"`);
    assert.match(flaggedGaps[0].expectation, /return to the command body/, 'names the rule');
  }

  // negative: a bare, verb-less mention of "the controller's Final phase" is not itself a return jump —
  // only a directional verb paired with a return target is one. A pattern with no verb requirement would
  // flag this forward-pointing sentence for no defect.
  assert.equal(
    scanReturnToController(
      fixture({
        'references/implement-lite.md':
          "See the controller's Final phase for what happens after this playbook ends.\n",
      }),
    ).length,
    0,
    'a bare mention of "the controller\'s Final phase" with no directional verb is reported clean',
  );

  // negative: a playbook naming the controller or the router without instructing a return is clean —
  // mentioning /superdev:implement, the router, or "the controller" as the reader is not a violation
  const cleanRoot = fixture({
    'references/implement-full.md':
      'The controller `Read`s this after computing tier = `full` (see `skills/implement/SKILL.md`). ' +
      "Honor the controller's **Invariants** throughout. " +
      'Read `${CLAUDE_PLUGIN_ROOT}/references/run-init.md` before cutting the branch, and read ' +
      '`${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md` as your last step.\n',
  });
  assert.equal(scanReturnToController(cleanRoot).length, 0, 'a forward-only playbook is reported clean');

  // negative: "the controller" used as an ordinary actor, with no verb sending the reader back to it
  assert.equal(
    scanReturnToController(
      fixture({ 'references/implement-lite.md': 'The controller merges each slice serially.\n' }),
    ).length,
    0,
    'an ordinary mention of "the controller" as an actor is reported clean',
  );

  // negative: a cross-reference to skills/implement/SKILL.md, not an instruction to go there
  assert.equal(
    scanReturnToController(
      fixture({
        'references/implement-lite.md': 'See `skills/implement/SKILL.md` for the tier the controller computed.\n',
      }),
    ).length,
    0,
    'a cross-reference to skills/implement/SKILL.md is reported clean',
  );

  // negative: "back to" crossed with a path-shaped target catches an ordinary backward cross-reference
  // too — "refer back to" is a pointer, not a hand-off, and a playbook could legitimately carry it
  assert.equal(
    scanReturnToController(
      fixture({
        'references/implement-lite.md':
          'For the full command surface, refer back to `skills/implement/SKILL.md`.\n',
      }),
    ).length,
    0,
    'a "refer back to" cross-reference to skills/implement/SKILL.md is reported clean',
  );

  // negative: the same shape against the other path-shaped target
  assert.equal(
    scanReturnToController(
      fixture({
        'references/implement-lite.md':
          'The router can point back to `/superdev:implement` if a slice needs re-dispatch.\n',
      }),
    ).length,
    0,
    'a "point back to" cross-reference to /superdev:implement is reported clean',
  );

  // absent file is skipped, matching every other scanner
  assert.equal(
    scanReturnToController(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'a fixture missing the playbook entirely is skipped, not reported',
  );

  // positive: run-init.md and run-handoff.md are candidates too, not just the two playbooks — they are
  // the documents the command body's opening and closing steps were carved into, and the most plausible
  // place for a stray "then return to /superdev:implement" to reappear
  const runInitReturn = scanReturnToController(
    fixture({ 'references/run-init.md': 'Once the ledger exists, return to the controller.\n' }),
  );
  assert.equal(runInitReturn.length, 1, 'flags a return-to-controller instruction in run-init.md');
  assert.equal(runInitReturn[0].source, path.join('references', 'run-init.md'), 'names run-init.md');

  const runHandoffReturn = scanReturnToController(
    fixture({ 'references/run-handoff.md': 'When done, hand control back to /superdev:implement.\n' }),
  );
  assert.equal(runHandoffReturn.length, 1, 'flags a return-to-controller instruction in run-handoff.md');
  assert.equal(runHandoffReturn[0].source, path.join('references', 'run-handoff.md'), 'names run-handoff.md');

  // --- PLAYBOOK_EDGE_CONTRACTS: the positive half of the same one-directional shape — both execution
  // playbooks must still name run-init.md as their opening step and run-handoff.md as their closing one.
  // scanReturnToController() above only catches an instruction to go back; this catches a playbook that
  // stops pointing forward, at either reference, without ever instructing a return.

  // positive: a playbook that stops naming run-init.md goes red on its own row
  const edgeNoRunInit = scanContract(
    fixture({ 'references/implement-full.md': 'Read `${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md` last.\n' }),
    PLAYBOOK_EDGE_CONTRACTS,
  );
  assert.equal(edgeNoRunInit.length, 1, 'flags a playbook missing run-init.md');
  assert.match(edgeNoRunInit[0].expectation, /run-init\.md/, 'names the run-init.md row');

  // positive: a playbook that stops naming run-handoff.md goes red on its own row, independently
  const edgeNoRunHandoff = scanContract(
    fixture({ 'references/implement-lite.md': 'Read `${CLAUDE_PLUGIN_ROOT}/references/run-init.md` first.\n' }),
    PLAYBOOK_EDGE_CONTRACTS,
  );
  assert.equal(edgeNoRunHandoff.length, 1, 'flags a playbook missing run-handoff.md');
  assert.match(edgeNoRunHandoff[0].expectation, /run-handoff\.md/, 'names the run-handoff.md row');

  // negative: a playbook naming both is clean
  assert.equal(
    scanContract(
      fixture({
        'references/implement-full.md':
          'Read `${CLAUDE_PLUGIN_ROOT}/references/run-init.md` first and ' +
          '`${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md` last.\n',
      }),
      PLAYBOOK_EDGE_CONTRACTS,
    ).length,
    0,
    'a playbook naming both references is clean',
  );

  // absent playbook is skipped, matching every other contract row
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), PLAYBOOK_EDGE_CONTRACTS).length,
    0,
    'an absent playbook is skipped rather than reported',
  );

  // ---------------------------------------------------------------------------
  // scanNarrativeCoverage: every registered check is written up
  //
  // The `ids` parameter is passed explicitly throughout. Defaulting to the live registry would make
  // every fixture below shift each time a check is added — the narrative these fixtures carry would
  // need a new id on an edit that has nothing to do with them.
  // ---------------------------------------------------------------------------

  const twoIds = ['alpha-check', 'beta-check'];
  // A narrative describing both, keyed by id: what the shipped documents look like when the contract
  // holds.
  const coveredNarrative =
    '# scripts/\n\n`drift-check.js` guards the checks below, each keyed to its registered check id.\n' +
    'The `alpha-check` contract: it guards alpha.\n' +
    'The `beta-check` contract: it guards beta.\n\n' +
    'A new contract is one entry, plus its section in the narrative above, plus its selftest.\n';
  const rootAgents = '# superdev\n\n`drift-check.js` with `drift/` (the cross-document contract checks).\n';
  const covered = { 'scripts/AGENTS.md': coveredNarrative, 'AGENTS.md': rootAgents };

  assert.equal(
    scanNarrativeCoverage(fixture(covered), twoIds).length,
    0,
    'every id described yields zero gaps',
  );

  // positive: a registered check nobody wrote up — the gap names the id, so the reader knows which
  const undescribed = scanNarrativeCoverage(fixture(covered), [...twoIds, 'gamma-check']);
  assert.ok(
    undescribed.some((g) => /gamma-check/.test(g.expectation)),
    'an undescribed check is reported by its own id',
  );
  assert.equal(
    undescribed.filter((g) => /gamma-check/.test(g.expectation))[0].source,
    path.join('scripts', 'AGENTS.md'),
    'the undescribed-check gap names the narrative',
  );

  // positive: a bare, unbackticked mention of an id — a substring of a longer word, or plain prose — must
  // not satisfy coverage. `reference` inside `references/…` is the real shape this guards: the whole
  // write-up naming a check could vanish and a document-wide substring search would still pass.
  const bareMention = {
    ...covered,
    'scripts/AGENTS.md': coveredNarrative.replace(
      'The `alpha-check` contract: it guards alpha.\n',
      'alpha-check-related prose lives here, with no backticked id.\n',
    ),
  };
  assert.ok(
    scanNarrativeCoverage(fixture(bareMention), twoIds).some((g) => /alpha-check/.test(g.expectation)),
    'a bare, unbackticked mention of an id does not satisfy coverage',
  );

  // absent narrative is skipped, matching every other scanner's convention
  assert.equal(
    scanNarrativeCoverage(fixture({ 'README.md': '# repo\n' }), twoIds).length,
    0,
    'an absent narrative is skipped rather than reported',
  );

  // positive: stripping a check's own write-up from the shipped narrative is reported as a gap.
  const shippedScriptsAgents = fs.readFileSync(path.join(realRoot, 'scripts', 'AGENTS.md'), 'utf8');
  const shippedRootAgents = fs.readFileSync(path.join(realRoot, 'AGENTS.md'), 'utf8');
  const strippedOwnWriteUp = fixture({
    'scripts/AGENTS.md': shippedScriptsAgents.replace('The `source-sections` contract', 'The omitted contract'),
    'AGENTS.md': shippedRootAgents,
  });
  assert.ok(
    scanNarrativeCoverage(strippedOwnWriteUp).some((g) => /source-sections/.test(g.expectation)),
    "stripping `source-sections`'s own write-up is reported as a gap, with no other mention left to hide it",
  );

  // --- scanMarketplaceSource: the marketplace manifest's relative `source` resolves to a directory
  // carrying `.claude-plugin/plugin.json` (ADR 0032). `claude plugin validate .` accepts a source that
  // names no directory at all, so this is the only check between a mistyped path and every install
  // breaking while the suite stays green. ---

  // negative: a source that resolves to a real plugin tree is clean
  const mkManifest = (source) =>
    JSON.stringify({ name: 'm', plugins: [{ name: 'p', source }] });
  const msOk = fixture({
    '.claude-plugin/marketplace.json': mkManifest('./shipped'),
    'shipped/.claude-plugin/plugin.json': '{"name":"p","version":"0.0.0"}',
  });
  assert.equal(scanMarketplaceSource(msOk).length, 0, 'a resolving source yields zero gaps');

  // positive: a mistyped source names the manifest and the dead path
  const msTypo = fixture({
    '.claude-plugin/marketplace.json': mkManifest('./shippd'),
    'shipped/.claude-plugin/plugin.json': '{"name":"p","version":"0.0.0"}',
  });
  const msGaps = scanMarketplaceSource(msTypo);
  assert.equal(msGaps.length, 1, 'a source resolving to no plugin tree is a gap');
  assert.equal(msGaps[0].source, path.join('.claude-plugin', 'marketplace.json'), 'names the manifest');
  assert.match(msGaps[0].expectation, /\.\/shippd/, 'names the dead path');

  // an object source names a remote repo, not a path in this repo — out of scope
  const msRemote = fixture({
    '.claude-plugin/marketplace.json': JSON.stringify({
      name: 'm',
      plugins: [{ name: 'p', source: { source: 'github', repo: 'o/r' } }],
    }),
  });
  assert.equal(scanMarketplaceSource(msRemote).length, 0, 'an object source is skipped');

  // absent or unparsable manifest → nothing to scan, matching every other scanner's fixture rule
  assert.equal(scanMarketplaceSource(fixture({ 'README.md': '# repo\n' })).length, 0, 'absent manifest is skipped');

  // --- scanReadmeCommands: README.md and skills/ name the same command set — a command the README
  // never names, or one it still names after a rename, is a router that lies. ---

  // negative: README and skills/ agree
  const rcOk = fixture({
    'README.md': '# p\n\nRun `/superdev:plan`, then `/superdev:implement`.\n',
    'skills/plan/SKILL.md': '# plan\n',
    'skills/implement/SKILL.md': '# implement\n',
  });
  assert.equal(scanReadmeCommands(rcOk).length, 0, 'a README naming every command yields zero gaps');

  // a shipped command the README never names
  const rcMissing = fixture({
    'README.md': '# p\n\nRun `/superdev:plan`.\n',
    'skills/plan/SKILL.md': '# plan\n',
    'skills/ship/SKILL.md': '# ship\n',
  });
  const rcMissingGaps = scanReadmeCommands(rcMissing);
  assert.equal(rcMissingGaps.length, 1, 'an unmentioned command is one gap');
  assert.match(rcMissingGaps[0].expectation, /\/superdev:ship/, 'the gap names the unmentioned command');

  // a README naming a command that does not exist (a rename left the old name behind)
  const rcGhost = fixture({
    'README.md': '# p\n\nRun `/superdev:plan` and `/superdev:retired` (twice: `/superdev:retired`).\n',
    'skills/plan/SKILL.md': '# plan\n',
  });
  const rcGhostGaps = scanReadmeCommands(rcGhost);
  assert.equal(rcGhostGaps.length, 1, 'a ghost command is one gap, deduped across repeated mentions');
  assert.match(rcGhostGaps[0].expectation, /\/superdev:retired/, 'the gap names the ghost command');

  // absent README or absent skills dir → nothing to scan, matching every other scanner's fixture rule
  assert.equal(scanReadmeCommands(fixture({ 'skills/plan/SKILL.md': '# plan\n' })).length, 0, 'absent README is skipped');
  assert.equal(scanReadmeCommands(fixture({ 'README.md': '# p\n' })).length, 0, 'absent skills dir is skipped');

  // the real repository is clean both ways
  assert.equal(scanReadmeCommands(realRoot).length, 0, 'the real README and skills/ agree');

  // --- scanAuditSetGlobs: every pattern under `## Audit set` resolves to at least one file. A pattern
  // matching nothing makes `/superdev:document audit` read zero files and still report a clean pass. ---

  // negative: every pattern resolves, the plain-path shape and both glob shapes (a final-segment `*`
  // and a mid-segment one — `plugin/skills/*/SKILL.md` nests one directory per skill)
  const asOk = fixture({
    'plugin/skills/plan/SKILL.md': '# plan\n',
    'RELEASING.md': '# releasing\n',
    'docs/agents/documentation.md':
      '# doc\n\n## Audit set\n\n- `plugin/skills/*/SKILL.md`\n- `RELEASING.md`\n',
  });
  assert.equal(scanAuditSetGlobs(asOk).length, 0, 'patterns that all resolve yield zero gaps');

  // a glob whose directory does not exist at the root — the audited-nothing bug, verbatim
  const asStale = fixture({
    'plugin/skills/plan/SKILL.md': '# plan\n',
    'docs/agents/documentation.md':
      '# doc\n\n## Audit set\n\n- `commands/*.md`\n- `plugin/skills/*/SKILL.md`\n',
  });
  const asStaleGaps = scanAuditSetGlobs(asStale);
  assert.equal(asStaleGaps.length, 1, 'a glob resolving to no file is one gap');
  assert.match(asStaleGaps[0].expectation, /`commands\/\*\.md`/, 'the gap names the unresolvable pattern');

  // a plain path that is gone, and a glob whose directory exists but holds no match
  const asEmpty = fixture({
    'plugin/agents/.keep': '',
    'docs/agents/documentation.md':
      '# doc\n\n## Audit set\n\n- `plugin/agents/*.md`\n- `GONE.md`\n',
  });
  assert.equal(scanAuditSetGlobs(asEmpty).length, 2, 'an empty directory and a missing file are both gaps');

  // the section ends at the next heading — a bullet below it is not an audit-set pattern
  const asBounded = fixture({
    'RELEASING.md': '# releasing\n',
    'docs/agents/documentation.md':
      '# doc\n\n## Audit set\n\n- `RELEASING.md`\n\n## Something else\n\n- `not/a/pattern.md`\n',
  });
  assert.equal(scanAuditSetGlobs(asBounded).length, 0, 'bullets past the section are not scanned');

  // absent file, or the file without the section → nothing to scan; AUDIT_SET_CONTRACTS owns existence
  assert.equal(scanAuditSetGlobs(fixture({ 'README.md': '# r\n' })).length, 0, 'absent file is skipped');
  assert.equal(
    scanAuditSetGlobs(fixture({ 'docs/agents/documentation.md': '# doc\n\n## Writing standard\n' })).length,
    0,
    'a documentation.md with no `## Audit set` section is skipped',
  );

  // the real repository's own audit set resolves
  assert.equal(scanAuditSetGlobs(realRoot).length, 0, "this repo's audit-set patterns all resolve");

  // --- scanPinnedPaths: every document a contract table pins still exists. `scanContract` skips a
  // document it cannot read — the convention every fixture above depends on — so a table reports zero
  // gaps once its document is renamed away, and all of `bun run test` stays green while the contract it
  // asserted is gone. This is the one check that notices, and it collects the paths from the tables
  // themselves rather than a hand-kept list, so a table added later is covered without touching it. ---

  // the real repository: every pinned path resolves
  assert.equal(scanPinnedPaths(realRoot).length, 0, 'every path the contract tables pin exists in this repo');

  // positive: an empty tree — every pinned path is missing, and each gap names its own path
  const ppEmpty = scanPinnedPaths(fixture({ 'README.md': '# r\n' }));
  assert.ok(ppEmpty.length > 20, `an empty tree flags every pinned path (got ${ppEmpty.length})`);
  assert.ok(
    ppEmpty.every((g) => g.expectation.includes(g.source)),
    'each gap names the path that went missing, so the reader does not grep for it',
  );

  // positive: `skills/afk/SKILL.md` is among the paths this check collects, which is what lets the
  // `afk-existence` special case go. Three tables pin that file, so the general rule now covers what
  // that check was written to catch on its own.
  assert.ok(
    scanPinnedPaths(fixture({ 'README.md': '# r\n' })).some((g) => g.source === path.join('skills', 'afk', 'SKILL.md')),
    'skills/afk/SKILL.md disappearing is still caught, now by the general check',
  );

  // positive: `READ_PATH_CONTRACTS`' one row pins `docs/agents/knowledge-base.md` with a `test()`
  // function in row[1] rather than a `RegExp` — the shape the old `row[1] instanceof RegExp` gate
  // could not see, so this document was one of the seven a whole-scope review found uncollected.
  assert.ok(
    scanPinnedPaths(fixture({ 'README.md': '# r\n' })).some(
      (g) => g.source === path.join('docs', 'agents', 'knowledge-base.md'),
    ),
    'a document pinned by a test()-shaped row is still caught',
  );

  // positive: `NARRATIVE_DOC` pins `scripts/AGENTS.md` as a bare top-level string export, another shape
  // the old `instanceof RegExp` gate could not see.
  assert.ok(
    scanPinnedPaths(fixture({ 'README.md': '# r\n' })).some((g) => g.source === path.join('scripts', 'AGENTS.md')),
    'a document pinned by a bare string export is still caught',
  );

  // --- scanAgentToolAgnostic: shipped agent prose names no concrete toolchain command — the class the
  // `bun run test` pipe example shipped once (root AGENTS.md → Backends are pluggable). ---

  // negative: the neutral placeholder and the test-selection wire stay silent
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

  // negative: skills/ is out of scope — setup.md names concrete commands legitimately, as examples
  assert.equal(
    scanAgentToolAgnostic(fixture({ 'skills/setup/SKILL.md': 'e.g. `npm test`, `pytest -q`, `cargo test`\n' })).length,
    0,
    'skills/ examples stay out of scope',
  );

  // positive: the shipped leak, verbatim
  const taGaps = scanAgentToolAgnostic(
    fixture({ 'agents/implementer.md': 'Pipe noisy commands (`bun run test 2>&1 | tail -20`).\n' }),
  );
  assert.equal(taGaps.length, 1, 'flags a maintainer toolchain command in agent prose');
  assert.equal(taGaps[0].source, path.join('agents', 'implementer.md'), 'names the agent file');
  assert.match(taGaps[0].expectation, /bun run test/, 'the gap quotes the command it found');

  // positive: a brand-new agent file is covered without a table change, and a bare runner name counts
  assert.equal(
    scanAgentToolAgnostic(fixture({ 'agents/new-agent.md': 'Re-run with `pytest -q`.\n' })).length,
    1,
    'a new agent file and a bare runner name are both caught',
  );

  // negative: the real tree carries none
  assert.equal(scanAgentToolAgnostic(realRoot).length, 0, 'the shipped agents are clean');

  // --- REACHABLE_CRITERION_CONTRACTS: the `Reachable:` criterion rule (plan-contract.md) and the plan
  // surface that emits one into a Definition of Done (skills/plan/SKILL.md) agree on the token and on
  // the every-change-type clause (ADR 0062) ---

  const RC_PLAN_CONTRACT_CLEAN =
    '### The reachability criterion\n\n' +
    "Every feature's Definition of Done carries at least one criterion **led by `Reachable:`**, naming " +
    'what it reaches.\n\n' +
    'The rule holds on **every change type**, including a behaviour-preserving refactor.\n';
  const RC_PLAN_SKILL_CLEAN =
    '**Emit the reachability criterion into the Definition of Done.** It holds on every change type, ' +
    'including a refactor. Emit a `Reachable:` criterion, or `Reachable: none` carrying the reason.\n';

  assert.equal(
    scanContract(
      fixture({
        'references/plan-contract.md': RC_PLAN_CONTRACT_CLEAN,
        'skills/plan/SKILL.md': RC_PLAN_SKILL_CLEAN,
      }),
      REACHABLE_CRITERION_CONTRACTS,
    ).length,
    0,
    'both halves carried yields zero gaps',
  );

  // positive: the token is renamed on the reference only — plan-contract.md now leads with `Ready:`,
  // while skills/plan/SKILL.md still emits the old `Reachable:` token
  const rcRefRenamed = scanContract(
    fixture({
      'references/plan-contract.md':
        '### The reachability criterion\n\n' +
        "Every feature's Definition of Done carries at least one criterion **led by `Ready:`**, naming " +
        'what it reaches.\n\n' +
        'The rule holds on **every change type**, including a behaviour-preserving refactor.\n',
      'skills/plan/SKILL.md': RC_PLAN_SKILL_CLEAN,
    }),
    REACHABLE_CRITERION_CONTRACTS,
  );
  assert.equal(rcRefRenamed.length, 1, 'flags the reference renaming the token while the surface still emits the old one');
  assert.equal(rcRefRenamed[0].source, path.join('references', 'plan-contract.md'), 'names plan-contract.md');

  // positive: the token is renamed on the surface only — skills/plan/SKILL.md now emits `Ready:`
  // criteria, while plan-contract.md still names `Reachable:` as the token
  const rcSurfaceRenamed = scanContract(
    fixture({
      'references/plan-contract.md': RC_PLAN_CONTRACT_CLEAN,
      'skills/plan/SKILL.md':
        '**Emit the reachability criterion into the Definition of Done.** It holds on every change type, ' +
        'including a refactor. Emit a `Ready:` criterion, or `Ready: none` carrying the reason.\n',
    }),
    REACHABLE_CRITERION_CONTRACTS,
  );
  assert.equal(rcSurfaceRenamed.length, 1, 'flags the surface renaming the token while the reference still names the old one');
  assert.equal(rcSurfaceRenamed[0].source, path.join('skills', 'plan', 'SKILL.md'), 'names skills/plan/SKILL.md');

  // positive: the every-change-type clause is dropped from the reference — plan-contract.md no longer
  // states the rule holds on every change type
  const rcRefClauseDropped = scanContract(
    fixture({
      'references/plan-contract.md':
        '### The reachability criterion\n\n' +
        "Every feature's Definition of Done carries at least one criterion **led by `Reachable:`**, naming " +
        'what it reaches.\n',
      'skills/plan/SKILL.md': RC_PLAN_SKILL_CLEAN,
    }),
    REACHABLE_CRITERION_CONTRACTS,
  );
  assert.equal(rcRefClauseDropped.length, 1, 'flags the reference dropping its own every-change-type clause');
  assert.equal(rcRefClauseDropped[0].source, path.join('references', 'plan-contract.md'), 'names plan-contract.md');

  // positive: the every-change-type clause is dropped from the surface — skills/plan/SKILL.md no longer
  // states the clause on its own
  const rcSurfaceClauseDropped = scanContract(
    fixture({
      'references/plan-contract.md': RC_PLAN_CONTRACT_CLEAN,
      'skills/plan/SKILL.md':
        '**Emit the reachability criterion into the Definition of Done.** Emit a `Reachable:` criterion, ' +
        'or `Reachable: none` carrying the reason.\n',
    }),
    REACHABLE_CRITERION_CONTRACTS,
  );
  assert.equal(rcSurfaceClauseDropped.length, 1, 'flags the surface dropping its own every-change-type clause');
  assert.equal(rcSurfaceClauseDropped[0].source, path.join('skills', 'plan', 'SKILL.md'), 'names skills/plan/SKILL.md');

  // negative: the real tree carries both halves
  assert.equal(scanContract(realRoot, REACHABLE_CRITERION_CONTRACTS).length, 0, 'the shipped rule and surface agree');

  // --- REVIEW_RANGE_SHAPES_CONTRACTS: the review surface that emits the standing-code range shape
  // (skills/review/SKILL.md) and the reviewer brief that has to accept a subject with no diff behind it
  // (agents/final-reviewer.md) agree on the shape and on the count (ADR 0063) ---

  const RRS_DISPATCH_CLAUSE_CLEAN =
    "- **`superdev:final-reviewer`** Give it the git range — on a standing-code target, the path and its " +
    'file set at `HEAD` in place of a range, with the summary derived from that file set.\n';
  const RRS_UNTRACKED_CLEAN =
    '**Include untracked files before resolving the range below.** Stage them with `git add -N .` first.\n\n' +
    '- **Range** — whatever remains, resolved to a concrete git range:\n';
  const RRS_REVIEW_CLEAN =
    RRS_UNTRACKED_CLEAN +
    '- **Standing code** — a path whose scoped diff comes back empty resolves to the files under it at ' +
    '`HEAD`. The path holds no files → say there is nothing to review and dispatch nobody.\n' +
    '- **A standing-code target** → skip `simplicity-reviewer`, which is diff-only.\n' +
    RRS_DISPATCH_CLAUSE_CLEAN;
  const RRS_FINAL_CLEAN =
    "- **Range**: `skills/review/SKILL.md`'s §1 resolves it to one of four shapes, the fourth being " +
    'standing code — a path whose scoped diff is empty, handed to you as a file set at `HEAD`.\n';

  assert.equal(
    scanContract(
      fixture({
        'skills/review/SKILL.md': RRS_REVIEW_CLEAN,
        'agents/final-reviewer.md': RRS_FINAL_CLEAN,
      }),
      REVIEW_RANGE_SHAPES_CONTRACTS,
    ).length,
    0,
    'both halves carried yields zero gaps',
  );

  // positive: the surface emits the shape and the brief still counts three — the one-sided pin this
  // check exists to catch, where each document reads correct on its own
  const rrsBriefBehind = scanContract(
    fixture({
      'skills/review/SKILL.md': RRS_REVIEW_CLEAN,
      'agents/final-reviewer.md':
        "- **Range**: `skills/review/SKILL.md`'s §1 resolves it to one of three shapes: a commit range, " +
        'a working-tree scope, or a path scope.\n',
    }),
    REVIEW_RANGE_SHAPES_CONTRACTS,
  );
  assert.equal(rrsBriefBehind.length, 2, 'flags both the stale count and the unnamed shape');
  assert.deepEqual(
    rrsBriefBehind.map((gap) => gap.source),
    [path.join('agents', 'final-reviewer.md'), path.join('agents', 'final-reviewer.md')],
    'names final-reviewer.md for both',
  );

  // positive: the reverse direction — the brief names a shape the surface no longer emits
  const rrsSurfaceBehind = scanContract(
    fixture({
      'skills/review/SKILL.md':
        RRS_UNTRACKED_CLEAN +
        '- **A path/area** → the diff of the current branch vs base, scoped to that path.\n' +
        '- **A standing-code target** → skip `simplicity-reviewer`, which is diff-only.\n' +
        'There is nothing to review on an empty set.\n' +
        RRS_DISPATCH_CLAUSE_CLEAN,
      'agents/final-reviewer.md': RRS_FINAL_CLEAN,
    }),
    REVIEW_RANGE_SHAPES_CONTRACTS,
  );
  assert.equal(rrsSurfaceBehind.length, 1, 'flags the surface dropping the shape the brief still names');
  assert.equal(
    rrsSurfaceBehind[0].source,
    path.join('skills', 'review', 'SKILL.md'),
    'names skills/review/SKILL.md',
  );

  // positive: the simplicity-reviewer skip is dropped, so the diff-only reviewer is dispatched at a file set
  const rrsSkipDropped = scanContract(
    fixture({
      'skills/review/SKILL.md':
        RRS_UNTRACKED_CLEAN +
        '- **Standing code** — a path whose scoped diff comes back empty resolves to the files under it ' +
        'at `HEAD`. The path holds no files → say there is nothing to review and dispatch nobody.\n' +
        RRS_DISPATCH_CLAUSE_CLEAN,
      'agents/final-reviewer.md': RRS_FINAL_CLEAN,
    }),
    REVIEW_RANGE_SHAPES_CONTRACTS,
  );
  assert.equal(rrsSkipDropped.length, 1, 'flags the dropped simplicity-reviewer skip');
  assert.equal(
    rrsSkipDropped[0].source,
    path.join('skills', 'review', 'SKILL.md'),
    'names skills/review/SKILL.md',
  );

  // positive: the standing-code bullet's body is reversed to dispatch both reviewers, but a *later*
  // bullet (Tiny diff) still carries the literal `skip \`simplicity-reviewer\`` text — the weakened-body
  // path an unbounded capture crosses into and reads as still-satisfied (Finding 2, ADR 0063)
  const rrsSkipWeakened = scanContract(
    fixture({
      'skills/review/SKILL.md':
        RRS_UNTRACKED_CLEAN +
        '- **Standing code** — a path whose scoped diff comes back empty resolves to the files under it ' +
        'at `HEAD`. The path holds no files → say there is nothing to review and dispatch nobody.\n' +
        RRS_DISPATCH_CLAUSE_CLEAN +
        "- **A standing-code target** (§1's fourth shape) → dispatch BOTH reviewers,\n" +
        '  reporting `` not dispatched — standing code, no diff to review ``. It is diff-only by its core\n' +
        '  contract and its tags target the production lines a change introduced, so a file set at ' +
        '`HEAD` gives it\n' +
        "  nothing to work from. The checklist's own over-engineering lenses still reach this target, " +
        'through\n' +
        '  `final-reviewer`.\n' +
        '- **Tiny diff** (a handful of lines) → `final-reviewer` alone; skip `simplicity-reviewer`.\n',
      'agents/final-reviewer.md': RRS_FINAL_CLEAN,
    }),
    REVIEW_RANGE_SHAPES_CONTRACTS,
  );
  assert.equal(
    rrsSkipWeakened.length,
    1,
    'flags the reversed standing-code bullet even though a later bullet still carries the skip',
  );
  assert.equal(
    rrsSkipWeakened[0].source,
    path.join('skills', 'review', 'SKILL.md'),
    'names skills/review/SKILL.md',
  );

  // positive: §2's dispatch sentence never grew the standing-code clause, so it would still hand a git
  // range on a target that has none (Finding 1, ADR 0063)
  const rrsDispatchClauseMissing = scanContract(
    fixture({
      'skills/review/SKILL.md': RRS_REVIEW_CLEAN.replace(RRS_DISPATCH_CLAUSE_CLEAN, ''),
      'agents/final-reviewer.md': RRS_FINAL_CLEAN,
    }),
    REVIEW_RANGE_SHAPES_CONTRACTS,
  );
  assert.equal(
    rrsDispatchClauseMissing.length,
    1,
    'flags the dispatch sentence with no standing-code clause',
  );
  assert.equal(
    rrsDispatchClauseMissing[0].source,
    path.join('skills', 'review', 'SKILL.md'),
    'names skills/review/SKILL.md',
  );

  // positive: the untracked-files staging clause is dropped entirely, so a path scope diffed against
  // `HEAD` can still miss a brand-new untracked file (second whole-scope review, finding 1)
  const rrsUntrackedClauseMissing = scanContract(
    fixture({
      'skills/review/SKILL.md': RRS_REVIEW_CLEAN.replace(RRS_UNTRACKED_CLEAN, ''),
      'agents/final-reviewer.md': RRS_FINAL_CLEAN,
    }),
    REVIEW_RANGE_SHAPES_CONTRACTS,
  );
  assert.equal(rrsUntrackedClauseMissing.length, 1, 'flags the removed untracked-files staging clause');
  assert.equal(
    rrsUntrackedClauseMissing[0].source,
    path.join('skills', 'review', 'SKILL.md'),
    'names skills/review/SKILL.md',
  );

  // positive: the untracked-files staging clause still exists, but sits *after* the `- **Range**` bullet
  // it must precede — the original defect, where a path scope's scoped diff is resolved before staging
  // ever runs and an untracked-only path falls through to the standing-code shape (second whole-scope
  // review, finding 1)
  const rrsUntrackedOrderWrong = scanContract(
    fixture({
      'skills/review/SKILL.md':
        '- **Range** — whatever remains, resolved to a concrete git range:\n' +
        '- **Standing code** — a path whose scoped diff comes back empty resolves to the files under it ' +
        'at `HEAD`. The path holds no files → say there is nothing to review and dispatch nobody.\n' +
        '- **A standing-code target** → skip `simplicity-reviewer`, which is diff-only.\n' +
        RRS_DISPATCH_CLAUSE_CLEAN +
        '**Include untracked files before resolving the range below.** Stage them with `git add -N .` ' +
        'first.\n',
      'agents/final-reviewer.md': RRS_FINAL_CLEAN,
    }),
    REVIEW_RANGE_SHAPES_CONTRACTS,
  );
  assert.equal(
    rrsUntrackedOrderWrong.length,
    1,
    'flags the staging clause sitting after the range bullet it must precede',
  );
  assert.equal(
    rrsUntrackedOrderWrong[0].source,
    path.join('skills', 'review', 'SKILL.md'),
    'names skills/review/SKILL.md',
  );

  // positive: the dispatch clause moves out of the `superdev:final-reviewer` bullet into an unrelated
  // spot later in the document — the phrase still appears somewhere in SKILL.md, which is exactly what a
  // document-scoped pattern would miss (second whole-scope review, finding 2)
  const rrsDispatchClauseMovedOut = scanContract(
    fixture({
      'skills/review/SKILL.md':
        RRS_REVIEW_CLEAN.replace(
          RRS_DISPATCH_CLAUSE_CLEAN,
          "- **`superdev:final-reviewer`** Give it the git range.\n" +
            "- **`superdev:simplicity-reviewer`** Give it the same git range.\n" +
            'Elsewhere, unrelated to that bullet: the path and its file set at `HEAD` in place of a range ' +
            'is mentioned here.\n',
        ),
      'agents/final-reviewer.md': RRS_FINAL_CLEAN,
    }),
    REVIEW_RANGE_SHAPES_CONTRACTS,
  );
  assert.equal(
    rrsDispatchClauseMovedOut.length,
    1,
    'flags the clause moved out of the final-reviewer dispatch bullet even though the phrase still appears elsewhere',
  );
  assert.equal(
    rrsDispatchClauseMovedOut[0].source,
    path.join('skills', 'review', 'SKILL.md'),
    'names skills/review/SKILL.md',
  );

  // negative: the real tree carries both halves
  assert.equal(scanContract(realRoot, REVIEW_RANGE_SHAPES_CONTRACTS).length, 0, 'the shipped surface and brief agree');

  // --- EMPTY_ARGUMENT_CONTRACTS: `references/scope-mode.md` owns the shared empty-argument cascade once,
  // and `skills/review/SKILL.md` cites it for its own cascade and states its own dirty-tree precedence
  // rather than restating either in its own words (ADR 0078) ---

  const EA_SCOPE_MODE_CLEAN = '## Resolving an empty argument\n\nExactly one candidate is used.\n';
  const EA_REVIEW_CLEAN =
    "A dirty working tree is reviewed as it always was. Otherwise run `references/scope-mode.md`'s " +
    '`## Resolving an empty argument` cascade.\n\n' +
    '- A path/area resolves to a diff.\n' +
    "- **Standing code** — that same path. A **fallback, never a replacement** — a path with a non-empty " +
    'scoped diff resolves to that diff exactly as it does above.\n' +
    "- **A scope slug** — reached only once the four shapes above all fail. **No such line, or the named " +
    "branch does not verify** → take `## The scope branch`\n" +
    'shape-scan fallback and say which route was taken.\n';

  assert.equal(
    scanContract(
      fixture({
        'references/scope-mode.md': EA_SCOPE_MODE_CLEAN,
        'skills/review/SKILL.md': EA_REVIEW_CLEAN,
      }),
      EMPTY_ARGUMENT_CONTRACTS,
    ).length,
    0,
    'both halves carried yields zero gaps',
  );

  // positive: the section heading is dropped from scope-mode.md
  const eaSectionDropped = scanContract(
    fixture({
      'references/scope-mode.md': 'No such section here.\n',
      'skills/review/SKILL.md': EA_REVIEW_CLEAN,
    }),
    EMPTY_ARGUMENT_CONTRACTS,
  );
  assert.equal(eaSectionDropped.length, 1, 'flags the dropped section heading');
  assert.equal(
    eaSectionDropped[0].source,
    path.join('references', 'scope-mode.md'),
    'names references/scope-mode.md',
  );

  const EA_REVIEW_SLUG_TAIL =
    '\n\n' +
    '- A path/area resolves to a diff.\n' +
    "- **Standing code** — that same path. A **fallback, never a replacement** — a path with a non-empty " +
    'scoped diff resolves to that diff exactly as it does above.\n' +
    "- **A scope slug** — reached only once the four shapes above all fail. **No such line, or the named " +
    "branch does not verify** → take `## The scope branch`\n" +
    'shape-scan fallback and say which route was taken.\n';

  // positive: skills/review/SKILL.md drops its citation of the shared section
  const eaCitationDropped = scanContract(
    fixture({
      'references/scope-mode.md': EA_SCOPE_MODE_CLEAN,
      'skills/review/SKILL.md': 'A dirty working tree is reviewed as it always was.\n' + EA_REVIEW_SLUG_TAIL,
    }),
    EMPTY_ARGUMENT_CONTRACTS,
  );
  assert.equal(eaCitationDropped.length, 1, 'flags the dropped citation');
  assert.equal(
    eaCitationDropped[0].source,
    path.join('skills', 'review', 'SKILL.md'),
    'names skills/review/SKILL.md',
  );

  // positive: skills/review/SKILL.md drops its dirty-tree precedence sentence
  const eaPrecedenceDropped = scanContract(
    fixture({
      'references/scope-mode.md': EA_SCOPE_MODE_CLEAN,
      'skills/review/SKILL.md':
        "Run `references/scope-mode.md`'s `## Resolving an empty argument` cascade.\n" + EA_REVIEW_SLUG_TAIL,
    }),
    EMPTY_ARGUMENT_CONTRACTS,
  );
  assert.equal(eaPrecedenceDropped.length, 1, 'flags the dropped dirty-tree precedence sentence');
  assert.equal(
    eaPrecedenceDropped[0].source,
    path.join('skills', 'review', 'SKILL.md'),
    'names skills/review/SKILL.md',
  );

  // positive: the scope-slug resolution is missing entirely
  const eaSlugMissing = scanContract(
    fixture({
      'references/scope-mode.md': EA_SCOPE_MODE_CLEAN,
      'skills/review/SKILL.md':
        "A dirty working tree is reviewed as it always was. Otherwise run `references/scope-mode.md`'s " +
        '`## Resolving an empty argument` cascade.\n',
    }),
    EMPTY_ARGUMENT_CONTRACTS,
  );
  assert.equal(eaSlugMissing.length, 2, 'flags both the missing slug bullet and the missing fallback citation');

  // positive: the scope-slug bullet moved ahead of the four range shapes it must follow
  const eaSlugMovedAhead = scanContract(
    fixture({
      'references/scope-mode.md': EA_SCOPE_MODE_CLEAN,
      'skills/review/SKILL.md':
        "- **A scope slug** — reached only once the four shapes above all fail. **No such line, or the " +
        "named branch does not verify** → take `## The scope branch`\nshape-scan fallback and say which " +
        'route was taken.\n' +
        "A dirty working tree is reviewed as it always was. Otherwise run `references/scope-mode.md`'s " +
        '`## Resolving an empty argument` cascade.\n\n' +
        '- A path/area resolves to a diff.\n' +
        "- **Standing code** — that same path. A **fallback, never a replacement** — a path with a " +
        'non-empty scoped diff resolves to that diff exactly as it does above.\n',
    }),
    EMPTY_ARGUMENT_CONTRACTS,
  );
  assert.equal(eaSlugMovedAhead.length, 1, 'flags the slug bullet moved ahead of the range shapes it must follow');

  // positive: skills/ship/SKILL.md drops its citation and its own candidate-set sentence
  const eaShipMissing = scanContract(
    fixture({ 'skills/ship/SKILL.md': 'Resolve the run root some other way.\n' }),
    EMPTY_ARGUMENT_CONTRACTS,
  );
  assert.equal(eaShipMissing.length, 2, 'flags both the missing citation and the missing candidate-set sentence');
  assert.deepEqual(
    eaShipMissing.map((gap) => gap.source),
    [path.join('skills', 'ship', 'SKILL.md'), path.join('skills', 'ship', 'SKILL.md')],
    'names skills/ship/SKILL.md for both',
  );

  // negative: skills/ship/SKILL.md carries both
  assert.equal(
    scanContract(
      fixture({
        'skills/ship/SKILL.md':
          "The candidate set is every run root whose stage is not `shipped`. Run `## Resolving an empty " +
          "argument`.\n",
      }),
      EMPTY_ARGUMENT_CONTRACTS,
    ).length,
    0,
    'both halves carried yields zero gaps',
  );

  // positive: skills/implement/SKILL.md drops its citation and its own candidate-set sentence
  const eaImplementMissing = scanContract(
    fixture({ 'skills/implement/SKILL.md': 'Resolve the feature some other way.\n' }),
    EMPTY_ARGUMENT_CONTRACTS,
  );
  assert.equal(eaImplementMissing.length, 2, 'flags both the missing citation and the missing candidate-set sentence');
  assert.deepEqual(
    eaImplementMissing.map((gap) => gap.source),
    [path.join('skills', 'implement', 'SKILL.md'), path.join('skills', 'implement', 'SKILL.md')],
    'names skills/implement/SKILL.md for both',
  );

  // negative: skills/implement/SKILL.md carries both
  assert.equal(
    scanContract(
      fixture({
        'skills/implement/SKILL.md':
          "The candidate set is the features whose slices are ready. Run `## Resolving an empty argument`.\n",
      }),
      EMPTY_ARGUMENT_CONTRACTS,
    ).length,
    0,
    'both halves carried yields zero gaps',
  );

  // negative: the real tree carries every half
  assert.equal(scanContract(realRoot, EMPTY_ARGUMENT_CONTRACTS).length, 0, 'the shipped section and its citations agree');

  // --- AGENT_LENS_LIST_CONTRACTS + scanAgentLensNoDesignSmell: each reviewer agent reads its own named
  // lens list off review-checklist.md, and slice-reviewer.md carries no design-smell token that would
  // widen its list in place (ADR 0062) ---

  const ALL_SLICE_CLEAN =
    'Read the checklist and apply its **anti-pattern** and **vulnerability-class**\n' +
    'lenses throughout the checks below.\n';
  const ALL_FINAL_CLEAN =
    'Read the checklist and apply its anti-pattern, design-smell,\n' +
    'vulnerability-class, reuse-audit, and consistency lenses throughout the checks below.\n';

  assert.equal(
    scanContract(
      fixture({ 'agents/slice-reviewer.md': ALL_SLICE_CLEAN, 'agents/final-reviewer.md': ALL_FINAL_CLEAN }),
      AGENT_LENS_LIST_CONTRACTS,
    ).length,
    0,
    'both lens lists carried yields zero gaps',
  );

  // positive: slice-reviewer.md's lens sentence narrowed in place — vulnerability-class dropped
  const allSliceNarrowed = scanContract(
    fixture({
      'agents/slice-reviewer.md': 'Read the checklist and apply its **anti-pattern**\nlens throughout the checks below.\n',
      'agents/final-reviewer.md': ALL_FINAL_CLEAN,
    }),
    AGENT_LENS_LIST_CONTRACTS,
  );
  assert.equal(allSliceNarrowed.length, 1, 'flags the narrowed slice-reviewer lens sentence');
  assert.equal(allSliceNarrowed[0].source, path.join('agents', 'slice-reviewer.md'), 'names slice-reviewer.md');

  // positive: slice-reviewer.md's lens sentence widened in place — design-smell folded into the same
  // sentence rather than appended as a separate one
  const allSliceWidened = scanContract(
    fixture({
      'agents/slice-reviewer.md':
        'Read the checklist and apply its **anti-pattern**, design-smell, and **vulnerability-class**\n' +
        'lenses throughout the checks below.\n',
      'agents/final-reviewer.md': ALL_FINAL_CLEAN,
    }),
    AGENT_LENS_LIST_CONTRACTS,
  );
  assert.equal(allSliceWidened.length, 1, 'flags the widened slice-reviewer lens sentence');
  assert.equal(allSliceWidened[0].source, path.join('agents', 'slice-reviewer.md'), 'names slice-reviewer.md');

  // positive: final-reviewer.md's lens sentence altered — reuse-audit dropped from the list
  const allFinalAltered = scanContract(
    fixture({
      'agents/slice-reviewer.md': ALL_SLICE_CLEAN,
      'agents/final-reviewer.md':
        'Read the checklist and apply its anti-pattern, design-smell,\nvulnerability-class, and consistency lenses throughout the checks below.\n',
    }),
    AGENT_LENS_LIST_CONTRACTS,
  );
  assert.equal(allFinalAltered.length, 1, 'flags the altered final-reviewer lens sentence');
  assert.equal(allFinalAltered[0].source, path.join('agents', 'final-reviewer.md'), 'names final-reviewer.md');

  // negative: the real tree carries both lists
  assert.equal(scanContract(realRoot, AGENT_LENS_LIST_CONTRACTS).length, 0, 'the shipped lens lists are clean');

  // scanAgentLensNoDesignSmell(): slice-reviewer.md carries no `design-smell` / `design smell` token
  // anywhere, in either spelling, case-insensitively — negative check closing the one-sided-pin gap the
  // sentence rows above cannot (a sentence appended elsewhere in the file, naming the token, still
  // leaves the pinned sentence untouched)

  assert.equal(
    scanAgentLensNoDesignSmell(fixture({ 'agents/slice-reviewer.md': ALL_SLICE_CLEAN })).length,
    0,
    'a slice-reviewer.md with no design-smell token is clean',
  );

  // positive: the hyphenated token appears, case-insensitively, anywhere in the file
  const dsHyphenGaps = scanAgentLensNoDesignSmell(
    fixture({
      'agents/slice-reviewer.md': `${ALL_SLICE_CLEAN}\nAlso apply the Design-Smell lens.\n`,
    }),
  );
  assert.equal(dsHyphenGaps.length, 1, 'flags a literal `design-smell` token appended anywhere in the file');
  assert.equal(dsHyphenGaps[0].source, path.join('agents', 'slice-reviewer.md'), 'names slice-reviewer.md');

  // positive: the space-separated form counts too — the marker is case-insensitive and covers both spellings
  const dsSpaceGaps = scanAgentLensNoDesignSmell(
    fixture({
      'agents/slice-reviewer.md': `${ALL_SLICE_CLEAN}\nAlso apply the design smell lens.\n`,
    }),
  );
  assert.equal(dsSpaceGaps.length, 1, 'flags a `design smell` (space form) token appended anywhere in the file');
  assert.equal(dsSpaceGaps[0].source, path.join('agents', 'slice-reviewer.md'), 'names slice-reviewer.md');

  // absent document is skipped, matching every other scanDocsAvoid consumer
  assert.equal(
    scanAgentLensNoDesignSmell(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'no slice-reviewer.md is skipped',
  );

  // negative: the real tree carries no design-smell token in slice-reviewer.md
  assert.equal(scanAgentLensNoDesignSmell(realRoot).length, 0, 'the shipped slice-reviewer.md is clean');

  // --- scanOrphanLensPlacement: the orphan production symbol lens sits under `## Design smells` (the
  // section `final-reviewer` reads and `slice-reviewer` does not), carries its own scoping clause, and
  // never also sits under `## Anti-patterns` (ADR 0062) ---

  const OL_CLEAN = fixture({
    'references/review-checklist.md':
      '## Anti-patterns\n\n- **Parameter sprawl** — too many params.\n\n' +
      '## Design smells\n\n' +
      '- **Mysterious name** — a name that requires reading the body to learn what it does.\n' +
      '- **Orphan production symbol** — a new production symbol the running application cannot reach. ' +
      '`final-reviewer` owns this on the integrated scope: one slice diff cannot tell an orphan from a ' +
      'caller that arrives in a later slice.\n\n' +
      '## Vulnerability classes\n\n- **SQL injection** — unparameterized query.\n',
  });
  assert.equal(scanOrphanLensPlacement(OL_CLEAN).length, 0, 'the shipped placement is clean');

  // positive: the entry is absent from `## Design smells` entirely
  const OL_ABSENT = fixture({
    'references/review-checklist.md':
      '## Anti-patterns\n\n- **Parameter sprawl** — too many params.\n\n' +
      '## Design smells\n\n' +
      '- **Mysterious name** — a name that requires reading the body to learn what it does.\n\n' +
      '## Vulnerability classes\n\n- **SQL injection** — unparameterized query.\n',
  });
  const olAbsentGaps = scanOrphanLensPlacement(OL_ABSENT);
  assert.equal(olAbsentGaps.length, 1, 'flags the entry missing from `## Design smells`');
  assert.match(olAbsentGaps[0].expectation, /under `## Design smells`/, 'names the missing section');

  // positive: the entry sits under `## Design smells` but also under `## Anti-patterns`
  const OL_DUPLICATED = fixture({
    'references/review-checklist.md':
      '## Anti-patterns\n\n- **Parameter sprawl** — too many params.\n' +
      '- **Orphan production symbol** — a new production symbol the running application cannot reach.\n\n' +
      '## Design smells\n\n' +
      '- **Orphan production symbol** — a new production symbol the running application cannot reach. ' +
      '`final-reviewer` owns this on the integrated scope: one slice diff cannot tell an orphan from a ' +
      'caller that arrives in a later slice.\n\n' +
      '## Vulnerability classes\n\n- **SQL injection** — unparameterized query.\n',
  });
  const olDupGaps = scanOrphanLensPlacement(OL_DUPLICATED);
  assert.equal(olDupGaps.length, 1, 'flags the entry also present under `## Anti-patterns`');
  assert.match(olDupGaps[0].expectation, /out of `## Anti-patterns`/, 'names the section to drop it from');

  // positive: the same duplicate, but under an `### Anti-patterns` (level-3) heading — proves the
  // `#{2,3}` widening in ORPHAN_LENS_ANTIPATTERN_HEADING actually catches it, not just `##`
  const OL_DUPLICATED_H3 = fixture({
    'references/review-checklist.md':
      '### Anti-patterns\n\n- **Parameter sprawl** — too many params.\n' +
      '- **Orphan production symbol** — a new production symbol the running application cannot reach.\n\n' +
      '## Design smells\n\n' +
      '- **Orphan production symbol** — a new production symbol the running application cannot reach. ' +
      '`final-reviewer` owns this on the integrated scope: one slice diff cannot tell an orphan from a ' +
      'caller that arrives in a later slice.\n\n' +
      '## Vulnerability classes\n\n- **SQL injection** — unparameterized query.\n',
  });
  const olDupH3Gaps = scanOrphanLensPlacement(OL_DUPLICATED_H3);
  assert.equal(olDupH3Gaps.length, 1, 'flags the entry also present under `### Anti-patterns`');
  assert.match(olDupH3Gaps[0].expectation, /out of `## Anti-patterns`/, 'names the section to drop it from');

  // positive: `## Anti-patterns` is absent (renamed or removed) — this must fail loud, not skip
  // silently the way it did before the duplicate check gained an explicit absent-section gap
  const OL_ANTIPATTERNS_ABSENT = fixture({
    'references/review-checklist.md':
      '## Not Anti-patterns\n\n- **Parameter sprawl** — too many params.\n\n' +
      '## Design smells\n\n' +
      '- **Orphan production symbol** — a new production symbol the running application cannot reach. ' +
      '`final-reviewer` owns this on the integrated scope: one slice diff cannot tell an orphan from a ' +
      'caller that arrives in a later slice.\n\n' +
      '## Vulnerability classes\n\n- **SQL injection** — unparameterized query.\n',
  });
  const olAntiAbsentGaps = scanOrphanLensPlacement(OL_ANTIPATTERNS_ABSENT);
  assert.equal(olAntiAbsentGaps.length, 1, 'flags the missing `## Anti-patterns` section instead of skipping the duplicate check silently');
  assert.match(olAntiAbsentGaps[0].expectation, /carry an `## Anti-patterns`/, 'names the missing section');

  // positive: the scope clause is reworded so it no longer matches
  const OL_UNSCOPED = fixture({
    'references/review-checklist.md':
      '## Anti-patterns\n\n- **Parameter sprawl** — too many params.\n\n' +
      '## Design smells\n\n' +
      '- **Orphan production symbol** — a new production symbol the running application cannot reach. ' +
      '`final-reviewer` owns this on the integrated scope; a per-slice review may report it too early.\n\n' +
      '## Vulnerability classes\n\n- **SQL injection** — unparameterized query.\n',
  });
  const olUnscopedGaps = scanOrphanLensPlacement(OL_UNSCOPED);
  assert.equal(olUnscopedGaps.length, 1, 'flags the reworded scope clause');
  assert.match(olUnscopedGaps[0].expectation, /own wording/, 'names the missing scoping clause');

  // --- scanTestCostLensPlacement: *dead test* and *expensive test* sit under `## Test cost`, the
  // section only `test-auditor` reads, and never under `## Anti-patterns`, which `slice-reviewer`
  // reads and which holds no measured duration to judge either one by (ADR 0066) ---

  const TC_SECTIONS =
    '## Anti-patterns\n\n- **Parameter sprawl** — too many params.\n\n' +
    '## Test cost\n\n' +
    '- **Dead test** — a test whose subject is gone, or which the runner skips.\n' +
    '- **Expensive test** — a test whose measured duration is out of proportion to what it proves.\n\n' +
    '## Vulnerability classes\n\n- **SQL injection** — unparameterized query.\n';
  assert.equal(
    scanTestCostLensPlacement(fixture({ 'references/review-checklist.md': TC_SECTIONS })).length,
    0,
    'the shipped test-cost placement is clean',
  );

  // positive: the section is absent entirely — the lenses reach no reader at all
  const tcAbsentGaps = scanTestCostLensPlacement(
    fixture({
      'references/review-checklist.md':
        '## Anti-patterns\n\n- **Parameter sprawl** — too many params.\n\n' +
        '## Vulnerability classes\n\n- **SQL injection** — unparameterized query.\n',
    }),
  );
  assert.equal(tcAbsentGaps.length, 2, 'flags both lenses missing from `## Test cost`');
  assert.match(tcAbsentGaps[0].expectation, /under `## Test cost`/, 'names the missing section');

  // positive: one lens moved into `## Anti-patterns`, where `slice-reviewer` would read it
  const tcMovedGaps = scanTestCostLensPlacement(
    fixture({
      'references/review-checklist.md':
        '## Anti-patterns\n\n- **Parameter sprawl** — too many params.\n' +
        '- **Expensive test** — a test whose measured duration is out of proportion to what it proves.\n\n' +
        '## Test cost\n\n' +
        '- **Dead test** — a test whose subject is gone, or which the runner skips.\n\n' +
        '## Vulnerability classes\n\n- **SQL injection** — unparameterized query.\n',
    }),
  );
  assert.equal(tcMovedGaps.length, 2, 'flags the moved lens as both missing from `## Test cost` and present in `## Anti-patterns`');
  assert.ok(
    tcMovedGaps.some((g) => /out of `## Anti-patterns`/.test(g.expectation)),
    'names the section to drop it from',
  );

  // positive: `## Anti-patterns` renamed away — the duplicate check must fail loud, not skip silently
  const tcAntiAbsentGaps = scanTestCostLensPlacement(
    fixture({ 'references/review-checklist.md': TC_SECTIONS.replace('## Anti-patterns', '## Not Anti-patterns') }),
  );
  assert.equal(tcAntiAbsentGaps.length, 1, 'flags the missing `## Anti-patterns` section');
  assert.match(tcAntiAbsentGaps[0].expectation, /carry an `## Anti-patterns`/, 'names the missing section');

  // negative: the real tree's own checklist places both lenses correctly
  assert.equal(scanTestCostLensPlacement(realRoot).length, 0, 'the shipped review-checklist.md is clean');

  // absent document is skipped, matching every other contract scanner
  assert.equal(
    scanTestCostLensPlacement(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'no review-checklist.md is skipped',
  );

  // negative: the real tree carries the placement correctly
  assert.equal(scanOrphanLensPlacement(realRoot).length, 0, 'the shipped placement is clean');

  // --- STANDING_CODE_LENS_CONTRACTS: final-reviewer.md's Brevity axis and review-checklist.md's
  // Cross-slice divergence bullet each carry their own standing-code reading, since neither's
  // slice-scoped wording is true of a target with no slices at all ---

  const SCL_FINAL_CLEAN =
    '**Brevity (whole-scope)** — flag duplication across slices. **On standing code** — no slices to ' +
    'span — flag that same class within\nthe code itself instead: the same logic implemented twice.\n';
  const SCL_CHECKLIST_CLEAN =
    '- **Cross-slice divergence** — the same concept given a different name across slices. On standing ' +
    'code, with no slices to compare, this reads\nas a divergent second way to do one job living inside ' +
    'the code itself.\n';

  assert.equal(
    scanContract(
      fixture({
        'agents/final-reviewer.md': SCL_FINAL_CLEAN,
        'references/review-checklist.md': SCL_CHECKLIST_CLEAN,
      }),
      STANDING_CODE_LENS_CONTRACTS,
    ).length,
    0,
    'both standing-code readings carried yields zero gaps',
  );

  // positive: final-reviewer.md's Brevity axis loses its standing-code reading, leaving the axis silent
  // on a target with no slices
  const sclFinalDropped = scanContract(
    fixture({
      'agents/final-reviewer.md': '**Brevity (whole-scope)** — flag duplication across slices.\n',
      'references/review-checklist.md': SCL_CHECKLIST_CLEAN,
    }),
    STANDING_CODE_LENS_CONTRACTS,
  );
  assert.equal(sclFinalDropped.length, 1, 'flags the dropped Brevity standing-code reading');
  assert.equal(sclFinalDropped[0].source, path.join('agents', 'final-reviewer.md'), 'names final-reviewer.md');

  // positive: review-checklist.md's Cross-slice divergence bullet loses its standing-code reading
  const sclChecklistDropped = scanContract(
    fixture({
      'agents/final-reviewer.md': SCL_FINAL_CLEAN,
      'references/review-checklist.md':
        '- **Cross-slice divergence** — the same concept given a different name across slices.\n',
    }),
    STANDING_CODE_LENS_CONTRACTS,
  );
  assert.equal(sclChecklistDropped.length, 1, 'flags the dropped Cross-slice divergence standing-code reading');
  assert.equal(
    sclChecklistDropped[0].source,
    path.join('references', 'review-checklist.md'),
    'names review-checklist.md',
  );

  // negative: the real tree carries both standing-code readings
  assert.equal(
    scanContract(realRoot, STANDING_CODE_LENS_CONTRACTS).length,
    0,
    'the shipped readings are both carried',
  );

  // --- CHAINED_DOC_AUDIT_CONTRACTS: `/superdev:document audit` still names `--chained`, the signal a
  // sweep passes its doc leg, and still dispatches no doc-writer and commits nothing once it is present ---

  const CDA_CLEAN =
    '**`--chained`, if present, comes out the same way** — never part of the range or the area path ' +
    'either. It signals that `/superdev:sweep` dispatched this run as its doc leg, in the **chained ' +
    'posture** CONTEXT.md (ADR 0068).\n\n' +
    "3. **`--chained` present** — this run is `/superdev:sweep`'s doc leg, in the **chained posture**\n" +
    '   (CONTEXT.md, ADR 0068). Dispatch no `doc-writer` and commit nothing, whatever the reader found. ' +
    'Return\n   the reader\'s findings to the caller instead of writing a report file.\n';

  assert.equal(
    scanContract(fixture({ 'skills/document/SKILL.md': CDA_CLEAN }), CHAINED_DOC_AUDIT_CONTRACTS).length,
    0,
    'both the signal and the chained posture carried yields zero gaps',
  );

  // positive: the whole `--chained` signal drops out, taking the posture's own anchor with it
  const cdaSignalDropped = scanContract(
    fixture({ 'skills/document/SKILL.md': CDA_CLEAN.replace(/--chained/g, '') }),
    CHAINED_DOC_AUDIT_CONTRACTS,
  );
  assert.equal(cdaSignalDropped.length, 2, 'flags both rows once every `--chained` mention is gone');

  // positive: the signal stays, but the posture clause is rewritten to dispatch and commit after all
  const cdaPostureDropped = scanContract(
    fixture({
      'skills/document/SKILL.md': CDA_CLEAN.replace(
        'Dispatch no `doc-writer` and commit nothing',
        'Dispatch `doc-writer` and commit the fix',
      ),
    }),
    CHAINED_DOC_AUDIT_CONTRACTS,
  );
  assert.equal(cdaPostureDropped.length, 1, 'flags the dropped chained-posture clause alone');
  assert.equal(cdaPostureDropped[0].source, path.join('skills', 'document', 'SKILL.md'), 'names document.md');

  // negative: the real tree carries both halves
  assert.equal(
    scanContract(realRoot, CHAINED_DOC_AUDIT_CONTRACTS).length,
    0,
    'the shipped doc leg still carries both halves',
  );

  // --- CHAINED_TEST_AUDIT_CONTRACTS: `/superdev:review-tests` still names `--chained`, runs no
  // `AskUserQuestion`, keeps the fact/judgment label, and writes no intent once it is present. Row 4 is
  // anchored on §6's own bolded clause rather than on a `--chained`-then-window match, because an
  // unrelated §1 bullet also pairs `--chained` with "write no intent and print no handoff" within the
  // same window and would otherwise keep a rewritten §6 clause looking carried ---

  const CTA_CLEAN =
    "**`--chained`, if present, comes out of `$ARGUMENTS` first** — never part of the path argument.\n\n" +
    '- **No test files at all** → say so. **`--chained`** → return an empty finding set to the caller ' +
    'instead\n  of blocking the sweep; otherwise write no intent and print no handoff.\n\n' +
    "**`--chained` present** — this run is `/superdev:sweep`'s test leg, in the **chained posture**\n" +
    '(CONTEXT.md, ADR 0068). Run no `AskUserQuestion`; there is no operator turn inside a sweep to run it\n' +
    'against. Label every dead-or-ignored-test finding `fact` and every remaining finding `judgment`, in\n' +
    "§4's own most-cost-first order.\n\n" +
    "**`--chained` present** — write no intent and print no handoff. Return §5's labelled, ranked " +
    'findings to\nthe caller instead.\n';

  assert.equal(
    scanContract(fixture({ 'skills/review-tests/SKILL.md': CTA_CLEAN }), CHAINED_TEST_AUDIT_CONTRACTS).length,
    0,
    'all four chained-posture behaviours carried yields zero gaps',
  );

  // positive: §5's own agreement-round skip is rewritten to still ask
  const ctaRound = scanContract(
    fixture({
      'skills/review-tests/SKILL.md': CTA_CLEAN.replace(
        'Run no `AskUserQuestion`',
        'Run a fresh `AskUserQuestion`',
      ),
    }),
    CHAINED_TEST_AUDIT_CONTRACTS,
  );
  assert.equal(ctaRound.length, 1, 'flags the dropped no-agreement-round clause');

  // positive: the fact/judgment label is dropped
  const ctaLabel = scanContract(
    fixture({
      'skills/review-tests/SKILL.md': CTA_CLEAN.replace(
        'Label every dead-or-ignored-test finding `fact` and every remaining finding `judgment`',
        'Report every finding the same way',
      ),
    }),
    CHAINED_TEST_AUDIT_CONTRACTS,
  );
  assert.equal(ctaLabel.length, 1, 'flags the dropped fact/judgment label');

  // positive (RED-first proof): §6's own clause is rewritten to write after all, while the unrelated §1
  // decoy bullet still pairs `--chained` with "write no intent and print no handoff" a short distance
  // away — the loose `--chained[\s\S]{0,200}write no intent…` shape this replaces stayed green here
  const ctaWriteDropped = scanContract(
    fixture({
      'skills/review-tests/SKILL.md': CTA_CLEAN.replace(
        "**`--chained` present** — write no intent and print no handoff. Return",
        "**`--chained` present** — write the intent and print the handoff. Return",
      ),
    }),
    CHAINED_TEST_AUDIT_CONTRACTS,
  );
  assert.equal(ctaWriteDropped.length, 1, 'flags the rewritten §6 write clause despite the §1 decoy bullet');
  assert.equal(
    ctaWriteDropped[0].source,
    path.join('skills', 'review-tests', 'SKILL.md'),
    'names review-tests SKILL.md',
  );

  // negative: the real tree carries all four behaviours
  assert.equal(
    scanContract(realRoot, CHAINED_TEST_AUDIT_CONTRACTS).length,
    0,
    'the shipped test leg still carries all four behaviours',
  );

  // --- CHAINED_CODE_REVIEW_CONTRACTS: `/superdev:review` still names `--chained`, runs no
  // `git add -N :/` once it is present, and never enters scope mode regardless of the invoking
  // checkout's `HEAD` ---

  const CCR_CLEAN =
    '**`--chained`, if present, comes out the same way** — never part of the range or the trailing ' +
    "description either. It signals that `/superdev:sweep` dispatched this run as its code leg, in the " +
    '**chained posture** (CONTEXT.md, ADR 0068).\n\n' +
    '**`--chained`** → run no `git add -N :/`: standing code reads files at `HEAD`, where an untracked ' +
    'file never appears.\n\n' +
    "- **`--chained` wins over scope mode.** Skip the bullet below entirely: the range resolves ad-hoc, " +
    "whatever the invoking checkout's `HEAD` is.\n";

  assert.equal(
    scanContract(fixture({ 'skills/review/SKILL.md': CCR_CLEAN }), CHAINED_CODE_REVIEW_CONTRACTS).length,
    0,
    'the signal and both chained-posture behaviours carried yields zero gaps',
  );

  // positive: the whole `--chained` signal drops out, taking every anchor with it
  const ccrSignalDropped = scanContract(
    fixture({ 'skills/review/SKILL.md': CCR_CLEAN.replace(/--chained/g, '') }),
    CHAINED_CODE_REVIEW_CONTRACTS,
  );
  assert.equal(ccrSignalDropped.length, 3, 'flags all three rows once every `--chained` mention is gone');

  // positive: the signal stays, but the index-write clause is rewritten to stage after all
  const ccrIndexWrite = scanContract(
    fixture({
      'skills/review/SKILL.md': CCR_CLEAN.replace(
        'run no `git add -N :/`',
        'run `git add -N :/` first',
      ),
    }),
    CHAINED_CODE_REVIEW_CONTRACTS,
  );
  assert.equal(ccrIndexWrite.length, 1, 'flags the dropped no-index-write clause alone');
  assert.equal(ccrIndexWrite[0].source, path.join('skills', 'review', 'SKILL.md'), 'names review SKILL.md');

  // positive: the signal stays, but the scope-mode clause is rewritten to enter scope mode after all
  const ccrScopeMode = scanContract(
    fixture({
      'skills/review/SKILL.md': CCR_CLEAN.replace(
        'Skip the bullet below entirely: the range resolves ad-hoc',
        'Follow the bullet below: the range still resolves as scope mode',
      ),
    }),
    CHAINED_CODE_REVIEW_CONTRACTS,
  );
  assert.equal(ccrScopeMode.length, 1, 'flags the dropped never-enters-scope-mode clause alone');

  // negative: the real tree carries all three behaviours
  assert.equal(
    scanContract(realRoot, CHAINED_CODE_REVIEW_CONTRACTS).length,
    0,
    'the shipped code leg still carries all three behaviours',
  );

  // --- SWEEP_CHAINED_LEG_CONTRACTS: `/superdev:sweep` still dispatches its code, doc, and test legs with
  // `--chained` and its config leg as `/superdev:setup check`. Each row is anchored on §2's dispatch
  // table row, never on the bare invocation string §3's report header also repeats verbatim ---

  const SCL_CLEAN =
    '| Leg | Invocation |\n|---|---|\n' +
    '| Code | `/superdev:review <path> --chained` |\n' +
    '| Docs | `/superdev:document audit --chained` |\n' +
    '| Tests | `/superdev:review-tests <path> --chained` |\n' +
    '| Config | `/superdev:setup check` |\n\n' +
    '### Code — /superdev:review --chained\n' +
    '### Docs — /superdev:document audit --chained\n' +
    '### Tests — /superdev:review-tests --chained\n' +
    '### Config — /superdev:setup check\n';

  assert.equal(
    scanContract(fixture({ 'skills/sweep/SKILL.md': SCL_CLEAN }), SWEEP_CHAINED_LEG_CONTRACTS).length,
    0,
    'all four dispatch-table rows carried yields zero gaps',
  );

  // positive (RED-first proof): the code leg's dispatch-table row drops `--chained`, while §3's report
  // header keeps repeating the flag verbatim — the un-anchored `/\/superdev:review --chained/` this
  // replaces stayed green off that header alone
  const sclCode = scanContract(
    fixture({
      'skills/sweep/SKILL.md': SCL_CLEAN.replace(
        '| Code | `/superdev:review <path> --chained` |',
        '| Code | `/superdev:review <path>` |',
      ),
    }),
    SWEEP_CHAINED_LEG_CONTRACTS,
  );
  assert.equal(sclCode.length, 1, 'flags the code leg dispatch-table row despite the report-header decoy');
  assert.equal(sclCode[0].source, path.join('skills', 'sweep', 'SKILL.md'), 'names sweep SKILL.md');

  // positive (RED-first proof): the doc leg's dispatch-table row drops `--chained`, while §3's report
  // header keeps repeating the flag verbatim — the un-anchored `/\/superdev:document audit --chained/`
  // this replaces stayed green off that header alone
  const sclDoc = scanContract(
    fixture({
      'skills/sweep/SKILL.md': SCL_CLEAN.replace(
        '| Docs | `/superdev:document audit --chained` |',
        '| Docs | `/superdev:document audit` |',
      ),
    }),
    SWEEP_CHAINED_LEG_CONTRACTS,
  );
  assert.equal(sclDoc.length, 1, 'flags the doc leg dispatch-table row despite the report-header decoy');
  assert.equal(sclDoc[0].source, path.join('skills', 'sweep', 'SKILL.md'), 'names sweep SKILL.md');

  // positive: the test leg's dispatch-table row drops `--chained`
  const sclTest = scanContract(
    fixture({
      'skills/sweep/SKILL.md': SCL_CLEAN.replace(
        '| Tests | `/superdev:review-tests <path> --chained` |',
        '| Tests | `/superdev:review-tests <path>` |',
      ),
    }),
    SWEEP_CHAINED_LEG_CONTRACTS,
  );
  assert.equal(sclTest.length, 1, 'flags the test leg dispatch-table row despite the report-header decoy');

  // positive: the config leg's dispatch-table row drops `check`, sending it into the full interview
  const sclConfig = scanContract(
    fixture({
      'skills/sweep/SKILL.md': SCL_CLEAN.replace(
        '| Config | `/superdev:setup check` |',
        '| Config | `/superdev:setup` |',
      ),
    }),
    SWEEP_CHAINED_LEG_CONTRACTS,
  );
  assert.equal(sclConfig.length, 1, 'flags the config leg dispatch-table row losing `check`');

  // negative: the real tree still dispatches all three legs correctly
  assert.equal(
    scanContract(realRoot, SWEEP_CHAINED_LEG_CONTRACTS).length,
    0,
    'the shipped sweep still dispatches all four legs correctly',
  );

  // --- SETUP_CHECK_CONTRACTS: `/superdev:setup` still declares an `argument-hint` naming `check`, and
  // still states that mode's read-only posture ---

  const SETC_CLEAN =
    '---\nname: setup\nargument-hint: "[check | (empty = full interview)]"\n---\n\n' +
    '`$ARGUMENTS` carrying the literal word `check` runs a **read-only drift check** instead of the\n' +
    'interview below — it writes no file, makes no slice-store call, and starts no interview. Skip ' +
    '§1-§4\nentirely.\n';

  assert.equal(
    scanContract(fixture({ 'skills/setup/SKILL.md': SETC_CLEAN }), SETUP_CHECK_CONTRACTS).length,
    0,
    'both the argument-hint and the stated posture carried yields zero gaps',
  );

  // positive: the argument-hint stops naming `check`, stranding the mode behind an unreachable flag
  const setcHint = scanContract(
    fixture({
      'skills/setup/SKILL.md': SETC_CLEAN.replace(
        'argument-hint: "[check | (empty = full interview)]"',
        'argument-hint: "[(empty = full interview)]"',
      ),
    }),
    SETUP_CHECK_CONTRACTS,
  );
  assert.equal(setcHint.length, 1, 'flags the argument-hint that no longer names `check`');

  // positive: the read-only posture is dropped, letting `check` drift into a writing mode
  const setcPosture = scanContract(
    fixture({
      'skills/setup/SKILL.md': SETC_CLEAN.replace(
        'it writes no file, makes no slice-store call, and starts no interview',
        'it writes a short summary',
      ),
    }),
    SETUP_CHECK_CONTRACTS,
  );
  assert.equal(setcPosture.length, 1, 'flags the dropped read-only posture statement');
  assert.equal(setcPosture[0].source, path.join('skills', 'setup', 'SKILL.md'), 'names setup SKILL.md');

  // negative: the real tree carries both halves
  assert.equal(
    scanContract(realRoot, SETUP_CHECK_CONTRACTS).length,
    0,
    'the shipped `check` mode still carries both halves',
  );

  // --- SETUP_CHECK_RULES_CONTRACTS (ADR 0077): `/superdev:setup check` reports a leftover
  // `.claude/rules/` directory, naming `docs/invariants.md` and that the move is by hand ---

  const SETCR_CLEAN =
    'Beyond the six config documents, check for a leftover `.claude/rules/` directory holding at ' +
    'least one `.md` file. Report its path and how many `.md` files it holds, naming ' +
    '`docs/invariants.md` as where the content belongs, and state that the move is by hand: ' +
    '`Class` and `Concepts` are mandatory register fields a glob-scoped rule records nowhere.\n';

  assert.equal(
    scanContract(fixture({ 'skills/setup/SKILL.md': SETCR_CLEAN }), SETUP_CHECK_RULES_CONTRACTS).length,
    0,
    'naming `.claude/rules/`, `docs/invariants.md`, and the by-hand move together yields zero gaps',
  );

  // positive: `.claude/rules/` drops out, leaving the check silent on a leftover directory
  const setcrGaps = scanContract(
    fixture({
      'skills/setup/SKILL.md': SETCR_CLEAN.replace(
        'a leftover `.claude/rules/` directory holding at least one `.md` file',
        'a leftover rules directory',
      ),
    }),
    SETUP_CHECK_RULES_CONTRACTS,
  );
  assert.equal(setcrGaps.length, 1, 'flags the mode once it stops naming `.claude/rules/`');
  assert.equal(setcrGaps[0].source, path.join('skills', 'setup', 'SKILL.md'), 'names setup SKILL.md');

  // negative: the real tree still carries the leg
  assert.equal(
    scanContract(realRoot, SETUP_CHECK_RULES_CONTRACTS).length,
    0,
    'the shipped `check` mode still reports a leftover `.claude/rules/` directory',
  );
};
