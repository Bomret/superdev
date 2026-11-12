# Review in scope mode: a moved base

Applies to a scope-mode `/superdev:review` when §4.1's **The moved base** check finds that the scope branch lacks the fetched base tip at a stage before `submitted`, or when a finding's remedy is merging the base. `${CLAUDE_PLUGIN_ROOT}/references/review-scope-mode.md` sends it here. `<run-root>`, `<branch>`, `<base>`, and `<range-base>` are the values `review-scope-mode.md` names, and a `§` number names that file's step.

## The base merge

**The merge.** Applies at a stage before `submitted` when the branch lacks the tip. Run the base step of §4.1's **The base** yourself, with every rule it names, resolving a conflict per `${CLAUDE_PLUGIN_ROOT}/references/merge-conflicts.md`. Then run §4.1's **The preparation** again, resolve `<range-base>` again with `scope.js base resolve`, and hand every later dispatch the range from that value. The exit run tests the merged tip, and no suite record from before the merge carries over.

- **A merge that resolved a conflict** → `final-reviewer` reviews the resolution before the exit run. The next re-review is a fresh whole-range dispatch per §2, never a warm resume. Before an exit run with no re-review due, dispatch one, handing the merge's range `<pre-merge-tip>..<merge-tip>` as full commits as its fix-cycle range. Its findings go through §4.6 and §4.7 as any re-review's do.
- **A merge with no conflict** → no re-review. The exit run verifies it.
- **Neither a base merge nor its re-review counts as a fix cycle** toward §4.7's cap.

## A finding answered by the base step

**The answered finding.** Applies to a finding whose remedy is merging the base, whatever its wording. The base step answers it. Remove it from the list of every fix dispatch, and name it in the report as answered by the base step.
