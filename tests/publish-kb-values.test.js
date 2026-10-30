'use strict';

// Suite for plugin/scripts/publish-kb.js: the values file every backend command takes as `$1` (ADR 0207, INV-0180).
// A staged title reaches the backend byte for byte, the file is private and gone after every kind of spawn, the
// operator's `knowledge-base` section rides in it, and a command that still names the old variables is refused
// before any backend call.

require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { shq, FAKE_BACKEND, hangBound, makeRepo, commandsDoc, writeKbDoc, stagePage, call, withState, withCapture, captures, setKbTimeout, writeOperatorConfig, hangingVerbDoc, failingVerbDoc, linksDoc } = require('./publish-kb-setup');

const HANG_MS = hangBound();
const staged = (repo, f) => fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', f));

// --- a title holding $(...), quotes, or a newline reaches the backend byte for byte and runs nothing ---
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  const ran = path.join(repo, 'ran');
  const title = `A $(touch ${ran}) \`touch ${ran}\` 'single' "double"\nsecond line`;
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'demo', 'hostile.md', `title: ${JSON.stringify(title)}\naction: upsert`);

  const res = call(['--scope', 'demo'], repo);
  assert.ok(res.ok, `expected success, got: ${res.err}`);
  assert.equal(fs.existsSync(ran), false, 'no shell code in a title runs');
  for (const verb of ['find', 'create']) assert.equal(captures(dir, verb)[0].values.title, title, `${verb} receives the title byte for byte`);
  assert.ok(Object.hasOwn(JSON.parse(fs.readFileSync(stateFile, 'utf8')), title), 'the page landed under that title');
});

// --- the values file is private, outside the repository, and gone afterwards; it carries the operator section ---
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeOperatorConfig(repo, { 'knowledge-base': { timeoutMs: 600000, teaLogin: 'me' } });
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'demo', 'a.md', 'title: A\naction: upsert');

  assert.ok(call(['--scope', 'demo'], repo).ok);
  const seen = ['find', 'create'].map((v) => captures(dir, v)[0]);
  for (const c of seen) {
    assert.equal(c.mode, 0o600, 'only the operator can read the file');
    assert.ok(c.valuesFile.startsWith(os.tmpdir()), 'the file lives outside the repository');
    assert.equal(fs.existsSync(c.valuesFile), false, 'the file is gone after a successful spawn');
    assert.deepEqual(c.values.operator, { timeoutMs: 600000, teaLogin: 'me' }, 'the knowledge-base section rides in the file');
  }
  assert.deepEqual(Object.keys(seen[1].values).sort(), ['bodyFile', 'operator', 'title'], 'create carries title, bodyFile, operator, and no parentId without a parent');
});

// --- with no knowledge-base section, operator is {} ---------------------------------------------------
withCapture((stateFile, dir) => {
  const repo = makeRepo();
  writeOperatorConfig(repo, {});
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'demo', 'a.md', 'title: A\naction: upsert');
  assert.ok(call(['--scope', 'demo'], repo).ok);
  assert.deepEqual(captures(dir, 'find')[0].values.operator, {});
});

// --- the file is gone after a failing and after a timed-out command ----------------------------------------
for (const [what, doc, bound] of [
  ['failing', (rec) => failingVerbDoc('- **Backend:** Some Wiki.', 'find'), undefined],
  ['timed-out', (rec) => hangingVerbDoc('- **Backend:** Some Wiki.', 'find'), HANG_MS],
]) {
  withState(() => {
    const repo = makeRepo();
    if (bound) setKbTimeout(repo, bound);
    const rec = path.join(repo, 'values-path');
    const text = doc(rec);
    writeKbDoc(repo, text.replace(/exit 1|exec sleep 900/, (hung) => `printf '%s' "$1" > ${shq(rec)}; ${hung}`));
    stagePage(repo, 'demo', 'a.md', 'title: A\naction: upsert');
    const res = call(['--scope', 'demo'], repo);
    assert.ok(res.ok, `expected a report, got: ${res.err}`);
    assert.match(res.out, /left staged: A/);
    const valuesFile = fs.readFileSync(rec, 'utf8');
    assert.ok(valuesFile.length > 0, `${what}: the command saw its file`);
    assert.equal(fs.existsSync(valuesFile), false, `${what}: the file is gone`);
  });
}

// --- a command that still names the old variables is refused before any backend call -----------------------
const OLD = 'SUPERDEV_KB_';
function oldContractCase(label, doc, run) {
  withCapture((stateFile, dir) => {
    const repo = makeRepo();
    writeKbDoc(repo, doc);
    stagePage(repo, 'demo', 'a.md', 'title: A\naction: upsert');
    stagePage(repo, 'demo', 'b.md', 'title: B\naction: upsert');
    const res = run(repo);
    assert.equal(res.ok, false, `${label}: refused (nonzero exit)`);
    assert.match(res.err, new RegExp(OLD), `${label}: names the old variables`);
    assert.match(res.err, /\/superdev:setup/, `${label}: names /superdev:setup`);
    assert.equal(captures(dir, 'find').length + captures(dir, 'create').length, 0, `${label}: no backend call`);
    assert.ok(!fs.existsSync(stateFile), `${label}: nothing published`);
    assert.ok(staged(repo, 'a.md') && staged(repo, 'b.md'), `${label}: every staged page kept`);
  });
}
const stale = (verb) => commandsDoc('- **Backend:** Some Wiki.', ['find', 'read', 'create', 'update', 'delete']).replace(
  new RegExp(`(### ${verb}\\n\\n\`\`\`sh\\n)`),
  `$1: "$${OLD}TITLE"\n`,
);
for (const verb of ['find', 'read', 'create', 'update', 'delete']) {
  oldContractCase(`publish, old ${verb}`, stale(verb), (repo) => call(['--scope', 'demo'], repo));
}
oldContractCase('--read', stale('read'), (repo) => call(['--read', 'A'], repo));
// the parent-link edit runs `read` and `update` on the parent; a stale `update` stops the whole publish before it
oldContractCase('parent-link edit', linksDoc().replace('### update\n\n```sh\n', `### update\n\n\`\`\`sh\n: "$${OLD}ID"\n`), (repo) => call(['--scope', 'demo'], repo));

console.log('publish-kb-values.test.js: all assertions passed');
