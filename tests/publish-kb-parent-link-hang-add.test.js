'use strict';

// Suite for plugin/scripts/publish-kb.js: the add-path timeouts under `- **Hierarchy:** links` (ADR 0168,
// INV-0164): a fresh find, a parent read or update, and a patch group's parent update that hang past the
// bound stop the batch and leave every untried page staged. HANG_MS comes from this file's own
// `hangBound()` call (tests/publish-kb-setup.js, AGENTS.md, ADR 0086), taken in this process from this run's
// healthy backend spawns. Shared fixtures live in tests/publish-kb-setup.js.

const assert = require('node:assert');
const {
  HUNG_CMD,
  hangBound,
  makeRepo,
  writeKbDoc,
  call,
  withState,
  withCapture,
  hangingVerbDoc,
  PATCH_VERBS,
  LINKS_LINE,
  HOME,
  stageLinked,
  readState,
  isStaged,
  putHome,
  SUB_LINK,
  withNewSubUrl,
  freshFindDoc,
  stagePatchLinked,
} = require('./publish-kb-setup');

// The bound every hanging-verb block below runs under, taken from this run's own healthy spawns.
const HANG_MS = hangBound();

// a fresh find that hangs is killed at the bound and stops the batch: the untried page stays staged, never sent
withCapture((stateFile) => {
  withNewSubUrl('Child-new', () => {
    const repo = makeRepo();
    writeKbDoc(repo, freshFindDoc(HUNG_CMD));
    putHome(stateFile);
    stageLinked(repo, 'a-child.md', 'Child', SUB_LINK);
    stageLinked(repo, 'b.md', 'Bravo');
    process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS = String(HANG_MS);

    const res = call(['--scope', 'demo'], repo);
    assert.match(res.out, new RegExp(`not linked: Child — find for "Child": find timed out after ${HANG_MS}ms`), res.out);
    assert.match(res.out, /stopped after a timeout: 1 page\(s\) left untried/);
    assert.ok(isStaged(repo, 'a-child.md') && isStaged(repo, 'b.md'), 'both stay staged');
    assert.ok(!('Bravo' in readState(stateFile)), 'the untried page never reached the backend');
    assert.equal(readState(stateFile).Home.body, HOME);
  });
});

// a timeout on the parent read or update stops the batch and leaves every untried page staged
for (const verb of ['read', 'update']) {
  withState((stateFile) => {
    const repo = makeRepo();
    writeKbDoc(repo, hangingVerbDoc(LINKS_LINE, verb, PATCH_VERBS));
    putHome(stateFile);
    stageLinked(repo, 'a.md', 'Alpha');
    stageLinked(repo, 'b.md', 'Bravo');
    process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS = String(HANG_MS);

    const res = call(['--scope', 'demo'], repo);
    assert.match(res.out, new RegExp(`not linked: Alpha — .*${verb} timed out after ${HANG_MS}ms`));
    assert.match(res.out, /stopped after a timeout: 1 page\(s\) left untried/);
    assert.ok(isStaged(repo, 'a.md') && isStaged(repo, 'b.md'), `${verb}: both stay staged`);
    assert.ok(!('Bravo' in readState(stateFile)), `${verb}: the untried page never reached the backend`);
    assert.equal(readState(stateFile).Home.body, HOME);
  });
}

// a two-file patch group whose parent update times out stops the batch: the sibling stays untried
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, hangingVerbDoc(LINKS_LINE, 'update', PATCH_VERBS));
  putHome(stateFile);
  stagePatchLinked(repo, 'kid--a.md', 'Kid', 'A');
  stagePatchLinked(repo, 'kid--b.md', 'Kid', 'B');
  process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS = String(HANG_MS);

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, new RegExp(`not linked: Kid — .*update timed out after ${HANG_MS}ms`));
  assert.match(res.out, /stopped after a timeout: 1 page\(s\) left untried/);
  assert.ok(isStaged(repo, 'kid--a.md') && isStaged(repo, 'kid--b.md'), 'both stay staged');
  assert.doesNotMatch(readState(stateFile).Kid.body, /new B\./, 'the untried sibling never reached the backend');
});

console.log('publish-kb-parent-link-hang-add.test.js: all assertions passed');
