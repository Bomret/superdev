'use strict';

// timePair, the shared helper of the linear-time pins (ADR 0149): it reads the CPU time of the thread running the code,
// so time the thread spends blocked or descheduled reaches neither reading. Every case here runs in this one process and
// loads the machine with nothing else.

const assert = require('node:assert');
const { timePair } = require('./linear-time.js');

// About a millisecond of CPU work per unit, on the thread that calls it.
const work = (units) => {
  let x = 0;
  for (let i = 0; i < units * 1e6; i++) x = (x + i) | 0;
  return x;
};
const lock = new Int32Array(new SharedArrayBuffer(4));

// Linear work whose big input also blocks the thread without using CPU, the way a descheduled process waits: the
// wait reaches neither reading, so the pair still reads about four times for four times the input. The wait lasts ten
// times the small input's measured wall time, so on a wall clock the big input reads about fourteen times, above the ceiling.
{
  let smallMs = Infinity;
  for (let k = 0; k < 3; k++) {
    const t = performance.now();
    work(10);
    smallMs = Math.min(smallMs, performance.now() - t);
  }
  const [small, big] = timePair((n) => {
    work(n * 10);
    if (n > 1) Atomics.wait(lock, 0, 0, smallMs * 10);
  }, 1, 4);
  assert.ok(big < small * 9, `blocked time reached a reading: ${small} ns, four times the input ${big} ns`);
}

// Quadratic work still reads above the ceiling, so the thread clock cannot make a pin pass vacuously. The readings are
// nanoseconds: a sample of the small input lasts about 25 ms, tens of millions of them.
{
  const [small, big] = timePair((n) => work(n * n * 5), 1, 4);
  assert.ok(big > small * 9, `quadratic work read within the linear ceiling: ${small} ns, four times the input ${big} ns`);
  assert.ok(small > 1e7, `a reading is not in nanoseconds: ${small}`);
}

// Work handed to a child process reaches no reading: the big input runs four times the small input's work in a child,
// and its reading, the spawn's own cost on this thread, stays below the small input's in-thread work.
{
  const cp = require('node:child_process');
  const { assertSpawnDecided } = require('./spawn-verdict');
  const [small, big] = timePair((n) => {
    if (n === 1) return work(10);
    const r = cp.spawnSync(process.execPath, ['-e', 'let x = 0; for (let i = 0; i < 4e7; i++) x = (x + i) | 0;'],{ timeout: 30000 });
    assertSpawnDecided(r, 'the child-process case');
    assert.strictEqual(r.status, 0, `the child-process case's child failed: ${r.stderr}`);
  }, 1, 4);
  assert.ok(big < small, `a child process's work reached a reading: ${small} ns in this thread, ${big} ns in a child`);
}

// A run too short for the thread clock to see reads as zero when the repeat count is calibrated; the count stays bounded
// by the clock's microsecond resolution (25 ms / 1 µs), never one repeat per nanosecond of a reading that was zero. The
// thread clock is held still for this case, so the calibration reads zero on every run.
{
  const bound = 3 + 6 * 25000;
  const real = process.threadCpuUsage;
  process.threadCpuUsage = () => ({ user: 0, system: 0 });
  let calls = 0;
  try {
    timePair(() => {
      if (++calls > bound) throw new Error(`a zero calibration gave an unbounded repeat count: over ${bound} calls`);
    }, 1, 4);
  } finally {
    process.threadCpuUsage = real;
  }
}

// No linear-time pin reads a wall clock, its input sizing included: a top-level block, a column-0 line and the indented
// lines under it, is a pin when a code line in it requires `./linear-time` or calls `timePair` or `cpuNs`, and no code
// line in a pin reads `performance.now`, `process.hrtime`, or `Date.now`. Single- and double-quoted strings are no read;
// a template literal still counts, since it can interpolate a call. This suite is left out, since its blocked-time case
// reads the wall clock to size its wait. A wall-clock read in another top-level block of a suite, such as a qualitative
// ceiling, is no pin and stays allowed. The scan sees only the pin's own block, so it misses a hand-timed pin that never
// uses the helper, a wall-clock read in a separate top-level function or statement the pin calls, and a read that an
// unpaired `'` or `"` earlier on its line, such as one in a regex literal or a trailing comment, pairs into a string.
{
  const fs = require('node:fs');
  const path = require('node:path');
  const wallClock = /\b(?:performance\.now|process\.hrtime|Date\.now)\b/;
  const helper = /require\('\.\/linear-time(?:\.js)?'\)|\b(?:timePair|cpuNs)\(/;
  const code = (l) => !/^\s*\/\//.test(l);
  const unquoted = (l) => l.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''");
  const wallReads = (text) => {
    const lines = text.split('\n');
    const hits = [];
    let start = 0;
    for (let i = 1; i <= lines.length; i++) {
      if (i < lines.length && !/^\S/.test(lines[i])) continue;
      const block = lines.slice(start, i);
      if (block.some((l) => code(l) && helper.test(l))) {
        block.forEach((l, k) => { if (code(l) && wallClock.test(unquoted(l))) hits.push(start + k + 1); });
      }
      start = i;
    }
    return hits;
  };
  assert.deepStrictEqual(wallReads("{\n  const { cpuNs } = require('./linear-time');\n  const t = performance.now();\n}\n"), [3],
    'a wall-clock read inside a pin block is found');
  assert.deepStrictEqual(wallReads("{\n  Date.now();\n}\n{\n  require('./linear-time');\n}\n"), [],
    'a wall-clock read outside every pin block is allowed');
  assert.deepStrictEqual(wallReads("const { timePair } = require('./linear-time');\n{\n  Date.now();\n}\n{\n  const t = performance.now();\n  timePair(f, 1, 4);\n}\n"), [6],
    'a top-level require scopes to the blocks that call the helper');
  assert.deepStrictEqual(wallReads("const { timePair } = require('./linear-time');\ntimePair((n) => {\n  const t = Date.now();\n}, 1, 4);\n"), [3],
    'a pin written at column 0 is scanned');
  assert.deepStrictEqual(wallReads("{\n  require('./linear-time');\n  const msg = 'read cpuNs, never Date.now';\n}\n"), [],
    'a string literal naming a wall clock is no read');
  for (const file of fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js') && f !== path.basename(__filename))) {
    const hits = wallReads(fs.readFileSync(path.join(__dirname, file), 'utf8'));
    assert.deepStrictEqual(hits, [], `${file}: a linear-time pin reads a wall clock at line(s) ${hits.join(', ')}; read cpuNs or timePair`);
  }
}

console.log('linear-time: ok');
