# Assignee

The account every issue a run creates is assigned to, the **Claim** `/superdev:implement` writes over that assignment,
and the operator configuration file that names the account beside the operator's other settings. `## Assignee` and
`## Claim` state the generic contracts, and the active `docs/agents/issue-tracker.md` specialises each in a section of
the same name.

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
| `code-host` | `pushTimeoutMs` | the bound of each network git call: the `scope.js push` fetch and push, the `scope.js contained` refetch, the `scope.js open` refetch at plan's cut, the run-state ref's send, fetch, and delete, and `/superdev:setup`'s push offer, in milliseconds | `60000` | a whole number, 1 to 2147483647 |
| `verification` | `failToPassFloorMs` | the floor of the `fail-to-pass` run bound, in milliseconds | `10000` | a whole number, 1 to 2147483647 |
| `verification` | `failToPassControlMs` | the bound of the `fail-to-pass` control run, the run against the changed code, in milliseconds | `300000` | a whole number, 1 to 2147483647 |
| `verification` | `testSlots` | the test-slot count: how many `test`, `fail-to-pass`, and `prepare` runs of the repository run at once on this machine (ADR 0291) | `1` | a whole number, 1 to 64 |
| `knowledge-base` | `timeoutMs` | the bound of each knowledge-base backend command, in milliseconds | `30000` | a whole number, 1 to 2147483647 |
| `knowledge-base` | `teaLogin` | the `tea` login a Forgejo wiki's commands use | absent: one matching login is used, several stop the command | a login name `tea login list` reports |

- **A `/superdev:setup` write** → merges the key into the file, so every key already there stays.
- **A time bound or the test-slot count outside its range** → it reads as absent and is named once on stderr.
- **A knowledge-base backend command** reads the whole `knowledge-base` section as `operator` in its `$1` values file.

**The file is untracked.** Applies to the file itself. `.superdev/` is git-ignored, so the file never reaches the
repository. It holds identifiers, display names, time bounds, and the test-slot count, never credentials.

- **A token** → stays in the environment variable the active `docs/agents/issue-tracker.md` names.

**Read it from the main checkout.** Applies to every read of the file. Read it at `<main checkout>/.superdev/info.json`
from every checkout, a linked worktree included, never from a path relative to the working directory. The main
checkout is the parent of `git rev-parse --git-common-dir`, or the checkout that directory's `core.worktree` names
inside a submodule. `scope.js root <slug>` prints a run root and resolves no main checkout.

**Resolving the assignee.** Applies to every issue create.

- **No file, no `issue-tracker` key, or no `assignee`** → resolve the API token's own identity, or its CLI login's
  identity, through the store's **Resolve the operator** call (`## Claim`), assign that, and report nothing.
- **`"assignee": "none"`** → create the issues unassigned, with no warning and no error.
- **Malformed JSON, or an `assignee` present but empty** → fall through to the token's own identity, and report it
  **once** for the whole run, naming the file. The run keeps its issues.

**Applied at creation.** Applies to the epic and every slice. Set the assignee when the issue is created. The one
follow-up write over issues that already exist is the claim, which `/superdev:implement` alone makes (`## Claim`).

**A bad assignee never costs the run its issues.** Applies to a store that rejects the configured assignee. Every
issue is still created, and nothing is retried more than once or rolled back.

- **The create itself is rejected because of the assignee** (the account does not exist, or cannot be assigned on this
  repo) → retry that one create **once, without the assignee**, and report it **once** for the whole run.
- **The create succeeds but the assignee comes back empty** (the token lacks the permission to assign and drops it
  silently) → read the assignee back from the created issue, however the store returns it. Empty while one was
  configured → report it **once** for the whole run.

**The backend specifics.** Applies to each store. The active store document's own `## Assignee` section owns the
field name, the identifier format, and which rejection shape the backend fails with. Its `## Claim` section owns the
whoami call, **Resolve the operator**, which the plan seed's `## Assignee` section and `/superdev:setup` cite.

## Claim

**The claim.** Applies to every reader and writer of a scope anchor's assignees: `/superdev:status` reads it, and
`/superdev:implement` reads and writes it. An anchor is claimed by someone else when it carries at least one assignee
and the operator is none of them. An unassigned anchor is unclaimed.

**The operator.** Applies to every claim read. Resolve the operator's identity once per command:

- **`issue-tracker.assignee`** from `.superdev/info.json`, read per **Read it from the main checkout** above → that
  identifier is the operator.
- **No file, no key, `"none"`, malformed JSON, an empty value, or a value the store document names as no person (a store document may name none, and only Jira's `"-1"` exists today)** →
  the store's **Resolve the operator** call answers. `"none"` opts out of assigning, never out of being someone.

**Comparing identities.** Applies to every match of the operator against an assignee. Compare in the store's native
identifier form: a login case-insensitively, an id exactly.

**The three calls.** Applies to every store document's `## Claim` section, which states each call in its own
conventions:

- **Resolve the operator** → the token's or CLI login's own identifier, in the form the store assigns by.
- **Read an issue's assignees** → the identifiers an issue is assigned to, an empty list for an unassigned issue.
- **Replace an issue's assignees** → set the issue's assignees to exactly the given identifier, then read them back.

**A gap means no check.** Applies to a store document with no `## Claim` section, and to a resolve or read that
fails. The command checks no claim and writes none, says so once, naming the `/superdev:setup` re-run that offers the
missing section, and otherwise runs as it would without a claim.

**A replace is best-effort.** Applies to every **Replace an issue's assignees**. A replace the store rejects, or one
the read-back shows dropped, is reported once for the whole claim, naming each issue it failed on. The caller
continues.
