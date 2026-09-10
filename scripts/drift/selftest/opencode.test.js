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
  assert.ok(driftGaps[0].includes(path.join('skills', 'superdev-plan', 'SKILL.md')));
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

  // --- the surface split (ADR 0055) ---------------------------------------
  const { scanOpencodeSurfaceSplit } = require('../scanners');

  const AFK = [
    '---',
    'name: afk',
    'description: Drive the chain unattended.',
    '---',
    '',
    '## 3. Take it through the chain',
    '',
    '| Stage | Start at |',
    '|---|---|',
    '| `merged` | `/superdev:review <BASE>..<label> --unattended` |',
    '| `reviewed` | `/superdev:document <BASE>..<label> --unattended` |',
    '',
    '## 4. When a feature blocks',
    '',
    'A mention of /superdev:ship out here is not a chain step.',
    '',
  ].join('\n');
  // The split the render actually produces: afk a command, every chain step a skill.
  const splitTree = {
    'plugin/skills/afk/SKILL.md': AFK,
    [path.join(FIXTURE_DIR, '.opencode/commands/superdev/afk.md')]: 'afk as a command\n',
    [path.join(FIXTURE_DIR, '.opencode/skills/superdev-review/SKILL.md')]: 'review as a skill\n',
    [path.join(FIXTURE_DIR, '.opencode/skills/superdev-document/SKILL.md')]: 'document as a skill\n',
  };
  assert.deepEqual(scanOpencodeSurfaceSplit(fixture({ ...splitTree })), []);

  // The chain-step list is read from afk's own routing section, not hand-copied: `ship`, named
  // outside that section, is not demanded as a skill — the zero-gap assertion above already proves it.

  // afk rendered as a skill is the regression this check exists for: the model could invoke it.
  const afkAsSkill = scanOpencodeSurfaceSplit(fixture({
    ...splitTree,
    [path.join(FIXTURE_DIR, '.opencode/skills/superdev-afk/SKILL.md')]: 'afk as a skill\n',
  }));
  assert.equal(afkAsSkill.length, 1);
  assert.ok(afkAsSkill[0].includes('afk renders as an OpenCode skill'));

  // afk rendered as no command at all leaves nothing to launch.
  const noAfkCommand = fixture({ ...splitTree });
  fs.rmSync(path.join(noAfkCommand, FIXTURE_DIR, '.opencode', 'commands', 'superdev', 'afk.md'));
  const afkGaps = scanOpencodeSurfaceSplit(noAfkCommand);
  assert.equal(afkGaps.length, 1);
  assert.ok(afkGaps[0].includes('renders as no OpenCode command'));

  // A chain step rendered as a command instead of a skill is one afk cannot invoke — reported both
  // as the missing skill and as the command that stands in its place.
  const stepAsCommand = fixture({ ...splitTree });
  fs.rmSync(path.join(stepAsCommand, FIXTURE_DIR, '.opencode', 'skills', 'superdev-review'), { recursive: true });
  fs.writeFileSync(path.join(stepAsCommand, FIXTURE_DIR, '.opencode', 'commands', 'superdev', 'review.md'), 'review as a command\n');
  const stepGaps = scanOpencodeSurfaceSplit(stepAsCommand);
  assert.equal(stepGaps.length, 2);
  assert.ok(stepGaps.some((g) => g.includes('renders as no OpenCode skill')));
  assert.ok(stepGaps.some((g) => g.includes('renders as an OpenCode command')));

  // An afk whose routing section names no step at all leaves the check nothing to hold — reported
  // rather than passing vacuously.
  const emptyChain = scanOpencodeSurfaceSplit(fixture({
    ...splitTree,
    'plugin/skills/afk/SKILL.md': [
      '---', 'name: afk', 'description: Drive the chain unattended.', '---', '',
      '## 3. Take it through the chain', '', 'Resume where the stage left off.', '',
      '## 4. When a feature blocks', '', 'A mention of /superdev:ship out here is not a chain step.', '',
    ].join('\n'),
  }));
  assert.ok(emptyChain.some((g) => g.includes('names no `/superdev:<name>` step')));

  // Either side absent skips the check entirely.
  assert.deepEqual(scanOpencodeSurfaceSplit(fixture({})), []);
  assert.deepEqual(scanOpencodeSurfaceSplit(fixture({ 'plugin/skills/afk/SKILL.md': AFK })), []);

  // The real repository's committed fixtures carry the split.
  assert.deepEqual(scanOpencodeSurfaceSplit(realRoot), []);
};
