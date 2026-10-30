'use strict';

// A `node --require` preload for a spawned scope.js: a `child_process.spawnSync` call that carries push.js's 60 s
// production bound gets SHORT_BOUND_MS instead, so a hung git call ends in a moment and the test never waits out
// the real bound. SHORT_BOUND_MARKER names a file that gains one line per call it shortened, which proves the
// substitution took effect. It starts no shell and no process.

const fs = require('node:fs');
const cp = require('node:child_process');

const PRODUCTION_BOUND_MS = 60000;
const real = cp.spawnSync;
cp.spawnSync = function spawnSync(file, args, opts) {
  if (opts && opts.timeout === PRODUCTION_BOUND_MS) {
    fs.appendFileSync(process.env.SHORT_BOUND_MARKER, `${file} ${(args || []).join(' ')}\n`);
    opts = { ...opts, timeout: Number(process.env.SHORT_BOUND_MS) };
  }
  return real.call(this, file, args, opts);
};
