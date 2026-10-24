# 0177: An implementer runs only the tests that verify its work

**Status:** Accepted

**Amends:** [ADR 0139](0139-a-test-first-step-runs-the-tests-it-works-on.md), which states which paths a
test-first step passes and leaves the full command open to the loop.

**Amended by:** [ADR 0180](0180-a-loop-step-runs-its-test-file-where-the-focused-command-repeats-the-full-one.md), which runs each step's test file
through `test --` where the focused command repeats the full one.

## Context

In the `fewer-suite-runs` scope, a `/superdev:review` fix cycle dispatched a `superdev:implementer` whose
dispatch said to run every test through `scope.js test focused <paths>` "(or `test full`)". The implementer
started `scope.js test full`, about 6 minutes in this repository, and the controller stopped it. The
implementer body stated no limit, and the dispatch prose named the full command as a choice.

The shipped flows already give every full-suite run to the controller: the base step's suite gate, run
handoff, the scope review's entry and exit gates, submit-pr, and ship. Fix cycles run the focused command.
In its red-green loop, an implementer knows which tests verify its work: the test files each step works on,
and the suites its changed paths reach.

## Decision

1. **An implementer runs only the tests that verify its work.** Each run is `scope.js test focused <paths>`
   with at least one path, or `scope.js test -- <command>` for one test file.
2. **The controller owns every full-suite run.** `test full`, `test whole`, and a `test focused` with no
   path, which runs the full command, belong to the controller's gates. The lite tier's inline loop follows
   the same bound, and its suite gates stay with the controller.
3. **Every dispatch that reaches an implementer states the same bound.** Dispatch prose wins a conflict with
   the agent body (ADR 0035), so a dispatch that names the full command as a choice reopens it.

## Considered options

- **State the bound in the implementer body alone.** It loses to ADR 0035: the dispatch that caused the
  full run stays the later, more specific instruction.
- **Let a hook deny `test full` to a dispatched implementer.** `tree-guard` already tells a dispatched
  implementer's call from the controller's (ADR 0148), so a hook could enforce the bound. This decision
  states the contract in prose and leaves enforcement to a later decision.

## Consequences

An implementer's report covers only the suites its changed paths reach. A failure in a suite no changed
path reaches surfaces at the controller's next full-suite gate.
