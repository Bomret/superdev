# 0006: Scope run roots nest under `.superdev/scopes/`, not directly under `.superdev/`

**Status:** Accepted

**Context.** `/superdev:brainstorm` is near read-only but may jot a converged intent to a scratch file for
the user's reference. It was previously undefined where, so it landed as a loose, untracked file
wherever `cwd` happened to be (whatever branch was checked out), unlike every other superdev artifact,
which has a defined, git-ignored home. The natural fix is a scratch dir alongside the existing per-scope
run roots, for example `.superdev/brainstorm/`. That collides with how `/status` (and `hooks/run-lock.js`,
`hooks/worktree-sweep.js`) previously treated *every* top-level `.superdev/*/` directory as a scope run
root. A `.superdev/brainstorm/` directory sitting next to `.superdev/review-gaps/` or
`.superdev/impl-tier-split/` would be indistinguishable from a real scope until read.

**Decision.** All scope run roots move one level deeper: `.superdev/<scope>/` becomes
`.superdev/scopes/<scope>/` everywhere (DoD, ledger, progress logs, per-slice and scope worktrees, run
lock). Non-scope areas become siblings of `scopes/`, never nested inside it. Currently the only one is
`.superdev/brainstorm/<feature-slug>.md`. `/status` scans `.superdev/scopes/*/` exclusively.

**Why.** Cheap to do now (nothing yet depends on the flat layout outside this repo's own history). It is costly
later once external tooling or muscle memory forms around `.superdev/<scope>/`. Keeps the invariant that
anything directly under `.superdev/` is either `scopes/` (always a run root, machine-scanned) or a
named non-scope area (human-scratch, never scanned). There is no ambiguous middle ground a future
backend could misinterpret as a scope.

**Consequences.** `hooks/run-lock.js`'s guarded-create regex and lock path gain a `scopes/` segment (its
selftest fixtures updated to match). `hooks/worktree-sweep.js` needed no logic change. It already only
checks that a worktree path starts with `.superdev/` and that its immediate parent is named `worktrees/`,
independent of nesting depth. Only its explanatory comment was updated. `commands/status.md`,
`commands/implement.md`, `references/implement-{full,lite}.md`, the three review-agent progress-log
mentions, `docs/adr/0001-lite-scope-worktree.md`, `CONTEXT.md`, and `README.md` all had their
`.superdev/<scope>/` path literals updated to `.superdev/scopes/<scope>/`. Git branch-range expressions
of the form `<base>..superdev/<scope>` (the scope *branch*, no `.superdev/` path involved) were
deliberately left untouched. A sed pass initially over-matched these, because `..superdev/<scope>` is a
superstring of `.superdev/<scope>`. It was caught and reverted in the four affected spots.
