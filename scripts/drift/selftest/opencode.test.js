'use strict';

// Selftest for the `opencode-render` check (scripts/drift/scanners.js's scanOpencodeFixtures):
// a fixture root carries a miniature plugin tree plus the committed-fixture tree that matches its
// render, and the assertions cover a match, a content drift, and a missing render.

module.exports = ({ assert, fs, path, fixture, realRoot }) => {
  const { scanOpencodeFixtures } = require('../scanners');
  const { FIXTURE_DIR, regenerateFixtures } = require('../opencode-fixtures');
  const overlay = require('../opencode-overlay');

  const SKILL = [
    '---',
    'name: plan',
    'description: Plan a feature.',
    '---',
    '',
    'Plan is the entry point for feature work.',
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
  regenerateFixtures(matchedRoot, path.join(matchedRoot, FIXTURE_DIR));
  assert.deepEqual(scanOpencodeFixtures(matchedRoot), []);

  // The skill and the agent above both have a line-aligned source, so both commit as overlays.
  assert.ok(fs.readFileSync(path.join(matchedRoot, FIXTURE_DIR, '.opencode', 'skills', 'superdev-plan', 'SKILL.md'), 'utf8').startsWith(`${overlay.OVERLAY_MARKER}\n`));
  assert.ok(fs.readFileSync(path.join(matchedRoot, FIXTURE_DIR, '.opencode', 'agents', 'worker.md'), 'utf8').startsWith(`${overlay.OVERLAY_MARKER}\n`));

  // Editing a source line no rewrite ever touches leaves the committed overlay matching a fresh
  // render, with the committed fixtures left exactly as matchedRoot regenerated them: the overlay
  // names only the lines a rewrite actually changed, so a prose edit elsewhere is invisible to it.
  const proseOnlyEdit = fixture({
    ...pluginTree,
    'plugin/skills/plan/SKILL.md': SKILL.replace(
      'Plan is the entry point for feature work.',
      'Plan is where feature work always starts.',
    ),
  });
  fs.rmSync(path.join(proseOnlyEdit, FIXTURE_DIR), { recursive: true, force: true });
  fs.cpSync(path.join(matchedRoot, FIXTURE_DIR), path.join(proseOnlyEdit, FIXTURE_DIR), { recursive: true });
  assert.deepEqual(scanOpencodeFixtures(proseOnlyEdit), []);

  // A committed fixture that no longer matches a fresh render is one gap per drifted file — here,
  // editing the `description:` field, which the rendered frontmatter always carries in full.
  const driftedRoot = fixture({
    ...pluginTree,
    'plugin/skills/plan/SKILL.md': SKILL.replace('Plan a feature.', 'Plan a whole program.'),
  });
  fs.rmSync(path.join(driftedRoot, FIXTURE_DIR), { recursive: true, force: true });
  fs.cpSync(path.join(matchedRoot, FIXTURE_DIR), path.join(driftedRoot, FIXTURE_DIR), { recursive: true });
  const driftGaps = scanOpencodeFixtures(driftedRoot);
  assert.equal(driftGaps.length, 1);
  assert.ok(driftGaps[0].includes(path.join('skills', 'superdev-plan', 'SKILL.md')));
  assert.ok(driftGaps[0].includes('no longer matches'));

  // A fixture the fresh render no longer produces is reported by name, as is one it produces and
  // the fixtures do not carry.
  const missingRoot = fixture({ ...pluginTree });
  regenerateFixtures(missingRoot, path.join(missingRoot, FIXTURE_DIR));
  fs.rmSync(path.join(missingRoot, FIXTURE_DIR, '.opencode', 'agents', 'worker.md'));
  fs.writeFileSync(path.join(missingRoot, FIXTURE_DIR, '.opencode', 'agents', 'ghost.md'), 'ghost\n');
  const missingGaps = scanOpencodeFixtures(missingRoot);
  assert.equal(missingGaps.length, 2);
  assert.ok(missingGaps.some((g) => g.includes('agents/worker.md') && g.includes('does not carry')));
  assert.ok(missingGaps.some((g) => g.includes('agents/ghost.md') && g.includes('no fresh render')));

  // The alignment-refusal branch inside scanOpencodeFixtures itself — computeOverlay is the only
  // way a real render ever stops being line-aligned with its source (ADR 0060's own recovery,
  // WHOLE_BODY_SKILL_NAMES, is what a maintainer reaches for then), so this stubs it to force that
  // branch on an otherwise-aligned fixture and proves the check reports one gap naming the file,
  // rather than falling through to parseOverlay/overlaysEqual on a result it never produced.
  const misalignedRoot = fixture({ ...pluginTree });
  regenerateFixtures(misalignedRoot, path.join(misalignedRoot, FIXTURE_DIR));
  const originalComputeOverlay = overlay.computeOverlay;
  overlay.computeOverlay = () => ({ ok: false, reason: 'stubbed for the alignment-refusal test' });
  let misalignedGaps;
  try {
    misalignedGaps = scanOpencodeFixtures(misalignedRoot);
  } finally {
    overlay.computeOverlay = originalComputeOverlay;
  }
  assert.equal(misalignedGaps.length, 2);
  assert.ok(misalignedGaps.every((g) => g.includes('alignment failed')));
  assert.ok(misalignedGaps.some((g) => g.includes(path.join('skills', 'superdev-plan', 'SKILL.md'))));
  assert.ok(misalignedGaps.some((g) => g.includes(path.join('agents', 'worker.md'))));

  // Both sides absent, or the fixture side absent, skips the check entirely.
  assert.deepEqual(scanOpencodeFixtures(fixture({})), []);
  assert.deepEqual(scanOpencodeFixtures(fixture({ ...pluginTree })), []);

  // The real repository's committed fixtures match a fresh render.
  assert.deepEqual(scanOpencodeFixtures(realRoot), []);

  // --- the overlay module itself (ADR 0060) -------------------------------

  // A skill/agent render is line-aligned with its source: the frontmatter is stored in full, the
  // untouched prose line carries through unchanged, and only the token-bearing line differs.
  const rendered = [
    '---',
    'generated-by: x',
    'name: superdev-plan',
    'description: "Plan a feature."',
    '---',
    '',
    'Plan is the entry point for feature work.',
    '',
    'Read /plugin/root/references/plan-contract.md.',
    '',
  ].join('\n');
  const aligned = overlay.computeOverlay(SKILL, rendered);
  assert.equal(aligned.ok, true);
  assert.deepEqual(aligned.overlay.diffs, [{ line: 4, content: 'Read /plugin/root/references/plan-contract.md.' }]);
  const roundTripped = overlay.parseOverlay(overlay.serializeOverlay('skills/plan/SKILL.md', aligned.overlay));
  assert.ok(overlay.overlaysEqual(roundTripped, aligned.overlay));

  // overlaysEqual compares body-lines too — a corrupted header (the same edit a reviewer once
  // slipped past this check by hand: `body-lines: 123` rewritten to `999`, frontmatter and diffs
  // left untouched) must not still read as matching a fresh render.
  const corruptedBodyLines = { ...aligned.overlay, bodyLineCount: aligned.overlay.bodyLineCount + 1 };
  assert.equal(overlay.overlaysEqual(corruptedBodyLines, aligned.overlay), false);

  // A render whose body carries a different number of lines than its source has stopped being
  // line-aligned — refused by name and reason, never silently overlaid onto the wrong lines.
  const misaligned = overlay.computeOverlay(SKILL, [
    '---', 'name: superdev-plan', 'description: "Plan a feature."', '---', '',
    'Plan is the entry point for feature work.', '',
    'Read /plugin/root/references/plan-contract.md.', 'An extra line the source never had.', '',
  ].join('\n'));
  assert.equal(misaligned.ok, false);
  assert.ok(/body is \d+ lines/.test(misaligned.reason));

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
