'use strict';

// Selftest suite: every registered check, against an empty tree. A check that reads a named document
// fails, naming the path, when that document is missing. A check that walks a directory reads whatever
// the directory holds, so an empty tree gives it nothing to report. Run by ./index.js.

const { docPath } = require('../lib');
const CHECKS = require('../checks');
const { formatGap } = require('../../drift-check');

module.exports = ({ assert, fs, path, fixture, realRoot }) => {
  const DIRECTORY_WALKERS = new Set([
    'reference',
    'heading-citation',
    'command-resolution',
    'adr-numbers',
    'adr-status',
    'adr-relations',
    'no-second-reader',
    'shell-spawn',
    'test-seams',
    'conflict-conclusion-no-commit',
    'agent-tool-agnostic',
    'deploy-runner-exclusivity',
    'ship-no-opens-pr',
  ]);
  const empty = fixture({ '.keep': '' });
  for (const check of CHECKS) {
    const gaps = check.run(empty);
    if (DIRECTORY_WALKERS.has(check.id)) {
      assert.deepEqual(gaps, [], `${check.id}: an empty tree gives a directory walker nothing to report`);
      continue;
    }
    const missing = gaps.filter((g) => g.missing);
    assert.ok(missing.length > 0, `${check.id}: a missing document it reads fails the check`);
    for (const g of missing) {
      assert.ok(typeof g.source === 'string' && g.source.length > 0, `${check.id}: the gap names a path`);
      const line = formatGap(check, g);
      assert.ok(line.includes(g.source) && line.includes(check.id), `${check.id}: the printed gap names the path and the check`);
    }
  }

  // A directory walker passes vacuously when its directory is gone, so every directory the walkers read
  // must exist in the real repository.
  const walkedDirs = [
    ...['skills', 'agents', 'references', 'hooks', 'scripts', 'lib'].map((dir) => docPath(realRoot, dir)),
    path.join(realRoot, 'docs', 'adr'),
    path.join(realRoot, 'tests'),
  ];
  for (const dir of walkedDirs) {
    assert.ok(fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory(), `the directory walkers read ${dir}`);
  }

  console.log('drift-check selftest (checks) ok');
};
