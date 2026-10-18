'use strict';

// Suite for plugin/scripts/publish-kb.js: the real backend templates this repository ships —
// `docs/agents/knowledge-base.md` and the Confluence seed — run through `classifyBackend` against
// stubbed `tea` and `curl` commands, pinning which exit code each template produces.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { classifyBackend } = require('../plugin/scripts/publish-kb.js');

// --- the real `### find` template in docs/agents/knowledge-base.md separates "genuinely absent"
// from a jq failure that is not absence, and reads every listing page before it answers 3. The runFind-level mapping (exit 3 -> absent, anything else -> unknown) is
// already pinned above (`find exited 5` and the JSON-array case) — this pins the template text
// itself, the thing that decides which of those exit codes a real find call actually produces.
{
  const realDoc = fs.readFileSync(path.join(__dirname, '..', 'docs', 'agents', 'knowledge-base.md'), 'utf8');
  const findTemplate = classifyBackend(realDoc).templates.find;
  assert.ok(findTemplate, 'docs/agents/knowledge-base.md still configures a find template');

  // Stubs `tea` on PATH so the template runs against a canned response instead of the real network:
  // `tea login list -o json` answers TEA_STUB_LOGINS, and `tea api` writes the status line `-i` gives to
  // stderr and the body to stdout. With TEA_STUB_PAGE_DIR set, a listing call answers the files
  // `<page>.body` and `<page>.status` there, `<page>` read from the URL's `page=` parameter.
  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-stub-'));
  fs.writeFileSync(path.join(stubDir, 'tea'),
    '#!/bin/sh\n' +
    'if [ "$1" = login ]; then printf "%s" "$TEA_STUB_LOGINS"; exit 0; fi\n' +
    'if [ -n "$TEA_STUB_PAGE_DIR" ]; then for a; do url=$a; done\n' +
    '  p=$(printf "%s" "$url" | sed -n "s/.*[?&]page=\\([0-9]*\\).*/\\1/p")\n' +
    '  printf "HTTP/2.0 %s\\n" "$(cat "$TEA_STUB_PAGE_DIR/$p.status" 2>/dev/null || echo 200 OK)" >&2\n' +
    '  cat "$TEA_STUB_PAGE_DIR/$p.body"; exit 0; fi\n' +
    'printf "HTTP/2.0 %s\\n" "$TEA_STUB_STATUS" >&2\nprintf "%s" "$TEA_STUB_BODY"\n', { mode: 0o755 });
  // A PATH holding `jq` and the system tools but no `tea`: the "no tea installed" case.
  const noTeaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-tea-'));
  fs.symlinkSync(spawnSync('/bin/sh', ['-c', 'command -v jq'], { encoding: 'utf8' }).stdout.trim(), path.join(noTeaDir, 'jq'));

  const HOST = 'https://codeberg.org';
  const oneLogin = JSON.stringify([
    { name: 'other', url: 'https://example.org', user: 'x' },
    { name: 'cb', url: HOST, user: 'bomret' },
  ]);

  function runFindTemplate(body, status = '200 OK', logins = oneLogin, extraEnv = {}) {
    return spawnSync('/bin/sh', ['-c', findTemplate], {
      env: {
        ...process.env,
        PATH: stubDir + path.delimiter + process.env.PATH,
        TEA_STUB_BODY: body,
        TEA_STUB_STATUS: status,
        TEA_STUB_LOGINS: logins,
        SUPERDEV_KB_TITLE: 'Missing Page',
        ...extraEnv,
      },
      encoding: 'utf8',
    });
  }

  const notThere = runFindTemplate(JSON.stringify([{ title: 'Other Page', sub_url: 'x' }]));
  assert.equal(notThere.status, 3, 'a listing that plainly lacks the title answers absent (3)');

  const there = runFindTemplate(JSON.stringify([{ title: 'Missing Page', sub_url: 'missing-page' }]));
  assert.equal(there.status, 0, 'a listing that carries the title answers found (0)');
  assert.deepEqual(JSON.parse(there.stdout), { sub_url: 'missing-page' });

  // `tea api` exits 0 on an HTTP error, so the status line is the only failure signal: a non-200
  // listing is "could not answer", never absence. A disabled wiki answers 404 here.
  const unauthorized = runFindTemplate(JSON.stringify({ message: 'token is invalid' }), '401 Unauthorized');
  assert.equal(unauthorized.status, 2, 'a non-200 listing must answer 2, never 3');
  const disabled = runFindTemplate(JSON.stringify({ message: 'wiki disabled' }), '404 Not Found');
  assert.equal(disabled.status, 2, 'a disabled wiki (404 listing) must answer 2, never 3');

  const malformed = runFindTemplate('not json at all');
  assert.equal(malformed.status, 2, 'a jq parse failure is not absence — must answer 2, never 3');

  // A full page of 50 is never the last page: find reads the next one, and only a short page ends
  // the listing. Every page must answer 200, or the whole find answers 2.
  function runPagedFind(pages) {
    const dir = fs.mkdtempSync(path.join(stubDir, 'pages-'));
    pages.forEach(([body, status], i) => {
      fs.writeFileSync(path.join(dir, `${i + 1}.body`), body);
      if (status) fs.writeFileSync(path.join(dir, `${i + 1}.status`), status);
    });
    return runFindTemplate('', '200 OK', oneLogin, { TEA_STUB_PAGE_DIR: dir });
  }
  const fullPage = JSON.stringify(Array.from({ length: 50 }, (_, i) => ({ title: `Page ${i}`, sub_url: `s${i}` })));
  const onPageTwo = runPagedFind([[fullPage], [JSON.stringify([{ title: 'Missing Page', sub_url: 'on-two' }])]]);
  assert.equal(onPageTwo.status, 0, 'a title on the second listing page answers found (0)');
  assert.deepEqual(JSON.parse(onPageTwo.stdout), { sub_url: 'on-two' });
  const absentAfterTwo = runPagedFind([[fullPage], [JSON.stringify([{ title: 'Other Page', sub_url: 'x' }])]]);
  assert.equal(absentAfterTwo.status, 3, 'a title on no page, ended by a short page, answers absent (3)');
  const emptyPageTwo = runPagedFind([[fullPage], ['[]']]);
  assert.equal(emptyPageTwo.status, 3, 'an empty page after a full one ends the listing as absent (3)');
  const pageTwoFails = runPagedFind([[fullPage], [JSON.stringify({ message: 'boom' }), '500 Internal Server Error']]);
  assert.equal(pageTwoFails.status, 2, 'a failed later page must answer 2, never 3');

  // The login is resolved from the host URL inside the template: none, or several, could not answer.
  const missPage = JSON.stringify([{ title: 'Other Page', sub_url: 'x' }]);
  assert.equal(runFindTemplate(missPage, '200 OK', JSON.stringify([{ name: 'o', url: 'https://example.org' }])).status, 2,
    'no login for the host must answer 2, never 3');
  assert.equal(runFindTemplate(missPage, '200 OK', JSON.stringify([{ name: 'a', url: HOST }, { name: 'b', url: HOST }])).status, 2,
    'several logins for the host must answer 2, never 3');
  assert.equal(runFindTemplate(missPage, '200 OK', '').status, 2, 'an unreadable login list must answer 2');
  const noTea = spawnSync('/bin/sh', ['-c', findTemplate], {
    env: { ...process.env, PATH: noTeaDir + path.delimiter + '/usr/bin' + path.delimiter + '/bin', SUPERDEV_KB_TITLE: 'Missing Page' },
    encoding: 'utf8',
  });
  assert.equal(noTea.status, 2, 'no tea on the path must answer 2, never 3');

  // Each failure names its cause and the exact login command on stderr, which publish-kb reports.
  const ADD = 'tea login add --url https://codeberg.org';
  const noLogin = runFindTemplate(missPage, '200 OK', JSON.stringify([{ name: 'o', url: 'https://example.org' }]));
  assert.match(noLogin.stderr, /no tea login for https:\/\/codeberg\.org/, 'no login is named');
  assert.ok(noLogin.stderr.includes(ADD), 'no login prints the tea login add command');
  const several = runFindTemplate(missPage, '200 OK', JSON.stringify([{ name: 'a', url: HOST }, { name: 'b', url: HOST }]));
  assert.match(several.stderr, /several tea logins match/, 'several logins are named as several');
  assert.ok(several.stderr.includes(ADD), 'several logins print the tea login add command');
  assert.match(several.stderr, /a, b/, 'several logins are named, comma-joined, so the operator can pick');
  assert.match(several.stderr, /SUPERDEV_KB_TEA_LOGIN=<name>/, 'several logins name the override variable');

  // SUPERDEV_KB_TEA_LOGIN picks one of the several matching logins; a name matching none answers 2.
  const twoLogins = JSON.stringify([{ name: 'a', url: HOST }, { name: 'b', url: HOST }, { name: 'z', url: 'https://example.org' }]);
  const picked = runFindTemplate(missPage, '200 OK', twoLogins, { SUPERDEV_KB_TEA_LOGIN: 'b' });
  assert.equal(picked.status, 3, 'a named login among several matches resolves, so the listing answers absent (3)');
  const unknown = runFindTemplate(missPage, '200 OK', twoLogins, { SUPERDEV_KB_TEA_LOGIN: 'nope' });
  assert.equal(unknown.status, 2, 'a named login matching none answers 2');
  assert.match(unknown.stderr, /SUPERDEV_KB_TEA_LOGIN/, 'an unknown name is reported against the variable');
  assert.match(unknown.stderr, /a, b/, 'an unknown name lists the matching logins');
  const offHost = runFindTemplate(missPage, '200 OK', twoLogins, { SUPERDEV_KB_TEA_LOGIN: 'z' });
  assert.equal(offHost.status, 2, 'a login for another host is not a match');
  assert.match(noTea.stderr, /tea is missing/, 'a missing tea is named');
  assert.ok(noTea.stderr.includes(ADD), 'a missing tea prints the tea login add command');

  // read, create, update, and delete: a non-2xx answer fails, and `read` never prints an error body.
  const templates = classifyBackend(realDoc).templates;
  function runVerb(verb, body, status, bodyFile) {
    return spawnSync('/bin/sh', ['-c', templates[verb]], {
      env: {
        ...process.env,
        PATH: stubDir + path.delimiter + process.env.PATH,
        TEA_STUB_BODY: body,
        TEA_STUB_STATUS: status,
        TEA_STUB_LOGINS: oneLogin,
        SUPERDEV_KB_TITLE: 'T',
        SUPERDEV_KB_SUB_URL: 'T',
        SUPERDEV_KB_BODY_FILE: bodyFile,
      },
      encoding: 'utf8',
    });
  }
  const bodyFile = path.join(stubDir, 'body.md');
  fs.writeFileSync(bodyFile, '# hi\n');
  const okRead = runVerb('read', JSON.stringify({ content_base64: Buffer.from('# page\n').toString('base64') }), '200 OK', bodyFile);
  assert.equal(okRead.status, 0);
  assert.equal(okRead.stdout, '# page\n', 'read prints the decoded page markdown');
  const badRead = runVerb('read', JSON.stringify({ message: 'nope' }), '404 Not Found', bodyFile);
  assert.notEqual(badRead.status, 0, 'read fails on a non-200 answer');
  assert.equal(badRead.stdout, '', 'read prints no error body as page content');
  for (const verb of ['create', 'update', 'delete']) {
    assert.equal(runVerb(verb, '', '200 OK', bodyFile).status, 0, `${verb} succeeds on a 2xx answer`);
    assert.notEqual(runVerb(verb, '', '409 Conflict', bodyFile).status, 0, `${verb} fails on a non-2xx answer`);
  }
  assert.match(templates.update, /title: \$title/, 'update always sends the title');
  assert.doesNotMatch(realDoc, /GITEA_TOKEN|Authorization|curl/, 'the knowledge-base config names no token env var, header, or curl');

  fs.rmSync(noTeaDir, { recursive: true, force: true });
  fs.rmSync(stubDir, { recursive: true, force: true });
}

// --- the real `### find` template in plugin/references/knowledge-base-confluence.md separates -------
// "genuinely absent" from a JSON object that carries no `results` key at all: a 200 response like
// `{"message":"err"}` makes `.results` read `null` instead of erroring, so `.results | length` reads 0
// and `.results[0]` reads `null` — indistinguishable from a genuine empty-results absence unless the
// template checks for the key first.
{
  const confluenceDoc = fs.readFileSync(
    path.join(__dirname, '..', 'plugin', 'references', 'knowledge-base-confluence.md'),
    'utf8',
  );
  const findTemplate = classifyBackend(confluenceDoc).templates.find;
  assert.ok(findTemplate, 'the Confluence seed still configures a find template');

  // Stubs `curl` on PATH so the template runs against canned stdin instead of the real network.
  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curl-stub-'));
  fs.writeFileSync(path.join(stubDir, 'curl'), '#!/bin/sh\nprintf "%s" "$CURL_STUB_BODY"\n', { mode: 0o755 });

  function runFindTemplate(body) {
    return spawnSync('/bin/sh', ['-c', findTemplate], {
      env: {
        ...process.env,
        PATH: stubDir + path.delimiter + process.env.PATH,
        CURL_STUB_BODY: body,
        SUPERDEV_KB_TITLE: 'Missing Page',
        CONFLUENCE_EMAIL: 'x',
        CONFLUENCE_API_TOKEN: 'x',
      },
      encoding: 'utf8',
    });
  }

  const there = runFindTemplate(JSON.stringify({ results: [{ id: '123', version: { number: 5 } }] }));
  assert.equal(there.status, 0, 'a results array carrying a match answers found (0)');
  assert.deepEqual(JSON.parse(there.stdout), { id: '123', version: '5' });

  const notThere = runFindTemplate(JSON.stringify({ results: [] }));
  assert.equal(notThere.status, 3, 'an empty results array answers absent (3)');

  const malformed = runFindTemplate('not json at all');
  assert.equal(malformed.status, 2, 'a jq parse failure is not absence — must answer 2, never 3');

  const noResultsKey = runFindTemplate(JSON.stringify({ message: 'err' }));
  assert.equal(
    noResultsKey.status,
    2,
    'a 200 response carrying no "results" key cannot answer absent — it could not answer at all',
  );

  fs.rmSync(stubDir, { recursive: true, force: true });
}

// --- the real `### read` template in plugin/references/knowledge-base-confluence.md prints the -------
// live storage-format body on stdout (ADR 0094, INV-0091, triage #677), never JSON.
{
  const confluenceDoc = fs.readFileSync(
    path.join(__dirname, '..', 'plugin', 'references', 'knowledge-base-confluence.md'),
    'utf8',
  );
  const readTemplate = classifyBackend(confluenceDoc).templates.read;
  assert.ok(readTemplate, 'the Confluence seed configures a read template');

  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'curl-stub-'));
  fs.writeFileSync(path.join(stubDir, 'curl'), '#!/bin/sh\nprintf "%s" "$CURL_STUB_BODY"\n', { mode: 0o755 });

  function runReadTemplate(body) {
    return spawnSync('/bin/sh', ['-c', readTemplate], {
      env: {
        ...process.env,
        PATH: stubDir + path.delimiter + process.env.PATH,
        CURL_STUB_BODY: body,
        SUPERDEV_KB_ID: '123',
        CONFLUENCE_EMAIL: 'x',
        CONFLUENCE_API_TOKEN: 'x',
      },
      encoding: 'utf8',
    });
  }

  const ok = runReadTemplate(JSON.stringify({ body: { storage: { value: '<p>Hi</p>' } } }));
  assert.equal(ok.status, 0, 'a response carrying body.storage.value answers 0');
  assert.equal(ok.stdout, '<p>Hi</p>\n', 'prints the live storage body on stdout, nothing else');

  const malformed = runReadTemplate('not json at all');
  assert.notEqual(malformed.status, 0, 'a jq parse failure must not answer 0 with no body');

  fs.rmSync(stubDir, { recursive: true, force: true });
}

console.log('publish-kb-templates.test.js: all assertions passed');
