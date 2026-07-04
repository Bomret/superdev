---
description: Execute a superdev plan — drive its vertical slices to merge as a dependency-ordered DAG. The execution tier is derived from the loaded slice count: >3 slices run the full path (parallel implementer subagents in isolated worktrees, warrant-gated per-slice review, controller-owned serial merges); ≤3 slices run the lite path (controller implements inline on the scope branch, test-first, no worktrees). Either way, one whole-scope code review gates the PR. Use when a plan exists in the slice store; run /superdev:plan first if not.
---

# superdev implement

You are the **controller**. You drive a plan's slices to merge, and you alone integrate — never a
subagent. **How** depends on the execution **tier**, derived from the loaded slice count (see §0): the
**full** path (>3 slices) holds the invariant that **the controller never implements inline** —
implementation happens only in isolated implementer subagents, one per slice. The **lite** path (≤3
slices) is the one deliberate, documented exception to that invariant: you implement each slice inline
yourself, test-first, directly on the scope branch — see **Lite path** below.

**Core principle:** a slice's green suite proves its fixtures pass — not that it's correct. In the full
path, separate reviewers re-verify each slice and you integrate serially; in the lite path, the single
whole-scope final review is the independent check. Either way, one whole-scope review gates the PR.

**Background:** the full path's four roles are subagents (`superdev:implementer`, `superdev:slice-reviewer`,
`superdev:simplicity-reviewer`, `superdev:final-reviewer`) — their discipline is in their bodies; you
just dispatch them with the per-slice specifics. The lite path dispatches **at most one**
`superdev:final-reviewer` (none at all for an all-mechanical/docs plan), plus an `implementer` fix only
if that review finds something; you carry the implementer's TDD discipline yourself. **Always pass an
explicit `model`** on every dispatch (a hook blocks omissions). Between dispatches, narrate at most one
short line.

## 0. Config + input

- Read `docs/agents/issue-tracker.md` (slice store), `docs/agents/code-management.md` (code host),
  `docs/agents/documentation.md` (in-repo documentation convention), and `docs/agents/knowledge-base.md` (optional
  KB). Slice store or code host missing → run **`/superdev:setup`**, then continue.
- **Load the slices** from the store (per the contract: `id`, `depends-on`, `test-applicability`,
  `spec`, `acceptance`, + global DoD). No slices → run **`/superdev:plan`** first. **Exactly one slice
  and no epic** → the epic was optional (plan-contract.md): the DoD is that slice's `acceptance`; there
  is no separate epic to load.
- **Pre-flight scan:** read all slices once for contradictions (a slice that conflicts with another or
  with the DoD; a spec that mandates something a review would flag). Batch anything you find to the
  user before starting. Clean → proceed silently.
- **Compute the execution tier** — a pure function of the loaded slice count, derived fresh every run:
  **≤3 slices → `lite`**, **>3 slices → `full`**. Never configured, overridden, or persisted — `/plan`
  and `/implement` both derive it the same way from the same count. `full` → §2 Branch model then §3 DAG
  loop, below. `lite` → the **Lite path** section, below.

## 1. Phase 0 — Definition of done + ledger (always first)

- **Run root (per scope).** Choose this run's **scope branch name** `<scope>` now (e.g.
  `superdev/<feature-slug>`; you create the branch in §2). All artifacts for this run live under a
  per-scope run root **`.superdev/<scope>/`** — **git-ignored** (ensure `.superdev/` is in the repo's
  `.gitignore`; add it if absent). Layout: `.superdev/<scope>/dod.md` (the DoD),
  `.superdev/<scope>/ledger.md` (the ledger — **both tiers**), `.superdev/<scope>/reports/<id>/progress.md`
  (per-slice progress log, **full path only** — see **Progress log**), `.superdev/<scope>/worktrees/<id>`
  (per-slice worktrees, **full path only**). The **lite** path drops both of the latter — no worktree to
  isolate (you implement inline) and no per-slice log (your own context is the record); the ledger alone
  carries its resume state. **Namespacing by `<scope>` is what lets several scope runs execute in
  parallel** — even in separate sessions — without clobbering each other's DoD/ledger/reports/worktrees.
  Nothing here is committed or lands in the PR.
- Write the **global verification plan** (the DoD, made concrete and checkable) to
  `.superdev/<scope>/dod.md`. It anchors the final review and tells you when to stop. No DoD → don't
  proceed. **No epic** (a single-slice plan) → the DoD is that lone slice's `acceptance`; write it to
  `dod.md` verbatim.
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
slice is merged. **No epic** (single-slice plan) — there is no separate scope issue: the lone slice IS
the scope anchor, so move it → `in-progress` at the start of the run and → `merged`/done at the end,
covering both the slice transition and the scope-level signal in one issue.

**Lite tier** has no per-slice review, so skip the `in-review` transition — move each slice straight from
`in-progress` to `merged`/done once its commit lands on the scope branch.

## Progress log (per slice, full path)

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
- **Per slice (full path only)**, a branch off scope in its own **worktree** under this run's root:
  `git worktree add .superdev/<scope>/worktrees/<id> -b slice/<scope>/<id> <scope>`. The slice branch is
  **scoped** (`slice/<scope>/<id>`) so parallel runs never collide even when slice ids repeat (e.g.
  local-store `01`/`02`). Filesystem isolation lets independent slices run in parallel without clobbering
  each other; `.superdev/` being git-ignored keeps the nested worktrees out of the parent's status. The
  **lite** path has no per-slice branch or worktree — see **Lite path**, next.

## Lite path (≤3 slices)

Small plans don't need the worktree + multi-subagent machinery. After the scope branch above is cut, you
implement every slice yourself, directly on it — no per-slice worktree, no implementer subagent, no
per-slice reviewer.

- **Implement in `depends-on` order, inline, test-first.** For each slice, in dependency order: read its
  `spec` + `acceptance`, then carry the same tracer-bullet discipline an implementer subagent would (one
  RED test, minimal GREEN code, repeat) yourself, directly against the scope branch's working tree.
  `mechanical` / `docs` slices need no new test — the existing suite is the net, same rule as the full
  path.
- **Carry the implementer's escalation discipline too, not just its TDD discipline.** If you can't get a
  slice green after reasonable effort, treat it like the full path's BLOCKED / 3-strike case — it's a
  **wrong cut**, not something to force through. Move the slice → `blocked` and escalate (re-slice or
  hand it to the human) rather than grinding on it inline.
- **Commit per slice** on the scope branch (Conventional Commits) as each one goes green. Update the
  ledger (`todo` → `in-progress` → `merged`; `merged` here means "committed to the scope branch" — there
  is no separate slice branch to merge) and the tracker status per **Issue status**, above.
- **No per-slice review, no per-slice progress log.** There is no `slice-reviewer` / `simplicity-reviewer`
  dispatch; your own context is the record of how each slice unfolded, and the ledger is the durable
  trace once that context is gone.
- **One final review for the whole scope.** Once every slice is implemented, proceed to **§4 Final
  phase** exactly as the full path does: dispatch a single `superdev:final-reviewer` over the integrated
  diff (BASE = `git merge-base <base> <scope>`, HEAD = scope tip) against the global DoD, and follow §4's
  fix loop — including its **3-strike cap** — exactly as written; it already applies to both tiers.
- **All slices `mechanical`/`docs`** → skip the final review too (the suite is the net) — the same
  exception the full path already grants per-slice mechanical/docs work, just applied to the whole small
  plan.
- **Doc pass + PR are unchanged.** §4's `/superdev:document` reconcile and PR steps run exactly as
  written, regardless of tier.

**Resume:** there are no worktrees to reconcile. Read `.superdev/<scope>/ledger.md` and cross-check it
against `git log <base>..<scope>` on the scope branch directly — a slice the ledger marks `merged` (i.e.
already committed) is done; pick up at the next `todo` slice in `depends-on` order. Unlike the full
path's isolated worktrees, lite implements directly on the shared scope branch working tree, so an
interrupted `in-progress` slice may have left partial, uncommitted changes there. Before resuming, run
`git status` / `git diff` on the scope branch's working tree and decide whether to continue that
in-progress slice's uncommitted work or discard it, before dispatching or continuing.

**Rationale:** lite deliberately relaxes the "controller never implements inline" invariant for small
plans — dispatching a worktree'd implementer subagent per slice for a 1–3 slice plan is pure token +
latency overhead with no payoff. The single `superdev:final-reviewer` preserves the one thing that
matters: an independent check that green ≠ correct, without paying for per-slice isolation the plan is
too small to need.

## 3. DAG loop (full path, >3 slices)

*(The lite path above does not use this loop.)*

Repeat until every slice is `merged`:

1. **Compute the runnable set** — slices whose `depends-on` are all `merged` and which are still
   `todo`. (Roots have empty `depends-on`.)
2. **Dispatch implementers in parallel, capped** — one `superdev:implementer` per runnable slice, each
   in its own worktree, each with its `model` from the table below. Give each only its own specifics:
   the slice `spec` + `acceptance`, its worktree path (`.superdev/<scope>/worktrees/<id>`) + branch
   (`slice/<scope>/<id>`), base/head, its **progress-log** path
   (`.superdev/<scope>/reports/<id>/progress.md` — seed it first; see **Progress log**), the global
   constraints, and interfaces decided by already-merged slices. Not the whole plan.
   Cap how many run **concurrently** at a **max-concurrent-implementers** limit (default **4**;
   configurable — raise it once you've piloted a scope and trust the cost + merge-queue size, lower it
   for a heavier model or a tighter budget). If the runnable set exceeds the cap, dispatch in **waves**:
   fill the cap, and as each implementer returns (step 3 completes for it), backfill from the remaining
   runnable set until it's exhausted — never dispatch more than the cap at once. The cap only throttles
   concurrency; it never changes `depends-on` / DAG semantics or which slices are runnable.
   Mark each dispatched slice `in-progress` (store + ledger).
3. **Per slice, when the implementer returns** (handle status: DONE / DONE_WITH_CONCERNS — address real
   concerns first / NEEDS_CONTEXT — provide it, re-dispatch / BLOCKED — assess: more context, stronger
   model, split the slice, or escalate to the human — and move the slice → `blocked` while it's stuck):
   - **`behavior`** slice → move it → `in-review`, then dispatch **`superdev:slice-reviewer`**
     (correctness + independent
     verification). For each **Critical/Important** finding, dispatch a fresh **`superdev:implementer`**
     fix with a **RED test that reproduces the bug first**; re-review until clean —
     **or 3 strikes**: if a slice takes 3 fix cycles without going clean (each fix exposing a new
     defect elsewhere), stop re-dispatching. That's not a buggy slice, it's a **wrong cut** — a hidden
     dependency or a boundary too big. Move it → `blocked` and escalate (re-slice or hand to the human);
     don't burn a fourth cycle. Then dispatch
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

### Resume (re-running `/superdev:implement` on an existing scope)

Re-entering an already-started scope — a fresh session, a re-run after compaction, or an interruption
mid-loop — is a **first-class path through the loop above, not a special case**: before dispatching
anything, reconcile state, then re-enter the DAG loop at step 1.

- **Reconcile before dispatching.** Read `.superdev/<scope>/ledger.md`, cross-check it against
  `git log <base>..<scope>` (merge commits name the slice branch) and the store's slice statuses. A
  slice the ledger — or the merge log — marks `merged` is done: **never re-dispatch it**, no matter what
  a stale in-progress worktree suggests.
- **Reconcile leftover worktrees.** For each `.superdev/<scope>/worktrees/<id>` still present, check its
  branch against the ledger: already merged → clean it up (`git worktree remove` +
  `git branch -D slice/<scope>/<id>`); not yet merged → resume it in place (dispatch there with its
  existing commits intact, per the implementer's own resume discipline) rather than recreating it.
- **Rebuild the runnable set from reconciled state** (DAG loop step 1) and continue the loop exactly as
  above — dispatch, review, merge, recompute — until every slice is `merged`.

## 4. Final phase — whole-scope review, then PR (both tiers)

- **Lite tier, all slices `mechanical`/`docs`** → skip the final-reviewer dispatch below entirely (the
  suite is the net) and go straight to the remaining steps below — confirming every DoD item is met and
  moving the scope/epic issue → `done`, then the doc pass + PR. Only the review step is skipped.
- Dispatch **`superdev:final-reviewer`** (`model: opus`) on the integrated scope branch:
  BASE = `git merge-base <base> <scope>`, HEAD = scope tip; requirements = the global DoD + slice list.
- For **Critical/Important** findings, dispatch **one** `superdev:implementer` fix with the **complete**
  findings list (not one fixer per finding), each fix opening with a **RED test**; re-review until clean —
  **or 3 strikes**: if the fix loop takes 3 cycles without going clean, stop re-dispatching. That's not a
  buggy slice, it's a **wrong cut** — a hidden dependency or a boundary too big. Stop, escalate to the
  human (re-slice or hand it over); don't burn a fourth cycle. This cap applies to **both tiers**.
- **Reconcile docs + KB (always):** run **`/superdev:document <base>..<scope>`** (BASE =
  `git merge-base <base> <scope>`). It dispatches the `doc-writer` to bring the in-repo docs and the
  knowledge base up to the integrated state and **remove stale/obsolete** text, committing the changes on
  the scope branch so they land in the PR. This runs after every scope — even docs-only ones, and even
  when the KB is `none` (then it's the in-repo docs pass only).
- Confirm **every Phase 0 DoD item is met**, then move the scope/epic issue → `done` (no epic → the lone
  slice issue, already `merged`, is done).
- **Open the PR/MR per `docs/agents/code-management.md`** (default posture = draft; degrade to push +
  printed compare URL + ready-to-run command when no host CLI is present). Report the PR URL to the user.
- **Clean up worktrees (after the PR, full path).** Per-slice worktrees are already removed at merge
  (step 3.4); as a final sweep run `git worktree prune`, then remove any remaining
  `.superdev/<scope>/worktrees/*` and any leftover `slice/<scope>/*` branches (`git worktree remove` /
  `git branch -D`). Keep the rest of `.superdev/<scope>/` (progress logs, ledger, DoD) — the git-ignored
  paper trail for post-mortem. **Never** delete the scope branch: the PR is from it. **Lite** skips this
  step — it never created any worktrees.

## Model selection (always set explicitly)

The `implementer` / `slice-reviewer` / `simplicity-reviewer` rows are **full-path only** (per-slice
dispatches lite doesn't make). The `final-reviewer` row — and an `implementer` fix for final-review
findings, at the `implementer`/`fix` rows' model — applies to **both** tiers.

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

Most flags below apply to both **full** and **lite** paths. A few are full-path-only, marked explicitly. See **Lite path** for lite-specific behavior.

- **One review instead of two (full path)** — a behavior slice gets correctness AND over-engineering
  (separate subagents), then the whole scope gets the final review.
- **Reviewing inline / reusing the implementer's context (full path)** — in the full path, reviewers are always separate subagents. Lite's inline implementer is the exception.
- **Trusting green (both tiers)** — "tests pass" ≠ correct; the reviewer reads the artifact and hunts uncovered input.
- **Inventing tests for non-behavior slices (both tiers)** — a rename's net is the existing suite.
- **Fixing without a RED test (both tiers)** — every fix starts with a failing test that reproduces the bug.
- **A subagent merging/pushing (both tiers)** — only the controller integrates (a hook enforces this).
- **Inferring dependencies (both tiers)** — use the plan's `depends-on`; don't guess from file overlap.
- **Stalling for routine approval (both tiers)** — execute the plan continuously; stop only for a real blocker, a
  genuine ambiguity, a plan contradiction, or completion.
- **Re-dispatching a merged slice (both tiers)** — after any compaction, trust the ledger and `git log`.
