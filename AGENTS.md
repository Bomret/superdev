# superdev

A self-contained **Claude Code plugin** for the plan → implement loop: interview-driven vertical
slicing, an execution tier sized to the plan (parallel worktree execution with isolated
implementer/reviewer subagents for >3 slices, inline test-first implementation for ≤3), deterministic
hook guardrails, and a pluggable slice store + code host. No prerequisite plugins.

## Need something? → Read this

| Goal | Start here |
|------|------------|
| Understand the plugin, install, updating | [`README.md`](README.md) |
| Cut a release | [`RELEASING.md`](RELEASING.md) |
| Slice schema, lifecycle & status | [`references/plan-contract.md`](references/plan-contract.md) |
| Domain language (ubiquitous terms) | [`CONTEXT.md`](CONTEXT.md) |
| Architecture decisions (why it's built this way) | [`docs/adr/`](docs/adr/) |
| In-repo documentation convention (this AGENTS.md hierarchy) | [`references/documentation.md`](references/documentation.md) |
| Add/adjust a backend (slice store, code host, KB, verification) | seeds in [`references/`](references/) |
| Attribution / license | [`NOTICE`](NOTICE), [`LICENSE`](LICENSE) |

## Structure

```
.claude-plugin/
  plugin.json          — plugin manifest (name, version, author); version is the SINGLE source of truth.
                         No `hooks` field — Claude Code auto-loads the standard hooks/hooks.json.
  marketplace.json     — single-plugin marketplace manifest (deliberately NO version field)
commands/              — slash commands (*.md): brainstorm, setup, plan, implement, document, upgrade,
                         status, review
agents/                — subagents (*.md): implementer, slice-reviewer, simplicity-reviewer, final-reviewer, doc-writer
hooks/                 — deterministic Node hooks + hooks.json: merge-guard, model-explicit, green-gate,
                         run-lock, worktree-sweep, update-check
references/            — backend seed templates + plan-contract + documentation convention +
                         execution playbooks (implement-full/lite, read at runtime by /implement) +
                         authoring disciplines (grilling, domain-modeling, read at runtime by /plan + /brainstorm) +
                         review-checklist (anti-patterns, vuln-classes, reuse-audit; read at runtime by
                         final-reviewer + slice-reviewer)
docs/adr/              — architecture decision records (why the plugin is built this way)
docs/agents/           — superdev's own backend config (dogfooded: this repo's slice store, code host, KB, verification)
evals/                 — `claude plugin eval` cases (*/case.yaml + graders/*.md) exercising the commands
release.config.cjs     — semantic-release config (semantic-release-replace-plugin bumps plugin.json)
package.json           — dev-only tooling (Bun); NOT published to npm
CHANGELOG.md           — release-managed by semantic-release; do not hand-edit
CONTEXT.md             — the domain-language glossary (ubiquitous terms); maintained by /plan
README.md · RELEASING.md · NOTICE · LICENSE
```

The plugin ships as markdown + JS hooks — there is **no build step**. `commands/`, `agents/`,
`references/` are prose; only `hooks/` is executable.

## Stack

- **Bun** — repo package manager + task runner (`bun.lock`).
- **Node** — the hooks' runtime. `hooks.json` invokes `node`, because `node` is guaranteed in every
  user's Claude Code environment and Bun is not. Bun is maintainer-only.
- **semantic-release** — deterministic, commit-driven releases (`release.config.cjs`), publishing to
  **Codeberg** (Forgejo) via `@saithodev/semantic-release-gitea`.
- **Conventional Commits** — drive the version bump (`feat`→minor, `fix`/`perf`→patch, `!`/`BREAKING
  CHANGE`→major).

## Working rules (repo-specific — read before editing hooks/version/release)

- **Hooks are CommonJS** (`.js`, `require`). Do **not** add `"type": "module"` to `package.json` — node
  resolves the plugin's `package.json` when running a hook and would treat every hook as ESM, breaking
  them in production. Only `.mjs` is ESM (extension-scoped).
- **Every hook ships a `--selftest`.** Add one for any new hook; `bun run test` runs them all (under
  `node`, matching the production runtime), then runs `claude plugin validate .` as a manifest-validation
  gate.
- **Version lives only in `.claude-plugin/plugin.json`.** Never hand-edit it — semantic-release +
  `semantic-release-replace-plugin` bump it on release. `marketplace.json` carries no version (avoids the
  double-pin, where `plugin.json` would silently win).
- **Backends are pluggable.** Adding a slice store / code host / KB = a new seed in `references/` + the
  matching `docs/agents/*.md` written by `/superdev:setup` in the *consumer* repo. `commands/` and
  `agents/` stay tool-agnostic — don't hardcode a backend into them.

## Known issues (Claude Code platform)

**SessionStart system-prompt preambles leak into subagent tool outputs** (issue #32 tracking). When a
subagent is dispatched, the Claude Code harness includes the main conversation's SessionStart
system-message (e.g., context-window-protection, tool-bootstrap guidance) in the subagent's prompt
context. This creates a prompt-injection surface where:

- Subagents receive meta-instructions they didn't ask for.
- Tool-call outputs may be wrapped with system-prompt tags instead of remaining opaque.

**Mitigation (implemented):** all subagent bodies include explicit secret-hygiene discipline — they
identify and disregard any injected system-reminder blocks, using only the standard tools they were
given (`Read`, `Edit`, `Write`, `Bash`, etc.). See `agents/implementer.md` (and others) for the
pattern.

**Fix required at:** Claude Code platform layer — subagent prompts should be isolated from main
conversation's SessionStart preamble. Track upstream with the Claude Code team.

## Common commands

```
bun install                        # install dev deps (release toolchain)
bun run test                       # hook selftests + plugin manifest validation
bun run eval                       # run the evals/ cases against the commands
GITEA_TOKEN=<token> bun run release  # cut a release from clean main (see RELEASING.md)
```

# DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

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

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

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

**No child AGENTS.md — the repo is flat.** It's small (8 commands, 5 agents, 6 hooks, 13 references) and
every subtree's rules already live in this root doc. Add a child only when a subtree becomes a durable
boundary with rules of its own that don't fit here.

This root owns every subtree directly:

- `commands/`, `agents/` — prose slash-commands + subagents. Governed by **Working rules → Backends are
  pluggable** (stay tool-agnostic; never hardcode a backend). Behaviour contracts live in the files.
- `hooks/` — the only executable code. Governed by **Working rules → Hooks are CommonJS** + **Every hook
  ships a `--selftest`**. Strongest future child-doc candidate if its rules outgrow this root.
- `references/` — backend seed templates + `plan-contract.md` (slice schema/lifecycle) + `documentation.md`
  + **execution playbooks** (`implement-full.md` / `implement-lite.md`): the tier-specific linear procedures
  `/implement` reads at runtime once it computes the tier (non-seed refs, like `plan-contract.md`)
  + **authoring disciplines** (`grilling.md` / `domain-modeling.md`): the relentless-interview and
  active-domain-modeling disciplines `/plan` and `/brainstorm` read at runtime (superdev's self-contained
  rendering of the grilling + domain-modeling skills)
  + **`review-checklist.md`**: named anti-patterns, vulnerability classes, and a reuse-audit lens,
  read at runtime by `final-reviewer` (all three) and `slice-reviewer` (anti-patterns + vuln-classes).
- `docs/adr/` — architecture decision records. `docs/agents/` — this repo's own dogfooded backend config.
- `.claude-plugin/` — manifests. Governed by **Working rules → Version lives only in `plugin.json`**.
- `CONTEXT.md` — the domain glossary. `evals/` — `claude plugin eval` cases.