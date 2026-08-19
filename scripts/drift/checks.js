'use strict';

// The drift-check registry: every check, in the order `scripts/AGENTS.md` numbers them. One entry is
// one check — what it scans (`run`), what the ok line says when it passes (`ok`), and how one gap is
// printed (`format`). `scripts/drift-check.js` walks this array and does nothing else.
//
// A new contract is appended at the END of this array. Every ordinal after an insertion point has to be
// rewritten by hand in `scripts/AGENTS.md`, which is the cost the append-at-the-end rule exists to avoid.

const fs = require('node:fs');
const path = require('node:path');

const { docPath, scanContract } = require('./lib');
const {
  scan,
  scanRunRootPaths,
  scanAssigneeContract,
  scanAnchorContract,
  scanAppendContract,
  scanAfkSelectionNeutrality,
  scanWritingStandardContract,
  scanContentTypesContract,
  scanCommandRefs,
  scanChainHandoff,
  scanAfkInvocations,
  scanShipGateContract,
  scanUnresolvedGlossaryContract,
  scanKbNoBackendCall,
  scanHookLedgerParsers,
  scanEvalShape,
  scanAdrStatus,
  scanForcingBranchFlag,
  scanReturnToController,
  scanNarrativeCoverage,
  scanMarketplaceSource,
  scanReadmeCommands,
} = require('./scanners');
const {
  ADR_STATUSES,
  FEATURE_ARG_CONTRACTS,
  UNATTENDED_CONTRACTS,
  CHANGE_TYPE_CONTRACTS,
  DEGRADED_CONTRACTS,
  DERIVED_CRITERIA_CONTRACTS,
  LABEL_VALIDATION_CONTRACTS,
  GREEN_GATE_TIMEOUT_CONTRACTS,
  VERB_CONTRACTS,
  KB_STAGING_CONTRACTS,
  TEST_SELECTION_CONTRACTS,
  FULL_SUITE_CONTRACTS,
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
  SOURCE_SECTION_CONTRACTS,
  PLAYBOOK_EDGE_CONTRACTS,
  DOC_PASS_CONTRACTS,
} = require('./contracts');

// The printer twenty-three table-driven checks share. A gap is `{ source, expectation }` and reads the
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

// Every scanner skips a document it cannot read, so a fixture carries only the files it exercises. That
// convention would let `commands/afk.md` be deleted without a single check going red, because nothing
// else in the plugin names `/superdev:afk` for scanCommandRefs to resolve. It is a command rather than
// an optional doc, so its existence is asserted on its own.
function scanAfkExists(root) {
  if (fs.existsSync(docPath(root, 'commands', 'afk.md'))) return [];
  return [
    {
      source: path.join('commands', 'afk.md'),
      expectation: 'exist — `/superdev:afk` is a command, and no other check would notice its absence',
    },
  ];
}

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
    "the scope review runs the full suite itself while final-reviewer's own re-run stays optional",
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
  { id: 'afk-existence', ok: 'commands/afk.md exists', run: scanAfkExists, format: contractGap },
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
];

// The anchor contract and the afk-selection neutrality check report into the same sentence: a gap with
// no expectation is a missing section, one with an expectation is a section that states too little.
function anchorGap(g) {
  return g.expectation
    ? `${g.source} no longer meets the anchor contract — expected it to ${g.expectation}`
    : `${g.source} carries no \`## Scope anchor\` section — expected it to state how to recognise a ` +
        `feature's anchor, how to list candidates, and how to tell that an anchor is itself a slice; ` +
        `see ADR 0017`;
}
