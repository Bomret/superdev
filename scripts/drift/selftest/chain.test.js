'use strict';

// The chain and loop contract tables: the documents that hand a scope from one command to the next,
// and the ones a slice loop reads. One section per table.
//
// Run by ./index.js, which owns the shared fixture() helper, realRoot, and the temp-dir cleanup.

const { scanContract } = require('../lib');
const { scanDocStepsNoSuite, scanDenialCapNumberSilence, scanAfkLockTierClaim } = require('../scanners');
const {
  FEATURE_ARG_CONTRACTS,
  UNATTENDED_CONTRACTS,
  CHANGE_TYPE_CONTRACTS,
  DEGRADED_CONTRACTS,
  DENIAL_AUTHORSHIP_CONTRACTS,
  DENIAL_CAP_CONTRACTS,
  DENIAL_RESET_CONTRACTS,
  DERIVED_CRITERIA_CONTRACTS,
  LABEL_VALIDATION_CONTRACTS,
  GREEN_GATE_TIMEOUT_CONTRACTS,
  VERB_CONTRACTS,
  TEST_SELECTION_CONTRACTS,
  FULL_SUITE_CONTRACTS,
  FIX_BOUNDARY_CONTRACTS,
  AFK_ROUTING_CONTRACTS,
  ARG_TOKEN_CONTRACTS,
  ARG_TOKEN_LINE,
  SOURCE_SECTION_CONTRACTS,
  PUBLISH_RUN_STATE_CONTRACTS,
  ADOPT_RUN_STATE_CONTRACTS,
  RESUMED_WORKTREE_TRIGGER_CONTRACTS,
  SCOPE_WORKTREE_CONTRACTS,
  TRIAGE_RECORD_CONTRACTS,
  BACKLOG_SURVEY_CONTRACTS,
} = require('../contracts');

module.exports = ({ assert, path, fixture, fs, realRoot }) => {
  // --- scanFeatureArgContract: `/superdev:implement` takes the feature label that names which planned
  // feature to build, and plan.md hands off with that label resolved. The two halves live in different
  // documents, so either can drift alone, and neither failure surfaces anywhere else: a caller with no
  // conversation to infer a target from simply builds nothing. ---

  const takesLabel =
    '---\nargument-hint: "[feat/<label> | (empty = the only plan in the store)]"\n---\n' +
    'Resolve `$ARGUMENTS` to one feature label, and derive the scope from it.\n';
  const handsOffLabel = 'Then run `/superdev:implement feat/<label>` with the real label substituted.\n';

  // negative: both halves carried is clean
  const fa1 = fixture({
    'skills/implement/SKILL.md': takesLabel,
    'skills/plan/SKILL.md': handsOffLabel,
  });
  assert.equal(scanContract(fa1, FEATURE_ARG_CONTRACTS).length, 0, 'both halves carried yields zero gaps');

  // positive: implement.md declares no argument-hint
  const fa2 = fixture({
    'skills/implement/SKILL.md': 'Resolve `$ARGUMENTS` to one feature label.\n',
    'skills/plan/SKILL.md': handsOffLabel,
  });
  const faGaps2 = scanContract(fa2, FEATURE_ARG_CONTRACTS);
  assert.equal(faGaps2.length, 1, 'flags implement.md when it declares no argument-hint');
  assert.equal(faGaps2[0].source, path.join('skills', 'implement', 'SKILL.md'), 'names implement.md');
  assert.match(faGaps2[0].expectation, /argument-hint/, 'says which half is missing');

  // positive: implement.md declares the hint but never resolves the argument, so the hint is decoration
  const fa3 = fixture({
    'skills/implement/SKILL.md': '---\nargument-hint: "[feat/<label>]"\n---\nLoad the slices.\n',
    'skills/plan/SKILL.md': handsOffLabel,
  });
  const faGaps3 = scanContract(fa3, FEATURE_ARG_CONTRACTS);
  assert.equal(faGaps3.length, 1, 'a declared-but-unresolved argument is still a gap');
  assert.match(faGaps3[0].expectation, /\$ARGUMENTS/, 'names the unresolved argument');

  // positive: plan.md stopped naming the resolved successor — the other half of the same contract
  const fa4 = fixture({
    'skills/implement/SKILL.md': takesLabel,
    'skills/plan/SKILL.md': 'Tell the user the plan is ready for `/superdev:implement`.\n',
  });
  const faGaps4 = scanContract(fa4, FEATURE_ARG_CONTRACTS);
  assert.equal(faGaps4.length, 1, 'flags plan.md when it hands off without the label');
  assert.equal(faGaps4[0].source, path.join('skills', 'plan', 'SKILL.md'), 'names plan.md');

  // an argument-hint that names some other argument is not this contract: `/superdev:review` and
  // `/superdev:ship` both declare hints of their own, so the presence of a hint proves nothing
  const fa5 = fixture({
    'skills/implement/SKILL.md': '---\nargument-hint: "[BASE..HEAD]"\n---\nResolve `$ARGUMENTS`.\n',
    'skills/plan/SKILL.md': handsOffLabel,
  });
  assert.equal(
    scanContract(fa5, FEATURE_ARG_CONTRACTS).length,
    1,
    'a hint naming an unrelated argument does not satisfy the contract',
  );

  // an absent document is skipped, so a fixture carries only the halves it exercises
  const fa6 = fixture({ 'skills/plan/SKILL.md': handsOffLabel });
  assert.equal(scanContract(fa6, FEATURE_ARG_CONTRACTS).length, 0, 'an absent document is skipped');

  // a store whose feature label uses another notation satisfies the contract exactly as a slash-prefixed
  // one does. The label's shape belongs to the active slice-store document (ADR 0019), so pinning one
  // notation here would go red for a store that is perfectly well configured.
  const fa7 = fixture({
    'skills/implement/SKILL.md':
      '---\nargument-hint: "[<feature-label>  (empty = the only plan in the store)]"\n---\n' +
      'Resolve `$ARGUMENTS` to one feature label, and derive the scope from it.\n',
    'skills/plan/SKILL.md': 'Then run `/superdev:implement lite-perf` with the real label substituted.\n',
  });
  assert.equal(scanContract(fa7, FEATURE_ARG_CONTRACTS).length, 0, 'a prefixless label is clean');

  // an unbacktick-delimited mention of the command satisfies no invocation — plan.md's own `description:`
  // frontmatter says "Run before /superdev:implement." incidentally, and a reword that drops the trailing
  // period ("...to build it.") must not turn the row green with the real handoff deleted
  const fa8 = fixture({
    'skills/implement/SKILL.md': takesLabel,
    'skills/plan/SKILL.md': 'Run before /superdev:implement to build it.\n',
  });
  const faGaps8 = scanContract(fa8, FEATURE_ARG_CONTRACTS);
  assert.equal(faGaps8.length, 1, 'a bare prose mention is not a resolved handoff');
  assert.equal(faGaps8[0].source, path.join('skills', 'plan', 'SKILL.md'), 'names plan.md');

  // --- UNATTENDED_CONTRACTS: scope-mode.md defines the token, and every document carrying a stop names
  // it (ADR 0016). A document that drops it asks a question nobody is there to answer, so an unattended
  // sweep stalls until morning having done nothing — and every file involved stays valid prose, so
  // nothing else notices. ---

  const definesToken =
    '## Unattended\n\n`--unattended` in a command\'s arguments means nobody is watching.\n';
  const namesToken =
    'Carrying `--unattended` → block instead of asking, per `scope-mode.md`\'s **Unattended** section.\n';
  const everyStop = {
    'references/scope-mode.md': definesToken,
    'skills/implement/SKILL.md': namesToken,
    'skills/review/SKILL.md': namesToken,
    'skills/document/SKILL.md': namesToken,
    'skills/ship/SKILL.md': namesToken,
    'references/implement-full.md': namesToken,
    'references/implement-lite.md': namesToken,
    'references/run-init.md': namesToken,
    'references/run-handoff.md': namesToken,
  };

  const unattendedOpts = { stripFrontmatterFirst: true };

  // negative: every document carrying its half is clean
  assert.equal(
    scanContract(fixture(everyStop), UNATTENDED_CONTRACTS, unattendedOpts).length,
    0,
    'every document carrying the token yields zero gaps',
  );

  // positive: scope-mode.md names the token but lost the section that defines it, so the catch-all —
  // the rule that makes an unwritten stop block rather than ask — has nowhere to live
  const un2 = fixture({
    ...everyStop,
    'references/scope-mode.md': 'Pass `--unattended` through to each command.\n',
  });
  const unGaps2 = scanContract(un2, UNATTENDED_CONTRACTS, unattendedOpts);
  assert.equal(unGaps2.length, 1, 'a token mention is not the section that defines it');
  assert.equal(unGaps2[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');

  // positive: each stop-carrying document is checked on its own, not just the first. Dropping everything
  // fails both the token row and the read/apply-instruction row for that one document.
  for (const rel of [
    'skills/implement/SKILL.md',
    'skills/review/SKILL.md',
    'skills/document/SKILL.md',
    'skills/ship/SKILL.md',
    'references/implement-full.md',
    'references/implement-lite.md',
    'references/run-init.md',
    'references/run-handoff.md',
  ]) {
    const dropped = fixture({ ...everyStop, [rel]: '# doc\n\nNo token here.\n' });
    const gaps = scanContract(dropped, UNATTENDED_CONTRACTS, unattendedOpts);
    assert.equal(gaps.length, 2, `flags ${rel} on both rows when it drops everything`);
    assert.ok(gaps.every((g) => g.source === rel.split('/').join(path.sep)), `both gaps name ${rel}`);
  }

  // positive: the token alone, with no read/apply instruction for the section. A command in this shape
  // names `--unattended` in its prose while nothing in the body points a reader at the `## Unattended`
  // section that routes a stop to block, so the token governs nothing.
  const shipShaped = fixture({
    ...everyStop,
    'skills/ship/SKILL.md': '# ship\n\nCarries `--unattended` but points nowhere.\n',
  });
  const shipShapedGaps = scanContract(shipShaped, UNATTENDED_CONTRACTS, unattendedOpts);
  assert.equal(shipShapedGaps.length, 1, 'flags the missing read/apply instruction alone');
  assert.match(shipShapedGaps[0].expectation, /read\/apply instruction/, 'names the missing instruction');

  // positive: `[--unattended]` in a command's own `argument-hint` frontmatter is not a standing answer in
  // its body. Deleting every real mention from review.md/document.md/ship.md and leaving only the
  // frontmatter echo must still be caught — the exact false-green `stripFrontmatterFirst` exists to close.
  for (const rel of ['skills/review/SKILL.md', 'skills/document/SKILL.md', 'skills/ship/SKILL.md']) {
    const frontmatterOnly = fixture({
      ...everyStop,
      [rel]: '---\nargument-hint: "[foo] [--unattended]"\n---\n\n# doc\n\nNo body mention.\n',
    });
    const strippedGaps = scanContract(frontmatterOnly, UNATTENDED_CONTRACTS, unattendedOpts);
    assert.equal(strippedGaps.length, 2, `flags ${rel} on both rows once frontmatter is stripped`);
    assert.ok(strippedGaps.every((g) => g.source === rel.split('/').join(path.sep)), `both gaps name ${rel}`);
    // proof this is the bug the option closes: without stripping, the token row alone reads clean —
    // only the (always-unstripped) read/apply-instruction row still catches it
    const unstrippedGaps = scanContract(frontmatterOnly, UNATTENDED_CONTRACTS);
    assert.equal(unstrippedGaps.length, 1, `${rel}'s frontmatter echo satisfies only the token row unstripped`);
    assert.match(unstrippedGaps[0].expectation, /read\/apply instruction/, 'the token row itself is clean');
  }

  // FEATURE_ARG_CONTRACTS's first row needs the frontmatter itself (`^argument-hint:.*<(?:feature-)?label>`)
  // and never strips it — confirms the two contract tables can disagree on `stripFrontmatterFirst` safely
  assert.equal(
    scanContract(
      fixture({ 'skills/implement/SKILL.md': takesLabel, 'skills/plan/SKILL.md': handsOffLabel }),
      FEATURE_ARG_CONTRACTS,
    ).length,
    0,
    'FEATURE_ARG_CONTRACTS reads the unstripped frontmatter',
  );

  // an absent document is skipped, so a fixture carries only the stops it exercises
  const un4 = fixture({ 'references/scope-mode.md': definesToken });
  assert.equal(scanContract(un4, UNATTENDED_CONTRACTS).length, 0, 'absent documents are skipped');

  // --- DEGRADED_CONTRACTS: scope-mode.md defines the degraded pass and its ledger entry, and every
  // document that dispatches or reads the record names it. A document that drops the wire lets a run
  // report a review it never independently got. ---

  const definesDegraded =
    '## Degraded passes\n\nA denied dispatch is one. Write a `**Degraded:**` line to the ledger,\n' +
    'carrying the refusal text the classifier returned, flattened to one line.\n';
  const namesDegraded =
    'A denied dispatch → work inline and write the `**Degraded:**` entry, per `## Degraded passes`.\n';
  const everyConsumer = {
    'references/scope-mode.md': definesDegraded,
    'skills/implement/SKILL.md': namesDegraded,
    'skills/review/SKILL.md': namesDegraded,
    'skills/document/SKILL.md': namesDegraded,
    'skills/ship/SKILL.md': namesDegraded,
    'skills/status/SKILL.md': namesDegraded,
    'references/implement-full.md': namesDegraded,
    'references/implement-lite.md': namesDegraded,
    'references/run-handoff.md': namesDegraded,
  };
  const degradedOpts = { stripFrontmatterFirst: true };

  // negative: every document carrying both halves is clean
  assert.equal(
    scanContract(fixture(everyConsumer), DEGRADED_CONTRACTS, degradedOpts).length,
    0,
    'every consumer carrying the wire yields zero gaps',
  );

  // positive: scope-mode.md mentions the entry but lost the section defining it, so what counts as
  // degraded — and what to do attended versus unattended — has nowhere to live
  const dg2 = fixture({
    ...everyConsumer,
    'references/scope-mode.md': 'Ledgers may carry a `**Degraded:**` line.\n',
  });
  const dgGaps2 = scanContract(dg2, DEGRADED_CONTRACTS, degradedOpts);
  assert.equal(dgGaps2.length, 2, 'an entry mention is neither the section nor the refusal-text rule');
  assert.ok(
    dgGaps2.every((g) => g.source === path.join('references', 'scope-mode.md')),
    'both gaps name scope-mode.md',
  );

  // positive: the section survives but drops what a denied-dispatch bullet must carry, so the ledger
  // records that a pass degraded and never why the classifier refused it (ADR 0039)
  const dgNoRefusal = fixture({
    ...everyConsumer,
    'references/scope-mode.md':
      '## Degraded passes\n\nA denied dispatch is one. Write a `**Degraded:**` line to the ledger.\n',
  });
  const dgNoRefusalGaps = scanContract(dgNoRefusal, DEGRADED_CONTRACTS, degradedOpts);
  assert.equal(dgNoRefusalGaps.length, 1, 'flags a section that never names the refusal text');
  assert.match(dgNoRefusalGaps[0].expectation, /refusal text/, 'names the missing refusal text');

  // positive: each consumer is checked on its own, so one dropping the wire cannot hide behind its
  // siblings — the failure this guards is exactly one command going quiet
  for (const rel of [
    'skills/implement/SKILL.md',
    'skills/review/SKILL.md',
    'skills/document/SKILL.md',
    'skills/ship/SKILL.md',
    'skills/status/SKILL.md',
    'references/implement-full.md',
    'references/implement-lite.md',
    'references/run-handoff.md',
  ]) {
    const dropped = fixture({ ...everyConsumer, [rel]: '# doc\n\nNothing about degrading here.\n' });
    const gaps = scanContract(dropped, DEGRADED_CONTRACTS, degradedOpts);
    assert.equal(gaps.length, 2, `flags ${rel} on both rows when it drops everything`);
    assert.ok(gaps.every((g) => g.source === rel.split('/').join(path.sep)), `both gaps name ${rel}`);
  }

  // positive: the entry named with no pointer to the section leaves a reader a token and no rule
  const entryOnly = fixture({
    ...everyConsumer,
    'skills/ship/SKILL.md': '# ship\n\nCopy any `**Degraded:**` bullet into the body.\n',
  });
  const entryOnlyGaps = scanContract(entryOnly, DEGRADED_CONTRACTS, degradedOpts);
  assert.equal(entryOnlyGaps.length, 1, 'flags the missing section pointer alone');
  assert.match(entryOnlyGaps[0].expectation, /point at the/, 'names the missing pointer');

  // --- PUBLISH_RUN_STATE_CONTRACTS: scope-mode.md states, once, both the publish-after-any-ledger-write
  // rule and the criterion for which write cites it directly (a write whose own instruction can end the
  // command — a block, a stop, a refusal — before any later write in the run reaches a citing site; every
  // other write relies on its defining section's own citation instead). A second fix cycle found that
  // review.md and run-handoff.md each carry *several* citations, one per terminal site, so a single
  // file-level presence row cannot tell one being dropped from a sibling surviving — three denied-dispatch
  // sites sat uncited with the check green because another branch's citation kept the file "covered". The
  // rows below are per-site wherever a file carries more than one citation, each anchored on text unique to
  // its own write, never just the repeated section name. A file with exactly one citation
  // (`run-init.md`, `implement.md`, `ship.md`, `implement-full.md`) keeps one file-level row, unambiguous
  // on its own; `implement-lite.md` carries none — neither of its two writes can end the command, so both
  // rely on inheritance and the file is outside this table entirely. ---

  // scope-mode.md: 6 pieces (heading, the criterion paragraph, and one per defining section/bullet).
  const scopeModePieces = {
    heading: '## Publishing run state\n\n',
    rule:
      "Publishing follows any ledger write the snapshot would show. **Which sites cite this directly.**\n" +
      "Cite this section directly at the write, rather than relying on inheritance, when that write's own\n" +
      'instruction can end the command — a block, a stop, a refusal. Every other write relies on its\n' +
      "defining section's own citation instead.\n\n",
    degraded:
      '## Degraded passes\n\nPublish the snapshot afterwards, per `## Publishing run state` above, on every\n' +
      '`degraded add`, `degraded add-denial`, or `degraded reset-denials` call.\n\n',
    unresolved:
      '## Unresolved defects\n\nPublish the snapshot afterwards, per `## Publishing run state` above, on\n' +
      'every `unresolved add` or `unresolved clear` call.\n\n',
    deferred:
      '## Deferred findings\n\nPublish the snapshot afterwards, per `## Publishing run state` above, on\n' +
      'every `deferred add` call.\n\n',
    docs:
      '## The ledger\n\nPublish the snapshot afterwards, per `## Publishing run state` below, on every\n' +
      '`docs set` or `docs clear` call.\n',
  };

  // skills/document/SKILL.md: 2 terminal sites (a denied doc-writer/doc-reader dispatch; its own stage write).
  const documentPieces = {
    denial:
      "Say so in §5's report and write the `**Degraded:**` entry, quoting the classifier's refusal.\n" +
      "Publish the snapshot afterwards, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing\n" +
      'run state` section.\n\n',
    stage:
      "Write the ledger's `**Stage:**` line. **Wrote `documented` or `documented-unreviewed` above** →\n" +
      "publish the snapshot, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state`\n" +
      'section. The two leave-alone branches wrote nothing, so there is nothing to publish there.\n',
  };

  // references/run-handoff.md: 3 terminal sites (denied full suite, the 3-strike red-cap stop, its own
  // stage-merged write).
  const runHandoffPieces = {
    denied:
      'Write the `**Degraded:**` entry either way naming the denial, then publish the snapshot before\n' +
      "deciding which branch below applies — per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s\n" +
      '`## Publishing run state` section — since the block\nbranch reaches no later write in this run.\n' +
      '**Attended** → continue to the stage write. **Unattended** → block.\n\n',
    redCap:
      'Stop, say so, write the `**Unresolved:**` entry, leave the\nstage where it is, and publish the\n' +
      "snapshot before stopping — per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md}'s `## Publishing run\n" +
      'state` section — since no later\nstage write in this run will do it.\n\n',
    merged:
      "Set the stage to `merged`. The `**Stage:**` line is what tells the next command, or a resumed run,\n" +
      'that every slice is on the scope branch. Publish\nthe snapshot afterwards, per\n' +
      "`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md}'s `## Publishing run state`\nsection.\n",
  };

  // skills/review/SKILL.md: 6 terminal sites (denied final-reviewer, denied full suite in §4, the "Declined"
  // stop, the 3-strike-cap/unattended-block stop, the denied fix implementer, the clean-verdict writes).
  const reviewPieces = {
    finalReviewer:
      "Write the `**Degraded:**` entry that section defines, quoting the classifier's refusal, then\n" +
      "publish the\nsnapshot, per that file's `## Publishing run state` section — since either block branch below\n" +
      'reaches no\nlater write in this run.\n\n',
    fullSuite:
      'Write the `**Degraded:**` entry either way, then publish the\nsnapshot before deciding which\n' +
      "branch applies — per\n`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md}'s `## Publishing run state`\n" +
      'section — since the block\nbranch reaches no later write in this run.\n\n',
    declined:
      'Declined → stop. Write the `**Unresolved:**` entry, publish the\nsnapshot before stopping — per\n' +
      "`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md}'s `## Publishing run\nstate` section, since no later\n" +
      'write in this run will do it — and the stage does not advance.\n\n',
    threeStrike:
      'Stop, say so, write the `**Unresolved:**` entry, leave the stage where it is, and\n' +
      "publish the snapshot before stopping — per\n`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md}'s\n" +
      '`## Publishing run state` section — since no later\nstage write in this run will do it.\n\n',
    fixImplementer:
      'Write the `**Degraded:**` entry either way, with `scope.js degraded add` — the fix\n' +
      'implementer is an authoring dispatch, not one of the three the cap counts — then publish the snapshot,\n' +
      "per that file's `## Publishing run state` section, since an unattended block below reaches no later\n" +
      'write in this run.\n\n',
    cleanVerdict:
      'Publish the snapshot after any of the writes above — `unresolved clear`, the stage write, and `docs\n' +
      "clear` alike — per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state` section.\n",
  };

  const joinAll = (pieces) => Object.values(pieces).join('');
  const pointsAtPublish = "Publish the snapshot afterwards, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md}'s " +
    '`## Publishing run state` section.\n';
  // references/implement-full.md carries a second, unrelated mention of the section (the non-terminal
  // simplicity-reviewer write's own inheritance note), so its row is anchored on the real citation's own
  // lead-in rather than a bare heading match.
  const implementFullPointsAtPublish =
    'Publish the snapshot after either write, per ' +
    "`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md}'s `## Publishing run state` section.\n" +
    "Nothing in the simplicity-reviewer's own outcome can end the command, so that write relies on its " +
    "defining section's own citation (`## Publishing run state`) rather than repeating one here.\n";
  const everyPublishSite = {
    'references/scope-mode.md': joinAll(scopeModePieces),
    'skills/document/SKILL.md': joinAll(documentPieces),
    'references/run-handoff.md': joinAll(runHandoffPieces),
    'skills/review/SKILL.md': joinAll(reviewPieces),
    'references/run-init.md': pointsAtPublish,
    'skills/implement/SKILL.md': pointsAtPublish,
    'skills/ship/SKILL.md': pointsAtPublish,
    'references/implement-full.md': implementFullPointsAtPublish,
  };

  // negative: every site present is clean
  assert.equal(
    scanContract(fixture(everyPublishSite), PUBLISH_RUN_STATE_CONTRACTS).length,
    0,
    'the section plus every citing site yields zero gaps',
  );

  // positive: ADR 0044 added a third verb, `degraded reset-denials`, to the write this row pins — a
  // `## Degraded passes` citation still naming only the original two verbs (the shape every prior
  // release carried) gaps, rather than the pattern staying satisfied by a subset of its own text.
  const degradedTwoVerbOnly = fixture({
    ...everyPublishSite,
    'references/scope-mode.md': joinAll({
      ...scopeModePieces,
      degraded:
        '## Degraded passes\n\nPublish the snapshot afterwards, per `## Publishing run state` above, on every\n' +
        '`degraded add` or `degraded add-denial` call.\n\n',
    }),
  });
  const twoVerbGaps = scanContract(degradedTwoVerbOnly, PUBLISH_RUN_STATE_CONTRACTS);
  assert.equal(twoVerbGaps.length, 1, 'flags scope-mode.md for citing only two of the three degraded verbs');
  assert.equal(twoVerbGaps[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');

  // positive: dropping any one piece of a multi-site file leaves the others intact, so exactly one gap
  // fires naming that file — the precision the file-level version of this check could not offer, and the
  // exact mechanical gap the second fix cycle demonstrated on implement-lite.md
  const dropOne = (rel, pieces, key, sourceLabel) => {
    const remaining = Object.entries(pieces)
      .filter(([k]) => k !== key)
      .map(([, v]) => v)
      .join('');
    const dropped = fixture({ ...everyPublishSite, [rel]: remaining });
    const gaps = scanContract(dropped, PUBLISH_RUN_STATE_CONTRACTS);
    assert.equal(gaps.length, 1, `flags ${sourceLabel} alone for dropping its "${key}" citation`);
    assert.equal(gaps[0].source, rel.split('/').join(path.sep), `names ${rel}`);
  };

  for (const key of Object.keys(scopeModePieces)) {
    dropOne('references/scope-mode.md', scopeModePieces, key, 'scope-mode.md');
  }
  for (const key of Object.keys(documentPieces)) {
    dropOne('skills/document/SKILL.md', documentPieces, key, 'document.md');
  }
  for (const key of Object.keys(runHandoffPieces)) {
    dropOne('references/run-handoff.md', runHandoffPieces, key, 'run-handoff.md');
  }
  for (const key of Object.keys(reviewPieces)) {
    dropOne('skills/review/SKILL.md', reviewPieces, key, 'review.md');
  }

  // positive: each of the four single-citation files is checked on its own too
  for (const rel of ['references/run-init.md', 'skills/implement/SKILL.md', 'skills/ship/SKILL.md', 'references/implement-full.md']) {
    const dropped = fixture({ ...everyPublishSite, [rel]: '# doc\n\nWrite the stage. Nothing else.\n' });
    const gaps = scanContract(dropped, PUBLISH_RUN_STATE_CONTRACTS);
    assert.equal(gaps.length, 1, `flags ${rel} alone for dropping its citation`);
    assert.equal(gaps[0].source, rel.split('/').join(path.sep), `names ${rel}`);
  }

  // positive: implement-full.md's real citation dropped while its unrelated second mention of the
  // section (the simplicity-reviewer's own inheritance note) survives still fires — a bare heading-only
  // pattern would stay green here, exactly the mechanical gap this row's anchor exists to close
  const implementFullRealCitationDropped = fixture({
    ...everyPublishSite,
    'references/implement-full.md':
      "Nothing in the simplicity-reviewer's own outcome can end the command, so that write relies on its " +
      "defining section's own citation (`## Publishing run state`) rather than repeating one here.\n",
  });
  const implementFullGaps = scanContract(implementFullRealCitationDropped, PUBLISH_RUN_STATE_CONTRACTS);
  assert.equal(implementFullGaps.length, 1, 'flags implement-full.md even though the section is still named once');
  assert.equal(
    implementFullGaps[0].source,
    path.join('references', 'implement-full.md'),
    'names implement-full.md',
  );

  // implement-lite.md carries no citation at all — neither of its writes can end the command — and is
  // absent from the table, so a fixture with no citation there still yields zero gaps
  assert.equal(
    scanContract(
      fixture({ ...everyPublishSite, 'references/implement-lite.md': '# doc\n\nRecord the pass. Continue.\n' }),
      PUBLISH_RUN_STATE_CONTRACTS,
    ).length,
    0,
    'implement-lite.md is outside this table: both its writes rely on inheritance',
  );

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), PUBLISH_RUN_STATE_CONTRACTS).length,
    0,
    'absent documents are skipped',
  );

  // --- ADOPT_RUN_STATE_CONTRACTS: the mirror image of the table above — run-init.md's adopt branch (six
  // rows) plus scope-mode.md's `resumed`-branch fetch (two rows). Each row is anchored on text unique to
  // its own clause, so dropping any one leaves the others intact and fires exactly one gap. ---

  const adoptRunInitPieces = {
    trigger:
      '**No `<run-root>/ledger.md` yet** → before running `init`, check the scope anchor for a snapshot ' +
      'to adopt, unless the active store declares itself snapshot-less (the local store) — skip straight ' +
      'to `init` below.\n\n',
    readFails:
      '**The read fails** (the store is unreachable) → report it once and fall through to `init` below, ' +
      'exactly as if the anchor carried no snapshot. Not a stop.\n\n',
    notAdopted:
      '**No `## Run state` section, or its `**Stage:**` line reads `shipped`** → not adopted — fall ' +
      'through to `init` below.\n\n',
    adoptCall:
      '**A `## Run state` section whose stage is not `shipped`** → **adopt**. Write `<run-root>/dod.md` ' +
      'from that body first, then pipe it to `adopt`:\n\n```sh\n<anchor body> | node ' +
      '"${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" adopt --root <run-root>\n```\n\n',
    reconciliation:
      "This run's kind is `resumed`. Never run `init` afterwards: your playbook's **Resume** section " +
      'reconciles it against `git log`, and re-dispatches no slice that reconciliation finds already on ' +
      'the scope branch.\n\n',
    kindNamed:
      "Name this run's kind: a live ledger — one already on disk, or one you just adopted from the " +
      "anchor's snapshot — is **`resumed`**.\n",
  };

  const adoptScopeModePieces = {
    fetch:
      '**A name that does not verify locally is fetched before anything else**: `git fetch <remote> ' +
      '<branch>` (`<remote>` from `docs/agents/code-management.md`).\n\n',
    verifyRef:
      "Verify the fetch's own ref afterwards, `git rev-parse --verify <remote>/<branch>`, never the bare " +
      'name a second time**: fetching one ref only ever populates the remote-tracking ref ' +
      '`refs/remotes/<remote>/<branch>`, never a local `refs/heads/<branch>`.\n\n',
    stop:
      'A name that still does not verify — the fetch found nothing either — is a stop, naming the branch ' +
      "it looked for, not a guess. **`--unattended` → block**, per `## Unattended`.\n",
  };

  const everyAdoptSite = {
    'references/run-init.md': joinAll(adoptRunInitPieces),
    'references/scope-mode.md': joinAll(adoptScopeModePieces),
  };

  // negative: every site present is clean
  assert.equal(
    scanContract(fixture(everyAdoptSite), ADOPT_RUN_STATE_CONTRACTS).length,
    0,
    'adopt-run-state: every clause present yields zero gaps',
  );

  // positive: dropping any one clause fires exactly one gap naming its own file
  for (const key of Object.keys(adoptRunInitPieces)) {
    const remaining = Object.entries(adoptRunInitPieces)
      .filter(([k]) => k !== key)
      .map(([, v]) => v)
      .join('');
    const dropped = fixture({ ...everyAdoptSite, 'references/run-init.md': remaining });
    const gaps = scanContract(dropped, ADOPT_RUN_STATE_CONTRACTS);
    assert.equal(gaps.length, 1, `adopt-run-state: flags run-init.md alone for dropping its "${key}" clause`);
    assert.equal(gaps[0].source, path.join('references', 'run-init.md'), 'names run-init.md');
  }
  for (const key of Object.keys(adoptScopeModePieces)) {
    const remaining = Object.entries(adoptScopeModePieces)
      .filter(([k]) => k !== key)
      .map(([, v]) => v)
      .join('');
    const dropped = fixture({ ...everyAdoptSite, 'references/scope-mode.md': remaining });
    const gaps = scanContract(dropped, ADOPT_RUN_STATE_CONTRACTS);
    assert.equal(
      gaps.length,
      1,
      `adopt-run-state: flags scope-mode.md alone for dropping its "${key}" clause`,
    );
    assert.equal(gaps[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');
  }

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), ADOPT_RUN_STATE_CONTRACTS).length,
    0,
    'adopt-run-state: absent documents are skipped',
  );

  // positive: the pre-fix-cycle wording — re-verifying the bare `<branch>` name after the fetch, the
  // Critical defect two review passes missed (`git fetch` only ever populates the remote-tracking ref,
  // never a local one, so that re-verify always fails) — fires the gap this row exists to catch
  const buggyVerifyRef = fixture({
    ...everyAdoptSite,
    'references/scope-mode.md': joinAll({
      ...adoptScopeModePieces,
      verifyRef: 'Verify the fetch by re-running `git rev-parse --verify <branch>`.\n\n',
    }),
  });
  const buggyVerifyGaps = scanContract(buggyVerifyRef, ADOPT_RUN_STATE_CONTRACTS);
  assert.equal(buggyVerifyGaps.length, 1, 'adopt-run-state: flags a re-verify against the bare branch name');
  assert.equal(buggyVerifyGaps[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');

  // --- RESUMED_WORKTREE_TRIGGER_CONTRACTS: the worktree step fires on either cause the scope worktree
  // can be absent for — `/superdev:ship` removed it, or this checkout never held it at all — not
  // only the first. A regression back to the single-cause sentence must fail on its own. ---

  const broadenedWorktreeStep =
    'Create or reattach the scope worktree, at both tiers, whenever it is absent — because ' +
    '`/superdev:ship` already removed it, or because this checkout never held it (a resumed run adopted ' +
    'from the anchor on a fresh clone) — and otherwise work in the one already there.\n';

  assert.equal(
    scanContract(fixture({ 'references/scope-mode.md': broadenedWorktreeStep }), RESUMED_WORKTREE_TRIGGER_CONTRACTS)
      .length,
    0,
    'resumed-worktree-trigger: the broadened sentence yields zero gaps',
  );

  // positive: the pre-fix-cycle, single-cause sentence (ship-removed only) fires the gap — the exact
  // regression this check exists to catch
  const narrowedWorktreeStep =
    'Work in the existing scope worktree, and reattach the branch with `git worktree ' +
    'add <path> <branch>` when `/superdev:ship` has already removed that worktree.\n';
  const narrowedGaps = scanContract(
    fixture({ 'references/scope-mode.md': narrowedWorktreeStep }),
    RESUMED_WORKTREE_TRIGGER_CONTRACTS,
  );
  assert.equal(narrowedGaps.length, 1, 'resumed-worktree-trigger: flags the narrowed, single-cause sentence');
  assert.equal(narrowedGaps[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), RESUMED_WORKTREE_TRIGGER_CONTRACTS).length,
    0,
    'resumed-worktree-trigger: absent documents are skipped',
  );

  // --- SCOPE_WORKTREE_CONTRACTS (ADR 0045): the `full` tier cuts and merges in the same scope worktree
  // the `lite` tier uses, never the invoking checkout. Five rows on scope-mode.md's `## The scope
  // checkout` and `## The run lock`, six on implement-full.md's Branch model, Merge step, integration
  // branch, Resume worktree-first step, Resume's own run-lock check, and its own run-lock pointer, one on
  // implement-lite.md's run-lock pointer, one each on run-init.md's and run-handoff.md's now-unqualified
  // `run.lock` mentions, three on skills/review/SKILL.md's §4 (the scope-checkout branch test, the full-suite
  // run's working directory, and the fix-implementer dispatch's working directory), two more on
  // run-handoff.md's own only full-suite run (its working directory, and its Red-branch fix implementer's
  // working directory), and one on merge-conflicts.md's winner-picking-overlap abort. Each is anchored on
  // text unique to its own clause, so dropping one fires exactly one gap. ---

  const scwScopeModePieces = {
    location: '`.superdev/scopes/<scope>/worktree` is the scope checkout, at both tiers.\n\n',
    recreate:
      '**Absent** → recreate it: `git worktree add .superdev/scopes/<scope>/worktree <branch>`.\n\n',
    lockNotCompeting:
      "**`run-lock` refuses the call, naming another session** → that lock is this run's own.\n\n",
    stop:
      '**A different working tree already holds `<branch>`** → say so and stop, writing nothing.\n\n',
    runLock:
      '**Write `<run-root>/run.lock` once `## Cutting the scope branch` above has cut the worktree, ' +
      'at both tiers**.\n',
  };

  const implementFullPieces = {
    branchModel:
      'every later command in this file — every merge — addresses the scope worktree, ' +
      '`.superdev/scopes/<scope>/worktree`, with `git -C`, and the invoking checkout is never switched.\n\n',
    merge:
      '**Merge (you, serially)** — in the scope worktree: `git -C .superdev/scopes/<scope>/worktree ' +
      'merge --no-ff slice/<scope>/<id>`.\n\n',
    integration:
      'cut `integration/<scope>` from `<branch>` at run start, keep it checked out **in the scope ' +
      "worktree**, and merge every slice into it. The plan's final integrate-and-verify slice is where " +
      'you switch that same scope worktree back to `<branch>`.\n\n',
    resume: '**Find the scope worktree first**, per `## The scope checkout`.\n\n',
    resumeLock:
      '**Found already present? Check the run lock before dispatching anything.** Read ' +
      '`<run-root>/run.lock`.\n\n',
    runLockPointer:
      "Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The run lock` and write " +
      '`<run-root>/run.lock` as it says.\n',
  };

  const implementLitePieces = {
    runLockPointer:
      "Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The run lock` and write " +
      '`<run-root>/run.lock` as it says.\n',
  };

  const runInitPiece =
    "The run root (`dod.md`, `ledger.md`, `run.lock`, per that file's `## The run lock`) stays in the " +
    'invoking checkout.\n';

  const runHandoffWorktreePieces = {
    lockMention:
      '**Leave the run standing.** Keep the worktrees and `<run-root>/run.lock`, leave ' +
      '`<run-root>/dod.md` unticked.\n\n',
    suiteDir:
      'Take the full command and run it once **in that checkout**, over the scope branch.\n\n',
    fixDir:
      "the controller only integrates, and lite's inline loop is that tier's own exception. Hand it " +
      'the scope checkout as its working directory: this is where its fix commits must land. Every fix ' +
      'opens with a RED test.\n',
  };

  const mergeConflictsPiece =
    'A genuine winner-picking overlap escalates: `git -C .superdev/scopes/<scope>/worktree merge ' +
    '--abort` and escalate to the human.\n';

  const reviewWorktreePieces = {
    branchTest:
      'Find the scope checkout, and refresh the run lock. **The scope checkout not on ' +
      '`<type>/<scope>`** → report that and review read-only.\n\n',
    suiteDir:
      'Run the full suite yourself. Take the full command and run it **in the scope checkout above**, ' +
      'over the scope branch.\n\n',
    fixDir:
      'Confirmed → dispatch one superdev:implementer. Hand it the scope checkout as its working ' +
      'directory: this is where its fix commits must land.\n',
  };

  // afk's eligibility bullet: the no-lock case falls back to the ledger mtime, and claims nothing about
  // which tier gets a lock — both do (ADR 0045).
  const afkLockPiece =
    'Check `.superdev/scopes/<scope>/run.lock`: newer than an hour means another session owns that ' +
    'scope. **No lock present is not by itself eligibility**: fall back to the ledger mtime.\n';

  const everyScopeWorktreeSite = {
    'references/scope-mode.md': joinAll(scwScopeModePieces),
    'references/implement-full.md': joinAll(implementFullPieces),
    'references/implement-lite.md': joinAll(implementLitePieces),
    'references/run-init.md': runInitPiece,
    'references/run-handoff.md': joinAll(runHandoffWorktreePieces),
    'references/merge-conflicts.md': mergeConflictsPiece,
    'skills/review/SKILL.md': joinAll(reviewWorktreePieces),
    'skills/afk/SKILL.md': afkLockPiece,
  };

  // A row can only be exercised by a fixture that names its document: `scanContract()` skips a document
  // it cannot read, so a missing key makes the "every clause present yields zero gaps" assertion below
  // pass without ever running that row. `./index.js`'s coverage guard names both the table and the
  // document, because "a fixture is incomplete" sends the reader hunting through twenty-one rows across
  // eight files.

  // negative: every clause present is clean
  assert.equal(
    scanContract(fixture(everyScopeWorktreeSite), SCOPE_WORKTREE_CONTRACTS).length,
    0,
    'scope-worktree: every clause present yields zero gaps',
  );

  // positive: dropping any one scope-mode.md clause fires exactly one gap naming that file
  for (const key of Object.keys(scwScopeModePieces)) {
    const remaining = Object.entries(scwScopeModePieces)
      .filter(([k]) => k !== key)
      .map(([, v]) => v)
      .join('');
    const dropped = fixture({ ...everyScopeWorktreeSite, 'references/scope-mode.md': remaining });
    const gaps = scanContract(dropped, SCOPE_WORKTREE_CONTRACTS);
    assert.equal(gaps.length, 1, `scope-worktree: flags scope-mode.md alone for dropping its "${key}" clause`);
    assert.equal(gaps[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');
  }

  // positive: dropping any one implement-full.md clause fires exactly one gap naming that file
  for (const key of Object.keys(implementFullPieces)) {
    const remaining = Object.entries(implementFullPieces)
      .filter(([k]) => k !== key)
      .map(([, v]) => v)
      .join('');
    const dropped = fixture({ ...everyScopeWorktreeSite, 'references/implement-full.md': remaining });
    const gaps = scanContract(dropped, SCOPE_WORKTREE_CONTRACTS);
    assert.equal(
      gaps.length,
      1,
      `scope-worktree: flags implement-full.md alone for dropping its "${key}" clause`,
    );
    assert.equal(gaps[0].source, path.join('references', 'implement-full.md'), 'names implement-full.md');
  }

  // positive: dropping afk.md's no-lock fallback fires exactly one gap naming that file — the shape
  // every other row in this table has, and the one the missing fixture key withheld from this row
  const droppedAfkLock = fixture({ ...everyScopeWorktreeSite, 'skills/afk/SKILL.md': '' });
  const afkLockGaps = scanContract(droppedAfkLock, SCOPE_WORKTREE_CONTRACTS);
  assert.equal(afkLockGaps.length, 1, 'scope-worktree: flags afk.md for dropping the no-lock fallback');
  assert.equal(afkLockGaps[0].source, path.join('skills', 'afk', 'SKILL.md'), 'names afk.md');

  // --- scanAfkLockTierClaim: the row above is a presence check, and its expectation describes an
  // absence — the stale "a run lock only ever exists for a `lite`-tier scope" claim can regrow as a
  // sentence preceding the surviving fallback rule while the row still matches. A presence row cannot
  // assert that, so the absence scanner does. ---

  // negative: the fallback rule alone, with no tier claim, reports nothing
  assert.equal(
    scanAfkLockTierClaim(fixture({ 'skills/afk/SKILL.md': afkLockPiece })).length,
    0,
    'afk-lock-tier: the fallback rule with no tier claim reports nothing',
  );

  // positive: the stale claim is reported wherever in the bullet it sits, including ahead of the rule
  for (const claim of [
    'A run lock only ever exists for a `lite`-tier scope, so its absence says nothing on a full run.\n',
    'The lock is written only for a `lite` tier scope.\n',
    'A run.lock exists only for a lite-tier scope.\n',
  ]) {
    for (const text of [claim + afkLockPiece, afkLockPiece + claim]) {
      const gaps = scanAfkLockTierClaim(fixture({ 'skills/afk/SKILL.md': text }));
      assert.equal(gaps.length, 1, `afk-lock-tier: reports the stale claim "${claim.trim()}"`);
      assert.equal(gaps[0].source, path.join('skills', 'afk', 'SKILL.md'), 'names afk.md');
      assert.match(gaps[0].expectation, /both tiers/, 'names what is true instead');
    }
  }

  // positive: a sibling command file carrying the same sentence is unaffected — this scanner is scoped
  // to the one document whose eligibility bullet reads the lock
  assert.equal(
    scanAfkLockTierClaim(fixture({
      'skills/review/SKILL.md': 'A run lock only ever exists for a `lite`-tier scope.\n',
      'skills/afk/SKILL.md': afkLockPiece,
    })).length,
    0,
    'afk-lock-tier: a sibling command file is unaffected',
  );

  // positive: dropping the implement-lite.md run-lock pointer fires exactly one gap naming that file —
  // the sentence it exists to catch is a reintroduced restatement of who writes the lock and when
  const droppedLitePointer = fixture({ ...everyScopeWorktreeSite, 'references/implement-lite.md': '' });
  const liteGaps = scanContract(droppedLitePointer, SCOPE_WORKTREE_CONTRACTS);
  assert.equal(liteGaps.length, 1, 'scope-worktree: flags implement-lite.md for dropping the run-lock pointer');
  assert.equal(liteGaps[0].source, path.join('references', 'implement-lite.md'), 'names implement-lite.md');

  // positive: dropping run-init.md's unqualified `run.lock` mention fires exactly one gap naming it —
  // the sentence it exists to catch is a reintroduced `— lite tier only` qualifier
  const droppedRunInit = fixture({ ...everyScopeWorktreeSite, 'references/run-init.md': '' });
  const runInitGaps = scanContract(droppedRunInit, SCOPE_WORKTREE_CONTRACTS);
  assert.equal(runInitGaps.length, 1, 'scope-worktree: flags run-init.md for dropping the unqualified mention');
  assert.equal(runInitGaps[0].source, path.join('references', 'run-init.md'), 'names run-init.md');

  // positive: dropping any one run-handoff.md clause (the unqualified `run.lock` mention, its own
  // full-suite working directory, or its Red-branch fix implementer's working directory) fires exactly
  // one gap naming that file
  for (const key of Object.keys(runHandoffWorktreePieces)) {
    const remaining = Object.entries(runHandoffWorktreePieces)
      .filter(([k]) => k !== key)
      .map(([, v]) => v)
      .join('');
    const dropped = fixture({ ...everyScopeWorktreeSite, 'references/run-handoff.md': remaining });
    const gaps = scanContract(dropped, SCOPE_WORKTREE_CONTRACTS);
    assert.equal(gaps.length, 1, `scope-worktree: flags run-handoff.md alone for dropping its "${key}" clause`);
    assert.equal(gaps[0].source, path.join('references', 'run-handoff.md'), 'names run-handoff.md');
  }

  // positive: dropping merge-conflicts.md's scope-worktree abort fires exactly one gap naming it — the
  // sentence it exists to catch is a reintroduced bare `git merge --abort`
  const droppedMergeConflicts = fixture({ ...everyScopeWorktreeSite, 'references/merge-conflicts.md': '' });
  const mergeConflictsGaps = scanContract(droppedMergeConflicts, SCOPE_WORKTREE_CONTRACTS);
  assert.equal(mergeConflictsGaps.length, 1, 'scope-worktree: flags merge-conflicts.md for dropping the scope-worktree abort');
  assert.equal(
    mergeConflictsGaps[0].source,
    path.join('references', 'merge-conflicts.md'),
    'names merge-conflicts.md',
  );

  // positive: dropping any one skills/review/SKILL.md clause fires exactly one gap naming that file
  for (const key of Object.keys(reviewWorktreePieces)) {
    const remaining = Object.entries(reviewWorktreePieces)
      .filter(([k]) => k !== key)
      .map(([, v]) => v)
      .join('');
    const dropped = fixture({ ...everyScopeWorktreeSite, 'skills/review/SKILL.md': remaining });
    const gaps = scanContract(dropped, SCOPE_WORKTREE_CONTRACTS);
    assert.equal(gaps.length, 1, `scope-worktree: flags skills/review/SKILL.md alone for dropping its "${key}" clause`);
    assert.equal(gaps[0].source, path.join('skills', 'review', 'SKILL.md'), 'names skills/review/SKILL.md');
  }

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), SCOPE_WORKTREE_CONTRACTS).length,
    0,
    'scope-worktree: absent documents are skipped',
  );

  // --- DENIAL_AUTHORSHIP_CONTRACTS: the unattended block fires on authorship, not on the denial, and
  // every document that dispatches a verification pass carries that condition. A call site left reading
  // "unattended → block" wins the conflict as the later instruction, so the central rule goes inert. ---

  const definesAuthorship =
    '## Degraded passes\n\nA denied verification dispatch blocks unattended when the controller authored\n' +
    "what the pass verifies. Derive the tier from the ledger's slice rows.\n";
  const carriesAuthorship =
    'A denied reviewer dispatch: block unattended where the controller authored the code under review,\n' +
    'and otherwise review inline and record the entry.\n';
  const everyDispatcher = {
    'references/scope-mode.md': definesAuthorship,
    'skills/review/SKILL.md': carriesAuthorship,
    'skills/document/SKILL.md': carriesAuthorship,
    'skills/implement/SKILL.md': carriesAuthorship,
    'references/implement-full.md': carriesAuthorship,
  };
  const authorshipOpts = { stripFrontmatterFirst: true };

  // negative: the rule stated centrally and carried by every dispatcher is clean
  assert.equal(
    scanContract(fixture(everyDispatcher), DENIAL_AUTHORSHIP_CONTRACTS, authorshipOpts).length,
    0,
    'the rule plus every dispatching document yields zero gaps',
  );

  // positive: each dispatcher is checked on its own, because one call site reverting to an unconditional
  // block is exactly the one-sided pin ADR 0035 names — the central rule reads enforced and never fires
  for (const rel of [
    'skills/review/SKILL.md',
    'skills/document/SKILL.md',
    'skills/implement/SKILL.md',
    'references/implement-full.md',
  ]) {
    const reverted = fixture({
      ...everyDispatcher,
      [rel]: '# doc\n\nA denied dispatch: `--unattended` → block.\n',
    });
    const gaps = scanContract(reverted, DENIAL_AUTHORSHIP_CONTRACTS, authorshipOpts);
    assert.equal(gaps.length, 1, `flags ${rel} for reverting to an unconditional block`);
    assert.equal(gaps[0].source, rel.split('/').join(path.sep), `names ${rel}`);
  }

  // positive: the section keeps the condition but drops which dispatches it governs, so a denied
  // implementer reads as covered by it — the one dispatch ADR 0001 keeps blocking at every tier
  const noVerificationScope = fixture({
    ...everyDispatcher,
    'references/scope-mode.md':
      'A denied dispatch blocks unattended when the controller authored what it verifies.\n' +
      "Derive the tier from the ledger's slice rows.\n",
  });
  const scopeGaps = scanContract(noVerificationScope, DENIAL_AUTHORSHIP_CONTRACTS, authorshipOpts);
  assert.equal(scopeGaps.length, 1, 'flags a rule that never says which dispatches it governs');
  assert.match(scopeGaps[0].expectation, /verification dispatches/, 'names the missing scoping');

  // positive: the condition with no way to evaluate it is advice — the tier derivation is what makes the
  // test read run state instead of the controller's memory of what it did
  const noTierRule = fixture({
    ...everyDispatcher,
    'references/scope-mode.md':
      'A denied verification dispatch blocks unattended when the controller authored what it verifies.\n',
  });
  const tierGaps = scanContract(noTierRule, DENIAL_AUTHORSHIP_CONTRACTS, authorshipOpts);
  assert.equal(tierGaps.length, 1, 'flags a condition with no derivation behind it');
  assert.match(tierGaps[0].expectation, /slice rows/, 'names the missing tier derivation');

  // --- DENIAL_CAP_CONTRACTS: an unattended run blocks on its second denied verification dispatch, and
  // the cap is only real where the recording call sites feed the count it reads (ADR 0041). ---

  const definesCap =
    '## Degraded passes\n\nAn unattended run blocks on its second denied verification dispatch. Record\n' +
    'each with `scope.js degraded add-denial`, then read `scope.js get denials`.\n';
  // `review.md`/`document.md`/`implement.md`/`implement-full.md` each dispatch an authoring pass
  // (a fix implementer, `doc-writer`, an implementer) alongside a verification one, so their carrier ties
  // the plain verb to the authoring dispatch by name. Neither restates the cap's own number — it defers to
  // `references/scope-mode.md` by name instead.
  const carriesCap =
    'Record an authoring dispatch with `scope.js degraded add`. Record the verification-dispatch denial\n' +
    'with `scope.js degraded add-denial`, then read `scope.js get denials`: block once the count reaches\n' +
    'that cap.\n';
  // `implement-full.md` alone dispatches both `slice-reviewer` (the tier's one verification dispatch) and
  // `simplicity-reviewer` (advisory), so it alone narrows the cap to the former by name.
  const carriesFullCap = carriesCap + 'A denied simplicity-reviewer stays outside that cap.\n';
  const everyRecorder = {
    'references/scope-mode.md': definesCap,
    'skills/review/SKILL.md': carriesCap,
    'skills/document/SKILL.md': carriesCap,
    'skills/implement/SKILL.md': carriesCap,
    'references/implement-full.md': carriesFullCap,
  };
  const capOpts = { stripFrontmatterFirst: true };

  // negative: the cap stated centrally and fed by every recorder is clean
  assert.equal(
    scanContract(fixture(everyRecorder), DENIAL_CAP_CONTRACTS, capOpts).length,
    0,
    'the cap plus every recording call site yields zero gaps',
  );

  // positive: a call site reverting to plain `degraded add` writes a bullet the count cannot see, so the
  // cap never fires and the run rides on to the platform's own kill
  for (const rel of [
    'skills/review/SKILL.md',
    'skills/document/SKILL.md',
    'skills/implement/SKILL.md',
    'references/implement-full.md',
  ]) {
    const plainAdd = fixture({
      ...everyRecorder,
      [rel]: 'Record the denial with `scope.js degraded add`, then read `scope.js get denials`.\n',
    });
    const gaps = scanContract(plainAdd, DENIAL_CAP_CONTRACTS, capOpts);
    assert.ok(gaps.length >= 1, `flags ${rel} for recording with the verb the count cannot see`);
    assert.ok(
      gaps.some((g) => g.source === rel.split('/').join(path.sep) && /add-denial/.test(g.expectation)),
      `names ${rel} for the missing add-denial verb`,
    );
  }

  // positive: a call site that records but never reads the count continues inline on every denial, which
  // is the behaviour the cap exists to bound
  for (const rel of [
    'skills/review/SKILL.md',
    'skills/document/SKILL.md',
    'skills/implement/SKILL.md',
    'references/implement-full.md',
  ]) {
    const noRead = fixture({
      ...everyRecorder,
      [rel]: 'Record the denial with `scope.js degraded add-denial`, then do the pass inline.\n',
    });
    const gaps = scanContract(noRead, DENIAL_CAP_CONTRACTS, capOpts);
    assert.ok(gaps.length >= 1, `flags ${rel} for continuing without reading the count`);
    assert.ok(
      gaps.some((g) => g.source === rel.split('/').join(path.sep)),
      `names ${rel}`,
    );
  }

  // positive: the verbs present centrally with no number behind them is machinery with no rule — the cap
  // is the one fact a reader cannot derive from the two calls
  const noNumber = fixture({
    ...everyRecorder,
    'references/scope-mode.md':
      'Record each denial with `scope.js degraded add-denial`, then read `scope.js get denials`.\n',
  });
  const numberGaps = scanContract(noNumber, DENIAL_CAP_CONTRACTS, capOpts);
  assert.equal(numberGaps.length, 1, 'flags a rule that never states where the cap falls');
  assert.match(numberGaps[0].expectation, /second denied verification dispatch/, 'names the missing cap');

  // positive (finding 1): a call site that never ties the plain `add` verb to an authoring dispatch by
  // name reads as if every denial in its own breath is a classifier denial — which it always is in
  // context — so a denied implementer/fix/doc-writer would wrongly feed the count too
  const untiedText =
    'Record the denial with `scope.js degraded add-denial`, then read `scope.js get denials`: block once\n' +
    'the count reaches that cap.\n';
  for (const rel of [
    'skills/review/SKILL.md',
    'skills/document/SKILL.md',
    'skills/implement/SKILL.md',
    'references/implement-full.md',
  ]) {
    const untied = fixture({
      ...everyRecorder,
      [rel]: untiedText + (rel === path.join('references', 'implement-full.md')
        ? 'A denied simplicity-reviewer stays outside that cap.\n'
        : ''),
    });
    const gaps = scanContract(untied, DENIAL_CAP_CONTRACTS, capOpts);
    assert.equal(gaps.length, 1, `flags ${rel} for never tying the plain verb to an authoring dispatch`);
    assert.equal(gaps[0].source, rel.split('/').join(path.sep), `names ${rel}`);
    assert.match(gaps[0].expectation, /authoring dispatch/, 'names the missing tie');
  }

  // positive (finding 2): implement-full.md never narrowing the cap to `slice-reviewer` alone reads as if
  // a denied `simplicity-reviewer` — advisory, and outside the closed set of verification dispatches —
  // counts toward the two-denial cap too
  const noNarrow = fixture({
    ...everyRecorder,
    'references/implement-full.md': carriesCap,
  });
  const narrowGaps = scanContract(noNarrow, DENIAL_CAP_CONTRACTS, capOpts);
  assert.equal(narrowGaps.length, 1, 'flags implement-full.md for never narrowing the cap to slice-reviewer');
  assert.equal(narrowGaps[0].source, path.join('references', 'implement-full.md'), 'names implement-full.md');
  assert.match(narrowGaps[0].expectation, /never counts toward it/, 'names the missing narrowing');

  // --- scanDenialCapNumberSilence (finding 3, prose half): a call site must never restate the cap's own
  // number — it can drift to a different one ("three or more") while every row above still matches. ---

  // negative: every call site defers to scope-mode.md by name, restating no number of its own
  assert.equal(
    scanDenialCapNumberSilence(fixture(everyRecorder)).length,
    0,
    'no call site restates the cap number',
  );

  // positive: a call site restating the number — even the correct one — is what the platform's own
  // three-denial kill silently outraces the day it drifts to a different one
  for (const rel of [
    'skills/review/SKILL.md',
    'skills/document/SKILL.md',
    'skills/implement/SKILL.md',
    'references/implement-full.md',
  ]) {
    const restatesNumber = fixture({
      ...everyRecorder,
      [rel]: (everyRecorder[rel] + 'Two or more blocks; one continues inline.\n'),
    });
    const gaps = scanDenialCapNumberSilence(restatesNumber);
    assert.equal(gaps.length, 1, `flags ${rel} for restating the cap's own number`);
    assert.equal(gaps[0].source, rel.split('/').join(path.sep), `names ${rel}`);
    assert.match(gaps[0].expectation, /scope-mode\.md/, 'points back at the single source of truth');
  }

  // positive (finding 4): "two or more" is not the only shape a restatement takes — "second denial",
  // "cap is two", and "at two denials" are the phrasings a call site is most likely to reach for instead
  for (const phrase of ['Block on the second denial.\n', 'The cap is two.\n', 'Block at two denials.\n']) {
    const restatesShape = fixture({
      ...everyRecorder,
      'skills/review/SKILL.md': everyRecorder['skills/review/SKILL.md'] + phrase,
    });
    const gaps = scanDenialCapNumberSilence(restatesShape);
    assert.equal(gaps.length, 1, `flags "${phrase.trim()}" for restating the cap's own number`);
    assert.match(gaps[0].expectation, /scope-mode\.md/, 'points back at the single source of truth');
  }

  // --- DENIAL_RESET_CONTRACTS: the cap above has a way back, and it is only reachable where the two
  // documents state it — the section defining the cap, and the block a capped run leaves (ADR 0044). ---

  const definesReset =
    '## Degraded passes\n\nAn unattended run blocks on its second denied verification dispatch.\n' +
    "`scope.js degraded reset-denials '<reason>' --root <run-root>` returns the budget: the count runs\n" +
    'from the last reset marker, so every recorded denial survives it. A reset is a human act, and no\n' +
    'command in the chain performs one.\n\n' +
    '## Unattended\n\nBlocking means: comment on the anchor naming the stop reached and why.\n' +
    'BLOCK_NAMES_RESET\n';
  const blockNamesReset =
    'A block at the cap names `scope.js degraded reset-denials` in that comment, so the maintainer who\n' +
    'fixed the cause finds the way back where they are already reading.';
  const resetOpts = { stripFrontmatterFirst: true };

  // negative: both halves stated is clean
  assert.equal(
    scanContract(
      fixture({ 'references/scope-mode.md': definesReset.replace('BLOCK_NAMES_RESET', blockNamesReset) }),
      DENIAL_RESET_CONTRACTS,
      resetOpts,
    ).length,
    0,
    'the reset stated beside the cap and named by the block yields zero gaps',
  );

  // positive: the section dropping the reset leaves a cap with no way back — the run that hits it can
  // only finish attended, which is what the reset exists to prevent
  const noReset = fixture({
    'references/scope-mode.md':
      '## Degraded passes\n\nAn unattended run blocks on its second denied verification dispatch.\n\n' +
      '## Unattended\n\nBlocking means: comment on the anchor naming the stop reached and why.\n',
  });
  const resetGaps = scanContract(noReset, DENIAL_RESET_CONTRACTS, resetOpts);
  assert.ok(resetGaps.length >= 1, 'flags a section that states the cap and never states the reset');
  assert.ok(
    resetGaps.every((g) => g.source === path.join('references', 'scope-mode.md')),
    'names the document',
  );
  assert.ok(
    resetGaps.some((g) => /reset-denials/.test(g.expectation)),
    'names the missing reset command',
  );

  // positive: a block procedure that stops naming the reset command strands the maintainer who fixed the
  // cause — the quoted refusal is right there, and the way back is nowhere
  const blockSilent = fixture({
    'references/scope-mode.md': definesReset.replace('BLOCK_NAMES_RESET', ''),
  });
  const blockGaps = scanContract(blockSilent, DENIAL_RESET_CONTRACTS, resetOpts);
  assert.equal(blockGaps.length, 1, 'flags a block procedure that never names the reset command');
  assert.equal(blockGaps[0].source, path.join('references', 'scope-mode.md'), 'names the document');
  assert.match(blockGaps[0].expectation, /block/, 'names the block as the place it belongs');

  // --- CHANGE_TYPE_CONTRACTS: the change-type set the prose lists and the set the scope-prune hook
  // matches are the same fact in two syntaxes, in two files. ---

  // positive from each side: dropping a type from either list alone is drift, and a run root left behind
  // for a type the hook stopped recognising is silent — no prune ever reports the one it skipped
  const type1 = fixture({
    'references/scope-mode.md': 'one of `feat`, `fix`, `refactor`, `docs`, `perf`, `test`.\n',
  });
  const typeGaps1 = scanContract(type1, CHANGE_TYPE_CONTRACTS);
  assert.equal(typeGaps1.length, 1, 'flags a prose list the hook no longer matches');
  assert.equal(typeGaps1[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');

  const type2 = fixture({
    'hooks/scope-prune.js': 'const CHANGE_TYPES = /^(feat|fix)$/;\n',
  });
  const typeGaps2 = scanContract(type2, CHANGE_TYPE_CONTRACTS);
  assert.equal(typeGaps2.length, 1, 'flags the hook narrowing away from the stated set');
  assert.equal(typeGaps2[0].source, path.join('hooks', 'scope-prune.js'), 'names scope-prune.js');

  // and from scope.js's side: this copy executes, validating every `init` label against it, but
  // nothing else notices it narrowing away from the stated set
  const type5 = fixture({
    'scripts/scope.js': "const CHANGE_TYPES = ['feat', 'fix'];\n",
  });
  const typeGaps5 = scanContract(type5, CHANGE_TYPE_CONTRACTS);
  assert.equal(typeGaps5.length, 1, 'flags scope.js narrowing CHANGE_TYPES away from the stated set');
  assert.equal(typeGaps5[0].source, path.join('scripts', 'scope.js'), 'names scope.js');

  // and from the glossary's side: nothing executes that copy, so only this row notices it drifting
  const type3 = fixture({
    'CONTEXT.md': '**Change type** — one of `feat`, `fix`, or `docs`.\n',
  });
  const typeGaps3 = scanContract(type3, CHANGE_TYPE_CONTRACTS);
  assert.equal(typeGaps3.length, 1, 'flags a glossary entry that drifted from the owned set');
  assert.equal(typeGaps3[0].source, 'CONTEXT.md', 'names CONTEXT.md');

  // negative: doc-writer may legitimately re-wrap the glossary line at a different comma than today's —
  // the same eleven types, in order, must stay clean regardless of where the line break falls
  const type4 = fixture({
    'CONTEXT.md':
      '**Change type** — one of `feat`, `fix`, `refactor`,\n`docs`, `perf`, `test`, `build`, `ci`,\n`chore`, `style`, or\n`revert`.\n',
  });
  assert.equal(
    scanContract(type4, CHANGE_TYPE_CONTRACTS).length,
    0,
    'a re-wrapped but correct glossary line stays clean',
  );

  // --- DERIVED_CRITERIA_CONTRACTS: the dispatch hands a path and the reviewer derives before reading.
  // Both halves are needed for the ordering to be real, and losing either one is silent. ---

  // positive: reverting the dispatch to inlining the DoD text is caught
  const dc1 = fixture({
    'skills/review/SKILL.md': 'take `<run-root>/dod.md` as the `acceptance` for both reviewers.\n',
  });
  const dcGaps1 = scanContract(dc1, DERIVED_CRITERIA_CONTRACTS);
  assert.equal(dcGaps1.length, 1, 'flags a dispatch that inlines the DoD instead of handing its path');
  assert.equal(dcGaps1[0].source, path.join('skills', 'review', 'SKILL.md'), 'names review.md');

  // positive from the reviewer's side: dropping the derivation step is the same drift
  const dc2 = fixture({
    'agents/final-reviewer.md': '## What to check\n\nFirst, the **gate**.\n',
  });
  const dcGaps2 = scanContract(dc2, DERIVED_CRITERIA_CONTRACTS);
  assert.equal(dcGaps2.length, 1, 'flags a reviewer that lost its derive-before-reading step');
  assert.equal(dcGaps2[0].source, path.join('agents', 'final-reviewer.md'), 'names final-reviewer.md');

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), DERIVED_CRITERIA_CONTRACTS).length,
    0,
    'absent files are skipped',
  );

  // --- LABEL_VALIDATION_CONTRACTS: both segments of a feature label reach git, so both are validated,
  // and every command that builds a path or a branch out of one points at the rule. ---

  // positive: a rule that guards the slug alone leaves the type segment reaching `git switch -c`
  const lv1 = fixture({
    'references/scope-mode.md': 'validate the slug segment — what follows the first `/` — and not the label as a whole.\n',
  });
  const lvGaps1 = scanContract(lv1, LABEL_VALIDATION_CONTRACTS);
  assert.equal(lvGaps1.length, 1, 'flags a rule that stopped validating the leading segment');
  assert.equal(lvGaps1[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');

  // positive from a consumer's side: a command that stopped pointing at the rule validates nothing
  const lv2 = fixture({ 'skills/afk/SKILL.md': '# superdev afk\n\nSelect the next scope anchor.\n' });
  const lvGaps2 = scanContract(lv2, LABEL_VALIDATION_CONTRACTS);
  assert.equal(lvGaps2.length, 1, 'flags a consumer that dropped its wire to the rule');
  assert.equal(lvGaps2[0].source, path.join('skills', 'afk', 'SKILL.md'), 'names afk.md');

  // positive from the other consumer's side: implement.md dropping its wire is the same drift
  const lvImplement = fixture({
    'skills/implement/SKILL.md': '# superdev implement\n\nDerive the scope from the resolved feature label.\n',
  });
  const lvImplementGaps = scanContract(lvImplement, LABEL_VALIDATION_CONTRACTS);
  assert.equal(lvImplementGaps.length, 1, 'flags implement.md that dropped its wire to the rule');
  assert.equal(lvImplementGaps[0].source, path.join('skills', 'implement', 'SKILL.md'), 'names implement.md');

  // positive, the weaker revert: a consumer that reverted to the pre-change slug-only wording keeps its
  // wire to `scope-mode.md`'s scope-slug rule intact but never asserts both segments are validated — the
  // exact text `skills/afk/SKILL.md` carried before this scope, which a whole-file revert would restore
  const lv3 = fixture({
    'skills/afk/SKILL.md':
      "**Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s scope-slug rule before you go on.**\n\n" +
      "- Its feature label matches that scope-slug rule. A label that fails it is skipped (below),\n",
  });
  const lvGaps3 = scanContract(lv3, LABEL_VALIDATION_CONTRACTS);
  assert.equal(lvGaps3.length, 1, 'flags a consumer reverted to slug-only wording, wire intact');
  assert.equal(lvGaps3[0].source, path.join('skills', 'afk', 'SKILL.md'), 'names afk.md');

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), LABEL_VALIDATION_CONTRACTS).length,
    0,
    'absent files are skipped',
  );

  // --- GREEN_GATE_TIMEOUT_CONTRACTS: hooks.json's green-gate timeout and green-gate.js's own comment
  // name the same number, in two files. ---

  // positive from the hooks.json side: a green-gate entry that lost its `timeout` field is drift — the
  // ceiling the suite runs under stops being stated where the suite runs
  const ggt1 = fixture({
    'hooks/hooks.json': '"command": "node \\"${CLAUDE_PLUGIN_ROOT}/hooks/green-gate.js\\""\n',
  });
  const ggtGaps1 = scanContract(ggt1, GREEN_GATE_TIMEOUT_CONTRACTS);
  assert.equal(ggtGaps1.length, 1, 'flags a hooks.json entry that lost its `timeout`');
  assert.equal(ggtGaps1[0].source, path.join('hooks', 'hooks.json'), 'names hooks.json');

  // positive from the green-gate.js side: a comment that names neither the ceiling nor the default it
  // is — both green-gate.js rows are gaps
  const ggt2 = fixture({
    'hooks/green-gate.js': "// the suite runs inside the hook, under Claude Code's default hook timeout.\n",
  });
  const ggtGaps2 = scanContract(ggt2, GREEN_GATE_TIMEOUT_CONTRACTS);
  assert.equal(ggtGaps2.length, 2, 'flags a comment that names neither the 600s timeout nor the default');
  assert.deepEqual(
    [...new Set(ggtGaps2.map((g) => g.source))],
    [path.join('hooks', 'green-gate.js')],
    'names green-gate.js',
  );

  // positive, the false-default regression (#268): the comment names the 600s ceiling correctly but
  // attributes it to the wrong platform default — 60s is the `agent` default, not the `command` one. The
  // ceiling row passes and the default row alone flags, so a consumer is not sent to the wrong knob.
  const ggtWrongDefault = fixture({
    'hooks/green-gate.js':
      "// the suite runs inside the hook, under the 600s `timeout` hooks.json sets on this\n" +
      "// hook's entry (Claude Code's own default hook timeout is 60s).\n",
  });
  const ggtGapsWrongDefault = scanContract(ggtWrongDefault, GREEN_GATE_TIMEOUT_CONTRACTS);
  assert.equal(ggtGapsWrongDefault.length, 1, 'flags a comment that names a wrong platform default');
  assert.equal(
    ggtGapsWrongDefault[0].expectation,
    "identify the 600s ceiling as Claude Code's own default for a `command` hook",
    'and names the default row, not the ceiling row',
  );

  // positive from the hooks.json side, numeric near-miss: `600` as a bare token must not match inside
  // `6000` — a hooks.json entry that drifted to 6s0000ms is still drift, not a false pass
  const ggt3 = fixture({
    'hooks/hooks.json':
      '"command": "node \\"${CLAUDE_PLUGIN_ROOT}/hooks/green-gate.js\\"",\n"timeout": 6000\n',
  });
  const ggtGaps3 = scanContract(ggt3, GREEN_GATE_TIMEOUT_CONTRACTS);
  assert.equal(ggtGaps3.length, 1, 'flags a hooks.json `timeout` of 6000 as drift, not a 600 near-miss');
  assert.equal(ggtGaps3[0].source, path.join('hooks', 'hooks.json'), 'names hooks.json');

  // order-tolerant: `"timeout"` ahead of `"command"` in the entry is not drift
  const ggt4 = fixture({
    'hooks/hooks.json':
      '"timeout": 600,\n"command": "node \\"${CLAUDE_PLUGIN_ROOT}/hooks/green-gate.js\\""\n',
  });
  assert.equal(
    scanContract(ggt4, GREEN_GATE_TIMEOUT_CONTRACTS).length,
    0,
    'a green-gate entry with `timeout` before `command` is not drift',
  );

  // prev-sibling false-pass: current pattern uses [\s\S]{0,120} backward window that reaches across
  // entry boundaries, falsely matching a PREVIOUS entry's timeout even if green-gate entry lacks one.
  // The corrected pattern bounds the backward direction on "type": to stop at entry starts.
  const ggtPrevSibling = fixture({
    'hooks/hooks.json':
      '"type": "command",\n' +
      '"timeout": 600,\n' +
      '"command": "node \\"some-hook.js\\""\n' +
      '},\n' +
      '{\n' +
      '"type": "command",\n' +
      '"command": "node \\"${CLAUDE_PLUGIN_ROOT}/hooks/green-gate.js\\""\n',
  });
  const ggtGapsPrevSibling = scanContract(ggtPrevSibling, GREEN_GATE_TIMEOUT_CONTRACTS);
  assert.equal(
    ggtGapsPrevSibling.length,
    1,
    'prev-sibling: flags when green-gate entry lacks timeout despite previous entry having one',
  );
  assert.equal(ggtGapsPrevSibling[0].source, path.join('hooks', 'hooks.json'), 'names hooks.json');

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), GREEN_GATE_TIMEOUT_CONTRACTS).length,
    0,
    'absent files are skipped',
  );

  // --- VERB_CONTRACTS: every chain document invokes its scope.js verb (ADR 0022). A document that
  // drops its verb goes back to hand-editing or hand-parsing the ledger, and the ledger-guard hook only
  // sees tool calls at runtime, not prose. ---

  // positive: a status.md that renders the report itself instead of running the verb
  const vc1 = fixture({
    'skills/status/SKILL.md': 'Read each ledger and print one block per scope.\n',
  });
  const vcGaps1 = scanContract(vc1, VERB_CONTRACTS);
  assert.equal(vcGaps1.length, 1, 'flags a chain document that stopped invoking its verb');
  assert.equal(vcGaps1[0].source, path.join('skills', 'status', 'SKILL.md'), 'names status.md');

  // positive: naming scope.js without the verb is not enough — the pattern pins verb and argument
  const vc2 = fixture({
    'skills/document/SKILL.md': 'Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js` when done.\n',
  });
  const vcGaps2 = scanContract(vc2, VERB_CONTRACTS);
  // Two, because `skills/document/SKILL.md` carries two rows: its stage write and its read of the
  // inline-doc-pass record (ADR 0031). A bare mention satisfies neither.
  assert.equal(vcGaps2.length, 2, 'a bare scope.js mention without the verb is still a gap');

  // negative: the full invocation with the plugin-root path prefix satisfies the row — both of
  // `skills/document/SKILL.md`'s rows, so the fixture carries both invocations
  const vc3 = fixture({
    'skills/document/SKILL.md':
      'Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js stage set documented --root <run-root>`.\n' +
      'Read it first with `node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js get docs --root <run-root>`.\n',
  });
  assert.equal(scanContract(vc3, VERB_CONTRACTS).length, 0, 'a full verb invocation is clean');

  // positive: run-init.md creates the run root and ledger by hand instead of running the verb
  const vcRunInit = fixture({
    'references/run-init.md': 'Create the run root directory and write a ledger header by hand.\n',
  });
  const vcRunInitGaps = scanContract(vcRunInit, VERB_CONTRACTS);
  assert.equal(vcRunInitGaps.length, 1, 'flags run-init.md for creating the run root without `scope.js init`');
  assert.equal(vcRunInitGaps[0].source, path.join('references', 'run-init.md'), 'names run-init.md');

  // positive: afk.md reads a scope's stage from the ledger directly
  const vcAfk = fixture({
    'skills/afk/SKILL.md': 'Read the ledger header to find the stage.\n',
  });
  const vcAfkGaps = scanContract(vcAfk, VERB_CONTRACTS);
  assert.equal(vcAfkGaps.length, 1, 'flags afk.md for reading the stage without `scope.js get stage`');
  assert.equal(vcAfkGaps[0].source, path.join('skills', 'afk', 'SKILL.md'), 'names afk.md');

  // positive: implement-full.md moves a slice row by hand-editing plan.md
  const vcImplementFull = fixture({
    'references/implement-full.md': 'Edit plan.md to move the slice row to Done.\n',
  });
  const vcImplementFullGaps = scanContract(vcImplementFull, VERB_CONTRACTS);
  assert.equal(vcImplementFullGaps.length, 1, 'flags implement-full.md for moving slice rows without `scope.js slice`');
  assert.equal(vcImplementFullGaps[0].source, path.join('references', 'implement-full.md'), 'names implement-full.md');

  // positive: implement-lite.md drops both its verbs — moving the slice row and recording its doc pass
  const vcImplementLite = fixture({
    'references/implement-lite.md': 'Edit plan.md to move the slice row, and note that the doc pass ran.\n',
  });
  const vcImplementLiteGaps = scanContract(vcImplementLite, VERB_CONTRACTS);
  assert.equal(vcImplementLiteGaps.length, 2, 'flags implement-lite.md for dropping both `scope.js slice` and `scope.js docs set`');
  assert.ok(
    vcImplementLiteGaps.every((g) => g.source === path.join('references', 'implement-lite.md')),
    'both gaps name implement-lite.md',
  );

  // positive: scope-mode.md's degraded-pass section writes the ledger entry by hand
  const vcScopeMode = fixture({
    'references/scope-mode.md': '## Degraded passes\n\nAppend a `**Degraded:**` line to the ledger by hand.\n',
  });
  const vcScopeModeGaps = scanContract(vcScopeMode, VERB_CONTRACTS);
  assert.equal(vcScopeModeGaps.length, 1, 'flags scope-mode.md for writing the degrade entry without `scope.js degraded add`');
  assert.equal(vcScopeModeGaps[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');

  // positive: publish-kb.md checks the scope branch some other way than the verb
  const vcPublishKb = fixture({
    'skills/publish-kb/SKILL.md': 'Confirm the scope branch is merged before staging any page.\n',
  });
  const vcPublishKbGaps = scanContract(vcPublishKb, VERB_CONTRACTS);
  assert.equal(vcPublishKbGaps.length, 1, 'flags publish-kb.md for reading the scope branch without `scope.js get branch`');
  assert.equal(vcPublishKbGaps[0].source, path.join('skills', 'publish-kb', 'SKILL.md'), 'names publish-kb.md');

  // positive: plan.md reconstructs the scope branch from the label instead of reading it
  const vcPlan = fixture({
    'skills/plan/SKILL.md': 'Build the branch name from `<type>/<scope>` for the append refusal.\n',
  });
  const vcPlanGaps = scanContract(vcPlan, VERB_CONTRACTS);
  assert.equal(vcPlanGaps.length, 1, 'flags plan.md for reconstructing the branch instead of `scope.js get branch --root`');
  assert.equal(vcPlanGaps[0].source, path.join('skills', 'plan', 'SKILL.md'), 'names plan.md');

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), VERB_CONTRACTS).length,
    0,
    'absent files are skipped',
  );

  // positive: review.md and run-handoff.md keep their other verbs but drop the `unresolved add`/
  // `unresolved clear` pair, going back to hand-editing or hand-parsing the ledger's `**Unresolved:**` line
  const uvReview = fixture({
    'skills/review/SKILL.md':
      'Write its stage with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set reviewed --root <run-root>`. ' +
      'Read the anchor title with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get anchor --root <run-root>`. ' +
      'Clear the doc record with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" docs clear --root <run-root>`.\n',
  });
  const uvReviewGaps = scanContract(uvReview, VERB_CONTRACTS);
  assert.equal(
    uvReviewGaps.length,
    3,
    'flags review.md for dropping both unresolved verbs and `deferred add` (ADR 0035)',
  );
  assert.ok(
    uvReviewGaps.every((g) => g.source === path.join('skills', 'review', 'SKILL.md')),
    'all three gaps name review.md',
  );

  const uvImplement = fixture({
    'references/run-handoff.md':
      'Record slice completion with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set merged --root <run-root>`.\n',
  });
  const uvImplementGaps = scanContract(uvImplement, VERB_CONTRACTS);
  assert.equal(uvImplementGaps.length, 2, 'flags run-handoff.md for dropping both unresolved verbs');
  assert.ok(
    uvImplementGaps.every((g) => g.source === path.join('references', 'run-handoff.md')),
    'both gaps name run-handoff.md',
  );

  // negative: review.md carrying all six of its rows — both unresolved verbs and `deferred add` — is clean
  const uvClean = fixture({
    [path.join('skills', 'review', 'SKILL.md')]:
      'Write its stage with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set reviewed --root <run-root>`. ' +
      'Read the anchor title with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get anchor --root <run-root>`. ' +
      'Write it with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved add "<text>" --root <run-root>`. ' +
      'On a clean verdict, `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved clear --root <run-root>`. ' +
      'A deferred finding goes to `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" deferred add "<text>" --root <run-root>`. ' +
      'A fix cycle that committed also runs `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" docs clear --root <run-root>`.\n',
  });
  assert.equal(
    scanContract(uvClean, VERB_CONTRACTS).length,
    0,
    'a review.md carrying all its verbs, including both unresolved ones and `deferred add`, is clean',
  );

  // The deferred record's two halves, pinned separately (ADR 0035): the review writes the bullet and the
  // ship reads it back for the pull-request body. Either half alone leaves a record nobody sees — an
  // unwritten one, or one written and never carried — so each row is exercised on its own document.
  {
    const writeOnly = fixture({
      'skills/review/SKILL.md':
        'Write its stage with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set reviewed --root <run-root>`. ' +
        'Read the anchor with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get anchor --root <run-root>`. ' +
        'Write it with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved add "<text>" --root <run-root>`. ' +
        'On a clean verdict, `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved clear --root <run-root>`. ' +
        'A fix cycle that committed runs `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" docs clear --root <run-root>`.\n',
    });
    const writeGaps = scanContract(writeOnly, VERB_CONTRACTS);
    assert.equal(writeGaps.length, 1, 'a review.md with every other verb but no `deferred add` is flagged');
    assert.match(writeGaps[0].expectation, /deferred add/, 'the gap names the verb it wants');

    const readOnly = fixture({
      'skills/ship/SKILL.md':
        'Read the stage with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get stage --root <run-root>`. ' +
        'Set it with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set shipped --root <run-root>`. ' +
        'Read them with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get unresolved --root <run-root>` and ' +
        '`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get degraded --root <run-root>`.\n',
    });
    const readGaps = scanContract(readOnly, VERB_CONTRACTS);
    assert.equal(readGaps.length, 1, 'a ship.md with every other read but no `get deferred` is flagged');
    assert.match(readGaps[0].expectation, /get deferred/, 'the gap names the read it wants');
  }

  // positive: ship.md drops the `scope.js get unresolved`/`get degraded` reads entirely, going back to
  // hand-reading the ledger (or the cwd-dependent `status`, which is the failure Important 2 closed)
  const shipNoStatus = fixture({
    'skills/ship/SKILL.md': 'Ask whether anything stands, from memory of the review.\n',
  });
  const shipVerbGaps = scanContract(shipNoStatus, VERB_CONTRACTS);
  assert.ok(
    shipVerbGaps.some((g) => g.source === path.join('skills', 'ship', 'SKILL.md')),
    'flags a ship.md that stopped reading the unresolved and degrade records through `scope.js get`',
  );

  // --- TEST_SELECTION_CONTRACTS: the TDD loop, the inline loop, Lens 2's independent re-run, and the
  // documentation step's own commits each read references/test-selection.md rather than restating the
  // focused-command rule (ADR 0025). scan() above would stay green if one dropped the read/apply
  // instruction while the reference file itself still exists — this is the wire, not the reference. ---

  for (const rel of [
    path.join('agents', 'implementer.md'),
    path.join('references', 'implement-lite.md'),
    path.join('agents', 'slice-reviewer.md'),
    path.join('skills', 'document', 'SKILL.md'),
  ]) {
    const dropped = fixture({ [rel]: '# doc\n\nRuns its own test command, no reference to speak of.\n' });
    const tsGaps = scanContract(dropped, TEST_SELECTION_CONTRACTS);
    assert.equal(tsGaps.length, 1, `flags ${rel} for dropping the test-selection reference`);
    assert.equal(tsGaps[0].source, rel, `names ${rel} as the offender`);
  }

  // positive: a document that keeps the reference but drops the "run the command it selects" clause
  // still passes today unless the pattern is anchored on that clause too — a bare mention of the file
  // is not the wire, the run instruction is
  const readOnly = fixture({
    [path.join('agents', 'implementer.md')]:
      'Read `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md` for the rule, then run whatever you like.\n',
  });
  const readOnlyGaps = scanContract(readOnly, [TEST_SELECTION_CONTRACTS[0]]);
  assert.equal(
    readOnlyGaps.length,
    1,
    'flags a document that reads the reference but drops the run-the-selected-command instruction',
  );

  // positive: either read form — the ${CLAUDE_PLUGIN_ROOT} macro or bare prose — satisfies the wire
  const wired1 = fixture({
    [path.join('agents', 'implementer.md')]:
      'Read `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md` and run the command it selects.\n',
  });
  assert.equal(
    scanContract(wired1, [TEST_SELECTION_CONTRACTS[0]]).length,
    0,
    'the ${CLAUDE_PLUGIN_ROOT} macro form satisfies the wire',
  );
  const wired2 = fixture({
    [path.join('references', 'implement-lite.md')]:
      'Read references/test-selection.md and run the command it selects.\n',
  });
  assert.equal(
    scanContract(wired2, [TEST_SELECTION_CONTRACTS[1]]).length,
    0,
    'the bare-prose form satisfies the wire',
  );

  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), TEST_SELECTION_CONTRACTS).length,
    0,
    'absent files are skipped',
  );

  // --- FULL_SUITE_CONTRACTS: /superdev:review in scope mode is the only full-suite run left in the
  // chain (ADR 0025) — the controller runs it itself, before dispatching final-reviewer, and
  // final-reviewer reviews against the result it is handed, running no suite of its own. ---

  // positive: review.md drops the controller-run full suite and goes back to just handing over the command
  const fs1 = fixture({
    'skills/review/SKILL.md': 'Read `docs/agents/verification.md` for the test command and pass it to final-reviewer.\n',
  });
  const fsGaps1 = scanContract(fs1, FULL_SUITE_CONTRACTS);
  assert.equal(fsGaps1.length, 4, 'flags a review.md missing all four of its rows: the controller-run suite, the dispatch clause, fail-is-Critical, and stage-not-advance');
  assert.ok(
    fsGaps1.every((g) => g.source === path.join('skills', 'review', 'SKILL.md')),
    'all four gaps name review.md',
  );

  // positive: final-reviewer.md reads like the run is its own again on a live scope run
  const fs2 = fixture({
    'agents/final-reviewer.md': 'Re-run the suite over the range to confirm green before you write your verdict.\n',
  });
  const fsGaps2 = scanContract(fs2, FULL_SUITE_CONTRACTS);
  assert.equal(fsGaps2.length, 2, 'flags a final-reviewer.md that stopped deferring to the handed result, and its missing fail-means-No row');
  assert.ok(
    fsGaps2.every((g) => g.source === path.join('agents', 'final-reviewer.md')),
    'both gaps name final-reviewer.md',
  );

  // positive: review.md drops the failing-suite-is-Critical rule and the stage-not-advance rule
  const fs4 = fixture({
    'skills/review/SKILL.md': 'Run the full suite yourself, before dispatching `final-reviewer`.\n',
  });
  const fsGaps4 = scanContract(fs4, FULL_SUITE_CONTRACTS);
  assert.equal(fsGaps4.length, 3, 'flags a review.md missing the dispatch clause, the failing-suite-is-Critical rule, and the stage-not-advance rule');
  assert.ok(
    fsGaps4.every((g) => g.source === path.join('skills', 'review', 'SKILL.md')),
    'all three gaps name review.md',
  );

  // positive (RED reproduction): review.md's dispatch sentence still leaks the optional-re-run wording
  // final-reviewer.md itself no longer carries — the exact live-path leak this row exists to close
  const fs9 = fixture({
    'skills/review/SKILL.md':
      "Run the full suite yourself, before dispatching `final-reviewer`. A `fail` here is itself a " +
      'Critical finding — fold it into the fix loop below. The stage does **not** advance while it ' +
      "stands. hand it that result instead, and tell it its own re-run stays optional, never the scope's " +
      'only full-suite run.\n',
  });
  const fsGaps9 = scanContract(fs9, FULL_SUITE_CONTRACTS);
  assert.equal(fsGaps9.length, 1, "flags a review.md whose dispatch clause still leaks the optional re-run sentence");
  assert.equal(fsGaps9[0].source, path.join('skills', 'review', 'SKILL.md'), 'names review.md');

  // positive: final-reviewer.md drops the fail-means-No rule
  const fs5 = fixture({
    'agents/final-reviewer.md':
      'That is the scope\'s one full-suite run, and you review against it, running no suite of your own.\n',
  });
  const fsGaps5 = scanContract(fs5, FULL_SUITE_CONTRACTS);
  assert.equal(fsGaps5.length, 1, 'flags a final-reviewer.md that drops the fail-means-No rule');
  assert.equal(fsGaps5[0].source, path.join('agents', 'final-reviewer.md'), 'names final-reviewer.md');

  // positive: final-reviewer.md re-grows the optional live-scope re-run the chain paid for once already —
  // the wording this row replaced, which reads plausible and costs a second full suite per scope
  const fs8 = fixture({
    'agents/final-reviewer.md':
      "Your own re-run here stays optional and is never the scope's only full-suite run. `Full-suite " +
      'run: fail` makes the verdict `Ready to merge? No`.\n',
  });
  const fsGaps8 = scanContract(fs8, FULL_SUITE_CONTRACTS);
  assert.equal(fsGaps8.length, 1, 'flags a final-reviewer.md that re-grows an optional live-scope re-run');
  assert.match(
    fsGaps8[0].expectation,
    /runs no suite of its own/,
    'the gap says the reviewer reviews against the handed result instead',
  );

  // positive: review.md keeps the fail-is-Critical wording but drops the clause that actually blocks the
  // handoff — the anti-pattern the acceptance criteria for this row names directly
  const fs6 = fixture({
    'skills/review/SKILL.md':
      "Run the full suite yourself, before dispatching `final-reviewer`. A `fail` here is itself a " +
      'Critical finding — fold it into the fix loop below.\n',
  });
  const fsGaps6 = scanContract(fs6, FULL_SUITE_CONTRACTS);
  assert.equal(fsGaps6.length, 2, 'flags a review.md that names the finding but drops the dispatch clause and the stage-not-advance clause');
  assert.ok(
    fsGaps6.every((g) => g.source === path.join('skills', 'review', 'SKILL.md')),
    'both gaps name review.md',
  );

  // positive: run-handoff.md's run handoff stops running the scope's one full suite itself — the row that
  // covers an all-`mechanical`/`docs` scope, which has no whole-scope review to attach a run to
  const fs7 = fixture({
    'references/run-handoff.md': 'Set the stage to `merged`, then print the next command.\n',
  });
  const fsGaps7 = scanContract(fs7, FULL_SUITE_CONTRACTS);
  assert.equal(fsGaps7.length, 1, "flags a run-handoff.md whose run handoff runs no full suite of its own");
  assert.equal(fsGaps7[0].source, path.join('references', 'run-handoff.md'), 'names run-handoff.md');

  // negative: that same run-handoff.md row carried
  assert.equal(
    scanContract(
      fixture({
        'references/run-handoff.md':
          "Run handoff attempts that scope's one full-suite run itself, once, in place of that review.\n",
      }),
      FULL_SUITE_CONTRACTS,
    ).length,
    0,
    'a run-handoff.md carrying the run-handoff full-suite run yields no gap',
  );

  // negative: all seven rows carried
  const fs3 = fixture({
    'skills/review/SKILL.md':
      "Run the full suite yourself, before dispatching `final-reviewer`. A `fail` here is itself a " +
      'Critical finding — fold it into the fix loop below. The stage does **not** advance while it ' +
      'stands. Scope mode: hand it that result and tell it to review against that result, running no ' +
      'suite of its own.\n',
    'agents/final-reviewer.md':
      "That is the scope's one full-suite run, and you review against it, running no suite of your own. " +
      '`Full-suite run: fail` makes the verdict `Ready to merge? No`.\n',
  });
  assert.equal(scanContract(fs3, FULL_SUITE_CONTRACTS).length, 0, 'all seven rows carried yields zero gaps');

  // negative: the dispatch row's gaps tolerate an innocuous rewording between its anchors — widened from
  // {0,20} to {0,60}, matching every other row in this table, since a {0,20} gap breaks on a rewording as
  // small as adding a few connecting words
  const fs10 = fixture({
    'skills/review/SKILL.md':
      'Run the full suite yourself, before dispatching `final-reviewer`. A `fail` here is itself a ' +
      'Critical finding — fold it into the fix loop below. The stage does **not** advance while it ' +
      'stands. Scope mode: hand it that result, and then be sure to tell it to review against that ' +
      'result, running no suite of its own.\n',
    'agents/final-reviewer.md':
      "That is the scope's one full-suite run, and you review against it, running no suite of your own. " +
      '`Full-suite run: fail` makes the verdict `Ready to merge? No`.\n',
  });
  assert.equal(
    scanContract(fs10, FULL_SUITE_CONTRACTS).length,
    0,
    'the dispatch row tolerates a longer connecting phrase between "that result" and "tell it"',
  );

  // --- FIX_BOUNDARY_CONTRACTS (ADR 0035): `/superdev:review`'s fix loop may change how the code meets
  // the Definition of Done, and a remedy that adds a capability the DoD never named goes to
  // `/superdev:plan` instead. The boundary is prose a fix cycle steps over the moment it reads as advice,
  // and nothing else in the chain would notice: the review would simply return a bigger diff. A boundary
  // with no exit is the same deadlock from the other side: a deferred finding arrives as a Critical, so
  // every path §4 offers either fires on it anyway (`--unattended → fix`) or never fires (the clean-verdict
  // advance), with no record class standing in for it. ---

  const exitClause =
    'A deferred finding enters no fix loop and is not an unresolved defect, taking precedence over ' +
    '`--unattended → fix`. A verdict whose only remaining findings are deferred counts as clean.';

  // positive: §4 keeps its fix loop but states no boundary at all
  const fb1 = fixture({
    'skills/review/SKILL.md':
      'Ask once before fixing, then dispatch one `superdev:implementer` with the complete findings list.\n',
  });
  const fbGaps1 = scanContract(fb1, FIX_BOUNDARY_CONTRACTS);
  assert.equal(fbGaps1.length, 3, 'flags all three rows on a review.md whose fix loop states no scope boundary');
  assert.ok(
    fbGaps1.every((g) => g.source === path.join('skills', 'review', 'SKILL.md')),
    'every gap names review.md',
  );

  // positive: the boundary is stated but names no destination and no exit, so the finding has nowhere to
  // go and a deferred one still deadlocks the run
  const fb2 = fixture({
    'skills/review/SKILL.md':
      'The fix loop changes how the code meets the Definition of Done. A remedy that adds a capability ' +
      'the Definition of Done never named is outside it.\n',
  });
  assert.equal(
    scanContract(fb2, FIX_BOUNDARY_CONTRACTS).length,
    2,
    'naming the boundary without a destination or an exit leaves two gaps',
  );

  // positive: §3's report template alone carries the boundary phrase, so a row anchored on that phrase
  // would read satisfied while §4's instruction is gone — the one-sided pin this check exists to prevent,
  // and the shape its own first draft had
  const fb4 = fixture({
    'skills/review/SKILL.md':
      '### Deferred to a plan\n[a finding whose remedy would add a capability the Definition of Done ' +
      "never named — §4's boundary; one line each, with the follow-up `/superdev:plan`]\n",
  });
  assert.equal(
    scanContract(fb4, FIX_BOUNDARY_CONTRACTS).length,
    3,
    "the report template alone satisfies none of the three rows — §4's own instruction is what is pinned",
  );

  // positive (RED): boundary plus destination, but no exit — a deferred finding still deadlocks the run,
  // since nothing states that it skips the fix loop and counts toward a clean verdict
  const fb3 = fixture({
    'skills/review/SKILL.md':
      'The fix loop changes how the code meets the Definition of Done. A remedy that adds a capability ' +
      'the Definition of Done never named is recorded and handed to `/superdev:plan`, while repairing a ' +
      'defect in what the Definition of Done does name stays in this loop.\n',
  });
  const fbGaps3 = scanContract(fb3, FIX_BOUNDARY_CONTRACTS);
  assert.equal(fbGaps3.length, 1, 'boundary plus destination alone still leaves the exit-less deadlock');
  assert.match(fbGaps3[0].expectation, /counts as|deferred finding|deadlock/i, 'names the missing exit');

  // negative (GREEN): boundary, destination, and exit together satisfy all three rows
  const fb5 = fixture({
    'skills/review/SKILL.md':
      'The fix loop changes how the code meets the Definition of Done. A remedy that adds a capability ' +
      'the Definition of Done never named is recorded and handed to `/superdev:plan`, while repairing a ' +
      `defect in what the Definition of Done does name stays in this loop. ${exitClause}\n`,
  });
  assert.equal(
    scanContract(fb5, FIX_BOUNDARY_CONTRACTS).length,
    0,
    'boundary, destination, and exit together satisfy all three rows',
  );

  // --- scanDocStepsNoSuite: the other side of ADR 0025. `/superdev:document`, `/superdev:ship`, and the
  // `doc-writer` instruct no full-suite run, so the scope's one run stays the review's. This asserts an
  // absence, which every table above asserts the opposite of: a gap here is a document that grew an
  // instruction, not one that lost a clause. ---

  // negative: three silent documents, plus ship.md's past-tense mention of a run that already happened
  const ds1 = fixture({
    'skills/document/SKILL.md': 'Dispatch `superdev:doc-writer` over the range, then dispatch `doc-reader`.\n',
    'skills/ship/SKILL.md':
      "Stage the pull request only once `/superdev:implement`'s run handoff has run the full suite and " +
      'found it green.\n',
    'agents/doc-writer.md': 'Reconcile the in-repo docs with the code over the range you are handed.\n',
  });
  assert.equal(
    scanDocStepsNoSuite(ds1).length,
    0,
    'three silent documents, and a past-tense mention of a run that already happened, yield no gaps',
  );

  // positive: document.md grows a reflexive suite run
  const ds2 = fixture({ 'skills/document/SKILL.md': 'Run the full suite yourself before the doc pass.\n' });
  const dsGaps2 = scanDocStepsNoSuite(ds2);
  assert.equal(dsGaps2.length, 1, 'flags a document.md that runs the full suite itself');
  assert.equal(dsGaps2[0].source, path.join('skills', 'document', 'SKILL.md'), 'names document.md');
  assert.match(dsGaps2[0].expectation, /full suite/i, 'the gap names the run it found');

  // positive: ship.md grows the take-the-command-and-run-it shape run handoff uses
  const ds3 = fixture({
    'skills/ship/SKILL.md':
      'Take the full command from `docs/agents/verification.md` and run it once over the scope branch ' +
      'before opening the request.\n',
  });
  const dsGaps3 = scanDocStepsNoSuite(ds3);
  assert.equal(dsGaps3.length, 1, 'flags a ship.md that takes the full command and runs it');
  assert.equal(dsGaps3[0].source, path.join('skills', 'ship', 'SKILL.md'), 'names ship.md');

  // positive: the doc-writer grows one too — a subagent's run is the same duplicate as a command's
  const ds4 = fixture({ 'agents/doc-writer.md': 'Run the full test suite itself once the docs agree.\n' });
  const dsGaps4 = scanDocStepsNoSuite(ds4);
  assert.equal(dsGaps4.length, 1, 'flags a doc-writer.md that runs the full test suite itself');
  assert.equal(dsGaps4[0].source, path.join('agents', 'doc-writer.md'), 'names doc-writer.md');

  // positive: the bare imperative, no reflexive pronoun — the ordinary way this instruction gets written
  const ds5 = fixture({ 'skills/document/SKILL.md': 'Run the full suite before opening the pull request.\n' });
  const dsGaps5 = scanDocStepsNoSuite(ds5);
  assert.equal(dsGaps5.length, 1, 'flags a document.md with the bare imperative, no reflexive pronoun');
  assert.equal(dsGaps5[0].source, path.join('skills', 'document', 'SKILL.md'), 'names document.md');

  const ds6 = fixture({ 'skills/ship/SKILL.md': 'Re-run the full suite before staging the pull request.\n' });
  const dsGaps6 = scanDocStepsNoSuite(ds6);
  assert.equal(dsGaps6.length, 1, 'flags a ship.md with the bare re-run imperative');
  assert.equal(dsGaps6[0].source, path.join('skills', 'ship', 'SKILL.md'), 'names ship.md');

  const ds7 = fixture({ 'agents/doc-writer.md': 'Run the full test suite once the docs agree.\n' });
  const dsGaps7 = scanDocStepsNoSuite(ds7);
  assert.equal(dsGaps7.length, 1, 'flags a doc-writer.md with the bare imperative naming the test suite');
  assert.equal(dsGaps7[0].source, path.join('agents', 'doc-writer.md'), 'names doc-writer.md');

  // negative: the auxiliary, not the reflexive pronoun, is the discriminator — ship.md's real past-tense
  // mention stays silent under the bare-imperative pattern too
  assert.equal(
    scanDocStepsNoSuite(
      fixture({
        'skills/ship/SKILL.md':
          "Stage the pull request only once `/superdev:implement`'s run handoff has run the full suite " +
          'and found it green.\n',
      }),
    ).length,
    0,
    "the auxiliary-past-tense mention (has run) stays silent",
  );

  // negative: the auxiliary still governs "run" from a distance — an intervening adverb, a negation, or a
  // markdown hard break all used to false-positive under a lookbehind that demanded immediate adjacency
  assert.equal(
    scanDocStepsNoSuite(
      fixture({
        'skills/ship/SKILL.md':
          'The run handoff has already run the full suite and found it green.\n',
      }),
    ).length,
    0,
    '"has already run" (an intervening adverb) stays silent',
  );
  assert.equal(
    scanDocStepsNoSuite(
      fixture({
        'skills/document/SKILL.md': 'Scopes that have not run the full suite block here.\n',
      }),
    ).length,
    0,
    '"have not run" (a negation) stays silent',
  );
  assert.equal(
    scanDocStepsNoSuite(
      fixture({
        'skills/ship/SKILL.md': 'The run handoff has  \nrun the full suite and found it green.\n',
      }),
    ).length,
    0,
    'a markdown hard break between the auxiliary and "run" stays silent',
  );

  // positive: the bare imperative with "full" dropped — the ordinary way a maintainer writes this shape
  // without the word "full" in it
  const ds8 = fixture({
    'skills/ship/SKILL.md': 'Re-run the suite over the scope branch before the handoff.\n',
  });
  const dsGaps8 = scanDocStepsNoSuite(ds8);
  assert.equal(dsGaps8.length, 1, 'flags a ship.md that re-runs the suite before the handoff');
  assert.equal(dsGaps8[0].source, path.join('skills', 'ship', 'SKILL.md'), 'names ship.md');

  const ds9 = fixture({
    'skills/document/SKILL.md': 'Run the whole suite once more before staging the pull request.\n',
  });
  const dsGaps9 = scanDocStepsNoSuite(ds9);
  assert.equal(dsGaps9.length, 1, 'flags a document.md that runs the whole suite once more');
  assert.equal(dsGaps9[0].source, path.join('skills', 'document', 'SKILL.md'), 'names document.md');

  // negative: the trailing "before" anchor is what keeps the bare-suite pattern off final-reviewer.md's
  // legitimate ad-hoc mention, which carries no "before" nearby
  assert.equal(
    scanDocStepsNoSuite(
      fixture({
        'agents/final-reviewer.md':
          'On an ad-hoc range you may re-run the suite over the range rather than trust the diff alone.\n',
      }),
    ).length,
    0,
    'the legitimate ad-hoc re-run sentence, with no nearby "before", stays silent',
  );

  // positive: the optionality clause generalized past "own re-run … stays optional" — "remains" and no
  // "own" are the same clause reworded
  const dsGaps10 = scanDocStepsNoSuite(
    fixture({ 'agents/final-reviewer.md': 'Your re-run here remains optional on every range.\n' }),
  );
  assert.equal(dsGaps10.length, 1, 'flags a final-reviewer.md whose re-run "remains optional"');
  assert.equal(dsGaps10[0].source, path.join('agents', 'final-reviewer.md'), 'names final-reviewer.md');

  const dsGaps11 = scanDocStepsNoSuite(
    fixture({ 'agents/final-reviewer.md': 'The re-run here stays optional on every range.\n' }),
  );
  assert.equal(dsGaps11.length, 1, 'flags a final-reviewer.md whose re-run "stays optional" with no "own"');
  assert.equal(dsGaps11[0].source, path.join('agents', 'final-reviewer.md'), 'names final-reviewer.md');

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), FULL_SUITE_CONTRACTS).length,
    0,
    'absent files are skipped',
  );

  // --- scanDocStepsNoSuite, additive re-growth: a presence check alone cannot catch a final-reviewer.md
  // that carries BOTH the new "runs no suite of its own" clause and the old optionality sentence it
  // replaced — that combination reads as zero gaps against FULL_SUITE_CONTRACTS today. agents/final-
  // reviewer.md is why it joins the silence list even though it's also in the presence table above: the
  // presence row proves the new clause showed up, and this row proves the old one didn't come back
  // beside it. ---

  // positive: the additive re-growth — both sentences present at once
  const dsAdditive = fixture({
    'agents/final-reviewer.md':
      "That is the scope's one full-suite run, and you review against it, running no suite of your own. " +
      "Your own re-run here stays optional and is never the scope's only full-suite run.\n",
  });
  const dsAdditiveGaps = scanDocStepsNoSuite(dsAdditive);
  assert.equal(dsAdditiveGaps.length, 1, 'flags a final-reviewer.md that additively re-grows the optionality clause');
  assert.equal(dsAdditiveGaps[0].source, path.join('agents', 'final-reviewer.md'), 'names final-reviewer.md');

  // negative: the legitimate ad-hoc re-run sentence, and the past-tense controller mention, both stay silent
  const dsLegit = fixture({
    'agents/final-reviewer.md':
      'On an ad-hoc range you may re-run the suite over the range rather than trust the diff alone. ' +
      "On a live scope run the controller already ran the full suite itself before dispatching you.\n",
  });
  assert.equal(scanDocStepsNoSuite(dsLegit).length, 0, 'the legitimate ad-hoc and past-tense sentences stay silent');

  // positive: the additive re-growth still gets caught when a hard wrap lands inside the clause itself —
  // final-reviewer.md hard-wraps near 100 columns, so a re-grown sentence hitting a wrap point is the
  // ordinary case, not a contrived one. Two wrap points, both inside the third SUITE_RUN_INSTRUCTIONS
  // pattern's literal spaces.
  const dsAdditiveWrappedAtOwn = fixture({
    'agents/final-reviewer.md':
      "That is the scope's one full-suite run, and you review against it, running no suite of your own. " +
      "Your own\nre-run here stays optional and is never the scope's only full-suite run.\n",
  });
  const dsAdditiveWrappedAtOwnGaps = scanDocStepsNoSuite(dsAdditiveWrappedAtOwn);
  assert.equal(
    dsAdditiveWrappedAtOwnGaps.length,
    1,
    'flags a final-reviewer.md whose optionality clause wraps between "own" and "re-run"',
  );
  assert.equal(dsAdditiveWrappedAtOwnGaps[0].source, path.join('agents', 'final-reviewer.md'), 'names final-reviewer.md');

  const dsAdditiveWrappedAtStays = fixture({
    'agents/final-reviewer.md':
      "That is the scope's one full-suite run, and you review against it, running no suite of your own. " +
      "Your own re-run here stays\noptional and is never the scope's only full-suite run.\n",
  });
  const dsAdditiveWrappedAtStaysGaps = scanDocStepsNoSuite(dsAdditiveWrappedAtStays);
  assert.equal(
    dsAdditiveWrappedAtStaysGaps.length,
    1,
    'flags a final-reviewer.md whose optionality clause wraps between "stays" and "optional"',
  );
  assert.equal(dsAdditiveWrappedAtStaysGaps[0].source, path.join('agents', 'final-reviewer.md'), 'names final-reviewer.md');

  // negative: the real final-reviewer.md, unmodified, yields zero gaps against the whole silence list
  const realFinalReviewer = fs.readFileSync(
    path.join(realRoot, 'plugin', 'agents', 'final-reviewer.md'),
    'utf8',
  );
  assert.equal(
    scanDocStepsNoSuite(fixture({ 'agents/final-reviewer.md': realFinalReviewer })).length,
    0,
    'the real final-reviewer.md carries neither a full-suite run nor the optionality clause',
  );

  // --- AFK_ROUTING_CONTRACTS: an all-`mechanical`/`docs` scope skips the whole-scope review by design,
  // so afk's stage table routes it past `/superdev:review` and ship drops the review from its own
  // missing-step warning. Either document alone reads correct while the pair disagrees, so both are
  // pinned. ---

  // positive: afk.md keeps the stage table but never reads the slice types — the shape that strands such
  // a scope in a review it skips, which is the defect this contract exists to catch
  const afkR1 = fixture({
    'skills/afk/SKILL.md':
      '| `merged` | `/superdev:review <BASE>..<feature-label> --unattended` |\n' +
      '| `documented-unreviewed` | `/superdev:review <BASE>..<feature-label> --unattended` |\n',
  });
  const afkGaps1 = scanContract(afkR1, AFK_ROUTING_CONTRACTS);
  assert.equal(afkGaps1.length, 2, 'flags an afk.md that routes both stages into the review unconditionally');
  assert.ok(
    afkGaps1.every((g) => g.source === path.join('skills', 'afk', 'SKILL.md')),
    'both gaps name afk.md',
  );

  // positive: afk.md carries the `merged` half but sends `documented-unreviewed` back to the review — the
  // half-fix that still cannot finish a sweep, since ship refuses a scope whose review never ran
  const afkGaps2 = scanContract(
    fixture({
      'skills/afk/SKILL.md':
        'When no row reads `behavior`, `merged` routes to `/superdev:document <BASE>..<feature-label> ' +
        '--unattended`.\n`documented-unreviewed` routes to `/superdev:review` as always.\n',
    }),
    AFK_ROUTING_CONTRACTS,
  );
  assert.equal(afkGaps2.length, 1, 'flags an afk.md that fixes only the `merged` row');
  assert.equal(afkGaps2[0].source, path.join('skills', 'afk', 'SKILL.md'), 'names afk.md');

  // positive (RED reproduction): the real exception paragraph with both `--unattended` tokens stripped —
  // prose the stage-table row scan never reaches, so nothing else in this file would have caught it
  const afkGapsNoToken = scanContract(
    fixture({
      'skills/afk/SKILL.md':
        'When no row reads `behavior`, `merged` routes to `/superdev:document <BASE>..<feature-label>` ' +
        'and `documented-unreviewed` routes to `/superdev:ship <scope>`, in place of the two review rows ' +
        'above.\n',
    }),
    AFK_ROUTING_CONTRACTS,
  );
  assert.equal(afkGapsNoToken.length, 2, 'flags both rows when `--unattended` is stripped from each');
  assert.ok(
    afkGapsNoToken.every((g) => g.source === path.join('skills', 'afk', 'SKILL.md')),
    'both gaps name afk.md',
  );

  // positive: ship.md drops its own half — the other side of the same agreement
  const afkGaps3 = scanContract(
    fixture({
      'skills/ship/SKILL.md':
        'Name exactly what has not run (`/superdev:review`, `/superdev:document`, or both) and ask once.\n',
    }),
    AFK_ROUTING_CONTRACTS,
  );
  assert.equal(afkGaps3.length, 1, "flags a ship.md that stopped exempting an all-mechanical/docs scope");
  assert.equal(afkGaps3[0].source, path.join('skills', 'ship', 'SKILL.md'), 'names ship.md');

  // negative: both documents carry their halves, hard-wrapped the way the real prose is
  assert.equal(
    scanContract(
      fixture({
        'skills/afk/SKILL.md':
          'Read each slice\'s `type`. When no\nrow reads `behavior`, `merged` routes to\n' +
          '`/superdev:document <BASE>..<feature-label> --unattended` and `documented-unreviewed` routes ' +
          'to\n`/superdev:ship <scope> --unattended`.\n',
        'skills/ship/SKILL.md':
          '- **Every slice in the ledger is `mechanical` or `docs`** (the fourth, `type` field of\n' +
          '  `scope.js get slices`) → drop `/superdev:review` from that warning.\n',
      }),
      AFK_ROUTING_CONTRACTS,
    ).length,
    0,
    'both halves carried, across a line wrap, yields zero gaps',
  );

  // positive (RED reproduction, MINOR 7): `documented-unreviewed` routes to ship unconditionally, for
  // every scope, with no all-mechanical/docs condition anywhere nearby — the shape row 1 alone used to
  // pass, which would ship a behavior scope's `documented-unreviewed` anchor straight past the review it
  // still needs. Tying row 1 to the same condition as row 0 catches it.
  const afkGapsUnconditional = scanContract(
    fixture({
      'skills/afk/SKILL.md':
        'Every `documented-unreviewed` scope routes straight to `/superdev:ship <scope> --unattended`, no ' +
        'matter what its slices are.\n',
    }),
    AFK_ROUTING_CONTRACTS,
  );
  assert.equal(
    afkGapsUnconditional.length,
    2,
    'flags both the missing merged-routing condition and the unconditional ship route — an afk.md that ' +
      'routes every scope from `documented-unreviewed` to ship, not just the all-mechanical/docs one, must ' +
      'fail row 1 too',
  );
  assert.ok(
    afkGapsUnconditional.every((g) => g.source === path.join('skills', 'afk', 'SKILL.md')),
    'both gaps name afk.md',
  );

  // --- ARG_TOKEN_CONTRACTS: merge-guard, green-gate, and ledger-guard each parse the same shell-word
  // shape out of a Bash command line, by hand. A copy that drifts reopens the quoted-argument bypass. ---

  // positive: one hook narrows its copy back to a bare `\S+` — the pre-fix shape, which stops at the
  // first space inside a quoted path and lets `git -C "my repo" merge` past the guard
  const argGaps1 = scanContract(
    fixture({ 'hooks/merge-guard.js': 'const ARG = /\\S+/.source;\n' }),
    ARG_TOKEN_CONTRACTS,
  );
  assert.equal(argGaps1.length, 1, 'flags a hook whose ARG token narrowed');
  assert.equal(argGaps1[0].source, path.join('hooks', 'merge-guard.js'), 'names the hook that drifted');

  // positive: a subtler drift — the single-quote alternative loses its `+`, so the token matches one
  // character where it used to match a run. Every other character of the line is unchanged.
  assert.equal(
    scanContract(
      fixture({
        'hooks/green-gate.js': ARG_TOKEN_LINE.replace("'[^']*')+", "'[^']*')") + '\n',
      }),
      ARG_TOKEN_CONTRACTS,
    ).length,
    1,
    'flags a one-character drift in the token',
  );

  // negative: the canonical line, carried verbatim in all three
  assert.equal(
    scanContract(
      fixture({
        'hooks/merge-guard.js': '// leading comment\n' + ARG_TOKEN_LINE + '\n',
        'hooks/green-gate.js': ARG_TOKEN_LINE + '\nconst IS_MERGE = null;\n',
        'hooks/ledger-guard.js': ARG_TOKEN_LINE + '\n',
      }),
      ARG_TOKEN_CONTRACTS,
    ).length,
    0,
    'the canonical token in all three yields zero gaps',
  );

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), ARG_TOKEN_CONTRACTS).length +
      scanContract(fixture({ 'README.md': '# repo\n' }), AFK_ROUTING_CONTRACTS).length,
    0,
    'absent files are skipped by both new tables',
  );

  // --- SOURCE_SECTION_CONTRACTS: each canonical reference still carries the sections its readers are
  // sent to. The readers are pinned already (a loop consumer must say *read test-selection.md*, a doc
  // agent must name content-types.md); this asserts the named file still holds the rule, so a body gutted
  // behind an intact filename is a gap rather than a green run. ---

  const sourceSectionBodies = {
    'references/plan-contract.md':
      '# Plan-file contract\n\n## Fields\n\n## Epic visuals (optional, epic-only)\n\n' +
      '## Slice lifecycle & status\n\n## Append mode\n\n## Scope anchor\n\n## Release\n\n' +
      '## Run state\n\n## Triage record\n\n## Feature label\n',
    'references/test-selection.md':
      '# Test selection\n\n## The two commands\n\n## Fallback to the full command\n',
    'references/content-types.md': '# Content types\n\n## The four types\n\n## The conceptual layer\n',
    'references/controlled-prose.md': '# Controlled prose\n\n## Modes\n\n## Self-check\n',
    'references/review-checklist.md':
      '# Review checklist\n\n## Anti-patterns\n\n## Vulnerability classes\n\n## Reuse audit\n\n' +
      '## Consistency\n',
  };

  // a fixture carrying all five files whole is clean
  assert.equal(
    scanContract(fixture(sourceSectionBodies), SOURCE_SECTION_CONTRACTS).length,
    0,
    'all five canonical references intact yields zero gaps',
  );

  // negative: deleting any one pinned heading fails on its own, and the gap names its own file
  const pinnedHeadings = [
    ['references/plan-contract.md', '## Fields\n\n'],
    ['references/plan-contract.md', '## Epic visuals (optional, epic-only)\n\n'],
    ['references/plan-contract.md', '## Slice lifecycle & status\n\n'],
    ['references/plan-contract.md', '## Append mode\n\n'],
    ['references/plan-contract.md', '## Scope anchor\n\n'],
    ['references/plan-contract.md', '## Release\n\n'],
    ['references/plan-contract.md', '## Run state\n\n'],
    ['references/plan-contract.md', '## Triage record\n\n'],
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
  assert.equal(
    pinnedHeadings.length,
    SOURCE_SECTION_CONTRACTS.length,
    'every row in the table has a negative fixture',
  );
  for (const [rel, heading] of pinnedHeadings) {
    const gutted = fixture({ ...sourceSectionBodies, [rel]: sourceSectionBodies[rel].replace(heading, '') });
    const gaps = scanContract(gutted, SOURCE_SECTION_CONTRACTS);
    assert.equal(gaps.length, 1, `dropping \`${heading.trim()}\` flags exactly one gap`);
    assert.equal(gaps[0].source, rel, `the gap names ${rel}`);
  }

  // a filename kept while the whole body goes is the drift this table exists to catch
  const hollowed = fixture({ ...sourceSectionBodies, 'references/test-selection.md': '# Test selection\n' });
  assert.equal(
    scanContract(hollowed, SOURCE_SECTION_CONTRACTS).length,
    2,
    'a reference gutted to its title alone fails every row pinned to it',
  );

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), SOURCE_SECTION_CONTRACTS).length,
    0,
    'absent files are skipped',
  );

  // ---------------------------------------------------------------------------
  // scanContract(): a clause the table spells with single spaces is met across a line break
  // ---------------------------------------------------------------------------
  const wrapTable = [['skills/x/SKILL.md', /the clause this table pins/, 'state the clause']];
  assert.equal(
    scanContract(fixture({ 'skills/x/SKILL.md': 'the clause this table pins\n' }), wrapTable).length,
    0,
    'a clause on one line is met',
  );
  assert.equal(
    scanContract(fixture({ 'skills/x/SKILL.md': 'the clause this\ntable pins\n' }), wrapTable).length,
    0,
    'the same clause wrapped across a line break is still met',
  );
  assert.equal(
    scanContract(fixture({ 'skills/x/SKILL.md': 'the clause this table drops\n' }), wrapTable).length,
    1,
    'a document that does not state the clause is still a gap',
  );

  // --- TRIAGE_RECORD_CONTRACTS: the two writer documents state the triage record's creation ordering and
  // its tool-agnostic split (ADR 0046). The presence half — every slice-store document states where the
  // record lives — runs separately as `scanTriageRecordContract()`, over `storeDocuments()`; see
  // scanners.test.js. ---

  const triageWriter =
    'Otherwise, create the triage record first, the way the store states, then write it to the run with\n' +
    '`scope.js deferred add "<text>"`, and the bullet carries the record\'s reference.\n';
  const triageEntry =
    'A **triage record** in the configured slice store is what outlives this run. How a store creates\n' +
    "one is stated in the active `docs/agents/issue-tracker.md`'s own section.\n";

  // negative: both writer documents carry their clause
  const trFiles = {
    [path.join('skills', 'review', 'SKILL.md')]: triageWriter,
    [path.join('references', 'scope-mode.md')]: triageEntry,
  };
  assert.equal(
    scanContract(fixture(trFiles), TRIAGE_RECORD_CONTRACTS).length,
    0,
    'both writer documents carrying their clause yields zero gaps',
  );

  // positive: the review states the record but writes the ledger bullet first — the ordering the row
  // exists to pin, since a bullet written before the record is the state a failed create leaves behind
  const trOrder = scanContract(
    fixture({
      ...trFiles,
      [path.join('skills', 'review', 'SKILL.md')]:
        '`scope.js deferred add "<text>"` writes the bullet.\n\nA triage record is created afterwards.\n',
    }),
    TRIAGE_RECORD_CONTRACTS,
  );
  assert.equal(trOrder.length, 1, 'flags a review that defers the record until after the ledger write');
  assert.equal(trOrder[0].source, path.join('skills', 'review', 'SKILL.md'), 'names the review command');

  // positive: the entry section names the record but not the store document that owns the mechanics,
  // which is what keeps a tool-agnostic reference from growing a backend of its own
  const trMechanics = scanContract(
    fixture({
      ...trFiles,
      [path.join('references', 'scope-mode.md')]:
        'A **triage record** in the slice store outlives the run. Create it as an issue labelled `triage`.\n',
    }),
    TRIAGE_RECORD_CONTRACTS,
  );
  assert.equal(trMechanics.length, 1, 'flags an entry section that states the mechanics itself');
  assert.equal(trMechanics[0].source, path.join('references', 'scope-mode.md'), 'names the reference');

  // negative: the real skills/review/SKILL.md, unmodified, yields zero gaps against its own row — proof the
  // anchor matches where the create instruction actually sits, not merely inside an unrelated paragraph
  // (the dedupe paragraph's own "deferred add" mention, 58 characters from a stray "triage record", is
  // what the old `/triage record[\s\S]{0,800}deferred add/` anchor matched instead)
  const realReview = fs.readFileSync(path.join(realRoot, 'plugin', 'skills', 'review', 'SKILL.md'), 'utf8');
  assert.equal(
    scanContract(fixture({ [path.join('skills', 'review', 'SKILL.md')]: realReview }), TRIAGE_RECORD_CONTRACTS)
      .length,
    0,
    'the real review.md carries the create instruction ahead of the deferred add call',
  );

  // positive (RED reproduction): the real review.md with its create-the-record paragraph excised — the
  // row must flag this, since a review that dropped the create step still runs `deferred add` and would
  // otherwise read as compliant
  const createStart = realReview.indexOf('**Otherwise, create the triage record first**');
  const createEnd = realReview.indexOf(
    "the run's own record is the one that gates nothing on a store being reachable.",
  );
  assert.ok(createStart > -1 && createEnd > createStart, 'both excision markers are found in the real file');
  const reviewNoCreate =
    realReview.slice(0, createStart) +
    realReview.slice(createEnd + "the run's own record is the one that gates nothing on a store being reachable.".length);
  assert.ok(
    !/create the triage record/.test(reviewNoCreate),
    'the excised fixture genuinely drops the create instruction',
  );
  const trNoCreate = scanContract(
    fixture({ [path.join('skills', 'review', 'SKILL.md')]: reviewNoCreate }),
    TRIAGE_RECORD_CONTRACTS,
  );
  assert.equal(trNoCreate.length, 1, 'flags the real review.md with the create step deleted');
  assert.equal(trNoCreate[0].source, path.join('skills', 'review', 'SKILL.md'), 'names the review command');

  // --- BACKLOG_SURVEY_CONTRACTS: `/superdev:backlog` resolves the candidate and triage listings through
  // the store document, reads an in-flight scope's stage off the ledger `/superdev:status` also reads,
  // and states as a contract that it writes nothing (ADR 0049). Each of the four clauses fails silently
  // on its own. ---

  const bsOpts = { stripFrontmatterFirst: true };
  const backlogAnchor = "Its `## Scope anchor` section states how to list the candidates. Follow it.\n";
  const backlogTriage = "Its `## Triage record` section states the listing call for this backend.\n";
  const backlogStage = 'For each, read its stage: `node "scope.js" get stage --root <run-root>`.\n';
  const backlogReadOnly =
    '**This survey writes nothing.** No issue, no label, no comment, no file, no `.superdev/` directory.\n';

  // negative: all four clauses present yields zero gaps
  assert.equal(
    scanContract(
      fixture({ 'skills/backlog/SKILL.md': backlogAnchor + backlogTriage + backlogStage + backlogReadOnly }),
      BACKLOG_SURVEY_CONTRACTS,
      bsOpts,
    ).length,
    0,
    'all four backlog-survey clauses yield zero gaps',
  );

  // positive: dropping the `## Scope anchor` reference
  const bsNoAnchor = scanContract(
    fixture({ 'skills/backlog/SKILL.md': backlogTriage + backlogStage + backlogReadOnly }),
    BACKLOG_SURVEY_CONTRACTS,
    bsOpts,
  );
  assert.equal(bsNoAnchor.length, 1, 'flags a survey with no `## Scope anchor` reference');
  assert.ok(/Scope anchor/.test(bsNoAnchor[0].expectation), 'names the scope-anchor clause');

  // positive: dropping the `## Triage record` reference
  const bsNoTriage = scanContract(
    fixture({ 'skills/backlog/SKILL.md': backlogAnchor + backlogStage + backlogReadOnly }),
    BACKLOG_SURVEY_CONTRACTS,
    bsOpts,
  );
  assert.equal(bsNoTriage.length, 1, 'flags a survey with no `## Triage record` reference');
  assert.ok(/Triage record/.test(bsNoTriage[0].expectation), 'names the triage-record clause');

  // positive: dropping the `scope.js get stage` read
  const bsNoStage = scanContract(
    fixture({ 'skills/backlog/SKILL.md': backlogAnchor + backlogTriage + backlogReadOnly }),
    BACKLOG_SURVEY_CONTRACTS,
    bsOpts,
  );
  assert.equal(bsNoStage.length, 1, 'flags a survey that never reads `scope.js get stage`');
  assert.ok(/get stage/.test(bsNoStage[0].expectation), 'names the stage-read clause');

  // positive: the read-only row's vacuity. The pattern used to span from one bold run's closing `**`
  // across unbolded prose to a later bold run's opening `**`, so an unbolded or hedged "writes nothing"
  // sentence still matched as long as some other bold run sat elsewhere in the document. Both mutations
  // below must be flagged now that the pattern is anchored on a bold run that opens its own line.
  const bsUnbolded = scanContract(
    fixture({
      'skills/backlog/SKILL.md':
        backlogAnchor +
        backlogTriage +
        backlogStage +
        'This survey writes nothing. No issue, no label, no comment, no file.\n',
    }),
    BACKLOG_SURVEY_CONTRACTS,
    bsOpts,
  );
  assert.equal(bsUnbolded.length, 1, 'flags a survey whose "writes nothing" sentence is not bolded');
  assert.ok(/writes nothing/.test(bsUnbolded[0].expectation), 'names the read-only clause');

  const bsHedged = scanContract(
    fixture({
      'skills/backlog/SKILL.md':
        backlogAnchor +
        backlogTriage +
        backlogStage +
        'It mostly writes nothing, though a label update is fine.\n',
    }),
    BACKLOG_SURVEY_CONTRACTS,
    bsOpts,
  );
  assert.equal(bsHedged.length, 1, 'flags a survey that hedges "writes nothing" instead of stating it flatly');
  assert.ok(/writes nothing/.test(bsHedged[0].expectation), 'names the read-only clause');
};
