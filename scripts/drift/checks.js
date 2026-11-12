'use strict';

// The drift-check registry: every check, keyed by its own `id`. One entry is one check — what it scans
// (`run`), what the ok line says when it passes (`ok`), and how one gap is printed (`format`).
// `scripts/drift-check.js` walks this array and does nothing else.
//
// A check tests a mechanical fact (a link or section target resolves, a number is unique, a file or
// command exists, a property of code or configuration holds) or forbids a form in shipped prose (ADR
// 0153). `scripts/AGENTS.md` carries one table row per check, keyed by its `id`.

const { scanContract } = require('./lib');
const {
  scan,
  scanRunRootPaths,
  scanScopetreeRunRootPaths,
  scanAdrStatus,
  scanAdrNumbers,
  scanAdrRelations,
  scanCommandRefs,
  scanHeadingCitations,
  scanGovernedSkillFiles,
  scanKbNoBackendCall,
  scanAgentToolAgnostic,
  scanUnmappedPathsForms,
  scanHookLedgerParsers,
  scanShellSpawn,
  scanTestSeams,
  scanNoForceMerge,
  scanConflictConclusionNoCommit,
  scanBackgroundRuleNamesLimit,
  scanTeaOnly,
  scanGithubWikiGhOnly,
  scanDeployRunnerExclusivity,
  scanDocSetupNoTestRun,
  scanImplementNoFullRun,
  scanObservationNoSuiteRun,
  scanMarketplaceSource,
  scanAuditSetGlobs,
  scanNoBaseBranchCommit,
  scanShipNoOpensPr,
  scanPastPrSkills,
  scanDeriveNoDod,
  scanInvariantRegisterJoin,
} = require('./scanners');
const {
  ADR_STATUSES,
  CHANGE_TYPE_CONTRACTS,
  SOURCE_SECTION_CONTRACTS,
  CONTAINMENT_DELEGATION_CONTRACTS,
} = require('./contracts');

// The printer most checks share. A gap is `{ source, expectation }`.
const contractGap = (g) => `${g.source} no longer meets its contract — expected it to ${g.expectation}`;

// A table-driven check: the whole assertion is a `[document, pattern, expectation]` table run through
// scanContract().
const table = (id, contracts, ok) => ({
  id,
  contracts,
  ok,
  run: (root) => scanContract(root, contracts),
  format: contractGap,
});

module.exports = [
  {
    id: 'reference',
    ok: 'references resolve',
    run: scan,
    format: (m) => `missing ${m.reference} — referenced by ${m.source}`,
  },
  {
    id: 'heading-citation',
    ok: "every \"`<file>.md`'s `## Heading`\" citation and every section map entry names a heading the file carries",
    run: scanHeadingCitations,
    format: (c) =>
      c.missing
        ? `${c.source} cites ${c.cited}, which resolves to no file`
        : `${c.source} cites ${c.cited}'s \`${c.heading}\`, which ${c.cited} does not carry at that level`,
  },
  table(
    'source-sections',
    SOURCE_SECTION_CONTRACTS,
    'every canonical reference and every cited agent body still carries the sections its readers are sent to',
  ),
  {
    id: 'command-resolution',
    ok: 'commands resolve',
    run: scanCommandRefs,
    format: (d) => `${d.source} names \`${d.command}\`, which has no file under skills/`,
  },
  {
    id: 'governed-skill-files',
    ok: "every path CONTEXT.md's **Prompt concept** entry lists names a file (ADR 0190)",
    run: scanGovernedSkillFiles,
    format: contractGap,
  },
  {
    id: 'audit-set-globs',
    ok: 'every audit-set pattern resolves to at least one file',
    run: scanAuditSetGlobs,
    format: contractGap,
  },
  {
    id: 'marketplace-source',
    ok: 'the marketplace source resolves to the shipped plugin tree',
    run: scanMarketplaceSource,
    format: contractGap,
  },
  {
    id: 'adr-numbers',
    ok: 'no two ADRs share a number',
    run: scanAdrNumbers,
    format: contractGap,
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
    id: 'adr-relations',
    ok: 'every ADR relation header pairs with the reverse header on its target',
    run: scanAdrRelations,
    format: contractGap,
  },
  {
    id: 'invariant-register-join',
    ok: "every drift id a register `Check:` line names is registered, and every invariant a contract row cites covers the row's document in its `Paths:` (ADR 0156)",
    run: (root) => scanInvariantRegisterJoin(root),
    format: (g) => g.message,
  },
  {
    id: 'run-root',
    ok: 'run-root paths are absolute',
    run: scanRunRootPaths,
    format: (o) => `checkout-relative run-root path \`${o.match}\` in ${o.source} — use \`<run-root>/…\``,
  },
  {
    id: 'scopetree-run-root',
    ok: 'the scopetree-addressing documents use the absolute run-root path',
    run: scanScopetreeRunRootPaths,
    format: (o) => `checkout-relative scopetree path \`${o.match}\` in ${o.source} — use \`<run-root>/scopetree\``,
  },
  table('change-type', CHANGE_TYPE_CONTRACTS, 'change-type set matches the scope-prune hook and lib/ledger.js'),
  {
    id: 'no-second-reader',
    ok: 'no hook parses a ledger header itself',
    run: scanHookLedgerParsers,
    format: contractGap,
  },
  {
    id: 'shell-spawn',
    ok: 'no shipped executable starts a shell by absolute path, starts bash, or uses the default shell',
    run: scanShellSpawn,
    format: contractGap,
  },
  {
    id: 'test-seams',
    ok: 'no shipped JavaScript names a superdev test file, reads an environment variable no shipped document names (outside CLAUDE_), or reads or sets a SUPERDEV_ one, and no shipped Markdown names one (ADR 0207)',
    run: scanTestSeams,
    format: contractGap,
  },
  table(
    'containment-delegation',
    CONTAINMENT_DELEGATION_CONTRACTS,
    "lib/kb-containment.js delegates its containment check to lib/containment.js's testContainment rather than " +
      'reimplementing the ancestry test itself',
  ),
  {
    id: 'past-pr-skills',
    ok: 'ship, verify-ship, wrap-up, and publish-kb carry no `disable-model-invocation: true`, neither verify-ship nor wrap-up names `--unattended`, and no `--from-ship` remains (INV-0066, INV-0093)',
    run: scanPastPrSkills,
    format: contractGap,
  },
  {
    id: 'no-base-branch-commit',
    ok: 'no shipped prose instructs a commit, a push, or a merge to the base branch, other than ship\'s own admitted host-API merge (INV-0001)',
    run: scanNoBaseBranchCommit,
    format: (g) => `${g.source}:${g.line} instructs a commit, a push, or a merge to the base branch — no superdev command reaches the base branch that way (INV-0001, docs/invariants.md)`,
  },
  {
    id: 'conflict-conclusion-no-commit',
    ok: 'no shipped prose concludes a resolved merge conflict with `git commit`',
    run: scanConflictConclusionNoCommit,
    format: contractGap,
  },
  {
    id: 'code-management-no-force',
    ok: 'no code-management document invokes a force or bypass option on a merge call',
    run: scanNoForceMerge,
    format: contractGap,
  },
  {
    id: 'forgejo-tea-only',
    ok: 'no Forgejo backend document names a token env var, an `Authorization` header, or a curl call (ADR 0111)',
    run: scanTeaOnly,
    format: contractGap,
  },
  {
    id: 'github-wiki-gh-only',
    ok: 'neither the GitHub wiki seed nor the knowledge-base document names a token env var or an `Authorization` header',
    run: scanGithubWikiGhOnly,
    format: contractGap,
  },
  {
    id: 'kb-no-backend-call',
    ok: 'no document but publish-kb reaches a backend',
    run: scanKbNoBackendCall,
    format: contractGap,
  },
  {
    id: 'agent-tool-agnostic',
    ok: 'shipped agent prose names no concrete toolchain command',
    run: scanAgentToolAgnostic,
    format: contractGap,
  },
  {
    id: 'deploy-runner-exclusivity',
    ok: "no skill or agent but ship names a deploy target's command as something it runs (INV-0098)",
    run: scanDeployRunnerExclusivity,
    format: contractGap,
  },
  {
    id: 'ship-no-opens-pr',
    ok: 'no shipped surface pairs `/superdev:ship` with opening the pull request — submit-pr opens it, ship only merges',
    run: scanShipNoOpensPr,
    format: contractGap,
  },
  {
    id: 'derive-no-dod',
    ok: "plan's derive dispatch hands final-reviewer no Definition of Done, and derive mode reads none (INV-0158)",
    run: scanDeriveNoDod,
    format: contractGap,
  },
  {
    id: 'unmapped-paths-form',
    ok: 'no shipped document proposes a `{paths}` form to a runner that maps nothing',
    run: scanUnmappedPathsForms,
    format: contractGap,
  },
  {
    id: 'doc-setup-no-test-run',
    ok: 'neither /superdev:document nor /superdev:setup instructs a test run (INV-0175)',
    run: scanDocSetupNoTestRun,
    format: contractGap,
  },
  {
    id: 'implement-no-full-run',
    ok: "neither implement's base step, run handoff, nor either execution playbook instructs a full or whole-repo run (INV-0128)",
    run: scanImplementNoFullRun,
    format: contractGap,
  },
  {
    id: 'background-rule-names-limit',
    ok: "no shipped prose states the background rule against an unnamed Bash limit, so it names the ceiling (ADR 0232)",
    run: scanBackgroundRuleNamesLimit,
    format: contractGap,
  },
  {
    id: 'observation-no-suite-run',
    ok: "the scope review's observation concept names no suite run as a source, so a failing test in one joins the fix list (INV-0157)",
    run: scanObservationNoSuiteRun,
    format: contractGap,
  },
];
