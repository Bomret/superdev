# 0134: A fail-to-pass run shows a change's tests discriminate

**Status:** Accepted

**Amends:** INV-0017, which limits a slice implementer and a fix cycle to the focused command: a
fail-to-pass run is no suite run, and it runs the full command where the focused command carries no
`{paths}`.

**Amended by:** [ADR 0142](0142-the-fail-to-pass-bound-has-a-floor.md), which puts a floor of 10 000 ms
under the bound of the run before the change.

**Amended by:** [ADR 0155](0155-a-slice-merge-runs-no-test-suite.md), which deletes `green-gate`, so the
command pick no longer mirrors a merge hook's pick.

**Amended by:** [ADR 0175](0175-a-green-suite-record-carries-across-a-delta-a-complete-focused-selector-covered.md), under
which a fail-to-pass run records a test run.

**Context.** Every superdev gate reads a passing test as evidence, and a test can pass without being able
to fail for the defect it names. Triage #576 records a fix-cycle test that passed on the exact regression
it was written for. Triage #631 records six checks in four runs that passed without exercising what they
claimed; a reader who rebuilt the input caught each one, and no reading gate did. The run trace proves
that a failing run happened after a test edit (Missing RED, INV-0118), but it accepts a failing run for
any reason, and it never runs the new tests against the code as it stood before the change.

**Decision.** A **fail-to-pass run** runs the tests a change's paths select twice, in a throwaway
worktree detached at the change's last commit: once against the changed code, where they must pass, and
once with every file the change touched outside its test-path files put back as it stood before the
change, where they must fail. Putting back removes a file the change added and restores one it modified,
deleted, or renamed. Before the second run, the run resets every tracked file to the change's last commit and
removes every untracked and ignored file, so nothing the first run wrote reaches the second: a build copy of
an added file, or a tracked file the tests regenerate, cannot let a test pass with the file put back. The command and the test-path classification come from the change's last commit,
and both runs use the same command: the focused command over the change's whole path set where it
carries `{paths}`, the same pick green-gate makes on a merge (ADR 0085), and the full command for a
fixed-subset or self-detecting focused command, because neither is guaranteed to collect the change's
tests in a clean worktree. The run before the change is bounded at ten times the duration the run
against the changed code took, because code missing the feature can hang; a run killed at that bound,
or ended by a signal, carries no verdict (INV-0009). A `scope.js` verb performs it over a commit range and appends its own
trace line, a kind of its own, so no fail-to-pass line ever satisfies Missing RED or moves the suite
record. Its outcome is `fail-to-pass`, `pass-to-pass`, or `unknown`. A range that changes no file
outside its test-path files has nothing to put back, and the verb refuses it.

The controller runs the verb at each point where a change touching both a test-path file and another
file is complete: before `slice-reviewer` on a full-tier `behavior` slice, before a lite-tier `behavior`
slice is recorded `merged` with its commit range, while it is still in progress so the outcome line names
the slice, and after each fix cycle. The reviewer that next reads
the trace applies two Important findings: a `pass-to-pass` outcome, and such a change with no outcome
line. Both take Missing RED's 3-cycle cap and escape path (ADR 0125). At the cap, a remainder whose only
Critical or Important findings are Missing RED and these two, in any mix, proceeds, and the report names
each. Any of them beside a Critical or Important finding of another kind blocks. A `pass-to-pass` finding closes on
a `fail-to-pass` outcome over a range from the original change's base to the tip current when that closing
run ran, so a fix that only strengthens the test can close it. The finding stays closed once that outcome is
written. The controller answers a missing outcome line by running the verb itself, and the answer dispatches no
implementer. Where no implementer fix is dispatched before the re-review after the answer, the full tier counts both as
one of the 3 cycles. `/superdev:review` applies the same count only where the run prints `pass-to-pass`. A fix
dispatched before that same re-review joins the answer and the re-review in one cycle. A loop of counted answers reaches
the cap. A reviewer reads a fix cycle's change from the trace. The window of a fix cycle runs from the dispatch of the
cycle's implementer to the first dispatch after that implementer ends. The reviewer takes the cycle's commits from the
scope branch's first-parent chain. Only `edit` lines count as a
slice's or a cycle's change events. An `unknown` outcome is no finding and starts no fix cycle: the
review report names it with its reason, and the scope run's first `unknown` becomes an observation
naming the environment gap.

**Considered options**

- **A hook fires the run at an implementer's dispatch end.** No agent could skip it. It loses because no
  hook sees the range: a `dispatch` line records no commit, fix cycles record no per-cycle commit, the
  hook that sees a dispatch end exits after 5 s, and no captured `SubagentStop` payload yet confirms its
  `agent_id`. A finding on a missing outcome line catches the omission deterministically instead, the way
  INV-0119 catches a missing review dispatch.
- **The slice reviewer replays the tests as prose.** It needs no code. It loses because the lite tier
  dispatches no slice reviewer, and `/superdev:review`'s fix-loop re-review runs no suite in scope mode, so
  it misses #576's own case.
- **The author reports the red observation.** The trace already records a run's exit status (ADR 0127),
  so a self-report adds nothing a reviewer can check, and #631 records that an author-side rule is ticked
  by the reflex that produced the gap.
- **A reading lens alone.** #631's six cases each passed every reading gate.
- **The focused command handed only the changed test files.** `vitest related` and
  `jest --findRelatedTests` document source files only, and neither says a test file handed to it runs.
  A runner that runs nothing exits 0 both times and reads as a false `pass-to-pass`.
- **A new per-file test command.** It would flag a vacuous test file beside a discriminating one. It
  loses on cost: a new configuration section, a setup question and probe, a seed gap for every adopter,
  and one run per changed test file.
- **A hard block on `pass-to-pass`.** A test that pins existing behaviour on purpose passes before the
  change by design, and a block would stop the run with no judgment and no escape path.

**Consequences.** The run reads exit statuses only. A test that calls a symbol the change introduces
fails before the change in every language, at compile, import, or name lookup, so it reads
`fail-to-pass` whether or not its assertions discriminate. The review checklist's Tautological test entry
covers that case by reading. The grain is the whole change: `pass-to-pass` means every changed test
passed without the change, so a vacuous test beside a discriminating one reads `fail-to-pass`. A test
that lives inside a production file is not a test-path file, so the run never sees it.
