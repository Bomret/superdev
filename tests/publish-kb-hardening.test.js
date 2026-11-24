'use strict';

// Suite for plugin/scripts/publish-kb.js and its lib/kb-*.js modules: refusal on an unreadable input file, an unreadable
// run root or ledger refusing past --allow-unmerged, report sanitizing, the one frontmatter splitter, and a retry marker on a page that cannot be read. Shared fixtures live in tests/publish-kb-setup.js.

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { publishKbPath, makeRepo, commandsDoc, writeKbDoc, stagePage, call, withState } = require('./publish-kb-setup');
const { parseStagedPage } = require(publishKbPath);
const { markStagedCreate, restageLiveHash } = require('../plugin/lib/kb-staged-page.js');
const { renderReport } = require('../plugin/lib/kb-report.js');
const { merge } = require('../plugin/lib/md-sections.js');

const made = [];
after(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

test('an unreadable input refuses with one line and publishes nothing', () => {
  for (const name of ['knowledge-base.md']) {
    withState((stateFile) => {
      const repo = makeRepo();
      writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
      stagePage(repo, 'demo', 'p.md', 'title: P\naction: upsert');
      const target = path.join(repo, 'docs', 'agents', name);
      fs.rmSync(target, { force: true });
      fs.mkdirSync(target);
      const res = call(['--scope', 'demo'], repo);
      assert.equal(res.ok, false, `${name} that is a directory refuses`);
      assert.match(res.err, new RegExp(`${name} cannot be read \\(EISDIR\\)`), 'one line naming the file and code');
      assert.equal(res.err.includes('\n'), false, 'one line');
      assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'p.md')), 'the staged page stays');
      assert.ok(!fs.existsSync(stateFile), 'nothing published');
    });
  }
  // An unreadable ledger, or a run root or `.superdev/scopes` that is a dangling symlink, refuses naming the error, even
  // under --allow-unmerged.
  for (const [label, breakIt, code] of [
    ['a ledger that is a directory', (root) => fs.mkdirSync(path.join(root, 'ledger.md'), { recursive: true }), 'EISDIR'],
    ['a dangling symlink run root', (root) => fs.symlinkSync(path.join(root, '..', 'gone'), root), 'ENOENT'],
    [
      'a dangling symlink .superdev/scopes',
      (root) => {
        const scopes = path.dirname(root);
        fs.rmSync(scopes, { recursive: true });
        fs.symlinkSync(path.join(scopes, '..', 'gone'), scopes);
      },
      'ENOENT',
    ],
  ]) {
    withState((stateFile) => {
      const repo = makeRepo();
      writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
      stagePage(repo, 'demo', 'p.md', 'title: P\naction: upsert');
      const root = path.join(repo, '.superdev', 'scopes', 'demo');
      fs.mkdirSync(path.dirname(root), { recursive: true });
      breakIt(root);
      for (const argv of [['--scope', 'demo'], ['--scope', 'demo', '--allow-unmerged']]) {
        const res = call(argv, repo);
        assert.equal(res.ok, false, `${label} refuses (${argv.join(' ')})`);
        assert.match(res.err, new RegExp(`\\(${code}\\) — nothing published$`), `${label}: names the error, not overridable: ${res.err}`);
        assert.ok(fs.existsSync(path.join(repo, '.superdev', 'kb-pending', 'demo', 'p.md')), 'the staged page stays');
        assert.ok(!fs.existsSync(stateFile), 'nothing published');
      }
    });
  }
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
});

test('the report strips escapes, control characters, and bidi controls', () => {
  const out = renderReport('s', 'b', [
    { kind: 'left-staged', title: 'T\u2028x\u202eY', reason: 'bad \u001b[31mred\u001b[0m\rend' },
    { kind: 'not-linked', title: 'N', reason: 'r\u0085', fix: 'f\u2066g\u2069', parent: 'P' },
    { kind: 'malformed', filename: 'a\u202ab.md', reason: 'r' },
  ]);
  assert.equal(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/.test(out), false, `stripped: ${JSON.stringify(out)}`);
  assert.match(out, /^left staged: TxY — bad redend$/m);
});

test('one frontmatter splitter', () => {
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
});

test('the marker and the restage use the same closing rule', () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'kb-fm-'));
  made.push(dir);
  const f = path.join(dir, 'p.md');
  fs.writeFileSync(f, '---\ntitle: T\n---x\naction: upsert\n---\nbody\n');
  assert.ok(markStagedCreate(f).ok);
  const marked = fs.readFileSync(f, 'utf8');
  assert.match(marked, /^---\ntitle: T\n---x\naction: upsert\ncreated-by-publish: \S+\n---\nbody\n$/, 'the marker lands before the real closing line');
  const g = path.join(dir, 'q.md');
  fs.writeFileSync(g, '---\r\ntitle: T\r\n----\r\n---\r\nbody\r\n');
  restageLiveHash(g, 'abc');
  assert.equal(fs.readFileSync(g, 'utf8'), '---\r\ntitle: T\r\n----\r\nlive-hash: abc\r\n---\r\nbody\r\n');
});

test('a retry marker on a page that cannot be read reports a failure and writes nothing', () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'kb-fm-'));
  made.push(dir);
  const missing = path.join(dir, 'missing.md');
  const folder = path.join(dir, 'folder.md');
  fs.mkdirSync(folder);
  for (const [label, p] of [['a missing page', missing], ['a directory', folder]]) {
    assert.deepStrictEqual(markStagedCreate(p), { ok: false, reason: 'could not write the retry marker' }, `${label} reports a failure`);
  }
  assert.ok(!fs.existsSync(missing), 'no page is created');
  assert.deepStrictEqual(fs.readdirSync(dir), ['folder.md'], 'no temporary file remains');
  assert.deepStrictEqual(fs.readdirSync(folder), [], 'nothing is written into the directory');
});

test('a restage whose rename fails leaves the page intact and no temporary file', () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'kb-fm-'));
  made.push(dir);
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
});
