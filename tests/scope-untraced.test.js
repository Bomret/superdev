'use strict';

// Suite for plugin/scripts/scope.js's `untraced` verb (ADR 0225): the paths a window's commits change that no `edit` line
// of the window names. The fixtures are real git commits and real trace lines; the suite runs in temporary directories.

require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { call, scopePath } = require('./scope-setup');

const { appendTrace } = require(scopePath);

const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 30000 });
  assertSpawnDecided(r, `git ${args.join(' ')}`);
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const put = (cwd, rel, text) => fs.writeFileSync(path.join(cwd, rel), text);
const commit = (cwd, msg) => {
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', msg);
};
const wait = (ms) => { const end = Date.now() + ms; while (Date.now() < end); };
const rows = (out) => out.split('\n').filter(Boolean).sort();

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-untraced-')));
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));

const repoOf = (name) => {
  const repo = path.join(dir, name);
  fs.mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 't@example.com');
  git(repo, 'config', 'user.name', 't');
  const root = path.join(dir, `${name}-run`, '.superdev', 'scopes', 'demo'); // outside the repository, so `add -A` commits no trace
  fs.mkdirSync(root, { recursive: true });
  return { repo, root };
};
const edit = (root, slice, rel) => appendTrace(root, { slice, agent: 'a1', kind: 'edit', fields: ['impl', rel] });

// #listing: Bash writes, deletions, renames, odd names, and a merge that brings the base in.
{
  const { repo, root } = repoOf('listing');
  for (const f of ['a.txt', 'b.txt', 'd.txt', 'r1.txt', 'base-only.txt']) put(repo, f, `${f}\none\ntwo\nthree\nfour\n`);
  commit(repo, 'base');
  const base = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'checkout', '-q', '-b', 'slice/demo/05');
  put(repo, 'a.txt', 'a.txt\nchanged\ntwo\nthree\nfour\n');
  put(repo, 'b.txt', 'b.txt\nchanged\ntwo\nthree\nfour\n');
  fs.rmSync(path.join(repo, 'd.txt'));
  git(repo, 'mv', 'r1.txt', 'r2.txt');
  put(repo, 'with space.txt', 'one\n');
  put(repo, 'café ü.txt', 'one\n');
  commit(repo, 'first');
  put(repo, 'with space.txt', 'two\n');
  put(repo, 'café ü.txt', 'two\n');
  commit(repo, 'second');
  git(repo, 'checkout', '-q', 'main');
  put(repo, 'base-only.txt', 'base-only.txt\nbase moved\ntwo\nthree\nfour\n');
  commit(repo, 'base moves');
  git(repo, 'checkout', '-q', 'slice/demo/05');
  git(repo, 'merge', '-q', '--no-edit', 'main');
  const tip = git(repo, 'rev-parse', 'HEAD');

  edit(root, '05', 'b.txt');
  edit(root, '06', 'a.txt'); // another slice's edit line masks nothing
  const r = call(['untraced', `${base}..${tip}`, '--slice', '05', '--root', root], '', repo);
  assert.ok(r.ok, r.err);
  assert.deepEqual(rows(r.out), [
    'modified\ta.txt',
    'deleted\td.txt',
    'renamed\tr2.txt\tr1.txt',
    'added\twith space.txt',
    'added\tcafé ü.txt',
  ].sort(),'a Bash write, a deletion, a rename, and two odd names are each listed once; the edited path and the merged-in base are not');

  const clean = call(['untraced', `${tip}..${tip}`, '--slice', '05', '--root', root], '', repo);
  assert.ok(clean.ok, clean.err);
  assert.equal(clean.out, '', 'an empty range lists nothing');
}

// #cycles: an earlier cycle's edit line masks no later cycle's write of the same path.
{
  const { repo, root } = repoOf('cycles');
  put(repo, 'p.txt', 'zero\n');
  commit(repo, 'base');
  const base = git(repo, 'rev-parse', 'HEAD');
  edit(root, 'scope', 'p.txt');
  put(repo, 'p.txt', 'one\n');
  commit(repo, 'cycle one');
  const mid = git(repo, 'rev-parse', 'HEAD');
  wait(5);
  const boundary = new Date().toISOString();
  wait(5);
  put(repo, 'p.txt', 'two\n');
  commit(repo, 'cycle two');
  const tip = git(repo, 'rev-parse', 'HEAD');

  const one = call(['untraced', `${base}..${mid}`, '--slice', 'scope', '--until', boundary, '--root', root], '', repo);
  assert.ok(one.ok, one.err);
  assert.equal(one.out, '', 'the cycle that edited p.txt through the tool lists nothing');
  const two = call(['untraced', `${mid}..${tip}`, '--slice', 'scope', '--from', boundary, '--root', root], '', repo);
  assert.ok(two.ok, two.err);
  assert.equal(two.out, 'modified\tp.txt', 'the later cycle changed p.txt with no edit line of its own window');
}

// #refusals
{
  const { repo, root } = repoOf('refusals');
  put(repo, 'x.txt', 'x\n');
  commit(repo, 'base');
  const head = git(repo, 'rev-parse', 'HEAD');
  assert.ok(!call(['untraced', '--slice', '05', '--root', root], '', repo).ok, 'no range refuses');
  assert.ok(!call(['untraced', `${head}..${head}`, '--root', root], '', repo).ok, 'no --slice refuses');
  assert.ok(!call(['untraced', `${head}..${head}`, '--slice', '05'], '', repo).ok, 'no --root refuses');
  assert.ok(!call(['untraced', 'nowhere..alsonowhere', '--slice', '05', '--root', root], '', repo).ok, 'an unreadable range refuses');
}
