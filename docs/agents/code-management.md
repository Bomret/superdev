# Code host: Codeberg (Forgejo)

Code lives on Codeberg (`ssh://codeberg.org/bomret/superdev.git`). Use the Forgejo REST API
through the `tea` CLI for pull requests.

## Configuration

- **Host, owner, and repo:** `https://codeberg.org`, `bomret`, `superdev`.
- **Remote:** `origin`. Confirm with `git remote -v`.
- **Tooling:** the `tea` CLI. Every call is `tea api --login codeberg.org --repo bomret/superdev -i …`, a request
  body goes through `-d @<file>` or `-d @-`, and a path is written `/repos/bomret/superdev/...` without the
  `/api/v1` prefix. `tea api` exits 0 on an HTTP error, so every call passes `-i`, which writes the status line and the response headers (`Link`) to stderr and leaves the JSON body on stdout.
  A caller reads the `405` and `409` merge refusals from the status line and Codeberg's message from the body, and the next page from `Link`.
- **Auth:** the `tea` CLI's stored `codeberg.org` login (`tea login list`). Every call passes `--login
  codeberg.org`: outside this repository's checkout, `tea` otherwise falls back to another stored login.
  No token environment variable is read.
- **Default PR posture:** `ready` (open ready-for-review). Override: `draft` or `push-only`.
- **Base branch:** `main`.

## Conventions

- **Push the scope branch:** `git push -u origin <scope-branch>`.
- **Open the PR (`tea api`):** `tea api --login codeberg.org --repo bomret/superdev -i -X POST -d @<file> /repos/bomret/superdev/pulls` with
  `{ "base": "main", "head": "<scope-branch>", "title": "...", "body": "..." }`.
  Body built from the global DoD, the slice list, and the
  final-review summary.
- **The title must be a Conventional Commits header** (`type(scope): subject`, for example
  `feat(implement): …`). PRs are **squash-merged**, so the title becomes the commit message on `main`, and
  semantic-release parses it for the version bump and the changelog. A title without a conventional type
  is silently ignored, and no release happens. Only for a `draft` **override** does Forgejo need a `WIP:`
  prefix on the title (its draft marker). Strip it before merge so the squash message is clean. The
  default `ready` posture never adds it.
- **Report:** print the PR URL.

## Degrade when no host CLI or API access

Do not fail. Push the branch, then print the compare URL
(`https://codeberg.org/bomret/superdev/compare/main...<scope-branch>`) and the ready-to-run API call.
The merge call below degrades the same way: print the exact API call and merge nothing.

## Merge

- **Read the pull request:** `tea api --login codeberg.org --repo bomret/superdev -i /repos/bomret/superdev/pulls/<index>` →
  `state`, `merged`, `merge_commit_sha` (once merged), `head.sha`, and `mergeable`.
- **Merge it, pinned:** `tea api --login codeberg.org --repo bomret/superdev -i -X POST -d @<file> /repos/bomret/superdev/pulls/<index>/merge`
  with `{ "Do": "squash", "MergeTitleField": "<pr-title>", "head_commit_id": "<tested-tip-sha>" }`.
  `head_commit_id` pins the merge to that sha; Codeberg
  answers 409 when the head moved since. Never send `force_merge` — this repo's own branch protection
  on `main` is what a merge must never bypass.
- **A refusal names the reason:** 405 means the pull request cannot be merged (an unmet required
  approval or protection rule, or it is already merged/closed); 409 means the head moved since it was
  read, or a conflict exists. Relay Codeberg's own message to the operator instead of retrying.
- **Find an open pull request by its head branch** (a fallback, when no index is on hand):
  `tea api --login codeberg.org --repo bomret/superdev -i '/repos/bomret/superdev/pulls?state=open'` — Codeberg carries no `head`
  query parameter, so filter the returned array client-side by `head.ref` matching the scope branch. The
  list paginates (`page`, `limit` query params; `limit` capped at the server's `MAX_RESPONSE_ITEMS`, 50 by
  default): page through every page — the `Link` response header names the next one — before counting
  matches, or a match sitting on a later page reads as zero. Leaving `state=open` off would surface closed
  and merged pull requests too, including an old one left over from a reused branch name — never widen
  the filter to catch one of those.
- **`<tested-tip-sha>` above is never read from the host.** It is the local scope-branch tip
  `scope.js suite reusable` just accepted, resolved with `git rev-parse <branch>` in the scope checkout.
  `/superdev:ship` reads the pull request's own `head.sha` only to decide whether to push and to refuse
  when it still differs from that tip after pushing, never as the merge's own pin.

## Compute the base

`git merge-base main <scope-branch>` gives the commit the final-reviewer diffs against (`BASE..HEAD`,
where `HEAD` is the scope tip).

## Has this branch landed

PRs are squash-merged, so a merged scope branch is never an ancestor of `main`. Ask about **content**,
never ancestry:

```sh
tree=$(git merge-tree --write-tree main <branch>) && [ "$tree" = "$(git rev-parse main^{tree})" ]
```

Equal trees means `main` holds the branch's work and the branch is safe to delete. `git merge-base
--is-ancestor` and `git branch -d` both run the ancestry test instead, so they report every merged scope
branch here as unmerged — which trains the reflex to reach for `git branch -D`, and that one destroys a
branch that genuinely is unmerged. Delete a branch this test calls landed, and investigate any other.
A conflicting `merge-tree` answers nothing on its own: `plugin/scripts/scope.js`'s `testContainment`
settles that case from base's own history (ADR 0053, ADR 0082), and `references/scope-mode.md`'s
`## Containment` states the full contract superdev's own checks follow.

## Seed deviations

- Seed deviation: `tea` CLI conventions — the calls under `## Conventions` and `## Merge` are `tea api` invocations on the `codeberg.org` login, not the seed's `tea pr` commands, because `tea pr merge` carries no head pin (2026-10-01)
