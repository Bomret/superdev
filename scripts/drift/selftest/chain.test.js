'use strict';

// The chain and loop contract tables: the documents that hand a scope from one command to the next,
// and the ones a slice loop reads. One section per table.
//
// Run by ./index.js, which owns the shared fixture() helper, realRoot, and the temp-dir cleanup.

const { scanContract } = require('../lib');
const {
  scanDocStepsNoSuite,
  scanDenialCapNumberSilence,
  scanAfkLockTierClaim,
  scanRunLockLivenessSilence,
  scanUnmappedPathsForms,
} = require('../scanners');
const {
  FEATURE_ARG_CONTRACTS,
  PATHS_DERIVATION_CONTRACTS,
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
  PLANNED_HANDOFF_CONTRACTS,
  TEST_SELECTION_CONTRACTS,
  FULL_SUITE_CONTRACTS,
  VERIFICATION_CEILING_CONTRACTS,
  SPAWN_FAILURE_ANSWER_CONTRACTS,
  FIX_BOUNDARY_CONTRACTS,
  TIER_SKIP_CONTRACTS,
  AFK_ROUTING_CONTRACTS,
  ARG_TOKEN_CONTRACTS,
  ARG_TOKEN_LINE,
  SOURCE_SECTION_CONTRACTS,
  SPECIALISING_SECTIONS,
  specialisingGenericRows,
  specialisingCitation,
  PUBLISH_RUN_STATE_CONTRACTS,
  ADOPT_RUN_STATE_CONTRACTS,
  RESUMED_SCOPETREE_TRIGGER_CONTRACTS,
  RUN_LOCK_LIVENESS_CONTRACTS,
  SCOPETREE_CONTRACTS,
  TRIAGE_RECORD_CONTRACTS,
  BACKLOG_SURVEY_CONTRACTS,
  INVARIANT_REGISTER_CONTRACTS,
  INVARIANT_REGISTER_DOC_PASS_CONTRACTS,
  INVARIANT_COMPLIANCE_CONTRACTS,
  COMMITMENT_CAPTURE_CONTRACTS,
  DOD_SUITE_CRITERION_CONTRACTS,
  CLEAN_VERDICT_ENDS_LOOP_CONTRACTS,
  OBSERVATION_CAPTURE_CONTRACTS,
  LABEL_REVISION_AT_DECOMPOSITION_CONTRACTS,
  UNMET_CRITERION_AT_REVIEW_CONTRACTS,
  RELEASE_ANSWER_NOT_INFERRED_CONTRACTS,
  CAPTURE_CHECKS_CONCURRENT_PLANS_CONTRACTS,
  DECOMPOSITION_NAMES_WHAT_IT_CHECKED_CONTRACTS,
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

  // --- RESUMED_SCOPETREE_TRIGGER_CONTRACTS: the scopetree step fires on either cause the scopetree
  // can be absent for — `/superdev:ship` removed it, or this checkout never held it at all — not
  // only the first. A regression back to the single-cause sentence must fail on its own. ---

  const broadenedScopetreeStep =
    'Create or reattach the scopetree, at both tiers, whenever it is absent — because ' +
    '`/superdev:ship` already removed it, or because this checkout never held it (a resumed run adopted ' +
    'from the anchor on a fresh clone) — and otherwise work in the one already there.\n';

  assert.equal(
    scanContract(fixture({ 'references/scope-mode.md': broadenedScopetreeStep }), RESUMED_SCOPETREE_TRIGGER_CONTRACTS)
      .length,
    0,
    'resumed-scopetree-trigger: the broadened sentence yields zero gaps',
  );

  // positive: the pre-fix-cycle, single-cause sentence (ship-removed only) fires the gap — the exact
  // regression this check exists to catch
  const narrowedScopetreeStep =
    'Work in the existing scopetree, and reattach the branch with `git worktree ' +
    'add <path> <branch>` when `/superdev:ship` has already removed that scopetree.\n';
  const narrowedGaps = scanContract(
    fixture({ 'references/scope-mode.md': narrowedScopetreeStep }),
    RESUMED_SCOPETREE_TRIGGER_CONTRACTS,
  );
  assert.equal(narrowedGaps.length, 1, 'resumed-scopetree-trigger: flags the narrowed, single-cause sentence');
  assert.equal(narrowedGaps[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), RESUMED_SCOPETREE_TRIGGER_CONTRACTS).length,
    0,
    'resumed-scopetree-trigger: absent documents are skipped',
  );

  // --- RUN_LOCK_LIVENESS_CONTRACTS (INV-0013, ADR 0090): /superdev:implement's own entry into an
  // existing run root reads the ledger's stage together with the lock's mtime before its first write.
  // Scoped to that one caller alone, never review/document/ship's ordinary hand-off (each is the
  // chain's single designed entry right after the previous command's own exit, so testing them the
  // same way would trip on every routine hand-off); /superdev:plan keeps its own separate, narrower
  // check. Eight rows: five pin the rule itself (including the two exclusion/scoping statements) in
  // scope-mode.md's `## The run lock`, three pin the callers that do carry it. ---

  const runLockLivenessPieces = {
    'references/scope-mode.md':
      "own entry into an existing run root consults liveness before its first write**\n" +
      '(INV-0013, ADR 0090).\n\n' +
      "Stage `planned`, any lock age** — `/superdev:plan` cut this and nobody has implemented a slice yet.\n" +
      '  This is the ordinary hand-off, not a collision: proceed.\n\n' +
      "Any stage other than `planned`, with a lock under an hour old** — a live implement run (`CONTEXT.md`). Attended:\n" +
      "  name the lock's age and content and the ledger's stage.\n\n" +
      "governs `/superdev:implement`'s own entry alone, never `/superdev:review`,\n" +
      "`/superdev:document`, or `/superdev:ship`.** Each of those three is the chain's single designed hand-off.\n\n" +
      "`/superdev:plan` keeps its own, narrower check, unaffected by the rule above** (triage #510): before its\n" +
      "own cut, a lock already present always means a second plan session.\n",
    'references/run-init.md':
      "- **A run root already on disk for this scope's `<scope>` — the feature label your command already\n" +
      '  resolved before reading this file — gets the liveness check first, ahead of every other step below.**\n',
    'references/implement-full.md':
      "- **Found already present? Run init's own entry step already checked the run lock's liveness before this\n" +
      '  playbook started** (per scope-mode.md).\n',
    'references/implement-lite.md':
      "Run init's own entry step already checked the lock's liveness before this playbook ever started\n" +
      '(per scope-mode.md), so this step reconciles state.\n',
  };

  // negative: every clause present is clean
  assert.equal(
    scanContract(fixture(runLockLivenessPieces), RUN_LOCK_LIVENESS_CONTRACTS).length,
    0,
    'run-lock-liveness: every clause present yields zero gaps',
  );

  // positive: dropping scope-mode.md's own rule statement flags all five of its rows, and nothing
  // downstream, since scanContract only ever reports the document it read
  {
    const droppedRule = fixture({ ...runLockLivenessPieces, 'references/scope-mode.md': '# doc\n\nNothing about the run lock here.\n' });
    const gaps = scanContract(droppedRule, RUN_LOCK_LIVENESS_CONTRACTS);
    assert.equal(gaps.length, 5, 'run-lock-liveness: dropping the rule flags all five scope-mode.md rows');
    assert.ok(gaps.every((g) => g.source === path.join('references', 'scope-mode.md')), 'all five name scope-mode.md');
  }

  // positive: a caller regressing to no mention of the liveness check is caught on its own row — the
  // exact regression this table exists to catch
  {
    const droppedCaller = fixture({
      ...runLockLivenessPieces,
      'references/implement-lite.md': "Read \`\${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md\`'s \`## The run lock\` and write \`<run-root>/run.lock\` as it says.\n",
    });
    const gaps = scanContract(droppedCaller, RUN_LOCK_LIVENESS_CONTRACTS);
    assert.equal(gaps.length, 1, 'run-lock-liveness: flags implement-lite.md alone when it drops the liveness mention');
    assert.equal(gaps[0].source, path.join('references', 'implement-lite.md'));
  }

  // positive: review/document/ship's own "refresh the run lock" bullets carry no liveness-check
  // mention at all, by design — this table has no row for them, so their absence never gaps
  assert.equal(
    scanContract(
      fixture({
        ...runLockLivenessPieces,
        'skills/review/SKILL.md': 'Find the scope checkout, and refresh the run lock. Per scope-mode.md.\n',
        'skills/document/SKILL.md': 'Find the scope checkout, and refresh the run lock. Per scope-mode.md.\n',
        'skills/ship/SKILL.md': "Refresh \`<run-root>/run.lock\` now, per that file's rule.\n",
      }),
      RUN_LOCK_LIVENESS_CONTRACTS,
    ).length,
    0,
    'run-lock-liveness: review/document/ship carry no row, since the check does not govern their ordinary hand-off',
  );

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), RUN_LOCK_LIVENESS_CONTRACTS).length,
    0,
    'run-lock-liveness: absent documents are skipped',
  );

  // --- scanRunLockLivenessSilence: the absence half. RUN_LOCK_LIVENESS_CONTRACTS pins only the rule's
  // presence in scope-mode.md, so a skill edit re-widening the liveness check onto review/document/ship's
  // ordinary hand-off would ship green there — the exact regression a first cycle of this feature shipped.
  // This scanner catches the words regrowing on the three skills the rule does not govern. ---

  // negative: the ordinary "refresh the run lock" prose, unconditional, reports nothing
  assert.equal(
    scanRunLockLivenessSilence(
      fixture({
        'skills/review/SKILL.md': 'Find the scope checkout, and refresh the run lock. Per scope-mode.md.\n',
        'skills/document/SKILL.md': 'Find the scope checkout, and refresh the run lock. Per scope-mode.md.\n',
        'skills/ship/SKILL.md': "Refresh `<run-root>/run.lock` now, per that file's rule.\n",
      }),
    ).length,
    0,
    'run-lock-liveness-silence: the ordinary refresh prose reports nothing',
  );

  // positive: the liveness check regrowing on any one of the three is caught on that document alone
  for (const [rel, regrown] of [
    [
      'skills/review/SKILL.md',
      "Find the scope checkout, and refresh the run lock — taking that section's liveness check first.\n",
    ],
    [
      'skills/document/SKILL.md',
      "Find the scope checkout, and refresh the run lock, reading the ledger's stage alongside the lock's mtime first.\n",
    ],
    ['skills/ship/SKILL.md', "Refresh `<run-root>/run.lock` now, taking its liveness check first.\n"],
  ]) {
    const gaps = scanRunLockLivenessSilence(
      fixture({
        'skills/review/SKILL.md': 'Find the scope checkout, and refresh the run lock. Per scope-mode.md.\n',
        'skills/document/SKILL.md': 'Find the scope checkout, and refresh the run lock. Per scope-mode.md.\n',
        'skills/ship/SKILL.md': "Refresh `<run-root>/run.lock` now, per that file's rule.\n",
        [rel]: regrown,
      }),
    );
    assert.equal(gaps.length, 1, `run-lock-liveness-silence: catches the check regrowing on ${rel}`);
    assert.equal(gaps[0].source, rel.split('/').join(path.sep), `names ${rel}`);
  }

  // absent files are skipped
  assert.equal(
    scanRunLockLivenessSilence(fixture({ 'README.md': '# repo\n' })).length,
    0,
    'run-lock-liveness-silence: absent documents are skipped',
  );

  // --- SCOPETREE_CONTRACTS (ADR 0045): the `full` tier cuts and merges in the same scopetree
  // the `lite` tier uses, never the invoking checkout. Five rows on scope-mode.md's `## The scope
  // checkout` and `## The run lock`, five on implement-full.md's Branch model, Merge step, integration
  // branch, Resume scopetree-first step, and its own run-lock pointer, one on
  // implement-lite.md's run-lock pointer, one each on run-init.md's and run-handoff.md's now-unqualified
  // `run.lock` mentions, three on skills/review/SKILL.md's §4 (the scope-checkout branch test, the full-suite
  // run's working directory, and the fix-implementer dispatch's working directory), two more on
  // run-handoff.md's own only full-suite run (its working directory, and its Red-branch fix implementer's
  // working directory), and one on merge-conflicts.md's winner-picking-overlap abort. Each is anchored on
  // text unique to its own clause, so dropping one fires exactly one gap. ---

  const scwScopeModePieces = {
    location: '`<run-root>/scopetree` is the scope checkout, at both tiers.\n\n',
    recreate:
      '**Absent** → recreate it: `git worktree add <run-root>/scopetree <branch>`.\n\n',
    lockNotCompeting:
      "**`run-lock` refuses the call, naming another session** → that lock is this run's own.\n\n",
    stop:
      '**A different working tree already holds `<branch>`** → say so and stop, writing nothing.\n\n',
    runLock:
      '**Write `<run-root>/run.lock` once `## Cutting the scope branch` above has cut the scopetree, ' +
      'at both tiers**.\n',
  };

  const implementFullPieces = {
    branchModel:
      'every later command in this file — every merge — addresses the scopetree, ' +
      '`<run-root>/scopetree`, with `git -C`, and the invoking checkout is never switched.\n\n',
    merge:
      '**Merge (you, serially)** — in the scopetree: `git -C <run-root>/scopetree ' +
      'merge --no-ff slice/<scope>/<id>`.\n\n',
    integration:
      'cut `integration/<scope>` from `<branch>` at run start, keep it checked out **in the ' +
      "scopetree**, and merge every slice into it. The plan's final integrate-and-verify slice is where " +
      'you switch that same scopetree back to `<branch>`.\n\n',
    resume: '**Find the scopetree first**, per `## The scope checkout`.\n\n',
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

  const runHandoffScopetreePieces = {
    lockMention:
      '**Leave the run standing.** Keep the scopetree and `<run-root>/run.lock`, leave ' +
      '`<run-root>/dod.md` unticked.\n\n',
    suiteDir:
      'Take the full command and run it once **in that checkout**, over the scope branch.\n\n',
    fixDir:
      "the controller only integrates, and lite's inline loop is that tier's own exception. Hand it " +
      'the scope checkout as its working directory: this is where its fix commits must land. Every fix ' +
      'opens with a RED test.\n',
  };

  const mergeConflictsPiece =
    'A genuine winner-picking overlap escalates: `git -C <run-root>/scopetree merge ' +
    '--abort` and escalate to the human.\n';

  const reviewScopetreePieces = {
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

  const everyScopetreeSite = {
    'references/scope-mode.md': joinAll(scwScopeModePieces),
    'references/implement-full.md': joinAll(implementFullPieces),
    'references/implement-lite.md': joinAll(implementLitePieces),
    'references/run-init.md': runInitPiece,
    'references/run-handoff.md': joinAll(runHandoffScopetreePieces),
    'references/merge-conflicts.md': mergeConflictsPiece,
    'skills/review/SKILL.md': joinAll(reviewScopetreePieces),
    'skills/afk/SKILL.md': afkLockPiece,
  };

  // A row can only be exercised by a fixture that names its document: `scanContract()` skips a document
  // it cannot read, so a missing key makes the "every clause present yields zero gaps" assertion below
  // pass without ever running that row. `./index.js`'s coverage guard names both the table and the
  // document, because "a fixture is incomplete" sends the reader hunting through twenty-one rows across
  // eight files.

  // negative: every clause present is clean
  assert.equal(
    scanContract(fixture(everyScopetreeSite), SCOPETREE_CONTRACTS).length,
    0,
    'scopetree: every clause present yields zero gaps',
  );

  // positive: dropping any one scope-mode.md clause fires exactly one gap naming that file
  for (const key of Object.keys(scwScopeModePieces)) {
    const remaining = Object.entries(scwScopeModePieces)
      .filter(([k]) => k !== key)
      .map(([, v]) => v)
      .join('');
    const dropped = fixture({ ...everyScopetreeSite, 'references/scope-mode.md': remaining });
    const gaps = scanContract(dropped, SCOPETREE_CONTRACTS);
    assert.equal(gaps.length, 1, `scopetree: flags scope-mode.md alone for dropping its "${key}" clause`);
    assert.equal(gaps[0].source, path.join('references', 'scope-mode.md'), 'names scope-mode.md');
  }

  // positive: dropping any one implement-full.md clause fires exactly one gap naming that file
  for (const key of Object.keys(implementFullPieces)) {
    const remaining = Object.entries(implementFullPieces)
      .filter(([k]) => k !== key)
      .map(([, v]) => v)
      .join('');
    const dropped = fixture({ ...everyScopetreeSite, 'references/implement-full.md': remaining });
    const gaps = scanContract(dropped, SCOPETREE_CONTRACTS);
    assert.equal(
      gaps.length,
      1,
      `scopetree: flags implement-full.md alone for dropping its "${key}" clause`,
    );
    assert.equal(gaps[0].source, path.join('references', 'implement-full.md'), 'names implement-full.md');
  }

  // positive: dropping afk.md's no-lock fallback fires exactly one gap naming that file — the shape
  // every other row in this table has, and the one the missing fixture key withheld from this row
  const droppedAfkLock = fixture({ ...everyScopetreeSite, 'skills/afk/SKILL.md': '' });
  const afkLockGaps = scanContract(droppedAfkLock, SCOPETREE_CONTRACTS);
  assert.equal(afkLockGaps.length, 1, 'scopetree: flags afk.md for dropping the no-lock fallback');
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
  const droppedLitePointer = fixture({ ...everyScopetreeSite, 'references/implement-lite.md': '' });
  const liteGaps = scanContract(droppedLitePointer, SCOPETREE_CONTRACTS);
  assert.equal(liteGaps.length, 1, 'scopetree: flags implement-lite.md for dropping the run-lock pointer');
  assert.equal(liteGaps[0].source, path.join('references', 'implement-lite.md'), 'names implement-lite.md');

  // positive: dropping run-init.md's unqualified `run.lock` mention fires exactly one gap naming it —
  // the sentence it exists to catch is a reintroduced `— lite tier only` qualifier
  const droppedRunInit = fixture({ ...everyScopetreeSite, 'references/run-init.md': '' });
  const runInitGaps = scanContract(droppedRunInit, SCOPETREE_CONTRACTS);
  assert.equal(runInitGaps.length, 1, 'scopetree: flags run-init.md for dropping the unqualified mention');
  assert.equal(runInitGaps[0].source, path.join('references', 'run-init.md'), 'names run-init.md');

  // positive: dropping any one run-handoff.md clause (the unqualified `run.lock` mention, its own
  // full-suite working directory, or its Red-branch fix implementer's working directory) fires exactly
  // one gap naming that file
  for (const key of Object.keys(runHandoffScopetreePieces)) {
    const remaining = Object.entries(runHandoffScopetreePieces)
      .filter(([k]) => k !== key)
      .map(([, v]) => v)
      .join('');
    const dropped = fixture({ ...everyScopetreeSite, 'references/run-handoff.md': remaining });
    const gaps = scanContract(dropped, SCOPETREE_CONTRACTS);
    assert.equal(gaps.length, 1, `scopetree: flags run-handoff.md alone for dropping its "${key}" clause`);
    assert.equal(gaps[0].source, path.join('references', 'run-handoff.md'), 'names run-handoff.md');
  }

  // positive: dropping merge-conflicts.md's scopetree abort fires exactly one gap naming it — the
  // sentence it exists to catch is a reintroduced bare `git merge --abort`
  const droppedMergeConflicts = fixture({ ...everyScopetreeSite, 'references/merge-conflicts.md': '' });
  const mergeConflictsGaps = scanContract(droppedMergeConflicts, SCOPETREE_CONTRACTS);
  assert.equal(mergeConflictsGaps.length, 1, 'scopetree: flags merge-conflicts.md for dropping the scopetree abort');
  assert.equal(
    mergeConflictsGaps[0].source,
    path.join('references', 'merge-conflicts.md'),
    'names merge-conflicts.md',
  );

  // positive: dropping any one skills/review/SKILL.md clause fires exactly one gap naming that file
  for (const key of Object.keys(reviewScopetreePieces)) {
    const remaining = Object.entries(reviewScopetreePieces)
      .filter(([k]) => k !== key)
      .map(([, v]) => v)
      .join('');
    const dropped = fixture({ ...everyScopetreeSite, 'skills/review/SKILL.md': remaining });
    const gaps = scanContract(dropped, SCOPETREE_CONTRACTS);
    assert.equal(gaps.length, 1, `scopetree: flags skills/review/SKILL.md alone for dropping its "${key}" clause`);
    assert.equal(gaps[0].source, path.join('skills', 'review', 'SKILL.md'), 'names skills/review/SKILL.md');
  }

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), SCOPETREE_CONTRACTS).length,
    0,
    'scopetree: absent documents are skipped',
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
  // One, because `references/run-init.md` carries one row here: `init`. Its base-lock rows are gone
  // (ADR 0079) — no superdev command commits to the base branch any more.
  assert.equal(vcRunInitGaps.length, 1, 'flags run-init.md for creating the run root without `scope.js init`');
  assert.ok(
    vcRunInitGaps.every((g) => g.source === path.join('references', 'run-init.md')),
    'names run-init.md'
  );

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

  // The `skills/publish-kb/SKILL.md` `get branch` row retired (ADR 0069): `plugin/scripts/publish-kb.js`
  // reads the ledger branch via `readLedgerHeader`, real code no verb-invocation pattern can match.
  // `tests/publish-kb.test.js`'s ledger-route assertions cover it instead.

  // The `skills/plan/SKILL.md` `get branch` row retired (ADR 0083): a shipped feature takes no append,
  // so §0's refusal reads one ledger stage and tests no branch. `SHIPPED_APPEND_CONTRACTS` pins what
  // replaced it, in kb-plan.test.js.

  // positive: plan.md reads a run root's ledger stage by hand instead of running the verb
  const vcPlan = fixture({
    'skills/plan/SKILL.md': 'Read the ledger header to find the stage.\n',
  });
  const vcPlanGaps = scanContract(vcPlan, VERB_CONTRACTS);
  assert.equal(vcPlanGaps.length, 1, 'flags plan.md for reading the stage without `scope.js get stage`');
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

  // --- PLANNED_HANDOFF_CONTRACTS (ADR 0079, ADR 0080): `/superdev:plan` cuts the branch and scopetree,
  // commits its design docs there, and writes a ledger at stage `planned` — the fact that hands the scope
  // branch to `/superdev:implement` as ready. Four documents carry the agreement, and each half is
  // asserted apart. ---

  // negative: one fixture carrying every row's clause, all four documents at once — this is also what
  // gives the selftest-coverage assertion in ./index.js a `readDoc` hit against every row's document, so
  // this table's own fixtures are checked the same way every other table's are.
  const phClean = fixture({
    'scripts/scope.js':
      "const STAGE_RANK = {\n  planned: -1,\n  implementing: 0,\n};\n" +
      "    case 'root':\n      verbRoot(cwd, args[0]);\n      break;\n" +
      "const INIT_ENTRY_STAGES = ['planned', 'implementing'];\n",
    'skills/plan/SKILL.md':
      '**Read `<run-root>/run.lock` before this step\'s first write, whether or not a cut happens below.**\n' +
      '**Write the ledger right here, at the cut — never wait for §6.** Pipe `"slices": []}` to `scope.js init <type>/<scope> planned`.\n' +
      '**Cut the scopetree now** per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`\'s `## Cutting the scope branch` (ADR 0079) — the same reference.\n' +
      '**Commit what the scopetree holds, on the scope branch.** Nothing to commit on a run where no capture crystallised.\n' +
      '**Write the ledger with `scope.js init`, from the invoking checkout** — the JSON envelope, adapted to a plan-time call passing `scope.js init <type>/<scope> planned`.\n' +
      'Refresh `<run-root>/run.lock`: write `<run-root>/run.lock` right after, per `## The run lock`.\n',
    'references/run-init.md':
      '- **`planned`** — the normal entry for a feature `/superdev:plan` cut (ADR 0079): skip `init`, move the\n' +
      "  stage forward now, before your playbook's first dispatch.\n" +
      '  | node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" init <type>/<scope> implementing\n' +
      '\n  A `planned` ledger carrying no slice rows never reaches this stage-forward move — check the store.\n' +
      '\n  A successful adopt whose stage is `planned` and slice table is empty gets the same store check.\n',
    'references/scope-mode.md':
      'A **`planned`** ledger is one instance of this run kind (ADR 0079): `/superdev:plan` already cut, and works in the scopetree already there.\n' +
      '**Write `<run-root>/run.lock`** once `## Cutting the scope branch` above has cut the scopetree, at both tiers — and once `/superdev:plan` has made its own cut (ADR 0079) — never before.\n',
  });
  assert.equal(scanContract(phClean, PLANNED_HANDOFF_CONTRACTS).length, 0, 'every planned-handoff clause present yields zero gaps');

  // positive: scope.js drops the `planned` rank but keeps the `root` verb
  const phNoStage = fixture({
    'scripts/scope.js':
      "const STAGE_RANK = {\n  implementing: 0,\n};\n    case 'root':\n      verbRoot(cwd, args[0]);\n      break;\n" +
      "const INIT_ENTRY_STAGES = ['planned', 'implementing'];\n",
  });
  const phNoStageGaps = scanContract(phNoStage, PLANNED_HANDOFF_CONTRACTS);
  assert.equal(phNoStageGaps.length, 1, 'flags scope.js for losing the `planned` stage rank');
  assert.equal(phNoStageGaps[0].source, path.join('scripts', 'scope.js'), 'names scope.js');

  // positive: scope.js keeps the `planned` rank but drops the `root` verb
  const phNoRootVerb = fixture({
    'scripts/scope.js':
      "const STAGE_RANK = {\n  planned: -1,\n  implementing: 0,\n};\n" +
      "const INIT_ENTRY_STAGES = ['planned', 'implementing'];\n",
  });
  const phNoRootVerbGaps = scanContract(phNoRootVerb, PLANNED_HANDOFF_CONTRACTS);
  assert.equal(phNoRootVerbGaps.length, 1, 'flags scope.js for losing the `root` verb');
  assert.equal(phNoRootVerbGaps[0].source, path.join('scripts', 'scope.js'), 'names scope.js');

  // positive: plan.md stops writing the ledger with `scope.js init` (the acceptance case: deleting the
  // ledger write from skills/plan/SKILL.md makes this pinned row report a gap)
  const phNoLedgerWrite = fixture({
    'skills/plan/SKILL.md':
      '**Read `<run-root>/run.lock` before this step\'s first write, whether or not a cut happens below.**\n' +
      '**Write the ledger right here, at the cut — never wait for §6.** Pipe `"slices": []}` to `scope.js init <type>/<scope> planned`.\n' +
      '**Commit what the scopetree holds, on the scope branch.** Nothing to commit.\n' +
      'Write the ledger.\n' +
      'Refresh `<run-root>/run.lock`: write `<run-root>/run.lock` right after, per `## The run lock`.\n' +
      "scope-mode.md`'s `## Cutting the scope branch` (ADR 0079)\n",
  });
  const phNoLedgerWriteGaps = scanContract(phNoLedgerWrite, PLANNED_HANDOFF_CONTRACTS);
  assert.equal(phNoLedgerWriteGaps.length, 2, 'flags plan.md for no longer writing the ledger with `scope.js init` (both the section and §6\'s init call)');
  assert.ok(
    phNoLedgerWriteGaps.every((g) => g.source === path.join('skills', 'plan', 'SKILL.md')),
    'both gaps name plan.md',
  );

  // positive: plan.md stops committing the scopetree's design docs before writing the ledger
  const phNoCommit = fixture({
    'skills/plan/SKILL.md':
      '**Read `<run-root>/run.lock` before this step\'s first write, whether or not a cut happens below.**\n' +
      '**Write the ledger right here, at the cut — never wait for §6.** Pipe `"slices": []}` to `scope.js init <type>/<scope> planned`.\n' +
      '**Write the ledger with `scope.js init`, from the invoking checkout** — the JSON envelope.\n' +
      'Refresh `<run-root>/run.lock`: write `<run-root>/run.lock` right after, per `## The run lock`.\n' +
      "scope-mode.md`'s `## Cutting the scope branch` (ADR 0079)\n",
  });
  const phNoCommitGaps = scanContract(phNoCommit, PLANNED_HANDOFF_CONTRACTS);
  assert.equal(phNoCommitGaps.length, 2, 'flags plan.md for no longer committing the scopetree and missing §6');
  assert.ok(
    phNoCommitGaps.every((g) => g.source === path.join('skills', 'plan', 'SKILL.md')),
    'both gaps name plan.md',
  );

  // positive: scope.js drops `init`'s entry-stage argument (Critical review finding: `init` reverts to
  // guessing `planned` for every caller)
  const phNoEntryStages = fixture({
    'scripts/scope.js':
      "const STAGE_RANK = {\n  planned: -1,\n  implementing: 0,\n};\n" +
      "    case 'root':\n      verbRoot(cwd, args[0]);\n      break;\n",
  });
  const phNoEntryStagesGaps = scanContract(phNoEntryStages, PLANNED_HANDOFF_CONTRACTS);
  assert.equal(phNoEntryStagesGaps.length, 1, "flags scope.js for losing init's entry-stage argument");
  assert.equal(phNoEntryStagesGaps[0].source, path.join('scripts', 'scope.js'), 'names scope.js');

  // positive: run-init.md's `fresh` path stops naming `implementing` as its entry stage
  const phNoFreshImplementing = fixture({
    'references/run-init.md':
      '- **`planned`** — the normal entry for a feature `/superdev:plan` cut (ADR 0079): skip `init`, move the\n' +
      "  stage forward now, before your playbook's first dispatch.\n" +
      '| node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" init <type>/<scope>\n' +
      '\n  A `planned` ledger carrying no slice rows never reaches this stage-forward move — check the store.\n' +
      '\n  A successful adopt whose stage is `planned` and slice table is empty gets the same store check.\n',
  });
  const phNoFreshImplementingGaps = scanContract(phNoFreshImplementing, PLANNED_HANDOFF_CONTRACTS);
  assert.equal(phNoFreshImplementingGaps.length, 1, "flags run-init.md for no longer naming `implementing` as the fresh path's entry stage");
  assert.equal(phNoFreshImplementingGaps[0].source, path.join('references', 'run-init.md'), 'names run-init.md');

  // positive: run-init.md stops taking the `planned` ledger by skipping `init` and moving the stage
  const phNoPlannedTake = fixture({
    'references/run-init.md':
      'A `planned` ledger is handled the same as any other: run `init` again.\n' +
      '| node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" init <type>/<scope> implementing\n' +
      '\n  A `planned` ledger carrying no slice rows never reaches this stage-forward move — check the store.\n' +
      '\n  A successful adopt whose stage is `planned` and slice table is empty gets the same store check.\n',
  });
  const phNoPlannedTakeGaps = scanContract(phNoPlannedTake, PLANNED_HANDOFF_CONTRACTS);
  assert.equal(phNoPlannedTakeGaps.length, 1, 'flags run-init.md for no longer taking a `planned` ledger by skipping `init`');
  assert.equal(phNoPlannedTakeGaps[0].source, path.join('references', 'run-init.md'), 'names run-init.md');

  // positive: scope-mode.md drops both the `planned`-is-`resumed` naming and the run-lock-writer naming
  const phNoScopeMode = fixture({
    'references/scope-mode.md': 'A live ledger is a `resumed` run.\n',
  });
  const phNoScopeModeGaps = scanContract(phNoScopeMode, PLANNED_HANDOFF_CONTRACTS);
  assert.equal(phNoScopeModeGaps.length, 2, 'flags scope-mode.md for dropping both the planned-run-kind and run-lock-writer clauses');
  assert.ok(
    phNoScopeModeGaps.every((g) => g.source === path.join('references', 'scope-mode.md')),
    'both gaps name scope-mode.md',
  );

  // positive: plan.md restates its own cut and run-lock mechanics rather than citing scope-mode.md's rule
  const phNoDispatchCitation = fixture({
    'skills/plan/SKILL.md':
      '**Read `<run-root>/run.lock` before this step\'s first write, whether or not a cut happens below.**\n' +
      '**Write the ledger right here, at the cut — never wait for §6.** Pipe `"slices": []}` to `scope.js init <type>/<scope> planned`.\n' +
      '**Write the ledger with `scope.js init`, from the invoking checkout** — the JSON envelope.\n' +
      '**Commit what the scopetree holds, on the scope branch.** Nothing to commit.\n' +
      'Cut the scope branch the usual way and write the run lock afterwards.\n',
  });
  const phNoDispatchCitationGaps = scanContract(phNoDispatchCitation, PLANNED_HANDOFF_CONTRACTS);
  assert.equal(phNoDispatchCitationGaps.length, 3, "flags plan.md for restating scope-mode.md's cut rule and run-lock section, and missing §6's init call");
  assert.ok(
    phNoDispatchCitationGaps.every((g) => g.source === path.join('skills', 'plan', 'SKILL.md')),
    'all gaps name plan.md',
  );

  // positive: plan.md's §2 and §6 both stop passing `planned` at all (minor D / triage #509, #510
  // closures: three new rows pin what the previous fix cycle newly moved to §2)
  const phNoPlannedArg = fixture({
    'skills/plan/SKILL.md':
      '**Read `<run-root>/run.lock` before this step\'s first write, whether or not a cut happens below.**\n' +
      '**Write the ledger right here, at the cut — never wait for §6.** Pipe it to `scope.js init <type>/<scope>`.\n' +
      '**Write the ledger with `scope.js init`, from the invoking checkout** — the JSON envelope.\n' +
      '**Commit what the scopetree holds, on the scope branch.** Nothing to commit.\n' +
      "scope-mode.md`'s `## Cutting the scope branch` (ADR 0079)\n" +
      'write `<run-root>/run.lock` right after, per `## The run lock`\n',
  });
  const phNoPlannedArgGaps = scanContract(phNoPlannedArg, PLANNED_HANDOFF_CONTRACTS);
  assert.equal(phNoPlannedArgGaps.length, 2, "flags plan.md for no longer passing `planned` in both §2 and §6");
  assert.ok(
    phNoPlannedArgGaps.every((g) => g.source === path.join('skills', 'plan', 'SKILL.md')),
    'both gaps name plan.md',
  );

  // positive: plan.md's §2 stops writing the ledger at the cut (triage #509's own gap reopens)
  const phNoLedgerAtCut = fixture({
    'skills/plan/SKILL.md':
      '**Read `<run-root>/run.lock` before this step\'s first write, whether or not a cut happens below.**\n' +
      '**Write the ledger with `scope.js init`, from the invoking checkout** — the JSON envelope, `scope.js init <type>/<scope> planned`.\n' +
      '**Commit what the scopetree holds, on the scope branch.** Nothing to commit.\n' +
      "scope-mode.md`'s `## Cutting the scope branch` (ADR 0079)\n" +
      'write `<run-root>/run.lock` right after, per `## The run lock`\n',
  });
  const phNoLedgerAtCutGaps = scanContract(phNoLedgerAtCut, PLANNED_HANDOFF_CONTRACTS);
  // Three gaps: dropping §2's own sentence also drops its cut-time `planned` call (minor I —
  // that call is now anchored to this sentence's surrounding text), and dropping §6's
  // "adapted to a plan-time call passing" phrase also drops §6's init call.
  assert.equal(phNoLedgerAtCutGaps.length, 3, 'flags plan.md for no longer writing the ledger at the cut and missing §6');
  assert.ok(
    phNoLedgerAtCutGaps.every((g) => g.source === path.join('skills', 'plan', 'SKILL.md')),
    'all gaps name plan.md',
  );

  // positive: plan.md's §2 stops reading the run lock unconditionally before its first write (triage
  // #510's own gap reopens)
  const phNoUnconditionalLockRead = fixture({
    'skills/plan/SKILL.md':
      '**Write the ledger right here, at the cut — never wait for §6.** Pipe `"slices": []}` to `scope.js init <type>/<scope> planned`.\n' +
      '**Write the ledger with `scope.js init`, from the invoking checkout** — the JSON envelope, `scope.js init <type>/<scope> planned`.\n' +
      '**Commit what the scopetree holds, on the scope branch.** Nothing to commit.\n' +
      "scope-mode.md`'s `## Cutting the scope branch` (ADR 0079)\n" +
      'write `<run-root>/run.lock` right after, per `## The run lock`\n',
  });
  const phNoUnconditionalLockReadGaps = scanContract(phNoUnconditionalLockRead, PLANNED_HANDOFF_CONTRACTS);
  assert.equal(phNoUnconditionalLockReadGaps.length, 2, "flags plan.md for no longer reading the run lock and missing §6");
  assert.ok(
    phNoUnconditionalLockReadGaps.every((g) => g.source === path.join('skills', 'plan', 'SKILL.md')),
    'both gaps name plan.md',
  );

  // positive: run-init.md's `planned` bullet stops naming the empty-slice-rows / store-check clause
  // (Important review finding A)
  const phNoEmptyPlannedCheck = fixture({
    'references/run-init.md':
      '- **`planned`** — the normal entry for a feature `/superdev:plan` cut (ADR 0079): skip `init`, move the\n' +
      "  stage forward now, before your playbook's first dispatch.\n" +
      '| node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" init <type>/<scope> implementing\n' +
      '\n  A successful adopt whose stage is `planned` and slice table is empty gets the same store check.\n',
  });
  const phNoEmptyPlannedCheckGaps = scanContract(phNoEmptyPlannedCheck, PLANNED_HANDOFF_CONTRACTS);
  assert.equal(
    phNoEmptyPlannedCheckGaps.length,
    1,
    'flags run-init.md for no longer naming the empty-slice-rows store check on the local-ledger `planned` bullet',
  );
  assert.equal(phNoEmptyPlannedCheckGaps[0].source, path.join('references', 'run-init.md'), 'names run-init.md');

  // positive: run-init.md's adopt path stops naming the same check for an adopted `planned` snapshot
  // carrying no slice rows (Important review finding A)
  const phNoAdoptEmptyPlannedCheck = fixture({
    'references/run-init.md':
      '- **`planned`** — the normal entry for a feature `/superdev:plan` cut (ADR 0079): skip `init`, move the\n' +
      "  stage forward now, before your playbook's first dispatch.\n" +
      '| node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" init <type>/<scope> implementing\n' +
      '\n  A `planned` ledger carrying no slice rows never reaches this stage-forward move — check the store.\n',
  });
  const phNoAdoptEmptyPlannedCheckGaps = scanContract(phNoAdoptEmptyPlannedCheck, PLANNED_HANDOFF_CONTRACTS);
  assert.equal(
    phNoAdoptEmptyPlannedCheckGaps.length,
    1,
    "flags run-init.md for no longer naming the adopt path's own empty-slice-rows store check",
  );
  assert.equal(phNoAdoptEmptyPlannedCheckGaps[0].source, path.join('references', 'run-init.md'), 'names run-init.md');

  // positive: plan.md's §6 stops passing `planned` as `init`'s entry stage (minor: §6's own entry-stage row
  // pins the unique prefix "adapted to a plan-time call passing" so it does not match §2's different prefix)
  const phNoSectionSixPlanned = fixture({
    'skills/plan/SKILL.md':
      '**Read `<run-root>/run.lock` before this step\'s first write, whether or not a cut happens below.**\n' +
      '**Write the ledger right here, at the cut — never wait for §6.** Pipe `"slices": []}` to `scope.js init <type>/<scope> planned`.\n' +
      '**Cut the scopetree now** per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`\'s `## Cutting the scope branch` (ADR 0079) — the same reference.\n' +
      '**Commit what the scopetree holds, on the scope branch.** Nothing to commit on a run where no capture crystallised.\n' +
      '**Write the ledger with `scope.js init`, from the invoking checkout** — the JSON envelope, adapted to a plan-time call passing `scope.js init <type>/<scope>`.\n' +
      'Refresh `<run-root>/run.lock`: write `<run-root>/run.lock` right after, per `## The run lock`.\n',
  });
  const phNoSectionSixPlannedGaps = scanContract(phNoSectionSixPlanned, PLANNED_HANDOFF_CONTRACTS);
  assert.equal(phNoSectionSixPlannedGaps.length, 1, "flags plan.md for no longer passing `planned` as `init`'s entry stage in §6");
  assert.equal(phNoSectionSixPlannedGaps[0].source, path.join('skills', 'plan', 'SKILL.md'), 'names plan.md');

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

  // Derived, never hand-counted: ADR 0075 added rows to this table and every literal count here became
  // wrong at once. The count is not the contract — "every row review.md owns" is.
  const fsReviewRows = FULL_SUITE_CONTRACTS.filter(
    ([rel]) => rel === path.join('skills', 'review', 'SKILL.md'),
  ).length;

  // The clauses ADR 0075 added. A fixture whose assertion is about some *other* row carries them, so its
  // count stays about the row it names instead of drifting every time this table grows.
  const fs0075 =
    'Inside each fix cycle, run the focused command over the fix diff and hand that result to the ' +
    "re-review. When a fix cycle's re-review verdict first comes back clean, run the full suite once " +
    'more: a red result there re-enters the loop and counts toward the 3-strike cap. A denied exit run ' +
    "takes the entry run's own local deviation, not the generic default. **Attended** → continue. " +
    '**Unattended** → **block**. `final-reviewer` reviews against whichever result you hand it, full or focused.\n';

  // positive: review.md drops the controller-run full suite and goes back to just handing over the command
  const fs1 = fixture({
    'skills/review/SKILL.md': 'Read `docs/agents/verification.md` for the test command and pass it to final-reviewer.\n',
  });
  const fsGaps1 = scanContract(fs1, FULL_SUITE_CONTRACTS);
  assert.equal(
    fsGaps1.length,
    fsReviewRows,
    "flags a review.md missing every one of its rows — the entry suite, the dispatch clause, fail-is-Critical, stage-not-advance, and ADR 0075's cycle run, exit run, exit-run denied-run deviation, and which-result clause",
  );
  assert.ok(
    fsGaps1.every((g) => g.source === path.join('skills', 'review', 'SKILL.md')),
    'every gap names review.md',
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
  assert.equal(
    fsGaps4.length,
    fsReviewRows - 1,
    'flags a review.md carrying only the entry run — the dispatch clause, fail-is-Critical, stage-not-advance, and the rest of the ADR 0075 rows all missing',
  );
  assert.ok(
    fsGaps4.every((g) => g.source === path.join('skills', 'review', 'SKILL.md')),
    'every gap names review.md',
  );

  // positive (RED reproduction): review.md's dispatch sentence still leaks the optional-re-run wording
  // final-reviewer.md itself no longer carries — the exact live-path leak this row exists to close
  const fs9 = fixture({
    'skills/review/SKILL.md':
      "Run the full suite yourself, before dispatching `final-reviewer`. A `fail` here is itself a " +
      'Critical finding — fold it into the fix loop below. The stage does **not** advance while it ' +
      "stands. hand it that result instead, and tell it its own re-run stays optional, never the scope's " +
      'only full-suite run.\n' + fs0075,
  });
  const fsGaps9 = scanContract(fs9, FULL_SUITE_CONTRACTS);
  assert.equal(fsGaps9.length, 1, "flags a review.md whose dispatch clause still leaks the optional re-run sentence");
  assert.equal(fsGaps9[0].source, path.join('skills', 'review', 'SKILL.md'), 'names review.md');

  // positive: final-reviewer.md drops the fail-means-No rule
  const fs5 = fixture({
    'agents/final-reviewer.md':
      'You review against whichever result you are handed, running no suite of your own.\n',
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
      'Critical finding — fold it into the fix loop below.\n' + fs0075,
  });
  const fsGaps6 = scanContract(fs6, FULL_SUITE_CONTRACTS);
  assert.equal(fsGaps6.length, 2, 'flags a review.md that names the finding but drops the dispatch clause and the stage-not-advance clause');
  assert.ok(
    fsGaps6.every((g) => g.source === path.join('skills', 'review', 'SKILL.md')),
    'both gaps name review.md',
  );

  // positive, one per ADR 0075 row: each is the only clause missing, so each gap names its own row
  for (const [what, body, expectation] of [
    ['the focused cycle run', fs0075.replace(/Inside each fix cycle[^.]*\. /, ''), /focused command over the fix diff/],
    [
      'the exit run',
      fs0075.replace(/When a fix cycle's re-review verdict first[\s\S]*?3-strike cap\. /, ''),
      /run the full suite once more/,
    ],
    [
      "the exit run's denied-run local deviation",
      fs0075.replace(/A denied exit run[\s\S]*?\*\*block\*\*\. /, ''),
      /entry run's own local deviation/,
    ],
    ['the which-result clause', fs0075.replace(/`final-reviewer` reviews against[\s\S]*$/, ''), /whichever result it is handed/],
  ]) {
    const only = fixture({
      'skills/review/SKILL.md':
        'Run the full suite yourself, before dispatching `final-reviewer`. A `fail` here is itself a ' +
        'Critical finding — fold it into the fix loop below. The stage does **not** advance while it ' +
        'stands. hand it that result and tell it to review against that result, running no suite of ' +
        'its own.\n' + body,
    });
    const gaps = scanContract(only, FULL_SUITE_CONTRACTS);
    assert.equal(gaps.length, 1, `flags a review.md missing ${what} alone`);
    assert.match(gaps[0].expectation, expectation, `the gap names ${what}`);
  }

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

  // negative: every row carried
  const fs3 = fixture({
    'skills/review/SKILL.md':
      "Run the full suite yourself, before dispatching `final-reviewer`. A `fail` here is itself a " +
      'Critical finding — fold it into the fix loop below. The stage does **not** advance while it ' +
      'stands. Scope mode: hand it that result and tell it to review against that result, running no ' +
      'suite of its own.\n' + fs0075,
    'agents/final-reviewer.md':
      'You review against whichever result you are handed, running no suite of your own. ' +
      '`Full-suite run: fail` makes the verdict `Ready to merge? No`.\n',
  });
  assert.equal(scanContract(fs3, FULL_SUITE_CONTRACTS).length, 0, 'every row carried yields zero gaps');

  // negative: the dispatch row's gaps tolerate an innocuous rewording between its anchors — widened from
  // {0,20} to {0,60}, matching every other row in this table, since a {0,20} gap breaks on a rewording as
  // small as adding a few connecting words
  const fs10 = fixture({
    'skills/review/SKILL.md':
      'Run the full suite yourself, before dispatching `final-reviewer`. A `fail` here is itself a ' +
      'Critical finding — fold it into the fix loop below. The stage does **not** advance while it ' +
      'stands. Scope mode: hand it that result, and then be sure to tell it to review against that ' +
      'result, running no suite of its own.\n' + fs0075,
    'agents/final-reviewer.md':
      'You review against whichever result you are handed, running no suite of your own. ' +
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

  // --- TIER_SKIP_CONTRACTS (ADR 0037): `/superdev:review` skips `simplicity-reviewer` on a `full`-tier
  // scope, and the skip is sound only while `implement-full.md` still dispatches that reviewer per
  // `behavior` slice. The second row is the one that matters most: losing the per-slice dispatch leaves a
  // `full` run with no over-engineering pass anywhere while `skills/review/SKILL.md` goes on skipping,
  // green everywhere and covered nowhere. The third row pins the `behavior` qualifier on the report line
  // itself — the prose already drifted once, to an unqualified "covered per slice", with the first two
  // rows both still green. ---

  const perSliceDispatch =
    'Then dispatch **`superdev:simplicity-reviewer`** (over-engineering); apply warranted cuts.\n';
  const fullTierSkip =
    "A `full`-tier scope → `final-reviewer` alone; skip `superdev:simplicity-reviewer`. That tier ran it " +
    "per `behavior` slice, so what only the integrated view reveals is `final-reviewer`'s Brevity axis. " +
    "Reporting: not dispatched — full tier, covered per `behavior` slice.\n";

  // positive: all three rows unwritten — the skip is unstated, the qualifier that goes with it is
  // therefore absent too, and the per-slice dispatch is gone
  const ts1 = fixture({
    'skills/review/SKILL.md': 'Dispatch both reviewers in parallel, each with an explicit model.\n',
    'references/implement-full.md': 'Move the slice to `in-review`, then dispatch `superdev:slice-reviewer`.\n',
  });
  assert.equal(scanContract(ts1, TIER_SKIP_CONTRACTS).length, 3, 'flags all three rows when none is stated');

  // positive: the costly direction. `skills/review/SKILL.md` still skips, but the per-slice pass it
  // stands on is gone, so a `full` run has no over-engineering pass at all and only this row says so.
  const ts2 = fixture({
    'skills/review/SKILL.md': fullTierSkip,
    'references/implement-full.md': 'Move the slice to `in-review`, then dispatch `superdev:slice-reviewer`.\n',
  });
  const tsGaps2 = scanContract(ts2, TIER_SKIP_CONTRACTS);
  assert.equal(tsGaps2.length, 1, 'a skip standing on a per-slice dispatch that is gone leaves one gap');
  assert.equal(
    tsGaps2[0].source,
    path.join('references', 'implement-full.md'),
    'the gap names the playbook that dropped the per-slice dispatch, not the command that skips',
  );

  // positive: the skip names the tier but never the axis that covers what the per-slice passes could not
  // see, which is the half that makes the skip defensible rather than a plain removal — and it also
  // carries no `behavior` qualifier, so it fails that row too
  const ts3 = fixture({
    'skills/review/SKILL.md': 'A `full`-tier scope → `final-reviewer` alone; skip `superdev:simplicity-reviewer`.\n',
    'references/implement-full.md': perSliceDispatch,
  });
  const tsGaps3 = scanContract(ts3, TIER_SKIP_CONTRACTS);
  assert.equal(tsGaps3.length, 2, 'a skip that names no covering axis and no behavior qualifier leaves two gaps');
  assert.ok(tsGaps3.some((g) => /Brevity/.test(g.expectation)), 'one gap names the axis the skip has to cite');
  assert.ok(
    tsGaps3.some((g) => /behavior/.test(g.expectation)),
    'the other names the qualifier the report line has to carry',
  );

  // positive: the drift this row exists for — the skip cites the axis and the per-slice dispatch survives,
  // but the report line drifted back to an unqualified "covered per slice"
  const ts5 = fixture({
    'skills/review/SKILL.md':
      "A `full`-tier scope → `final-reviewer` alone; skip `superdev:simplicity-reviewer`. That tier ran it " +
      "per slice, so what only the integrated view reveals is `final-reviewer`'s Brevity axis. Reporting: " +
      'not dispatched — full tier, covered per slice.\n',
    'references/implement-full.md': perSliceDispatch,
  });
  const tsGaps5 = scanContract(ts5, TIER_SKIP_CONTRACTS);
  assert.equal(tsGaps5.length, 1, 'an unqualified report line is one gap even with the other two rows satisfied');
  assert.match(tsGaps5[0].expectation, /behavior/, 'names the qualifier the report line dropped');

  // positive: the qualifier drifted off the skip bullet itself but survives as a copy elsewhere in the
  // document (an assessment-template example, say) — a whole-document presence test would read the copy
  // and call this green, the exact shape a `mechanical`/`docs` slice's coverage claim already drifted in
  const ts6 = fixture({
    'skills/review/SKILL.md':
      "A `full`-tier scope → `final-reviewer` alone; skip `superdev:simplicity-reviewer`. That tier ran it " +
      "per slice, so what only the integrated view reveals is `final-reviewer`'s Brevity axis. Reporting: " +
      'not dispatched — full tier, covered per slice.\n\n' +
      'Elsewhere, an unrelated example: "not dispatched — full tier, covered per `behavior` slice".\n',
    'references/implement-full.md': perSliceDispatch,
  });
  const tsGaps6 = scanContract(ts6, TIER_SKIP_CONTRACTS);
  assert.equal(
    tsGaps6.length,
    1,
    'a qualifier present only as a copy elsewhere, not on the skip bullet itself, is still one gap',
  );
  assert.match(tsGaps6[0].expectation, /behavior/, 'names the qualifier the skip bullet itself is missing');

  // negative (GREEN): all three rows stated
  const ts4 = fixture({
    'skills/review/SKILL.md': fullTierSkip,
    'references/implement-full.md': perSliceDispatch,
  });
  assert.equal(scanContract(ts4, TIER_SKIP_CONTRACTS).length, 0, 'all three rows stated satisfies the contract');

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
      '## Run state\n\n## Triage record\n\n' +
      // the real document carries this one at `###`, under `## Issue-backend mapping (general)`, with a
      // trailing qualifier — both are why the derived rows match `#{2,3}` up to a word boundary
      '### Assignee — store configuration, not a slice field\n\n## Feature label\n',
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

  // the specialising family's generic-side rows are derived from SPECIALISING_SECTIONS, not written out
  // beside it: one name added to that list yields its row with no second edit. Asserted against the
  // builder rather than by reading the built table, so the claim is about how the rows are produced.
  const derivedForNewMember = specialisingGenericRows([...SPECIALISING_SECTIONS, 'Provisional shape']);
  assert.equal(
    derivedForNewMember.length,
    SPECIALISING_SECTIONS.length + 1,
    'one name added to the membership list yields exactly one more generic-side row',
  );
  const newMemberRow = derivedForNewMember[derivedForNewMember.length - 1];
  assert.equal(newMemberRow[0], path.join('references', 'plan-contract.md'), 'the derived row pins the generic document');
  assert.match(
    '# c\n\n## Provisional shape\n',
    newMemberRow[1],
    'the derived row matches the new member\'s own heading',
  );
  assert.match(newMemberRow[2], /Provisional shape/, 'the derived row names the new member in its expectation');

  // the citation assertion is likewise a pure function of a name, not only of the current membership
  // list: a name the list has never held still yields a pattern that matches that name's own citation
  // line and rejects a different member's
  assert.match(
    '`plan-contract.md` → *Provisional shape*',
    specialisingCitation('Provisional shape'),
    'the citation pattern for a name added to the list matches that name\'s own citation line',
  );
  assert.doesNotMatch(
    '`plan-contract.md` → *Run state*',
    specialisingCitation('Provisional shape'),
    'and rejects a different member\'s citation line',
  );

  // every member already in the list has its generic-side row in the shipped table, and every one of them
  // is pinned to the generic document
  for (const name of SPECIALISING_SECTIONS) {
    const rows = SOURCE_SECTION_CONTRACTS.filter(
      ([rel, pattern]) => rel === path.join('references', 'plan-contract.md') && pattern.test(`## ${name}\n`),
    );
    assert.equal(rows.length, 1, `\`## ${name}\` has exactly one generic-side row`);
  }

  // `Feature label` is cited by name but is not a member — no seed renders it as a section — so it keeps
  // a hand-written row and stays out of the list that drives the citation assertion
  assert.equal(
    SPECIALISING_SECTIONS.includes('Feature label'),
    false,
    '`Feature label` is not a member of the specialising family',
  );

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

  // --- BACKLOG_SURVEY_CONTRACTS: `/superdev:backlog` resolves the candidate, triage, and untriaged
  // listings through the store document, reads an in-flight scope's stage off the ledger
  // `/superdev:status` also reads, and states as a contract that it writes nothing (ADR 0049). Each of
  // the five clauses fails silently on its own. ---

  const bsOpts = { stripFrontmatterFirst: true };
  const backlogAnchor = "Its `## Scope anchor` section states how to list the candidates. Follow it.\n";
  const backlogTriage = "Its `## Triage record` section states the listing call for this backend.\n";
  const backlogUntriaged =
    "Its `## Untriaged item` section states the listing call for this backend.\n";
  const backlogStage = 'For each, read its stage: `node "scope.js" get stage --root <run-root>`.\n';
  const backlogReadOnly =
    '**This survey writes nothing.** No issue, no label, no comment, no file, no `.superdev/` directory.\n';

  // negative: all five clauses present yields zero gaps
  assert.equal(
    scanContract(
      fixture({
        'skills/backlog/SKILL.md':
          backlogAnchor + backlogTriage + backlogUntriaged + backlogStage + backlogReadOnly,
      }),
      BACKLOG_SURVEY_CONTRACTS,
      bsOpts,
    ).length,
    0,
    'all five backlog-survey clauses yield zero gaps',
  );

  // positive: dropping the `## Scope anchor` reference
  const bsNoAnchor = scanContract(
    fixture({ 'skills/backlog/SKILL.md': backlogTriage + backlogUntriaged + backlogStage + backlogReadOnly }),
    BACKLOG_SURVEY_CONTRACTS,
    bsOpts,
  );
  assert.equal(bsNoAnchor.length, 1, 'flags a survey with no `## Scope anchor` reference');
  assert.ok(/Scope anchor/.test(bsNoAnchor[0].expectation), 'names the scope-anchor clause');

  // positive: dropping the `## Triage record` reference
  const bsNoTriage = scanContract(
    fixture({ 'skills/backlog/SKILL.md': backlogAnchor + backlogUntriaged + backlogStage + backlogReadOnly }),
    BACKLOG_SURVEY_CONTRACTS,
    bsOpts,
  );
  assert.equal(bsNoTriage.length, 1, 'flags a survey with no `## Triage record` reference');
  assert.ok(/Triage record/.test(bsNoTriage[0].expectation), 'names the triage-record clause');

  // positive: dropping the `## Untriaged item` reference
  const bsNoUntriaged = scanContract(
    fixture({ 'skills/backlog/SKILL.md': backlogAnchor + backlogTriage + backlogStage + backlogReadOnly }),
    BACKLOG_SURVEY_CONTRACTS,
    bsOpts,
  );
  assert.equal(bsNoUntriaged.length, 1, 'flags a survey with no `## Untriaged item` reference');
  assert.ok(/Untriaged item/.test(bsNoUntriaged[0].expectation), 'names the untriaged-item clause');

  // positive: dropping the `scope.js get stage` read
  const bsNoStage = scanContract(
    fixture({ 'skills/backlog/SKILL.md': backlogAnchor + backlogTriage + backlogUntriaged + backlogReadOnly }),
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
        backlogUntriaged +
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
        backlogUntriaged +
        backlogStage +
        'It mostly writes nothing, though a label update is fine.\n',
    }),
    BACKLOG_SURVEY_CONTRACTS,
    bsOpts,
  );
  assert.equal(bsHedged.length, 1, 'flags a survey that hedges "writes nothing" instead of stating it flatly');
  assert.ok(/writes nothing/.test(bsHedged[0].expectation), 'names the read-only clause');

  // --- PATHS_DERIVATION_CONTRACTS (ADR 0074): the positive half. The denylist below catches a bad
  // `{paths}` form; this catches a setup that derives nothing at all and routes every non-mapping runner
  // back to `none` — the full suite at every in-loop caller, which is the cost ADR 0025 removed.
  const pdMapping =
    'A runner that maps source files to the tests covering them gets a `{paths}` form, carrying that ' +
    "runner's pass-with-no-tests flag.\n";
  const pdSubset =
    'A runner that maps nothing gets a `{paths}`-less fast subset — the unit tests, with the slow ' +
    'integration tests left out.\n';
  const pdSelfDetect =
    "A self-detecting runner flag computes the change set on its own, exactly as a `{paths}` form " +
    "does, and collects nothing from an empty one. It carries that runner's own pass-with-no-tests " +
    'flag for the same reason.\n';
  const pdNone =
    'A repository with a suite never reaches `none`: the full suite may be already cheap, or no cheaper ' +
    'subset exists to narrow to, so the second fence duplicates the full command.\n';
  const pdWriteStepFence =
    'A repository with a suite always carries a second fenced block too — `none` is never an outcome ' +
    'once a suite exists (ADR 0085).\n';
  const pdWriteStepExample =
    'Example, a runner that cannot narrow, the full command duplicated the same way, the reason ' +
    'recorded as prose beside it.\n';

  assert.equal(
    scanContract(
      fixture({
        'skills/setup/SKILL.md':
          pdMapping + pdSubset + pdSelfDetect + pdNone + pdWriteStepFence + pdWriteStepExample,
      }),
      PATHS_DERIVATION_CONTRACTS,
    ).length,
    0,
    'every derivation branch present yields no gap',
  );

  for (const [dropped, missing, expectation] of [
    [
      'the mapping branch',
      pdSubset + pdSelfDetect + pdNone + pdWriteStepFence + pdWriteStepExample,
      /maps source files to the tests/,
    ],
    [
      'the fast-subset branch',
      pdMapping + pdSelfDetect + pdNone + pdWriteStepFence + pdWriteStepExample,
      /fast subset/,
    ],
    [
      'the self-detecting-flag branch',
      pdMapping + pdSubset + pdNone + pdWriteStepFence + pdWriteStepExample,
      /pass-with-no-tests flag, the same as/,
    ],
    [
      'the `none` branch',
      pdMapping + pdSubset + pdSelfDetect + pdWriteStepFence + pdWriteStepExample,
      /already-cheap/,
    ],
    [
      'the write-step second-fence clause',
      pdMapping + pdSubset + pdSelfDetect + pdNone + pdWriteStepExample,
      /second fenced block/,
    ],
    [
      'the write-step cannot-narrow example',
      pdMapping + pdSubset + pdSelfDetect + pdNone + pdWriteStepFence,
      /cannot-narrow case as a worked example/,
    ],
  ]) {
    const gaps = scanContract(fixture({ 'skills/setup/SKILL.md': missing }), PATHS_DERIVATION_CONTRACTS);
    assert.equal(gaps.length, 1, `flags a setup missing ${dropped}`);
    assert.match(gaps[0].expectation, expectation, `the gap names ${dropped}`);
  }

  // The four `references/test-selection.md` rows: the `{paths}` token section's self-detecting
  // sentence, the fallback bullet's own carve-out for it (a self-detecting flag needs its own
  // pass-with-no-tests flag, not the empty-set fallback), and ADR 0085 / INV-0007's stop half — the
  // prose stop naming `/superdev:setup` on one fenced block, and the `hooks/green-gate.js` exception
  // that runs the full command and emits a notice instead of stopping.
  const pdSelfDetectClause =
    "A self-detecting runner flag computes the change set on its own, exactly as a `{paths}` form " +
    "does, and collects nothing from an empty one — it carries that runner's own pass-with-no-tests " +
    'flag for the same reason a `{paths}` form does (`vitest --changed --passWithNoTests`, ' +
    '`jest -o --passWithNoTests`). The empty-set fallback covers a fixed fast ' +
    'subset, never a self-detecting runner flag, which relies on its own pass-with-no-tests flag ' +
    'instead, not this fallback.\n';
  const stopClause =
    'A prose caller finding one fenced block reports the missing configuration and names ' +
    '`/superdev:setup`, running no command. `/superdev:plan` and `/superdev:implement` already ' +
    'auto-invoke `/superdev:setup` on missing configuration.\n';
  const greenGateExceptionClause =
    '`hooks/green-gate.js` is the one exception: it runs the full command it found and emits a ' +
    'one-line notice naming `/superdev:setup`.\n';
  const degradedPassClause =
    'A caller that stops here records a degraded pass per `## Degraded passes` — the "pass that ' +
    'cannot complete its own work" shape. A caller with no run root has no ledger to write ' +
    '`scope.js degraded add` to, so it takes only that shape\'s report half.\n';

  assert.equal(
    scanContract(
      fixture({
        'references/test-selection.md':
          pdSelfDetectClause + stopClause + greenGateExceptionClause + degradedPassClause,
      }),
      PATHS_DERIVATION_CONTRACTS,
    ).length,
    0,
    'test-selection.md carrying every self-detecting-flag, stop, and degraded-pass clause yields no gap',
  );
  assert.equal(
    scanContract(
      fixture({ 'references/test-selection.md': 'The focused command runs verbatim.\n' }),
      PATHS_DERIVATION_CONTRACTS,
    ).length,
    5,
    'flags a test-selection.md missing the self-detecting-flag, stop, and degraded-pass clauses',
  );
  assert.equal(
    scanContract(
      fixture({
        'references/test-selection.md': pdSelfDetectClause + stopClause + greenGateExceptionClause,
      }),
      PATHS_DERIVATION_CONTRACTS,
    ).length,
    1,
    'flags a test-selection.md missing only the degraded-pass clause',
  );

  const skillConfigClause =
    '`docs/agents/verification.md` carrying one fenced block is missing configuration too (ADR 0085, ' +
    'INV-0007) → run `/superdev:setup`.\n';
  for (const skillPath of [path.join('skills', 'plan', 'SKILL.md'), path.join('skills', 'implement', 'SKILL.md')]) {
    assert.equal(
      scanContract(fixture({ [skillPath]: skillConfigClause }), PATHS_DERIVATION_CONTRACTS).length,
      0,
      `${skillPath} treating one fenced block as missing configuration yields no gap`,
    );
    assert.equal(
      scanContract(fixture({ [skillPath]: 'Read the config files.\n' }), PATHS_DERIVATION_CONTRACTS).length,
      1,
      `flags ${skillPath} missing the auto-invoke-on-one-fence clause`,
    );
  }

  // --- scanUnmappedPathsForms (ADR 0074): a `{paths}` form belongs to a runner that maps a source file
  // to the tests covering it. pytest and its kind collect nothing from a source path, so such a form
  // reports red on a change set holding no tests — which is the documentation step's own range, on every
  // scope. The shipped `pytest {paths}` proposal is what ADR 0074 came from, so this scan is a denylist
  // of the runners that map nothing, read as a command rather than as a mention.
  assert.equal(
    scanUnmappedPathsForms(realRoot).length,
    0,
    'the shipped tree proposes no `{paths}` form to a runner that maps nothing',
  );

  const up1 = fixture({
    'skills/setup/SKILL.md': 'Derive the focused command, for example `pytest -- {paths}`.\n',
  });
  const upGaps1 = scanUnmappedPathsForms(up1);
  assert.equal(upGaps1.length, 1, 'flags a `pytest -- {paths}` proposal');
  assert.equal(upGaps1[0].source, path.join('skills', 'setup', 'SKILL.md'), 'names the proposing document');
  assert.match(upGaps1[0].expectation, /maps a source file/, 'the gap names the mapping requirement');

  assert.equal(
    scanUnmappedPathsForms(
      fixture({ 'references/test-selection.md': 'For example `pytest {paths}`.\n' }),
    ).length,
    1,
    'flags a bare `pytest {paths}`',
  );
  assert.equal(
    scanUnmappedPathsForms(
      fixture({ 'references/test-selection.md': 'For example `go test ./... {paths}`.\n' }),
    ).length,
    1,
    'flags a `{paths}` form carrying a path argument',
  );
  assert.equal(
    scanUnmappedPathsForms(
      fixture({ 'references/test-selection.md': 'For example `pytest --rootdir=. {paths}`.\n' }),
    ).length,
    1,
    'flags a `{paths}` form whose flag carries a `=value`',
  );
  assert.equal(
    scanUnmappedPathsForms(
      fixture({ 'references/test-selection.md': 'For example `PYTEST {paths}`.\n' }),
    ).length,
    1,
    'flags a `{paths}` form naming the runner in a different case',
  );

  // negative: a mapping runner's form is the shape this rule wants, pass-with-no-tests flag and all
  assert.equal(
    scanUnmappedPathsForms(
      fixture({ 'skills/setup/SKILL.md': 'Derive `npx vitest related --passWithNoTests {paths}`.\n' }),
    ).length,
    0,
    "a mapping runner's `{paths}` form stays silent",
  );

  // negative: the prose explaining why pytest takes no `{paths}` form names both tokens in one sentence,
  // and is the opposite of a proposal — only a command reads as one, never a mention
  assert.equal(
    scanUnmappedPathsForms(
      fixture({
        'skills/setup/SKILL.md':
          'pytest maps no source file to its tests, so it takes no `{paths}` form at all.\n',
      }),
    ).length,
    0,
    'prose naming a non-mapping runner and `{paths}` in one sentence stays silent',
  );

  // --- INVARIANT_REGISTER_CONTRACTS (ADR 0077): domain-modeling.md is what tells /plan and a human
  // where the invariant register lives. A copy that stops naming docs/invariants.md sends both looking
  // for the register at the .claude/rules/ home ADR 0077 retired. ---

  // negative: the reference still names the register's fixed path
  assert.equal(
    scanContract(
      fixture({ 'references/domain-modeling.md': 'The invariant register lives at `docs/invariants.md`.\n' }),
      INVARIANT_REGISTER_CONTRACTS,
    ).length,
    0,
    'the reference naming the register path yields zero gaps',
  );

  // positive: the reference stops naming the path
  const invariantGaps = scanContract(
    fixture({ 'references/domain-modeling.md': 'The invariant register lives at a fixed path.\n' }),
    INVARIANT_REGISTER_CONTRACTS,
  );
  assert.equal(invariantGaps.length, 1, 'flags domain-modeling.md once it stops naming the register path');
  assert.equal(
    invariantGaps[0].source,
    path.join('references', 'domain-modeling.md'),
    'names the reference that drifted',
  );

  // --- INVARIANT_REGISTER_DOC_PASS_CONTRACTS (ADR 0077): both the doc pass and doc-reader must resolve
  // the register's Paths:/Symbols: entries against the repo. Either one dropping the instruction leaves
  // a stale entry unreported and the suite green — the same one-sided-pin shape CONTENT_TYPES_DOCS
  // guards on the content-type lens. ---

  const resolvesRegister =
    "Where the register exists, resolve every entry's `Paths:` glob and every `Symbols:` entry against " +
    'the repository.\n';

  // negative: both halves still carry the instruction
  assert.equal(
    scanContract(
      fixture({
        'references/doc-pass.md': resolvesRegister,
        'agents/doc-reader.md': resolvesRegister,
      }),
      INVARIANT_REGISTER_DOC_PASS_CONTRACTS,
    ).length,
    0,
    'both doc-pass.md and doc-reader.md carrying the resolution instruction yields zero gaps',
  );

  // positive: doc-pass.md stops naming the resolution
  const docPassGaps = scanContract(
    fixture({
      'references/doc-pass.md': 'Reconcile the docs with reality.\n',
      'agents/doc-reader.md': resolvesRegister,
    }),
    INVARIANT_REGISTER_DOC_PASS_CONTRACTS,
  );
  assert.equal(docPassGaps.length, 1, 'flags doc-pass.md once it stops naming the register resolution');
  assert.equal(
    docPassGaps[0].source,
    path.join('references', 'doc-pass.md'),
    'names the reference that drifted',
  );

  // positive: doc-reader.md stops naming the resolution — the same drift from the other side
  const docReaderGaps = scanContract(
    fixture({
      'references/doc-pass.md': resolvesRegister,
      'agents/doc-reader.md': 'Read the docs cold and verify their claims.\n',
    }),
    INVARIANT_REGISTER_DOC_PASS_CONTRACTS,
  );
  assert.equal(docReaderGaps.length, 1, 'flags doc-reader.md once it stops naming the register resolution');
  assert.equal(
    docReaderGaps[0].source,
    path.join('agents', 'doc-reader.md'),
    'names the agent that drifted',
  );

  // --- INVARIANT_COMPLIANCE_CONTRACTS: /plan judges the register during grounding — before any slice
  // exists — then routes a held match into the DoD and the touching slice's spec once a slice is cut,
  // and final-reviewer checks the register itself instead of `.claude/rules/`. The judging and the
  // routing are two different points in /plan's own flow and so two separate rows: losing either
  // strands an invariant an implementer's isolated worktree never sees. ---

  const planJudgingAndRouting =
    '**Judge the decomposition against the invariant register.** Read `docs/invariants.md` whole ' +
    'while grounding. Judge each entry and hold every match.\n\n' +
    'Write each held match into the slice it touches: as a Definition-of-Done criterion naming the ' +
    "entry's id, and into the `spec` of that slice.\n";

  // negative: plan still judges the register during grounding and routes a held match into the DoD
  // criterion and the slice's spec
  assert.equal(
    scanContract(
      fixture({ 'skills/plan/SKILL.md': planJudgingAndRouting }),
      INVARIANT_COMPLIANCE_CONTRACTS,
    ).length,
    0,
    'plan naming both the register judging and the DoD/spec routing yields zero gaps',
  );

  // positive: plan stops judging the register during grounding (the routing half still there)
  const planJudgingGaps = scanContract(
    fixture({
      'skills/plan/SKILL.md':
        'Write each held match into the slice it touches: as a Definition-of-Done criterion naming the ' +
        "entry's id, and into the `spec` of that slice.\n",
    }),
    INVARIANT_COMPLIANCE_CONTRACTS,
  );
  assert.equal(
    planJudgingGaps.length,
    1,
    'flags plan/SKILL.md once it stops judging the register during grounding',
  );
  assert.equal(
    planJudgingGaps[0].source,
    path.join('skills', 'plan', 'SKILL.md'),
    'names the plan skill as the drifted document',
  );

  // positive: plan stops routing a held match into the DoD/spec (the judging half still there)
  const planRoutingGaps = scanContract(
    fixture({
      'skills/plan/SKILL.md':
        '**Judge the decomposition against the invariant register.** Read `docs/invariants.md` whole ' +
        'while grounding. Judge each entry and hold every match.\n',
    }),
    INVARIANT_COMPLIANCE_CONTRACTS,
  );
  assert.equal(planRoutingGaps.length, 1, 'flags plan/SKILL.md once it stops routing a held register match');
  assert.equal(
    planRoutingGaps[0].source,
    path.join('skills', 'plan', 'SKILL.md'),
    'names the plan skill as the drifted document',
  );

  // positive: plan still routes into a `spec`, but no longer names the touching slice's own —
  // the tightened pattern must not credit "`spec` of" alone
  const planRoutingWrongSpecGaps = scanContract(
    fixture({
      'skills/plan/SKILL.md':
        '**Judge the decomposition against the invariant register.** Read `docs/invariants.md` whole ' +
        'while grounding. Judge each entry and hold every match.\n\n' +
        'Write each held match into the slice it touches: as a Definition-of-Done criterion naming the ' +
        "entry's id, and into the `spec` of the epic.\n",
    }),
    INVARIANT_COMPLIANCE_CONTRACTS,
  );
  assert.equal(
    planRoutingWrongSpecGaps.length,
    1,
    'flags plan/SKILL.md when "of that slice" drops even though a `spec` mention survives',
  );
  assert.equal(
    planRoutingWrongSpecGaps[0].source,
    path.join('skills', 'plan', 'SKILL.md'),
    'names the plan skill as the drifted document',
  );

  // negative: final-reviewer still carries the invariant-compliance check
  assert.equal(
    scanContract(
      fixture({
        'agents/final-reviewer.md':
          '**Invariant compliance** — read `docs/invariants.md` yourself and check each entry the ' +
          'integrated scope touches. An entry the Definition of Done never turned into a criterion is a ' +
          'plan-coverage gap. No `docs/invariants.md` → skip this check silently.\n',
      }),
      INVARIANT_COMPLIANCE_CONTRACTS,
    ).length,
    0,
    'final-reviewer naming the invariant-compliance check yields zero gaps',
  );

  // positive: final-reviewer reverts to (or never carries) the invariant-compliance check
  const reviewerComplianceGaps = scanContract(
    fixture({
      'agents/final-reviewer.md':
        '**Rule compliance** — for each `.claude/rules/*.md` whose `paths:` glob matches a file in this ' +
        'diff, read it and check the diff complies.\n',
    }),
    INVARIANT_COMPLIANCE_CONTRACTS,
  );
  assert.equal(
    reviewerComplianceGaps.length,
    1,
    'flags final-reviewer.md once it stops naming the invariant-compliance check',
  );
  assert.equal(
    reviewerComplianceGaps[0].source,
    path.join('agents', 'final-reviewer.md'),
    'names final-reviewer as the drifted document',
  );

  // --- COMMITMENT_CAPTURE_CONTRACTS (ADR 0081): a load-bearing commitment leaves a run as a register
  // entry or as a named reason it implies none. Three documents carry that between them, and each half
  // is asserted apart — the shape a one-sided pin cannot prove. ---

  // negative: one fixture carrying every row's clause, all three documents at once — this is also what
  // gives the selftest-coverage assertion in ./index.js a `readDoc` hit against every row's document.
  const ccFiles = {
    'skills/brainstorm/SKILL.md':
      '- **Load-bearing commitments** — a commitment the discovery settled that will constrain later ' +
      'decisions, written as a pair: the principle, then the rule it implies. `/superdev:plan` converts ' +
      'each one into an invariant register entry (`domain-modeling.md`, ADR 0081). A discovery that ' +
      'settled none writes no section and says so.\n',
    'skills/plan/SKILL.md':
      '**Route the seeded commitments, and every commitment this interview originates.** Each one is ' +
      'converted by the move `references/domain-modeling.md` states — into an invariant register entry, ' +
      'or into a reason said out loud that it constrains nothing (ADR 0081).\n' +
      'Delete only once every `Rejected direction` **and every `Load-bearing commitment`** it carried ' +
      'has a durable home (§2) or was resolved out loud.\n',
    'references/domain-modeling.md':
      '#### From a principle to the rule it implies\n\n' +
      'Convert before you record, and ask what later decision the commitment constrains (ADR 0081):\n' +
      '- **A rule about how the work is done** is an **authoring rule**. Name it out loud as one, and ' +
      'record it nowhere. Ask this first, because such a rule does constrain later decisions.\n' +
      '- **The same, where nothing cheaply tests it** → a register entry all the same, with ' +
      '`Check: none` and its reason.\n',
  };
  const ccClean = fixture(ccFiles);
  assert.equal(scanContract(ccClean, COMMITMENT_CAPTURE_CONTRACTS).length, 0, 'every commitment-capture clause present yields zero gaps');

  // positive: brainstorm keeps a commitments bullet but drops the implied rule, so the intent collects
  // principles nobody converted — the mood-filled section ADR 0081's pairing exists to prevent.
  const ccNoPair = fixture({
    ...ccFiles,
    'skills/brainstorm/SKILL.md':
      '- **Load-bearing commitments** — a commitment the discovery settled that will constrain later ' +
      'decisions.\n',
  });
  const ccNoPairGaps = scanContract(ccNoPair, COMMITMENT_CAPTURE_CONTRACTS);
  assert.equal(ccNoPairGaps.length, 1, 'flags brainstorm for losing the principle/implied-rule pair');
  assert.equal(ccNoPairGaps[0].source, path.join('skills', 'brainstorm', 'SKILL.md'), 'names brainstorm');

  // positive: plan stops routing commitments through the one conversion, so a commitment it originates
  // reaches no sort at all while brainstorm still names them.
  const ccNoRouting = fixture({
    ...ccFiles,
    'skills/plan/SKILL.md':
      'Delete only once every `Rejected direction` **and every `Load-bearing commitment`** it carried ' +
      'has a durable home (§2) or was resolved out loud.\n',
  });
  const ccNoRoutingGaps = scanContract(ccNoRouting, COMMITMENT_CAPTURE_CONTRACTS);
  assert.equal(ccNoRoutingGaps.length, 1, 'flags plan for losing the commitment routing bullet');
  assert.equal(ccNoRoutingGaps[0].source, path.join('skills', 'plan', 'SKILL.md'), 'names plan');

  // positive: plan's delete-gate reverts to covering rejected directions alone, so a converted-nowhere
  // commitment stops blocking the irreversible intent delete.
  const ccNoGate = fixture({
    ...ccFiles,
    'skills/plan/SKILL.md':
      '**Route the seeded commitments, and every commitment this interview originates.** Each one is ' +
      'converted by the move `references/domain-modeling.md` states — into an invariant register entry, ' +
      'or into a reason said out loud that it constrains nothing (ADR 0081).\n' +
      'Delete only once every `Rejected direction` it carried has a durable home (§2).\n',
  });
  const ccNoGateGaps = scanContract(ccNoGate, COMMITMENT_CAPTURE_CONTRACTS);
  assert.equal(ccNoGateGaps.length, 1, "flags plan for losing the delete-gate's commitment clause");
  assert.equal(ccNoGateGaps[0].source, path.join('skills', 'plan', 'SKILL.md'), 'names plan');

  // positive: the reference keeps the section but drops the sort question, so the conversion stops
  // asking what a commitment constrains and both skills cite prose that decides nothing.
  const ccNoSort = fixture({
    ...ccFiles,
    'references/domain-modeling.md':
      '#### From a principle to the rule it implies\n\n' +
      '- **A rule about how the work is done** is an **authoring rule**. Name it out loud as one, and ' +
      'record it nowhere. Ask this first, because such a rule does constrain later decisions.\n' +
      '- **The same, where nothing cheaply tests it** → a register entry all the same, with ' +
      '`Check: none` and its reason.\n',
  });
  const ccNoSortGaps = scanContract(ccNoSort, COMMITMENT_CAPTURE_CONTRACTS);
  assert.equal(ccNoSortGaps.length, 1, 'flags domain-modeling.md for losing the sort question');
  assert.equal(ccNoSortGaps[0].source, path.join('references', 'domain-modeling.md'), 'names domain-modeling.md');

  // positive: the authoring-rule guard goes, and an authoring rule answers yes to the sort question and
  // lands in a consuming repository's register — the mis-sort the deferral would otherwise cause.
  const ccNoAuthoringGuard = fixture({
    ...ccFiles,
    'references/domain-modeling.md':
      '#### From a principle to the rule it implies\n\n' +
      'Convert before you record, and ask what later decision the commitment constrains (ADR 0081):\n' +
      '- **The same, where nothing cheaply tests it** → a register entry all the same, with ' +
      '`Check: none` and its reason.\n',
  });
  const ccNoAuthoringGuardGaps = scanContract(ccNoAuthoringGuard, COMMITMENT_CAPTURE_CONTRACTS);
  assert.equal(ccNoAuthoringGuardGaps.length, 1, 'flags domain-modeling.md for losing the authoring-rule guard');
  assert.equal(
    ccNoAuthoringGuardGaps[0].source,
    path.join('references', 'domain-modeling.md'),
    'names domain-modeling.md',
  );

  // positive: the `Check: none` branch goes, so an untestable commitment is dropped for being untestable
  // — the sort silently reverting from what a commitment constrains to whether it can be tested.
  const ccNoCheckNone = fixture({
    ...ccFiles,
    'references/domain-modeling.md':
      '#### From a principle to the rule it implies\n\n' +
      'Convert before you record, and ask what later decision the commitment constrains (ADR 0081):\n' +
      '- **A rule about how the work is done** is an **authoring rule**. Name it out loud as one, and ' +
      'record it nowhere. Ask this first, because such a rule does constrain later decisions.\n',
  });
  const ccNoCheckNoneGaps = scanContract(ccNoCheckNone, COMMITMENT_CAPTURE_CONTRACTS);
  assert.equal(ccNoCheckNoneGaps.length, 1, 'flags domain-modeling.md for losing the `Check: none` branch');
  assert.equal(
    ccNoCheckNoneGaps[0].source,
    path.join('references', 'domain-modeling.md'),
    'names domain-modeling.md',
  );

  // --- SPAWN_FAILURE_ANSWER_CONTRACTS: ADR 0087 — two gates answer a spawn that never started
  // differently on purpose, and each row pins its surface's reason plus the clause naming the other
  // surface's answer. Pinning the behaviour alone is what let the bridge's fail-open read as an
  // oversight until #606; a fixture that keeps the behaviour and drops the cross-reference has to
  // report a gap, or the row is back to pinning what it already pinned.
  const sfClauses = {
    'hooks/green-gate.js':
      "the suite never started at all: the merge's own working tree can't even run the suite, so it " +
      'gates like a RED verdict. On the same condition the bridge lets the call through, with a ' +
      'notice. This one fires only on a merge, so blocking costs one merge.\n',
    'scripts/adapter.js':
      'a hook that never started: the absence is evidence about the installation rather than about the ' +
      'code under the gate, so the call proceeds. On the same condition hooks/green-gate.js blocks.\n',
  };
  assert.deepEqual(
    scanContract(fixture(sfClauses), SPAWN_FAILURE_ANSWER_CONTRACTS),
    [],
    'a fixture carrying both surfaces\' reasons and cross-references reports no gap'
  );
  for (const rel of Object.keys(sfClauses)) {
    const dropped = fixture({ ...sfClauses, [rel]: 'Nothing about a spawn that never started here.\n' });
    const gaps = scanContract(dropped, SPAWN_FAILURE_ANSWER_CONTRACTS);
    assert.equal(gaps.length, 1, `flags ${rel} for dropping its spawn-failure answer`);
    assert.equal(gaps[0].source, rel, `names ${rel}`);
  }
  // the cross-reference specifically: keep each surface's own behaviour and reason, drop only the
  // sentence naming the other gate's answer
  const sfNoCrossRef = fixture({
    'hooks/green-gate.js':
      "the suite never started at all: the merge's own working tree can't even run the suite, so it " +
      'gates like a RED verdict.\n',
    'scripts/adapter.js':
      'a hook that never started: the absence is evidence about the installation rather than about the ' +
      'code under the gate, so the call proceeds.\n',
  });
  assert.equal(
    scanContract(sfNoCrossRef, SPAWN_FAILURE_ANSWER_CONTRACTS).length,
    2,
    'dropping only the cross-reference still reports both surfaces — the divergence must stay stated'
  );
  // the "fires only on a merge" reason clause is pinned too — dropping only it, keeping the
  // behaviour and the cross-reference, still reports a gap.
  const sfNoMergeReason = fixture({
    ...sfClauses,
    'hooks/green-gate.js':
      "the suite never started at all: the merge's own working tree can't even run the suite, so it " +
      'gates like a RED verdict. On the same condition the bridge lets the call through, with a notice.\n',
  });
  const mergeReasonGaps = scanContract(sfNoMergeReason, SPAWN_FAILURE_ANSWER_CONTRACTS);
  assert.equal(mergeReasonGaps.length, 1, 'dropping only "fires only on a merge" still reports a gap');
  assert.equal(mergeReasonGaps[0].source, 'hooks/green-gate.js', 'names hooks/green-gate.js');

  // --- VERIFICATION_CEILING_CONTRACTS: ADR 0084, INV-0006 — verifying a Definition-of-Done criterion
  // observes, and changes no system outside the repository. Seven halves: the owning reference
  // (references/scope-mode.md), both verifying agent bodies (final-reviewer.md, implementer.md), and
  // all four surfaces that verify a criterion or dispatch an agent that does (review/SKILL.md,
  // implement/SKILL.md, run-handoff.md, ship/SKILL.md). ---
  const vcClauses = {
    'references/scope-mode.md':
      'Verifying a Definition-of-Done criterion observes. It changes no system outside the repository.\n',
    'agents/final-reviewer.md':
      'Verifying a criterion observes; it changes no system outside the repository. A criterion ' +
      'needing a deploy gets reported as unverifiable on the branch, needing verification after merge.\n',
    'agents/implementer.md':
      'Verifying a criterion observes; it changes no system outside the repository. A criterion ' +
      'needing a deploy gets no increment: report it as needing verification after merge.\n',
    'skills/review/SKILL.md':
      'Confirming a `dod.md` criterion observes; it changes no system outside the repository. A ' +
      'criterion needing a deploy gets reported as unverifiable on the branch, needing verification ' +
      'after merge.\n',
    'skills/implement/SKILL.md':
      'Verifying an `acceptance` criterion observes; it changes no system outside the repository. A ' +
      'criterion needing a deploy gets no increment: report it as needing verification after merge.\n',
    'references/run-handoff.md':
      'Verifying the fix observes; it changes no system outside the repository.\n',
    'skills/ship/SKILL.md':
      'Verifying an item observes; it changes no system outside the repository.\n',
  };

  // negative: a fixture carrying all six halves reports no gap
  const vcFullGaps = scanContract(fixture(vcClauses), VERIFICATION_CEILING_CONTRACTS);
  assert.deepEqual(vcFullGaps, [], 'a fixture carrying all six halves reports no gap');

  // positive: dropping any single half reports exactly that gap
  for (const rel of Object.keys(vcClauses)) {
    const vcDropped = fixture({ ...vcClauses, [rel]: 'Nothing about the verification ceiling here.\n' });
    const vcGaps = scanContract(vcDropped, VERIFICATION_CEILING_CONTRACTS);
    assert.equal(vcGaps.length, 1, `flags ${rel} for dropping its verification-ceiling half`);
    assert.equal(vcGaps[0].source, rel, `names ${rel}`);
  }

  // positive: implementer.md and its lite-tier paste report a gap for keeping the observes/changes
  // clause but losing the "gets no increment ... report it as needing verification after merge"
  // continuation — the implementer's half of the ceiling, not the reviewer's.
  for (const rel of ['agents/implementer.md', 'skills/implement/SKILL.md']) {
    const vcNoIncrement = fixture({
      ...vcClauses,
      [rel]: vcClauses[rel].split('. A criterion needing a deploy')[0] + '.\n',
    });
    const vcGaps = scanContract(vcNoIncrement, VERIFICATION_CEILING_CONTRACTS);
    assert.equal(vcGaps.length, 1, `flags ${rel} for losing the gets-no-increment continuation`);
    assert.equal(vcGaps[0].source, rel, `names ${rel}`);
  }

  // positive: final-reviewer.md and its review/SKILL.md dispatch report a gap for keeping the
  // observes/changes clause but losing the "gets reported as unverifiable on the branch, needing
  // verification after merge" continuation — the reviewer's own actionable form, distinct from the
  // implementer's "gets no increment" form and from ship's "stays unticked" form.
  for (const rel of ['agents/final-reviewer.md', 'skills/review/SKILL.md']) {
    const vcNoReport = fixture({
      ...vcClauses,
      [rel]: vcClauses[rel].split('. A criterion needing a deploy')[0] + '.\n',
    });
    const vcGaps = scanContract(vcNoReport, VERIFICATION_CEILING_CONTRACTS);
    assert.equal(vcGaps.length, 1, `flags ${rel} for losing the reported-as-unverifiable continuation`);
    assert.equal(vcGaps[0].source, rel, `names ${rel}`);
  }

  // positive: implementer.md and its lite-tier paste report a gap for keeping both the "observes" lead-in
  // and the "gets no increment" continuation, but losing only the "changes no system outside the
  // repository" half between them — the wide `[\s\S]{0,300}` gap the two rows must not let this half
  // slip through.
  for (const rel of ['agents/implementer.md', 'skills/implement/SKILL.md']) {
    const vcNoOutsideSystem = fixture({
      ...vcClauses,
      [rel]: vcClauses[rel].replace('; it changes no system outside the repository', ''),
    });
    const vcGaps = scanContract(vcNoOutsideSystem, VERIFICATION_CEILING_CONTRACTS);
    assert.equal(vcGaps.length, 1, `flags ${rel} for losing the changes-no-system-outside half`);
    assert.equal(vcGaps[0].source, rel, `names ${rel}`);
  }

  // --- DOD_SUITE_CRITERION_CONTRACTS: ADR 0084's closing decision — ship ticks a criterion naming the
  // test suite from the run's own recorded result (the ledger stage plus its degrade record), running no
  // suite of its own. Four rows, all on skills/ship/SKILL.md. ---
  const dscClause =
    'A criterion naming the test suite is ticked from the run\'s own recorded result, never by running it. ' +
    'Read the ledger stage with `scope.js get stage` and its degrade record with `scope.js get degraded`. ' +
    'A scope whose recorded result is a denied or absent test command leaves such a criterion unticked, ' +
    'with that record as its note. Ship runs no test command anywhere.\n';

  // negative: a fixture carrying all four halves reports no gap
  const dscFullGaps = scanContract(
    fixture({ 'skills/ship/SKILL.md': dscClause }),
    DOD_SUITE_CRITERION_CONTRACTS,
  );
  assert.deepEqual(dscFullGaps, [], 'a fixture carrying all four halves reports no gap');

  const dscDeniedOrAbsent =
    'A scope whose recorded result is a denied or absent test command leaves such a criterion unticked, ' +
    'with that record as its note. ';

  // positive: dropping the "ticked from the run's own recorded result" clause reports that row alone
  const dscNoTickedGaps = scanContract(
    fixture({
      'skills/ship/SKILL.md':
        'Read the ledger stage with `scope.js get stage` and its degrade record with `scope.js get degraded`. ' +
        dscDeniedOrAbsent +
        'Ship runs no test command anywhere.\n',
    }),
    DOD_SUITE_CRITERION_CONTRACTS,
  );
  assert.equal(dscNoTickedGaps.length, 1, 'flags ship/SKILL.md for dropping the run-result clause');
  assert.equal(dscNoTickedGaps[0].source, path.join('skills', 'ship', 'SKILL.md'), 'names ship/SKILL.md');

  // positive: dropping the `get degraded` read reports that row alone
  const dscNoDegradedGaps = scanContract(
    fixture({
      'skills/ship/SKILL.md':
        'A criterion naming the test suite is ticked from the run\'s own recorded result, never by ' +
        'running it. Read the ledger stage with `scope.js get stage`. ' +
        dscDeniedOrAbsent +
        'Ship runs no test command anywhere.\n',
    }),
    DOD_SUITE_CRITERION_CONTRACTS,
  );
  assert.equal(dscNoDegradedGaps.length, 1, 'flags ship/SKILL.md for dropping the `get degraded` read');

  // positive: dropping the "denied or absent test command" clause reports that row alone
  const dscNoDeniedOrAbsentGaps = scanContract(
    fixture({
      'skills/ship/SKILL.md':
        'A criterion naming the test suite is ticked from the run\'s own recorded result, never by ' +
        'running it. Read the ledger stage with `scope.js get stage` and its degrade record with ' +
        '`scope.js get degraded`. Ship runs no test command anywhere.\n',
    }),
    DOD_SUITE_CRITERION_CONTRACTS,
  );
  assert.equal(
    dscNoDeniedOrAbsentGaps.length,
    1,
    'flags ship/SKILL.md for dropping the denied-or-absent clause',
  );

  // positive: dropping the "runs no test command anywhere" statement reports that row alone
  const dscNoSilenceGaps = scanContract(
    fixture({
      'skills/ship/SKILL.md':
        'A criterion naming the test suite is ticked from the run\'s own recorded result, never by ' +
        'running it. Read the ledger stage with `scope.js get stage` and its degrade record with ' +
        '`scope.js get degraded`. ' +
        dscDeniedOrAbsent +
        '\n',
    }),
    DOD_SUITE_CRITERION_CONTRACTS,
  );
  assert.equal(dscNoSilenceGaps.length, 1, 'flags ship/SKILL.md for dropping the no-suite statement');

  // --- CLEAN_VERDICT_ENDS_LOOP_CONTRACTS: a clean verdict ends the fix loop, findings or not. Two
  // halves — implement's `## Invariants (both playbooks)` catalogue and review §4's own fix loop — each
  // naming the standing finding a follow-up, unconditional on `--unattended`. ---
  const cvClauses = {
    'skills/implement/SKILL.md':
      'A clean verdict ends the loop the same way, attended or unattended — a finding still standing ' +
      'when it lands is a follow-up, never a fourth cycle.\n',
    'skills/review/SKILL.md':
      'A clean verdict ends the loop here too, attended or unattended — a finding it leaves standing ' +
      'is a follow-up, never a fourth cycle.\n',
  };

  // negative: a fixture carrying both halves reports no gap
  const cvFullGaps = scanContract(fixture(cvClauses), CLEAN_VERDICT_ENDS_LOOP_CONTRACTS);
  assert.deepEqual(cvFullGaps, [], 'a fixture carrying both halves reports no gap');

  // positive: dropping either half reports exactly that gap
  for (const rel of Object.keys(cvClauses)) {
    const cvDropped = fixture({ ...cvClauses, [rel]: 'Nothing about the fix loop here.\n' });
    const cvGaps = scanContract(cvDropped, CLEAN_VERDICT_ENDS_LOOP_CONTRACTS);
    assert.equal(cvGaps.length, 1, `flags ${rel} for dropping its clean-verdict-ends-loop half`);
    assert.equal(cvGaps[0].source, rel, `names ${rel}`);
  }

  // positive: keeping the clause but making it conditional on attendance still reports a gap — the rule
  // reads the same with or without `--unattended`, so losing the phrase is losing the rule.
  for (const rel of Object.keys(cvClauses)) {
    const cvConditional = fixture({
      ...cvClauses,
      [rel]: cvClauses[rel].replace(', attended or unattended', ' when attended'),
    });
    const cvGaps = scanContract(cvConditional, CLEAN_VERDICT_ENDS_LOOP_CONTRACTS);
    assert.equal(cvGaps.length, 1, `flags ${rel} for making the rule conditional on attendance`);
    assert.equal(cvGaps[0].source, rel, `names ${rel}`);
  }

  // positive: keeping the clause but forbidding the cycle with no mention of a follow-up still reports a
  // gap — the standing finding needs a name, not only a prohibition.
  for (const rel of Object.keys(cvClauses)) {
    const cvNoFollowUp = fixture({
      ...cvClauses,
      [rel]: cvClauses[rel].replace('is a follow-up, ', 'is '),
    });
    const cvGaps = scanContract(cvNoFollowUp, CLEAN_VERDICT_ENDS_LOOP_CONTRACTS);
    assert.equal(cvGaps.length, 1, `flags ${rel} for losing the follow-up half`);
    assert.equal(cvGaps[0].source, rel, `names ${rel}`);
  }

  // --- OBSERVATION_CAPTURE_CONTRACTS: an observation — a real defect a run meets that no slice covers
  // and the scope did not cause — is recorded, never judged (ADR 0088, INV-0010). Six rows pin
  // scope-mode.md's own `## Observations` section (definition-and-moment, only-artifact,
  // recorded-never-judged, read-first, uncertain-match-writes/asymmetry, best-effort), each its own
  // clause; three rows pin the rule's call sites in implement-full.md, implement-lite.md, and
  // review/SKILL.md §4. ---
  const ocDefinitionOnlyClause =
    'real defect a run meets that no slice of it covers, and that the scope did not cause';
  const ocMomentOnlyClause =
    'Write its triage record the moment you meet it, never at a handoff';
  const ocArtifactClause = 'The triage record is the only artifact. No ledger line, no pull-request body.';
  const ocJudgedClause =
    'An observation is recorded, never judged. It carries no severity, holds no stage, enters no fix ' +
    'loop, and blocks no run.';
  const ocReadFirstClause =
    "Capture reads before it writes. List the store's open triage records before creating one — " +
    "`docs/agents/issue-tracker.md`'s `## Triage record` section names the call — and compare each " +
    'listed record\'s finding against what was just met. That comparison is a judgment about two prose ' +
    'descriptions of a defect, never a string match, and it is yours to make every time: no test can ' +
    'check whether two findings describe the same thing.';
  const ocAsymmetryClause =
    'An uncertain match writes the record. The two errors are not symmetrical: a duplicate record is ' +
    'noise a human deletes at triage, while a false match silently drops the observation this whole ' +
    'rule exists to preserve — the same asymmetry triage record #505 argues from structural reasoning ' +
    "alone, against `/superdev:review`'s own run-scoped `## Deferred findings` read above. Match only " +
    'where a listed record plainly describes the same defect, and write a new one everywhere else, ' +
    'including every case that stays genuinely unclear.';
  const ocBestEffortClause =
    'The active store document carrying no `## Triage record` section is reported, not recorded. That ' +
    'section is what names the create call; with none, an observation reaches no artifact at all. ' +
    'Report it to the operator once, naming why — the store document defines no create call to make — ' +
    'and continue. This is the one case here where an observation is reported and dropped rather than ' +
    'recorded. Capture is otherwise best-effort, exactly as every other store write in the chain. An ' +
    'open-records read that fails, and a read a permission classifier denies, are each reported once — ' +
    'and each still writes the record, the possible duplicate the asymmetry above prefers over a ' +
    'dropped observation. A create that fails, and a create a permission classifier denies, are each ' +
    'reported once too, with the run continuing regardless.';
  const ocFullSuiteClause =
    "An observation is captured the moment you meet it. Read scope-mode.md's `## Observations` section " +
    'and follow it: a defect that no slice of this scope covers and the scope did not cause gets a ' +
    'triage record from you, the controller, right here — never held until the handoff.';
  const ocReviewClause =
    "An observation is captured the moment you meet it. Read scope-mode.md's `## Observations` section " +
    'and follow it: a defect that no slice of this scope covers and the scope did not cause gets a ' +
    'triage record from you, the controller, right here — never folded into the fix loop below and ' +
    'never held until the handoff.';

  const ocClauses = {
    'references/scope-mode.md':
      [
        ocDefinitionOnlyClause,
        ocMomentOnlyClause,
        ocArtifactClause,
        ocJudgedClause,
        ocReadFirstClause,
        ocAsymmetryClause,
        ocBestEffortClause,
      ].join(' ') + '\n',
    'references/implement-full.md': ocFullSuiteClause + '\n',
    'references/implement-lite.md': ocFullSuiteClause + '\n',
    'skills/review/SKILL.md': ocReviewClause + '\n',
  };


  // negative: a fixture carrying every clause reports no gap
  const ocFullGaps = scanContract(fixture(ocClauses), OBSERVATION_CAPTURE_CONTRACTS);
  assert.deepEqual(ocFullGaps, [], 'a fixture carrying every observation-capture clause reports no gap');

  // positive: dropping exactly one clause reports exactly that row's gap, leaving the other rows —
  // including the other five clauses sharing scope-mode.md — untouched.
  const ocMutations = [
    { label: 'the definition part of the definition-and-moment clause', rel: 'references/scope-mode.md', clause: ocDefinitionOnlyClause },
    { label: 'the moment part of the definition-and-moment clause', rel: 'references/scope-mode.md', clause: ocMomentOnlyClause },
    { label: 'the only-artifact clause', rel: 'references/scope-mode.md', clause: ocArtifactClause },
    { label: 'the recorded-never-judged clause', rel: 'references/scope-mode.md', clause: ocJudgedClause },
    { label: 'the read-first clause', rel: 'references/scope-mode.md', clause: ocReadFirstClause },
    { label: 'the uncertain-match/asymmetry clause', rel: 'references/scope-mode.md', clause: ocAsymmetryClause },
    { label: 'the best-effort clause', rel: 'references/scope-mode.md', clause: ocBestEffortClause },
    { label: "implement-full.md's capture step", rel: 'references/implement-full.md', clause: ocFullSuiteClause },
    { label: "implement-lite.md's capture step", rel: 'references/implement-lite.md', clause: ocFullSuiteClause },
    { label: "review/SKILL.md §4's capture step", rel: 'skills/review/SKILL.md', clause: ocReviewClause },
  ];

  for (const { label, rel, clause } of ocMutations) {
    const ocMutated = fixture({ ...ocClauses, [rel]: ocClauses[rel].replace(clause, 'Nothing here.') });
    const ocGaps = scanContract(ocMutated, OBSERVATION_CAPTURE_CONTRACTS);
    assert.equal(ocGaps.length, 1, `dropping ${label} reports exactly one gap`);
    assert.equal(ocGaps[0].source, rel, `names ${rel}`);
  }

  // --- LABEL_REVISION_AT_DECOMPOSITION_CONTRACTS: a later answer that changes what the feature does
  // revises the label in place — stated where §1 picks the label, restated where §3 decomposes. Both
  // rows share one fixture file, `skills/plan/SKILL.md`, since both clauses live there. ---
  const lrPickClause =
    'The type is what the feature does to the codebase, not what it feels like. A later answer that ' +
    'changes what the feature does revises the label in place.';
  const lrDecompositionClause =
    'Decomposition can still change the label. A later answer that changes what the feature does ' +
    'revises the label in place, whenever it lands.';

  const lrClauses = {
    'skills/plan/SKILL.md': [lrPickClause, lrDecompositionClause].join('\n\n') + '\n',
  };

  // negative: a fixture carrying both clauses reports no gap
  const lrFullGaps = scanContract(fixture(lrClauses), LABEL_REVISION_AT_DECOMPOSITION_CONTRACTS);
  assert.deepEqual(lrFullGaps, [], 'a fixture carrying both the §1 and §3 clauses reports no gap');

  // positive: dropping the §1 clause alone reports exactly that row's gap
  const lrNoPick = fixture({
    'skills/plan/SKILL.md': [lrDecompositionClause].join('\n\n') + '\n',
  });
  const lrNoPickGaps = scanContract(lrNoPick, LABEL_REVISION_AT_DECOMPOSITION_CONTRACTS);
  assert.equal(lrNoPickGaps.length, 1, 'dropping the §1 clause reports exactly one gap');
  assert.equal(lrNoPickGaps[0].source, 'skills/plan/SKILL.md', 'names plan/SKILL.md');

  // positive: dropping the §3 clause alone reports exactly that row's gap
  const lrNoDecomposition = fixture({
    'skills/plan/SKILL.md': [lrPickClause].join('\n\n') + '\n',
  });
  const lrNoDecompositionGaps = scanContract(lrNoDecomposition, LABEL_REVISION_AT_DECOMPOSITION_CONTRACTS);
  assert.equal(lrNoDecompositionGaps.length, 1, 'dropping the §3 clause reports exactly one gap');
  assert.equal(lrNoDecompositionGaps[0].source, 'skills/plan/SKILL.md', 'names plan/SKILL.md');

  // --- UNMET_CRITERION_AT_REVIEW_CONTRACTS: an unmet Definition-of-Done item is left unchecked with a
  // one-line note — ship/SKILL.md §4's own rule, restated as review/SKILL.md §4's sibling rule (an unmet
  // criterion enters the fix loop like any other finding, except the verification-ceiling case, and
  // either way review ticks nothing in dod.md). ---
  const ucShipClause = 'Leave an unmet item unchecked with a one-line note on why.';
  const ucReviewClause =
    'A criterion final-reviewer reports unmet enters this loop like any other finding. ' +
    'The verification-ceiling case is the one reported and not chased. It ticks nothing in `dod.md`.';

  const ucClauses = {
    'skills/ship/SKILL.md': ucShipClause + '\n',
    'skills/review/SKILL.md': ucReviewClause + '\n',
  };

  // negative: a fixture carrying both halves reports no gap
  const ucFullGaps = scanContract(fixture(ucClauses), UNMET_CRITERION_AT_REVIEW_CONTRACTS);
  assert.deepEqual(ucFullGaps, [], 'a fixture carrying both halves reports no gap');

  // positive: dropping either half reports exactly that gap
  for (const rel of Object.keys(ucClauses)) {
    const ucDropped = fixture({ ...ucClauses, [rel]: 'Nothing about an unmet criterion here.\n' });
    const ucGaps = scanContract(ucDropped, UNMET_CRITERION_AT_REVIEW_CONTRACTS);
    assert.equal(ucGaps.length, 1, `flags ${rel} for dropping its unmet-criterion-at-review half`);
    assert.equal(ucGaps[0].source, rel, `names ${rel}`);
  }

  // --- RELEASE_ANSWER_NOT_INFERRED_CONTRACTS: a feature is released once a human has said so (ADR
  // 0034); plan/SKILL.md §6 restates that the answer is the user's alone and that an authorization to
  // run the chain unattended is not it. ---
  const raReferenceClause = 'A feature is released once a human has said its plan may be built.';
  const raSkillClause =
    "On every other store the answer is the user's, so wait for it — an authorization to run the whole " +
    'chain unattended is not that answer.';

  const raClauses = {
    'references/plan-contract.md': raReferenceClause + '\n',
    'skills/plan/SKILL.md': raSkillClause + '\n',
  };

  // negative: a fixture carrying both halves reports no gap
  const raFullGaps = scanContract(fixture(raClauses), RELEASE_ANSWER_NOT_INFERRED_CONTRACTS);
  assert.deepEqual(raFullGaps, [], 'a fixture carrying both halves reports no gap');

  // positive: dropping either half reports exactly that gap
  for (const rel of Object.keys(raClauses)) {
    const raDropped = fixture({ ...raClauses, [rel]: 'Nothing about the release answer here.\n' });
    const raGaps = scanContract(raDropped, RELEASE_ANSWER_NOT_INFERRED_CONTRACTS);
    assert.equal(raGaps.length, 1, `flags ${rel} for dropping its release-answer-not-inferred half`);
    assert.equal(raGaps[0].source, rel, `names ${rel}`);
  }

  // --- CAPTURE_CHECKS_CONCURRENT_PLANS_CONTRACTS: a capture allocating a shared identifier is checked
  // against another live plan run's own allocations, before it is written — a new clause with no source
  // to restate, so the single row is pinned on its own presence. ---
  const ccClause =
    'Check a shared-identifier capture against other live plan runs, before writing it. Scan the other ' +
    "run roots under .superdev/scopes/*/ whose ledger stage reads planned or later, and read the " +
    "captures already committed on each one's scope branch.";

  // negative: a fixture carrying the clause reports no gap
  const ccFullGaps = scanContract(
    fixture({ 'skills/plan/SKILL.md': ccClause + '\n' }),
    CAPTURE_CHECKS_CONCURRENT_PLANS_CONTRACTS,
  );
  assert.deepEqual(ccFullGaps, [], 'a fixture carrying the clause reports no gap');

  // positive: dropping the clause reports exactly one gap
  const ccGaps = scanContract(
    fixture({ 'skills/plan/SKILL.md': 'Nothing about checking concurrent plan runs here.\n' }),
    CAPTURE_CHECKS_CONCURRENT_PLANS_CONTRACTS,
  );
  assert.equal(ccGaps.length, 1, 'dropping the clause reports exactly one gap');
  assert.equal(ccGaps[0].source, 'skills/plan/SKILL.md', 'names plan/SKILL.md');

  // --- DECOMPOSITION_NAMES_WHAT_IT_CHECKED_CONTRACTS: before presenting the decomposition, state which
  // files opened while grounding it were checked against the proposal itself — a new clause with no
  // source to restate, so the single row is pinned on its own presence. ---
  const dnClause =
    'Before you present the decomposition, state, for each file you opened while grounding it, what it ' +
    'says about the proposal itself — not about the question you opened it for.';

  // negative: a fixture carrying the clause reports no gap
  const dnFullGaps = scanContract(
    fixture({ 'skills/plan/SKILL.md': dnClause + '\n' }),
    DECOMPOSITION_NAMES_WHAT_IT_CHECKED_CONTRACTS,
  );
  assert.deepEqual(dnFullGaps, [], 'a fixture carrying the clause reports no gap');

  // positive: dropping the clause reports exactly one gap
  const dnGaps = scanContract(
    fixture({ 'skills/plan/SKILL.md': 'Nothing about checking the proposal against grounding files here.\n' }),
    DECOMPOSITION_NAMES_WHAT_IT_CHECKED_CONTRACTS,
  );
  assert.equal(dnGaps.length, 1, 'dropping the clause reports exactly one gap');
  assert.equal(dnGaps[0].source, 'skills/plan/SKILL.md', 'names plan/SKILL.md');
};
