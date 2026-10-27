'use strict';

// No verdict (INV-0009, ADR 0086): a spawnSync result ended by its own bound decided nothing.
// Call this right after a bounded spawnSync/execFileSync-style result, before asserting on it —
// a hit bound then fails naming the kill, instead of the assertion that follows misreading
// `status: null` as a behaviour verdict ("the gate did not block", say). Node sets `result.signal`
// whenever the bound killed the child — including a timeout, where `result.error` (ETIMEDOUT) is
// also set — so `signal` is checked first. A launch failure (e.g. ENOENT) carries `result.error`
// with no `signal` AND no `status`: the OS never got as far as running a process to report one, so
// it never started, was never killed, and is reported as its own case. `result.error` alone is not
// enough — a child that exits before draining a payload larger than the pipe buffer reports
// `error: EPIPE` on a run that otherwise completed and set `status` (verified with Node's own
// child_process on this machine: `{status:0, signal:null, error:'EPIPE'}`). A process that
// reported a status started, whatever `error` also carries.
function assertSpawnDecided(result, label) {
  if (result.signal) {
    throw new Error(`${label}: killed by its own bound (${result.signal}) before it could decide`);
  }
  if (result.error && result.status == null) {
    throw new Error(`${label}: spawn never started — ${result.error.message}`);
  }
}

// The bound a bounded spawn runs under, taken from this run rather than fixed (AGENTS.md, ADR 0086): `sample()`
// runs one healthy call of the kind the bound will cut, three times, and the bound is ten times the slowest, never
// below 1000 ms. A healthy call then clears the bound however busy the machine is.
function boundFromSamples(sample) {
  let slowest = 0;
  for (let i = 0; i < 3; i++) {
    const started = Date.now();
    sample(i);
    slowest = Math.max(slowest, Date.now() - started);
  }
  return Math.max(1000, 10 * slowest);
}

// One literal `sh` word: single-quoted, so a `$`, a backtick, a quote, or a space in a path (a TMPDIR, a checkout)
// reaches the shell as written. Every helper that puts a path into a `sh -c` command or a shell script goes through it
// (triage #1380).
function shq(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

module.exports = { assertSpawnDecided, boundFromSamples, shq };
