# Assignee

The account every issue a run creates is assigned to, and the operator configuration file that names it
beside the operator's other settings. `## Assignee` states the generic contract, and the active
`docs/agents/issue-tracker.md` specialises it in a section of the same name.

## Assignee

Assignee is operator configuration, not a slice field. Every issue a run creates — the epic and each
slice — is assigned to the account named by `.superdev/info.json`, the **operator configuration** file: a
single store-native identifier (a login on Forgejo/GitHub, an `accountId` on Jira), under the
`issue-tracker` role key, beside the name the store holds for that account.

```json
{
  "issue-tracker": { "assignee": "<identifier>", "displayName": "<the account's name>" }
}
```

`displayName` is display-only: `/superdev:setup` writes it for a reader of the file, and no
issue-tracker call reads it, so a missing or wrong name never changes who is assigned.

The file holds one object per role. Every key is optional, and a missing file, role, or key takes its
default. `/superdev:setup` writes a key by merging it into the file, so every key already there stays.

| Role | Key | Holds | Default | Valid range |
|------|-----|-------|---------|-------------|
| `issue-tracker` | `assignee` | the store-native identifier, or `none` | the token's own identity | a non-empty string |
| `issue-tracker` | `displayName` | the assignee's name, display-only | absent | a string |
| `code-host` | `pushTimeoutMs` | the bound of each network git call: the `scope.js push` fetch and push, and the run-state ref's send, fetch, and delete, in milliseconds | `60000` | a whole number, 1 to 2147483647 |
| `verification` | `failToPassFloorMs` | the floor of the `fail-to-pass` run bound, in milliseconds | `10000` | a whole number, 1 to 2147483647 |
| `verification` | `failToPassControlMs` | the bound of the `fail-to-pass` control run, the run against the changed code, in milliseconds | `300000` | a whole number, 1 to 2147483647 |
| `knowledge-base` | `timeoutMs` | the bound of each knowledge-base backend command, in milliseconds | `30000` | a whole number, 1 to 2147483647 |
| `knowledge-base` | `teaLogin` | the `tea` login a Forgejo wiki's commands use | absent: one matching login is used, several stop the command | a login name `tea login list` reports |

A time bound outside its range reads as absent and is named once on stderr. A backend command reads the
whole `knowledge-base` section as `operator` in its `$1` values file.

The assignee deliberately gains **no row in `plan-contract.md`'s `## Fields` table**. Assignee names who
owns work inside a tracker — a property of the store and the run, not of a slice.

**The file is untracked, and that is the decision.** `.superdev/` is git-ignored, so an identifier
belonging to one person never reaches a repository several people maintain. It holds
identifiers, display names, and time bounds, never credentials: a token stays in the environment variable the active
`docs/agents/issue-tracker.md` names.

- **Read it from the main checkout, never from a path relative to the working directory.** `scope.js
  root` resolves the main checkout (the parent of `git rev-parse --git-common-dir`, or the checkout that
  directory's `core.worktree` names inside a submodule) from any checkout, a linked worktree included. A
  linked worktree carries no `.superdev/` of its own, so a path relative to the working directory would
  find nothing there. The file sits at `<main checkout>/.superdev/info.json` from every checkout.
- **No file, no `issue-tracker` key, or no `assignee`** → resolve the API token's own identity from the
  backend's whoami call, or its CLI login's identity, and assign that, reporting nothing. Every issue-backed repo gets owned issues
  without configuring anything.
- **`"assignee": "none"`** — create the issues unassigned. A deliberate choice, not a failure: no warning,
  no error.
- **An unusable file never costs the run its issues** — malformed JSON, or an `assignee` present but
  empty, falls through to the token's own identity and is reported **once** for the whole run, naming the
  file. A typo costs a line of output, never a completed interview.
- **Applied at creation** — the assignee is set when the issue is created, for the epic and every slice.
  Never a follow-up pass over issues that already exist.
- **A bad assignee must never cost the run its issues** — `/plan` fires every slice create in parallel, so
  one misconfigured identifier must not fail the batch. A store rejects an unassignable configuration one
  of two ways, each with its own recovery:
  - **The create itself is rejected because of the assignee** (the account doesn't exist, or can't be
    assigned on this repo) — retry that one create **once, without the assignee**, so the issue still
    exists; report it **once** for the whole run.
  - **The create succeeds but the assignee comes back empty** (the token lacks the permission to assign,
    and drops it silently) — read the assignee back from the created issue, however the store returns it; if
    it's empty while one was configured, report it **once** for the whole run.

  Either way every issue is still created, and nothing is retried more than that one time or rolled back.

The field name, identifier format, which of the two shapes a given backend fails with, and the whoami
call are per-backend and live in the active `docs/agents/issue-tracker.md`'s own `## Assignee`
section.
