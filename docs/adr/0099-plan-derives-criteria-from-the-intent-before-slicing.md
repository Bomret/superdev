# 0099: Plan derives criteria from the intent before slicing

**Status:** Accepted

**Amended by:** [ADR 0122](0122-interview-options-are-vetted-before-they-are-offered.md), which has the
controller settle each gap itself and state the settlement as one proposal, in place of the multi-select
question.

**Context.** `final-reviewer` derives acceptance criteria from the intent alone, before it reads the
Definition of Done, and reports every criterion the DoD left out (ADR 0020). That derivation runs only at
review, after the scope is built. `/superdev:review` defers every criterion missing from `dod.md` to a
triage record, because a DoD cannot change mid-run (INV-0004). A feature then ships short of its own
intent, and the slice store holds the rest (triage #662).

**Decision.** `/superdev:plan` runs the same derivation before it slices. It dispatches `final-reviewer`
in derive mode with the interview's problem statement and solution shape, and the path of the drafted
Definition of Done. The reviewer writes its own criteria before it opens the DoD, then returns every
derived criterion the DoD does not cover. The operator settles the gaps in one multi-select question when they fit, and in further
questions and rounds past the tool's per-question capacity: each
selected gap becomes a DoD criterion, and each other gap becomes a named non-goal in the epic. Every plan
runs the pass, including a single-slice plan and an append (INV-0096). When the permission classifier
denies the dispatch, the controller derives the criteria inline and says so.

**Considered options**

- **A new criteria-deriver agent.** It separates the roles cleanly. It loses because `final-reviewer`
  already owns the procedure, and a new agent adds a file and a description in permanent context.
- **The plan controller derives inline.** It costs no dispatch. It loses because the controller wrote the
  DoD from the same interview, so it cannot derive blind to it and tends to miss what the DoD missed.
- **Amend the DoD at review time.** An attended review offers "add the criterion and fix now" for a
  derived criterion the code fails. It keeps the check where it runs today. It loses because it puts a
  scope question to the operator late in a run, where ADR 0035 found attention is lowest. The plan-time
  pass prevents the gap instead.

**Consequences.** Every plan costs one more dispatch and one more question. The review's own derivation
still runs, and it finds fewer gaps.
