'use strict';

// Suite for plugin/scripts/scope.js's `fail-to-pass-check` verb (ADR 0260): a range's mechanical fail-to-pass verdict from the run
// trace and git. The fixtures are real git commits and raw trace lines; the suite runs in temporary directories.

require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { call } = require('./scope-setup');

const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 30000 });
  assertSpawnDecided(r, `git ${args.join(' ')}`);
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const put = (cwd, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
  fs.writeFileSync(path.join(cwd, rel), text);
};
const commit = (cwd, msg) => {
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', msg);
  return git(cwd, 'rev-parse', 'HEAD');
};

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-f2p-check-')));
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));

const repoOf = (name) => {
  const repo = path.join(dir, name);
  fs.mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 't@example.com');
  git(repo, 'config', 'user.name', 't');
  return repo;
};
let runs = 0;
// A run root outside the repository holding a ledger and exactly `lines` as its trace.
const runOf = (lines) => {
  const root = path.join(dir, `run-${runs++}`, '.superdev', 'scopes', 'demo');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'ledger.md'), '# Ledger — demo\n');
  fs.writeFileSync(path.join(root, 'trace.log'), lines.length ? lines.join('\n') + '\n' : '');
  return root;
};
const ts = '2026-11-19T10:00:00.000Z';
const outcome = (range, out, reason, command = 'node\\x20tests/a.test.js', slice = '01') => `${ts} ${slice} main fail-to-pass ${range} ${out} ${reason} ${command}`;
const edit = (rel, slice = '01') => `${ts} ${slice} a1 edit impl ${rel}`;
const check = (repo, range, root, ...extra) => call(['fail-to-pass-check', range, '--slice', '01', ...extra, '--root', root], '', repo);
const verdict = (repo, range, root, ...extra) => {
  const r = check(repo, range, root, ...extra);
  assert.ok(r.ok, r.err);
  assert.equal(r.out.split('\n').length, 1, `exactly one verdict line: ${r.out}`);
  return r.out;
};

// One linear history: test and code, test only, code only, test deletions beside code.
const repo = repoOf('linear');
put(repo, 'src/a.js', 'a0\n');
put(repo, 'tests/a.test.js', 't0\n');
put(repo, 'tests/b.test.js', 'b0\n');
const c0 = commit(repo, 'base');
put(repo, 'src/a.js', 'a1\n');
put(repo, 'tests/a.test.js', 't1\n');
const c1 = commit(repo, 'test and code');
put(repo, 'tests/c.test.js', 'c\n');
const c2 = commit(repo, 'test only');
put(repo, 'src/a.js', 'a3\n');
const c3 = commit(repo, 'code only');
fs.rmSync(path.join(repo, 'tests/b.test.js'));
put(repo, 'src/a.js', 'a4\n');
const c4 = commit(repo, 'test deletion and code');
const any = [edit('src/a.js')];

// #verdicts: each verdict prints for the range that produces it, with the deciding line's range and command.
{
  assert.equal(verdict(repo, `${c0}..${c1}`, runOf([...any, outcome(`${c0}..${c1}`, 'fail-to-pass', 'control=0,put-back=1')])),
    `fail-to-pass ${c0}..${c1} node tests/a.test.js`, 'a latest fail-to-pass line decides, its command decoded');
  assert.equal(verdict(repo, `${c0}..${c1}`, runOf([...any, outcome(`${c0}..${c1}`, 'fail-to-pass', 'control=0,put-back=1'), outcome(`${c0}..${c1}`, 'pass-to-pass', 'control=0,put-back=0')])),
    `pass-to-pass ${c0}..${c1} node tests/a.test.js`, 'the latest deciding line wins');
  assert.equal(verdict(repo, `${c0}..${c1}`, runOf([...any, outcome(`${c0}..${c1}`, 'pass-to-pass', 'control=0,put-back=0'), outcome(`${c0}..${c3}`, 'fail-to-pass', 'control=0,put-back=1', 'node\\x20tests/c.test.js')])),
    `closed ${c0}..${c3} node tests/c.test.js`, 'a later fail-to-pass from the pass-to-pass line\'s base to a newer tip closes it');
  assert.equal(verdict(repo, `${c0}..${c1}`, runOf([...any, outcome(`${c0}..${c1}`, 'unknown', 'control=1')])),
    `unknown control=1 ${c0}..${c1} node tests/a.test.js`, 'only unknown lines print unknown with the reason');
  assert.equal(verdict(repo, `${c0}..${c1}`, runOf(any)), 'missing', 'a test and code change with no outcome line is missing');
  assert.equal(verdict(repo, `${c1}..${c2}`, runOf(any)), 'test-only', 'test-path changes alone read test-only');
  assert.equal(verdict(repo, `${c2}..${c3}`, runOf(any)), 'no-test-change', 'code changes alone read no-test-change');
}

// #rules: the grading rules the reviewer prose stated.
{
  assert.equal(verdict(repo, `${c0}..${c1}`, runOf([...any, outcome(`${c0}..${c1}`, 'pass-to-pass', 'control=0,put-back=0'), outcome(`${c0}..${c1}`, 'unknown', 'control=1')])).split(' ')[0],
    'pass-to-pass', 'a later unknown line does not hide an earlier pass-to-pass');
  assert.equal(verdict(repo, `${c0}..${c1}`, runOf([...any, outcome(`${c0}..${c1}`, 'fail-to-pass', 'settled-from-trace')])).split(' ')[0],
    'fail-to-pass', 'a settled-from-trace line reads fail-to-pass');
  assert.equal(verdict(repo, `${c1}..${c3}`, runOf([...any, outcome(`${c0}..${c3}`, 'fail-to-pass', 'control=0,put-back=1')])).split(' ')[0],
    'fail-to-pass', 'an outcome from the slice\'s base covers a fix cycle\'s narrower range');
  assert.equal(verdict(repo, `${c3}..${c4}`, runOf(any)), 'no-test-change', 'test changes that are all deletions beside a code change read no-test-change, never missing');
  assert.equal(verdict(repo, `${c0}..${c1}`, runOf([`${ts} 01 main ledger slice 01 in-progress`])), 'missing', 'an untraced test write counts as a test change');
}

// #range: a range spelled as a branch, HEAD, or a short commit reads as its full commits; malformed ranges are refused.
{
  git(repo, 'branch', 'at-c1', c1);
  const root = runOf([...any, outcome(`${c0}..${c1}`, 'pass-to-pass', 'control=0,put-back=0')]);
  const full = verdict(repo, `${c0}..${c1}`, root);
  assert.equal(verdict(repo, `${c0.slice(0, 8)}..at-c1`, root), full, 'a short commit and a branch name read as their commits');
  assert.equal(verdict(repo, `${c3}..HEAD`, runOf([...any, outcome(`${c3}..${c4}`, 'pass-to-pass', 'control=0,put-back=0')])).split(' ')[0], 'pass-to-pass', 'HEAD reads as its commit');
  const dots = check(repo, `${c0}...${c1}`, root);
  assert.ok(!dots.ok && /\.\.\./.test(dots.err), 'a three-dot range is refused');
  const bad = check(repo, `${c0}..nowhere`, root);
  assert.ok(!bad.ok && /nowhere/.test(bad.err), 'an unresolvable side is refused naming it');
  const back = check(repo, `${c1}..${c0}`, root);
  assert.ok(!back.ok && /ancestor/.test(back.err), 'a base that is no ancestor of the tip is refused');
}

// #first-parent: a merged-in base commit adds no change.
{
  const r2 = repoOf('merged');
  put(r2, 'src/a.js', 'a0\n');
  put(r2, 'checks/a.js', 'c0\n');
  put(r2, 'docs/agents/verification.md', '# V\n\n## Test paths\n\n- `checks/`\n');
  const base = commit(r2, 'base');
  git(r2, 'checkout', '-q', '-b', 'feat');
  put(r2, 'checks/a.js', 'c1\n');
  commit(r2, 'a test change');
  git(r2, 'checkout', '-q', 'main');
  put(r2, 'src/a.js', 'a1\n');
  commit(r2, 'base moves');
  git(r2, 'checkout', '-q', 'feat');
  git(r2, 'merge', '-q', '--no-edit', 'main');
  const tip = git(r2, 'rev-parse', 'HEAD');
  assert.equal(verdict(r2, `${base}..${tip}`, runOf(any)), 'test-only', 'the merged-in src/a.js adds no change to the range');
}

// #tip-rule: the test-path rule at the range's tip classes the files.
{
  const r3 = repoOf('tip-rule');
  put(r3, 'checks/a.js', 'c0\n');
  const base = commit(r3, 'base, default test paths');
  put(r3, 'checks/a.js', 'c1\n');
  put(r3, 'docs/agents/verification.md', '# V\n\n## Test paths\n\n- `checks/`\n');
  const tip = commit(r3, 'the tip names checks/ as tests');
  assert.equal(verdict(r3, `${base}..${tip}`, runOf(any)), 'missing', 'by the tip\'s rule checks/a.js is a test beside the code change in verification.md');
}

// #gaps: an empty trace and a range with no change event print a reason, never missing; an unknown window is refused by name; no
// file of the run root changes.
{
  const empty = runOf([]);
  const before = Object.fromEntries(fs.readdirSync(empty).map((f) => [f, fs.readFileSync(path.join(empty, f), 'utf8')]));
  const e = verdict(repo, `${c0}..${c1}`, empty);
  assert.match(e, /^unknown no-trace\b/, 'an empty trace prints its reason, not missing');
  assert.match(verdict(repo, `${c1}..${c1}`, runOf(any)), /^unknown no-change\b/, 'a range with no change event prints its reason');
  const w = check(repo, `${c0}..${c1}`, runOf(any), '--window', 'nope');
  assert.ok(!w.ok && /nope/.test(w.err), 'an unknown window is refused by name');
  const after = Object.fromEntries(fs.readdirSync(empty).map((f) => [f, fs.readFileSync(path.join(empty, f), 'utf8')]));
  assert.deepEqual(after, before, 'the verb changes no file in the run root');
}

// #window: with --window only the lines every run of that dispatch covers decide, and a closing line in a later window still
// closes the window's pass-to-pass.
{
  const root = runOf([
    `${ts} 01 main dispatch superdev:implementer tu1 build -`,
    outcome(`${c1}..${c3}`, 'pass-to-pass', 'control=0,put-back=0'),
    `${ts} 01 main dispatch superdev:slice-reviewer tr1 review -`,
    outcome(`${c0}..${c3}`, 'fail-to-pass', 'control=0,put-back=1'),
  ]);
  assert.equal(verdict(repo, `${c1}..${c3}`, root).split(' ')[0], 'fail-to-pass', 'without --window the whole trace decides');
  assert.equal(verdict(repo, `${c1}..${c3}`, root, '--window', 'tu1').split(' ')[0], 'pass-to-pass', 'with --window only the window\'s own line decides');
  const later = runOf([
    `${ts} 01 main dispatch superdev:implementer tu1 build -`,
    outcome(`${c0}..${c1}`, 'pass-to-pass', 'control=0,put-back=0'),
    `${ts} 01 main dispatch superdev:implementer tu2 fix -`,
    outcome(`${c0}..${c3}`, 'fail-to-pass', 'control=0,put-back=1'),
  ]);
  assert.equal(verdict(repo, `${c0}..${c1}`, later, '--window', 'tu1'), `closed ${c0}..${c3} node tests/a.test.js`,
    'a fail-to-pass line in a later window from the same base to a newer tip closes the window\'s pass-to-pass');
}

console.log('scope fail-to-pass-check tests ok');
