'use strict';

// Suite for plugin/lib/kb-apply.js: the batch refusals that must leave the backend unwritten — a title group
// that is not all `action: patch`, a staged file with no frontmatter, and a parent cycle. Staged files are
// real files; a backend verb that would write touches a marker file.

require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { shq } = require('./publish-kb-setup');
const { processStagedFiles } = require('../plugin/lib/kb-apply.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-apply-'));
const marker = path.join(dir, 'written');
const touch = `: > ${shq(marker)}`;
const templates = {
  find: 'exit 3',
  read: ':',
  create: `: "$SUPERDEV_KB_PARENT_ID"; ${touch}`,
  update: touch,
  delete: touch,
};
const stage = (name, text) => {
  const f = path.join(dir, name);
  fs.writeFileSync(f, text);
  return f;
};
const page = (title, action, extra = '', body = 'body.\n') => `---\ntitle: ${title}\naction: ${action}${extra}\n---\n${body}`;
const byName = (results) => Object.fromEntries(results.map((r) => [r.filename, r]));

// --- a title group not all patches: every file is left staged, naming the group, and nothing is sent ---
{
  const a = stage('mixed-a.md', page('Mixed', 'patch', '', '## A\n\nnew.\n'));
  const b = stage('mixed-b.md', page('Mixed', 'upsert'));
  const res = byName(processStagedFiles([a, b], templates));
  for (const name of ['mixed-a.md', 'mixed-b.md']) {
    assert.equal(res[name].kind, 'left-staged');
    assert.match(res[name].reason, /shares the title "Mixed" with 1 other staged file\(s\), not all action: patch \(mixed-a\.md, mixed-b\.md\)/);
  }
  assert.ok(fs.existsSync(a) && fs.existsSync(b), 'both stay staged');
  assert.equal(fs.existsSync(marker), false, 'nothing reached the backend');
}

// --- a staged file with no frontmatter is malformed and stays staged ------------------------------
{
  const f = stage('bare.md', 'no frontmatter here\n');
  const res = processStagedFiles([f], templates);
  assert.deepEqual(res, [{ filename: 'bare.md', kind: 'malformed', reason: 'no YAML frontmatter' }]);
  assert.ok(fs.existsSync(f), 'a malformed file is never deleted');
  assert.equal(fs.existsSync(marker), false, 'nothing reached the backend');
}

// --- a parent cycle ends: neither page is created, each is left staged with its parent not found ----
{
  const a = stage('cycle-a.md', page('CycleA', 'upsert', '\nparent: CycleB'));
  const b = stage('cycle-b.md', page('CycleB', 'upsert', '\nparent: CycleA'));
  const res = byName(processStagedFiles([a, b], templates));
  assert.equal(Object.keys(res).length, 2, 'the cycle drops no page');
  assert.equal(res['cycle-a.md'].kind, 'left-staged');
  assert.equal(res['cycle-a.md'].reason, 'parent page "CycleB" not found');
  assert.equal(res['cycle-b.md'].kind, 'left-staged');
  assert.equal(res['cycle-b.md'].reason, 'parent page "CycleA" not found');
  assert.ok(fs.existsSync(a) && fs.existsSync(b), 'both stay staged');
  assert.equal(fs.existsSync(marker), false, 'nothing reached the backend');
}

fs.rmSync(dir, { recursive: true, force: true });
console.log('kb-apply.test.js: all assertions passed');
