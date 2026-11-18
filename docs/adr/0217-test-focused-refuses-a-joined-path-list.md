# 0217: `test focused` refuses a joined path list

**Status:** Accepted

**Amended by:** [ADR 0259](0259-a-test-run-takes-its-changed-paths-from-a-ref.md), which lets a caller name a ref instead of
a path list.

## Context

An implementer ran `P=$(git diff --name-only <base>..HEAD | tr '\n' ' '); node scope.js test focused $P` in zsh, which
does not split an unquoted `$P`. The verb received every path as one argument with a trailing space. It shell-quoted
that argument as one path for `{paths}`. The focused command matched no suite, exited 0, and the trace recorded a
focused `pass`, so an untested change read as verified.

## Decision

`scope.js test focused` refuses an argument that holds whitespace and names no file relative to the tree root, before
anything runs, and records nothing. The refusal tells the caller to pass each path as its own argument. An argument
with whitespace that names an existing file is one path and runs.

## Considered options

- **Split a whitespace-joined argument into paths.** Rejected: a path can hold a space, and the verb cannot tell a
  path list from such a path once the file is gone.
- **Record a focused run that selected nothing as no pass.** Rejected: the focused command is the repository's own,
  and its exit status is the one signal the verb has. Whether it selected a test is not observable.

## Consequences

A deleted file whose name holds whitespace cannot be passed to `test focused`; the caller runs `test full` instead.
