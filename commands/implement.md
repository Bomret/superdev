---
description: Execute a superdev plan — drive its vertical slices to merge as a dependency-ordered DAG, with an execution tier sized to the slice count, then hand off to /superdev:review. Use when a plan exists in the slice store; run /superdev:plan first if not.
argument-hint: "[<feature-label>  (empty = the only plan in the store)]  [--unattended]"
---

# superdev implement

You are the **controller**. You drive a plan's slices to merge, and you alone integrate — never a
subagent. The **tier**, a pure function of the loaded slice count, picks one of two playbooks you `Read`
and follow. This file holds what both share.

**You stop when the code is on the scope branch.** Review, docs, and the pull request are the next three
commands in the chain, each run by the maintainer (ADR 0013). Do none of them here — hand off.

**Core principle:** a slice's green suite proves its fixtures pass, not that it's correct. `full`
re-verifies each slice with reviewer subagents and integrates serially; `lite` leans on the whole-scope
review `/superdev:review` runs next.

`full` dispatches `superdev:implementer`, `superdev:slice-reviewer`, and `superdev:simplicity-reviewer`
with per-slice specifics, not the whole plan; their discipline lives in their own bodies. `lite`
dispatches nothing — you carry the TDD discipline yourself. Narrate at most one line between dispatches.

## Invariants (both playbooks)

- **The 3-strike fix loop caps at a wrong cut, not a bug.** 3 cycles without going clean → the slice is a
  hidden dependency or too big: move it → `blocked` and escalate (re-slice, or hand to the human). Never a
  fourth cycle.
- **Every fix opens with a RED test** reproducing the bug.
- **The ledger is your recovery map.** After compaction, trust the ledger and `git log` over memory. A
  slice marked `merged` is done — never re-dispatch it.
- **Hook-enforced, don't restate:** only the controller merges/pushes (`merge-guard`); every dispatch sets
  an explicit `model` (`model-explicit`).
- **A denied dispatch is a degraded pass, not a silent inline step.** Follow
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes` section: work inline, say so,
  write the `**Degraded:**` entry with `scope.js degraded add`. **`--unattended` → block** instead.
- **Agents carry their own discipline.** Pass specifics, not lectures. `mechanical`/`docs` slices invent
  no tests — the loop's runs plus the scope's one full-suite run are the net (ADR 0025).

## Config + input

- Read `docs/agents/issue-tracker.md` (slice store), `docs/agents/code-management.md` (code host),
  `docs/agents/documentation.md` (documentation convention), `docs/agents/knowledge-base.md` (optional
  KB), `docs/agents/verification.md` (test command). Slice store or code host missing → run
  **`/superdev:setup`**, then continue. **Advisory:** `docs/agents/toolchain.md` absent while the repo has
  build manifests (`package.json`, `*.csproj`/`*.sln`, `pom.xml`/`build.gradle*`, `pyproject.toml`,
  `Cargo.toml`, `go.mod`, …) → suggest **`/superdev:setup`**; non-blocking, continue.
- **Resolve `$ARGUMENTS` to one feature.** Take `--unattended` out first, wherever it sits. A **feature
  label** is the feature's slice-store label per `docs/agents/issue-tracker.md`, in that store's shape. It
  carries a **change type** and a slug (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
  `## The change type`): `fix/lite-perf` gives scope `lite-perf`, branch `fix/lite-perf`, run root
  `.superdev/scopes/lite-perf/`, and Phase 0 skips its scope-naming step. **The label must pass
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s scope-slug rule, both segments** — the whole label
  becomes this run's branch. Fails → say which segment, stop, create no run root and cut no branch.
  - **A label given** → load the anchor carrying it, per the store's `## Scope anchor` contract
    (`docs/agents/issue-tracker.md`) — an epic on a multi-slice plan, the lone slice itself on a
    single-slice plan (ADR 0017) — plus every slice carrying it. On a single-slice plan the anchor *is*
    the slice: load that one issue once, or you implement it twice. Label unknown to the store → say so
    and stop, creating no run root. **Anchor is an epic carrying no slices** → say so, point at
    **`/superdev:plan`**, stop. **`--unattended` → block**.
  - **Empty** → exactly one feature has slices ready → use it. Several → name them and ask which;
    **`--unattended` → block**. None → run **`/superdev:plan`** first.
- **Load the slices** (`id`, `depends-on`, `test-applicability`, `spec`, `acceptance`, + global DoD). No
  slices → run **`/superdev:plan`** first. **One slice, no epic** → the epic is optional
  (`plan-contract.md`): the DoD is that slice's `acceptance`.
- **`--unattended` present** → read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended**
  section and follow it wherever this command or its playbook asks a question or starts an interview
  command (`/superdev:setup`, `/superdev:plan`). The "slice store or code host missing" and "no slices"
  stops above are exactly that: block there instead of running the interview. Nothing else in that file
  applies here.
- **Pre-flight scan:** read all slices once for contradictions (slice vs slice, slice vs DoD, a
  specification mandating something a review would flag). Batch what you find to the user; clean →
  proceed silently. **`--unattended` → block**, naming the contradictions.
- **Compute the tier** — **≤3 slices → `lite`**, **>3 → `full`** — derived fresh every run, never
  configured or persisted (`/superdev:plan` derives it the same way). Do **Phase 0**, then `Read` your
  playbook and follow it start to finish:
  - `full` → `${CLAUDE_PLUGIN_ROOT}/references/implement-full.md`
  - `lite` → `${CLAUDE_PLUGIN_ROOT}/references/implement-lite.md`
  When it returns, do the **Final phase**.

## Phase 0 — Definition of done + ledger (always first)

- **Commit + push the base first.** The glossary (`CONTEXT.md`), ADRs (`docs/adr/`), and `.claude/rules/`
  must be committed on the base branch — worktrees are clean checkouts, so uncommitted design docs never
  reach them. Any dirty/untracked → commit to base, but **check `git rev-parse --abbrev-ref HEAD` first
  and only commit when the invoking checkout is on the base branch.** Any other branch → name the branch
  you found and the base you wanted, write nothing, stop. **`--unattended` → block**, per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended** section. **Nothing dirty → the branch
  check does not apply.** Then push `<base>` by explicit refspec (`git push <remote> <base>`) if it's
  ahead of upstream — never by switching onto it. The PR diffs against the remote base.
- **Run root (per scope).** Fix this run's **scope** `<scope>` and **change type** `<type>` now — off the
  feature label if one resolved, else a short feature-slug you choose (e.g. `lite-perf`) plus the
  Conventional Commits type (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The change type`). The
  **scope branch** is `<type>/<scope>`, the feature label verbatim, cut by your playbook's branch model.
  Every artifact lives under the run root **`.superdev/scopes/<scope>/`** — bare slug, so the type never
  becomes a second path segment — **git-ignored** (add `.superdev/` to `.gitignore` if absent). The run
  root (`dod.md`, `ledger.md`, `run.lock` — lite tier only, per that file's `## The run lock`) stays in
  the **invoking checkout** and never moves into a worktree; only the code checkout does.
  **Capture `<run-root>` as an absolute path now**, while the invoking checkout is your cwd, and address
  every artifact as `<run-root>/dod.md`, `<run-root>/ledger.md`, `<run-root>/run.lock`,
  `<run-root>/reports/<id>/…`, `<run-root>/interfaces.md`. Hand subagents that absolute path: a relative
  one resolves a level too deep from a worktree cwd. Namespacing by `<scope>` is what lets scope runs go
  in parallel. Nothing in the run root is committed or lands in the PR.
- **Write the DoD** — the global verification plan, made concrete and checkable — to `<run-root>/dod.md`.
  `/superdev:review` reviews against it and `/superdev:ship` ticks it. No DoD → don't proceed. **No epic**
  → write the lone slice's `acceptance` verbatim.
- **Create the ledger** with `scope.js init`, from the invoking checkout, carrying each slice's real
  **`status`**, mapped through `${CLAUDE_PLUGIN_ROOT}/references/plan-contract.md`'s
  `## Slice lifecycle & status`. A slice the store reports as **merged seeds `merged`, and is never
  dispatched**. Omit the field and every row seeds `todo`, so a second run over an appended feature
  (`docs/adr/0004-plan-append-semantics.md`) rebuilds what already shipped:

  ```sh
  echo '{"anchor": "<key> — <title>", "slices": [{"id": "01", "issue": "…", "title": "…", "type": "…", "depends-on": "…", "status": "…"}, …]}' \
    | node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" init <type>/<scope>
  ```

  `scope.js` owns the ledger schema (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The ledger`,
  ADR 0022). This one call validates both label segments, refuses only when `<run-root>/ledger.md` already
  exists (a `dod.md` already there is fine), ensures `.superdev/` is git-ignored, and writes the ledger:
  the slice table, `**Stage:** implementing`, `**Branch:** <type>/<scope>` (the branch is not computable
  from the slug, and `/superdev:ship` receives a slug — ADR 0021), and the `**Anchor:**` line — the
  anchor's key and title, per the store's `## Scope anchor` contract — which `/superdev:review` reads back
  instead of deriving a title from the diff.

  **`<run-root>/ledger.md` already present** → read its stage:
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get stage --root <run-root>`.
  - **`shipped`** — a finished run — rename it to `ledger-shipped-<date>.md` (`date +%FT%H%M%S`, precise
    enough that two same-day rotations never collide), then run `init`, which writes a fresh ledger beside
    it. A rotation never overwrites an existing `ledger-shipped-<date>.md` and nothing is deleted, so ADR
    0007's seven-day trail and `scope-prune`'s reap-on-merge rule both stand unchanged. Rotation, not
    deletion, is what lets a second run over an appended feature (ADR 0004) begin.
  - **`implementing`, `merged`, `reviewed`, `documented`, or `documented-unreviewed`** — Phase 0 already
    ran: skip `init`, go to your playbook; its **Resume** section reconciles the ledger against `git log`.

  The stage names the last completed step (`documented-unreviewed` = `/superdev:document` ran before
  `/superdev:review`; ADR 0013). You own `implementing` and `merged`. Every later ledger write goes
  through a `scope.js` verb (`stage`, `slice`, `degraded add`) — `ledger-guard` denies any other path.
- **Name this run's kind and hand it to your playbook.** A ledger you wrote with `init` is **`fresh`**, a
  `shipped` ledger you rotated aside is **`appended`**, a live ledger you skipped `init` for is
  **`resumed`**. State which when you `Read` your playbook; its branch model acts on that value, per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Cutting the scope branch`. One determination,
  made here (ADR 0028).

## Issue status (move issues along the tracker's workflow)

`docs/agents/issue-tracker.md` holds a **status map**: superdev's lifecycle (`todo` → `in-progress` →
`in-review` → `merged`/done, plus `blocked`) → the tracker's real statuses. **Move the issue to the mapped
status** at each point so the tracker shows live progress — a local-file store edits the slice file's
`status:` line, an issue tracker does the mapped transition. **Best-effort**: the ledger drives control
flow, so log a failed status write and keep going. Points: dispatch → `in-progress`; entering per-slice
review (behavior only) → `in-review`; BLOCKED → `blocked`; merged → `merged`/done.

The **scope anchor** — the epic, or the lone slice on a single-slice plan — moves to `in-progress` when
the run starts, and **`/superdev:ship` closes it**, not you. **On a single-slice plan the anchor rule
wins**: that one issue stays `in-progress` through the merge and closes once, at ship. (`lite` skips the
`in-review` transition — it has no per-slice review.)

## Final phase — hand off to `/superdev:review`

Run after your playbook returns (every slice `merged`/committed on the scope branch). Identical across
tiers: record that slice execution finished, name what comes next.

- **All slices `mechanical`/`docs`? Run the full suite before writing the stage.** Such a scope skips the
  whole-scope review by design, so this phase attempts that scope's one full-suite run itself, once, in
  place of that review, before the pull request (ADR 0025). Take the full command from
  `docs/agents/verification.md` per `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md` and run it once
  over the scope branch.
  - **No test command configured** → continue to the stage write.
  - **Green** → clear any standing `**Unresolved:**` entry (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
    `## Unresolved defects`) with
    `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved clear --root <run-root>` — a no-op when there
    is none — then continue to the stage write.
  - **Denied by the permission classifier** → `## Degraded passes`'s second shape. Its default is record
    and continue regardless of attendance; **local deviation**, because this is the only full-suite run a
    `mechanical`/`docs` scope gets and unattended would reach `/superdev:ship` with none behind it.
    **Attended** → write the `**Degraded:**` entry
    (`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" degraded add "<text>" --root <run-root>`) naming the
    denial, continue to the stage write. **Unattended** → **block**, per that file's `## Unattended`
    section.
  - **Red** → do **not** write the stage. Dispatch **one** `superdev:implementer` (`model: sonnet`;
    `haiku` only for a mechanical fix) with the failing output — never fix it inline: the controller only
    integrates, and lite's inline loop is that tier's own exception (ADR 0001), not this phase's. Every
    fix opens with a RED test. Re-run the full suite; repeat until **green** (then clear `**Unresolved:**`
    as above and continue), **or three cycles without going clean** — this bullet's own 3-strike cap,
    since a scope-wide suite has no slice to block. Stop, say so, write the `**Unresolved:**` entry with
    `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" unresolved add "<text>" --root <run-root>`, leave the
    stage where it is.
- **Set the stage to `merged`:**
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" stage set merged --root <run-root>`. The `**Stage:**`
  line is what tells the next command, or a resumed run, that every slice is on the scope branch.
- **Leave the run standing.** Keep the worktrees and `<run-root>/run.lock` (lite tier), leave
  `<run-root>/dod.md` unticked and the anchor at `in-progress`. `/superdev:review` and
  `/superdev:document` work in the scope checkout you leave behind; `/superdev:ship` takes the run down.
- **Print the next command, resolved.** Compute `BASE = git merge-base <base> <type>/<scope>` and print
  `/superdev:review <BASE-sha>..<type>/<scope>` with the real commit substituted, plus one line on what it
  does (review the integrated scope against the DoD). **All slices `mechanical`/`docs`** → print
  `/superdev:document <BASE-sha>..<type>/<scope>` instead, and say this scope carries no whole-scope
  review. The full suite above left one of three outcomes:
  - **Green.**
  - **No test command configured.**
  - **A denied test command, recorded and continued attended** (ADR 0025).
- **Report** the scope branch, the slice count, and the commit range. Then stop: no review, no doc pass,
  no pull request, no DoD tick, no cleanup.

## Model selection (always set explicitly)

`full` dispatches every row; the **Final phase** dispatches the implementer row on a red full suite, which
is the one row `lite` reaches. The reviews later in the chain carry their own model choices.

| Dispatch | Model | When |
|---|---|---|
| implementer / fix | `haiku` | mechanical slice (move, rename, transcription from a complete specification) |
| implementer / fix | `sonnet` | design / multi-file / judgment slice |
| slice-reviewer | `sonnet` | default (verification is load-bearing) |
| simplicity-reviewer | `haiku` | scoped over-engineering scan |

Scale to the slice. Turn count beats token price: the cheapest model often takes 2–3× the turns on
multi-step work. Mid-tier floor for anything from a prose specification; `haiku` for transcription and
mechanical fixes.

## Red flags

- **Inventing tests for non-behavior slices** — a rename's net is the existing suite.
- **Inferring dependencies** — use the plan's `depends-on`; don't guess from file overlap.
- **Stalling for routine approval** — stop only for a real blocker, a genuine ambiguity, a plan
  contradiction, or completion.
