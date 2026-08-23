'use strict';

// The chain and loop contract tables: the documents that hand a scope from one command to the next,
// and the ones a slice loop reads. One section per table.
//
// Run by ./index.js, which owns the shared fixture() helper, realRoot, and the temp-dir cleanup.

const { scanContract } = require('../lib');
const { scanDocStepsNoSuite } = require('../scanners');
const {
  FEATURE_ARG_CONTRACTS,
  UNATTENDED_CONTRACTS,
  CHANGE_TYPE_CONTRACTS,
  DEGRADED_CONTRACTS,
  DENIAL_AUTHORSHIP_CONTRACTS,
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
    'commands/implement.md': takesLabel,
    'commands/plan.md': handsOffLabel,
  });
  assert.equal(scanContract(fa1, FEATURE_ARG_CONTRACTS).length, 0, 'both halves carried yields zero gaps');

  // positive: implement.md declares no argument-hint
  const fa2 = fixture({
    'commands/implement.md': 'Resolve `$ARGUMENTS` to one feature label.\n',
    'commands/plan.md': handsOffLabel,
  });
  const faGaps2 = scanContract(fa2, FEATURE_ARG_CONTRACTS);
  assert.equal(faGaps2.length, 1, 'flags implement.md when it declares no argument-hint');
  assert.equal(faGaps2[0].source, path.join('commands', 'implement.md'), 'names implement.md');
  assert.match(faGaps2[0].expectation, /argument-hint/, 'says which half is missing');

  // positive: implement.md declares the hint but never resolves the argument, so the hint is decoration
  const fa3 = fixture({
    'commands/implement.md': '---\nargument-hint: "[feat/<label>]"\n---\nLoad the slices.\n',
    'commands/plan.md': handsOffLabel,
  });
  const faGaps3 = scanContract(fa3, FEATURE_ARG_CONTRACTS);
  assert.equal(faGaps3.length, 1, 'a declared-but-unresolved argument is still a gap');
  assert.match(faGaps3[0].expectation, /\$ARGUMENTS/, 'names the unresolved argument');

  // positive: plan.md stopped naming the resolved successor — the other half of the same contract
  const fa4 = fixture({
    'commands/implement.md': takesLabel,
    'commands/plan.md': 'Tell the user the plan is ready for `/superdev:implement`.\n',
  });
  const faGaps4 = scanContract(fa4, FEATURE_ARG_CONTRACTS);
  assert.equal(faGaps4.length, 1, 'flags plan.md when it hands off without the label');
  assert.equal(faGaps4[0].source, path.join('commands', 'plan.md'), 'names plan.md');

  // an argument-hint that names some other argument is not this contract: `/superdev:review` and
  // `/superdev:ship` both declare hints of their own, so the presence of a hint proves nothing
  const fa5 = fixture({
    'commands/implement.md': '---\nargument-hint: "[BASE..HEAD]"\n---\nResolve `$ARGUMENTS`.\n',
    'commands/plan.md': handsOffLabel,
  });
  assert.equal(
    scanContract(fa5, FEATURE_ARG_CONTRACTS).length,
    1,
    'a hint naming an unrelated argument does not satisfy the contract',
  );

  // an absent document is skipped, so a fixture carries only the halves it exercises
  const fa6 = fixture({ 'commands/plan.md': handsOffLabel });
  assert.equal(scanContract(fa6, FEATURE_ARG_CONTRACTS).length, 0, 'an absent document is skipped');

  // a store whose feature label uses another notation satisfies the contract exactly as a slash-prefixed
  // one does. The label's shape belongs to the active slice-store document (ADR 0019), so pinning one
  // notation here would go red for a store that is perfectly well configured.
  const fa7 = fixture({
    'commands/implement.md':
      '---\nargument-hint: "[<feature-label>  (empty = the only plan in the store)]"\n---\n' +
      'Resolve `$ARGUMENTS` to one feature label, and derive the scope from it.\n',
    'commands/plan.md': 'Then run `/superdev:implement lite-perf` with the real label substituted.\n',
  });
  assert.equal(scanContract(fa7, FEATURE_ARG_CONTRACTS).length, 0, 'a prefixless label is clean');

  // an unbacktick-delimited mention of the command satisfies no invocation — plan.md's own `description:`
  // frontmatter says "Run before /superdev:implement." incidentally, and a reword that drops the trailing
  // period ("...to build it.") must not turn the row green with the real handoff deleted
  const fa8 = fixture({
    'commands/implement.md': takesLabel,
    'commands/plan.md': 'Run before /superdev:implement to build it.\n',
  });
  const faGaps8 = scanContract(fa8, FEATURE_ARG_CONTRACTS);
  assert.equal(faGaps8.length, 1, 'a bare prose mention is not a resolved handoff');
  assert.equal(faGaps8[0].source, path.join('commands', 'plan.md'), 'names plan.md');

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
    'commands/implement.md': namesToken,
    'commands/review.md': namesToken,
    'commands/document.md': namesToken,
    'commands/ship.md': namesToken,
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
    'commands/implement.md',
    'commands/review.md',
    'commands/document.md',
    'commands/ship.md',
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
    'commands/ship.md': '# ship\n\nCarries `--unattended` but points nowhere.\n',
  });
  const shipShapedGaps = scanContract(shipShaped, UNATTENDED_CONTRACTS, unattendedOpts);
  assert.equal(shipShapedGaps.length, 1, 'flags the missing read/apply instruction alone');
  assert.match(shipShapedGaps[0].expectation, /read\/apply instruction/, 'names the missing instruction');

  // positive: `[--unattended]` in a command's own `argument-hint` frontmatter is not a standing answer in
  // its body. Deleting every real mention from review.md/document.md/ship.md and leaving only the
  // frontmatter echo must still be caught — the exact false-green `stripFrontmatterFirst` exists to close.
  for (const rel of ['commands/review.md', 'commands/document.md', 'commands/ship.md']) {
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
      fixture({ 'commands/implement.md': takesLabel, 'commands/plan.md': handsOffLabel }),
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
    'commands/implement.md': namesDegraded,
    'commands/review.md': namesDegraded,
    'commands/document.md': namesDegraded,
    'commands/ship.md': namesDegraded,
    'commands/status.md': namesDegraded,
    'references/implement-full.md': namesDegraded,
    'references/implement-lite.md': namesDegraded,
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
    'commands/implement.md',
    'commands/review.md',
    'commands/document.md',
    'commands/ship.md',
    'commands/status.md',
    'references/implement-full.md',
    'references/implement-lite.md',
  ]) {
    const dropped = fixture({ ...everyConsumer, [rel]: '# doc\n\nNothing about degrading here.\n' });
    const gaps = scanContract(dropped, DEGRADED_CONTRACTS, degradedOpts);
    assert.equal(gaps.length, 2, `flags ${rel} on both rows when it drops everything`);
    assert.ok(gaps.every((g) => g.source === rel.split('/').join(path.sep)), `both gaps name ${rel}`);
  }

  // positive: the entry named with no pointer to the section leaves a reader a token and no rule
  const entryOnly = fixture({
    ...everyConsumer,
    'commands/ship.md': '# ship\n\nCopy any `**Degraded:**` bullet into the body.\n',
  });
  const entryOnlyGaps = scanContract(entryOnly, DEGRADED_CONTRACTS, degradedOpts);
  assert.equal(entryOnlyGaps.length, 1, 'flags the missing section pointer alone');
  assert.match(entryOnlyGaps[0].expectation, /point at the/, 'names the missing pointer');

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
    'commands/review.md': carriesAuthorship,
    'commands/document.md': carriesAuthorship,
    'commands/implement.md': carriesAuthorship,
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
    'commands/review.md',
    'commands/document.md',
    'commands/implement.md',
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
    'commands/review.md': 'take `<run-root>/dod.md` as the `acceptance` for both reviewers.\n',
  });
  const dcGaps1 = scanContract(dc1, DERIVED_CRITERIA_CONTRACTS);
  assert.equal(dcGaps1.length, 1, 'flags a dispatch that inlines the DoD instead of handing its path');
  assert.equal(dcGaps1[0].source, path.join('commands', 'review.md'), 'names review.md');

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
  const lv2 = fixture({ 'commands/afk.md': '# superdev afk\n\nSelect the next scope anchor.\n' });
  const lvGaps2 = scanContract(lv2, LABEL_VALIDATION_CONTRACTS);
  assert.equal(lvGaps2.length, 1, 'flags a consumer that dropped its wire to the rule');
  assert.equal(lvGaps2[0].source, path.join('commands', 'afk.md'), 'names afk.md');

  // positive, the weaker revert: a consumer that reverted to the pre-change slug-only wording keeps its
  // wire to `scope-mode.md`'s scope-slug rule intact but never asserts both segments are validated — the
  // exact text `commands/afk.md` carried before this scope, which a whole-file revert would restore
  const lv3 = fixture({
    'commands/afk.md':
      "**Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s scope-slug rule before you go on.**\n\n" +
      "- Its feature label matches that scope-slug rule. A label that fails it is skipped (below),\n",
  });
  const lvGaps3 = scanContract(lv3, LABEL_VALIDATION_CONTRACTS);
  assert.equal(lvGaps3.length, 1, 'flags a consumer reverted to slug-only wording, wire intact');
  assert.equal(lvGaps3[0].source, path.join('commands', 'afk.md'), 'names afk.md');

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
    'commands/status.md': 'Read each ledger and print one block per scope.\n',
  });
  const vcGaps1 = scanContract(vc1, VERB_CONTRACTS);
  assert.equal(vcGaps1.length, 1, 'flags a chain document that stopped invoking its verb');
  assert.equal(vcGaps1[0].source, path.join('commands', 'status.md'), 'names status.md');

  // positive: naming scope.js without the verb is not enough — the pattern pins verb and argument
  const vc2 = fixture({
    'commands/document.md': 'Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js` when done.\n',
  });
  const vcGaps2 = scanContract(vc2, VERB_CONTRACTS);
  // Two, because `commands/document.md` carries two rows: its stage write and its read of the
  // inline-doc-pass record (ADR 0031). A bare mention satisfies neither.
  assert.equal(vcGaps2.length, 2, 'a bare scope.js mention without the verb is still a gap');

  // negative: the full invocation with the plugin-root path prefix satisfies the row — both of
  // `commands/document.md`'s rows, so the fixture carries both invocations
  const vc3 = fixture({
    'commands/document.md':
      'Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js stage set documented --root <run-root>`.\n' +
      'Read it first with `node ${CLAUDE_PLUGIN_ROOT}/scripts/scope.js get docs --root <run-root>`.\n',
  });
  assert.equal(scanContract(vc3, VERB_CONTRACTS).length, 0, 'a full verb invocation is clean');

  // absent files are skipped, matching every other contract table
  assert.equal(
    scanContract(fixture({ 'README.md': '# repo\n' }), VERB_CONTRACTS).length,
    0,
    'absent files are skipped',
  );

  // positive: review.md and run-handoff.md keep their other verbs but drop the `unresolved add`/
  // `unresolved clear` pair, going back to hand-editing or hand-parsing the ledger's `**Unresolved:**` line
  const uvReview = fixture({
    'commands/review.md':
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
    uvReviewGaps.every((g) => g.source === path.join('commands', 'review.md')),
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
    [path.join('commands', 'review.md')]:
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
      'commands/review.md':
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
      'commands/ship.md':
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
    'commands/ship.md': 'Ask whether anything stands, from memory of the review.\n',
  });
  const shipVerbGaps = scanContract(shipNoStatus, VERB_CONTRACTS);
  assert.ok(
    shipVerbGaps.some((g) => g.source === path.join('commands', 'ship.md')),
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
    path.join('commands', 'document.md'),
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
    'commands/review.md': 'Read `docs/agents/verification.md` for the test command and pass it to final-reviewer.\n',
  });
  const fsGaps1 = scanContract(fs1, FULL_SUITE_CONTRACTS);
  assert.equal(fsGaps1.length, 4, 'flags a review.md missing all four of its rows: the controller-run suite, the dispatch clause, fail-is-Critical, and stage-not-advance');
  assert.ok(
    fsGaps1.every((g) => g.source === path.join('commands', 'review.md')),
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
    'commands/review.md': 'Run the full suite yourself, before dispatching `final-reviewer`.\n',
  });
  const fsGaps4 = scanContract(fs4, FULL_SUITE_CONTRACTS);
  assert.equal(fsGaps4.length, 3, 'flags a review.md missing the dispatch clause, the failing-suite-is-Critical rule, and the stage-not-advance rule');
  assert.ok(
    fsGaps4.every((g) => g.source === path.join('commands', 'review.md')),
    'all three gaps name review.md',
  );

  // positive (RED reproduction): review.md's dispatch sentence still leaks the optional-re-run wording
  // final-reviewer.md itself no longer carries — the exact live-path leak this row exists to close
  const fs9 = fixture({
    'commands/review.md':
      "Run the full suite yourself, before dispatching `final-reviewer`. A `fail` here is itself a " +
      'Critical finding — fold it into the fix loop below. The stage does **not** advance while it ' +
      "stands. hand it that result instead, and tell it its own re-run stays optional, never the scope's " +
      'only full-suite run.\n',
  });
  const fsGaps9 = scanContract(fs9, FULL_SUITE_CONTRACTS);
  assert.equal(fsGaps9.length, 1, "flags a review.md whose dispatch clause still leaks the optional re-run sentence");
  assert.equal(fsGaps9[0].source, path.join('commands', 'review.md'), 'names review.md');

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
    'commands/review.md':
      "Run the full suite yourself, before dispatching `final-reviewer`. A `fail` here is itself a " +
      'Critical finding — fold it into the fix loop below.\n',
  });
  const fsGaps6 = scanContract(fs6, FULL_SUITE_CONTRACTS);
  assert.equal(fsGaps6.length, 2, 'flags a review.md that names the finding but drops the dispatch clause and the stage-not-advance clause');
  assert.ok(
    fsGaps6.every((g) => g.source === path.join('commands', 'review.md')),
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
    'commands/review.md':
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
    'commands/review.md':
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
    'commands/review.md':
      'Ask once before fixing, then dispatch one `superdev:implementer` with the complete findings list.\n',
  });
  const fbGaps1 = scanContract(fb1, FIX_BOUNDARY_CONTRACTS);
  assert.equal(fbGaps1.length, 3, 'flags all three rows on a review.md whose fix loop states no scope boundary');
  assert.ok(
    fbGaps1.every((g) => g.source === path.join('commands', 'review.md')),
    'every gap names review.md',
  );

  // positive: the boundary is stated but names no destination and no exit, so the finding has nowhere to
  // go and a deferred one still deadlocks the run
  const fb2 = fixture({
    'commands/review.md':
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
    'commands/review.md':
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
    'commands/review.md':
      'The fix loop changes how the code meets the Definition of Done. A remedy that adds a capability ' +
      'the Definition of Done never named is recorded and handed to `/superdev:plan`, while repairing a ' +
      'defect in what the Definition of Done does name stays in this loop.\n',
  });
  const fbGaps3 = scanContract(fb3, FIX_BOUNDARY_CONTRACTS);
  assert.equal(fbGaps3.length, 1, 'boundary plus destination alone still leaves the exit-less deadlock');
  assert.match(fbGaps3[0].expectation, /counts as|deferred finding|deadlock/i, 'names the missing exit');

  // negative (GREEN): boundary, destination, and exit together satisfy all three rows
  const fb5 = fixture({
    'commands/review.md':
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
    'commands/document.md': 'Dispatch `superdev:doc-writer` over the range, then dispatch `doc-reader`.\n',
    'commands/ship.md':
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
  const ds2 = fixture({ 'commands/document.md': 'Run the full suite yourself before the doc pass.\n' });
  const dsGaps2 = scanDocStepsNoSuite(ds2);
  assert.equal(dsGaps2.length, 1, 'flags a document.md that runs the full suite itself');
  assert.equal(dsGaps2[0].source, path.join('commands', 'document.md'), 'names document.md');
  assert.match(dsGaps2[0].expectation, /full suite/i, 'the gap names the run it found');

  // positive: ship.md grows the take-the-command-and-run-it shape run handoff uses
  const ds3 = fixture({
    'commands/ship.md':
      'Take the full command from `docs/agents/verification.md` and run it once over the scope branch ' +
      'before opening the request.\n',
  });
  const dsGaps3 = scanDocStepsNoSuite(ds3);
  assert.equal(dsGaps3.length, 1, 'flags a ship.md that takes the full command and runs it');
  assert.equal(dsGaps3[0].source, path.join('commands', 'ship.md'), 'names ship.md');

  // positive: the doc-writer grows one too — a subagent's run is the same duplicate as a command's
  const ds4 = fixture({ 'agents/doc-writer.md': 'Run the full test suite itself once the docs agree.\n' });
  const dsGaps4 = scanDocStepsNoSuite(ds4);
  assert.equal(dsGaps4.length, 1, 'flags a doc-writer.md that runs the full test suite itself');
  assert.equal(dsGaps4[0].source, path.join('agents', 'doc-writer.md'), 'names doc-writer.md');

  // positive: the bare imperative, no reflexive pronoun — the ordinary way this instruction gets written
  const ds5 = fixture({ 'commands/document.md': 'Run the full suite before opening the pull request.\n' });
  const dsGaps5 = scanDocStepsNoSuite(ds5);
  assert.equal(dsGaps5.length, 1, 'flags a document.md with the bare imperative, no reflexive pronoun');
  assert.equal(dsGaps5[0].source, path.join('commands', 'document.md'), 'names document.md');

  const ds6 = fixture({ 'commands/ship.md': 'Re-run the full suite before staging the pull request.\n' });
  const dsGaps6 = scanDocStepsNoSuite(ds6);
  assert.equal(dsGaps6.length, 1, 'flags a ship.md with the bare re-run imperative');
  assert.equal(dsGaps6[0].source, path.join('commands', 'ship.md'), 'names ship.md');

  const ds7 = fixture({ 'agents/doc-writer.md': 'Run the full test suite once the docs agree.\n' });
  const dsGaps7 = scanDocStepsNoSuite(ds7);
  assert.equal(dsGaps7.length, 1, 'flags a doc-writer.md with the bare imperative naming the test suite');
  assert.equal(dsGaps7[0].source, path.join('agents', 'doc-writer.md'), 'names doc-writer.md');

  // negative: the auxiliary, not the reflexive pronoun, is the discriminator — ship.md's real past-tense
  // mention stays silent under the bare-imperative pattern too
  assert.equal(
    scanDocStepsNoSuite(
      fixture({
        'commands/ship.md':
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
        'commands/ship.md':
          'The run handoff has already run the full suite and found it green.\n',
      }),
    ).length,
    0,
    '"has already run" (an intervening adverb) stays silent',
  );
  assert.equal(
    scanDocStepsNoSuite(
      fixture({
        'commands/document.md': 'Scopes that have not run the full suite block here.\n',
      }),
    ).length,
    0,
    '"have not run" (a negation) stays silent',
  );
  assert.equal(
    scanDocStepsNoSuite(
      fixture({
        'commands/ship.md': 'The run handoff has  \nrun the full suite and found it green.\n',
      }),
    ).length,
    0,
    'a markdown hard break between the auxiliary and "run" stays silent',
  );

  // positive: the bare imperative with "full" dropped — the ordinary way a maintainer writes this shape
  // without the word "full" in it
  const ds8 = fixture({
    'commands/ship.md': 'Re-run the suite over the scope branch before the handoff.\n',
  });
  const dsGaps8 = scanDocStepsNoSuite(ds8);
  assert.equal(dsGaps8.length, 1, 'flags a ship.md that re-runs the suite before the handoff');
  assert.equal(dsGaps8[0].source, path.join('commands', 'ship.md'), 'names ship.md');

  const ds9 = fixture({
    'commands/document.md': 'Run the whole suite once more before staging the pull request.\n',
  });
  const dsGaps9 = scanDocStepsNoSuite(ds9);
  assert.equal(dsGaps9.length, 1, 'flags a document.md that runs the whole suite once more');
  assert.equal(dsGaps9[0].source, path.join('commands', 'document.md'), 'names document.md');

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
    'commands/afk.md':
      '| `merged` | `/superdev:review <BASE>..<feature-label> --unattended` |\n' +
      '| `documented-unreviewed` | `/superdev:review <BASE>..<feature-label> --unattended` |\n',
  });
  const afkGaps1 = scanContract(afkR1, AFK_ROUTING_CONTRACTS);
  assert.equal(afkGaps1.length, 2, 'flags an afk.md that routes both stages into the review unconditionally');
  assert.ok(
    afkGaps1.every((g) => g.source === path.join('commands', 'afk.md')),
    'both gaps name afk.md',
  );

  // positive: afk.md carries the `merged` half but sends `documented-unreviewed` back to the review — the
  // half-fix that still cannot finish a sweep, since ship refuses a scope whose review never ran
  const afkGaps2 = scanContract(
    fixture({
      'commands/afk.md':
        'When no row reads `behavior`, `merged` routes to `/superdev:document <BASE>..<feature-label> ' +
        '--unattended`.\n`documented-unreviewed` routes to `/superdev:review` as always.\n',
    }),
    AFK_ROUTING_CONTRACTS,
  );
  assert.equal(afkGaps2.length, 1, 'flags an afk.md that fixes only the `merged` row');
  assert.equal(afkGaps2[0].source, path.join('commands', 'afk.md'), 'names afk.md');

  // positive (RED reproduction): the real exception paragraph with both `--unattended` tokens stripped —
  // prose the stage-table row scan never reaches, so nothing else in this file would have caught it
  const afkGapsNoToken = scanContract(
    fixture({
      'commands/afk.md':
        'When no row reads `behavior`, `merged` routes to `/superdev:document <BASE>..<feature-label>` ' +
        'and `documented-unreviewed` routes to `/superdev:ship <scope>`, in place of the two review rows ' +
        'above.\n',
    }),
    AFK_ROUTING_CONTRACTS,
  );
  assert.equal(afkGapsNoToken.length, 2, 'flags both rows when `--unattended` is stripped from each');
  assert.ok(
    afkGapsNoToken.every((g) => g.source === path.join('commands', 'afk.md')),
    'both gaps name afk.md',
  );

  // positive: ship.md drops its own half — the other side of the same agreement
  const afkGaps3 = scanContract(
    fixture({
      'commands/ship.md':
        'Name exactly what has not run (`/superdev:review`, `/superdev:document`, or both) and ask once.\n',
    }),
    AFK_ROUTING_CONTRACTS,
  );
  assert.equal(afkGaps3.length, 1, "flags a ship.md that stopped exempting an all-mechanical/docs scope");
  assert.equal(afkGaps3[0].source, path.join('commands', 'ship.md'), 'names ship.md');

  // negative: both documents carry their halves, hard-wrapped the way the real prose is
  assert.equal(
    scanContract(
      fixture({
        'commands/afk.md':
          'Read each slice\'s `type`. When no\nrow reads `behavior`, `merged` routes to\n' +
          '`/superdev:document <BASE>..<feature-label> --unattended` and `documented-unreviewed` routes ' +
          'to\n`/superdev:ship <scope> --unattended`.\n',
        'commands/ship.md':
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
      'commands/afk.md':
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
    afkGapsUnconditional.every((g) => g.source === path.join('commands', 'afk.md')),
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
      '## Slice lifecycle & status\n\n## Append mode\n\n## Scope anchor\n\n## Feature label\n',
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
  const wrapTable = [['commands/x.md', /the clause this table pins/, 'state the clause']];
  assert.equal(
    scanContract(fixture({ 'commands/x.md': 'the clause this table pins\n' }), wrapTable).length,
    0,
    'a clause on one line is met',
  );
  assert.equal(
    scanContract(fixture({ 'commands/x.md': 'the clause this\ntable pins\n' }), wrapTable).length,
    0,
    'the same clause wrapped across a line break is still met',
  );
  assert.equal(
    scanContract(fixture({ 'commands/x.md': 'the clause this table drops\n' }), wrapTable).length,
    1,
    'a document that does not state the clause is still a gap',
  );
};
