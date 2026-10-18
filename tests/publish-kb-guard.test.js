'use strict';

// Suite for plugin/scripts/publish-kb.js: the live-hash guard on upsert (ADR 0094, INV-0091), the
// storage body conversion (ADR 0109, INV-0109), and the staged `parent:` (ADR 0109). Shared fixtures
// live in tests/publish-kb-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { publishKbPath, FAKE_BACKEND, makeRepo, commandsDoc, writeKbDoc, stagePage, call, withState } = require('./publish-kb-setup');
const { hashBody } = require(publishKbPath);

const PATCH_VERBS = ['find', 'read', 'create', 'update', 'delete'];

// --- the live-hash guard on upsert (ADR 0094, INV-0091) -----------------------------------------

// --- a recorded hash that differs from the live body refuses; the rest of the batch still runs ---
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', ['find', 'read', 'create', 'update', 'delete']));
  fs.writeFileSync(stateFile, JSON.stringify({ 'Changed Page': { id: 'id-1', body: 'edited elsewhere.\n' } }));
  stagePage(
    repo,
    'demo',
    'changed.md',
    `title: Changed Page\naction: upsert\nlive-hash: ${hashBody('stale body the pass saw.\n')}`,
    'new body.\n',
  );
  stagePage(repo, 'demo', 'fine.md', 'title: Fine Page\naction: upsert', 'fine body.\n');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected a report, got: ${res.err}`);
  assert.match(res.out, /left staged: Changed Page — .*live-hash mismatch/);
  assert.match(res.out, /published \(created\): Fine Page/, 'the rest of the batch still publishes');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(state['Changed Page'].body, 'edited elsewhere.\n', 'the live page is untouched');
  assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'changed.md')));
});

// --- a storage backend receives the staged markdown converted to XHTML, on create and update ----
// (ADR 0109)
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Confluence.\n- **Body format:** storage', ['find', 'read', 'create', 'update', 'delete']));
  fs.writeFileSync(stateFile, JSON.stringify({ 'Old Page': { id: 'id-1', body: '<p>old.</p>' } }));
  stagePage(repo, 'demo', 'new.md', 'title: New Page\naction: upsert', '## Heading\n\nSome *text*.\n');
  stagePage(repo, 'demo', 'old.md', `title: Old Page\naction: upsert\nlive-hash: ${hashBody('<p>old.</p>')}`, '- item\n');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(state['New Page'].body, '<h2>Heading</h2>\n<p>Some <em>text</em>.</p>\n', 'create receives XHTML');
  assert.equal(state['Old Page'].body, '<ul>\n<li>item</li>\n</ul>\n', 'update receives XHTML');
});

// --- a backend with no storage body format receives the staged body byte-identical (INV-0109) ---
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', ['find', 'read', 'create', 'update', 'delete']));
  fs.writeFileSync(stateFile, JSON.stringify({ 'Old Page': { id: 'id-1', body: 'old.\n' } }));
  const md = '## Heading\n\n<b>raw</b> & *text*\n';
  stagePage(repo, 'demo', 'new.md', 'title: New Page\naction: upsert', md);
  stagePage(repo, 'demo', 'old.md', `title: Old Page\naction: upsert\nlive-hash: ${hashBody('old.\n')}`, md);

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(state['New Page'].body, md, 'create receives the staged body unchanged');
  assert.equal(state['Old Page'].body, md, 'update receives the staged body unchanged');
});

// --- a staged `parent:` reaches create as SUPERDEV_KB_PARENT_ID (ADR 0109) -----------------------

function captures(dir, verb) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
    .filter((c) => c.verb === verb);
}

function withCapture(fn) {
  withState((stateFile) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-capture-'));
    process.env.FAKE_KB_CAPTURE_DIR = dir;
    fn(stateFile, dir);
  });
}

// --- a parent the space already holds: create receives its id; a page with no parent gets none ---
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  fs.writeFileSync(stateFile, JSON.stringify({ Guide: { id: 'id-guide', body: 'g.\n' } }));
  stagePage(repo, 'demo', 'child.md', 'title: Child\naction: upsert\nparent: Guide');
  stagePage(repo, 'demo', 'orphan.md', 'title: Orphan\naction: upsert');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  const creates = captures(dir, 'create');
  const child = creates.find((c) => c.env.SUPERDEV_KB_TITLE === 'Child');
  const orphan = creates.find((c) => c.env.SUPERDEV_KB_TITLE === 'Orphan');
  assert.equal(child.env.SUPERDEV_KB_PARENT_ID, 'id-guide', 'create receives the parent page id');
  assert.ok(!('SUPERDEV_KB_PARENT_ID' in orphan.env), 'a page with no parent: gets no parent id');
});

// --- a parent staged in the same batch is created before its child, whatever the filename order --
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'demo', 'a-grandchild.md', 'title: Grandchild\naction: upsert\nparent: Child');
  stagePage(repo, 'demo', 'b-child.md', 'title: Child\naction: upsert\nparent: Root Page');
  stagePage(repo, 'demo', 'c-root.md', 'title: Root Page\naction: upsert');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /published \(created\): Grandchild/);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const byTitle = Object.fromEntries(captures(dir, 'create').map((c) => [c.env.SUPERDEV_KB_TITLE, c.env]));
  assert.equal(byTitle.Child.SUPERDEV_KB_PARENT_ID, state['Root Page'].id);
  assert.equal(byTitle.Grandchild.SUPERDEV_KB_PARENT_ID, state.Child.id);
});

// --- a parent that cannot be found leaves the child staged, naming it; the batch goes on ---------
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'demo', 'lost.md', 'title: Lost Child\naction: upsert\nparent: Nowhere');
  stagePage(repo, 'demo', 'fine.md', 'title: Fine Page\naction: upsert');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /left staged: Lost Child — parent page "Nowhere" not found/);
  assert.match(res.out, /published \(created\): Fine Page/);
  assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'lost.md')));
  assert.ok(!captures(dir, 'create').some((c) => c.env.SUPERDEV_KB_TITLE === 'Lost Child'), 'nothing created');
});

// --- a parent lookup find cannot answer leaves the child staged ------------------------------------
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  const doc = commandsDoc('- **Backend:** Some Wiki.').replace(
    `node ${JSON.stringify(FAKE_BACKEND)} find`,
    `[ "$SUPERDEV_KB_TITLE" = "Broken" ] && exit 2; node ${JSON.stringify(FAKE_BACKEND)} find`,
  );
  writeKbDoc(repo, doc);
  stagePage(repo, 'demo', 'kid.md', 'title: Kid\naction: upsert\nparent: Broken');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /left staged: Kid — parent page "Broken": /);
  assert.equal(captures(dir, 'create').length, 0);
});

// --- an action: patch that creates an absent page resolves its staged parent too ------------------
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', PATCH_VERBS));
  fs.writeFileSync(stateFile, JSON.stringify({ Guide: { id: 'id-guide', body: 'g.\n' } }));
  stagePage(repo, 'demo', 'kid--a.md', 'title: Kid\naction: patch\nparent: Guide', '## A\n\nnew A.\n');
  stagePage(repo, 'demo', 'lost--a.md', 'title: Lost\naction: patch\nparent: Nowhere', '## A\n\nnew A.\n');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  const creates = captures(dir, 'create');
  const kid = creates.find((c) => c.env.SUPERDEV_KB_TITLE === 'Kid');
  assert.equal(kid.env.SUPERDEV_KB_PARENT_ID, 'id-guide', 'a patch-created page receives the parent id');
  assert.match(res.out, /left staged: Lost — parent page "Nowhere" not found/);
  assert.ok(!creates.some((c) => c.env.SUPERDEV_KB_TITLE === 'Lost'), 'an unknown parent creates nothing');
});

// --- a create template that never reads SUPERDEV_KB_PARENT_ID leaves a parented page staged -------
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', PATCH_VERBS).replace(': "$SUPERDEV_KB_PARENT_ID"\n', ''));
  fs.writeFileSync(stateFile, JSON.stringify({ Guide: { id: 'id-guide', body: 'g.\n' } }));
  stagePage(repo, 'demo', 'child.md', 'title: Child\naction: upsert\nparent: Guide');
  stagePage(repo, 'demo', 'kid--a.md', 'title: Kid\naction: patch\nparent: Guide', '## A\n\nnew A.\n');

  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /left staged: Child — the create command never reads SUPERDEV_KB_PARENT_ID, so parent "Guide" would be ignored — update it from the seed \(\/superdev:setup check\)/);
  assert.match(res.out, /left staged: Kid — the create command never reads SUPERDEV_KB_PARENT_ID/);
  assert.equal(captures(dir, 'create').length, 0, 'nothing is created');
});

console.log('publish-kb-guard.test.js: all assertions passed');
