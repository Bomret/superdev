'use strict';

// Suite for plugin/scripts/publish-kb.js: backend configuration refusals and scope selection — a
// missing `## Commands` section, a local or none backend, a missing verb, the pending-scope listing,
// the `--scope` argument, and the report's body-free text. Shared fixtures live in
// tests/publish-kb-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, commandsDoc, writeKbDoc, stagePage, call, withState } = require('./publish-kb-setup');

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

console.log('publish-kb-scope.test.js: all assertions passed');
