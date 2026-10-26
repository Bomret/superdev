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
  stageLinked,
  readState,
  isStaged,
  putHome,
  stageDelete,
  HOME_WITH_CHILD,
} = require('./publish-kb-setup');

// --- `- **Hierarchy:** links`: a delete removes the page's link line from its parent (ADR 0168) ------
for (const [what, live] of [['a live page', { Child: { id: 'id-child', body: 'c\n' } }], ['an already absent page', {}]]) {
  for (const eol of ['\n', '\r\n']) {
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

// a link on a prose line, or on a line with another link, stays and is reported
for (const line of ['See [Child](Child) for more.', '- [Child](Child) and [Other](Other)']) {
  withCapture((stateFile, dir) => {
    const repo = makeRepo();
    writeKbDoc(repo, linksDoc());
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
}

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

// only the first matching list item in the staged parent-section goes; every other line stays, reported
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  const body = HOME_WITH_CHILD.replace('- [Z](Z)\n', '- [Z](Z)\n- [Child](Child) — other\n');
  putHome(stateFile, body, { Child: { id: 'id-child', body: 'c\n' } });
  stageDelete(repo);

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /deleted: Child/);
  assert.equal(readState(stateFile).Home.body, HOME.replace('- [Z](Z)\n', '- [Z](Z)\n- [Child](Child) — other\n'));
  assert.ok(res.out.includes('link kept in parent "Home": - [Child](Child) — other'), res.out);
});

// two single-link items inside the staged section: the first goes, the second stays and is reported
withCapture((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, HOME_WITH_CHILD.replace('- [Child](Child) — desc\n', '- [Child](Child) — desc\n- [Child](Child) — second\n'), { Child: { id: 'id-child', body: 'c\n' } });
  stageDelete(repo);

  const res = call(['--scope', 'demo'], repo);
  assert.equal(readState(stateFile).Home.body, HOME.replace('- [B](B)\n', '- [B](B)\n- [Child](Child) — second\n'));
  assert.ok(res.out.includes('link kept in parent "Home": - [Child](Child) — second'), res.out);
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

// a link after an escaped `\!` is a link: `\![Child](Child)` is a literal `!` then a link
withCapture((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, HOME.replace('- [B](B)\n', '- [B](B)\n- \\![Child](Child)\n'), { Child: { id: 'id-child', body: 'c\n' } });
  stageDelete(repo);

  call(['--scope', 'demo'], repo);
  assert.equal(readState(stateFile).Home.body, HOME, 'the escaped-bang link line is removed');
});

// `\\![Child](Child)` is an escaped backslash then a real image: no link, so a delete keeps it
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  const body = HOME.replace('- [B](B)\n', '- [B](B)\n- \\\\![Child](Child)\n');
  putHome(stateFile, body, { Child: { id: 'id-child', body: 'c\n' } });
  stageDelete(repo);

  call(['--scope', 'demo'], repo);
  assert.equal(readState(stateFile).Home.body, body, 'the double-backslash image item stays');
  assert.equal(captures(dir, 'update').length, 0);
});

// an escaped-backslash image does not count as an existing link on the add path
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, HOME.replace('- [B](B)\n', '- [B](B)\n- \\\\![Child](Child)\n'));
  stageLinked(repo, 'child.md', 'Child');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, res.err);
  assert.equal(captures(dir, 'update').length, 1, 'the link line is added');
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

// a section the parent lacks or has twice: not unlinked, the delete stays staged
for (const [what, body] of [['missing', 'Intro.\n\n## Other\n\n- [Child](Child)\n'], ['duplicated', `${HOME_WITH_CHILD}\n## How it works\n\n- [Q](Q)\n`]]) {
  withCapture((stateFile, dir) => {
    const repo = makeRepo();
    writeKbDoc(repo, linksDoc());
    putHome(stateFile, body, { Child: { id: 'id-child', body: 'c\n' } });
    stageDelete(repo);

    const res = call(['--scope', 'demo'], repo);
    assert.match(res.out, /not unlinked: Child — .*"How it works"/, what);
    assert.ok(isStaged(repo, 'child.md'), what);
    assert.equal(captures(dir, 'update').length, 0, what);
  });
}

// an image item is no link line; a reference-style or wiki link is kept and reported, never removed
for (const line of ['- ![Child](child.png)', '- [Child][c]', '- [Child][]', '- [[Child]]', '- [[Child|alias]]']) {
  withCapture((stateFile, dir) => {
    const repo = makeRepo();
    writeKbDoc(repo, linksDoc());
    const body = HOME.replace('- [B](B)\n', `- [B](B)\n${line}\n`);
    putHome(stateFile, body, { Child: { id: 'id-child', body: 'c\n' } });
    stageDelete(repo);

    const res = call(['--scope', 'demo'], repo);
    assert.match(res.out, /deleted: Child/, line);
    assert.equal(readState(stateFile).Home.body, body, `${line} stays`);
    assert.equal(captures(dir, 'update').length, 0, line);
    assert.equal(res.out.includes(`link kept in parent "Home": ${line}`), !line.startsWith('- !['), `${line}: ${res.out}`);
  });
}

// an image item does not count as an existing link on the add path either
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, HOME.replace('- [B](B)\n', '- [B](B)\n- ![Child](child.png)\n'));
  stageLinked(repo, 'child.md', 'Child');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, res.err);
  assert.equal(captures(dir, 'update').length, 1, 'the link line is added');
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
