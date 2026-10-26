'use strict';

// Suite for `tests/fixture-git.js`'s `copyFixture` and `templateOnce`: a copy is a real path, holds the template's
// repository as git reads it, and shares nothing with the template or another copy; a template is built once and removed
// when the process exits.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { copyFixture } = require('./fixture-git');

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const made = [];
const template = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-git-template-'));
made.push(template);

try {
  git(['init', '-q', '-b', 'main'], template);
  git(['config', 'user.email', 'test@example.com'], template);
  git(['config', 'user.name', 'test'], template);
  fs.writeFileSync(path.join(template, 'a.txt'), 'one\n');
  git(['add', '.'], template);
  git(['commit', '-q', '-m', 'init'], template);
  const head = git(['rev-parse', 'HEAD'], template);

  const a = copyFixture(template, 'fixture-git-a-');
  const b = copyFixture(template, 'fixture-git-b-');
  made.push(a, b);

  assert.strictEqual(a, fs.realpathSync(a), 'a copy is returned as its real path');
  assert.strictEqual(git(['rev-parse', '--show-toplevel'], a), a, 'git reports the copy at the returned path');
  assert.strictEqual(git(['rev-parse', 'HEAD'], a), head, 'a copy holds the template history');

  fs.writeFileSync(path.join(a, 'a.txt'), 'two\n');
  git(['commit', '-q', '-am', 'change'], a);
  assert.strictEqual(git(['rev-parse', 'HEAD'], template), head, 'a commit in a copy leaves the template');
  assert.strictEqual(git(['rev-parse', 'HEAD'], b), head, 'a commit in a copy leaves another copy');
  assert.strictEqual(fs.readFileSync(path.join(b, 'a.txt'), 'utf8'), 'one\n', 'a file write in a copy leaves another copy');
} finally {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
}

// `templateOnce(build, prefix)`: the template is built on the first call only, every call returns the same real path, and
// the template is removed when the process exits, also when it exits on an uncaught throw.
const { spawnSync } = require('node:child_process');
for (const [label, ending] of [['a clean exit', ''], ['an uncaught throw', "throw new Error('after the build');"]]) {
  const script =
    `const fs = require('node:fs'), path = require('node:path');` +
    `const { templateOnce } = require(${JSON.stringify(path.join(__dirname, 'fixture-git.js'))});` +
    `let builds = 0;` +
    `const template = templateOnce((dir) => { builds++; fs.writeFileSync(path.join(dir, 'a.txt'), 'one'); }, 'fixture-git-once-');` +
    `const a = template(), b = template();` +
    `console.log(JSON.stringify({ a, b, builds, real: fs.realpathSync(a), file: fs.readFileSync(path.join(a, 'a.txt'), 'utf8') }));` +
    ending;
  const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 30000 });
  assert.ok(r.stdout, `${label}: the child printed its template (${r.stderr})`);
  const seen = JSON.parse(r.stdout.trim().split('\n')[0]);
  try {
    assert.strictEqual(seen.builds, 1, `${label}: the template is built once`);
    assert.strictEqual(seen.b, seen.a, `${label}: every call returns the same template`);
    assert.strictEqual(seen.a, seen.real, `${label}: the template is returned as its real path`);
    assert.strictEqual(seen.file, 'one', `${label}: the template holds what the build wrote`);
    assert.strictEqual(fs.existsSync(seen.a), false, `${label}: the template is removed when the process exits`);
  } finally {
    fs.rmSync(seen.a, { recursive: true, force: true });
  }
}
