# 0155: A slice merge runs no test suite

**Status:** Accepted

**Amended by:** [ADR 0191](0191-the-full-suite-runs-once-after-review-comes-back-clean.md), under which the scope review's exit run, not run handoff, is the first full-suite verification of the integrated scope.

**Amended by:** [ADR 0178](0178-a-slice-review-runs-no-test.md), under which the controller runs a
failing test at the slice's base and the slice-reviewer names the inherited failure from that run.

**Supersedes:** [ADR 0123](0123-the-green-gate-gates-a-landed-merge-from-the-reflog.md),
[ADR 0047](0047-the-green-gate-resolves-the-tree-instead-of-capturing-a-c-argument.md).

**Amends:** [ADR 0033](0033-wide-refactors-run-expand-contract.md), whose integration branch was "where
the green-gate defers"; [ADR 0025](0025-the-scope-review-owns-the-full-suite-run.md), whose green-gate
caught a break at the merge; [ADR 0074](0074-the-focused-test-command-is-the-loops-cheap-command.md) and
[ADR 0085](0085-the-focused-test-command-is-required-configuration.md), whose focused command the
green-gate ran; and [ADR 0152](0152-a-red-base-gate-lets-the-operator-name-the-slices-that-fix-it.md),
whose named slice could be refused at merge; and, in their `green-gate.js` parts,
[ADR 0059](0059-the-selftest-suite-lives-outside-the-shipped-tree.md),
[ADR 0086](0086-a-duration-is-never-the-assertion.md),
[ADR 0087](0087-a-spawn-that-never-started-is-not-a-spawn-that-was-killed.md),
[ADR 0100](0100-the-bridge-retries-a-transient-spawn-failure-once.md),
[ADR 0135](0135-bash-hooks-read-shell-words-with-one-shared-scanner.md),
[ADR 0150](0150-shipped-code-starts-a-shell-only-for-an-operator-command.md),
[ADR 0045](0045-the-full-tier-runs-in-a-scope-scopetree.md),
[ADR 0127](0127-a-test-run-records-its-own-outcome.md),
[ADR 0134](0134-a-fail-to-pass-run-shows-a-change-s-tests-discriminate.md),
[ADR 0102](0102-superdev-is-a-claude-code-only-plugin.md),
[ADR 0002](0002-metrics-are-proxies.md),
[ADR 0066](0066-a-measured-test-audit-is-its-own-surface.md), and
[ADR 0001](0001-lite-scope-scopetree.md).

## Context

`hooks/green-gate.js` ran a suite after every merge the main session landed. That covered a full-tier
slice merge into the scope branch, a base merge at the start of `/superdev:implement` and in
`/superdev:ship`, the merge of a wide refactor's integration branch, and any merge or pull outside a scope
run in a repository with `docs/agents/verification.md`. A red suite exited 2, so the controller fixed or
reverted before it continued.

On a full-tier slice merge that run was the third run of the slice's tests. The implementer runs them in its
slicetree, and the slice-reviewer runs them again independently. It ran serially on the controller's
critical path and held the next merge until it ended. The run handoff then runs the full suite once over the
integrated scope, with its own fix loop (ADR 0091), and `/superdev:review` reuses that record or runs the
full suite itself (ADR 0025, ADR 0075). On a base merge the gate ran the focused command, and the base step's
prose then ran the full command anyway, unless the two fences were textually identical.

The hook was 775 lines, with a 2052-line suite, two open triage records (#1137, #1128) about its process
bounds, and open work in three other plans that split, bounded, or de-seamed it.

## Decision

**No hook runs a test suite on a merge.** `hooks/green-gate.js`, its `hooks.json` entries, and its suite are
deleted.

- A full-tier slice merge runs no suite. The slice's own runs, by the implementer and the slice-reviewer,
  verify the slice. The run handoff's full run is the first verification of the integrated scope, and its
  fix loop repairs a break between two slices that each passed alone.
- Every base merge runs the suite itself, through `scope.js test full`, and records the result with
  `suite set`: the base step of `/superdev:implement` and `/superdev:ship` §4, where the whole-repo command
  replaces the full one when ship's own rule selects it. No step takes another process's run as that result.
- An implementer or slice-reviewer that meets a failing test its own slice did not cause names it in its
  report, neither fixes it nor blocks the slice on it, and leaves it to the run handoff's fix loop.
- A resumed run whose scope branch is red stops at the base step, as a red base does.
- A wide refactor keeps its integration branch. The branch keeps the scope branch green between
  invocations, so a resumed run passes the base step while batches that cannot stay green alone are in
  flight. The merge of the integration branch into the scope branch runs no suite. The run handoff's full
  run verifies it.
- A merge or pull outside a scope run runs no suite either. That protection is the adopter's own workflow.

## Considered options

- **Keep the hook and skip slice merges.** It would fire only on base merges and the integrate merge, where
  the prose already runs the full suite. It kept the hook, its suite, and the sibling work alive to duplicate
  a run the prose makes anyway.
- **Keep the hook behind an opt-out setting.** It added a setting and kept all of the maintenance cost.
- **Run the focused command once per wave of parallel merges.** It still held the controller on a test run
  between waves, and the run handoff covers the same breaks one step later.
- **Let a resumed red run dispatch on and defer the red to the run handoff.** The base step would have to
  tell a red from the base apart from a red from the scope's own slices. A resumed red scope branch needs
  both a cross-slice break and an interrupted run, and the base step's existing stop covers it.
- **Keep the hook for merges outside a scope run.** superdev's guarantees live in its chain, and the hook's
  cost stayed the same for that one remaining case.

## Consequences

- A break between two parallel slices surfaces at the run handoff instead of at the second merge. Slices
  dispatched after the break inherit the failing test, and their agents report it instead of fixing it.
- A full-tier run makes one fewer suite run per slice merge, and a base merge with distinct fences makes one
  fewer run.
- No hook runs a suite. `scope.js suite reusable` therefore reads only run lines for runs an agent made: those
  `scope.js test` recorded, and those the run trace recorded for a test command it classified.
- Text an adopter's earlier `/superdev:setup` run wrote ("arms the merge green-gate") is read by nothing. A
  later setup re-run offers the updated seed as a seed gap.
