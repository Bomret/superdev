'use strict';

// Suite for plugin/scripts/publish-kb.js: the `--read <title>` entry (ADR 0094) — it finds and reads
// one page, writes nothing, and refuses with the reason. The bounded-read case times its own healthy
// backend spawn and derives its hang bound from it (`hangBound()` in tests/publish-kb-setup.js,
// AGENTS.md, ADR 0086).

const assert = require('node:assert');
const fs = require('node:fs');
const { publishKbPath, hangBound, makeRepo, commandsDoc, writeKbDoc, call, withState, hangingVerbDoc } = require('./publish-kb-setup');
const { hashBody } = require(publishKbPath);

// The bound the read-timeout case below runs under, taken from this run's own healthy spawns.
const HANG_MS = hangBound();

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

console.log('publish-kb-read.test.js: all assertions passed');
