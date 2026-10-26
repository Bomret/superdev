'use strict';

// Suite for plugin/scripts/publish-kb.js: the parent-link cases that end not linked under
// `- **Hierarchy:** links` (ADR 0168, INV-0170): a heading or link the parent-link refuses, a parent or
// backend verb that fails, the retry on the next run, and the storage body format. No case here hangs a
// backend verb, so the file times no spawn. Shared fixtures live in tests/publish-kb-setup.js.

const assert = require('node:assert');
const {
  publishKbPath,
  makeRepo,
  commandsDoc,
  writeKbDoc,
  stagePage,
  call,
  captures,
  withCapture,
  failingVerbDoc,
  PATCH_VERBS,
  LINKS_LINE,
  linksDoc,
  HOME,
  HOME_ID,
  stageLinked,
  readState,
  isStaged,
  putHome,
} = require('./publish-kb-setup');
const { hashBody } = require(publishKbPath);
const { toStorage } = require('../plugin/lib/md-to-storage');

// a setext heading is no section: the reason and the fix name the ATX (`#`) heading parent-section needs
withCapture((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, 'Intro.\n\nHow it works\n============\n\n- [A](A)\n');
  stageLinked(repo, 'child.md', 'Child');

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /not linked: Child — the parent has no ATX \(#\) heading "How it works" — fix: add an ATX heading "How it works" \(a line opened by #\) to the parent page, or correct parent-section; a setext heading is not read/);
  assert.ok(isStaged(repo, 'child.md'));
});

// a parent-link whose target is over the 1000-character cap is refused with a reason naming the cap
withCapture((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile);
  stageLinked(repo, 'child.md', 'Child', `- [Child](${'x'.repeat(1001)}) — desc`);

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /not linked: Child — parent-link has no link whose text is the page title "Child", or its link text or target is over 1000 characters — fix: /, res.out);
  assert.ok(isStaged(repo, 'child.md'));
});

// an absent parent, an unreadable parent, a failed parent update, and a failed own write
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  stageLinked(repo, 'child.md', 'Child');
  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /not linked: Child — parent page "Home" not found/);
  assert.ok(isStaged(repo, 'child.md'));
});
for (const [verb, reason] of [['read', /read exited 1/], ['update', /update exited 1/], ['create', /create exited 1/]]) {
  withCapture((stateFile, dir) => {
    const repo = makeRepo();
    writeKbDoc(repo, failingVerbDoc(LINKS_LINE, verb, PATCH_VERBS));
    putHome(stateFile);
    stageLinked(repo, 'child.md', 'Child');

    const res = call(['--scope', 'demo'], repo);
    assert.match(res.out, new RegExp(`not linked: Child — .*${reason.source}.* — fix: `), verb);
    assert.ok(isStaged(repo, 'child.md'), `${verb}: stays staged`);
    assert.equal(readState(stateFile).Home.body, HOME, `${verb}: the parent keeps its body`);
    if (verb === 'create') assert.equal(captures(dir, 'update').length, 0, 'no link is written for a page that did not land');
  });
}

// the next run links the page, with no live-hash refusal from the first run's own write
for (const existing of [true, false]) {
  withCapture((stateFile) => {
    const repo = makeRepo();
    writeKbDoc(repo, linksDoc());
    putHome(stateFile, 'Intro.\n', existing ? { Child: { id: 'id-child', body: 'old\n' } } : {});
    stageLinked(repo, 'child.md', 'Child', undefined, existing ? `\nlive-hash: ${hashBody('old\n')}` : '');
    assert.match(call(['--scope', 'demo'], repo).out, /not linked: Child/);
    assert.ok(isStaged(repo, 'child.md'));

    putHome(stateFile, HOME, { Child: readState(stateFile).Child });
    const res = call(['--scope', 'demo'], repo);
    assert.match(res.out, /published \(updated\): Child/, `existing=${existing}`);
    assert.doesNotMatch(res.out, /left staged|not linked/);
    assert.match(readState(stateFile).Home.body, /- \[Child\]\(Child\) — desc/);
    assert.ok(!isStaged(repo, 'child.md'));
  });
}

// a parent-link that is not one list-item line naming the page, or a page naming itself, is refused
for (const [what, title, link] of [
  ['multi-line', 'Child', '"- [Child](Child)\\n- [Other](Other)"'],
  ['no link', 'Child', '- Child, plain text'],
  ['not a list item', 'Child', '[Child](Child)'],
  ['link text is not the title', 'Child', '- [Else](Else)'],
  ['its own parent', 'Home', '- [Home](Home)'],
]) {
  withCapture((stateFile, dir) => {
    const repo = makeRepo();
    writeKbDoc(repo, linksDoc());
    putHome(stateFile);
    stageLinked(repo, 'child.md', title, link);

    const res = call(['--scope', 'demo'], repo);
    assert.match(res.out, new RegExp(`not linked: ${title} — `), what);
    assert.ok(isStaged(repo, 'child.md'), `${what}: stays staged`);
    assert.equal(captures(dir, 'update').length, 0, `${what}: no parent write`);
    assert.equal(captures(dir, 'create').length, 0, `${what}: refused before the page is sent`);
  });
}

// without the Hierarchy bullet the page nests as before and no parent page is read or written
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', PATCH_VERBS));
  putHome(stateFile);
  stageLinked(repo, 'child.md', 'Child');

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /published \(created\): Child/);
  assert.equal(captures(dir, 'create')[0].env.SUPERDEV_KB_PARENT_ID, HOME_ID);
  assert.equal(captures(dir, 'read').length, 0);
  assert.equal(captures(dir, 'update').length, 0);
});

// links with a storage body format refuses a parented page before any backend call, naming the body format,
// so the page never lands unlinked (INV-0170)
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Confluence.\n- **Body format:** storage\n- **Hierarchy:** links', PATCH_VERBS));
  putHome(stateFile);
  stageLinked(repo, 'child.md', 'Child');

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /not linked: Child — the backend's body format is storage, not markdown.* — fix: /, res.out);
  assert.equal(captures(dir, 'create').length, 0, 'the page is not sent');
  assert.equal(captures(dir, 'find').length, 0, 'no backend call at all');
  assert.ok(!('Child' in readState(stateFile)), 'the page did not land');
  assert.ok(isStaged(repo, 'child.md'), 'the page stays staged');
});

// a delete under links with a storage body format is refused the same way: the page is not deleted
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Confluence.\n- **Body format:** storage\n- **Hierarchy:** links', PATCH_VERBS));
  putHome(stateFile, HOME, { Child: { id: 'id-child', body: 'c\n' } });
  stagePage(repo, 'demo', 'child.md', 'title: Child\naction: delete\nparent: Home\nparent-section: How it works\nparent-link: - [Child](Child) — desc');

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /not unlinked: Child — the backend's body format is storage, not markdown.* — fix: /, res.out);
  assert.equal(captures(dir, 'find').length, 0, 'no backend call at all');
  assert.ok('Child' in readState(stateFile), 'the page stays live');
  assert.ok(isStaged(repo, 'child.md'), 'the delete stays staged');
});

// links with a storage body format sends a page that names no parent as before, as the storage conversion
withCapture((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Confluence.\n- **Body format:** storage\n- **Hierarchy:** links', PATCH_VERBS));
  stagePage(repo, 'demo', 'solo.md', 'title: Solo\naction: upsert');

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /published \(created\): Solo/, res.out);
  assert.equal(readState(stateFile).Solo.body, toStorage('body text.\n'), 'the page is sent as the storage conversion (INV-0109)');
});

console.log('publish-kb-parent-link-refused.test.js: all assertions passed');
