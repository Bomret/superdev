'use strict';

// Suite for plugin/scripts/publish-kb.js: the pure readers — the body hash, the command templates,
// the staged page, the backend classification — and the pin that the publish code keeps no copy of
// what `lib/` owns. Requires the module (silent — it already guards its CLI entry with
// require.main === module, per ADR 0059). The other publish-kb suites (tests/publish-kb-*.test.js)
// call its exported `run()` against the fake backend; their shared fixtures live in
// tests/publish-kb-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { publishKbPath, commandsDoc } = require('./publish-kb-setup');
const { parseCommandsTemplates, parseStagedPage, classifyBackend, hashBody } = require(publishKbPath);

// --- hashBody: the digest algorithm is pinned by a literal, not derived from hashBody itself ------
assert.equal(
  hashBody('live body.\n'),
  'a0a762cd24bd4014218d4b712b8ed28dd3b2a8d57a1629c6dac0abd11823e0ce',
  'hashBody is sha256 over the normalized body',
);

// --- parseCommandsTemplates: resolution by heading name, never by position -------------------
{
  const section = '### update\n\n```sh\nUPDATE_CMD\n```\n\n### find\n\n```sh\nFIND_CMD\n```\n';
  const t = parseCommandsTemplates(section);
  assert.equal(t.find, 'FIND_CMD', 'find resolves by its own heading regardless of order');
  assert.equal(t.update, 'UPDATE_CMD', 'update resolves by its own heading regardless of order');
  assert.equal(t.create, undefined, 'a verb with no subsection is simply absent');
}

// --- parseStagedPage: frontmatter + quoting -----------------------------------------------------
{
  const p = parseStagedPage('---\ntitle: Plain title\naction: upsert\n---\nbody.\n');
  assert.equal(p.title, 'Plain title');
  assert.equal(p.action, 'upsert');
  assert.equal(p.body, 'body.\n');

  const tricky = 'a "quote", a $dollar, a `backtick`, and a\nnewline';
  const q = parseStagedPage(
    `---\ntitle: ${JSON.stringify(tricky)}\naction: upsert\n---\nb.\n`,
  );
  assert.equal(q.title, tricky, 'a double-quoted YAML scalar round-trips quotes/$/backtick/newline');
}

// --- classifyBackend ------------------------------------------------------------------------
{
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
}

// --- scope.js owns the change-type set, the ref probe, and main-checkout resolution ------------------
{
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
}

console.log('publish-kb.test.js: all assertions passed');
