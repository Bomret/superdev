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
const { hashBody, runVerb, runFind, publishUpsert, publishDelete } = require('../plugin/lib/kb-backend.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-backend-'));
const marker = path.join(dir, 'written');
const touch = `: > ${shq(marker)}`;
const written = () => fs.existsSync(marker);
const FIND_FOUND = `echo '{"id":"p1"}'`;
const LIVE = 'live body.\n';
const READ_LIVE = `printf %s ${shq(LIVE)}`;
// The entry points carry the bound on `templates`; a healthy template here finishes far inside it.
const timeoutMs = 600000;

// --- a recorded live hash on a backend with no read command never replaces the live page ---------
{
  const res = publishUpsert('P', '/dev/null', { find: FIND_FOUND, update: touch, timeoutMs }, hashBody(LIVE), false, null, null);
  assert.equal(res.ok, false);
  assert.match(res.reason, /no read command configured — an existing page cannot be checked against its recorded live-hash/);
  assert.equal(written(), false, 'update never ran');
}

// --- an empty read body on the upsert path never replaces the live page --------------------------
{
  const res = publishUpsert('P', '/dev/null', { find: FIND_FOUND, read: ':', update: touch, timeoutMs }, hashBody(LIVE), false, null, null);
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'read returned an empty body');
  assert.equal(written(), false, 'update never ran');
}

// --- a parent found without an id leaves the child uncreated -------------------------------------
{
  const find = `if grep -q '"title":"Parent"' "$1"; then echo '{"name":"no id"}'; else exit 3; fi`;
  const create = `: parentId; ${touch}`;
  const res = publishUpsert('Child', '/dev/null', { find, create, timeoutMs }, null, false, null, 'Parent');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'parent page "Parent": find returned no id');
  assert.equal(written(), false, 'create never ran');
}

// --- a command takes its values from the JSON file named by $1, and from nothing else ---------------
const seen = path.join(dir, 'seen.json');
const SAVE = `cp "$1" ${shq(seen)}`;
const seenValues = () => JSON.parse(fs.readFileSync(seen, 'utf8'));
{
  const title = `$(touch ${marker}) 'single' "double"\nnext line`;
  const res = runVerb({ read: `${SAVE}; env -0 > ${shq(seen + '.env')}`, operator: { teaLogin: 'x' }, timeoutMs }, 'read', { title, found: { id: 7, version: 4 } });
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(seenValues(), { title, found: { id: 7, version: 4 }, operator: { teaLogin: 'x' } }, 'values keep their text and JSON type');
  assert.equal(written(), false, 'a title holding $(...) runs nothing');
  const kbLines = (lines) => lines.filter((l) => l.startsWith('SUPERDEV_KB_')).sort();
  const childKb = kbLines(fs.readFileSync(seen + '.env', 'utf8').split('\0'));
  const parentKb = kbLines(Object.entries(process.env).map(([k, v]) => `${k}=${v}`));
  assert.deepEqual(childKb, parentKb, 'the child holds the operator\'s own SUPERDEV_KB_ variables and none of superdev\'s');
}

// --- the values file is readable only by the operator and gone after every kind of spawn -----------
{
  const modeOut = path.join(dir, 'mode');
  const dirs = [];
  const mkdtemp = fs.mkdtempSync;
  fs.mkdtempSync = (...a) => (dirs.push(mkdtemp(...a)), dirs[dirs.length - 1]);
  try {
    const run = (read, bound) => runVerb({ read, operator: {}, timeoutMs: bound }, 'read', { title: 't' });
    const ok = run(`${SAVE}; printf '%s' "$1" > ${shq(modeOut)}`, timeoutMs);
    assert.equal(ok.status, 0, ok.stderr);
    const failing = run('exit 7', timeoutMs);
    assert.equal(failing.status, 7);
    const hung = run('exec sleep 900', 300);
    assert.equal(hung.error && hung.error.code, 'ETIMEDOUT');
    assert.throws(() => run('printf \0', timeoutMs), 'a spawn that throws');
  } finally {
    fs.mkdtempSync = mkdtemp;
  }
  assert.equal(dirs.length, 4, 'every spawn made one values file');
  for (const d of dirs) assert.equal(fs.existsSync(d), false, `${d} is removed`);
  const valuesPath = fs.readFileSync(modeOut, 'utf8');
  assert.ok(valuesPath.startsWith(os.tmpdir()), 'the file lives under the temp directory');
  assert.ok(path.relative(path.join(__dirname, '..'), valuesPath).startsWith('..'), 'the file lies outside the repository');
}
{
  const modeOut = path.join(dir, 'mode2');
  runVerb({ read: `stat -f %Lp "$1" > ${shq(modeOut)} 2>/dev/null || stat -c %a "$1" > ${shq(modeOut)}`, operator: {}, timeoutMs }, 'read', {});
  assert.equal(fs.readFileSync(modeOut, 'utf8').trim(), '600', 'only the operator reads it');
}

// --- a find field named like one of superdev's values shadows none of them, and not the bound -----
{
  const hostile = { title: 'evil', bodyFile: '/evil', parentId: 'evil', operator: { evil: 1 }, timeoutMs: 1 };
  const find = `echo ${shq(JSON.stringify(hostile))}`;
  const read = `sleep 0.3; ${SAVE}; printf %s ${shq(LIVE)}`;
  const res = publishUpsert('P', '/dev/null', { find, read, update: touch, operator: { a: 1 }, timeoutMs }, hashBody(LIVE), false, null, null);
  assert.equal(res.ok, true, res.reason);
  assert.deepEqual(seenValues(), { title: 'P', found: hostile, operator: { a: 1 } }, 'found fields stay under found');
}

// --- a numeric find field reaches later commands as a number ------------------------------------------
{
  const res = publishDelete('P', { find: `echo '{"id":42,"version":3}'`, delete: SAVE, operator: {}, timeoutMs });
  assert.equal(res.ok, true, res.reason);
  assert.deepEqual(seenValues().found, { id: 42, version: 3 });
}

// --- a parent's id reaches create as parentId, in its JSON type ------------------------------------------
{
  const find = `if grep -q '"title":"Parent"' "$1"; then echo '{"id":9}'; else exit 3; fi`;
  const res = publishUpsert('Child', '/body.md', { find, create: `: parentId; ${SAVE}`, operator: {}, timeoutMs }, 'h', false, null, 'Parent');
  assert.equal(res.ok, true, res.reason);
  assert.deepEqual(seenValues(), { title: 'Child', bodyFile: '/body.md', parentId: 9, operator: {} });
}

// --- a create command that never reads the parent id is refused ----------------------------------------
{
  fs.rmSync(marker, { force: true });
  const find = `if grep -q '"title":"Parent"' "$1"; then echo '{"id":9}'; else exit 3; fi`;
  const res = publishUpsert('Child', '/body.md', { find, create: touch, operator: {}, timeoutMs }, 'h', false, null, 'Parent');
  assert.equal(res.ok, false);
  assert.match(res.reason, /the create command never reads parentId, so parent "Parent" would be ignored/);
  assert.equal(written(), false, 'create never ran');
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
  const res = publishUpsert('P', '/dev/null', { find: FIND_FOUND, read: READ_LIVE, timeoutMs }, hashBody(LIVE), false, null, null);
  assert.deepEqual(res, { ok: false, reason: 'no update command configured' });
}

// --- no delete command: a found page is not deleted -----------------------------------------------
{
  assert.deepEqual(publishDelete('P', { find: FIND_FOUND, timeoutMs }), { ok: false, reason: 'no delete command configured' });
}

fs.rmSync(dir, { recursive: true, force: true });
console.log('kb-backend.test.js: all assertions passed');
