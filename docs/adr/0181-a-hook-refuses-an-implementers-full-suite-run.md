# 0181: A hook refuses an implementer's full-suite run

**Status:** Superseded

**Superseded by:** [ADR 0225](0225-guardrails-read-no-shell-words.md), which removes test-guard: an implementer's full-suite run is a review finding.

## Context

[ADR 0177](0177-an-implementer-runs-only-the-tests-that-verify-its-work.md) keeps a dispatched implementer's runs to the
tests that verify its work and gives every full-suite run to the controller. It states the bound in prose and leaves
enforcement to a later decision. An implementer that starts the full command anyway costs the run that suite's duration:
about 6 minutes in this repository. [ADR 0180](0180-a-loop-step-runs-its-test-file-where-the-focused-command-repeats-the-full-one.md)
adds a case: where the focused fence repeats the full fence, `scope.js test focused <paths>` runs the whole suite.

`tree-guard` already tells a dispatched implementer's call from the controller's by `agent_type` (ADR 0148).
`lib/test-runs.js` already finds every `scope.js test` call in a Bash command and classifies a direct run against the
configured full, focused, and whole-repo commands, for the run trace (ADR 0117).

## Decision

1. **`hooks/test-guard.js`, a PreToolUse hook on Bash, refuses a dispatched implementer's full-suite run.** It refuses
   `scope.js test full`, `scope.js test whole`, a `scope.js test focused` with no path, and the configured full or
   whole-repo command run directly or through `scope.js test --`. Where the focused fence repeats the full fence, it also
   refuses a `scope.js test focused` with paths. The refusal names the run to make instead.
2. **The guard judges only a call inside a run tree.** It reads the verification commands of the slicetree or scopetree
   the call runs in, through `lib/test-runs.js` and `lib/verification.js`.
3. **The guard fails open**, as `tree-guard` does. A call it cannot judge passes: unreadable input, a library that will not
   load, and a call outside every run tree. This makes it the second exception to INV-0140, beside run-trace.

## Considered options

- **Fail closed, as the other Bash guardrails do (INV-0140).** A scanner that will not load would then stop every test run
  an implementer makes, including the ones ADR 0177 asks for. A missed refusal costs one suite run and changes no file.
- **Refuse only the `scope.js test` verbs.** An implementer could then run the full command directly, the way the incident
  behind ADR 0177 could have gone.
- **Extend `tree-guard`.** `tree-guard` guards the file tools and places a write target. This guard reads a Bash command
  and a verification file, so it shares nothing with `tree-guard` but the `agent_type` test.

## Consequences

A dispatched implementer cannot start the full or the whole-repo suite through the shapes above. A full-suite run spelled in
a shape the scanner does not classify, such as a shell function or a script that wraps the full command, still passes.
