'use strict';

// Suite for plugin/scripts/publish-kb.js: the time bound (ADR 0130) and the retry marker a create
// writes before it runs. The suite times its own healthy backend spawn and derives its hang bound
// from it (`hangBound()` in tests/publish-kb-setup.js, AGENTS.md, ADR 0086).

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  publishKbPath,
  shq,
  FAKE_BACKEND,
  HUNG_CEILING_MS,
  hangBound,
  makeRepo,
  commandsDoc,
  writeKbDoc,
  stagePage,
  call,
  withState,
  hangingVerbDoc,
  failingVerbDoc,
} = require('./publish-kb-setup');
const { hashBody } = require(publishKbPath);

// The bound every hanging-verb block below runs under, taken from this run's own healthy spawns.
const HANG_MS = hangBound();

const PATCH_VERBS = ['find', 'read', 'create', 'update', 'delete'];

// --- the time bound (ADR 0130) ------------------------------------------------------------------

// --- every verb is bounded: find is bounded in the batch case below, the rest here -------------
for (const verb of ['create', 'update', 'delete']) {
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

    const started = Date.now();
    const res = call(['--scope', `verb-${verb}`], repo);
    const elapsed = Date.now() - started;
    assert.ok(res.ok, `[${verb}] expected a report, got: ${res.err}`);
    assert.match(res.out, new RegExp(`left staged: Verb Page — ${verb} timed out after ${HANG_MS}ms`));
    // relative to the configured bound (AGENTS.md, ADR 0086), not an absolute ceiling
    assert.ok(elapsed < HUNG_CEILING_MS, `[${verb}] expected the bound to end it, took ${elapsed}ms`);
    assert.ok(
      fs.existsSync(path.join(repo, '.superdev', 'kb-pending', `verb-${verb}`, 'p.md')),
      `[${verb}] a timed-out page stays staged`,
    );
  });
}

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
  assert.match(res.out, new RegExp(`left staged: Alpha — find timed out after ${HANG_MS}ms`), 'the hung find is killed at the bound');
  assert.match(res.out, /stopped after a timeout: 2 page\(s\) left untried/);
  assert.ok(elapsed < HUNG_CEILING_MS, `expected the bound to end the batch; took ${elapsed}ms`);
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
  assert.equal(
    JSON.parse(fs.readFileSync(stateFile, 'utf8'))['Combo Page'].body,
    '# Combo Page\n',
    'a timed-out read overwrites nothing',
  );
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
    `### find\n\n\`\`\`sh\nnode ${shq(FAKE_BACKEND)} find\n\`\`\``,
    '### find\n\n```sh\nif [ "$SUPERDEV_KB_TITLE" = "Doomed" ]; then exit 9; fi\nexit 3\n```',
  );
  writeKbDoc(repo, doc);
  stagePage(repo, 'mixed', 'a-doomed.md', 'title: Doomed\naction: upsert');
  stagePage(repo, 'mixed', 'b-fine.md', 'title: Fine\naction: upsert');

  const res = call(['--scope', 'mixed'], repo);
  assert.ok(res.ok, `expected a report, got: ${res.err}`);
  assert.match(res.out, /left staged: Doomed — find exited 9/);
  assert.match(res.out, /published \(created\): Fine/);
  assert.doesNotMatch(res.out, /left untried/, 'a non-timeout failure stops nothing');
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.ok(Object.hasOwn(state, 'Fine'), 'the later page still published');
});

// --- a create killed after landing is recognised on retry by its own marker, and sent as an ------
// update (ADR 0130, ADR 0094, INV-0091): before publish-kb sends a hashless `create`, it writes a
// `created-by-publish` marker into the staged file, so a later run whose `find` locates the page
// the killed call already landed knows this is its own retry rather than someone else's page.
withState((stateFile) => {
  const repo = makeRepo();
  // First run: `create` fails, but the page it was sending did land on the backend — the shape a
  // write that died in flight leaves behind. The staged file survives, marker and all, so the next
  // run retries it.
  writeKbDoc(repo, failingVerbDoc('- **Backend:** Some Wiki.', 'create'));
  stagePage(repo, 'retry', 'p.md', 'title: Retried Page\naction: upsert', 'second body.\n');
  const first = call(['--scope', 'retry'], repo);
  assert.match(first.out, /left staged: Retried Page — create exited 1/);
  const stagedPath = path.join(repo, '.superdev', 'kb-pending', 'retry', 'p.md');
  assert.match(
    fs.readFileSync(stagedPath, 'utf8'),
    /created-by-publish: /,
    'the marker is written before the create call, so it survives the failure',
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
// (ADR 0130, ADR 0094). Every retry re-marks the staged file ahead of its own `create` call; without
// a presence check that appends a fresh `created-by-publish:` line on every attempt instead of leaving
// the first one alone.
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, failingVerbDoc('- **Backend:** Some Wiki.', 'create'));
  // A staged file a first attempt already marked: the retry must leave that timestamp alone.
  const marker = 'created-by-publish: 2020-01-01T00:00:00.000Z';
  stagePage(repo, 'retry-twice', 'p.md', `title: Retried Twice\naction: upsert\n${marker}`, 'body.\n');
  const stagedPath = path.join(repo, '.superdev', 'kb-pending', 'retry-twice', 'p.md');

  const res = call(['--scope', 'retry-twice'], repo);
  assert.match(res.out, /left staged: Retried Twice — create exited 1/);
  const after = fs.readFileSync(stagedPath, 'utf8');
  assert.equal((after.match(/created-by-publish: \S+/g) || []).length, 1, 'the retry writes no second marker');
  assert.ok(after.includes(marker), 'the marker keeps the first attempt\'s own timestamp');
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
  writeKbDoc(repo, failingVerbDoc('- **Backend:** Some Wiki.', 'create', ['find', 'create', 'update']));
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

console.log('publish-kb-timeout.test.js: all assertions passed');
