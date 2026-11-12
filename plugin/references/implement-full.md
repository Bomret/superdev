# Full execution playbook (>3 slices)

The controller `Read`s this after computing tier = `full` (see `skills/implement/SKILL.md`). Implementation
happens **only** in isolated `superdev:implementer` subagents — one per slice, each in its own slicetree.
The controller never implements inline; it dispatches, reviews via subagents, and integrates serially.
Honor the controller's **Invariants** and **Issue status** map throughout. Once every slice is `merged`,
run `## Minor sweep` below, then read `${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md` as your last step.

## Branch model

- **Read `${CLAUDE_PLUGIN_ROOT}/references/run-init.md`** — the controller's run opening — before cutting
  anything here.
- **Scope branch, into the scopetree, per this run's kind.** Read
  `${CLAUDE_PLUGIN_ROOT}/references/scope-branch.md`'s `## Cutting the scope branch` and do what it says for
  the run kind the controller handed you — `fresh` or `resumed` (ADR 0028, ADR 0045). Never
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
  `${CLAUDE_PLUGIN_ROOT}/references/plan-contract.md` → *Wide refactors*, ADR 0033) inserts one branch
  between the slices and the scope: cut `integration/<scope>` from `<branch>` at run start, keep it
  checked out **in the scopetree**, and merge every slice into it instead of `<branch>`. The branch keeps
  the scope branch green while batches that cannot stay green alone are in flight (ADR 0155). The plan's final **integrate-and-verify** slice is
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
`## Bringing the scope branch to base`, on every invocation and at every run kind (ADR 0120, INV-0124).
A stop there dispatches no slice. The step runs no test suite, so the suite record never holds a slice back
(ADR 0192).

## Progress log (per slice)

Each slice has a **progress log** at `<run-root>/reports/<id>/progress.md` — a running record of how the
slice unfolded, not a final report. **You (the controller) own it:**

- **Seed it** with a header (slice `<id>` + title) before the slice's first dispatch.
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
2. **Dispatch implementers in parallel, capped** — one `superdev:implementer` per runnable slice, each in
   its own slicetree, each with its `model` from the controller's model table. Give each only its own
   specifics: the slice `spec` + `acceptance` + `test-applicability`, its slicetree path
   (`<run-root>/slicetrees/<id>`) + branch (`slice/<scope>/<id>`), base/head, its
   **progress-log** path (`<run-root>/reports/<id>/progress.md` — seed it first), the global constraints,
   and the **interface file** path (`<run-root>/interfaces.md`). Not the whole plan. Also hand it the
   **path** to `<run-root>/dod.md`, never its text, plus the exact **listed lines** this slice's dispatch
   covers — the `dod.md` lines the mapping gate matches to this slice's own `id`
   (`${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`'s mapping gate, ADR 0092): build only this slice, and
   report on those listed lines. Every implementer dispatch, a fix dispatch in step 3 included, also
   requires that when the implementer adds a dependency (a direct dependency declared in a package
   manifest, development dependencies included) its progress log names the exact package and the
   URL of the official documentation or registry page it checked, and that an implementer who cannot
   reach that page logs the package as unverified because the documentation was unreachable and returns
   `DONE_WITH_CONCERNS`. A dependency the repository itself provides (a workspace, path, or file
   reference) is not a new dependency. Every implementer dispatch also tells it that the run trace records
   its edits and runs, and that its progress log carries no RED or GREEN line. Every dispatch that builds a slice, fixes a slice, or fixes a Minor sweep also tells it to append a self-check entry to its progress log before its report, as its `## Self-check` states (ADR 0205), headed with the line the dispatch names for it: `Self-check — build` for a slice's build, `Self-check — fix cycle <n>` for the slice's fix cycle n, and `Self-check — sweep cycle <n>` for the sweep's cycle n, a fresh entry even where the log already holds that heading, since only an entry below the log's last `dispatch:` line counts (`## Progress log (per slice)`). The entry walks each acceptance item, each edge case the `spec` names, each cited invariant, and on a fix dispatch each finding in its list (on a sweep fix dispatch, which hands no slice `spec`, the findings and any `spec` item the dispatch names), against the whole slice range, an item that names a set walked member by member, one mark per member; on a `behavior` slice the confirmation from the run trace that a failing test came before each change. It tells it to mark an item `covered` only where the entry quotes what the item demands, or what the reference artifact the `spec` or the dispatch cites demands, beside what the work does, with no file, test, or commit pointer standing alone as evidence; on a slice fix or sweep fix dispatch, to quote each finding's claim beside what the work now does; on a `behavior` slice, and on a sweep fix for each finding whose fix changes behaviour, to name for each `covered` item one plausible wrong implementation its test rejects; and to mark an item no tool the repository offers can observe `not observable`, with its reason, and every other item `not covered`. It tells it to fix an item or set member found `not covered` before the report, or name it in its concerns under `DONE_WITH_CONCERNS`, and to name every `not observable` item there too. It tells it its report is the shape `agents/implementer.md`'s `## Report` lists, every item that section names for its dispatch kind, and repeats no narrative its progress log holds (ADR 0204). No slice-review dispatch carries the self-check (INV-0113, INV-0114). It names the start of the implementer's
   own range, `<base>` (the commit the slice branch was cut from) or `<sweep-base>` on a sweep fix dispatch, and tells it
   to run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" fail-to-pass <range-start>..HEAD -- <command>` before its report,
   the command naming every test file its range adds or modifies, wherever its range changes a test-path file and another
   file and its test-path changes are not all deletions (ADR 0196), to write a test first where its test-path changes are
   all deletions and it adds behaviour outside the test paths, and to fix a `pass-to-pass` outcome in the same dispatch, unless its range is in one of the three unclosable cases
   of `review-checklist.md`'s `## Fail-to-pass run`, which it then reports with its reason (ADR 0182, ADR 0193, ADR 0196). Every implementer dispatch also
   tells it to run only the tests that verify its work, each through `scope.js test` (`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test
   focused <changed paths>` with at least one path, or `test path <file>... -- <command>` for a direct test-file run), and its fail-to-pass run, and never `test full`,
   `test whole`, or a `test focused` with no path: the scope review's exit run is the scope's one full-suite run (ADR 0192). It tells it to run a suite longer than the
   Bash tool's time limit through the runner in the background and wait for its end before acting on it, and
   tells it that a test command is recorded as typed and pushed with the run state, so a secret belongs in the environment, never on the command line, and
   tells it to edit files through the edit tools, never through a script. It also tells it that a RED or GREEN step passes the test files
   that hold the tests that step works on, and that its last run before the fail-to-pass run passes the slice's whole
   changed-path set (ADR 0139). Where the focused fence repeats the full fence, it tells it instead that each step runs each test file
   it works on through `test path <file>... -- <command>` and that the fail-to-pass run is its one run before the report (ADR 0180). Every implementer dispatch also tells it that a failing test its slice did not cause, one that
   also fails at the slice's base commit, is named in its report, neither fixed nor blocked on, and left to
   the scope review's fix loop: a named inherited failure is no BLOCKED and no strike
   (ADR 0155, ADR 0192, INV-0157). A dispatch for a
   `docs` slice whose `spec` names `AGENTS.md`-hierarchy text as its deliverable tells the implementer it
   edits exactly that text; every other slice dispatch leaves the `AGENTS.md` hierarchy to the doc pass,
   as the implementer's own Documentation section states (INV-0162, ADR 0161).

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
   - **An observation is captured the moment you meet it.** Read
     `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Observations` section and follow it: a
     defect the implementer reports, or one you meet yourself in its report, that no slice of this scope
     covers and the scope did not cause gets a triage record from you, the controller, right here — never
     held until the handoff at the end of the chain.
   - **A `behavior` slice's fail-to-pass outcome comes from its implementer** (ADR 0134, ADR 0182, INV-0138). Where
     the slice's range, from the commit its slice branch was cut from to the slice branch's tip, changes both a test-path
     file (`docs/agents/verification.md`'s `## Test paths`, the defaults where it has none) and another file, and its
     test-path changes are not all deletions (ADR 0196), the implementer's run writes a `fail-to-pass` line over a range from that base to that tip. Read it with
     `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" trace --slice <id> --root <run-root>` before you dispatch
     `superdev:slice-reviewer`. A range with no such line is a report defect: send the report back to the implementer
     in the same cycle. You run no fail-to-pass run and no test run for a slice review.
   - **A report whose log holds no self-check entry goes back** (ADR 0205). Before you dispatch
     `superdev:slice-reviewer` for a slice's build, and before the re-review of a slice fix, read the slice's progress log
     for the self-check entry under the heading this dispatch named, `Self-check — build` or `Self-check — fix cycle <n>`
     for the current cycle, below the log's last `dispatch:` line (`## Progress log (per slice)`). An entry above that line counts for none. A report whose log lacks the current
     dispatch's entry is a report defect: send it back to the implementer, in the same cycle, to append the entry. An item the entry marks `not covered` is fixed, or the report is
     `DONE_WITH_CONCERNS` naming it. A `not observable` concern goes on to the slice review, which judges the item like any
     claim, with no gate, record, or routing of its own. The slice-review dispatch hands the reviewer the log path and never the entry's text (INV-0113, INV-0114).
   - **A fail-to-pass `unknown` is no finding.** A `fail-to-pass` trace line reading `unknown` records a run that could
     not judge (ADR 0134, INV-0139). The `superdev:slice-reviewer` dispatch tells it to name every one for the slice in its
     report with its reason (the exit status or signal in `control=`, or the `bound=` the run before the change ran under, or
     `start-failed:<code>` where a run could not start, or `prepare=` where the prepare command did not succeed before a
     run, ADR 0218), to
     raise no finding for it, and to start no fix cycle, so you start none either. A slice cut after a break between two slices inherits the failing test, so its
     control run fails and the verb writes `unknown`: that outcome is expected and no finding. Such an inherited `unknown`, its control failure also showing at the
     slice's base, earns no observation. For every other `unknown`, the scope run's first non-exempt `unknown` is an
     observation: write its triage record under `scope-findings.md`'s `## Observations` rule, naming the environment gap.
   - **A slice review reads the run trace, and runs no test** (ADR 0178, ADR 0182). You hand it no tip result. The
     implementer's recorded runs and its fail-to-pass control run are the slice's evidence, and the scope review's
     exit run covers what they leave out (ADR 0192).
   - **`behavior`** slice → move it → `in-review`, beside the store move, with
     `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" slice <id> in-review --root <run-root>` before the first slice review dispatch
     (the row stays `in-review` through the parallel simplicity pass and every fix cycle, until the merge or a block), then dispatch **`superdev:slice-reviewer`**
     (correctness + independent verification; it reads the review checklist itself via
     `${CLAUDE_PLUGIN_ROOT}`). **On the slice's first review, dispatch `superdev:simplicity-reviewer` in parallel with it**,
     over the same tip and the slice's range, and build the fix list once both have returned (ADR 0138). The `simplicity-reviewer` assesses the diff itself; any text the dispatch hands it is input to check, not a verdict to adopt. **Warrant a
     recommended cut by `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md` §2's warranted-cut concept**, which owns the
     rule. You judge this, and in the slice's report you name each cut you
     decline, with the rule it would break. Each cut you warrant joins the review's findings as a Minor finding. A first
     review that lists no finding, with no warranted cut, merges the slice with no fix cycle. A first review whose
     only findings are warranted cuts ends the slice's loop with them: the slice merges and the cuts join the Minor
     queue, per the bullet **A Minor-only verdict merges the slice into the Minor queue**, below. A re-review
     gets no over-engineering pass. No implementer runs on a slice after its last review: every change to it, a cut
     included, lands in a fix cycle a re-review reads, the slice's own or, for a queued Minor, a `## Minor sweep`
     cycle on the scope branch, and a merge-conflict fix keeps its handling in step 4.
     **The slice-reviewer dispatch hands over** the slice `spec`, its `acceptance`, the **subject**, the
     global constraints, and the **progress-log** path (`<run-root>/reports/<id>/progress.md`), on a
     first review and on every re-review. The subject is the slice's range on the first review, review cycle 0,
     and on a re-review, review cycle n > 0, the fix cycle's range, from the tip the latest earlier review read to
     the current tip (ADR 0137). The dispatch tells a re-review to blind-pass over that range and then judge every
     earlier finding from the progress log, to read code outside the range wherever the fix or an earlier finding
     leads it and report any defect it finds there too, and to judge the earlier findings alone when the fix
     cycle's range holds no change. It hands **no text from an implementer's report** — not the
     slice implementer's, not a fix implementer's, and no controller paraphrase of their status or "met"
     claims (ADR 0114, INV-0114). The dispatch tells the reviewer to run no test and to read the slice's recorded runs
     from the run trace.
     The dispatch tells the reviewer its report contract (`slice-reviewer.md`'s `## Report`): append its full
     findings, blind pass and after-reading part, with their remedies, to the log under the heading the dispatch
     names, `Review — cycle <n>` for review cycle n, then return the summary that
     section lists, every item of it and no remedy. You judge Minor-only and blocking from that summary, and you read the
     reviewer's current entry in the log (`## Progress log (per slice)`) for the fix list, the queued Minors' remedies, and the mechanical judgment.
     It tells the reviewer that a failing test the slice did not cause, one that also fails at the slice's
     base, is named under `### Inherited failures` and counts nothing against the verdict: no
     finding and no strike, left to the scope review's fix loop (ADR 0155, ADR 0192, INV-0157). The reviewer settles a **blind pass** before it opens the log, and
     the blind pass reads the slice's run-trace lines (`scope.js trace --slice <id>`).
     The dispatch also names the slice's range, from the commit its branch was cut from to the tip the first review
     read (the same range on every review), and on a re-review the fix cycle's range, from the tip the earlier review
     read to the current tip, each range with both ends full commits. It tells the reviewer to apply `## Untraced writes` in `${CLAUDE_PLUGIN_ROOT}/references/review-checklist.md` to each window of the slice: it runs `scope.js untraced` over the window's range, grades each listed path, counts the listed paths as change events for **Missing fail-to-pass run**, and raises **Implementer suite run**, a Minor, for a `run full` or `run whole` line inside the window (ADR 0227). It tells the reviewer to apply `## Fail-to-pass run` in `${CLAUDE_PLUGIN_ROOT}/references/review-checklist.md` to each: on a
     `behavior` slice, a latest outcome line over a range that reads `pass-to-pass` is an Important finding,
     **Pass-to-pass**, and a range that changes both a test-path file and another file, with no outcome line over it,
     is an Important finding, **Missing fail-to-pass run**. A slice's range or a fix cycle's range whose test-path
     changes are all deletions, and whose changes outside the test paths add no behaviour, needs no outcome line and
     draws no finding, and neither does a fix cycle whose range is empty or whose commits change only test files
     (ADR 0196). A range whose test-path changes are all deletions and that adds behaviour outside the test paths
     draws **Missing fail-to-pass run**. The implementer runs the verb from the slice's base on
     every dispatch (ADR 0182), so an outcome line over a range from the slice's base to a range's tip covers that range:
     the latest one decides **Pass-to-pass**, and one satisfies **Missing fail-to-pass run**, on the slice's own range and
     on a fix cycle's range alike. Each **Pass-to-pass** and **Missing fail-to-pass run** finding names its range,
     both ends full commits. It tells the reviewer to mark an unclosable **Pass-to-pass** finding as that section
     states, at every review against the current range, and to check an implementer's claimed case rather than adopt it (ADR 0193). A re-review closes a **Pass-to-pass** finding only when the trace records, after the finding, an outcome line that
     reads `fail-to-pass` over a range from the base of the range that drew the finding to the current tip. It closes
     a **Missing fail-to-pass run** finding on the outcome line the fix implementer's run writes, and a `pass-to-pass` line there
     is a **Pass-to-pass** finding on that range. The reviewer reads the outcome line from the trace and never from the
     dispatch, which carries no outcome (INV-0114), and no trace, neither an `edit` line nor an untraced write for the slice, or no test command
     gets no finding, only a named gap. Only `edit` lines and listed untraced writes count as a slice's or a cycle's change events, so a `run` or
     `ledger` line is none, even one written after the trace began for a slice whose edits came before it. Reading
     the log can add a finding or raise a finding's severity, and it never withdraws or downgrades one
     (INV-0113). The reviewer appends its full findings to the log, and a re-review reads the earlier
     findings there after its blind pass, closing one only from the diff and the run
     trace, except a run-trace or an Unverified dependency finding. A run-trace finding closes by its closing
     rule in `review-checklist.md`. An earlier Unverified dependency finding closes when the reviewer's own dependency check now
     passes, because its remedy lives in the log and not in the diff.
     When the review lists **any Critical or Important finding outside the deferred and unclosable ones**, dispatch **one** fresh
     `superdev:implementer` fix per cycle, carrying the **complete** fix list, read from the reviewer's log entry
     (every finding except a deferred or an unclosable one, the Minor findings included, each with its remedy), never one dispatch per finding. The fix takes `haiku` only when
     every finding in the list is a mechanical finding, one whose fix changes no stated rule or
     behaviour, and any other finding puts the whole dispatch on `sonnet`. The list carries every finding added or raised after reading the progress log and every
     earlier finding a re-review reports
     still open, the same as a blind-pass finding. The fix dispatch names the slice's `<base>`, and the fix implementer
     runs its fail-to-pass run over `<base>..HEAD` before its report, a **Pass-to-pass** or **Missing fail-to-pass run**
     finding's answer included (ADR 0182). Re-review after each cycle until the review lists no
     Critical or Important finding outside the deferred and unclosable ones, capped at 3 cycles in total, every cycle counting (the **3-strike
     fix loop**, controller's Invariants). **A review whose only remaining Critical or Important findings are unclosable
     Pass-to-pass findings**, beside any deferred ones, ends the slice's loop at once, before the cap, with no fix cycle
     (ADR 0193): the slice merges, its Minors join the Minor queue as the bullet below states, and the run's final report
     names each unclosable finding with its slice, its case, and its reason. Beside a Critical or Important finding of
     another kind, an unclosable finding stays out of the fix list while cycles fix the others, and at the cap the others
     alone decide. At the cap a remaining **Critical or Important finding**, a
     deferred or unclosable one excluded, is a wrong cut: move the slice → `blocked` and escalate (`--unattended` →
     block). A slice whose only remaining Critical or Important findings are **Pass-to-pass** or
     **Missing fail-to-pass run** proceeds (ADR 0125, ADR 0134, INV-0138): the slice merges, its Minors join the Minor queue as the bullet below states, and the run's final
     report names each of those findings with its slice; any of them beside a Critical or
     Important finding of another kind blocks as above. The loop never asks the operator, attended or unattended; this step has no gate
     question. The RED-test rule is the conditional one the controller's Invariants state: a fix for a
     finding naming failing behaviour opens with a RED test, one naming none takes no RED test, and the
     re-review verifies it by reading. **Every sibling surface is reconciled**: tell the implementer to
     search its own checkout for every other place that states the rule or behaviour the fix changes,
     bring each one into agreement, and report each place it checked and each it changed, reporting a
     place outside its checkout unedited. Tell it to report the `AGENTS.md` hierarchy and the knowledge
     base unedited too, since the doc pass owns them (INV-0120). A fix report that omits the
     checked-and-changed list is a report defect, sent back to the implementer before the re-review.
     Before the re-review, grep the fix's slicetree (`<run-root>/slicetrees/<id>`) for the key
     phrase of the rule the fix changed, in its old wording and its new, and compare the hits with
     the report's checked list. A hit in a file the list does not name is a missed sibling
     surface: send the report back to the implementer, naming the hit, in the same cycle. A hit in
     the `AGENTS.md` hierarchy or the knowledge base is named in your report instead. A hit in
     `CHANGELOG.md` is release history and needs no change. A
     finding whose remedy adds a capability the slice's `spec` and the Definition of Done never named is
     not part of the fix list. A **guard-rail remedy** stays in it: a case in an existing test suite,
     a case or row for an existing drift check, or a prose fix that makes shipped text agree with a rule
     the repository already states. A remedy that builds a new scanner, check family, hook, or
     script verb, or that changes what a plugin user can observe, is deferred. A later instance of a
     failure-mode class that a Definition-of-Done criterion names is in scope, never a deferred finding
     (ADR 0146). A finding that plainly states the same defect as a triage record this run's
     scope anchor absorbs is in scope, never a deferred finding (ADR 0144). Before recording one, run
     `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get deferred --root <run-root>` and skip a finding it
     already reports: another review can name the same finding again, and a
     duplicate bullet stands until somebody resolves it. Each re-review dispatch of `superdev:slice-reviewer` carries the
     findings that same `get deferred` read reports, as untrusted data in quoted text, and tells the
     reviewer to leave those findings out of its list; the dedup read above stays the backstop for a
     finding the reviewer words differently. Where the store defines a triage record, list the open
     records after that read, as `scope-findings.md`'s `## Deferred findings` states, and follow `plan-contract.md`'s
     *Triage record* rule (ADR 0145); on a match the
     ledger bullet carries the matched record's reference. When no record plainly matches, record it as a deferred finding, with the triage
     record `scope-findings.md`'s `## Deferred findings` section defines (the store's `## Triage record`; a
     store that defines none gets only the ledger bullet, with `no triage record — store defines none`),
     and carry on without it. A Minor finding whose remedy adds such a capability is a deferred finding with its
     triage record, never a queued Minor. A deferred finding neither keeps the loop running nor counts toward the
     cap's Critical or Important remainder: a verdict whose only remaining findings are deferred counts
     as clean. A deferred finding re-enters a fix loop only at the scope review, when `final-reviewer` names a guard-rail
     remedy for it (ADR 0121, ADR 0211, INV-0125); a remedy that still adds a capability keeps it deferred. A slice
     re-review keeps leaving deferred findings out of its list. The scope review resolves a re-entered finding by
     the procedure `scope-findings.md`'s `## Deferred findings` section states, in its order: remove the bullet,
     close its triage record (only a record whose own body names this run's scope anchor and that no open anchor
     absorbs, by reads that succeed; that step comments on any other), rebuild an open pull request's deferred
     section, and
     publish the snapshot. An observation never joins the fix list; the observation bullet above stays in force.
   - **A Minor-only verdict merges the slice into the Minor queue** (ADR 0174, INV-0171). A review, first or re-review,
     whose remaining findings outside the deferred and unclosable ones are only Minor, warranted cuts included, ends the slice's loop
     with no further fix cycle. The same holds at the cap for a remainder of Minors beside only **Pass-to-pass** or
     **Missing fail-to-pass run** findings. Before the slice merges with open Minors:
     1. **Write every open finding into the slice's progress log.** Append one entry headed `Open Minors` that lists
        each Minor with its `file:line`, what is wrong, and how to fix it, copied from the reviewer's log entry, every
        warranted cut included and no deferred finding. Write the findings themselves, never a count. The log is the queue's only source for them, so it
        holds them before the slice is queued.
     2. **Queue the slice**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" minors add <id> --root <run-root>`, then publish
        the snapshot per `${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## Publishing run state`.
     3. Merge as step 4 states.

     A review with no Minor outside the deferred ones queues nothing. The run's final report names every queued
     slice (INV-0094).
   - **A dispatch the permission classifier denies** — an implementer, a slice-reviewer, a
     simplicity-reviewer, or a fix — is a **degraded pass**, not a step to redo silently inline. None is
     ever skipped on judgment in this tier, so scope-findings.md's own skip carve-out never exempts one here.
     Read `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s `## Degraded passes` section and follow it,
     including the `**Degraded:**` entry it defines for `<run-root>/ledger.md`. A denied implementer or
     fix is an authoring dispatch: write it with `scope.js degraded add`. A denied `slice-reviewer` is
     this tier's one verification dispatch: write it with `scope.js degraded add-denial -`, piping the
     classifier's refusal through a quoted heredoc rather than a shell argument. Publish the snapshot after either write, per
     `${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## Publishing run state` section — since a denied
     implementer/fix or a capped slice-reviewer denial reaches no later write below. **`--unattended`** →
     a denied implementer or fix **blocks**, per ADR 0001. A
     denied `slice-reviewer` follows that section's authorship rule, and this tier's slices come from a
     dispatched implementer, so the controller authored none of what the review verifies: review the
     slice inline — the controller already holds the implementer's report, so that review is not blind —
     applying `${CLAUDE_PLUGIN_ROOT}/references/review-checklist.md`'s `## Dependency verification`
     check and the one-way rule above (INV-0113), where an inline re-review takes the same subject as a
     dispatched one, the fix cycle's range, and
     carry on, bounded by that section's cap — read `scope.js get denials` after writing
     the entry, and **block** once the count reaches it instead of reviewing inline again. A denied
     `simplicity-reviewer` follows that same authorship rule, and since its cuts block nothing on their own, the
     pass runs inline and the run carries on; write its entry with plain `scope.js degraded add` — its
     denial is not a verification dispatch, so it stays outside that cap. Nothing in that outcome can end
     the command, so this write relies on its defining section's own citation
     (`${CLAUDE_PLUGIN_ROOT}/references/run-state.md`'s `## Publishing run state` section) rather than
     repeating one here.
   - **`mechanical`** / **`docs`** slice → **skip both per-slice reviews** (the implementer's own runs, plus
     the scope review's exit run, the scope's one full-suite run, are the net; ADR 0025, ADR 0091, ADR 0155, ADR 0192).
4. **Merge (you, serially)** — in the scopetree: `git -C <run-root>/scopetree merge
   --no-ff slice/<scope>/<id>`. Resolve
   conflicts yourself, per `${CLAUDE_PLUGIN_ROOT}/references/merge-conflicts.md` (you hold cross-slice
   context; dispatch a fix subagent only if a conflict needs real code work): trace both sides to their
   slice specs, take the **union of both sides, dropping nothing** on additive conflicts (keep every test
   from both sides — never delete a sibling's test to make the merge compile), and compose compatible
   intents, then conclude a resolved conflict with `git -C <run-root>/scopetree merge --continue`. A
   **genuine winner-picking overlap** — the *same* decision decided two incompatible ways, where honouring
   one spec means violating the other — is not yours to guess:
   `git -C <run-root>/scopetree merge --abort` and escalate to the human. **`--unattended` → block** after
   the abort, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s **Unattended** section: picking a
   winner is exactly the human decision the token cannot stand in for.

   **A slice merge runs no suite**, clean or concluded with `merge --continue` (ADR 0155, INV-0128). The
   slice's own runs already tested it, and the scope review's entry focused run and exit run (a full run, or
   the carry or recorded rerun `${CLAUDE_PLUGIN_ROOT}/references/test-selection.md` admits) verify the
   integrated scope: its fix loop repairs a break between two slices that each passed alone (ADR 0192). Go straight on to the next dispatch or merge.

   Then clean up. First read the slice branch's tip with `git -C <run-root>/scopetree rev-parse slice/<scope>/<id>`:
   the branch is gone after the cleanup, and the `merged` write below records that full commit as its `<tip>`. Then
   `git worktree remove <run-root>/slicetrees/<id>` and
   `git branch -D slice/<scope>/<id>` (merged; leaving it clutters the repo). The **slicetree-sweep** `Stop`
   hook removes any merged slicetree you forget, but do it anyway. **Append the interfaces this slice
   decided** to `<run-root>/interfaces.md` (skip if it decided none). Move the slice → `merged`/done in the
   store, and `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" slice <id> merged --root <run-root>` in the
   ledger (add `--range <base>..<tip>`, both full commits, to record the slice's commit range: every `behavior` slice records it, `<base>` the commit its slice branch was cut from and `<tip>` the slice branch's tip). Merging
   unblocks dependents.

   **Now tick from the implementer's report** (`${CLAUDE_PLUGIN_ROOT}/references/dod-ticks.md`) — after
   the merge lands, never before: a tick claims the scope branch holds the work, and before this point it
   does not yet. Apply the mapping gate to each line the report carried and write every tick it earns
   on `<run-root>/dod.md` alone. The scope review copies it onto the anchor (`dod-ticks.md`, ADR 0206).
5. Recompute the runnable set and continue.

## Minor sweep

Once every slice is `merged`, and before run handoff, settle the Minor queue (ADR 0174,
INV-0171). Read it with `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get minors --root <run-root>`. An empty
queue dispatches nothing: go to run handoff. A non-empty queue gets one sweep, in the scopetree
(`<run-root>/scopetree`), under slice rules and without asking the operator, attended or unattended.

**The sweep log** is `<run-root>/sweep.md`: git-ignored, append-only scratch the controller owns, and the sweep's
progress log. Seed it once, with a header and `sweep-base <full commit>`, the scope branch's tip at that moment
(`git -C <run-root>/scopetree rev-parse HEAD`). A log that exists is kept, never reseeded.

**Collect.** For each queued slice not yet under a `## <id>` heading in the log, read
`<run-root>/reports/<id>/progress.md` and append under that heading the still-open Minors of the slice's last
review, in full: the `Open Minors` entry written at queueing (DAG loop step 3, **A Minor-only verdict merges the slice into the
Minor queue**), as the later
entries of that log leave it. A queued slice whose progress log is missing contributes nothing, and the run's final
report names it.

**Every sweep dispatch names the sweep log as its progress log, and no slice's progress log**, so the run trace
files each sweep dispatch under `scope`. Each hands the same contracts the slice dispatches carry: the
dependency record, the run-trace and test-runner instructions, and the inherited-failure rule (DAG loop step 2).

**Each cycle** counts toward the cap of 3, and the log records each by one line, `cycle <n> base <full commit>`, the
scope tip the cycle began from, appended when the cycle starts:

1. **Fix.** One `superdev:implementer` sweep fix, in the scopetree, carries every collected Minor in cycle 1 and, in
   a later cycle or a reopened cycle 1, every finding the last re-review lists open. It names `<sweep-base>` and the
   log, and hands the `<run-root>/dod.md` path read-only with no listed lines, so the implementer can tell a
   capability the Definition of Done never named. The implementer closes a
   Minor a later slice already resolved with no change made for it, fixes a duplicated Minor once, and reports each
   as its sweep fix dispatch states. The fix takes `haiku` only when every finding in its list is mechanical, as in
   step 3, and any other finding puts the dispatch on `sonnet`. A cycle whose list holds only Minor findings
   continues the previous sweep implementer through SendMessage, as `${CLAUDE_PLUGIN_ROOT}/references/scope-findings.md`'s
   `## Warm cycles` states: cycle 1 has no earlier implementer and dispatches fresh. A cycle whose list holds a
   Critical or Important finding dispatches fresh. Wait for the dispatch's end, then run step 3's grep over the
   scopetree for the key phrase of each rule the fix changed, and send a missed sibling surface back in the same
   cycle.
   The sweep implementer appends its self-check entry to the sweep log before its report, headed `Self-check — sweep cycle <n>` with the current cycle's number, as its `## Self-check` states: each finding's claim quoted beside what the work now does, an item that names a set walked member by member, one mark per member and `covered` only when every member is, a demand from a reference artifact the dispatch cites quoted from that artifact itself, for each finding whose fix changes behaviour one plausible wrong implementation its test rejects, an item no tool the repository offers can observe marked `not observable` with its reason and named in its concerns, and no file, test, or commit pointer standing alone as evidence. The sweep log takes the `dispatch:` marker of `## Progress log (per slice)` before each dispatch and each resume message. A report whose sweep log holds no entry under the current cycle's heading below its last `dispatch:` line goes back to it in the same cycle: an entry above that line counts for none (ADR 0205).
2. **The implementer's fail-to-pass run.** The sweep implementer runs its fail-to-pass run over `<sweep-base>..HEAD`
   before its report, where its range changes both a test-path file and another file and its test-path changes are not
   all deletions (ADR 0182, ADR 0196). The trace line names
   `scope`. A range with no such line is a report defect, sent back to the implementer in the same cycle.
3. **Re-review.** Always a fresh `superdev:slice-reviewer`, never a resumed one, so its blind pass stays blind
   (INV-0113, INV-0114). Its subject is the sweep's range, from the tip the latest earlier review read (`<sweep-base>`
   on the first) to the current tip. Hand it the range with both ends full commits, the sweep log path, the
   global constraints, and no text from an implementer's report, and tell it to run no test. Hand it, as quoted data,
   each unclosable **Pass-to-pass** finding the last re-review listed, with its range, its case, and its reason: it
   restates each with its mark re-judged against the range from that finding's base to the current tip (ADR 0193),
   so the outcomes below read the findings it restates. It closes or keeps each collected Minor against
   the current code, a copy a later slice made included, and collapses duplicates. After it returns, append your own
   outcome line to the log. Its report is a summary and its full findings are its entry in the sweep log, headed `Review — sweep cycle <n>` with the current cycle's number, so a review whose current entry is missing goes back to that same reviewer through SendMessage to append it, as `## Progress log (per slice)` states, before you act on its verdict. Tell it the report contract that step 3 of the DAG loop gives a slice-reviewer dispatch (`slice-reviewer.md`'s `## Report`), and read its current entry in the sweep log for the fix list. Carry the deferred findings and the dedup rule of step 3 into this dispatch, and defer a
   Minor whose remedy adds a capability the plan never named, as step 3 does.

**The cycle ends the sweep** when the re-review lists no finding outside the deferred and unclosable ones, or after cycle 3.
No sweep cycle dispatches an implementer when its list would hold only unclosable or deferred findings (ADR 0193). A
Minor the sweep's own fix introduced is a finding like any other: it stays in the fix list until a re-review lists
none or the cap arrives.

- **Clean verdict.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" minors clear --root <run-root>`, then publish
  the snapshot per `run-state.md`'s `## Publishing run state`.
- **At the cap, Minors left.** The run's final report names each remaining Minor with the slice that left it, then
  `minors clear` runs and the snapshot publishes. The queue loses them with no record outside the report (INV-0094).
  Remaining **Pass-to-pass** or **Missing fail-to-pass run** findings are named in the report the way a merged slice's
  are, and the queue clears.
- **Only unclosable findings left, at any cycle.** A re-review whose only remaining findings are unclosable
  Pass-to-pass findings, beside any deferred ones, ends the sweep as the clean verdict does. The run's final
  report names each with its range, its case, and its reason.
- **At the cap, a Critical or Important finding left** (a deferred or unclosable one excluded, and the Pass-to-pass and
  Missing fail-to-pass run findings that the item **At the cap, Minors left** names excluded) blocks the run the way a blocked slice does: block per `scope-mode.md`'s **Unattended** section,
  attended or unattended, asking no question. The anchor comment names each remaining finding and the way back:
  an attended `/superdev:implement` run on the scope reopens the sweep, as the resume rule below states. The Next
  block's `Blocked:` line names the sweep's cap, and its fence holds that command without `--unattended`. The queue
  stays.
- **A denied dispatch** follows the classifier-denial bullet of step 3 for the sweep's implementer and reviewer.

**A resumed run** whose queue is non-empty and whose slices are all `merged` runs the sweep from here: it reads
`sweep.md` for its collected Minors, takes the cycle count from the highest `cycle <n>` line after the log's last
`reopen base` line, or in the whole log when it holds none, and continues that cycle from its recorded base, reading
the scopetree's commits since that base and the log's last entry to see which of its steps ran. A log with no such
cycle line starts cycle 1. A cycle whose re-review verdict is in the log ended. Where cycle 3 ended with only the
findings the cap's first two outcomes name, the matching outcome applies at once. Where cycle 3 ended with a
Critical or Important finding left, the sweep stands blocked:

- **Attended** → reopen the sweep with no question asked: the operator who typed the command made that decision.
  Append `reopen base <full commit>`, the scope branch's current tip, to the log, and start cycle 1 again from that
  tip. Its fix carries every finding the last re-review listed open, and the cap of 3 counts the cycles after that
  line.
- **`--unattended`** → block again as the cap outcome does. No standing answer reopens a sweep.

## Resume (re-running on an existing scope)

Re-entering an already-started scope — a fresh session, a re-run after compaction, an interruption
mid-loop — is a **first-class path through the loop, not a special case**: reconcile state, then re-enter
the DAG loop at step 1.

- **Find the scopetree first**, per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope
  checkout` — present, recreated when absent, or a named stop when another working tree holds `<branch>`
  — before reading anything out of it.
- **Found already present? Run init's own entry step already checked the run lock's liveness before this
  playbook started** (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The run lock`), so this step
  reconciles rather than detects a live second session — no further lock read of its own. Continue below;
  `## The run lock` above refreshes the file at your first write.
- **Reconcile before dispatching.** Read the ledger through
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get slices --root <run-root>` (and `get stage`), plus
  `<run-root>/interfaces.md` (your pre-compaction context is gone; this file is what survives), and
  cross-check the ledger against `git -C <run-root>/scopetree log <range-base>..<branch>`
  (`<range-base>` per `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## The scope's range base`;
  `<branch>` from the branch step above, never rebuilt as `<type>/<scope>`; merge commits name the slice
  branch) and the store's slice statuses. A slice the ledger — or the merge log — marks `merged` is done:
  **never re-dispatch it**, no matter what a stale in-progress slicetree suggests.
- **Reconcile leftover slicetrees.** For each `<run-root>/slicetrees/<id>` still present,
  check its branch against the ledger: already merged → clean it up (`git worktree remove` +
  `git branch -D slice/<scope>/<id>`); not yet merged → resume it in place (dispatch there with its
  existing commits intact, per the implementer's own resume discipline) rather than recreating it, preparing it
  first: `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" prepare <run-root>/slicetrees/<id>`, per `scope-branch.md`'s `## Preparing a worktree`; a failing
  preparation stops that slice's dispatch, and `--unattended` blocks.
- **Rebuild the runnable set from reconciled state** (DAG loop step 1) and continue. Where every slice is
  `merged` and `get minors` names a slice, run or continue `## Minor sweep`, taking its cycle count from the
  sweep log, before run handoff.

## Leave the run standing

Per-slice slicetrees are already removed at merge (DAG step 4). Anything left — a stray
`<run-root>/slicetrees/*`, a leftover `slice/<scope>/*` branch, the run root, the
scopetree, `<run-root>/run.lock` — stays for `/superdev:wrap-up`, which takes the run down at the end of the
chain. The scopetree keeps `<branch>` checked out: that is the scope checkout `/superdev:review` and
`/superdev:document` work in, on this tier as on `lite`; the invoking checkout is never touched. Run
`## Minor sweep` when the queue holds a slice, then read
`${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md` next, without cleaning up.
