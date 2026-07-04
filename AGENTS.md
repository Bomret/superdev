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
references/            — backend seed templates + plan-contract + documentation convention
evals/                 — `claude plugin eval` cases (*/case.yaml + graders/*.md) exercising the commands
release.config.cjs     — semantic-release config (semantic-release-replace-plugin bumps plugin.json)
package.json           — dev-only tooling (Bun); NOT published to npm
CHANGELOG.md           — release-managed by semantic-release; do not hand-edit
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

## Documentation contract (DOX-style)

This file is the binding contract for the repo. superdev's own `/superdev:document` implements this same
`AGENTS.md`-hierarchy convention (see `references/documentation.md`).

**Read before editing:** read this AGENTS.md, then any child AGENTS.md on the path to the files you'll
touch. Don't rely on memory — re-read in the current session.

**Update after editing:** when a change affects purpose, structure, contracts, workflow, or operating
rules, update the nearest owning AGENTS.md (and parents whose structure/child-index changed). Delete
stale or contradictory text immediately — present-tense, state-of-the-world prose, no history.

**Style:** concise, current, operational. Stable contracts, not diary entries. Broad rules in parents,
concrete detail in children. Don't duplicate a rule across files unless each scope needs its own.

**Hierarchy:** this is currently the only AGENTS.md — the repo is flat. Add a child AGENTS.md when a
subtree becomes a durable boundary with its own rules, and list it in a Child DOX Index here.
