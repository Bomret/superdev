'use strict';

// Suite for plugin/scripts/publish-kb.js: the add path of the parent link under `- **Hierarchy:** links`
// (ADR 0168, INV-0170): a published page is linked into its parent's live body, where the link lands, which
// existing link shapes count as the page's link, and the patch and republish routes. No case here hangs a
// backend verb, so the file times no spawn. Shared fixtures live in tests/publish-kb-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  publishKbPath,
  makeRepo,
  writeKbDoc,
  stagePage,
  call,
  captures,
  withCapture,
  linksDoc,
  HOME,
  HOME_ID,
  stageLinked,
  readState,
  isStaged,
  putHome,
  stagePatchLinked,
} = require('./publish-kb-setup');
const { hashBody } = require(publishKbPath);

// the link lands after the section's last list item, under Home's own title, every other byte as read
for (const eol of ['\n', '\r\n']) {
  withCapture((stateFile, dir) => {
    const repo = makeRepo();
    writeKbDoc(repo, linksDoc());
    const home = HOME.replace(/\n/g, eol);
    putHome(stateFile, home);
    stageLinked(repo, 'child.md', 'Child');

    const res = call(['--scope', 'demo'], repo);
    assert.ok(res.ok, `expected success, got: ${res.err}`);
    assert.match(res.out, /published \(created\): Child/);
    const state = readState(stateFile);
    assert.equal(state.Home.body, home.replace(`- [B](B)${eol}`, `- [B](B)${eol}- [Child](Child) — desc${eol}`), 'one line added, every other byte kept');
    assert.equal(state.Home.id, HOME_ID, 'the parent is updated in place');
    const updates = captures(dir, 'update');
    assert.equal(updates.length, 1);
    assert.equal(updates[0].values.title, 'Home', "the update carries the parent's own title");
    assert.ok(!isStaged(repo, 'child.md'), 'a linked page is cleared');
    assert.equal(captures(dir, 'create')[0].values.parentId, undefined, 'links does not nest');
  });
}

// a parent that already lists the page by its title, in any target spelling, is not written; which link shapes count
// is proven in-process in tests/publish-kb-parent-link-pure.test.js
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, HOME.replace('- [B](B)\n', '- [B](B)\n- [Child](https://codeberg.org/o/r/wiki/Child) — d\n'));
  stageLinked(repo, 'child.md', 'Child');

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /published \(created\): Child/);
  assert.equal(captures(dir, 'update').length, 0, 'no update for an existing link');
  assert.ok(!isStaged(repo, 'child.md'));
});

// republishing a page whose parent lacks its link adds it
withCapture((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, HOME, { Child: { id: 'id-child', body: 'old\n' } });
  stageLinked(repo, 'child.md', 'Child', undefined, `\nlive-hash: ${hashBody('old\n')}`);

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /published \(updated\): Child/);
  assert.match(readState(stateFile).Home.body, /- \[B\]\(B\)\n- \[Child\]\(Child\) — desc\n/);
});

// a parent staged in the same batch is created first, whatever the filename order, so its child is linked in
// that same run
withCapture((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  fs.writeFileSync(stateFile, JSON.stringify({}));
  stagePage(repo, 'demo', 'z-home.md', 'title: Home\naction: upsert', HOME);
  stageLinked(repo, 'a-child.md', 'Child');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.doesNotMatch(res.out, /not linked/);
  assert.match(readState(stateFile).Home.body, /- \[B\]\(B\)\n- \[Child\]\(Child\) — desc\n/);
  assert.ok(!isStaged(repo, 'a-child.md'), 'the linked child is cleared in the same run');
});

// a missing or duplicated section names the section; the file stays staged. The refusal text per section shape is
// proven in-process in tests/publish-kb-parent-link-pure.test.js
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, 'Intro.\n\n- [A](A)\n');
  stageLinked(repo, 'child.md', 'Child');

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /not linked: Child — .*"How it works".* — fix: /);
  assert.ok(isStaged(repo, 'child.md'), 'stays staged');
  assert.equal(captures(dir, 'update').length, 0, 'parent untouched');
});

// two pages naming one parent both end up linked: each reads the parent fresh
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile);
  stageLinked(repo, 'a.md', 'Alpha');
  stageLinked(repo, 'b.md', 'Bravo');

  call(['--scope', 'demo'], repo);
  const home = readState(stateFile).Home.body;
  assert.match(home, /- \[B\]\(B\)\n- \[Alpha\]\(Alpha\) — desc\n- \[Bravo\]\(Bravo\) — desc\n/);
  assert.equal(captures(dir, 'update').length, 2);
});

// an `action: patch` page is linked too: created by the patch, or patched into an existing page
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile);
  stagePatchLinked(repo, 'kid--a.md', 'Kid', 'A');

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /published \(created\): Kid/);
  assert.match(readState(stateFile).Home.body, /- \[B\]\(B\)\n- \[Kid\]\(Kid\) — desc\n/);
  assert.equal(captures(dir, 'create')[0].values.parentId, undefined, 'links does not nest');
  assert.ok(!isStaged(repo, 'kid--a.md'));
});

withCapture((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, HOME, { Kid: { id: 'id-kid', body: '# Kid\n\n## A\n\nold A.\n' } });
  stagePatchLinked(repo, 'kid--a.md', 'Kid', 'A');

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /published \(updated\): Kid/);
  assert.match(readState(stateFile).Kid.body, /new A\./);
  assert.match(readState(stateFile).Home.body, /- \[B\]\(B\)\n- \[Kid\]\(Kid\) — desc\n/);
  assert.ok(!isStaged(repo, 'kid--a.md'));
});

// a new page that ends not linked records the hash of the body it sent, so a retry never overwrites
// a human edit made in between (INV-0091)
withCapture((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, 'Intro.\n');
  stageLinked(repo, 'child.md', 'Child');
  assert.match(call(['--scope', 'demo'], repo).out, /not linked: Child/);
  const staged = fs.readFileSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'child.md'), 'utf8');
  assert.match(staged, new RegExp(`^live-hash: ${hashBody(readState(stateFile).Child.body)}$`, 'm'), 'the sent body is recorded');

  putHome(stateFile, HOME, { Child: { id: 'id-child', body: 'human edit\n' } });
  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /not linked: Child — .*live-hash mismatch/);
  assert.equal(readState(stateFile).Child.body, 'human edit\n', 'the human edit survives');
});

console.log('publish-kb-parent-link-add.test.js: all assertions passed');
