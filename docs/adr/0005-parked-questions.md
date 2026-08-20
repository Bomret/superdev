# 0005: Parked questions get an advisory-only home on the epic, not a partial-DAG planning system

**Status:** Accepted

**Context.** `cross-exam.md`'s termination rule already permits ending an interview with a load-bearing
decision "explicitly parked as a known-open question" (`cross-exam.md:35`), but `plan-contract.md` defines
no field for it. A parked question either evaporates once the session ends or gets smuggled into a
slice's `spec` as a vague TODO it was never meant to carry. Separately, comparing superdev against the
"wayfinder" skill (a multi-session, tracker-native incremental-planning pattern with partial DAGs,
frontier tracking, and ticket graduation) raised whether superdev should adopt something similar for
features too large to decompose in one `/plan` session. No concrete instance of that problem has
been observed, and the interest was philosophical, not a real blocker.

**Decision.** superdev gets a minimal parking-lot field, not a planning system.

- A load-bearing decision the interview cannot resolve is written to the epic's `## Parked questions`
  section (plain bullets: `- <question> — <why it's open>`) the moment it is parked, never batched.
- The field is **epic-only**. Single-slice plans get no equivalent: an unresolved load-bearing decision
  on a plan simple enough for one slice reads as a signal the plan is not single-slice-simple
  yet. Resolve it now or decompose further, and do not park it.
- **Purely advisory:** `/implement` never reads it, no new lifecycle status, no gating, no frontier, no
  graduation.
- Named **Parked questions**, not "Open questions", because `CONTEXT.md` already defines `Intent`'s
  open questions as brainstorm's pre-interview output, which `/plan` resolves. A parked question
  is the opposite, what is left after `/plan` already tried and could not. Reusing "open questions" would
  have overloaded one term with two meanings.
- Wayfinder's fuller model (partial DAGs, frontier tracking, ticket graduation, a dedicated command) is
  explicitly rejected absent a concrete case that needs it.

**Why.** Hard to reverse in the sense that once real plans carry parked questions, the backends and the
interview discipline depend on the convention. It is cheap to fix now while the schema is small, and costly once
plans rely on it. Surprising without context: a future reader would reasonably ask why only epics
carry this and not slices, and why superdev did not just adopt the fuller wayfinder pattern already on the
table. Real trade-off: the fuller incremental-planning model was seriously considered and rejected for
its cost against a problem that has not materialized. The minimal field is chosen deliberately over
building for a hypothetical.

**Consequences.** `plan-contract.md` gains a `parked-questions` field (epic-only, advisory). Both
backends (`issue-tracker-local.md`, and this repo's `docs/agents/issue-tracker.md`) gain the same
body-text mapping. `cross-exam.md` gains a capture move next to its termination rule. `docs/adr/
0004-plan-append-semantics.md` is amended (not superseded) to record that its future append-mode
implementation will surface and consume parked questions. Anyone wanting the fuller wayfinder-style model
later reopens this ADR with a concrete case in hand, not a hypothetical one.