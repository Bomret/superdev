# 0058: A base lock guards the base-branch design-docs commit, atomic file-create only, no hook

**Status:** Superseded by [ADR 0079](0079-a-planned-ledger-hands-the-scope-branch-from-plan-to-implement.md),
which removes the base-branch commit the lock guards, and with it the lock.

**Context.** `/superdev:plan` §6 and `/superdev:implement`'s run init both commit `CONTEXT.md`, ADRs, and
`.claude/rules/` directly to the base branch from the invoking checkout, gated only by
`git rev-parse --abbrev-ref HEAD` reading base. Nothing serializes that step: two sessions in the same
invoking checkout — two `/plan` runs, or a `/plan` racing run init's own re-check — can both pass that
check at once and edit, commit, and push concurrently, racing on the same files.

**Decision.** `scope.js` gains `base-lock acquire`/`base-lock release`, guarding `.superdev/base.lock` (a
repo-level lock, sibling to `.superdev/scopes/` and `.superdev/brainstorm/` — this is not a per-scope
concern). `acquire` does an exclusive file-create (`wx`): it fails when a fresh lock already exists,
succeeds and reclaims a stale one (older than 5 minutes) otherwise. Both call sites acquire before
touching any of the three file groups and release once the commit (and push, if any) completes. No
PreToolUse hook backs this. The atomic file-create is the whole correctness guarantee.

**Considered options.**
- **A PreToolUse hook**, mirroring `ledger-guard.js`'s "deny any path but the sanctioned one" shape —
  rejected. That shape works for `ledger.md` because nothing is ever supposed to write it directly, so
  the hook can block every direct write unconditionally. A base-commit guard would need to block only a
  *competing* session, and nothing here carries session identity to tell "my own fresh lock" from
  "someone else's" — the hook would block the very session that just acquired the lock.
- **Retry on push rejection, no lock at all** — rejected. Smooths over a failed push but does nothing
  about two sessions editing the same files locally before either commits.
- **Route the base commit through a PR** — rejected. Moves the conflict to a normal PR-merge, but adds a
  blocking wait to run init that does not exist today, for a fix this size.

**Why.** `run-lock.js`'s real backstop was never the hook itself — it is `git worktree add -b`'s own
atomic refusal when the branch already exists; the hook only adds an earlier, friendlier message before
that. The same trick applies directly here: an exclusive file-create is atomic across processes by
construction, so it needs no hook to be correct, only prose discipline at the two call sites that exist.
Hard to reverse only in the sense that a later engineer might "fix" the missing hook without knowing why
one was skipped — this record is what stops that.

**Consequences.** A second concurrent base-commit attempt gets a clear failure from `acquire` before it
touches any file, not a race. A crashed session's lock self-clears after 5 minutes. A maintainer who
hand-edits `CONTEXT.md`/an ADR outside `/plan` and `/implement` entirely bypasses the lock, same as
`ledger.md`'s guard only covers the paths it actually inspects — out of scope, since the problem this
solves is two *superdev* sessions racing, not an unrelated manual edit. The lock covers the stage,
commit, and push, not the interview that precedes them: `/superdev:plan` writes `CONTEXT.md`, an ADR, or
a `.claude/rules/` file to disk the moment each crystallises, well before §6 ever calls `acquire`. Two
`/plan` interviews running concurrently in the same checkout can still edit the same design docs in the
working tree before either reaches §6 — holding the lock from the interview's start would outlast this
lock's own five-minute staleness window, so it is not held there.
