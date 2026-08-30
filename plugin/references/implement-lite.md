# Lite execution playbook (≤3 slices)

The controller `Read`s this after computing tier = `lite` (see `skills/implement/SKILL.md`). Small plans
don't need per-slice worktrees or subagents: you (the controller) implement every slice yourself, inline,
test-first, in a single dedicated scope worktree. This is the one deliberate exception to the "controller
never implements inline" invariant (ADR 0001). Honor the controller's **Invariants** throughout. Once
every slice is committed, perform the documentation pass (`## Document, before you hand off` below), then
read `${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md` as your last step.

## Branch model

- **Read `${CLAUDE_PLUGIN_ROOT}/references/run-init.md`** — the controller's run opening — before cutting
  the worktree.
- **Scope branch into a dedicated worktree, per this run's kind.** Read
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Cutting the scope branch` and do what it says for
  the run kind the controller handed you — `fresh`, `appended`, or `resumed` (ADR 0028). Never derive that
  value yourself. Call whatever it leaves you on `<branch>` for the rest of this file: for `fresh` that is
  literally `git worktree add .superdev/scopes/<scope>/worktree -b <type>/<scope> <base>` (`<path>` there
  is always `.superdev/scopes/<scope>/worktree`; base from `code-management.md`, default `main`), while
  `appended` and `resumed` resolve `<branch>` per that same section, never by reconstructing the name.
  The invoking checkout is **never switched** — it stays where it was, so a second session can run in the
  same repo. All inline implementation happens **in this worktree**. Then move the **scope anchor** →
  `in-progress` (per `issue-tracker.md`; best-effort).

## Run lock

Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The run lock` and write
`<run-root>/run.lock` as it says (the absolute run-init run-root path in the invoking checkout — never a
`.superdev/scopes/<scope>/…` path from the worktree cwd, which resolves one level too deep). Leave the
lock in place when you finish: it spans the whole chain, and `/superdev:ship` removes it once the run is
shipped.

## Implement

- **In `depends-on` order, inline, test-first, skipping every slice the ledger already marks `merged`**
  (an appended feature's already-shipped slices seed `merged`, per the `status` field run init carried into
  `scope.js init`, and are never dispatched). For each slice: read its `spec` + `acceptance`, then carry
  the same tracer-bullet **and surgical-edit** disciplines an implementer subagent would (one RED test,
  minimal GREEN code, repeat; every hunk traces to an acceptance criterion or the specification — remove
  only what your own edit orphaned, name pre-existing dead code instead of deleting it, and **grep for a
  sentence before you replace it**, since a clause restated in a sibling document keeps the old contract
  alive while the suite stays green), **directly in the scope worktree at `.superdev/scopes/<scope>/worktree/`**.
  All file edits, test runs, `git` commands, and commits happen **in the scope worktree as the cwd** —
  never in the invoking checkout. `mechanical` / `docs` slices need no new test — the existing suite is
  the net. Read `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md` and run the command it selects for
  each run.
- **Declare the domain shapes a slice's `spec` names before its first RED test** — the same step
  `agents/implementer.md` carries, for the tier that dispatches nobody. A `spec` naming none leaves
  nothing to declare, the fields are yours, and a shape whose term `CONTEXT.md` lacks is reported rather
  than invented. A `spec`-named shape is requested, so the minimalism ladder still forbids every
  abstraction the `spec` did not name (ADR 0030).
- **Every acceptance criterion gets at least one increment.** On a `behavior` slice the loop terminates on
  acceptance coverage, not on the specification's happy path — each criterion, including the failure and
  boundary cases the criteria name, is the RED test of its own increment.
- **Carry the implementer's escalation discipline.** Can't get a slice green after reasonable effort →
  the Invariants' BLOCKED / 3-strike case: a **wrong cut**, not something to force through. Move the slice
  → `blocked` and escalate (re-slice or hand to the human) rather than grinding on it inline.
  **`--unattended` → block** instead of escalating, per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended** section: a wrong cut is re-planning
  work, which needs the interview `/superdev:plan` runs.
- **Commit per slice** on the scope branch (Conventional Commits) as each goes green — all commits in the
  scope worktree. Update the ledger with
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" slice <id> <status> --root <run-root>` (add
  `--range <commit-range>` on the `merged` write to record the slice's commit range, when you have one):
  `todo` → `in-progress` → `merged`, where `merged` means "committed to the scope branch" — there is no
  separate slice branch. Update the tracker status too, and **skip the `in-review` transition**: lite has
  no per-slice review.
- **No per-slice review, no per-slice progress log.** Your own context is the record of how each slice
  unfolded; the ledger is the durable trace once that context is gone.
- **No dispatch degrades here.** This tier dispatches nobody, so a denied dispatch cannot happen and the
  `**Degraded:**` line that `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes`
  section defines stays absent through slice execution. The doc step below can still write one, for that
  section's second shape. `/superdev:review` and `/superdev:document` dispatch too, so the line can
  appear later in the chain — leave any entry you find alone.

## Document, before you hand off

Once every slice is committed, **you** perform the documentation pass, in this same worktree, while the
scope is still in your context. That is the point of doing it here: a `doc-writer` dispatched later would
rebuild the same picture from a diff, and `/superdev:document` keeps only the cold `doc-reader` that hot
context cannot replace (ADR 0031). The `full` tier does not do this — its slices are built in parallel
worktrees and would collide on shared doc files.

- **Read `${CLAUDE_PLUGIN_ROOT}/references/doc-pass.md` and perform the pass it states**, both passes,
  over the range `<base>..<branch>` — this scope's own commits. It owns the content-type lens, the writing
  standard, the in-repo docs pass, and the knowledge-base pass; this step owns only when it runs and what
  it records.
- **Hand the pass the staging path as an absolute path** — `.superdev/kb-pending/<scope>/` in the
  **invoking checkout**, not a `.superdev/…` path resolved from this worktree's cwd, which lands one level
  too deep in a directory `/superdev:ship` deletes.
- **Commit the doc changes on the scope branch**, in this worktree, as their own commit.
- **Record the pass** with
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" docs set inline --root <run-root>`. That record is what
  tells `/superdev:document` to dispatch the `doc-reader` alone. Write it **after** the pass, never before:
  a run that ends between the two is exactly the case the absent record covers, and the next
  `/superdev:document` then runs the full writer.
- **A pass that changed nothing still records.** The docs already agreed with the code, which is a
  finished pass, not a skipped one.
- **A knowledge-base pass you cannot stage is a degraded pass**, the second shape in
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes` section: record it with
  `scope.js degraded add` and continue, attended or unattended alike. Record the doc pass as well — what
  ran, ran.
- **Nothing here asks a question**, so `--unattended` changes nothing about this step — nothing in this
  section can end the command, so both writes above rely on their defining section's own citation
  (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state` section) rather than
  repeating one here.

## Resume

Read the ledger — `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get slices --root <run-root>` and
`get stage` — and cross-check it against `git log <base>..<branch>` (`<branch>` from the branch step
above, never rebuilt as `<type>/<scope>`) in the scope worktree. A slice the ledger marks `merged` is
done; pick up at the next `todo` slice in `depends-on` order.

An interrupted `in-progress` slice may have left partial, uncommitted changes in the scope worktree.
Before resuming, check `<run-root>/run.lock`: it exists and is fresh (mtime under 1 hour old, the run-lock
hook's staleness threshold) → another session is live in this worktree; escalate or wait. **This worktree
already exists** — unlike `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope checkout`
recreate path, where the worktree is absent and the same fresh lock is this run's own instead. Stale or
absent → a crash resume: run `git status` / `git diff` in the scope worktree and decide whether to continue
that slice's uncommitted work or discard it, before resuming.

## Leave the worktree standing

Do **not** remove the scope worktree when the last slice is committed. `/superdev:review` and
`/superdev:document` run in it — a fix commit and the doc commit both land on the scope branch there — and
`/superdev:ship` removes it at the end of the chain. Read `${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md`
next, with the worktree, the run root, and the lock all in place.
