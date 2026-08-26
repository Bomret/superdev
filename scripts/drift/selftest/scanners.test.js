'use strict';

// The bespoke scanners: every check whose assertion is more than "this document still matches this
// pattern". One section per scanner, each carrying its own positive and negative fixtures.
//
// Run by ./index.js, which owns the shared fixture() helper, realRoot, and the temp-dir cleanup.

const { scanContract } = require('../lib');
const {
  scan,
  scanRunRootPaths,
  scanAssigneeContract,
  scanAnchorContract,
  scanAppendContract,
  scanReleaseContract,
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
  scanEvalShape,
  scanAdrStatus,
  scanForcingBranchFlag,
  scanNarrativeCoverage,
  scanReturnToController,
  scanMarketplaceSource,
  scanReadmeCommands,
  scanAuditSetGlobs,
  scanPinnedPaths,
  scanAgentToolAgnostic,
} = require('../scanners');
const { ADR_STATUSES, DOC_PASS_CONTRACTS, PLAYBOOK_EDGE_CONTRACTS } = require('../contracts');

module.exports = ({ assert, fs, path, fixture, realRoot }) => {
  // fixture with a missing reference
  const tmp1 = fixture({
    'references/exists.md': '# exists\n',
    'commands/foo.md':
      'See ${CLAUDE_PLUGIN_ROOT}/references/exists.md and ${CLAUDE_PLUGIN_ROOT}/references/missing.md\n',
  });

  const missing1 = scan(tmp1);
  assert.equal(missing1.length, 1, 'detects exactly one missing reference');
  assert.equal(missing1[0].reference, 'references/missing.md', 'names the missing reference');
  assert.equal(missing1[0].source, path.join('commands', 'foo.md'), 'names the source file');

  // fixture with all references present
  const tmp2 = fixture({
    'references/exists.md': '# exists\n',
    'agents/bar.md': 'See ${CLAUDE_PLUGIN_ROOT}/references/exists.md\n',
  });

  const missing2 = scan(tmp2);
  assert.equal(missing2.length, 0, 'all-present fixture yields zero missing');

  // fixture with a bare (no ${CLAUDE_PLUGIN_ROOT} macro) reference to a missing file — the prose
  // form used e.g. in commands/setup.md ("Seed: `references/issue-tracker-local.md`")
  const tmp3 = fixture({ 'commands/baz.md': 'Seed: `references/missing-bare.md`\n' });

  const missing3 = scan(tmp3);
  assert.equal(missing3.length, 1, 'detects a bare-form missing reference');
  assert.equal(missing3[0].reference, 'references/missing-bare.md', 'names the bare reference');

  // fixture where one reference cites another: the execution playbooks and scope-mode.md point at each
  // other, so a rename inside references/ dangles exactly like one in commands/ or agents/
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
  // checkout-relative .superdev/scopes/<scope>/<artifact> path (wrong from a worktree cwd) ---

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

  // negative: the absolute <run-root>/… form plus worktree *directory* paths are clean
  const tmp5 = fixture({
    'references/implement-lite.md':
      'Update the ledger at `<run-root>/ledger.md`; cut `.superdev/scopes/<scope>/worktree`.\n',
    'agents/implementer.md':
      'Append to `<run-root>/reports/<id>/progress.md`; worktree at `.superdev/scopes/<scope>/worktrees/<id>`.\n',
  });
  const offenders5 = scanRunRootPaths(tmp5);
  assert.equal(offenders5.length, 0, 'absolute form + worktree dir paths yield zero offenders');

  // --- scanAssigneeContract: an issue-backend doc that describes creating an issue must carry the
  // assignee contract; the local-file store is exempt ---

  // positive: an issue-backend seed with no `**Assignee` config bullet is flagged
  const tmp6 = fixture({
    'references/issue-tracker-acme.md':
      '**Create a slice issue**: `POST /api/v1/repos/o/r/issues` with `{ "title": "...", "labels": [] }`.\n',
  });
  const gaps6 = scanAssigneeContract(tmp6);
  assert.equal(gaps6.length, 1, 'flags a create-issue seed with no assignee contract');
  assert.equal(gaps6[0].source, path.join('references', 'issue-tracker-acme.md'), 'names the seed');

  // negative: the same seed carrying the assignee contract is clean
  const tmp7 = fixture({
    'references/issue-tracker-acme.md':
      '- **Assignee:** `<login>` — the account every issue a run creates is assigned to.\n\n' +
      '**Create a slice issue**: `POST /api/v1/repos/o/r/issues` with `{ "title": "...", "assignees": ["x"] }`.\n' +
      'No **Assignee** configured → resolve the token identity; `none` disables assignment.\n',
  });
  const gaps7 = scanAssigneeContract(tmp7);
  assert.equal(gaps7.length, 0, 'a seed carrying the assignee contract yields zero gaps');

  // the local-file store creates slice FILES, not issues, and is exempt even though it is an
  // issue-tracker-*.md document
  const tmp8 = fixture({
    'references/issue-tracker-local.md':
      'Create an issue file per slice under `docs/plans/<feature>/`. `POST /issues` is not used.\n',
  });
  const gaps8 = scanAssigneeContract(tmp8);
  assert.equal(gaps8.length, 0, 'the local-file store is exempt from the assignee contract');

  // positive: a seed describing the `gh issue create` CLI form (no "create an issue" prose, no
  // `POST .../issues`) still creates issues and must carry the assignee contract too — every
  // references/issue-tracker-*.md not in ASSIGNEE_EXEMPT is an issue backend by definition, so the
  // filename alone is the trigger
  const tmp9 = fixture({
    'references/issue-tracker-ghcli.md': '`gh issue create -t "<title>" -b "<body>" -l "<label>"`\n',
  });
  const gaps9 = scanAssigneeContract(tmp9);
  assert.equal(gaps9.length, 1, 'flags a gh-issue-create seed with no assignee contract');

  // negative: a bare substring mention ("no assignee field; skip it") must not satisfy the contract —
  // only the config-bullet form does
  const tmp10 = fixture({
    'references/issue-tracker-bare.md':
      '`gh issue create -t "<title>" -b "<body>"`. This tracker has no assignee field; skip it.\n',
  });
  const gaps10 = scanAssigneeContract(tmp10);
  assert.equal(gaps10.length, 1, 'a bare "assignee" mention does not satisfy the contract');

  // a **bolded** mention in running prose is not a config bullet either. The contract lives in a
  // `- **Assignee:** <value>` list item; prose that merely refers to "the **Assignee** value" says
  // nothing about what this backend is configured with.
  const tmp11 = fixture({
    'references/issue-tracker-prose.md':
      '## Assignee\n\nThe **Assignee** value above is applied to the epic and every slice.\n',
  });
  const gaps11 = scanAssigneeContract(tmp11);
  assert.equal(gaps11.length, 1, 'a bolded prose mention is not a config bullet');

  // both real spellings of the config bullet satisfy it
  const tmp12 = fixture({
    'references/issue-tracker-colon-inside.md':
      '- **Assignee:** `someone` — the account every issue is assigned to.\n',
    'references/issue-tracker-colon-outside.md':
      '- **Assignee**: `<accountId>` — the account every issue is assigned to.\n',
  });
  const gaps12 = scanAssigneeContract(tmp12);
  assert.equal(gaps12.length, 0, 'both `**Assignee:**` and `**Assignee**:` bullets satisfy it');

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
  // returning the tmp root. Shared by every fixture below (content-types, eval-shape, stage, command-refs,
  // chain-handoff) — one general helper instead of five near-identical ones that only differed in which
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

  // positive: the dispatching command paraphrases the pass instead of naming the reference that owns it.
  // This is the dispatch-prose half of the same contract (ADR 0035): a controller writes its dispatch from
  // what `commands/document.md` says the writer does, so a paraphrase here is what reaches the writer —
  // and the row above, on the agent alone, stays green while the two descriptions drift apart.
  const dp4 = fixture({
    'commands/document.md':
      'Dispatch `superdev:doc-writer`. It runs two passes (in-repo docs, then the knowledge base), ' +
      'deleting stale text, and commits on the current branch.\n',
  });
  const dpGaps4 = scanContract(dp4, DOC_PASS_CONTRACTS);
  assert.equal(dpGaps4.length, 1, 'flags a document.md whose dispatch paraphrases the pass');
  assert.equal(dpGaps4[0].source, path.join('commands', 'document.md'), 'names document.md');

  // negative: the dispatch names the reference as the authority the writer performs
  const dp5 = fixture({
    'commands/document.md':
      'It performs the pass `references/doc-pass.md` states. **Name that reference in the dispatch**: it ' +
      'owns the pass end to end.\n',
  });
  assert.equal(
    scanContract(dp5, DOC_PASS_CONTRACTS).length,
    0,
    'a dispatch that names the reference satisfies the row',
  );

  // --- scanAfkAnchorCount: `commands/afk.md`'s paragraph introducing `## Scope anchor` states how many
  // things that section carries for this backend (ADR 0040 made it five, naming the anchor dependency as
  // the fifth). Both elements are independent, and the scan is narrowed to the one paragraph — a
  // restatement anywhere else in the same section must not satisfy a stale paragraph. ---

  // positive: the stale "four things" paragraph, naming only the original four, is two gaps
  const aacStale = fixture({
    'commands/afk.md':
      '`docs/agents/issue-tracker.md` carries a `## Scope anchor` section stating four things for this ' +
      'backend: how to recognise an anchor, how to list the candidates, how to list the slices beneath ' +
      'one, and how to tell that an anchor is itself a slice.\n',
  });
  const aacGaps = scanAfkAnchorCount(aacStale);
  assert.equal(aacGaps.length, 2, 'the stale paragraph fails the count row and the naming row independently');

  // positive: the count fixed but the fifth thing still unnamed is one gap
  const aacCountOnly = fixture({
    'commands/afk.md':
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
    'commands/afk.md':
      '`docs/agents/issue-tracker.md` carries a `## Scope anchor` section stating five things for this ' +
      'backend: how to recognise an anchor, how to list the candidates, how to list the slices beneath ' +
      'one, how to tell that an anchor is itself a slice, and how to read an anchor\'s own dependencies.\n',
  });
  assert.equal(scanAfkAnchorCount(aacFixed).length, 0, 'the fixed paragraph satisfies both rows');

  // narrowing: a restatement elsewhere in §2's body (a second paragraph, separated by a blank line) that
  // carries both phrases must not save a stale intro paragraph — a section-wide or document-wide match
  // would pass this fixture, which is exactly the false green extractParagraph() exists to prevent
  const aacNarrowed = fixture({
    'commands/afk.md':
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
    scanAfkSelectionNeutrality(fixture({ 'commands/afk.md': selection(neutral) })).length,
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
      fixture({ 'commands/afk.md': selection(`${neutral} ${snippet}`) }),
    );
    assert.equal(gaps.length, 1, `flags ${why} in the selection step`);
    assert.match(gaps[0].expectation, /select without naming/, 'reports it as a mechanism');
  }

  // positive: naming no mechanism is only half — a selection pointing at no contract has nothing to
  // select by, so silence must not satisfy the check
  const silent = scanAfkSelectionNeutrality(
    fixture({ 'commands/afk.md': selection('Take the oldest candidate and go.') }),
  );
  assert.equal(silent.length, 1, 'a selection naming no contract is a gap');
  assert.match(silent[0].expectation, /point its selection at/, 'reports the missing contract');

  // a concrete label is a change-type prefix like any other. The two path strings this step legitimately
  // carries are excluded by name, so naming one real label no longer slips past as a path would.
  const concreteLabel = scanAfkSelectionNeutrality(
    fixture({
      'commands/afk.md': selection(
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
      'commands/afk.md': selection(`${neutral} Select the anchor labelled \`docs/plans-refactor\`.`),
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
        'commands/afk.md': selection(
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
        'commands/afk.md': selection(
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
        'commands/afk.md':
          selection(neutral) + '\n## 4. Blocks\n\nLabel the `epic` blocked and move on.\n',
      }),
    ).length,
    0,
    'a mechanism outside the selection section is not a gap',
  );

  // `epic` in plain prose is the same mechanism as a backticked one — the selection step is meant to
  // name no epic at all, so backticks must not be what decides it
  const plainEpic = scanAfkSelectionNeutrality(
    fixture({ 'commands/afk.md': selection(`${neutral} Take the epic issue.`) }),
  );
  assert.equal(plainEpic.length, 1, 'an unbackticked `epic` is still a mechanism');
  assert.match(plainEpic[0].expectation, /select without naming/, 'reports it as a mechanism');

  // a fenced `#` comment hides a mechanism from this scan — the worse direction of finding #143,
  // because this scanner is the only automated guard on the neutrality ADR 0017 requires
  assert.equal(
    scanAfkSelectionNeutrality(
      fixture({
        'commands/afk.md': selection(
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
    const gaps = scanAfkSelectionNeutrality(fixture({ 'commands/afk.md': body }));
    assert.equal(gaps.length, 1, `flags a ${why} selection heading`);
    assert.match(gaps[0].expectation, /selection heading/, `names the missing heading for ${why}`);
  }

  // --- scanEvalShape: a grader's frontmatter must be something the harness can act on, and a case's
  // scaffold_script must resolve ---

  const goodGrader = '---\ntype: llm\nfocus: files\nweight: 2\n---\nJudge the plan.\n';
  const goodCase = 'name: c\ncontext:\n  scaffold_script: scaffold.sh\n';

  // a well-formed case yields nothing
  const ok = fixture({
    'evals/c/case.yaml': goodCase,
    'evals/c/scaffold.sh': '#!/bin/sh\n',
    'evals/c/graders/g.md': goodGrader,
  });
  assert.equal(scanEvalShape(ok).length, 0, 'a well-formed case yields no problems');

  // each rule fires on its own, and names the offending file
  const badType = fixture({
    'evals/c/graders/g.md': '---\ntype: vibes\nfocus: files\nweight: 2\n---\nb\n',
  });
  const typeProblems = scanEvalShape(badType);
  assert.equal(typeProblems.length, 1, 'an unknown type is flagged');
  assert.equal(typeProblems[0].source, path.join('evals', 'c', 'graders', 'g.md'), 'names the grader');

  const badWeight = fixture({
    'evals/c/graders/g.md': '---\ntype: llm\nfocus: files\nweight: notanumber\n---\nb\n',
  });
  assert.equal(scanEvalShape(badWeight).length, 1, 'a non-numeric weight is flagged');

  const noFocus = fixture({
    'evals/c/graders/g.md': '---\ntype: llm\nweight: 2\n---\nb\n',
  });
  assert.equal(scanEvalShape(noFocus).length, 1, 'neither focus nor target is flagged');

  // `target` is the regex graders' spelling and satisfies the same rule
  const withTarget = fixture({
    'evals/c/graders/g.md': '---\ntype: regex\ntarget: files\nweight: 1\n---\nb\n',
  });
  assert.equal(scanEvalShape(withTarget).length, 0, '`target` satisfies the focus/target rule');

  const noFrontmatter = fixture({
    'evals/c/graders/g.md': 'Just prose, no frontmatter.\n',
  });
  assert.equal(scanEvalShape(noFrontmatter).length, 1, 'a missing frontmatter block is flagged');

  const badScaffold = fixture({
    'evals/c/case.yaml': 'name: c\ncontext:\n  scaffold_script: missing.sh\n',
    'evals/c/graders/g.md': goodGrader,
  });
  const scaffoldProblems = scanEvalShape(badScaffold);
  assert.equal(scaffoldProblems.length, 1, 'an unresolvable scaffold_script is flagged');
  assert.match(scaffoldProblems[0].problem, /scaffold_script/, 'says what is wrong');

  // nothing to check is not a failure
  const noEvals = fixture({ 'README.md': '# repo\n' });
  assert.equal(scanEvalShape(noEvals).length, 0, 'an absent evals/ directory yields no problems');

  const noGraders = fixture({
    'evals/c/case.yaml': goodCase,
    'evals/c/scaffold.sh': '#!/bin/sh\n',
  });
  assert.equal(scanEvalShape(noGraders).length, 0, 'a case with no graders/ dir yields no problems');

  // The harness accepts six grader types, and only `llm` and `regex` carry a focus/target. The other
  // four are `.strict()`, so adding `focus:` to satisfy this check would make the harness reject them.
  for (const type of ['tool_order', 'tool_used', 'file_exists', 'baseline']) {
    const other = fixture({
      'evals/c/graders/g.md': `---\ntype: ${type}\nweight: 1\n---\nb\n`,
    });
    assert.equal(scanEvalShape(other).length, 0, `\`${type}\` is a valid type and needs no focus`);
  }

  // The harness declares weight as a positive number, so zero, a negative, and a blank are malformed.
  for (const weight of ['0', '-1', '']) {
    const bad = fixture({
      'evals/c/graders/g.md': `---\ntype: llm\nfocus: files\nweight: ${weight}\n---\nb\n`,
    });
    assert.equal(scanEvalShape(bad).length, 1, `\`weight: ${weight}\` is not a positive number`);
  }

  // YAML a maintainer can legally write: CRLF endings, a quoted scalar, a trailing comment.
  const crlf = fixture({
    'evals/c/graders/g.md': '---\r\ntype: llm\r\nfocus: files\r\nweight: 2\r\n---\r\nb\r\n',
  });
  assert.equal(scanEvalShape(crlf).length, 0, 'CRLF frontmatter is read, not rejected');

  const quoted = fixture({
    'evals/c/graders/g.md': '---\ntype: "llm"\nfocus: \'files\'\nweight: 2  # weighted\n---\nb\n',
  });
  assert.equal(scanEvalShape(quoted).length, 0, 'quoted scalars and trailing comments are read');

  const quotedScaffold = fixture({
    'evals/c/case.yaml': 'context:\n  scaffold_script: "scaffold.sh"  # relative to the case dir\n',
    'evals/c/scaffold.sh': '#!/bin/sh\n',
    'evals/c/graders/g.md': goodGrader,
  });
  assert.equal(scanEvalShape(quotedScaffold).length, 0, 'a quoted scaffold_script resolves');

  // --- scanCommandRefs: a `/superdev:<name>` reference must resolve to `commands/<name>.md`. The chain
  // hands the user from one command to the next by printing its name (ADR 0013), so a reference to a
  // command that does not exist sends the reader to a dead end. Same failure shape as scan() one level
  // over: that one resolves references/ paths, this one resolves command names. ---

  // positive: a command points at one that does not exist
  const cr1 = fixture({
    'commands/implement.md': 'When every slice is merged, run `/superdev:ship <scope>`.\n',
  });
  const crGaps1 = scanCommandRefs(cr1);
  assert.equal(crGaps1.length, 1, 'flags a reference to a command with no file');
  assert.equal(crGaps1[0].command, '/superdev:ship', 'names the unresolved command');
  assert.equal(crGaps1[0].source, path.join('commands', 'implement.md'), 'names the source document');

  // negative: the same reference resolves once the command exists
  const cr2 = fixture({
    'commands/implement.md': 'When every slice is merged, run `/superdev:ship <scope>`.\n',
    'commands/ship.md': '# superdev ship\n',
  });
  assert.equal(scanCommandRefs(cr2).length, 0, 'a resolving reference yields zero gaps');

  // an agent may name a command too, and its references resolve by the same rule
  const cr3 = fixture({ 'agents/doc-writer.md': 'Dispatched by `/superdev:nope`.\n' });
  assert.equal(scanCommandRefs(cr3).length, 1, 'an agent naming a missing command is flagged');

  // a command naming itself resolves, and a trailing argument is not part of the name
  const cr4 = fixture({
    'commands/document.md': 'Invoked as `/superdev:document audit` — see `/superdev:document`.\n',
  });
  assert.equal(scanCommandRefs(cr4).length, 0, 'a trailing argument is not read as part of the name');

  // one missing command named by two documents is reported once per document, so every dead end is
  // fixable from the report alone
  const cr5 = fixture({
    'commands/implement.md': 'Then `/superdev:ship`.\n',
    'commands/document.md': 'Then `/superdev:ship`.\n',
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
    'commands/review.md': '# review\n\nReport the findings and stop.\n',
    'commands/document.md': handsOff('/superdev:ship'),
  });
  const chGaps1 = scanChainHandoff(ch1);
  assert.equal(chGaps1.length, 1, 'flags the command that names no successor');
  assert.equal(chGaps1[0].source, path.join('commands', 'review.md'), 'names review.md');
  assert.equal(chGaps1[0].next, '/superdev:document', 'names the successor it should have');

  // negative: a fully wired chain is clean
  const ch2 = fixture({
    'references/run-handoff.md': handsOff('/superdev:review'),
    'commands/review.md': handsOff('/superdev:document'),
    'commands/document.md': handsOff('/superdev:ship'),
  });
  assert.equal(scanChainHandoff(ch2).length, 0, 'a fully wired chain yields zero gaps');

  // every link is checked, not just the first: two broken handoffs are both reported
  const ch3 = fixture({
    'references/run-handoff.md': '# implement\n\nMerge the slices and stop.\n',
    'commands/review.md': handsOff('/superdev:document'),
    'commands/document.md': '# document\n\nReconcile the docs and stop.\n',
  });
  assert.equal(scanChainHandoff(ch3).length, 2, 'each broken link is reported');

  // naming some other command is not the handoff — the chain's order is what this check pins, and
  // /superdev:plan is a legitimate reference that says nothing about the successor
  const ch4 = fixture({
    'references/run-handoff.md': handsOff('/superdev:review'),
    'commands/review.md': 'To act on findings, run `/superdev:plan`, then `/superdev:implement`.\n',
    'commands/document.md': handsOff('/superdev:ship'),
  });
  assert.equal(scanChainHandoff(ch4).length, 1, 'naming an unrelated command is not a handoff');

  // an absent document is skipped, so a fixture carries only the links it exercises
  const ch5 = fixture({ 'commands/document.md': handsOff('/superdev:ship') });
  assert.equal(scanChainHandoff(ch5).length, 0, 'an absent chain document is skipped');

  // --- scanAfkInvocations: every stage-table row that invokes one of the four chain commands must carry
  // the token on that same row (ADR 0015). A row that loses it asks a question nobody answers, and the
  // sweep stops there reporting no failure. The real table carries five rows — two of them
  // `/superdev:review` — so this checks per row, not once per command name. ---

  // a fixture modeled on commands/afk.md §3's stage table plus its footnote and §5's maintainer-resume
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
  const afk1 = fixture({ 'commands/afk.md': stageTable(fullRows) });
  assert.equal(scanAfkInvocations(afk1).length, 0, 'a fully wired stage table is clean');

  // positive: each of the five rows is checked on its own — mutate one at a time, confirm it alone goes
  // red, and that the sibling row of the same command (`review` appears twice) does not mask it
  for (let i = 0; i < fullRows.length; i++) {
    const mutated = fullRows.map((row, j) => (j === i ? [row[0], row[1].replace(' --unattended', '')] : row));
    const afk = fixture({ 'commands/afk.md': stageTable(mutated) });
    const gaps = scanAfkInvocations(afk);
    assert.equal(gaps.length, 1, `mutating row ${i} (${fullRows[i][1]}) is caught on its own`);
    assert.match(gaps[0].expectation, new RegExp(fullRows[i][1].split(' ')[0].replace('/', '\\/')));
  }

  // the ship-command prose footnote (name + token on one line, not a table row) does not mask a missing
  // token on the actual ship table row
  const afkShipMasked = fixture({
    'commands/afk.md': stageTable(
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
    'commands/afk.md': 'A maintainer runs `/superdev:ship <slug>` once the host is reachable.\n',
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
      'commands/afk.md': stageTable(fullRows.filter(([, cmd]) => !cmd.startsWith(`/superdev:${dropped} `))),
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
    'commands/ship.md':
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
  assert.equal(sgGaps1[0].source, path.join('commands', 'ship.md'), 'names ship.md');

  // positive (RED reproduction, the reviewer's exact case): the entries-standing paragraph drops its own
  // unattended-refuse clause, while the unrelated stage gate above it still carries the identical
  // `--unattended` → refuse phrase — the whole-file test used to pass wrongly here
  const sg2 = fixture({
    'commands/ship.md':
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
  assert.equal(sgGaps2[0].source, path.join('commands', 'ship.md'), 'names ship.md');

  // negative: both halves carried in the entries-standing paragraph itself
  const sg3 = fixture({
    'commands/ship.md':
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
  const sg4 = fixture({ 'commands/ship.md': SHIP_UNRELATED_GATE + '## 4. Definition of Done\n' });
  const sgGaps4 = scanShipGateContract(sg4);
  assert.equal(sgGaps4.length, 1, 'flags a ship.md with no entries-standing paragraph at all');
  assert.equal(sgGaps4[0].source, path.join('commands', 'ship.md'), 'names ship.md');

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
  // (`plan-contract.md` → *Release*), and `commands/plan.md`, `commands/implement.md`, and
  // `commands/afk.md` each name that section. Both halves fail silently, so both are asserted. ---

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
  const rlConsumer = fixture({ 'commands/plan.md': '# plan\n\nWrite the slices, then hand off.\n' });
  const rlGapsConsumer = scanReleaseContract(rlConsumer);
  assert.equal(rlGapsConsumer.length, 1, 'flags the consumer that dropped the reference');
  assert.equal(rlGapsConsumer[0].source, path.join('commands', 'plan.md'), 'names the consumer');
  assert.match(rlGapsConsumer[0].expectation, /`## Release`/, 'names the section it must read');

  // negative: the same consumer naming the backticked section is clean — and the bare word alone is not,
  // since "release" recurs in ordinary prose
  assert.equal(
    scanReleaseContract(
      fixture({ 'commands/plan.md': "# plan\n\nRead `docs/agents/issue-tracker.md`'s `## Release`.\n" }),
    ).length,
    0,
    'a consumer naming the backticked section yields zero gaps',
  );

  // all three consumers are held to it, so dropping the reference everywhere reports three gaps
  const rlAllThree = fixture({
    'commands/plan.md': '# plan\n',
    'commands/implement.md': '# implement\n',
    'commands/afk.md': '# afk\n',
  });
  assert.equal(scanReleaseContract(rlAllThree).length, 3, 'every consumer is held to the reference');

  // an absent document is skipped, so a fixture carries only the docs it exercises
  assert.equal(
    scanReleaseContract(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'an absent document is skipped rather than reported',
  );

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
  // commands/implement.md) the two-verb/two-target net above would let straight through
  for (const flagged of [
    'Once the loop caps out, hand control back to /superdev:implement.',
    'Once the loop caps out, resume at the controller.',
    'Continue in commands/implement.md from where this left off.',
    'Go back up to the command body to finish Final phase.',
    'Jump back to Final phase in the controller.',
    'When done, return to Final Phase.',
    'Hand off execution back to /superdev:implement now.',
    'back to the command body',
    'return to commands/implement.md',
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
      'The controller `Read`s this after computing tier = `full` (see `commands/implement.md`). ' +
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

  // negative: a cross-reference to commands/implement.md, not an instruction to go there
  assert.equal(
    scanReturnToController(
      fixture({
        'references/implement-lite.md': 'See `commands/implement.md` for the tier the controller computed.\n',
      }),
    ).length,
    0,
    'a cross-reference to commands/implement.md is reported clean',
  );

  // negative: "back to" crossed with a path-shaped target catches an ordinary backward cross-reference
  // too — "refer back to" is a pointer, not a hand-off, and a playbook could legitimately carry it
  assert.equal(
    scanReturnToController(
      fixture({
        'references/implement-lite.md':
          'For the full command surface, refer back to `commands/implement.md`.\n',
      }),
    ).length,
    0,
    'a "refer back to" cross-reference to commands/implement.md is reported clean',
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
  // scanNarrativeCoverage: every registered check is written up, and both counts agree
  //
  // The `ids` parameter is passed explicitly throughout. Defaulting to the live registry would make
  // every fixture below shift each time a check is added — the narrative these fixtures carry would
  // need a new id and a new count word on an edit that has nothing to do with them.
  // ---------------------------------------------------------------------------

  const twoIds = ['alpha-check', 'beta-check'];
  // A narrative describing both, and all three count claims stated at two: what the shipped documents
  // look like when the contract holds.
  const coveredNarrative =
    '# scripts/\n\n`drift-check.js` guards two things, in the order `drift/checks.js` registers them.\n' +
    'First, the `alpha-check` contract: it guards alpha.\n' +
    'Second, the `beta-check` contract: it guards beta.\n\n' +
    'A new contract is one entry, plus its section in the two-check narrative above, plus its selftest.\n';
  const rootAgents = '# superdev\n\n`drift-check.js` with `drift/` (the two cross-document contract checks).\n';
  const covered = { 'scripts/AGENTS.md': coveredNarrative, 'AGENTS.md': rootAgents };

  assert.equal(
    scanNarrativeCoverage(fixture(covered), twoIds).length,
    0,
    'every id described and every count claim stated yields zero gaps',
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

  // positive: the count drifts on the same edit that adds the check. Three ids against a narrative
  // still counting two fails all three count claims as well as the missing description.
  const drifted = scanNarrativeCoverage(fixture(covered), [...twoIds, 'gamma-check']);
  assert.equal(
    drifted.filter((g) => /check count/.test(g.expectation)).length,
    3,
    'each of the three count claims is pinned separately',
  );
  assert.ok(
    drifted.some((g) => g.source === 'AGENTS.md'),
    'the root AGENTS.md count is pinned too, not only the narrative',
  );

  // positive: the count word appearing *somewhere* is not the claim. This narrative recounts past drift
  // ("it read two") while its own claim still says two — the shape that would slip past a document-wide
  // search for the current word.
  const historical = {
    ...covered,
    'scripts/AGENTS.md':
      coveredNarrative + '\nThe count once read two against a registry of three.\n',
  };
  assert.ok(
    scanNarrativeCoverage(fixture(historical), [...twoIds, 'gamma-check']).some((g) =>
      /guards three things/.test(g.expectation),
    ),
    'a historical mention of the number does not satisfy the claim',
  );

  // positive: a bare, unbackticked mention of an id — a substring of a longer word, or plain prose — must
  // not satisfy coverage. `reference` inside `references/…` is the real shape this guards: the whole
  // write-up naming a check could vanish and a document-wide substring search would still pass.
  const bareMention = {
    ...covered,
    'scripts/AGENTS.md': coveredNarrative.replace(
      'First, the `alpha-check` contract: it guards alpha.\n',
      'First, alpha-check-related prose lives here, with no backticked id.\n',
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

  // a count above what the narrative can spell yields no count gap rather than a wrong one
  assert.equal(
    scanNarrativeCoverage(fixture(covered), Array.from({ length: 120 }, (_, i) => `c${i}`))
      .filter((g) => /check count/.test(g.expectation)).length,
    0,
    'a registry too large to spell reports no count gap rather than guessing',
  );

  // positive: stripping a check's own write-up from the shipped narrative is reported as a gap. Earlier
  // this check reported clean here regardless — the forty-fourth paragraph's own historical sentence named
  // `source-sections` in recounting past drift, so that mention alone kept it "covered" with its real
  // write-up gone. The narrative no longer spells any check id there, so this now fails honestly.
  const shippedScriptsAgents = fs.readFileSync(path.join(realRoot, 'scripts', 'AGENTS.md'), 'utf8');
  const shippedRootAgents = fs.readFileSync(path.join(realRoot, 'AGENTS.md'), 'utf8');
  const strippedOwnWriteUp = fixture({
    'scripts/AGENTS.md': shippedScriptsAgents.replace('the `source-sections` contract', 'the omitted contract'),
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

  // --- scanReadmeCommands: README.md and commands/ name the same command set — a command the README
  // never names, or one it still names after a rename, is a router that lies. ---

  // negative: README and commands/ agree
  const rcOk = fixture({
    'README.md': '# p\n\nRun `/superdev:plan`, then `/superdev:implement`.\n',
    'commands/plan.md': '# plan\n',
    'commands/implement.md': '# implement\n',
  });
  assert.equal(scanReadmeCommands(rcOk).length, 0, 'a README naming every command yields zero gaps');

  // a shipped command the README never names
  const rcMissing = fixture({
    'README.md': '# p\n\nRun `/superdev:plan`.\n',
    'commands/plan.md': '# plan\n',
    'commands/ship.md': '# ship\n',
  });
  const rcMissingGaps = scanReadmeCommands(rcMissing);
  assert.equal(rcMissingGaps.length, 1, 'an unmentioned command is one gap');
  assert.match(rcMissingGaps[0].expectation, /\/superdev:ship/, 'the gap names the unmentioned command');

  // a README naming a command that does not exist (a rename left the old name behind)
  const rcGhost = fixture({
    'README.md': '# p\n\nRun `/superdev:plan` and `/superdev:retired` (twice: `/superdev:retired`).\n',
    'commands/plan.md': '# plan\n',
  });
  const rcGhostGaps = scanReadmeCommands(rcGhost);
  assert.equal(rcGhostGaps.length, 1, 'a ghost command is one gap, deduped across repeated mentions');
  assert.match(rcGhostGaps[0].expectation, /\/superdev:retired/, 'the gap names the ghost command');

  // absent README or absent commands dir → nothing to scan, matching every other scanner's fixture rule
  assert.equal(scanReadmeCommands(fixture({ 'commands/plan.md': '# plan\n' })).length, 0, 'absent README is skipped');
  assert.equal(scanReadmeCommands(fixture({ 'README.md': '# p\n' })).length, 0, 'absent commands dir is skipped');

  // the real repository is clean both ways
  assert.equal(scanReadmeCommands(realRoot).length, 0, 'the real README and commands/ agree');

  // --- scanAuditSetGlobs: every pattern under `## Audit set` resolves to at least one file. A pattern
  // matching nothing makes `/superdev:document audit` read zero files and still report a clean pass. ---

  // negative: every pattern resolves, both the glob and the plain-path shapes
  const asOk = fixture({
    'plugin/commands/plan.md': '# plan\n',
    'RELEASING.md': '# releasing\n',
    'docs/agents/documentation.md':
      '# doc\n\n## Audit set\n\n- `plugin/commands/*.md`\n- `RELEASING.md`\n',
  });
  assert.equal(scanAuditSetGlobs(asOk).length, 0, 'patterns that all resolve yield zero gaps');

  // a glob whose directory does not exist at the root — the audited-nothing bug, verbatim
  const asStale = fixture({
    'plugin/commands/plan.md': '# plan\n',
    'docs/agents/documentation.md':
      '# doc\n\n## Audit set\n\n- `commands/*.md`\n- `plugin/commands/*.md`\n',
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

  // positive: `commands/afk.md` is among the paths this check collects, which is what lets the
  // `afk-existence` special case go. Three tables pin that file, so the general rule now covers what
  // that check was written to catch on its own.
  assert.ok(
    scanPinnedPaths(fixture({ 'README.md': '# r\n' })).some((g) => g.source === path.join('commands', 'afk.md')),
    'commands/afk.md disappearing is still caught, now by the general check',
  );

  // positive: `READ_PATH_CONTRACTS`' second row pins `docs/agents/knowledge-base.md` with a `test()`
  // function in row[1] rather than a `RegExp` — the shape the old `row[1] instanceof RegExp` gate
  // could not see, so this document was one of the seven a whole-scope review found uncollected.
  assert.ok(
    scanPinnedPaths(fixture({ 'README.md': '# r\n' })).some(
      (g) => g.source === path.join('docs', 'agents', 'knowledge-base.md'),
    ),
    'a document pinned by a test()-shaped row is still caught',
  );

  // positive: `CHECK_COUNT_CLAIMS` pins `scripts/AGENTS.md` with a String in row[1], another shape
  // the old `instanceof RegExp` gate could not see.
  assert.ok(
    scanPinnedPaths(fixture({ 'README.md': '# r\n' })).some((g) => g.source === path.join('scripts', 'AGENTS.md')),
    'a document pinned by a String-shaped row is still caught',
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

  // negative: commands/ is out of scope — setup.md names concrete commands legitimately, as examples
  assert.equal(
    scanAgentToolAgnostic(fixture({ 'commands/setup.md': 'e.g. `npm test`, `pytest -q`, `cargo test`\n' })).length,
    0,
    'commands/ examples stay out of scope',
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
};
