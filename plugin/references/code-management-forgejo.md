# Code host: Forgejo / self-hosted (Gitea-compatible)

Code lives on a Forgejo (or Gitea) instance. Use the `tea` CLI if installed, otherwise the REST API.

## Configuration (fill in at setup)

- **Base URL**: `<https://git.example.com>`
- **Owner / repo**: `<owner>/<repo>` (confirm with `git remote -v`).
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

## Compute the base

`git merge-base <base> <scope-branch>` → BASE for the final-reviewer's BASE..HEAD diff.
