'use strict';

// Suite for plugin/scripts/scope.js's `untraced` verb (ADR 0227): the paths a window's commits change that no `edit` line
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
  fs.writeFileSync(path.join(root, 'ledger.md'), '# Ledger — demo\n');
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

// #cycles: an earlier cycle's edit line masks no later cycle's write of the same path; each call names its window by dispatch.
{
  const { repo, root } = repoOf('cycles');
  const line = (text) => fs.appendFileSync(path.join(root, 'trace.log'), `${new Date().toISOString()} ${text}\n`);
  put(repo, 'p.txt', 'zero\n');
  put(repo, 'q.txt', 'zero\n');
  commit(repo, 'base');
  const base = git(repo, 'rev-parse', 'HEAD');
  line('scope main dispatch superdev:implementer f1 fix -');
  edit(root, 'scope', 'p.txt');
  line('scope main dispatch-end superdev:implementer f1 stopped');
  line('scope main dispatch-resume f1 a1 - sm1');
  line('scope a1 edit impl q.txt');
  put(repo, 'p.txt', 'one\n');
  put(repo, 'q.txt', 'one\n');
  commit(repo, 'cycle one');
  const mid = git(repo, 'rev-parse', 'HEAD');
  line('scope main dispatch superdev:final-reviewer v1 review -');
  line('scope main dispatch superdev:implementer f2 fix -');
  put(repo, 'p.txt', 'two\n');
  commit(repo, 'cycle two');
  const tip = git(repo, 'rev-parse', 'HEAD');

  const one = call(['untraced', `${base}..${mid}`, '--slice', 'scope', '--window', 'f1', '--root', root], '', repo);
  assert.ok(one.ok, one.err);
  assert.equal(one.out, '', 'an edit line in any run of the window\'s dispatch counts as traced');
  const two = call(['untraced', `${mid}..${tip}`, '--slice', 'scope', '--window', 'f2', '--root', root], '', repo);
  assert.ok(two.ok, two.err);
  assert.equal(two.out, 'modified\tp.txt', 'the later cycle changed p.txt with no edit line of its own window');
  for (const flag of ['--from', '--until']) {
    const r = call(['untraced', `${mid}..${tip}`, '--slice', 'scope', flag, '2026-01-01T00:00:00.000Z', '--root', root], '', repo);
    assert.ok(!r.ok && r.err.includes(flag) && r.err.includes('--window'), `${flag} is refused naming --window: ${r.err}`);
  }
  const unknown = call(['untraced', `${mid}..${tip}`, '--slice', 'scope', '--window', 'v1', '--root', root], '', repo);
  assert.ok(!unknown.ok && unknown.err.includes('v1'), 'a window that names no implementer dispatch is refused by name');
  const other = call(['untraced', `${mid}..${tip}`, '--slice', '05', '--window', 'f2', '--root', root], '', repo);
  assert.ok(!other.ok && other.err.includes('f2') && other.err.includes('scope'), 'a window of another slice than --slice is refused by name');
}

// #msys: an edit line naming the path absolute, as the tree root spells it, masks the root-relative change git reports.
{
  const { repo, root } = repoOf('abs');
  put(repo, 'k.txt', 'zero\n');
  commit(repo, 'base');
  const base = git(repo, 'rev-parse', 'HEAD');
  put(repo, 'k.txt', 'one\n');
  commit(repo, 'change');
  const tip = git(repo, 'rev-parse', 'HEAD');
  edit(root, '05', path.join(repo, 'k.txt'));
  const r = call(['untraced', `${base}..${tip}`, '--slice', '05', '--root', root], '', repo);
  assert.ok(r.ok, r.err);
  assert.equal(r.out, '', 'an absolute edit path compares root-relative');
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
  assert.ok(!call(['untraced', head, '--slice', '05', '--root', root], '', repo).ok, 'a bare commit, which walks the whole history, refuses');
  assert.ok(!call(['untraced', `${head}...${head}`, '--slice', '05', '--root', root], '', repo).ok, 'a three-dot range, which walks the base side too, refuses');
  assert.ok(!call(['untraced', `${head}..${head}`, '--slice', '05', '--root', path.join(dir, 'no-such-run')], '', repo).ok, 'a root with no ledger refuses');
  const twice = call(['untraced', `${head}..${head}`, '--slice', '05', '--window', 'w1', '--window', 'w1', '--root', root], '', repo);
  assert.ok(!twice.ok && twice.err.includes('untraced') && twice.err.includes('--window'), `a flag given twice is refused naming the flag: ${twice.err}`);
  const stray = call(['untraced', `${head}..${head}`, '--slice', '05', '--windw', 'w1', '--root', root], '', repo);
  assert.ok(!stray.ok && stray.err.includes('untraced') && stray.err.includes('--windw'), `an unknown flag is refused naming the flag: ${stray.err}`);
}

// #net: the listing is the range's net change per path.
{
  const { repo, root } = repoOf('net');
  for (const f of ['m.txt', 'keep.txt']) put(repo, f, `${f}\none\ntwo\nthree\nfour\n`);
  commit(repo, 'base');
  const base = git(repo, 'rev-parse', 'HEAD');
  put(repo, 'temp.txt', 'x\n');
  put(repo, 'm.txt', 'm.txt\nchanged\ntwo\nthree\nfour\n');
  commit(repo, 'first');
  fs.rmSync(path.join(repo, 'temp.txt'));
  git(repo, 'mv', 'm.txt', 'm2.txt');
  commit(repo, 'second');
  const tip = git(repo, 'rev-parse', 'HEAD');
  const r = call(['untraced', `${base}..${tip}`, '--slice', '05', '--root', root], '', repo);
  assert.ok(r.ok, r.err);
  assert.equal(r.out, 'renamed\tm2.txt\tm.txt', 'a path added then deleted is not listed, and a modified then renamed path is listed once, as the rename');
}

// #readd: a path deleted and then added again inside the range is a modification.
{
  const { repo, root } = repoOf('readd');
  put(repo, 'z.txt', 'z\n');
  commit(repo, 'base');
  const base = git(repo, 'rev-parse', 'HEAD');
  fs.rmSync(path.join(repo, 'z.txt'));
  commit(repo, 'delete');
  put(repo, 'z.txt', 'z2\n');
  commit(repo, 'add again');
  const tip = git(repo, 'rev-parse', 'HEAD');
  const r = call(['untraced', `${base}..${tip}`, '--slice', '05', '--root', root], '', repo);
  assert.ok(r.ok, r.err);
  assert.equal(r.out, 'modified\tz.txt', 'a path deleted then added again is listed as modified');
}

// #hook-paths: an `edit` line the real run-trace hook writes for a spaced or non-ASCII path masks that path's change.
{
  const { repo, root } = repoOf('hook');
  const tree = path.join(root, 'slicetrees', '05'); // the hook finds the run from a path under `.superdev/scopes/<name>/slicetrees/<id>`
  fs.mkdirSync(tree, { recursive: true });
  fs.writeFileSync(path.join(root, 'ledger.md'), '# Ledger — demo\n\n**Stage:** implementing\n\n| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n| 05 | #5 | t | behavior | — | in-progress | — |\n');
  git(tree, 'init', '-q', '-b', 'main');
  git(tree, 'config', 'user.email', 't@example.com');
  git(tree, 'config', 'user.name', 't');
  put(tree, 'seed.txt', 's\n');
  commit(tree, 'base');
  const base = git(tree, 'rev-parse', 'HEAD');
  const names = ['with space.txt', 'café ü.txt', 'plain.txt'];
  for (const n of names) put(tree, n, 'one\n');
  commit(tree, 'write through the tool');
  const tip = git(tree, 'rev-parse', 'HEAD');

  const none = call(['untraced', `${base}..${tip}`, '--slice', '05', '--root', root], '', tree);
  assert.ok(none.ok, none.err);
  assert.deepEqual(rows(none.out), names.map((n) => `added\t${n}`).sort(), 'with no edit line every path is listed');

  const hook = require.resolve('../plugin/hooks/run-trace.js');
  for (const n of names.slice(0, 2)) {
    const r = spawnSync(process.execPath, [hook], {
      input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: path.join(tree, n) }, cwd: tree }),
      encoding: 'utf8',
      timeout: 10000,
    });
    assertSpawnDecided(r, 'run-trace.js');
    assert.equal(r.status, 0, r.stderr);
  }
  const traced = call(['untraced', `${base}..${tip}`, '--slice', '05', '--root', root], '', tree);
  assert.ok(traced.ok, traced.err);
  assert.equal(traced.out, 'added\tplain.txt', 'the hook-recorded spaced and non-ASCII paths match git\'s and are not listed');
}
