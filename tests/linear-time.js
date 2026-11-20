'use strict';

// Shared by the linear-time pins: a same-run baseline (AGENTS.md, ADR 0086), never an absolute bound.
//
// timePair(run, small, big, ceiling) -> [smallNs, bigNs]
// Every reading is the CPU time of the thread that calls `run`, in nanoseconds (ADR 0149): time the thread spends
// descheduled or blocked reaches no reading. Machine load can still move a reading, which the re-measurement below absorbs.
// Work `run` hands to another thread or a child process reaches no reading either, so a pin times work done in this thread.
// Runs `run(small)` and `run(big)` once each to warm them, then picks a repeat count that makes one sample of the small input
// take about 10 ms, so a sub-millisecond baseline is no reading of timer noise. It returns the best of three samples of each
// input, taken alternately. A pair that reads at or over `ceiling` (`bigNs >= smallNs * ceiling`) is measured again, up to
// three attempts in all, and the last pair is returned: a one-off load spike decides no pin, while load that lasts through all
// three attempts, or code whose cost grows faster than the ceiling allows, still fails it. `ceiling` is required.
//
// cpuNs() -> the calling thread's CPU time in nanoseconds, the clock timePair reads, for a pin that sizes its input.
const cpuNs = () => {
  const { user, system } = process.threadCpuUsage();
  return (user + system) * 1000;
};

function measure(run, small, big) {
  run(small);
  run(big);
  // The repeat count is how many runs of the small input the thread clock needs to advance 10 ms. A clock that steps in
  // whole milliseconds (Linux) reads one short run as zero, so the count comes from the runs, never from one run's reading.
  // A clock that does not advance at all stops the count at 10000.
  const t0 = cpuNs();
  let reps = 0;
  do {
    run(small);
    reps++;
  } while (cpuNs() - t0 < 10e6 && reps < 10000);
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

function timePair(run, small, big, ceiling) {
  if (!Number.isFinite(ceiling)) throw new TypeError(`timePair needs the pin's finite ceiling, got ${ceiling}`);
  let pair;
  for (let attempt = 0; attempt < 3; attempt++) {
    pair = measure(run, small, big);
    if (pair[1] < pair[0] * ceiling) break;
  }
  return pair;
}

module.exports = { timePair, cpuNs };
