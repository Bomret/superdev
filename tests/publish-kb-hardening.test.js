'use strict';

// Suite for plugin/scripts/publish-kb.js and its lib/kb-*.js modules: refusal on an unreadable input file, the containment refetch
// bound, report sanitizing, and the one frontmatter splitter. Shared fixtures live in tests/publish-kb-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { publishKbPath, git, makeRepo, commandsDoc, writeKbDoc, stagePage, call, withState, writeOperatorConfig } = require('./publish-kb-setup');
const { parseStagedPage } = require(publishKbPath);
const { markStagedCreate, restageLiveHash } = require('../plugin/lib/kb-staged-page.js');
const { renderReport } = require('../plugin/lib/kb-report.js');
const { merge } = require('../plugin/lib/md-sections.js');

// --- an unreadable input refuses with one line and publishes nothing ---------------------------
for (const name of ['knowledge-base.md', 'code-management.md']) {
  withState((stateFile) => {
    const repo = makeRepo();
    writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
    stagePage(repo, 'demo', 'p.md', 'title: P\naction: upsert');
    const target = path.join(repo, 'docs', 'agents', name);
    fs.rmSync(target, { force: true });
    fs.mkdirSync(target);
    if (name !== 'knowledge-base.md') writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
    const res = call(['--scope', 'demo'], repo);
    assert.equal(res.ok, false, `${name} that is a directory refuses`);
    assert.match(res.err, new RegExp(`${name} cannot be read \\(EISDIR\\)`), 'one line naming the file and code');
    assert.equal(res.err.includes('\n'), false, 'one line');
    assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'p.md')), 'the staged page stays');
    assert.ok(!fs.existsSync(stateFile), 'nothing published');
  });
}
withState((stateFile) => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'demo', 'p.md', 'title: P\naction: upsert');
  const target = path.join(repo, 'docs', 'agents', 'code-management.md');
  fs.rmSync(target, { force: true });
  fs.mkdirSync(target);
  const res = call(['--scope', 'demo', '--allow-unmerged'], repo);
  assert.equal(res.ok, false, '--allow-unmerged does not override an unreadable code-management.md');
  assert.match(res.err, /code-management\.md cannot be read \(EISDIR\)/, 'the refusal names the file');
  assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'p.md')), 'the staged page stays');
  assert.ok(!fs.existsSync(stateFile), 'nothing published');
});
withState(() => {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, 'demo', 'p.md', 'title: P\naction: upsert');
  const dir = path.join(repo, '.superdev', 'kb-pending', 'demo');
  fs.chmodSync(dir, 0o000);
  try {
    if (process.getuid && process.getuid() !== 0) {
      const res = call(['--scope', 'demo'], repo);
      assert.equal(res.ok, false, 'an unreadable staging directory refuses');
      assert.match(res.err, /cannot be read \(EACCES\)/);
    }
  } finally {
    fs.chmodSync(dir, 0o755);
  }
});

// --- the containment refetch takes code-host.pushTimeoutMs, and push.js's reader default when unset -----
// An unmerged scope whose remote's upload-pack hangs for `hangSeconds`; the hang records only that it ran to its end.
function hangingRemoteRepo(scope, hangSeconds) {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stagePage(repo, scope, 'p.md', 'title: P\naction: upsert');
  fs.writeFileSync(path.join(repo, 'docs', 'agents', 'code-management.md'), '- **Base branch:** main\n');
  git(['checkout', '-q', `feat/${scope}`], repo);
  fs.writeFileSync(path.join(repo, 'branch-only.txt'), 'x\n');
  git(['add', 'branch-only.txt'], repo);
  git(['commit', '-q', '-m', 'branch-only work'], repo);
  git(['checkout', '-q', 'main'], repo);
  git(['remote', 'add', 'origin', repo], repo);
  const done = path.join(repo, '..', `done-${path.basename(repo)}`);
  const hang = path.join(repo, '..', `hang-${path.basename(repo)}.sh`);
  fs.writeFileSync(hang, `#!/bin/sh\nsleep ${hangSeconds}\ntouch '${done}'\n`, { mode: 0o755 });
  git(['config', 'remote.origin.uploadpack', `'${hang}'`], repo);
  return { repo, done };
}
withState(() => {
  // A hang a hundred times the configured bound: only the kill at that bound ends it before the marker.
  const { repo, done } = hangingRemoteRepo('bound', 60);
  writeOperatorConfig(repo, { 'code-host': { pushTimeoutMs: 200 }, 'knowledge-base': { timeoutMs: 600000 } });
  const res = call(['--scope', 'bound'], repo);
  assert.equal(res.ok, false, 'not contained refuses');
  assert.match(res.err, /not contained/);
  assert.ok(!fs.existsSync(done), 'the refetch ended at the configured bound, before the hang finished');
});
withState(() => {
  // Unset: the bound is push.js's reader default (60 s), not containment's own 5 s fetch bound, so a hang past 5 s still completes.
  const { repo, done } = hangingRemoteRepo('unset', 7);
  const res = call(['--scope', 'unset'], repo);
  assert.equal(res.ok, false, 'not contained refuses');
  assert.ok(fs.existsSync(done), 'the refetch outlived containment\'s 5 s bound and ran to the hang\'s end');
});

// --- the report strips escapes, control characters, and bidi controls -------------------------------
{
  const out = renderReport('s', 'b', [
    { kind: 'left-staged', title: 'T\u2028x\u202eY', reason: 'bad \u001b[31mred\u001b[0m\rend' },
    { kind: 'not-linked', title: 'N', reason: 'r\u0085', fix: 'f\u2066g\u2069', parent: 'P' },
    { kind: 'malformed', filename: 'a\u202ab.md', reason: 'r' },
  ]);
  assert.equal(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/.test(out), false, `stripped: ${JSON.stringify(out)}`);
  assert.match(out, /^left staged: TxY — bad redend$/m);
}

// --- one frontmatter splitter -------------------------------------------------------------------
{
  const p = parseStagedPage('---\ntitle: T\naction: upsert\n---');
  assert.equal(p.action, 'upsert');
  assert.equal(p.title, 'T');
  assert.equal(p.body, '', 'no trailing newline: an empty body');
  const q = parseStagedPage('---\ntitle: T\n---x\n----\naction: upsert\n---\nbody\n');
  assert.equal(q.action, 'upsert', 'a ---x or ---- line closes nothing');
  assert.equal(q.body, 'body\n');
  const lf = '---\ntitle: T\naction: upsert\n---\nline1\nline2\n';
  assert.deepStrictEqual(parseStagedPage(lf.replace(/\n/g, '\r\n')), parseStagedPage(lf), 'CRLF parses as LF');
  assert.match(merge('# P\n', '---\ntitle: T\n---x\n---\n## H\n\nbody\n'), /## H\n\nbody/, 'the section reader strips to the real closing line');
}

// --- the marker and the restage use the same closing rule -------------------------------------------
{
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'kb-fm-'));
  const f = path.join(dir, 'p.md');
  fs.writeFileSync(f, '---\ntitle: T\n---x\naction: upsert\n---\nbody\n');
  assert.ok(markStagedCreate(f).ok);
  const marked = fs.readFileSync(f, 'utf8');
  assert.match(marked, /^---\ntitle: T\n---x\naction: upsert\ncreated-by-publish: \S+\n---\nbody\n$/, 'the marker lands before the real closing line');
  const g = path.join(dir, 'q.md');
  fs.writeFileSync(g, '---\r\ntitle: T\r\n----\r\n---\r\nbody\r\n');
  restageLiveHash(g, 'abc');
  assert.equal(fs.readFileSync(g, 'utf8'), '---\r\ntitle: T\r\n----\r\nlive-hash: abc\r\n---\r\nbody\r\n');
}

// --- a restage whose rename fails leaves the page intact and no temporary file --------------------------
{
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'kb-fm-'));
  const f = path.join(dir, 'p.md');
  const text = '---\ntitle: T\n---\nbody\n';
  fs.writeFileSync(f, text);
  const orig = fs.renameSync;
  fs.renameSync = () => {
    throw new Error('rename refused');
  };
  try {
    restageLiveHash(f, 'abc');
  } finally {
    fs.renameSync = orig;
  }
  assert.equal(fs.readFileSync(f, 'utf8'), text, 'the staged page is intact');
  assert.deepStrictEqual(fs.readdirSync(dir), ['p.md'], 'no temporary file remains');
}
