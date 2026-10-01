# 0111: Forgejo backends reach the host through tea only

**Status:** Accepted

## Context

The Forgejo slice-store and code-host seeds, and this repository's own `docs/agents/issue-tracker.md`,
`docs/agents/code-management.md`, and `docs/agents/knowledge-base.md`, reach the host through curl. Each
call carries an `Authorization: token` header built from a token env var, `GITEA_TOKEN` in this
repository. The seeds name the `tea` CLI only as an optional alternative.

`tea` holds the token in its own login configuration, so a caller that uses it names no env var and
builds no header. `tea` 0.16.0 does not cover every call with a subcommand, and some subcommands lose
semantics that the REST call keeps:

- `tea pr merge` sends no head-sha pin, so it cannot carry `head_commit_id`.
- `tea pr <n> -o json` carries no `merge_commit_sha`.
- `tea issues create -L` and `tea issues edit -L` resolve a label name only against the first 50-entry
  page of the repository's labels, and drop every other name without an error. This repository carries
  more than 50 labels, so `ready`, `mechanical`, and a new feature label were dropped at plan time.
- `tea labels create` makes a second label of an existing name without an error.
- `tea wiki list` returns an empty list with exit 0 when the wiki unit answers 404, so a disabled wiki
  reads as an absent page. `tea wiki view` gives exit 1 for a missing page and for every other error.
- `tea api` exits 0 on an HTTP 4xx or 5xx answer. Only `-i` shows the status line, on stderr.
- A `tea` call without `--login` falls back to another host's login when no login matches the current
  remote.

## Decision

The Forgejo seeds and this repository's Forgejo backend documents reach the host through `tea` only.
They name no token env var, no `Authorization` header, and no curl call.

- **A subcommand first, `tea api` for a gap.** An operation uses the `tea` subcommand that performs it.
  It uses `tea api <endpoint>` where no subcommand covers the call, or where the subcommand loses a
  semantic the operation depends on: the pinned squash merge, `merge_commit_sha`, the `has_wiki` toggle,
  every label write, applied by id, and every template of the knowledge-base backend command contract
  (ADR 0069).
- **A deciding `tea api` call reads its status.** It passes `-i` and reads the HTTP status from stderr,
  because the exit code carries none. A merge refusal still names 405 or 409 and relays the host's own
  message. The knowledge-base `find` template answers exit 2, "could not answer", on a non-200 listing,
  so a disabled wiki is never read as absence.
- **Every label write is read back.** A label write resolves each id from the paged label listing, and a
  label create checks that listing for the name first. After an issue create or a label edit, the caller reads the issue
  and compares its label names to the requested set. A mismatch is reported to the operator and stops the
  write.
- **The login is resolved from the host URL.** Every call passes `--login <name> --repo <owner>/<repo>`.
  The name is the one entry of `tea login list -o json` whose `url` equals the configured host. Nothing
  stores it. Zero matches, or no `tea` on the path, stops the step with the exact `tea` command it would
  have run; it never falls back to a token env var. Two or more matches are named, and the operator
  picks. The matched entry's `user` is the token's own identity, the Forgejo assignee default
  (ADR 0073).
- **`merge-guard` blocks the `tea api` merge.** A subagent's `tea api` POST to a pull request's
  `/merge` endpoint is blocked, the same as `tea pr merge`. A GET to that endpoint is not.

**Amended: the `gh api` merge is blocked too.** A subagent's `gh api` PUT or POST to a pull request's
`/merge` endpoint is blocked by the same rule (triage #793). A GET to that endpoint is not.

## Considered options

- **`tea` first, REST as a fallback.** Rejected: it documents every operation twice and keeps the token
  env var in the seeds. An adopter without `tea` still gets the degrade path.
- **`tea api` for every call.** Rejected: it is the smallest change, but it discards the readable
  subcommands where they are faithful.
- **Subcommands only, `tea api` only where no subcommand exists.** Rejected: the knowledge-base publish
  would then read a disabled wiki as an absent page, and pass page content through argv.
- **Store the login name**, in `.superdev/info.json` or in a tracked config document. Rejected: the
  name is local `tea` configuration that differs per maintainer, and the host URL already selects it.
- **Check the label names once before a batch, or not at all.** Rejected: a pre-check misses a label
  lost during the batch, and no check leaves a slice without its `ready` or feature label invisible to
  `/superdev:implement`.

## Consequences

An adopter with a Forgejo backend installs `tea` and adds a login for the host. `RELEASING.md` keeps
its `GITEA_TOKEN`: semantic-release reads that env var itself, and it is no backend call. The behaviour
against a live Codeberg host (the label read-back, the pinned merge, a wiki publish) is verified at the
first ship and publish after merge, never on the branch.
