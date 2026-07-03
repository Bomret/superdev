---
type: regex
target: files
flags: s
match: contains
weight: 1
pattern: '(?:(?!\+\+\+ b/docs/plans/[^\n]*/\d\d-(?:behavior|mechanical|docs)-).)*\+\+\+ b/docs/plans/[^\n]*/\d\d-(?:behavior|mechanical|docs)-[^\n]*(?:(?!\+\+\+ b/docs/plans/[^\n]*/\d\d-(?:behavior|mechanical|docs)-).)*\+\+\+ b/docs/plans/[^\n]*/\d\d-(?:behavior|mechanical|docs)-'
---
Deterministic, free grader. Fails unless the diff adds at least two slice
files named `NN-<test-applicability>-<summary>.md`, each tagged `behavior`,
`mechanical`, or `docs` in its own filename per
`references/issue-tracker-local.md` — i.e. the plan decomposes into >= 2
vertical slices, each with a declared test-applicability.

(The pattern is the classic "match at least 2 occurrences" trick: scan
forward to the first slice-file diff header, consume it, scan forward again
to a second one. It intentionally counts filenames, not `test-applicability:`
lines in the body, so it doesn't need to know each slice's exact slug.)
