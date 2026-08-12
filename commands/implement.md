---
description: Execute a superdev plan — drive its vertical slices to merge as a dependency-ordered DAG, with an execution tier sized to the slice count, then hand off to /superdev:review. Use when a plan exists in the slice store; run /superdev:plan first if not.
argument-hint: "[<feature-label>  (empty = the only plan in the store)]  [--unattended]"
---

# superdev implement

You are the **controller**. You drive a plan's slices to merge, and you alone integrate — never a
subagent. **How** depends on the execution **tier**, a pure function of the loaded slice count (see
**Config + input**). The tier selects one of two linear execution playbooks you `Read` and follow; this
file holds only what both share — the invariants, config, Phase 0, issue-status map, and the handoff.

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
- **A denied dispatch is a degraded pass, not a silent inline step.** Read
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
  `## Degraded passes` section and follow it — do the work inline, say so, and write the `**Degraded:**`
  entry to `<run-root>/ledger.md` with the `scope.js degraded add` verb that section names.
  **`--unattended` → block** there instead.
- **Agents carry their own discipline.** Implementers own test-first TDD; reviewers own "green ≠ correct"
  and hunting uncovered input; `mechanical`/`docs` slices invent no tests — the runs already in the loop,
  plus the scope's one full-suite run (ADR 0025), are the net. Don't re-teach any of it when dispatching —
  pass specifics, not lectures.

## Config + input

- Read `docs/agents/issue-tracker.md` (slice store), `docs/agents/code-management.md` (code host),
  `docs/agents/documentation.md` (in-repo documentation convention), and `docs/agents/knowledge-base.md`
  (optional KB). Slice store or code host missing → run **`/superdev:setup`**, then continue. **Advisory:**
  if `docs/agents/toolchain.md` is absent while the repo has build/package manifests (`package.json`,
  `*.csproj`/`*.sln`, `pom.xml`/`build.gradle*`, `pyproject.toml`, `Cargo.toml`, `go.mod`, …), suggest the
  user run **`/superdev:setup`** to record the toolchain — non-blocking, then continue.
- **Resolve `$ARGUMENTS` to one feature.** Take `--unattended` out first, wherever it sits — it is the
  token below, not a feature label. A **feature label** names which planned feature to build — the
  feature's slice-store label per `docs/agents/issue-tracker.md`, in that store's own shape. It carries a
  **change type** and a slug (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The change type`):
  the type is this run's branch prefix and the slug is this run's scope, so `fix/lite-perf` gives scope
  `lite-perf`, branch `fix/lite-perf`, and run root `.superdev/scopes/lite-perf/`. One value
  therefore fixes the epic, the slices, the branch, and the run root together, and Phase 0 skips its
  scope-naming step. **Whichever route below resolves the label, it must pass
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s scope-slug rule, both segments** — its type as well
  as its slug, because the whole label becomes the branch this run cuts. Anything else → say so, naming
  which segment failed, and stop, creating no run root and cutting no branch.
  - **A label given** → load the anchor carrying it, per the store's `## Scope anchor` contract
    (`docs/agents/issue-tracker.md`) — an epic on a multi-slice plan, or the lone slice itself on a
    single-slice plan (ADR 0017) — plus every slice carrying it. On a single-slice plan those two sets are
    one issue, loaded once: the anchor *is* the slice, so a plan that loaded both would implement its lone
    slice twice. The store knows no such label at all (no
    anchor and no slice carries it) → say so and stop, and create no run root. **The anchor is an epic
    that carries no slices** → say so, point at **`/superdev:plan`**, and stop — this never fires for a
    single-slice plan, whose anchor is its own slice rather than an empty epic.
    **`--unattended` → block**.
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
  configured, overridden, or persisted (`/superdev:plan` and `/superdev:implement` derive it the same way
  from the same count). Do **Phase 0** below (either tier), then `Read` your playbook and follow it start
  to finish:
  - `full` → `${CLAUDE_PLUGIN_ROOT}/references/implement-full.md`
  - `lite` → `${CLAUDE_PLUGIN_ROOT}/references/implement-lite.md`
  When it returns, do the **Final phase** below.

## Phase 0 — Definition of done + ledger (always first)

- **Commit + push the base first.** Ensure the glossary (`CONTEXT.md`), ADRs (`docs/adr/`), and
  `.claude/rules/` are committed on the base branch — worktrees are clean checkouts, so uncommitted
  design docs never reach them and a path-scoped rule that isn't committed can't auto-load. If any are
  dirty/untracked, commit them to base now — but **check `git rev-parse --abbrev-ref HEAD` first, and
  only commit when the invoking checkout is on the base branch.** It is on any other branch → name the
  branch you found and the base you wanted, write nothing, and stop; the maintainer commits or switches,
  then re-runs. **`--unattended` → block**, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
  **Unattended** section. A previous `full`-tier run leaves its scope branch checked out here, and a
  maintainer may simply be standing on their own branch — committing design docs to either one puts them
  where no worktree branches from, which is the failure this step exists to prevent. **Nothing dirty →
  the branch check does not apply**: whatever branch you are on, both playbooks cut from `<base>`
  explicitly, so the topology is unaffected — move on to the push check below. Then compare `<base>`
  against its upstream and push it by explicit refspec (`git push <remote> <base>`) if it's ahead — never
  by switching onto it — because the PR you open later diffs against the remote base, and an unpushed
  local commit there diverges into a stranded duplicate once the PR is squash-merged.
- **Run root (per scope).** Fix this run's **scope** `<scope>` and its **change type** `<type>` now — both
  read off the feature label when **Config + input** resolved one, and otherwise a short feature-slug you
  choose (e.g. `lite-perf`) plus the Conventional Commits type of the work
  (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The change type`). The
  **scope branch** is `<type>/<scope>` — the feature label verbatim — created in your playbook's branch
  model. All
  artifacts for this run live under a per-scope run root **`.superdev/scopes/<scope>/`** — keyed on the bare slug,
  so the type never becomes a second path segment — **git-ignored**
  (ensure `.superdev/` is in the repo's `.gitignore`; add it if absent). The run root
  (`dod.md`, `ledger.md`, `run.lock` — the last lite-tier only, per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The run lock`) stays in the **invoking checkout**
  (the repo's main tree), never moves into a worktree; only the code checkout moves into a worktree.
  **Address it by absolute path.**
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
- Create the **ledger** with `scope.js init` — run, from the invoking checkout:

  ```sh
  echo '{"anchor": "<key> — <title>", "slices": [{"id": "01", "issue": "…", "title": "…", "type": "…", "depends-on": "…"}, …]}' \
    | node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" init <type>/<scope>
  ```

  `scope.js` owns the ledger's schema (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The
  ledger`, ADR 0022) and this one call does the run-root bookkeeping: it validates both label segments,
  refuses only when `<run-root>/ledger.md` already exists (the run root itself may already hold
  `dod.md`, written above — `init` tolerates that and creates the ledger into it), ensures `.superdev/`
  is git-ignored, and writes the ledger — the slice
  table from your JSON, a `**Stage:** implementing` line, a `**Branch:** <type>/<scope>` line (the branch
  is not computable from the slug, and `/superdev:ship` receives a slug — ADR 0021), and the `**Anchor:**`
  line from the store's `## Scope anchor` contract (`docs/agents/issue-tracker.md`) — the anchor's key and
  title — so `/superdev:review` can read the anchor's title back instead of deriving one from the diff.
  **Resuming a Phase 0 that already ran** — `<run-root>/ledger.md` already present — skip `init` and go
  on to your playbook; its **Resume** section reconciles the ledger against `git log`.
  The stage records how far this scope has moved through the chain, naming the last completed step:
  `implementing`, `merged`, `reviewed`, `documented` (or `documented-unreviewed` when `/superdev:document`
  ran before `/superdev:review` did), `shipped` (ADR 0013). You own the first two. Every later ledger
  write in this run goes through a `scope.js` verb too (`stage`, `slice`, `degraded add`) — the
  `ledger-guard` hook denies any other write path.

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
has to be reviewed, documented, and shipped. **On a single-slice plan the anchor rule wins.** Its lone
issue is both the slice and the anchor. It stays `in-progress` through the merge, and closes once, when
`/superdev:ship` runs. (The `lite` playbook skips the `in-review` transition — it has no per-slice
review.)

## Final phase — hand off to `/superdev:review`

Run after your playbook returns (every slice `merged`/committed on the scope branch). Identical across
tiers: your job here is to record that slice execution finished and to name what comes next.

- **All slices `mechanical`/`docs`? Run the full suite before writing the stage.** Such a scope skips the
  whole-scope review by design — there is no Definition-of-Done judgment to attach one to — so this phase
  attempts that scope's one full-suite run itself, once, in place of that review, before the pull request
  (ADR 0025). Read
  `docs/agents/verification.md` for the full command per
  `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md` and run it once over the scope branch. **No test
  command configured, or Green** → continue to the stage write below; a repo that configures nothing
  loses nothing it had, and claims no run it never made. **Denied by the permission classifier** → this is
  `## Degraded passes`'s second shape: the pass ran and could not reach what it needed. Its own action is
  record and continue regardless of attendance — but this is the only full-suite verification a
  `mechanical`/`docs` scope gets, since it skips `/superdev:review` by design, so continuing unattended
  would reach `/superdev:ship` with no suite run behind it anywhere in the chain: a **local deviation**
  from that default, for that reason. **Attended** → write the `**Degraded:**` entry
  (`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" degraded add "<text>" --root <run-root>`, per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes` section, second shape) naming the
  denial, and continue to the stage write below. **Unattended** → **block** instead, per that file's
  `## Unattended` section, for the reason above. **Red** → do **not** write the stage — leave it
  where it is, and dispatch **one** `superdev:implementer` (`model: sonnet`; `haiku` only for a mechanical
  fix) with the failing output — never fix it yourself inline: the controller only integrates, and lite's
  inline loop is that tier's own deliberate exception (ADR 0001), not this phase's. Every fix opens with a
  RED test that reproduces the failure. Re-run the full suite after it returns; repeat until green or three
  cycles without going clean (this bullet's own 3-strike cap — a scope-wide suite has no single slice to
  move to `blocked`, so the remedy is here, not in the controller's Invariants: stop, say so, and leave the
  stage where it is).
- **Set the stage to `merged`.** Run
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set merged --root <run-root>`. The ledger's
  `**Stage:**` line is what tells the next command, or a resumed run, that every slice is on the scope
  branch.
- **Leave the run standing.** Keep the worktrees, keep `<run-root>/run.lock` (lite tier — the only tier
  that has one), and leave
  `<run-root>/dod.md` unticked and the scope anchor at `in-progress`. `/superdev:review` and
  `/superdev:document` work in the scope checkout you leave behind, and `/superdev:ship` takes the run
  down. Removing any of it here breaks the rest of the chain.
- **Print the next command, resolved.** Compute `BASE = git merge-base <base> <type>/<scope>` and print
  it with the real commit substituted, so the line is copy-pasteable:
  `/superdev:review <BASE-sha>..<type>/<scope>`. Say in one line what it will do (review the integrated
  scope against the DoD) and stop. **All slices `mechanical`/`docs`** → print
  `/superdev:document <BASE-sha>..<type>/<scope>` instead of the review command, and say in one line that
  it will do so because this scope's slices carry no whole-scope review. The full suite above already ran
  and left one of three outcomes:
  - **Green.**
  - **No test command configured.**
  - **A denied test command, recorded and continued attended** (ADR 0025).
- **Report** the scope branch, the slice count, and the commit range. Then stop: no review, no doc pass, no
  pull request, no DoD tick, no cleanup.

## Model selection (always set explicitly)

Every row here is dispatched by the `full` playbook alone; the reviews that follow the chain carry their
own model choices.

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

- **Inventing tests for non-behavior slices** — a rename's net is the existing suite.
- **Inferring dependencies** — use the plan's `depends-on`; don't guess from file overlap.
- **Stalling for routine approval** — execute the plan continuously; stop only for a real blocker, a
  genuine ambiguity, a plan contradiction, or completion.
