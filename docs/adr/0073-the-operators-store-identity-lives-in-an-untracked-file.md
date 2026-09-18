# 0073: the operator's slice-store identity lives in an untracked file

**Status:** Accepted

**Context.** The **Assignee** (ADR 0010) is a store-native identifier for one person — a Forgejo or GitHub
login, a Jira `accountId`. It is recorded as a configuration bullet in `docs/agents/issue-tracker.md`, a
file `/superdev:setup` writes and the repository tracks. A repository maintained by several people
therefore carries one maintainer's account identifier in its history, and every other maintainer's
`/superdev:plan` run files issues against that account. The absent-bullet fallback — resolve the API
token's own identity — already avoids both problems, but only for a repository where nobody ever wrote
the bullet.

**Decision.** The assignee moves out of tracked configuration into `.superdev/info.json`, an untracked
file keyed by backend **role**:

```json
{
  "issue-tracker": { "assignee": "<accountId>" }
}
```

`.superdev/` is already git-ignored as run scratch, so the file is untracked by construction rather than
by a rule somebody must remember. Resolution is two levels — the file, else the token's own identity
through the backend's whoami endpoint. The tracked bullet is removed from every issue seed rather than
kept as a third level, so there is exactly one place an identifier can live.

Four boundaries keep the change local:

- **The read anchors on the main checkout.** `/superdev:plan` commits from the invoking checkout today.
  ADR 0072 is the pending move that would put a new-feature, design-docs-producing plan into its own
  scope worktree. That worktree carries no `.superdev/` of its own, so a path relative to the working
  directory would find nothing there. `git rev-parse --path-format=absolute --git-common-dir` resolves the
  main checkout's `.git` from either location, whose parent holds the file. This is why the mechanism
  needs no edit when that move lands.
- **An unusable file never costs the run its issues.** Malformed JSON, or an absent or empty
  `issue-tracker.assignee`, falls through to the token's identity and is reported once for the whole run
  — the posture `plan-contract.md` already takes toward an assignee the store rejects.
- **`"assignee": "none"` carries the unassigned opt-out** the removed `Assignee: none` bullet carried,
  as a string rather than `null`, because absent and null would otherwise mean two different things.
- **The `## Assignee` section stays in every seed.** It is a member of the specialising family's
  store-side presence contract; only the configuration bullet is removed, and the section is rewritten to
  read the file.

A stale bullet left in an adopter's tracked configuration is inert. `/superdev:plan` reads that file
anyway, so it reports the bullet once per run and names the move — the only migration path that reaches
an adopter, since `/superdev:upgrade` touches no consumer configuration and `drift-check` is
maintainer-only.

**Considered options.**

- **`git config superdev.assignee`.** Untracked per repository and per user, shared across worktrees, no
  new file format, a one-line read. Lost on discoverability: nothing about a repository tells a new
  maintainer to look in `.git/config`, while a file under `.superdev/` sits beside run state they already
  know.
- **A `SUPERDEV_ASSIGNEE` environment variable.** No file at all, and it matches how tokens are already
  handled — named in configuration, valued in the environment. Lost because it holds one value, leaving a
  repository whose slice store and code host are different products nowhere to put a second identifier.
- **Keep the tracked bullet as a team default, with the file overriding it.** Preserves a repository-wide
  default and the existing `Assignee: none` spelling. Lost because it makes resolution three levels deep,
  every seed must honour the precedence, and the personal identifier stays in git for anyone who keeps
  using the bullet — which is the problem.
- **Key the file by product (`jira`, `github`) rather than by role.** Survives a repository switching
  backends with both entries intact. Lost because a repository has exactly one slice store, so the role
  key is unambiguous and matches the names `docs/agents/` and the seed filenames already use.
- **Leave a stale bullet inert and undocumented.** Zero work. Lost because the identifier already
  committed stays in git indefinitely and nobody is told, which leaves the original leak in place for
  every repository set up before this change.
- **Remove the stale bullet when `/superdev:setup` is re-run.** Setup already rewrites the file. Lost
  because its own prose directs a re-run only when switching backends, so most adopters never trigger it.
- **Stop the plan on an unusable file.** Detectable before the first create, unlike a bad account, and
  leaves nothing half-written. Lost because it spends a completed interview on a typo.

**Consequences.**

- A maintainer configures the identifier once per repository, in a file no commit can carry. `git grep`
  over an adopter's repository finds no account identifier once the stale bullet is removed.
- **A fresh clone has no `.superdev/info.json`.** Every maintainer configures it again per checkout, and
  a clone that skips the step assigns to the token's identity silently. This is the price of keeping the
  file repository-local rather than putting it under the user's home directory, and is accepted.
- `drift-check`'s assignee check inverts its configuration-bullet half: it forbids the `- **Assignee:**`
  bullet where it once required it, and keeps requiring the `## Assignee` section. This makes `assignee`
  the one member of the specialising family whose halves pull opposite ways, and the check reports both
  expectations rather than losing one.
- `.superdev/` gains a file that is not run scratch. `scope-prune` and `worktree-sweep` both operate on
  `.superdev/scopes/<scope>/` alone, so neither reaps it, but the directory is no longer purely
  disposable.
