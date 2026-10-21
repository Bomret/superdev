'use strict';

// Suite for plugin/scripts/scope.js's `source-set` verb: the gap audit's source set, every tracked code file
// outside the test paths (ADR 0162). Each case builds its own git repository and calls the verb in-process.

require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { run } = require('./scope-setup');
const { usage } = require('../plugin/lib/usage.js');

const repos = [];
const repo = (files) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-source-set-')));
  repos.push(dir);
  const g = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 'test@example.com');
  g('config', 'user.name', 'test');
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  g('add', '-A');
  g('commit', '-q', '--allow-empty', '-m', 'fixture');
  return dir;
};

// The verb's stdout lines and its refusal, run from `cwd`.
const sourceSet = (cwd, ...args) => {
  const logged = [];
  const orig = console.log;
  console.log = (s) => logged.push(String(s));
  try {
    run(['source-set', ...args], cwd);
    return { ok: true, lines: logged.join('\n').split('\n').filter(Boolean) };
  } catch (e) {
    if (e.isRefusal) return { ok: false, err: e.message };
    throw e;
  } finally {
    console.log = orig;
  }
};

try {
  // A configured `## Test paths` entry decides what is a test: a file under it is omitted, a code file is printed.
  {
    const dir = repo({
      'docs/agents/verification.md': '# V\n\n## Test paths\n\n- `checks/`\n',
      'src/app.js': 'x\n',
      'checks/app.js': 'x\n',
      'tests/kept.js': 'x\n',
    });
    const res = sourceSet(dir);
    assert.ok(res.ok, res.err);
    assert.deepEqual(res.lines, ['src/app.js', 'tests/kept.js']);
  }

  // No `## Test paths` section: the run trace's defaults decide, a directory and a file-name pattern alike.
  {
    const dir = repo({
      'lib/a.py': 'x\n',
      'tests/a.py': 'x\n',
      'web/__tests__/b.ts': 'x\n',
      'web/b.test.ts': 'x\n',
      'web/b.ts': 'x\n',
    });
    assert.deepEqual(sourceSet(dir).lines, ['lib/a.py', 'web/b.ts']);
  }

  // Docs, configuration (dot-prefixed files among it), lockfiles, binary assets (images, fonts, archives, media,
  // native binaries, bytecode), and vendored or generated directories are no source; an untracked file is outside.
  // `dist/` and `build/` are generated only at the root, so `src/build/` stays; `vendor/` and `node_modules/` go at any depth.
  {
    const dir = repo({
      'README.md': 'x\n',
      'package.json': '{}\n',
      'conf/app.yaml': 'x\n',
      'conf/app.yml': 'x\n',
      'Cargo.toml': 'x\n',
      'bun.lock': 'x\n',
      'yarn.lock': 'x\n',
      'vendor/dep.go': 'x\n',
      'node_modules/m/index.js': 'x\n',
      'dist/out.js': 'x\n',
      'build/out.js': 'x\n',
      'web/vendor/dep.js': 'x\n',
      'src/build/tool.js': 'x\n',
      '.gitignore': 'x\n',
      '.editorconfig': 'x\n',
      'web/.npmrc': 'x\n',
      '.env.example': 'x\n',
      'assets/logo.png': 'x\n',
      'assets/photo.JPG': 'x\n',
      'assets/photo.jpeg': 'x\n',
      'assets/anim.gif': 'x\n',
      'assets/icon.svg': 'x\n',
      'favicon.ico': 'x\n',
      'assets/hero.webp': 'x\n',
      'docs/spec.pdf': 'x\n',
      'fonts/a.woff': 'x\n',
      'fonts/a.woff2': 'x\n',
      'fonts/a.ttf': 'x\n',
      'fonts/a.otf': 'x\n',
      'release/app.zip': 'x\n',
      'lib/dep.jar': 'x\n',
      'media/clip.mp4': 'x\n',
      'media/sound.wav': 'x\n',
      'native/libx.so': 'x\n',
      'native/x.dylib': 'x\n',
      'web/mod.wasm': 'x\n',
      'assets/old.bmp': 'x\n',
      'fonts/a.eot': 'x\n',
      'release/app.gz': 'x\n',
      'release/app.tar': 'x\n',
      'media/song.mp3': 'x\n',
      'native/x.dll': 'x\n',
      'native/x.exe': 'x\n',
      'release/app.tgz': 'x\n',
      'release/app.7z': 'x\n',
      'media/clip.mov': 'x\n',
      'media/clip.webm': 'x\n',
      'media/sound.ogg': 'x\n',
      'lib/Main.class': 'x\n',
      'pkg/mod.pyc': 'x\n',
      'native/x.o': 'x\n',
      'native/libx.a': 'x\n',
      CHANGELOG: 'x\n',
      AUTHORS: 'x\n',
      CODEOWNERS: 'x\n',
      CONTRIBUTORS: 'x\n',
      LICENCE: 'x\n',
      'LICENSE-MIT': 'x\n',
      'COPYING-GPL': 'x\n',
      README: 'x\n',
      HISTORY: 'x\n',
      CHANGES: 'x\n',
      'COPYING.LESSER': 'x\n',
      'LICENSE.APACHE': 'x\n',
      license: 'x\n',
      'legal/License-MIT': 'x\n',
      'docs/license-apache': 'x\n',
      'main.go': 'x\n',
      'lib/license.js': 'x\n',
      'src/License.java': 'x\n',
      'copying.py': 'x\n',
      'docs/readme': 'x\n',
      'docs/changelog': 'x\n',
      'lib/readme.js': 'x\n',
      'scripts/license-check.js': 'x\n',
      'lib/copying-utils.py': 'x\n',
    });
    fs.writeFileSync(path.join(dir, 'untracked.js'), 'x\n');
    assert.deepEqual(sourceSet(dir).lines, [
      'copying.py',
      'lib/copying-utils.py',
      'lib/license.js',
      'lib/readme.js',
      'main.go',
      'scripts/license-check.js',
      'src/License.java',
      'src/build/tool.js',
    ]);
  }

  // A <path> argument limits the set; a path that does not exist refuses, naming it.
  {
    const dir = repo({ 'a/one.js': 'x\n', 'b/two.js': 'x\n' });
    assert.deepEqual(sourceSet(dir, 'a').lines, ['a/one.js']);
    assert.deepEqual(sourceSet(path.join(dir, 'b'), '.').lines, ['b/two.js'], 'paths stay repository-relative');
    const res = sourceSet(dir, 'nowhere');
    assert.equal(res.ok, false);
    assert.match(res.err, /nowhere/);
  }

  // Outside any git repository the verb refuses.
  {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-source-set-nogit-')));
    repos.push(dir);
    const res = sourceSet(dir);
    assert.equal(res.ok, false);
    assert.match(res.err, /not inside a git repository/);
  }

  // No code outside the test paths: nothing printed, no refusal.
  {
    const dir = repo({ 'tests/only.js': 'x\n', 'README.md': 'x\n' });
    const res = sourceSet(dir);
    assert.ok(res.ok, res.err);
    assert.deepEqual(res.lines, []);
  }

  // A listing past Node's 1 MiB default spawn buffer still prints. The entries go straight into the index, all
  // pointing at one blob, which skips a slow `git add`; each file is still written, since only a file on disk prints.
  {
    const dir = repo({ 'seed.js': 'x\n' });
    const blob = execFileSync('git', ['hash-object', '-w', 'seed.js'], { cwd: dir, encoding: 'utf8' }).trim();
    const stem = 'a'.repeat(200);
    fs.mkdirSync(path.join(dir, 'src'));
    for (let i = 0; i < 6000; i++) fs.writeFileSync(path.join(dir, 'src', `${stem}${i}.js`), 'x\n');
    const entries = Array.from({ length: 6000 }, (_, i) => `100644 ${blob}\tsrc/${stem}${i}.js`);
    execFileSync('git', ['update-index', '--index-info'], { cwd: dir, input: entries.join('\n') + '\n' });
    const res = sourceSet(dir);
    assert.ok(res.ok, res.err);
    assert.equal(res.lines.length, 6001);
  }

  // A submodule gitlink (mode 160000, a directory) and a tracked file deleted from the working tree are no readable
  // file, so neither is printed. The gitlink goes straight into the index; no real submodule is needed.
  {
    const dir = repo({ 'kept.js': 'x\n', 'gone.js': 'x\n' });
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
    execFileSync('git', ['update-index', '--add', '--cacheinfo', `160000,${sha},sub`], { cwd: dir });
    fs.rmSync(path.join(dir, 'gone.js'));
    assert.deepEqual(sourceSet(dir).lines, ['kept.js']);
  }

  // The usage text lists the verb.
  assert.match(usage(), /^ {2}source-set \[<path>\]/m);

  console.log('scope-source-set.test.js: all assertions passed');
} finally {
  for (const dir of repos) fs.rmSync(dir, { recursive: true, force: true });
}
