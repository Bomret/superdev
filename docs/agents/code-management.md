# Code host: Codeberg (Forgejo)

Code lives on Codeberg (`ssh://codeberg.org/bomret/superdev.git`). Every host call goes through the `tea`
CLI: a subcommand where one performs the operation, `tea api` where none does.

## Configuration

- **Host, owner, and repo:** `https://codeberg.org`, `bomret`, `superdev`.
- **Remote:** `origin`. Confirm with `git remote -v`.
- **Default PR posture:** `ready` (open ready-for-review). Override: `draft` or `push-only`.
- **Base branch:** `main`.

## Conventions

- **Login:** resolved, never stored. It is the one entry of `tea login list -o json` whose `url` is
  `https://codeberg.org`. Every call passes `--login <login> --repo bomret/superdev`: without `--login`,
  `tea` falls back to another host's login when none matches the current remote. Zero matching entries, or
  no `tea` on the path, stops the step (*Degrade* below). Two or more matching entries are named, and the
  operator picks.
- **`jq` is required.** The pinned merge body below is built with it, so a missing `jq` stops the step the
  way a missing `tea` does (*Degrade* below).
- **A deciding `tea api` call passes `-i`** and reads the HTTP status from stderr, because `tea api` exits
  0 on a 4xx or 5xx answer.
- **Push the scope branch:** `git push -u origin <scope-branch>`.
- **Open the PR:** `tea pr create --login <login> --repo bomret/superdev --base main --head <scope-branch>
  --title "$title" --description-file -`, the body on stdin, `title` set from a quoted heredoc
  (`title=$(cat <<'SUPERDEV_TEXT_EOF' … SUPERDEV_TEXT_EOF)`) so a backtick or `$(` in it stays literal. The `draft` override adds `--draft`. The body
  is built from the global DoD, the slice list, and the final-review summary.
- **The title must be a Conventional Commits header** (`type(scope): subject`, for example
  `feat(implement): …`). PRs are **squash-merged**, so the title becomes the commit message on `main`, and
  semantic-release parses it for the version bump and the changelog. A title without a conventional type
  is silently ignored, and no release happens. Only for a `draft` **override** does Forgejo need a `WIP:`
  prefix on the title (its draft marker): `--draft` adds it, and `tea pr edit <index> --ready` strips it
  before merge so the squash message is clean. The default `ready` posture never adds it.
- **Report:** print the PR URL that `tea pr create` prints.

## Degrade when no tea login

Do not fall back to a token or a raw HTTP call (curl). No `tea` or `jq` on the path, or no `tea login list -o json` entry
whose `url` is `https://codeberg.org`: push the branch, then print the compare URL
(`https://codeberg.org/bomret/superdev/compare/main...<scope-branch>`) and the exact `tea` command the step
would have run. The merge call below degrades the same way: print the exact `tea api` call and merge
nothing.

## Merge

- **Read the pull request:** `tea api -i '/repos/{owner}/{repo}/pulls/<index>'` with `--login <login>
  --repo bomret/superdev` → `state`, `merged`, `merge_commit_sha` (once merged), `head.sha`, and
  `mergeable`. `tea pr <index> -o json` carries no `merge_commit_sha` and renames `head.sha`, so this read
  goes through `tea api`.
- **Merge it, pinned:** `jq -n --arg t "$title" --arg sha "<tested-tip-sha>"
  '{Do:"squash",MergeTitleField:$t,head_commit_id:$sha}'` piped to `tea api -i -X POST
  '/repos/{owner}/{repo}/pulls/<index>/merge' -d @-`, `title` set from a quoted heredoc as the PR-create
  line does, so a quote or backtick in the title stays literal in the JSON.
  `head_commit_id` pins the merge to that sha; Codeberg answers 409 when the head moved since. `tea pr
  merge` carries no head-pin of its own, so the `tea api` call is the merge. Never send `force_merge` —
  this repo's own branch protection on `main` is what a merge must never bypass.
- **A refusal names the reason:** read the status from stderr (`-i`). 405 means the pull request cannot be
  merged (an unmet required approval or protection rule, or it is already merged/closed); 409 means the
  head moved since it was read, or a conflict exists. Relay Codeberg's own message to the operator instead
  of retrying, and merge nothing.
- **Find an open pull request by its head branch** (a fallback, when no index is on hand):
  `tea pr list --state open -o json --fields index,head --page <p> --limit 50` — the listing carries no
  head filter, so filter the returned array client-side by `head` matching the scope branch. The list
  paginates: page through every page, until one returns fewer than 50 entries, before counting matches, or
  a match sitting on a later page reads as zero. Leaving `--state open` off would surface closed
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
