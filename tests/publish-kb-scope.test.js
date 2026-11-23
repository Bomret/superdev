'use strict';

// Suite for plugin/scripts/publish-kb.js: backend configuration refusals and scope selection — a
// missing `## Commands` section, a local or none backend, a missing verb, the pending-scope listing (a plain file in the
// staging root and a page-less scope folder left out, a staging root that cannot be read refused),
// the `--scope` argument, an argument publish-kb does not take, and the report's body-free text. Shared fixtures live in
// tests/publish-kb-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { makeRepo, commandsDoc, writeKbDoc, stagePage, call, withState, withCapture } = require('./publish-kb-setup');

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

// --- a plain file in the staging root and a scope folder holding no page are not listed: one real scope still resolves on its own
for (const [label, put] of [
  ['a plain file in the staging root', (root) => fs.writeFileSync(path.join(root, 'notes.txt'), 'x\n')],
  ['a scope folder holding no page', (root) => {
    fs.mkdirSync(path.join(root, 'empty'));
    fs.writeFileSync(path.join(root, 'empty', 'notes.txt'), 'x\n');
  }],
]) {
  withState((stateFile) => {
    const repo = makeRepo();
    writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
    stagePage(repo, 'demo', 'p.md', 'title: Demo Page\naction: upsert');
    put(path.join(repo, '.superdev', 'kb-pending'));
    const res = call([], repo);
    assert.ok(res.ok, `${label}: the one real scope resolves, got: ${res.err}`);
    assert.ok(Object.hasOwn(JSON.parse(fs.readFileSync(stateFile, 'utf8')), 'Demo Page'), `${label}: the real scope's page is published`);
  });
}

// --- a page-less scope folder alone reports no staged pages; a staging root that is a plain file refuses naming its code ----------
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  fs.mkdirSync(path.join(repo, '.superdev', 'kb-pending', 'empty'), { recursive: true });
  const alone = call([], repo);
  assert.equal(alone.ok, false);
  assert.match(alone.err, /No staged knowledge-base pages in this repo\./, 'a page-less scope folder alone counts as no staged pages');

  fs.rmSync(path.join(repo, '.superdev', 'kb-pending'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.superdev', 'kb-pending'), 'x\n');
  const unreadable = call([], repo);
  assert.equal(unreadable.ok, false);
  assert.match(unreadable.err, /kb-pending cannot be read \(ENOTDIR\)/, 'a staging root that is a plain file refuses naming its code');
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

// --- the CLI refuses a --read or --scope with no value, and a knowledge-base.md it cannot read ------
// A spawned `node publish-kb.js` is the only place the exit status and the stderr line show.
{
  const { spawnSync } = require('node:child_process');
  const { assertSpawnDecided } = require('./spawn-verdict');
  const { publishKbPath } = require('./publish-kb-setup');
  const cli = (repo, ...args) => {
    const r = spawnSync('node', [publishKbPath, ...args], { cwd: repo, encoding: 'utf8', timeout: 60000 });
    assertSpawnDecided(r, `publish-kb ${args.join(' ')}`);
    return r;
  };
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'demo', 'p.md', 'title: P\naction: upsert');
  const staged = path.join(repo, '.superdev', 'kb-pending', 'demo', 'p.md');

  for (const [args, message] of [
    [['--read'], 'publish-kb: --read needs a title\nusage: node publish-kb.js'],
    [['--scope'], 'publish-kb: --scope needs a value\nusage: node publish-kb.js'],
    [['extra'], 'publish-kb: unrecognized argument "extra"\nusage: node publish-kb.js'],
  ]) {
    const r = cli(repo, ...args);
    assert.equal(r.status, 1, `${args} exits 1`);
    assert.ok(r.stderr.startsWith(message), `${args} names the refusal and the usage on stderr: ${r.stderr}`);
    assert.equal(r.stdout, '', `${args} prints nothing`);
    assert.ok(fs.existsSync(staged), `${args} leaves the page staged`);
  }

  // a knowledge-base.md that is not readable for a reason other than ENOENT is no refusal: it throws
  fs.rmSync(path.join(repo, 'docs', 'agents', 'knowledge-base.md'));
  fs.mkdirSync(path.join(repo, 'docs', 'agents', 'knowledge-base.md'));
  const r = cli(repo, '--scope', 'demo');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /EISDIR/);
  assert.equal(r.stdout, '');
  assert.ok(fs.existsSync(staged), 'the page stays staged');
}

// --- an argument publish-kb does not take: refused with the usage, nothing published -----------
for (const argv of [['--allow-unmerge'], ['extra'], ['--scope']]) {
  withCapture((stateFile, dir) => {
    const repo = makeRepo();
    writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
    stagePage(repo, 'demo', 'p.md', 'title: P\naction: upsert');

    const res = call(argv, repo);
    assert.equal(res.ok, false, `${argv.join(' ')} refuses`);
    assert.match(res.err, /usage: node publish-kb\.js/, `${argv.join(' ')} names the usage: ${res.err}`);
    assert.deepEqual(fs.existsSync(dir) ? fs.readdirSync(dir) : [], [], `${argv.join(' ')} calls no backend verb`);
    assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'p.md')), 'the page stays staged');
  });
}

console.log('publish-kb-scope.test.js: all assertions passed');
