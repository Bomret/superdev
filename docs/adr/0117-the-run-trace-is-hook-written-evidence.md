# 0117: The run trace is hook-written evidence

**Status:** Accepted

**Amends:** [ADR 0008](0008-tests-written-incrementally.md), [ADR 0114](0114-the-slice-review-reads-the-progress-log-only-after-its-blind-pass.md).

**Amended by:** [ADR 0136](0136-the-run-trace-records-each-slice-review-verdict.md), [ADR 0127](0127-a-test-run-records-its-own-outcome.md), [ADR 0125](0125-missing-red-never-blocks-a-slice-at-the-fix-cap.md), [ADR 0128](0128-a-green-suite-record-carries-across-markdown-only-commits.md), [ADR 0159](0159-run-trace-reads-a-bash-call-s-starting-directory-from-a-pretooluse-stash.md), [ADR 0182](0182-the-implementer-proves-its-change-and-the-controller-runs-only-suite-gates.md), which
removes the Missing RED note.

**Context.** ADR 0008 requires one RED test, then minimal GREEN code, then the next increment. The only
record of that order was the implementer's own progress log. On 2026-10-05 the local transcripts of this
repository held 95 `superdev:implementer` slice runs. About 31 recorded a failing test run before the
implementation, and about 23 recorded none. In ship-deploys slice 03, the implementer wrote about 20
prose edits first and 9 drift rows after them, and ran the suite only after both. Its progress log
states that every new row failed before the prose was written. `slice-reviewer` reads that log (ADR
0114), so a false account reaches the verdict. The ledger's suite record has the same weakness: the
controller writes `suite set green` after a run nobody else observes.

**Decision.** superdev keeps a **run trace**, `<run-root>/trace.log`, and only hooks and `scope.js` write
it (INV-0117). Each line carries a timestamp, the slice it belongs to or `scope`, the agent id, and the
event:

- an edit, classified as test or implementation by the `## Test paths` globs in
  `docs/agents/verification.md`, or by default patterns where that section is absent;
- a test run with its outcome (pass, fail, or unknown for a piped command or a command line with a `!`
  negation) and the HEAD commit. A test run is the full, focused, or whole-repo command, or a command
  that names a test-path file; a command inside a function body records no run, and neither does any
  command of a line whose function header takes a bare compound body (`f() case …`). Pass or fail is
  recorded only for a plain list of simple commands, so a run inside `case`, `if`, `for`, a group, a
  substitution, or after `[[ … ]]` reads unknown;
- a revert or restore of implementation files through `git restore` or `git checkout -- <paths>`;
- a subagent dispatch and its end, mapped to the run through the dispatch prompt (recorded from the
  `Agent` tool's events since 2026-10-08, see the update under the platform basis);
- a ledger write, appended by `scope.js` itself.

A full-tier event belongs to the slice its slicetree path names. A lite-tier event belongs to the one
ledger row at `in-progress`, and to `scope` where no row is.

The trace corrects in the moment and enforces at review. When an implementation edit or a passing run
follows a test edit with no failing run between them, the hook sends the agent one note through
`additionalContext`. What remains on a `behavior` slice is an Important finding (INV-0118). Its fix
reverts the implementation, records a failing run, and restores it. Nothing rewrites history. The
reviewer reads the trace in its blind pass, because the trace is not the implementer's account.
`scope.js suite reusable` accepts a green record only where the latest recorded run of that command
at that commit passed on a clean working tree (INV-0017). On the full tier, `final-reviewer` also checks that every merged slice has a `slice-reviewer` dispatch that ends after its last `implementer` dispatch, or a degraded-pass entry for that review (INV-0119). `/superdev:status <scope> --trace` prints the trace.

The principle "correct in the moment, enforce at review" applies to this check alone and enters no
register: `merge-guard` blocks at once, and is right to.

**Platform basis.** Verified 2026-10-05 on Claude Code 2.1.289 against
https://code.claude.com/docs/en/hooks and the local transcripts. Plugin hooks fire inside subagents, and
the input carries `agent_id` and `agent_type`. The transcripts hold 550 `PostToolUse` hook events
inside subagents and 714 `hook_additional_context` attachments, so a note reaches the subagent. A Bash
result carries no exit code: `PostToolUse` fires on success, and `PostToolUseFailure` fires on failure.
`SubagentStart` carries `prompt` and `agent_id`. `SubagentStop` carries `agent_id` and no prompt.
*Update 2026-10-08, Claude Code 2.1.294:* `SubagentStart` carries no `prompt`. `PreToolUse` on the `Agent`
tool records a dispatch, keyed by `tool_use_id`, and `PostToolUse` or `SubagentStop` ends it
(ADR 0127, `docs/known-issues.md`).
Matching hooks run in parallel with no order guarantee.

**Considered options**

- **The reviewer reads the implementer's transcript.** It loses because the transcript format is
  undocumented and transcripts expire. A format change would fall on a verdict, where in
  `/superdev:profile` (ADR 0103) it only falls on a report.
- **A test-only commit per increment, run red at review.** It proves that a test can fail, not that it
  came first. It doubles the commits and changes the lite tier's one-commit-per-slice shape.
- **Drop the RED claim from the progress log, and nothing else.** It loses because no audit remains.
- **One trace file per slice.** It loses because the trace grows into the whole run's record, and one
  file with a slice column takes new event kinds without a migration.
- **An Important finding with no note.** It loses on cost. A fix cycle takes a median of about 7 minutes
  and a re-review about 3, on about a quarter of slices.
- **A rule on test runs alone, with no file classification.** It loses because it flags every refactor
  after GREEN.
- **A hook that blocks an implementation edit until a failing run exists.** It loses because shape
  declarations (ADR 0030), fixtures, and docs slices would be blocked falsely.

**Consequences.** ADR 0008's rule now has a mechanical record, and the progress log no longer narrates
RED and GREEN. The trace sees edits, not test counts, so a RED that adds several tests at once passes.
A runner invoked only to exit non-zero on a test file still records a failing run: the trace makes a false account costly, and it does not stop a deliberate forgery. Shell writes behind `bash -c` or a variable escape edit classification, the same ceiling `ledger-guard` names. A run line names the command kind and the files, never the command text, so no credential reaches the trace. A missing trace fails open for the order check and fails safe for suite reuse: the suite runs again. A
trace dies with its run root at `scope-prune`'s reap. Brainstorm and the part of plan before the cut
leave no trace, because no run root exists yet. Two parallel implementers append to one file, which
stays line-safe only while each event is one short write.
