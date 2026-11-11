'use strict';

// Suite for the test-path classification of the run trace (ADR 0128): which recorded edits are `test` and which `impl`.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { isTestPath } = require('../plugin/scripts/scope.js');
const { A, S3, trace, reset, run, edit, cleanup } = require('./run-trace-setup');

// Test paths: defaults without a section; a configured section overrides; a malformed entry is skipped.
reset();
const vf = path.join(S3, 'docs', 'agents', 'verification.md');
for (const f of ['a.spec.ts', 'pkg/__tests__/z.js', 'test_x.py', 'lib/x_test.go', 'spec/y.rb', 'src/main.js']) edit(path.join(S3, f));
assert.deepEqual(trace(A).map((l) => l[3]), ['test', 'test', 'test', 'test', 'test', 'impl'], 'defaults');
fs.writeFileSync(vf, '# V\n\n## Test paths\n\n- `check/`\n- `bad entry with spaces`\n- `/abs/**`\n- `lib/**/*.t.js`\n- scripts/run.js\n\n## Other\n\n- `src/`\n');
reset();
for (const f of ['check/a.js', 'lib/q/r.t.js', 'scripts/run.js', 'tests/x.test.js', 'src/main.js', 'other/scripts/run.js']) edit(path.join(S3, f));
assert.deepEqual(trace(A).map((l) => l[3]), ['test', 'test', 'test', 'impl', 'impl', 'impl'], 'configured section overrides defaults, malformed entries skipped');
fs.writeFileSync(vf, '# V\n\n## Test paths\n\n- `bad entry`\n');
reset();
edit(path.join(S3, 'tests', 'x.test.js'));
assert.deepEqual(trace(A).map((l) => l[3]), ['test'], 'a section with no usable entry applies the defaults');
fs.rmSync(vf);
reset();
for (const f of ['services/api/tests/a.bats', 'src/test/java/FooTest.java', 'Libs/Weaver.Core.Tests/FooTests.cs', 'Libs/Weaver.Core.Test/Foo.cs', 'pkg/spec/x_spec.rb', 'src/latest/a.ts', 'contest/b.ts']) edit(path.join(S3, f));
assert.deepEqual(trace(A).map((l) => l[3]), ['test', 'test', 'test', 'test', 'test', 'impl', 'impl'], 'default directories match at any depth by whole segment, .Tests and .Test directories too');

// The hook and `scope.js suite reusable` share one classifier: every path gets the same kind from the
// hook's recorded edit as from `isTestPath` over the same verification.md text, defaults and configured.
{
  const same = ['services/api/tests/a.bats', 'Libs/Weaver.Core.Tests/FooTests.cs', 'pkg/__tests__/z.js', 'lib/x_test.go', 'check/a.js', 'lib/q/r.t.js', 'tests/x.test.js', 'src/main.js', 'contest/b.ts'];
  for (const text of ['', '# V\n\n## Test paths\n\n- `check/`\n- `lib/**/*.t.js`\n']) {
    if (text) fs.writeFileSync(vf, text);
    reset();
    for (const f of same) edit(path.join(S3, f));
    assert.deepEqual(trace(A).map((l) => l[3]), same.map((f) => (isTestPath(text, f) ? 'test' : 'impl')), 'hook and isTestPath agree: ' + (text ? 'configured' : 'defaults'));
  }
  fs.rmSync(vf);
}

// A write made from a subdirectory of a run tree records its one tree-relative path: no doubled prefix, no bare file name.
{
  const sub = path.join(S3, 'mods', 'superdev-view', 'hooks');
  fs.mkdirSync(sub, { recursive: true });
  const want = [['edit', 'test', 'mods/superdev-view/hooks/parse.test.ts']];
  const lines = () => trace(A).map((l) => l.slice(2));
  // The hook runs after the tool: the file the tool wrote exists where the tool resolved the path. A relative path resolves
  // against the hook's cwd, or against the tree root when only that reading names a file (triage #34).
  const touch = (f) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, ''); };
  const gone = (...fs_) => fs_.forEach((f) => fs.rmSync(f, { force: true }));
  const inSub = path.join(sub, 'parse.test.ts');
  const treeRegister = path.join(S3, 'register.tsx');
  const doubled = path.join(sub, 'mods', 'superdev-view', 'hooks', 'new', 'parse.test.ts');
  const treeNew = path.join(sub, 'new', 'parse.test.ts');
  touch(inSub);
  reset();
  edit('parse.test.ts', { cwd: sub });
  assert.deepEqual(lines(), want, 'a relative Edit path from a subdirectory');
  reset();
  edit(inSub, { cwd: sub });
  assert.deepEqual(lines(), want, 'an absolute Edit path from a subdirectory');
  reset();
  edit('mods/superdev-view/hooks/parse.test.ts', { cwd: sub });
  assert.deepEqual(lines(), want, 'a tree-relative Edit path from a subdirectory is not doubled');
  reset();
  edit('./mods/superdev-view/hooks/parse.test.ts', { cwd: sub });
  assert.deepEqual(lines(), want, 'a ./ tree-relative Edit path from a subdirectory is normalized and not doubled');
  reset();
  edit('../hooks/parse.test.ts', { cwd: sub });
  assert.deepEqual(lines(), want, 'a .. Edit path from a subdirectory is normalized');
  reset();
  touch(treeRegister);
  edit('register.tsx', { cwd: sub });
  assert.deepEqual(lines(), [['edit', 'impl', 'register.tsx']], 'a bare name the tool resolved against the tree root records at the tree root');
  gone(treeRegister);
  reset();
  touch(treeNew);
  edit('mods/superdev-view/hooks/new/parse.test.ts', { cwd: sub });
  assert.deepEqual(lines(), [['edit', 'test', 'mods/superdev-view/hooks/new/parse.test.ts']], 'a tree-relative path into a directory the tool created is not doubled');
  gone(treeNew);
  reset();
  touch(doubled);
  edit('mods/superdev-view/hooks/new/parse.test.ts', { cwd: sub });
  assert.deepEqual(lines(), [['edit', 'test', 'mods/superdev-view/hooks/mods/superdev-view/hooks/new/parse.test.ts']], 'a file the tool wrote under the working directory records there');
  gone(doubled);
  reset();
  edit('mods/superdev-view/hooks/absent.test.ts', { cwd: sub });
  assert.deepEqual(lines(), [['edit', 'test', 'mods/superdev-view/hooks/mods/superdev-view/hooks/absent.test.ts']], 'a path no reading names a file for resolves against the working directory');
  // The tool's resolution base is the tree root and the hook's cwd is the subdirectory: both tie-breaking readings name a file.
  reset();
  touch(treeRegister);
  touch(path.join(sub, 'register.tsx'));
  edit('register.tsx', { cwd: sub });
  assert.deepEqual(lines(), [['edit', 'impl', 'mods/superdev-view/hooks/register.tsx']], 'a bare name that exists at both readings records at the working directory');
  gone(treeRegister, path.join(sub, 'register.tsx'));
}

cleanup();
