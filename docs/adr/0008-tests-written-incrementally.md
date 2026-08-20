# 0008: Tests are written incrementally against real code, never in bulk up front

**Status:** Accepted

**Context.** A recurring proposal for `/superdev:implement` is to split authorship: one agent writes a
slice's whole test suite first, a second agent then implements against it. The appeal is incentive
independence: an implementer that authors its own tests wants them green, and a separate author has no
such pull.

The mechanism does not survive contact with the loop. Tests authored before any implementation are **all
red**, so their author has no signal separating "test correct, code missing" from "test wrong." The
red-to-green cycle is what supplies that signal: a test goes green exactly when its behaviour arrives, and a
test that stays red or goes green wrongly is caught at the increment that produced it. Handing an
implementer a bulk-authored suite inverts the relationship: the implementer's job becomes satisfying the
tests, so a wrong test is contorted into working code rather than rejected. A wrong test that shapes the
implementation is worse than no test.

**Decision.** Slices are built in vertical tracer-bullet increments: one RED test, minimal GREEN code,
repeat. No agent authors a slice's tests ahead of its implementation.

The incentive-independence concern is real and is addressed without splitting authorship:

- **Named test smells in the shared review checklist.** The tautological-test and happy-path-only-suite
  anti-patterns in `references/review-checklist.md`, applied by `slice-reviewer` and `final-reviewer`
  alike, so both execution tiers get an independent read of test quality (ADR 0002: no agent verifies its
  own passing bar).
- **Coverage decided before implementation, by a different author.** `/superdev:plan` enumerates a
  behavior slice's domain-level failure and boundary cases into its `acceptance`, and the TDD loop walks
  every acceptance criterion. The planner fixes the *what to cover* up front. Only the *test text*
  is written incrementally.

**Consequences.** `agents/implementer.md` and `references/implement-lite.md` keep the one-test-at-a-time
rule, and neither may be relaxed into batch test authoring without revisiting this record. Test quality
is a review concern, not an authorship-separation concern. The planner owns domain-level edge enumeration
(cases derivable from the interview). Implementation-level edges stay with the implementer and reviewers,
who see the code. The planner never does.
