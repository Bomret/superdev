'use strict';

// Suite for plugin/lib/remote.js: `parseRemote` reads the first token of the `Remote:` bullet of
// `docs/agents/code-management.md`, and `resolveRemote` reads that bullet at the repository's top level (INV-0203).

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const made = [];
after(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});
const { parseRemote, resolveRemote } = require('../plugin/lib/remote.js');

test('parseRemote takes the first token of the `- **Remote:**` bullet: every shipped bullet carries a trailing sentence', () => {
  assert.equal(parseRemote('# Code host\n\n- **Remote:** `upstream`.\n'), 'upstream');
  assert.equal(parseRemote('# Code host\n\n- **Remote**: `upstream`.\n'), 'upstream', 'the colon-outside-bold spelling too');
  assert.equal(parseRemote('# Code host\n\nno remote bullet here.\n'), null, 'absent bullet -> null, not a refusal');
  assert.equal(
    parseRemote('# Code host\n\n- **Remote:** `origin`. Confirm with `git remote -v`.\n'),
    'origin',
    'the real shipped bullet shape (docs/agents/code-management.md and both seeds) carries a trailing sentence',
  );
  assert.equal(parseRemote(null), null);
});

test('resolveRemote reads the top-level document from a subdirectory, and answers null with no Remote: value', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-'));
  made.push(repo);
  execFileSync('git', ['init', '-q'], { cwd: repo });
  const doc = path.join(repo, 'docs', 'agents', 'code-management.md');
  fs.mkdirSync(path.dirname(doc), { recursive: true });
  fs.writeFileSync(doc, '# Code host\n\n- **Remote:** `upstream`. Confirm with `git remote -v`.\n');
  const sub = path.join(repo, 'plugin', 'lib');
  fs.mkdirSync(sub, { recursive: true });
  assert.equal(resolveRemote(sub, undefined), 'upstream', 'a call from a subdirectory reads the top-level document');
  assert.equal(resolveRemote(sub, 'other'), 'other', 'an explicit remote wins');
  fs.writeFileSync(doc, '# Code host\n\n- **Base branch:** `main`.\n');
  assert.equal(resolveRemote(repo, undefined), null, 'no Remote: value -> null, never origin');
  fs.rmSync(repo, { recursive: true, force: true });
});


test('resolveRemote refuses a code-management.md that exists but cannot be read, unless the caller passes a remote (INV-0213)', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-'));
  made.push(repo);
  execFileSync('git', ['init', '-q'], { cwd: repo });
  fs.mkdirSync(path.join(repo, 'docs', 'agents', 'code-management.md'), { recursive: true });
  assert.throws(
    () => resolveRemote(repo, undefined, 'contained'),
    (e) => e.isRefusal === true && /^contained: docs\/agents\/code-management\.md cannot be read \(EISDIR\)$/.test(e.message),
    'an unreadable document refuses, naming the caller and the failure'
  );
  assert.equal(resolveRemote(repo, 'other', 'contained'), 'other', 'an explicit remote wins, and the document is not read');
  fs.rmSync(path.join(repo, 'docs'), { recursive: true });
  assert.equal(resolveRemote(repo, undefined, 'contained'), null, 'no document -> null, the no-remote result');
});
