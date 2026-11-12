# 0237: A repaired failure carries a red record

**Status:** Accepted

## Context

A scope review's exit run that fails opens a fix cycle, and the cycle counts toward the 3-cycle cap. After the cycle,
the next exit run found a red record and no green one, so no carry applied and the gate ran the full command again.
For an adopter with a 20-minute full suite, a scope whose exit run failed paid up to four full runs, though the fix
changed a few files and every test outside the failing files had passed at the red commit.

The recorded rerun (ADR 0172) already reads a red record under the complete-selector declaration, but only at the
red commit itself and only for one failing file that passes alone there, which is the shape of an intermittent
failure. A failure a fix cycle repairs moves the tip.

## Decision

1. **The failing files are recorded.** After a failed full run whose output names one or more test files and no
   failure outside them, the gate records the red result and then the files with `scope.js suite failed <file>...`.
   The ledger's one `**Failed:**` line holds them with the commit.
2. **The record carries to the fix tip.** Under the tip's complete-selector declaration, `scope.js suite reusable`
   accepts the red record at R at a later tip T when R is an ancestor of T, exactly one full run failed at R, each
   named file passed on a clean tree at T in a `path` run from the tree root, and the focused carry from R to T holds:
   a passing clean focused run at T covers every path changed since R, and no full, whole, or path run at T failed.
3. **The carry run runs the named files first.** `## The carry run` takes a red record with a `**Failed:**` line as
   its starting record, runs the named files alone at the tip, then the focused command over the range since R.

## Considered options

- **Rerun only the failing files.** Rejected: a fix can break a test that passed at R, and only the focused run over
  the change since R selects it.
- **Extend the recorded rerun to several files at the red commit.** Rejected: it covers an intermittent failure, and
  a failure a fix cycle repairs passes only at a later commit.

## Consequences

A scope whose exit run fails pays one full run, and each fix cycle after it pays the named files and a focused run
where the repository declares a complete selector. A repository without the declaration runs the full command at
every exit, as before. The gate trusts the controller's reading of which files failed: a failing file it leaves out
of the record, and that the change since R does not reach, goes unrun at the tip. A failing carry run records red at
its tip with no failed-files record, so the next exit runs the full command.
