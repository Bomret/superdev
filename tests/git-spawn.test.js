'use strict';

// Suite for plugin/lib/git-spawn.js: the throwing git call and the `git branch` list parse the two Stop hooks share, and the literal
// path reads at a commit, `existsAt` and `fileAt`, and the working-tree listing `listWorktrees`, its `-z` fallback included, and its
// failure when git cannot start or is ended by a signal on the first listing or on its fallback.

const { test, after } = require('node:test');
require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { gitSpawn, gitThrow, parseBranchList } = require('../plugin/lib/git-spawn.js');

const made = [];
after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'git-spawn-'));
gitThrow(['init', '-q', '-b', 'main'], dir);
gitThrow(['config', 'user.email', 'test@example.com'], dir);
gitThrow(['config', 'user.name', 'test'], dir);
fs.writeFileSync(path.join(dir, 'a.txt'), 'x\n');
gitThrow(['add', '.'], dir);
gitThrow(['commit', '-q', '-m', 'init'], dir);

test('gitThrow returns trimmed stdout and throws on failure; gitSpawn reports the status', () => {
  assert.equal(gitThrow(['symbolic-ref', '--short', 'HEAD'], dir), 'main', 'gitThrow returns the trimmed stdout');
  assert.throws(() => gitThrow(['rev-parse', '--verify', '--quiet', 'no-such-ref'], dir), 'gitThrow throws on a nonzero exit');
  assert.throws(() => gitThrow(['status'], path.join(dir, 'no-such-dir')), 'gitThrow throws when git cannot run in the directory');
  assert.equal(gitSpawn(['rev-parse', '--verify', '--quiet', 'no-such-ref'], dir).status, 1, 'gitSpawn reports the status instead of throwing');
});

test('parseBranchList parses a branch listing into a set of names', () => {
  assert.deepEqual(
    [...parseBranchList('* main\n+ fix/in-worktree\n  feat/plain\n\n')],
    ['main', 'fix/in-worktree', 'feat/plain'],
    'parseBranchList drops the current and worktree markers, the indentation, and blank lines'
  );
  assert.deepEqual([...parseBranchList('')], [], 'an empty listing parses to an empty set');
  assert.equal(parseBranchList('a\na\n').size, 1, 'the parse is a set of names');
});

// Commit `bare` holds `foo`, `ab`, an empty file, and `sub/x`; commit `full` adds every special path, each holding
// its own name.
test('`fileAt` and `existsAt` read a path literally: a path shaped like pathspec magic, or holding a glob character, a space, or a newline, answers for exactly that path.', () => {
  const { fileAt, existsAt } = require('../plugin/lib/git-spawn.js');
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'git-spawn-paths-')));
  made.push(repo);
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
});

test('`listWorktrees` reads each registered working tree as one `{ path, branch, detached }` entry: a locked tree and a prunable one each stay one entry, and a git that refuses `-z` falls back to the newline-split listing with the same entries.', () => {
  const { listWorktrees } = require('../plugin/lib/git-spawn.js');
  const { execFileSync } = require('node:child_process');
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'git-spawn-trees-')));
  made.push(base);
  const repo = path.join(base, 'repo');
  fs.mkdirSync(repo);
  gitThrow(['init', '-q', '-b', 'main'], repo);
  gitThrow(['config', 'user.email', 'test@example.com'], repo);
  gitThrow(['config', 'user.name', 'test'], repo);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'x\n');
  gitThrow(['add', '.'], repo);
  gitThrow(['commit', '-q', '-m', 'init'], repo);
  const linked = path.join(base, 'linked');
  const locked = path.join(base, 'locked');
  const gone = path.join(base, 'gone');
  gitThrow(['worktree', 'add', '-q', '-b', 'slice/linked', linked], repo);
  gitThrow(['worktree', 'add', '-q', '-b', 'slice/locked', locked], repo);
  gitThrow(['worktree', 'lock', '--reason', 'held by a test', locked], repo);
  gitThrow(['worktree', 'add', '-q', '-b', 'slice/gone', gone], repo);
  fs.rmSync(gone, { recursive: true, force: true });
  // Git orders the linked trees itself, so the entries compare sorted.
  const entries = (listing) => listing.trees.map(({ path: p, branch }) => [p, branch]).sort();
  const expected = [
    [repo, 'main'],
    [linked, 'slice/linked'],
    [locked, 'slice/locked'],
    [gone, 'slice/gone'],
  ].sort();

  assert.deepEqual(entries(listWorktrees(repo)), expected, 'a locked and a prunable working tree each read as one entry, and no extra entry appears');

  // A `git` on PATH that refuses `-z` with status 129 and runs every other call.
  const shim = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'git-spawn-shim-')));
  made.push(shim);
  const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(shim, 'git'), `#!/bin/sh\nfor a in "$@"; do [ "$a" = -z ] && exit 129; done\nexec ${JSON.stringify(realGit)} "$@"\n`, { mode: 0o755 });
  const savedPath = process.env.PATH;
  process.env.PATH = `${shim}${path.delimiter}${savedPath}`;
  let fallback;
  try {
    assert.equal(gitSpawn(['worktree', 'list', '--porcelain', '-z'], repo).status, 129, 'the shim refuses -z');
    fallback = listWorktrees(repo);
  } finally {
    process.env.PATH = savedPath;
  }
  assert.deepEqual(entries(fallback), expected, 'a git that refuses -z falls back to the newline-split listing with the same entries');
  fs.rmSync(shim, { recursive: true, force: true });

  // A listing git cannot run comes back as a failure naming the cause. `withPath` runs it with `dir` alone on PATH.
  const withPath = (dirOnPath) => {
    process.env.PATH = dirOnPath;
    try {
      return listWorktrees(repo);
    } finally {
      process.env.PATH = savedPath;
    }
  };
  const noGit = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'git-spawn-nogit-')));
  made.push(noGit);
  assert.deepEqual(withPath(noGit), { failure: 'worktree list could not start (ENOENT)' }, 'a PATH holding no git fails naming ENOENT, with cwd a real directory');
  fs.rmSync(noGit, { recursive: true, force: true });

  // A shim that logs each call's arguments, then kills itself with SIGKILL on the exact listing shape given and refuses `-z` with 129
  // where `refuseZ` is set. Every other call runs the real git.
  const signalShim = (killArgs, refuseZ) => {
    const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'git-spawn-kill-')));
    made.push(d);
    const log = path.join(d, 'calls.log');
    const refuse = refuseZ ? `[ "$*" = "worktree list --porcelain -z" ] && exit 129\n` : '';
    fs.writeFileSync(
      path.join(d, 'git'),
      `#!/bin/sh\necho "$*" >> ${JSON.stringify(log)}\n${refuse}[ "$*" = ${JSON.stringify(killArgs)} ] && kill -KILL $$\nexec ${JSON.stringify(realGit)} "$@"\n`,
      { mode: 0o755 }
    );
    return { d, log };
  };
  {
    const { d, log } = signalShim('worktree list --porcelain -z', false);
    assert.deepEqual(withPath(`${d}${path.delimiter}${savedPath}`), { failure: 'worktree list was ended by signal SIGKILL' }, 'a git killed on the -z listing fails naming the signal');
    assert.deepEqual(fs.readFileSync(log, 'utf8').trim().split('\n'), ['worktree list --porcelain -z'], 'a signal on the -z listing makes no fallback call');
    fs.rmSync(d, { recursive: true, force: true });
  }
  {
    const { d, log } = signalShim('worktree list --porcelain', true);
    assert.deepEqual(withPath(`${d}${path.delimiter}${savedPath}`), { failure: 'worktree list was ended by signal SIGKILL' }, 'a git killed on the fallback listing fails naming the signal');
    assert.deepEqual(fs.readFileSync(log, 'utf8').trim().split('\n'), ['worktree list --porcelain -z', 'worktree list --porcelain'], 'the -z refusal reached the fallback');
    fs.rmSync(d, { recursive: true, force: true });
  }
  fs.rmSync(base, { recursive: true, force: true });
});

// The no-verdict reads (ADR 0290, INV-0009): a fake git ends the matching call with SIGKILL and runs every other call.
const { fakeGit, calls } = require('./fake-git.js');
const noVerdict = (verb, signal = 'SIGKILL') => (e) =>
  e.isRefusal === true && e.message.includes(verb) && e.message.includes(signal) && e.message.includes('no verdict');

test('resolveCommit and refResolves refuse as no verdict on a killed rev-parse, and answer as before on a real exit', () => {
  const { resolveCommit, refResolves } = require('../plugin/lib/git-spawn.js');
  const head = gitThrow(['rev-parse', 'HEAD'], dir);
  const killed = fakeGit({ match: '^rev-parse' });
  assert.throws(() => killed.withPath(() => resolveCommit('HEAD', dir)), noVerdict('rev-parse'), 'a killed rev-parse refuses, naming the verb, the signal, and no verdict');
  assert.throws(() => killed.withPath(() => refResolves('HEAD', dir)), noVerdict('rev-parse'), 'refResolves refuses the same way');
  assert.equal(resolveCommit('HEAD', dir), head, 'a present ref answers its commit');
  assert.equal(resolveCommit('no-such-ref', dir), null, 'an absent ref answers null');
  assert.equal(refResolves('no-such-ref', dir), false, 'an absent ref does not resolve');
});



test('existsAt and fileAt answer null on a killed read, and fileAt makes no second spawn after a killed show', () => {
  const { existsAt, fileAt } = require('../plugin/lib/git-spawn.js');
  const lsTree = fakeGit({ match: 'ls-tree' });
  assert.equal(lsTree.withPath(() => existsAt('HEAD', 'a.txt', dir)), null, 'a killed ls-tree answers git cannot say');
  const show = fakeGit({ match: '^show' });
  assert.equal(show.withPath(() => fileAt('HEAD', 'a.txt', dir)), null, 'a killed show answers git cannot say');
  assert.deepEqual(calls(show.log), ['show HEAD:a.txt'], 'a killed show makes no existsAt probe');
  assert.equal(fileAt('HEAD', 'a.txt', dir), 'x\n', 'a file at a commit answers its text');
  assert.equal(fileAt('HEAD', 'none.txt', dir), '', 'an absent file answers the empty string');
});
