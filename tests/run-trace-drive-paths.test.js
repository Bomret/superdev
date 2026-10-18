'use strict';

// Suite for Git Bash drive paths in the run trace (ADR 0150): a `/c/…` path resolves as the Windows path on win32.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { bashTargets } = require('../plugin/lib/bash-writes.js');
const { tmp, ledger, A, S3, trace, runOut, run, edit, cleanup } = require('./run-trace-setup');
const S3src = path.join(S3, 'src');

// A Git Bash drive path in a `cd` target or `git -C` resolves as the Windows path on win32 (ADR 0150).
{
  const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  const onWin32 = (fn) => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try { return fn(); } finally { Object.defineProperty(process, 'platform', realPlatform); }
  };
  const w = (cmd) => onWin32(() => bashTargets(cmd, S3src));
  assert.deepEqual(w('cd /c/x && echo y > f'), [path.resolve(S3src, 'C:/x', 'f')], 'cd /c/x');
  assert.deepEqual(w('git -C /c/x apply -- p'), bashTargets('git -C C:/x apply -- p', S3src), 'git -C /c/x');
  assert.deepEqual(bashTargets('cd /c/x && echo y > f', S3src), [path.resolve('/c/x', 'f')], 'off win32 a drive path stays');
  assert.deepEqual(w('echo x > /c/x/f'), [path.resolve(S3src, 'C:/x/f')], 'a redirect target /c/x/f');
  assert.deepEqual(bashTargets('echo x > /c/x/f', S3src), ['/c/x/f'], 'off win32 a redirect target stays');
  assert.deepEqual(w('cp a /c/x/f'), [path.resolve(S3src, 'C:/x/f')], 'a cp destination /c/x/f');
  assert.deepEqual(bashTargets('cp a /c/x/f', S3src), ['/c/x/f'], 'off win32 a cp destination stays');
}

// Through the hook's entry, a Bash command naming a run tree by a `/c/…` path finds its ledger and records on win32 (ADR 0150).
// The fixture lives under `<cwd>/C:/…`, where the translated path resolves.
{
  const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  const onWin32 = (fn) => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try { return fn(); } finally { Object.defineProperty(process, 'platform', realPlatform); }
  };
  const W = path.join(tmp, 'C:', 'w', '.superdev', 'scopes', 'win');
  const T3win = path.join(W, 'slicetrees', '03');
  const T3 = '/c/w/.superdev/scopes/win/slicetrees/03';
  fs.mkdirSync(path.join(T3win, 'docs', 'agents'), { recursive: true });
  fs.mkdirSync(path.join(T3win, 'src'), { recursive: true });
  fs.writeFileSync(path.join(W, 'ledger.md'), ledger([['03', 'in-progress']]));
  // The test files the runs below name exist: a path run needs its file (triage #1210). `/c/sub/…` from the tree
  // resolves to `<tree>/C:/sub/…`.
  for (const f of [path.join('tests', 'n.test.js'), path.join('C:', 'sub', 'tests', 'a.test.js')]) {
    fs.mkdirSync(path.dirname(path.join(T3win, f)), { recursive: true });
    fs.writeFileSync(path.join(T3win, f), '');
  }
  const wvf = path.join(T3win, 'docs', 'agents', 'verification.md');
  const bashAt = (command, cwd, hook) => runOut({ hook_event_name: hook || 'PostToolUse', tool_name: 'Bash', tool_input: { command }, cwd: cwd || tmp });
  const lines = () => trace(W).map((l) => l.slice(2).join(' '));
  const clear = () => fs.rmSync(path.join(W, 'trace.log'), { force: true });

  // A redirect target and a `cd` target both locate the ledger through the drive path.
  onWin32(() => {
    clear();
    bashAt(`echo x > ${T3}/src/f.js`);
    bashAt(`cd ${T3} && echo x > src/g.js`);
  });
  assert.deepEqual(lines(), ['edit impl src/f.js', 'edit impl src/g.js'], 'a redirect and a cd name the run tree by a drive path');
  clear();
  bashAt(`echo x > ${T3}/src/f.js`);
  assert.deepEqual(lines(), [], 'off win32 the drive path locates no run tree');
  // A stashed starting directory (ADR 0159) and a `cd /c/…` target: the segments before the `cd` resolve against the stash,
  // and the target normalizes. The session cwd lies in the tree, so `/c/sub` resolves to `<tree>/C:/sub`.
  onWin32(() => {
    clear();
    const command = 'echo x > src/h.js && cd /c/sub && echo y > g.js';
    runOut({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'w32-stash', tool_input: { command }, cwd: T3win });
    runOut({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 'w32-stash', tool_input: { command }, cwd: tmp });
  });
  assert.deepEqual(lines(), ['edit impl src/h.js', 'edit impl C:/sub/g.js'], 'a stashed start and a cd /c/… target record in the run tree');

  // testRunsOf: a test run after `cd /c/…` records in the run tree.
  onWin32(() => { clear(); bashAt(`cd ${T3} && node tests/n.test.js`); });
  assert.deepEqual(trace(W).map((l) => l[2] + ' ' + l[3] + ' ' + l[7]), ['run path tests/n.test.js'], 'a test run after cd /c/… records');

  // testRunsOf: a `cd` inside a matched compound configured command moves the base.
  // The session cwd lies in the tree, so `/c/sub` resolves to `<tree>/C:/sub`.
  fs.writeFileSync(wvf, '# V\n\n```sh\ncd /c/sub && bun test\n```\n');
  onWin32(() => { clear(); bashAt('cd /c/sub && bun test && node tests/a.test.js', T3win); });
  assert.equal(trace(W).filter((l) => l[2] === 'run').pop()[7], 'C:/sub/tests/a.test.js', 'a cd /c/… inside a matched compound moves the base');
  fs.rmSync(wvf);

  // restoreEventsOf: a restore after `cd /c/…` and under `git -C /c/…`.
  onWin32(() => {
    clear();
    bashAt(`cd ${T3} && git restore -- src/x.js`);
    bashAt(`git -C ${T3} restore --source=main -- src/y.js`);
  });
  assert.deepEqual(lines(), ['restore src/x.js', 'revert src/y.js'], 'a restore names the run tree by a drive path');

  // An absolute drive-path operand: a test file records a path run, a restore operand records its tree-relative path.
  // The session cwd lies in the tree, so `/c/sub/…` resolves to `<tree>/C:/sub/…` as in the compound case above.
  onWin32(() => { clear(); bashAt('node /c/sub/tests/a.test.js', T3win); });
  assert.deepEqual(trace(W).map((l) => l[2] + ' ' + l[3] + ' ' + l[7]), ['run path C:/sub/tests/a.test.js'], 'a test file named by a drive path records');
  onWin32(() => { clear(); bashAt('git restore -- /c/sub/src/x.js', T3win); });
  assert.deepEqual(lines(), ['restore C:/sub/src/x.js'], 'a restore operand named by a drive path records');

  // scopeTestCalls: a `scope.js test` call after `cd /c/…` records its own run, so the hook writes none and notes.
  const SCOPE = require.resolve('../plugin/scripts/scope.js');
  const testEdit = path.join(T3win, 'tests', 'n.test.js');
  fs.writeFileSync(wvf, '# V\n\n```sh\nbun test\n```\n');
  onWin32(() => {
    clear();
    edit(testEdit);
    const note = bashAt(`cd ${T3} && node ${SCOPE} test full`);
    assert.ok(note.includes('Missing RED'), 'a scope.js test call after cd /c/… notes');
  });
  assert.deepEqual(lines().filter((l) => l.startsWith('run')), [], 'the hook records no run for the scope.js test call');
}


cleanup();
