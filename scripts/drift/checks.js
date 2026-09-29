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
  scanShipHumanOnly,
  scanModelInvocationSplit,
  scanAssigneeContract,
  scanAnchorContract,
  scanAppendContract,
  scanReleaseContract,
  scanRunStateContract,
  scanDodTicksContract,
  scanTriageRecordContract,
  scanUntriagedContract,
  scanSpecialisingCitations,
  scanGlossarySpecialisingCitations,
  scanAfkSelectionNeutrality,
  scanAfkAnchorCount,
  scanWritingStandardContract,
  scanContentTypesContract,
  scanCommandRefs,
  scanObservationCaptureReminders,
  scanChainHandoff,
  scanAfkInvocations,
  scanAfkNoShipStep,
  scanShipGateContract,
  scanShipNoOpensPr,
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
  scanNoForceMerge,
  scanReturnToController,
  scanNarrativeCoverage,
  scanMarketplaceSource,
  scanReadmeCommands,
  scanAuditSetGlobs,
  scanDenialCapNumberSilence,
  scanAfkLockTierClaim,
  scanRunLockLivenessSilence,
  scanUnmappedPathsForms,
  scanDeployRunnerExclusivity,
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
  DEPLOYMENT_CONTRACTS,
  PLAN_DEPLOY_CONTRACTS,
  DERIVED_CRITERIA_CONTRACTS,
  PER_CRITERION_VERDICT_CONTRACTS,
  REACHABLE_CRITERION_CONTRACTS,
  REVIEW_RANGE_SHAPES_CONTRACTS,
  EMPTY_ARGUMENT_CONTRACTS,
  AGENT_LENS_LIST_CONTRACTS,
  LABEL_VALIDATION_CONTRACTS,
  GREEN_GATE_TIMEOUT_CONTRACTS,
  VERB_CONTRACTS,
  KB_STAGING_CONTRACTS,
  KB_READ_NEVER_WRITE_CONTRACTS,
  TEST_SELECTION_CONTRACTS,
  TIER_SKIP_CONTRACTS,
  CONTAINMENT_DELEGATION_CONTRACTS,
  CONTAINMENT_REFETCH_CONTRACTS,
  CONTAINMENT_PROBE_CONTRACTS,
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
  SHIPPED_APPEND_CONTRACTS,
  ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS,
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
  RUN_LOCK_LIVENESS_CONTRACTS,
  STANDING_CODE_LENS_CONTRACTS,
  INVARIANT_REGISTER_CONTRACTS,
  INVARIANT_REGISTER_DOC_PASS_CONTRACTS,
  INVARIANT_COMPLIANCE_CONTRACTS,
  COMMITMENT_CAPTURE_CONTRACTS,
  PLANNED_HANDOFF_CONTRACTS,
  VERIFICATION_CEILING_CONTRACTS,
  SHIP_TICKS_NOTHING_CONTRACTS,
  DOC_UNTICK_ON_BREAK_CONTRACTS,
  CRITERION_STATES_A_REQUIREMENT_CONTRACTS,
  CLEAN_VERDICT_ENDS_LOOP_CONTRACTS,
  OBSERVATION_CAPTURE_CONTRACTS,
  LABEL_REVISION_AT_DECOMPOSITION_CONTRACTS,
  UNMET_CRITERION_AT_REVIEW_CONTRACTS,
  RELEASE_ANSWER_NOT_INFERRED_CONTRACTS,
  CAPTURE_CHECKS_CONCURRENT_PLANS_CONTRACTS,
  SPAWN_FAILURE_ANSWER_CONTRACTS,
  DECOMPOSITION_NAMES_WHAT_IT_CHECKED_CONTRACTS,
  CRITERION_TAG_CONTRACTS,
  DOD_TICKS_CONTRACTS,
  HOLDS_VERDICT_TICKS_CONTRACTS,
  ACCEPTED_VERDICT_CONTRACTS,
  ALWAYS_REVIEW_CONTRACTS,
  ANCHOR_CLOSE_BEFORE_PUSH_CONTRACTS,
  CODE_MANAGEMENT_MERGE_CONTRACTS,
  CODE_MANAGEMENT_HEAD_BRANCH_LOOKUP_CONTRACTS,
  SHIP_TESTED_PUSH_CONTRACTS,
  SHIP_MERGE_PIN_CONTRACTS,
  SHIP_LEGACY_SHIPPED_CONTRACTS,
  SHIP_DEPLOY_CONTRACTS,
  DOCUMENT_SUBMITTED_CONTRACTS,
  REVIEW_SUBMITTED_CONTRACTS,
  BACKLOG_SUBMITTED_CONTRACTS,
  DEPLOY_STEP_VISIBILITY_CONTRACTS,
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
  {
    id: 'afk-no-ship-step',
    ok: 'afk never names `/superdev:ship` as a step it runs — every mention admits, in the same sentence, that afk stops short of it',
    run: scanAfkNoShipStep,
    format: contractGap,
  },
  table('change-type', CHANGE_TYPE_CONTRACTS, 'change-type set matches the scope-prune hook and scope.js'),
  table('degraded-pass', DEGRADED_CONTRACTS, 'degrade record carried', { stripFrontmatterFirst: true }),
  table('derived-criteria', DERIVED_CRITERIA_CONTRACTS, 'criteria derived before the DoD is read'),
  table(
    'per-criterion-verdict',
    PER_CRITERION_VERDICT_CONTRACTS,
    'final-reviewer carries `## Judge every criterion` and its `### Criteria` output section, and review/SKILL.md\'s dispatch asks it to judge every `dod.md` line',
  ),
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
  table('kb-read-never-write', KB_READ_NEVER_WRITE_CONTRACTS, 'the doc pass may read a remote knowledge-base backend and never writes to it'),
  {
    id: 'scopetree-run-root',
    ok: 'the four scopetree-addressing documents use the absolute run-root path',
    run: scanScopetreeRunRootPaths,
    format: (o) => `checkout-relative scopetree path \`${o.match}\` in ${o.source} — use \`<run-root>/scopetree\``,
  },
  {
    id: 'no-base-branch-commit',
    ok: 'no shipped prose instructs a commit, a push, or a merge to the base branch, other than ship\'s own admitted host-API merge (INV-0001)',
    run: scanNoBaseBranchCommit,
    format: (g) => `${g.source}:${g.line} instructs a commit, a push, or a merge to the base branch — no superdev command reaches the base branch that way (INV-0001, docs/invariants.md)`,
  },
  {
    id: 'ship-human-only',
    ok: 'ship carries `disable-model-invocation: true` and names no `--unattended` mode of its own (INV-0093)',
    run: scanShipHumanOnly,
    format: contractGap,
  },
  {
    id: 'model-invocation-split',
    ok: 'afk carries `disable-model-invocation: true` and every chain step it drives carries none (INV-0066)',
    run: scanModelInvocationSplit,
    format: contractGap,
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
    'the scope review reuses a green suite record on the current tip or runs and records the full suite itself, while final-reviewer reviews against the result it is handed',
  ),
  table(
    'spawn-failure-answers',
    SPAWN_FAILURE_ANSWER_CONTRACTS,
    'green-gate states what it does with a spawn that never started, and why',
  ),
  table(
    'verification-ceiling',
    VERIFICATION_CEILING_CONTRACTS,
    'verifying a Definition-of-Done criterion observes, and changes no system outside the repository, on both verifying agent bodies and every surface that verifies a criterion or dispatches one that does',
  ),
  table(
    'ship-ticks-nothing',
    SHIP_TICKS_NOTHING_CONTRACTS,
    'submit-pr writes no tick anywhere, and copies every `— ceiling:` criterion into the pull-request body as a post-merge checklist',
  ),
  table(
    'anchor-close-before-push',
    ANCHOR_CLOSE_BEFORE_PUSH_CONTRACTS,
    "a store whose anchor close is a scope-branch commit commits that close before submit-pr's push, so it reaches base with the merge, and the local store's own close line says so",
  ),
  table(
    'doc-untick-on-break',
    DOC_UNTICK_ON_BREAK_CONTRACTS,
    "document's closing step re-checks a ticked criterion its own commits could touch and unticks a broken one with a note",
  ),
  table(
    'paths-derivation',
    PATHS_DERIVATION_CONTRACTS,
    'setup derives a `{paths}` form only for a mapping runner, a fast subset otherwise, and never reaches `none` for a repository with a suite — the second fence carries the full command again, with the reason recorded — and a one-fence verification.md stops with /superdev:setup named, everywhere from the hook to plan and implement',
  ),
  {
    id: 'unmapped-paths-form',
    ok: 'no shipped document proposes a `{paths}` form to a runner that maps nothing',
    run: scanUnmappedPathsForms,
    format: contractGap,
  },
  table(
    'deployment-posture',
    DEPLOYMENT_CONTRACTS,
    'the seed states its posture, its targets table, the absent-document default, and INV-0098\'s ' +
      'ship-only/auto-only rule, and setup proposes `manual` by default, `auto` only on request, and lists `deployment.md` in `check` mode; ' +
      "both state that an `auto` target's command runs in a tree detached at the merge commit that can " +
      'still carry ignored files from the run',
  ),
  table(
    'plan-deploy-line',
    PLAN_DEPLOY_CONTRACTS,
    'plan-contract defines the `**Deploy:**` line, plan asks the deploy question and writes the line, ' +
      'and every store document states its write/read mechanism',
  ),
  {
    id: 'entries-standing-gate',
    ok: 'submit-pr asks once and refuses unattended on a standing unresolved defect',
    run: scanShipGateContract,
    format: contractGap,
  },
  {
    id: 'ship-no-opens-pr',
    ok: 'no shipped surface pairs `/superdev:ship` with opening the pull request — submit-pr opens it, ship only merges',
    run: scanShipNoOpensPr,
    format: contractGap,
  },
  {
    id: 'unresolved-glossary',
    ok: 'the glossary agrees with scope-mode.md on which record covers a failure of the code under review',
    run: scanUnresolvedGlossaryContract,
    format: contractGap,
  },
  table('afk-routing', AFK_ROUTING_CONTRACTS, 'afk routes every scope through review, with no special case for an all-mechanical/docs ledger'),
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
    'shipped-append',
    SHIPPED_APPEND_CONTRACTS,
    "/plan's extend path refuses a feature whose anchor has shipped, on either signal alone, and names " +
      'the new-feature remedy',
  ),
  table(
    'anchor-candidate-all-states',
    ANCHOR_CANDIDATE_ALL_STATES_CONTRACTS,
    "the anchor candidate listing queries every state, so a shipped feature's closed epic still " +
      'resolves, and the open candidate wins over a closed one a retired label left behind',
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
  table('run-kind', RUN_KIND_CONTRACTS, 'scope-mode.md specifies the branch step for both run kinds'),
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
    ok: 'the documentation and submit-pr steps name no full-suite run of their own',
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
    id: 'run-lock-liveness',
    ok: "/superdev:implement's own entry into an existing run root checks the ledger's stage and the lock's " +
      "freshness together before its first write, scoped to that one caller — never " +
      "review/document/submit-pr/ship's ordinary hand-off, which carries no such language of its own — and " +
      "/superdev:plan keeps its own " +
      'separate, narrower check',
    run: (root) => [...scanContract(root, RUN_LOCK_LIVENESS_CONTRACTS), ...scanRunLockLivenessSilence(root)],
    format: contractGap,
  },
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
    ok: 'every slice-store seed states where a triage record lives, for a deferred finding or an ' +
      'observation alike',
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
  table(
    'backlog-submitted-buckets',
    BACKLOG_SUBMITTED_CONTRACTS,
    'the backlog survey buckets a `submitted` run root as `awaiting merge` or `merge unrecorded`, told ' +
      "apart by the ledger's own `**PR:**` header, since afk's routing table skips `submitted` entirely (#687)",
  ),
  table(
    'deploy-step-visibility',
    DEPLOY_STEP_VISIBILITY_CONTRACTS,
    "submit-pr's next-command line states that ship deploys and its close follows an `auto` deploy, and the backlog survey never steers an " +
      'operator into closing an anchor stuck mid-`auto`-deploy by hand, shows a stalled deploy whether or ' +
      'not an open anchor matches it, and ranks it first',
  ),
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
    id: 'dod-ticks-contract',
    ok: 'every store document carries its own `## Definition of Done ticks` section, citing `dod-line` for the line edit with a replace-not-append note, and stating that a failed anchor write is reported once per run and never stops the run',
    run: scanDodTicksContract,
    format: (g) =>
      g.expectation
        ? `${g.source}'s \`## Definition of Done ticks\` section fails to ${g.expectation}; see ` +
          '`references/plan-contract.md` → *Definition of Done ticks*'
        : `${g.source} carries no \`## Definition of Done ticks\` section — expected it to state how a ` +
          'controller ticks the anchor\'s own checklist, independent of `## Run state`; see ' +
          '`references/plan-contract.md` → *Definition of Done ticks*',
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
  table(
    'containment-probe',
    CONTAINMENT_PROBE_CONTRACTS,
    "a conflicting tree comparison asks whether base's history took the branch's patch, under a " +
      'commit cap, and fails closed',
  ),
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
    'plan still routes a matched register entry\'s id into the touching slice\'s spec and acceptance, states the epic\'s own criterion as the behaviour the invariant protects, and final-reviewer still checks the register itself',
  ),
  table(
    'commitment-capture',
    COMMITMENT_CAPTURE_CONTRACTS,
    'brainstorm still names load-bearing commitments as pairs, plan still routes and gates them, and ' +
      "domain-modeling.md still carries the sort, its authoring-rule guard, and its `Check: none` branch",
  ),
  table(
    'criterion-states-a-requirement',
    CRITERION_STATES_A_REQUIREMENT_CONTRACTS,
    'plan-contract.md still states that a criterion names no command superdev runs to verify it, and ' +
      "plan's interview still writes no verification command into a criterion and still surfaces a " +
      'live-system-only criterion with the pre-merge deploy it would force',
  ),
  table(
    'clean-verdict-ends-loop',
    CLEAN_VERDICT_ENDS_LOOP_CONTRACTS,
    'a clean verdict ends the fix loop the same way attended or unattended, in both implement\'s ' +
      'Invariants and review\'s own fix loop, and a finding still standing when it lands is a follow-up, ' +
      'never a fourth cycle',
  ),
  table(
    'observation-capture',
    OBSERVATION_CAPTURE_CONTRACTS,
    'scope-mode.md\'s own `## Observations` section states what an observation is, that its triage ' +
      'record is written the moment it is met, that the record is the only artifact, that it is ' +
      'recorded never judged, that capture reads the store\'s open triage records before it writes and ' +
      'names the comparison a judgment rather than a string match, that an uncertain match writes the ' +
      'record and why the two errors are not symmetrical, that a store defining no `## Triage record` ' +
      'section is reported and dropped rather than recorded, that capture is otherwise best-effort, and ' +
      "that implement-lite.md's own capture clause still states the rule for the tier that dispatches " +
      'nobody',
  ),
  {
    id: 'observation-capture-reminders',
    ok: 'every document that dispatches a `superdev:` subagent names the observation-capture rule',
    run: scanObservationCaptureReminders,
    format: contractGap,
  },
  table(
    'label-revision-at-decomposition',
    LABEL_REVISION_AT_DECOMPOSITION_CONTRACTS,
    'plan/SKILL.md still states, both where §1 picks the feature label and again at §3\'s decomposition ' +
      'step, that a later answer changing what the feature does revises the label in place',
  ),
  table(
    'unmet-criterion-at-review',
    UNMET_CRITERION_AT_REVIEW_CONTRACTS,
    'review/SKILL.md §4 still unticks a broken criterion with a note as a Critical finding, whether the ' +
      'line was ticked or already unticked, holds the stage while any criterion but a ceiling one stands ' +
      'unmet, reports the verification-ceiling case without chasing it, and re-ticks only what a clean ' +
      're-review\'s fix implementer reported met',
  ),
  table(
    'release-answer-not-inferred',
    RELEASE_ANSWER_NOT_INFERRED_CONTRACTS,
    'plan-contract.md\'s `## Release` section still credits the release answer to a human (ADR 0034), ' +
      'and plan/SKILL.md §6 still states that answer is the user\'s alone and that an authorization to ' +
      'run the whole chain unattended is not it',
  ),
  table(
    'capture-checks-concurrent-plans',
    CAPTURE_CHECKS_CONCURRENT_PLANS_CONTRACTS,
    'plan/SKILL.md §2 still checks a shared-identifier capture against the other live plan runs\' own ' +
      'allocations before writing it',
  ),
  table(
    'decomposition-names-what-it-checked',
    DECOMPOSITION_NAMES_WHAT_IT_CHECKED_CONTRACTS,
    'plan/SKILL.md §5 still states, before the decomposition is presented, for each file opened while ' +
      'grounding it, what it says about the proposal itself',
  ),
  table(
    'criterion-tag',
    CRITERION_TAG_CONTRACTS,
    'plan-contract.md still states the criterion-tag line format and the untagged single-slice case, and ' +
      'plan/SKILL.md still tags every criterion at decomposition, shows the tags at the quiz, and formats ' +
      'them into the store at write time',
  ),
  table(
    'dod-ticks',
    DOD_TICKS_CONTRACTS,
    'dod-ticks.md still states the mapping gate over the listed lines, that a controller matches a tag to ' +
      "a slice through the ledger's `issue` column, that a `dod.md` with no tags lists every line and an " +
      "untagged line on a tagged one is settled by run handoff as `scope`, the note rule, that only a " +
      'controller ticks, ' +
      'review\'s own listed-lines case, and the joint-tag controller rule (never ticks a multi-slice line ' +
      'while a sibling slice in its tag is unmerged, per the ledger), both execution playbooks still hand ' +
      'the implementer the `dod.md` path plus its listed lines and tick from its report, ' +
      'agents/implementer.md still reports one line for every criterion its dispatch listed and states ' +
      'that a joint line gets the same three shapes reporting only what this slice delivered, ' +
      'review/SKILL.md still restates the fix cycle\'s dispatch clause on its own dispatch surface, and ' +
      "run-handoff.md's own fix loop and handoff pass still cite the mapping gate, settle every " +
      '`scope`-tagged criterion, and re-check every earlier tick',
  ),
  table(
    'holds-verdict-ticks',
    HOLDS_VERDICT_TICKS_CONTRACTS,
    'dod-ticks.md and review/SKILL.md §4 still state that a `holds` verdict ticks a line unticked with ' +
      '`not met:` or carrying no note, with the verdict\'s evidence as the note, and that a `ceiling:` ' +
      'line needs the no-deploy-and-branch-evidence statement before a `holds` verdict can tick it',
  ),
  table(
    'accepted-verdict',
    ACCEPTED_VERDICT_CONTRACTS,
    'final-reviewer.md still recognises the `accepted` verdict as no finding and no stage hold, and ' +
      'review/SKILL.md §4 still restates that on its own dispatch surface (ADR 0095)',
  ),
  table(
    'always-review',
    ALWAYS_REVIEW_CONTRACTS,
    'run handoff names `/superdev:review` as the next command for every scope, whatever its slice types (INV-0016)',
  ),
  table(
    'review-submitted-handoff',
    REVIEW_SUBMITTED_CONTRACTS,
    'a review at stage `submitted` prints `/superdev:ship <scope>` as its next command, and a standing ' +
      "finding there invalidates the tip's suite record rather than leaving one `suite reusable` still " +
      'accepts (#687)',
  ),
  table(
    'code-management-merge',
    CODE_MANAGEMENT_MERGE_CONTRACTS,
    'each code-management document carries a `## Merge` section reading the pull request and merging ' +
      'it squashed and pinned to one head sha (#683, INV-0092)',
  ),
  {
    id: 'code-management-no-force',
    ok: 'no code-management document invokes a force or bypass option on a merge call',
    run: scanNoForceMerge,
    format: contractGap,
  },
  table(
    'code-management-head-branch-lookup',
    CODE_MANAGEMENT_HEAD_BRANCH_LOOKUP_CONTRACTS,
    'each code-management document carries the open-pull-requests-by-head-branch lookup `/superdev:ship` ' +
      "falls back to for a ledger predating the ledger's own PR number, scoped to open pull requests only " +
      '(#685, INV-0092)',
  ),
  table(
    'ship-tested-push',
    SHIP_TESTED_PUSH_CONTRACTS,
    "ship gates its own push of the scope branch on `suite reusable` accepting the tip, refuses an " +
      'untested one, and prints the range a push adds before sending it',
  ),
  table(
    'ship-merge-pin-local-tip',
    SHIP_MERGE_PIN_CONTRACTS,
    "ship and each code-management document state that the merge's own pin is the local scope-branch " +
      "tip `suite reusable` accepted, never a value read from the host",
  ),
  table(
    'ship-legacy-shipped',
    SHIP_LEGACY_SHIPPED_CONTRACTS,
    'a `shipped` ledger carrying a `**PR:**` header already finished, one carrying none is a legacy run ' +
      'ship still treats like `submitted`, its own None-found case skips the `pr set` recovery for a ' +
      'legacy run, and scope-mode.md names the header, not `shipped` alone, as what actually terminates ' +
      'the stage',
  ),
  table(
    'ship-deploy',
    SHIP_DEPLOY_CONTRACTS,
    "ship's pre-merge gate refuses an anchor listing an untabled target and shows a changed " +
      "`deployment.md`'s posture and targets before merging; its post-merge deploy step deploys nothing " +
      'under `none`, prints and records `pending` under `manual`, and under `auto` runs each target ' +
      'detached at the merge commit, stopping and recording a failed one while leaving the anchor open, ' +
      'closing only once every target has deployed; a `shipped` ledger with an unfinished `auto` deploy ' +
      "joins ship's own candidate set and resumes at the first undeployed target; an adopted hand merge " +
      'takes the same deploy step; under `auto` ship asks once before it deploys a `deployment.md` nobody ' +
      'was shown',
  ),
  {
    id: 'deploy-runner-exclusivity',
    ok: "no skill or agent but ship names a deploy target's command as something it runs (INV-0098)",
    run: scanDeployRunnerExclusivity,
    format: contractGap,
  },
  table(
    'document-submitted-handoff',
    DOCUMENT_SUBMITTED_CONTRACTS,
    "document's own stage write leaves `submitted` alone beside `shipped`, and prints " +
      '`/superdev:ship <scope>` for it instead of re-opening a pull request already open',
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
