'use strict';

// Suite for plugin/scripts/publish-kb.js: the delete-path timeouts under `- **Hierarchy:** links` (ADR 0168,
// INV-0164): a parent read or update that hangs past the bound stops the batch and leaves every untried
// delete staged. HANG_MS comes from this file's own `hangBound()` call (tests/publish-kb-setup.js,
// AGENTS.md, ADR 0086), taken in this process from this run's healthy backend spawns. Shared fixtures live
// in tests/publish-kb-setup.js.

const assert = require('node:assert');
const {
  hangBound,
  makeRepo,
  writeKbDoc,
  stagePage,
  call,
  withState,
  hangingVerbDoc,
  PATCH_VERBS,
  LINKS_LINE,
  isStaged,
  putHome,
  stageDelete,
  HOME_WITH_CHILD,
} = require('./publish-kb-setup');

// The bound every hanging-verb block below runs under, taken from this run's own healthy spawns.
const HANG_MS = hangBound();

// a timeout on the parent read or update stops the batch
for (const verb of ['read', 'update']) {
  withState((stateFile) => {
    const repo = makeRepo();
    writeKbDoc(repo, hangingVerbDoc(LINKS_LINE, verb, PATCH_VERBS));
    putHome(stateFile, HOME_WITH_CHILD, { Child: { id: 'id-child', body: 'c\n' } });
    stageDelete(repo);
    stagePage(repo, 'demo', 'z.md', 'title: Zed\naction: delete');
    process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS = String(HANG_MS);

    const res = call(['--scope', 'demo'], repo);
    assert.match(res.out, new RegExp(`not unlinked: Child — .*${verb} timed out after ${HANG_MS}ms`));
    assert.match(res.out, /stopped after a timeout: 1 page\(s\) left untried/);
    assert.ok(isStaged(repo, 'child.md') && isStaged(repo, 'z.md'), `${verb}: both stay staged`);
  });
}

console.log('publish-kb-parent-link-hang-delete.test.js: all assertions passed');
