# 0274: Wrap-up offers to delete the scope branch

**Status:** Accepted

**Amends:** [ADR 0071](0071-the-prune-reaps-the-scope-branch-with-its-run-root.md), whose prune stays the
silent backstop for the local ref, and [ADR 0106](0106-verifying-and-closing-a-shipped-scope-are-separate-human-only-commands.md)
point 3, whose cleanup kept the scope branch.

**Context.** `/superdev:wrap-up` closes a shipped scope and removes its scopetree and slicetrees, and its
cleanup keeps the scope branch. `hooks/scope-prune.js` deletes the local ref and its remote-tracking copies
seven days after the run reads `closed`, once base contains the branch (ADR 0071). Nothing in superdev
deletes the branch on the remote. A host that deletes a pull request's head branch on merge removes it
there; a host configured otherwise keeps one dead remote branch per shipped feature, and the operator
deletes each by hand.

**Decision.** Wrap-up asks the operator once, in its cleanup, whether to delete the scope branch, local and
remote together, now. It asks only when base contains the branch, and a no keeps both, leaving the prune's
reap of the local ref as it is.

- **The check lives in code.** `scope.js branch delete --root <run-root> --base <base> [--remote <remote>]`
  reads the ledger's `**Branch:**` line, tests containment itself, and deletes only a contained branch. The
  prose asks and calls the verb; it carries no git deletion of its own.
- **The remote delete is leased** on the tip the containment test judged. A remote branch that moved since
  keeps its commits and is reported. A remote branch already gone counts as deleted. The remote-tracking ref
  is deleted only once the remote branch reads deleted or gone, so a kept remote branch keeps its pointer
  in the clone.
- **A failed delete never blocks the close.** The anchor is closed before the ask, so the verb reports
  what it could not delete and the stage write still runs.
- **The ask follows the tree removal**, because git refuses to delete a branch a worktree has checked out.

**Why.** The containment proof wrap-up's gate already relies on is the proof a delete needs, and the
operator is present at that moment. Asking keeps a branch the operator still wants, such as one a later
feature will reuse by name, and the lease keeps a delete from taking commits nobody tested.

**Considered options.** *Two asks, local and remote apart.* Rejected: an operator who keeps one ref and
deletes the other is rare, and the prune already reaps a kept local ref. *Delete on the merged check alone.*
Rejected: a branch can carry commits pushed after the merge, and the merged check reads the pull request,
not the branch. *Git commands in the skill prose.* Rejected: a containment gate in prose holds only as far
as the model follows it, and a verb gets a suite. *Delete without asking.* Rejected: the branch name may
still matter to the operator, and a remote delete is outward-facing.

**Consequences.** Wrap-up's **No extra question** rule names this ask as its one exception. A deleted
branch reads gone to the prune, which then reaps the run root on its TTL with no containment test
(ADR 0053). A branch deleted in error is recovered from the reflog locally, and from the host only where it
keeps deleted branches.
