# Fail-to-pass run — the reviewer's grading rules

How a reviewer grades a fail-to-pass run. `implementer.md`'s `### Fail-to-pass run` states what the implementer runs.

## Fail-to-pass run

`final-reviewer` applies this on a `lite` scope and to fix cycles on either tier, `slice-reviewer` on the full tier, both
against the run trace (`scope.js trace`), under `review-checklist.md`'s `## Binding rules`.

A fail-to-pass run tests a `behavior` change at its tip, then again with its non-test files put back. Its outcome line is
a `fail-to-pass` trace line naming the range, the outcome (`fail-to-pass`, `pass-to-pass`, `unknown`), a reason, and the
command. It is no test run.

### Reading an outcome line

- **Command coverage.** A line counts only where its command, read against the repository's runner, runs every test
  file the range adds or modifies; else it is no outcome line, and the finding names the file. Doubtful coverage counts,
  and the report names the doubt.
- **Change events** are `edit` lines and the paths `untraced-writes.md`'s `## Untraced writes` lists, never a `run`
  or `ledger` line.
- **No outcome line needed.** A range changing only test-path files, or no file, or whose test-path changes are all
  deletions, needs none when no file it changed outside the test paths adds behaviour. Where one adds behaviour, the
  range draws **Missing fail-to-pass run**, and its fix adds a test for that behaviour and runs the verb.
- **The original change's base** is the base of the range the `pass-to-pass` line names: a lite slice's recorded range
  base, the slice's base on the full tier, or the fix cycle's own base.

### Findings

Both are Important, and apply to a `behavior` slice and to a fix cycle.

- **Pass-to-pass**: the latest outcome line over the range reads `pass-to-pass`. It closes only when the trace records,
  after that line, a `fail-to-pass` outcome over a range from the original change's base to the tip current when that
  run ran, and stays closed once that line is written. A fix that only strengthens the test can close it.
- **Missing fail-to-pass run**: a range that changes a test-path file and another file, with no outcome line over it.
  A slice with no recorded range is read from its `edit test`, `edit impl`, and untraced writes. No trace, no change
  event, or no test command → no finding; the report names the gap. The fix runs `scope.js fail-to-pass <base>..HEAD --
  <command>` over the named range and closes it. For a slice with no recorded range the controller first records it
  from the scope branch's log (`scope.js slice <id> merged --range <base>..<tip> --root <run-root>`) and names it in the
  fix dispatch, as it names a cycle's range.

### Fix cycles

A fix cycle (`review-scope-mode.md`'s `### 4.7 Fix cycles`) is a change on either tier, its range from the scope tip
recorded before the fix dispatch to the tip once its report is accepted. Its trace line names `scope`.

- **`final-reviewer` reads every earlier cycle** from the trace at each dispatch, beside the current range the
  dispatch hands. A `scope` range whose latest outcome reads `pass-to-pass` is Pass-to-pass. An `implementer` `dispatch`
  of `scope` whose window's commits change a test-path file and another file, with no outcome line over them, is
  Missing fail-to-pass run. Name a cycle's finding with its range.
- **A cycle's window** runs from each run of its dispatch (its `dispatch` line and each `dispatch-resume` of it) to the
  first boundary line after the `dispatch-end` closing that run (any outcome), or after its own start when it has none,
  or to the trace's end. A boundary line is any `dispatch` line, or a `dispatch-resume` of a reviewer's dispatch
  (`final-reviewer`, `slice-reviewer`, `simplicity-reviewer`).
- **A cycle's commits** follow the scope branch's first-parent chain, so merged-in base commits and the merge commit are
  not its own. The `edit` lines find a cycle, and its commits decide it.
- **A closing run is no cycle.** A `scope` line after a finding's `pass-to-pass` line, starting at that line's base,
  closes the finding or keeps it open, and raises no second finding.

### Full tier

`slice-reviewer` grades each range its dispatch names: the slice's, from its branch point to the tip the first review
read, and on a re-review the fix cycle's, from the earlier review's tip to the current one. An outcome line from the
slice's base to a range's tip covers that range: the latest decides Pass-to-pass, and any satisfies Missing
fail-to-pass run, whose fix dispatch names the slice's base.

### Unclosable Pass-to-pass

A Pass-to-pass finding no fix can close. Exactly three cases, a closed list:

- **(a)** The behaviour change lies wholly in test-path files. Any file changed outside them that the outcome line's
  command reads carries behaviour and rules the case out; prose or docs the command never reads carry none.
- **(b)** A test pins existing behaviour on purpose. The reason names that behaviour and why the range leaves it
  unchanged. New behaviour no test detects is not (b).
- **(c)** The changes outside the test paths only restructure or remove code, a refactor or a cut with its tests. The
  reason names, per file, what changed and why no behaviour did. A file that adds behaviour rules the case out.

The raising reviewer marks it `unclosable (<a|b|c>): <reason>`, exactly one case, (c) whenever the non-test changes
only restructure or remove. It stays Important. Re-judge the mark at every dispatch against the current range, earlier
cycles included. A re-review of the latest cycle's range alone (the
warm re-review, the Minor sweep's) restates each unclosable finding the last verdict listed, mark re-judged
(`scope-findings.md`'s `## Warm cycles`). A later change adding behaviour outside the test paths makes it closable. An
implementer's or the lite controller's claimed case is input to check, never a verdict. A Missing fail-to-pass run
finding never carries the mark.

### The fix cap

Both findings take the 3-cycle fix cap and its escape: a scope or slice whose only remaining Critical or Important
findings are of these two kinds proceeds at the cap, the report naming each with its slice. An unclosable finding takes
the escape at once and never enters a fix list. Either kind beside a Critical or Important finding of another kind
blocks at the cap.

### An `unknown` outcome

An `unknown` line records a run that could not judge: the tests failed against the changed code, a run outlasted its
bound or ended by a signal, a command could not start, or a prepare command failed. Its `control=`, `bound=`,
`start-failed:<code>`, and `prepare=` fields name which.

A reviewer names every `unknown` in its report with its slice and reason, raises no finding, and starts no fix cycle.
It counts as an outcome line for Missing fail-to-pass run, and only a `fail-to-pass` or `pass-to-pass` line decides
Pass-to-pass. The controller, not the reviewer, captures the observation `scope-findings.md`'s
`## Observations` owns.
