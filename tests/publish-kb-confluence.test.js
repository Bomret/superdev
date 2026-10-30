'use strict';

// Suite for the Confluence seed's `## Commands` templates (plugin/references/knowledge-base-confluence.md),
// run through `classifyBackend` against a fake `curl` that records its argument list and stdin and
// answers per route. Pins the folder fallback of `find`, the folder guard, the stdin transport, and
// the visible error body of a rejected `create` or `update`.

require('./fixture-git.js');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { classifyBackend } = require('../plugin/scripts/publish-kb.js');

const seedPath = path.join(__dirname, '..', 'plugin', 'references', 'knowledge-base-confluence.md');
const seed = fs.readFileSync(seedPath, 'utf8');
const templates = classifyBackend(seed).templates;
for (const verb of ['find', 'read', 'create', 'update', 'delete']) {
  assert.ok(templates[verb], `the seed configures a ${verb} template`);
}

// A page with a parent is created under it: the nested seed's create reads `parentId`, or publish-kb refuses it.
assert.equal(classifyBackend(seed).templates.hierarchy, 'nested');
assert.ok(templates.create.includes('parentId'), 'the create template reads parentId');
for (const verb of ['find', 'read', 'create', 'update', 'delete']) {
  assert.ok(!templates[verb].includes('SUPERDEV_'), `the ${verb} template names no SUPERDEV_ variable, shell temporaries included`);
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'confluence-'));
const stubDir = path.join(work, 'bin');
fs.mkdirSync(stubDir);
fs.writeFileSync(path.join(stubDir, 'curl'),
  '#!/bin/sh\n' +
  '{ echo "--call"; for a; do printf "%s\\n" "$a"; done; } >> "$CURL_LOG"\n' +
  '{ echo "--call"; cat; echo; } >> "$CURL_STDIN"\n' +
  'case "$*" in\n' +
  '  *user/current*) printf "%s" "$CURL_USER_BODY";;\n' +
  '  *rest/api/search*) [ -n "$CURL_SEARCH_FAIL" ] && exit 22; printf "%s" "$CURL_SEARCH_BODY";;\n' +
  '  *"-X POST"*|*"-X PUT"*) printf "%s" "$CURL_WRITE_BODY"; [ -n "$CURL_WRITE_FAIL" ] && exit 22; exit 0;;\n' +
  '  *) [ -n "$CURL_PAGES_FAIL" ] && exit 22; printf "%s" "$CURL_PAGES_BODY";;\n' +
  'esac\n', { mode: 0o755 });

let n = 0;
// `env` is the stub's environment; `values` overrides what the values file (`$1`) holds.
function run(verb, env = {}, values = {}) {
  const dir = path.join(work, `case-${n++}`);
  fs.mkdirSync(dir);
  const log = path.join(dir, 'args');
  const stdin = path.join(dir, 'stdin');
  const bodyFile = path.join(dir, 'ünï body.html');
  fs.writeFileSync(bodyFile, '<p>Grüße — ok</p>');
  const valuesFile = path.join(dir, 'values.json');
  fs.writeFileSync(valuesFile, JSON.stringify({ title: 'Missing Page', bodyFile, found: { id: '123', version: 4 }, operator: {}, ...values }));
  const res = spawnSync('/bin/sh', ['-c', templates[verb].replace(/<base>/g, 'https://x.test/wiki')
    .replace(/<space-id>/g, '99').replace(/<SPACE>/g, 'KEY').replace(/<parent-id>/g, ''), 'sh', valuesFile], {
    env: {
      ...process.env,
      PATH: stubDir + path.delimiter + process.env.PATH,
      CONFLUENCE_EMAIL: 'x', CONFLUENCE_API_TOKEN: 'x',
      CURL_LOG: log, CURL_STDIN: stdin,
      CURL_USER_BODY: JSON.stringify({ type: 'known' }),
      ...env,
    },
    encoding: 'utf8',
  });
  const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
  return { ...res, args: read(log), stdin: read(stdin), calls: (read(log).match(/--call/g) || []).length, bodyFile };
}

const page = (title, extra = {}) => ({ id: '123', title, version: { number: 5 }, ...extra });
const pages = (...r) => JSON.stringify({ results: r });
const folder = (title) => ({ content: { id: '777', type: 'folder', title } });
const noPage = pages();

// --- find: a page hit, exactly as before, and no folder request ---
{
  const r = run('find', { CURL_PAGES_BODY: pages(page('Missing Page')) });
  assert.equal(r.status, 0);
  assert.deepEqual(JSON.parse(r.stdout), { id: '123', version: 5 }, 'the version stays a number');
  assert.doesNotMatch(r.args, /rest\/api\/search/, 'a page hit makes no folder request');
  assert.match(r.args, /status=current/, 'the page query asks for current pages only');
}

// --- find: absence, malformed answers ---
{
  assert.equal(run('find', { CURL_PAGES_BODY: noPage, CURL_SEARCH_BODY: pages() }).status, 3, 'no page and an empty search answers 3');
  assert.equal(run('find', { CURL_PAGES_BODY: 'not json' }).status, 2);
  assert.equal(run('find', { CURL_PAGES_BODY: JSON.stringify({ message: 'err' }) }).status, 2);
  assert.equal(run('find', { CURL_PAGES_BODY: noPage, CURL_SEARCH_FAIL: '1' }).status, 2, 'a failed search is no absence');
  assert.equal(run('find', { CURL_PAGES_BODY: noPage, CURL_SEARCH_BODY: JSON.stringify({ message: 'e' }) }).status, 2, 'a search with no results array is no absence');
  assert.equal(run('find', { CURL_PAGES_BODY: noPage, CURL_SEARCH_BODY: 'not json' }).status, 2);
}

// --- find: a wrong token reads as the anonymous user, so an empty answer is no absence ---
{
  const anon = run('find', { CURL_PAGES_BODY: noPage, CURL_SEARCH_BODY: pages(), CURL_USER_BODY: JSON.stringify({ type: 'anonymous' }) });
  assert.equal(anon.status, 2, 'an anonymous reader never answers absent');
  assert.match(anon.args, /rest\/api\/user\/current/);
  assert.equal(run('find', { CURL_PAGES_BODY: noPage, CURL_SEARCH_BODY: pages(), CURL_USER_BODY: 'not json' }).status, 2);
  assert.doesNotMatch(run('find', { CURL_PAGES_BODY: pages(page('Missing Page')) }).args, /user\/current/, 'a page hit makes no identity request');
}

// --- find: folders ---
{
  const one = run('find', { CURL_PAGES_BODY: noPage, CURL_SEARCH_BODY: pages(folder('Missing Page')) });
  assert.equal(one.status, 0);
  assert.deepEqual(JSON.parse(one.stdout), { id: '777', type: 'folder' }, 'one exact folder answers id and type, no version');
  assert.equal(run('find', { CURL_PAGES_BODY: noPage, CURL_SEARCH_BODY: pages(folder('missing page')) }).status, 2, 'a folder differing in case is never taken');
  assert.equal(run('find', { CURL_PAGES_BODY: noPage, CURL_SEARCH_BODY: pages(folder('Missing Page'), { content: { id: '8', type: 'folder', title: 'Missing Page' } }) }).status, 2, 'two exact folders answer 2');
  const more = JSON.stringify({ results: [folder('Missing Page')], _links: { next: '/x' } });
  assert.equal(run('find', { CURL_PAGES_BODY: noPage, CURL_SEARCH_BODY: more }).status, 2, 'a search with a further page is partial');
  const morePages = JSON.stringify({ results: [], _links: { next: '/x' } });
  assert.equal(run('find', { CURL_PAGES_BODY: morePages, CURL_SEARCH_BODY: pages() }).status, 2, 'a partial page listing never answers absent');
  assert.equal(run('find', { CURL_PAGES_BODY: pages(page('missing page')), CURL_SEARCH_BODY: pages() }).status, 2, 'a page differing only in case answers 2');
  assert.equal(run('find', { CURL_PAGES_BODY: pages(page('Missing Page'), page('Missing Page')) }).status, 2, 'two exact pages answer 2');
  const bad = run('find', { CURL_PAGES_FAIL: '1' });
  assert.ok(![0, 3].includes(bad.status), 'a failed page query (a refused login) is neither a hit nor absence');
}

// --- find: quotes and backslashes cannot break or widen the CQL ---
{
  const title = 'A "quoted" \\ ünï';
  const r = run('find', { CURL_PAGES_BODY: noPage, CURL_SEARCH_BODY: pages() }, { title });
  assert.equal(r.status, 3);
  const cql = r.stdin.split('--call').filter(Boolean)[1].trim();
  assert.equal(cql, 'space="KEY" and type=folder and title="A \\"quoted\\" \\\\ ünï"');
}

// --- transport: title, cql and body reach curl on stdin, never in its arguments ---
{
  const title = 'Grüße — Ünï';
  const f = run('find', { CURL_PAGES_BODY: noPage, CURL_SEARCH_BODY: pages() }, { title });
  assert.match(f.args, /title@-/);
  assert.match(f.args, /cql@-/);
  assert.ok(f.stdin.includes(title), 'the title is on stdin');
  const c = run('create', {}, { title, parentId: '55' });
  const u = run('update', {}, { title });
  for (const r of [f, c, u]) {
    assert.equal(r.status, r === f ? 3 : 0, r.stderr);
    assert.ok(!r.args.includes(title), 'no title in the curl arguments');
    assert.doesNotMatch(r.args, /[^\x00-\x7f]/, 'no non-ASCII value in the curl arguments');
    assert.ok(!r.args.includes(r.bodyFile), 'no temp-file path in the curl arguments');
  }
  assert.match(c.args, /--data-binary\n@-/);
  const sent = JSON.parse(c.stdin.split('--call').filter(Boolean)[0]);
  assert.equal(sent.title, title);
  assert.equal(sent.body.value, '<p>Grüße — ok</p>');
  assert.equal(sent.parentId, '55');
  assert.equal(sent.spaceId, '99');
  const upd = JSON.parse(u.stdin.split('--call').filter(Boolean)[0]);
  assert.equal(upd.version.number, 5);
  assert.equal(upd.title, title);
  assert.equal(JSON.parse(run('create').stdin.split('--call').filter(Boolean)[0]).parentId, undefined, 'no parent, no parentId');
}

// --- a title holding shell syntax, quotes, or a newline reaches Confluence byte for byte ---
{
  const title = 'A $(touch x) `y` \'q\' "d"\nsecond line';
  const sent = (r) => JSON.parse(r.stdin.split('--call').filter(Boolean)[0]);
  assert.equal(sent(run('create', {}, { title })).title, title);
  assert.equal(sent(run('update', {}, { title })).title, title);
  const f = run('find', { CURL_PAGES_BODY: noPage, CURL_SEARCH_BODY: pages() }, { title });
  assert.ok(f.stdin.split('--call')[1].replace(/^\n/, '').startsWith(title), 'find sends the whole title, newline included');
  const hit = run('find', { CURL_PAGES_BODY: pages(page(title)) }, { title });
  assert.deepEqual(JSON.parse(hit.stdout), { id: '123', version: 5 }, 'find matches the title exactly');
}

// --- create/update: Confluence's error body reaches stderr, exit non-zero ---
for (const verb of ['create', 'update']) {
  const r = run(verb, { CURL_WRITE_FAIL: '1', CURL_WRITE_BODY: '{"message":"Title already exists"}' });
  assert.notEqual(r.status, 0, `${verb} fails on a rejection`);
  assert.match(r.stderr, /Title already exists/, `${verb} writes the error body to stderr`);
  assert.match(r.args, /--fail-with-body/);
}

// --- folder guard ---
for (const verb of ['read', 'update', 'delete']) {
  const r = run(verb, {}, { found: { id: '777', type: 'folder' } });
  assert.notEqual(r.status, 0, `${verb} refuses a folder`);
  assert.match(r.stderr, /folder/);
  assert.match(r.stderr, /Missing Page/, 'the message names the folder');
  assert.equal(r.calls, 0, 'no request is made');
}

fs.rmSync(work, { recursive: true, force: true });
console.log('publish-kb-confluence.test.js: all assertions passed');
