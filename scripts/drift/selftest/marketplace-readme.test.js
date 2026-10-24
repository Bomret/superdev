'use strict';

// Selftest suite: the scanners over the repository's own entry documents (`scanners/marketplace-readme.js`) —
// the marketplace manifest and the documentation audit set. Run by ./index.js.

const { scanMarketplaceSource, scanAuditSetGlobs } = require('../scanners');

module.exports = ({ assert, path, fixture }) => {
  // --- marketplace-source: the manifest's source resolves to the shipped tree (ADR 0032, ADR 0131) ---

  const mkManifest = (source) => JSON.stringify({ name: 'm', plugins: [{ name: 'p', source }] });
  assert.equal(
    scanMarketplaceSource(
      fixture({
        '.claude-plugin/marketplace.json': mkManifest('./shipped'),
        'shipped/.claude-plugin/plugin.json': '{"name":"p","version":"0.0.0"}',
      }),
    ).length,
    0,
    'a resolving source yields zero gaps',
  );
  const msGaps = scanMarketplaceSource(
    fixture({
      '.claude-plugin/marketplace.json': mkManifest('./shippd'),
      'shipped/.claude-plugin/plugin.json': '{"name":"p","version":"0.0.0"}',
    }),
  );
  assert.equal(msGaps.length, 1, 'a source resolving to no plugin tree is a gap');
  assert.equal(msGaps[0].source, path.join('.claude-plugin', 'marketplace.json'), 'names the manifest');
  assert.match(msGaps[0].expectation, /\.\/shippd/, 'names the dead path');

  const pinned = (over = {}) =>
    ({ source: 'git-subdir', url: 'https://codeberg.org/bomret/superdev.git', path: 'shipped', ref: 'v1.2.3', ...over });
  const shippedTree = { 'shipped/.claude-plugin/plugin.json': '{"name":"p","version":"1.2.3"}' };
  const pinnedGaps = (over) =>
    scanMarketplaceSource(fixture({ '.claude-plugin/marketplace.json': mkManifest(pinned(over)), ...shippedTree }));

  assert.equal(pinnedGaps().length, 0, 'a pinned git-subdir source yields zero gaps');
  const pathTypo = pinnedGaps({ path: 'shippd' });
  assert.equal(pathTypo.length, 1, 'a git-subdir path resolving to no plugin tree is a gap');
  assert.match(pathTypo[0].expectation, /shippd/, 'names the dead path');
  const staleRef = pinnedGaps({ ref: 'v1.2.2' });
  assert.equal(staleRef.length, 1, 'a ref other than v<version> is a gap');
  assert.match(staleRef[0].expectation, /v1\.2\.2/, 'names the stale ref');
  assert.match(staleRef[0].expectation, /v1\.2\.3/, 'names the expected ref');
  const forkUrl = pinnedGaps({ url: 'https://example.org/o/r.git' });
  assert.equal(forkUrl.length, 1, 'a git-subdir url other than the canonical repository is a gap');
  assert.match(forkUrl[0].expectation, /example\.org/, 'names the wrong url');
  assert.ok(
    scanMarketplaceSource(fixture({ '.claude-plugin/marketplace.json': mkManifest({ source: 'github', repo: 'o/r' }) })).length >= 1,
    'an object source of another shape is a gap',
  );
  const unparsable = scanMarketplaceSource(fixture({ '.claude-plugin/marketplace.json': '{ not json' }));
  assert.equal(unparsable.length, 1, 'an unparsable manifest is a gap');
  assert.match(unparsable[0].expectation, /JSON/, 'the gap says the manifest is no JSON');

  // --- audit-set-globs: every pattern under `## Audit set` resolves to at least one file ---

  assert.equal(
    scanAuditSetGlobs(
      fixture({
        'plugin/skills/plan/SKILL.md': '# plan\n',
        'RELEASING.md': '# releasing\n',
        'docs/agents/documentation.md': '# doc\n\n## Audit set\n\n- `plugin/skills/*/SKILL.md`\n- `RELEASING.md`\n',
      }),
    ).length,
    0,
    'patterns that all resolve yield zero gaps',
  );
  const asStale = scanAuditSetGlobs(
    fixture({
      'plugin/skills/plan/SKILL.md': '# plan\n',
      'docs/agents/documentation.md': '# doc\n\n## Audit set\n\n- `commands/*.md`\n- `plugin/skills/*/SKILL.md`\n',
    }),
  );
  assert.equal(asStale.length, 1, 'a glob resolving to no file is one gap');
  assert.match(asStale[0].expectation, /`commands\/\*\.md`/, 'the gap names the unresolvable pattern');
  assert.equal(
    scanAuditSetGlobs(
      fixture({ 'plugin/agents/.keep': '', 'docs/agents/documentation.md': '# doc\n\n## Audit set\n\n- `plugin/agents/*.md`\n- `GONE.md`\n' }),
    ).length,
    2,
    'an empty directory and a missing file are both gaps',
  );
  assert.equal(
    scanAuditSetGlobs(
      fixture({
        'RELEASING.md': '# releasing\n',
        'docs/agents/documentation.md': '# doc\n\n## Audit set\n\n- `RELEASING.md`\n\n## Something else\n\n- `not/a/pattern.md`\n',
      }),
    ).length,
    0,
    'bullets past the section are not scanned',
  );
  const noSection = scanAuditSetGlobs(fixture({ 'docs/agents/documentation.md': '# doc\n\n## Writing standard\n' }));
  assert.equal(noSection.length, 1, 'a documentation.md with no `## Audit set` section is a gap');
  assert.match(noSection[0].expectation, /## Audit set/, 'the gap names the section');
};
