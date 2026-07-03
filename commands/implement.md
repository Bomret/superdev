---
description: Execute a superdev plan — drive its vertical slices to merge as a dependency-ordered DAG. Parallel implementer subagents in isolated worktrees, warrant-gated per-slice review, controller-owned serial merges, then one whole-scope code review before the PR. Use when a plan exists in the slice store; run /superdev:plan first if not.
---

# superdev implement

You are the **controller**. You drive a plan's slices to merge by dispatching isolated subagents, and
you alone integrate. You never implement or merge inside a subagent.

**Core principle:** a slice's green suite proves its fixtures pass — not that it's correct. Separate
reviewers re-verify; you integrate serially; one whole-scope review gates the PR.

**Background:** the four roles are subagents (`superdev:implementer`, `superdev:slice-reviewer`,
`superdev:simplicity-reviewer`, `superdev:final-reviewer`) — their discipline is in their bodies; you
just dispatch them with the per-slice specifics. **Always pass an explicit `model`** on every dispatch
(a hook blocks omissions). Between dispatches, narrate at most one short line.

## 0. Config + input

- Read `docs/agents/issue-tracker.md` (slice store), `docs/agents/code-management.md` (code host),
  `docs/agents/documentation.md` (in-repo documentation convention), and `docs/agents/knowledge-base.md` (optional
  KB). Slice store or code host missing → run **`/superdev:setup`**, then continue.
- **Load the slices** from the store (per the contract: `id`, `depends-on`, `test-applicability`,
  `spec`, `acceptance`, + global DoD). No slices → run **`/superdev:plan`** first.
- **Pre-flight scan:** read all slices once for contradictions (a slice that conflicts with another or
  with the DoD; a spec that mandates something a review would flag). Batch anything you find to the
  user before starting. Clean → proceed silently.

## 1. Phase 0 — Definition of done + ledger (always first)

- **Run root (per scope).** Choose this run's **scope branch name** `<scope>` now (e.g.
  `superdev/<feature-slug>`; you create the branch in §2). All artifacts for this run live under a
  per-scope run root **`.superdev/<scope>/`** — **git-ignored** (ensure `.superdev/` is in the repo's
  `.gitignore`; add it if absent). Layout: `.superdev/<scope>/dod.md` (the DoD),
  `.superdev/<scope>/ledger.md` (the ledger), `.superdev/<scope>/reports/<id>/progress.md` (per-slice
  progress log — see **Progress log**), `.superdev/<scope>/worktrees/<id>` (per-slice worktrees).
  **Namespacing by `<scope>` is what lets several scope runs execute in parallel** — even in separate
  sessions — without clobbering each other's DoD/ledger/reports/worktrees. Nothing here is committed or
  lands in the PR.
- Write the **global verification plan** (the DoD, made concrete and checkable) to
  `.superdev/<scope>/dod.md`. It anchors the final review and tells you when to stop. No DoD → don't proceed.
- Create the **ledger** at `.superdev/<scope>/ledger.md`. Track each slice's status
  (`todo`/`in-progress`/`in-review`/`merged`), its commit range when merged, and — for issue stores —
  the slice-id ↔ issue-key mapping. The ledger is your recovery map after compaction: a slice it marks
  `merged` is done — never re-dispatch it; trust the ledger and `git log` over memory.

## Issue status (move issues along the tracker's workflow)

`docs/agents/issue-tracker.md` holds a **status map**: superdev's canonical lifecycle (`todo` →
`in-progress` → `in-review` → `merged`/done, plus `blocked`) → the tracker's real statuses. At each
lifecycle point in the loop below, **move the issue to the mapped status** so anyone watching the
tracker sees live progress — for the **local-file** store that's editing the slice file's `status:`
line, for an **issue tracker** it's the mapped transition. Do it **best-effort**: the ledger drives
control flow, so if a status write/transition fails, log it and keep going. Points: dispatch →
`in-progress`; entering per-slice review (behavior only) → `in-review`; BLOCKED → `blocked`; merged →
`merged`/done. The **scope/epic** issue moves to `in-progress` when the run starts and `done` once every
slice is merged.

## Progress log (per slice)

Each slice has a **progress log** at `.superdev/<scope>/reports/<id>/progress.md` — a running record of
how the slice unfolded, not a final report. **You (the controller) own it:**

- **Seed it** with a header (slice `<id>` + title) before the slice's first dispatch.
- **Pass its path** to *every* agent you dispatch for that slice — implementer, fix implementers, and
  reviewers — and tell each to append to it as it works.
- **After each agent returns, append a one-line outcome yourself** (agent, status, commit range or
  finding count). This is the guarantee: a loaded subagent often skips a prompted write, so your own
  post-return entry means the log is complete even when the agent wrote nothing.

Append-only, oldest-first, git-ignored scratch. It exists so a human — or a controller resumed after
compaction — can see what happened on a slice without re-reading every worktree.

## 2. Branch model

- **Commit plan-authored design docs first.** Before cutting anything, ensure the glossary
  (`CONTEXT.md`), ADRs (`docs/adr/`), and `.claude/rules/` are committed on the base — worktrees are
  clean checkouts, so uncommitted design docs never reach implementers and path-scoped rules can't
  auto-load. If any are dirty/untracked, commit them to base now.
- **Scope branch** off base: `git switch -c <scope> <base>` (the `<scope>` chosen in Phase 0; base from
  `code-management.md`, default `main`). Then move the **scope/epic** issue → `in-progress` (per
  `issue-tracker.md`; best-effort).
- **Per slice**, a branch off scope in its own **worktree** under this run's root:
  `git worktree add .superdev/<scope>/worktrees/<id> -b slice/<scope>/<id> <scope>`. The slice branch is
  **scoped** (`slice/<scope>/<id>`) so parallel runs never collide even when slice ids repeat (e.g.
  local-store `01`/`02`). Filesystem isolation lets independent slices run in parallel without clobbering
  each other; `.superdev/` being git-ignored keeps the nested worktrees out of the parent's status.

## 3. DAG loop

Repeat until every slice is `merged`:

1. **Compute the runnable set** — slices whose `depends-on` are all `merged` and which are still
   `todo`. (Roots have empty `depends-on`.)
2. **Dispatch implementers in parallel** — one `superdev:implementer` per runnable slice, each in its
   own worktree, each with its `model` from the table below. Give each only its own specifics:
   the slice `spec` + `acceptance`, its worktree path (`.superdev/<scope>/worktrees/<id>`) + branch
   (`slice/<scope>/<id>`), base/head, its **progress-log** path
   (`.superdev/<scope>/reports/<id>/progress.md` — seed it first; see **Progress log**), the global
   constraints, and interfaces decided by already-merged slices. Not the whole plan.
   Mark each dispatched slice `in-progress` (store + ledger).
3. **Per slice, when the implementer returns** (handle status: DONE / DONE_WITH_CONCERNS — address real
   concerns first / NEEDS_CONTEXT — provide it, re-dispatch / BLOCKED — assess: more context, stronger
   model, split the slice, or escalate to the human — and move the slice → `blocked` while it's stuck):
   - **`behavior`** slice → move it → `in-review`, then dispatch **`superdev:slice-reviewer`**
     (correctness + independent
     verification). For each **Critical/Important** finding, dispatch a fresh **`superdev:implementer`**
     fix with a **RED test that reproduces the bug first**; re-review until clean. Then dispatch
     **`superdev:simplicity-reviewer`** (over-engineering); apply warranted cuts.
   - **`mechanical`** / **`docs`** slice → **skip both per-slice reviews** (the suite + the final review
     are the net).
4. **Merge (you, serially)** — from the scope checkout: `git merge --no-ff slice/<scope>/<id>`. Resolve any
   conflicts yourself (you hold cross-slice context; dispatch a fix subagent only if a conflict needs
   real code work). **Resolve conflicts only when they're additive.** Independent slices usually
   conflict because each *added* something to the same place — new list/enum/`switch` entries, new
   attributes, new test methods, new doc bullets; the correct result is the **union of both sides,
   dropping nothing** (keep every test from both sides — never delete a sibling's test to make the merge
   compile). A **semantic overlap** — the *same* logic changed two different ways, where you'd have to
   pick a winner — is not yours to guess: `git merge --abort` and escalate to the human. **Re-run the
   suite on scope** after merging — if a test command is configured
   (`docs/agents/verification.md`), the **green-gate hook** runs it for you and blocks with a RED report
   you must fix or revert before continuing. Then clean up: `git worktree remove
   .superdev/<scope>/worktrees/<id>` and `git branch -D slice/<scope>/<id>` (merged; leaving it clutters
   the repo). The **worktree-sweep** `Stop` hook removes any merged slice worktree you forget, so cleanup
   is guaranteed even if you skip this — but do it anyway. Move the slice → `merged`/done in the store +
   ledger. Merging unblocks dependents.
5. Recompute the runnable set and continue.

## 4. Final phase — whole-scope review, then PR

- Dispatch **`superdev:final-reviewer`** (`model: opus`) on the integrated scope branch:
  BASE = `git merge-base <base> <scope>`, HEAD = scope tip; requirements = the global DoD + slice list.
- For **Critical/Important** findings, dispatch **one** `superdev:implementer` fix with the **complete**
  findings list (not one fixer per finding), each fix opening with a **RED test**; re-review until clean.
- **Reconcile docs + KB (always):** run **`/superdev:document <base>..<scope>`** (BASE =
  `git merge-base <base> <scope>`). It dispatches the `doc-writer` to bring the in-repo docs and the
  knowledge base up to the integrated state and **remove stale/obsolete** text, committing the changes on
  the scope branch so they land in the PR. This runs after every scope — even docs-only ones, and even
  when the KB is `none` (then it's the in-repo docs pass only).
- Confirm **every Phase 0 DoD item is met**, then move the scope/epic issue → `done`.
- **Open the PR/MR per `docs/agents/code-management.md`** (default posture = draft; degrade to push +
  printed compare URL + ready-to-run command when no host CLI is present). Report the PR URL to the user.
- **Clean up worktrees (after the PR).** Per-slice worktrees are already removed at merge (step 3.4);
  as a final sweep run `git worktree prune`, then remove any remaining `.superdev/<scope>/worktrees/*`
  and any leftover `slice/<scope>/*` branches (`git worktree remove` / `git branch -D`). Keep the rest of
  `.superdev/<scope>/` (progress logs, ledger, DoD) — the git-ignored paper trail for post-mortem.
  **Never** delete the scope branch: the PR is from it.

## Model selection (always set explicitly)

| Dispatch | Model | When |
|---|---|---|
| implementer / fix | `haiku` | mechanical slice (move, rename, transcription from a complete spec) |
| implementer / fix | `sonnet` | design / multi-file / judgment slice |
| slice-reviewer | `sonnet` | default (verification is load-bearing) |
| simplicity-reviewer | `haiku` | scoped over-engineering scan |
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
