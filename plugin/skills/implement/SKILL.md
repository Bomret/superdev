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
scopetree before run handoff (ADR 0031).

Every message this command ends on closes with the Next block, per `${CLAUDE_PLUGIN_ROOT}/references/response-shapes.md`'s `## The Next block` section (INV-0111). That covers the next command run handoff prints (`${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md`).

**Core principle:** a slice's green suite proves its fixtures pass, not that it's correct. `full`
re-verifies each slice with reviewer subagents and integrates serially; `lite` leans on the whole-scope
review `/superdev:review` runs next.

`full` dispatches `superdev:implementer`, `superdev:slice-reviewer`, and `superdev:simplicity-reviewer`
with per-slice specifics, not the whole plan; their discipline lives in their own bodies. `lite`
dispatches nothing — you carry the TDD discipline yourself. Narrate at most one line between dispatches.

## Invariants (both playbooks)

- **The 3-strike fix loop caps at a wrong cut, not a bug.** 3 cycles without going clean, every cycle
  counting whichever findings drove it: a remaining Critical or Important finding means the slice is a
  hidden dependency or too big — move it → `blocked` and escalate (re-slice, or hand to the human). A
  remainder of only Minor findings proceeds, named in the report and nowhere else. A slice whose only
  remaining Critical or Important finding is **Missing RED** proceeds too, and the run's final report names
  the finding with its slice; **Missing RED** beside another Critical or Important finding blocks. Never a
  fourth cycle. **A clean verdict ends the loop the same way, attended or unattended** — a finding the
  loop leaves outside its fix list is a follow-up, never a fourth cycle.
- **The RED-test rule is conditional.** A fix for a finding that names failing behaviour opens with a RED
  test reproducing it. A fix for a finding that names none (style, naming, doc polish) takes no RED test,
  and the re-review verifies it by reading. The implementer's report names which rule it applied to each
  finding.
- **A fix reconciles every sibling surface.** Every fix dispatch tells the implementer to search its own
  checkout for every other place that states the rule or behaviour the fix changes, bring each one into
  agreement, and report each place it checked and each it changed. A place outside its checkout is
  reported unedited. The `AGENTS.md` hierarchy and the knowledge base are reported unedited too, since
  the doc pass owns them (INV-0120). A fix report that omits the checked-and-changed list is a report
  defect, sent back to the implementer before the next step. Before the next step, the controller greps
  the checkout for the key phrase of the rule the fix changed, in its old wording and its new, and
  compares the hits with the report's checked list. A hit in a file the list does not name is a missed
  sibling surface, sent back to the implementer with the hit named, in the same cycle. A hit in the
  `AGENTS.md` hierarchy or the knowledge base is named in the controller's report instead. A hit in
  `CHANGELOG.md` is release history and needs no change.
- **An observation is captured the moment you meet it.** Read
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Observations` section and follow it: a defect a
  dispatched agent's report surfaces, or one you meet yourself, that no slice of this scope covers and the
  scope did not cause gets a triage record from you, the controller, right here — never held until the
  handoff at the end of the chain.
- **The ledger is your recovery map.** After compaction, trust the ledger and `git log` over memory. A
  slice marked `merged` is done — never re-dispatch it.
- **Hook-enforced, don't restate:** only the controller merges/pushes (`merge-guard`); every dispatch sets
  an explicit `model` (`model-explicit`).
- **A denied dispatch is a degraded pass, not a silent inline step.** Follow
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes` section: work inline, say so,
  and write the `**Degraded:**` entry — `scope.js degraded add` for an authoring dispatch (implementer,
  fix), `scope.js degraded add-denial -` for a denied verification dispatch, piping the classifier's
  refusal through a quoted heredoc rather than a shell argument — then publish the snapshot, per that
  file's `## Publishing run state` section. **`--unattended`**
  → a denied implementer
  or fix blocks at every tier, per ADR 0001; a denied verification dispatch follows that section's
  authorship rule instead — block where the controller authored what the pass verifies, and otherwise do
  the pass inline as above, up to that section's cap: read `scope.js get denials` after writing the entry
  and block once the count reaches it.
- **Agents carry their own discipline.** Pass specifics, not lectures. `mechanical`/`docs` slices invent
  no tests — the loop's runs plus the full suite that runs once at run handoff, for every scope, are the
  net (ADR 0025, ADR 0075, ADR 0091).

## Config + input

- Read `docs/agents/issue-tracker.md` (slice store), `docs/agents/code-management.md` (code host),
  `docs/agents/documentation.md` (documentation convention), `docs/agents/knowledge-base.md` (optional
  KB), `docs/agents/verification.md` (test command). Slice store or code host missing → call
  the Skill tool with `superdev:setup` (no argument: the full setup), then continue. **`docs/agents/verification.md` carrying one fenced block** is
  missing configuration too — its focused command was never recorded (ADR 0085, INV-0007) → call the
  Skill tool with `superdev:setup` (no argument: the full setup), then continue; a repository with no `docs/agents/verification.md` at all needs no
  such command, and neither does one carrying zero fenced blocks — `hooks/green-gate.js` reads that
  exactly as it reads an absent file. **Advisory:** `docs/agents/toolchain.md` absent while the repo has
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
  - **Empty** → this command's own **candidate set** (CONTEXT.md) is the features whose slices are ready,
    computed from the slice store over that store's own calls. Hand that set to
    `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Resolving an empty argument` cascade,
    restating no part of it here. **One local override ahead of the cascade**: no candidate → call the Skill tool with
    `superdev:plan`, and stop once plan ends, rather than the cascade's own report-and-stop: plan's Next
    block names the implement command to run next.
- **Load the slices** (`id`, `depends-on`, `test-applicability`, `spec`, `acceptance`, + global DoD). No
  slices → call the Skill tool with `superdev:plan`, and stop once plan ends: its Next block names this
  command. **One slice, no epic** → the epic is optional
  (`plan-contract.md`): the DoD is that slice's `acceptance`. Verifying an `acceptance` criterion
  observes; it changes no system outside the repository (ADR 0084, INV-0006). A criterion needing a
  deploy, a migration, or any other outward-facing change to verify gets no increment: report it as
  needing verification after merge, naming the outward-facing change it needs.
- **Check the feature is released** (`plan-contract.md` → *Release*). The signal and the call that reads
  it live in `docs/agents/issue-tracker.md`'s `## Release` section; read it off the **scope anchor**, whose
  release covers every slice beneath it. **Released** → continue silently. **Unreleased** → stop while
  nothing exists yet (no run root, no branch), name the feature and the signal it lacks, and ask the user
  whether to implement it anyway. A yes runs the feature unchanged, and leaves the signal unapplied:
  releasing the plan in the tracker stays the human's own act. **`--unattended` → block** — an
  unattended run never confirms an unreleased feature.
- **`--unattended` present** → read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended**
  section and follow it wherever this command or its playbook asks a question or starts an interview
  command (`/superdev:setup`, `/superdev:plan`). Every Skill-tool stop above is exactly that — slice store
  or code host missing, `docs/agents/verification.md` carrying one fenced block, no candidate, and no
  slices: block there instead of running the interview. Nothing else in that file
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
status** at each point so the tracker shows live progress through the mapped transition. **Best-effort**: the ledger drives control
flow, so log a failed status write and keep going. Points: dispatch → `in-progress`; entering per-slice
review (behavior only) → `in-review`; BLOCKED → `blocked`; merged → `merged`/done.

The **scope anchor** — the epic, or the lone slice on a single-slice plan — moves to `in-progress` when
the run starts, and you do not close it: **`/superdev:wrap-up` closes it**. **On a single-slice plan the
anchor rule wins**: that one issue stays `in-progress` through the merge and closes once, at wrap-up. (`lite` skips the
`in-review` transition — it has no per-slice review.)

## Model selection (always set explicitly)

`full` dispatches every row; `${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md`'s run handoff dispatches the
implementer row on a red full suite, which is the one row `lite` reaches. The reviews later in the chain
carry their own model choices.

| Dispatch | Model | When |
|---|---|---|
| implementer / fix | `haiku` | mechanical slice (move, rename, format change), transcription from a complete specification, or a fix list in which every finding is a mechanical finding |
| implementer / fix | `sonnet` | design / multi-file / judgment slice, or a fix list with any other finding |
| slice-reviewer | `opus` | default (verification is load-bearing) |
| simplicity-reviewer | `sonnet` | scoped over-engineering scan |

Scale the implementer to the slice. Turn count beats token price: the cheapest model often takes 2–3× the
turns on multi-step work. Mid-tier floor for an implementer working from a prose specification; `haiku`
for transcription and for a fix list in which every finding is a mechanical finding, one whose fix
changes no stated rule or behaviour (a rename, a rewrap, a typo). A fix that changes a rule or behaviour
any surface states needs the sibling-surface search, so it stays off `haiku`. The two review rows are fixed,
not scaled: measured runs showed
the `opus` slice review catching findings the mid-tier missed, and the mid-tier over-engineering pass
finding duplication the smallest model reported as lean (ADR 0118).

## Red flags

- **Inventing tests for non-behavior slices** — a rename's net is the existing suite.
- **Inferring dependencies** — use the plan's `depends-on`; don't guess from file overlap.
- **Stalling for routine approval** — stop only for a real blocker, a genuine ambiguity, a plan
  contradiction, or completion.
