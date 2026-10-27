'use strict';

// Suite for plugin/scripts/publish-kb.js: the delete path of the parent link under `- **Hierarchy:** links`
// (ADR 0168): a delete removes the page's link line from its parent, keeps and reports every line it cannot
// remove, and stays staged when the parent cannot be read or written. The delete cases that hang a parent verb
// are in tests/publish-kb-parent-link-hang-delete.test.js. No case here hangs a backend verb, so the file times
// no spawn. Shared fixtures live in tests/publish-kb-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const {
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
  readState,
  isStaged,
  putHome,
  stageDelete,
  HOME_WITH_CHILD,
} = require('./publish-kb-setup');

// --- `- **Hierarchy:** links`: a delete removes the page's link line from its parent (ADR 0168) ------
// which lines go and which stay is proven in-process in tests/publish-kb-parent-link-pure.test.js; one case each
// covers a live page, an already absent page, and a CRLF parent
for (const [what, live, eols] of [['a live page', { Child: { id: 'id-child', body: 'c\n' } }, ['\n', '\r\n']], ['an already absent page', {}, ['\n']]]) {
  for (const eol of eols) {
    withCapture((stateFile, dir) => {
      const repo = makeRepo();
      writeKbDoc(repo, linksDoc());
      putHome(stateFile, HOME_WITH_CHILD.replace(/\n/g, eol), live);
      stageDelete(repo);

      const res = call(['--scope', 'demo'], repo);
      assert.ok(res.ok, `expected success, got: ${res.err}`);
      assert.match(res.out, /deleted: Child|already absent, done: Child/);
      assert.equal(readState(stateFile).Home.body, HOME.replace(/\n/g, eol), `${what}: only the link line is gone`);
      const updates = captures(dir, 'update');
      assert.equal(updates.length, 1);
      assert.equal(updates[0].env.SUPERDEV_KB_TITLE, 'Home', "the update carries the parent's own title");
      assert.ok(!isStaged(repo, 'child.md'), `${what}: the delete is cleared`);
    });
  }
}

// a link on a prose line stays and is reported; nothing removed means no write
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  const line = 'See [Child](Child) for more.';
  const body = HOME.replace('- [B](B)\n', `- [B](B)\n${line}\n`);
  putHome(stateFile, body, { Child: { id: 'id-child', body: 'c\n' } });
  stageDelete(repo);

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /deleted: Child/);
  assert.ok(res.out.includes(`link kept in parent "Home": ${line}`), `the kept line is named: ${res.out}`);
  assert.equal(readState(stateFile).Home.body, body, 'the line stays');
  assert.equal(captures(dir, 'update').length, 0, 'no write when nothing is removed');
  assert.ok(!isStaged(repo, 'child.md'));
});

// a parent that does not link the page gets no update
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, HOME, { Child: { id: 'id-child', body: 'c\n' } });
  stageDelete(repo);

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /deleted: Child/);
  assert.equal(captures(dir, 'update').length, 0);
  assert.ok(!isStaged(repo, 'child.md'));
});

// a failed parent read or update leaves the delete staged with the reason
for (const verb of ['read', 'update']) {
  withCapture((stateFile) => {
    const repo = makeRepo();
    writeKbDoc(repo, failingVerbDoc(LINKS_LINE, verb, PATCH_VERBS));
    putHome(stateFile, HOME_WITH_CHILD, { Child: { id: 'id-child', body: 'c\n' } });
    stageDelete(repo);

    const res = call(['--scope', 'demo'], repo);
    assert.match(res.out, new RegExp(`not unlinked: Child — .*${verb} exited 1.* — fix: `), verb);
    assert.ok(isStaged(repo, 'child.md'), `${verb}: stays staged`);
  });
}

// an absent parent holds no link: the delete clears with no write, alone or in a batch with the parent
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  fs.writeFileSync(stateFile, JSON.stringify({ Child: { id: 'id-child', body: 'c\n' } }));
  stageDelete(repo);

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /deleted: Child/);
  assert.equal(captures(dir, 'update').length, 0);
  assert.ok(!isStaged(repo, 'child.md'), 'the delete is cleared');
});
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, HOME_WITH_CHILD, { Child: { id: 'id-child', body: 'c\n' } });
  stagePage(repo, 'demo', 'home.md', 'title: Home\naction: delete');
  stageDelete(repo);

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /deleted: Home/);
  assert.match(res.out, /deleted: Child/);
  assert.ok(!isStaged(repo, 'home.md') && !isStaged(repo, 'child.md'), 'both clear');
  assert.equal(captures(dir, 'update').length, 0);
});

// a delete naming a parent with no parent-section is refused before any backend call and stays staged
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, HOME_WITH_CHILD, { Child: { id: 'id-child', body: 'c\n' } });
  stagePage(repo, 'demo', 'child.md', 'title: Child\naction: delete\nparent: Home');

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /not unlinked: Child — .*no parent-section.* — fix: /);
  assert.ok(isStaged(repo, 'child.md'));
  assert.equal(captures(dir, 'delete').length, 0, 'the page is not deleted');
  assert.equal(captures(dir, 'read').length, 0, 'the parent is not read');
  assert.ok('Child' in readState(stateFile), 'the page stays live');
});

// an empty parent holds no link: the delete clears with no write
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, '', { Child: { id: 'id-child', body: 'c\n' } });
  stageDelete(repo);

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /deleted: Child/);
  assert.equal(captures(dir, 'update').length, 0);
  assert.ok(!isStaged(repo, 'child.md'), 'the delete is cleared');
});

// a whitespace-only parent body holds no link, like an empty one: the delete clears with no write
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, '\n', { Child: { id: 'id-child', body: 'c\n' } });
  stageDelete(repo);

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /deleted: Child/);
  assert.equal(captures(dir, 'update').length, 0);
  assert.ok(!isStaged(repo, 'child.md'), 'the delete is cleared');
});

// a section the parent lacks: not unlinked, the delete stays staged
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, 'Intro.\n\n## Other\n\n- [Child](Child)\n', { Child: { id: 'id-child', body: 'c\n' } });
  stageDelete(repo);

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /not unlinked: Child — .*"How it works"/);
  assert.ok(isStaged(repo, 'child.md'));
  assert.equal(captures(dir, 'update').length, 0);
});

// the printed kept line carries no control characters or escape sequences
withCapture((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, HOME.replace('- [B](B)\n', '- [B](B)\nSee [Child](Child)\u001b[31m red\u001b[0m\u0007 \u009bx here\u007f.\n'), { Child: { id: 'id-child', body: 'c\n' } });
  stageDelete(repo);

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.out.includes('link kept in parent "Home": See [Child](Child) red x here.'), JSON.stringify(res.out));
  assert.ok(!/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(res.out), 'no control characters');
});

// without the Hierarchy bullet a delete touches no parent
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', PATCH_VERBS));
  putHome(stateFile, HOME_WITH_CHILD, { Child: { id: 'id-child', body: 'c\n' } });
  stageDelete(repo);

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /deleted: Child/);
  assert.equal(captures(dir, 'read').length, 0);
  assert.equal(captures(dir, 'update').length, 0);
  assert.equal(readState(stateFile).Home.body, HOME_WITH_CHILD);
});

console.log('publish-kb-parent-link-delete.test.js: all assertions passed');
