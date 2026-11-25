'use strict';

// Selftest suite: every registered check, against an empty tree. A check that reads a named document
// fails, naming the path, when that document is missing, unless its own `scripts/AGENTS.md` row says an absent named
// document holds nothing; such a check sits in DIRECTORY_WALKERS below. A check that walks a directory reads whatever
// the directory holds, so an empty tree gives it nothing to report. `formatGap` prints a missing document by its path and
// the check's id. Every other gap shape is pinned to the exact line it prints: each of the heading-citation check's three
// messages, each check's own message, and the shared contract-gap message for every registered check that prints it. A
// check given its own message gets its line in OWN_LINES below. Run by ./index.js.

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
    'unterminated-fence',
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

  // Each heading-citation message names the citing document and the cited file.
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

  // Each check with a message of its own, a gap carrying the fields its scanner emits, and the exact line it prints.
  const OWN_LINES = {
    reference: [
      { source: 'skills/foo/SKILL.md', reference: 'references/gone.md' },
      'missing references/gone.md — referenced by skills/foo/SKILL.md',
    ],
    'command-resolution': [
      { source: 'agents/x.md', command: '/superdev:gone' },
      'agents/x.md names `/superdev:gone`, which has no file under skills/',
    ],
    'adr-status': [
      { source: 'docs/adr/0001-x.md' },
      'docs/adr/0001-x.md states no status — expected `**Status:** <Accepted | Proposed | Superseded | Rejected>` on its own line, so a decision nothing implements cannot read as one the code honours',
    ],
    'invariant-register-join': [
      { message: 'INV-0001: Check: `gone` is not a registered drift-check id' },
      'INV-0001: Check: `gone` is not a registered drift-check id',
    ],
    'run-root': [
      { source: 'skills/implement/SKILL.md', match: '.superdev/scopes/x/dod.md' },
      'checkout-relative run-root path `.superdev/scopes/x/dod.md` in skills/implement/SKILL.md — use `<run-root>/…`',
    ],
    'scopetree-run-root': [
      { source: 'skills/ship/SKILL.md', match: '.superdev/scopes/x/scopetree' },
      'checkout-relative scopetree path `.superdev/scopes/x/scopetree` in skills/ship/SKILL.md — use `<run-root>/scopetree`',
    ],
    'no-offer-start': [
      { source: 'skills/x/SKILL.md', line: 3 },
      'skills/x/SKILL.md:3 names `start_session` or the offer marker line — superdev starts no session and makes no offer (ADR 0253)',
    ],
    'no-ci-wait': [
      { source: 'skills/x/SKILL.md', line: 7 },
      'plugin/skills/x/SKILL.md:7 names a wait or a poll on CI — the only wait on a check is `scope.js ci --wait`, bounded (INV-0192, ADR 0280)',
    ],
    'no-base-branch-commit': [
      { source: 'skills/x/SKILL.md', line: 9 },
      'skills/x/SKILL.md:9 instructs a commit, a push, or a merge to the base branch — no superdev command reaches the base branch that way (INV-0001, docs/invariants.md)',
    ],
    'unterminated-fence': [
      { source: 'plugin/references/x.md', line: 3 },
      'plugin/references/x.md:3 opens a fenced code block that never closes — every fence-masking drift check reads nothing below it',
    ],
  };
  for (const [id, [gap, line]] of Object.entries(OWN_LINES)) {
    assert.ok(byId(id), `${id} is a registered check`);
    assert.equal(formatGap(byId(id), gap), line, `${id}: a gap prints the check's own message`);
  }
  // Every other registered check prints the shared contract-gap message. A check given a message of its own fails here
  // until its line joins OWN_LINES.
  const contractGap = { source: 'references/x.md', expectation: 'carry `## Y`' };
  for (const check of CHECKS) {
    if (check.id === 'heading-citation' || check.id in OWN_LINES) continue;
    assert.equal(
      formatGap(check, contractGap),
      'references/x.md no longer meets its contract — expected it to carry `## Y`',
      `${check.id}: a gap prints the shared contract-gap message`,
    );
  }

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
