# superdev

A self-contained Claude Code plugin for the full **plan → implement** loop, with **no prerequisite
plugins**. Interview-driven vertical slicing, parallel execution in isolated git worktrees with
separate implementer/reviewer subagents, deterministic guardrails, and a pluggable slice store + code
host.

```
/superdev:setup      → configure backends in docs/agents/*.md (once per repo)
/superdev:plan       → interview + slice a feature into the slice store
/superdev:implement  → drive the slices to merge, then open the PR
/superdev:document   → reconcile in-repo docs + knowledge base with the code (also runs at implement's end)
```

## What it does

- **`/superdev:plan`** — a relentless interview pins intent and a Definition of Done, captures ADRs +
  a glossary as decisions surface, then decomposes the work into **independently-green vertical
  tracer-bullet slices** with explicit `depends-on` dependencies, written to the configured store.
- **`/superdev:implement`** — the controller drives the slices as a **dependency-ordered DAG**:
  unblocked slices run in **parallel** as `implementer` subagents in isolated worktrees (TDD + lazy
  minimalism); each behavior slice is gated by a separate **correctness reviewer** and an
  **over-engineering reviewer**; the controller merges **serially**; when all slices land, one
  **whole-scope review** gates the **PR**.
- **`/superdev:document`** — dispatches the `doc-writer` to reconcile the in-repo docs
  (`AGENTS.md` hierarchy) and the optional knowledge base with the current code — adding what's new and
  **removing stale/obsolete** text. Runs automatically at the end of every `/superdev:implement`, and on
  demand anytime (full reconcile, or scoped to a range/area).
- **`/superdev:setup`** — records the backends in `docs/agents/*.md` so the workflow never hardcodes a
  tool. For a knowledge base it also captures **audience(s)** and **language** and proposes a
  human-first outline.

## After the PR

`/superdev:implement` is a goal-based loop: it drives the DAG until every slice is merged and the
whole-scope review passes, then opens the PR and **stops**. The last mile — review comments and CI on
the open PR — is a time-based loop; hand it to `/loop`:

```
/loop 5m check my PR, address review comments, and fix failing CI
```

To cap a long run, wrap the implement call in `/goal` with the Definition of Done as the stop condition
and an explicit turn ceiling (e.g. "stop after N tries").

## Roles (subagents)

`implementer`, `slice-reviewer`, `simplicity-reviewer`, `final-reviewer`, `doc-writer` — each runs in an
isolated context; only its result returns to the controller.

## Guardrails (deterministic hooks)

Cross-platform Node hooks (`node` is a Claude Code runtime dependency — no bash/PowerShell variants):

- **merge-guard** — blocks `git merge`/`push`/`rebase` from inside subagents (scoped by `agent_id`);
  the controller integrates.
- **model-explicit** — blocks a dispatch to a superdev subagent that omits an explicit `model`, so cost
  is always warrant-scaled.
- **green-gate** — after a controller merge, re-runs the configured test command and blocks on a RED
  suite, so "tests pass on scope after merging" is enforced, not merely prompted. Inactive until a test
  command is recorded in `docs/agents/verification.md` (via `/superdev:setup`).
- **worktree-sweep** — a `Stop` hook that removes each per-slice worktree + branch once its slice is
  fully merged, so finished worktrees can't pile up when the controller skips the prompted cleanup.
  Only touches merged `slice/*` worktrees under `.superdev/`; in-progress and reverted slices are left.

A fifth Node hook, **update-check**, is a `SessionStart` *notice* (not a guardrail) — see
[Updating](#updating).

## Configuration & backends

`/superdev:setup` records your choices in `docs/agents/*.md` — one small doc per concern — so the
commands never hardcode a tool. Edit those files directly anytime; re-run setup only to switch a
backend.

- **Slice store** — where a feature's plan lives: the global **Definition of Done** plus every vertical
  slice (`id`, `depends-on`, `test-applicability`, `spec`, `acceptance`). `/plan` writes it; `/implement`
  reads it and drives each slice to `merged`, walking its issue along the tracker's status workflow as it
  goes (dispatch → in-progress, review → in-review, merge → done — mapped at setup).
  Choices: *local files* (a directory `docs/plans/<feature-slug>/` per feature: `00-epic-*` = DoD +
  scope, `NN-<test-applicability>-*` = one file per slice, the number *is* the id — best for solo work
  or no tracker) · *Jira* (each slice an issue, `depends-on` → "is blocked by" links) · *other* (describe
  your tracker's CRUD + dependency link in prose). → `docs/agents/issue-tracker.md`.
- **Code host** — where the scope branch is pushed and the PR/MR opens, plus the default posture
  (`draft` / `ready` / `push-only`) and base branch. GitHub (`gh`) · Forgejo/self-hosted (`tea`/REST) ·
  *other*. No host CLI present → degrades to "push + printed compare URL + ready-to-run command".
  → `docs/agents/code-management.md`.
- **Documentation (in-repo)** — how durable technical docs are kept: an **`AGENTS.md` hierarchy** (root =
  project-wide, child = per-boundary). `/plan` also records the glossary (`CONTEXT.md`), ADRs
  (`docs/adr/`), and path-scoped rules (`.claude/rules/`) under this convention; `/document` reconciles
  it after a scope lands. → `docs/agents/documentation.md`.
- **Knowledge base** *(optional)* — a **separate, human-first** record (PRDs, design overviews, ADR
  summaries) for *readers*, not agents — distinct from the agent-first `AGENTS.md` docs. You pick the
  backend (Confluence · local `docs/kb/` · none), its **audience(s)**, **language**, and an agreed
  **outline** that `/plan` and `/document` fill rather than reinvent. → `docs/agents/knowledge-base.md`.
- **Verification** *(optional)* — the repo's test command. Recorded, it **arms the green-gate** hook
  (re-runs the suite after every controller merge); omitted, the gate stays inactive.
  → `docs/agents/verification.md`.

Adding a backend = a new seed template in `references/` + a config doc. No command or agent changes.

## What superdev writes to your repo

```
docs/agents/*.md          backend config — the five docs above (committed)
docs/plans/<feature-slug>/  slices + Definition of Done (local store): 00-epic-* = DoD + scope,
                          NN-<test-applicability>-* = one file per slice (number = id)
CONTEXT.md                glossary / ubiquitous language, authored by /plan
docs/adr/NNNN-*.md        architecture decision records, authored by /plan
.claude/rules/*.md        path-scoped conventions the implementers auto-load, authored by /plan
docs/kb/                  knowledge base, only if the local-file KB backend is chosen
.superdev/<scope>/        git-ignored run scratch, namespaced per scope branch so parallel runs
                          don't collide: the concrete DoD, the ledger, per-slice progress logs +
                          worktrees — never committed, never in the PR
```

Everything except `.superdev/` is committed — the design docs (glossary, ADRs, rules) **must** be on the
branch, because the implementer subagents run in fresh worktree checkouts and only see what's committed.

## Install

superdev ships as a single-plugin Claude Code **marketplace** (`.claude-plugin/marketplace.json`), so
both the marketplace and the plugin are named `superdev` → you install `superdev@superdev`. Requires
Claude Code **v2.1.128+**.

**From the git host** (interactive):

```
/plugin marketplace add https://codeberg.org/bomret/superdev.git
/plugin install superdev@superdev
```

**From a local clone** (for hacking on it):

```
git clone https://codeberg.org/bomret/superdev.git
/plugin marketplace add /absolute/path/to/superdev
/plugin install superdev@superdev
```

**Committed / non-interactive** — add to `.claude/settings.json` (project) or your user settings, so the
plugin loads without the interactive menu:

```json
{
  "extraKnownMarketplaces": {
    "superdev": {
      "source": { "source": "github", "repo": "https://codeberg.org/bomret/superdev.git" }
    }
  },
  "enabledPlugins": { "superdev@superdev": true }
}
```

For a local checkout instead, use `"source": { "source": "directory", "path": "/absolute/path/to/superdev" }`.

**Manage:** `/plugin list` · `/plugin details superdev@superdev` · pull updates with
`/plugin marketplace update superdev` then `/reload-plugins`.

Then, in each repo you want to use it: run **`/superdev:setup`** once, then `/superdev:plan` →
`/superdev:implement`.

## Updating

superdev is a third-party marketplace, so **auto-update is off by default** — updates are pull-based.
Pull a new version with:

```
/plugin marketplace update superdev     # refresh the catalog from the git host
/plugin update superdev@superdev        # upgrade the installed plugin
/reload-plugins                         # activate it
```

Prefer hands-off? Enable it once — `/plugin` → **Marketplaces** → `superdev` → **Enable auto-update** —
and Claude upgrades it at startup, then prompts `/reload-plugins`.

A best-effort `SessionStart` hook prints a one-line notice when a newer version is published (checked at
most once a day, silent when offline). "Newer" is the `version` in `.claude-plugin/plugin.json`, so a
release **must bump that field** — an unchanged version is invisible to `/plugin update`.

**Maintainers:** releases are deterministic and commit-driven (semantic-release bumps the version,
writes `CHANGELOG.md`, tags, and publishes a Codeberg Release from the Conventional Commits). See
[`RELEASING.md`](RELEASING.md).

## Requirements

- Claude Code (provides `node` for the hooks).
- For the chosen backends: the relevant CLI/token (`gh`; or a Jira/Forgejo token in an env var). The
  PR step degrades to "push + printed command" when a host CLI is absent.

## Attribution

Distills MIT-licensed material from [superpowers](https://github.com/obra/superpowers) (© Jesse
Vincent) and ponytail (© Dietrich Gebert), plus engineering-skill patterns. See `NOTICE`.

## License

MIT — see `LICENSE`.
