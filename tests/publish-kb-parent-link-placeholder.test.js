'use strict';

// Suite for plugin/scripts/publish-kb.js: the `{sub_url}` placeholder of a parent-link target under
// `- **Hierarchy:** links` (ADR 0168): filled from the child's own find, refused when no value or an unusable
// one comes back, and the fresh find after a create. The case where that fresh find hangs is in
// tests/publish-kb-parent-link-hang-add.test.js. No case here hangs a backend verb, so the file times no
// spawn. Shared fixtures live in tests/publish-kb-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
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
  stageLinked,
  readState,
  isStaged,
  putHome,
  SUB_LINK,
  withNewSubUrl,
  freshFindDoc,
} = require('./publish-kb-setup');
const { hashBody } = require(publishKbPath);

// a `{sub_url}` placeholder in the parent-link target is filled with the sub_url the child's own find returns:
// after a create through a fresh find, on an update through the find the page already used
withCapture((stateFile, dir) => {
  withNewSubUrl('Child-new', () => {
    const repo = makeRepo();
    writeKbDoc(repo, linksDoc());
    putHome(stateFile);
    stageLinked(repo, 'child.md', 'Child', SUB_LINK);

    const res = call(['--scope', 'demo'], repo);
    assert.match(res.out, /published \(created\): Child/, res.out);
    assert.equal(readState(stateFile).Home.body, HOME.replace('- [B](B)\n', '- [B](B)\n- [Child](https://x/wiki/Child-new): d\n'), 'a created page');
    assert.ok(!isStaged(repo, 'child.md'));
  });
});
withCapture((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, HOME, { Child: { id: 'id-child', body: 'old\n', sub_url: 'Child-live' } });
  stageLinked(repo, 'child.md', 'Child', SUB_LINK, `\nlive-hash: ${hashBody('old\n')}`);

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /published \(updated\): Child/, res.out);
  assert.match(readState(stateFile).Home.body, /- \[B\]\(B\)\n- \[Child\]\(https:\/\/x\/wiki\/Child-live\): d\n/, 'an existing page');
});
// a percent-escaped sub_url, the URL-safe characters only, fills as is
withCapture((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, HOME, { Child: { id: 'id-child', body: 'old\n', sub_url: 'ADR+0023%3A-a.b_c~d' } });
  stageLinked(repo, 'child.md', 'Child', SUB_LINK, `\nlive-hash: ${hashBody('old\n')}`);

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /published \(updated\): Child/, res.out);
  assert.ok(readState(stateFile).Home.body.includes('- [Child](https://x/wiki/ADR+0023%3A-a.b_c~d): d\n'), 'a percent-escaped value');
  assert.ok(!isStaged(repo, 'child.md'));
});

// a placeholder whose find returned no sub_url, or one no link target can carry, is not linked and stays staged;
// `fillLinkTarget` in tests/publish-kb-parent-link-pure.test.js proves each rejected character in-process
for (const [what, subUrl, reason] of [
  ['no sub_url', undefined, /find returned no sub_url for "Child"/],
  ['a space', 'a b', /a sub_url .*"Child".* no link target can carry/],
]) {
  withCapture((stateFile, dir) => {
    const repo = makeRepo();
    writeKbDoc(repo, linksDoc());
    putHome(stateFile, HOME, { Child: { id: 'id-child', body: 'old\n', ...(subUrl === undefined ? {} : { sub_url: subUrl }) } });
    stageLinked(repo, 'child.md', 'Child', SUB_LINK, `\nlive-hash: ${hashBody('old\n')}`);

    const res = call(['--scope', 'demo'], repo);
    assert.match(res.out, new RegExp(`not linked: Child — .*${reason.source}.* — fix: write the link target in full in parent-link`), what);
    assert.ok(isStaged(repo, 'child.md'), `${what}: stays staged`);
    assert.equal(readState(stateFile).Home.body, HOME, `${what}: the parent keeps its body`);
  });
}

// a fresh find answering absent, or failing, leaves the created page not linked and staged, the parent as it was
for (const [what, then, reason] of [
  ['absent', 'exit 3', /find reports "Child" absent right after it landed, so \{sub_url\} has no value — fix: run publish again/],
  ['failed', 'exit 2', /find for "Child": .*so \{sub_url\} has no value — fix: run publish again/],
]) {
  withCapture((stateFile) => {
    withNewSubUrl('Child-new', () => {
      const repo = makeRepo();
      writeKbDoc(repo, freshFindDoc(then));
      putHome(stateFile);
      stageLinked(repo, 'child.md', 'Child', SUB_LINK);

      const res = call(['--scope', 'demo'], repo);
      assert.match(res.out, new RegExp(`not linked: Child — ${reason.source}`), `${what}: ${res.out}`);
      assert.ok('Child' in readState(stateFile), `${what}: the page itself landed`);
      assert.ok(isStaged(repo, 'child.md'), `${what}: stays staged`);
      assert.equal(readState(stateFile).Home.body, HOME, `${what}: the parent keeps its body`);
    });
  });
}
// an `action: patch` page fills its placeholder from the find the patch itself used
withCapture((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, HOME, { Kid: { id: 'id-kid', body: '# Kid\n\n## A\n\nold A.\n', sub_url: 'Kid-live' } });
  stagePage(repo, 'demo', 'kid--a.md', 'title: Kid\naction: patch\nparent: Home\nparent-section: How it works\nparent-link: - [Kid](https://x/wiki/{sub_url}): d', '## A\n\nnew A.\n');

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /published \(updated\): Kid/, res.out);
  assert.match(readState(stateFile).Home.body, /- \[B\]\(B\)\n- \[Kid\]\(https:\/\/x\/wiki\/Kid-live\): d\n/);
  assert.ok(!isStaged(repo, 'kid--a.md'));
});

// a parent that already links the page needs no fill: no find beyond the page's own, no update, and the page clears,
// whatever sub_url find has for it — none after a create, an unusable one on an update
for (const [what, child, extra] of [
  ['a created page', {}, ''],
  ['an updated page', { Child: { id: 'id-child', body: 'old\n', sub_url: 'a b' } }, `\nlive-hash: ${hashBody('old\n')}`],
]) {
  withCapture((stateFile, dir) => {
    const repo = makeRepo();
    writeKbDoc(repo, linksDoc());
    putHome(stateFile, HOME.replace('- [B](B)\n', '- [B](B)\n- [Child](https://x/wiki/Child): d\n'), child);
    stageLinked(repo, 'child.md', 'Child', SUB_LINK, extra);

    const res = call(['--scope', 'demo'], repo);
    assert.match(res.out, /published \((created|updated)\): Child/, `${what}: ${res.out}`);
    assert.equal(captures(dir, 'find').filter((c) => c.env.SUPERDEV_KB_TITLE === 'Child').length, 1, `${what}: the page's own find only`);
    assert.equal(captures(dir, 'update').filter((c) => c.env.SUPERDEV_KB_TITLE === 'Home').length, 0, `${what}: no parent update`);
    assert.ok(!isStaged(repo, 'child.md'), `${what}: clears`);
  });
}

// a TMPDIR holding `$` and a backtick reaches the intended path through every helper that puts a temporary path into
// a `sh -c` command (triage #1380): `freshFindDoc` marks its first find in the hostile directory, so the fresh find
// after the create still answers what the doc says (tests/spawn-verdict.test.js pins `shq` itself)
{
  const prev = process.env.TMPDIR;
  const hostile = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-$HOME-`true`-'));
  process.env.TMPDIR = hostile;
  let doc;
  try {
    doc = freshFindDoc('exit 3');
  } finally {
    if (prev === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = prev;
  }
  withCapture((stateFile) => {
    withNewSubUrl('Child-new', () => {
      const repo = makeRepo();
      writeKbDoc(repo, doc);
      putHome(stateFile);
      stageLinked(repo, 'child.md', 'Child', SUB_LINK);

      const res = call(['--scope', 'demo'], repo);
      assert.match(res.out, /find reports "Child" absent right after it landed/, res.out);
      const marks = fs.readdirSync(hostile).filter((d) => fs.existsSync(path.join(hostile, d, 'seen')));
      assert.equal(marks.length, 1, 'the first find marked the directory under the hostile TMPDIR');
    });
  });
  fs.rmSync(hostile, { recursive: true, force: true });
}

console.log('publish-kb-parent-link-placeholder.test.js: all assertions passed');
