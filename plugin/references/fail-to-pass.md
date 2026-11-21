# Fail-to-pass run — the reviewer's grading rules

How a reviewer grades a fail-to-pass run. `implementer.md`'s `### Fail-to-pass run` states what the implementer runs.

## Fail-to-pass run

**Who grades.** Applies to every review that reads a fail-to-pass run. `final-reviewer` grades it on a `lite` scope
(an `unknown` tier reads as `lite`, INV-0056) and on fix cycles on either tier, and `slice-reviewer` on the full tier.
`review-checklist.md`'s `## Binding rules` bind the grading.

**The outcome line.** Applies to every `fail-to-pass` trace line. A fail-to-pass run tests a `behavior` change twice: at
its tip, and with its non-test files put back. Its outcome line names the range, the outcome (`fail-to-pass`,
`pass-to-pass`, `unknown`), a reason, and the command. It is no test run.

- **A reason reading `settled-from-trace`** → a `fail-to-pass` outcome the verb wrote with no run, from a trace that
  already showed each test file fail before the change and pass after it (ADR 0251).

### The verdict

**One call per range.** Applies to every range under review. Get its mechanical verdict with one call:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" fail-to-pass-check <base>..<tip> --slice <id|scope> [--window <dispatch id>] --root <run-root>`.
The verb prints exactly one line:

| Verdict | Meaning | Your judgment |
|---|---|---|
| `fail-to-pass <range> <command>` | The latest deciding outcome line over the range shows its tests fail without the change. | **Command coverage**. |
| `pass-to-pass <range> <command>` | The latest deciding outcome line shows the tests pass without the change. | **Command coverage**, then **Pass-to-pass**, and whether **Unclosable Pass-to-pass** applies. |
| `closed <range> <command>` | A later `fail-to-pass` line from the `pass-to-pass` line's base closes that finding, in a later window too where you pass `--window`. It stays closed. | **Command coverage** of the closing line. |
| `unknown <reason> …` | Only `unknown` lines cover the range (`### An unknown outcome`), or a gap: `no-trace` (the slice has no trace line), `no-change` (the range changes no file). | Name it in your report. It raises no finding. |
| `missing` | The range changes a test-path file, not only by deletion, and another file, and no outcome line covers it. | **Missing fail-to-pass run**. |
| `test-only` | The range changes only test-path files, and no outcome line covers it. | **Behaviour judgment**. |
| `no-test-change` | The range changes other files and no test-path file, or deletes test-path files only, and no outcome line covers it. | **Behaviour judgment**. |

- **`--window`** → names a full-tier slice's or a fix cycle's implementer dispatch, from `scope.js windows`.
- **A `lite` slice** → passes no `--window`, and its whole trace counts.

**Coverage from the base.** Applies to an outcome line from the slice's base to a range's tip. It covers that range,
so the verdict of a fix cycle's range reads the implementer's run from the slice's base.

**A refusal.** Applies to a call that refuses. The report names the range the call could not read, and the review
raises no finding for it.

### The judgments you keep

**The judgments.** Applies to every verdict the table sends to a judgment.

- **Command coverage.** An outcome line counts only where its command, read against the repository's runner, runs every
  test file the range adds or modifies. A line that leaves one out is no outcome line: grade the range as `missing`, and
  the finding names the file. Doubtful coverage counts, and the report names the doubt. A line settled from the trace
  counts on the same terms.
- **Behaviour judgment.** `test-only` and `no-test-change` never read as "no finding". Read the range's changes outside
  the test paths. Where one adds behaviour, the range draws **Missing fail-to-pass run**, and its fix adds a test for that
  behaviour and runs the verb. Where none does, the range needs no outcome line.
- **Unclosable cases.** `### Unclosable Pass-to-pass`.

### Findings

**The two findings.** Applies to a `behavior` slice and to a fix cycle. Both findings are Important.

- **Pass-to-pass**: the verdict `pass-to-pass`, its command covering the range. A `fail-to-pass` run over a range from the
  original change's base to the current tip closes it, and the verdict then reads `closed`. A fix that only strengthens
  the test can close it.
- **Missing fail-to-pass run**: the verdict `missing`, a `fail-to-pass` or `pass-to-pass` verdict whose command leaves
  out a test file, or a `test-only` or `no-test-change` verdict whose changes add behaviour. The fix runs
  `scope.js fail-to-pass <base>..HEAD -- <command>` over the named range and closes it.
  - **A slice with no recorded range** → the controller first records it from the scope branch's log (`scope.js slice
    <id> merged --range <base>..<tip> --root <run-root>`) and names it in the fix dispatch, as it names a cycle's range.
  - **A slice with no recorded range and no trace** → no finding; the report names the gap.

### Fix cycles

**A fix cycle's range.** Applies to every fix cycle (`review-scope-mode.md`'s `### 4.7 Fix cycles`), on either tier.
Its range runs from the scope tip recorded before the fix dispatch to the tip once its report is accepted. Its trace
line names `scope`.

- **`final-reviewer` reads every earlier cycle** at each dispatch, beside the current range the dispatch hands. List the
  cycles with `scope.js windows --slice scope`, and check each cycle's range with `--slice scope --window <dispatch id>`.
  Name a cycle's finding with its range.
- **A closing run is no cycle.** A `scope` line after a finding's `pass-to-pass` line, starting at that line's base,
  closes the finding or keeps it open, and raises no second finding.

### Full tier

**The ranges.** Applies to `slice-reviewer`. It checks each range its dispatch names: the slice's, from its branch point to the tip the first review
read, and on a re-review the fix cycle's, from the earlier review's tip to the current one. A `missing` verdict's fix
dispatch names the slice's base.

### Unclosable Pass-to-pass

**The closed cases.** Applies to a Pass-to-pass finding no fix can close. It is unclosable in exactly these three
cases, a closed list:

- **(a)** The behaviour change lies wholly in test-path files. Any file changed outside them that the outcome line's
  command reads carries behaviour and rules the case out; prose or docs the command never reads carry none.
- **(b)** A test pins existing behaviour on purpose. The reason names that behaviour and why the range leaves it
  unchanged. New behaviour no test detects is not (b).
- **(c)** The changes outside the test paths only restructure or remove code, a refactor or a cut with its tests. The
  reason names, per file, what changed and why no behaviour did. A file that adds behaviour rules the case out.

**The mark.** Applies to the reviewer that raises such a finding. Mark it `unclosable (<a|b|c>): <reason>`, exactly
one case, and (c) whenever the non-test changes only restructure or remove. It stays Important.

- **Every dispatch** → re-judge the mark against the current range, earlier cycles included. A later change adding
  behaviour outside the test paths makes it closable.
- **A re-review of the latest cycle's range** (the warm re-review with its reach, the Minor sweep's) → restate each
  unclosable finding the last verdict listed, mark re-judged (`scope-findings.md`'s `## Warm cycles`).
- **An implementer's or the lite controller's claimed case** is input to check, never a verdict.
- **A Missing fail-to-pass run finding** never carries the mark.

### The fix cap

**The cap and its escape.** Applies to Pass-to-pass and Missing fail-to-pass run findings. Both take the 3-cycle fix
cap and its escape: a scope or slice whose only remaining Critical or Important findings are of these two kinds
proceeds at the cap, the report naming each with its slice. Either kind beside a Critical or Important finding of
another kind blocks at the cap.

- **An unclosable finding** → takes the escape at once and never enters a fix list.

### An `unknown` outcome

**What it records.** Applies to every `unknown` line. It records a run that could not judge. Its `control=`, `bound=`,
`start-failed:<code>`, and `prepare=` fields name which of these cases it was:

- the tests failed against the changed code;
- a run outlasted its bound or ended by a signal;
- a command could not start;
- a prepare command failed.

**The reviewer's part.** Applies to every `unknown` verdict. Name it in your report with its slice and reason, raise
no finding, and start no fix cycle.

- An `unknown` line covers a range, so the range draws no `missing` verdict.
- Only a `fail-to-pass` or `pass-to-pass` line decides the verdict over the range.
- The controller captures the observation `scope-findings.md`'s `## Observations` owns.

