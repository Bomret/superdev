'use strict';

// Suite for plugin/lib/git-spawn.js: the throwing git call and the `git branch` list parse the two Stop hooks share.

require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { gitSpawn, gitThrow, parseBranchList } = require('../plugin/lib/git-spawn.js');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-spawn-'));
gitThrow(['init', '-q', '-b', 'main'], dir);
gitThrow(['config', 'user.email', 'test@example.com'], dir);
gitThrow(['config', 'user.name', 'test'], dir);
fs.writeFileSync(path.join(dir, 'a.txt'), 'x\n');
gitThrow(['add', '.'], dir);
gitThrow(['commit', '-q', '-m', 'init'], dir);

assert.equal(gitThrow(['symbolic-ref', '--short', 'HEAD'], dir), 'main', 'gitThrow returns the trimmed stdout');
assert.throws(() => gitThrow(['rev-parse', '--verify', '--quiet', 'no-such-ref'], dir), 'gitThrow throws on a nonzero exit');
assert.throws(() => gitThrow(['status'], path.join(dir, 'no-such-dir')), 'gitThrow throws when git cannot run in the directory');
assert.equal(gitSpawn(['rev-parse', '--verify', '--quiet', 'no-such-ref'], dir).status, 1, 'gitSpawn reports the status instead of throwing');

assert.deepEqual(
  [...parseBranchList('* main\n+ fix/in-worktree\n  feat/plain\n\n')],
  ['main', 'fix/in-worktree', 'feat/plain'],
  'parseBranchList drops the current and worktree markers, the indentation, and blank lines'
);
assert.deepEqual([...parseBranchList('')], [], 'an empty listing parses to an empty set');
assert.equal(parseBranchList('a\na\n').size, 1, 'the parse is a set of names');

fs.rmSync(dir, { recursive: true, force: true });

console.log('git-spawn tests ok');
