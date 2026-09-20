# 0076: /superdev:plan writes its design docs in the scopetree, never in the invoking checkout

**Status:** Accepted

**Context.** ADR 0072 moved a new-feature `/superdev:plan`'s design-docs commit onto the scope branch,
which is what keeps an abandoned plan's glossary entries and ADRs off base. §2 still writes those files
into the shared invoking checkout as they crystallise, and nothing consumes them there, so the residue
outlives the run: `references/run-init.md`'s "any dirty/untracked → commit to base" step then commits
them to base on the next `/superdev:implement`, whichever feature that run belongs to. The correctness
win ADR 0072 claims is undone by the step that writes the files in the first place.

Guarding the residue with a cleanup fails on the shared file. Two `/superdev:plan` sessions in one
checkout both revise `CONTEXT.md`, unstaged — `/superdev:plan` stages nothing before §6 — and
`git restore -- CONTEXT.md` restores from the index, so it discards every unstaged change to that path
rather than only the caller's. Git offers no operation that removes one writer's edits from a blob two
writers share, so no cleanup scoped by authorship can be correct.

**Decision.** A new-feature `/superdev:plan` writes each design-doc capture **inside the
scopetree**, and never in the invoking checkout. §2 cuts
`.superdev/scopes/<scope>/scopetree` lazily, at the first capture that crystallises, and writes there from
then on; §6 commits what the scopetree already holds. A capture that crystallises before §1 settles the
feature label is held in the conversation until the label exists, because the label names the scopetree
path. A label revised after the cut removes the scopetree, deletes the branch, re-cuts both under the
revised label, and re-writes the held captures — sound because the branch carries nothing but this
session's own design docs.

An append-mode `/superdev:plan` keeps committing to base under ADR 0058's base lock, unchanged: the
`appended` run kind's `git reset --hard <base>` would discard a docs commit made on the branch.

**Considered options.**
- **A cleanup scoped to the three path groups** — rejected. `git restore` and `rm` over
  `CONTEXT.md`/`docs/adr/`/`.claude/rules/` destroy another session's uncommitted design docs, and an
  untracked one has no git object to recover.
- **A cleanup scoped to the paths the run itself wrote** — rejected for the same reason, one case later.
  `CONTEXT.md` is written by every concurrent plan session, so "the paths this run wrote" and "the paths
  another run wrote" are the same path, and the partition has no cell for it.
- **Extending the base lock over the cleanup** — rejected. §2 writes throughout the interview, which runs
  far longer than the lock's five-minute staleness window, so the lock cannot span the window where the
  concurrent writes actually happen.
- **Carving out `CONTEXT.md` alone**, cleaning the per-feature files and leaving the glossary dirty —
  rejected as a bounded leak where a complete fix exists at the same size.

**Why.** The residue exists because two steps disagree about where the files live: §2 writes them where
the run is invoked, §6 commits them where the run's work belongs. Moving the write to match the commit
removes the shared file rather than serializing or repairing access to it, which is the same move ADR 0072
made one step earlier and for the same reason.

**Consequences.** No `/superdev:plan` step reads or writes the invoking checkout's design docs on the
new-feature path, so no cleanup, no lock, and no restore runs there, and a maintainer's own uncommitted
edits are untouched by a plan run. The scopetree is cut earlier than ADR 0072 cut it — at the first
capture rather than at §6 — which widens two known windows already recorded as triage records rather
than closed here: a run root stranded by an abandoned plan (invisible to `/superdev:backlog` and
unreapable by `hooks/scope-prune.js`), and two sessions planning the *same* feature, who now share files
inside one scopetree instead of in the invoking checkout. A capture held before the label settles lives
only in the conversation, so a session that ends there loses it — bounded by the label pick, which §1
reaches early.
