# 0152: A red base gate lets the operator name the slices that fix it

**Status:** Accepted

**Amends:** [ADR 0120](0120-implement-brings-the-remote-base-into-the-scope-branch-before-the-first-slice.md),
whose full-suite gate dispatched no slice until the record was green.

**Context.** Every `/superdev:implement` invocation brings the base into the scope branch and gates the
first slice on the full suite (ADR 0120). A red record dispatches no slice, and each later invocation runs
the suite again until the record is green. When a slice of the same scope is the fix for that red, nothing
turns the record green: the slice that fixes it never runs. This happened on `feat/windows-git-bash`. The
base was red only on `tests/shell-words.test.js`, the scope's slice #1118 was that fix, and the operator
dispatched it as a named one-off deviation from the rule (triage #1126). A scope whose every slice is
merged meets the same dead end: the gate stops before run handoff, whose full-suite fix loop exists for a
red suite.

**Decision.**

- **An attended run that finds a `red` record asks the operator which slices fix it.** The question names
  the result and offers every slice not yet merged, `todo`, `in-progress`, or `blocked`, as a multi-select
  choice, plus stopping.
- **Only the named slices, and the unmerged slices they depend on, run while the record is red.** A named
  or needed `blocked` slice reopens. A named `in-progress` slice resumes. Both tiers honour the pick: the
  full tier under its concurrency cap, the lite tier before any other slice.
- **The suite runs again once the pick has ended.** The pick has ended when every named slice and needed
  dependency is merged or blocked, or cannot start because a dependency it needs is blocked. The result
  is recorded for the new tip. A green record resumes the ordinary dispatch. A red record asks again.
- **The pick is never stored.** Every invocation that finds the record red asks again.
- **The question reads its answer strictly.** Stop picked together with slices, or an answer that names no
  slice, reads as Stop. An id given through Other that names no unmerged slice is named back, and the
  question is asked again.
- **A lite run that skips the base step for an `in-progress` slice still gates a red record.** The run
  takes the gate once that slice ends, before any other slice starts.
- **A scope with every slice merged goes on to run handoff** when the record is red, and its fix loop
  repairs the red.
- **A `denied` or `none` record still stops.** No slice can fix a denied run or a run that carries no
  verdict (INV-0009).
- **An unattended run still blocks**, and the block names the attended command that offers the pick.

**Consequences.** A scope that plans the fix for its own red base runs without a deviation from the rule.
The operator answers one question per invocation while the record is red. An unattended run gains
nothing: it blocks as before. The lite tier still skips the base step while a slice is in progress. When
the record is red, it takes the gate once that slice ends. A red that arrives after the base step is
outside this gate.

The pick does not lift the merge gate. A named slice, or a dependency it needs, whose focused tests
include the still-red tests can be refused at merge. The implementer's last run over the slice's whole
changed-path set fails, and `hooks/green-gate.js` runs the focused command after the merge and requires
the controller to fix or revert it. A slice that fixes only part of
the red meets the same refusal. A red that spans several slices can therefore block each of them.

**Considered options.**

- *Mark the fixing slice at plan time with a slice field.* Rejected: it adds a field to the slice schema
  and to every store seed, and it covers only a red the plan knew about. A base that turns red after
  planning still needs a pick at the gate.
- *Match the failing tests to slices automatically.* Rejected: a slice `spec` names interfaces and never
  file paths, so nothing maps a failing test to the slice that owns it.
- *Record the pick in the ledger.* Rejected: it needs a `scope.js` verb, a ledger header, and a change to
  the ledger reader in `mods/superdev-view`. A second question on a resumed run costs less.
- *Keep the stop when every slice is merged.* Rejected: it leaves the same dead end in its boundary form,
  where run handoff's fix loop is the step built for a red suite.
