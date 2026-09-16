# 0063: Test cost is a review lens

**Status:** Accepted

**Context.** Every rule in the implement chain adds tests, and none prices them. `implementer.md` runs
the TDD loop and demands an increment per acceptance criterion. `slice-reviewer.md`'s second lens
adversarially names an input the fixtures miss. `review-checklist.md` carries *weakened net*,
*tautological test*, and *happy-path-only suite*, each of which argues for more coverage.
`final-reviewer.md`'s Correctness axis asked for "real behaviour, not mocks" and integration tests
"where they matter", which argues for heavier coverage still, and contradicts the mock-category rule
`implementer.md` already carries.

Each slice is locally right and the suite rots globally. A repository superdev has driven for many
scopes accumulates tests that re-prove a case an earlier slice already covered, and tests that stand up
a containerised database to prove what an in-memory fake proves identically. The cost lands on the
merged suite, where every merge green-gate and every CI run pays it, for a decision one slice made once.

`implementer.md`'s mock-category rule already forbids the containerised-database case, and loses anyway.
It is framed as a fidelity and coupling rule — what to mock — and never mentions cost, and its
"a database with a real in-memory stand-in" clause hands an implementer a legitimate escape whenever the
stand-in is not faithful.

**Decision.** Test cost is a lens in `review-checklist.md`, under `## Anti-patterns`: *redundant test
coverage* and *overweight fixture*. `slice-reviewer` and `final-reviewer` both already read that lens, so
one entry reaches per-slice review, whole-scope review, and an ad-hoc `/superdev:review`, and neither
reviewer's pinned lens sentence changes. `simplicity-reviewer` is untouched.

`/superdev:review`'s range resolution gains a fourth shape. A path that exists on disk whose scoped diff
is empty resolves to **standing code**: the files under it at `HEAD`, reviewed as they are rather than as
a change. `final-reviewer`'s range bullet names the fourth shape, and `simplicity-reviewer` is skipped on
a standing-code target.

`implementer.md` gains the prevention half: a survey of the tests already exercising the interface the
`spec` names, run before the first RED test, and a cost clause on the mock-category bullet.
`implement-lite.md` mirrors both.

**Why.** The checklist is where review vocabulary lives, and the `agent-lens-list` drift check pins which
reviewer reads which lens. Vocabulary anywhere else fights an enforced contract, and duplicating it
across two rubrics is the *duplicated fact* smell the checklist's own Consistency lens names.

Prevention alone leaves every already-slow suite slow. Ad-hoc review is diff-based in all of its input
shapes, so pointing it at a test tree on a clean checkout reviews an empty diff. The standing-code shape
is what makes the same lens answer the remediation question, and it is general: it fixes "review this
existing area" for every use, not only for tests.

**Considered options.**
- *`downgrade:` and `dupe:` tags on `simplicity-reviewer`.* Rejected: it reads no checklist, is `haiku`,
  and is diff-only by its core contract. Its tags target production lines, and a repo-wide duplicate
  search is beyond what a diff-only reviewer can do. It also gives up the `final-reviewer` route, so the
  remediation half disappears.
- *An explicit `--audit <path>` flag on `/superdev:review`.* Rejected: it costs an argument, its parsing,
  its `argument-hint`, and a pin, so that no existing invocation changes meaning — but an existing
  invocation that reviews an empty diff reports nothing anyone wants.
- *A suite-runtime budget in `docs/agents/verification.md`, with the green-gate or `/superdev:ship`
  reporting the delta.* The only option that measures the stated symptom. Rejected for now: it needs a
  setup question, a reporting path, numbers that do not depend on the machine, and an answer to what a
  breach does. It is the natural second step if the lens fails to bend the curve.
- *Test fidelity decided at plan time, extending `test-applicability`.* Rejected: the interview has not
  read the code the slice touches, so it would guess at a decision the implementer makes better with the
  file open.
- *A dedicated test-audit skill.* Rejected: a fourteenth surface with its own drift rows and suite, for
  what ad-hoc review already has the shape to do.

**Consequences.** `/superdev:review <path>` changes meaning where the path's diff is empty: it reported
nothing and now reports findings against standing code. A reader expecting silence gets a report.

The two halves of the range shape are a two-sided contract — `skills/review/SKILL.md` emits it and
`agents/final-reviewer.md` names it — so the `review-range-shapes` drift row pins both. A one-sided pin
is the `FULL_SUITE_CONTRACTS` shape: green while the live path drifts.

The lite tier has no per-slice review, so a lite scope catches a redundant or overweight test only at
whole-scope review. The full tier catches it twice.

Nothing measures whether a suite got faster. The lens reports a judgment, and a human or a later scope
acts on it.
