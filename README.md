# superdev

An agent left alone will ship with confidence — whether or not anyone agreed what "done" means, whether
or not its own tests prove anything, whether or not the diff ever got a second look.

superdev makes it stop and check first.

**Before / after**

You ask your agent for a feature. Four hundred lines land across six files, the suite is green, a PR
opens. Nobody agreed what "done" meant before the first line was written, nobody but the model reviewed
it, and by the time a corner-cut surfaces, it's already merged.

With superdev: `/superdev:plan` interviews you until the Definition of Done is checkable,
`/superdev:implement` cuts the work into small slices, a separate reviewer subagent checks each one
before it merges, and a hook — not a prompt — blocks the merge outright if the suite goes red.

A self-contained Claude Code plugin for the full **brainstorm → plan → implement → document** loop, with
**no prerequisite plugins**. Interview-driven vertical slicing, an execution tier sized to the plan
(parallel execution in isolated git worktrees with separate implementer/reviewer subagents for larger
plans, inline test-first implementation for small ones), deterministic guardrails, and a pluggable slice
store + code host.

```
/superdev:setup      → configure backends in docs/agents/*.md (once per repo)
/superdev:brainstorm → (optional) turn a vague idea into a plan-ready intent
/superdev:plan       → interview + slice a feature into the slice store
/superdev:implement  → drive the slices to merge, then open the PR
/superdev:status     → read-only DAG progress snapshot for in-flight runs
/superdev:review     → standalone read-only review of any diff/branch/working tree
/superdev:document   → reconcile in-repo docs + knowledge base with the code (also runs at implement's end)
```

## What it does

- **`/superdev:brainstorm`** — *(optional)* a divergent discovery conversation that shapes a vague idea
  into a plan-ready intent: explores candidate directions, finds the smallest end-to-end slice worth
  building, surfaces open questions and rejected directions, then hands off to `/superdev:plan`, which
  routes each rejected direction to a durable home. Near read-only — writes nothing to the slice store.
- **`/superdev:plan`** — a relentless interview pins intent and a Definition of Done, captures ADRs +
  a glossary as decisions surface, then decomposes the work into **independently-green vertical
  tracer-bullet slices** with explicit `depends-on` dependencies, written to the configured store. On an
  epic whose shape earns it, also draws a `## Slice graph` (the `depends-on` DAG) and/or a `## Touch map`
  (parallel-slice file collisions) — both markdown, both advisory, gated per
  [`references/plan-contract.md`](references/plan-contract.md). Tells
  you the execution tier `/superdev:implement` will use for the final slice count (see below).
- **`/superdev:implement`** — the controller drives the slices as a **dependency-ordered DAG**, sized to
  an execution tier derived fresh from the loaded slice count, never configured or persisted:
  **>3 slices → full** — unblocked slices run in **parallel** as `implementer` subagents in isolated
  worktrees (TDD + lazy minimalism), each behavior slice gated by a separate **slice-reviewer**
  (correctness) and **simplicity-reviewer** (over-engineering), the controller merges **serially**.
  **≤3 slices → lite** — the
  controller implements each slice inline, test-first, in a single dedicated **scope worktree**
  (`.superdev/scopes/<scope>/worktree/`); the invoking checkout is never switched, and a same-scope run lock
  guards against a second concurrent run. No per-slice worktrees or reviewers. Either tier ends with one
  **whole-scope review** gating the **PR**.
- **`/superdev:status`** — a read-only snapshot of every in-flight `/superdev:implement` run in the repo:
  per scope, slice counts by status and which slices are `blocked`. Never writes, transitions, or merges
  anything.
- **`/superdev:review`** — a standalone review of any diff, branch, path, or the working tree — no plan
  or slice store required. Dispatches the same `final-reviewer` + `simplicity-reviewer` subagents
  `/superdev:implement` uses per scope, read-only, and reports one consolidated verdict. Never edits,
  commits, or merges anything.
- **`/superdev:document`** — dispatches the `doc-writer` to reconcile the in-repo docs
  (`AGENTS.md` hierarchy) and the optional knowledge base with the current code — adding what's new and
  **removing stale/obsolete** text — then reader-tests the result: the fresh-context `doc-reader` reads
  the changed docs cold and verifies their claims against the repo; ungrounded or stale text goes back
  to the `doc-writer` for one fix round. Runs automatically at the end of every `/superdev:implement`,
  and on demand anytime (full reconcile, scoped to a range/area, or `audit` for a reader-first check).
  Called empty on a **brownfield repo with no `AGENTS.md` hierarchy**, it **bootstraps** one instead —
  seeding root (and, where warranted, child) `AGENTS.md` files plus a proposed `CONTEXT.md` glossary from
  the existing code, confirmed with you before anything commits.
- **`/superdev:setup`** — records the backends in `docs/agents/*.md` so the workflow never hardcodes a
  tool. For a knowledge base it also captures **audience(s)** and **language** and proposes a
  human-first outline. Finds no `AGENTS.md` hierarchy in the repo → points you at `/superdev:document`'s
  bootstrap mode to seed one.

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

`implementer`, `slice-reviewer`, `simplicity-reviewer`, `final-reviewer`, `doc-writer`, `doc-reader` —
each runs in an isolated context; only its result returns to the controller. `implementer` /
`slice-reviewer` / `simplicity-reviewer` are dispatched per slice in the **full** execution tier only;
the **lite** tier (≤3 slices) has the controller implement inline. Both tiers share the same final
phase — `final-reviewer` over the whole scope, then, once its fix loop closes, `doc-writer` to
reconcile the docs, reader-tested by `doc-reader`. The doc
reconcile always runs **after** the review, never concurrent with it, so `doc-writer`'s commits can't
shift the diff the reviewer reads ([ADR 0003](docs/adr/0003-doc-reconcile-runs-serially.md)).

## Guardrails (deterministic hooks)

Cross-platform Node hooks (`node` is a Claude Code runtime dependency — no bash/PowerShell variants):

- **merge-guard** — blocks `git merge`/`push`/`rebase` from inside subagents (scoped by `agent_id`);
  the controller integrates.
- **model-explicit** — blocks a dispatch to a superdev subagent that omits an explicit `model`, so cost
  is always warrant-scaled.
- **green-gate** — after a controller merge, re-runs the configured test command and blocks on a RED
  suite, so "tests pass on scope after merging" is enforced, not merely prompted. Inactive until a test
  command is recorded in `docs/agents/verification.md` (via `/superdev:setup`).
- **run-lock** — blocks a `git worktree add` on a scope worktree (`.superdev/scopes/<scope>/worktree`) while a
  fresh `.superdev/scopes/<scope>/run.lock` exists, so two concurrent lite runs on the same scope can't collide.
  A stale lock (older than the staleness threshold) or no lock at all is allowed through — crash resume
  or a new run.
- **worktree-sweep** — a `Stop` hook that removes each per-slice worktree + branch once its slice is
  fully merged, so finished worktrees can't pile up when the controller skips the prompted cleanup.
  Only touches merged `slice/*` worktrees under `.superdev/`; in-progress and reverted slices are left.
  A lite-tier run's single scope worktree isn't a per-slice worktree, so this hook doesn't touch it —
  `/implement` removes it itself at the end of the run.
- **scope-prune** — a `Stop` hook that deletes a scope's run root (`.superdev/scopes/<scope>/` — its
  `ledger.md`/`dod.md` post-mortem trail) once the scope branch is merged **and** the run root has sat
  untouched for 7+ days. An unmerged scope, or one whose worktree is still present, is never touched.

A seventh Node hook, **update-check**, is a `SessionStart` *notice* (not a guardrail) — see
[Updating](#updating).

## Configuration & backends

`/superdev:setup` records your choices in `docs/agents/*.md` — one small doc per concern — so the
commands never hardcode a tool. Edit those files directly anytime; re-run setup only to switch a
backend.

- **Slice store** — where a feature's plan lives: the global **Definition of Done** plus every vertical
  slice (`id`, `depends-on`, `test-applicability`, `spec`, `acceptance`). `/plan` writes it; `/implement`
  reads it, uses its slice count to derive the execution tier, and drives each slice to `merged`, walking
  its issue along the tracker's status workflow as it goes (dispatch → in-progress, review → in-review,
  merge → done — mapped at setup; the **lite** tier has no per-slice review, so it skips straight from
  in-progress to merged/done).
  Choices: *local files* (a directory `docs/plans/<feature-slug>/` per feature: `00-epic-*` = DoD +
  description, `NN-<test-applicability>-*` = one file per slice, the number *is* the id — best for solo work
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
- **Knowledge base** *(optional)* — a **separate, human-first** record (feature specifications, design
  overviews, ADR summaries) for *readers*, not agents — distinct from the agent-first `AGENTS.md` docs. You pick the
  backend (Confluence · local `docs/kb/` · other · none), its **audience(s)**, **language**, and an agreed
  **outline** that `/plan` and `/document` fill rather than reinvent. → `docs/agents/knowledge-base.md`.
- **Toolchain** *(detected)* — the repo's package manager and build/lint/format/release commands plus
  style-doc pointers, **auto-detected** by setup (not a pluggable backend) and recorded one section per
  workspace, so agents use the right tools instead of rediscovering them. `test` defers to Verification.
  → `docs/agents/toolchain.md`.
- **Verification** *(optional)* — the repo's test command. Recorded, it **arms the green-gate** hook
  (re-runs the suite after every controller merge); omitted, the gate stays inactive.
  → `docs/agents/verification.md`.

Adding a backend = a new seed template in `references/` + a config doc. No command or agent changes.

## What superdev writes to your repo

```
docs/agents/*.md          backend config — the six docs above (committed)
docs/plans/<feature-slug>/  slices + Definition of Done (local store): 00-epic-* = DoD + description,
                          NN-<test-applicability>-* = one file per slice (number = id)
CONTEXT.md                glossary / ubiquitous language, authored by /plan
docs/adr/NNNN-*.md        architecture decision records, authored by /plan
.claude/rules/*.md        path-scoped conventions the implementers auto-load, authored by /plan
docs/kb/                  knowledge base, only if the local-file KB backend is chosen
.superdev/scopes/<scope>/  git-ignored run scratch, namespaced per scope branch so parallel runs
                          don't collide: the concrete DoD + ledger (both execution tiers), plus
                          per-slice progress logs + the cross-slice interface record + per-slice
                          worktrees (full tier only, >3 slices), or a single scope worktree +
                          run.lock (lite tier only, ≤3 slices) — never committed, never in the PR
.superdev/brainstorm/<intent-slug>.md   git-ignored scratch intent notes, optionally written by
                          /brainstorm — sibling to .superdev/scopes/, not inside it, so /status (which
                          only scans .superdev/scopes/*/) never mistakes it for a run root; never
                          committed
```

Everything except `.superdev/` is committed — the design docs (glossary, ADRs, rules) **must** be on the
branch, because both tiers work from fresh worktree checkouts (per-slice `implementer` subagents on the
full tier, the controller itself in the scope worktree on the lite tier) and only see what's committed.

## Worked example

A tiny feature end to end, with the local-file slice store and GitHub as the code host:

- **`/superdev:setup`** (once per repo) — a short interview, then `docs/agents/*.md` is written: slice
  store = local files, code host = GitHub (`gh`), documentation = the `AGENTS.md` hierarchy,
  verification = `npm test`, no knowledge base.
- **`/superdev:plan add a health-check endpoint`** — interviews for intent + a Definition of Done, then
  writes `docs/plans/health-check/`: `00-epic-*` (DoD + description) plus two slices, e.g.
  `01-behavior-route-handler.md` and `02-behavior-wire-into-router.md`, the second `depends-on` the
  first. You see the slice list printed back, ready for `/implement`, along with the tier it'll run
  under — two slices is ≤3, so **lite**.
- **`/superdev:implement health-check`** — sets up `.superdev/scopes/health-check/` (git-ignored run scratch:
  concrete DoD + ledger). Two slices → the **lite** tier: the controller cuts a single scope worktree at
  `.superdev/scopes/health-check/worktree/` (the invoking checkout is never switched) and implements slice 01
  test-first in it, commits, then slice 02 unblocks and follows the same loop — no per-slice worktrees or
  reviewer subagents. Once both are merged, a single `final-reviewer` gates the whole scope, then the
  controller opens the PR, removes the scope worktree, and stops. You see a one-line status per slice as
  it lands, then the PR URL.
- **After** — review comments or flaky CI on the open PR are a `/loop` job, not `/implement`'s concern
  (see [After the PR](#after-the-pr)).

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

**Manage:** `/plugin list` · `/plugin details superdev@superdev` · pull updates with
`/plugin marketplace update superdev` then `/reload-plugins`.

Then, in each repo you want to use it: run **`/superdev:setup`** once, then `/superdev:plan` →
`/superdev:implement`.

## Updating

Easiest — run **`/superdev:upgrade`**: it checks for a newer release and installs it in place (then
restart Claude Code to load it). No manual `/plugin` steps.

superdev is a third-party marketplace, so **auto-update is off by default** — updates are otherwise
pull-based. The manual equivalent of `/superdev:upgrade`:

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
