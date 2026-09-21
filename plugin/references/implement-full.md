# Full execution playbook (>3 slices)

The controller `Read`s this after computing tier = `full` (see `skills/implement/SKILL.md`). Implementation
happens **only** in isolated `superdev:implementer` subagents — one per slice, each in its own slicetree.
The controller never implements inline; it dispatches, reviews via subagents, and integrates serially.
Honor the controller's **Invariants** and **Issue status** map throughout. Once every slice is `merged`,
read `${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md` as your last step.

## Branch model

- **Read `${CLAUDE_PLUGIN_ROOT}/references/run-init.md`** — the controller's run opening — before cutting
  anything here.
- **Scope branch, into the scopetree, per this run's kind.** Read
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Cutting the scope branch` and do what it says for
  the run kind the controller handed you — `fresh` or `resumed` (ADR 0028, ADR 0045). Never
  derive that value yourself. Call whatever it leaves you on `<branch>` for the rest of this file: for
  `fresh` that is literally `git worktree add <run-root>/scopetree -b <type>/<scope> <base>`
  (`<type>` and `<scope>` chosen in run init; base from `code-management.md`, default `main`), while
  `resumed` resolves `<branch>` per that same section, never by reconstructing the name.
  The cutting/reuse command itself runs from the invoking checkout, like any `git worktree add`; every
  later command in this file — every merge — addresses the scopetree, `<run-root>/scopetree`,
  with `git -C`, and the invoking checkout is never switched onto the branch. **On `fresh`,
  do `references/run-init.md`'s deferred copy/commit/revert now** — it names this exact
  point; on `resumed` it already ran in run init, so there is nothing to do here. Then move the **scope
  anchor** → `in-progress` (per `issue-tracker.md`; best-effort).
- **Per slice**, a branch off scope in its own **slicetree** under this run's root:
  `git worktree add <run-root>/slicetrees/<id> -b slice/<scope>/<id> <branch>`. The slice
  branch is **scoped** (`slice/<scope>/<id>`) so parallel runs never collide even when slice ids repeat.
  Filesystem isolation lets independent slices run in parallel; `.superdev/` being git-ignored keeps the
  nested slicetrees out of the parent's status.
- **An epic carrying `## Integration branch`** (a wide refactor whose batches can't stay green alone —
  `${CLAUDE_PLUGIN_ROOT}/references/plan-contract.md` → *Wide refactors*, ADR 0033) inserts one branch
  between the slices and the scope: cut `integration/<scope>` from `<branch>` at run start, keep it
  checked out **in the scopetree**, and merge every slice into it instead of `<branch>` (the
  green-gate defers there). The plan's final **integrate-and-verify** slice is where you switch that same
  scopetree back to `<branch>` and merge `integration/<scope>` into it — the gate fires on that
  merge, and it is the run's promise of green. Everything else in the loop is unchanged.

## Run lock

Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The run lock` and write
`<run-root>/run.lock` as it says (the absolute run-init run-root path in the invoking checkout — never a
`.superdev/scopes/<scope>/…` path resolved from a scopetree or slicetree cwd, which resolves one level too deep). Leave
the lock in place when you finish: it spans the whole chain, and `/superdev:ship` removes it once the run
is shipped.

## Progress log (per slice)

Each slice has a **progress log** at `<run-root>/reports/<id>/progress.md` — a running record of how the
slice unfolded, not a final report. **You (the controller) own it:**

- **Seed it** with a header (slice `<id>` + title) before the slice's first dispatch.
- **Pass its path** to *every* agent you dispatch for that slice — implementer, fix implementers,
  reviewers — and tell each to append to it as it works.
- **After each agent returns, append a one-line outcome yourself** (agent, status, commit range or
  finding count). A loaded subagent often skips a prompted write, so your own entry keeps the log
  complete even when the agent wrote nothing.

Append-only, oldest-first, git-ignored scratch. It exists so a human — or a controller resumed after
compaction — can see what happened on a slice without re-reading every slicetree.

## Interface file (per scope)

`<run-root>/interfaces.md` is the durable record of **cross-slice interfaces** — the function signatures,
endpoints, CLI commands, and types a merged slice decided that later slices build on. Your context is not
that record: after a compaction it's gone, and the ledger holds statuses, not interfaces. Append the
interfaces a slice decided when you merge it (DAG step 4), pass the file's path in every dispatch
(step 2), and read it on resume.

## DAG loop

Repeat until every slice is `merged`:

1. **Compute the runnable set** — slices whose `depends-on` are all `merged` and which are still `todo`.
   (Roots have empty `depends-on`.)
2. **Dispatch implementers in parallel, capped** — one `superdev:implementer` per runnable slice, each in
   its own slicetree, each with its `model` from the controller's model table. Give each only its own
   specifics: the slice `spec` + `acceptance` + `test-applicability`, its slicetree path
   (`<run-root>/slicetrees/<id>`) + branch (`slice/<scope>/<id>`), base/head, its
   **progress-log** path (`<run-root>/reports/<id>/progress.md` — seed it first), the global constraints,
   and the **interface file** path (`<run-root>/interfaces.md`). Not the whole plan.

   **Pilot the first wave.** On a fresh scope (nothing merged yet), dispatch a single slice first and take
   it through review + merge before filling the cap — a systemic problem (a mis-specified convention, a
   broken test command) surfaces once instead of being replicated across every parallel slicetree. From the
   next wave on, fill the cap.

   Cap how many run **concurrently** at a **max-concurrent-implementers** limit (default **4**;
   configurable — raise it once you've piloted a scope and trust the cost + merge-queue size, lower it for
   a heavier model or a tighter budget). If the runnable set exceeds the cap, dispatch in **waves**: fill
   the cap, and as each implementer returns (step 3 completes for it), backfill from the remaining
   runnable set. The cap only throttles concurrency; it never changes `depends-on` / DAG semantics.

   Mark each dispatched slice `in-progress` — the store transition, plus
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" slice <id> in-progress --root <run-root>` for the ledger.
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
     simplicity-reviewer, or a fix — is a **degraded pass**, not a step to redo silently inline. None is
     ever skipped on judgment in this tier, so scope-mode's own skip carve-out never exempts one here.
     Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes` section and follow it,
     including the `**Degraded:**` entry it defines for `<run-root>/ledger.md`. A denied implementer or
     fix is an authoring dispatch: write it with `scope.js degraded add`. A denied `slice-reviewer` is
     this tier's one verification dispatch: write it with `scope.js degraded add-denial`, quoting the
     classifier's refusal. Publish the snapshot after either write, per
     `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state` section — since a denied
     implementer/fix or a capped slice-reviewer denial reaches no later write below. **`--unattended`** →
     a denied implementer or fix **blocks**, per ADR 0001. A
     denied `slice-reviewer` follows that section's authorship rule, and this tier's slices come from a
     dispatched implementer, so the controller authored none of what the review verifies: review the
     slice inline and carry on, bounded by that section's cap — read `scope.js get denials` after writing
     the entry, and **block** once the count reaches it instead of reviewing inline again. A denied
     `simplicity-reviewer` follows that same authorship rule, and since its findings are advisory, the
     pass runs inline and the run carries on; write its entry with plain `scope.js degraded add` — its
     denial is not a verification dispatch, so it stays outside that cap. Nothing in that outcome can end
     the command, so this write relies on its defining section's own citation
     (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state` section) rather than
     repeating one here.
   - **`mechanical`** / **`docs`** slice → **skip both per-slice reviews** (the merge's focused run, plus
     the scope's full-suite run — at `/superdev:review`, or the run-handoff run when every slice in
     the scope is `mechanical`/`docs` — are the net; ADR 0025).
4. **Merge (you, serially)** — in the scopetree: `git -C <run-root>/scopetree merge
   --no-ff slice/<scope>/<id>`. Resolve
   conflicts yourself, per `${CLAUDE_PLUGIN_ROOT}/references/merge-conflicts.md` (you hold cross-slice
   context; dispatch a fix subagent only if a conflict needs real code work): trace both sides to their
   slice specs, take the **union of both sides, dropping nothing** on additive conflicts (keep every test
   from both sides — never delete a sibling's test to make the merge compile), and compose compatible
   intents. A **genuine winner-picking overlap** — the *same* decision decided two incompatible ways,
   where honouring one spec means violating the other —
   is not yours to guess: `git -C <run-root>/scopetree merge --abort` and escalate to the
   human. **`--unattended` → block** after
   the abort, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended** section: picking a
   winner is exactly the human decision the token cannot stand in for.

   **A focused suite runs on the merge, automatically** — if a test command is configured
   (`docs/agents/verification.md`), the **green-gate hook** re-runs the focused command over this merge's
   changed paths (`${CLAUDE_PLUGIN_ROOT}/references/test-selection.md` owns which command that is) and
   blocks with a RED report you must fix or revert before continuing.

   Then clean up: `git worktree remove <run-root>/slicetrees/<id>` and
   `git branch -D slice/<scope>/<id>` (merged; leaving it clutters the repo). The **slicetree-sweep** `Stop`
   hook removes any merged slicetree you forget, but do it anyway. **Append the interfaces this slice
   decided** to `<run-root>/interfaces.md` (skip if it decided none). Move the slice → `merged`/done in the
   store, and `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" slice <id> merged --root <run-root>` in the
   ledger (add `--range <commit-range>` to record the slice's commit range, when you have one). Merging
   unblocks dependents.
5. Recompute the runnable set and continue.

## Resume (re-running on an existing scope)

Re-entering an already-started scope — a fresh session, a re-run after compaction, an interruption
mid-loop — is a **first-class path through the loop, not a special case**: reconcile state, then re-enter
the DAG loop at step 1.

- **Find the scopetree first**, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope
  checkout` — present, recreated when absent, or a named stop when another working tree holds `<branch>`
  — before reading anything out of it.
- **Found already present? Check the run lock before dispatching anything.** Read `<run-root>/run.lock`'s
  mtime: fresh (under an hour old, the `run-lock` hook's staleness threshold) → another session is live in
  that scopetree — escalate, or **`--unattended` → block**, per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Unattended` section, rather than dispatching
  implementers into a scopetree a second session is already writing to. This is the scopetree-present case
  `## The scope checkout`'s recreate bullet contrasts itself against — a fresh lock met there, against a
  scopetree that step itself just recreated because it was absent, is this run's own and never blocks.
  Stale or absent → an interrupted run: continue below, and `## The run lock` above refreshes the file at
  your first write.
- **Reconcile before dispatching.** Read the ledger through
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get slices --root <run-root>` (and `get stage`), plus
  `<run-root>/interfaces.md` (your pre-compaction context is gone; this file is what survives), and
  cross-check the ledger against `git -C <run-root>/scopetree log <base>..<branch>`
  (`<branch>` from the branch step above, never rebuilt as `<type>/<scope>`; merge commits name the slice
  branch) and the store's slice statuses. A slice the ledger — or the merge log — marks `merged` is done:
  **never re-dispatch it**, no matter what a stale in-progress slicetree suggests.
- **Reconcile leftover slicetrees.** For each `<run-root>/slicetrees/<id>` still present,
  check its branch against the ledger: already merged → clean it up (`git worktree remove` +
  `git branch -D slice/<scope>/<id>`); not yet merged → resume it in place (dispatch there with its
  existing commits intact, per the implementer's own resume discipline) rather than recreating it.
- **Rebuild the runnable set from reconciled state** (DAG loop step 1) and continue.

## Leave the run standing

Per-slice slicetrees are already removed at merge (DAG step 4). Anything left — a stray
`<run-root>/slicetrees/*`, a leftover `slice/<scope>/*` branch, the run root, the
scopetree, `<run-root>/run.lock` — stays for `/superdev:ship`, which takes the run down at the end of the
chain. The scopetree keeps `<branch>` checked out: that is the scope checkout `/superdev:review` and
`/superdev:document` work in, on this tier as on `lite`; the invoking checkout is never touched. Read
`${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md` next, without cleaning up.
