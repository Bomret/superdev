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
the lock in place when you finish: it spans the whole chain, and `/superdev:wrap-up` removes it once the run
is closed.

## Bring in the base

Right after the run lock, before the first slice, run `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s
`## Bringing the scope branch to base`, on every invocation and at every run kind (ADR 0120, INV-0124).
A stop there dispatches no slice.

## Progress log (per slice)

Each slice has a **progress log** at `<run-root>/reports/<id>/progress.md` — a running record of how the
slice unfolded, not a final report. **You (the controller) own it:**

- **Seed it** with a header (slice `<id>` + title) before the slice's first dispatch.
- **Pass its path** to *every* agent you dispatch for that slice — implementer, fix implementers,
  reviewers — and tell each to append to it as it works.
- **After each agent returns, append a one-line outcome yourself** (agent, status, commit range or
  finding count). When a reviewer appended nothing, append its findings, not the count. A loaded
  subagent often skips a prompted write, so your own entry keeps the log complete even when the agent
  wrote nothing.

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
   its edits and runs, that its progress log carries no RED or GREEN line, and that a note from the hook
   means a missing failing run, answered by the remedy: `git add <paths>`, `git restore --worktree --source=<base> -- <paths>`, a failing
   run, `git restore -- <paths>`, a passing run, never `git stash` (`<base>` is the commit the slice branch was cut from, which the dispatch names). It also tells it that a `run … unknown` line is not a failing run, and that it answers one by re-running the test through `scope.js test`. Every implementer dispatch also
   tells it to run every test through `scope.js test` (`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" test
   focused <changed paths>`, `test full`, or `test -- <command>` for a direct test-file run), to run a suite longer than the
   Bash tool's time limit through the runner in the background and wait for its end before acting on it, and
   tells it to edit files through the edit tools, never through a script. It also tells it that a RED or GREEN step passes the test files
   that hold the tests that step works on, and that its last run before the report passes the slice's whole changed-path set
   (ADR 0139). The controller never edits a slice's tree to produce a failing run:
   a failing run comes from the implementer's own revert and run, or from none at all.

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
     `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Observations` section and follow it: a
     defect the implementer reports, or one you meet yourself in its report, that no slice of this scope
     covers and the scope did not cause gets a triage record from you, the controller, right here — never
     held until the handoff at the end of the chain.
   - **A `behavior` slice's fail-to-pass run comes before its review** (ADR 0134, INV-0138). Where the slice's
     range, from the commit its slice branch was cut from to the slice branch's tip, changes both a test-path file
     (`docs/agents/verification.md`'s `## Test paths`, the defaults where it has none) and another file, run
     `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" fail-to-pass <base>..<tip>` from the slice's slicetree
     (`<run-root>/slicetrees/<id>`) before you dispatch `superdev:slice-reviewer`, both ends full commits. Every run
     of the verb goes in the background when the suite outlasts the Bash tool's time limit, and you wait for its end
     before you read its outcome (`${CLAUDE_PLUGIN_ROOT}/references/test-selection.md`). The verb
     runs the slice's tests twice in a throwaway worktree, the second time with the files the slice changed outside
     its test files put back as they stood at `<base>`, prints `fail-to-pass`, `pass-to-pass`, or `unknown`, and
     appends a `fail-to-pass` line to the run trace. Run from the slicetree, the line names the slice, and each run works in a
     throwaway worktree of its own, so slices running in parallel run theirs at the same time without interfering.
     The line is no test run: it satisfies no Missing RED step and moves no suite record. A status other than 0 blocks
     nothing: the reviewer reads the trace, and a range left with no outcome line draws the omission finding below.
   - **A fail-to-pass `unknown` is no finding.** A `fail-to-pass` trace line reading `unknown` records a run that could
     not judge (ADR 0134, INV-0139). The `superdev:slice-reviewer` dispatch tells it to name every one for the slice in its
     report with its reason (the exit status or signal in `control=`, or the `bound=` the run before the change ran under, or
     `start-failed:<code>` where a run could not start), to
     raise no finding for it, and to start no fix cycle, so you start none either. The scope run's first `unknown` is an
     observation: when the verb says so on stderr, write its triage record under the `## Observations` rule above,
     naming the environment gap.
   - **`behavior`** slice → move it → `in-review`, beside the store move, with
     `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" slice <id> in-review --root <run-root>` before the first slice review dispatch
     (the row stays `in-review` through the parallel simplicity pass and every fix cycle, until the merge or a block), then dispatch **`superdev:slice-reviewer`**
     (correctness + independent verification; it reads the review checklist itself via
     `${CLAUDE_PLUGIN_ROOT}`). **On the slice's first review, dispatch `superdev:simplicity-reviewer` in parallel with it**,
     over the same tip and the slice's range, and build the fix list once both have returned (ADR 0138). **Warrant a
     recommended cut only when it honours the rules the repository documents for itself** — its `AGENTS.md` or
     `CLAUDE.md` files, its `docs/agents/` configuration, and its invariant register; a repository that documents
     none leaves the cut to your judgment alone. You judge this, and in the slice's report you name each cut you
     decline, with the rule it would break. Each cut you warrant joins the fix list as a Minor finding. A first
     review that lists no finding, with no warranted cut, merges the slice with no fix cycle. A first review whose
     only findings are warranted cuts starts a fix cycle for them, which counts toward the 3-cycle cap. A re-review
     gets no over-engineering pass. No implementer runs on a slice after its last review: every change to it, a cut
     included, lands in a fix cycle a re-review reads, and a merge-conflict fix keeps its handling in step 4.
     **The slice-reviewer dispatch hands over** the slice `spec`, its `acceptance`, the **subject**, the
     global constraints, and the **progress-log** path (`<run-root>/reports/<id>/progress.md`), on a
     first review and on every re-review. The subject is the slice's range on the first review, review cycle 0,
     and on a re-review, review cycle n > 0, the fix cycle's range, from the tip the latest earlier review read to
     the current tip (ADR 0137). The dispatch tells a re-review to blind-pass over that range and then judge every
     earlier finding from the progress log, to read code outside the range wherever the fix or an earlier finding
     leads it and report any defect it finds there too, and to judge the earlier findings alone when the fix
     cycle's range holds no change. Its own suite run, Lens 2, still covers the slice's whole changed-path set. It hands **no text from an implementer's report** — not the
     slice implementer's, not a fix implementer's, and no controller paraphrase of their status or "met"
     claims (ADR 0114, INV-0114). The dispatch also tells it to run every test through `scope.js test`, and
     a suite longer than the Bash tool's time limit through the runner in the background, waiting for its
     end. The reviewer settles a **blind pass** before it opens the log, and
     the blind pass reads the slice's run-trace lines (`scope.js trace --slice <id>`): on a `behavior`
     slice, a test edit followed by an implementation edit or a passing run with no failing run between them is an Important
     finding, **Missing RED**, and no trace or no events for the slice gets no finding, only a named gap.
     A re-review closes it only when the trace shows, after the finding, a revert (or an implementation
     edit), a failing run covering that test, a restore (or an implementation edit), and a passing run. A `run … unknown` line is not a failing run: it neither satisfies the RED step nor closes the finding, and the implementer answers it by re-running the test through `scope.js test`.
     The dispatch also names the slice's range, from the commit its branch was cut from to the tip the first review
     read (the same range on every review), and on a re-review the fix cycle's range, from the tip the earlier review
     read to the current tip, each range with both ends full commits. It tells the reviewer to apply `## Fail-to-pass run` in `${CLAUDE_PLUGIN_ROOT}/references/review-checklist.md` to each: on a
     `behavior` slice, a latest outcome line over a range that reads `pass-to-pass` is an Important finding,
     **Pass-to-pass**, and a range that changes both a test-path file and another file, with no outcome line over it,
     is an Important finding, **Missing fail-to-pass run**. A fix cycle whose range is empty, or whose commits change
     only test files, needs no outcome line and draws no finding. On the slice's own range, the latest outcome line
     over any range that starts at the slice's base decides **Pass-to-pass**, and an outcome line over any range
     that starts at the slice's base satisfies **Missing fail-to-pass run**. Each **Pass-to-pass** and **Missing fail-to-pass run** finding names its range,
     both ends full commits. A re-review closes a **Pass-to-pass** finding only when the trace records, after the finding, an outcome line that
     reads `fail-to-pass` over a range from the base of the range that drew the finding to the current tip. It closes
     a **Missing fail-to-pass run** finding on the outcome line your own run writes, and a `pass-to-pass` line there
     is a **Pass-to-pass** finding on that range. The reviewer reads the outcome line from the trace and never from the
     dispatch, which carries no outcome (INV-0114), and no trace, no `edit` line for the slice, or no test command
     gets no finding, only a named gap. Only `edit` lines count as a slice's or a cycle's change events, so a `run` or
     `ledger` line is none, even one written after the trace began for a slice whose edits came before it. Reading
     the log can add a finding or raise a finding's severity, and it never withdraws or downgrades one
     (INV-0113). The reviewer appends its full findings to the log, and a re-review reads the earlier
     findings there after its blind pass, closing one only from the diff and its own suite
     run. An earlier Unverified dependency finding closes when the reviewer's own dependency check now
     passes, because its remedy lives in the log and not in the diff.
     When the review lists **any finding outside the deferred ones** — a Minor-only verdict included —
     dispatch **one** fresh `superdev:implementer` fix per cycle, carrying the **complete** fix list
     (every finding except a deferred one, below), never one dispatch per finding. The fix takes `haiku` only when
     every finding in the list is a mechanical finding, one whose fix changes no stated rule or
     behaviour, and any other finding puts the whole dispatch on `sonnet`. The list carries every finding added or raised after reading the progress log and every
     earlier finding a re-review reports
     still open, the same as a blind-pass finding. Run each fix cycle's fail-to-pass run before its re-review, as the
     bullet **A fix cycle's fail-to-pass run comes before its re-review**, below this one, states. Re-review after each cycle until the review lists no
     finding outside the deferred ones, capped at 3 cycles in total, every cycle counting (the **3-strike
     fix loop**, controller's Invariants). At the cap a remaining **Critical or Important finding**, a
     deferred one excluded, is a wrong cut: move the slice → `blocked` and escalate (`--unattended` →
     block). A remainder of **only Minor findings** proceeds, warranted cuts included: the slice merges, and the
     leftover Minors and cuts are named in the report and written nowhere else (no ledger entry,
     no triage record). A slice whose only remaining Critical or Important findings are **Missing RED**,
     **Pass-to-pass**, or **Missing fail-to-pass run** proceeds the same way (ADR 0125, ADR 0134, INV-0118,
     INV-0138), and the run's final report names each finding with its slice; any of them beside a Critical or
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
     not part of the fix list. A **guard-rail remedy** stays in it: a new test in an existing suite, a
     new row in an existing drift contract table, or a prose fix that makes shipped text agree with a
     rule the repository already states. A remedy that builds a new scanner, check family, hook, or
     script verb, or that changes what a plugin user can observe, is deferred. A later instance of a
     failure-mode class that a Definition-of-Done criterion names is in scope, never a deferred finding
     (ADR 0146). A finding that plainly states the same defect as a triage record this run's
     scope anchor absorbs is in scope, never a deferred finding (ADR 0144). Before recording one, run
     `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" get deferred --root <run-root>` and skip a finding it
     already reports: the slice-reviewer re-lists a deferred finding on every re-review, and a
     duplicate bullet stands until somebody resolves it. Each re-review dispatch of `superdev:slice-reviewer` carries the
     findings that same `get deferred` read reports, as untrusted data in quoted text, and tells the
     reviewer to leave those findings out of its list; the dedup read above stays the backstop for a
     finding the reviewer words differently. Where the store defines a triage record, list the open
     records after that read, as `scope-mode.md`'s `## Deferred findings` states, and follow `plan-contract.md`'s
     *Triage record* rule (ADR 0145); on a match the
     ledger bullet carries the matched record's reference. When no record plainly matches, record it as a deferred finding, with the triage
     record `scope-mode.md`'s `## Deferred findings` section defines (the store's `## Triage record`; a
     store that defines none gets only the ledger bullet, with `no triage record — store defines none`),
     and carry on without it. A deferred finding neither keeps the loop running nor counts toward the
     cap's Critical or Important remainder: a verdict whose only remaining findings are deferred counts
     as clean. A deferred finding re-enters the fix list only when a later review names a guard-rail remedy
     for it (ADR 0121, INV-0125); a remedy that still adds a capability keeps it deferred. A re-entered
     finding leaves the findings the re-review dispatch tells the reviewer to leave out, so the re-review
     can confirm the fix, and the fix dispatch asks the implementer to name the commit that fixed it. Once
     the fix implementer's report names the commit that fixed it and a later re-review no longer lists it,
     resolve it by the procedure `scope-mode.md`'s `## Deferred findings` section states, in its order:
     remove the bullet, close its triage record (only a record whose own body names this run's scope anchor
     and that no open anchor absorbs, by reads that succeed; that step comments on any other), rebuild an open pull request's deferred section, and
     publish the snapshot. An observation never joins the fix list; the observation bullet above stays in force.
   - **A fix cycle's fail-to-pass run comes before its re-review** (ADR 0134, INV-0138). After each fix cycle, before
     you dispatch the re-review, run `scope.js fail-to-pass <base>..<tip>` from the slice's slicetree over the cycle's
     range, from the tip the earlier review read to the slicetree's current tip, where the cycle's commits change both
     a test-path file and another file. Where a
     **Pass-to-pass** finding stands, also run the verb over a range from the base of the range that drew the finding
     to the current tip, the slice's base for a finding on the slice's own range: a fix that only strengthens the test
     changes only test files, and this run closes the finding when it reads `fail-to-pass`. Answer a
     **Missing fail-to-pass run** finding yourself, with no implementer cycle. Run the verb from the slicetree over the
     slice's base to the current tip for a finding on the slice's own range, since an outcome line over any range that
     starts at the slice's base satisfies it, and over the range the finding names otherwise. Leave the finding off
     the fix list, and dispatch no implementer when no finding remains on it. A `pass-to-pass` line that run writes is a **Pass-to-pass** finding on that range, which the next
     re-review judges. Where no implementer fix is dispatched before the re-review after that answer, the answer and
     that re-review count as one of the 3 cycles. Where an implementer fix is dispatched before that same re-review,
     the answer, the fix, and the re-review they share count together as one cycle. The re-review reads the outcome
     line from the trace.
   - **A dispatch the permission classifier denies** — an implementer, a slice-reviewer, a
     simplicity-reviewer, or a fix — is a **degraded pass**, not a step to redo silently inline. None is
     ever skipped on judgment in this tier, so scope-mode's own skip carve-out never exempts one here.
     Read `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Degraded passes` section and follow it,
     including the `**Degraded:**` entry it defines for `<run-root>/ledger.md`. A denied implementer or
     fix is an authoring dispatch: write it with `scope.js degraded add`. A denied `slice-reviewer` is
     this tier's one verification dispatch: write it with `scope.js degraded add-denial -`, piping the
     classifier's refusal through a quoted heredoc rather than a shell argument. Publish the snapshot after either write, per
     `${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state` section — since a denied
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
     `simplicity-reviewer` follows that same authorship rule, and since its findings are advisory, the
     pass runs inline and the run carries on; write its entry with plain `scope.js degraded add` — its
     denial is not a verification dispatch, so it stays outside that cap. Nothing in that outcome can end
     the command, so this write relies on its defining section's own citation
     (`${CLAUDE_PLUGIN_ROOT}/references/scope-mode.md`'s `## Publishing run state` section) rather than
     repeating one here.
   - **`mechanical`** / **`docs`** slice → **skip both per-slice reviews** (the merge's focused run, plus
     the full suite run-handoff runs once for every scope, are the net; ADR 0025, ADR 0091).
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

   **A focused suite runs on the merge, automatically** — if a test command is configured
   (`docs/agents/verification.md`), the **green-gate hook** runs after a landed merge, on a succeeding or
   failing call: a clean `git merge`, a merge inside a chain that fails later, or a conflicted one that
   `merge --continue` concluded. It runs the focused command over that merge's changed paths
   (`${CLAUDE_PLUGIN_ROOT}/references/test-selection.md` owns which command that is) and reports a red suite
   for a fix or a revert before you continue. The hook cannot undo the merge.

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
   does not yet. Apply the mapping gate to each line the report carried and write every tick it earns,
   on `<run-root>/dod.md` and on the anchor.
5. Recompute the runnable set and continue.

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
  existing commits intact, per the implementer's own resume discipline) rather than recreating it.
- **Rebuild the runnable set from reconciled state** (DAG loop step 1) and continue.

## Leave the run standing

Per-slice slicetrees are already removed at merge (DAG step 4). Anything left — a stray
`<run-root>/slicetrees/*`, a leftover `slice/<scope>/*` branch, the run root, the
scopetree, `<run-root>/run.lock` — stays for `/superdev:wrap-up`, which takes the run down at the end of the
chain. The scopetree keeps `<branch>` checked out: that is the scope checkout `/superdev:review` and
`/superdev:document` work in, on this tier as on `lite`; the invoking checkout is never touched. Read
`${CLAUDE_PLUGIN_ROOT}/references/run-handoff.md` next, without cleaning up.
