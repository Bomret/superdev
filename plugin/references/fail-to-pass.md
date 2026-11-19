# Fail-to-pass run — the reviewer's grading rules

How a reviewer grades a fail-to-pass run. `implementer.md`'s `### Fail-to-pass run

`final-reviewer` applies this on a `lite` scope and to fix cycles on either tier, `slice-reviewer` on the full tier, under
`review-checklist.md`'s `## Binding rules`.

A fail-to-pass run tests a `behavior` change at its tip, then again with its non-test files put back. Its outcome line is
a `fail-to-pass` trace line naming the range, the outcome (`fail-to-pass`, `pass-to-pass`, `unknown`), a reason, and the
command. It is no test run. A line whose reason reads `settled-from-trace` is a `fail-to-pass` outcome the verb wrote with
no run, because the trace already showed each test file fail before the change and pass after it (ADR 0251).

### The verdict

Get each range's mechanical verdict with one call:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" fail-to-pass-check <base>..<tip> --slice <id|scope> [--window <dispatch id>] --root <run-root>`.
`--window` names a full-tier slice's or a fix cycle's implementer dispatch, from `scope.js windows`; a `lite` slice passes none,
and its whole trace counts. The verb prints exactly one line:

| Verdict | Meaning | Your judgment |
|---|---|---|
| `fail-to-pass <range> <command>` | The latest deciding outcome line over the range shows its tests fail without the change. | **Command coverage** below. |
| `pass-to-pass <range> <command>` | The latest deciding outcome line shows the tests pass without the change. | **Command coverage**, then **Pass-to-pass**, and whether **Unclosable Pass-to-pass** applies. |
| `closed <range> <command>` | A later `fail-to-pass` line from the `pass-to-pass` line's base closes that finding. It stays closed. | **Command coverage** of the closing line. |
| `unknown <reason> …` | Only `unknown` lines cover the range (`### An unknown outcome`), or a gap: `no-trace` (the slice has no trace line), `no-change` (the range changes no file). | Name it in your report. It raises no finding. |
| `missing` | The range changes a test-path file, not only by deletion, and another file, and no outcome line covers it. | **Missing fail-to-pass run**. |
| `test-only` | The range changes only test-path files, and no outcome line covers it. | **Behaviour judgment**. |
| `no-test-change` | The range changes other files and no test-path file, or deletes test-path files only, and no outcome line covers it. | **Behaviour judgment**. |

An outcome line from the slice's base to a range's tip covers that range, so the verdict of a fix cycle's range reads the
implementer's run from the slice's base. A refusal names its reason: the report names the range the call could not read,
and the review raises no finding for it.

### The judgments you keep

- **Command coverage.** An outcome line counts only where its command, read against the repository's runner, runs every
  test file the range adds or modifies. A line that leaves one out is no outcome line: grade the range as `missing`, and
  the finding names the file. Doubtful coverage counts, and the report names the doubt. A line settled from the trace
  counts on the same terms.
- **Behaviour judgment.** `test-only` and `no-test-change` never read as "no finding". Read the range's changes outside
  the test paths. Where one adds behaviour, the range draws **Missing fail-to-pass run**, and its fix adds a test for that
  behaviour and runs the verb. Where none does, the range needs no outcome line.
- **Unclosable cases.** `### Unclosable Pass-to-pass` below.

### Findings

Both are Important, and apply to a `behavior` slice and to a fix cycle.

- **Pass-to-pass**: the verdict `pass-to-pass`, its command covering the range. A `fail-to-pass` run over a range from the
  original change's base to the current tip closes it, and the verdict then reads `closed`. A fix that only strengthens
  the test can close it.
- **Missing fail-to-pass run**: the verdict `missing`, a `fail-to-pass` or `pass-to-pass` verdict whose command leaves
  out a test file, or a `test-only` or `no-test-change` verdict whose changes add behaviour. The fix runs
  `scope.js fail-to-pass <base>..HEAD -- <command>` over the named range and closes it. For a slice with no recorded range
  the controller first records it from the scope branch's log (`scope.js slice <id> merged --range <base>..<tip> --root <run-root>`)
  and names it in the fix dispatch, as it names a cycle's range. A slice with no recorded range and no trace gets no
  finding; the report names the gap.

### Fix cycles

A fix cycle (`review-scope-mode.md`'s `### 4.7 Fix cycles`) is a change on either tier, its range from the scope tip
recorded before the fix dispatch to the tip once its report is accepted. Its trace line names `scope`.

- **`final-reviewer` reads every earlier cycle** at each dispatch, beside the current range the dispatch hands. List the
  cycles with `scope.js windows --slice scope`, and check each cycle's range with `--slice scope --window <dispatch id>`.
  Name a cycle's finding with its range.
- **A closing run is no cycle.** A `scope` line after a finding's `pass-to-pass` line, starting at that line's base,
  closes the finding or keeps it open, and raises no second finding.

### Full tier

`slice-reviewer` checks each range its dispatch names: the slice's, from its branch point to the tip the first review
read, and on a re-review the fix cycle's, from the earlier review's tip to the current one. A `missing` verdict's fix
dispatch names the slice's base.

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

A reviewer names every `unknown` verdict in its report with its slice and reason, raises no finding, and starts no fix
cycle. An `unknown` line covers a range, so the range draws no `missing` verdict, and only a `fail-to-pass` or
`pass-to-pass` line decides the verdict over it. The controller, not the reviewer, captures the observation `scope-findings.md`'s
`## Observations` owns.
