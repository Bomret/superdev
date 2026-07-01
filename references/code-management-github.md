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
  Use a body file (heredoc) built from the global DoD + the slice list + the final-review summary.
- **Ready (non-draft)**: same without `--draft`.
- **Report**: print the PR URL (`gh pr view --json url --jq .url`).

## Degrade when `gh` is absent

Do not fail. Push the branch, then print the compare URL
(`https://github.com/<owner>/<repo>/compare/<base>...<scope-branch>?expand=1`) and the exact
`gh pr create ...` command the user can run once `gh` is available.

## Compute the base

`git merge-base <base> <scope-branch>` gives the commit the final-reviewer diffs against
(BASE..HEAD where HEAD = scope branch tip).
