'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `test` verb, the late fork on the interrupted path (ADR 0127, INV-0117, ADR 0139).
// Its own file: the 40 rounds are the slow race loop.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { testVerbFixture, scopePath } = require('./scope-setup');

const { D, verif, bash, reset, end } = testVerbFixture();
try {
  // The same late fork on the interrupted path: the verb itself gets SIGTERM, closes the watcher's channel and exits, and the
  // watcher ends the group as it does for a SIGKILLed verb. The late child is still ended. Several rounds, because the order
  // of the verb's exit, the leader's exit, and the channel's close is a race; each round is its own bash driver.
  {
    reset();
    const k = path.join(D, 'kLateTerm');
    fs.mkdirSync(k);
    verif(`trap "sleep 30 & echo \\$! > ${k}/late; exit 0" TERM; touch ${k}/ready; sleep 30 & wait`, 'true');
    for (let n = 1; n <= 40; n++) {
      const out = bash(`rm -f ${k}/ready ${k}/late; node ${scopePath} test full & V=$!; while [ ! -f ${k}/ready ]; do sleep 0.01; done;` +
        ` kill -TERM $V; wait $V; for i in $(seq 100); do [ -s ${k}/late ] && break; sleep 0.1; done;` +
        ` [ -s ${k}/late ] || { echo nolate; exit 0; };` +
        ` for i in $(seq 100); do kill -0 $(cat ${k}/late) 2>/dev/null || { echo gone; exit 0; }; sleep 0.1; done; echo alive`);
      assert.equal(out.stdout.trim().split('\n').pop(), 'gone', 'interrupted verb, round ' + n + ': a process forked while the command ends is ended too: ' + out.stdout + out.stderr);
    }
  }
} finally {
  end();
}
