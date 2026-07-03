# Code host: Codeberg (Forgejo)

Code lives on Codeberg (`ssh://codeberg.org/bomret/superdev.git`). Use the Forgejo REST API (or the
`tea` CLI if installed) for push + pull requests.

## Configuration

- **Host / owner / repo:** `https://codeberg.org` · `bomret` / `superdev`.
- **Auth:** API token in env var `GITEA_TOKEN` (record the name, never the value).
- **Default PR posture:** `draft` (open as draft; flip to ready manually). Override: `ready` | `push-only`.
- **Base branch:** `main`.

## Conventions

- **Push the scope branch:** `git push -u origin <scope-branch>`.
- **Open the PR (REST):** `POST https://codeberg.org/api/v1/repos/bomret/superdev/pulls` with
  `{ "base": "main", "head": "<scope-branch>", "title": "...", "body": "..." }`,
  header `Authorization: token $GITEA_TOKEN`. Body built from the global DoD + slice list + final-review
  summary. For a draft, prefix the title with `WIP:` (Forgejo treats a `WIP:` title as draft).
- **Report:** print the PR URL.

## Degrade when no host CLI / API access

Do not fail. Push the branch, then print the compare URL
(`https://codeberg.org/bomret/superdev/compare/main...<scope-branch>`) and the ready-to-run API call.

## Compute the base

`git merge-base main <scope-branch>` gives the commit the final-reviewer diffs against (BASE..HEAD where
HEAD = scope tip).
