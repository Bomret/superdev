# 0220: Every trace line refreshes the run lock

**Status:** Accepted

## Context

A run's liveness is the mtime of `<run-root>/run.lock`: under an hour old is live, older is crashed. Only a chain
command's own step wrote the lock. A `full`-tier run spends hours in implementer dispatches, per-slice reviews, and
fix cycles, which write no lock. Such a run read as crashed while it worked, and the `run-lock` hook allowed a
second session's `git worktree add` on its scopetree (triage #6). ADR 0090 named this gap as open.

The run trace is written throughout a run: edits, test runs, dispatches, and ledger verbs each append a line through
one writer, `appendTrace`.

## Decision

Each line `appendTrace` writes to a run root's `trace.log` also sets that run root's `run.lock` mtime to the current
time. The refresh touches only a lock that exists as a regular file. It never creates a lock, never changes its
content, and never follows a symlink. It runs only after the line was written. A refresh that fails is silent and
leaves the append's result unchanged. The readers of the lock's age and the one-hour threshold are unchanged.

## Considered options

- **Every reader treats the run as live when the lock or `trace.log` is under an hour old.** Rejected: it changes
  each reader (the `run-lock` hook, `scope.js open`, `/superdev:status`, and implement's entry check) where the
  heartbeat changes one writer, and every later reader would need the same rule.
- **A longer threshold, or a configurable one.** Rejected: any fixed threshold is wrong for some run, and a longer one
  delays the crash reading of a run that did stop.
- **Leave the session-ending lines out of the refresh.** Rejected: the lock is already only minutes old when a session
  ends after working, so leaving them out gains little and adds a rule to the one writer.

## Consequences

- A busy run reads as live for as long as it writes trace lines, and as crashed one hour after its last one.
- A session that ends refreshes its run's lock through its closing lines. A `/superdev:implement` resume in a new
  session within the hour meets the live-run branch of its entry check: attended it asks, unattended it blocks.
- A run that writes no trace line for over an hour still reads as crashed: a read-only reviewer dispatch, or an
  implementer that reads without editing, longer than an hour.
- The lock carries no identity, so a second session that edits or runs tests in another run's tree keeps that run's
  lock fresh too.
