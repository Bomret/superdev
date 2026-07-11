---
description: Execute a superdev plan — drive its vertical slices to merge as a dependency-ordered DAG. The execution tier is derived from the loaded slice count: >3 slices run the full playbook (parallel implementer subagents in isolated per-slice worktrees, warrant-gated per-slice review, controller-owned serial merges); ≤3 slices run the lite playbook (controller implements inline in a single scope worktree, test-first, invoking checkout never switched, guarded by a same-scope run lock). Either way, one whole-scope code review gates the PR. Use when a plan exists in the slice store; run /superdev:plan first if not.
---

# superdev implement

You are the **controller**. You drive a plan's slices to merge, and you alone integrate — never a
subagent. **How** depends on the execution **tier**, a pure function of the loaded slice count (see
**Config + input**): **>3 slices → `full`**, **≤3 slices → `lite`**. The tier selects one of two linear
execution playbooks you `Read` and follow; this file holds only what both share — the invariants, config,
Phase 0, issue-status map, and the final review + PR.

**Core principle:** a slice's green suite proves its fixtures pass — not that it's correct. The `full`
playbook re-verifies each slice with separate reviewer subagents and integrates serially; the `lite`
playbook leans on the single whole-scope final review. Either way, one whole-scope review gates the PR.

The `full` playbook's four roles are subagents — `superdev:implementer`, `superdev:slice-reviewer`,
`superdev:simplicity-reviewer`, `superdev:final-reviewer` — whose discipline lives in their own bodies;
you dispatch them with per-slice specifics, not the whole plan. The `lite` playbook dispatches **at most
one** `superdev:final-reviewer` (none for an all-`mechanical`/`docs` plan), plus an `implementer` fix only
if the review finds something; you carry the implementer's TDD discipline yourself. Between dispatches,
narrate at most one short line.

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
- **Agents carry their own discipline.** Implementers own test-first TDD; reviewers own "green ≠ correct"
  and hunting uncovered input; `mechanical`/`docs` slices invent no tests (the suite is the net). Don't
  re-teach any of it when dispatching — pass specifics, not lectures.

## Config + input

- Read `docs/agents/issue-tracker.md` (slice store), `docs/agents/code-management.md` (code host),
  `docs/agents/documentation.md` (in-repo documentation convention), and `docs/agents/knowledge-base.md`
  (optional KB). Slice store or code host missing → run **`/superdev:setup`**, then continue.
- **Load the slices** from the store (per the contract: `id`, `depends-on`, `test-applicability`, `spec`,
  `acceptance`, + global DoD). No slices → run **`/superdev:plan`** first. **Exactly one slice and no
  epic** → the epic was optional (`plan-contract.md`): the DoD is that slice's `acceptance`; there is no
  separate epic to load.
- **Pre-flight scan:** read all slices once for contradictions (a slice that conflicts with another or
  with the DoD; a specification that mandates something a review would flag). Batch anything you find to the user
  before starting. Clean → proceed silently.
- **Compute the tier** — **≤3 slices → `lite`**, **>3 slices → `full`** — derived fresh every run, never
  configured, overridden, or persisted (`/plan` and `/implement` derive it the same way from the same
  count). Do **Phase 0** below (either tier), then `Read` your playbook and follow it start to finish:
  - `full` → `${CLAUDE_PLUGIN_ROOT}/references/implement-full.md`
  - `lite` → `${CLAUDE_PLUGIN_ROOT}/references/implement-lite.md`
  When it returns, do the **Final phase** below.

## Phase 0 — Definition of done + ledger (always first)

- **Run root (per scope).** Choose this run's **scope** `<scope>` now — a short feature-slug (e.g.
  `lite-perf`). The **scope branch** is `superdev/<scope>` (created in your playbook's branch model). All
  artifacts for this run live under a per-scope run root **`.superdev/scopes/<scope>/`** — keyed on the bare slug,
  so it never doubles the branch's `superdev/` prefix into `.superdev/superdev/…` — **git-ignored**
  (ensure `.superdev/` is in the repo's `.gitignore`; add it if absent). The run root
  (`dod.md`, `ledger.md`, `run.lock`) stays in the **invoking checkout** (the repo's main tree), never
  moves into a worktree; only the code checkout moves into a worktree. **Namespacing by `<scope>`** is what
  lets several scope runs execute in parallel — even in separate sessions — without clobbering each
  other's DoD/ledger/reports/worktrees. Nothing in the run root is committed or lands in the PR.
- Write the **global verification plan** (the DoD, made concrete and checkable) to `.superdev/scopes/<scope>/dod.md`.
  It anchors the final review and tells you when to stop. No DoD → don't proceed. **No epic** (a
  single-slice plan) → the DoD is that lone slice's `acceptance`; write it to `dod.md` verbatim.
- Create the **ledger** at `.superdev/scopes/<scope>/ledger.md`. Track each slice's status
  (`todo`/`in-progress`/`in-review`/`merged`), its commit range when merged, and — for issue stores — the
  slice-id ↔ issue-key mapping.

## Issue status (move issues along the tracker's workflow)

`docs/agents/issue-tracker.md` holds a **status map**: superdev's canonical lifecycle (`todo` →
`in-progress` → `in-review` → `merged`/done, plus `blocked`) → the tracker's real statuses. At each
lifecycle point, **move the issue to the mapped status** so anyone watching the tracker sees live progress
— for a local-file store that's editing the slice file's `status:` line, for an issue tracker it's the
mapped transition. Do it **best-effort**: the ledger drives control flow, so if a status write fails, log
it and keep going. Points: dispatch → `in-progress`; entering per-slice review (behavior only) →
`in-review`; BLOCKED → `blocked`; merged → `merged`/done. The **scope anchor** issue — the epic if one
exists, otherwise the lone slice on a single-slice plan — moves to `in-progress` when the run starts and
`merged`/`done` once every slice is merged, covering both the slice transition and the scope-level signal
in one issue when there's no epic. (The `lite` playbook skips the `in-review` transition — it has no
per-slice review.)

## Final phase — whole-scope review, then PR

Run after your playbook returns (every slice `merged`/committed on the scope branch). Steps are identical
across tiers except the worktree cleanup, which your playbook owns.

- **All slices `mechanical`/`docs`** → skip the final-reviewer dispatch (the suite is the net); go straight
  to confirming the DoD, then the doc pass + PR. Only the review step is skipped.
- Dispatch **`superdev:final-reviewer`** (`model: opus`) on the integrated scope branch:
  BASE = `git merge-base <base> superdev/<scope>`, HEAD = scope tip; requirements = the global DoD + slice
  list; also give it the **absolute path** to `${CLAUDE_PLUGIN_ROOT}/references/review-checklist.md`
  (resolve the macro yourself, here — it doesn't expand inside the dispatched agent).
- For **Critical/Important** findings, dispatch **one** `superdev:implementer` fix with the **complete**
  findings list (not one fixer per finding); re-review until clean, or the fix loop caps out (see
  **Invariants** for the RED-test rule and wrong-cut escalation).
- **Reconcile docs + KB (always):** run **`/superdev:document <base>..superdev/<scope>`** (BASE =
  `git merge-base <base> superdev/<scope>`). It dispatches `doc-writer` to bring the in-repo docs and the
  knowledge base up to the integrated state and **remove stale/obsolete** text, committing on the scope
  branch so the changes land in the PR. Runs after every scope — even docs-only ones, even when the KB is
  `none` (then it's the in-repo docs pass only). Run it **after** the final review + fix loop, never
  concurrent with the review: `doc-writer` commits on the scope branch and would move the tip under the
  read-only reviewer's `BASE..HEAD` diff (ADR 0003). `final-reviewer` stays read-only and its own subagent.
- Confirm **every Phase 0 DoD item is met**, then move the **scope anchor** issue → `done` (no epic → the
  lone slice issue, already `merged`, is done).
- **Open the PR/MR per `docs/agents/code-management.md`** (default posture = draft; degrade to push +
  printed compare URL + ready-to-run command when no host CLI is present). Report the PR URL to the user.
- **Clean up** per your playbook's final-cleanup section (it removes the worktrees it created), then remove
  `.superdev/scopes/<scope>/run.lock` to signal this run is done. **Never** delete the scope branch — the PR is
  from it.

## Model selection (always set explicitly)

The `implementer` / `slice-reviewer` / `simplicity-reviewer` rows are dispatched only by the `full`
playbook. The `final-reviewer` row — and an `implementer` fix for final-review findings, at the
`implementer`/`fix` model — applies whichever playbook ran.

| Dispatch | Model | When |
|---|---|---|
| implementer / fix | `haiku` | mechanical slice (move, rename, transcription from a complete specification) |
| implementer / fix | `sonnet` | design / multi-file / judgment slice |
| slice-reviewer | `sonnet` | default (verification is load-bearing) |
| simplicity-reviewer | `haiku` | scoped over-engineering scan |
| final-reviewer | `opus` | whole-scope correctness — the highest-stakes review |

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
