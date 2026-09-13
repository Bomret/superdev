# superdev

A self-contained **Claude Code plugin** for the plan and implement loop. It gives you interview-driven
vertical slicing, an execution tier sized to the plan, deterministic hook guardrails, and a pluggable
slice store plus code host. A plan of more than 3 slices runs in parallel worktrees with isolated
implementer and reviewer subagents. A plan of 3 or fewer runs test-first, inline in the scope worktree.
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
.claude-plugin/
  marketplace.json     — single-plugin marketplace manifest (deliberately NO version field); its
                         `source` is `./plugin`, so an install copies only the shipped tree below
plugin/                — the SHIPPED tree: everything a user's install copies, nothing else
  .claude-plugin/
    plugin.json        — plugin manifest (name, version, author); version is the SINGLE source of truth.
                         No `hooks` field — Claude Code auto-loads the standard hooks/hooks.json.
  skills/              — the thirteen `/superdev:<name>` surfaces, one `<name>/SKILL.md` each (ADR 0050):
                         brainstorm, setup, plan, implement, review, document, ship, afk, upgrade,
                         status, backlog, publish-kb, prose-check
  agents/              — the six subagents (*.md): implementer, slice-reviewer, simplicity-reviewer,
                         final-reviewer, doc-writer, doc-reader
  hooks/               — the eight deterministic Node hooks + hooks.json: merge-guard, model-explicit,
                         green-gate, run-lock, ledger-guard, worktree-sweep, scope-prune, update-check
  references/          — backend seed templates + the non-seed runtime references (plan-contract,
                         documentation convention, controlled-prose, content-types, doc pass, run init,
                         run handoff, execution playbooks, test-selection, scope-mode, authoring
                         disciplines, design sketch, diagnosis, prototype, merge-conflicts,
                         review-checklist); its own AGENTS.md routes them
  scripts/             — the three runtime CLIs: `scope.js`, `kb-patch.js`, `adapter.js`
  LICENSE · NOTICE     — copies of the root files, so the shipped tree carries its own attribution
docs/adr/              — architecture decision records (why the plugin is built this way)
docs/agents/           — superdev's own backend config (dogfooded: this repo's slice store, code host, documentation, KB, toolchain, verification)
docs/known-issues.md   — Claude Code platform behaviour superdev works around, each entry with its
                         shipped mitigation and dated verification
scripts/               — the two maintainer-only CLIs wired into `bun run test`: `eval-run.js` and
                         `drift-check.js` with its `drift/` modules (registry, contract tables,
                         scanners, shared helpers, selftest suites)
evals/                 — cases (*/case.yaml + graders/*.md + the case's scaffold_script, a path
                         relative to the case dir — never an inline block); every case is one arm of
                         the with/without-plugin A/B — see `evals/README.md`
release.config.cjs     — semantic-release config (semantic-release-replace-plugin bumps plugin.json)
package.json           — dev-only tooling (Bun); NOT published to npm
CHANGELOG.md           — release-managed by semantic-release; do not hand-edit
CONTEXT.md             — the domain-language glossary (ubiquitous terms); maintained by /plan
README.md · RELEASING.md · NOTICE · LICENSE
```

The plugin ships as markdown and JS hooks. There is **no build step**: the marketplace's `./plugin`
source is what limits an install to the shipped tree, so releasing stays a plain commit. `skills/`,
`agents/`, and `references/` are prose. `hooks/` and the two `scripts/` dirs are executable. Paths inside
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
- **Every hook ships a `--selftest`.** Add one for any new hook. `bun run test` runs them all under
  `node`, which matches the production runtime. It then runs `claude plugin validate ./plugin` as a
  manifest-validation gate.
- **Version lives only in `plugin/.claude-plugin/plugin.json`.** Never hand-edit it. semantic-release and
  `semantic-release-replace-plugin` bump it on release. `marketplace.json` carries no version, which
  avoids a double pin where `plugin.json` would silently win.
- **Backends are pluggable.** To add a slice store, a code host, or a KB, write a new seed in
  `references/`. `/superdev:setup` turns that seed into the matching `docs/agents/*.md` in the *consumer*
  repo. `skills/` and `agents/` stay tool-agnostic. Do not hardcode a backend into them.
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
  - **A contested line gets an eval arm, not an argument.** An instruction the model already obeys by
    default is pure context load, and whether a line is such a no-op is model-relative. `bun run eval`
    settles it by running the document.
  - **Completion criteria demand.** "Every modified model accounted for" forces thorough work where
    "produce a change list" does not. Write every done-condition in the demanding form.
  - **Hiding later steps needs a real context boundary.** A subagent dispatch, or a path handed instead
    of inlined text, clears context. An inline mention does not. ADR 0020 is the applied case.
  - **Descriptions are permanent context load.** Every command and agent `description` is always loaded:
    front-load the trigger word, one trigger per branch (synonyms are one branch written twice), and cut
    identity the body already carries.
  - **A contract in an agent body also holds in the dispatch prose that reaches it.** Both halves arrive
    in one prompt, and the dispatch is the later, more specific instruction, so it wins a conflict
    ([`CONTEXT.md`](CONTEXT.md) → *Dispatch prose*, ADR 0035). Where a drift row pins a clause in
    `agents/`, pin the `skills/` sentence that dispatches it too, or write down why no dispatch can
    contradict it. A one-sided pin is a contract that reads enforced and stays green while the live path
    drifts: `FULL_SUITE_CONTRACTS` had exactly that shape, and the leak reached production prose.
- **Platform-dependent claims carry dated verification.** An ADR, or an entry in
  [`docs/known-issues.md`](docs/known-issues.md),
  states a claim about Claude Code behaviour. When you re-check that claim, record a dated update naming
  the version and the observed evidence ("Verified 2026-08-19, on Claude Code 2.1.x, output …"). A stale
  platform claim then shows its age instead of silently misleading.

## Known issues (Claude Code platform)

Platform behaviour superdev works around, with the mitigation each one ships:
[`docs/known-issues.md`](docs/known-issues.md). Two entries live there — the SessionStart preamble leak
into subagent prompts (issue #32), and the delegation handoff classifier behind a denied dispatch
(ADR 0039, ADR 0041). Read it before you change subagent prose or the unattended block.

## Common commands

```
bun install                        # install dev deps (release toolchain)
bun run test                       # hook + script selftests, drift-check, plugin manifest validation
bun run eval                       # the with/without-plugin A/B over evals/ (needs the two vars below)
bun run eval:plan                  # the four cheap plan-only cases of that A/B, both arms
GITEA_TOKEN=<token> bun run release  # cut a release from clean main (see RELEASING.md)
```

**`bun run eval` needs `CLAUDE_CODE_OAUTH_TOKEN`.** `scripts/eval-run.js` runs on a Claude
subscription instead of a metered API key (ADR 0024). A maintainer creates the token once with
`claude setup-token` and exports it. The runner refuses to start without it and never falls back to
`ANTHROPIC_API_KEY`. Details: `scripts/AGENTS.md`.

## Agent skills

### Slice store
Codeberg Issues (`bomret/superdev`). Slices as issues, feature labels, epics as scope anchors. See `docs/agents/issue-tracker.md`.

### Code host
Codeberg (Forgejo). Push scope branch, open ready PR against `main`, squash-merge with Conventional Commits title. See `docs/agents/code-management.md`.

### Documentation
`AGENTS.md` hierarchy (root + `scripts/AGENTS.md` + `plugin/references/AGENTS.md`). `controlled` writing standard, American English. See `docs/agents/documentation.md`.

### Knowledge base
Codeberg repo Wiki. Adopters first, maintainers second, English. `(aggregate)` pages: Concepts, ADR summaries. See `docs/agents/knowledge-base.md`.

### Toolchain
Bun dev toolchain, Node runtime for hooks. `bun run test` (green-gate), `bun run eval`, `bun run release`. No linter or formatter. See `docs/agents/toolchain.md`.

### Verification
`bun run test`. No focused command (suite finishes in seconds). Arms the merge green-gate. See `docs/agents/verification.md`.

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

**Two children exist.** [`scripts/AGENTS.md`](scripts/AGENTS.md) owns what the five scripts guard: the
two maintainer-only ones in `scripts/` and the three shipped ones in `plugin/scripts/`. That ownership
includes the full drift-check contract narrative.
[`plugin/references/AGENTS.md`](plugin/references/AGENTS.md) owns the reference routing table: which
reference owns which contract, and which runtime surface reads it. Every other subtree's rules live in
this root doc.
See `Structure` above for the current file inventory. Add a child only when a subtree becomes a
durable boundary with rules of its own that do not fit here.

This root owns every other subtree directly:

- `plugin/skills/`, `plugin/agents/`. Prose skill surfaces and subagents. Governed by **Working
  rules, Backends are pluggable**: stay tool-agnostic and never hardcode a backend. Behaviour contracts
  live in the files. Claude Code merges plugin skills and commands into one `/superdev:<name>` surface.
  implement → review → document → ship is the chain a scope walks, each skill printing the next
  (ADR 0013). afk drives that chain unattended, one eligible scope anchor at a time, with the Skill tool
  (ADR 0015). Three skills sit outside the chain and afk drives none of them: publish-kb sends a scope's
  staged knowledge-base pages to a remote backend on the operator's own clock (ADR 0023), backlog surveys
  the slice store read-only, grouping every open scope anchor, triage record, stranded run root, and
  untriaged item by the action it needs and judging them more loosely than afk's own selection does
  (ADR 0049), and prose-check applies `references/controlled-prose.md` to one piece of prose on demand,
  unconditionally rather than gated on a repo's own `## Writing standard` config (ADR 0057).
- `plugin/hooks/`. Claude Code hooks, the plugin's deterministic guardrails. Governed by **Working
  rules, Hooks are CommonJS** and **Every hook ships a `--selftest`**. This is the strongest future
  child-doc candidate, if its rules outgrow this root. `hooks/` is the only runtime consumer of
  `plugin/scripts/`: `scope-prune.js` and `worktree-sweep.js` both
  `require` `../scripts/scope.js` for their ledger-header reader (ADR 0022). These are the only two
  places a hook depends on a script instead of standing alone. A `require` failure leaves either hook
  with no fallback reader: it sweeps/prunes nothing and says nothing.
- `scripts/` and `plugin/scripts/`. Owned by [`scripts/AGENTS.md`](scripts/AGENTS.md):
  `plugin/scripts/scope.js` (the run-state CLI, ADR 0022: owns the ledger schema, is the only
  `ledger.md` read and write path, exports `readLedgerHeader` for `plugin/hooks/scope-prune.js` and
  `plugin/hooks/worktree-sweep.js`, and carries the one verb that touches no ledger — `base-lock`,
  which serialises the base-branch design-docs commit `/superdev:plan` and run init both make, ADR
  0058),
  `plugin/scripts/kb-patch.js` (the deterministic section merge behind a staged page's `action: patch`,
  called by `/superdev:publish-kb`, ADR 0027 — the commands invoke this and `scope.js` at runtime),
  `plugin/scripts/adapter.js` (the OpenCode harness adapter, issue #375: renders the shipped skills
  and agents into `.opencode/`, plus the OpenCode hook bridge plugin `.opencode/plugins/superdev.js`
  that forwards OpenCode's plugin events to the eight shipped hooks, issue #376; golden fixtures
  under `scripts/drift/fixtures/opencode/`. Prompts render as skills, the only surface OpenCode's
  model can invoke. `afk` alone renders as a command, which keeps that model from starting an
  unattended sweep itself, ADR 0055),
  `scripts/eval-run.js` (the eval
  runner, ADR 0024), and `scripts/drift-check.js` with `drift/` (the seventy-one cross-document contract checks: the
  CLI walks the `drift/checks.js` registry, which orders every scanner and contract table). What each
  guards, check by check, lives in that child doc.
- `plugin/references/`. Backend seed templates plus the runtime references. Owned by
  [`plugin/references/AGENTS.md`](plugin/references/AGENTS.md), which routes every reference to what it
  owns and to the runtime surface that reads it. Each reference's own opening states its full contract.
- `docs/adr/`. Architecture decision records. `docs/agents/`. This repo's own dogfooded backend config.
  `docs/known-issues.md`. The platform workarounds, governed by **Working rules, Platform-dependent
  claims carry dated verification**.
- `.claude-plugin/`. Manifests. Governed by **Working rules, Version lives only in `plugin.json`**.
- `CONTEXT.md`. The domain glossary. `evals/`. The with-plugin and without-plugin A/B, run by
  `scripts/eval-run.js` on a Claude subscription (ADR 0024), where `evals/README.md` owns its
  grader-neutrality and result-reading rules.
