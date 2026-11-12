# 0139: A test-first step runs the tests it works on

**Status:** Accepted

**Amended by:** [ADR 0177](0177-an-implementer-runs-only-the-tests-that-verify-its-work.md), which keeps
every loop run to the tests that verify the work and leaves the full command to the controller's gates.

**Amended by:** [ADR 0180](0180-a-loop-step-runs-its-test-file-where-the-focused-command-repeats-the-full-one.md), which runs each step's test file
through `test --` where the focused command repeats the full one, and drops the last whole-set run there.

**Amended by:** [ADR 0232](0232-the-loop-runs-test-files-and-the-focused-command-once.md), which runs each step's test files
through `test path` and the focused command once, over the whole changed-path set.

**Context.** The implementer's test-first loop, and the lite tier's inline loop, run the focused command
over the slice base against the working tree, every path the slice changed so far. In this repository a
change to `plugin/scripts/scope.js` selects every suite that names or requires it, and `run-tests.js` runs
them one after another. In the fail-to-pass-run scope, slice 01's implementer ran the `scope` suite
directly 40 times, at 62 to 110 seconds per run, to keep its failing and passing steps short.

**Decision.** A failing-test step or a passing-test step runs the focused command over the test files that
hold the tests the step works on. The implementer's last run before it reports covers the slice's whole
changed-path set, and so does the lite tier's last run before it commits a slice. A step that works on no
test file runs over the whole changed-path set. A focused command that takes no paths runs unchanged.

ADR 0074 rejected filtering the changed-path set down to its test paths, because superdev would have to
classify a path as a test in every ecosystem. This decision needs no classifier: the implementer names the
test file it is working on.

**Considered options.**

- Keep the whole changed-path set for every step. It loses on cost: each step pays for every suite the
  slice's source files reach.
- Run the selected suites in parallel inside `run-tests.js`. It helps only this repository, and the added
  contention reaches the timing-bounded cases whose bound comes from the same run (ADR 0086).

**Consequences.** A step can pass while a suite it never ran is broken. The last run before the report
finds it. The run trace still records every step's run, so the test-order check reads the same lines.
