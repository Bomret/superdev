'use strict';

// Suite for plugin/scripts/publish-kb.js: the parent link under `- **Hierarchy:** links` (ADR 0168,
// INV-0170, INV-0164). A published page is linked into its parent's live body, and a delete removes
// the page's link line from it. The suite times its own healthy backend spawn and derives its hang
// bound from it (`hangBound()` in tests/publish-kb-setup.js, AGENTS.md, ADR 0086). Shared fixtures
// live in tests/publish-kb-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  publishKbPath,
  FAKE_BACKEND,
  HUNG_CMD,
  hangBound,
  makeRepo,
  commandsDoc,
  writeKbDoc,
  stagePage,
  call,
  withState,
  captures,
  withCapture,
  hangingVerbDoc,
  failingVerbDoc,
} = require('./publish-kb-setup');
const { hashBody } = require(publishKbPath);
const { toStorage } = require('../plugin/lib/md-to-storage');

// The bound every hanging-verb block below runs under, taken from this run's own healthy spawns.
const HANG_MS = hangBound();

const PATCH_VERBS = ['find', 'read', 'create', 'update', 'delete'];

// --- `- **Hierarchy:** links`: a published page is linked into its parent's live body (ADR 0168) ----
const LINKS_LINE = '- **Backend:** Some Wiki.\n- **Hierarchy:** links';
const linksDoc = (verbs = PATCH_VERBS) => commandsDoc(LINKS_LINE, verbs).replace(': "$SUPERDEV_KB_PARENT_ID"\n', '');
const HOME = 'Intro.\n\n## How it works\n\n- [A](A)\n- [B](B)\n\n## Other\n\n- [Z](Z)\n';
const HOME_ID = 'id-home';
function stageLinked(repo, file, title, link = `- [${title}](${title}) — desc`, extra = '') {
  stagePage(repo, 'demo', file, `title: ${title}\naction: upsert\nparent: Home\nparent-section: How it works\nparent-link: ${link}${extra}`);
}
const readState = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const isStaged = (repo, f) => fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', f));
const putHome = (stateFile, body = HOME, more = {}) => fs.writeFileSync(stateFile, JSON.stringify({ Home: { id: HOME_ID, body }, ...more }));

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
    assert.equal(updates[0].env.SUPERDEV_KB_TITLE, 'Home', "the update carries the parent's own title");
    assert.ok(!isStaged(repo, 'child.md'), 'a linked page is cleared');
    assert.equal(captures(dir, 'create')[0].env.SUPERDEV_KB_PARENT_ID, undefined, 'links does not nest');
  });
}

// a parent that already lists the page by its title, in any target spelling, is not written
for (const link of ['- [Child](https://codeberg.org/o/r/wiki/Child) — d', '1. [Child](Child) — d']) {
  withCapture((stateFile, dir) => {
    const repo = makeRepo();
    writeKbDoc(repo, linksDoc());
    putHome(stateFile, HOME.replace('- [B](B)\n', `- [B](B)\n${link}\n`));
    stageLinked(repo, 'child.md', 'Child');

    const res = call(['--scope', 'demo'], repo);
    assert.match(res.out, /published \(created\): Child/);
    assert.equal(captures(dir, 'update').length, 0, `no update for an existing link ${link}`);
    assert.ok(!isStaged(repo, 'child.md'));
  });
}

// a link shown only inside fenced code is not a link
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, `${HOME}\n\`\`\`md\n- [Child](Child)\n\`\`\`\n`);
  stageLinked(repo, 'child.md', 'Child');

  call(['--scope', 'demo'], repo);
  assert.equal(captures(dir, 'update').length, 1, 'the fenced line does not count as a link');
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

// a `{sub_url}` placeholder in the parent-link target is filled with the sub_url the child's own find returns:
// after a create through a fresh find, on an update through the find the page already used
const SUB_LINK = '- [Child](https://x/wiki/{sub_url}): d';
function withNewSubUrl(value, fn) {
  process.env.FAKE_KB_NEW_SUB_URL = value;
  try {
    fn();
  } finally {
    delete process.env.FAKE_KB_NEW_SUB_URL;
  }
}
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

// a placeholder whose find returned no sub_url, or one no link target can carry, is not linked and stays staged
for (const [what, subUrl, reason] of [
  ['no sub_url', undefined, /find returned no sub_url for "Child"/],
  ['a space', 'a b', /a sub_url .*"Child".* no link target can carry/],
  ['a parenthesis', 'a)b', /a sub_url .*"Child".* no link target can carry/],
  ['a control character', 'a\u0007b', /a sub_url .*"Child".* no link target can carry/],
  ['an open parenthesis', 'a(b', /a sub_url .*"Child".* no link target can carry/],
  ['a trailing backslash', 'a\\', /a sub_url .*"Child".* no link target can carry/],
  ['a leading angle bracket', '<a', /a sub_url .*"Child".* no link target can carry/],
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

// the fresh find after a create: `then` answers every find for Child after the first, which routes the create
function freshFindDoc(then) {
  const seen = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kb-find-')), 'seen');
  const fake = `node ${JSON.stringify(FAKE_BACKEND)} find`;
  return linksDoc().replace(fake, `if [ "$SUPERDEV_KB_TITLE" = Child ]; then [ -e ${JSON.stringify(seen)} ] && { ${then}; }; : > ${JSON.stringify(seen)}; fi\n${fake}`);
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

// a parent-link without the placeholder is inserted exactly as staged, whatever find returns
withCapture((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, HOME, { Child: { id: 'id-child', body: 'old\n', sub_url: 'a b' } });
  stageLinked(repo, 'child.md', 'Child', '- [Child](https://x/wiki/Fixed): d', `\nlive-hash: ${hashBody('old\n')}`);

  call(['--scope', 'demo'], repo);
  assert.match(readState(stateFile).Home.body, /- \[B\]\(B\)\n- \[Child\]\(https:\/\/x\/wiki\/Fixed\): d\n/);
});

// a missing or duplicated section names the section; the file stays staged
for (const [what, body] of [['no heading', 'Intro.\n\n- [A](A)\n'], ['two headings', `${HOME}\n## How it works\n\n- [Q](Q)\n`]]) {
  withCapture((stateFile, dir) => {
    const repo = makeRepo();
    writeKbDoc(repo, linksDoc());
    putHome(stateFile, body);
    stageLinked(repo, 'child.md', 'Child');

    const res = call(['--scope', 'demo'], repo);
    assert.match(res.out, /not linked: Child — .*"How it works".* — fix: /, what);
    assert.ok(isStaged(repo, 'child.md'), `${what}: stays staged`);
    assert.equal(captures(dir, 'update').length, 0, `${what}: parent untouched`);
  });
}

// a section with its heading but no list item yet takes the link as its first list item, one blank line
// below the heading and one above whatever follows; every other byte stays
for (const [what, body, linked] of [
  ['an empty section', 'Intro.\n\n## Guides\n\n## Other\n\n- [Z](Z)\n', 'Intro.\n\n## Guides\n\n- [Child](Child) — desc\n\n## Other\n\n- [Z](Z)\n'],
  ['a section of prose', 'Intro.\n\n## Guides\nSome text.\n', 'Intro.\n\n## Guides\n\n- [Child](Child) — desc\n\nSome text.\n'],
  ['a last heading with no line end', 'Intro.\n\n## Guides', 'Intro.\n\n## Guides\n\n- [Child](Child) — desc'],
  ['CRLF line ends', 'Intro.\r\n\r\n## Guides\r\n\r\n## Other\r\n', 'Intro.\r\n\r\n## Guides\r\n\r\n- [Child](Child) — desc\r\n\r\n## Other\r\n'],
]) {
  withCapture((stateFile) => {
    const repo = makeRepo();
    writeKbDoc(repo, linksDoc());
    putHome(stateFile, body);
    stagePage(repo, 'demo', 'child.md', 'title: Child\naction: upsert\nparent: Home\nparent-section: Guides\nparent-link: - [Child](Child) — desc');

    const res = call(['--scope', 'demo'], repo);
    assert.match(res.out, /published \(created\): Child/, `${what}: ${res.out}`);
    assert.equal(readState(stateFile).Home.body, linked, what);
    assert.ok(!isStaged(repo, 'child.md'), `${what}: cleared`);
  });
}

// removing a section's only list item also drops the blank line the add set above it, and the line end it
// appended to an unterminated last heading: add then remove restores the parent byte for byte. A prose line right
// below the heading keeps one blank line above it after the first cycle, and every later cycle returns those bytes.
{
  const { addParentLink, removeParentLink } = require(publishKbPath);
  const lineFor = () => ({ ok: true, line: '- [Child](Child) — desc' });
  const cycle = (body) => removeParentLink(addParentLink(body, 'Guides', lineFor, 'Child').body, 'Guides', 'Child').body;
  for (const [what, body] of [
    ['an empty section', 'Intro.\n\n## Guides\n\n## Other\n\n- [Z](Z)\n'],
    ['a last heading with no line end', 'Intro.\n\n## Guides'],
    ['CRLF line ends', 'Intro.\r\n\r\n## Guides\r\n\r\n## Other\r\n'],
  ]) {
    assert.equal(cycle(body), body, `${what}: add then remove restores the parent`);
  }
  const once = cycle('Intro.\n\n## Guides\nSome text.\n');
  assert.equal(once, 'Intro.\n\n## Guides\n\nSome text.\n', 'a section of prose keeps one blank line below its heading');
  assert.equal(cycle(once), once, 'a second cycle over a section of prose returns the same bytes');
}

// the link joins the named section's own list, ahead of any subsection: a list under a `###` inside the section is
// no anchor, and a section with no list of its own opens one below its heading
{
  const { addParentLink } = require(publishKbPath);
  const lineFor = () => ({ ok: true, line: '- [C](c)' });
  const add = (body) => addParentLink(body, 'Guides', lineFor, 'C').body;
  assert.equal(
    add('## Guides\n\n- [A](a)\n\n### Advanced\n\n- [B](b)\n\n## Other\n'),
    '## Guides\n\n- [A](a)\n- [C](c)\n\n### Advanced\n\n- [B](b)\n\n## Other\n',
    'the link follows the section\'s own last item, not a subsection\'s',
  );
  assert.equal(
    add('## Guides\n\nText.\n\n### Advanced\n\n- [B](b)\n'),
    '## Guides\n\n- [C](c)\n\nText.\n\n### Advanced\n\n- [B](b)\n',
    'a section whose only list sits in a subsection opens its own list below the heading',
  );
}

// the link follows every line the last top-level item carries: a nested item, a continuation line, or a fenced code
// block indented to the item's content column belongs to it across blank lines, and so does a lazy continuation line
// right below its text; a blank-separated line indented less is no part of it
{
  const { addParentLink } = require(publishKbPath);
  const lineFor = () => ({ ok: true, line: '- [C](c)' });
  const add = (body) => addParentLink(body, 'Guides', lineFor, 'C').body;
  assert.equal(
    add('## Guides\n\n- A\n\n    - A1\n\n## Other\n'),
    '## Guides\n\n- A\n\n    - A1\n- [C](c)\n\n## Other\n',
    'a blank-separated nested item stays under the last item, and the link follows it',
  );
  assert.equal(
    add('## Guides\n\n- A\n\nA paragraph.\n'),
    '## Guides\n\n- A\n- [C](c)\n\nA paragraph.\n',
    'a blank-separated paragraph below the list stays outside it, and the link lands above it',
  );
  assert.equal(
    add('## Guides\n\n- A\n\n  ```\n  code\n  ```\n'),
    '## Guides\n\n- A\n\n  ```\n  code\n  ```\n- [C](c)\n',
    'a fenced code block indented under the last item stays under it, and the link follows its closing fence',
  );
  assert.equal(
    add('## Guides\n\n- A\n\n  ```\ncode\n  ```\n'),
    '## Guides\n\n- A\n\n  ```\ncode\n  ```\n- [C](c)\n',
    'a fence the last item opens is carried to its closing fence, so the link never lands inside it',
  );
  assert.equal(
    add('## Guides\n\n- A\n  - A1\n\n  more A text\n'),
    '## Guides\n\n- A\n  - A1\n\n  more A text\n- [C](c)\n',
    'a two-space nested item is no anchor: the link follows the paragraph its top-level item carries',
  );
  assert.equal(
    add('## Guides\n\n- A\n - B\n'),
    '## Guides\n\n- A\n - B\n- [C](c)\n',
    'an item indented less than the item above it is that item\'s sibling, and the link follows it',
  );
  assert.equal(
    add('## Guides\n\n- A\nlazy\n'),
    '## Guides\n\n- A\nlazy\n- [C](c)\n',
    'a lazy continuation line right below the item continues its paragraph, and the link follows it',
  );
  assert.equal(
    add('## Guides\n\n- A\n```\ncode\n```\n'),
    '## Guides\n\n- A\n- [C](c)\n```\ncode\n```\n',
    'a fence opener indented less than the item\'s content column ends the item, and the link lands above the fence',
  );
  assert.equal(
    add('## Guides\n\n-\tA\n\n    more\n'),
    '## Guides\n\n-\tA\n\n    more\n- [C](c)\n',
    'a tab after the marker reaches the next tab stop, column 4, so a paragraph indented four spaces stays under the item',
  );
}

// a parent that links the page under another section already links it: the add writes nothing (ADR 0168)
{
  const { addParentLink } = require(publishKbPath);
  const out = addParentLink('## Other\n\n- [C](c)\n\n## Guides\n\n- [A](a)\n', 'Guides', () => ({ ok: true, line: '- [C](c)' }), 'C');
  assert.equal(out.changed, false, 'a link under another section counts as linked');
}

// a delete keeps the structure around the removed line: an item that carries a nested item, a continuation line,
// a lazy continuation line, or fenced code stays and is reported kept, and an item with another top-level item beside it is no only item
{
  const { removeParentLink, addParentLink } = require(publishKbPath);
  for (const [what, body, line] of [
    ['a nested child item', '## Guides\n\n- [Child](x)\n    - [Grand](y)\n', '- [Child](x)'],
    ['a nested child item after a blank line', '## Guides\n\n- [Child](x)\n\n  - [Grand](y)\n', '- [Child](x)'],
    ['a continuation line', '## Guides\n\n- [A](a)\n- [Child](x)\n  more text\n', '- [Child](x)'],
    ['a fenced code block', '## Guides\n\n- [Child](x)\n\n  ```\n  code\n  ```\n', '- [Child](x)'],
    ['a lazy continuation line', '## Guides\n\n- [Child](x)\nlazy\n', '- [Child](x)'],
    ['a continuation paragraph at the tab stop a tab after the marker reaches', '## Guides\n\n-\t[Child](x)\n\n    more\n', '-\t[Child](x)'],
  ]) {
    const out = removeParentLink(body, 'Guides', 'Child');
    assert.equal(out.changed, false, `${what}: the item stays`);
    assert.deepEqual(out.kept, [line], `${what}: the item is reported kept`);
  }
  assert.equal(
    removeParentLink('## Guides\n\n- [Child](x)\n- [A](a)\n    - [Grand](y)\n', 'Guides', 'Child').body,
    '## Guides\n\n- [A](a)\n    - [Grand](y)\n',
    'a section with another top-level item keeps the blank line below the heading',
  );
  const lineFor = () => ({ ok: true, line: '- [C](c)' });
  const body = '## Guides\n\n### Advanced\n\n- [B](b)\n';
  assert.equal(
    removeParentLink(addParentLink(body, 'Guides', lineFor, 'C').body, 'Guides', 'C').body,
    body,
    'add then remove restores a section whose only list sits in a subsection',
  );
}

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

// an `action: patch` page is linked too: created by the patch, or patched into an existing page
const stagePatchLinked = (repo, file, title, section, extra = '') =>
  stagePage(repo, 'demo', file, `title: ${title}\naction: patch\nparent: Home\nparent-section: How it works\nparent-link: - [${title}](${title}) — desc${extra}`, `## ${section}\n\nnew ${section}.\n`);

withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile);
  stagePatchLinked(repo, 'kid--a.md', 'Kid', 'A');

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /published \(created\): Kid/);
  assert.match(readState(stateFile).Home.body, /- \[B\]\(B\)\n- \[Kid\]\(Kid\) — desc\n/);
  assert.equal(captures(dir, 'create')[0].env.SUPERDEV_KB_PARENT_ID, undefined, 'links does not nest');
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

// link text with an escaped `]`, or wrapped in emphasis or code, is still the page's title
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile);
  stageLinked(repo, 'child.md', 'Notes [draft]', '- [Notes \\[draft\\]](Notes) — desc');
  assert.match(call(['--scope', 'demo'], repo).out, /published \(created\): Notes \[draft\]/);
  assert.match(readState(stateFile).Home.body, /- \[Notes \\\[draft\\\]\]\(Notes\) — desc\n/);
});
for (const text of ['**Child**', '_Child_', '`Child`']) {
  withCapture((stateFile, dir) => {
    const repo = makeRepo();
    writeKbDoc(repo, linksDoc());
    putHome(stateFile, HOME.replace('- [B](B)\n', `- [B](B)\n- [${text}](Child)\n`));
    stageLinked(repo, 'child.md', 'Child');
    call(['--scope', 'demo'], repo);
    assert.equal(captures(dir, 'update').length, 0, `${text} counts as an existing link`);
  });
}

// a link nested under another list item, by four spaces or a tab, is still a link to the page
for (const nested of ['    - [Child](Child)', '\t- [Child](Child)']) {
  withCapture((stateFile, dir) => {
    const repo = makeRepo();
    writeKbDoc(repo, linksDoc());
    putHome(stateFile, HOME.replace('- [B](B)\n', `- [B](B)\n- Group\n${nested}\n`));
    stageLinked(repo, 'child.md', 'Child');
    call(['--scope', 'demo'], repo);
    assert.equal(captures(dir, 'update').length, 0, `nested ${JSON.stringify(nested)} counts as an existing link`);
  });
}

// a continuation line indented by one tab reaches column 4 and keeps the list run going, as four spaces do
for (const cont of ['    cont', '\tcont']) {
  withCapture((stateFile, dir) => {
    const repo = makeRepo();
    writeKbDoc(repo, linksDoc());
    putHome(stateFile, HOME.replace('- [B](B)\n', `- [B](B)\n${cont}\n\t- [Child](Child)\n`));
    stageLinked(repo, 'child.md', 'Child');
    call(['--scope', 'demo'], repo);
    assert.equal(captures(dir, 'update').length, 0, `an item nested after ${JSON.stringify(cont)} counts as an existing link`);
  });
}

// a wrapped link text does not count for a title it merely contains: `__init__` is not `init`
for (const [text, title] of [['__init__', 'init'], ['__init__', '_init_']]) {
  withCapture((stateFile, dir) => {
    const repo = makeRepo();
    writeKbDoc(repo, linksDoc());
    putHome(stateFile, HOME.replace('- [B](B)\n', `- [B](B)\n- [${text}](x)\n`));
    stageLinked(repo, 'child.md', title);
    call(['--scope', 'demo'], repo);
    assert.equal(captures(dir, 'update').length, 1, `[${text}] is not a link to ${title}`);
  });
}

// indented code after a paragraph is not a list item, so it is not a link
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, HOME.replace('- [B](B)\n', '- [B](B)\n\nSome paragraph\n\n    - [Child](Child)\n'));
  stageLinked(repo, 'child.md', 'Child');
  call(['--scope', 'demo'], repo);
  assert.equal(captures(dir, 'update').length, 1, 'indented code is no existing link');
});

// after a paragraph, a space and a tab reach column 4, as four spaces do: that line is no list item either
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, HOME.replace('- [B](B)\n', '- [B](B)\n\nSome paragraph\n \t- [Child](Child)\n'));
  stageLinked(repo, 'child.md', 'Child');
  call(['--scope', 'demo'], repo);
  assert.equal(captures(dir, 'update').length, 1, 'a space and a tab to column 4 is no existing link');
});

// a title edged by `_`, `*`, or a backtick matches its own parent-link
for (const title of ['__init__', '_index', 'C*']) {
  withCapture((stateFile) => {
    const repo = makeRepo();
    writeKbDoc(repo, linksDoc());
    putHome(stateFile);
    stageLinked(repo, 'child.md', title);
    const res = call(['--scope', 'demo'], repo);
    assert.match(res.out, new RegExp(`published \\(created\\): ${title.replace(/[*]/g, '\\*')}`), title);
    assert.ok(readState(stateFile).Home.body.includes(`- [${title}](${title}) — desc\n`), `${title} linked`);
  });
}

// a thematic break or indented code at a section's end is not a list item to follow
withCapture((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, linksDoc());
  putHome(stateFile, 'Intro.\n\n## How it works\n\n- [A](A)\n- [B](B)\n\n* * *\n\n    - code\n\n## Other\n');
  stageLinked(repo, 'child.md', 'Child');
  call(['--scope', 'demo'], repo);
  assert.match(readState(stateFile).Home.body, /- \[B\]\(B\)\n- \[Child\]\(Child\) — desc\n\n\* \* \*\n/);
});

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

// --- `- **Hierarchy:** links`: a delete removes the page's link line from its parent (ADR 0168) ------
const stageDelete = (repo, title = 'Child') =>
  stagePage(repo, 'demo', 'child.md', `title: ${title}\naction: delete\nparent: Home\nparent-section: How it works\nparent-link: - [${title}](${title}) — desc`);
const HOME_WITH_CHILD = HOME.replace('- [B](B)\n', '- [B](B)\n- [Child](Child) — desc\n');

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

// Linear time (ADR 0086, ADR 0149): a parent line of unclosed brackets four times as long takes about four times as long to
// read for links when linear, sixteen times when quadratic; the ceiling sits at nine, between them. The capped scan
// still finds every link shape it found before. Each unit also opens a capped link-text run, a linear cost that hides a
// quadratic one on a short line, so the input starts at 6000 units, where a quadratic run dominates.
{
  const { removeParentLink } = require(publishKbPath);
  const { timePair, cpuNs } = require('./linear-time');
  const scan = (body) => removeParentLink(body, 'How it works', 'Child');
  for (const unit of ['[', '[[', '[a][', '[a](', '[[a|']) {
    const make = (n) => `## How it works\n\n- ${unit.repeat(n)}\n`;
    let n = 6000;
    for (let t0 = cpuNs(); n < 200000; n *= 2, t0 = cpuNs()) {
      scan(make(n));
      if (cpuNs() - t0 >= 25e6) break;
    }
    const [base, big] = timePair(scan, make(n), make(n * 4));
    assert.ok(big < 9 * base, `${unit} run stays about linear: ${base}ns at ${n}, four times the input ${big}ns`);
  }
  const body = '## How it works\n\n- [A](A)\n- [**Child**](x) — d\n- See [Child][c] and [[Child|c]] and [Child](y)\n';
  const out = scan(body);
  assert.equal(out.body, '## How it works\n\n- [A](A)\n- See [Child][c] and [[Child|c]] and [Child](y)\n', 'the single-link line is removed');
  assert.deepEqual(out.kept, ['- See [Child][c] and [[Child|c]] and [Child](y)'], 'the reference, wiki, and inline links are still found');
  assert.deepEqual(scan('## How it works\n\n- See [Child][c]\n- [[Child]]\n').kept, ['- See [Child][c]', '- [[Child]]'], 'each link shape alone');
}

// Linear time (ADR 0086, ADR 0149): a parent heading line four times as long takes about four times as long to read for
// its heading text when linear, sixteen times when quadratic, on the remove path and the add path alike; the ceiling
// sits at nine, between them.
{
  const { removeParentLink, addParentLink } = require(publishKbPath);
  const { timePair, cpuNs } = require('./linear-time');
  const scans = {
    remove: (body) => removeParentLink(body, 'How it works', 'Child'),
    add: (body) => addParentLink(body, 'How it works', () => ({ ok: true, line: '- [Child](Child)' }), 'Child'),
  };
  for (const [path, scan] of Object.entries(scans)) {
    for (const unit of [' ', ' #']) {
      const make = (n) => `## How it works\n\n- [A](A)\n# a${unit.repeat(n)}b\n`;
      let n = 2000;
      for (let t0 = cpuNs(); n < 200000; n *= 2, t0 = cpuNs()) {
        scan(make(n));
        if (cpuNs() - t0 >= 25e6) break;
      }
      const [base, big] = timePair(scan, make(n), make(n * 4));
      assert.ok(big < 9 * base, `${path} over a heading of ${JSON.stringify(unit)} runs stays about linear: ${base}ns at ${n}, four times the input ${big}ns`);
    }
  }
  const add = addParentLink;
  const lineFor = () => ({ ok: true, line: '- [Child](Child)' });
  for (const heading of ['## How it works', '## How it works ##', '  ## How it works  #  ', '##\tHow it works']) {
    assert.equal(add(`${heading}\n\n- [A](A)\n`, 'How it works', lineFor, 'Child').changed, true, `${JSON.stringify(heading)} is read as the section`);
  }
  for (const heading of ['## How it works#', '##How it works', '####### How it works']) {
    assert.equal(add(`${heading}\n\n- [A](A)\n`, 'How it works', lineFor, 'Child').ok, false, `${JSON.stringify(heading)} is no heading "How it works"`);
  }
}

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

console.log('publish-kb-parent-link.test.js: all assertions passed');
