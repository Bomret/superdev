'use strict';

// Suite for plugin/scripts/publish-kb.js: `action: patch` pages — the section merge by heading, title
// groups sharing one title, and the refusals a patch makes. Shared fixtures live in
// tests/publish-kb-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { FAKE_BACKEND, makeRepo, commandsDoc, writeKbDoc, stagePage, call, withState } = require('./publish-kb-setup');

// --- action: patch --------------------------------------------------------------------------
const PATCH_VERBS = ['find', 'read', 'create', 'update', 'delete'];

// --- a patch against a live page merges its section by heading and sends the merged body back
// under the same title, through update ---------------------------------------------------------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', PATCH_VERBS));
  fs.writeFileSync(
    stateFile,
    JSON.stringify({
      'Aggregate Page': {
        id: 'id-1',
        body: '# Aggregate Page\n\n## Section A\n\nold A.\n\n## Section B\n\nold B.\n',
      },
    }),
  );
  stagePage(repo, 'demo', 'aggregate--section-a.md', 'title: Aggregate Page\naction: patch', '## Section A\n\nnew A.\n');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /published \(updated\): Aggregate Page/);

  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.match(state['Aggregate Page'].body, /new A\./);
  assert.match(state['Aggregate Page'].body, /old B\./, 'the sibling section survives the merge');
  assert.ok(
    !fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'aggregate--section-a.md')),
    'the staged file is cleared once the merged update lands',
  );
});

// --- a patch whose title find reports absent (exit 3) creates the page from that section alone ---
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', PATCH_VERBS));
  stagePage(repo, 'demo', 'new--section-a.md', 'title: New Aggregate\naction: patch', '## Section A\n\nfirst content.\n');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /published \(created\): New Aggregate/);

  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.match(state['New Aggregate'].body, /first content\./);
});

// --- a read failure (nonzero exit) leaves the file staged, creates nothing, states the reason ---
withState(() => {
  const repo = makeRepo();
  const doc = `# KB\n\n## Configuration\n\n- **Backend:** Flaky Wiki.\n\n## Commands\n\n### find\n\n\`\`\`sh\necho '{"id": "id-1"}'\n\`\`\`\n\n### read\n\n\`\`\`sh\nexit 7\n\`\`\`\n\n### create\n\n\`\`\`sh\nexit 0\n\`\`\`\n\n### update\n\n\`\`\`sh\nexit 0\n\`\`\`\n\n### delete\n\n\`\`\`sh\nexit 0\n\`\`\`\n`;
  writeKbDoc(repo, doc);
  stagePage(repo, 'demo', 'flaky--section-a.md', 'title: Flaky Page\naction: patch', '## Section A\n\nx.\n');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /left staged: Flaky Page — read exited 7/);
  assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'flaky--section-a.md')));
});

// --- read returning an empty body for a title find DID list is a read failure, not an empty page ---
withState(() => {
  const repo = makeRepo();
  const doc = `# KB\n\n## Configuration\n\n- **Backend:** Empty Wiki.\n\n## Commands\n\n### find\n\n\`\`\`sh\necho '{"id": "id-1"}'\n\`\`\`\n\n### read\n\n\`\`\`sh\ntrue\n\`\`\`\n\n### create\n\n\`\`\`sh\nexit 1\n\`\`\`\n\n### update\n\n\`\`\`sh\nexit 1\n\`\`\`\n\n### delete\n\n\`\`\`sh\nexit 0\n\`\`\`\n`;
  writeKbDoc(repo, doc);
  stagePage(repo, 'demo', 'empty--section-a.md', 'title: Empty Body Page\naction: patch', '## Section A\n\nx.\n');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /left staged: Empty Body Page — read returned an empty body/);
  assert.ok(
    fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'empty--section-a.md')),
    'an empty read never creates the page from the lone section',
  );
});

// --- a configuration declaring no read template leaves every patch page staged with that reason ---
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', ['find', 'create', 'update', 'delete']));
  stagePage(repo, 'demo', 'noread--section-a.md', 'title: No Read Page\naction: patch', '## Section A\n\nx.\n');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /left staged: No Read Page — no read command configured/);
});

// --- a backend declaring a non-markdown body format (Confluence-shaped) refuses a patch, but ----
// still upserts -----------------------------------------------------------------------------------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(
    repo,
    commandsDoc('- **Backend:** Confluence.\n- **Body format:** storage', PATCH_VERBS),
  );
  fs.writeFileSync(
    stateFile,
    JSON.stringify({ 'Confluence Page': { id: 'id-1', body: '<p>old.</p>' } }),
  );
  stagePage(repo, 'demo', 'confluence--section-a.md', 'title: Confluence Page\naction: patch', '## Section A\n\nnew A.\n');
  stagePage(repo, 'demo', 'confluence-whole.md', 'title: Other Page\naction: upsert', 'a whole page.\n');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(
    res.out,
    /left staged: Confluence Page — .*not markdown/,
    'a patch is refused, deterministically, on a non-markdown body format',
  );
  assert.match(res.out, /published \(created\): Other Page/, 'an upsert still works on the same backend');
  assert.ok(
    fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'confluence--section-a.md')),
    'the refused patch stays staged',
  );
});

// --- two or more staged files sharing a title where at least one is not action: patch: --------
// none published, every filename in the group reported
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', PATCH_VERBS));
  fs.writeFileSync(stateFile, JSON.stringify({ 'Mixed Page': { id: 'id-1', body: '# Mixed Page\n\nold.\n' } }));
  stagePage(repo, 'demo', 'mixed--section-a.md', 'title: Mixed Page\naction: patch', '## Section A\n\nnew.\n');
  stagePage(repo, 'demo', 'mixed-whole.md', 'title: Mixed Page\naction: upsert', 'a whole replacement.\n');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /left staged: Mixed Page — .*mixed--section-a\.md/);
  assert.match(res.out, /left staged: Mixed Page — .*mixed-whole\.md/);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(state['Mixed Page'].body, '# Mixed Page\n\nold.\n', 'the live page is untouched');
  assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'mixed--section-a.md')));
  assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'mixed-whole.md')));
});

// --- two or more sharing one title and all patch: applied in turn, every section lands --------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', PATCH_VERBS));
  fs.writeFileSync(stateFile, JSON.stringify({ 'Combo Page': { id: 'id-1', body: '# Combo Page\n' } }));
  stagePage(repo, 'demo', 'combo--section-a.md', 'title: Combo Page\naction: patch', '## Section A\n\nfrom A.\n');
  stagePage(repo, 'demo', 'combo--section-b.md', 'title: Combo Page\naction: patch', '## Section B\n\nfrom B.\n');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.match(state['Combo Page'].body, /from A\./, 'the first section lands');
  assert.match(state['Combo Page'].body, /from B\./, 'the second section lands too, rather than overwriting the first');
  assert.ok(!fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'combo--section-a.md')));
  assert.ok(!fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'combo--section-b.md')));
});

// --- once one file in a group has created the page, absence is settled for the rest: a later ---
// stale "absent" answer never triggers a second create
withState(() => {
  const repo = makeRepo();
  const doc = `# KB\n\n## Configuration\n\n- **Backend:** Stale Wiki.\n\n## Commands\n\n### find\n\n\`\`\`sh\nexit 3\n\`\`\`\n\n### read\n\n\`\`\`sh\nexit 1\n\`\`\`\n\n### create\n\n\`\`\`sh\nnode ${JSON.stringify(FAKE_BACKEND)} create\n\`\`\`\n\n### update\n\n\`\`\`sh\nnode ${JSON.stringify(FAKE_BACKEND)} update\n\`\`\`\n\n### delete\n\n\`\`\`sh\nexit 0\n\`\`\`\n`;
  writeKbDoc(repo, doc);
  stagePage(repo, 'demo', 'stale--section-a.md', 'title: Stale Page\naction: patch', '## Section A\n\nfrom A.\n');
  stagePage(repo, 'demo', 'stale--section-b.md', 'title: Stale Page\naction: patch', '## Section B\n\nfrom B.\n');

  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-capture-'));
  process.env.FAKE_KB_CAPTURE_DIR = captureDir;
  let res;
  try {
    res = call(['--scope', 'demo'], repo);
  } finally {
    delete process.env.FAKE_KB_CAPTURE_DIR;
  }
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  const createCalls = fs.readdirSync(captureDir).filter((f) => f.startsWith('create-'));
  assert.equal(createCalls.length, 1, 'find always answering absent never triggers a second create once the group has settled');
  assert.match(res.out, /published \(created\): Stale Page/);
  assert.match(res.out, /left staged: Stale Page/);
});

// --- two patch files in one group carrying the same section heading: both reported and skipped ---
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', PATCH_VERBS));
  fs.writeFileSync(stateFile, JSON.stringify({ 'Dup Page': { id: 'id-1', body: '# Dup Page\n' } }));
  stagePage(repo, 'demo', 'dup--a.md', 'title: Dup Page\naction: patch', '## Same Heading\n\nfrom first.\n');
  stagePage(repo, 'demo', 'dup--b.md', 'title: Dup Page\naction: patch', '## Same Heading\n\nfrom second.\n');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /left staged: Dup Page — .*dup--a\.md|left staged: Dup Page — .*dup--b\.md/);
  const out = res.out;
  const mentionsA = /dup--a\.md/.test(out);
  const mentionsB = /dup--b\.md/.test(out);
  assert.ok(mentionsA && mentionsB, 'both colliding files are named in the report');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(state['Dup Page'].body, '# Dup Page\n', 'neither colliding section is merged');
  assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'dup--a.md')));
  assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'dup--b.md')));
});

// --- two patch files whose headings differ only by CommonMark-equivalent spelling (closed ATX,
// or marker whitespace) still collide: both reported and skipped, neither section silently lost ---
for (const [labelSuffix, headingA, headingB] of [
  ['closed ATX', '## Same Heading', '## Same Heading ##'],
  ['marker whitespace', '## Same Heading', '##  Same Heading'],
]) {
  withState((stateFile) => {
    const repo = makeRepo();
    writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', PATCH_VERBS));
    fs.writeFileSync(stateFile, JSON.stringify({ 'Combo Page': { id: 'id-1', body: '# Combo Page\n' } }));
    stagePage(repo, 'demo', 'combo--a.md', 'title: Combo Page\naction: patch', `${headingA}\n\nfrom A.\n`);
    stagePage(repo, 'demo', 'combo--b.md', 'title: Combo Page\naction: patch', `${headingB}\n\nfrom B.\n`);

    const res = call(['--scope', 'demo'], repo);
    assert.ok(res.ok, `expected success, got: ${res.err}`);
    assert.match(res.out, /left staged: Combo Page/, `${labelSuffix}: at least one sibling reported as left staged`);
    const out = res.out;
    assert.ok(/combo--a\.md/.test(out) && /combo--b\.md/.test(out), `${labelSuffix}: both colliding files are named in the report`);
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.equal(state['Combo Page'].body, '# Combo Page\n', `${labelSuffix}: neither colliding section is merged`);
    assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'combo--a.md')), `${labelSuffix}: A stays staged`);
    assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'combo--b.md')), `${labelSuffix}: B stays staged`);
  });
}

// --- merge() refusing (e.g. no heading) leaves that one file staged with its reason, the rest continue ---
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', PATCH_VERBS));
  fs.writeFileSync(stateFile, JSON.stringify({ 'Bad Section Page': { id: 'id-1', body: '# Bad Section Page\n' } }));
  stagePage(repo, 'demo', 'noheading--section.md', 'title: Bad Section Page\naction: patch', 'just prose, no heading.\n');
  stagePage(repo, 'demo', 'good.md', 'title: Good Page\naction: upsert', 'good body.\n');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /left staged: Bad Section Page — .*no heading/);
  assert.match(res.out, /published \(created\): Good Page/);
  assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'noheading--section.md')));
});

console.log('publish-kb-patch.test.js: all assertions passed');
