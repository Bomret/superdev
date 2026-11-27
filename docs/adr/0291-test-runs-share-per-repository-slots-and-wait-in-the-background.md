# 0291: Test runs share per-repository slots and wait in the background

**Status:** Accepted

**Amends:** [ADR 0232](0232-the-loop-runs-test-files-and-the-focused-command-once.md), whose foreground rule with the
Bash ceiling no longer holds for the main session, and
[ADR 0264](0264-a-subagent-waits-out-a-test-run-claude-code-moves-to-the-background.md), whose background wait every
test run, fail-to-pass run, and prepare call follows, in the main session too.

## Context

Several superdev sessions, and the parallel implementers inside one full-tier run, run test commands in one
repository on one machine at the same time. `implement-full.md` caps implementers at 4 per session, and nothing
coordinates across sessions. In repositories with integration or end-to-end suites the combined load saturates CPU
and memory: runs slow down and fail falsely on timeouts and timing tests, agents chase red runs that are not real, and
the machine turns sluggish for the operator. ADR 0242's context records the same on this repository: four parallel
full suites loaded the machine until timing tests failed. Concurrent runs also collide on shared resources such as
fixed ports or one local database. Every run already passes through one choke point, the runner (ADR 0127).

## Decision

1. **Slots.** The `test`, `fail-to-pass`, and `prepare` verbs each take one **Test slot** before they start their
   command, and wait while none is free. The pool is per repository, kept in the git common dir, so the main checkout
   and every slicetree and scopetree share it and two repositories never wait on each other. `fail-to-pass` holds its
   slot for its whole call, its internal preparation included, and takes it before any of its timers starts. A
   `prepare` call whose stamp skips the command takes no slot.
2. **No trace of the wait.** A verb takes its slot before it reads the tree state or marks the run trace, so the wait
   lands in no run line's duration or tree state and records no run.
3. **The count.** The operator configuration's `verification.testSlots` sets the count, a whole number from 1 to 64.
   It is a machine fact, so no tracked document holds it (ADR 0207). Absent, the count is 1: most runners already use
   every core, so one run at a time is near the machine's throughput and free of resource clashes. `/superdev:setup`
   asks for it and writes it.
4. **The holder.** A slot record names the verb's pid, its command's process group, and the machine's boot stamp. The
   slot is held while the verb lives or, on POSIX, while the group still has a member, so a runner that ignores the
   watcher's SIGTERM keeps its slot. Windows has no process group, so there the verb's pid alone holds it. A record
   from an earlier boot is stale. A waiter prints the run holding the slot and the record's path, and the first
   waiter to claim a free slot wins.
5. **The wait in the background.** Every test run, fail-to-pass run, and prepare call, in the main session as in a
   subagent, runs redirected to a file outside the working tree with `exit=<status>` appended, and its caller waits
   with Bash calls that each end within 170 s (`references/test-selection.md`). The 600 s ceiling then never ends a
   queued run while it waits or while it runs.

## Considered options

- **Load-gated admission**, starting a run only while `os.loadavg()` is below the core count. Rejected: waiters start
  together once load drops, load average lags the load that runs add, and it does nothing for port or database
  clashes.
- **A machine-wide pool across repositories.** Deferred: the pain is one repository, and a global pool needs a
  location outside every repository.
- **Weighted or cost-class slots**, a unit run counting less than an end-to-end run. Deferred: one flat pool reaches
  the goal, at the cost that a short focused run waits behind a long one.
- **FIFO tickets.** Deferred: polling waiters rarely starve at a handful of runs, and tickets add state that needs its
  own stale cleanup.
- **Pid plus process start time** as the holder's identity. Lost: it needs a platform-specific spawn (`ps`,
  PowerShell) on every poll; a reused pid inside one boot stays a residual risk the waiting line lets the operator
  clear.
- **A foreground wait with a rerun rule** for the main session. Lost: a slot that frees late lets the run start and
  the ceiling end it midway, which loses the run's work.

## Consequences

- One run at a time is the default for every adopter on upgrade; a full-tier wave's runs queue. `/superdev:setup`'s
  re-run asks for the count, and the release notes name the default.
- The main session spends one Bash call per 170 s of every long run.
- A session still on an older plugin version takes no slot until it restarts.
- A runner that outlives its killed verb on Windows can exceed the count until it ends.
