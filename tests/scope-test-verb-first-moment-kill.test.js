'use strict';

// Fixture repositories commit regardless of the maintainer's global git config: a global
// `commit.gpgsign` whose signer is unavailable would fail every fixture commit with status 128 (#780).
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `test` verb, a SIGKILL at the first moment the command is alive (ADR 0127, INV-0117,
// ADR 0139). Its own file: the 25 rounds are a slow race loop, and the SIGTERM rounds run beside it in
// `scope-test-verb-first-moment-term.test.js`.

const { firstMoment } = require('./scope-setup');

firstMoment('KILL');
