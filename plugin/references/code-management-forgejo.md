# Code host: Forgejo / self-hosted (Gitea-compatible)

Code lives on a Forgejo (or Gitea) instance. Use the `tea` CLI if installed, otherwise the REST API.

## Configuration (fill in at setup)

- **Base URL**: `<https://git.example.com>`
- **Owner / repo**: `<owner>/<repo>` (confirm with `git remote -v`).
- **Remote**: `origin`. Confirm with `git remote -v`.
- **Auth**: API token in env var `<FORGEJO_TOKEN>`. Record the env-var NAME here, never the secret.
- **Tooling**: `<tea>` or `<rest>`.
- **Default PR posture**: `draft` (override: `ready` | `push-only`).
- **Base branch**: the branch the scope branch was cut from (default `main`).

## tea CLI conventions

- **Login (once)**: `tea login add --url <base> --token $FORGEJO_TOKEN`.
- **Push**: `git push -u origin <scope-branch>`.
- **Open PR**: `tea pr create --repo <owner>/<repo> --base <base> --head <scope-branch>
  --title "<title>" --description "<body>"`. (Forgejo opens ready; convert to draft in the UI if
  needed, or prefix the title with `WIP:` — Forgejo treats `WIP:` titles as drafts.)
- **Report**: `tea pr list --repo <owner>/<repo>` to read the new PR URL/number.

## REST conventions (curl)

Auth header: `-H "Authorization: token $FORGEJO_TOKEN"`, `-H "Content-Type: application/json"`.

- **Open PR**:
  `POST <base>/api/v1/repos/<owner>/<repo>/pulls` with
  `{ "base": "<base>", "head": "<scope-branch>", "title": "<title>", "body": "<body>" }`.
  Prefix the title with `WIP:` for draft behavior.
- **Read**: `GET <base>/api/v1/repos/<owner>/<repo>/pulls/<index>`.

## Degrade when no CLI / token

Push the branch, then print the instance compare URL
(`<base>/<owner>/<repo>/compare/<base>...<scope-branch>`) and the exact `tea`/curl command to run.
The merge call below degrades the same way: print the exact REST call and merge nothing.

## Merge

- **Read the pull request**: `GET <base>/api/v1/repos/<owner>/<repo>/pulls/<index>` →
  `state` (`open`/`closed`), `merged` (bool), `merge_commit_sha` (once merged), `head.sha`, and
  `mergeable` (bool).
- **Merge it, pinned**: `POST <base>/api/v1/repos/<owner>/<repo>/pulls/<index>/merge` with
  `{ "Do": "squash", "MergeTitleField": "<pr-title>", "head_commit_id": "<tested-tip-sha>" }`.
  `head_commit_id` pins the merge to that sha: the host answers 409 when the head moved since. Never
  send `force_merge` — that field overrides branch protection and required approvals, and this seed
  never sets it. `tea pr merge` carries no head-pin of its own, so use the REST call above rather than
  the CLI for this one step.
- **A refusal names the reason**: 405 means the pull request cannot be merged (an unmet required
  approval or protection rule, or it is already merged/closed); 409 means the head moved since it was
  read, or a conflict exists. Relay the host's own message to the operator instead of retrying.
- **Find an open pull request by its head branch** (a fallback, when no index is on hand):
  `GET <base>/api/v1/repos/<owner>/<repo>/pulls?state=open` — Gitea/Forgejo carries no `head` query
  parameter, so filter the returned array client-side by `head.ref` matching the scope branch. The list
  paginates (`page`, `limit` query params; `limit` capped at the server's `MAX_RESPONSE_ITEMS`, 50 by
  default): page through every page — the `Link` response header names the next one — before counting
  matches, or a match sitting on a later page reads as zero. Leaving
  `state=open` off would surface closed and merged pull requests too, including an old one left over from
  a reused branch name — never widen the filter to catch one of those.
- **`<tested-tip-sha>` above is never read from the host.** It is the local scope-branch tip
  `scope.js suite reusable` just accepted, resolved with `git rev-parse <branch>` in the scope checkout.
  `/superdev:ship` reads the pull request's own `head.sha` only to decide whether to push and to refuse
  when it still differs from that tip after pushing, never as the merge's own pin.

## Compute the base

`git merge-base <base> <scope-branch>` → BASE for the final-reviewer's BASE..HEAD diff.
