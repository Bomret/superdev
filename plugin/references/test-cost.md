# Test cost — the test audit's cost lenses

## Test cost

**Its reader.** Applies to `test-auditor` alone. It judges these lenses against a **measured duration** over a whole
test tree. `review-checklist.md`'s `## Binding rules` bind every lens of this section.

**The cost lenses.** Applies to every test in the audited tree. Flag each smell the test shows, named as listed.

- **Dead test** — a test whose subject is gone, or which the runner skips: an `@Ignore`, a `skip`, a
  `.only` elsewhere that mutes it, or an assertion against a symbol no production code defines any more.
  Name the subject it lost, and the lighter form: deletion, or the condition under which it runs again.
- **Expensive test** — a test whose measured duration is out of proportion to what it proves, where no
  lighter fixture explains the cost: a multi-second sleep, a container or a live network call standing
  behind one assertion, a loop running thousands of cases to prove one branch. Name the duration and the
  lighter form. A slow test is no smell where the slow thing is itself the behaviour under test.
