'use strict';

// Suite for plugin/scripts/publish-kb.js: upsert and delete end to end against the fake backend —
// create, update, the keys `find` forwards, backend failures, partial runs, and cleanup failures.
// Shared fixtures live in tests/publish-kb-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { publishKbPath, FAKE_BACKEND, shq, makeRepo, commandsDoc, writeKbDoc, stagePage, call, withState } = require('./publish-kb-setup');
const { classifyBackend, hashBody } = require(publishKbPath);

// --- end-to-end: upsert creates when find reports absent (exit 3) ----------------------------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'demo', 'new-page.md', 'title: New Page\naction: upsert', 'first body.\n');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /published \(created\): New Page/);

  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(state['New Page'].body, 'first body.\n', 'the created page carries the staged body');
  assert.ok(
    !fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'new-page.md')),
    'the staged file is deleted once the create call lands',
  );
  assert.ok(
    !fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo')),
    'a scope directory left with no pages is removed',
  );
});

// --- end-to-end: upsert updates, never duplicates, when find locates the page ----------------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', ['find', 'read', 'create', 'update', 'delete']));
  fs.writeFileSync(stateFile, JSON.stringify({ 'Existing Page': { id: 'id-7', body: 'old.\n' } }));
  stagePage(repo, 'demo', 'existing.md', `title: Existing Page\naction: upsert\nlive-hash: ${hashBody('old.\n')}`, 'new body.\n');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /published \(updated\): Existing Page/);

  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(Object.keys(state).length, 1, 'the page is updated in place, never duplicated');
  assert.equal(state['Existing Page'].id, 'id-7', 'the same identifier is kept');
  assert.equal(state['Existing Page'].body, 'new body.\n');
});

// --- every key find emitted reaches the later verb as SUPERDEV_KB_<KEY> ----------------------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', ['find', 'read', 'create', 'update', 'delete']));
  fs.writeFileSync(stateFile, JSON.stringify({ 'Keyed Page': { id: 'id-42', body: 'old.\n' } }));
  stagePage(repo, 'demo', 'keyed.md', `title: Keyed Page\naction: upsert\nlive-hash: ${hashBody('old.\n')}`, 'new.\n');

  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-capture-'));
  process.env.FAKE_KB_CAPTURE_DIR = captureDir;

  const origWrite = process.stderr.write;
  const capturedStderr = [];
  process.stderr.write = (chunk) => {
    capturedStderr.push(String(chunk));
    return true;
  };

  try {
    const res = call(['--scope', 'demo'], repo);
    assert.ok(res.ok, `expected success, got: ${res.err}`);
  } finally {
    process.stderr.write = origWrite;
    delete process.env.FAKE_KB_CAPTURE_DIR;
  }
  const updateCall = fs
    .readdirSync(captureDir)
    .filter((f) => f.startsWith('update-'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(captureDir, f), 'utf8')))[0];
  assert.equal(updateCall.env.SUPERDEV_KB_ID, 'id-42', 'the id key find emitted reaches update as SUPERDEV_KB_ID');
  assert.equal(updateCall.env.SUPERDEV_KB_TITLE, 'Keyed Page');
  assert.equal(capturedStderr.join(''), '', 'a safe key produces no stderr warning');
});

// --- a find-returned title field must never shadow the staged title; controller wins -----------
withState((stateFile) => {
  const repo = makeRepo();
  // The find command here returns a title field; our implementation must NOT use it
  const findCmd = `echo '{"id": "id-1", "title": "Found Title"}'`;
  const readCmd = `node ${shq(FAKE_BACKEND)} read`;
  const createCmd = `node ${shq(FAKE_BACKEND)} create`;
  const updateCmd = `node ${shq(FAKE_BACKEND)} update`;
  const deleteCmd = `node ${shq(FAKE_BACKEND)} delete`;
  const doc = `# KB\n\n## Configuration\n\n- **Backend:** Override Wiki.\n\n## Commands\n\n### find\n\n\`\`\`sh\n${findCmd}\n\`\`\`\n\n### read\n\n\`\`\`sh\n${readCmd}\n\`\`\`\n\n### create\n\n\`\`\`sh\n${createCmd}\n\`\`\`\n\n### update\n\n\`\`\`sh\n${updateCmd}\n\`\`\`\n\n### delete\n\n\`\`\`sh\n${deleteCmd}\n\`\`\`\n`;
  writeKbDoc(repo, doc);
  fs.writeFileSync(stateFile, JSON.stringify({ 'Staged Title': { id: 'id-1', body: 'old.\n' } }));
  stagePage(repo, 'demo', 'override.md', `title: Staged Title\naction: upsert\nlive-hash: ${hashBody('old.\n')}`, 'body.\n');

  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-capture-'));
  process.env.FAKE_KB_CAPTURE_DIR = captureDir;
  try {
    const res = call(['--scope', 'demo'], repo);
    assert.ok(res.ok, `expected success, got: ${res.err}`);
  } finally {
    delete process.env.FAKE_KB_CAPTURE_DIR;
  }
  const updateCall = fs
    .readdirSync(captureDir)
    .filter((f) => f.startsWith('update-'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(captureDir, f), 'utf8')))[0];
  assert.equal(updateCall.env.SUPERDEV_KB_TITLE, 'Staged Title', 'the staged title wins, not the find-returned one');
});

// --- a find-returned body_file field must never shadow the staged body_file; controller wins ---
withState((stateFile) => {
  const repo = makeRepo();
  // The find command here returns a body_file field; our implementation must NOT use it
  const findCmd = `echo '{"id": "id-1", "body_file": "/wrong/path"}'`;
  const readCmd = `node ${shq(FAKE_BACKEND)} read`;
  const createCmd = `node ${shq(FAKE_BACKEND)} create`;
  const updateCmd = `node ${shq(FAKE_BACKEND)} update`;
  const deleteCmd = `node ${shq(FAKE_BACKEND)} delete`;
  const doc = `# KB\n\n## Configuration\n\n- **Backend:** Override Wiki.\n\n## Commands\n\n### find\n\n\`\`\`sh\n${findCmd}\n\`\`\`\n\n### read\n\n\`\`\`sh\n${readCmd}\n\`\`\`\n\n### create\n\n\`\`\`sh\n${createCmd}\n\`\`\`\n\n### update\n\n\`\`\`sh\n${updateCmd}\n\`\`\`\n\n### delete\n\n\`\`\`sh\n${deleteCmd}\n\`\`\`\n`;
  writeKbDoc(repo, doc);
  fs.writeFileSync(stateFile, JSON.stringify({ 'Staged': { id: 'id-1', body: 'old.\n' } }));
  stagePage(repo, 'demo', 'override2.md', `title: Staged\naction: upsert\nlive-hash: ${hashBody('old.\n')}`, 'body.\n');

  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-capture-'));
  process.env.FAKE_KB_CAPTURE_DIR = captureDir;
  try {
    const res = call(['--scope', 'demo'], repo);
    assert.ok(res.ok, `expected success, got: ${res.err}`);
  } finally {
    delete process.env.FAKE_KB_CAPTURE_DIR;
  }
  const updateCall = fs
    .readdirSync(captureDir)
    .filter((f) => f.startsWith('update-'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(captureDir, f), 'utf8')))[0];
  assert.ok(updateCall.env.SUPERDEV_KB_BODY_FILE && !updateCall.env.SUPERDEV_KB_BODY_FILE.includes('/wrong/path'), 'the staged body_file path wins, not the find-returned one');
});

// --- a find key that a POSIX shell cannot address as a variable is still forwarded, but warned ---
withState(() => {
  const repo = makeRepo();
  const liveBody = 'live body content';
  const doc = `# KB\n\n## Configuration\n\n- **Backend:** Hyphen Wiki.\n\n## Commands\n\n### find\n\n\`\`\`sh\necho '{"sub-url": "https://example.com/x", "id": "id-1"}'\n\`\`\`\n\n### read\n\n\`\`\`sh\nprintf '${liveBody}'\n\`\`\`\n\n### create\n\n\`\`\`sh\nexit 0\n\`\`\`\n\n### update\n\n\`\`\`sh\nexit 0\n\`\`\`\n\n### delete\n\n\`\`\`sh\nexit 0\n\`\`\`\n`;
  writeKbDoc(repo, doc);
  stagePage(repo, 'demo', 'p.md', `title: Hyphen Page\naction: upsert\nlive-hash: ${hashBody(liveBody)}`);

  const origWrite = process.stderr.write;
  const captured = [];
  process.stderr.write = (chunk) => {
    captured.push(String(chunk));
    return true;
  };
  let res;
  try {
    res = call(['--scope', 'demo'], repo);
  } finally {
    process.stderr.write = origWrite;
  }

  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /published \(updated\): Hyphen Page/, 'the hyphenated key does not block the update call');
  const warnings = captured.join('');
  assert.match(warnings, /sub-url/, 'the warning names the offending key');
  assert.match(warnings, /SUPERDEV_KB_SUB-URL/, 'the warning names the variable the key would have to be addressed as');
});

// --- a failing template's stderr tail rides in the reported reason ---
withState(() => {
  const repo = makeRepo();
  const doc = `# KB\n\n## Configuration\n\n- **Backend:** Flaky Wiki.\n\n## Commands\n\n### find\n\n\`\`\`sh\necho 'no tea login for https://codeberg.org' >&2; exit 2\n\`\`\`\n\n### create\n\n\`\`\`sh\nexit 0\n\`\`\`\n\n### update\n\n\`\`\`sh\nexit 0\n\`\`\`\n\n### delete\n\n\`\`\`sh\nexit 0\n\`\`\`\n`;
  writeKbDoc(repo, doc);
  stagePage(repo, 'demo', 'flaky.md', 'title: Flaky Page\naction: upsert');
  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /left staged: Flaky Page — find exited 2: no tea login for https:\/\/codeberg\.org/);
});

// --- a multi-line stderr stays one line in the reported reason ---
withState(() => {
  const repo = makeRepo();
  const doc = `# KB\n\n## Configuration\n\n- **Backend:** Flaky Wiki.\n\n## Commands\n\n### find\n\n\`\`\`sh\nprintf 'first line\\nsecond line\\n\\n  third' >&2; exit 2\n\`\`\`\n\n### create\n\n\`\`\`sh\nexit 0\n\`\`\`\n\n### update\n\n\`\`\`sh\nexit 0\n\`\`\`\n\n### delete\n\n\`\`\`sh\nexit 0\n\`\`\`\n`;
  writeKbDoc(repo, doc);
  stagePage(repo, 'demo', 'flaky.md', 'title: Flaky Page\naction: upsert');
  const res = call(['--scope', 'demo'], repo);
  assert.match(res.out, /left staged: Flaky Page — find exited 2: first line second line third(\n|$)/);
});

// --- exit 3 is the only absence outcome; any other nonzero leaves the page staged with its reason ---
withState(() => {
  const repo = makeRepo();
  // A `find` template that always exits 5 (neither 0 nor 3) — the backend "could not answer".
  const doc = `# KB\n\n## Configuration\n\n- **Backend:** Flaky Wiki.\n\n## Commands\n\n### find\n\n\`\`\`sh\nexit 5\n\`\`\`\n\n### create\n\n\`\`\`sh\nexit 0\n\`\`\`\n\n### update\n\n\`\`\`sh\nexit 0\n\`\`\`\n\n### delete\n\n\`\`\`sh\nexit 0\n\`\`\`\n`;
  writeKbDoc(repo, doc);
  stagePage(repo, 'demo', 'flaky.md', 'title: Flaky Page\naction: upsert');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok);
  assert.match(res.out, /left staged: Flaky Page — find exited 5/);
  assert.ok(
    fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'flaky.md')),
    'a find failure other than exit 3 leaves the page staged',
  );
});

// --- find exiting 0 with non-JSON-object stdout is a failure, not a find ---------------------
withState(() => {
  const repo = makeRepo();
  const doc = `# KB\n\n## Configuration\n\n- **Backend:** Odd Wiki.\n\n## Commands\n\n### find\n\n\`\`\`sh\necho 'not json'\n\`\`\`\n\n### create\n\n\`\`\`sh\nexit 0\n\`\`\`\n\n### update\n\n\`\`\`sh\nexit 0\n\`\`\`\n\n### delete\n\n\`\`\`sh\nexit 0\n\`\`\`\n`;
  writeKbDoc(repo, doc);
  stagePage(repo, 'demo', 'odd.md', 'title: Odd Page\naction: upsert');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok);
  assert.match(res.out, /left staged: Odd Page — find exited 0 but stdout was not a JSON object/);
});

{
  // A JSON array is not an object either.
  const doc = `# KB\n\n## Configuration\n\n- **Backend:** Odd Wiki.\n\n## Commands\n\n### find\n\n\`\`\`sh\necho '[1,2]'\n\`\`\`\n`;
  const backend = classifyBackend(doc);
  const { runFind } = require(publishKbPath);
  const r = runFind('X', backend.templates);
  assert.equal(r.verdict, 'unknown');
}

// --- title with a quote, a $, a backtick, and a newline publishes unchanged, no nested shell ---
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  const tricky = 'a "quote", a $dollar, a `backtick`, and a\nnewline';
  stagePage(repo, 'demo', 'tricky.md', `title: ${JSON.stringify(tricky)}\naction: upsert`, 'b.\n');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);

  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, tricky), 'the title reached the backend byte-for-byte');
});

// --- delete for an already-absent page counts as done, not a failure ------------------------
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'demo', 'gone.md', 'title: Gone Page\naction: delete');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /already absent, done: Gone Page/);
  assert.ok(
    !fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'gone.md')),
    'the staged delete of an already-absent page is cleared',
  );
});

// --- delete for an existing page calls delete, with find's keys, and removes it --------------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  fs.writeFileSync(stateFile, JSON.stringify({ 'Live Page': { id: 'id-1', body: 'x' } }));
  stagePage(repo, 'demo', 'live.md', 'title: Live Page\naction: delete');

  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-capture-'));
  process.env.FAKE_KB_CAPTURE_DIR = captureDir;
  let res;
  try {
    res = call(['--scope', 'demo'], repo);
  } finally {
    delete process.env.FAKE_KB_CAPTURE_DIR;
  }
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /^deleted: Live Page$/m);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(!Object.hasOwn(state, 'Live Page'));

  const deleteCall = fs
    .readdirSync(captureDir)
    .filter((f) => f.startsWith('delete-'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(captureDir, f), 'utf8')))[0];
  assert.equal(deleteCall.env.SUPERDEV_KB_ID, 'id-1', 'the id key find emitted reaches delete as SUPERDEV_KB_ID too');
});

// --- partial run: exactly the failures stay staged, the directory is never wiped wholesale ---
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'demo', 'ok.md', 'title: OK Page\naction: upsert');
  stagePage(repo, 'demo', 'bad.md', 'title: Bad Page\naction: delete-unknown-action-typo');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  const dir = path.join(repo, '.superdev', 'kb-pending', 'demo');
  assert.ok(!fs.existsSync(path.join(dir, 'ok.md')), 'the succeeding page is cleared');
  assert.ok(fs.existsSync(path.join(dir, 'bad.md')), 'the failing page stays staged, alone');
});

// --- a cleanup failure after a landed call never aborts the batch: the rest is still attempted ---
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'demo', 'first.md', 'title: First Page\naction: upsert');
  stagePage(repo, 'demo', 'second.md', 'title: Second Page\naction: upsert');

  const firstPath = path.join(repo, '.superdev', 'kb-pending', 'demo', 'first.md');
  const origUnlink = fs.unlinkSync;
  fs.unlinkSync = (p, ...rest) => {
    if (p === firstPath) throw new Error('EACCES: simulated cleanup failure');
    return origUnlink.call(fs, p, ...rest);
  };
  let res;
  try {
    res = call(['--scope', 'demo'], repo);
  } finally {
    fs.unlinkSync = origUnlink;
  }

  assert.ok(res.ok, `expected success, got: ${res.err}`);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'First Page'), 'the backend call for the first page landed despite the later cleanup failure');
  assert.ok(Object.hasOwn(state, 'Second Page'), 'the second page is still attempted after the first one fails to clear');
  assert.match(res.out, /published \(created\) but not cleared: First Page — .*simulated cleanup failure/);
  assert.match(res.out, /published \(created\): Second Page/);
  assert.ok(fs.existsSync(firstPath), 'the staged file stays because clearing it failed');
});

// --- a temp-body-dir cleanup failure (the `finally { fs.rmSync }`) never aborts the batch either ---
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'demo', 'first.md', 'title: First Page\naction: upsert');
  stagePage(repo, 'demo', 'second.md', 'title: Second Page\naction: upsert');

  const origRm = fs.rmSync;
  fs.rmSync = () => {
    throw new Error('simulated temp-dir cleanup failure');
  };
  let res;
  try {
    res = call(['--scope', 'demo'], repo);
  } finally {
    fs.rmSync = origRm;
  }

  assert.ok(res.ok, `expected success, got: ${res.err}`);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'First Page'), 'the first page still publishes despite the temp-dir cleanup failure');
  assert.ok(Object.hasOwn(state, 'Second Page'), 'the second page is still attempted');
  assert.match(res.out, /published \(created\): First Page/);
  assert.match(res.out, /published \(created\): Second Page/);
});

// --- spawnSync's own launch failure (res.error) leaves the page staged as unknown, never absent ---
withState(() => {
  const repo = makeRepo();
  // Exceeding spawnSync's own maxBuffer is a real, portable way to force `res.error` (Node kills
  // the child and reports ENOBUFS) without depending on a missing binary or a broken shell.
  const doc = `# KB\n\n## Configuration\n\n- **Backend:** Loud Wiki.\n\n## Commands\n\n### find\n\n\`\`\`sh\nhead -c 11000000 /dev/zero\n\`\`\`\n\n### create\n\n\`\`\`sh\nexit 0\n\`\`\`\n\n### update\n\n\`\`\`sh\nexit 0\n\`\`\`\n\n### delete\n\n\`\`\`sh\nexit 0\n\`\`\`\n`;
  writeKbDoc(repo, doc);
  stagePage(repo, 'demo', 'loud.md', 'title: Loud Page\naction: upsert');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /left staged: Loud Page — find could not run/);
  assert.ok(!/absent/i.test(res.out), 'a spawn launch failure is never treated as absence');
  assert.ok(
    fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'loud.md')),
    'a launch failure leaves the page staged',
  );
});

// --- no `sh` on PATH: the reason names the missing `sh` and Git for Windows (ADR 0150) ----------
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', ['find', 'read', 'create', 'update', 'delete']));
  stagePage(repo, 'demo', 'nosh.md', 'title: No Sh Page\naction: upsert');
  // A PATH holding `git` alone: publish-kb.js's own git calls still run, while no `sh` resolves.
  const gitOnly = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-nosh-'));
  const gitBin = spawnSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  fs.symlinkSync(gitBin, path.join(gitOnly, 'git'));
  const origPath = process.env.PATH;
  process.env.PATH = gitOnly;
  let res;
  let readRes;
  try {
    res = call(['--scope', 'demo'], repo);
    readRes = call(['--read', 'No Sh Page'], repo);
  } finally {
    process.env.PATH = origPath;
    fs.rmSync(gitOnly, { recursive: true, force: true });
  }
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /left staged: No Sh Page — find could not run: no `sh` on PATH \(on Windows, install Git for Windows\)/);
  assert.ok(
    fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'nosh.md')),
    'a missing sh leaves the page staged',
  );
  assert.equal(readRes.ok, false);
  assert.match(readRes.err, /no `sh` on PATH \(on Windows, install Git for Windows\)/);
});

// --- malformed frontmatter: no title, or an unknown action, is reported, skipped, untouched ---
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'demo', 'no-title.md', 'action: upsert');
  stagePage(repo, 'demo', 'bad-action.md', 'title: Bad\naction: nonsense');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /malformed frontmatter, left untouched: no-title\.md — no title/);
  assert.match(res.out, /malformed frontmatter, left untouched: bad-action\.md — unknown action "nonsense"/);
  const dir = path.join(repo, '.superdev', 'kb-pending', 'demo');
  assert.ok(fs.existsSync(path.join(dir, 'no-title.md')));
  assert.ok(fs.existsSync(path.join(dir, 'bad-action.md')));
});

// --- a staged page whose title is a folder's (find answers type: folder) is refused by name, untouched ---
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  fs.writeFileSync(stateFile, JSON.stringify({ 'Docs Folder': { id: 'f-1', type: 'folder', body: '' }, 'Old Folder': { id: 'f-2', type: 'folder', body: '' } }));
  stagePage(repo, 'demo', 'up.md', 'title: Docs Folder\naction: upsert', 'body.\n');
  stagePage(repo, 'demo', 'del.md', 'title: Old Folder\naction: delete');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected a report, got: ${res.err}`);
  const lines = res.out.split('\n').filter((l) => /left staged: (Docs|Old) Folder/.test(l));
  assert.equal(lines.length, 2, 'both the upsert and the delete are left staged');
  for (const l of lines) assert.match(l, /"(Docs|Old) Folder" is a folder, not a page/, 'the reason names the folder');
  assert.doesNotMatch(res.out, /live-hash/, 'the folder is refused before the hash guard');
  assert.ok(JSON.parse(fs.readFileSync(stateFile, 'utf8'))['Docs Folder'], 'the folder is untouched');
});

console.log('publish-kb-publish.test.js: all assertions passed');
