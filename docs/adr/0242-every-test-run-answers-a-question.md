# 0242: Every test run answers a question

**Status:** Accepted

**Amends:** [ADR 0234](0234-test-runs-overlap-and-skip-repeated-preparation.md): the implementer's last passing-test
step runs after the last commit and is the fail-to-pass control, in place of a separate control run.

## Context

Tests cost time, and a model reruns them by reflex. In one session the maintainer's agents ran the 90-second full
suite after every prose-only batch, reran suites that had passed, and ran four full suites in parallel, which loaded
the machine enough to make timing tests fail. superdev's own prose had the same pattern in one place: the implementer
made its last passing-test step on an uncommitted tree, committed, and then ran the same test files again at the
committed tip only so `scope.js fail-to-pass` could reuse that run as its control.

## Decision

1. **Every run answers a question.** `references/test-selection.md`'s `## Every run answers a question` names the
   questions a run in the chain answers: a failing-test step, a passing-test step, the focused run, the fail-to-pass
   run, and a gate's run. A run that answers none of them is not made, and each run is the smallest that answers its
   question. The implementer's `### Running tests` cites the section.
2. **The last passing-test step is the control.** The implementer commits its last increment first and then makes
   the passing-test step at the committed tip, from the tree root, with the command it passes to the verb. One run
   serves both purposes.
3. **The maintainer rule.** `AGENTS.md` holds the same rule for work on this repository: a stated reason for every
   run, the smallest run, and at most one full run per branch, before its pull request.

## Consequences

An implementer's slice makes one fewer run of its test files. A drift check cannot test a run's reason, so the rule
binds through the prose that dispatches and runs the tests.
