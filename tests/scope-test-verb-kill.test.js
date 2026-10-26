'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `test` verb, an interrupted run: SIGTERM, SIGKILL through the watcher, a TERM trap,
// and a process forked as the leader dies (ADR 0127, INV-0117, ADR 0139).

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { testVerbFixture, scopePath } = require('./scope-setup');

const { D, verif, bash, lines, reset, end } = testVerbFixture();
try {
  // Killing the verb mid-run writes no line and leaves no child running (SIGTERM, and SIGKILL through the watcher).
  for (const sig of ['TERM', 'KILL']) {
    reset();
    const k = path.join(D, 'k' + sig);
    fs.mkdirSync(k);
    verif(`echo $$ > ${k}/pid; sleep 30 & echo $! > ${k}/spid; wait`, 'true');
    const r = bash(`node ${scopePath} test full & V=$!; while [ ! -s ${k}/spid ]; do sleep 0.05; done; kill -${sig} $V; wait $V;` +
      ` for i in $(seq 100); do kill -0 $(cat ${k}/pid) 2>/dev/null || kill -0 $(cat ${k}/spid) 2>/dev/null || { echo gone; exit 0; }; sleep 0.1; done; echo alive`);
    assert.equal(r.stdout.trim().split('\n').pop(), 'gone', 'SIG' + sig + ': no child is left running: ' + r.stdout + r.stderr);
    assert.deepEqual(lines(), [], 'SIG' + sig + ': no line is written');
  }
  // An interrupted verb has the command's group sent SIGTERM only: a runner that traps it to tear down finishes its cleanup.
  {
    reset();
    const k = path.join(D, 'kTrap');
    fs.mkdirSync(k);
    verif(`trap "sleep 1; touch ${k}/cleaned" TERM; touch ${k}/ready; sleep 30 & wait`, 'true');
    const r = bash(`node ${scopePath} test full & V=$!; while [ ! -f ${k}/ready ]; do sleep 0.05; done; kill -TERM $V; wait $V;` +
      ` for i in $(seq 100); do [ -f ${k}/cleaned ] && { echo cleaned; exit 0; }; sleep 0.1; done; echo missing`);
    assert.equal(r.stdout.trim().split('\n').pop(), 'cleaned', 'the TERM trap finishes its cleanup: ' + r.stdout + r.stderr);
  }
  // A SIGKILLed verb cannot signal: only its watcher does, and it also sends SIGTERM, so the trap still finishes.
  {
    reset();
    const k = path.join(D, 'kTrapKill');
    fs.mkdirSync(k);
    verif(`trap "sleep 1; touch ${k}/cleaned" TERM; touch ${k}/ready; sleep 30 & wait`, 'true');
    const r = bash(`node ${scopePath} test full & V=$!; while [ ! -f ${k}/ready ]; do sleep 0.05; done; kill -KILL $V; wait $V;` +
      ` for i in $(seq 100); do [ -f ${k}/cleaned ] && { echo cleaned; exit 0; }; sleep 0.1; done; echo missing`);
    assert.equal(r.stdout.trim().split('\n').pop(), 'cleaned', 'after SIGKILL of the verb the TERM trap finishes its cleanup: ' + r.stdout + r.stderr);
  }
  // A process the command forks as its leader is dying (here from the TERM trap, after the watcher's signal went out) is
  // still in the group and still gets ended: it neither outlives the verb nor holds the caller's output open.
  {
    reset();
    const k = path.join(D, 'kLate');
    fs.mkdirSync(k);
    verif(`trap "sleep 30 & echo \\$! > ${k}/late; exit 0" TERM; touch ${k}/ready; sleep 30 & wait`, 'true');
    const r = bash(`node ${scopePath} test full & V=$!; while [ ! -f ${k}/ready ]; do sleep 0.05; done; kill -KILL $V; wait $V;` +
      ` for i in $(seq 100); do [ -s ${k}/late ] && break; sleep 0.1; done;` +
      ` for i in $(seq 100); do kill -0 $(cat ${k}/late) 2>/dev/null || { echo gone; exit 0; }; sleep 0.1; done; echo alive`);
    assert.equal(r.stdout.trim().split('\n').pop(), 'gone', 'a process forked while the command ends is ended too: ' + r.stdout + r.stderr);
  }
} finally {
  end();
}
