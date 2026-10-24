'use strict';

// Selftest suite: the scanners that resolve what prose points at (`scanners/references.js`) — referenced
// documents, run-root paths, and command names. Run by ./index.js.

const { scan, scanRunRootPaths, scanScopetreeRunRootPaths, scanCommandRefs, scanGovernedSkillFiles } = require('../scanners');

module.exports = ({ assert, path, fixture, found }) => {
  // --- reference: every references/<name>.md a skill, agent, or reference names exists ---

  // fixture with a missing reference
  const tmp1 = fixture({
    'references/exists.md': '# exists\n',
    'skills/foo/SKILL.md':
      'See ${CLAUDE_PLUGIN_ROOT}/references/exists.md and ${CLAUDE_PLUGIN_ROOT}/references/missing.md\n',
  });
  const missing1 = scan(tmp1);
  assert.equal(missing1.length, 1, 'detects exactly one missing reference');
  assert.equal(missing1[0].reference, 'references/missing.md', 'names the missing reference');
  assert.equal(missing1[0].source, path.join('skills', 'foo', 'SKILL.md'), 'names the source file');

  // fixture with all references present
  const tmp2 = fixture({
    'references/exists.md': '# exists\n',
    'agents/bar.md': 'See ${CLAUDE_PLUGIN_ROOT}/references/exists.md\n',
  });
  assert.equal(scan(tmp2).length, 0, 'all-present fixture yields zero missing');

  // a bare (no ${CLAUDE_PLUGIN_ROOT} macro) reference to a missing file
  const missing3 = scan(fixture({ 'skills/baz/SKILL.md': 'Seed: `references/missing-bare.md`\n' }));
  assert.equal(missing3.length, 1, 'detects a bare-form missing reference');
  assert.equal(missing3[0].reference, 'references/missing-bare.md', 'names the bare reference');

  // one reference citing another dangles exactly like one in skills/ or agents/
  const missing3b = scan(
    fixture({
      'references/exists.md': '# exists\n',
      'references/playbook.md':
        'Read ${CLAUDE_PLUGIN_ROOT}/references/exists.md and ${CLAUDE_PLUGIN_ROOT}/references/gone.md\n',
    }),
  );
  assert.equal(missing3b.length, 1, 'scans references/ too, detecting one missing reference');
  assert.equal(missing3b[0].reference, 'references/gone.md', 'names the missing reference');
  assert.equal(missing3b[0].source, path.join('references', 'playbook.md'), 'names the reference file that cites it');

  // a mention carrying no references/ path component is not a pointer scan() can resolve
  assert.equal(
    scan(fixture({ 'references/playbook.md': 'per `gone.md` — no path\n' })).length,
    0,
    'a bare filename with no references/ component is not a reference',
  );

  // --- run-root: run-root artifacts use the absolute <run-root>/… form, never a checkout-relative
  // .superdev/scopes/<scope>/<artifact> path (wrong from a scopetree or slicetree cwd) ---

  const offenders4 = found(
    scanRunRootPaths(
      fixture({
        'references/implement-lite.md':
          'Update the ledger at `.superdev/scopes/<scope>/ledger.md` and check `.superdev/scopes/<scope>/run.lock`.\n',
      }),
    ),
  );
  assert.equal(offenders4.length, 2, 'flags both checkout-relative run-root artifact paths');
  assert.ok(offenders4.every((o) => o.source === 'references/implement-lite.md'), 'names the source doc');

  // the absolute <run-root>/… form plus scopetree/slicetree *directory* paths are clean
  const offenders5 = found(
    scanRunRootPaths(
      fixture({
        'references/implement-lite.md':
          'Update the ledger at `<run-root>/ledger.md`; cut `.superdev/scopes/<scope>/scopetree`.\n',
        'agents/implementer.md':
          'Append to `<run-root>/reports/<id>/progress.md`; slicetree at `.superdev/scopes/<scope>/slicetrees/<id>`.\n',
      }),
    ),
  );
  assert.equal(offenders5.length, 0, 'absolute form + scopetree/slicetree dir paths yield zero offenders');

  // --- scopetree-run-root (ADR 0080): the documents that address another run's scopetree from their own
  // cwd use the absolute <run-root>/scopetree form ---

  const offenders5b = found(
    scanScopetreeRunRootPaths(
      fixture({ 'skills/ship/SKILL.md': 'Remove this run\'s scopetree: `.superdev/scopes/<scope>/scopetree`.\n' }),
    ),
  );
  assert.equal(offenders5b.length, 1, 'flags the checkout-relative scopetree literal');
  assert.equal(offenders5b[0].source, path.join('skills', 'ship', 'SKILL.md'), 'names ship.md');

  // the absolute form is clean, and a document outside the list is never read
  assert.equal(
    found(
      scanScopetreeRunRootPaths(
        fixture({
          'skills/ship/SKILL.md': 'Remove this run\'s scopetree: `<run-root>/scopetree`.\n',
          'references/scope-mode.md': 'git worktree add `.superdev/scopes/<scope>/scopetree` -b <branch>\n',
        }),
      ),
    ).length,
    0,
    'the absolute form yields zero offenders',
  );

  // --- command-resolution: a `/superdev:<name>` reference resolves to `skills/<name>/SKILL.md` ---

  const crGaps1 = scanCommandRefs(fixture({ 'skills/implement/SKILL.md': 'When every slice is merged, run `/superdev:ship <scope>`.\n' }));
  assert.equal(crGaps1.length, 1, 'flags a reference to a command with no file');
  assert.equal(crGaps1[0].command, '/superdev:ship', 'names the unresolved command');
  assert.equal(crGaps1[0].source, path.join('skills', 'implement', 'SKILL.md'), 'names the source document');
  assert.equal(
    scanCommandRefs(
      fixture({
        'skills/implement/SKILL.md': 'When every slice is merged, run `/superdev:ship <scope>`.\n',
        'skills/ship/SKILL.md': '# superdev ship\n',
      }),
    ).length,
    0,
    'a resolving reference yields zero gaps',
  );
  assert.equal(scanCommandRefs(fixture({ 'agents/doc-writer.md': 'Dispatched by `/superdev:nope`.\n' })).length, 1, 'an agent naming a missing command is flagged');
  assert.equal(
    scanCommandRefs(fixture({ 'skills/document/SKILL.md': 'Invoked as `/superdev:document audit` — see `/superdev:document`.\n' })).length,
    0,
    'a trailing argument is not read as part of the name',
  );
  assert.equal(
    scanCommandRefs(fixture({ 'skills/implement/SKILL.md': 'Then `/superdev:ship`.\n', 'skills/document/SKILL.md': 'Then `/superdev:ship`.\n' })).length,
    2,
    'each source naming a missing command is reported',
  );

  // --- governed-skill-files (ADR 0190): every backticked path in CONTEXT.md's **Prompt concept** entry exists ---

  const entry =
    '# Context\n\n**Prompt concept**: a governed body. The listed skill files are `plugin/skills/review/SKILL.md` and ' +
    '`plugin/references/review-scope-mode.md`. `review-checklist.md`\'s `## Prompt-concept overlap` grades a pair.\n\n' +
    '- **Boundary.** It has a name.\n\n**Main sentence**: one clause, see `plugin/skills/gone/SKILL.md`.\n';
  assert.equal(
    scanGovernedSkillFiles(
      fixture({
        'CONTEXT.md': entry,
        'plugin/skills/review/SKILL.md': '# review\n',
        'plugin/references/review-scope-mode.md': '# scope\n',
      }),
    ).length,
    0,
    'every listed path present yields zero gaps, and a path past the entry is not read',
  );
  const gsGaps = scanGovernedSkillFiles(fixture({ 'CONTEXT.md': entry, 'plugin/skills/review/SKILL.md': '# review\n' }));
  assert.equal(gsGaps.length, 1, 'a listed path with no file is one gap');
  assert.match(gsGaps[0].expectation, /`plugin\/references\/review-scope-mode\.md`/, 'the gap names the missing path');
  const gsDir = scanGovernedSkillFiles(
    fixture({
      'CONTEXT.md': '**Prompt concept**: the listed skill files are `plugin/skills/review`.\n',
      'plugin/skills/review/SKILL.md': '# review\n',
    }),
  );
  assert.equal(gsDir.length, 1, 'a listed path naming a directory is a gap, because it governs no file');
  const gsNoEntry = scanGovernedSkillFiles(fixture({ 'CONTEXT.md': '# Context\n\n**Main sentence**: one clause.\n' }));
  assert.equal(gsNoEntry.length, 1, 'a glossary with no **Prompt concept** entry is a gap');
  assert.match(gsNoEntry[0].expectation, /Prompt concept/, 'the gap names the entry');
};
