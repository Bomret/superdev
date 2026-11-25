# Lite execution playbook

**The tier's shape.** Applies once the controller computed tier = `lite` (`skills/implement/SKILL.md`). You implement
every slice yourself, inline and test-first, in one scopetree, with no slicetree and no subagent; this is the one
tier where the controller implements in the scopetree. Honor the controller's **Invariants** throughout. Once every
slice is committed, run the documentation pass (`## Document, before you hand off`), then read
`${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md` as your last step.

## Branch model

**Run init first.** Applies before you cut anything. Read `${CLAUDE_PLUGIN_ROOT}/references/run-init.md`, the
controller's run opening.

**The scope branch.** Applies to the run kind run init handed you, `fresh` or `resumed`. Read
`${CLAUDE_PLUGIN_ROOT}/references/scope-branch.md`'s `## Cutting the scope branch` and do what it says for that kind;
never derive the kind yourself. Call the branch it leaves you on `<branch>` for the rest of this file.

- The cut runs from the invoking checkout, which is never switched. Every inline edit, test run, `git` command, and
  commit happens in `<run-root>/scopetree` as the cwd.
- **On `fresh`**, do `run-init.md`'s deferred copy, commit, and revert now (**Move dirty design docs**). On `resumed` it
  already ran.
- Prepare the scopetree, fresh or resumed, per `scope-branch.md`'s `## Preparing a worktree`.
- Move the **scope anchor** → `in-progress` (per `issue-tracker.md`; best-effort).

## Run lock

**The lock.** Applies right after the branch model. Write `<run-root>/run.lock` per `scope-mode.md`'s `## The run
lock`, which also owns leaving it in place at the end.

## Bring in the base

**The base step.** Applies right after the run lock, before the first slice, on every invocation and at every run
kind. Run `scope-branch.md`'s `## Bringing the scope branch to base`. A stop there builds no slice.

## Implement

**The order.** Applies to every slice. Build the slices in `depends-on` order, inline, skipping every slice the ledger
already marks `merged`. A slice the store already reports as merged seeds `merged` through run init and is never
built.

**A sibling blocker.** Applies to a slice that carries one (`skills/implement/SKILL.md`'s **The slices**). The slice
starts only once its sibling blocker reads closed through the store document's **Read a slice**, read when the slice
comes up. A failed read counts as open. When every remaining slice waits on an open sibling blocker, stop: run
`scope.js step block --root <run-root>`, and name each open blocker with its repository. A later
`/superdev:implement` reads them again. **`--unattended` → block** the same way, per `scope-mode.md`'s
`## Unattended` (INV-0038).

**The change type.** Applies to a feature whose change type is `fix`, the prefix of the ledger's `**Branch:**` line
(`scope.js get branch --root <run-root>`). Start each `behavior` slice at `${CLAUDE_PLUGIN_ROOT}/references/diagnosis.md`:
run its loop (`## The red-capable command (the gate)` to `## Redact`) before the slice's first RED test. A `spec` that
hands a proven cause goes straight to the RED test. A `docs` or `mechanical` slice skips the loop, as
`agents/implementer.md`'s `### Defect repair` states.

**The build discipline.** Applies to every slice. Read its `spec` and `acceptance`, then carry the disciplines an
implementer subagent carries, because no agent body is loaded on this tier:

- **Tracer bullets.** One RED test, run once, then the minimal code that passes it, and repeat. Never write the tests
  in bulk.
- **Surgical edits.** Every hunk traces to an acceptance criterion or the `spec`. Remove only what your own edit
  orphaned, and name pre-existing dead code instead of deleting it.
- **Grep for a sentence before you replace it.** A clause restated in a sibling document keeps the old contract alive
  while the suite stays green.
- **Every acceptance criterion gets at least one increment.** On a `behavior` slice each criterion, its failure and
  boundary cases included, is the RED test of its own increment.
- **A `mechanical` or `docs` slice** needs no new test: the existing suite is its net.
- **The verify skill.** On a `behavior` slice, with a skill path the run read (`skills/implement/SKILL.md`'s **The
  config**), follow `verify-skill.md`'s `## Following the skill` before the slice's `merged` write, its **Stop on
  every exit** included. Your report to yourself quotes what you observed per acceptance item, and backs the slice's DoD ticks.
  An observation that contradicts an acceptance item is a RED step. `none`, an absent section, and a `mechanical` or
  `docs` slice change nothing here.

**Domain shapes.** Applies to a slice whose `spec` names domain shapes. Declare them before its first RED test. The
fields are yours, and a shape whose term `CONTEXT.md` lacks is reported rather than invented. A `spec`-named shape is
requested, so the minimalism ladder still forbids every abstraction the `spec` did not name.

**Existing tests.** Applies before a `behavior` slice's first RED test. Grep the test tree once for the interface its
`spec` names, and say what it returned, nothing included. Delete or extend what you find rather than layer a second
test on it, and where two fixtures both prove the behaviour take the cheaper one, unless the integration is itself
the behaviour under test. Your report carries both.

**Test runs.** Applies to every test run of a slice. Run the command `test-selection.md` selects, through `scope.js
test`, per its `## The two commands` and its `## The changed-path set` **The build loop**, **Only the work's tests**, and
**A focused fence that repeats the full fence**. `<ref>` there is the slice base, the `git rev-parse HEAD` you recorded when the slice
started.

**A failing test the slice did not cause is named, never fixed.** Applies to a test that also fails at the slice's
base commit, and to a flaky test the slice did not touch, even when it passes at that base. Name it in your report. Fix none, block on none, and count no strike for it; the scope review's fix loop
repairs it.

**A flaky test.** Applies to a test that both passes and fails at one commit with nothing changed, seen within the slice's own runs. Follow `agents/implementer.md`'s `## A flaky test`, with the slice base as `<range-start>`. Record a flaky test the slice did not touch as an observation yourself (**Observations** below).

**Observations.** Applies to a defect you meet that no slice of this scope covers and the scope did not cause. Capture
it now, per `scope-findings.md`'s `## Observations`.

**Escalation.** Applies to a slice you cannot get green after reasonable effort. It is a **wrong cut**: move the slice
→ `blocked` and escalate, re-slice or hand to the human, per the Invariants' fix-loop cap. **`--unattended` → block**,
per `scope-mode.md`'s `## Unattended`.

**Commit and record.** Applies to every slice as it goes green. Commit on the scope branch in the scopetree, the
message per `${CLAUDE_PLUGIN_ROOT}/references/commit-messages.md` with the change type and the slice's store reference,
and move the ledger with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" slice <id> <status>
--root <run-root>`: `todo` → `in-progress` → `merged`. `merged` means committed to the scope branch. Update the tracker
status too, skipping `in-review`.

- **A refused commit** → report git's own output and stop, the slice left `in-progress`, per `commit-messages.md`'s
  `## A refused commit or merge`. **`--unattended` → block**, per `scope-mode.md`'s `## Unattended`.

**A `behavior` slice's range and fail-to-pass run.** Applies to every `behavior` slice. Its `merged` write carries
`--range <base>..<tip>`, both full commits: `<base>` the scope branch's tip before the slice's first commit, `<tip>`
`git rev-parse HEAD` once the slice's last commit is in. Before that write, while the slice is still `in-progress`,
run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" fail-to-pass <base>..<tip> -- <command>` from the scopetree where
the range changes both a test-path file (`docs/agents/verification.md`'s `## Test paths`, the defaults where it has
none) and another file, and its test-path changes are not all deletions.

- **The command** names every test file the range adds or modifies, and runs from the tree root.
- **The control.** A final `test path` run of those files from the tree root at the committed tip, with the exact
  command the verb then takes, is reused as the verb's control when the tip's `docs/agents/verification.md` carries a
  `## Prepare command` section holding a command or `none`; the verb then runs only the second run and skips its first
  preparation. Without that section the verb runs its own control. After a final focused run, the verb settles from
  the trace or runs its own control.
- **A range whose test-path changes are all deletions** and that adds behaviour outside the test paths: write a test
  for that behaviour, then run the verb.
- **Background.** Run the verb in the background when two runs of the range's test files can outlast the ceiling, and
  wait for its end (`test-selection.md`'s `## The two commands`).
- **Exit status.** 0 means the verb read and printed an outcome; inside a run root it appends the line, and a failed
  append is reported on stderr with the status still 0. 1 means the verb refused the range or hit an error: name a test
  file the command left out and run it again. An error blocks nothing.

**The fail-to-pass outcome.** Applies to the verb's printed outcome.

- **`fail-to-pass`**, or **`fail-to-pass settled-from-trace`** → write the `merged` row.
- **A run that does not pass** → a RED step.
- **`pass-to-pass`** → strengthen the slice's tests, commit, and run the verb again from the same `<base>`, before the
  `merged` write.
- **`pass-to-pass` in one of the three unclosable cases** of `fail-to-pass.md`'s `## Fail-to-pass run` → stop
  strengthening, keep the outcome line, write the `merged` row, and name the case with its reason in your report.
  The scope review's `final-reviewer` judges it.
- **`unknown`** → no finding and no fix cycle. Its reasons, its bounds, and the first-`unknown` observation are
  `scope-findings.md`'s `## Observations`; write that triage record yourself.

**No per-slice review.** Applies to every slice. Run no per-slice review, no per-slice over-engineering pass, and keep
no per-slice progress log. The ledger is the durable trace.

**Tick from your own report.** Applies as each slice goes green. You dispatch nobody, so write the report to yourself
and tick from it as `dod-ticks.md` states for a controller: judge the lines `## The mapping gate` matches to the slice
met with evidence, not met with a reason, or ceiling with partial evidence. Tick what earns it on `<run-root>/dod.md`
alone, once the slice is committed. A line the gate gives no slice is left for run handoff's handoff pass.

**No dispatch degrades here.** Applies to slice execution. A denied dispatch cannot happen, so the `**Degraded:**` line
of `scope-findings.md`'s `## Degraded passes` stays absent through slice execution. The doc step can still write one,
in that section's second shape. Leave alone any entry a later command of the chain wrote.

## Document, before you hand off

**The inline doc pass.** Applies once every slice is committed. You run the documentation pass yourself, in this
scopetree, while the scope is in your context. `/superdev:document` still dispatches its `doc-writer` and `doc-reader`
after this pass, whatever it changed. The `full` tier runs no inline pass.

- **The pass.** Read `${CLAUDE_PLUGIN_ROOT}/references/doc-pass.md` and perform both passes it states over
  `<range-base>..<branch>`, this scope's own commits, `<range-base>` per `scope-mode.md`'s `## The scope's range base`.
  That file owns the content-type lens, the writing standard, the in-repo docs pass, and the knowledge-base pass.
- **The staging path.** Hand the pass the directory `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" staging <scope>`
  prints, as an absolute path: `.superdev/kb-pending/<scope>/` in the main working tree.
- **The `docs` targets.** Hand the pass every open `docs`-tagged line `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js"
  dod-open --root <run-root> --tag docs` prints, verbatim. `/superdev:review`'s `holds` verdict ticks each one the pass
  made true (`review-scope-mode.md`'s `### 4.5 The Definition-of-Done criteria`).
- **The commit.** Commit the doc changes on the scope branch, in this scopetree, as their own commit, the message per
  `commit-messages.md` with the change type and the scope anchor's store reference. A refused commit stops as
  **Commit and record** states.

**Record the pass.** Applies once the pass ran. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" docs set inline
--root <run-root>` after the pass, never before. A pass that changed nothing still records.

- **A knowledge-base pass you cannot stage** is a degraded pass, the second shape in `scope-findings.md`'s `##
  Degraded passes`: record it with `scope.js degraded add` and continue, attended or unattended alike. Record the doc
  pass as well.
- Nothing in this step asks a question, so `--unattended` changes nothing here.

## Resume

**Reconcile the ledger.** Applies to a resumed run. Read `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" state --root
<run-root>`, its `slices` and `stage` fields, and cross-check it against `git log <range-base>..<branch>` in the
scopetree (`<range-base>` per `scope-mode.md`'s `## The scope's range base`; `<branch>` from the branch step, never
rebuilt as `<type>/<scope>`). A slice the ledger marks `merged` is done; pick up at the next `todo` slice in
`depends-on` order.

- A `malformed` entry names a slice row the ledger cannot read: resolve it first.
- Make no lock read of your own: `scope-mode.md`'s `## The run lock` owns that rule.
- An interrupted `in-progress` slice may have left uncommitted changes in the scopetree. Run `git status` and `git
  diff` there, and decide whether to continue that work or discard it, before resuming.

## Leave the scopetree standing

**What stays.** Applies once the last slice is committed. Leave the scopetree, the run root, and the lock in place:
`/superdev:review` and `/superdev:document` run in the scopetree, and `/superdev:wrap-up` removes it at the end of the
chain. Read `${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md` next.
