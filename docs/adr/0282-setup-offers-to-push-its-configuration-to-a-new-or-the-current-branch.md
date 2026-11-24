# 0282: Setup offers to push its configuration to a new or the current branch

**Status:** Accepted

**Context.** `/superdev:setup` writes `docs/agents/*.md`, the `## Agent skills` block, `.gitignore`, and the verify
skill, then leaves them uncommitted. `/superdev:implement`'s base step merges the fetched remote base into the scope
branch (ADR 0120), so configuration that never reaches the remote base never reaches a run. Operators land it by
hand, most often as a direct commit on the base branch: this repository's own setup reconciles reached `main` that
way, with no pull request. INV-0001 forbade every superdev command a commit or push to the base branch, so setup
could not do for the operator what the operator does each time.

**Decision.** At the end of every run that wrote or changed a tracked file, `/superdev:setup` asks once:
push to a new branch, push to the current branch, or leave the files uncommitted. The commit holds only the paths
setup wrote that run, never the operator file. Choosing the current branch on the base branch commits and pushes
there. INV-0001 admits this as its second exception, on the operator's explicit choice. The
`no-base-branch-commit` drift check admits it by file and wording, as it admits ship's host-API merge.

**Considered options.**

- **New branch or leave uncommitted only, with the current branch hidden on base.** Rejected: it keeps INV-0001
  unamended but drops the route operators take most.
- **Commit and push without asking.** Rejected: setup also runs auto-invoked from `/superdev:plan` and
  `/superdev:implement`, and a push to a shared branch is the operator's decision.

**Consequences.** Setup is the one command that may push to the base branch with local git, and only
configuration, only on the operator's choice. Branch protection on the base refuses that push, and setup reports
the refusal with the commit left local. A run's code and its scope branch stay under INV-0001's unchanged rule.
