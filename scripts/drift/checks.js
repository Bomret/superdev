'use strict';

// The drift-check registry: every check, in the order `scripts/AGENTS.md` numbers them. One entry is
// one check — what it scans (`run`), what the ok line says when it passes (`ok`), and how one gap is
// printed (`format`). `scripts/drift-check.js` walks this array and does nothing else.
//
// A new contract is appended at the END of this array. Every ordinal after an insertion point has to be
// rewritten by hand in `scripts/AGENTS.md`, which is the cost the append-at-the-end rule exists to avoid.

const { scanContract } = require('./lib');
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
  scanKbNoBackendCall,
  scanPinnedPaths,
  scanDocStepsNoSuite,
  scanAgentToolAgnostic,
  scanHookLedgerParsers,
  scanEvalShape,
  scanAdrStatus,
  scanForcingBranchFlag,
  scanReturnToController,
  scanNarrativeCoverage,
  scanMarketplaceSource,
  scanReadmeCommands,
  scanAuditSetGlobs,
  scanDenialCapNumberSilence,
  scanAfkLockTierClaim,
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
  DERIVED_CRITERIA_CONTRACTS,
  LABEL_VALIDATION_CONTRACTS,
  GREEN_GATE_TIMEOUT_CONTRACTS,
  VERB_CONTRACTS,
  KB_STAGING_CONTRACTS,
  TEST_SELECTION_CONTRACTS,
  FULL_SUITE_CONTRACTS,
  FIX_BOUNDARY_CONTRACTS,
  AFK_ROUTING_CONTRACTS,
  ARG_TOKEN_CONTRACTS,
  AUDIT_SET_CONTRACTS,
  AGGREGATE_PAGE_CONTRACTS,
  READ_PATH_CONTRACTS,
  STATUS_SEED_CONTRACTS,
  PLAN_APPEND_CONTRACTS,
  ROTATE_ON_SHIPPED_CONTRACTS,
  PARKED_QUESTIONS_CONTRACTS,
  RUN_KIND_CONTRACTS,
  SCOPE_WORKTREE_CONTRACTS,
  SOURCE_SECTION_CONTRACTS,
  PLAYBOOK_EDGE_CONTRACTS,
  DOC_PASS_CONTRACTS,
  PUBLISH_RUN_STATE_CONTRACTS,
  ADOPT_RUN_STATE_CONTRACTS,
  RESUMED_WORKTREE_TRIGGER_CONTRACTS,
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
// asserted `commands/afk.md` alone, on the stated grounds that nothing else in the plugin names
// `/superdev:afk` — already false when written: `commands/implement.md` names it too, and
// `command-resolution` already resolves every `/superdev:` reference in `commands/`, so it already
// caught the file's deletion. The general rule — every path a contract table pins still exists — covers
// `commands/afk.md` a second way (three tables pin it) and the other thirty-odd besides, so the special
// case went. It sits here rather than at the end of the registry deliberately: replacing the entry in
// place renumbers no ordinal in `scripts/AGENTS.md`, where appending would have shifted every one below
// it.

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
    ok: 'assignee contract carried',
    run: scanAssigneeContract,
    format: (g) =>
      `${g.source} carries no \`**Assignee\` config bullet — expected \`- **Assignee:** <value>\` or ` +
      `\`- **Assignee**: <value>\` as a list item; see plan-contract.md → Assignee`,
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
    format: (d) => `${d.source} names \`${d.command}\`, which has no file under commands/`,
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
  table('label-validation', LABEL_VALIDATION_CONTRACTS, 'both label segments validated'),
  table('green-gate-timeout', GREEN_GATE_TIMEOUT_CONTRACTS, "green-gate's hooks.json timeout matches its own comment"),
  table('verb-pointer', VERB_CONTRACTS, 'every chain document invokes its scope.js verb'),
  table('kb-staging', KB_STAGING_CONTRACTS, 'knowledge-base pages are staged'),
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
    'aggregate-page',
    AGGREGATE_PAGE_CONTRACTS,
    'both stagers, publish-kb, and the knowledge-base seed agree on the `patch` action',
  ),
  table(
    'read-path',
    READ_PATH_CONTRACTS,
    'publish-kb separates a read failure from a genuinely absent page while a marked config document ' +
      'documents the call that returns the body',
  ),
  { id: 'pinned-paths', ok: 'every document a contract table pins still exists', run: scanPinnedPaths, format: contractGap },
  {
    id: 'eval-shape',
    ok: 'eval graders and scaffolds well-formed',
    run: scanEvalShape,
    format: (p) => `${p.source}: ${p.problem}`,
  },
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
    ok: "every registered check is written up in scripts/AGENTS.md, and both counts match the registry",
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
    ok: 'the README and commands/ name the same command set',
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
    'resumed-worktree-trigger',
    RESUMED_WORKTREE_TRIGGER_CONTRACTS,
    'the resumed worktree step fires whenever the scope worktree is absent, not only when ship removed it',
  ),
  {
    id: 'agent-tool-agnostic',
    ok: 'shipped agent prose names no concrete toolchain command',
    run: scanAgentToolAgnostic,
    format: contractGap,
  },
  {
    id: 'scope-worktree',
    ok:
      'the full tier cuts and merges in the same scope worktree the lite tier uses, never the invoking ' +
      'checkout',
    run: (root) => [
      ...scanContract(root, SCOPE_WORKTREE_CONTRACTS),
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
