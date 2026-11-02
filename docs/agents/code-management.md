# Code host: GitHub

Code lives on GitHub (`https://github.com/Bomret/superdev`). Every host call goes through the `gh` CLI,
authenticated through its own login (`gh auth status`): a subcommand where one performs the operation,
`gh api` where none does.

## Configuration

- **Owner and repo:** `Bomret`, `superdev`.
- **Remote:** `origin`. Confirm with `git remote -v`.
- **Default PR posture:** `ready` (open ready-for-review). Override: `draft` or `push-only`.
- **Base branch:** `main`.

## Conventions

- **Login:** the `gh` login for `github.com`, never stored. Every call passes `--repo Bomret/superdev`, so
  no call depends on the remote `gh` infers. No `gh` on the path, or no authenticated `github.com` login,
  stops the step (*Degrade* below). No token env var, header, or raw HTTP call (curl) appears in this
  document.
- **`jq` is required.** The pull request body edit below is built with it, so a missing `jq` stops the step
  the way a missing `gh` does (*Degrade* below).
- **Push the scope branch:** `git push -u origin <scope-branch>`.
- **Open the PR:** `gh pr create --repo Bomret/superdev --base main --head <scope-branch> --title "$title"
  --body-file "$f"`, the body in the file `$f`, `title` set from a quoted heredoc
  (`title=$(cat <<'SUPERDEV_TEXT_EOF' … SUPERDEV_TEXT_EOF)`) so a backtick or `$(` in it stays literal. The
  `draft` override adds `--draft`. The body is built per `/superdev:submit-pr`'s body rules.
- **The title must be a Conventional Commits header** (`type(scope): subject`, for example
  `feat(implement): …`). PRs are **squash-merged**, so the title becomes the commit message on `main`, and
  semantic-release parses it for the version bump and the changelog. A title without a conventional type
  is silently ignored, and no release happens. A `draft` override is marked ready with
  `gh pr ready <number> --repo Bomret/superdev` before merge.
- **Read the PR:** `gh pr view <number> --repo Bomret/superdev --json
  number,url,state,title,body,headRefName,headRefOid`.
- **Report:** print the PR URL that `gh pr create` prints.

## Degrade when no gh login

Do not fall back to a token or a raw HTTP call (curl). No `gh` or `jq` on the path, or no authenticated
`gh` login for `github.com`: push the branch, then print the compare URL
(`https://github.com/Bomret/superdev/compare/main...<scope-branch>?expand=1`) and the exact `gh` command
the step would have run. The merge call below degrades the same way: print the exact `gh pr merge` call
and merge nothing.

## Merge

- **Read the pull request:** `gh pr view <number> --repo Bomret/superdev --json
  state,mergeable,headRefOid,mergeCommit`. `state` is `OPEN`, `CLOSED`, or `MERGED`, and `mergeCommit.oid`
  carries the merge commit once merged. GitHub computes `mergeable` asynchronously and answers `UNKNOWN`
  while it does. Re-read up to 3 times with a short pause, and when it is still `UNKNOWN`, report it as
  **unknown**, never as mergeable.
- **Merge it, pinned:** `gh pr merge <number> --repo Bomret/superdev --squash --match-head-commit
  <tested-tip-sha> --subject "$title"`, `title` set from a quoted heredoc as the PR-create line does.
  `--match-head-commit` pins the merge to that sha: GitHub refuses the merge when the head moved since.
  Pass no check or review bypass option. This repo's own branch protection on `main` is what a merge must
  never bypass.
- **A refusal names the reason:** `gh pr merge` exits non-zero and prints GitHub's message. An unmet
  required review or status check, or a pull request that is already merged or closed, cannot be merged.
  A head that moved since it was read, or a conflict, refuses the merge too. Relay GitHub's own message to
  the operator instead of retrying, and merge nothing.
- **Find an open pull request by its head branch** (a fallback, when no number is on hand):
  `gh pr list --repo Bomret/superdev --head <scope-branch> --state open --json number,headRefName`.
  Leaving `--state open` off would surface closed and merged pull requests too, including an old one left
  over from a reused branch name. Never widen the filter to catch one of those.
- **`<tested-tip-sha>` above is never read from the host.** It is the local scope-branch tip
  `scope.js suite reusable` just accepted, resolved with `git rev-parse <branch>` in the scope checkout.
  `/superdev:ship` reads the pull request's own `headRefOid` only to decide whether to push and to refuse
  when it still differs from that tip after pushing, never as the merge's own pin.

## Edit the pull request body

A run that resolves a deferred finding after `/superdev:submit-pr` opened the pull request rebuilds that
pull request's `## Deferred to a plan` section (`references/scope-findings.md`'s `## Deferred findings`,
ADR 0121). Only an open pull request is edited.

- **Read it**: `gh pr view <number> --repo Bomret/superdev --json state,body`, into a file. Only `state`
  `OPEN` is edited. A merged or closed pull request gets no edit.
- **Edit it, by file**: read into one file, build the new body into a second, and edit only when every
  step succeeded: `gh pr view <number> --repo Bomret/superdev --json state,body > "$r" &&
  jq -e '.state == "OPEN"' "$r" >/dev/null && jq -je .body "$r" > "$b" && <producer> < "$b" > "$f" &&
  [ -s "$f" ] && gh pr edit <number> --repo Bomret/superdev --body-file "$f"`. Name each file with
  `mktemp`. `<producer>` builds the new body from `"$b"`. A failed read, a merged or closed pull request,
  a failed producer, or an empty result stops the chain before the edit, and the body stays as it was.
  Stdin from a pipe is never the body source: a pipe drops the producer's exit status, and an empty body
  replaces the pull request's own.

## Compute the base

A scope's `BASE` for the final-reviewer's `BASE..HEAD` diff (`HEAD` is the scope tip) is its range
base, computed by `scope.js base resolve` per `plugin/references/scope-mode.md`'s `## The scope's range base`.
An ad-hoc range with no run root uses `git merge-base main <scope-branch>`.

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
A conflicting `merge-tree` answers nothing on its own: `plugin/lib/containment.js`'s `testContainment`
settles that case from base's own history (ADR 0053, ADR 0082), and `references/scope-branch.md`'s
`## Containment` states the full contract superdev's own checks follow.
