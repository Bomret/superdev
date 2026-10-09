# superdev

A self-contained **Claude Code plugin** for the plan and implement loop. It gives you interview-driven
vertical slicing, an execution tier sized to the plan, deterministic hook guardrails, and a pluggable
slice store plus code host. A plan of more than 3 slices runs in parallel slicetrees with isolated
implementer and reviewer subagents. A plan of 3 or fewer runs test-first, inline in the scopetree.
No prerequisite plugins.

## Need something? Read this

| Goal | Start here |
|------|------------|
| Understand the plugin, install, updating | [`README.md`](README.md) |
| Cut a release | [`RELEASING.md`](RELEASING.md) |
| Slice schema, lifecycle and status | [`references/plan-contract.md`](plugin/references/plan-contract.md) |
| Domain language (ubiquitous terms) | [`CONTEXT.md`](CONTEXT.md) |
| Architecture decisions (why it is built this way) | [`docs/adr/`](docs/adr/) |
| In-repo documentation convention (this AGENTS.md hierarchy) | [`references/documentation.md`](plugin/references/documentation.md) |
| Writing standard for docs | [`references/controlled-prose.md`](plugin/references/controlled-prose.md) |
| What kind of information a doc owes its reader | [`references/content-types.md`](plugin/references/content-types.md) |
| Add or adjust a backend (slice store, code host, KB) | seeds in [`references/`](plugin/references/) |
| Attribution and license | [`NOTICE`](NOTICE), [`LICENSE`](LICENSE) |

## Structure

```
.claude/
  CLAUDE.md            — pulls this document into a session opened here (`@../AGENTS.md`), so the
                         working contract below is always loaded. Installing the plugin is a
                         user-scope action no tracked file can perform, so this repo ships no
                         `settings.json`; `README.md` → Install carries the operator steps, and
                         `.claude/settings.local.json` stays gitignored
.claude-plugin/
  marketplace.json     — single-plugin marketplace manifest (deliberately NO version field); its
                         `source` is a `git-subdir` entry with `path` `plugin` and `ref` `v<version>`, so
                         an install copies only the shipped tree below, as the release tag holds it
plugin/                — the SHIPPED tree: everything a user's install copies, nothing else
  .claude-plugin/
    plugin.json        — plugin manifest (name, version, author); version is the SINGLE source of truth.
                         No `hooks` field — Claude Code auto-loads the standard hooks/hooks.json.
  skills/              — the `/superdev:<name>` surfaces, one `<name>/SKILL.md` each (ADR 0102):
                         brainstorm, setup, plan, implement, review, document, submit-pr, ship, verify-ship,
                         wrap-up, upgrade, status, profile, backlog, publish-kb, prose-check, review-tests, sweep
  agents/              — the subagents (*.md): implementer, slice-reviewer, simplicity-reviewer,
                         final-reviewer, doc-writer, doc-reader, test-auditor
  hooks/               — the deterministic Node hooks + hooks.json: merge-guard, model-explicit,
                         green-gate, run-lock, ledger-guard, run-trace, slicetree-sweep, scope-prune, update-check
  references/          — backend seed templates + the non-seed runtime references (plan-contract,
                         documentation convention, controlled-prose, content-types, doc pass, run init,
                         run handoff, execution playbooks, test-selection, scope-mode, authoring
                         disciplines, design sketch, diagnosis, prototype, merge-conflicts,
                         review-checklist, dod-ticks, response-shapes); its own AGENTS.md routes them
  scripts/             — the runtime CLIs: `scope.js`, `kb-patch.js`, `publish-kb.js`, `profile.js`, and the
                         `md-to-storage.js` module `publish-kb.js` requires
  LICENSE · NOTICE     — copies of the root files, so the shipped tree carries its own attribution
tests/                 — one suite per shipped executable (the hooks, `scope.js`, `kb-patch.js`,
                         `publish-kb.js`, `profile.js`, `md-to-storage.js`) and one each for the maintainer-only
                         `invariant-check.js` and `run-tests.js`, framework-free `node:assert`, run under
                         `node` by `bun run test` (ADR 0059); `spawn-verdict.js` and `fixture-git.js`
                         are the shared helpers, not suites — `assertSpawnDecided` (INV-0009), asserted by
                         `spawn-verdict.test.js` and called from every other suite's bounded-spawn sites;
                         `fixture-git.js` appends `commit.gpgsign=false` to the `GIT_CONFIG_*` environment
docs/adr/              — architecture decision records (why the plugin is built this way)
docs/agents/           — superdev's own backend config (dogfooded: this repo's slice store, code host, documentation, KB, toolchain, verification, deployment)
docs/known-issues.md   — Claude Code platform behaviour superdev works around, each entry with its
                         shipped mitigation and dated verification
scripts/               — the maintainer-only CLIs wired into `bun run test`: `drift-check.js` with its
                         `drift/` modules (registry, contract tables, scanners, shared helpers,
                         selftest suites), `invariant-check.js`, the invariant register validator, and
                         `run-tests.js`, the suite runner `bun run test` invokes
release.config.cjs     — semantic-release config (semantic-release-replace-plugin bumps plugin.json and
                         the marketplace source's `ref`)
package.json           — dev-only tooling (Bun); NOT published to npm
CHANGELOG.md           — release-managed by semantic-release; do not hand-edit
CONTEXT.md             — the domain-language glossary (ubiquitous terms); maintained by /plan
README.md · RELEASING.md · NOTICE · LICENSE
```

The plugin ships as markdown and JS hooks. There is **no build step**: the marketplace source's `path`,
`plugin`, is what limits an install to the shipped tree, and its `ref` pins the install to the release
tag (ADR 0131), so releasing stays a plain commit. `skills/`,
`agents/`, and `references/` are prose. `hooks/` and both `scripts/` dirs are executable. Paths inside
`plugin/` resolve against the plugin root at runtime, so prose there names them without the `plugin/`
prefix; `scripts/drift/lib.js`'s `docPath()` resolves the same plugin-relative paths for the
maintainer-side checks.

This tree is layout only. What each subtree owns, which working rule governs it, and how the pieces
depend on each other is stated once, in the **Child DOX Index** at the end of this document.

## Stack

- **Bun.** The repo package manager and task runner (`bun.lock`).
- **Node.** The hooks' runtime. `hooks.json` invokes `node`, because every user's Claude Code
  environment has `node` and not every one has Bun. Bun is maintainer-only.
- **semantic-release.** Deterministic, commit-driven releases (`release.config.cjs`), published to
  **Codeberg** (Forgejo) through `@saithodev/semantic-release-gitea`.
- **Conventional Commits.** They drive the version bump. `feat` gives a minor bump, `fix` and `perf`
  give a patch bump. **Pre-1.0 policy:** `!` or `BREAKING CHANGE` also gives a **minor** bump (a
  `releaseRules` entry in `release.config.cjs`). superdev stays below 1.0.0 until it has proven itself
  in real use, and removing that rule is what opens the first deliberate 1.0.0.

## Working rules (repo-specific: read before you edit hooks, the version, or the release config)

- **Hooks are CommonJS** (`.js`, `require`). `plugin/package.json` is the anchor: it carries
  `"type": "commonjs"` and ships with the plugin, so Node never walks past the install directory to
  whatever `package.json` an ancestor of the user's plugin cache happens to carry. A `"type": "module"`
  found there treats every hook as ESM and breaks them all in production. Do **not** change that
  field, and do not add `"type": "module"` to the root `package.json` either. Only `.mjs` is ESM,
  because that is scoped by extension.
- **Every shipped executable has a suite in `tests/`, named for it.** Add one for any new hook or
  script. `bun run test` runs `scripts/run-tests.js`, which runs every `tests/*.test.js` suite under
  `node`, which matches the production runtime. No roster needs an edit when a suite is added. It then runs `invariant-check.js` against this repository's own register, `drift-check`'s own
  `--selftest`, `drift-check` itself, and `claude plugin validate ./plugin` as a manifest-validation
  gate. A suite that commits in a fixture repository sets `commit.gpgsign=false` for every git child
  by requiring `tests/fixture-git.js` at its top (it appends to `GIT_CONFIG_COUNT`), so a maintainer's global signing setup never fails a fixture
  commit.
- **A duration assertion is legitimate only against a same-run baseline, or a qualitative ceiling.**
  A process that did not finish carries no verdict (INV-0009): never bracket a bounded `spawnSync`
  with `Date.now()` and assert an absolute elapsed ceiling, because wall clock includes every
  millisecond the process spent descheduled, and a correctly bounded call under scheduler starvation
  produces the same reading as a real defect (ADR 0086). Compare against what the same run itself
  measured instead, or against the bound the test itself configured (`tests/publish-kb.test.js`'s `HANG_MS`, ten times
  the slowest healthy backend spawn that run timed, and the checks relative to it). A bound that a healthy
  command must also clear is itself taken from the same run, never fixed. Where the failure
  the assertion catches is qualitative — catastrophic backtracking is effectively unbounded — a loose
  ceiling still falsifies exactly what a tight one did, so keep the ceiling and loosen it rather than
  drop it (`tests/green-gate.test.js` and `tests/merge-guard.test.js`'s `LONG_VALUE_OPT` guards).
- **Version lives only in `plugin/.claude-plugin/plugin.json`.** Never hand-edit it. semantic-release and
  `semantic-release-replace-plugin` bump it on release. `marketplace.json` carries no version, which
  avoids a double pin where `plugin.json` would silently win. Its source's `ref` names the release tag,
  `v` followed by that version, and the same release step rewrites it (ADR 0131). Never hand-edit it
  either.
- **Claude Code is superdev's only harness** (ADR 0102). Skills, agents, and references name Claude
  Code's features, tools, and frontmatter directly. Prose is not written harness-neutral for
  portability.
- **Backends are pluggable.** This covers the slice store, the code host, and the knowledge base, and
  nothing else. To add one of them, write a new seed in `references/`. `/superdev:setup` turns that seed
  into the matching `docs/agents/*.md` in the *consumer* repo, and a later re-run offers the seed's newer
  sections and rules to that document as seed gaps (ADR 0107). `skills/` and `agents/` stay
  backend-agnostic. Do not hardcode a backend into them.
- **Docs follow a writing standard.** `docs/agents/documentation.md` names it, and the doc agents apply
  it to prose they write. This repo uses `controlled`
  ([`references/controlled-prose.md`](plugin/references/controlled-prose.md), ADR 0012). Its own
  `## Scope` section states where it applies: the `AGENTS.md` tree, `README.md`, ADR text, glossary
  entries, knowledge-base pages, and report text. Prompt prose is outside it, and has its own rules
  below.
- **Prompt prose follows the prompt-architecture rules.** They govern `skills/`, `agents/`, and
  `references/` prose:
  - **Prompt the positive.** Steering by prohibition drags the forbidden behaviour into context and makes
    it more available. Phrase the wanted behaviour, and reserve `never` for real contracts.
  - **Completion criteria demand.** "Every modified model accounted for" forces thorough work where
    "produce a change list" does not. Write every done-condition in the demanding form.
  - **Hiding later steps needs a real context boundary.** A subagent dispatch, or a path handed instead
    of inlined text, clears context. An inline mention does not. ADR 0020 is the applied case.
  - **Descriptions are permanent context load.** Every agent `description`, and every skill `description`
    within the skill listing's budget, is always loaded: front-load the trigger word, one trigger per
    branch (synonyms are one branch written twice), and cut identity the body already carries. A skill
    carrying `disable-model-invocation: true` is the exception: its description stays out of the model's
    context and is read only by a human browsing the slash commands
    ([skills docs](https://code.claude.com/docs/en/skills.md), checked 2026-10-08).
  - **A step that starts another skill names the Skill tool.** Write "call the Skill tool with
    `superdev:setup`", never a bare "run `/superdev:setup`", and name one skill per call. Upstream
    mattpocock/skills adopted this because a skill named in prose loads less reliably (its CHANGELOG, PR
    #878); superdev has not measured that gain (ADR 0071). A step whose target carries
    `disable-model-invocation: true` cannot reach it through the tool, so it tells the operator what to run
    instead, and so does every line written for the operator, such as the Next block.
  - **A contract in an agent body also holds in the dispatch prose that reaches it.** Both halves arrive
    in one prompt, and the dispatch is the later, more specific instruction, so it wins a conflict
    ([`CONTEXT.md`](CONTEXT.md) → *Dispatch prose*, ADR 0035). Where a drift row pins a clause in
    `agents/`, pin the `skills/` sentence that dispatches it too, or write down why no dispatch can
    contradict it. A one-sided pin is a contract that reads enforced and stays green while the live path
    drifts: `FULL_SUITE_CONTRACTS` had exactly that shape, and the leak reached production prose.
  - **Prose states no count of a growing set.** "The eight shipped hooks" reads as a fact and is a
    hostage: adding a hook makes it false in every document repeating it, and nothing fails. Name the
    set, or name its members, and keep a numeral only where the number is the fact — a cap, a
    threshold, or a fixed arity (ADR 0064). A drift contract table's row count is a growing-set count,
    not a fixed arity: a table grows every time a slice pins another clause, so its row count is never
    the fact itself.
- **Platform-dependent claims carry dated verification.** An ADR, or an entry in
  [`docs/known-issues.md`](docs/known-issues.md),
  states a claim about Claude Code behaviour. When you re-check that claim, record a dated update naming
  the version and the observed evidence ("Verified 2026-08-19, on Claude Code 2.1.x, output …"). A stale
  platform claim then shows its age instead of silently misleading.

## Known issues (Claude Code platform)

Platform behaviour superdev works around, with the mitigation each one ships:
[`docs/known-issues.md`](docs/known-issues.md). It covers the SessionStart preamble leak
into subagent prompts (issue #32), and the delegation handoff classifier behind a denied dispatch
(ADR 0039, ADR 0041). Read it before you change subagent prose or the unattended block.

## Common commands

```
bun install                        # install dev deps (release toolchain)
bun run test                       # tests/ suites, drift-check, plugin manifest validation
GITEA_TOKEN=<token> bun run release  # cut a release from clean main (see RELEASING.md)
```

superdev carries no A/B harness measuring it against a no-plugin baseline (ADR 0129). `tests/` and
`drift-check` check that the plugin does what its prose says, never that saying it helps.

## Agent skills

### Slice store
Codeberg Issues (`bomret/superdev`). Slices as issues, feature labels, epics as scope anchors. See `docs/agents/issue-tracker.md`.

### Code host
Codeberg (Forgejo). Push scope branch, open ready PR against `main`, squash-merge with Conventional Commits title. See `docs/agents/code-management.md`.

### Documentation
`AGENTS.md` hierarchy (root + `scripts/AGENTS.md` + `plugin/references/AGENTS.md`). `controlled` writing standard, American English. See `docs/agents/documentation.md`.

### Knowledge base
Codeberg repo Wiki. Adopters first, maintainers second, English. `(aggregate)` page: Concepts. See `docs/agents/knowledge-base.md`.

### Toolchain
Bun dev toolchain, Node runtime for hooks. `bun run test` (green-gate), `bun run release`. No linter or formatter. See `docs/agents/toolchain.md`.

### Verification
`bun run test` in the first fence (the full command, about 2 minutes), `node scripts/run-tests.js --related {paths}`
in the second (the focused command, about 8 s for a change set whose `.md` paths no suite names). Arms the merge green-gate. See `docs/agents/verification.md`.

### Deployment
`none`. A release (`bun run release`) is repository-wide and batches every merged feature, so it is no
feature's deploy target. See `docs/agents/deployment.md`.

# DOX framework

- AGENTS.md files are binding work contracts for their subtrees. Before editing, read this root doc
  plus every AGENTS.md on the path to each file you touch, in the current session. The nearest doc
  controls local detail. No child doc may weaken a parent.
- After every meaningful change, do a DOX pass. Update the closest owning AGENTS.md when purpose,
  ownership, durable structure, contracts, workflows, constraints, or user preferences changed. Update
  every affected parent, child, and Child DOX Index too. Delete stale or contradictory text immediately.
  A change that alters no behavior and no contract may leave the docs unchanged, but the pass still
  happens.
- Create a child AGENTS.md only when a folder becomes a durable boundary with rules of its own. Section
  order: Purpose, Ownership, Local Contracts, Work Guidance, Verification, Child DOX Index. Broad rules
  live in parents, concrete detail in children. Keep both concise, current, and operational, with no
  duplicated rules and no history.
- When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md.

## Child DOX Index

**The children of this root.** [`scripts/AGENTS.md`](scripts/AGENTS.md) owns what the scripts guard: the
maintainer-only ones in `scripts/` and the shipped ones in `plugin/scripts/`. That ownership
includes the full drift-check contract narrative.
[`plugin/references/AGENTS.md`](plugin/references/AGENTS.md) owns the reference routing table: which
reference owns which contract, and which runtime surface reads it. Every other subtree's rules live in
this root doc.
See `Structure` above for the current file inventory. Add a child only when a subtree becomes a
durable boundary with rules of its own that do not fit here.

This root owns every other subtree directly:

- `plugin/skills/`, `plugin/agents/`. Prose skill surfaces and subagents. Governed by **Working
  rules, Backends are pluggable**: stay backend-agnostic and never hardcode a backend. Behaviour contracts
  live in the files. Claude Code merges plugin skills and commands into one `/superdev:<name>` surface.
  implement → review → document → submit-pr is the chain a scope walks, each skill printing the next
  (ADR 0013). Every command listed in `references/response-shapes.md`'s Next block section closes its last
  message with that block (ADR 0113). `/superdev:ship` is a separate, human-only command: it merges the pull request submit-pr
  opened, deploys the merge under the repository's deploy posture (`none`/`manual`/`auto`,
  `docs/agents/deployment.md`, ADR 0101), and stops there (ADR 0106). It names `/superdev:verify-ship` next
  while a criterion is left to verify, and `/superdev:wrap-up` otherwise (ADR 0116). `/superdev:verify-ship`
  settles the criteria only a deployed system can show, and `/superdev:wrap-up` closes the scope anchor and takes
  the run down. Both are human-only too. A criterion verify-ship observes false routes to `/superdev:plan`'s
  repair choice, which plans a `fix` feature on its own anchor, linked to the original by a `**Repairs:**`
  line (ADR 0124).
  Whoever invokes a chain command passes `--unattended` to run it unattended (ADR 0016, ADR 0108);
  superdev ships no driver. Some skills sit outside the chain: publish-kb sends a scope's
  staged knowledge-base pages to a remote backend on the operator's own clock (ADR 0023), backlog surveys
  the slice store read-only, grouping every open scope anchor, triage record, stranded run root, and
  untriaged item by the action it needs and resolving an ambiguity toward showing the row
  (ADR 0049), prose-check applies `references/controlled-prose.md` to one piece of prose on demand,
  unconditionally rather than gated on a repo's own `## Writing standard` config (ADR 0057),
  review-tests audits what a test suite costs, sweeping the whole test tree in one `test-auditor`
  dispatch, measuring it through the repo's optional timing command, and handing the findings the
  operator keeps to `/superdev:plan` as an intent (ADR 0066), profile reports where a scope run's
  wall-clock time went, read from Claude Code's own session transcripts (ADR 0103), and sweep chains `/superdev:review`,
  `/superdev:document audit`, `/superdev:review-tests`, and `/superdev:setup check` over a whole
  repository into one merged, ranked report and a single plan-ready intent, every leg dispatched
  read-only in the chained posture (ADR 0068).
- `plugin/hooks/`. Claude Code hooks, the plugin's deterministic guardrails. Governed by **Working
  rules, Hooks are CommonJS** and **Every shipped executable has a suite in `tests/`, named for it**.
  This is the strongest future child-doc candidate, if its rules outgrow this root. Of the
  hooks, `scope-prune.js`, `slicetree-sweep.js`, `run-trace.js`, and `green-gate.js` depend on `plugin/scripts/`
  (`green-gate.js` requires `scope.js` for `appendTrace` and `run-trace.js` for `locate` and `treeState`, so
  its run line attributes like the trace's own, ADR 0127), and the scripts
  `publish-kb.js` and `profile.js` require `scope.js` as well. `scope-prune.js` and `slicetree-sweep.js` both
  `require` `../scripts/scope.js` for their ledger-header reader (ADR 0022), `run-trace.js` requires it for
  the trace writer and reader and the ledger row readers (ADR 0117), and `scope-prune.js`
  takes the containment probe `baseHistoryHasPatch` off that same call (ADR 0082). `slicetree-sweep.js`
  tests a worked slice branch's tip against its scope branch's first-parent chain, alongside the
  default-branch content check (ADR 0089). These are the only
  places a hook depends on a script instead of standing alone. A `require` failure leaves the hook
  with no fallback reader: it sweeps, prunes, or records nothing and says nothing. The probe has its own, narrower
  fallback — `scope-prune.js` prunes by tree comparison alone, still silently.
- `scripts/` and `plugin/scripts/`. Owned by [`scripts/AGENTS.md`](scripts/AGENTS.md):
  `plugin/scripts/scope.js` (the run-state CLI, ADR 0022: owns the ledger schema, is the only
  `ledger.md` read and write path, exports `readLedgerHeader` for `plugin/hooks/scope-prune.js` and
  `plugin/hooks/slicetree-sweep.js`, exports the trace writer `appendTrace`, the trace reader `readTrace`,
  the field decoder `untraceField`, the ledger row readers `inProgressSlices` and `sliceType`, the verification-command reader
  `verificationCommands`, the test-path classifier `isTestPath` (ADR 0128), the scope-slug pattern `SLUG_RE`, and the main-checkout resolver `mainWorkTree`, for `plugin/hooks/run-trace.js` (ADR 0117), exports the containment test `testContainment` and its second-tier
  probe `baseHistoryHasPatch` for `plugin/scripts/publish-kb.js` and `plugin/hooks/scope-prune.js`
  (ADR 0053, ADR 0065, ADR 0082), exports `mainWorkTree`, `CHANGE_TYPES`, and `refResolves` for `publish-kb.js` (`SLUG_RE` too, and `mainWorkTree` and `CHANGE_TYPES` for `profile.js`), and carries verbs that touch no ledger: `root <slug>`,
  which resolves a run root's absolute path against the repository's main working tree from any cwd
  (ADR 0080). The verb `staging <scope>` resolves a scope's staging directory the same way (ADR 0119), and `collisions` finds a numbering collision between a scope branch and the base by number (ADR 0126).
  The verb `test` runs a test command and records its own exit status as an Observed run, requiring
  `plugin/hooks/run-trace.js` at call time (ADR 0127).
  It also writes the `planned` stage on `init`, which `/superdev:implement`'s run init moves
  forward out of, ADR 0079),
  `plugin/scripts/kb-patch.js` (the deterministic section merge behind a staged page's `action: patch`,
  called by `/superdev:publish-kb`, ADR 0027 — the commands invoke this and `scope.js` at runtime),
  `plugin/scripts/publish-kb.js` (the backend-independent half of publishing a scope's staged
  knowledge-base pages, ADR 0069: resolves the five-verb backend command contract from
  `docs/agents/knowledge-base.md` by heading name, carries `action: upsert`, `action: delete`, and
  `action: patch` end to end — `patch` merging through `kb-patch.js`'s `merge()` — delegates the
  containment check to `scope.js`'s `testContainment`, runs every backend command under a time bound
  whose exhaustion stops the batch (ADR 0130), converts a `storage` backend's body through
  `plugin/scripts/md-to-storage.js` and resolves a staged page's `parent:` (ADR 0109), and is the invocation
  `skills/publish-kb/SKILL.md` runs),
  `plugin/scripts/profile.js` (the run profile, ADR 0103: reads Claude Code's session and subagent
  transcripts, writes nothing to them, and is the invocation `skills/profile/SKILL.md` runs),
  and `scripts/drift-check.js` with `drift/` (the cross-document contract checks: the
  CLI walks the `drift/checks.js` registry, keyed by check id (ADR 0061), which orders every scanner and
  contract table). What each guards, check by check, lives in that child doc.
  `scripts/invariant-check.js` is the maintainer-only register validator (ADR 0093): it checks a
  repository's `docs/invariants.md` against the register's format rules and resolves each entry's
  `Concepts`, `Paths`, `Symbols` and `Check:` paths. It also checks that every `INV-NNNN` cited outside
  the register, the changelog, and `docs/adr/` names an entry. It selects no entry (INV-0088), and
  nothing under `plugin/` requires it (INV-0051).
- `plugin/references/`. Backend seed templates plus the runtime references. Owned by
  [`plugin/references/AGENTS.md`](plugin/references/AGENTS.md), which routes every reference to what it
  owns and to the runtime surface that reads it. Each reference's own opening states its full contract.
- `docs/adr/`. Architecture decision records. `docs/agents/`. This repo's own dogfooded backend config.
  `docs/known-issues.md`. The platform workarounds, governed by **Working rules, Platform-dependent
  claims carry dated verification**.
- `.claude-plugin/`. Manifests. Governed by **Working rules, Version lives only in `plugin.json`**.
- `.claude/`. `CLAUDE.md` pulls this document into a session opened here. Installing the plugin is a
  **user-scope** action, so no tracked file in this repo can do it. Claude Code declines a network
  marketplace declared at project scope, which keeps a clone from enabling a plugin nobody asked for.
  Dogfooding is therefore an operator step, and [`README.md`](README.md) → *Install* carries it. Run it
  against the **git URL of this repo**. The marketplace source pins the release tag (ADR 0131), so the
  install runs the latest release, the artifact an adopter installs. A checkout loaded with
  `claude --plugin-dir ./plugin` runs its working tree instead, so a half-edited guardrail hook fires on
  the very run editing it. Personal overrides belong in the gitignored `.claude/settings.local.json`.
- `CONTEXT.md`. The domain glossary.
