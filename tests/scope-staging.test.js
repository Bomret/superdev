'use strict';

// Suite for `scope.js staging <scope> [--count | --line]`: the staged-pages line the close steps print and the
// verb's strict argument handling (INV-0121, INV-0123). Each case reads the main working tree's
// `.superdev/kb-pending/<scope>/` from a linked worktree.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { call } = require('./scope-setup');

const callIn = (argv, cwd) => call(argv, '', cwd);
const git = (args, cwd) => execFileSync('git', args, { cwd, stdio: 'ignore' });

const main = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-staging-')));
git(['init', '-q', '-b', 'main'], main);
git(['config', 'user.email', 'test@example.com'], main);
git(['config', 'user.name', 'Test'], main);
fs.writeFileSync(path.join(main, 'f'), 'x');
git(['add', '.'], main);
git(['commit', '-q', '-m', 'init'], main);
const wt = path.join(main, '..', path.basename(main) + '-wt');
git(['worktree', 'add', '-q', '-b', 'feat/wt', wt], main);
const pending = path.join(main, '.superdev', 'kb-pending');
const dir = path.join(pending, 'demo');
const couldNot = /could not be read/;

// Two pages print the exact line with the main working tree's directory, run from a linked worktree.
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'a.md'), 'x\n');
fs.writeFileSync(path.join(dir, 'b.md'), 'x\n');
fs.writeFileSync(path.join(dir, 'stray.txt'), 'x\n');
assert.strictEqual(
  callIn(['staging', 'demo', '--line'], wt).out,
  `2 staged knowledge-base page(s) wait in ${dir}. /superdev:wrap-up keeps them.`,
  '--line prints the exact line',
);

// A directory named page.md is no page, for --line and --count.
fs.mkdirSync(path.join(dir, 'page.md'));
assert.strictEqual(callIn(['staging', 'demo', '--count'], wt).out, '2', '--count skips a directory named page.md');
assert.ok(callIn(['staging', 'demo', '--line'], wt).out.startsWith('2 staged'), '--line skips a directory named page.md');

// A scope with no staged pages prints nothing and exits 0.
const none = callIn(['staging', 'absent', '--line'], wt);
assert.ok(none.ok && none.out === '', 'a missing directory prints nothing');
fs.mkdirSync(path.join(pending, 'empty'));
fs.mkdirSync(path.join(pending, 'empty', 'only.md'));
const empty = callIn(['staging', 'empty', '--line'], wt);
assert.ok(empty.ok && empty.out === '', 'a directory holding no page file prints nothing');

// A staging path that is a file: --line prints the could-not-read line with no count; --count reports a failure.
fs.writeFileSync(path.join(pending, 'afile'), 'x');
const file = callIn(['staging', 'afile', '--line'], wt);
assert.ok(file.ok && couldNot.test(file.out) && !/\d/.test(file.out), 'a file at the path prints the could-not-read line, no count: ' + file.out);
assert.strictEqual(file.out.split('\n').length, 1, 'one line');
const fileCount = callIn(['staging', 'afile', '--count'], wt);
assert.ok(!fileCount.ok && fileCount.out === '', '--count reports a read failure other than a missing directory');

// An unreadable directory reads the same way (skipped where permissions do not bind, as for root).
if (process.platform !== 'win32' && !(process.getuid && process.getuid() === 0)) {
  const locked = path.join(pending, 'locked');
  fs.mkdirSync(locked);
  fs.writeFileSync(path.join(locked, 'a.md'), 'x');
  fs.chmodSync(locked, 0o000);
  try {
    const l = callIn(['staging', 'locked', '--line'], wt);
    assert.ok(couldNot.test(l.out) && !/\d/.test(l.out), 'an unreadable directory prints the could-not-read line: ' + l.out);
    assert.ok(!callIn(['staging', 'locked', '--count'], wt).ok, '--count reports the unreadable directory');
  } finally {
    fs.chmodSync(locked, 0o755);
  }
}

// Strict arguments: an unknown flag, a second positional, a missing scope, and both forms are refused.
for (const bad of [['--line', 'x'], ['x', '--bogus'], ['x', 'y'], ['x', '--count', '--line'], ['--bogus'], ['--line']]) {
  const r = callIn(['staging', ...bad], wt);
  assert.ok(!r.ok && r.out === '', `staging refuses ${JSON.stringify(bad)} with nothing on stdout`);
}
assert.strictEqual(callIn(['staging', 'demo'], wt).out, dir, 'the bare form still prints the directory');
assert.strictEqual(callIn(['--line', 'staging', 'demo'], wt).ok, false, 'a flag before the verb is no scope');

fs.rmSync(wt, { recursive: true, force: true });
fs.rmSync(main, { recursive: true, force: true });
