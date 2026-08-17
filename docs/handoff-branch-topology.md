# Handoff — scope-branch topology on a second or resumed run

**Delete this file when the scope it describes merges.** It caches reasoning that is expensive to
rediscover and worthless once the behaviour is written down where it belongs.

Start with `/superdev:plan`. This is a plan-and-interview problem, not a patch: three consecutive fix
cycles at a review gate each closed one defect and exposed the next, which is what a missing slice feels
like.

## The gap

`/superdev:plan` can extend a feature that already has slices (ADR 0004, implemented on
`feat/plan-append`). Its refusal permits the append once the prior chain shipped and the scope branch is
merged or gone. Nothing specifies what the **branch** does on the run that follows.

Both playbooks cut the scope branch the same way on every run — a fresh run, an appended run, and a
resume all reach the same Branch model bullet. `references/implement-full.md` and
`references/implement-lite.md` hold it. `commands/implement.md`'s Phase 0 decides which run this is.

## What the environment already tells you

Read these rather than trusting a summary: `docs/adr/0004-plan-append-semantics.md`,
`docs/adr/0007-scope-prune-ttl.md`, both playbooks' Branch model and Resume sections,
`commands/implement.md` Phase 0, and `commands/ship.md` §5 and §6.

## What it does not tell you

**A forcing flag destroys merged work, silently.** `git switch -C` and `git worktree add -B` were tried
and reverted (`b37f154`). Reproduction, in a throwaway repo — two slices merged into the scope branch,
the branch not merged into base:

```sh
git switch -C feat/x main    # prints "Reset branch 'feat/x'", exit 0
```

Both slices' files disappear and their commits are unreachable from any branch ref. Reflog only. The
ledger still marks those slices `merged`, and Resume's own rule forbids re-dispatching a merged slice, so
nothing in the run repairs it.

**The safe failure is the current behaviour.** `-c` and `-b` fail on an existing branch. An appended
feature whose prior branch survives stops there, loudly, for a human.

**The ordinary path is already fine.** A code host that squash-merges deletes the branch, so the common
append lands on a clean cut. The unhandled case is narrower than it first reads: merged, and the local
branch still present.

**Phase 0 depends on the cut coming from base.** It commits `CONTEXT.md`, ADRs, and `.claude/rules/` to
base immediately before the playbook runs, because worktrees are clean checkouts. It then relaxes its own
branch check on the stated grounds that both playbooks cut from `<base>` explicitly. Any design that
re-points or reuses a branch owes that guarantee another way.

**`shipped` does not mean merged.** `commands/ship.md` sets the stage when the pull request opens, and
never deletes the branch — the request is from it. So "stage `shipped`, request open, branch alive" is
the ordinary post-ship state, and it is why the refusal needs the branch test at all.

## Constraints

- ADR 0007 stands. `hooks/scope-prune.js` reaps a run root on its own terms and this work does not touch it.
- `scripts/scope.js` is the only ledger read and write path (ADR 0022). The branch name comes from
  `get branch`, never from reconstructing `<type>/<scope>`.
- Both playbooks and `commands/plan.md` are read at runtime on every run.
- A new drift-check contract computes on its own line at the end of `main()`, with its own gap variable,
  guard clause, reporting loop, and success-message clause. A row inside the `contractGaps` table computes
  early and renumbers every later check in `scripts/AGENTS.md`. This cost was paid twice already.

## Done when

- The Branch model bullet in both playbooks states what happens for each of the three runs that reach it:
  a fresh cut, an appended re-cut, and a resume.
- A drift contract pins that specification, and each clause fails on its own when only that clause is
  removed — verified by mutating the real file, not a fixture.
- The `**Unresolved:**` entry on the `plan-append` run root is cleared, or the run is shipped and the
  entry retired with it.

## Worth folding in

`VERB_CONTRACTS` in `scripts/drift-check.js` carries no `commands/plan.md` entry, while
`commands/publish-kb.md` is already pinned for the identical `scope.js get branch` read. A revert to
reconstructing the branch name passes every check today.
