'use strict';

// Suite for plugin/lib/kb-backend.js: the guards that decide whether a staged page may reach or replace a
// remote page (INV-0046, INV-0073, INV-0091). The functions run in-process over real `sh -c` templates; a
// template that would write to the backend touches a marker file, so "nothing is written" is observable as
// the marker's absence.

require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { shq } = require('./publish-kb-setup');
const { hashBody, fieldsToEnv, runFind, publishUpsert, publishDelete } = require('../plugin/lib/kb-backend.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-backend-'));
const marker = path.join(dir, 'written');
const touch = `: > ${shq(marker)}`;
const written = () => fs.existsSync(marker);
const FIND_FOUND = `echo '{"id":"p1"}'`;
const LIVE = 'live body.\n';
const READ_LIVE = `printf %s ${shq(LIVE)}`;

// --- a recorded live hash on a backend with no read command never replaces the live page ---------
{
  const res = publishUpsert('P', '/dev/null', { find: FIND_FOUND, update: touch }, hashBody(LIVE), false, null, null);
  assert.equal(res.ok, false);
  assert.match(res.reason, /no read command configured — an existing page cannot be checked against its recorded live-hash/);
  assert.equal(written(), false, 'update never ran');
}

// --- an empty read body on the upsert path never replaces the live page --------------------------
{
  const res = publishUpsert('P', '/dev/null', { find: FIND_FOUND, read: ':', update: touch }, hashBody(LIVE), false, null, null);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'read returned an empty body');
  assert.equal(written(), false, 'update never ran');
}

// --- a parent found without an id leaves the child uncreated -------------------------------------
{
  const find = `if [ "$SUPERDEV_KB_TITLE" = Parent ]; then echo '{"name":"no id"}'; else exit 3; fi`;
  const create = `: "$SUPERDEV_KB_PARENT_ID"; ${touch}`;
  const res = publishUpsert('Child', '/dev/null', { find, create }, null, false, null, 'Parent');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'parent page "Parent": find returned no id');
  assert.equal(written(), false, 'create never ran');
}

// --- a find key outside [A-Za-z0-9_] is forwarded and named in a warning --------------------------
{
  const warned = [];
  const orig = process.stderr.write;
  process.stderr.write = (s) => (warned.push(String(s)), true);
  let env;
  try {
    env = fieldsToEnv({ 'web-url': 'u', id: 7 });
  } finally {
    process.stderr.write = orig;
  }
  assert.deepEqual(env, { 'SUPERDEV_KB_WEB-URL': 'u', SUPERDEV_KB_ID: '7' });
  assert.equal(warned.length, 1, 'only the odd key warns');
  assert.match(warned[0], /find returned key "web-url", which no shell can address as a variable/);
}

// --- no find command: the backend cannot answer, so nothing is sent --------------------------------
{
  assert.deepEqual(runFind('P', {}), { verdict: 'unknown', reason: 'no find command configured' });
  const up = publishUpsert('P', '/dev/null', { create: touch, update: touch }, null, false, null, null);
  assert.deepEqual(up, { ok: false, reason: 'no find command configured', timedOut: undefined });
  const del = publishDelete('P', { delete: touch });
  assert.deepEqual(del, { ok: false, reason: 'no find command configured', timedOut: undefined });
  assert.equal(written(), false, 'no verb ran');
}

// --- no update command: a page whose guard passes is still not replaced --------------------------
{
  const res = publishUpsert('P', '/dev/null', { find: FIND_FOUND, read: READ_LIVE }, hashBody(LIVE), false, null, null);
  assert.deepEqual(res, { ok: false, reason: 'no update command configured' });
}

// --- no delete command: a found page is not deleted -----------------------------------------------
{
  assert.deepEqual(publishDelete('P', { find: FIND_FOUND }), { ok: false, reason: 'no delete command configured' });
}

fs.rmSync(dir, { recursive: true, force: true });
console.log('kb-backend.test.js: all assertions passed');
