# 0097: A guard-rail remedy stays in the fix loop

**Status:** Accepted

This record amends ADR 0035.

**Context.** ADR 0035 sends every remedy that adds a capability the Definition of Done never named to
`/superdev:plan`. The reviewers and the controller read "capability" widely. A new drift contract row, a
test that proves behaviour the code already has, and a fix that makes a shipped sentence agree with a rule
the same branch states all left the loop as deferred findings (triage #521, #533, #660). Each became a
triage record that needs a full planning interview for a change of a few lines. On 2026-09-26, 70 of the
77 triage records in this repository came from that boundary.

ADR 0035 exists to keep new behaviour out of a late fix cycle. A guard-rail adds no behaviour: it pins,
tests, or makes consistent what the branch already does.

**Decision.** A guard-rail remedy changes how the code meets the Definition of Done, and it stays in the
fix loop. A guard-rail remedy extends what exists:

- a new test in an existing suite,
- a new row, with its fixtures, in an existing drift contract table,
- a prose fix that makes shipped text agree with a rule the repository already states.

A remedy that builds a new scanner, check family, hook, or script verb, or that changes what a plugin user
can observe, still leaves the loop under ADR 0035.

A **plan-coverage gap** — a criterion `final-reviewer` derives that the code already satisfies and the
Definition of Done never named — is fixed the same way. Its remedy is the test or drift pin that proves
the behaviour. The review writes no new line into `dod.md` (INV-0004). A gap that an existing test already
proves needs no remedy, and the review only reports it.

**Considered options**

- **Keep every non-behaviour remedy in the loop.** It catches more findings, including a new scanner or
  check family. It loses because a new drift check with its own selftest suite is design work, and it would
  arrive late in a run, which is the harm ADR 0035 names.
- **Also keep small behavioural guards in the loop.** It catches a fall-through or a stale label (triage
  #463, #609). It loses because it reopens the behaviour boundary ADR 0035 draws, and it needs a size
  judgment.
- **A reviewer-assigned effort tag.** The reviewer tags each remedy trivial, small, or design, and the
  controller keeps trivial ones in the loop. It loses on ADR 0035's own evidence: the reviewer that found
  the false sentence proposed the large remedy itself. The same reviewer that grades its remedy's size
  repeats that failure.

**Consequences.** Fewer deferred findings reach the slice store, and a scope ships with the pins and tests
that guard its own behaviour. A fix cycle grows by the guard-rail remedies it now keeps. The line between
"extends an existing table" and "builds a new check" still needs judgment, and prose carries it, as ADR 0035
already accepts for its own boundary.
