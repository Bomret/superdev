# 0286: A prototype detour is a cross-exam move, built in its own worktree

**Status:** Accepted

**Context.** The prototype discipline (`references/prototype.md`) was reachable only from `/superdev:brainstorm` §4,
which offered it neutrally. An operator who starts at `/superdev:plan` never met it, although `plan-contract.md`
already accepts a prototype-sourced snippet in a slice `spec`. A UI question such as "which of these two layouts
reads better" then reached the plan interview as a choice made from a description. The discipline also named a
throwaway branch for the capture and no place where the prototype's files are written, and `/superdev:plan` never
stages, commits, or switches the invoking checkout.

**Decision.** The prototype trigger is one core move of `references/cross-exam.md`. It applies to a frontier
question whose answer turns on seeing or running something: how a screen looks or a flow feels, which of several
variants reads better, whether a state model or data shape survives real data. The move recommends the detour as
that question's answer, and the question waits for the prototype's result. `/superdev:plan` reaches the move because
it runs the whole discipline, and `/superdev:brainstorm` names it among its core moves in place of its own concept.
A prototype is built and committed in its own worktree, `.superdev/prototypes/<slug>` under the main working tree, on
a `prototype/<slug>` branch cut from the base, or from the current commit where no base branch is recorded, and every prototype commit is a featureless commit. The validated
decision lands where the detour was opened: brainstorm's intent file, or plan's interview answer, an ADR, and a
`Prototype: prototype/<slug>` line in the `spec` of the slice the decision shapes, which `plan-contract.md` admits
beside its prototype-sourced snippet.

**Considered options.**

- *A concept in each skill.* A plan concept beside brainstorm's. It leaves `cross-exam.md` untouched. It lost
  because the two triggers would drift apart, and the trigger needed sharpening in both.
- *A neutral offer.* The detour mentioned as available, as brainstorm worded it. It saves time on a question the
  operator can judge from a description. It lost because that wording is the one an operator never saw fire.
- *The pointer in an ADR or a snippet only.* It leaves `plan-contract.md` at one exception. It lost because a
  decision that shapes neither has its pointer only in the session, which ends.
- *A git-ignored file with no commit*, like the design sketch. It saves the branch and worktree steps. It lost
  because a cleanup loses the prototype, and the decision's pointer then names nothing.

**Consequences.** The design sketch (ADR 0036) and a prototype stay apart: a prototype answers one open question
during the interview, and the sketch draws the whole held design after it. `prototype/<slug>` names no change type,
so a prototype branch never reads as a scope branch.
