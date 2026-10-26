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

console.log('publish-kb-parent-link-add.test.js: all assertions passed');
