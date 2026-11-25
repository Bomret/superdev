# Commit messages

Applies to every writer of a commit, a merge commit, or a pull-request title superdev makes in a repository: an agent
body, a skill, or a reference that commits, merges, or titles a pull request cites this file and states only its own
stop. The **Commit convention** (`CONTEXT.md`) is the repository's rule for that text (ADR 0284).

## Reading the rule

**The read.** Applies before every message you compose. Read the `## Commit messages` section of
`docs/agents/code-management.md` in the tree the commit lands in: a slicetree, the scopetree, setup's worktree, or the
checkout. Pass the document's absolute path, `<tree>/docs/agents/code-management.md`, to `node
"${CLAUDE_PLUGIN_ROOT}/scripts/scope.js" section`, with the heading on stdin through a quoted heredoc, because the
verb resolves a relative path against the plugin root first.

**No section.** Applies to a tree with no `docs/agents/code-management.md`, or a document with no line
`## Commit messages`. The rule is Conventional Commits, as `code-management-github.md`'s `## Commit messages` and
`code-management-forgejo.md`'s `## Commit messages` state it with their examples. Only that literal heading counts, so a commit rule under another heading reads as no
section here.

**An unreadable section.** Applies to a document whose `## Commit messages` line is present and whose section
`scope.js section` refuses: a duplicated heading, a heading only inside a fence, or an unterminated fence. Stop the
commit and name the refusal `section` printed. Fall back to Conventional Commits only where **No section** applies.

## Composing a message

**The rule decides the text.** Applies to every message you compose. Write the message by the rule and its examples.
The repository's hook and CI judge the result, so you validate nothing yourself.

**The values a rule may name.** Applies to a rule that names a value. Fill it from the list below:

- **The commit's own kind of change**: under Conventional Commits the type that fits this commit (`test`, `docs`,
  `chore`, `feat`, `fix`, …), chosen for the commit itself.
- **The feature's change type**: the prefix of the scope branch, read from the ledger's `**Branch:**` line
  (`scope.js get branch --root <run-root>`). A merge commit takes this one.
- **The slug**: the scope branch's second segment.
- **The store reference**: the slice's or the scope anchor's reference in the slice store, as its document renders it
  (`#<n>`, `PROJ-123`).

**Setup's commit.** Applies to `/superdev:setup`'s own commit. It has no feature: its kind is `chore`, its scope
`setup`, and it names no store reference.

**A featureless commit.** Applies to a commit no feature owns: setup's, an ad-hoc review's inline fix, and a
brainstorm prototype's. It takes the commit's own kind of change and no store reference. A value the rule names only
where there is a feature, such as a scope the feature's slug fills, is left out and is no **A missing value**.

**A missing value.** Applies to a rule that requires a value you were not handed and cannot read. Report the rule and
the missing value, and stop that commit. Never invent a value.

## The message file

**The file.** Applies to every merge commit, and to any message you pass as a file. Write the message to a `mktemp`
file outside every worktree, from a quoted heredoc with the `SUPERDEV_TEXT_EOF` delimiter, so the shell expands none
of its text. Pass it with `-F <file>`, and remove the file once git has exited.

- **The delimiter.** A message holding a line equal to `SUPERDEV_TEXT_EOF` is refused, never written: reword that line.
- **A merge commit's body** names the merged branch, or the merged commit's full sha where a ref was merged.

## A refused commit or merge

**The refusal.** Applies when git exits non-zero and records no commit: a commit-msg, pre-merge-commit, or
prepare-commit-msg hook, signing, the identity, or an editor failed. Report git's own output to the operator, and name
no hook git did not name. Each writer's own concept states its stop: a plain commit's writer ends blocked, and
`merge-conflicts.md` states a merge's abort or keep.

**Never bypass.** Applies to every refusal. Never pass `--no-verify` or a configuration that skips a hook. Never
commit a refused merge yourself, and never write a different message only to satisfy a hook.
