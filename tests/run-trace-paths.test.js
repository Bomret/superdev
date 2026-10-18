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

cleanup();
