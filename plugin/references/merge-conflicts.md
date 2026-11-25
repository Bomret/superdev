# Merge-conflict resolution

**Resolve by intent.** Applies to a controller's conflicted merge: in the DAG loop, and in the base merge of
`scope-branch.md`'s `## Bringing the scope branch to base`. Resolve each hunk by what each side **meant**, read from
that side's primary sources. In the DAG loop those are each slice's `spec`, progress log, and commit messages. In the
base merge the scope side's are its own commit messages and its slices' `spec`s, and the base side's are the base
commits' own messages.

- **Trace both sides to their sources first.** Read what each side was building before you touch the hunk. A
  resolution from the conflict markers alone is a guess.
- **Additive conflicts take the union.** Where each side added something to the same place (list, enum, or `switch`
  entries, attributes, test methods, doc bullets), keep every addition from both sides. Never delete a sibling's test
  to make the merge compile.
- **Compatible intents compose.** Where two sides changed the same lines for different, non-competing reasons, write
  the version that honours both specs, and say so in one line.
- **Never invent new behaviour in a resolution.** The merged result does only what the two sides' sources already
  claim.

**A numbering collision moves this scope's number.** Applies to an ADR file or an invariant register entry this scope
added, whose number another side also took, whether or not git reports a conflict. `scope.js collisions` finds each
collision and prints the next number free on both sides and on every other live plan run (`skills/plan/SKILL.md`'s
shared-identifier check). Move this scope's file or entry to that number, update every citation of the old number on
the scope branch in the same resolution, and name each renumber, old and new, in the report.

- In the base merge, base's number never moves.

**Conclude a resolved conflict with `git -c commit.cleanup=scissors -C <run-root>/scopetree merge --continue`.**
Applies to every resolved conflict. Stage the resolution first. The merge's own `-F <file>` message waits in
`MERGE_MSG`, and the scissors cleanup keeps every line of it while dropping git's `# Conflicts:` block. Spell
`<run-root>` out as the real absolute path in the command text, never as a shell variable: `hooks/merge-guard.js`
reads the command text alone.

**A failed merge with no `MERGE_HEAD`.** Applies to a controller's merge in the scopetree that exited non-zero and
left no `MERGE_HEAD` (`git -C <run-root>/scopetree rev-parse -q --verify MERGE_HEAD` finds none). It recorded
nothing. Relay git's output, check that `git -C <run-root>/scopetree status --porcelain` shows the scopetree
unchanged, and stop and escalate. **`--unattended` → block** (`scope-mode.md`'s `## Unattended`).

**A refusal is no conflict.** Applies to a merge that exited non-zero and left `MERGE_HEAD` set, before any branch
reads it as a conflict. Run `git -C <run-root>/scopetree diff --name-only --diff-filter=U`. An empty listing means a
hook or git refused to record the merge commit, so take **A refused merge**. A listing names a conflict, resolved or
escalated above.

**A refused merge.** Applies to a refusal (`references/commit-messages.md`'s `## A refused commit or merge`). Report
git's own output, stop, and escalate to the operator. **`--unattended` → block** (`scope-mode.md`'s `## Unattended`).

- **A refused first attempt** → run `git -C <run-root>/scopetree merge --abort` before you stop. The scopetree is clean
  again.
- **A refused `merge --continue`** after a resolution → leave the merge in place with its staged resolution. The next
  base step's **Check the scopetree first** stops on the set `MERGE_HEAD` until the operator concludes it.
- **A refused slice merge** → the slice stays unmerged with its slicetree. Record it `blocked` in the ledger and in the
  store, and append the line `merge refused` to its progress log, `<run-root>/reports/<id>/progress.md`.
  `implement-full-resume.md` reads that line and merges the slicetree again, never re-dispatching an implementer.
- **A refused integration-branch merge** → the scopetree stays on the scope branch. Record the integrate-and-verify
  slice `blocked`, append `merge refused` to its progress log the same way, and `implement-full-resume.md` runs its
  merge again.

**A genuine winner-picking overlap escalates.** Applies to the same decision made two incompatible ways, where
honouring one spec violates the other. Compatible intents on the same lines compose instead.

1. List the conflicting files: `git -C <run-root>/scopetree diff --name-only --diff-filter=U`.
2. Run `git -C <run-root>/scopetree merge --abort`. The scopetree is clean again.
3. Stop, dispatching no slice, and escalate to the operator, who resolves the conflict. **`--unattended` → block**
   (`scope-mode.md`'s `## Unattended`).
