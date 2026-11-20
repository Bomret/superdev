'use strict';

// Test preload (`NODE_OPTIONS=--require <this file>`): wraps `child_process.spawnSync` in the process it is loaded into and appends
// one line to the file named by `SPAWN_KILL_FILE` for every `git` call that a bound or a signal ended (a `signal` on the result, or
// `error.code` ETIMEDOUT). A suite that runs a shipped hook as a child process reads that file to tell a decision that carried a
// killed git call (no verdict, INV-0009) from one that ran to its end. It lives under `tests/`, so the shipped hook carries no seam
// (ADR 0154). It records nothing when `SPAWN_KILL_FILE` is unset.

const cp = require('node:child_process');
const fs = require('node:fs');

const killFile = process.env.SPAWN_KILL_FILE;
const realSpawnSync = cp.spawnSync;
if (killFile) {
  cp.spawnSync = function spawnSync(command, ...rest) {
    const res = realSpawnSync.call(this, command, ...rest);
    if (command === 'git' && (res.signal || (res.error && res.error.code === 'ETIMEDOUT'))) fs.appendFileSync(killFile, 'killed\n');
    return res;
  };
}
