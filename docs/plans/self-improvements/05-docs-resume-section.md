# 05 — Resume section in /implement

depends-on: [04]
test-applicability: docs
status: todo

## spec

Add an explicit **Resume** subsection to `commands/implement.md`: on re-running `/superdev:implement` for
an existing scope, reconcile the ledger + `git log` + existing worktrees, treat already-merged slices as
done (never re-dispatch), rebuild the runnable set, and continue. Make the resume entry first-class
rather than implied, consistent with the existing "trust the ledger and `git log`" recovery note.

Depends on 04 because both edit `commands/implement.md` (serialize to avoid a merge conflict).

## acceptance

- implement.md has a Resume subsection describing ledger / git / worktree reconciliation and
  continue-from-here.
- Consistent with the existing ledger-as-recovery-map note (no contradiction).
