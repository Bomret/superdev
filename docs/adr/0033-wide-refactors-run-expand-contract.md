# 0033: Wide refactors run expand–contract, with green deferred to an integration branch when batches cannot hold it

**Status:** Accepted

**Amended by:** [ADR 0155](0155-a-slice-merge-runs-no-test-suite.md), under which no merge runs a suite: the
integration branch keeps the scope branch green between invocations, and the run handoff's full run
verifies the integrate merge.

**Context.** The plan contract requires every slice to be independently green, and `hooks/green-gate.js`
enforces it on every controller merge. A wide refactor is one mechanical change whose blast radius fans
across the codebase (rename a column, retype a shared symbol), and it cannot satisfy that. No narrow
tracer-bullet path through every layer exists, and nothing in the plugin said what a planner should do
instead.

**Decision.** A wide refactor is sequenced as **expand–contract** (`references/plan-contract.md`,
*Wide refactors*): expand adds the new form beside the old, migrate batches move call sites over sized
by blast radius, and contract deletes the old form once no caller remains. Each is its own slice, each green,
so the ordinary rules and gates hold. When even the batches cannot stay green alone, the epic carries an
`## Integration branch` section naming `integration/<scope>`: the full playbook merges every slice into
that branch instead of the scope branch, and the plan's final **integrate-and-verify** slice, which depends
on every batch, is where `integration/<scope>` merges into the scope branch. Green is promised at that
one node. `hooks/green-gate.js` implements the deferral deterministically: a merge whose checkout is on
an `integration/*` branch is not gated, and the merge into the scope branch is gated, as every merge is.

**Why.** Splitting one mechanical change into fake independently-green slices forces the planner to lie
to the contract, and a single monster slice defeats review and resumability. Expand–contract keeps
almost every wide refactor inside the existing invariant. The integration branch is the escape hatch for
the rest, and putting its recognition in the branch name keeps the hook zero-state and deterministic,
with no ledger read and no plan field.

**Consequences.** `merge-guard.js` is untouched: subagents still never integrate, whichever branch the
controller merges into. A red intermediate merge on an integration branch surfaces at the
integrate-and-verify slice rather than immediately. The deferral is the point, and the final gate is
what makes it safe.
