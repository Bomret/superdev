# 0110: The local-file slice store is removed

**Status:** Accepted

**Amends:** [ADR 0106](0106-verifying-and-closing-a-shipped-scope-are-separate-human-only-commands.md).

**Supersedes:** [ADR 0048](0048-a-local-store-triage-record-needs-its-scope-to-ship.md).

## Context

`references/issue-tracker-local.md` is a slice store that keeps a feature's plan as markdown files under
`docs/plans/<type>/<slug>/`. Every other seed (GitHub, Forgejo, Jira) keeps its records on a remote
backend.

The local store is not used. Its cost is carried on every new or changed feature. It commits its own
writes on the scope branch: slice status moves, Definition-of-Done ticks, triage records, and the anchor
close. Store-neutral contracts carry a mechanism for each of those that no other seed uses:

- `scope.js suite reusable --plan-files`, which reuses a green suite record across plan-file commits.
- A `## Release` declaration that features are released when written.
- Append-mode numbering continuation.
- A triage record that reaches the backlog only once its scope branch merges (ADR 0048).
- An anchor close that `/superdev:submit-pr` commits on the scope branch before its push.
- Drift-check exemptions from the assignee, release-removal, and candidate-listing contracts.

## Decision

Delete the local-file slice store: its seed, its `/superdev:setup` option, and every mechanism above.
Every sentence that names it as a present store is rewritten around the remote stores, or removed.

A mechanism that no remaining store uses is deleted in the same change as the store. It is not kept as a
neutral extension point for a hand-written "Other" backend.

Keep the snapshot-less run-state posture, because Jira's seed takes it by default. Keep the local-file
knowledge base (`references/knowledge-base-local.md`), which is a different backend.

Keep `/superdev:backlog`'s rows for a `shipped` run root whose anchor is already closed. A human can close
an anchor by hand on any store, and the rows are what keep a stalled deploy or an unwrapped run visible
then.

A consumer repository whose `docs/agents/issue-tracker.md` is a copy of the old local seed gets no
special handling. `/superdev:setup` reads it as a hand-written "Other" backend.

## Considered options

- **Remove the store, keep its mechanisms as neutral hooks.** `--plan-files` and the released-when-written
  declaration stay available to an "Other" backend. Rejected: drift-check rows keep pinning two
  mechanisms with no user, which keeps the cost this removal exists to end.
- **Deprecate first, remove in a later release.** `/superdev:setup` stops offering the store, and the
  seed stays for one release. Rejected: the store has no users, so a grace period protects no one.

## Consequences

- Every slice store keeps its records off the scope branch. A green suite record is reused only on the
  exact commit it was recorded on (INV-0017).
- `/superdev:plan` asks the release question on every store.
- Every seed is held to every store contract in `drift-check`, with no exemption.
- `plan-contract.md` shows no rendering of its own. Each seed renders the contract.
- Restoring the store means restoring deleted files from this repository's history.
