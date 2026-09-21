'use strict';

// The drift-check registry: every check, keyed by its own `id`. One entry is one check — what it scans
// (`run`), what the ok line says when it passes (`ok`), and how one gap is printed (`format`).
// `scripts/drift-check.js` walks this array and does nothing else.
//
// A new contract is registered wherever it belongs, beside the check it most resembles or at the end.
// `scripts/AGENTS.md` keys each check's paragraph on its `id` (ADR 0061), so inserting one here needs no
// edit to any other check's paragraph.

const { scanContract } = require('./lib');
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
  scanGlossarySpecialisingCitations,
  scanAfkSelectionNeutrality,
  scanAfkAnchorCount,
  scanWritingStandardContract,
  scanContentTypesContract,
  scanCommandRefs,
  scanChainHandoff,
  scanAfkInvocations,
  scanShipGateContract,
  scanOrphanLensPlacement,
  scanTestCostLensPlacement,
  scanUnresolvedGlossaryContract,
  scanKbNoBackendCall,
  scanAgentLensNoDesignSmell,
  scanPinnedPaths,
  scanDocStepsNoSuite,
  scanAgentToolAgnostic,
  scanHookLedgerParsers,
  scanAdrStatus,
  scanForcingBranchFlag,
  scanReturnToController,
  scanNarrativeCoverage,
  scanMarketplaceSource,
  scanReadmeCommands,
  scanAuditSetGlobs,
  scanDenialCapNumberSilence,
  scanAfkLockTierClaim,
  scanOpencodeFixtures,
  scanOpencodeSurfaceSplit,
  scanUnmappedPathsForms,
} = require('./scanners');
const {
  ADR_STATUSES,
  FEATURE_ARG_CONTRACTS,
  UNATTENDED_CONTRACTS,
  CHANGE_TYPE_CONTRACTS,
  DEGRADED_CONTRACTS,
  DENIAL_AUTHORSHIP_CONTRACTS,
  DENIAL_CAP_CONTRACTS,
  DENIAL_RESET_CONTRACTS,
  TRIAGE_RECORD_CONTRACTS,
  BACKLOG_SURVEY_CONTRACTS,
  SETUP_CHECK_CONTRACTS,
  SETUP_CHECK_RULES_CONTRACTS,
  DERIVED_CRITERIA_CONTRACTS,
  REACHABLE_CRITERION_CONTRACTS,
  REVIEW_RANGE_SHAPES_CONTRACTS,
  EMPTY_ARGUMENT_CONTRACTS,
  AGENT_LENS_LIST_CONTRACTS,
  LABEL_VALIDATION_CONTRACTS,
  GREEN_GATE_TIMEOUT_CONTRACTS,
  VERB_CONTRACTS,
  KB_STAGING_CONTRACTS,
  TEST_SELECTION_CONTRACTS,
  TIER_SKIP_CONTRACTS,
  CONTAINMENT_DELEGATION_CONTRACTS,
  CONTAINMENT_REFETCH_CONTRACTS,
  FULL_SUITE_CONTRACTS,
  PATHS_DERIVATION_CONTRACTS,
  FIX_BOUNDARY_CONTRACTS,
  AFK_ROUTING_CONTRACTS,
  ARG_TOKEN_CONTRACTS,
  AUDIT_SET_CONTRACTS,
  CHAINED_CODE_REVIEW_CONTRACTS,
  CHAINED_DOC_AUDIT_CONTRACTS,
  CHAINED_TEST_AUDIT_CONTRACTS,
  SWEEP_CHAINED_LEG_CONTRACTS,
  AGGREGATE_PAGE_CONTRACTS,
  READ_PATH_CONTRACTS,
  PUBLISH_KB_INVOCATION_CONTRACTS,
  STATUS_SEED_CONTRACTS,
  PLAN_APPEND_CONTRACTS,
  ROTATE_ON_SHIPPED_CONTRACTS,
  PARKED_QUESTIONS_CONTRACTS,
  RUN_KIND_CONTRACTS,
  SCOPETREE_CONTRACTS,
  SOURCE_SECTION_CONTRACTS,
  PLAYBOOK_EDGE_CONTRACTS,
  DOC_PASS_CONTRACTS,
  PUBLISH_RUN_STATE_CONTRACTS,
  ADOPT_RUN_STATE_CONTRACTS,
  RESUMED_SCOPETREE_TRIGGER_CONTRACTS,
  STANDING_CODE_LENS_CONTRACTS,
  INVARIANT_REGISTER_CONTRACTS,
  INVARIANT_REGISTER_DOC_PASS_CONTRACTS,
  INVARIANT_COMPLIANCE_CONTRACTS,
  PLANNED_HANDOFF_CONTRACTS,
} = require('./contracts');

// The printer the table-driven checks share. A gap is `{ source, expectation }` and reads the
// same whichever table produced it.
const contractGap = (g) => `${g.source} no longer meets its contract — expected it to ${g.expectation}`;

// A table-driven check: the common case, where the whole assertion is a `[document, pattern,
// expectation]` table run through scanContract().
const table = (id, contracts, ok, opts) => ({
  id,
  ok,
  run: (root) => scanContract(root, contracts, opts),
  format: contractGap,
});

// `scanPinnedPaths` (in `drift/scanners.js`) occupies the slot the `afk-existence` check held. That one
// asserted `skills/afk/SKILL.md` alone, on the stated grounds that nothing else in the plugin names
// `/superdev:afk` — already false when written: `skills/implement/SKILL.md` names it too, and
// `command-resolution` already resolves every `/superdev:` reference in `skills/`, so it already
// caught the file's deletion. The general rule — every path a contract table pins still exists — covers
// `skills/afk/SKILL.md` a second way (three tables pin it) and the other thirty-odd besides, so the special
// case went, replaced in place at the slot it had held.

module.exports = [
  {
    id: 'reference',
    ok: 'references resolve',
    run: scan,
    format: (m) => `missing ${m.reference} — referenced by ${m.source}`,
  },
  {
    id: 'run-root',
    ok: 'run-root paths are absolute',
    run: scanRunRootPaths,
    format: (o) => `checkout-relative run-root path \`${o.match}\` in ${o.source} — use \`<run-root>/…\``,
  },
  {
    id: 'assignee',
    ok: 'every store document carries its `## Assignee` section and no tracked assignee bullet',
    run: scanAssigneeContract,
    format: (g) =>
      `${g.source} no longer meets the assignee contract — expected it to ${g.expectation}; see ` +
      `plan-contract.md → Assignee`,
  },
  {
    id: 'anchor-contract',
    ok: 'anchor contract carried',
    run: scanAnchorContract,
    format: anchorGap,
  },
  {
    id: 'afk-selection-neutrality',
    ok: "afk's selection step names no backend's own anchor mechanism",
    run: scanAfkSelectionNeutrality,
    format: anchorGap,
  },
  {
    id: 'writing-standard',
    ok: 'writing standard offered',
    run: scanWritingStandardContract,
    format: (g) =>
      `${g.source} carries no \`## Writing standard\` section — expected the heading plus its ` +
      `\`controlled | <path> | none\` values; see ADR 0012`,
  },
  {
    id: 'content-types',
    ok: 'content-type lens wired',
    run: scanContentTypesContract,
    format: (g) =>
      `${g.source} no longer instructs itself to read \`references/content-types.md\` — the ` +
      `content-type lens is dead in every dispatch of this agent; see ADR 0014`,
  },
  {
    id: 'command-resolution',
    ok: 'commands resolve',
    run: scanCommandRefs,
    format: (d) => `${d.source} names \`${d.command}\`, which has no file under skills/`,
  },
  {
    id: 'chain-handoff',
    ok: 'chain hands off',
    run: scanChainHandoff,
    format: (c) =>
      `${c.source} never names \`${c.next}\` — the chain dead-ends there instead of handing off; ` +
      `see ADR 0013`,
  },
  table('feature-label-argument', FEATURE_ARG_CONTRACTS, 'feature-label argument carried'),
  table('unattended-token', UNATTENDED_CONTRACTS, 'unattended token carried', { stripFrontmatterFirst: true }),
  {
    id: 'afk-invocation',
    ok: 'afk invokes every chain command with `--unattended`',
    run: scanAfkInvocations,
    format: contractGap,
  },
  table('change-type', CHANGE_TYPE_CONTRACTS, 'change-type set matches the scope-prune hook and scope.js'),
  table('degraded-pass', DEGRADED_CONTRACTS, 'degrade record carried', { stripFrontmatterFirst: true }),
  table('derived-criteria', DERIVED_CRITERIA_CONTRACTS, 'criteria derived before the DoD is read'),
  table('reachable-criterion', REACHABLE_CRITERION_CONTRACTS, 'the `Reachable:` criterion rule and the surface emitting it agree'),
  table('review-range-shapes', REVIEW_RANGE_SHAPES_CONTRACTS, 'the review surface and final-reviewer agree on the standing-code range shape'),
  table('empty-argument', EMPTY_ARGUMENT_CONTRACTS, 'the shared empty-argument cascade is defined once and cited, not restated'),
  {
    id: 'agent-lens-list',
    ok: 'each reviewer agent reads its own named lens list from review-checklist.md, and slice-reviewer.md carries no design-smell token to widen it in place',
    run: (root) => [...scanContract(root, AGENT_LENS_LIST_CONTRACTS), ...scanAgentLensNoDesignSmell(root)],
    format: contractGap,
  },
  {
    id: 'orphan-lens-placement',
    ok: 'the orphan production symbol lens sits where only the whole-scope review reads it',
    run: scanOrphanLensPlacement,
    format: contractGap,
  },
  {
    id: 'test-cost-lens-placement',
    ok: 'every test-cost lens sits where only the test audit reads it',
    run: scanTestCostLensPlacement,
    format: contractGap,
  },
  table('label-validation', LABEL_VALIDATION_CONTRACTS, 'both label segments validated'),
  table('green-gate-timeout', GREEN_GATE_TIMEOUT_CONTRACTS, "green-gate's hooks.json timeout matches its own comment"),
  table('verb-pointer', VERB_CONTRACTS, 'every chain document invokes its scope.js verb'),
  table('planned-handoff', PLANNED_HANDOFF_CONTRACTS, 'the planned handoff from /superdev:plan to /superdev:implement is carried on both sides'),
  table('kb-staging', KB_STAGING_CONTRACTS, 'knowledge-base pages are staged'),
  {
    id: 'scopetree-run-root',
    ok: 'the four scopetree-addressing documents use the absolute run-root path',
    run: scanScopetreeRunRootPaths,
    format: (o) => `checkout-relative scopetree path \`${o.match}\` in ${o.source} — use \`<run-root>/scopetree\``,
  },
  {
    id: 'no-base-branch-commit',
    ok: 'no shipped prose instructs a commit or a push to the base branch (INV-0001)',
    run: scanNoBaseBranchCommit,
    format: (g) => `${g.source}:${g.line} instructs a commit or a push to the base branch — no superdev command commits to the base branch (INV-0001, docs/invariants.md)`,
  },
  {
    id: 'kb-no-backend-call',
    ok: 'no document but publish-kb reaches a backend',
    run: scanKbNoBackendCall,
    format: contractGap,
  },
  {
    id: 'no-second-reader',
    ok: 'no hook parses a ledger header itself',
    run: scanHookLedgerParsers,
    format: contractGap,
  },
  table('test-selection-wiring', TEST_SELECTION_CONTRACTS, 'every loop consumer reads test-selection.md'),
  table(
    'full-suite',
    FULL_SUITE_CONTRACTS,
    'the scope review runs the full suite itself while final-reviewer reviews against the result it is handed',
  ),
  table(
    'paths-derivation',
    PATHS_DERIVATION_CONTRACTS,
    'setup derives a `{paths}` form only for a mapping runner, a fast subset otherwise, and reaches `none` for two named cases',
  ),
  {
    id: 'unmapped-paths-form',
    ok: 'no shipped document proposes a `{paths}` form to a runner that maps nothing',
    run: scanUnmappedPathsForms,
    format: contractGap,
  },
  {
    id: 'entries-standing-gate',
    ok: 'ship asks once and refuses unattended on a standing unresolved defect',
    run: scanShipGateContract,
    format: contractGap,
  },
  {
    id: 'unresolved-glossary',
    ok: 'the glossary agrees with scope-mode.md on which record covers a failure of the code under review',
    run: scanUnresolvedGlossaryContract,
    format: contractGap,
  },
  table('afk-routing', AFK_ROUTING_CONTRACTS, 'afk and ship agree on where an all-mechanical/docs scope goes next'),
  table('arg-token', ARG_TOKEN_CONTRACTS, 'the three Bash hooks carry the same ARG shell-word token'),
  table(
    'audit-set',
    AUDIT_SET_CONTRACTS,
    'setup, document, and the documentation seed agree on the `## Audit set` section',
  ),
  table(
    'chained-code-review',
    CHAINED_CODE_REVIEW_CONTRACTS,
    'a chained code review runs no `git add -N :/` and never enters scope mode',
  ),
  table(
    'chained-doc-audit',
    CHAINED_DOC_AUDIT_CONTRACTS,
    'a chained document audit dispatches no doc-writer and commits nothing',
  ),
  table(
    'aggregate-page',
    AGGREGATE_PAGE_CONTRACTS,
    'both stagers, publish-kb, and the knowledge-base seed agree on the `patch` action',
  ),
  table(
    'read-path',
    READ_PATH_CONTRACTS,
    'a config document marking an outline entry `(aggregate)` documents the call that returns the ' +
      "page's body",
  ),
  table(
    'publish-kb-invocation',
    PUBLISH_KB_INVOCATION_CONTRACTS,
    'the publish-kb skill invokes the script rather than hand-running its mechanics',
  ),
  { id: 'pinned-paths', ok: 'every document a contract table pins still exists', run: scanPinnedPaths, format: contractGap },
  {
    id: 'adr-status',
    ok: 'every ADR states a status',
    run: scanAdrStatus,
    format: (g) =>
      `${g.source} states no status — expected \`**Status:** <${ADR_STATUSES.join(' | ')}>\` on its ` +
      `own line, so a decision nothing implements cannot read as one the code honours`,
  },
  {
    id: 'append-mode',
    ok: 'every store document carries its append-mode rules',
    run: scanAppendContract,
    format: (g) =>
      g.expectation
        ? `${g.source} no longer meets the append-mode contract — expected it to ${g.expectation}`
        : `${g.source} carries no \`## Append mode\` section — expected it to render \`/plan\`'s ` +
          `append-mode contract for its own backend; see plan-contract.md → Append mode (ADR 0004)`,
  },
  table('status-seed', STATUS_SEED_CONTRACTS, "run init's `scope.js init` call seeds each loaded slice's real status"),
  table(
    'plan-append',
    PLAN_APPEND_CONTRACTS,
    "/plan's §0 asks new-vs-extend, refuses on either signal while writing nothing, and promotes a " +
      'single-slice feature to an epic',
  ),
  table(
    'rotate-on-shipped',
    ROTATE_ON_SHIPPED_CONTRACTS,
    'run init rotates a shipped ledger aside before running it again',
  ),
  table(
    'parked-questions',
    PARKED_QUESTIONS_CONTRACTS,
    "/plan's §0 surfaces an epic's parked questions before the interview diverges and deletes a " +
      "resolved one's line",
  ),
  table('run-kind', RUN_KIND_CONTRACTS, 'scope-mode.md specifies the branch step for all three run kinds'),
  {
    id: 'forcing-branch-flag',
    ok: 'neither execution playbook names a forcing branch flag',
    run: scanForcingBranchFlag,
    format: contractGap,
  },
  table(
    'source-sections',
    SOURCE_SECTION_CONTRACTS,
    'every canonical reference still carries the sections its readers are sent to',
  ),
  {
    id: 'return-to-controller',
    ok: 'neither execution playbook instructs a return to the command body',
    run: scanReturnToController,
    format: contractGap,
  },
  table(
    'playbook-edges',
    PLAYBOOK_EDGE_CONTRACTS,
    'both execution playbooks still name run-init.md as their opening step and run-handoff.md as their closing one',
  ),
  table(
    'doc-pass',
    DOC_PASS_CONTRACTS,
    'every caller of the documentation pass reads the reference that states it',
  ),
  {
    id: 'narrative-coverage',
    ok: 'every registered check is written up in scripts/AGENTS.md by its own id',
    run: scanNarrativeCoverage,
    format: contractGap,
  },
  {
    id: 'marketplace-source',
    ok: 'the marketplace source resolves to the shipped plugin tree',
    run: scanMarketplaceSource,
    format: contractGap,
  },
  {
    id: 'readme-commands',
    ok: 'the README and skills/ name the same command set',
    run: scanReadmeCommands,
    format: contractGap,
  },
  {
    id: 'audit-set-globs',
    ok: 'every audit-set pattern resolves to at least one file',
    run: scanAuditSetGlobs,
    format: contractGap,
  },
  {
    id: 'release-contract',
    ok: 'every store document states its release signal, and all three consumers read it',
    run: scanReleaseContract,
    format: (g) =>
      g.expectation
        ? `${g.source} no longer meets the release contract — expected it to ${g.expectation}`
        : `${g.source} carries no \`## Release\` section — expected it to state how this backend marks ` +
            'a plan agreed for execution, or that its plans are released when written; see ' +
            '`references/plan-contract.md` → *Release*',
  },
  {
    id: 'doc-steps-no-suite',
    ok: 'the documentation and ship steps name no full-suite run of their own',
    run: scanDocStepsNoSuite,
    format: contractGap,
  },
  table(
    'fix-boundary',
    FIX_BOUNDARY_CONTRACTS,
    "the review's fix loop states its scope boundary and where a deferred finding goes",
  ),
  table(
    'denial-authorship',
    DENIAL_AUTHORSHIP_CONTRACTS,
    'the unattended block keys on authorship, and every dispatching document carries the condition',
    { stripFrontmatterFirst: true },
  ),
  {
    id: 'denial-cap',
    ok: 'the unattended run caps its denials at two, and every recording call site feeds that count',
    run: (root) => [
      ...scanContract(root, DENIAL_CAP_CONTRACTS, { stripFrontmatterFirst: true }),
      ...scanDenialCapNumberSilence(root),
    ],
    format: contractGap,
  },
  {
    id: 'afk-anchor-count',
    ok: "afk.md's scope-anchor paragraph states five things, naming the anchor dependency ADR 0040 added",
    run: scanAfkAnchorCount,
    format: contractGap,
  },
  table(
    'publish-run-state',
    PUBLISH_RUN_STATE_CONTRACTS,
    'publishing the run-state snapshot is stated once, and every ledger-writing site points at it',
  ),
  table(
    'adopt-run-state',
    ADOPT_RUN_STATE_CONTRACTS,
    'run init adopts a live snapshot, and the resumed branch step fetches it from the remote first',
  ),
  table(
    'resumed-scopetree-trigger',
    RESUMED_SCOPETREE_TRIGGER_CONTRACTS,
    'the resumed scopetree step fires whenever the scopetree is absent, not only when ship removed it',
  ),
  {
    id: 'agent-tool-agnostic',
    ok: 'shipped agent prose names no concrete toolchain command',
    run: scanAgentToolAgnostic,
    format: contractGap,
  },
  {
    id: 'scopetree',
    ok:
      'the full tier cuts and merges in the same scopetree the lite tier uses, never the invoking ' +
      'checkout',
    run: (root) => [
      ...scanContract(root, SCOPETREE_CONTRACTS),
      ...scanAfkLockTierClaim(root),
    ],
    format: contractGap,
  },
  table(
    'denial-reset',
    DENIAL_RESET_CONTRACTS,
    'the cap states the reset that returns the budget, and the block a capped run leaves names it',
    { stripFrontmatterFirst: true },
  ),
  {
    id: 'triage-record',
    ok: 'every slice-store seed states where a deferred finding\'s triage record lives',
    run: (root) => [
      ...scanTriageRecordContract(root),
      ...scanContract(root, TRIAGE_RECORD_CONTRACTS),
    ],
    format: contractGap,
  },
  {
    id: 'specialising-citations',
    ok: 'every store document cites the generic contract each section it carries specialises',
    run: scanSpecialisingCitations,
    format: contractGap,
  },
  {
    id: 'glossary-specialising-citations',
    ok: 'every glossary entry cites the generic contract the member it names specialises',
    run: scanGlossarySpecialisingCitations,
    format: contractGap,
  },
  table(
    'backlog-survey',
    BACKLOG_SURVEY_CONTRACTS,
    'the backlog survey resolves every store fact through the store document, reads the stage from the ' +
      'ledger, and writes nothing',
    { stripFrontmatterFirst: true },
  ),
  {
    id: 'opencode-render',
    ok: 'the committed OpenCode fixtures match a fresh render of the shipped skills, agents, and hook bridge',
    run: scanOpencodeFixtures,
    format: (gap) => gap,
  },
  {
    id: 'run-state-contract',
    ok: 'every store document carries its own `## Run state` section',
    run: scanRunStateContract,
    format: (g) =>
      `${g.source} carries no \`## Run state\` section — expected it to state how this backend mirrors ` +
      'the ledger onto the scope anchor, or that it carries no snapshot at all; see ' +
      '`references/plan-contract.md` → *Run state*',
  },
  {
    id: 'untriaged-item',
    ok: 'every slice-store document states how to recognise, list, and read the age of an untriaged item',
    run: scanUntriagedContract,
    format: contractGap,
  },
  table(
    'tier-skip',
    TIER_SKIP_CONTRACTS,
    'the full tier skips the whole-scope over-engineering pass, and still runs it per slice',
  ),
  table(
    'containment-delegation',
    CONTAINMENT_DELEGATION_CONTRACTS,
    "publish-kb.js delegates its containment check to scope.js's testContainment rather than " +
      'reimplementing the ancestry test itself',
  ),
  table(
    'containment-refetch',
    CONTAINMENT_REFETCH_CONTRACTS,
    'the containment test refetches the base before it answers not contained',
  ),
  {
    id: 'opencode-surface-split',
    ok: 'afk renders as an OpenCode command and every step it drives renders as a skill',
    run: scanOpencodeSurfaceSplit,
    format: (gap) => gap,
  },
  table(
    'standing-code-lens',
    STANDING_CODE_LENS_CONTRACTS,
    'the Brevity axis and Cross-slice divergence each carry their own standing-code reading',
  ),
  table(
    'setup-check',
    SETUP_CHECK_CONTRACTS,
    '`/superdev:setup check` is a named, read-only drift-check mode',
  ),
  table(
    'setup-check-claude-rules',
    SETUP_CHECK_RULES_CONTRACTS,
    '`/superdev:setup check` still reports a leftover `.claude/rules/` directory',
  ),
  table(
    'chained-test-audit',
    CHAINED_TEST_AUDIT_CONTRACTS,
    'a chained test audit runs no agreement round and writes no intent, returning fact/judgment-labelled ' +
      'findings to the caller instead',
  ),
  table(
    'sweep-chained-legs',
    SWEEP_CHAINED_LEG_CONTRACTS,
    '/superdev:sweep still dispatches its code, doc, and test legs with `--chained` and its config leg as ' +
      '`/superdev:setup check`',
  ),
  table(
    'invariant-register-path',
    INVARIANT_REGISTER_CONTRACTS,
    'domain-modeling.md still names the invariant register\'s fixed path, `docs/invariants.md`',
  ),
  table(
    'invariant-register-doc-pass',
    INVARIANT_REGISTER_DOC_PASS_CONTRACTS,
    'the doc pass and doc-reader still resolve the invariant register\'s `Paths:`/`Symbols:` entries ' +
      'against the repo',
  ),
  table(
    'invariant-compliance',
    INVARIANT_COMPLIANCE_CONTRACTS,
    'plan still routes a matched register entry into the DoD and the touching slice\'s spec, and final-reviewer still checks the register itself',
  ),
];

// The anchor contract and the afk-selection neutrality check report into the same sentence: a gap with
// no expectation is a missing section, one with an expectation is a section that states too little.
function anchorGap(g) {
  return g.expectation
    ? `${g.source} no longer meets the anchor contract — expected it to ${g.expectation}`
    : `${g.source} carries no \`## Scope anchor\` section — expected it to state how to recognise a ` +
        `feature's anchor, how to list candidates, how to tell that an anchor is itself a slice, and ` +
        `how to read an anchor's dependencies; see ADR 0017, ADR 0040`;
}
