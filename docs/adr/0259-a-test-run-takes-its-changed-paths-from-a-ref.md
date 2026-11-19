# 0259: A test run takes its changed paths from a ref

**Status:** Accepted

**Amends:** [ADR 0217](0217-test-focused-refuses-a-joined-path-list.md): a caller can name a ref instead of a path
list.

## Context

A test loop's final run covers its changed-path set. Implementers built that set in the shell, as
`"${(@f)$(git diff --name-only <base>..HEAD)}"`, and passed it to `scope.js test focused` or `test path`. In
0.107 and 0.108 runs, Claude Code's removal safety check denied 24 such calls, because it cannot resolve the
variable, and each denial cost a retry.

## Decision

`scope.js test focused --since <ref>` runs the focused command over every path changed since `<ref>`: the paths
`git diff --name-only --no-renames <ref>` prints against the working tree, plus untracked files git does not
ignore. `scope.js test path --since <ref> -- <command>` runs over the test-path files among them that exist. The
paths are relative to the tree root, and the trace records them. The verb refuses `--since` with explicit paths,
a ref git cannot resolve, and an empty set, and records nothing.

## Considered options

- *Keep caller-built lists.* Rejected: the shell forms that build them trip the safety check, and ADR 0217
  already refuses the zsh form that does not split.

## Consequences

An empty set is refused instead of running the full command, as a path-less `test focused` does.
