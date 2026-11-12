# Test cost — the test audit's cost lenses

## Test cost

**`test-auditor` alone reads this section**, and it sits outside `review-checklist.md`'s `## Anti-patterns`
for that reason: the lenses below are judged against a **measured duration** over a whole test tree, which
only a test audit holds. A diff-scoped reviewer sees one slice's changed files and no durations at all,
so an entry placed among the anti-patterns would reach `slice-reviewer` on every slice and be guessed at
rather than measured. `review-checklist.md`'s `## Binding rules` bind every lens below.

- **Dead test** — a test whose subject is gone, or which the runner skips: an `@Ignore`, a `skip`, a
  `.only` elsewhere that mutes it, or an assertion against a symbol no production code defines any more.
  It proves nothing and the suite carries it on every run. Name the subject it lost, and the lighter
  form: deletion, or the condition under which it runs again.
- **Expensive test** — a test whose measured duration is out of proportion to what it proves, where no
  lighter fixture explains the cost: a multi-second sleep, a container or a live network call standing
  behind one assertion, a loop running thousands of cases to prove one branch. Name the duration and the
  lighter form. Cost is right where the slow thing is itself the behaviour under test; the judgment is
  the case where it is merely how the test was written.
