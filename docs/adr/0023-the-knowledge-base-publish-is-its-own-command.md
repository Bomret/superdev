# 0023 — The knowledge-base publish is its own command

**Status:** Accepted

## Context

`/superdev:document` sits between `/superdev:review` and `/superdev:ship`, so it runs while the scope
branch is unmerged and no pull request has been opened. Its in-repo pass is correctly placed: those
commits ride the scope branch, merge atomically with the code, and stay in the pull-request diff where a
reviewer reads prose beside the change.

Its knowledge-base pass is not. A remote knowledge base is a reader-facing surface, and on a
client-facing one a published page is a claim that the feature exists. The pass makes that claim from a
branch nobody has merged. A pull request that sits open leaves the page live and wrong, and superdev
offers no way to take it back.

This has happened in a consumer repo: a feature was implemented, the knowledge base was updated, the
pull request sat for a week, and clients called support about a feature that did not work.

`/superdev:plan` reaches the backend too, when it seeds the feature specification. That claim is earlier
still: it lands before any of the feature is built.

## Decision

Neither `/superdev:plan` nor `/superdev:document` calls a remote knowledge-base backend. For such a
backend each writes the page it would have published as a **staged page** under
`.superdev/kb-pending/<scope>/` — one file per page, YAML frontmatter carrying the page `title` and an
`action` of `upsert` or `delete`, the body below it. `/superdev:plan` stages under the feature label's
slug, which is the scope those pages belong to. A documentation pass outside a live scope run stages to
`.superdev/kb-pending/_adhoc/`. A local `docs/kb/` backend stages nothing and commits on the branch as
before, because its pages are repository files with no external surface.

The staging path is absolute, resolved from the invoking checkout. A lite-tier scope checkout is
`.superdev/scopes/<scope>/worktree`, inside `.superdev/` itself, and `/superdev:ship` removes it — a
working-directory-relative path would stage pages into the worktree and lose them at cleanup.

`/superdev:publish-kb` is the only path from superdev to a remote knowledge-base backend. It applies each
staged page's action, removes the file once the call lands, and leaves a failed page staged. It resolves
its scope argument the way `/superdev:ship` does. It warns once when the scope branch is not merged and
proceeds on confirmation, and it never blocks.

The operator decides when to run it. Superdev computes no gate.

Pending pages are visible rather than silent: `scripts/scope.js status` names every scope holding them,
and `/superdev:ship` prints the command for the scope it shipped. `/superdev:afk` never drives it —
telling clients about an unshipped feature with no human present is the failure this record removes.

## Considered options

- **Publish when the scope branch merges.** Merge is not client-visible. A repository that releases on a
  schedule keeps the same wrong page for a shorter time.
- **A configurable publish gate (`document | merge | release`).** Configuration standing in for a fact
  the operator already holds.
- **Draft at the backend, promote at release.** Confluence has drafts and the Codeberg Wiki does not, so
  it breaks the pluggable-backend contract.
- **A state stamp on the live page (`Unreleased — PR #123`).** The stamp needs the same later removal, so
  it labels the wrong claim instead of removing it.
- **A hook that publishes on a merge signal.** It puts a token and network calls in a deterministic hook,
  where a failure is silent.
- **Staging inside the run root.** `hooks/scope-prune.js` deletes a run root seven days past merge and
  would take unpublished pages with it. Staging outside the run root needs no hook change.
- **The name `/superdev:publish`.** It collides with the repository's own semantic-release vocabulary.
  `/superdev:kb-publish` disambiguates by surface, which buys grouping superdev has one command to group.

## Consequences

`agents/doc-writer.md` loses knowledge-base backend access. It writes files, so the subagent that carries
the SessionStart injection surface no longer holds a knowledge-base token. A drift assertion in
`scripts/drift-check.js` fails if `/superdev:plan`, `/superdev:document`, or the doc-writer regains a
backend call path. The invariant lives as prose in three documents, so a fourth writer added later is
what the assertion exists to catch.

A routine reconcile on the base branch costs two commands where it cost one. Superdev never learns when a
feature reaches a reader, so a staged page waits until an operator publishes it. The failure mode is a
missing page rather than a wrong one.
