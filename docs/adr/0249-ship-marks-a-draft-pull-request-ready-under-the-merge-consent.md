# 0249: Ship marks a draft pull request ready under the merge consent

**Status:** Accepted

## Context

The code-host seeds default the pull-request posture to `draft`, and the GitHub seed says the user flips
the pull request to ready. `/superdev:ship` merges through the host's merge API, and GitHub refuses to
merge a draft. Between 2026-11-10 and 2026-11-17 ship stopped on "still a draft" for eight pull requests
across two consumer repositories. Each time the operator typed a second instruction, such as "Mark ready,
ship", and ship ran again.

The operator's yes to ship's offer is already the merge consent (ADR 0157). A pull request the operator
consents to merge is a pull request the operator considers ready.

## Decision

Each code-host seed states a **Mark ready** call: `gh pr ready <n>` on GitHub, and
`tea pr edit <index> --ready` on Forgejo. `/superdev:ship` reads the pull request's draft state before the
merge. A draft pull request is marked ready through that call, under the same merge consent, and the merge
follows. A code-management document that states no Mark ready call leaves ship refusing a draft as it does
without this decision, and the refusal names `/superdev:setup`, whose re-run offers the call as a seed gap
(ADR 0107).

The seeds keep `draft` as the default posture.

## Considered options

- *Default the seeds' posture to `ready`.* Rejected: it changes nothing for a repository whose document
  already says `draft`, and the draft posture still keeps an unreviewed pull request out of reviewers'
  queues until the operator's consent.
- *Ask a second question before marking ready.* Rejected: the merge consent already covers the pull
  request leaving draft, and a second question is the extra turn the runs showed.

## Consequences

A draft pull request no longer stops ship when the operator has consented to the merge. A consumer
repository with a code-management document older than this decision keeps the refusal until a setup re-run
adds the call.
