# 0072: /superdev:plan commits its design docs on the scope branch it cuts

**Status:** Accepted

**Context.** `/superdev:plan` §6 and `/superdev:implement`'s run init both commit `CONTEXT.md`, ADRs, and
`.claude/rules/` to the base branch from the shared invoking checkout. ADR 0058 serializes that step with
`.superdev/base.lock`, which removes the concurrent-write race without removing what makes it possible:
two sessions writing the same files in the same checkout. A lock is the right answer to a shared step and
the wrong answer to a step that never needed to be shared.

**Decision.** A new-feature `/superdev:plan` that produced design docs cuts the scope branch into its own
scope worktree — `git worktree add .superdev/scopes/<scope>/worktree -b <type>/<scope> <base>`, the call
`references/scope-mode.md`'s `## Cutting the scope branch` already states — writes the three file groups
there, and commits on the scope branch. Two sessions planning two features hold two worktrees and share
no file, so nothing is left to serialize.

Three boundaries keep the change local:

- **A plan that wrote no design docs cuts nothing.** The `fresh` path is unchanged where there is nothing
  to commit, and the new path fires only where there is genuinely something to reuse.
- **An append-mode plan keeps the base commit and the base lock.** `appended`'s branch step re-points a
  contained branch with `git reset --hard <base>` (ADR 0053), which would discard a docs commit made on
  it. Leaving append mode on base preserves that path untouched, and the lock stays live for it rather
  than becoming dead code.
- **Run kind stays derived from the ledger alone.** `fresh`'s branch step gains one reuse case — a
  present, clean scope worktree beside a ledger-less run root — instead of the run kind gaining a fourth
  value. ADR 0028's one-determination rule is untouched, and nothing threads a new value through both
  execution playbooks.

`/superdev:plan` writes no `run.lock`: the `run-lock` hook blocks `git worktree add` against a fresh lock,
and a lock written where no run is live would block the next session for nothing. It pushes no branch
either — `/superdev:ship` does that.

**Considered options.**

- **Keep the base commit and the lock.** The lock works, and the redesign lands on run-init, which three
  ADRs already constrain. Lost because the lock treats the symptom: every future step writing a shared
  file in the invoking checkout needs its own serialization, and this removes the category.
- **A fourth run kind (`planned`).** Explicit and self-documenting. Lost because run-init would have to
  inspect the worktree and the branch to compute a value ADR 0028, ADR 0042, and ADR 0045 all describe as
  ledger-derived, which is a larger semantic change than the reuse case it buys.
- **Uniform behaviour across new and append mode.** Lost on the `reset --hard` conflict above: teaching
  `appended` to distinguish a fresh docs commit from the stale history it exists to discard complicates
  the one path ADR 0053 built to be safe to reset.
- **Cut the worktree on every plan.** Lost because `backlog`, `status`, and `afk` each define a run root
  as a directory holding `ledger.md`, so a worktree left by a plan that is never implemented accumulates
  invisibly to every survey command.

**Consequences.**

- Design docs reach base when the feature's branch merges, not at plan time. An abandoned plan's glossary
  entries and ADRs never pollute base, which is the correctness win.
- **Two features planned before either merges can coin rival terms for the same concept.** `CONTEXT.md` is
  the shared vocabulary every later interview reads, and this design makes it un-shared until merge.
  Nothing detects the divergence while both branches are open; it surfaces as a `CONTEXT.md` conflict at
  the second merge. This is the price of removing the race and is accepted deliberately.
- The base lock narrows to append-mode `/plan` and run init's own hand-edited-docs path. It stays.
- A design-docs commit sits in `git log <base>..<branch>` matching no slice. Both playbooks' Resume step
  reads slice state from the ledger and treats that log as a cross-check, so the extra commit gates
  nothing. `/superdev:review` and `/superdev:ship` both carry it into the review range and the pull
  request, where it belongs.
