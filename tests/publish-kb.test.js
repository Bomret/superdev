'use strict';

// Suite for plugin/scripts/publish-kb.js. Requires the module (silent — it already guards its CLI
// entry with require.main === module, per ADR 0059) and calls its exported `run()` directly, the
// way tests/scope.test.js exercises scope.js's own CLI verbs.
//
// The backend is a real fake command (tests/fixtures/fake-kb-backend.js), never a mocked exec
// function: the contract under test is what publish-kb.js does to a real `/bin/sh -c` child
// process, so the module under test needs no seam of its own to make that observable.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const publishKbPath = require.resolve('../plugin/scripts/publish-kb.js');
const { run, parseCommandsTemplates, parseStagedPage, classifyBackend, parseBaseBranch, parseRemote, hashBody } = require(publishKbPath);

const FAKE_BACKEND = require.resolve('./fixtures/fake-kb-backend.js');

// The bound every hanging-verb block below runs under. `hangingVerbDoc` hangs one verb with
// `sleep 30` and leaves every other verb a real `node` spawn, which the same bound kills — and a
// `node` start alone costs around 100ms. The bound therefore clears a healthy spawn by a wide
// margin and still ends the hang in a fraction of its 30s.
const HANG_MS = 1000;

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function makeRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kb-repo-')));
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.email', 'test@example.com'], dir);
  git(['config', 'user.name', 'test'], dir);
  fs.writeFileSync(path.join(dir, 'base.txt'), 'x\n');
  git(['add', '.'], dir);
  git(['commit', '-q', '-m', 'base'], dir);
  fs.mkdirSync(path.join(dir, 'docs', 'agents'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'docs', 'agents', 'code-management.md'),
    '# Code host\n\n- **Base branch:** `main`.\n',
  );
  return dir;
}

// Every staged scope other than `_adhoc` gets a `feat/<scope>` branch at the current tip, so it
// reads `contained` against `main` (same commit, same tree) unless a test deliberately diverges it.
// This is what keeps every pre-existing test — none of which is about the merge check — green once
// publish-kb.js starts refusing an unmerged or unresolvable scope branch by default.
function ensureContainedBranch(repo, scope) {
  if (scope === '_adhoc') return;
  const branch = `feat/${scope}`;
  if (spawnSync('git', ['rev-parse', '--verify', '--quiet', branch], { cwd: repo }).status === 0) return;
  git(['branch', branch], repo);
}

function commandsDoc(backendLine, verbs = ['find', 'create', 'update', 'delete']) {
  const sections = verbs
    .map((v) => `### ${v}\n\n\`\`\`sh\nnode ${JSON.stringify(FAKE_BACKEND)} ${v}\n\`\`\``)
    .join('\n\n');
  return `# Knowledge base\n\n## Configuration\n\n${backendLine}\n\n## Commands\n\n${sections}\n`;
}

function writeKbDoc(repo, text) {
  fs.mkdirSync(path.join(repo, 'docs', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs', 'agents', 'knowledge-base.md'), text);
}

function stagePage(repo, scope, filename, frontmatter, body = 'body text.\n') {
  ensureContainedBranch(repo, scope);
  const dir = path.join(repo, '.superdev', 'kb-pending', scope);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), `---\n${frontmatter}\n---\n${body}`);
}

function call(argv, cwd) {
  const logged = [];
  const orig = console.log;
  console.log = (s) => logged.push(String(s));
  try {
    run(argv, cwd);
    return { ok: true, out: logged.join('\n') };
  } catch (e) {
    if (e.isRefusal) return { ok: false, err: e.message, out: logged.join('\n') };
    throw e;
  } finally {
    console.log = orig;
  }
}

// Isolate the fake backend's persistent state (and, where used, its env-capture directory) per
// scenario, restoring the ambient env afterwards.
function withState(fn) {
  const stateFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kb-state-')), 'state.json');
  const prevState = process.env.FAKE_KB_STATE_FILE;
  const prevCapture = process.env.FAKE_KB_CAPTURE_DIR;
  const prevTimeout = process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS;
  process.env.FAKE_KB_STATE_FILE = stateFile;
  delete process.env.FAKE_KB_CAPTURE_DIR;
  try {
    fn(stateFile);
  } finally {
    if (prevState === undefined) delete process.env.FAKE_KB_STATE_FILE;
    else process.env.FAKE_KB_STATE_FILE = prevState;
    if (prevCapture === undefined) delete process.env.FAKE_KB_CAPTURE_DIR;
    else process.env.FAKE_KB_CAPTURE_DIR = prevCapture;
    if (prevTimeout === undefined) delete process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS;
    else process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS = prevTimeout;
  }
}

// A `## Commands` doc where exactly one verb hangs past the bound and every other verb is the real
// fake backend. `sleep` is the cheapest fixture that reproduces a host which accepts the call and
// never answers — no socket, no listener, and nothing for the harness to tear down.
function hangingVerbDoc(backendLine, hangingVerb, verbs = ['find', 'read', 'create', 'update', 'delete']) {
  const sections = verbs
    .map((v) => {
      const cmd = v === hangingVerb ? 'sleep 30' : `node ${JSON.stringify(FAKE_BACKEND)} ${v}`;
      return `### ${v}\n\n\`\`\`sh\n${cmd}\n\`\`\``;
    })
    .join('\n\n');
  return `# Knowledge base\n\n## Configuration\n\n${backendLine}\n\n## Commands\n\n${sections}\n`;
}

// --- parseCommandsTemplates: resolution by heading name, never by position -------------------
{
  const section = '### update\n\n```sh\nUPDATE_CMD\n```\n\n### find\n\n```sh\nFIND_CMD\n```\n';
  const t = parseCommandsTemplates(section);
  assert.equal(t.find, 'FIND_CMD', 'find resolves by its own heading regardless of order');
  assert.equal(t.update, 'UPDATE_CMD', 'update resolves by its own heading regardless of order');
  assert.equal(t.create, undefined, 'a verb with no subsection is simply absent');
}

// --- parseStagedPage: frontmatter + quoting -----------------------------------------------------
{
  const p = parseStagedPage('---\ntitle: Plain title\naction: upsert\n---\nbody.\n');
  assert.equal(p.title, 'Plain title');
  assert.equal(p.action, 'upsert');
  assert.equal(p.body, 'body.\n');

  const tricky = 'a "quote", a $dollar, a `backtick`, and a\nnewline';
  const q = parseStagedPage(
    `---\ntitle: ${JSON.stringify(tricky)}\naction: upsert\n---\nb.\n`,
  );
  assert.equal(q.title, tricky, 'a double-quoted YAML scalar round-trips quotes/$/backtick/newline');
}

// --- classifyBackend ------------------------------------------------------------------------
{
  assert.equal(classifyBackend(null).kind, 'none', 'a missing knowledge-base doc reads as backend none');
  assert.equal(classifyBackend('- **Backend:** local file storage.\n').kind, 'local');
  assert.equal(classifyBackend('- **Backend:** none.\n').kind, 'none');
  assert.equal(
    classifyBackend('- **Backend:** Some Wiki.\n\nno commands section here\n').kind,
    'unconfigured',
    'a real backend with no ## Commands section is unconfigured, not local/none',
  );
  const b = classifyBackend(commandsDoc('- **Backend:** Some Wiki.'));
  assert.equal(b.kind, 'remote');
  assert.ok(b.templates.find && b.templates.create && b.templates.update && b.templates.delete);
}

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
  const readCmd = `node ${JSON.stringify(FAKE_BACKEND)} read`;
  const createCmd = `node ${JSON.stringify(FAKE_BACKEND)} create`;
  const updateCmd = `node ${JSON.stringify(FAKE_BACKEND)} update`;
  const deleteCmd = `node ${JSON.stringify(FAKE_BACKEND)} delete`;
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
  const readCmd = `node ${JSON.stringify(FAKE_BACKEND)} read`;
  const createCmd = `node ${JSON.stringify(FAKE_BACKEND)} create`;
  const updateCmd = `node ${JSON.stringify(FAKE_BACKEND)} update`;
  const deleteCmd = `node ${JSON.stringify(FAKE_BACKEND)} delete`;
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

// --- no ## Commands section: nothing published, refusal names /superdev:setup ----------------
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, '# Knowledge base\n\n## Configuration\n\n- **Backend:** Some Wiki, old style.\n');
  stagePage(repo, 'demo', 'p.md', 'title: P\naction: upsert');

  const res = call(['--scope', 'demo'], repo);
  assert.equal(res.ok, false);
  assert.match(res.err, /## Commands/);
  assert.match(res.err, /\/superdev:setup/);
  assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'p.md')), 'nothing is deleted on refusal');
});

// --- a local or none knowledge base: nothing published, nothing deleted, reason stated -------
for (const backendLine of ['- **Backend:** local file storage.', '- **Backend:** none.']) {
  withState(() => {
    const repo = makeRepo();
    writeKbDoc(repo, `# Knowledge base\n\n## Configuration\n\n${backendLine}\n`);
    stagePage(repo, 'demo', 'p.md', 'title: P\naction: upsert');

    const res = call(['--scope', 'demo'], repo);
    assert.equal(res.ok, false);
    assert.match(res.err, /nothing to publish/);
    assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'p.md')));
  });
}

// --- no knowledge-base doc at all reads the same as backend none -----------------------------
withState(() => {
  const repo = makeRepo();
  stagePage(repo, 'demo', 'p.md', 'title: P\naction: upsert');
  const res = call(['--scope', 'demo'], repo);
  assert.equal(res.ok, false);
  assert.match(res.err, /nothing to publish/);
});

// --- a declared verb the run needs but the config omits leaves that page staged with a reason ---
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', ['find'])); // no create/update/delete
  stagePage(repo, 'demo', 'p.md', 'title: Missing Verb Page\naction: upsert');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /left staged: Missing Verb Page — no create command configured/);
});

// --- more than one pending scope and no --scope: lists every scope with its page count -------
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'alpha', 'a.md', 'title: A\naction: upsert');
  stagePage(repo, 'beta', 'b1.md', 'title: B1\naction: upsert');
  stagePage(repo, 'beta', 'b2.md', 'title: B2\naction: upsert');

  const res = call([], repo);
  assert.equal(res.ok, false);
  assert.match(res.err, /alpha: 1 staged page/);
  assert.match(res.err, /beta: 2 staged pages/);
  assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'alpha', 'a.md')), 'nothing is published');
  assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'beta', 'b1.md')));
});

// --- --scope naming a slug with no staged pages says so and stops; an invalid slug names why ---
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'alpha', 'a.md', 'title: A\naction: upsert');

  const missing = call(['--scope', 'ghost'], repo);
  assert.equal(missing.ok, false);
  assert.match(missing.err, /no staged knowledge-base pages under scope "ghost"/);

  const invalid = call(['--scope', '-bad/slug'], repo);
  assert.equal(invalid.ok, false);
  assert.match(invalid.err, /scope-slug charset/);
});

// --- the literal _adhoc passes through as a scope slug without slug validation ----------------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, '_adhoc', 'p.md', 'title: Adhoc Page\naction: upsert');

  const res = call(['--scope', '_adhoc'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Adhoc Page'));
});

// --- no page body a backend returned appears anywhere in the report --------------------------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  fs.writeFileSync(
    stateFile,
    JSON.stringify({ 'Body Page': { id: 'id-9', body: 'SECRET LIVE BODY CONTENT' } }),
  );
  stagePage(repo, 'demo', 'body.md', 'title: Body Page\naction: upsert', 'STAGED BODY CONTENT\n');

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.ok(!res.out.includes('SECRET LIVE BODY CONTENT'));
  assert.ok(!res.out.includes('STAGED BODY CONTENT'));
});

// --- the merge check: a scope branch base does not contain refuses, naming the branch and why ---
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'notcontained', 'p.md', 'title: P\naction: upsert');
  // Diverge the branch from main: a commit only the branch carries, never merged into main.
  git(['checkout', '-q', 'feat/notcontained'], repo);
  fs.writeFileSync(path.join(repo, 'branch-only.txt'), 'x\n');
  git(['add', 'branch-only.txt'], repo);
  git(['commit', '-q', '-m', 'branch-only work'], repo);
  git(['checkout', '-q', 'main'], repo);

  const res = call(['--scope', 'notcontained'], repo);
  assert.equal(res.ok, false, 'a not-contained scope branch refuses rather than publishing');
  assert.match(res.err, /feat\/notcontained/, 'the refusal names the branch');
  assert.match(res.err, /not contained/, 'the refusal states what was found');
  assert.ok(
    fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'notcontained', 'p.md')),
    'nothing is published, and the staged page is not deleted',
  );
});

// --- --allow-unmerged publishes a not-contained scope, and the report records it as unmerged ----
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'override', 'p.md', 'title: Override Page\naction: upsert');
  git(['checkout', '-q', 'feat/override'], repo);
  fs.writeFileSync(path.join(repo, 'branch-only.txt'), 'x\n');
  git(['add', 'branch-only.txt'], repo);
  git(['commit', '-q', '-m', 'branch-only work'], repo);
  git(['checkout', '-q', 'main'], repo);

  const res = call(['--scope', 'override', '--allow-unmerged'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /published \(created\): Override Page/, '--allow-unmerged still publishes');
  assert.match(res.out, /unmerged/i, 'the report records that the scope was unmerged');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Override Page'));
});

// --- a contained scope publishes silently: no refusal, no unmerged note in the report -----------
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'clean', 'p.md', 'title: Clean Page\naction: upsert');

  const res = call(['--scope', 'clean'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.doesNotMatch(res.out, /unmerged/i, 'a contained scope carries no unmerged note');
});

// --- no branch resolves while a run root survives: refuses stating nothing resolved -------------
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  // Stage the page by hand, bypassing stagePage's helper, so no `feat/<scope>` branch is ever cut.
  const dir = path.join(repo, '.superdev', 'kb-pending', 'noresolve');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'p.md'), '---\ntitle: P\naction: upsert\n---\nbody.\n');
  // A surviving run root is what makes this the unreachable case rather than the reaped one: the run
  // died before it cut its branch, or an operator deleted the branch while it was still unmerged.
  fs.mkdirSync(path.join(repo, '.superdev', 'scopes', 'noresolve'), { recursive: true });

  const res = call(['--scope', 'noresolve'], repo);
  assert.equal(res.ok, false, 'a scope with no resolvable branch refuses');
  assert.match(res.err, /no branch resolved/, 'states nothing resolved');
  assert.doesNotMatch(res.err, /not contained/, 'never reads as a branch that simply has not landed yet');
  assert.ok(fs.existsSync(path.join(dir, 'p.md')), 'nothing is published or deleted');
});

// --- --allow-unmerged proceeds on an unresolvable branch too, not only a not-contained one -------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  const dir = path.join(repo, '.superdev', 'kb-pending', 'noresolve2');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'p.md'), '---\ntitle: Unresolvable Page\naction: upsert\n---\nbody.\n');
  fs.mkdirSync(path.join(repo, '.superdev', 'scopes', 'noresolve2'), { recursive: true });

  const res = call(['--scope', 'noresolve2', '--allow-unmerged'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.match(res.out, /unmerged/i);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Unresolvable Page'));
});

// --- neither branch nor run root survives: the reaped steady state publishes silently ------------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  // No branch is ever cut and no run root is written: `hooks/scope-prune.js` reaps both together, and
  // gates that reap on the branch already reading contained in base or gone (ADR 0071). So this is the
  // fully-reaped shipped scope, the steady state a publish meets — absence stands beside containment.
  const dir = path.join(repo, '.superdev', 'kb-pending', 'reaped');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'p.md'), '---\ntitle: Reaped Page\naction: upsert\n---\nbody.\n');

  const res = call(['--scope', 'reaped'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.doesNotMatch(res.out, /unmerged/i, 'a fully-reaped scope carries no unmerged note');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Reaped Page'));
});

// --- _adhoc publishes with no containment check performed at all, even with no base configured ---
withState((stateFile) => {
  const repo = makeRepo();
  fs.rmSync(path.join(repo, 'docs', 'agents', 'code-management.md'));
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, '_adhoc', 'p.md', 'title: Adhoc Page 2\naction: upsert');

  const res = call(['--scope', '_adhoc'], repo);
  assert.ok(res.ok, `expected success despite no base branch configured, got: ${res.err}`);
  assert.doesNotMatch(res.out, /unmerged/i, '_adhoc runs no containment check to report on');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Adhoc Page 2'));
});

// --- a scope whose run root is gone resolves its branch through the scan fallback ----------------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'gone', 'p.md', 'title: Gone Root Page\naction: upsert');
  const root = path.join(repo, '.superdev', 'scopes', 'gone');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'ledger.md'), '# Ledger\n\n**Branch:** feat/gone\n');
  // `hooks/scope-prune.js` reaps the whole run root well before most `publish-kb` runs happen — no
  // ledger.md survives to read, so resolution has to fall through to the shape scan, which still
  // finds this scope's `feat/gone` branch (cut by `stagePage`'s helper above).
  fs.rmSync(root, { recursive: true, force: true });

  const res = call(['--scope', 'gone'], repo);
  assert.ok(res.ok, `expected success via the scan fallback, got: ${res.err}`);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Gone Root Page'));
});

// --- the ledger's Branch line, once it verifies, is trusted ahead of the shape scan --------------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'ledgered', 'p.md', 'title: Ledgered Page\naction: upsert');
  const root = path.join(repo, '.superdev', 'scopes', 'ledgered');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'ledger.md'), '# Ledger\n\n**Branch:** feat/ledgered\n');

  const res = call(['--scope', 'ledgered'], repo);
  assert.ok(res.ok, `expected success via the ledger route, got: ${res.err}`);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Ledgered Page'));
});

// --- the ledger's Branch line is what gets tested, not merely consulted then discarded ------------
// The ledger names a branch that verifies AND is contained; a different branch also matches the
// shape scan for this scope, and it is NOT contained. An implementation that read the ledger but
// still fell through to the scan would refuse here — success proves the ledger's branch is the one
// `testContainment` actually ran against.
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'distinguish', 'p.md', 'title: Distinguish Page\naction: upsert'); // cuts feat/distinguish
  git(['branch', 'other/ledger-branch'], repo); // contained: same tip as main right now

  // Diverge the shape-scan candidate (feat/distinguish) from main, so the scan route would refuse.
  git(['checkout', '-q', 'feat/distinguish'], repo);
  fs.writeFileSync(path.join(repo, 'branch-only.txt'), 'x\n');
  git(['add', 'branch-only.txt'], repo);
  git(['commit', '-q', '-m', 'branch-only work'], repo);
  git(['checkout', '-q', 'main'], repo);

  const root = path.join(repo, '.superdev', 'scopes', 'distinguish');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'ledger.md'), '# Ledger\n\n**Branch:** other/ledger-branch\n');

  const res = call(['--scope', 'distinguish'], repo);
  assert.ok(res.ok, `expected success via the ledger's contained branch, got: ${res.err}`);
  assert.doesNotMatch(res.out, /unmerged/i, 'the ledger branch is contained, no override needed');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Distinguish Page'));
});

// --- a ledger Branch line naming a branch that was never cut falls back to the shape scan --------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'diedearly', 'p.md', 'title: Died Early Page\naction: upsert');
  const root = path.join(repo, '.superdev', 'scopes', 'diedearly');
  fs.mkdirSync(root, { recursive: true });
  // Run init wrote this line before cutting the branch; the run died before the branch existed.
  fs.writeFileSync(path.join(root, 'ledger.md'), '# Ledger\n\n**Branch:** feat/never-cut\n');

  const res = call(['--scope', 'diedearly'], repo);
  assert.ok(res.ok, `expected success via the scan fallback, got: ${res.err}`);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Died Early Page'));
});

// --- docs/agents/code-management.md with no base branch recorded refuses, never crashes ---------
withState(() => {
  const repo = makeRepo();
  fs.writeFileSync(path.join(repo, 'docs', 'agents', 'code-management.md'), '# Code host\n\nno base branch bullet here.\n');
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'nobase', 'p.md', 'title: P\naction: upsert');

  const res = call(['--scope', 'nobase'], repo);
  assert.equal(res.ok, false);
  assert.match(res.err, /no base branch/);
  assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'nobase', 'p.md')));
});

// --- an unfilled seed placeholder reads as "not configured", never as a literal base branch -------
withState(() => {
  const repo = makeRepo();
  fs.writeFileSync(
    path.join(repo, 'docs', 'agents', 'code-management.md'),
    '# Code host\n\n- **Base branch**: the branch the scope branch was cut from (default `main`).\n',
  );
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'placeholder', 'p.md', 'title: P\naction: upsert');

  const res = call(['--scope', 'placeholder'], repo);
  assert.equal(res.ok, false);
  assert.match(res.err, /no base branch/, 'names the real problem: nothing configured');
  assert.doesNotMatch(res.err, /not contained in/, 'never reads the unfilled sentence as a base branch');
  assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'placeholder', 'p.md')));
});

// --- parseBaseBranch also decodes the colon-outside-bold spelling both seed templates ship --------
{
  const base = parseBaseBranch('# Code host\n\n- **Base branch**: `develop`.\n');
  assert.equal(base, 'develop');
}

// --- that spelling drives containment too: the parsed value is what gets tested, not `main` -------
withState((stateFile) => {
  const repo = makeRepo();
  fs.writeFileSync(
    path.join(repo, 'docs', 'agents', 'code-management.md'),
    '# Code host\n\n- **Base branch**: `develop`.\n',
  );
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  // `develop` carries a commit `main` never gets; the scope branch is cut from `develop`'s tip, so
  // it is contained in `develop` and NOT in `main` — a pass here only happens if the parsed `develop`
  // value, not `main`, is what containment was tested against.
  git(['branch', 'develop'], repo);
  git(['checkout', '-q', 'develop'], repo);
  fs.writeFileSync(path.join(repo, 'develop-only.txt'), 'x\n');
  git(['add', 'develop-only.txt'], repo);
  git(['commit', '-q', '-m', 'develop-only work'], repo);
  git(['checkout', '-q', '-b', 'feat/altspell'], repo);
  git(['checkout', '-q', 'main'], repo);
  stagePage(repo, 'altspell', 'p.md', 'title: Alt Spelling Page\naction: upsert');

  const res = call(['--scope', 'altspell'], repo);
  assert.ok(res.ok, `expected success via the develop base, got: ${res.err}`);
  assert.doesNotMatch(res.out, /unmerged/i, 'contained in the configured base, no override needed');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Alt Spelling Page'));
});

// --- several branches matching the shape scan: no crash on the ambiguity, whichever one is picked --
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'multi', 'p.md', 'title: Multi Page\naction: upsert'); // cuts feat/multi
  git(['branch', 'fix/multi'], repo); // a second branch also matching the scan shape

  const res = call(['--scope', 'multi'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Multi Page'));
});

// --- parseRemote takes the first token of the `- **Remote:**` bullet, unlike parseBaseBranch's ------
// whitespace rejection: every shipped Remote bullet carries a trailing sentence.
{
  assert.equal(parseRemote('# Code host\n\n- **Remote:** `upstream`.\n'), 'upstream');
  assert.equal(parseRemote('# Code host\n\n- **Remote**: `upstream`.\n'), 'upstream', 'the colon-outside-bold spelling too');
  assert.equal(parseRemote('# Code host\n\nno remote bullet here.\n'), null, 'absent bullet -> null, not a refusal');
  assert.equal(
    parseRemote('# Code host\n\n- **Remote:** `origin`. Confirm with `git remote -v`.\n'),
    'origin',
    'the real shipped bullet shape (docs/agents/code-management.md and both seeds) carries a trailing sentence',
  );
  assert.equal(parseRemote(null), null);
}

// --- checkContainment's refetch uses the remote docs/agents/code-management.md names, not `origin` -
// The scope branch is NOT contained against local `main`, but IS contained against `main` on a remote
// named `other` (a host that squash-merged the work; the operator's clone has not pulled yet). No
// `origin` remote exists at all, so a refetch that (wrongly) defaults to `origin` cannot succeed —
// success here is only reachable by fetching the configured `other` remote. The Remote bullet below
// carries the trailing sentence every shipped one does ("Confirm with `git remote -v`.") rather than a
// bare token, which is exactly the shape that left the previous cycle's fix inert.
withState((stateFile) => {
  const repo = makeRepo();
  fs.writeFileSync(
    path.join(repo, 'docs', 'agents', 'code-management.md'),
    '# Code host\n\n- **Base branch:** `main`.\n- **Remote:** `other`. Confirm with `git remote -v`.\n',
  );
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));

  git(['checkout', '-q', '-b', 'feat/viaremote'], repo);
  fs.writeFileSync(path.join(repo, 'viaremote-only.txt'), 'x\n');
  git(['add', 'viaremote-only.txt'], repo);
  git(['commit', '-q', '-m', 'work on feat/viaremote'], repo);
  git(['checkout', '-q', 'main'], repo);

  const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-remote-'));
  git(['init', '-q', '--bare', '-b', 'main'], remoteDir);
  git(['remote', 'add', 'other', remoteDir], repo);
  git(['push', '-q', 'other', 'main'], repo);

  // Advance the remote's `main` past the scope branch's work (a squash merge), then roll the local
  // `main` back — local containment must fail, remote containment must succeed.
  git(['merge', '--squash', 'feat/viaremote'], repo);
  git(['commit', '-q', '-m', 'feat: viaremote (#1)'], repo);
  git(['push', '-q', 'other', 'main:main'], repo);
  git(['reset', '-q', '--hard', 'HEAD^'], repo);

  stagePage(repo, 'viaremote', 'p.md', 'title: Via Remote Page\naction: upsert');

  const res = call(['--scope', 'viaremote'], repo);
  assert.ok(res.ok, `expected success via the configured remote, got: ${res.err}`);
  assert.doesNotMatch(res.out, /unmerged/i, 'contained after fetching the configured remote, no override needed');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Via Remote Page'));
  fs.rmSync(remoteDir, { recursive: true, force: true });
});

// --- the real `### find` template in docs/agents/knowledge-base.md separates "genuinely absent"
// from a jq failure that is not absence, and refuses to answer 3 once its own listing hits its
// pagination ceiling. The runFind-level mapping (exit 3 -> absent, anything else -> unknown) is
// already pinned above (`find exited 5` and the JSON-array case) — this pins the template text
// itself, the thing that decides which of those exit codes a real find call actually produces.
{
  const realDoc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'agents', 'knowledge-base.md'), 'utf8');
  const findTemplate = classifyBackend(realDoc).templates.find;
  assert.ok(findTemplate, 'docs/agents/knowledge-base.md still configures a find template');

  // Stubs `curl` on PATH so the template runs against canned stdin instead of the real network.
  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curl-stub-'));
  fs.writeFileSync(path.join(stubDir, 'curl'), '#!/bin/sh\nprintf "%s" "$CURL_STUB_BODY"\n', { mode: 0o755 });

  function runFindTemplate(body) {
    return spawnSync('/bin/sh', ['-c', findTemplate], {
      env: {
        ...process.env,
        PATH: stubDir + path.delimiter + process.env.PATH,
        CURL_STUB_BODY: body,
        SUPERDEV_KB_TITLE: 'Missing Page',
        GITEA_TOKEN: 'x',
      },
      encoding: 'utf8',
    });
  }

  const notThere = runFindTemplate(JSON.stringify([{ title: 'Other Page', sub_url: 'x' }]));
  assert.equal(notThere.status, 3, 'a listing that plainly lacks the title answers absent (3)');

  const there = runFindTemplate(JSON.stringify([{ title: 'Missing Page', sub_url: 'missing-page' }]));
  assert.equal(there.status, 0, 'a listing that carries the title answers found (0)');
  assert.deepEqual(JSON.parse(there.stdout), { sub_url: 'missing-page' });

  const malformed = runFindTemplate('not json at all');
  assert.equal(malformed.status, 2, 'a jq parse failure is not absence — must answer 2, never 3');

  const atCeiling = JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ title: `Page ${i}`, sub_url: `s${i}` })));
  const ceilingHit = runFindTemplate(atCeiling);
  assert.equal(ceilingHit.status, 2, 'a listing at its own 50-entry ceiling must not answer absent either');

  fs.rmSync(stubDir, { recursive: true, force: true });
}

// --- the real `### find` template in plugin/references/knowledge-base-confluence.md separates -------
// "genuinely absent" from a JSON object that carries no `results` key at all: a 200 response like
// `{"message":"err"}` makes `.results` read `null` instead of erroring, so `.results | length` reads 0
// and `.results[0]` reads `null` — indistinguishable from a genuine empty-results absence unless the
// template checks for the key first.
{
  const confluenceDoc = fs.readFileSync(
    path.join(__dirname, '..', 'plugin', 'references', 'knowledge-base-confluence.md'),
    'utf8',
  );
  const findTemplate = classifyBackend(confluenceDoc).templates.find;
  assert.ok(findTemplate, 'the Confluence seed still configures a find template');

  // Stubs `curl` on PATH so the template runs against canned stdin instead of the real network.
  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curl-stub-'));
  fs.writeFileSync(path.join(stubDir, 'curl'), '#!/bin/sh\nprintf "%s" "$CURL_STUB_BODY"\n', { mode: 0o755 });

  function runFindTemplate(body) {
    return spawnSync('/bin/sh', ['-c', findTemplate], {
      env: {
        ...process.env,
        PATH: stubDir + path.delimiter + process.env.PATH,
        CURL_STUB_BODY: body,
        SUPERDEV_KB_TITLE: 'Missing Page',
        CONFLUENCE_EMAIL: 'x',
        CONFLUENCE_API_TOKEN: 'x',
      },
      encoding: 'utf8',
    });
  }

  const there = runFindTemplate(JSON.stringify({ results: [{ id: '123', version: { number: 5 } }] }));
  assert.equal(there.status, 0, 'a results array carrying a match answers found (0)');
  assert.deepEqual(JSON.parse(there.stdout), { id: '123', version: '5' });

  const notThere = runFindTemplate(JSON.stringify({ results: [] }));
  assert.equal(notThere.status, 3, 'an empty results array answers absent (3)');

  const malformed = runFindTemplate('not json at all');
  assert.equal(malformed.status, 2, 'a jq parse failure is not absence — must answer 2, never 3');

  const noResultsKey = runFindTemplate(JSON.stringify({ message: 'err' }));
  assert.equal(
    noResultsKey.status,
    2,
    'a 200 response carrying no "results" key cannot answer absent — it could not answer at all',
  );

  fs.rmSync(stubDir, { recursive: true, force: true });
}

// --- the real `### read` template in plugin/references/knowledge-base-confluence.md prints the -------
// live storage-format body on stdout (ADR 0094, INV-0091, triage #677), never JSON.
{
  const confluenceDoc = fs.readFileSync(
    path.join(__dirname, '..', 'plugin', 'references', 'knowledge-base-confluence.md'),
    'utf8',
  );
  const readTemplate = classifyBackend(confluenceDoc).templates.read;
  assert.ok(readTemplate, 'the Confluence seed configures a read template');

  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curl-stub-'));
  fs.writeFileSync(path.join(stubDir, 'curl'), '#!/bin/sh\nprintf "%s" "$CURL_STUB_BODY"\n', { mode: 0o755 });

  function runReadTemplate(body) {
    return spawnSync('/bin/sh', ['-c', readTemplate], {
      env: {
        ...process.env,
        PATH: stubDir + path.delimiter + process.env.PATH,
        CURL_STUB_BODY: body,
        SUPERDEV_KB_ID: '123',
        CONFLUENCE_EMAIL: 'x',
        CONFLUENCE_API_TOKEN: 'x',
      },
      encoding: 'utf8',
    });
  }

  const ok = runReadTemplate(JSON.stringify({ body: { storage: { value: '<p>Hi</p>' } } }));
  assert.equal(ok.status, 0, 'a response carrying body.storage.value answers 0');
  assert.equal(ok.stdout, '<p>Hi</p>\n', 'prints the live storage body on stdout, nothing else');

  const malformed = runReadTemplate('not json at all');
  assert.notEqual(malformed.status, 0, 'a jq parse failure must not answer 0 with no body');

  fs.rmSync(stubDir, { recursive: true, force: true });
}

// --- the time bound (ADR 0076) ------------------------------------------------------------------

// --- a find that never answers is killed at the bound, and its page stays staged -----------------
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, hangingVerbDoc('- **Backend:** Some Wiki.', 'find'));
  stagePage(repo, 'hang', 'p.md', 'title: Hung Page\naction: upsert');
  process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS = String(HANG_MS);

  const started = Date.now();
  const res = call(['--scope', 'hang'], repo);
  const elapsed = Date.now() - started;

  assert.ok(res.ok, `expected a report, got: ${res.err}`);
  assert.match(res.out, new RegExp(`left staged: Hung Page — find timed out after ${HANG_MS}ms`));
  // relative to the configured bound (AGENTS.md, ADR 0086), not an absolute ceiling
  assert.ok(elapsed < HANG_MS * 2, `expected the bound to end it, took ${elapsed}ms`);
  assert.ok(
    fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'hang', 'p.md')),
    'a timed-out page stays staged',
  );
});

// --- every verb is bounded, not just find --------------------------------------------------------
for (const verb of ['find', 'create', 'update', 'delete']) {
  withState((stateFile) => {
    const repo = makeRepo();
    writeKbDoc(repo, hangingVerbDoc('- **Backend:** Some Wiki.', verb));
    // `update` and `delete` need the page to already exist, so find locates it and routes there.
    if (verb === 'update' || verb === 'delete') {
      fs.writeFileSync(stateFile, JSON.stringify({ 'Verb Page': { id: 'id-0', body: 'old.\n' } }));
    }
    const action = verb === 'delete' ? 'delete' : 'upsert';
    const frontmatter = verb === 'update'
      ? `title: Verb Page\naction: ${action}\nlive-hash: ${hashBody('old.\n')}`
      : `title: Verb Page\naction: ${action}`;
    stagePage(repo, `verb-${verb}`, 'p.md', frontmatter);
    process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS = String(HANG_MS);

    const res = call(['--scope', `verb-${verb}`], repo);
    assert.ok(res.ok, `[${verb}] expected a report, got: ${res.err}`);
    assert.match(res.out, new RegExp(`left staged: Verb Page — ${verb} timed out after ${HANG_MS}ms`));
  });
}

// --- the read inside an action: patch is bounded on the same terms --------------------------------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, hangingVerbDoc('- **Backend:** Some Wiki.', 'read'));
  fs.writeFileSync(stateFile, JSON.stringify({ Aggregate: { id: 'id-0', body: '## A\n\nold.\n' } }));
  stagePage(repo, 'patchhang', 'aggregate--b.md', 'title: Aggregate\naction: patch', '## B\n\nnew.\n');
  process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS = String(HANG_MS);

  const res = call(['--scope', 'patchhang'], repo);
  assert.ok(res.ok, `expected a report, got: ${res.err}`);
  assert.match(res.out, new RegExp(`left staged: Aggregate — read timed out after ${HANG_MS}ms`));
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(state.Aggregate.body, '## A\n\nold.\n', 'a timed-out read overwrites nothing');
});

// --- the override parses: unset, empty, and unparseable all fall back to the 30s default ----------
{
  const { timeoutMs } = require(publishKbPath);
  const prev = process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS;
  try {
    delete process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS;
    assert.equal(timeoutMs(), 30000, 'unset uses the default');
    for (const bad of ['', '   ', 'soon', '0', '-5', '1.5e9x', 'NaN']) {
      process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS = bad;
      assert.equal(timeoutMs(), 30000, `"${bad}" falls back to the default rather than to no bound or a zero-length one`);
    }
    process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS = '250';
    assert.equal(timeoutMs(), 250, 'a positive integer overrides');
  } finally {
    if (prev === undefined) delete process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS;
    else process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS = prev;
  }
}

// --- a timeout stops the batch: the rest are named untried, staged, and never spawned -------------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, hangingVerbDoc('- **Backend:** Some Wiki.', 'find'));
  for (const t of ['Alpha', 'Bravo', 'Charlie']) {
    stagePage(repo, 'batch', `${t.toLowerCase()}.md`, `title: ${t}\naction: upsert`);
  }
  process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS = String(HANG_MS);

  const started = Date.now();
  const res = call(['--scope', 'batch'], repo);
  const elapsed = Date.now() - started;

  assert.ok(res.ok, `expected a report, got: ${res.err}`);
  assert.match(res.out, new RegExp(`timed out after ${HANG_MS}ms`));
  assert.match(res.out, /stopped after a timeout: 2 page\(s\) left untried/);
  assert.ok(elapsed < HANG_MS * 2, `expected roughly one bound, not one per page; took ${elapsed}ms`);
  for (const f of ['alpha.md', 'bravo.md', 'charlie.md']) {
    assert.ok(
      fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'batch', f)),
      `${f} stays staged`,
    );
  }
  assert.ok(!fs.existsSync(stateFile), 'the untried pages never reached the backend');
});

// --- a timeout inside a multi-page patch group stops the group, not just the sibling it hit --------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, hangingVerbDoc('- **Backend:** Some Wiki.', 'read', PATCH_VERBS));
  fs.writeFileSync(stateFile, JSON.stringify({ 'Combo Page': { id: 'id-1', body: '# Combo Page\n' } }));
  stagePage(repo, 'demo', 'combo--section-a.md', 'title: Combo Page\naction: patch', '## Section A\n\nfrom A.\n');
  stagePage(repo, 'demo', 'combo--section-b.md', 'title: Combo Page\naction: patch', '## Section B\n\nfrom B.\n');
  stagePage(repo, 'demo', 'combo--section-c.md', 'title: Combo Page\naction: patch', '## Section C\n\nfrom C.\n');
  process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS = String(HANG_MS);

  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-capture-'));
  process.env.FAKE_KB_CAPTURE_DIR = captureDir;
  let res;
  try {
    res = call(['--scope', 'demo'], repo);
  } finally {
    delete process.env.FAKE_KB_CAPTURE_DIR;
  }

  assert.ok(res.ok, `expected a report, got: ${res.err}`);
  assert.match(res.out, new RegExp(`left staged: Combo Page — read timed out after ${HANG_MS}ms`));
  assert.match(res.out, /left staged, never tried: combo--section-b\.md — the run stopped after a timeout/);
  assert.match(res.out, /left staged, never tried: combo--section-c\.md — the run stopped after a timeout/);
  assert.match(res.out, /stopped after a timeout: 2 page\(s\) left untried/);
  const findCalls = fs.readdirSync(captureDir).filter((f) => f.startsWith('find-'));
  assert.equal(
    findCalls.length,
    1,
    'a timeout on the first sibling must stop the group, not burn a bound per remaining sibling',
  );
  for (const f of ['combo--section-a.md', 'combo--section-b.md', 'combo--section-c.md']) {
    assert.ok(
      fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', f)),
      `${f} stays staged`,
    );
  }
});

// --- a spawn failure that is NOT a timeout still fails one page and lets the rest run -------------
withState((stateFile) => {
  const repo = makeRepo();
  // A `find` whose command cannot start at all: the shell exits nonzero, which is a per-page
  // failure and says nothing about the host, so the batch carries on to the next title.
  const doc = commandsDoc('- **Backend:** Some Wiki.').replace(
    `### find\n\n\`\`\`sh\nnode ${JSON.stringify(FAKE_BACKEND)} find\n\`\`\``,
    '### find\n\n```sh\nif [ "$SUPERDEV_KB_TITLE" = "Doomed" ]; then exit 9; fi\nexit 3\n```',
  );
  writeKbDoc(repo, doc);
  stagePage(repo, 'mixed', 'a-doomed.md', 'title: Doomed\naction: upsert');
  stagePage(repo, 'mixed', 'b-fine.md', 'title: Fine\naction: upsert');
  process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS = '5000';

  const res = call(['--scope', 'mixed'], repo);
  assert.ok(res.ok, `expected a report, got: ${res.err}`);
  assert.match(res.out, /left staged: Doomed — find exited 9/);
  assert.match(res.out, /published \(created\): Fine/);
  assert.doesNotMatch(res.out, /left untried/, 'a non-timeout failure stops nothing');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Fine'), 'the later page still published');
});

// --- a create killed after landing is recognised on retry by its own marker, and sent as an ------
// update (ADR 0076, ADR 0094, INV-0091): before publish-kb sends a hashless `create`, it writes a
// `created-by-publish` marker into the staged file, so a later run whose `find` locates the page
// the killed call already landed knows this is its own retry rather than someone else's page.
withState((stateFile) => {
  const repo = makeRepo();
  // First run: `create` hangs, but the page it was sending did land on the backend — the shape a
  // write killed in flight leaves behind. The staged file survives, marker and all, so the next
  // run retries it.
  const hanging = hangingVerbDoc('- **Backend:** Some Wiki.', 'create');
  writeKbDoc(repo, hanging);
  stagePage(repo, 'retry', 'p.md', 'title: Retried Page\naction: upsert', 'second body.\n');
  process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS = String(HANG_MS);
  const first = call(['--scope', 'retry'], repo);
  assert.match(first.out, new RegExp(`left staged: Retried Page — create timed out after ${HANG_MS}ms`));
  const stagedPath = path.join(repo, '.superdev', 'kb-pending', 'retry', 'p.md');
  assert.match(
    fs.readFileSync(stagedPath, 'utf8'),
    /created-by-publish: /,
    'the marker is written before the create call, so it survives the kill',
  );
  fs.writeFileSync(stateFile, JSON.stringify({ 'Retried Page': { id: 'id-0', body: 'landed anyway.\n' } }));

  // Second run against a healthy backend: find now locates the page the first run's killed create
  // landed. The staged file carries no live-hash, but does carry the marker, so the retry sends
  // `update` — no `read` call needed to tell the two cases apart.
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', ['find', 'create', 'update', 'delete']));
  const second = call(['--scope', 'retry'], repo);
  assert.ok(second.ok, `expected a report, got: ${second.err}`);
  assert.match(second.out, /published \(updated\): Retried Page/);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(state['Retried Page'].body, 'second body.\n', 'the retry lands the staged body via update');
  assert.ok(!fs.existsSync(stagedPath), 'a landed retry clears the staged file like any other publish');
});

// --- a second retry writes no second marker: the first attempt's own timestamp survives -----------
// (ADR 0076, ADR 0094). Every retry re-marks the staged file ahead of its own `create` call; without
// a presence check that appends a fresh `created-by-publish:` line on every attempt instead of leaving
// the first one alone.
withState(() => {
  const repo = makeRepo();
  const hanging = hangingVerbDoc('- **Backend:** Some Wiki.', 'create');
  writeKbDoc(repo, hanging);
  stagePage(repo, 'retry-twice', 'p.md', 'title: Retried Twice\naction: upsert', 'body.\n');
  process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS = String(HANG_MS);
  const stagedPath = path.join(repo, '.superdev', 'kb-pending', 'retry-twice', 'p.md');

  call(['--scope', 'retry-twice'], repo);
  const afterFirst = fs.readFileSync(stagedPath, 'utf8');
  const markers = (t) => t.match(/created-by-publish: \S+/g) || [];
  assert.equal(markers(afterFirst).length, 1, 'the first attempt writes exactly one marker');

  call(['--scope', 'retry-twice'], repo);
  const afterSecond = fs.readFileSync(stagedPath, 'utf8');
  assert.equal(markers(afterSecond).length, 1, 'the second attempt writes no second marker');
  assert.deepEqual(markers(afterSecond), markers(afterFirst), 'the marker keeps the first attempt\'s own timestamp');
});

// --- a create that failed without landing, then retried: the page is absent, so the retry -------
// creates rather than sending an update meant for a page that never existed.
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', ['find', 'create', 'update', 'delete']));
  stagePage(repo, 'retry-absent', 'p.md', 'title: Never Landed\naction: upsert', 'body.\n');

  const res = call(['--scope', 'retry-absent'], repo);
  assert.ok(res.ok, `expected a report, got: ${res.err}`);
  assert.match(res.out, /published \(created\): Never Landed/);
});

// --- a hashless upsert with no marker on an existing page is still refused -----------------------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', ['find', 'read', 'create', 'update', 'delete']));
  fs.writeFileSync(stateFile, JSON.stringify({ 'Someone Elses Page': { id: 'id-0', body: 'their body.\n' } }));
  stagePage(repo, 'no-marker', 'p.md', 'title: Someone Elses Page\naction: upsert', 'my body.\n');

  const res = call(['--scope', 'no-marker'], repo);
  assert.ok(res.ok, `expected a report, got: ${res.err}`);
  assert.match(res.out, /left staged: Someone Elses Page — no live-hash recorded for an existing page/);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(state['Someone Elses Page'].body, 'their body.\n', 'the refused upsert leaves the live page untouched');
});

// --- a recorded live-hash is checked even under a `created-by-publish` marker (ADR 0094): a stale --
// marker never overrides a live-hash that sits in the same frontmatter. The marker applies only
// where no live-hash is recorded.
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', ['find', 'read', 'create', 'update', 'delete']));
  fs.writeFileSync(stateFile, JSON.stringify({ 'Marked And Hashed Page': { id: 'id-0', body: 'changed live body.\n' } }));
  stagePage(
    repo,
    'marker-and-hash',
    'p.md',
    `title: Marked And Hashed Page\naction: upsert\ncreated-by-publish: 2020-01-01T00:00:00.000Z\nlive-hash: ${hashBody('stale body.\n')}`,
    'my body.\n',
  );

  const res = call(['--scope', 'marker-and-hash'], repo);
  assert.ok(res.ok, `expected a report, got: ${res.err}`);
  assert.match(res.out, /left staged: Marked And Hashed Page — the live page has changed since this page was staged \(live-hash mismatch\)/);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(state['Marked And Hashed Page'].body, 'changed live body.\n', 'the refused upsert leaves the live page untouched');
});

// --- a marker retry works against a backend with no `read` verb at all ---------------------------
withState((stateFile) => {
  const repo = makeRepo();
  // No `read` verb configured at all — a marker retry needs none, unlike the live-hash guard.
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', ['find', 'create', 'update']));
  stagePage(repo, 'retry-noread', 'p.md', 'title: No Read Backend Page\naction: upsert', 'second.\n');
  const hangingCreate = hangingVerbDoc('- **Backend:** Some Wiki.', 'create', ['find', 'create', 'update']);
  writeKbDoc(repo, hangingCreate);
  process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS = String(HANG_MS);
  call(['--scope', 'retry-noread'], repo);
  fs.writeFileSync(stateFile, JSON.stringify({ 'No Read Backend Page': { id: 'id-0', body: 'landed anyway.\n' } }));

  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', ['find', 'create', 'update']));
  const res = call(['--scope', 'retry-noread'], repo);
  assert.ok(res.ok, `expected a report, got: ${res.err}`);
  assert.match(res.out, /published \(updated\): No Read Backend Page/);
});

// --- an fs error writing the retry marker leaves the page staged and sends no create -------------
// (the marker is written through a temp file and rename, the way scope.js writes its ledger; a
// staging directory that cannot be written to at all reproduces that failure without touching the
// staged file's own permissions).
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', ['find', 'create', 'update']));
  stagePage(repo, 'marker-write-fails', 'p.md', 'title: Unwritable Marker Page\naction: upsert', 'body.\n');
  const scopeDir = path.join(repo, '.superdev', 'kb-pending', 'marker-write-fails');
  fs.chmodSync(scopeDir, 0o555);
  try {
    const res = call(['--scope', 'marker-write-fails'], repo);
    assert.ok(res.ok, `expected a report, got: ${res.err}`);
    assert.match(res.out, /left staged: Unwritable Marker Page — could not write the retry marker/);
  } finally {
    fs.chmodSync(scopeDir, 0o755);
  }
  assert.ok(
    fs.existsSync(path.join(scopeDir, 'p.md')),
    'the page stays staged when the marker cannot be written',
  );
});

// --- the --read entry (ADR 0094): finds and reads one page, writes nothing --------------------

// --- an existing page prints its body and a hash; the read call writes nothing, moves nothing --
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', ['find', 'read', 'create', 'update', 'delete']));
  fs.writeFileSync(stateFile, JSON.stringify({ 'Read Page': { id: 'id-1', body: 'live body.\n' } }));

  const res = call(['--read', 'Read Page'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  const out = JSON.parse(res.out);
  assert.equal(out.title, 'Read Page');
  assert.equal(out.exists, true);
  assert.equal(out.body, 'live body.\n');
  assert.equal(out.hash, hashBody('live body.\n'));
  assert.equal(
    JSON.parse(fs.readFileSync(stateFile, 'utf8'))['Read Page'].body,
    'live body.\n',
    'the read entry never writes to the backend',
  );
});

// --- two reads of an unchanged page agree, even across a CRLF/trailing-newline difference -------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', ['find', 'read', 'create', 'update', 'delete']));
  fs.writeFileSync(stateFile, JSON.stringify({ 'Stable Page': { id: 'id-1', body: 'line one.\nline two.\n' } }));
  const first = JSON.parse(call(['--read', 'Stable Page'], repo).out);

  fs.writeFileSync(stateFile, JSON.stringify({ 'Stable Page': { id: 'id-1', body: 'line one.\r\nline two.' } }));
  const second = JSON.parse(call(['--read', 'Stable Page'], repo).out);

  assert.equal(first.hash, second.hash, 'a CRLF and trailing-newline difference alone does not change the hash');
});

// --- a page find does not find reads as not existing, and that is success, not a refusal --------
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', ['find', 'read', 'create', 'update', 'delete']));

  const res = call(['--read', 'Missing Page'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  const out = JSON.parse(res.out);
  assert.equal(out.title, 'Missing Page');
  assert.equal(out.exists, false);
});

// --- a backend with no read command refuses the read entry, naming why --------------------------
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.', ['find', 'create', 'update', 'delete']));

  const res = call(['--read', 'Any Page'], repo);
  assert.equal(res.ok, false);
  assert.match(res.err, /no read command configured/);
});

// --- a `none` backend refuses the read entry, naming why ------------------------------------------
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, '# Knowledge base\n\n## Configuration\n\n- **Backend:** none.\n');

  const res = call(['--read', 'Any Page'], repo);
  assert.equal(res.ok, false);
  assert.match(res.err, /nothing to publish/);
});

// --- a `local` backend refuses the read entry, naming why -----------------------------------------
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, '# Knowledge base\n\n## Configuration\n\n- **Backend:** local file storage.\n');

  const res = call(['--read', 'Any Page'], repo);
  assert.equal(res.ok, false);
  assert.match(res.err, /nothing to publish/);
});

// --- a failed read call refuses the read entry, naming why ---------------------------------------
withState(() => {
  const repo = makeRepo();
  const doc = `# KB\n\n## Configuration\n\n- **Backend:** Flaky Wiki.\n\n## Commands\n\n### find\n\n\`\`\`sh\necho '{"id": "id-1"}'\n\`\`\`\n\n### read\n\n\`\`\`sh\nexit 7\n\`\`\`\n`;
  writeKbDoc(repo, doc);

  const res = call(['--read', 'Flaky Page'], repo);
  assert.equal(res.ok, false);
  assert.match(res.err, /read exited 7/);
});

// --- an exhausted bound refuses the read entry, naming the timeout --------------------------------
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, hangingVerbDoc('- **Backend:** Some Wiki.', 'read', ['find', 'read']));
  fs.writeFileSync(stateFile, JSON.stringify({ 'Hung Page': { id: 'id-1', body: 'x.\n' } }));
  process.env.SUPERDEV_PUBLISH_KB_TIMEOUT_MS = String(HANG_MS);

  const res = call(['--read', 'Hung Page'], repo);
  assert.equal(res.ok, false);
  assert.match(res.err, new RegExp(`read timed out after ${HANG_MS}ms`));
});

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

console.log('publish-kb.test.js: all assertions passed');
