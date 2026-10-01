# Lite execution playbook (≤3 slices)

The controller `Read`s this after computing tier = `lite` (see `skills/implement/SKILL.md`). Small plans
don't need per-slice slicetrees or subagents: you (the controller) implement every slice yourself, inline,
test-first, in a single dedicated scopetree. This is the one deliberate exception to the "controller
never implements inline" invariant (ADR 0001). Honor the controller's **Invariants** throughout. Once
every slice is committed, perform the documentation pass (`## Document, before you hand off` below), then
read `${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md` as your last step.

## Branch model

- **Read `${CLAUDE_PLUGIN_ROOT}/references/run-init.md`** — the controller's run opening — before cutting
  the scopetree.
- **Scope branch into a dedicated scopetree, per this run's kind.** Read
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Cutting the scope branch` and do what it says for
  the run kind the controller handed you — `fresh` or `resumed` (ADR 0028). Never derive that
  value yourself. Call whatever it leaves you on `<branch>` for the rest of this file: for `fresh` that is
  literally `git worktree add <run-root>/scopetree -b <type>/<scope> <base>` (`<path>` there
  is always `<run-root>/scopetree`; base from `code-management.md`, default `main`), while
  `resumed` resolves `<branch>` per that same section, never by reconstructing the name.
  The invoking checkout is **never switched** — it stays where it was, so a second session can run in the
  same repo. **On `fresh`, do `references/run-init.md`'s deferred copy/commit/revert now**
  — it names this exact point; on `resumed` it already ran in run init, so there is nothing to do here.
  All inline implementation happens **in this scopetree**. Then move the **scope anchor** →
  `in-progress` (per `issue-tracker.md`; best-effort).

## Run lock

Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The run lock` and write
`<run-root>/run.lock` as it says (the absolute run-init run-root path in the invoking checkout — never a
`.superdev/scopes/<scope>/…` path from the scopetree cwd, which resolves one level too deep). Leave the
lock in place when you finish: it spans the whole chain, and `/superdev:wrap-up` removes it once the run is
closed.

## Implement

- **In `depends-on` order, inline, test-first, skipping every slice the ledger already marks `merged`**
  (a slice the store already reports as merged seeds `merged`, per the `status` field run init carried into
  `scope.js init`, and are never dispatched). For each slice: read its `spec` + `acceptance`, then carry
  the same tracer-bullet **and surgical-edit** disciplines an implementer subagent would (one RED test,
  minimal GREEN code, repeat; every hunk traces to an acceptance criterion or the specification — remove
  only what your own edit orphaned, name pre-existing dead code instead of deleting it, and **grep for a
  sentence before you replace it**, since a clause restated in a sibling document keeps the old contract
  alive while the suite stays green), **directly in the scopetree at `<run-root>/scopetree/`**.
  All file edits, test runs, `git` commands, and commits happen **in the scopetree as the cwd** —
  never in the invoking checkout. `mechanical` / `docs` slices need no new test — the existing suite is
  the net. Read `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md` and run the command it selects for
  each run.
- **Declare the domain shapes a slice's `spec` names before its first RED test** — the same step
  `agents/implementer.md` carries, for the tier that dispatches nobody. A `spec` naming none leaves
  nothing to declare, the fields are yours, and a shape whose term `CONTEXT.md` lacks is reported rather
  than invented. A `spec`-named shape is requested, so the minimalism ladder still forbids every
  abstraction the `spec` did not name (ADR 0030).
- **Survey the tests already there, and take the cheapest fixture** — the same two steps
  `agents/implementer.md` carries, for the tier that dispatches nobody. Before a `behavior` slice's first
  RED test, grep the test tree for the interface its `spec` names — one targeted search on that name, not
  a scan — and say what it returned, including the case where it returned nothing. What you find is what
  you delete or extend rather than layer a second test on top of. Then, where two fixtures both prove the
  behavior, take the cheaper one; a heavy fixture is the right choice where that integration is itself the
  behavior under test. Your own report carries both.
- **Every acceptance criterion gets at least one increment.** On a `behavior` slice the loop terminates on
  acceptance coverage, not on the specification's happy path — each criterion, including the failure and
  boundary cases the criteria name, is the RED test of its own increment.
- **An observation is captured the moment you meet it.** Read
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Observations` section and follow it: a defect
  you meet while implementing inline, that no slice of this scope covers and the scope did not cause,
  gets a triage record from you, the controller, right here — never held until the handoff at the end of
  the chain.
- **Carry the implementer's escalation discipline.** Can't get a slice green after reasonable effort →
  the Invariants' BLOCKED / 3-strike case: a **wrong cut**, not something to force through. Move the slice
  → `blocked` and escalate (re-slice or hand to the human) rather than grinding on it inline.
  **`--unattended` → block** instead of escalating, per
  `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended** section: a wrong cut is re-planning
  work, which needs the interview `/superdev:plan` runs.
- **Commit per slice** on the scope branch (Conventional Commits) as each goes green — all commits in the
  scopetree. Update the ledger with
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" slice <id> <status> --root <run-root>` (add
  `--range <commit-range>` on the `merged` write to record the slice's commit range, when you have one):
  `todo` → `in-progress` → `merged`, where `merged` means "committed to the scope branch" — there is no
  separate slice branch. Update the tracker status too, and **skip the `in-review` transition**: lite has
  no per-slice review.
- **No per-slice review, no per-slice progress log.** Your own context is the record of how each slice
  unfolded; the ledger is the durable trace once that context is gone.
- **Tick from your own report, the same way the full tier's controller ticks from an implementer's**
  (`${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`). You dispatch nobody, so you write the report to
  yourself: as each slice goes green, judge the listed lines the mapping gate matches to that slice — every
  `dod.md` line whose tag names it, by `id` or by its `issue` (or, on a `dod.md` with no tags at all **and
  a ledger listing exactly one slice**, every line) — met with evidence, not met with a reason, or ceiling
  with partial evidence — and tick what earns it, on `<run-root>/dod.md` and on the anchor, once the slice
  is committed. An untagged line on a multi-slice `dod.md` is no slice's listed line — nor is any line on a
  `dod.md` with no tags at all when the ledger lists more than one slice (a run begun before tagging
  existed); leave it for run handoff's own handoff pass, read next, which settles it as if it read `scope`.
- **No dispatch degrades here.** This tier dispatches nobody, so a denied dispatch cannot happen and the
  `**Degraded:**` line that `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes`
  section defines stays absent through slice execution. The doc step below can still write one, for that
  section's second shape. `/superdev:review` and `/superdev:document` dispatch too, so the line can
  appear later in the chain — leave any entry you find alone.

## Document, before you hand off

Once every slice is committed, **you** perform the documentation pass, in this same scopetree, while the
scope is still in your context. That is the point of doing it here: a `doc-writer` dispatched later would
rebuild the same picture from a diff, and `/superdev:document` keeps only the cold `doc-reader` that hot
context cannot replace (ADR 0031). The `full` tier does not do this — its slices are built in parallel
slicetrees and would collide on shared doc files.

- **Read `${CLAUDE_PLUGIN_ROOT}/references/doc-pass.md` and perform the pass it states**, both passes,
  over the range `<base>..<branch>` — this scope's own commits. It owns the content-type lens, the writing
  standard, the in-repo docs pass, and the knowledge-base pass; this step owns only when it runs and what
  it records.
- **Hand the pass the staging path as an absolute path** — `.superdev/kb-pending/<scope>/` in the
  **invoking checkout**, not a `.superdev/…` path resolved from this scopetree's cwd, which lands one level
  too deep in a directory `/superdev:wrap-up` deletes.
- **Commit the doc changes on the scope branch**, in this scopetree, as their own commit.
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
above, never rebuilt as `<type>/<scope>`) in the scopetree. A slice the ledger marks `merged` is
done; pick up at the next `todo` slice in `depends-on` order.

**Run init's own entry step already checked the lock's liveness before this playbook ever started
(`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The run lock`), so this step reconciles state
rather than detecting a live second session — no further lock read of its own.** An interrupted
`in-progress` slice may have left partial, uncommitted changes in the scopetree: run `git status` /
`git diff` in the scopetree and decide whether to continue that slice's uncommitted work or discard it,
before resuming.

## Leave the scopetree standing

Do **not** remove the scopetree when the last slice is committed. `/superdev:review` and
`/superdev:document` run in it — a fix commit and the doc commit both land on the scope branch there — and
`/superdev:wrap-up` removes it at the end of the chain. Read `${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md`
next, with the scopetree, the run root, and the lock all in place.
