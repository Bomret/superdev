# Full execution playbook (more than 3 `behavior` slices)

The controller `Read`s this after computing tier = `full` (see `skills/implement/SKILL.md`). Every slice is
built in its own slicetree. A dispatched `superdev:implementer` builds a `behavior` slice and every
`mechanical` slice except a one-file one. You build a **tiny slice** yourself: a `docs` slice, or a
`mechanical` slice whose `spec` names a single file (DAG loop step 2). You never implement in the scopetree;
you dispatch, review via subagents, and integrate serially.
Honor the controller's **Invariants** and **Issue status** map throughout. Once every slice is `merged`,
settle the Minor queue (`## After the last merge` below), then read
`${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md` as your last step.

A rare branch lives in its own reference, read only when it fires: a resumed run
(`implement-full-resume.md`), a slice review with a Critical or Important finding or a finding to defer
(`implement-full-fix-cycle.md`), a denied dispatch (`implement-full-denied.md`), a conflicted merge
(`merge-conflicts.md`), and a non-empty Minor queue (`implement-full-minor-sweep.md`). Each step below
names the point where you read it.

## Branch model

- **Read `${CLAUDE_PLUGIN_ROOT}/references/run-init.md`** — the controller's run opening — before cutting
  anything here.
- **Scope branch, into the scopetree, per this run's kind.** Read
  `${CLAUDE_PLUGIN_ROOT}/references/scope-branch.md`'s `## Cutting the scope branch` and do what it says for
  the run kind the controller handed you — `fresh` or `resumed`. Never
  derive that value yourself. Call whatever it leaves you on `<branch>` for the rest of this file: for
  `fresh` that is literally `git worktree add <run-root>/scopetree -b <type>/<scope> <base>`
  (`<type>` and `<scope>` chosen in run init; base from `code-management.md`, default `main`), while
  `resumed` resolves `<branch>` per that same section, never by reconstructing the name.
  The cutting/reuse command itself runs from the invoking checkout, like any `git worktree add`; every
  later command in this file — every merge — addresses the scopetree, `<run-root>/scopetree`,
  with `git -C`, and the invoking checkout is never switched onto the branch. **On `fresh`,
  do `references/run-init.md`'s deferred copy/commit/revert now** — it names this exact
  point; on `resumed` it already ran in run init, so there is nothing to do here. **Prepare the scopetree**,
  fresh or resumed: `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" prepare <run-root>/scopetree`, per `scope-branch.md`'s `## Preparing a worktree`; a failing
  preparation stops the run, and `--unattended` blocks. Then move the **scope
  anchor** → `in-progress` (per `issue-tracker.md`; best-effort).
- **Per slice**, a branch off scope in its own **slicetree** under this run's root:
  `git worktree add <run-root>/slicetrees/<id> -b slice/<scope>/<id> <branch>`. **Prepare it** before the
  slice's dispatch: `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" prepare <run-root>/slicetrees/<id>`, per `scope-branch.md`'s `## Preparing a worktree`; a failing
  preparation stops that slice's dispatch, and `--unattended` blocks. The slice
  branch is **scoped** (`slice/<scope>/<id>`) so parallel runs never collide even when slice ids repeat.
  Filesystem isolation lets independent slices run in parallel; `.superdev/` being git-ignored keeps the
  nested slicetrees out of the parent's status.
- **An epic carrying `## Integration branch`** (a wide refactor whose batches can't stay green alone —
  `${CLAUDE_PLUGIN_ROOT}/references/plan-authoring.md` → *Wide refactors*) inserts one branch
  between the slices and the scope: cut `integration/<scope>` from `<branch>` at run start, keep it
  checked out **in the scopetree**, and merge every slice into it instead of `<branch>`. The branch keeps
  the scope branch green while batches that cannot stay green alone are in flight. The plan's final **integrate-and-verify** slice is
  where you switch that same scopetree back to `<branch>` and merge `integration/<scope>` into it. That
  merge runs no suite: the scope review's exit run verifies it, and it is the run's promise of green.
  Everything else in the loop is unchanged.

## Run lock

Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The run lock` and write
`<run-root>/run.lock` as it says (the absolute run-init run-root path in the invoking checkout — never a
`.superdev/scopes/<scope>/…` path resolved from a scopetree or slicetree cwd, which resolves one level too deep). Leave
the lock in place when you finish: it spans the whole chain, and `/superdev:wrap-up` removes it once the run
is closed.

## Bring in the base

Right after the run lock, before the first slice, run `${CLAUDE_PLUGIN_ROOT}/references/scope-branch.md`'s
`## Bringing the scope branch to base`, on every invocation and at every run kind.
A stop there dispatches no slice. The step runs no test suite, so the suite record never holds a slice back.

## Resume

On a `resumed` run kind, and after a compaction mid-run, read
`${CLAUDE_PLUGIN_ROOT}/references/implement-full-resume.md` and reconcile as its
`## Resume (re-running on an existing scope)` states before the DAG loop's first step.

## Progress log (per slice)

Each slice has a **progress log** at `<run-root>/reports/<id>/progress.md` — a running record of how the
slice unfolded, not a final report. **You (the controller) own it:**

- **Seed it** with a header (slice `<id>` + title) before the slice's first dispatch, or before you start
  a tiny slice.
- **Pass its path** to *every* agent you dispatch for that slice — implementer, fix implementers,
  reviewers — and tell each to append to it as it works.
- **Mark each dispatch.** Before each `implementer` or `slice-reviewer` dispatch, and before each resume message
  that continues one, append the line `dispatch: <agent>` to the log. A send-back to the same agent writes no
  marker. Each such dispatch names the heading of the agent's entry: `Self-check — build`,
  `Self-check — fix cycle <n>`, or `Self-check — sweep cycle <n>` for an implementer, and `Review — cycle <n>`
  (`<n>` the review cycle, 0 on a first review), `Review — sweep cycle <n>`, or `Review — post-merge` for a
  `slice-reviewer`. **An entry is the current one only where its heading stands below the log's last
  `dispatch:` line**: an entry above it under the same heading, from a resumed slicetree, a re-dispatch after a
  denied or failed dispatch, or a sweep reopened at cycle 1, counts for none.
- **After each agent returns, append a one-line outcome yourself** (agent, status, commit range or
  finding count). A loaded subagent often skips a prompted write, so your own entry keeps the log
  complete even when the agent wrote nothing. A `slice-reviewer` whose current entry is missing from the log is
  the exception: its report is a summary that carries no remedies, so message that same
  reviewer with SendMessage to append its entry, and act on its verdict only once the current entry is there. A fresh
  reviewer is a second review, never this send-back.

Append-only, oldest-first, git-ignored scratch. It is also `slice-reviewer`'s after-blind-pass input and
a re-review's record of earlier findings. It exists so a human — or a controller resumed after
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
2. **Dispatch implementers in parallel, capped** — one `superdev:implementer` per runnable slice that is no
   tiny slice (**A tiny slice is yours**, below), each in
   its own slicetree, each with its `model` from the controller's model table. Give each only its own
   specifics: the slice `spec` + `acceptance` + `test-applicability`, its slicetree path
   (`<run-root>/slicetrees/<id>`) + branch (`slice/<scope>/<id>`), base/head, its
   **progress-log** path (`<run-root>/reports/<id>/progress.md` — seed it first), the global constraints,
   and the **interface file** path (`<run-root>/interfaces.md`). Not the whole plan. Also hand it the
   **path** to `<run-root>/dod.md`, never its text, plus the exact **listed lines** this slice's dispatch
   covers — the `dod.md` lines the mapping gate matches to this slice's own `id`
   (`${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s mapping gate): build only this slice, and
   report on those listed lines. Every implementer dispatch, a fix dispatch in step 3 included, also
   requires that when the implementer adds a dependency (a direct dependency declared in a package
   manifest, development dependencies included) its progress log names the exact package and the
   URL of the official documentation or registry page it checked, and that an implementer who cannot
   reach that page logs the package as unverified because the documentation was unreachable and returns
   `DONE_WITH_CONCERNS`. A dependency the repository itself provides (a workspace, path, or file
   reference) is not a new dependency. Every implementer dispatch also tells it that the run trace records
   its edits and runs, and that its progress log carries no RED or GREEN line. Every dispatch that builds a slice, fixes a slice, or fixes a Minor sweep also tells it to append a self-check entry to its progress log before its report, as its `## Self-check` states, headed with the line the dispatch names for it: `Self-check — build` for a slice's build, `Self-check — fix cycle <n>` for the slice's fix cycle n, and `Self-check — sweep cycle <n>` for the sweep's cycle n, a fresh entry even where the log already holds that heading, since only an entry below the log's last `dispatch:` line counts (`## Progress log (per slice)`). The entry walks each acceptance item, each edge case the `spec` names, each cited invariant, and on a fix dispatch each finding in its list (on a sweep fix dispatch, which hands no slice `spec`, the findings and any `spec` item the dispatch names), against the whole slice range, an item that names a set walked member by member, one mark per member; on a `behavior` slice the confirmation from the run trace that a failing test came before each change. It tells it to mark an item `covered` only where the entry quotes what the item demands, or what the reference artifact the `spec` or the dispatch cites demands, beside what the work does, with no file, test, or commit pointer standing alone as evidence; on a slice fix or sweep fix dispatch, to quote each finding's claim beside what the work now does; on a `behavior` slice, and on a sweep fix for each finding whose fix changes behaviour, to name for each `covered` item one plausible wrong implementation its test rejects; and to mark an item no tool the repository offers can observe `not observable`, with its reason, and every other item `not covered`. It tells it to fix an item or set member found `not covered` before the report, or name it in its concerns under `DONE_WITH_CONCERNS`, and to name every `not observable` item there too. It tells it its report is the shape `agents/implementer.md`'s `## Report` lists, every item that section names for its dispatch kind, and repeats no narrative its progress log holds. No slice-review dispatch carries the self-check. It names the start of the implementer's
   own range, `<base>` (the commit the slice branch was cut from) or `<sweep-base>` on a sweep fix dispatch, and tells it
   to run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" fail-to-pass <range-start>..HEAD -- <command>` before its report,
   the command naming every test file its range adds or modifies, wherever its range changes a test-path file and another
   file and its test-path changes are not all deletions, to write a test first where its test-path changes are
   all deletions and it adds behaviour outside the test paths, and to fix a `pass-to-pass` outcome in the same dispatch, unless its range is in one of the three unclosable cases
   of `fail-to-pass.md`'s `## Fail-to-pass run`, which it then reports with its reason. Every implementer dispatch also
   tells it to run only the tests that verify its work, each through `scope.js test` (`test path <file>... -- <command>` for a step's test files, and one `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test
   focused <changed paths>` with at least one path over the whole changed-path set once its work is committed), and its fail-to-pass run, and never `test full`,
   `test whole`, or a `test focused` with no path: the scope review's exit run is the scope's one full-suite run. It tells it to run every test run in the foreground with Bash's `timeout` at its ceiling, 600000 ms unless
   `BASH_MAX_TIMEOUT_MS` raises it, to run only a run that can outlast the ceiling through the runner in the background, and to wait for its end before acting on it, and
   tells it that a test command is recorded as typed and pushed with the run state, so a secret belongs in the environment, never on the command line, and
   tells it to edit files through the edit tools, never through a script. It also tells it that a RED or GREEN step runs the test files
   that hold the tests that step works on through `test path`, and that the one focused run over the whole
   changed-path set comes after its commit and before the fail-to-pass run, and that its last GREEN
   step runs after the last commit, as a `test path` run of the range's test files from the tree root with the exact
   command it then passes to the verb, which reuses that run as its first. Where the focused fence repeats the full fence, it tells it instead that each step runs each test file
   it works on through `test path <file>... -- <command>`, that it makes no whole-set run, and that the `test path` run of its range's test files and the fail-to-pass run are its runs before the report. Every implementer dispatch also tells it that a failing test its slice did not cause, one that
   also fails at the slice's base commit, is named in its report, neither fixed nor blocked on, and left to
   the scope review's fix loop: a named inherited failure is no BLOCKED and no strike. A dispatch for a
   `docs` slice whose `spec` names `AGENTS.md`-hierarchy text as its deliverable tells the implementer it
   edits exactly that text; every other slice dispatch leaves the `AGENTS.md` hierarchy to the doc pass,
   as the implementer's own Documentation section states.

   **Pilot the first wave.** On a fresh scope (nothing merged yet), dispatch a single slice first and take
   it through review + merge before filling the cap — a systemic problem (a mis-specified convention, a
   broken test command) surfaces once instead of being replicated across every parallel slicetree. From the
   next wave on, fill the cap.

   Cap how many run **concurrently** at a **max-concurrent-implementers** limit (default **4**;
   configurable — raise it once you've piloted a scope and trust the cost + merge-queue size, lower it for
   a heavier model or a tighter budget). If the runnable set exceeds the cap, dispatch in **waves**: fill
   the cap, and as each implementer returns (step 3 completes for it), backfill from the remaining
   runnable set. The cap only throttles concurrency; it never changes `depends-on` / DAG semantics.

   **A tiny slice is yours.** A `docs` slice, and a `mechanical` slice whose `spec` names a single file, gets
   no implementer dispatch and takes no place under the cap: you build it yourself, in its own slicetree, cut
   and prepared as above. Seed its progress log, write no `dispatch:` line, and append your own outcome line
   once it is committed. Work as an implementer would: `<run-root>/slicetrees/<id>` is the tree of every
   edit, run, and commit (`git -C`), every edit goes through the edit tools, every hunk traces to the `spec`,
   you grep for a sentence before you replace it, and you commit on `slice/<scope>/<id>` (Conventional
   Commits). It invents no test: the existing suite is its net. A `docs` slice whose `spec` names
   `AGENTS.md`-hierarchy text as its deliverable edits exactly that text, and every other tiny slice leaves
   the `AGENTS.md` hierarchy to the doc pass. Make exactly the test runs, the fail-to-pass run included,
   that this step tells an implementer to make, under the same conditions; a failing test the slice did not
   cause is named in your report, never fixed. A tiny slice you cannot finish follows step 3's BLOCKED
   handling. Then step 3's observation bullet, its skipped per-slice review, and step 4's merge, cleanup,
   ledger, interface, and tick steps apply unchanged, the tick from the report you write yourself.

   Mark each dispatched slice, and each tiny slice as you start it, `in-progress` — the store transition, plus
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" slice <id> in-progress --root <run-root>` for the ledger.
3. **Per slice, when the implementer returns** (handle status: DONE / DONE_WITH_CONCERNS — address real
   concerns first / NEEDS_CONTEXT — provide it, re-dispatch / BLOCKED — assess: more context, stronger
   model, split the slice, or escalate to the human — and move the slice → `blocked` while it's stuck;
   **`--unattended` → block** once the cheap remedies are spent, per
   `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended** section, rather than escalating to a
   human who is not there):
   - **An observation is captured the moment you meet it.** Read
     `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Observations` section and follow it: a
     defect the implementer reports, or one you meet yourself in its report, that no slice of this scope
     covers and the scope did not cause gets a triage record from you, the controller, right here — never
     held until the handoff at the end of the chain.
   - **A `behavior` slice's fail-to-pass outcome comes from its implementer**. Where
     the slice's range, from the commit its slice branch was cut from to the slice branch's tip, changes both a test-path
     file (`docs/agents/verification.md`'s `## Test paths`, the defaults where it has none) and another file, and its
     test-path changes are not all deletions, the implementer's run writes a `fail-to-pass` line over a range from that base to that tip. Read it with
     `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" trace --slice <id> --root <run-root>` before you dispatch
     `superdev:slice-reviewer`. A range with no such line is a report defect: send the report back to the implementer
     in the same cycle. You run no fail-to-pass run and no test run for a slice review.
   - **A report whose log holds no self-check entry goes back**. Before you dispatch
     `superdev:slice-reviewer` for a slice's build, and before the re-review of a slice fix, read the slice's progress log
     for the self-check entry under the heading this dispatch named, `Self-check — build` or `Self-check — fix cycle <n>`
     for the current cycle, below the log's last `dispatch:` line (`## Progress log (per slice)`). An entry above that line counts for none. A report whose log lacks the current
     dispatch's entry is a report defect: send it back to the implementer, in the same cycle, to append the entry. An item the entry marks `not covered` is fixed, or the report is
     `DONE_WITH_CONCERNS` naming it. A `not observable` concern goes on to the slice review, which judges the item like any
     claim, with no gate, record, or routing of its own. The slice-review dispatch hands the reviewer the log path and never the entry's text.
   - **A fail-to-pass `unknown` is no finding.** A `fail-to-pass` trace line reading `unknown` records a run that could
     not judge. The `superdev:slice-reviewer` dispatch tells it to name every one for the slice in its
     report with its reason (the exit status or signal in `control=`, or the `bound=` the run before the change ran under, or
     `start-failed:<code>` where a run could not start, or `prepare=` where the prepare command did not succeed before a
     run), to
     raise no finding for it, and to start no fix cycle, so you start none either. A slice cut after a break between two slices inherits the failing test, so its
     control run fails and the verb writes `unknown`: that outcome is expected and no finding. Such an inherited `unknown`, its control failure also showing at the
     slice's base, earns no observation. For every other `unknown`, the scope run's first non-exempt `unknown` is an
     observation: write its triage record under `scope-findings.md`'s `## Observations` rule, naming the environment gap.
   - **A slice review reads the run trace, and runs no test**. You hand it no tip result. The
     implementer's recorded runs and its fail-to-pass control run are the slice's evidence, and the scope review's
     exit run covers what they leave out.
   - **`behavior`** slice → move it → `in-review`, beside the store move, with
     `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" slice <id> in-review --root <run-root>` before the first slice review dispatch
     (the row stays `in-review` through every fix cycle, until the merge or a block), then dispatch **`superdev:slice-reviewer`**
     (correctness, independent verification, and on the slice's first review the over-engineering lens; it reads its
     references itself via `${CLAUDE_PLUGIN_ROOT}`). Its first review lists the cuts it recommends under `### Simplicity`
     in its progress-log entry. **Warrant a
     recommended cut by `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md` §2's warranted-cut concept**, which owns the
     rule. You judge this, and in the slice's report you name each cut you
     decline, with the rule it would break. Each cut you warrant joins the review's findings as a Minor finding. A first
     review that lists no finding, with no warranted cut, merges the slice with no fix cycle. A first review whose
     only findings are warranted cuts ends the slice's loop with them: the slice merges and the cuts join the Minor
     queue, per the bullet **A Minor-only verdict merges the slice into the Minor queue**, below. A re-review
     gets no over-engineering pass. No implementer runs on a slice after its last review: every change to it, a cut
     included, lands in a fix cycle a re-review reads, the slice's own or, for a queued Minor, a Minor sweep
     cycle on the scope branch (`implement-full-minor-sweep.md`), and a merge-conflict fix keeps its handling in step 4.
     **The slice-reviewer dispatch hands over** the slice `spec`, its `acceptance`, the **subject**, the
     global constraints, and the **progress-log** path (`<run-root>/reports/<id>/progress.md`), on a
     first review and on every re-review. The subject is the slice's range on the first review, review cycle 0,
     and on a re-review, review cycle n > 0, the fix cycle's range, from the tip the latest earlier review read to
     the current tip (`implement-full-fix-cycle.md`'s `## The re-review dispatch`). It hands **no text from an implementer's report** — not the
     slice implementer's, not a fix implementer's, and no controller paraphrase of their status or "met"
     claims. The dispatch tells the reviewer to run no test and to read the slice's recorded runs
     from the run trace.
     The dispatch tells the reviewer its report contract (`slice-reviewer.md`'s `## Report`): append its full
     findings, blind pass and after-reading part, with their remedies, to the log under the heading the dispatch
     names, `Review — cycle <n>` for review cycle n, then return the summary that
     section lists, every item of it and no remedy. You judge Minor-only and blocking from that summary, and you read the
     reviewer's current entry in the log (`## Progress log (per slice)`) for the fix list, the queued Minors' remedies, and the mechanical judgment.
     It tells the reviewer that a failing test the slice did not cause, one that also fails at the slice's
     base, is named under `### Inherited failures` and counts nothing against the verdict: no
     finding and no strike, left to the scope review's fix loop. The reviewer settles a **blind pass** before it opens the log, and
     the blind pass reads the slice's run-trace lines (`scope.js trace --slice <id>`).
     The dispatch also names the slice's range, from the commit its branch was cut from to the tip the first review
     read (the same range on every review), and on a re-review the fix cycle's range, from the tip the earlier review
     read to the current tip, each range with both ends full commits. It tells the reviewer to apply `## Untraced writes` in `${CLAUDE_PLUGIN_ROOT}/references/untraced-writes.md` to each window of the slice: it runs `scope.js untraced` over the window's range, grades each listed path, counts the listed paths as change events for **Missing fail-to-pass run**, and raises **Implementer suite run**, a Minor, for a `run full` or `run whole` line inside the window. It tells the reviewer to apply `## Fail-to-pass run` in `${CLAUDE_PLUGIN_ROOT}/references/fail-to-pass.md` to each: on a
     `behavior` slice, a latest outcome line over a range that reads `pass-to-pass` is an Important finding,
     **Pass-to-pass**, and a range that changes both a test-path file and another file, with no outcome line over it,
     is an Important finding, **Missing fail-to-pass run**. A slice's range or a fix cycle's range whose test-path
     changes are all deletions, and whose changes outside the test paths add no behaviour, needs no outcome line and
     draws no finding, and neither does a fix cycle whose range is empty or whose commits change only test files. A range whose test-path changes are all deletions and that adds behaviour outside the test paths
     draws **Missing fail-to-pass run**. The implementer runs the verb from the slice's base on
     every dispatch, so an outcome line over a range from the slice's base to a range's tip covers that range:
     the latest one decides **Pass-to-pass**, and one satisfies **Missing fail-to-pass run**, on the slice's own range and
     on a fix cycle's range alike. Each **Pass-to-pass** and **Missing fail-to-pass run** finding names its range,
     both ends full commits. It tells the reviewer to mark an unclosable **Pass-to-pass** finding as that section
     states, at every review against the current range, and to check an implementer's claimed case rather than adopt it. The reviewer reads the outcome line from the trace and never from the
     dispatch, which carries no outcome, and no trace, neither an `edit` line nor an untraced write for the slice, or no test command
     gets no finding, only a named gap. Only `edit` lines and listed untraced writes count as a slice's or a cycle's change events, so a `run` or
     `ledger` line is none, even one written after the trace began for a slice whose edits came before it. Reading
     the log can add a finding or raise a finding's severity, and it never withdraws or downgrades one. The reviewer appends its full findings to the log.
     **A review whose only remaining Critical or Important findings are unclosable
     Pass-to-pass findings**, beside any deferred ones, ends the slice's loop at once, before the cap, with no fix
     cycle: the slice merges, its Minors join the Minor queue as the bullet below states, and the run's final report
     names each unclosable finding with its slice, its case, and its reason. When the review lists **any Critical or
     Important finding outside the deferred and unclosable ones**, read
     `${CLAUDE_PLUGIN_ROOT}/references/implement-full-fix-cycle.md` and run its `## Fix cycles` until the slice's
     loop ends. Before you act on a verdict with a finding whose remedy may add a capability the slice's `spec` and
     the Definition of Done never named, read that file's `## Deferring a finding`: a deferred finding joins neither
     the fix list nor the Minor queue, and a verdict whose only remaining findings are deferred counts as clean.
   - **A Minor-only verdict merges the slice into the Minor queue**. A review, first or re-review,
     whose remaining findings outside the deferred and unclosable ones are only Minor, warranted cuts included, ends the slice's loop
     with no further fix cycle. The same holds at the cap for a remainder of Minors beside only **Pass-to-pass** or
     **Missing fail-to-pass run** findings. Before the slice merges with open Minors:
     1. **Write every open finding into the slice's progress log.** Append one entry headed `Open Minors` that lists
        each Minor with its `file:line`, what is wrong, and how to fix it, copied from the reviewer's log entry, every
        warranted cut included and no deferred finding. Write the findings themselves, never a count. The log is the queue's only source for them, so it
        holds them before the slice is queued.
     2. **Queue the slice**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" minors add <id> --root <run-root>`.
     3. Merge as step 4 states.

     A review with no Minor outside the deferred ones queues nothing. The run's final report names every queued
     slice.
   - **A dispatch the permission classifier denies** — an implementer, a slice-reviewer, or a fix → read
     `${CLAUDE_PLUGIN_ROOT}/references/implement-full-denied.md` and follow its `## A denied dispatch`.
   - **`mechanical`** / **`docs`** slice → **skip the per-slice review** (the implementer's or your own runs, plus
     the scope review's exit run, the scope's one full-suite run, are the net).
4. **Merge (you, serially)** — in the scopetree: `git -C <run-root>/scopetree merge
   --no-ff slice/<scope>/<id>`. **A conflicted merge** → read
   `${CLAUDE_PLUGIN_ROOT}/references/merge-conflicts.md` and resolve it yourself as it states (you hold
   cross-slice context; dispatch a fix subagent only if a conflict needs real code work): it owns the union
   of both sides on additive conflicts, the `merge --continue` conclusion, and the `merge --abort` and
   escalation on a genuine winner-picking overlap, which **`--unattended`** turns into a block.

   **A slice merge runs no suite**, clean or concluded with `merge --continue`. The
   slice's own runs already tested it, and the scope review's full-suite run (started at its entry, and its exit run: a full run, or
   the carry or recorded rerun `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md` admits) verify the
   integrated scope: its fix loop repairs a break between two slices that each passed alone. Go straight on to the next dispatch or merge.

   Then clean up. First read the slice branch's tip with `git -C <run-root>/scopetree rev-parse slice/<scope>/<id>`:
   the branch is gone after the cleanup, and the `merged` write below records that full commit as its `<tip>`. Then
   `git worktree remove <run-root>/slicetrees/<id>` and
   `git branch -D slice/<scope>/<id>` (merged; leaving it clutters the repo). The **slicetree-sweep** `Stop`
   hook removes any merged slicetree you forget, but do it anyway. **Append the interfaces this slice
   decided** to `<run-root>/interfaces.md` (skip if it decided none). Move the slice → `merged`/done in the
   store, and `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" slice <id> merged --root <run-root>` in the
   ledger (add `--range <base>..<tip>`, both full commits, to record the slice's commit range: every `behavior` slice records it, `<base>` the commit its slice branch was cut from and `<tip>` the slice branch's tip). Merging
   unblocks dependents.

   **Now tick from the implementer's report**, or a tiny slice's report you wrote yourself (`${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`) — after
   the merge lands, never before: a tick claims the scope branch holds the work, and before this point it
   does not yet. Apply the mapping gate to each line the report carried and write every tick it earns
   on `<run-root>/dod.md` alone. The scope review copies it onto the anchor (`dod-ticks.md`).
5. Recompute the runnable set and continue.

## After the last merge

Once every slice is `merged`, and before run handoff, settle the Minor queue. Read it with
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get minors --root <run-root>`. An empty queue dispatches nothing:
go to run handoff. A non-empty queue → read `${CLAUDE_PLUGIN_ROOT}/references/implement-full-minor-sweep.md`
and run its `## Minor sweep`, or continue it per its `## A resumed sweep`, before run handoff.

## Leave the run standing

Per-slice slicetrees are already removed at merge (DAG step 4). Anything left — a stray
`<run-root>/slicetrees/*`, a leftover `slice/<scope>/*` branch, the run root, the
scopetree, `<run-root>/run.lock` — stays for `/superdev:wrap-up`, which takes the run down at the end of the
chain. The scopetree keeps `<branch>` checked out: that is the scope checkout `/superdev:review` and
`/superdev:document` work in, on this tier as on `lite`; the invoking checkout is never touched. Settle
the Minor queue (`## After the last merge`), then read
`${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md` next, without cleaning up.
