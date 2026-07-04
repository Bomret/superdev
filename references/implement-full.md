# Full execution playbook (>3 slices)

The controller `Read`s this after computing tier = `full` (see `commands/implement.md`). Implementation
happens **only** in isolated `superdev:implementer` subagents — one per slice, each in its own worktree.
The controller never implements inline; it dispatches, reviews via subagents, and integrates serially.
Honor the controller's **Invariants** and **Issue status** map throughout. Return to the controller's
**Final phase** once every slice is `merged`.

## Branch model

- **Commit plan-authored design docs first.** Before cutting anything, ensure the glossary
  (`CONTEXT.md`), ADRs (`docs/adr/`), and `.claude/rules/` are committed on the base — worktrees are
  clean checkouts, so uncommitted design docs never reach implementers and path-scoped rules can't
  auto-load. If any are dirty/untracked, commit them to base now.
- **Scope branch off base:** `git switch -c superdev/<scope> <base>` in the invoking checkout (`<scope>`
  chosen in Phase 0; base from `code-management.md`, default `main`). You merge into this checkout later.
  Then move the **scope/epic** issue → `in-progress` (per `issue-tracker.md`; best-effort).
- **Per slice**, a branch off scope in its own **worktree** under this run's root:
  `git worktree add .superdev/<scope>/worktrees/<id> -b slice/<scope>/<id> superdev/<scope>`. The slice
  branch is **scoped** (`slice/<scope>/<id>`) so parallel runs never collide even when slice ids repeat.
  Filesystem isolation lets independent slices run in parallel without clobbering each other;
  `.superdev/` being git-ignored keeps the nested worktrees out of the parent's status.

## Progress log (per slice)

Each slice has a **progress log** at `.superdev/<scope>/reports/<id>/progress.md` — a running record of
how the slice unfolded, not a final report. **You (the controller) own it:**

- **Seed it** with a header (slice `<id>` + title) before the slice's first dispatch.
- **Pass its path** to *every* agent you dispatch for that slice — implementer, fix implementers, and
  reviewers — and tell each to append to it as it works.
- **After each agent returns, append a one-line outcome yourself** (agent, status, commit range or
  finding count). A loaded subagent often skips a prompted write, so your own post-return entry means
  the log is complete even when the agent wrote nothing.

Append-only, oldest-first, git-ignored scratch. It exists so a human — or a controller resumed after
compaction — can see what happened on a slice without re-reading every worktree.

## DAG loop

Repeat until every slice is `merged`:

1. **Compute the runnable set** — slices whose `depends-on` are all `merged` and which are still
   `todo`. (Roots have empty `depends-on`.)
2. **Dispatch implementers in parallel, capped** — one `superdev:implementer` per runnable slice, each
   in its own worktree, each with its `model` from the controller's model table. Give each only its own
   specifics: the slice `spec` + `acceptance`, its worktree path (`.superdev/<scope>/worktrees/<id>`) +
   branch (`slice/<scope>/<id>`), base/head, its **progress-log** path
   (`.superdev/<scope>/reports/<id>/progress.md` — seed it first), the global constraints, and interfaces
   decided by already-merged slices. Not the whole plan.
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
     (correctness + independent verification). For each **Critical/Important** finding, dispatch a fresh
     **`superdev:implementer`** fix with a **RED test that reproduces the bug first**; re-review until
     clean — or the **3-strike cap** trips (controller's Invariants). Then dispatch
     **`superdev:simplicity-reviewer`** (over-engineering); apply warranted cuts.
   - **`mechanical`** / **`docs`** slice → **skip both per-slice reviews** (the suite + the final review
     are the net).
4. **Merge (you, serially)** — from the scope checkout: `git merge --no-ff slice/<scope>/<id>`. Resolve
   any conflicts yourself (you hold cross-slice context; dispatch a fix subagent only if a conflict needs
   real code work). **Resolve conflicts only when they're additive.** Independent slices usually conflict
   because each *added* something to the same place — new list/enum/`switch` entries, new attributes, new
   test methods, new doc bullets; the correct result is the **union of both sides, dropping nothing**
   (keep every test from both sides — never delete a sibling's test to make the merge compile). A
   **semantic overlap** — the *same* logic changed two different ways, where you'd have to pick a winner —
   is not yours to guess: `git merge --abort` and escalate to the human. **Re-run the suite on scope**
   after merging — if a test command is configured (`docs/agents/verification.md`), the **green-gate hook**
   runs it for you and blocks with a RED report you must fix or revert before continuing. Then clean up:
   `git worktree remove .superdev/<scope>/worktrees/<id>` and `git branch -D slice/<scope>/<id>` (merged;
   leaving it clutters the repo). The **worktree-sweep** `Stop` hook removes any merged slice worktree you
   forget, so cleanup is guaranteed even if you skip this — but do it anyway. Move the slice →
   `merged`/done in the store + ledger. Merging unblocks dependents.
5. Recompute the runnable set and continue.

## Resume (re-running on an existing scope)

Re-entering an already-started scope — a fresh session, a re-run after compaction, or an interruption
mid-loop — is a **first-class path through the loop, not a special case**: reconcile state, then
re-enter the DAG loop at step 1.

- **Reconcile before dispatching.** Read `.superdev/<scope>/ledger.md`, cross-check it against
  `git log <base>..superdev/<scope>` (merge commits name the slice branch) and the store's slice statuses.
  A slice the ledger — or the merge log — marks `merged` is done: **never re-dispatch it**, no matter what
  a stale in-progress worktree suggests.
- **Reconcile leftover worktrees.** For each `.superdev/<scope>/worktrees/<id>` still present, check its
  branch against the ledger: already merged → clean it up (`git worktree remove` +
  `git branch -D slice/<scope>/<id>`); not yet merged → resume it in place (dispatch there with its
  existing commits intact, per the implementer's own resume discipline) rather than recreating it.
- **Rebuild the runnable set from reconciled state** (DAG loop step 1) and continue.

## Final cleanup (worktrees)

Per-slice worktrees are already removed at merge (DAG step 4); as a final sweep run `git worktree prune`,
then remove any remaining `.superdev/<scope>/worktrees/*` and any leftover `slice/<scope>/*` branches
(`git worktree remove` / `git branch -D`). Keep the rest of `.superdev/<scope>/` — the git-ignored paper
trail for post-mortem. **Never** delete the scope branch itself: the PR is from it.

## Red flags

- **One review instead of two** — a behavior slice gets correctness AND over-engineering (separate
  subagents), then the whole scope gets the final review.
- **Reviewing inline / reusing the implementer's context** — reviewers are always separate subagents.
