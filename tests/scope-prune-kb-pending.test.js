'use strict';

// Suite for plugin/hooks/scope-prune.js, the reap of an empty staged-pages directory whose scope has no run root
// (INV-0076). A directory holding any entry, a symlink, and a directory with a run root stay (INV-0122).

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const made = [];
after(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

const { hook, makeRepo, makeScope } = require('./scope-prune-setup');
const { main } = hook;

const pending = (repo, name) => path.join(repo, '.superdev', 'kb-pending', name);

test('#empty-no-run-root: removed, with no scopes/ directory present at all.', () => {
  const repo = makeRepo();
  fs.mkdirSync(pending(repo, 'gone'), { recursive: true });
  assert.equal(fs.existsSync(path.join(repo, '.superdev', 'scopes')), false, 'fixture has no scopes/ directory');
  main(repo);
  assert.equal(fs.existsSync(pending(repo, 'gone')), false, 'an empty kb-pending dir with no run root is removed');
  assert.equal(fs.existsSync(path.join(repo, '.superdev', 'kb-pending')), true, 'and kb-pending itself stays');
  fs.rmSync(repo, { recursive: true, force: true });
});

test('#entries-stay: a page, a .DS_Store, or any other entry keeps the directory.', () => {
  const repo = makeRepo();
  for (const [dir, file] of [['page', 'topic.md'], ['finder', '.DS_Store'], ['other', 'notes.txt']]) {
    fs.mkdirSync(pending(repo, dir), { recursive: true });
    fs.writeFileSync(path.join(pending(repo, dir), file), 'x\n');
  }
  fs.mkdirSync(path.join(pending(repo, 'nested'), 'sub'), { recursive: true });
  main(repo);
  for (const dir of ['page', 'finder', 'other', 'nested']) {
    assert.equal(fs.existsSync(pending(repo, dir)), true, `kb-pending/${dir} holding an entry stays`);
  }
  assert.equal(fs.existsSync(path.join(pending(repo, 'page'), 'topic.md')), true, 'and its staged page stays');
  fs.rmSync(repo, { recursive: true, force: true });
});

test('#run-root-stays: an empty dir whose scopes/<name>/ exists stays.', () => {
  const repo = makeRepo();
  makeScope(repo, 'live', '**Stage:** implementing\n');
  fs.mkdirSync(pending(repo, 'live'), { recursive: true });
  main(repo);
  assert.equal(fs.existsSync(pending(repo, 'live')), true, 'an empty dir with a run root stays');
  fs.rmSync(repo, { recursive: true, force: true });
});

// On POSIX this case cannot tell the hook's `lstatSync(...).isDirectory()` guard from its absence: `rmdirSync` on a
// symlink to a directory fails with ENOTDIR and the hook's catch swallows it, so the link stays either way. The guard
// decides the outcome only where `rmdirSync` removes a directory link (a Windows junction or directory symlink), which
// no suite here can show.
test('#symlink-stays: a symlink at kb-pending/<name> is never followed or removed.', () => {
  const repo = makeRepo();
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-prune-kbp-target-'));
  made.push(target);
  fs.mkdirSync(path.join(repo, '.superdev', 'kb-pending'), { recursive: true });
  fs.symlinkSync(target, pending(repo, 'link'), 'dir');
  main(repo);
  assert.equal(fs.lstatSync(pending(repo, 'link')).isSymbolicLink(), true, 'a symlink at kb-pending/<name> stays');
  assert.equal(fs.existsSync(target), true, 'and its target stays');
  fs.rmSync(target, { recursive: true, force: true });
  fs.rmSync(repo, { recursive: true, force: true });
});

