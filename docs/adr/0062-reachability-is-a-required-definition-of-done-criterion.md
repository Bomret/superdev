# 0062: Reachability is a required Definition-of-Done criterion

**Status:** Accepted

**Context.** A feature walks the whole chain, is built well, and never reaches the running application:
the service exists and is unit-tested, the composition root never registers it, and nothing injects it.
Every gate reports success. The green-gate proves the suite is green, and an unregistered service is
green. `slice-reviewer` checks a slice against a `spec` that never named the wiring. `final-reviewer`'s
half-wired check covers the seam between slices, not the seam between the feature and the application.

Two rules already demand the right thing. `plan-contract.md`'s vertical-slice rules call each slice a
tracer bullet, "a narrow but COMPLETE path through every layer," and the same document requires the
Definition of Done to state "observable, user-facing behaviour." Both are adjectives, which an agent
grades its own compliance against and always passes. Neither leaves an artifact a second reader can
check, and nothing fails when either is ignored.

**Decision.** Every feature's Definition of Done carries at least one criterion led by the word
`Reachable:`, naming the entrance through which a user reaches the feature — an endpoint, a command, a
screen — in the same interface vocabulary a `spec` uses. A feature with no in-repo consumer answers
`Reachable: none` followed by the reason.

The rule holds for every change type. A behaviour-preserving refactor answers `none — entrance
unchanged`, a prose feature answers `none — prose only`. It is feature-level: a single-slice feature
carries it through the lone slice's `acceptance`, because that `acceptance` is already the Definition of
Done. Append mode adds a further `Reachable:` criterion for the extension rather than editing the
existing one, which the amend-in-place invariant already requires.

`review-checklist.md` names **orphan production symbol** under `## Design smells`: a new production
symbol with no non-test reference, no registration, and no route.

**Why.** A required, prefixed criterion is an artifact rather than an adjective. Its presence and its
absence are both visible, so a reader can tell a feature whose entrance was decided from one where the
question was never asked.

It needs no new plumbing. Run init writes `dod.md` from the Definition of Done, ADR 0020 hands
`final-reviewer` that file, and `/superdev:ship` ticks the same checklist, so the criterion is reviewed
and ticked by machinery that already exists. An advisory section beside `## Non-goals` would reach none
of it without a run-init clause, a reviewer clause, and a field mapping in every store seed.

The `## Design smells` placement is load-bearing. `final-reviewer` applies the anti-pattern, design-smell,
and remaining lenses; `slice-reviewer` applies anti-patterns and vulnerability classes only. A slice
legitimately lands a symbol whose caller arrives two slices later, so the lens reports noise per slice and
reports the real defect only once the scope is integrated. `speculative generality` sits in that section
for the same reason.

**Considered options.**
- *Strengthen the vertical-slice and Definition-of-Done wording.* Rejected: two rules of exactly that
  kind already exist, are correctly worded, and drift silently, because nothing fails when they are
  ignored.
- *A `## Entrance` section on the epic, beside `## Non-goals`.* Rejected: its neighbours are advisory and
  `/superdev:implement` never reads them, so the section reaches no reviewer without three further edits.
- *A first-class `entrance` field in the plan-contract schema.* Rejected: it costs a mapping in four store
  seeds and a drift table, and still has to reach `dod.md` by some other route.
- *A reachability criterion on every `behavior` slice's `acceptance`.* Rejected: a mid-chain slice and an
  expand–contract expand slice have no user-facing entrance by design, so the rule forces a plan to write
  something false.
- *Record the entrance per workspace in `/superdev:setup`, and require a test entering the real wired
  application.* The strongest enforcement, since the container failing to resolve turns the suite red and
  the existing green-gate blocks the merge. Rejected for now: it costs a setup question per workspace,
  demands an integration harness some repositories cannot provide, and still misses the cross-process
  shape. It remains the natural second step.
- *A deterministic hook grepping for uncalled exports at merge.* Rejected: it is language-specific,
  reflection and assembly scanning defeat it, and its false positives block sound merges.

**Consequences.** A documentation or refactor plan writes one line of ceremony it gains nothing from. The
uniform rule is what keeps `/superdev:plan` from judging whether the rule fires, which is the judgment the
two superseded adjectives got wrong.

The criterion covers an in-process orphan, where the composition root never registers the symbol. A
cross-process orphan — an endpoint no client calls, a message no producer sends — is invisible to it,
because each side's own tests observe one process. The consuming side's own slice is what covers that, and
a schema that both sides generate from covers it for free.

Nothing detects a plan that writes no `Reachable:` criterion at all. The orphan production symbol lens is
what catches the result, at whole-scope review, for such a plan and for every plan written before this
decision.
