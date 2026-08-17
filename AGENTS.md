# superdev

A self-contained **Claude Code plugin** for the plan and implement loop. It gives you interview-driven
vertical slicing, an execution tier sized to the plan, deterministic hook guardrails, and a pluggable
slice store plus code host. A plan of more than 3 slices runs in parallel worktrees with isolated
implementer and reviewer subagents. A plan of 3 or fewer runs test-first and inline. No prerequisite
plugins.

## Need something? Read this

| Goal | Start here |
|------|------------|
| Understand the plugin, install, updating | [`README.md`](README.md) |
| Cut a release | [`RELEASING.md`](RELEASING.md) |
| Slice schema, lifecycle and status | [`references/plan-contract.md`](references/plan-contract.md) |
| Domain language (ubiquitous terms) | [`CONTEXT.md`](CONTEXT.md) |
| Architecture decisions (why it is built this way) | [`docs/adr/`](docs/adr/) |
| In-repo documentation convention (this AGENTS.md hierarchy) | [`references/documentation.md`](references/documentation.md) |
| Writing standard for docs | [`references/controlled-prose.md`](references/controlled-prose.md) |
| What kind of information a doc owes its reader | [`references/content-types.md`](references/content-types.md) |
| Add or adjust a backend (slice store, code host, KB, verification) | seeds in [`references/`](references/) |
| Attribution and license | [`NOTICE`](NOTICE), [`LICENSE`](LICENSE) |

## Structure

```
.claude-plugin/
  plugin.json          — plugin manifest (name, version, author); version is the SINGLE source of truth.
                         No `hooks` field — Claude Code auto-loads the standard hooks/hooks.json.
  marketplace.json     — single-plugin marketplace manifest (deliberately NO version field)
commands/              — slash commands (*.md): brainstorm, setup, plan, implement, review, document,
                         ship, afk, upgrade, status, publish-kb. implement → review → document → ship is
                         the chain a scope walks, each command printing the next (ADR 0013). afk drives
                         that chain unattended, one eligible scope anchor at a time, with the Skill tool
                         (ADR 0015). publish-kb sits outside the chain: it sends a scope's staged
                         knowledge-base pages to a remote backend, on the operator's own clock, and afk
                         never drives it (ADR 0023)
agents/                — subagents (*.md): implementer, slice-reviewer, simplicity-reviewer, final-reviewer,
                         doc-writer, doc-reader
hooks/                 — deterministic Node hooks + hooks.json: merge-guard, model-explicit, green-gate,
                         run-lock, ledger-guard, worktree-sweep, scope-prune, update-check
references/            — backend seed templates + the non-seed runtime references (plan-contract,
                         documentation convention, controlled-prose, content-types, execution
                         playbooks, test-selection, scope-mode, authoring disciplines,
                         review-checklist). Who reads what: the `references/` entry of the Child
                         DOX Index below.
docs/adr/              — architecture decision records (why the plugin is built this way)
docs/agents/           — superdev's own backend config (dogfooded: this repo's slice store, code host, documentation, KB, toolchain, verification)
scripts/               — standalone deterministic code wired into `bun run test`: `scope.js` (the
                         run-state CLI, ADR 0022), `kb-patch.js` (the knowledge-base section merge,
                         ADR 0027), `eval-run.js` (the eval runner, ADR 0024), and `drift-check.js`.
                         What each one owns and guards is enumerated once, in `scripts/AGENTS.md`.
evals/                 — cases (*/case.yaml + graders/*.md + the case's scaffold_script, a path
                         relative to the case dir — never an inline block); every case is one arm of
                         the with/without-plugin A/B, run by `scripts/eval-run.js` on a Claude
                         subscription (ADR 0024) — see `evals/README.md`
release.config.cjs     — semantic-release config (semantic-release-replace-plugin bumps plugin.json)
package.json           — dev-only tooling (Bun); NOT published to npm
CHANGELOG.md           — release-managed by semantic-release; do not hand-edit
CONTEXT.md             — the domain-language glossary (ubiquitous terms); maintained by /plan
README.md · RELEASING.md · NOTICE · LICENSE
```

The plugin ships as markdown and JS hooks. There is **no build step**. `commands/`, `agents/`, and
`references/` are prose. `hooks/` and `scripts/` are executable: `hooks/` holds Claude Code hooks, and
`scripts/` holds standalone checks like `drift-check.js`, which `package.json` runs. `hooks/` is also a
runtime consumer of `scripts/`: `hooks/scope-prune.js` `require`s `scripts/scope.js` for its shared
ledger-header reader (ADR 0022). This is the one dependency `hooks/` has on `scripts/`. Every other hook stays
standalone.

## Stack

- **Bun.** The repo package manager and task runner (`bun.lock`).
- **Node.** The hooks' runtime. `hooks.json` invokes `node`, because every user's Claude Code
  environment has `node` and not every one has Bun. Bun is maintainer-only.
- **semantic-release.** Deterministic, commit-driven releases (`release.config.cjs`), published to
  **Codeberg** (Forgejo) through `@saithodev/semantic-release-gitea`.
- **Conventional Commits.** They drive the version bump. `feat` gives a minor bump, `fix` and `perf`
  give a patch bump. **Pre-1.0 policy:** `!` or `BREAKING CHANGE` also gives a **minor** bump (a
  `releaseRules` entry in `release.config.cjs`) — superdev stays below 1.0.0 until it has proven itself
  in real use, and removing that rule is what opens the first deliberate 1.0.0.

## Working rules (repo-specific: read before you edit hooks, the version, or the release config)

- **Hooks are CommonJS** (`.js`, `require`). Do **not** add `"type": "module"` to `package.json`. Node
  resolves the plugin's `package.json` when it runs a hook, and would then treat every hook as ESM,
  which breaks them in production. Only `.mjs` is ESM, because that is scoped by extension.
- **Every hook ships a `--selftest`.** Add one for any new hook. `bun run test` runs them all under
  `node`, which matches the production runtime. It then runs `claude plugin validate .` as a
  manifest-validation gate.
- **Version lives only in `.claude-plugin/plugin.json`.** Never hand-edit it. semantic-release and
  `semantic-release-replace-plugin` bump it on release. `marketplace.json` carries no version, which
  avoids a double pin where `plugin.json` would silently win.
- **Backends are pluggable.** To add a slice store, a code host, or a KB, write a new seed in
  `references/`. `/superdev:setup` turns that seed into the matching `docs/agents/*.md` in the *consumer*
  repo. `commands/` and `agents/` stay tool-agnostic. Do not hardcode a backend into them.
- **Docs follow a writing standard.** `docs/agents/documentation.md` names it, and the doc agents apply
  it to prose they write. This repo uses `controlled`
  ([`references/controlled-prose.md`](references/controlled-prose.md), ADR 0012).

## Known issues (Claude Code platform)

**SessionStart system-prompt preambles leak into subagent tool outputs** (tracked as issue #32). When a
subagent is dispatched, the Claude Code harness includes the main conversation's SessionStart
system-message in the subagent's prompt context. Examples are context-window protection and
tool-bootstrap guidance. This creates a prompt-injection surface, in two ways:

- Subagents receive meta-instructions they did not ask for.
- Tool-call outputs may arrive wrapped in system-prompt tags instead of staying opaque.

**Mitigation (implemented):** every subagent body carries explicit secret-hygiene discipline. Each agent
identifies and disregards any injected system-reminder block, and uses only the standard tools it was
given (`Read`, `Edit`, `Write`, `Bash`, and the rest). See `agents/implementer.md` for the pattern.

**Fix required at:** the Claude Code platform layer. Subagent prompts need isolation from the main
conversation's SessionStart preamble. Track this upstream with the Claude Code team.

## Common commands

```
bun install                        # install dev deps (release toolchain)
bun run test                       # hook selftests + plugin manifest validation
bun run eval                       # the with/without-plugin A/B over evals/ (needs the two vars below)
bun run eval:plan                  # the two cheap plan-only arms of that A/B
GITEA_TOKEN=<token> bun run release  # cut a release from clean main (see RELEASING.md)
```

**`bun run eval` needs `CLAUDE_CODE_OAUTH_TOKEN`.** `scripts/eval-run.js` runs on a Claude
subscription instead of a metered API key (ADR 0024). A maintainer creates the token once with
`claude setup-token` and exports it. The runner refuses to start without it and never falls back to
`ANTHROPIC_API_KEY`. Details: `scripts/AGENTS.md`.

# DOX framework

- DOX is a highly performant AGENTS.md hierarchy, installed here
- The agent must follow DOX instructions across any edit

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or the child index changes. Update
child docs when a parent change alters local rules. Remove stale or contradictory text immediately. A
small edit that changes no behavior and no contract may leave the docs unchanged, but the DOX pass still
must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions. If there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check. If no verification framework exists yet, leave it empty and update it when one exists

Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## User Preferences

When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md

## Child DOX Index

**One child exists: [`scripts/AGENTS.md`](scripts/AGENTS.md).** It owns what the four scripts guard,
including the full drift-check contract narrative. Every other subtree's rules live in this root doc.
See `Structure` above for the current file inventory. Add a child only when a subtree becomes a
durable boundary with rules of its own that do not fit here.

This root owns every other subtree directly:

- `commands/`, `agents/`. Prose slash-commands and subagents. Governed by **Working rules, Backends are
  pluggable**: stay tool-agnostic and never hardcode a backend. Behaviour contracts live in the files.
- `hooks/`. Claude Code hooks, the plugin's deterministic guardrails. Governed by **Working rules, Hooks
  are CommonJS** and **Every hook ships a `--selftest`**. This is the strongest future child-doc
  candidate, if its rules outgrow this root. `scope-prune.js` `require`s `scripts/scope.js` for its
  ledger-header reader (ADR 0022). This is the only place a hook depends on a script instead of standing alone.
  A `require` failure leaves the hook with no fallback reader: it prunes nothing and says nothing.
- `scripts/`. Owned by [`scripts/AGENTS.md`](scripts/AGENTS.md): `scope.js` (the run-state CLI, ADR
  0022 — owns the ledger schema, is the only `ledger.md` read and write path, and exports
  `readLedgerHeader` for `hooks/scope-prune.js`), `kb-patch.js` (the deterministic section merge behind a
  staged page's `action: patch`, called by `/superdev:publish-kb`, ADR 0027), `eval-run.js` (the eval
  runner, ADR 0024), and `drift-check.js` (the thirty-eight cross-document contract checks). What each guards,
  check by check, lives in that child doc.
- `references/`. Backend seed templates plus the non-seed references below.
  + `plan-contract.md`: the slice schema and lifecycle, including the optional epic sections, the
    epic-visuals gate for `## Slice graph` and `## Touch map`, and the `## Scope anchor` section — the
    generic contract (a feature's root; a single-slice plan's anchor is its own lone slice) that each
    store document (`issue-tracker-*.md`, `docs/agents/issue-tracker.md`) specialises for its own backend
    (ADR 0017). Its `## Feature label` section is the same shape one level over: the generic contract (a
    change type plus a slug, picked by `/plan`) that each store document renders in its own notation
    (ADR 0019, ADR 0021). Its `## Append mode` section holds the five invariants that let `/plan` extend
    a feature that already has slices — merged slices are immutable, ids are never reused or renumbered,
    the global DoD is amended in place, extending a single-slice feature creates the epic first, and
    append refuses while a run is active — with numbering continuation named as the local-file store's
    own rule alone (ADR 0004).
  + `documentation.md`: the in-repo documentation convention, including the two sections
    `/superdev:setup` fills in — `## Writing standard`, always, and `## Audit set`, only when the repo has
    documentation outside the tree `/superdev:document audit` reads on its own.
  + `controlled-prose.md`: the **writing standard**. A language-neutral rule set that merges the
    ASD-STE100 Part 1 rules with the rules the tekom catalogue and the *Handbook of Technical Writing*
    reach that ASD-STE100 does not. Read at runtime by `doc-writer`, which applies it, and by
    `doc-reader`, which verifies it (ADR 0012).
  + `content-types.md`: the **content-type lens**. The four kinds of information a doc carries, and the
    test for reporting an absent conceptual layer. Read at runtime by `doc-writer`, which applies it in
    both its passes, and by `doc-reader`, which checks it in Pass 1. Unlike the writing standard it is
    never configurable and never `none`, because coverage is a completeness property and not a style
    one (ADR 0014).
  + **Execution playbooks** (`implement-full.md`, `implement-lite.md`): the tier-specific linear
    procedures `/implement` reads at runtime once it computes the tier.
  + `test-selection.md`: the rule that picks the full test command over the focused one (ADR 0025) —
    single-sourced here and read at runtime by two kinds of caller. The **focused** callers run the command
    it selects for each loop increment: `agents/implementer.md`, `agents/slice-reviewer.md`, and
    `references/implement-lite.md`. The **full-suite** callers read it for the full command instead:
    `commands/review.md`'s scope review, and `commands/implement.md`'s Final phase, which runs that suite in
    place of the review an all-`mechanical`/`docs` scope skips. `hooks/green-gate.js` implements the same
    rule in code rather than reading it.
  + `scope-mode.md`: the rule `/superdev:review`, `/superdev:document`, and `/superdev:ship` share (ADR
    0013) — what makes a range a live scope run, how to find the scope checkout on disk for both tiers, and
    the run-lock refresh-not-create rule. Each of the three reads it at runtime and keeps only what is
    specific to it. Its `## Unattended` section defines the `--unattended` token (ADR 0016). It is the
    argument that lets `/superdev:afk` drive a command with no standing answer written at a stop
    blocking instead of asking. `/superdev:implement` and both execution playbooks read that section
    too. Its `## The scope slug` rule states the charset a feature label's slug, or any other external
    source, must match. The check runs before that slug becomes a branch segment or a run-root path
    segment.
    `/superdev:implement` and `/superdev:afk` both read it. Its `## The change type` section owns the
    Conventional Commits type set a scope branch leads with (`<type>/<slug>`, the feature label verbatim)
    and names `/plan` as the command that picks one (ADR 0021). `hooks/scope-prune.js` matches that set
    only on its pre-CLI fallback path. A scope is finished with once its branch is merged or gone
    (ADR 0007), and the ledger's `**Branch:**` line is what the hook checks first. Its `## Degraded passes`
    section (ADR 0018)
    defines the pass a run did not get — a dispatch the permission classifier denied, or one that could
    not reach what it needed — what a command does about one attended and unattended, and the
    `**Degraded:**` ledger entry that carries it to `/superdev:ship`'s pull-request body and
    `/superdev:status`'s report. Its `## Unresolved defects` section (ADR 0026) defines the defect a run
    finds and leaves standing, distinct from a degraded pass. The `**Unresolved:**` ledger entry carries
    it to `/superdev:ship`'s pull-request body and `/superdev:status`'s report the same way. Its `## The
    ledger` section defers the ledger's schema to `scripts/scope.js` (ADR 0022), which
    owns it and is the only read and write path — including the `**Anchor:**` line
    `/superdev:implement` hands to `init` and `/superdev:review` reads back (`get anchor`) for the
    PR-facing title.
  + **Authoring disciplines** (`cross-exam.md`, `domain-modeling.md`, `doc-verification.md`): the
    relentless cross-examination, active-domain-modeling, and verify-against-official-docs disciplines
    that `/plan` and `/brainstorm` read at runtime. They are superdev's own rendering of Matt Pocock's
    grilling and domain-modeling skills. The `implementer` agent also reads `doc-verification.md` before
    it acts on an assumption about a third-party library, API, or service.
  + `review-checklist.md`: named anti-patterns, vulnerability classes, a reuse-audit lens, and a
    consistency lens. `final-reviewer` reads all four and `slice-reviewer` reads the anti-patterns and
    vulnerability classes.
- `docs/adr/`. Architecture decision records. `docs/agents/`. This repo's own dogfooded backend config.
- `.claude-plugin/`. Manifests. Governed by **Working rules, Version lives only in `plugin.json`**.
- `CONTEXT.md`. The domain glossary. `evals/`. The with/without-plugin A/B, where `evals/README.md` owns
  its grader-neutrality and result-reading rules.
