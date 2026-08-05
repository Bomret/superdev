# Full execution playbook (>3 slices)

The controller `Read`s this after computing tier = `full` (see `commands/implement.md`). Implementation
happens **only** in isolated `superdev:implementer` subagents — one per slice, each in its own worktree.
The controller never implements inline; it dispatches, reviews via subagents, and integrates serially.
Honor the controller's **Invariants** and **Issue status** map throughout. Return to the controller's
**Final phase** once every slice is `merged`.

## Branch model

- **Base committed + pushed** per the controller's Phase 0 (design docs on base, base pushed) — do it
  before cutting anything here.
- **Scope branch off base:** `git switch -c <type>/<scope> <base>` in the invoking checkout (`<type>` and
  `<scope>` chosen in Phase 0; base from `code-management.md`, default `main`). You merge into this
  checkout later.
  Then move the **scope anchor** → `in-progress` (per `issue-tracker.md`; best-effort).
- **Per slice**, a branch off scope in its own **worktree** under this run's root:
  `git worktree add .superdev/scopes/<scope>/worktrees/<id> -b slice/<scope>/<id> <type>/<scope>`. The slice
  branch is **scoped** (`slice/<scope>/<id>`) so parallel runs never collide even when slice ids repeat.
  Filesystem isolation lets independent slices run in parallel without clobbering each other;
  `.superdev/` being git-ignored keeps the nested worktrees out of the parent's status.

## Progress log (per slice)

Each slice has a **progress log** at `<run-root>/reports/<id>/progress.md` — a running record of
how the slice unfolded, not a final report. **You (the controller) own it:**

- **Seed it** with a header (slice `<id>` + title) before the slice's first dispatch.
- **Pass its path** to *every* agent you dispatch for that slice — implementer, fix implementers, and
  reviewers — and tell each to append to it as it works.
- **After each agent returns, append a one-line outcome yourself** (agent, status, commit range or
  finding count). A loaded subagent often skips a prompted write, so your own post-return entry means
  the log is complete even when the agent wrote nothing.

Append-only, oldest-first, git-ignored scratch. It exists so a human — or a controller resumed after
compaction — can see what happened on a slice without re-reading every worktree.

## Interface file (per scope)

`<run-root>/interfaces.md` is the durable record of **cross-slice interfaces** — the
function signatures, endpoints, CLI commands, and types a merged slice decided that later slices build
on. Your context is not that record: after a compaction it's gone, and the ledger holds statuses, not
interfaces. Append the interfaces a slice decided when you merge it (DAG step 4), pass the file's path
in every dispatch (step 2), and read it on resume.

## DAG loop

Repeat until every slice is `merged`:

1. **Compute the runnable set** — slices whose `depends-on` are all `merged` and which are still
   `todo`. (Roots have empty `depends-on`.)
2. **Dispatch implementers in parallel, capped** — one `superdev:implementer` per runnable slice, each
   in its own worktree, each with its `model` from the controller's model table. Give each only its own
   specifics: the slice `spec` + `acceptance` + `test-applicability`, its worktree path
   (`.superdev/scopes/<scope>/worktrees/<id>`) +
   branch (`slice/<scope>/<id>`), base/head, its **progress-log** path
   (`<run-root>/reports/<id>/progress.md` — seed it first), the global constraints, and the
   **interface file** path (`<run-root>/interfaces.md` — the interfaces already-merged
   slices decided). Not the whole plan.
   **Pilot the first wave.** On a fresh scope (nothing merged yet), dispatch a single slice first and
   take it through review + merge before filling the cap — a systemic problem (a mis-specified
   convention, a broken test command) surfaces once instead of being replicated across every parallel
   worktree. From the next wave on, fill the cap.
   Cap how many run **concurrently** at a **max-concurrent-implementers** limit (default **4**;
   configurable — raise it once you've piloted a scope and trust the cost + merge-queue size, lower it
   for a heavier model or a tighter budget). If the runnable set exceeds the cap, dispatch in **waves**:
   fill the cap, and as each implementer returns (step 3 completes for it), backfill from the remaining
   runnable set until it's exhausted — never dispatch more than the cap at once. The cap only throttles
   concurrency; it never changes `depends-on` / DAG semantics or which slices are runnable.
   Mark each dispatched slice `in-progress` (store + ledger).
3. **Per slice, when the implementer returns** (handle status: DONE / DONE_WITH_CONCERNS — address real
   concerns first / NEEDS_CONTEXT — provide it, re-dispatch / BLOCKED — assess: more context, stronger
   model, split the slice, or escalate to the human — and move the slice → `blocked` while it's stuck;
   **`--unattended` → block** once the cheap remedies are spent, per
   `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended** section, rather than escalating to a
   human who is not there):
   - **`behavior`** slice → move it → `in-review`, then dispatch **`superdev:slice-reviewer`**
     (correctness + independent verification; it reads the review checklist itself via
     `${CLAUDE_PLUGIN_ROOT}`). For each **Critical/Important** finding, dispatch a fresh
     **`superdev:implementer`** fix with a **RED test that reproduces the bug first**; re-review until
     clean — or the **3-strike fix loop** caps out (controller's Invariants). Then dispatch
     **`superdev:simplicity-reviewer`** (over-engineering); apply warranted cuts.
   - **A dispatch the permission classifier denies** — an implementer, a slice-reviewer, a
     simplicity-reviewer, or a fix — is a **degraded pass**, not a step to redo silently inline. None of
     them is ever skipped on judgment in this tier, so scope-mode's own skip carve-out never exempts one
     here. Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes` section and follow
     it, including the `**Degraded:**` entry it defines for `<run-root>/ledger.md`. **`--unattended` →
     block** there instead.
   - **`mechanical`** / **`docs`** slice → **skip both per-slice reviews** (the suite + the final review
     are the net).
4. **Merge (you, serially)** — from the scope checkout: `git merge --no-ff slice/<scope>/<id>`. Resolve
   any conflicts yourself (you hold cross-slice context; dispatch a fix subagent only if a conflict needs
   real code work). **Resolve conflicts only when they're additive.** Independent slices usually conflict
   because each *added* something to the same place — new list/enum/`switch` entries, new attributes, new
   test methods, new doc bullets; the correct result is the **union of both sides, dropping nothing**
   (keep every test from both sides — never delete a sibling's test to make the merge compile). A
   **semantic overlap** — the *same* logic changed two different ways, where you'd have to pick a winner —
   is not yours to guess: `git merge --abort` and escalate to the human. **`--unattended` → block** after the
   abort, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended** section: picking a winner
   is exactly the human decision the token cannot stand in for. **Re-run the suite on scope**
   after merging — if a test command is configured (`docs/agents/verification.md`), the **green-gate hook**
   runs it for you and blocks with a RED report you must fix or revert before continuing. Then clean up:
   `git worktree remove .superdev/scopes/<scope>/worktrees/<id>` and `git branch -D slice/<scope>/<id>` (merged;
   leaving it clutters the repo). The **worktree-sweep** `Stop` hook removes any merged slice worktree you
   forget, so cleanup is guaranteed even if you skip this — but do it anyway. **Append the interfaces this
   slice decided** to `<run-root>/interfaces.md` (skip if it decided none). Move the slice →
   `merged`/done in the store + ledger. Merging unblocks dependents.
5. Recompute the runnable set and continue.

## Resume (re-running on an existing scope)

Re-entering an already-started scope — a fresh session, a re-run after compaction, or an interruption
mid-loop — is a **first-class path through the loop, not a special case**: reconcile state, then
re-enter the DAG loop at step 1.

- **Reconcile before dispatching.** Read `<run-root>/ledger.md` and
  `<run-root>/interfaces.md` (the cross-slice interface record — your pre-compaction
  context is gone; this file is what survives), cross-check the ledger against
  `git log <base>..<type>/<scope>` (merge commits name the slice branch) and the store's slice statuses.
  A slice the ledger — or the merge log — marks `merged` is done: **never re-dispatch it**, no matter what
  a stale in-progress worktree suggests.
- **Reconcile leftover worktrees.** For each `.superdev/scopes/<scope>/worktrees/<id>` still present, check its
  branch against the ledger: already merged → clean it up (`git worktree remove` +
  `git branch -D slice/<scope>/<id>`); not yet merged → resume it in place (dispatch there with its
  existing commits intact, per the implementer's own resume discipline) rather than recreating it.
- **Rebuild the runnable set from reconciled state** (DAG loop step 1) and continue.

## Leave the run standing

Per-slice worktrees are already removed at merge (DAG step 4). Anything left — a stray
`.superdev/scopes/<scope>/worktrees/*`, a leftover `slice/<scope>/*` branch, the run root, the lock — stays
for `/superdev:ship`, which takes the run down at the end of the chain. The invoking checkout keeps
`<type>/<scope>` checked out: that is the scope checkout `/superdev:review` and `/superdev:document` work
in on this tier. Return to the controller's **Final phase** without cleaning up.
