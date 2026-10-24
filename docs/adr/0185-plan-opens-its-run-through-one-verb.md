# 0185: Plan opens its run through one verb

**Status:** Accepted

## Context

`/superdev:plan` set up its run in several steps spread over §2 and §6: read the run lock, cut or reuse the scope branch
per `references/scope-mode.md`'s `## Cutting the scope branch` (ADR 0079), write the lock, write an empty `planned`
ledger so an abandoned interview still leaves one, and record the plan step (ADR 0147). §6 repeated the cut, the lock,
the ledger, and the step for a run where no capture crystallised, and refreshed the lock for one where it did. Each path
was prose the model carried out call by call.

The lock's content was freeform text. Whether a fresh lock named another session was the model's judgment from that
text.

## Decision

1. **`scope.js open <type>/<slug> --base <base-ref> [--remote <remote>] [--lock <nonce>]` sets up or rejoins a plan
   run in one call** (`lib/plan-open.js`). It cuts or reuses the scope branch into the scopetree by the `fresh` rule of
   `## Cutting the scope branch`, containment test included, or finds a `planned` ledger's branch and scopetree. It
   writes `run.lock`, writes an empty `planned` ledger with the anchor `pending` when none exists, and records the plan
   step. It prints `cut`, `reused`, or `existing` and exits 0, or prints `locked`, `not-contained`, `dirty`, or `held`
   and exits 3 having written nothing. Plan calls it at §2's first capture and again at §6.
2. **A plan run's lock carries a nonce.** `open` writes `plan <nonce>` and prints the nonce, and the run passes it back
   with `--lock` on its later call. A lock under an hour old that names another nonce stops the run with `locked`: with
   no live ledger, any such lock; on a `planned` ledger, only while the ledger's step stands, the rule
   `/superdev:status` applies to a run live in another session (ADR 0163).
3. **`open` checks the lock itself.** The `run-lock` hook reads the Bash command text and sees no `git worktree add`
   inside the verb. `open` applies the hook's one-hour bound.
4. **A repeat call of the same run records no second plan step.** A call without `--lock`, or on a ledger whose step is
   not `plan`, records a start of its own.

## Considered options

- **Keep the steps as prose and only shorten them.** Costs no code, and leaves the lock identity to the model's
  judgment and the §2/§6 duplication in every plan run's context.
- **Decide the lock holder from the ledger's step alone.** A plan run's own second call would find its own step standing
  and its own fresh lock, and stop itself.

## Consequences

A plan run's setup is one call at each of two points, and its stops are printed outcomes plan acts on. Within an hour of a
plan run that stopped with its step standing, a later plan run on the same feature reads `locked`, as `/superdev:status`
already reports such a run as live.
