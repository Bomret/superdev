# 0234: Test runs overlap the review and skip repeated preparation

**Status:** Accepted

**Amends:** [ADR 0192](0192-the-full-suite-runs-once-after-review-comes-back-clean.md): the scope review starts its
full-suite run at entry, beside its first reviews, in place of an entry focused run.
[ADR 0215](0215-fail-to-pass-reuses-a-traced-control.md): the implementer's last run before `scope.js fail-to-pass`
is a `test path` run the verb reuses as its control.
[ADR 0218](0218-a-worktree-runs-the-repositorys-prepare-command.md): the verb's clean between its two runs keeps what
the first preparation wrote.

## Context

An audit of one scope's test runs, for an adopter with a 20-minute full suite, a focused run of a few minutes, and a
prepare command of one to two minutes, found three costs that buy no assurance.

- **The fail-to-pass run prepared its worktree twice.** The verb ran the prepare command, ran the control, then
  cleaned the worktree with `git clean -ffdx`, which also removed the installed dependencies, and ran the prepare
  command again before the put-back run. A traced control skips the first preparation, but the playbooks had the
  implementer commit and run the verb directly, so the verb ran its own control in nearly every call.
- **The scope review ran a focused run before its first review, and the full suite after it.** The focused run
  covered the paths each slice's own focused run had covered, and the full run covered them again. Both ran in
  sequence with the reviews, so the review's wall clock was the focused run, the reviews, and the full run added up.
- **The Stop hook `slicetree-sweep.js` asked git about every run root.** It made two git calls per scope, a closed
  run included, on every main-session Stop: 25 calls and about 430 ms for a repository holding 11 closed runs.

## Decision

1. **The review's full-suite run starts at entry.** After the base step, the preparation, and the suite record, the
   review takes the exit run's reuse, carry, and full-command steps at the scope branch's tip. A full run starts in
   the background, and the `final-reviewer` and `simplicity-reviewer` dispatches go out while it runs. The controller
   waits for its end before the first fix cycle, a base merge, and the stage write, records it as the exit run's
   record, and folds a failure into the first fix list as a Critical finding. A pass at a tip no commit has moved is
   the exit run's result through the exact tip match. The entry focused run is gone.
2. **The implementer gives the verb its control.** Once its work is committed and its focused run passed, the
   implementer runs the range's test files through `scope.js test path` from the tree root with the exact command it
   then passes to `scope.js fail-to-pass`. The verb reuses that run and skips its own first preparation and control.
3. **The verb's clean keeps the first preparation's output.** After the first preparation the verb lists what
   `git clean -ndx` would remove, and the clean between the runs excludes each of those paths. The second preparation
   still runs, so it brings the dependencies to what the put-back files name. A prepare command that skips work
   already done, such as `bun install` or `pnpm install`, then runs fast. `npm ci` removes `node_modules/` itself and
   gains nothing.
4. **The sweep skips a scope with no slicetree.** `slicetree-sweep.js` asks git nothing about a scope whose directory
   holds no slicetree in the worktree list it already read.

## Considered options

- **Drop the per-slice focused run.** Rejected: a regression between a slice's own files and its neighbours would
  surface only at the review's full run, which costs a fix cycle and another full run.
- **Skip the second preparation when the range changes no declared prepare input.** Rejected for now: it needs a new
  configuration list, and an undeclared input would let the put-back run use the tip's dependencies.
- **Run the focused run and the fail-to-pass run at the same time.** Rejected: parallel slicetrees already compete
  for the machine's cores, so the overlap saves little and makes a failure harder to read.

## Consequences

A review with no fix cycle pays one full run, overlapped with its reviews. The first `final-reviewer` dispatch gets
no suite result, and a failing run reaches the fix loop through the controller. A full run that a fix cycle follows
is spent: the cycle's commit moves the tip, and the exit run runs again. A path the control run writes inside a kept
path, such as a cache under `node_modules/`, survives into the put-back run.
