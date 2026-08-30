'use strict';

// Selftest for the `opencode-render` check (scripts/drift/scanners.js's scanOpencodeFixtures):
// a fixture root carries a miniature plugin tree plus the committed-fixture tree that matches its
// render, and the assertions cover a match, a content drift, and a missing render.

module.exports = ({ assert, fs, path, fixture, realRoot }) => {
  const { scanOpencodeFixtures } = require('../scanners');
  const { FIXTURE_DIR, renderNormalized } = require('../opencode-fixtures');

  const SKILL = [
    '---',
    'name: plan',
    'description: Plan a feature.',
    '---',
    '',
    'Read ${CLAUDE_PLUGIN_ROOT}/references/plan-contract.md.',
    '',
  ].join('\n');
  const AGENT = [
    '---',
    'name: worker',
    'description: Does the work.',
    'tools: Read, Bash',
    'model: sonnet',
    '---',
    '',
    'Work.',
    '',
  ].join('\n');
  const pluginTree = {
    'plugin/skills/plan/SKILL.md': SKILL,
    'plugin/agents/worker.md': AGENT,
  };

  // A root whose committed fixtures were rendered from its own plugin tree reports no gaps.
  const matchedRoot = fixture({ ...pluginTree });
  renderNormalized(matchedRoot, path.join(matchedRoot, FIXTURE_DIR));
  assert.deepEqual(scanOpencodeFixtures(matchedRoot), []);

  // A committed fixture that no longer matches a fresh render is one gap per drifted file.
  const driftedRoot = fixture({
    ...pluginTree,
    'plugin/skills/plan/SKILL.md': SKILL.replace('Plan a feature.', 'Plan a whole program.'),
  });
  renderNormalized(matchedRoot, path.join(driftedRoot, FIXTURE_DIR));
  const driftGaps = scanOpencodeFixtures(driftedRoot);
  assert.equal(driftGaps.length, 1);
  assert.ok(driftGaps[0].includes('commands/superdev/plan.md'));
  assert.ok(driftGaps[0].includes('no longer matches'));

  // A fixture the fresh render no longer produces is reported by name, as is one it produces and
  // the fixtures do not carry.
  const missingRoot = fixture({ ...pluginTree });
  renderNormalized(missingRoot, path.join(missingRoot, FIXTURE_DIR));
  fs.rmSync(path.join(missingRoot, FIXTURE_DIR, '.opencode', 'agents', 'worker.md'));
  fs.writeFileSync(path.join(missingRoot, FIXTURE_DIR, '.opencode', 'agents', 'ghost.md'), 'ghost\n');
  const missingGaps = scanOpencodeFixtures(missingRoot);
  assert.equal(missingGaps.length, 2);
  assert.ok(missingGaps.some((g) => g.includes('agents/worker.md') && g.includes('does not carry')));
  assert.ok(missingGaps.some((g) => g.includes('agents/ghost.md') && g.includes('no fresh render')));

  // Both sides absent, or the fixture side absent, skips the check entirely.
  assert.deepEqual(scanOpencodeFixtures(fixture({})), []);
  assert.deepEqual(scanOpencodeFixtures(fixture({ ...pluginTree })), []);

  // The real repository's committed fixtures match a fresh render.
  assert.deepEqual(scanOpencodeFixtures(realRoot), []);
};
