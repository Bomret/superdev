---
type: llm
focus: trace
weight: 1
---
The feature is five operations plus an authorisation rule, in a repo with git
already initialised.

PASS if the transcript shows the work committed in more than one commit, with
each commit covering a coherent unit of the feature that could be reviewed on
its own.

FAIL if the whole feature lands in a single commit, if the work was never
committed at all, or if the commits are mechanical checkpoints that cut across
operations without any of them completing one.

Branch topology does not matter: one branch, several branches, or merges
between them all pass. Commit message format does not matter.
