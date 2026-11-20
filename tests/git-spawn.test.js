'use strict';

// Suite for plugin/lib/git-spawn.js: the throwing git call and the `git branch` list parse the two Stop hooks share, and the literal
// path reads at a commit, `existsAt` and `fileAt`.

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

// `fileAt` and `existsAt` read a path literally: a path shaped like pathspec magic, or holding a glob character, a space, or a
// newline, answers for exactly that path. Commit `bare` holds `foo`, `ab`, an empty file, and `sub/x`; commit `full` adds every
// special path, each holding its own name.
{
  const { fileAt, existsAt } = require('../plugin/lib/git-spawn.js');
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'git-spawn-paths-')));
  const put = (rel, body) => {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo, rel), body);
  };
  gitThrow(['init', '-q', '-b', 'main'], repo);
  gitThrow(['config', 'user.email', 'test@example.com'], repo);
  gitThrow(['config', 'user.name', 'test'], repo);
  put('foo', 'foo\n');
  put('ab', 'ab\n');
  put('empty', '');
  put('sub/x', 'x\n');
  gitThrow(['add', '-A'], repo);
  gitThrow(['commit', '-q', '-m', 'bare'], repo);
  const bare = gitThrow(['rev-parse', 'HEAD'], repo);
  const special = [':foo', ':/foo', ':!foo', ':(exclude)foo', ':(icase)FOO', 'a*', 'a?', 'a[b]', 'a b', 'a\nb'];
  for (const rel of special) put(rel, `${rel}\n`);
  gitThrow(['add', '-A'], repo);
  gitThrow(['commit', '-q', '-m', 'full'], repo);
  const full = gitThrow(['rev-parse', 'HEAD'], repo);

  // Red first: an absent `:foo` beside a present `foo` reads as absent, not as a git that cannot say.
  assert.equal(fileAt(bare, ':foo', repo), '', 'fileAt reads an absent :foo beside a present foo as absent');

  const answers = (cwd) => {
    const out = [];
    for (const [commit, label] of [[bare, 'bare'], [full, 'full']]) {
      for (const rel of ['foo', 'empty', 'nope', ...special]) out.push([label, rel, existsAt(commit, rel, cwd), fileAt(commit, rel, cwd)]);
    }
    out.push(['unreadable', 'foo', existsAt('0'.repeat(40), 'foo', cwd), fileAt('0'.repeat(40), 'foo', cwd)]);
    return out;
  };
  const expected = [];
  for (const label of ['bare', 'full']) {
    expected.push([label, 'foo', true, 'foo\n'], [label, 'empty', true, ''], [label, 'nope', false, '']);
    for (const rel of special) expected.push(label === 'full' ? [label, rel, true, `${rel}\n`] : [label, rel, false, '']);
  }
  expected.push(['unreadable', 'foo', null, null]);
  assert.deepEqual(answers(repo), expected, 'existsAt and fileAt answer for exactly the path given, from the root');
  assert.deepEqual(answers(path.join(repo, 'sub')), expected, 'and from a subdirectory');
  for (const mode of ['GIT_GLOB_PATHSPECS', 'GIT_NOGLOB_PATHSPECS', 'GIT_ICASE_PATHSPECS']) {
    process.env[mode] = '1';
    try {
      assert.deepEqual(answers(repo), expected, `a ${mode}=1 environment changes no answer`);
    } finally {
      delete process.env[mode];
    }
  }
  fs.rmSync(repo, { recursive: true, force: true });
}

fs.rmSync(dir, { recursive: true, force: true });

console.log('git-spawn tests ok');
