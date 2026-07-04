# Code host: Codeberg (Forgejo)

Code lives on Codeberg (`ssh://codeberg.org/bomret/superdev.git`). Use the Forgejo REST API (or the
`tea` CLI if installed) for push + pull requests.

## Configuration

- **Host / owner / repo:** `https://codeberg.org` · `bomret` / `superdev`.
- **Auth:** API token in env var `GITEA_TOKEN` (record the name, never the value).
- **Default PR posture:** `ready` (open ready-for-review). Override: `draft` | `push-only`.
- **Base branch:** `main`.

## Conventions

- **Push the scope branch:** `git push -u origin <scope-branch>`.
- **Open the PR (REST):** `POST https://codeberg.org/api/v1/repos/bomret/superdev/pulls` with
  `{ "base": "main", "head": "<scope-branch>", "title": "...", "body": "..." }`,
  header `Authorization: token $GITEA_TOKEN`. Body built from the global DoD + slice list + final-review
  summary.
- **The title MUST be a Conventional Commits header** (`type(scope): subject`, e.g.
  `feat(implement): …`). PRs are **squash-merged**, so the title becomes the commit message on `main` and
  semantic-release parses it for the version bump + changelog — a title without a conventional type is
  silently ignored (no release). Only for a `draft` **override** does Forgejo need a `WIP:` prefix on the
  title (its draft marker) — strip it before merge so the squash message is clean; the default `ready`
  posture never adds it.
- **Report:** print the PR URL.

## Degrade when no host CLI / API access

Do not fail. Push the branch, then print the compare URL
(`https://codeberg.org/bomret/superdev/compare/main...<scope-branch>`) and the ready-to-run API call.

## Compute the base

`git merge-base main <scope-branch>` gives the commit the final-reviewer diffs against (BASE..HEAD where
HEAD = scope tip).
