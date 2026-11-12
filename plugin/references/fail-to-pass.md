# Fail-to-pass run — the reviewer's grading rules

How a reviewer grades a fail-to-pass run. `implementer.md`'s `### Fail-to-pass run` states what the implementer runs.

## Fail-to-pass run

**`final-reviewer` reads this section** on a `lite` scope and for fix cycles on either tier, and `slice-reviewer`
reads it on the full tier, because both findings below are judged against the run trace (`scope.js trace`), which
`scope.js` wrote. `review-checklist.md`'s `## Binding rules` bind every finding below.

A fail-to-pass run runs a `behavior` change's test files at its tip, then puts back every file its range changed outside
its test-path files and runs those test files again. The implementer of the change runs it over its own range before its
report. Its outcome line is a `fail-to-pass` line carrying the range, the outcome, a reason, and the command both runs
used, and it is no test run. Where the trace already holds a passing `path` run of those test files at the tip on a clean
tree, that run is the first run, and the verb runs only the second.

### Reading an outcome line

- **Command coverage.** An outcome line counts only where its command runs the range's test files. The verb reads no
  word of the command, so read it against the repository's runner and the test files the range adds or modifies. A line
  whose command leaves one of them out counts as no outcome line for either finding, and the finding names the file. A
  line whose coverage you cannot judge, one with no command among them, counts, and the report names the doubt.
- **Change events.** Only `edit` lines and the paths `untraced-writes.md`'s `## Untraced writes` lists count as a slice's
  or a cycle's change events. A `run` or `ledger` line is none, even one written after the trace began for a slice
  whose edits came before it.
- **Ranges that need no outcome line.** A range whose commits change only test-path files, or no file, has nothing to
  put back. A range whose test-path changes are all deletions has no test of its own to run, and the verb refuses it.
  Read every file such a range changed outside its test paths: where none adds behaviour, the range needs no outcome
  line, draws neither finding, and the report names no gap for it. Where one adds behaviour, that behaviour has no
  test, so the range draws **Missing fail-to-pass run**, and its fix adds a test for that behaviour and runs the verb.
- **The original change's base** is the base of the range the finding's `pass-to-pass` line names: a lite slice's
  recorded range base, the slice's base on the full tier, or the fix cycle's own base.

### Findings

- **Pass-to-pass** — on a `behavior` slice or a fix cycle, a latest outcome line over its range that reads
  `pass-to-pass`: its tests passed with its other files put back as they stood before it, so they do not discriminate
  what it changed. Severity Important. A latest outcome line reading `fail-to-pass`, and no outcome line, draw no such
  finding. At every dispatch, an entry dispatch included, the finding closes only when the trace records, after its
  `pass-to-pass` line, an outcome line reading `fail-to-pass` over a range from the original change's base to the tip
  current when that closing run ran. A fix that only strengthens the test closes it, and the finding stays
  closed once that line is written. A finding no fix can close carries the unclosable mark (`### Unclosable Pass-to-pass`).
- **Missing fail-to-pass run** — on a `behavior` slice or a fix cycle, a range that changes both a test-path file and
  another file, with no outcome line over that range. Severity Important. A slice whose ledger row records no range is
  read from its own trace: its `edit test` and `edit impl` lines and its untraced writes name both a test-path file and
  another file. No trace, a slice or a cycle with neither an `edit` line nor an untraced write, and a repository with no
  test command get no finding: the report names the gap. The finding goes into the fix list: the fix implementer runs
  `scope.js fail-to-pass <base>..HEAD -- <command>` over the range the finding names, and the finding closes on the
  outcome line that run writes. Where the slice's row records no range, the controller first reads the slice's commits
  from the scope branch's log, records the range with `scope.js slice <id> merged --range <base>..<tip> --root <run-root>`,
  and names it in the fix dispatch. A cycle's range the controller names in the fix dispatch the same way.

### Fix cycles

A fix cycle in `/superdev:review`'s fix loop (`review-scope-mode.md`'s `### 4.7 Fix cycles`) is a change too, on either
tier, and both findings apply to it. Its range runs from the scope tip the controller recorded before the fix dispatch to
the tip once the cycle's report is accepted, after any send-back to the implementer. Where its commits change both a
test-path file and another file, its implementer runs `scope.js fail-to-pass <base>..HEAD -- <command>` over that range
from the scope checkout before its report, and the trace line names `scope`.

- **What `final-reviewer` reads.** The current cycle's range comes from the re-review's dispatch. A re-review hands only
  that range, so `final-reviewer` reads the scope's earlier review cycles from the trace at every dispatch of
  `/superdev:review`. A `scope` range whose latest outcome line reads `pass-to-pass` is a Pass-to-pass finding. An
  `implementer` `dispatch` of `scope` with change events in its window, whose commits that landed in that window change
  both a test-path file and another file, with no outcome line over those commits, is a Missing fail-to-pass run finding.
  The report names a cycle's finding with its range.
- **A cycle's window** runs from each run of its `implementer` dispatch of `scope` (its `dispatch` line, and each
  `dispatch-resume` line of that dispatch) to the first boundary line after the `dispatch-end` line that closes that run,
  or to the end of the trace when none follows. A boundary line is a `dispatch` line, whatever its agent type or slice,
  or a reviewer `dispatch-resume` line: one whose first field is the `tool_use_id` of a `final-reviewer`,
  `slice-reviewer`, or `simplicity-reviewer` `dispatch` line. The end's outcome (`completed`, `failed`, `denied`,
  `stopped`, `unknown`, or `session-end`) bounds the window the same way. A run with no `dispatch-end` line ends its
  window at the first boundary line after its own `dispatch` or `dispatch-resume` line, or at the end of the trace. A
  warm cycle's re-review is a reviewer `dispatch-resume` line, so two warm cycles' commits never share one window.
- **A cycle's commits** are read along the scope branch's first-parent chain, so neither the base commits a merge brings
  in nor a merge commit that brings the base in is one of them. An implementer that edits a file to show RED and
  restores it leaves an `edit` line that no commit carries: the `edit` lines find a cycle, and its commits decide it.
- **A closing run is no cycle.** A `scope` line that follows a finding's own `pass-to-pass` line and starts its range at
  that line's base is the finding's closing run: it closes the finding or keeps it open, and raises no second finding.

### Full tier

**`slice-reviewer` applies both findings** to each range its dispatch names: the slice's range, from the commit its slice
branch was cut from to the tip the first review read (the same range on every review), and on a re-review the fix
cycle's range as well, from the tip the earlier review read to the current tip. The implementer runs the verb from the slice's base on the slice dispatch and on
every slice fix dispatch, so an outcome line over a range from the slice's base to a range's tip covers that range: the
latest one decides Pass-to-pass, and one satisfies Missing fail-to-pass run, on the slice's own range and on a fix
cycle's range alike. The slice's ledger row records no range while the slice is under review, so the range comes from the
dispatch, and a Missing fail-to-pass run finding goes into the next fix dispatch, which names the slice's base.

### Unclosable Pass-to-pass

**An unclosable Pass-to-pass finding is one no fix can close**. It is unclosable in exactly three cases, and the list is
closed:

- **(a)** The range's behaviour change lies wholly in test-path files, so the put-back carries none of it. Read every
  file the range changed outside its test-path files: one that carries behaviour rules the case out. A file the outcome
  line's command does not read, such as prompt prose or a doc, carries no behaviour for the put-back. A file that command
  reads carries behaviour, as prose does in a repository whose tests read it.
- **(b)** A test pins existing behaviour on purpose, so it passes before the change by design. The reason names the
  existing behaviour the test pins and why the range leaves it unchanged. New behaviour that no test detects is not
  case (b).
- **(c)** The range's changes outside its test-path files preserve behaviour: they restructure or remove code and add
  none, as a refactor does, or a cut that removes code together with its tests. The reason names, for each such file,
  what was restructured or removed and why no behaviour changed. A file that adds behaviour rules the case out.

- **The mark** names exactly one case. A range whose changes outside the test paths only restructure or remove code is
  case (c), whatever its test's intent. The reviewer that raises the finding marks it in one fixed form,
  `unclosable (a): <reason>`, `unclosable (b): <reason>`, or `unclosable (c): <reason>`, and the finding stays
  Important. A slice's range and a fix cycle's range are judged alike.
- **Re-judged at every dispatch** against the current range, the scope's earlier review cycles read from the trace
  included, so a re-raised finding carries its mark. A re-review that reads only the latest cycle's range, the warm
  re-review and the Minor sweep's, restates each unclosable finding the last verdict listed with its mark re-judged
  (`scope-findings.md`'s `## Warm cycles`). A later change that adds behaviour to a file outside the test paths makes the
  finding closable again.
- **A claim is input.** An implementer's or the lite controller's claim of a case is input the reviewer checks against
  the range, never a verdict it adopts. Any other Pass-to-pass finding is closable, and a Missing fail-to-pass run
  finding never carries the mark.

### The fix cap

Both findings take the 3-cycle fix cap and its escape path: a scope or slice whose only remaining Critical or Important
findings are Pass-to-pass or Missing fail-to-pass run, in any mix, proceeds at the cap, and the report names each finding
with its slice. An unclosable finding takes the escape at once, before the cap, and never enters a fix list. Any of them
beside a Critical or Important finding of another kind blocks at the cap.

### An `unknown` outcome

**An `unknown` outcome is no finding.** A `fail-to-pass` line reading `unknown` records a run that could not judge:

- The tests did not pass against the changed code, and `control=` names the exit status or the signal they ended with.
- The run against the changed code outlasted its bound, 300000 ms (`verification.failToPassControlMs` in
  `.superdev/info.json` overrides it), and `control=` with `bound=` names how it ended and the bound.
- The run before the change outlasted ten times the duration the run against the changed code took or 10 seconds,
  whichever is larger (`verification.failToPassFloorMs` in `.superdev/info.json` overrides the 10-second floor), or
  ended by a signal, and `bound=` names the bound the run ran under.
- A run whose command could not start reads `start-failed:<code>` in place of its exit status.
- A prepare command that did not succeed before a run reads `prepare=` with its exit, its signal,
  `start-failed:<code>`, or `dirty` (it changed a tracked file): `prepare=…` before the run against the changed code,
  `control=0,prepare=…` before the run before the change.

A reviewer that reads the trace (`slice-reviewer`, `final-reviewer`) names every `unknown` in its report with its slice
and its reason, raises no finding for it, and starts no fix cycle. The line counts as an outcome line for **Missing
fail-to-pass run**, and the latest line reading `fail-to-pass` or `pass-to-pass` decides **Pass-to-pass**, so an
`unknown` neither raises nor closes it. The controller, not the reviewer, captures the scope run's first `unknown` that
`scope-findings.md`'s `## Observations` does not exempt, as an observation.
