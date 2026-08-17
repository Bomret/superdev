# 0028 — The scope branch is cut once, and a later run reuses it only losslessly

**Status:** Accepted

## Context

Both execution playbooks open with the same step: cut the scope branch `<type>/<scope>` from the base.
`references/implement-full.md` runs `git switch -c`, `references/implement-lite.md` runs
`git worktree add … -b`, and `commands/implement.md`'s Phase 0 relaxes its own branch check on the stated
grounds that both playbooks cut from `<base>` explicitly.

Every run reaches that step, and not every run is the first one. ADR 0004 lets `/superdev:plan` extend a
feature that already has slices, so a second run over one feature is now an ordinary event. A run that
resumes after compaction or interruption reaches the step too. In both cases the branch already exists,
and the non-forcing flags fail on an existing branch — so the resume path stopped with a fatal error every
time it was taken, and an appended run stopped whenever the prior branch survived its pull request.

The forcing flags were tried and reverted (`b37f154`). `git switch -C` prints `Reset branch` and exits 0
while every slice already merged into that branch becomes unreachable from any ref. The ledger still marks
those slices `merged`, and the playbooks' own resume rule forbids re-dispatching a merged slice, so nothing
in the run repairs the loss.

Three consecutive fix cycles at one review gate each closed a defect here and exposed the next, which was
the signal that the branch step needed a specification rather than another flag.

## Decision

The branch step is defined per **run kind** — `fresh`, `appended`, or `resumed`.
`references/scope-mode.md` owns the rule, both playbooks read it, and `commands/implement.md`'s Phase 0
computes the run kind and hands it down. Phase 0 already makes that determination: rotating a `shipped`
ledger means `appended`, skipping `init` on a live ledger means `resumed`, and writing a new ledger means
`fresh`.

**`fresh`.** The branch does not exist. Cut it from the base, unchanged from today. A same-named branch
a scope-prune reap left standing (a non-squash merge outliving its reaped run root, ADR 0007) makes the
non-forcing cut fail: stop there, name the branch found, and cut nothing.

**`appended`.** The prior chain shipped, and the branch may or may not have survived its pull request. Read
the ledger's own `**Branch:**` line directly (`scope.js get branch`) and presence-test it with `git
rev-parse --verify` — never through `references/scope-mode.md`'s `## The scope branch`, whose fallback route
guesses from branch shape and can name a foreign branch, which a step that cuts and hands the name onward
cannot risk. A name that does not verify is gone. Then decide on the same test that decides a scope is
finished with (ADR 0007): merged into base, or gone entirely — the test `hooks/scope-prune.js` runs and
`commands/plan.md`'s refusal bullet reads back. A bare `git merge-base --is-ancestor <branch> <base>` cannot
stand alone here: it exits 128, not false, on a branch a squash-merging host already deleted. **Gone** means
nothing survives to reuse: cut fresh from base, exactly as `fresh` does. **Present** runs the ancestor test
to decide containment. **Contained** means base contains every commit on that branch, so reuse cannot lose
one: the full tier switches the invoking checkout to it — stopping first, naming what it found, on the same
dirty-checkout/held-elsewhere conditions `resumed` stops on below, rather than the raw git fatal that switch
would otherwise raise — and then runs `git merge --ff-only <base>`, and the lite tier works in its existing
scope worktree when one already holds the branch, stopping first when a different worktree holds it instead,
or otherwise runs `git worktree add <path> <branch>` — either way then fast-forwarding inside that worktree.
**Not contained** means commits live only on that branch: print `git log <base>..<branch> --oneline` so the
operator sees exactly what is at risk and ask; `--unattended` blocks. The stop prints `git branch -m
<branch> <branch>-<date>` as its remedy.

**`resumed`.** The branch exists and holds unmerged slice work by design, so no ancestor test runs and
nothing is cut. The branch name comes from `scripts/scope.js get branch` (ADR 0022). The full tier switches
the invoking checkout onto it, and stops, naming what it found, when that checkout is dirty or the branch is
held in another worktree. The lite tier works in its existing scope worktree, or reattaches the branch with
`git worktree add <path> <branch>` when the worktree is gone.

**No forcing flag appears in either playbook**, at any run kind. Fast-forwarding to base is the one form
of re-pointing the rule permits, and it is a stronger version of Phase 0's cut-from-base guarantee rather
than a weaker one.

**All three stops write nothing.** No run starts, no ledger entry is written, and none of them is a
degraded pass — a degraded pass records work done a lesser way, and here no work happens.

## Considered options

- **A forcing flag (`-C`, `-B`).** One character, and every run kind collapses into one line. It loses on
  the reproduction above: it destroys merged work silently, and the ledger's own `merged` status then
  prevents the run from rebuilding what it lost.
- **Stop loudly on any existing branch.** This is the behaviour the flags were reverted to, and it is
  safe. It loses because it stops every resume, which is a first-class path through the loop, and because
  it forces a human decision in the case where the decision is mechanical: base already contains the work.
- **A per-run branch name (`<type>/<scope>-2`).** No collision can occur. It loses because the scope branch
  is the feature label verbatim (ADR 0021) and `hooks/scope-prune.js` matches on `<type>/<slug>`, so a
  suffixed branch breaks the run-root reaping rule and the pull request stops reporting the feature it
  builds.
- **Ask the code host whether the pull request merged.** It answers the squash case exactly. It loses on
  the pluggability rule: the playbooks stay backend-agnostic, and this would put a `code-management.md`
  API call inside the branch step.

## Consequences

A resumed run works. That path was fatal at its first step before this rule existed.

An appended run onto a host that merges without squashing reuses its branch with no questions asked. A
squash-merging host that deletes the branch on merge reads gone, and the run cuts fresh with no question
either. Only a squash-merging host that leaves the branch standing reads present and not contained, and
the run asks once there, with the commit list in view — a question unavoidable without host knowledge the
step declines to have.

Phase 0 gains one output and both playbooks gain one input, so the run kind is determined in one place and
read in three. Deriving it twice is what this avoids.

No superdev command can reset a branch that holds unmerged commits. The cost is that a stale local branch
from an abandoned run blocks the next append until a human renames it. That is the trade the reversion
already paid for once.
