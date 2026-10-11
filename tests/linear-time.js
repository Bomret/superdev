'use strict';

// Shared by the linear-time pins: a same-run baseline (AGENTS.md, ADR 0086), never an absolute bound.
//
// timePair(run, small, big) -> [smallNs, bigNs]
// Runs `run(small)` and `run(big)` once each to warm them, then picks a repeat count that makes one sample of the small input
// take about 25 ms, so a sub-millisecond baseline is no reading of timer noise. It returns the best of three samples of each
// input, taken alternately, so a change in machine load during the pin reaches both readings alike.
function timePair(run, small, big) {
  run(small);
  run(big);
  const t0 = process.hrtime.bigint();
  run(small);
  const reps = Math.max(1, Math.ceil(25e6 / Math.max(1, Number(process.hrtime.bigint() - t0))));
  const sample = (input) => {
    const t = process.hrtime.bigint();
    for (let k = 0; k < reps; k++) run(input);
    return Number(process.hrtime.bigint() - t);
  };
  let a = Infinity;
  let b = Infinity;
  for (let k = 0; k < 3; k++) {
    a = Math.min(a, sample(small));
    b = Math.min(b, sample(big));
  }
  return [a, b];
}

module.exports = { timePair };
