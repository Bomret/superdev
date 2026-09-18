---
name: implement
description: Execute a superdev plan — drive its vertical slices to merge as a dependency-ordered DAG, with an execution tier sized to the slice count, then hand off to the next command in the chain. Use when a plan exists in the slice store; run /superdev:plan first if not.
argument-hint: "[<feature-label>  (empty = the only plan in the store)]  [--unattended]"
---

# superdev implement

You are the **controller**. You drive a plan's slices to merge, and you alone integrate — never a
subagent. The **tier**, a pure function of the loaded slice count, picks one of two playbooks you `Read`
and follow. This file holds what both share.

**You stop when the code is on the scope branch.** Review, docs, and the pull request are the next three
commands in the chain, each run by the maintainer (ADR 0013) — hand off rather than running them here. The
one exception is the `lite` tier's inline documentation pass, which that playbook runs in this same
worktree before run handoff (ADR 0031).

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
  and write the `**Degraded:**` entry — `scope.js degraded add` for an authoring dispatch (implementer,
  fix), `scope.js degraded add-denial` for a denied verification dispatch, quoting the classifier's
  refusal — then publish the snapshot, per that file's `## Publishing run state` section. **`--unattended`**
  → a denied implementer
  or fix blocks at every tier, per ADR 0001; a denied verification dispatch follows that section's
  authorship rule instead — block where the controller authored what the pass verifies, and otherwise do
  the pass inline as above, up to that section's cap: read `scope.js get denials` after writing the entry
  and block once the count reaches it.
- **Agents carry their own discipline.** Pass specifics, not lectures. `mechanical`/`docs` slices invent
  no tests — the loop's runs plus the scope's full-suite run at `/superdev:review` are the net
  (ADR 0025, ADR 0075).

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
  `.superdev/scopes/lite-perf/`, and run init skips its scope-naming step. **The label must pass
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
- **Check the feature is released** (`plan-contract.md` → *Release*). The signal and the call that reads
  it live in `docs/agents/issue-tracker.md`'s `## Release` section; read it off the **scope anchor**, whose
  release covers every slice beneath it. **Released** → continue silently. **Unreleased** → stop while
  nothing exists yet (no run root, no branch), name the feature and the signal it lacks, and ask the user
  whether to implement it anyway. A yes runs the feature unchanged, and leaves the signal unapplied:
  releasing the plan in the tracker stays the human's own act. **`--unattended` → block** — `/superdev:afk`
  passes over an unreleased feature, so this stop means one was named on the command line.
- **`--unattended` present** → read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended**
  section and follow it wherever this command or its playbook asks a question or starts an interview
  command (`/superdev:setup`, `/superdev:plan`). The "slice store or code host missing" and "no slices"
  stops above are exactly that: block there instead of running the interview. Nothing else in that file
  applies here.
- **Pre-flight scan:** read all slices once for contradictions (slice vs slice, slice vs DoD, a
  specification mandating something a review would flag). Batch what you find to the user; clean →
  proceed silently. **`--unattended` → block**, naming the contradictions.
- **Compute the tier** — **≤3 slices → `lite`**, **>3 → `full`** — derived fresh every run, never
  configured or persisted (`/superdev:plan` derives it the same way). `Read` your playbook and follow it
  start to finish:
  - `full` → `${CLAUDE_PLUGIN_ROOT}/references/implement-full.md`
  - `lite` → `${CLAUDE_PLUGIN_ROOT}/references/implement-lite.md`
  Each playbook ends by reading `${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md`.

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

## Model selection (always set explicitly)

`full` dispatches every row; `${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md`'s run handoff dispatches the
implementer row on a red full suite, which is the one row `lite` reaches. The reviews later in the chain
carry their own model choices.

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
