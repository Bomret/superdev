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
                         ship, upgrade, status. implement → review → document → ship is the chain a scope
                         walks, each command printing the next (ADR 0013)
agents/                — subagents (*.md): implementer, slice-reviewer, simplicity-reviewer, final-reviewer,
                         doc-writer, doc-reader
hooks/                 — deterministic Node hooks + hooks.json: merge-guard, model-explicit, green-gate,
                         run-lock, worktree-sweep, scope-prune, update-check
references/            — backend seed templates + plan-contract (slice schema/lifecycle, incl. the
                         optional epic sections: parked questions, non-goals, and the epic-visuals gate
                         for `## Slice graph`/`## Touch map`) + documentation convention +
                         controlled-prose (the writing standard) + content-types (the four kinds of
                         information a doc carries) — both read at runtime by the doc agents +
                         execution playbooks (implement-full/lite, read at runtime by /implement) +
                         scope-mode (the rule /review, /document, and /ship share, read at runtime by
                         each) +
                         authoring disciplines (cross-examination, domain-modeling, doc-verification;
                         read at runtime by /plan + /brainstorm, doc-verification also by implementer) +
                         review-checklist (anti-patterns, vuln-classes, reuse-audit, consistency; read at
                         runtime by final-reviewer + slice-reviewer)
docs/adr/              — architecture decision records (why the plugin is built this way)
docs/agents/           — superdev's own backend config (dogfooded: this repo's slice store, code host, documentation, KB, toolchain, verification)
scripts/               — standalone deterministic checks wired into `bun run test` (e.g.
                         `drift-check.js`). What each one guards is enumerated once, in the `scripts/`
                         entry of the Child DOX Index below.
evals/                 — `claude plugin eval` cases (*/case.yaml + graders/*.md + the case's
                         scaffold_script, a path relative to the case dir — never an inline block);
                         every case is one arm of the with/without-plugin A/B — see `evals/README.md`
release.config.cjs     — semantic-release config (semantic-release-replace-plugin bumps plugin.json)
package.json           — dev-only tooling (Bun); NOT published to npm
CHANGELOG.md           — release-managed by semantic-release; do not hand-edit
CONTEXT.md             — the domain-language glossary (ubiquitous terms); maintained by /plan
README.md · RELEASING.md · NOTICE · LICENSE
```

The plugin ships as markdown and JS hooks. There is **no build step**. `commands/`, `agents/`, and
`references/` are prose. `hooks/` and `scripts/` are executable: `hooks/` holds Claude Code hooks, and
`scripts/` holds standalone checks like `drift-check.js`, which `package.json` runs.

## Stack

- **Bun.** The repo package manager and task runner (`bun.lock`).
- **Node.** The hooks' runtime. `hooks.json` invokes `node`, because every user's Claude Code
  environment has `node` and not every one has Bun. Bun is maintainer-only.
- **semantic-release.** Deterministic, commit-driven releases (`release.config.cjs`), published to
  **Codeberg** (Forgejo) through `@saithodev/semantic-release-gitea`.
- **Conventional Commits.** They drive the version bump. `feat` gives a minor bump, `fix` and `perf`
  give a patch bump, and `!` or `BREAKING CHANGE` gives a major bump.

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

**`bun run eval` needs two environment variables.** `claude plugin eval` is early-access and gated on the
`tengu_walnut_spire` flag, so `CLAUDE_CODE_WALNUT_SPIRE=1` opens it locally. It also needs
`ANTHROPIC_API_KEY`. The harness runs each case in a sandbox with a throwaway `HOME`, and strips
`CLAUDE_CODE_OAUTH_TOKEN` from the child environment. A subscription-only login therefore authenticates
as `Not logged in`, and every grader scores 0 against an empty workspace. An API key survives the strip.

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

**No child AGENTS.md exists, because the repo is flat.** The repo is small, and every subtree's rules
already live in this root doc. See `Structure` above for the current file inventory. Add a child only
when a subtree becomes a durable boundary with rules of its own that do not fit here.

This root owns every subtree directly:

- `commands/`, `agents/`. Prose slash-commands and subagents. Governed by **Working rules, Backends are
  pluggable**: stay tool-agnostic and never hardcode a backend. Behaviour contracts live in the files.
- `hooks/`. Claude Code hooks, the plugin's deterministic guardrails. Governed by **Working rules, Hooks
  are CommonJS** and **Every hook ships a `--selftest`**. This is the strongest future child-doc
  candidate, if its rules outgrow this root.
- `scripts/`. Standalone deterministic checks that `package.json` runs, and the other executable code
  alongside `hooks/`. It follows the same `--selftest` convention. The reference, run-root, assignee,
  writing-standard, content-types, stage, command-resolution, and chain-handoff checks are drift
  assertions, which compare a restated fact against its source. The eval-shape check compares a document
  against a schema. `drift-check.js` guards
  nine things. First, that every `references/*.md` path named in `commands/` or `agents/` resolves to a file
  that exists. Second, that `commands/implement.md`, `commands/review.md`, `commands/document.md`,
  `commands/ship.md`, `references/implement-full.md`, `references/implement-lite.md`,
  `references/scope-mode.md`, `agents/implementer.md`, `agents/slice-reviewer.md`, and
  `agents/simplicity-reviewer.md` address run-root artifacts by absolute `<run-root>/…` path. Third,
  that every issue-backend document carries the `**Assignee` config bullet. The filename alone triggers
  that check, with no content gate on how the doc phrases issue creation. `references/issue-tracker-local.md`
  is exempt, because it has no assignee concept. Fourth, that
  `references/documentation.md` still offers a `## Writing standard` section (ADR 0012). Fifth, that
  `agents/doc-writer.md` and `agents/doc-reader.md` each still instruct themselves to read
  `references/content-types.md` (ADR 0014). Sixth, that
  every `evals/*/graders/*.md` declares a known `type` and a positive `weight`, that an `llm` or `regex`
  grader also declares a `focus` or `target`, and that every case's `scaffold_script` resolves. Nothing
  else validates a grader, so without this a typo surfaces part-way through a run that costs real API
  spend. Seventh, that every command in the chain still names the ledger's `**Stage:**` line (ADR 0013).
  The chain hands a run along through that line, so a command that stops naming it never writes or reads
  the stage, and nothing fails. Eighth, that every `/superdev:<name>` reference in `commands/` or
  `agents/` resolves to a `commands/<name>.md` file, so a chain handoff never points the reader at a
  command that does not exist. Ninth, that `commands/implement.md`, `commands/review.md`, and
  `commands/document.md` each name their successor in the chain. `commands/ship.md` ends the chain and is
  deliberately outside that check.

  The first and fifth checks are opposites. The first catches a reference to a file that does not exist.
  The fifth catches an agent that drops its wire to a file which still exists. That drift leaves the
  reference resolvable and the suite green, and the lens then does nothing in any dispatch.

  The first and eighth are the same check at two levels: one resolves a `references/` path, the other a
  command name. The eighth and ninth are opposites in the same way as the first and fifth: the eighth
  catches a handoff that points at a command with no file, the ninth a command that names no successor at
  all.
- `references/`. Backend seed templates plus the non-seed references below.
  + `plan-contract.md`: the slice schema and lifecycle, including the optional epic sections and the
    epic-visuals gate for `## Slice graph` and `## Touch map`.
  + `documentation.md`: the in-repo documentation convention, including the `## Writing standard`
    section that `/superdev:setup` fills in.
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
  + `scope-mode.md`: the rule `/superdev:review`, `/superdev:document`, and `/superdev:ship` share (ADR
    0013) — what makes a range a live scope run, how to find the scope checkout on disk for both tiers, and
    the run-lock refresh-not-create rule. Each of the three reads it at runtime and keeps only what is
    specific to it.
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
