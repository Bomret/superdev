'use strict';

// Shared by the linear-time pins: a same-run baseline (AGENTS.md, ADR 0086), never an absolute bound.
//
// timePair(run, small, big) -> [smallNs, bigNs]
// Every reading is the CPU time of the thread that calls `run`, in nanoseconds (ADR 0149): time the thread spends
// descheduled or blocked reaches no reading, so machine load cannot skew the pair. Work `run` hands to another thread or a
// child process reaches no reading either, so a pin times work done in this thread.
// Runs `run(small)` and `run(big)` once each to warm them, then picks a repeat count that makes one sample of the small input
// take about 25 ms, so a sub-millisecond baseline is no reading of timer noise. It returns the best of three samples of each
// input, taken alternately.
//
// cpuNs() -> the calling thread's CPU time in nanoseconds, the clock timePair reads, for a pin that sizes its input.
const cpuNs = () => {
  const { user, system } = process.threadCpuUsage();
  return (user + system) * 1000;
};

function timePair(run, small, big) {
  run(small);
  run(big);
  const t0 = cpuNs();
  run(small);
  // A calibration below the clock's 1 µs resolution reads zero; it counts as 1 µs, so the repeat count stays bounded.
  const reps = Math.max(1, Math.ceil(25e6 / Math.max(1000, cpuNs() - t0)));
  const sample = (input) => {
    const t = cpuNs();
    for (let k = 0; k < reps; k++) run(input);
    return cpuNs() - t;
  };
  let a = Infinity;
  let b = Infinity;
  for (let k = 0; k < 3; k++) {
    a = Math.min(a, sample(small));
    b = Math.min(b, sample(big));
  }
  return [a, b];
}

module.exports = { timePair, cpuNs };
