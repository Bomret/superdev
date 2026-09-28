# Code host: GitHub

Code lives on GitHub. Use the `gh` CLI for push + pull requests. `gh` infers the repo from
`git remote -v` when run inside a clone.

## Configuration

- **Remote**: `origin` (GitHub). Confirm with `git remote -v`.
- **Default PR posture**: `draft` (open as draft; the user flips to ready). Override: `ready` | `push-only`.
- **Base branch**: the branch the scope branch was cut from (default `main`; confirm per repo).

## Conventions

- **Push the scope branch**: `git push -u origin <scope-branch>`.
- **Open the PR** (default draft):
  `gh pr create --draft --base <base> --head <scope-branch> --title "<title>" --body-file <file>`.
  Use a body file (heredoc) built from the global DoD + the slice list + the final-reviewer's summary.
- **Ready (non-draft)**: same without `--draft`.
- **Never interpolate a store-derived value into a shell string.** The title comes from the slice/plan;
  if the slice store is multi-writer, treat it as untrusted. Pass it as a single quoted `--title "<title>"`
  argument (so `gh` receives it as one argv, not a shell fragment) and always use `--body-file` for the
  body — never build a command line by concatenating a title/body that could carry `"`/`` ` ``/`$( )`.
- **Report**: print the PR URL (`gh pr view --json url --jq .url`).

## Degrade when `gh` is absent

Do not fail. Push the branch, then print the compare URL
(`https://github.com/<owner>/<repo>/compare/<base>...<scope-branch>?expand=1`) and the exact
`gh pr create ...` command the user can run once `gh` is available.
The merge call below degrades the same way: print the exact `gh pr merge`/REST call and merge nothing.

## Merge

- **Read the pull request**: `gh pr view <number> --json state,mergeable,headRefOid,mergeCommit` (or
  `GET /repos/<owner>/<repo>/pulls/<pull_number>` for `state`, `merged`, `merge_commit_sha`, `head.sha`,
  and `mergeable`). GitHub computes `mergeable` asynchronously and answers `null` while it does;
  re-read up to 3 times with a short pause and, if it is still `null`, report it as **unknown** — never
  as mergeable.
- **Merge it, pinned**: `gh pr merge --squash --match-head-commit <tested-tip-sha> <number>` (or
  `PUT /repos/<owner>/<repo>/pulls/<pull_number>/merge` with
  `{ "merge_method": "squash", "commit_title": "<pr-title>", "sha": "<tested-tip-sha>" }`).
  `--match-head-commit`/`sha` pins the merge to that sha: the host answers 409 when the head moved
  since. Never pass `--admin` (or any other check/review bypass) — this seed never sends it.
- **A refusal names the reason**: 405 means the pull request cannot be merged (an unmet required
  review or status check, or it is already merged/closed); 409 means the head moved since it was read,
  or a conflict exists. Relay the host's own message to the operator instead of retrying.
- **Find an open pull request by its head branch** (a fallback, when no number is on hand): `gh pr list
  --head <branch> --state open` (or `GET /repos/<owner>/<repo>/pulls?head=<owner>:<branch>&state=open`).
  Leaving `state=open` off would surface closed and merged pull requests too, including an old one left
  over from a reused branch name — never widen the filter to catch one of those.
- **`<tested-tip-sha>` above is never read from the host.** It is the local scope-branch tip
  `scope.js suite reusable` just accepted, resolved with `git rev-parse <branch>` in the scope checkout.
  `/superdev:ship` reads the pull request's own `head.sha` only to decide whether to push and to refuse
  when it still differs from that tip after pushing, never as the merge's own pin.

## Compute the base

`git merge-base <base> <scope-branch>` gives the commit the final-reviewer diffs against
(BASE..HEAD where HEAD = scope branch tip).
