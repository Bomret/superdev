---
disable-model-invocation: false
description: Execute a superdev plan — drive its vertical slices to merge as a dependency-ordered DAG. Parallel implementer subagents in isolated worktrees, warrant-gated per-slice review, controller-owned serial merges, then one whole-scope code review before the PR. Use when a plan exists in the slice store; run /superdev:plan first if not.
---

# superdev implement

You are the **controller**. You drive a plan's slices to merge by dispatching isolated subagents, and
you alone integrate. You never implement or merge inside a subagent.

**Core principle:** a slice's green suite proves its fixtures pass — not that it's correct. Separate
reviewers re-verify; you integrate serially; one whole-scope review gates the PR.

**Background:** the four roles are subagents (`superdev:implementer`, `superdev:slice-reviewer`,
`superdev:ponytail-reviewer`, `superdev:final-reviewer`) — their discipline is in their bodies; you
just dispatch them with the per-slice specifics. **Always pass an explicit `model`** on every dispatch
(a hook blocks omissions). Between dispatches, narrate at most one short line.

## 0. Config + input

- Read `docs/agents/issue-tracker.md` (slice store), `docs/agents/code-management.md` (code host),
  `docs/agents/documentation.md` (in-repo DOX convention), and `docs/agents/knowledge-base.md` (optional
  KB). Slice store or code host missing → run **`/superdev:setup`**, then continue.
- **Load the slices** from the store (per the contract: `id`, `depends-on`, `test-applicability`,
  `spec`, `acceptance`, + global DoD). No slices → run **`/superdev:plan`** first.
- **Pre-flight scan:** read all slices once for contradictions (a slice that conflicts with another or
  with the DoD; a spec that mandates something a review would flag). Batch anything you find to the
  user before starting. Clean → proceed silently.

## 1. Phase 0 — Definition of done + ledger (always first)

- Write the **global verification plan** (the DoD, made concrete and checkable) to a file on the scope
  branch. It anchors the final review and tells you when to stop. No DoD → don't proceed.
- Create a **ledger** at `.superdev/ledger.md` (git-ignored scratch). Track each slice's status
  (`todo`/`in-progress`/`in-review`/`merged`), its commit range when merged, and — for issue stores —
  the `S<n>` ↔ issue-key mapping. The ledger is your recovery map after compaction: a slice it marks
  `merged` is done — never re-dispatch it; trust the ledger and `git log` over memory.

## 2. Branch model

- **Scope branch** off base: `git switch -c <scope> <base>` (base from `code-management.md`, default
  `main`).
- **Per slice**, a branch off scope in its own **worktree**:
  `git worktree add ../superdev-<id> -b slice/<id> <scope>`. Filesystem isolation lets independent
  slices run in parallel without clobbering each other.

## 3. DAG loop

Repeat until every slice is `merged`:

1. **Compute the runnable set** — slices whose `depends-on` are all `merged` and which are still
   `todo`. (Roots have empty `depends-on`.)
2. **Dispatch implementers in parallel** — one `superdev:implementer` per runnable slice, each in its
   own worktree, each with an explicit `model` (per the table below). Give each only its own specifics:
   the slice `spec` + `acceptance`, its worktree path + branch, base/head, a report-file path, the
   global constraints, and interfaces decided by already-merged slices. Not the whole plan.
3. **Per slice, when the implementer returns** (handle status: DONE / DONE_WITH_CONCERNS — address real
   concerns first / NEEDS_CONTEXT — provide it, re-dispatch / BLOCKED — assess: more context, stronger
   model, split the slice, or escalate to the human):
   - **`behavior`** slice → dispatch **`superdev:slice-reviewer`** (correctness + independent
     verification). For each **Critical/Important** finding, dispatch a fresh **`superdev:implementer`**
     fix with a **RED test that reproduces the bug first**; re-review until clean. Then dispatch
     **`superdev:ponytail-reviewer`** (over-engineering); apply warranted cuts.
   - **`mechanical`** / **`docs`** slice → **skip both per-slice reviews** (the suite + the final review
     are the net).
4. **Merge (you, serially)** — from the scope checkout: `git merge --no-ff slice/<id>`. Resolve any
   conflicts yourself (you hold cross-slice context; dispatch a fix subagent only if a conflict needs
   real code work). **Re-run the suite on scope** after merging. Then clean up: `git worktree remove
   ../superdev-<id>` and `git branch -D slice/<id>` (the branch is merged; leaving it clutters the repo).
   Update the slice to `merged` in the store + ledger. Merging unblocks dependents.
5. Recompute the runnable set and continue.

## 4. Final phase — whole-scope review, then PR

- Dispatch **`superdev:final-reviewer`** (`model: opus`) on the integrated scope branch:
  BASE = `git merge-base <base> <scope>`, HEAD = scope tip; requirements = the global DoD + slice list.
- For **Critical/Important** findings, dispatch **one** `superdev:implementer` fix with the **complete**
  findings list (not one fixer per finding), each fix opening with a **RED test**; re-review until clean.
- **Reconcile docs + KB (always):** run **`/superdev:document <base>..<scope>`** (BASE =
  `git merge-base <base> <scope>`). It dispatches the `doc-writer` to bring the in-repo DOX docs and the
  knowledge base up to the integrated state and **remove stale/obsolete** text, committing the changes on
  the scope branch so they land in the PR. This runs after every scope — even docs-only ones, and even
  when the KB is `none` (then it's the DOX docs pass only).
- Confirm **every Phase 0 DoD item is met**.
- **Open the PR/MR per `docs/agents/code-management.md`** (default posture = draft; degrade to push +
  printed compare URL + ready-to-run command when no host CLI is present). Report the PR URL to the user.

## Model selection (always set explicitly)

| Dispatch | Model | When |
|---|---|---|
| implementer / fix | `haiku` | mechanical slice (move, rename, transcription from a complete spec) |
| implementer / fix | `sonnet` | design / multi-file / judgment slice |
| slice-reviewer | `sonnet` | default (verification is load-bearing) |
| ponytail-reviewer | `haiku` | scoped over-engineering scan |
| final-reviewer | `opus` | whole-scope correctness — the highest-stakes review |

Scale to the slice. Turn count beats token price: the cheapest model often takes 2–3× the turns on
multi-step work. Use a mid-tier floor for anything from a prose spec; reserve `haiku` for transcription
and mechanical fixes.

## Red flags

- **One review instead of two** — a behavior slice gets correctness AND over-engineering (separate
  subagents), then the whole scope gets the final review.
- **Reviewing inline / reusing the implementer's context** — reviewers are separate subagents.
- **Trusting green** — "tests pass" ≠ correct; the reviewer reads the artifact and hunts uncovered input.
- **Inventing tests for non-behavior slices** — a rename's net is the existing suite.
- **Fixing without a RED test** — every fix starts with a failing test that reproduces the bug.
- **A subagent merging/pushing** — only you integrate (a hook enforces this).
- **Inferring dependencies** — use the plan's `depends-on`; don't guess from file overlap.
- **Stalling for routine approval** — execute the plan continuously; stop only for a real blocker, a
  genuine ambiguity, a plan contradiction, or completion.
- **Re-dispatching a merged slice** — after any compaction, trust the ledger and `git log`.
