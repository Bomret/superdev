# Assignee

The account every issue a run creates is assigned to, and the operator configuration file that names it beside the
operator's other settings. `## Assignee` states the generic contract, and the active `docs/agents/issue-tracker.md`
specialises it in a section of the same name.

## Assignee

**The assignee.** Applies to every issue a run creates, the epic and each slice. Assign it to the account
`.superdev/info.json` names, the **operator configuration** file. The identifier is one store-native value (a login
on Forgejo/GitHub, an `accountId` on Jira) under the `issue-tracker` role key, beside the name the store holds for
that account.

```json
{
  "issue-tracker": { "assignee": "<identifier>", "displayName": "<the account's name>" }
}
```

**Not a slice field.** Applies to the slice schema. The assignee gains **no row in `plan-contract.md`'s `## Fields`
table**. It is operator configuration, a property of the store and the run.

**`displayName`.** Applies to the `displayName` key. It is display-only. `/superdev:setup` writes it for a reader of
the file, and no issue-tracker call reads it.

- **A missing or wrong name** → never changes who is assigned.

**The file's keys.** Applies to every read and write of the file. The file holds one object per role. Every key is
optional, and a missing file, role, or key takes its default.

| Role | Key | Holds | Default | Valid range |
|------|-----|-------|---------|-------------|
| `issue-tracker` | `assignee` | the store-native identifier, or `none` | the token's own identity | a non-empty string |
| `issue-tracker` | `displayName` | the assignee's name, display-only | absent | a string |
| `code-host` | `pushTimeoutMs` | the bound of each network git call: the `scope.js push` fetch and push, the `scope.js contained` refetch, the `scope.js open` refetch at plan's cut, and the run-state ref's send, fetch, and delete, in milliseconds | `60000` | a whole number, 1 to 2147483647 |
| `verification` | `failToPassFloorMs` | the floor of the `fail-to-pass` run bound, in milliseconds | `10000` | a whole number, 1 to 2147483647 |
| `verification` | `failToPassControlMs` | the bound of the `fail-to-pass` control run, the run against the changed code, in milliseconds | `300000` | a whole number, 1 to 2147483647 |
| `knowledge-base` | `timeoutMs` | the bound of each knowledge-base backend command, in milliseconds | `30000` | a whole number, 1 to 2147483647 |
| `knowledge-base` | `teaLogin` | the `tea` login a Forgejo wiki's commands use | absent: one matching login is used, several stop the command | a login name `tea login list` reports |

- **A `/superdev:setup` write** → merges the key into the file, so every key already there stays.
- **A time bound outside its range** → it reads as absent and is named once on stderr.
- **A knowledge-base backend command** reads the whole `knowledge-base` section as `operator` in its `$1` values file.

**The file is untracked.** Applies to the file itself. `.superdev/` is git-ignored, so the file never reaches the
repository. It holds identifiers, display names, and time bounds, never credentials.

- **A token** → stays in the environment variable the active `docs/agents/issue-tracker.md` names.

**Read it from the main checkout.** Applies to every read of the file. Read it at `<main checkout>/.superdev/info.json`
from every checkout, a linked worktree included, never from a path relative to the working directory. The main
checkout is the parent of `git rev-parse --git-common-dir`, or the checkout that directory's `core.worktree` names
inside a submodule. `scope.js root <slug>` prints a run root and resolves no main checkout.

**Resolving the assignee.** Applies to every issue create.

- **No file, no `issue-tracker` key, or no `assignee`** → resolve the API token's own identity from the backend's
  whoami call, or its CLI login's identity, assign that, and report nothing.
- **`"assignee": "none"`** → create the issues unassigned, with no warning and no error.
- **Malformed JSON, or an `assignee` present but empty** → fall through to the token's own identity, and report it
  **once** for the whole run, naming the file. The run keeps its issues.

**Applied at creation.** Applies to the epic and every slice. Set the assignee when the issue is created, never in a
follow-up pass over issues that already exist.

**A bad assignee never costs the run its issues.** Applies to a store that rejects the configured assignee. Every
issue is still created, and nothing is retried more than once or rolled back.

- **The create itself is rejected because of the assignee** (the account does not exist, or cannot be assigned on this
  repo) → retry that one create **once, without the assignee**, and report it **once** for the whole run.
- **The create succeeds but the assignee comes back empty** (the token lacks the permission to assign and drops it
  silently) → read the assignee back from the created issue, however the store returns it. Empty while one was
  configured → report it **once** for the whole run.

**The backend specifics.** Applies to each store. The active `docs/agents/issue-tracker.md`'s own `## Assignee`
section owns the field name, the identifier format, which rejection shape the backend fails with, and the whoami call.
