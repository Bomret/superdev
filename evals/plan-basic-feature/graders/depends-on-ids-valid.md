---
type: llm
focus: files
weight: 2
---
The diff adds a plan under `docs/plans/<slug>/`: one epic file
(`00-epic-*.md`) with a global Definition of Done, and two or more slice
files (`NN-<test-applicability>-*.md`). Judge PASS only if ALL of the
following hold, else FAIL:

- Every slice file states a `depends-on:` list (empty is fine for a root
  slice with no prerequisites).
- Every non-empty id in every `depends-on:` list is the zero-padded number
  prefix (`NN`) of another slice file that is actually present in the diff —
  no dangling references, no id pointing at a slice that doesn't exist, and
  no slice listing its own id.
- Every slice file states a `test-applicability:` of `behavior`,
  `mechanical`, or `docs`.

This grader carries the referential-integrity check the deterministic regex
graders in this suite can't do (matching a `depends-on` id against the set of
ids that actually exist in the same plan).
