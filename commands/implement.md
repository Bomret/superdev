---
description: Execute a superdev plan — drive its vertical slices to merge as a dependency-ordered DAG, with an execution tier sized to the slice count, then hand off to /superdev:review. Use when a plan exists in the slice store; run /superdev:plan first if not.
argument-hint: "[feat/<label>  (empty = the only plan in the store)]  [--unattended]"
---

# superdev implement

You are the **controller**. You drive a plan's slices to merge, and you alone integrate — never a
subagent. **How** depends on the execution **tier**, a pure function of the loaded slice count (see
**Config + input**): **>3 slices → `full`**, **≤3 slices → `lite`**. The tier selects one of two linear
execution playbooks you `Read` and follow; this file holds only what both share — the invariants, config,
Phase 0, issue-status map, and the handoff.

**You stop when the code is on the scope branch.** The whole-scope review, the doc pass, and the pull
request are the next three commands in the chain, and the maintainer runs each one (ADR 0013). Reviewing,
documenting, or opening a pull request here is out of scope: hand off instead.

**Core principle:** a slice's green suite proves its fixtures pass — not that it's correct. The `full`
playbook re-verifies each slice with separate reviewer subagents and integrates serially; the `lite`
playbook leans on the whole-scope review that `/superdev:review` runs next.

The `full` playbook's three roles are subagents — `superdev:implementer`, `superdev:slice-reviewer`,
`superdev:simplicity-reviewer` — whose discipline lives in their own bodies; you dispatch them with
per-slice specifics, not the whole plan. The `lite` playbook dispatches nothing: you carry the
implementer's TDD discipline yourself. Between dispatches, narrate at most one short line.

## Invariants (honored by both playbooks)

- **The 3-strike fix loop caps at a wrong cut, not a bug.** If a slice's fix loop takes 3 cycles without going clean
  (each fix exposing a new defect elsewhere), stop re-dispatching. That's a hidden dependency or a
  boundary too big — move the slice → `blocked` and escalate (re-slice or hand to the human); never burn a
  fourth cycle.
- **Every fix opens with a RED test** that reproduces the bug before any code changes.
- **The ledger is your recovery map.** After any compaction, a slice the ledger (or `git log`) marks
  `merged` is done — never re-dispatch it; trust the ledger and `git log` over memory.
- **Hook-enforced — don't restate, just comply:** only the controller merges/pushes (`merge-guard` blocks
  a subagent's `git merge`/`push`/`rebase`); every dispatch to a superdev agent sets an explicit `model`
  (`model-explicit` blocks omissions — an omitted model silently inherits the priciest tier).
- **A denied dispatch is a degraded pass, not a silent inline step.** The permission classifier can deny
  a dispatch for reasons outside this plan. Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
  `## Degraded passes` section and follow it — do the work inline, say so, and write the `**Degraded:**`
  entry to `<run-root>/ledger.md`. **`--unattended` → block** there instead.
- **Agents carry their own discipline.** Implementers own test-first TDD; reviewers own "green ≠ correct"
  and hunting uncovered input; `mechanical`/`docs` slices invent no tests (the suite is the net). Don't
  re-teach any of it when dispatching — pass specifics, not lectures.

## Config + input

- Read `docs/agents/issue-tracker.md` (slice store), `docs/agents/code-management.md` (code host),
  `docs/agents/documentation.md` (in-repo documentation convention), and `docs/agents/knowledge-base.md`
  (optional KB). Slice store or code host missing → run **`/superdev:setup`**, then continue. **Advisory:**
  if `docs/agents/toolchain.md` is absent while the repo has build/package manifests (`package.json`,
  `*.csproj`/`*.sln`, `pom.xml`/`build.gradle*`, `pyproject.toml`, `Cargo.toml`, `go.mod`, …), suggest the
  user run **`/superdev:setup`** to record the toolchain — non-blocking, then continue.
- **Resolve `$ARGUMENTS` to one feature.** Take `--unattended` out first, wherever it sits — it is the
  token below, not a feature label. A **feature label** names which planned feature to build — the
  feature's slice-store label per `docs/agents/issue-tracker.md`, minus its prefix (e.g. `feat/<label>` on
  the issue-tracker seeds; the local-file store's `docs/plans/<feature-slug>/` directory names the slug
  directly, with no prefix to strip). Its slug is this run's scope: `feat/lite-perf` gives scope
  `lite-perf`, branch `superdev/lite-perf`, and run root `.superdev/scopes/lite-perf/`. One value
  therefore fixes the epic, the slices, the branch, and the run root together, and Phase 0 skips its
  scope-naming step.
  - **A label given** → load the anchor carrying it, per the store's `## Scope anchor` contract
    (`docs/agents/issue-tracker.md`) — an epic on a multi-slice plan, or the lone slice itself on a
    single-slice plan (ADR 0017) — plus every slice carrying it. The store knows no such label at all (no
    anchor and no slice carries it) → say so and stop, and create no run root. **The anchor is an epic
    that carries no slices** → say so, point at **`/superdev:plan`**, and stop — this never fires for a
    single-slice plan, whose anchor is its own slice rather than an empty epic. **The slug must match
    `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s scope-slug rule.** Anything else → say so and stop,
    creating no run root; **`--unattended` → block**.
  - **Empty** → resolve the feature yourself. Exactly one feature has slices ready → use it. Several do →
    name them and ask which; **`--unattended` → block**, because picking a feature for someone is not a
    guess worth making. None do → run **`/superdev:plan`** first.
- **Load the slices** from the store (per the contract: `id`, `depends-on`, `test-applicability`, `spec`,
  `acceptance`, + global DoD). No slices → run **`/superdev:plan`** first. **Exactly one slice and no
  epic** → the epic was optional (`plan-contract.md`): the DoD is that slice's `acceptance`; there is no
  separate epic to load.
- **`--unattended` present** → read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended**
  section and follow it wherever this command or its playbook would ask a question or start an interview
  command (`/superdev:setup`, `/superdev:plan`) — the "slice store or code host missing" and "no slices"
  stops above are exactly that, and carry no standing answer, so unattended blocks there instead of
  running the interview. Nothing else in that
  file applies here.
- **Pre-flight scan:** read all slices once for contradictions (a slice that conflicts with another or
  with the DoD; a specification that mandates something a review would flag). Batch anything you find to the user
  before starting. Clean → proceed silently. **`--unattended` → block**, naming the contradictions: a plan
  that argues with itself is the one thing an implementer must not resolve by guessing.
- **Compute the tier** — **≤3 slices → `lite`**, **>3 slices → `full`** — derived fresh every run, never
  configured, overridden, or persisted (`/plan` and `/implement` derive it the same way from the same
  count). Do **Phase 0** below (either tier), then `Read` your playbook and follow it start to finish:
  - `full` → `${CLAUDE_PLUGIN_ROOT}/references/implement-full.md`
  - `lite` → `${CLAUDE_PLUGIN_ROOT}/references/implement-lite.md`
  When it returns, do the **Final phase** below.

## Phase 0 — Definition of done + ledger (always first)

- **Commit + push the base first.** Ensure the glossary (`CONTEXT.md`), ADRs (`docs/adr/`), and
  `.claude/rules/` are committed on the base branch — worktrees are clean checkouts, so uncommitted
  design docs never reach them and a path-scoped rule that isn't committed can't auto-load. If any are
  dirty/untracked, commit them to base now. Then confirm the base is pushed to its remote (push it if
  it's ahead) — the PR you open later diffs against the remote base, and an unpushed local commit there
  diverges into a stranded duplicate once the PR is squash-merged.
- **Run root (per scope).** Fix this run's **scope** `<scope>` now — the slug from the feature label when
  **Config + input** resolved one, and otherwise a short feature-slug you choose (e.g. `lite-perf`). The
  **scope branch** is `superdev/<scope>` (created in your playbook's branch model). All
  artifacts for this run live under a per-scope run root **`.superdev/scopes/<scope>/`** — keyed on the bare slug,
  so it never doubles the branch's `superdev/` prefix into `.superdev/superdev/…` — **git-ignored**
  (ensure `.superdev/` is in the repo's `.gitignore`; add it if absent). The run root
  (`dod.md`, `ledger.md`, `run.lock`) stays in the **invoking checkout** (the repo's main tree), never
  moves into a worktree; only the code checkout moves into a worktree. **Address it by absolute path.**
  Capture `<run-root>` now — the **absolute** path to `.superdev/scopes/<scope>/`, while the invoking
  checkout is your cwd (before any worktree is cut) — and refer to every run-root artifact as
  `<run-root>/dod.md`, `<run-root>/ledger.md`, `<run-root>/run.lock`, `<run-root>/reports/<id>/…`,
  `<run-root>/interfaces.md`. Hand subagents that **absolute** path: a checkout-relative
  `.superdev/scopes/<scope>/…` path resolves one level too deep from a worktree cwd (the lite controller
  and every subagent work with a worktree as cwd). **Namespacing by `<scope>`** is what
  lets several scope runs execute in parallel — even in separate sessions — without clobbering each
  other's DoD/ledger/reports/interfaces/worktrees. Nothing in the run root is committed or lands in the PR.
- Write the **global verification plan** (the DoD, made concrete and checkable) to `<run-root>/dod.md`.
  It anchors the whole-scope review `/superdev:review` runs next, and `/superdev:ship` ticks it at the end
  of the chain. No DoD → don't proceed. **No epic** (a
  single-slice plan) → the DoD is that lone slice's `acceptance`; write it to `dod.md` verbatim.
- Create the **ledger** at `<run-root>/ledger.md`. Track each slice's status
  (`todo`/`in-progress`/`in-review`/`merged`), its commit range when merged, and — for issue stores — the
  slice-id ↔ issue-key mapping.
- Write the **stage** as a `**Stage:** implementing` line at the top of the ledger. The stage records how
  far this scope has moved through the chain of commands that follow you, and it names the last completed
  step: `implementing`, `merged`, `reviewed`, `documented` (or `documented-unreviewed` when `/superdev:document`
  ran before `/superdev:review` did), `shipped` (ADR 0013). You own the first two. `/superdev:status` reads
  the line, and each later command in the chain writes its own value.

## Issue status (move issues along the tracker's workflow)

`docs/agents/issue-tracker.md` holds a **status map**: superdev's canonical lifecycle (`todo` →
`in-progress` → `in-review` → `merged`/done, plus `blocked`) → the tracker's real statuses. At each
lifecycle point, **move the issue to the mapped status** so anyone watching the tracker sees live progress
— for a local-file store that's editing the slice file's `status:` line, for an issue tracker it's the
mapped transition. Do it **best-effort**: the ledger drives control flow, so if a status write fails, log
it and keep going. Points: dispatch → `in-progress`; entering per-slice review (behavior only) →
`in-review`; BLOCKED → `blocked`; merged → `merged`/done. The **scope anchor** issue — the epic if one
exists, otherwise the lone slice on a single-slice plan — moves to `in-progress` when the run starts, and
**`/superdev:ship` closes it** at the end of the chain, not you: a scope whose slices are all merged still
has to be reviewed, documented, and shipped. On a single-slice plan the lone slice moves to `merged` here
as any slice does, and the same issue carries the scope-level signal it closes on later. (The `lite`
playbook skips the `in-review` transition — it has no per-slice review.)

## Final phase — hand off to `/superdev:review`

Run after your playbook returns (every slice `merged`/committed on the scope branch). Identical across
tiers: your job here is to record that slice execution finished and to name what comes next.

- **Set the stage to `merged`.** Update the ledger's `**Stage:**` line. It is what tells the next command,
  or a resumed run, that every slice is on the scope branch.
- **Leave the run standing.** Keep the worktrees, keep `<run-root>/run.lock`, and leave
  `<run-root>/dod.md` unticked and the scope anchor at `in-progress`. `/superdev:review` and
  `/superdev:document` work in the scope checkout you leave behind, and `/superdev:ship` takes the run
  down. Removing any of it here breaks the rest of the chain.
- **Print the next command, resolved.** Compute `BASE = git merge-base <base> superdev/<scope>` and print
  it with the real commit substituted, so the line is copy-pasteable:
  `/superdev:review <BASE-sha>..superdev/<scope>`. Say in one line what it will do (review the integrated
  scope against the DoD) and stop. **All slices `mechanical`/`docs`** → add that such a scope skips the
  whole-scope review by design (the suite is the net), so `/superdev:document <BASE-sha>..superdev/<scope>`
  is the reasonable next step instead.
- **Report** the scope branch, the slice count, and the commit range. Then stop: no review, no doc pass, no
  pull request, no DoD tick, no cleanup.

## Model selection (always set explicitly)

Every row here is dispatched by the `full` playbook alone. The `lite` playbook dispatches nothing, and the
reviews that follow the chain carry their own model choices.

| Dispatch | Model | When |
|---|---|---|
| implementer / fix | `haiku` | mechanical slice (move, rename, transcription from a complete specification) |
| implementer / fix | `sonnet` | design / multi-file / judgment slice |
| slice-reviewer | `sonnet` | default (verification is load-bearing) |
| simplicity-reviewer | `haiku` | scoped over-engineering scan |

Scale to the slice. Turn count beats token price: the cheapest model often takes 2–3× the turns on
multi-step work. Use a mid-tier floor for anything from a prose specification; reserve `haiku` for transcription
and mechanical fixes.

## Red flags

- **Trusting green** — "tests pass" ≠ correct; the reviewer reads the artifact and hunts uncovered input.
- **Inventing tests for non-behavior slices** — a rename's net is the existing suite.
- **A subagent merging/pushing** — only the controller integrates (`merge-guard` enforces this).
- **Inferring dependencies** — use the plan's `depends-on`; don't guess from file overlap.
- **Stalling for routine approval** — execute the plan continuously; stop only for a real blocker, a
  genuine ambiguity, a plan contradiction, or completion.
- **Re-dispatching a merged slice** — after any compaction, trust the ledger and `git log`.
