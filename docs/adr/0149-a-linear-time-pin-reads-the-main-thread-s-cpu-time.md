# 0149: A linear-time pin reads the main thread's CPU time

**Status:** Accepted

**Amends:** [ADR 0086](0086-a-duration-is-never-the-assertion.md), whose same-run baseline the linear-time
pins measure in wall-clock time.

**Context.** ADR 0086 allows a duration assertion that compares against a same-run baseline. The
linear-time pins hold that form: `tests/linear-time.js`'s `timePair` times a small input and an input four
times as large in the same run, and the pin fails when the larger reading exceeds nine times the smaller
one. Linear code gives about four times, and quadratic code gives about sixteen.

`timePair` read `process.hrtime`, a wall clock. A wall-clock reading includes every moment the process
spent descheduled. Under parallel load the two readings of one pin do not lose the same share of time, so
the ratio stops measuring the code. Triage #1100 and #1098 record pins in `tests/shell-words.test.js` and
`tests/merge-guard.test.js` that failed during concurrent full-suite runs and passed alone. With 32 copies
of those two suites running on 8 cores, almost every pin failed, at ratios from 10 to 40. A ratio above
sixteen is outside what any ceiling between linear and quadratic can absorb, so loosening the ceiling
does not fix it.

`process.cpuUsage()` does not fix it either. It counts every thread of the process, and the garbage
collector's helper threads do more work on the larger input: the pins failed at about ten times with no
load at all.

**Decision.** A linear-time pin measures the CPU time of the thread that runs the code under test,
`process.threadCpuUsage()`. Time the thread spends descheduled or blocked counts toward neither reading,
and work on other threads counts toward neither. Every linear-time pin takes its readings through
`timePair`, so the clock is chosen in one place. Each pin keeps its own input ratio and ceiling.

`process.threadCpuUsage()` exists from Node 22.19.0 and 23.9.0. The repository's `engines.node` requires
Node 24 or later, the LTS line, so the test toolchain never runs without it. The hooks and scripts under
`plugin/` do not call it, so the Node an adopter runs is not constrained by this decision.

**Considered options.**

- *Wall clock with a wider input ratio.* Sixteen times the input gives sixteen when linear and 256 when
  quadratic, so a ceiling near 64 leaves room for load. Rejected: every pin runs four times longer, and a
  reading still depends on how the scheduler treats the process.
- *A wall-clock fallback on a Node without `threadCpuUsage`.* Rejected: it keeps a second path that
  restores the failure on exactly the toolchains it serves.

**Consequences.** A pin can now fail only when the code's own CPU work grows faster than its ceiling
allows. A suite in `tests/` proves that `timePair` does not count time the thread spends blocked, without
loading the machine. The CPU clock has microsecond resolution, so `timePair`'s repeat count, which already
stretches one sample to about 25 ms, keeps the readings far above it. A calibration run shorter than that
resolution reads zero, and `timePair` counts it as 1 µs, so the repeat count stays bounded.
