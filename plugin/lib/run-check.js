'use strict';

// run-check.js: the digest check every scope.js verb that writes to a run makes before its write (ADR 0225, INV-0117).

const fs = require('fs');
const path = require('path');
const { readBytes, stateOf, sameState, readSide, writeSide, withRunLock } = require('./run-digest.js');
const { traceLine } = require('./trace-log.js');

const FILES = [['ledger.md', 'ledger'], ['trace.log', 'trace']];

// Compares `ledger.md` and `trace.log` of `root` with the run's digest. A file that differs, a file deleted while its digest is
// present, and a trace with a foreign append each print one warning on stderr naming the file and append a `tamper <file>` trace
// line. The digest then seals what is on disk and the verb goes on. A file with no digest, as in a run an older release wrote, is
// sealed and reported on no stream. The check holds the digest lock, so no reader sees a file new under an old digest.
function checkRun(root) {
  withRunLock(root, () => {
    const side = readSide(root);
    const tampered = [];
    let changed = false;
    for (const [name, key] of FILES) {
      const now = stateOf(readBytes(path.join(root, name)));
      if (sameState(side[key], now)) continue;
      if (side[key]) tampered.push(name);
      changed = true;
      if (now === null) delete side[key];
      else side[key] = now;
    }
    if (!changed) return;
    const trace = path.join(root, 'trace.log');
    for (const name of tampered) {
      process.stderr.write(`scope.js: ${name} in ${root} was changed outside scope.js; recorded a tamper line in trace.log\n`);
      try { fs.appendFileSync(trace, traceLine({ kind: 'tamper', fields: [name] })); } catch { /* the run has no writable trace: the warning stands */ }
    }
    if (tampered.length) {
      const now = stateOf(readBytes(trace));
      if (now) side.trace = now;
    }
    writeSide(root, side);
  });
}

module.exports = { checkRun };
