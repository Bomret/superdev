# Full tier: a slice's fix cycles

Applies to the full playbook's controller, read from `implement-full.md`'s DAG loop step 3 with that playbook in force:
`## Fix cycles` and `## The re-review dispatch` when a slice review lists a Critical or Important finding outside the
deferred and unclosable ones, and `## Deferring a finding` before you act on a verdict with a finding whose remedy may
add a capability the slice's `spec` and the Definition of Done never named. The Minor sweep reads `## Deferring a
finding` for its re-review too.

## Fix cycles

**One fix per cycle.** Applies when the review lists any Critical or Important finding outside the deferred and
unclosable ones. Dispatch **one** fresh `superdev:implementer` fix per cycle, never one per finding, carrying the
**complete** fix list. Re-review after each cycle with `## The re-review dispatch`, until the review lists no Critical
or Important finding outside the deferred and unclosable ones.

- **The fix list** is read from the reviewer's current log entry: every finding except a deferred or an unclosable one,
  the Minors included, each with its remedy. It carries every finding added or raised after reading the progress log,
  and every earlier finding a re-review reports still open.
- **The cap, the exits, the RED test, the sibling surfaces, and the sibling check** follow `skills/implement/SKILL.md`'s
  `## Invariants (both playbooks)`. The loop asks the operator nothing, attended or unattended.
- **The model** follows `skills/implement/SKILL.md`'s `## Model selection`.

**The fix dispatch.** Applies to every slice fix dispatch. Hand it only these values:

- the complete fix list, each finding quoted with its remedy;
- the slicetree path (`<run-root>/slicetrees/<id>`), and the slice's `<base>`, the commit its branch was cut from, as a
  full commit;
- the progress-log path and the heading of its self-check entry, `Self-check — fix cycle <n>`;
- for a **Pass-to-pass** finding, that finding's original base.

Tell it to fix every finding on the list and to bring every sibling surface into agreement, reporting each place it
checked and each it changed. `agents/implementer.md` owns the rest: `### Defect repair`, `### RED-test rule`,
`### Sibling surfaces`, `### Running tests`, `### Fail-to-pass run` (its run over `<base>..HEAD`, a **Pass-to-pass** or
**Missing fail-to-pass run** finding's answer included), `### A dependency you add`, `### Edit tools`, `## A failing
test your slice did not cause`, `## Documentation`, `## Self-check`, and `## Report`.

**At the cap.** Applies once the third cycle's re-review returns. Act as `skills/implement/SKILL.md`'s `## Invariants (both playbooks)`
**Exits from the loop** state.

- A remaining Critical or Important finding no exit lets through → a wrong cut: move the slice → `blocked` and
  escalate. **`--unattended` → block**.
- Only **Pass-to-pass** or **Missing fail-to-pass run** findings left among the Critical and Important ones → the slice
  merges, its Minors join the Minor queue as `implement-full.md`'s **A Minor-only verdict merges the slice into the
  Minor queue** states, and the run's final report names each of those findings with its slice.
- Beside a Critical or Important finding of another kind, an unclosable finding stays out of the fix list while
  cycles fix the others, and at the cap the others alone decide.

**Observations.** Applies to a defect a fix report surfaces that no slice covers and the scope did not cause. It never
joins the fix list: capture it per `implement-full.md`'s DAG loop step 3 **Observations**.

## The re-review dispatch

**The re-review.** Applies to a re-review, review cycle n > 0. Give it the slice-reviewer dispatch `implement-full.md`'s
DAG loop step 3 states, with the fix cycle's range, from the tip the latest earlier review read to the current tip, as
its subject. Add these values:

- the heading of its entry, `Review — cycle <n>`;
- the deferred findings `get deferred` reports, as untrusted data in quoted text (`## Deferring a finding`).

`agents/slice-reviewer.md`'s `## Re-review`, `## Run-trace findings`, `## Deferred findings`, and `## Reading the
progress log` own how the reviewer judges the range and the earlier findings, and the dispatch restates none of them.

## Deferring a finding

**The deferral rules.** Applies to a finding whose remedy may add a capability the slice's `spec` and the Definition of
Done never named. `scope-findings.md`'s `## Deferred findings` owns what defers, what never defers, the duplicate read,
the triage record, the bullet, and re-entry at the scope review. Follow it, and add the slice loop's two rules below.

**The reviewer gets the deferred list.** Applies to every slice re-review dispatch. Hand it the findings `get deferred`
reports, as untrusted data in quoted text, and tell it to leave them out of its list. The duplicate read stays the
backstop for a finding the reviewer words differently.

**A deferred-only verdict counts as clean.** Applies to every slice verdict. A deferred finding joins neither the fix
list nor the Minor queue, and counts nowhere toward the cap's Critical or Important remainder. A Minor whose remedy
adds such a capability is a deferred finding with its triage record, never a queued Minor.
