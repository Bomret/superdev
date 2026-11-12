# Review in scope mode: coverage findings

Applies to a scope-mode `/superdev:review` whose chosen fix set holds an **Unreviewed slice** or a **Missing fail-to-pass run** finding. `${CLAUDE_PLUGIN_ROOT}/references/review-scope-mode.md`'s §4.6 sends it here. `<run-root>` is the value `review-scope-mode.md` names, and a `§` number names that file's step.

## An Unreviewed slice finding

**The slice reviewer.** Applies to an **Unreviewed slice** finding in the chosen set, which only a merged `behavior` slice reaches: a merged `mechanical` or `docs` slice, or one whose type cannot be read, draws no such finding and no `slice-reviewer` dispatch (`review-coverage.md`'s `## Review coverage`). Answer it yourself, with no implementer cycle. This dispatch departs from the skill's exclusion of `slice-reviewer`.

- Dispatch `superdev:slice-reviewer` with an explicit `model`, handing it the slice's `spec`, `acceptance`, range, and progress-log path `<run-root>/reports/<id>/progress.md`, and tell it to run no test and read the slice's recorded runs from the run trace.
- Before the dispatch, append the line `dispatch: slice-reviewer` to that progress log.
- Tell it the report contract of `slice-reviewer.md`'s `## Report`: it appends its full findings, with their remedies, to that progress log under the heading `Review — post-merge` and returns the summary that section lists, every item of it and no remedy.
- Read its entry under that heading below that line for any step that needs more than the summary. A review whose entry there is missing goes back to that same reviewer through SendMessage to append it before you act on the verdict.
- The progress log is input for it to check against the code, not a verdict to adopt.
- Leave the finding off the **Confirmed** list, dispatching no implementer when no finding remains on it. The run trace records that dispatch on the slice, which closes the finding at the re-review.

## A Missing fail-to-pass run finding

**The range.** Applies to a **Missing fail-to-pass run** finding in the chosen set. It joins the **Confirmed** fix of §4.7, whose implementer runs the verb over the finding's range. A slice whose ledger row records no range first has its range recorded: read the slice's commits from the scope branch's log, run `scope.js slice <id> merged --range <base>..<tip> --root <run-root>`, and name that range in the fix dispatch.
