# 0244: The full playbook keeps its rare branches in their own files

**Status:** Accepted

**Amends:** [ADR 0203](0203-scope-mode-is-split-by-job.md): `implement-full.md` no longer stays whole; its rare branches
move to files read only when the branch fires.

## Context

`references/implement-full.md` was about 52 KB, and the controller read it whole on every full-tier run. Its
`## DAG loop` alone was about 34 KB. Much of that prose serves branches most runs never take: a resumed run, a
slice's fix cycles after a Critical or Important finding, deferring a finding, a denied dispatch, the resolution of
a conflicted merge, and the Minor sweep. A whole read stays in the controller's context, and every later turn of
the session reads it again. ADR 0203 kept the playbook whole on the ground that its one command reads most of it.
That holds for the steady-state loop and not for these branches.

## Decision

1. **The steady-state loop stays in `implement-full.md`.** The branch model, run lock, base step, progress log,
   interface file, the DAG loop's dispatch, review, Minor queueing, merge, and tick steps, and leaving the run
   standing.
2. **Each rare branch moves to its own reference, read when it fires.**
   - `implement-full-resume.md`: `## Resume (re-running on an existing scope)`, read on a `resumed` run kind and
     after a compaction mid-run.
   - `implement-full-fix-cycle.md`: `## Fix cycles`, `## The re-review dispatch`, and `## Deferring a finding`, read
     when a slice review lists a Critical or Important finding outside the deferred and unclosable ones, or a
     finding whose remedy may add a capability the plan never named.
   - `implement-full-denied.md`: `## A denied dispatch`, read when the classifier denies a dispatch.
   - `implement-full-minor-sweep.md`: `## Minor sweep` and `## A resumed sweep`, read when `scope.js get minors`
     names a queued slice after the last merge.
   - The conflict text of the merge step defers to `merge-conflicts.md`, which already stated it whole.
3. **The playbook names each trigger at its point of use**, and its opening lists the branch files once. A branch
   file opens by naming the point that reads it and states that `implement-full.md` stays in force.
4. **Every contract moves unchanged.** Citations of a moved section name its new file, and the drift checks that
   read the playbook read the branch files too.

## Consequences

- A full-tier run that takes none of the branches loads about 34 KB of playbook in place of about 52 KB.
- A branch file assumes the playbook is in context, so it cites the playbook's steps by name rather than restating
  them.
- A branch's trigger lives in the playbook. A controller that misjudges a trigger never reads the branch, so each
  trigger is stated as a condition the controller can test: a run kind, a severity, a denial, a non-empty queue.

## Considered options

- **One file for every rare branch.** It adds one file instead of four, but a run that takes one branch loads all of
  them.
- **Keep the playbook whole and tell the controller which sections to skip.** A `Read` of the file loads it whole,
  whatever the prose says to skip.
