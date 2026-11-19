'use strict';

// Fixture repositories commit regardless of the maintainer's global git config.
require('./fixture-git');

// Suite for plugin/scripts/scope.js's `red-evidence` verb: the scope review's red-evidence reading (`references/review-scope-mode.md`'s
// `### 4.2 Red evidence`). It reads the ledger's suite and failed records, the run trace, and a check-status file, and writes nothing.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { scopePath, run } = require('./scope-setup');
const { appendTrace } = require(scopePath);
const { encodePaths } = require('../plugin/lib/trace-log.js');

const g = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const made = [];

// The verb in-process: its stdout lines, or the refusal it threw.
const verb = (argv, cwd) => {
  const logged = [];
  const orig = console.log;
  console.log = (s) => logged.push(String(s));
  process.exitCode = undefined;
  try {
    run(['red-evidence', ...argv], cwd, '');
    return { ok: true, code: process.exitCode || 0, out: logged.join('\n') };
  } catch (e) {
    if (e.isRefusal) return { ok: false, err: e.message };
    throw e;
  } finally {
    console.log = orig;
    process.exitCode = undefined;
  }
};

const VERIF = (focused, extra = '') => `# V\n\n\`\`\`\nnode all.js\n\`\`\`\n\n\`\`\`\n${focused}\n\`\`\`\n${extra}`;
const commit = (repo, file, text, msg) => {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), text);
  g(['add', '-A'], repo);
  g(['commit', '-q', '-m', msg], repo);
  return g(['rev-parse', 'HEAD'], repo);
};

// A repository whose `feat` branch holds R (a range commit), then M and T on top of it, and a side commit S off R's ancestry.
function make(focused = 'node focus.js {paths}', extra = '') {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-red-')));
  made.push(repo);
  g(['init', '-q', '-b', 'main'], repo);
  fs.writeFileSync(path.join(repo, '.gitignore'), '.superdev/\n');
  commit(repo, 'docs/agents/verification.md', VERIF(focused, extra), 'base');
  commit(repo, 'tests/a.test.js', 'a\n', 'tests');
  const B = g(['rev-parse', 'HEAD'], repo);
  g(['checkout', '-q', '-b', 'feat'], repo);
  const R = commit(repo, 'src/x.js', 'x\n', 'range');
  const M = commit(repo, 'src/x.js', 'fixed\n', 'fix');
  const T = commit(repo, 'src/y.js', 'y\n', 'more');
  g(['checkout', '-q', '-b', 'side', B], repo);
  const S = commit(repo, 'src/z.js', 'z\n', 'side');
  g(['checkout', '-q', 'feat'], repo);
  let n = 0;
  // A run root: `header` lines (`Suite`, `Failed`) and trace run lines.
  const root = (header, lines = []) => {
    const rt = path.join(repo, '.superdev', 'scopes', `f-${++n}`);
    fs.mkdirSync(rt, { recursive: true });
    fs.writeFileSync(path.join(rt, 'ledger.md'), `# Ledger — f-${n}\n\n**Stage:** reviewed\n**Branch:** feat\n${header.map((h) => `${h}\n`).join('')}**Anchor:** #1 — f\n\n` +
      '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n', 'utf8');
    for (const l of lines) appendTrace(rt, { kind: 'run', fields: l });
    return rt;
  };
  const args = (rt, extra = []) => ['--root', rt, '--branch', 'feat', '--base', 'main', ...extra];
  return { repo, B, R, M, T, S, root, args };
}

try {
  const f = make();

  // A red record at the tip prints the commit and the failed files its paired `Failed` record names.
  {
    const rt = f.root([`**Suite:** red @ ${f.T}`, `**Failed:** tests/a.test.js @ ${f.T}`]);
    const r = verb(f.args(rt), f.repo);
    assert.deepStrictEqual(r, { ok: true, code: 0, out: `red ${f.T} files=tests/a.test.js` }, 'a red record at the tip is a finding');
  }
  // A red record at an ancestor of the tip is a finding too; a `Failed` record of another SHA pairs with nothing.
  {
    const rt = f.root([`**Suite:** red @ ${f.R}`, `**Failed:** tests/a.test.js @ ${f.T}`]);
    assert.strictEqual(verb(f.args(rt), f.repo).out, `red ${f.R} files=`, 'red at an ancestor; the mismatched Failed record names no file');
  }
  // A red record off the tip's ancestry, and every other record, find nothing; no record and no CI input reads nothing.
  {
    assert.strictEqual(verb(f.args(f.root([`**Suite:** red @ ${f.S}`])), f.repo).out, 'none', 'red off the ancestry');
    for (const res of ['green', 'none', 'denied']) {
      assert.strictEqual(verb(f.args(f.root([`**Suite:** ${res} @ ${f.T}`])), f.repo).out, 'none', `${res} record`);
    }
    assert.strictEqual(verb(f.args(f.root([])), f.repo).out, 'nothing-to-read', 'no record, no CI input');
  }
  // Refusals: a missing flag, a branch that resolves to nothing, an unreadable record, and half a CI input.
  {
    const rt = f.root([`**Suite:** red @ ${f.T}`]);
    assert.match(verb(['--root', rt, '--branch', 'feat'], f.repo).err, /needs --base/, 'a missing --base');
    assert.match(verb(['--root', rt, '--branch', 'nope', '--base', 'main'], f.repo).err, /does not resolve/, 'an unknown branch');
    assert.match(verb(f.args(f.root(['**Suite:** garbage'])), f.repo).err, /unreadable suite record/, 'an unreadable record');
    assert.match(verb(f.args(rt, ['--ci-head', f.T]), f.repo).err, /--ci-head and --ci-file/, '--ci-head without --ci-file');
    assert.match(verb(f.args(rt, ['--ci-file', 'x']), f.repo).err, /--ci-head and --ci-file/, '--ci-file without --ci-head');
  }
  // Coverage: runs on a clean tree at a later commit on the tip's ancestry close the record. The trace line is
  // `<kind> <result> <sha> <tree> <paths> ...`, a path run carrying its directory last.
  const PATH_RUN = (sha, file, res = 'pass', tree = 'clean', dir = '.') => ['path', res, sha, tree, file, '1', 'node t.js', dir];
  const FOCUSED = (sha, paths, res = 'pass', tree = 'clean') => ['focused', res, sha, tree, encodePaths(paths)];
  const red = (lines, fail = true) => f.root([`**Suite:** red @ ${f.R}`, ...(fail ? [`**Failed:** tests/a.test.js @ ${f.R}`] : [])], lines);
  // A covered record raises no finding, so `none` follows its line; the cases below read the record's own line.
  const out = (rt, cwd = f.repo) => verb(f.args(rt), cwd).out.replace(/\nnone$/, '');
  const REDLINE = `red ${f.R} files=tests/a.test.js`;
  {
    assert.strictEqual(out(red([PATH_RUN(f.M, 'tests/a.test.js')])), `covered ${f.R} by ${f.M}`, 'covered by a path run at a later commit');
    assert.strictEqual(out(red([FOCUSED(f.T, ['tests/a.test.js', 'src/x.js'])])), `covered ${f.R} by ${f.T}`, 'covered by a focused run whose path set holds the file');
    assert.strictEqual(out(red([FOCUSED(f.T, ['src/x.js'])])), REDLINE, 'a focused run missing the failed file does not cover');
    assert.strictEqual(out(red([PATH_RUN(f.R, 'tests/a.test.js')])), REDLINE, 'a run at the record\'s own commit does not cover it');
    assert.strictEqual(out(red([PATH_RUN(f.S, 'tests/a.test.js')])), REDLINE, 'a run at a commit off the ancestry does not cover it');
    assert.strictEqual(out(red([PATH_RUN(f.M, 'tests/a.test.js', 'pass', 'dirty')])), REDLINE, 'a dirty tree does not cover');
    assert.strictEqual(out(red([PATH_RUN(f.M, 'tests/a.test.js', 'unknown')])), REDLINE, 'an unknown result never covers');
    assert.strictEqual(out(red([PATH_RUN(f.M, 'tests/a.test.js', 'pass', 'unknown')])), REDLINE, 'an unknown tree never covers');
    assert.strictEqual(out(red([PATH_RUN(f.M, 'tests/a.test.js'), PATH_RUN(f.M, 'tests/a.test.js', 'fail')])), REDLINE, 'a failed run at the commit is never hidden');
    assert.strictEqual(out(red([PATH_RUN(f.M, 'tests/a.test.js', 'pass', 'clean', 'sub')])), REDLINE, 'a run from outside the tree root does not cover');
  }
  // A record with no failed file: a focused run over the scope's whole range covers it (the range base is the one `base resolve` prints).
  {
    const bare = (lines) => red(lines, false);
    assert.strictEqual(out(bare([FOCUSED(f.M, ['src/x.js'])])), `covered ${f.R} by ${f.M}`, 'a focused run over the whole range covers');
    assert.strictEqual(out(bare([FOCUSED(f.T, ['src/x.js', 'src/y.js'])])), `covered ${f.R} by ${f.T}`, 'the range at a later commit');
    assert.strictEqual(out(bare([FOCUSED(f.T, ['src/x.js'])])), `red ${f.R} files=`, 'a focused run over fewer paths than the range does not cover');
    assert.strictEqual(out(bare([FOCUSED(f.M, ['src/x.js'], 'unknown')])), `red ${f.R} files=`, 'an unknown focused run never covers');
  }
  // Where the focused fence repeats the full fence, a focused run is a full run: the cycle's own path runs cover it instead.
  {
    const e = make('node all.js');
    const bare = (lines, at = e.T) => e.root([`**Suite:** red @ ${at}`], lines);
    assert.strictEqual(out(bare([]), e.repo), `red ${e.T} files=`, 'no later commit: nothing covers the record');
    assert.strictEqual(out(bare([], e.R), e.repo), `covered ${e.R} by ${e.M}`, 'no test file changed since: the clean later commit covers');
    const T2 = commit(e.repo, 'tests/b.test.js', 'b\n', 'test');
    assert.strictEqual(out(bare([]), e.repo), `red ${e.T} files=`, 'a test file changed since and no path run of it');
    assert.strictEqual(out(bare([PATH_RUN(T2, 'tests/b.test.js')]), e.repo), `covered ${e.T} by ${T2}`, 'a path run of each changed test file covers');
    assert.strictEqual(out(bare([FOCUSED(T2, ['src/y.js', 'tests/b.test.js'])]), e.repo), `red ${e.T} files=`, 'a focused run is a full run there and covers nothing');
  }
  // The named CI checks: judged through `ci.js`, a finding only on a failed verdict at the tip or an ancestor of it (INV-0191).
  {
    const c = make('node focus.js {paths}', '\n## CI\n\n- `lint`\n- `test`\n');
    const status = (text) => {
      const file = path.join(c.repo, '.superdev', `status-${made.length}-${Math.abs(text.length)}-${text.charCodeAt(0)}.tsv`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
      return file;
    };
    const rt = c.root([]);
    const ci = (head, text, root = rt) => verb(c.args(root, ['--ci-head', head, '--ci-file', status(text)]), c.repo).out;
    const FAILED = 'lint\tfailure\thttp://l/1\ntest\tsuccess\n';
    assert.strictEqual(ci(c.T, FAILED), `ci: failed ${c.T}\nci-failed lint http://l/1 ${c.T}`, 'a failed check at the tip is a finding');
    assert.strictEqual(ci(c.R, FAILED), `ci: failed ${c.R}\nci-failed lint http://l/1 ${c.R}`, 'a failed check at an ancestor is a finding');
    assert.strictEqual(ci(c.T, 'lint\tfailure\ta\ntest\terror\tb\n'), `ci: failed ${c.T}\nci-failed lint a ${c.T}\nci-failed test b ${c.T}`, 'one finding per failed check');
    assert.strictEqual(ci(c.S, FAILED), `ci: failed ${c.S} (head is no ancestor of the tip)\nnone`, 'a head that is no ancestor of the tip raises no finding');
    assert.strictEqual(ci(c.T, 'lint\tqueued\ntest\tsuccess\n'), `ci: not-green ${c.T}\nnone`, 'a pending verdict raises no finding');
    assert.strictEqual(ci(c.T, 'lint\tsuccess\ntest\tsuccess\n'), `ci: green ${c.T}\nnone`, 'a green verdict raises no finding');
    assert.strictEqual(ci(c.T, 'nothing\n'), `ci: not-green ${c.T} (no check report read)\nnone`, 'an input holding no report is undecided');
    g(['checkout', '-q', '-b', 'noci', c.B], c.repo);
    const noCi = commit(c.repo, 'docs/agents/verification.md', VERIF('node focus.js {paths}'), 'no ci');
    g(['checkout', '-q', 'feat'], c.repo);
    assert.strictEqual(ci(noCi, FAILED), `ci: cannot-judge ${noCi} (no named checks at that commit)\nnone`, 'a head with no named checks is undecided');
    const m = make('node focus.js {paths}', '\n## CI\n\nnone\n\n- `lint`\n');
    assert.strictEqual(verb(m.args(m.root([]), ['--ci-head', m.T, '--ci-file', status(FAILED)]), m.repo).out, 'ci-malformed\nnone', 'a malformed section');
    // A red local record and a failed check are reported together; a CI input alone is no "nothing to read".
    const both = c.root([`**Suite:** red @ ${c.T}`]);
    assert.strictEqual(ci(c.T, FAILED, both), `red ${c.T} files=\nci: failed ${c.T}\nci-failed lint http://l/1 ${c.T}`, 'both sources');
    assert.match(verb(c.args(rt, ['--ci-head', c.T, '--ci-file', path.join(c.repo, 'absent.tsv')]), c.repo).err, /absent\.tsv/, 'an unreadable check-status file refuses');
  }
  console.log('scope-red-evidence tests passed');
} finally {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
}
