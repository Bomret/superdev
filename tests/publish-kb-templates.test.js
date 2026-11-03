'use strict';

// Suite for plugin/scripts/publish-kb.js: the real backend templates this repository ships —
// `docs/agents/knowledge-base.md`, the Forgejo wiki seed, and the Confluence seed — run through
// `classifyBackend` against stubbed `gh`, `tea`, and `curl` commands and a local wiki repository,
// pinning which exit code each template produces.

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
// The Forgejo wiki seed carries the same templates once its placeholders are filled, so both documents
// run through the same pins.
// The values file a backend command takes as `$1`, written under a directory this suite removes at its end.
const valuesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-values-templates-'));
let valuesCount = 0;
function valuesFile(values) {
  const file = path.join(valuesDir, `values-${valuesCount++}.json`);
  fs.writeFileSync(file, JSON.stringify(values));
  return file;
}

const hostileTitle = 'A $(touch x) `y` \'q\' "d"\nsecond line';

function pinForgejoTemplates(realDoc, HOST) {
  const findTemplate = classifyBackend(realDoc).templates.find;
  assert.ok(findTemplate, 'the Forgejo knowledge-base document configures a find template');

  // Stubs `tea` on PATH so the template runs against a canned response instead of the real network:
  // `tea login list -o json` answers TEA_STUB_LOGINS, and `tea api` writes the status line `-i` gives to
  // stderr and the body to stdout. With TEA_STUB_PAGE_DIR set, a listing call answers the files
  // `<page>.body` and `<page>.status` there, `<page>` read from the URL's `page=` parameter.
  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tea-stub-'));
  fs.writeFileSync(path.join(stubDir, 'tea'),
    '#!/bin/sh\n' +
    'if [ "$1" = login ]; then printf "%s" "$TEA_STUB_LOGINS"; exit 0; fi\n' +
    '[ -n "$TEA_STUB_STDIN" ] && cat > "$TEA_STUB_STDIN"\n' +
    'for a; do last=$a; done\n' +
    '[ -n "$TEA_STUB_PATH_LOG" ] && echo "$last" >> "$TEA_STUB_PATH_LOG"\n' +
    'case "$last" in /repos/*/wiki/*) ;; /repos/*) [ -n "$TEA_STUB_REPO_LOG" ] && echo repo >> "$TEA_STUB_REPO_LOG"\n' +
    '  [ -n "$TEA_STUB_REPO_STATUS" ] && printf "%s\\n" "$TEA_STUB_REPO_STATUS" >&2\n' +
    '  printf "%s" "$TEA_STUB_REPO_BODY"; exit 0 ;; esac\n' +
    'if [ -n "$TEA_STUB_PAGE_DIR" ]; then for a; do url=$a; done\n' +
    '  p=$(printf "%s" "$url" | sed -n "s/.*[?&]page=\\([0-9]*\\).*/\\1/p")\n' +
    '  printf "HTTP/2.0 %s\\n" "$(cat "$TEA_STUB_PAGE_DIR/$p.status" 2>/dev/null || echo 200 OK)" >&2\n' +
    '  cat "$TEA_STUB_PAGE_DIR/$p.body"; exit 0; fi\n' +
    'printf "HTTP/2.0 %s\\n" "$TEA_STUB_STATUS" >&2\nprintf "%s" "$TEA_STUB_BODY"\n', { mode: 0o755 });
  // A PATH holding `jq` and the system tools but no `tea`: the "no tea installed" case.
  const noTeaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-tea-'));
  // A copy, not a symlink: a Windows runner may lack the symlink privilege.
  fs.copyFileSync(spawnSync('sh',['-c', 'p=$(command -v jq); if command -v cygpath >/dev/null; then cygpath -w "$p"; else echo "$p"; fi'],{ encoding: 'utf8' }).stdout.trim(), path.join(noTeaDir, 'jq'));

  const oneLogin = JSON.stringify([
    { name: 'other', url: 'https://example.org', user: 'x' },
    { name: 'cb', url: HOST, user: 'bomret' },
  ]);

  function runFindTemplate(body, status = '200 OK', logins = oneLogin, extraEnv = {}, operator = {}, title = 'Missing Page') {
    return spawnSync('sh',['-c', findTemplate, 'sh', valuesFile({ title, operator })], {
      env: {
        ...process.env,
        PATH: stubDir + path.delimiter + process.env.PATH,
        TEA_STUB_BODY: body,
        TEA_STUB_STATUS: status,
        TEA_STUB_LOGINS: logins,
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

  // A title holding shell syntax, quotes, or a newline is matched byte for byte against the listing.
  const hostile = hostileTitle;
  const hostileHit = runFindTemplate(JSON.stringify([{ title: 'A', sub_url: 'a' }, { title: hostile, sub_url: 'hostile' }]), '200 OK', oneLogin, {}, {}, hostile);
  assert.equal(hostileHit.status, 0, hostileHit.stderr);
  assert.deepEqual(JSON.parse(hostileHit.stdout), { sub_url: 'hostile' }, 'find matches the title exactly as staged');

  // `tea api` exits 0 on an HTTP error, so the status line is the only failure signal: a non-200
  // listing is "could not answer", never absence, and reads no repository.
  const repoLog = path.join(stubDir, 'repo.log');
  const repoReads = () => (fs.existsSync(repoLog) ? fs.readFileSync(repoLog, 'utf8').trim().split('\n').length : 0);
  for (const status of ['401 Unauthorized', '403 Forbidden', '500 Internal Server Error']) {
    fs.rmSync(repoLog, { force: true });
    const failed = runFindTemplate(JSON.stringify({ message: 'no' }), status, oneLogin,
      { TEA_STUB_REPO_LOG: repoLog, TEA_STUB_REPO_STATUS: 'HTTP/2.0 200 OK', TEA_STUB_REPO_BODY: JSON.stringify({ has_wiki: true, external_wiki: null }) });
    assert.equal(failed.status, 2, `a ${status} first listing page must answer 2, never 3`);
    assert.equal(repoReads(), 0, `a ${status} first listing page reads no repository`);
  }

  // A 404 first listing page is an enabled empty wiki only when the repository read confirms an
  // enabled internal wiki (observed 2026-10-22, Codeberg, bomret/open-settlers).
  const notFound = JSON.stringify({ message: 'no such file or directory' });
  function runEmptyWiki(repoStatus, repoBody) {
    return runFindTemplate(notFound, '404 Not Found', oneLogin,
      { TEA_STUB_REPO_STATUS: repoStatus, TEA_STUB_REPO_BODY: repoBody });
  }
  const emptyWiki = runEmptyWiki('HTTP/2.0 200 OK', JSON.stringify({ has_wiki: true, external_wiki: null }));
  assert.equal(emptyWiki.status, 3, 'an enabled empty internal wiki answers absent (3)');
  const disabled = runEmptyWiki('HTTP/2.0 200 OK', JSON.stringify({ has_wiki: false, external_wiki: null }));
  assert.equal(disabled.status, 2, 'a disabled wiki must answer 2, never 3');
  assert.match(disabled.stderr, /wiki is disabled/, 'a disabled wiki is named on stderr');
  const external = runEmptyWiki('HTTP/2.0 200 OK', JSON.stringify({ has_wiki: true, external_wiki: { external_wiki_url: 'https://x' } }));
  assert.equal(external.status, 2, 'an external wiki must answer 2, never 3');
  assert.match(external.stderr, /external wiki/, 'an external wiki is named on stderr');
  for (const [repoStatus, repoBody, what] of [
    ['HTTP/2.0 404 Not Found', JSON.stringify({ message: 'nope' }), 'a non-200 repository read'],
    ['HTTP/2.0 200 OK', 'not json', 'an unparseable repository body'],
    ['', JSON.stringify({ has_wiki: true, external_wiki: null }), 'no readable status line'],
  ]) {
    const failed = runEmptyWiki(repoStatus, repoBody);
    assert.equal(failed.status, 2, `${what} must answer 2, never 3`);
    assert.match(failed.stderr, /repository read failed/, `${what} is named as a failed repository read`);
  }

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
  fs.rmSync(repoLog, { force: true });
  const pageTwoNotFound = runFindTemplate('', '200 OK', oneLogin, {
    TEA_STUB_PAGE_DIR: (() => { const d = fs.mkdtempSync(path.join(stubDir, 'pages-'));
      fs.writeFileSync(path.join(d, '1.body'), fullPage);
      fs.writeFileSync(path.join(d, '2.body'), notFound); fs.writeFileSync(path.join(d, '2.status'), '404 Not Found'); return d; })(),
    TEA_STUB_REPO_LOG: repoLog, TEA_STUB_REPO_STATUS: 'HTTP/2.0 200 OK',
    TEA_STUB_REPO_BODY: JSON.stringify({ has_wiki: true, external_wiki: null }),
  });
  assert.equal(pageTwoNotFound.status, 2, 'a 404 on a later listing page must answer 2, never 3');
  assert.equal(repoReads(), 0, 'a 404 on a later listing page reads no repository');

  // The login is resolved from the host URL inside the template: none, or several, could not answer.
  const missPage = JSON.stringify([{ title: 'Other Page', sub_url: 'x' }]);
  assert.equal(runFindTemplate(missPage, '200 OK', JSON.stringify([{ name: 'o', url: 'https://example.org' }])).status, 2,
    'no login for the host must answer 2, never 3');
  assert.equal(runFindTemplate(missPage, '200 OK', JSON.stringify([{ name: 'a', url: HOST }, { name: 'b', url: HOST }])).status, 2,
    'several logins for the host must answer 2, never 3');
  assert.equal(runFindTemplate(missPage, '200 OK', '').status, 2, 'an unreadable login list must answer 2');
  const noTea = spawnSync('sh',['-c', findTemplate, 'sh', valuesFile({ title: 'Missing Page', operator: {} })], {
    env: { ...process.env, PATH: noTeaDir + path.delimiter + '/usr/bin' + path.delimiter + '/bin' },
    encoding: 'utf8',
  });
  assert.equal(noTea.status, 2, 'no tea on the path must answer 2, never 3');

  // Each failure names its cause and the exact login command on stderr, which publish-kb reports.
  const ADD = `tea login add --url ${HOST}`;
  const noLogin = runFindTemplate(missPage, '200 OK', JSON.stringify([{ name: 'o', url: 'https://example.org' }]));
  assert.ok(noLogin.stderr.includes(`no tea login for ${HOST}`), 'no login is named');
  assert.ok(noLogin.stderr.includes(ADD), 'no login prints the tea login add command');
  const several = runFindTemplate(missPage, '200 OK', JSON.stringify([{ name: 'a', url: HOST }, { name: 'b', url: HOST }]));
  assert.match(several.stderr, /several tea logins match/, 'several logins are named as several');
  assert.ok(several.stderr.includes(ADD), 'several logins print the tea login add command');
  assert.match(several.stderr, /a, b/, 'several logins are named, comma-joined, so the operator can pick');
  assert.match(several.stderr, /knowledge-base\.teaLogin/, 'several logins name the operator configuration key');

  // `knowledge-base.teaLogin` picks one of the several matching logins; a name matching none answers 2.
  const twoLogins = JSON.stringify([{ name: 'a', url: HOST }, { name: 'b', url: HOST }, { name: 'z', url: 'https://example.org' }]);
  const picked = runFindTemplate(missPage, '200 OK', twoLogins, {}, { teaLogin: 'b' });
  assert.equal(picked.status, 3, 'a named login among several matches resolves, so the listing answers absent (3)');
  const unknown = runFindTemplate(missPage, '200 OK', twoLogins, {}, { teaLogin: 'nope' });
  assert.equal(unknown.status, 2, 'a named login matching none answers 2');
  assert.match(unknown.stderr, /knowledge-base\.teaLogin/, 'an unknown name is reported against the key');
  assert.match(unknown.stderr, /a, b/, 'an unknown name lists the matching logins');
  const offHost = runFindTemplate(missPage, '200 OK', twoLogins, {}, { teaLogin: 'z' });
  assert.equal(offHost.status, 2, 'a login for another host is not a match');
  assert.match(noTea.stderr, /tea is missing/, 'a missing tea is named');
  assert.ok(noTea.stderr.includes(ADD), 'a missing tea prints the tea login add command');

  // read, create, update, and delete: a non-2xx answer fails, and `read` never prints an error body.
  const templates = classifyBackend(realDoc).templates;
  // `found.sub_url` differs from the title, so the request path shows which of the two a template addresses.
  const SUB_URL = 'sub-of-t';
  const pathLog = path.join(stubDir, 'paths.log');
  function runVerb(verb, body, status, bodyFile) {
    fs.rmSync(pathLog, { force: true });
    return spawnSync('sh',['-c', templates[verb], 'sh', valuesFile({ title: 'T', bodyFile, found: { sub_url: SUB_URL }, operator: {} })], {
      env: {
        ...process.env,
        PATH: stubDir + path.delimiter + process.env.PATH,
        TEA_STUB_BODY: body,
        TEA_STUB_STATUS: status,
        TEA_STUB_LOGINS: oneLogin,
        TEA_STUB_PATH_LOG: pathLog,
      },
      encoding: 'utf8',
    });
  }
  const requested = () => fs.readFileSync(pathLog, 'utf8').trim().split('\n');
  const bodyFile = path.join(stubDir, 'body.md');
  fs.writeFileSync(bodyFile, '# hi\n');
  const okRead = runVerb('read', JSON.stringify({ content_base64: Buffer.from('# page\n').toString('base64') }), '200 OK', bodyFile);
  assert.equal(okRead.status, 0);
  assert.equal(okRead.stdout, '# page\n', 'read prints the decoded page markdown');
  // The parent-link edit runs `read` then `update` on the parent with the parent's find result as `found`.
  assert.match(requested().join('\n'), new RegExp(`/wiki/page/${SUB_URL}$`), 'read addresses .found.sub_url');
  const badRead = runVerb('read', JSON.stringify({ message: 'nope' }), '404 Not Found', bodyFile);
  assert.notEqual(badRead.status, 0, 'read fails on a non-200 answer');
  assert.equal(badRead.stdout, '', 'read prints no error body as page content');
  for (const verb of ['create', 'update', 'delete']) {
    assert.equal(runVerb(verb, '', '200 OK', bodyFile).status, 0, `${verb} succeeds on a 2xx answer`);
    if (verb !== 'create') assert.deepEqual(requested().map((p) => p.split('/wiki/page/')[1]), [SUB_URL], `${verb} addresses .found.sub_url`);
    assert.notEqual(runVerb(verb, '', '409 Conflict', bodyFile).status, 0, `${verb} fails on a non-2xx answer`);
  }
  // create and update send the staged title, from the values file, byte for byte, with the body base64-encoded.
  for (const verb of ['create', 'update']) {
    const stdin = path.join(stubDir, `${verb}.stdin`);
    const sent = spawnSync('sh',['-c', templates[verb], 'sh', valuesFile({ title: hostileTitle, bodyFile, found: { sub_url: SUB_URL }, operator: {} })], {
      env: { ...process.env, PATH: stubDir + path.delimiter + process.env.PATH, TEA_STUB_STATUS: '200 OK', TEA_STUB_LOGINS: oneLogin, TEA_STUB_STDIN: stdin },
      encoding: 'utf8',
    });
    assert.equal(sent.status, 0, sent.stderr);
    const payload = JSON.parse(fs.readFileSync(stdin, 'utf8'));
    assert.equal(payload.title, hostileTitle, `${verb} always sends the staged title, byte for byte`);
    assert.equal(Buffer.from(payload.content_base64, 'base64').toString(), '# hi\n', `${verb} sends the body file's content`);
  }
  assert.doesNotMatch(realDoc, /GITEA_TOKEN|Authorization|curl/, 'the knowledge-base config names no token env var, header, or curl');

  fs.rmSync(noTeaDir, { recursive: true, force: true });
  fs.rmSync(stubDir, { recursive: true, force: true });
}

// --- this repository's own GitHub wiki templates clone, change, and push the wiki repository. A
// `url.<local>.insteadOf` entry in the git environment points the clone at a local bare repository,
// and a stub `gh` answers the login check and the user lookup.
function pinGithubWikiTemplates(realDoc, HOST, REPO) {
  const { templates } = classifyBackend(realDoc);
  const wikiUrl = `https://${HOST}/${REPO}.wiki.git`;
  for (const verb of ['find', 'read', 'create', 'update', 'delete']) assert.ok(templates[verb], `the GitHub wiki document configures a ${verb} template`);
  assert.doesNotMatch(realDoc, /GITEA_TOKEN|GH_TOKEN|GITHUB_TOKEN|Authorization|curl/, 'the knowledge-base config names no token env var, header, or curl');

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gh-wiki-'));
  const bare = path.join(work, 'wiki.git');
  const git = (args, cwd = work) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  };
  git(['init', '-q', '--bare', '-b', 'master', bare]);
  const seedTree = path.join(work, 'seed');
  git(['clone', '-q', bare, seedTree]);
  fs.writeFileSync(path.join(seedTree, 'Home.md'), '# home\n');
  git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'add', 'Home.md'], seedTree);
  git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'seed'], seedTree);
  git(['push', '-q', 'origin', 'HEAD'], seedTree);

  const ghDir = path.join(work, 'bin');
  fs.mkdirSync(ghDir);
  // The stub `gh` logs every call; GH_STUB_FAIL fails every call, GH_STUB_API_FAIL fails only `gh api`.
  const ghLog = path.join(work, 'gh.log');
  const gitLog = path.join(work, 'git.log');
  fs.writeFileSync(path.join(ghDir, 'gh'),
    '#!/bin/sh\necho "$*" >> "$GH_STUB_LOG"\n[ -n "$GH_STUB_FAIL" ] && exit 1\n' +
    '[ "$1" = api ] && { [ -n "$GH_STUB_API_FAIL" ] && { echo "HTTP 401: bad credentials" >&2; exit 1; }; echo tester; }\nexit 0\n', { mode: 0o755 });
  // A `git` wrapper logs the prompt setting and the arguments of each call, then runs the real git.
  const realGit = spawnSync('sh',['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  fs.writeFileSync(path.join(ghDir, 'git'),
    `#!/bin/sh\necho "prompt=$GIT_TERMINAL_PROMPT $*" >> "$GIT_STUB_LOG"\nexec ${realGit} "$@"\n`, { mode: 0o755 });
  const n = Number(process.env.GIT_CONFIG_COUNT || 0);
  const env = (extra = {}) => ({
    ...process.env,
    PATH: ghDir + path.delimiter + process.env.PATH,
    GH_STUB_LOG: ghLog,
    GIT_STUB_LOG: gitLog,
    GIT_CONFIG_COUNT: String(n + 1),
    [`GIT_CONFIG_KEY_${n}`]: `url.file://${bare}.insteadOf`,
    [`GIT_CONFIG_VALUE_${n}`]: wikiUrl,
    ...extra,
  });
  const run = (verb, values, extra) => spawnSync('sh',['-c', templates[verb], 'sh', valuesFile(values)], { env: env(extra), encoding: 'utf8' });
  const body = path.join(work, 'body.md');
  fs.writeFileSync(body, '# hi\n');
  const title = 'Guide: Plan a feature';

  assert.equal(run('find', { title }).status, 3, 'a clone without the page file answers absent (3)');
  assert.equal(run('find', { title }, { GH_STUB_FAIL: '1' }).status, 2, 'a gh with no login could not answer (2)');
  const broken = spawnSync('sh',['-c', templates.find, 'sh', valuesFile({ title })], { env: env({ [`GIT_CONFIG_KEY_${n}`]: `url.file://${work}/missing.git.insteadOf` }), encoding: 'utf8' });
  assert.equal(broken.status, 2, 'a failed clone could not answer (2), never absent');
  assert.equal(run('update', { title, bodyFile: body }).status, 1, 'update of an absent page fails');
  const created = run('create', { title, bodyFile: body });
  assert.equal(created.status, 0, created.stderr);
  const found = run('find', { title });
  assert.equal(found.status, 0, found.stderr);
  assert.deepEqual(JSON.parse(found.stdout), { sub_url: 'Guide:-Plan-a-feature' }, 'find emits the file name without .md');
  const read = run('read', { title, found: { sub_url: 'Guide:-Plan-a-feature' } });
  assert.equal(read.stdout, '# hi\n', 'read returns the page body');
  fs.writeFileSync(body, '# changed\n');
  assert.equal(run('update', { title, bodyFile: body, found: {} }).status, 0, 'update of a present page lands');
  assert.equal(run('read', { title, found: {} }).stdout, '# changed\n', 'update replaced the body');
  assert.equal(run('delete', { title, found: {} }).status, 0, 'delete lands');
  assert.equal(run('find', { title }).status, 3, 'a deleted page is absent');

  // A clone failure names its cause on stderr.
  assert.match(broken.stderr, /cannot clone/, 'a failed clone names its cause on stderr');

  // A title holding a character NTFS forbids in a file name is written and read through git objects,
  // so no work-tree file ever carries the name (the Windows CI job runs this case).
  const colonTitle = 'Guide: Install';
  fs.writeFileSync(body, '# install\n');
  const colonCreated = run('create', { title: colonTitle, bodyFile: body });
  assert.equal(colonCreated.status, 0, colonCreated.stderr);
  const colonFound = run('find', { title: colonTitle });
  assert.equal(colonFound.status, 0, colonFound.stderr);
  assert.deepEqual(JSON.parse(colonFound.stdout), { sub_url: 'Guide:-Install' });
  assert.equal(run('read', { title: colonTitle, found: {} }).stdout, '# install\n', 'read returns the colon-titled page body');

  // The page file name matches exactly: `home` is not the seeded `Home.md`, on any file system.
  assert.equal(run('find', { title: 'home' }).status, 3, 'a title differing only in case answers absent (3)');

  // A values file with no title, an empty one, or a title holding / makes every template fail with its cause,
  // before anything is cloned or written, and find never answers absent.
  const refusals = [
    [{ bodyFile: body, found: {} }, /title/, 'fails without a title'],
    [{ title: '', bodyFile: body, found: {} }, /title/, 'fails with an empty title'],
    [{ title: 5, bodyFile: body, found: {} }, /title/, 'fails with a non-string title'],
    [{ title: ['a'], bodyFile: body, found: {} }, /title/, 'fails with an array title'],
    [{ title: 'Guide: a/b', bodyFile: body, found: {} }, /holds \//, 'refuses a title holding /'],
  ];
  for (const verb of ['find', 'read', 'create', 'update', 'delete']) {
    for (const [values, cause, what] of refusals) {
      const r = run(verb, values);
      assert.notEqual(r.status, 0, `${verb} ${what}`);
      assert.notEqual(r.status, 3, `${verb} does not answer absent: ${what}`);
      assert.match(r.stderr, cause, `${verb} names the cause on stderr: ${what}`);
    }
  }

  // An unchanged update lands nothing and exits 0.
  const page = 'Plain Page';
  fs.writeFileSync(body, '# one\n');
  assert.equal(run('create', { title: page, bodyFile: body }).status, 0, 'create writes the page');
  const commits = () => spawnSync('git', ['-C', bare, 'rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const before = commits();
  const same = run('update', { title: page, bodyFile: body, found: {} });
  assert.equal(same.status, 0, `update with an unchanged body exits 0: ${same.stderr}`);
  assert.equal(commits(), before, 'update with an unchanged body commits nothing');

  // The login check, the user lookup, and every clone URL name the host; no call can wait on a prompt.
  fs.rmSync(ghLog, { force: true });
  fs.rmSync(gitLog, { force: true });
  assert.equal(run('create', { title: 'Logged Page', bodyFile: body }).status, 0);
  const ghCalls = fs.readFileSync(ghLog, 'utf8');
  assert.ok(ghCalls.includes(`auth status --hostname ${HOST}`), 'the login check names the host');
  assert.ok(ghCalls.includes(`api --hostname ${HOST} user`), 'the identity lookup names the host');
  assert.equal(ghCalls.split('\n').filter((l) => l.startsWith('api ')).length, 1, 'the identity lookup runs once');
  const gitCalls = fs.readFileSync(gitLog, 'utf8').split('\n').filter((l) => / (clone|push) /.test(l));
  assert.equal(gitCalls.length, 2, 'one clone and one push');
  for (const call of gitCalls) {
    assert.match(call, /^prompt=0 /, 'git never prompts for a password');
    assert.ok(call.includes("credential.helper=!gh auth git-credential"), 'the gh helper serves git');
  }
  assert.ok(gitCalls[0].includes(wikiUrl), 'the clone URL names the host and repository');

  // A failed identity lookup fails with its cause and pushes nothing.
  const lookupBefore = commits();
  const noId = run('create', { title: 'Orphan Page', bodyFile: body }, { GH_STUB_API_FAIL: '1' });
  assert.notEqual(noId.status, 0, 'a failed identity lookup fails');
  assert.match(noId.stderr, /bad credentials/, 'the lookup failure names its cause');
  assert.equal(commits(), lookupBefore, 'a failed identity lookup pushes nothing');

  // A GH_TOKEN in the environment reaches no logged git or gh argv and no failed clone's stderr.
  const token = 'ghp_superdevTokenCanary0123456789';
  fs.rmSync(ghLog, { force: true });
  fs.rmSync(gitLog, { force: true });
  assert.equal(run('create', { title: 'Token Page', bodyFile: body }, { GH_TOKEN: token }).status, 0);
  const tokenBroken = spawnSync('sh',['-c', templates.find, 'sh', valuesFile({ title })],
    { env: env({ GH_TOKEN: token, [`GIT_CONFIG_KEY_${n}`]: `url.file://${work}/missing.git.insteadOf` }), encoding: 'utf8' });
  assert.equal(tokenBroken.status, 2);
  for (const [what, text] of [['gh argv', fs.readFileSync(ghLog, 'utf8')], ['git argv', fs.readFileSync(gitLog, 'utf8')], ['clone stderr', tokenBroken.stderr]]) {
    assert.ok(!text.includes(token), `the ${what} carries no GH_TOKEN value`);
  }

  // The login check failing answers 2 and names the host.
  const noLogin = run('find', { title }, { GH_STUB_FAIL: '1' });
  assert.equal(noLogin.status, 2);
  assert.ok(noLogin.stderr.includes(HOST), 'the missing login names the host');

  // Portable shell only: no GNU-only or BSD-only option in a template.
  for (const t of Object.values(templates).filter((x) => typeof x === 'string')) {
    assert.doesNotMatch(t, /sed -i|readlink -f|mktemp -[tp]|mktemp [^-]|date -d|stat -c|xargs -r/, 'templates use portable flags only');
  }
  fs.rmSync(work, { recursive: true, force: true });
}
{
  pinGithubWikiTemplates(fs.readFileSync(path.join(__dirname, '..', 'docs', 'agents', 'knowledge-base.md'), 'utf8'), 'github.com', 'Bomret/superdev');
  const seedPath = path.join(__dirname, '..', 'plugin', 'references', 'knowledge-base-github-wiki.md');
  const seed = fs.readFileSync(seedPath, 'utf8');
  const filled = seed.replaceAll('<host>', 'git.example.org').replaceAll('<owner>/<repo>', 'acme/widgets');
  assert.doesNotMatch(filled, /<host>|<owner>|<repo>|bomret\/superdev|github\.com/i, 'the seed names its host and repository only through the placeholders');
  pinGithubWikiTemplates(filled, 'git.example.org', 'acme/widgets');
  assert.match(seed, /^- \*\*Hierarchy:\*\* links/m, 'the seed declares body-link hierarchy');
  assert.ok(seed.includes('https://<host>/<owner>/<repo>/wiki/{sub_url}'), 'the seed carries the link line form under the wiki URL');
  assert.ok(filled.includes('https://git.example.org/acme/widgets/wiki/{sub_url}'), 'the filled seed link line names the host and repository');
  assert.doesNotMatch(seed, /GH_TOKEN|GITHUB_TOKEN|Authorization|curl/, 'the seed names no token env var, header, or curl');
}
{
  const seed = fs.readFileSync(path.join(__dirname, '..', 'plugin', 'references', 'knowledge-base-forgejo.md'), 'utf8');
  const filled = seed.replaceAll('<host>', 'https://forgejo.example.org').replaceAll('<owner>/<repo>', 'acme/widgets');
  assert.doesNotMatch(filled, /<host>|<owner>|<repo>|bomret\/superdev/, 'the seed names its host and repository only through the placeholders');
  pinForgejoTemplates(filled, 'https://forgejo.example.org');
  assert.match(seed, /^- \*\*Hierarchy:\*\* links/m, 'the seed declares body-link hierarchy');
  assert.ok(seed.includes('- [<title>](<host>/<owner>/<repo>/wiki/{sub_url}): <one line>'), 'the seed carries the link line form under the wiki URL');
  assert.ok(seed.includes('-X PATCH -F has_wiki=true /repos/<owner>/<repo>'), 'the seed gives the re-enable command');
  assert.match(seed, /Gitea/, 'the seed names Gitea');
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
    return spawnSync('sh',['-c', readTemplate, 'sh', valuesFile({ title: 'T', found: { id: '123', version: 4 }, operator: {} })], {
      env: {
        ...process.env,
        PATH: stubDir + path.delimiter + process.env.PATH,
        CURL_STUB_BODY: body,
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
