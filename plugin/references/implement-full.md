# Full execution playbook

**The tier's shape.** Applies once the controller computed tier = `full` (`skills/implement/SKILL.md`). Every slice is
built in its own slicetree. A dispatched `superdev:implementer` builds a `behavior` slice and every `mechanical` slice
except a one-file one, and you build a **tiny slice** yourself (DAG loop step 2). You dispatch, review through
subagents, and integrate serially; honor the controller's **Invariants** and **Issue status** map throughout.

- **Your own scopetree edits.** You implement no slice in the scopetree. Your commits there are the base step's
  renumber and citation commits (`## Bring in the base`), merge-conflict resolutions (DAG loop step 4), and a moved
  design doc from `run-init.md`'s **Move dirty design docs**.
- **The end.** Once every slice is `merged`, settle the Minor queue (`## After the last merge`), then read
  `${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md` as your last step.

**The rare branches.** Applies to the branches that live in their own reference. Read each only when it fires, at the
step that names it: a resumed run (`implement-full-resume.md`), a slice review with a Critical or Important finding or
a finding to defer (`implement-full-fix-cycle.md`), a denied dispatch (`implement-full-denied.md`), a conflicted merge
(`merge-conflicts.md`), and a non-empty Minor queue (`implement-full-minor-sweep.md`).

## Branch model

**Run init first.** Applies before you cut anything. Read `${CLAUDE_PLUGIN_ROOT}/references/run-init.md`, the
controller's run opening.

**The scope branch.** Applies to the run kind run init handed you, `fresh` or `resumed`. Read
`${CLAUDE_PLUGIN_ROOT}/references/scope-branch.md`'s `## Cutting the scope branch` and do what it says for that kind;
never derive the kind yourself. Call the branch it leaves you on `<branch>` for the rest of this file.

- The cut runs from the invoking checkout. Every later command in this file, every merge included, addresses the
  scopetree, `<run-root>/scopetree`, with `git -C`.
- **On `fresh`**, do `run-init.md`'s deferred copy, commit, and revert now (**Move dirty design docs**). On `resumed` it
  already ran.
- Prepare the scopetree, fresh or resumed, per `scope-branch.md`'s `## Preparing a worktree`.
- Move the **scope anchor** → `in-progress` (per `issue-tracker.md`; best-effort).

**A slicetree per slice.** Applies to every slice. Cut a branch off scope into its own **slicetree** under this run's
root: `git worktree add <run-root>/slicetrees/<id> -b slice/<scope>/<id> <branch>`. Prepare it before the slice's
dispatch, per `scope-branch.md`'s `## Preparing a worktree`; a failing preparation stops that slice's dispatch.

**An epic carrying `## Integration branch`.** Applies to a wide refactor whose batches cannot stay green alone
(`plan-authoring.md` → *Wide refactors*). Cut `integration/<scope>` from `<branch>` at run start, keep it checked out
in the scopetree, and merge every slice into it instead of `<branch>`. The plan's final **integrate-and-verify** slice
switches that scopetree back with `git -C <run-root>/scopetree switch <branch>` and merges `integration/<scope>` into
it with `git -C <run-root>/scopetree merge --cleanup=scissors -F <file> integration/<scope>`, `<file>` the message file
`commit-messages.md` states, its body naming `integration/<scope>`.

- That merge runs no suite: the full-suite evidence `/superdev:ship` takes verifies it.
- A conflict or a refusal there follows step 4's **A conflicted merge**.
- Everything else in the loop is unchanged.

## Run lock

**The lock.** Applies right after the branch model. Write `<run-root>/run.lock` per `scope-mode.md`'s `## The run
lock`, which also owns leaving it in place at the end.

## Bring in the base

**The base step.** Applies right after the run lock, before the first slice, on every invocation and at every run
kind. Run `scope-branch.md`'s `## Bringing the scope branch to base`. A stop there dispatches no slice.

## Resume

**A resumed run.** Applies to a `resumed` run kind, and after a compaction mid-run. Read
`${CLAUDE_PLUGIN_ROOT}/references/implement-full-resume.md` and reconcile as its `## Resume (re-running on an existing
scope)` states before the DAG loop's first step.

## Progress log (per slice)

**The log.** Applies to every slice. Its **progress log** is `<run-root>/reports/<id>/progress.md`, an append-only,
oldest-first, git-ignored record of how the slice unfolded, and you own it.

- **Seed it** with a header (slice `<id>` and title) before the slice's first dispatch, or before you start a tiny
  slice.
- **Pass its path** to every agent you dispatch for the slice, implementer, fix implementers, and reviewers, and tell
  each to append to it as it works.
- **After each agent returns**, append a one-line outcome yourself: agent, status, commit range or finding count.

**Mark each dispatch.** Applies before each `implementer` or `slice-reviewer` dispatch, and before each resume message
that continues one. Append the line `dispatch: <agent>` to the log, and name in the dispatch the heading of the agent's
entry. A send-back to the same agent writes no marker.

- An implementer's heading: `Self-check — build`, `Self-check — fix cycle <n>`, or `Self-check — sweep cycle <n>`.
- A `slice-reviewer`'s heading: `Review — cycle <n>` (`<n>` the review cycle, 0 on a first review), `Review — sweep
  cycle <n>`, or `Review — post-merge`.

**The current entry.** Applies to every read of an agent's entry. An entry is the current one only where its heading
stands below the log's last `dispatch:` line. An entry above it under the same heading, from a resumed slicetree, a
re-dispatch after a denied or failed dispatch, or a sweep reopened at cycle 1, counts for none.

**A missing reviewer entry.** Applies to a `slice-reviewer` whose current entry is missing from the log. Message that
same reviewer with SendMessage to append its entry, and act on its verdict only once the entry is there. A fresh
reviewer is a second review, never this send-back.

## Interface file (per scope)

**The interface file.** Applies to every run. `<run-root>/interfaces.md` is the durable record of the cross-slice
interfaces a merged slice decided: function signatures, endpoints, CLI commands, and types later slices build on.
Append a slice's interfaces when you merge it (DAG loop step 4), pass the file's path in every dispatch (step 2), and
read it on resume.

## DAG loop

Applies until every slice is `merged`. Run the steps below in order, and repeat.

1. **Compute the runnable set**: the slices whose `depends-on` are all `merged` and which are still `todo`. Roots have
   empty `depends-on`.
2. **Dispatch implementers in parallel, capped.**

   **The implementer dispatch.** Applies to every runnable slice that is no tiny slice. Dispatch one
   `superdev:implementer` per slice, in its own slicetree, with its `model` from the controller's model table. Hand it
   only its own values, never the whole plan:
   - the slice `spec`, `acceptance`, and `test-applicability`;
   - the feature's change type, the prefix of the ledger's `**Branch:**` line (`scope.js get branch --root
     <run-root>`), never a reconstructed one;
   - its slicetree path (`<run-root>/slicetrees/<id>`), branch (`slice/<scope>/<id>`), and `<base>`, the commit the
     slice branch was cut from, as a full commit;
   - its progress-log path, seeded first, and the heading of its self-check entry, `Self-check — build`;
   - the global constraints, and the interface file path (`<run-root>/interfaces.md`);
   - the path to `<run-root>/dod.md`, never its text, and the exact **listed lines**: the `dod.md` lines
     `dod-ticks.md`'s `## The mapping gate` matches to this slice's own `id`;
   - on a `behavior` slice, the verify skill's path, or `none` (`verify-skill.md`'s `## The section`). Every route
     that dispatches or resumes the implementer on that slice hands the same value: this dispatch, a re-dispatch after
     NEEDS_CONTEXT or BLOCKED, a slice fix dispatch, and a SendMessage resume. A `mechanical` or `docs` slice and a tiny
     slice hand none. The sweep fix dispatch hands the path or `none` too (`implement-full-minor-sweep.md`'s step 1).

   `agents/implementer.md` owns the rest, and the dispatch restates none of it: `## Scope of the work`, `### Defect
   repair` (a `fix` change type starts a `behavior` slice at `references/diagnosis.md`), `### Running tests`, `### Fail-to-pass run`, `### A dependency you add`, `### Edit
   tools`, `## A failing test your slice did not cause`, `## Documentation`, `## Self-check`, and `## Report`.

   **Pilot the first wave.** Applies to a fresh scope with nothing merged yet. Dispatch a single slice first and take
   it through review and merge before you fill the cap. From the next wave on, fill the cap.

   **The concurrency cap.** Applies to every wave. Run at most **4** implementers at once, a fixed cap. A runnable
   set over the cap goes in **waves**: fill the cap, and backfill from the remaining runnable set as each
   implementer's step 3 completes. The cap changes no `depends-on` semantics.

   **A tiny slice is yours.** Applies to a `docs` slice and to a `mechanical` slice whose `spec` names a single file.
   It gets no implementer dispatch and takes no place under the cap: build it yourself in its own slicetree, cut and
   prepared per `## Branch model`'s **A slicetree per slice**. Work by these `agents/implementer.md` sections:
   `## Scope of the work`, `## Test applicability`, `## Surgical edits`, `### Edit tools`, `### Defect repair`,
   `### Running tests`, `### Fail-to-pass run`, `## Documentation`, and `## A failing test your slice did not cause`.
   `<run-root>/slicetrees/<id>` is the tree of every edit, run, and commit (`git -C`).
   - Seed its progress log, write no `dispatch:` line, and append your own outcome line once it is committed.
   - Commit on `slice/<scope>/<id>` (Conventional Commits). It invents no test.
   - A failing test the slice did not cause is named in your report, never fixed.
   - A tiny slice you cannot finish follows step 3's BLOCKED handling.
   - Step 3's observation concept, its skipped per-slice review, and step 4's merge, cleanup, ledger, interface, and
     tick steps apply unchanged, the tick from the report you write yourself.

   **Mark it started.** Applies to each dispatched slice, and each tiny slice as you start it. Move it to
   `in-progress` in the store, and run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" slice <id> in-progress --root
   <run-root>`.
3. **Per slice, when the implementer returns.**

   **The status.** Applies to every implementer report.
   - **DONE** → go on.
   - **DONE_WITH_CONCERNS** → address real concerns first.
   - **NEEDS_CONTEXT** → provide it and re-dispatch.
   - **BLOCKED** → assess: more context, a stronger model, a split slice, or escalation to the human. Move the slice
     → `blocked` while it is stuck. **`--unattended` → block** once the cheap remedies are spent, per `scope-mode.md`'s
     `## Unattended`.

   **Observations.** Applies to a defect the implementer reports, or one you meet in its report, that no slice of
   this scope covers and the scope did not cause. Capture it now, per `scope-findings.md`'s `## Observations`.

   **A `behavior` slice's fail-to-pass outcome comes from its implementer.** Applies where the slice's range, from the
   commit its slice branch was cut from to the slice branch's tip, changes both a test-path file
   (`docs/agents/verification.md`'s `## Test paths`, the defaults where it has none) and another file, and its
   test-path changes are not all deletions. Read the implementer's `fail-to-pass` line with `node
   "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" trace --slice <id> --kind fail-to-pass --root <run-root>` before you
   dispatch `superdev:slice-reviewer`. A range with no such line is a report defect: send the report back in the same
   cycle.

   **A report whose log holds no self-check entry goes back.** Applies before the slice review of a slice's build,
   and before the re-review of a slice fix. Read the slice's progress log for the current entry under the heading this
   dispatch named (`Self-check — build`, or `Self-check — fix cycle <n>`). A report whose log lacks it is a report
   defect: send it back, in the same cycle, to append the entry.
   - An item the entry marks `not covered` is fixed, or the report is `DONE_WITH_CONCERNS` naming it.
   - A `not observable` concern goes on to the slice review, which judges it like any claim.
   - The slice-review dispatch hands the log path, never the entry's text.

   **A fail-to-pass `unknown` is no finding.** Applies to a `fail-to-pass` trace line reading `unknown`. Start no fix
   cycle for it. The scope run's first non-exempt `unknown` is an observation, per `scope-findings.md`'s `##
   Observations`; an inherited one, whose control failure also shows at the slice's base, earns none.

   **The slice review runs no test.** Applies to every slice review. You run no fail-to-pass run and no test run for
   it, and hand it no tip result. The implementer's recorded runs and its fail-to-pass outcome are the slice's
   evidence.

   **A `behavior` slice's review.** Applies to a `behavior` slice. Move it to `in-review` in the store and run `node
   "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" slice <id> in-review --root <run-root>` before the first slice-review
   dispatch; the row stays `in-review` through every fix cycle, until the merge or a block. Then dispatch
   **`superdev:slice-reviewer`** per **The slice-reviewer dispatch**.

   **The slice-reviewer dispatch.** Applies to a slice's first review, review cycle 0, and every re-review, review
   cycle n > 0. Hand it only these values:
   - the slice `spec` and `acceptance`, and the global constraints;
   - the **subject**: the slice's range on a first review, and on a re-review the fix cycle's range, from the tip the
     latest earlier review read to the current tip (`implement-full-fix-cycle.md`'s `## The re-review dispatch`);
   - the ranges for the fail-to-pass check, both ends full commits: the slice's range, from the commit its branch was
     cut from to the tip the first review read, and on a re-review the fix cycle's range too;
   - the progress-log path and the heading of its entry, `Review — cycle <n>`;
   - on a `behavior` slice, the verify skill's path, or `none`, the value the implementer dispatch handed. It is
     configuration, never report text.

   Hand it no text from an implementer's report, the slice implementer's or a fix implementer's, and no paraphrase of
   their status or "met" claims. `agents/slice-reviewer.md` owns the rest, and the dispatch restates none of it:
   `## What the dispatch hands you`, `## Blind pass`, `## Run-trace findings`, `## Reading the progress log`, `##
   Re-review`, `## Lens 2 — Independent verification`, `## Lens 3 — Over-engineering`, `## Inherited failures`, `##
   Progress-log append`, and `## Report`.

   **Acting on the verdict.** Applies to every slice-review verdict. Judge Minor-only or blocking from the summary,
   and read the reviewer's current entry for the fix list, the queued Minors' remedies, and the mechanical judgment.
   - **No finding and no warranted cut** → merge the slice with no fix cycle.
   - **Only Minors, warranted cuts included** → **A Minor-only verdict merges the slice into the Minor queue**.
   - **Only unclosable Pass-to-pass findings left among the Critical and Important ones**, beside any deferred ones →
     the slice's loop ends at once, before the cap, with no fix cycle. The slice merges, its Minors join the Minor
     queue, and the run's final report names each unclosable finding with its slice, its case, and its reason.
   - **Any Critical or Important finding outside the deferred and unclosable ones** → read
     `${CLAUDE_PLUGIN_ROOT}/references/implement-full-fix-cycle.md` and run its `## Fix cycles` until the slice's loop
     ends.
   - **A finding whose remedy may add a capability the `spec` and the Definition of Done never named** → read that
     file's `## Deferring a finding` before you act. A deferred finding joins neither the fix list nor the Minor queue.

   **Warranted cuts.** Applies to the cuts a first review lists under `### Simplicity`. Warrant each recommended cut by
   `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md` §2's warranted-cut concept, and name each cut you decline in the
   slice's report with the rule it would break. Each warranted cut joins the review's findings as a Minor.
   - A re-review gets no over-engineering pass.
   - No implementer runs on a slice after its last review. Every change to it, a cut included, lands in a fix cycle a
     re-review reads, the slice's own or a Minor sweep cycle on the scope branch (`implement-full-minor-sweep.md`). A
     merge-conflict fix keeps its handling in step 4.

   **A Minor-only verdict merges the slice into the Minor queue.** Applies to a review, first or re-review, whose
   remaining findings outside the deferred and unclosable ones are only Minor, warranted cuts included, and at the cap
   to a remainder of Minors beside only **Pass-to-pass** or **Missing fail-to-pass run** findings. The slice's loop
   ends with no further fix cycle. Before the slice merges with open Minors:
   1. **Write every open finding into the slice's progress log.** Append one entry headed `Open Minors` that lists
      each Minor with its `file:line`, what is wrong, and how to fix it, copied from the reviewer's log entry, every
      warranted cut included and no deferred finding. Write the findings themselves, never a count.
   2. **Queue the slice**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" minors add <id> --root <run-root>`.
   3. Merge as step 4 states.

   A review with no Minor outside the deferred ones queues nothing. The run's final report names every queued slice.

   **A dispatch the permission classifier denies.** Applies to a denied implementer, slice-reviewer, or fix dispatch.
   Read `${CLAUDE_PLUGIN_ROOT}/references/implement-full-denied.md` and follow its `## A denied dispatch`.

   **A `mechanical` or `docs` slice.** Applies to every non-`behavior` slice. Skip the per-slice review.
4. **Merge, yourself, serially.** Compose the merge commit's message and write its file per
   `${CLAUDE_PLUGIN_ROOT}/references/commit-messages.md`, its body naming `slice/<scope>/<id>`. In the scopetree:
   `git -C <run-root>/scopetree merge --no-ff --cleanup=scissors -F <file> slice/<scope>/<id>`.

   **A failed merge with no `MERGE_HEAD`.** Applies to a merge that exited non-zero and left no `MERGE_HEAD`
   (`git -C <run-root>/scopetree rev-parse -q --verify MERGE_HEAD` finds none). It recorded nothing: relay git's
   output, check that `git -C <run-root>/scopetree status --porcelain` shows the scopetree unchanged, and stop and
   escalate. **`--unattended` → block** (`scope-mode.md`'s `## Unattended`).

   **A conflicted merge.** Applies to a merge that exited non-zero and left `MERGE_HEAD` set. Read
   `${CLAUDE_PLUGIN_ROOT}/references/merge-conflicts.md` and apply its **A refusal is no conflict** test first. Resolve
   a conflict yourself as it states, which includes concluding, aborting, and escalating, and handle a refusal by its
   **A refused merge**. Dispatch a fix subagent only where a conflict needs real code work.

   **A slice merge runs no suite.** Applies to every slice merge, clean or concluded with `merge --continue`. Go
   straight on to the next dispatch or merge. A break red evidence names goes to the scope review's fix loop.

   **Clean up and record.** Applies after every merge. Run these in order.
   1. Read the slice branch's tip with `git -C <run-root>/scopetree rev-parse slice/<scope>/<id>`.
   2. Run `git worktree remove <run-root>/slicetrees/<id>` and `git branch -D slice/<scope>/<id>`.
   3. **Append the interfaces this slice decided** to `<run-root>/interfaces.md`, unless it decided none.
   4. Move the slice → `merged`/done in the store, and run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" slice <id>
      merged --root <run-root>`. A `behavior` slice adds `--range <base>..<tip>`, both full commits: `<base>` the
      commit its slice branch was cut from, `<tip>` the tip from item 1.

   **Tick after the merge.** Applies once the merge lands, never before. Tick from the implementer's report, or a tiny
   slice's report you wrote yourself, per `dod-ticks.md`: apply the mapping gate to each line the report carried, and
   write every tick it earns on `<run-root>/dod.md` alone.
5. **Continue.** Recompute the runnable set and go to step 1.

## After the last merge

**Settle the Minor queue.** Applies once every slice is `merged`, before run handoff. Read the queue with `node
"${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get minors --root <run-root>`.

- **Empty** → dispatch nothing, and go to run handoff.
- **Non-empty** → read `${CLAUDE_PLUGIN_ROOT}/references/implement-full-minor-sweep.md` and run its `## Minor sweep`,
  or continue it per its `## A resumed sweep`, before run handoff.

## Leave the run standing

**What stays.** Applies at the end of the playbook. A stray `<run-root>/slicetrees/*`, a leftover `slice/<scope>/*`
branch, the run root, the scopetree, and `<run-root>/run.lock` stay for `/superdev:wrap-up`. The scopetree keeps
`<branch>` checked out for `/superdev:review` and `/superdev:document`. Settle the Minor queue, then read
`${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md` next, without cleaning up.
