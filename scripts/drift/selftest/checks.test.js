'use strict';

// Selftest suite: every registered check, against an empty tree. A check that reads a named document
// fails, naming the path, when that document is missing. A check that walks a directory reads whatever
// the directory holds, so an empty tree gives it nothing to report. `formatGap` prints a missing document by its path and
// every other gap shape, an unresolved heading citation included, by its check's own message. Run by ./index.js.

const { docPath, shippedDir } = require('../lib');
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
    'worktree-list-one-parser',
    'test-seams',
    'conflict-conclusion-no-commit',
    'agent-tool-agnostic',
    'deploy-runner-exclusivity',
    'ship-no-opens-pr',
    'dod-box-rule',
    'plugin-root-quoted',
    'plugin-prefix-path',
    'no-offer-start',
    'no-ci-wait',
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
      assert.equal(line, `${g.source} is missing — the \`${check.id}\` check reads it`, `${check.id}: the printed gap names the path and the check`);
    }
  }

  // Every other gap shape prints its check's own message, naming where the gap is.
  const byId = (id) => CHECKS.find((c) => c.id === id);
  const citing = path.join('skills', 'foo', 'SKILL.md');
  const headingCitation = byId('heading-citation');
  const citationGaps = (body, extra = {}) => headingCitation.run(fixture({ 'skills/foo/SKILL.md': body, ...extra }));
  const [open] = citationGaps("See `open.md`'s `## One`.\n", { 'references/open.md': '# O\n\n## One\n\n```\nnever closed\n' });
  assert.equal(formatGap(headingCitation, open), `${citing} cites open.md, which holds an unterminated code fence, so its headings cannot be read`, 'an unterminated cited file prints its own message');
  const [level] = citationGaps("See `t.md`'s `### One`.\n", { 'references/t.md': '# T\n\n## One\n' });
  assert.equal(formatGap(headingCitation, level), `${citing} cites t.md's \`### One\`, which t.md does not carry at that level`, 'a heading at the wrong level prints its own message');
  // A cited file that resolves nowhere is reported by the cited file and the citing document, never as the citing document missing.
  const [unresolved] = citationGaps("See `nowhere.md`'s `## X`.\n");
  assert.equal(formatGap(headingCitation, unresolved), `${citing} cites nowhere.md, which resolves to no file`, 'an unresolved citation names the cited file and the citing document');
  assert.equal(formatGap(byId('no-ci-wait'), { source: 'skills/x/SKILL.md', line: 7 }).split(' ')[0], 'plugin/skills/x/SKILL.md:7', 'a no-ci-wait gap prints plugin/<source>:<line>');
  assert.equal(formatGap(byId('no-offer-start'), { source: 'plugin/skills/x/SKILL.md', line: 3 }).split(' ')[0], 'plugin/skills/x/SKILL.md:3', 'a no-offer-start gap prints <source>:<line>');

  // A directory walker passes vacuously when its directory is gone, so every directory the walkers read
  // must exist in the real repository.
  const walkedDirs = [
    ...['skills', 'agents', 'references'].map((dir) => docPath(realRoot, dir)),
    ...['hooks', 'scripts', 'lib'].map((dir) => shippedDir(realRoot, dir)),
    path.join(realRoot, 'docs', 'adr'),
    path.join(realRoot, 'tests'),
    path.join(realRoot, 'plugin'),
  ];
  for (const dir of walkedDirs) {
    assert.ok(fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory(), `the directory walkers read ${dir}`);
  }

  console.log('drift-check selftest (checks) ok');
};
