# 0079 — A planned ledger hands the scope branch from plan to implement

**Status:** Accepted

**Amended by:** [ADR 0120](0120-implement-brings-the-remote-base-into-the-scope-branch-before-the-first-slice.md).

**Supersedes:** [ADR 0058](0058-base-lock-guards-plans-base-branch-commit.md).
**Amends:** [ADR 0072](0072-plan-commits-its-design-docs-on-the-scope-branch.md),
[ADR 0076](0076-plan-writes-its-design-docs-in-the-scope-scopetree.md).

## Context

ADR 0072 and ADR 0076 move a new-feature `/superdev:plan`'s design docs onto the scope branch and into
the scopetree. Both keep three carve-outs, and shipped prose implements none of the two decisions:
`skills/plan/SKILL.md` and `references/run-init.md` still commit `CONTEXT.md`, `docs/adr/`, and
`docs/invariants.md` to the base branch under ADR 0058's base lock.

The carve-outs are what stopped the implementation being simple.

- **A plan that writes no design docs cuts nothing**, so `/superdev:implement` has to tell a
  scopetree a plan cut from one it must cut itself, from disk.
- **Append mode stays on base**, because the `appended` run kind re-points a contained branch with
  `git reset --hard <base>` (ADR 0053) and would discard a docs commit made on it.
- **A survey command defines a run root as a directory holding `ledger.md`**, so a scopetree a plan cut
  is invisible to `/superdev:backlog`, `/superdev:status`, and `/superdev:afk`, and unreapable by
  `hooks/scope-prune.js`.

Each carve-out exists because the scope branch a plan cuts carries no record. Git state is the only
evidence, and every consumer has to infer intent from it.

## Decision

**Every `/superdev:plan` run ends with a run root the next command can read.** Plan cuts
`<type>/<scope>` into `.superdev/scopes/<scope>/scopetree`, writes its design docs there, commits them
on that branch, and writes `ledger.md` through `scope.js init` — whether or not a design doc
crystallised, and in append mode as well as on a new feature.

`scope.js` gains the stage **`planned`**, ranked below `implementing`. `init` writes it; nothing else
does. A `planned` ledger states two facts no git inspection can:

- The run is planned and not started. Every consumer reading "a stage short of `shipped` means a live
  run" reads `planned` as not-yet-started instead: `/superdev:plan`'s own append refusal exempts it,
  and `/superdev:afk` treats it as eligible work rather than a run in flight.
- **The scope branch is ready.** `/superdev:implement`'s run init cuts nothing, tests no containment,
  and re-points nothing on a `planned` ledger. It moves the stage to `implementing` and works in the
  scopetree that is already there. Run kind stays ledger-derived, with no fourth value (ADR 0028): a
  `planned` ledger is a live ledger, so the run is `resumed`.

That second fact is what retires the append carve-out. An append-mode plan regenerates the ledger —
`init` overwrites a ledger whose stage is `planned`, because no slice has run — after re-pointing the
branch itself, so the `reset --hard <base>` that would have discarded its docs commit never runs.

**One cut rule serves both cutters.** `/superdev:plan` now makes the call run init's `fresh` path made
alone, so the rule moves to one place and gains the containment test `appended` already carries: a
same-named branch that `## Containment` proves base holds is reused and re-pointed, and only a branch
carrying content base does not hold stops the run. The `fresh` path's unconditional stop on a taken
name fires routinely in a repository that squash-merges and leaves branches standing (triage #417),
and it would fire on nearly every plan run once plan is the one cutting.

**`/superdev:plan` writes `run.lock`**, reversing ADR 0072 on that point. It writes the file into the
run root after its own cut, and refreshes it at §6, exactly as an execution playbook does — never
before the cut, because `hooks/run-lock.js` guards `git worktree add` against a fresh lock and a lock
written first would block the run's own scopetree. A plan that meets a fresh lock naming another
session stops. Without it, two sessions re-planning one unimplemented feature write the same files in
the one scopetree they share (triage #510): the `worktree add -b` refusal stops the second session only
while the branch is being created, and says nothing on the reuse path a `planned` ledger opens.

**No superdev command commits to the base branch** (INV-0001). `scope.js base-lock` loses its last
caller and is deleted with the lock file, the drift rows that pin it, and its tests. Run init's own
base commit becomes a move: dirty design docs in the invoking checkout are copied into the scopetree,
committed there, and reverted in the checkout.

## Considered options

- **Implement ADR 0072 and 0076 with their carve-outs intact.** Lost: the three carve-outs are three
  paths through run init, and each one is a place where two commands must agree about git state they
  cannot see each other create.
- **A fourth run kind `planned`.** Rejected in ADR 0072 for making run kind something other than
  ledger-derived, and rejected again here for the same reason. A stage is ledger state, so the
  derivation rule is untouched.
- **Keep the base lock for append mode alone.** Lost: one surviving base write keeps every consumer's
  base-write reasoning alive to serve a path that the `planned` stage already handles.
- **Plan writes no ledger, and run init detects a plan-cut scopetree from disk.** Lost: it reintroduces
  the inference the `planned` stage exists to remove, and leaves every survey command blind to a
  planned feature.

## Consequences

- An abandoned plan leaves a run root, a branch, and a scopetree — but a `ledger.md` comes with them,
  so `/superdev:backlog` sees the run and `/superdev:status` prints it. `hooks/scope-prune.js` still
  reaps only a `shipped` run, so removing an abandoned one stays a human's call. This closes triage
  #509, which ADR 0072 left open by cutting a scopetree no survey command could see.
- A plan run is a live run for as long as it holds its lock, so `/superdev:status` and the `run-lock`
  hook treat an interview the way they treat an execution. An interview outlasting the hook's one-hour
  staleness window reads as dead until §6 refreshes the lock.
- Two features planned before either merges can coin rival terms for the same concept. `CONTEXT.md` is
  un-shared until merge, and the divergence surfaces as a conflict at the second merge. This is ADR
  0072's accepted price, unchanged.
- `/superdev:plan` now cuts branches, which it never did. A leftover `<type>/<scope>` branch base
  already contains is reused, and one carrying unmerged content stops the run with the log and the
  rename remedy — the treatment `appended` gives it.
- The design-docs commit sits in `git log <base>..<branch>` matching no slice, and rides the pull
  request. Both playbooks read slice state from the ledger, so it gates nothing.
