'use strict';

// Suite for plugin/scripts/publish-kb.js: the pure readers — the body hash, the command templates,
// the staged page, the backend classification — and the pin that the publish code keeps no copy of
// what `lib/` owns. Requires the module (silent — it already guards its CLI entry with
// require.main === module, per ADR 0059). The other publish-kb suites (tests/publish-kb-*.test.js)
// call its exported `run()` against the fake backend; their shared fixtures live in
// tests/publish-kb-setup.js.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { publishKbPath, commandsDoc } = require('./publish-kb-setup');
const { assertSpawnDecided, boundFromSamples } = require('./spawn-verdict');
const { parseCommandsTemplates, parseStagedPage, classifyBackend, hashBody } = require(publishKbPath);

test('publish-kb-setup: requiring the shared helper registers no node:test case and no hook', () => {
  // A top-level test() or hook makes node:test run and print its summary when the process exits.
  const requireSetup = (timeout) =>
    spawnSync(process.execPath, ['-e', `require(${JSON.stringify(require.resolve('./publish-kb-setup'))})`], {
      encoding: 'utf8',
      timeout,
    });
  // Each calibration sample runs under its own 60s bound, as healthySpawn in tests/publish-kb-setup.js does.
  const r = requireSetup(
    boundFromSamples((i) => assertSpawnDecided(requireSetup(60000), `require publish-kb-setup sample ${i + 1}`)),
  );
  assertSpawnDecided(r, 'require publish-kb-setup');
  assert.deepEqual({ status: r.status, stdout: r.stdout }, { status: 0, stdout: '' });
});

test('hashBody: the digest algorithm is pinned by a literal, not derived from hashBody itself', () => {
  assert.equal(
    hashBody('live body.\n'),
    'a0a762cd24bd4014218d4b712b8ed28dd3b2a8d57a1629c6dac0abd11823e0ce',
    'hashBody is sha256 over the normalized body',
  );
});

test('parseCommandsTemplates: resolution by heading name, never by position', () => {
  const section = '### update\n\n```sh\nUPDATE_CMD\n```\n\n### find\n\n```sh\nFIND_CMD\n```\n';
  const t = parseCommandsTemplates(section);
  assert.equal(t.find, 'FIND_CMD', 'find resolves by its own heading regardless of order');
  assert.equal(t.update, 'UPDATE_CMD', 'update resolves by its own heading regardless of order');
  assert.equal(t.create, undefined, 'a verb with no subsection is simply absent');
});

test('parseCommandsTemplates: the shared fence rule (md-sections.js), tilde fences and longer openers included', () => {
  const section = '### find\n\n~~~sh\nFIND_CMD\n~~~\n\n### read\n\n````sh\nREAD ```x``` CMD\n````\n';
  const t = parseCommandsTemplates(section);
  assert.deepEqual([t.find, t.read], ['FIND_CMD', 'READ ```x``` CMD'], 'a tilde fence and a longer backtick opener each yield their whole template');
});

test('parseCommandsTemplates: a template fence never closed inside its verb\'s section refuses, naming that verb', () => {
  assert.throws(
    () => parseCommandsTemplates('### find\n\n```sh\nFIND_CMD\n\n### read\n\n```sh\nREAD_CMD\n```\n'),
    (e) => e.isRefusal && /unterminated fenced code block in ### find/.test(e.message),
    'an unterminated template fence refuses with its own cause, not a missing verb',
  );
});

test('parseStagedPage: frontmatter + quoting', () => {
  const p = parseStagedPage('---\ntitle: Plain title\naction: upsert\n---\nbody.\n');
  assert.equal(p.title, 'Plain title');
  assert.equal(p.action, 'upsert');
  assert.equal(p.body, 'body.\n');

  const tricky = 'a "quote", a $dollar, a `backtick`, and a\nnewline';
  const q = parseStagedPage(
    `---\ntitle: ${JSON.stringify(tricky)}\naction: upsert\n---\nb.\n`,
  );
  assert.equal(q.title, tricky, 'a double-quoted YAML scalar round-trips quotes/$/backtick/newline');
});

test('classifyBackend', () => {
  assert.equal(classifyBackend(null).kind, 'none', 'a missing knowledge-base doc reads as backend none');
  assert.equal(classifyBackend('- **Backend:** local file storage.\n').kind, 'local');
  assert.equal(classifyBackend('- **Backend:** none.\n').kind, 'none');
  assert.equal(
    classifyBackend('- **Backend:** Some Wiki.\n\nno commands section here\n').kind,
    'unconfigured',
    'a real backend with no ## Commands section is unconfigured, not local/none',
  );
  const b = classifyBackend(commandsDoc('- **Backend:** Some Wiki.'));
  assert.equal(b.kind, 'remote');
  assert.ok(b.templates.find && b.templates.create && b.templates.update && b.templates.delete);
});

test('scope.js owns the change-type set, the ref probe, and main-checkout resolution', () => {
  // The publish code is the CLI and the `lib/kb-*.js` modules it wires together.
  const libDir = path.join(path.dirname(publishKbPath), '..', 'lib');
  const src = [publishKbPath, ...fs.readdirSync(libDir).filter((f) => /^kb-.*\.js$/.test(f)).map((f) => path.join(libDir, f))]
    .map((f) => fs.readFileSync(f, 'utf8'))
    .join('\n');
  assert.doesNotMatch(src, /^(?:const|function)\s+(?:CHANGE_TYPES|refResolves)\b/m, 'publish-kb.js defines no copy of CHANGE_TYPES or refResolves');
  assert.doesNotMatch(src, /--git-common-dir/, 'publish-kb.js resolves the main checkout through scope.js, not its own git call');

  // Inside a submodule the main checkout is the submodule's own, never `.git/modules`.
  const { resolveMainCheckout } = require(publishKbPath);
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kb-submodule-')));
  try {
    const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'protocol.file.allow=always', ...a], { cwd, stdio: 'ignore' });
    const lib = path.join(base, 'lib');
    const sup = path.join(base, 'sup');
    fs.mkdirSync(lib);
    fs.mkdirSync(sup);
    git(lib, 'init', '-q', '-b', 'main');
    git(lib, 'commit', '-q', '--allow-empty', '-m', 'x');
    git(sup, 'init', '-q', '-b', 'main');
    git(sup, 'submodule', 'add', '-q', lib, 'vendor/lib');
    assert.equal(resolveMainCheckout(path.join(sup, 'vendor', 'lib')), path.join(sup, 'vendor', 'lib'));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('--help / -h: usage on stdout, exit 0, before any repository or backend is read', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-help-'));
  try {
    const cli = (...a) => spawnSync(process.execPath, [publishKbPath, ...a], { cwd: dir, encoding: 'utf8' });
    // A help request wins over an unknown argument beside it.
    for (const argv of [['--help'], ['-h'], ['--scope', 'x', '--help'], ['--allow-unmerged', '-h'], ['extra', '--help']]) {
      const r = cli(...argv);
      assert.equal(r.status, 0, `${argv.join(' ')} exits 0 outside a repository`);
      assert.match(r.stdout, /^usage: node publish-kb\.js/, `${argv.join(' ')} prints the usage`);
    }
    // As the value of --scope or --read it is data, never a help request: outside a repository both refuse.
    for (const argv of [['--scope', '-h'], ['--read', '--help']]) {
      const r = cli(...argv);
      assert.equal(r.status, 1, `${argv.join(' ')} is no help request`);
      assert.equal(r.stdout, '', `${argv.join(' ')} prints no usage`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

