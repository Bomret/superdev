'use strict';

// Fixture repositories commit regardless of the maintainer's global git config.
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `suite failed` verb and the reuse it opens (ADR 0237): a red full run at R whose failing
// test files the ledger names carries to a later tip T, under T's complete-selector declaration, once each named file passed
// alone at T from the tree root and a focused run at T covered every path changed since R.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { scopePath, run } = require('./scope-setup');
const { appendTrace } = require(scopePath);
const { encodePaths } = require('../plugin/lib/trace-log.js');

const g = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const callIn = (argv, cwd) => {
  const orig = console.log;
  const logged = [];
  console.log = (s) => logged.push(String(s));
  try {
    run(argv, cwd, '');
    return { ok: true, out: logged.join('\n') };
  } catch (e) {
    if (e.isRefusal) return { ok: false, err: e.message };
    throw e;
  } finally {
    console.log = orig;
  }
};

const DECLARED = '\n## Complete selector\n\nThe focused command selects every test a changed path can affect.\n';
const made = [];

// A repository whose `feat` branch holds R, the commit a full run failed at, and T, a fix commit on top of it.
function make(extra = DECLARED) {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-failed-')));
  made.push(repo);
  g(['init', '-q', '-b', 'main'], repo);
  fs.writeFileSync(path.join(repo, '.gitignore'), '.superdev/\n');
  fs.mkdirSync(path.join(repo, 'docs', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs', 'agents', 'verification.md'), `# V\n\n\`\`\`\nnode all.js\n\`\`\`\n\n\`\`\`\nnode focus.js {paths}\n\`\`\`\n${extra}`);
  fs.mkdirSync(path.join(repo, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'tests', 'a.test.js'), 'a\n');
  fs.writeFileSync(path.join(repo, 'tests', 'b.test.js'), 'b\n');
  g(['add', '.'], repo);
  g(['commit', '-q', '-m', 'base'], repo);
  g(['checkout', '-q', '-b', 'feat'], repo);
  fs.writeFileSync(path.join(repo, 'src', 'x.js'), 'x\n');
  g(['add', '.'], repo);
  g(['commit', '-q', '-m', 'range'], repo);
  const R = g(['rev-parse', 'HEAD'], repo);
  fs.writeFileSync(path.join(repo, 'src', 'x.js'), 'fixed\n');
  g(['commit', '-q', '-am', 'fix'], repo);
  const T = g(['rev-parse', 'HEAD'], repo);
  let n = 0;
  const root = (lines) => {
    const rt = path.join(repo, '.superdev', 'scopes', `f-${++n}`);
    fs.mkdirSync(rt, { recursive: true });
    fs.writeFileSync(path.join(rt, 'ledger.md'), `# Ledger — f-${n}\n\n**Stage:** reviewed\n**Branch:** feat\n**Suite:** red @ ${R}\n**Anchor:** #1 — f\n\n` +
      '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n', 'utf8');
    for (const l of lines) appendTrace(rt, { kind: 'run', fields: l });
    return rt;
  };
  return { repo, R, T, root };
}

const FAILED = (sha) => ['full', 'fail', sha, 'clean'];
const ALONE = (sha, file, res = 'pass', tree = 'clean', dir = '.') => ['path', res, sha, tree, file, '1', 'node t.js', dir];
const FOCUSED = (sha, res = 'pass', tree = 'clean', paths = ['src/x.js']) => ['focused', res, sha, tree, encodePaths(paths)];
const ledgerOf = (rt) => fs.readFileSync(path.join(rt, 'ledger.md'), 'utf8');

try {
  const f = make();
  const failedAt = (rt, files, cwdSha) => {
    g(['checkout', '-q', cwdSha], f.repo);
    try { return callIn(['suite', 'failed', ...files, '--root', rt], f.repo); } finally { g(['checkout', '-q', 'feat'], f.repo); }
  };
  const reusable = (rt, ...flags) => callIn(['suite', 'reusable', '--branch', 'feat', '--base', 'main', ...flags, '--root', rt], f.repo);
  const good = [FAILED(f.R), ALONE(f.T, 'tests/a.test.js'), ALONE(f.T, 'tests/b.test.js'), FOCUSED(f.T)];

  // The verb records the files and HEAD; with the fixed files and a covering focused run at T, the red record carries.
  let rt = f.root(good);
  let r = reusable(rt);
  assert.ok(!r.ok, 'a red record with no failed-files record stays red: ' + (r.err || ''));
  r = failedAt(rt, ['tests/a.test.js', './tests/b.test.js'], f.R);
  assert.ok(r.ok, 'suite failed records: ' + (r.err || ''));
  assert.ok(ledgerOf(rt).includes(`**Failed:** tests/a.test.js tests/b.test.js @ ${f.R}\n`), 'the ledger carries the record: ' + ledgerOf(rt));
  r = reusable(rt);
  assert.ok(r.ok && r.out === 'reusable', 'the repaired failures carry the record to the fix tip: ' + (r.err || ''));
  assert.ok(!reusable(rt, '--whole').ok, 'a repaired failure never serves a whole-repo gate');

  // The verb refuses no file, a spaced token, and a file HEAD does not hold, and writes nothing then.
  rt = f.root(good);
  assert.ok(!callIn(['suite', 'failed', '--root', rt], f.repo).ok, 'no file refuses');
  assert.ok(!callIn(['suite', 'failed', 'tests/missing.test.js', '--root', rt], f.repo).ok, 'a missing file refuses');
  assert.ok(!callIn(['suite', 'failed', 'two words', '--root', rt], f.repo).ok, 'a spaced token refuses');
  assert.ok(!ledgerOf(rt).includes('**Failed:**'), 'a refused verb writes no record');

  // Every shortfall stays red.
  const red = (lines, why, files = ['tests/a.test.js', 'tests/b.test.js']) => {
    const x = f.root(lines);
    assert.ok(failedAt(x, files, f.R).ok);
    const res = reusable(x);
    assert.ok(!res.ok, `${why} stays red`);
  };
  red([FAILED(f.R), ALONE(f.T, 'tests/a.test.js'), FOCUSED(f.T)], 'a named file with no passing run at the tip');
  red([FAILED(f.R), ALONE(f.T, 'tests/a.test.js'), ALONE(f.T, 'tests/b.test.js', 'pass', 'dirty'), FOCUSED(f.T)], 'a named file passing only on a dirty tree');
  red([FAILED(f.R), ALONE(f.T, 'tests/a.test.js'), ALONE(f.T, 'b.test.js', 'pass', 'clean', 'tests'), FOCUSED(f.T)], 'a named file run outside the tree root');
  red([FAILED(f.R), ALONE(f.T, 'tests/a.test.js'), ALONE(f.T, 'tests/b.test.js'), ALONE(f.T, 'tests/b.test.js', 'fail'), FOCUSED(f.T)], 'a failed path run at the tip');
  red([FAILED(f.R), ALONE(f.T, 'tests/a.test.js'), ALONE(f.T, 'tests/b.test.js')], 'no focused run at the tip');
  red([FAILED(f.R), ALONE(f.T, 'tests/a.test.js'), ALONE(f.T, 'tests/b.test.js'), FOCUSED(f.T, 'pass', 'clean', ['src/y.js'])], 'a focused run that misses a changed path');
  red([FAILED(f.R), ALONE(f.T, 'tests/a.test.js'), ALONE(f.T, 'tests/b.test.js'), FOCUSED(f.T, 'fail')], 'a failing focused run');
  red([FAILED(f.R), FAILED(f.R), ALONE(f.T, 'tests/a.test.js'), ALONE(f.T, 'tests/b.test.js'), FOCUSED(f.T)], 'two failed full runs at the failed commit');
  red([ALONE(f.T, 'tests/a.test.js'), ALONE(f.T, 'tests/b.test.js'), FOCUSED(f.T)], 'no failed full run in the trace');

  // A record for another commit, or none at the tip's ancestor, decides nothing.
  rt = f.root(good);
  assert.ok(failedAt(rt, ['tests/a.test.js'], f.T).ok);
  assert.ok(!reusable(rt).ok, 'a failed-files record for another commit carries nothing');

  // Without the complete-selector declaration the record stays red.
  const plain = make('');
  const prt = plain.root([FAILED(plain.R), ALONE(plain.T, 'tests/a.test.js'), FOCUSED(plain.T)]);
  g(['checkout', '-q', plain.R], plain.repo);
  assert.ok(callIn(['suite', 'failed', 'tests/a.test.js', '--root', prt], plain.repo).ok);
  g(['checkout', '-q', 'feat'], plain.repo);
  r = callIn(['suite', 'reusable', '--branch', 'feat', '--base', 'main', '--root', prt], plain.repo);
  assert.ok(!r.ok && /complete-selector/.test(r.err), 'no declaration stays red: ' + (r.err || ''));
} finally {
  made.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
}

console.log('scope-suite-failed: ok');
