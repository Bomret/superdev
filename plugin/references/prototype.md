<!--
  Attribution: the prototype discipline below is distilled from the prototype skill,
  by Matt Pocock (https://github.com/mattpocock). Credit to its author.
-->

# Prototype discipline

A throwaway artifact that answers **one design question** conversation cannot settle, such as "does this state model
feel right" or "which of these two shapes survives real data". An interview detours here through
`cross-exam.md`'s **Prototype what must be seen or run**. The answer feeds the interview, never the codebase. A
prototype answers one open question during the interview; the design sketch (`design-sketch.md`) draws the whole held
design after it.

**The values.** Applies to every step.

- `<slug>`: a short kebab-case form of the question.
- `<main>`: the main working tree, resolved as `review-inline-fix.md`'s **The values** resolves it.
- `<tree>`: `<main>/.superdev/prototypes/<slug>`, absolute.
- `<branch>`: `prototype/<slug>`.
- `<start>`: the base branch `node "${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" config base` prints, or `HEAD` where it prints `absent`.

**The `Prototype:` line.** Applies to every line that names a prototype branch in a slice `spec`. It takes one of two
forms, and names the branch local until a push of it is confirmed (`## The push and its teardown`).

- **Local**: `Prototype: prototype/<slug> (local to the planner's clone)`.
- **Pushed**: `Prototype: prototype/<scope>/<slug> on <remote>`, `<scope>` the feature label's slug and `<remote>` the
  remote the branch was pushed to.
- **On a multi-repository plan**, either form names, right after the branch, the Repository component of the
  repository that holds the branch: `Prototype: prototype/<slug> in <component> (local to the planner's clone)`.

**State the question first.** Applies to every prototype. Write the one question it answers in the artifact itself.

**Logic prototypes stay liftable.** Applies to a prototype of logic. Keep the logic in one pure module, with the page
or harness as a thin shell around it. The logic references neither the DOM nor the harness.

**UI prototypes ship variants.** Applies to a "which of these" question. Build switchable variants in one artifact,
never serial rebuilds.

**Cut the prototype's worktree.** Applies before the first prototype file is written. Run `review-inline-fix.md`'s
`## 1. The ignore check` first, with its outcomes, then cut with `git -C <main> worktree add -b <branch> <tree>
<start>`, never `-B`. Build every prototype file inside `<tree>`.

- **The cut fails** (the branch or the directory exists, a ref conflicts, or `<start>` does not exist) → build
  nothing, report git's own output, and return the question as `cross-exam.md`'s **Prototype what must be seen or
  run** returns a declined or inconclusive detour, naming no branch of this detour, because the cut made none. Where
  the cut failed on an existing `<branch>`, name that branch as an earlier prototype of the same question.

**Commit, then remove the worktree.** Applies once the detour ends, its prototype conclusive or not, or abandoned.
Commit a built prototype inside `<tree>`, never onto the base branch, its message per
`${CLAUDE_PLUGIN_ROOT}/references/commit-messages.md`'s **A featureless commit**. After a successful commit, run
`git -C <main> worktree remove <tree>` without `--force`, and keep `<branch>`.

- **An abandoned detour** → commit nothing, keep the worktree and the branch, and tell the operator both.
- **A refused commit** → report git's own output, keep the worktree and the branch, and tell the operator both.
- **A removal git refuses because files are left in the worktree** → keep the worktree and the branch, and tell the
  operator both. Nothing is removed by force.

**Route the decision.** Applies once the operator's judgment of the running prototype answers its question. Route the
validated decision to where the detour was opened.

- **`/superdev:brainstorm`** → the intent file, naming `<branch>` as local to the planner's clone.
- **`/superdev:plan`** → the answer to the question, a `Prototype:` line in its local form in the `spec` of the slice
  the decision shapes (`plan-contract.md` → *Fields*), and the ADR when the decision earns one. The ADR records the
  validated decision itself and names no prototype branch, because a pushed branch lives only as long as its run.

**A decision-rich snippet may enter the plan.** Applies to a prototype-produced snippet that encodes a decision more
precisely than prose can: a state machine, a reducer, a schema, a type shape. It may be inlined in a slice `spec`,
trimmed to the decision-rich parts and marked as prototype-sourced (`plan-contract.md` → *Fields*). It is the one
exception to a `spec` stating outcomes and interfaces only.

## The push and its teardown

**The push.** Applies to a prototype branch a slice `spec` names. It reaches a remote only through
`/superdev:plan`'s end-of-run push, on the operator's own yes (`skills/plan/SKILL.md` §6, **The prototype push**):
`scope.js prototype push` pushes each local `prototype/<slug>` as `prototype/<scope>/<slug>`, never by force, and
records the branch with its pushed commit in the run's ledger (`**Prototypes:**`). A line turns to its pushed form only
after its branch prints `pushed`. `/superdev:brainstorm` pushes nothing.

**The teardown.** Applies to every recorded prototype branch. `/superdev:wrap-up`'s cleanup deletes it as
`skills/wrap-up/SKILL.md` §6, **The prototype teardown**, states. `/superdev:abandon` deletes the recorded branches of a run it abandons, and the unshared local branches a run, an intent record, or an intent file names, as `skills/abandon/SKILL.md` §6 states. A branch another open record or live run also names is kept and listed. A branch nobody pushed stays the operator's except where abandon names it.
