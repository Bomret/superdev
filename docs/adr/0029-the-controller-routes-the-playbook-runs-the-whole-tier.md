# 0029 — The controller routes; the execution playbook runs the whole tier

**Status:** Accepted

## Context

`commands/implement.md` used to hold three things end to end: the run's opening (write the DoD, create
or resume the ledger, name the run kind), the tier-specific execution flow it delegated to
`references/implement-full.md` or `references/implement-lite.md`, and the run's ending (the full-suite
run an all-`mechanical`/`docs` scope owes itself, the stage write, the hand-off to `/superdev:review`).
The opening and the ending were the same prose on both tiers; only the middle differed. Duplicating that
shared prose into both playbooks was rejected once already — it is exactly the failure mode a single
source of truth exists to prevent — so the command body carried it instead, and each playbook returned
control to the command body once it finished merging slices, for the command to run the ending.

That return trip is what stopped making sense once the opening and the ending were pulled out of the
command body into their own files (`references/run-init.md`, `references/run-handoff.md`, prior slices
of this scope). Both are now `Read` directly, and both playbooks already say when to `Read` them — run
init first, run handoff last. Keeping the command body as the thing that hands control to a playbook
and then waits for it back adds a second control-flow direction for no reason once neither the opening
nor the ending is instructions unique to the command body anymore.

## Decision

`/superdev:implement` is a **router**, nothing more: it resolves the feature, computes the tier, and
`Read`s the one playbook that tier uses. From there, control does not return. Each execution playbook
runs the whole tier's execution start to finish — it opens by reading `references/run-init.md`, does
its own tier-specific work, and closes by reading `references/run-handoff.md`, which is the point where
the run stops and the next chain command is named. `references/run-init.md` and `references/run-handoff.md`
stay two files, shared verbatim by both playbooks, because the opening and the ending are identical
across tiers and only the middle is not.

## Considered options

- **One combined lifecycle document** covering the opening, both tiers' execution, and the ending in a
  single file. It loses on the same ground the shared opening/ending files were split out for in the
  first place: a `lite` run has no use for `full`'s serial-merge machinery, and a `full` run has no use
  for `lite`'s inline loop, so a combined document forces every run to `Read` prose it never acts on.
- **Leave both blocks in the command body, with each playbook pointing back up to them.** This keeps the
  command as the thing every run returns to, and was the shape before this scope started. It loses
  because a playbook that "returns" implies work still to do in the place it returns to — and once the
  opening and the ending are both already pulled into their own files, there is nothing left in the
  command body for a playbook to return for. The round trip was a control-flow shape justified only by
  the prose it used to carry.

## Consequences

A run now reads two more files than it used to: `references/run-init.md` and `references/run-handoff.md`,
`Read` directly by whichever playbook is running, in place of a command body that inlined the same prose.
That is the price paid for one-directional control flow — the controller never resumes a procedure a
playbook already finished. The words themselves did not multiply; they moved. The command body lost
exactly what the two new files gained, so the token cost of a run is roughly unchanged, and the two
extra reads are the only new expense.

`/superdev:implement` keeps only what precedes tier computation — invariants, config, the pre-flight
scan, and the issue-status map — and delegates everything downstream of that point. A reader who wants
the full run in one place now walks three files in a fixed order (run init, the tier's playbook, run
handoff) instead of one; each file states which files come before and after it, so the order is never
guessed.
