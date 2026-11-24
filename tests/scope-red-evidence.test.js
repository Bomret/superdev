'use strict';

// Fixture repositories commit regardless of the maintainer's global git config.
const { test, after } = require('node:test');
const { copyFixture, templateOnce } = require('./fixture-git');

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

after(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

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
// One template per distinct argument set, built once per process with its own commit SHAs in `shas.json`, and copied per
// call.
const templates = new Map();
function make(focused = 'node focus.js {paths}', extra = '') {
  const key = JSON.stringify([focused, extra]);
  if (!templates.has(key)) {
    templates.set(key, templateOnce((repo) => {
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
      fs.writeFileSync(path.join(repo, '.git', 'shas.json'), JSON.stringify({ B, R, M, T, S }));
    }, 'scope-red-template-'));
  }
  const repo = copyFixture(templates.get(key)(), 'scope-red-');
  made.push(repo);
  const { B, R, M, T, S } = JSON.parse(fs.readFileSync(path.join(repo, '.git', 'shas.json'), 'utf8'));
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

const f = make();

test('A red record at the tip prints the commit and the failed files its paired `Failed` record names.', () => {
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
    // A git error other than "not an ancestor" is no "not an ancestor": the record's commit does not exist, so the verb refuses.
    assert.match(verb(f.args(f.root([`**Suite:** red @ ${'0'.repeat(40)}`])), f.repo).err, /ancestor/, 'a record commit git cannot read refuses');
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
    // An unresolved branch refuses up front, CI input only included.
    const tsv = path.join(f.repo, '.superdev', 'unresolved.tsv');
    fs.mkdirSync(path.dirname(tsv), { recursive: true });
    fs.writeFileSync(tsv, 'lint\tfailure\n');
    assert.match(verb(['--root', f.root([]), '--branch', 'nope', '--base', 'main', '--ci-head', f.T, '--ci-file', tsv], f.repo).err, /does not resolve/, 'an unknown branch with CI input only');
  }
  // Coverage: runs on a clean tree at a later commit on the tip's ancestry close the record. The trace line is
  // `<kind> <result> <sha> <tree> <paths> ...`, a path run carrying its directory last.
  const PATH_RUN = (sha, file, res = 'pass', tree = 'clean', dir = '.') => ['path', res, sha, tree, file, '1', 'node t.js', dir];
  const FOCUSED = (sha, paths, res = 'pass', tree = 'clean') => ['focused', res, sha, tree, encodePaths(paths)];
  const red = (lines, fail = true) => f.root([`**Suite:** red @ ${f.R}`, ...(fail ? [`**Failed:** tests/a.test.js @ ${f.R}`] : [])], lines);
  // The verb's full output. A plainly covered record raises no finding, so `none` follows its line; a red line and a clean-tip
  // line, which closes nothing at review entry, take no `none`.
  const out = (rt, cwd = f.repo) => verb(f.args(rt), cwd).out;
  const REDLINE = `red ${f.R} files=tests/a.test.js`;
  {
    assert.strictEqual(out(red([PATH_RUN(f.M, 'tests/a.test.js')])), `covered ${f.R} by ${f.M}\nnone`, 'covered by a path run at a later commit');
    assert.strictEqual(out(red([FOCUSED(f.T, ['tests/a.test.js', 'src/x.js'])])), `covered ${f.R} by ${f.T}\nnone`, 'covered by a focused run whose path set holds the file');
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
    assert.strictEqual(out(bare([FOCUSED(f.M, ['src/x.js'])])), `covered ${f.R} by ${f.M}\nnone`, 'a focused run over the whole range covers');
    assert.strictEqual(out(bare([FOCUSED(f.T, ['src/x.js', 'src/y.js'])])), `covered ${f.R} by ${f.T}\nnone`, 'the range at a later commit');
    assert.strictEqual(out(bare([FOCUSED(f.T, ['src/x.js'])])), `red ${f.R} files=`, 'a focused run over fewer paths than the range does not cover');
    assert.strictEqual(out(bare([FOCUSED(f.M, ['src/x.js'], 'unknown')])), `red ${f.R} files=`, 'an unknown focused run never covers');
  }
  // Where the focused fence repeats the full fence, a focused run is a full run: the cycle's own path runs cover it instead.
  {
    const e = make('node all.js');
    const bare = (lines, at = e.T) => e.root([`**Suite:** red @ ${at}`], lines);
    assert.strictEqual(out(bare([]), e.repo), `red ${e.T} files=`, 'no later commit: nothing covers the record');
    // ADR 0255: a cycle that changed no test file closes the finding on its tip being clean. The verb reads no clean-tree
    // state there, so the line names the tip and the review judges it. A clean-tip line closes nothing at review entry, so no
    // `none` follows it.
    assert.strictEqual(out(bare([], e.R), e.repo), `covered ${e.R} by ${e.T} clean-tip`, 'no test file changed since: the branch tip, flagged clean-tip');
    assert.strictEqual(out(bare([['full', 'pass', e.M, 'clean']], e.R), e.repo), `covered ${e.R} by ${e.M}\nnone`, 'a passing clean run at the later commit covers, with no clean-tip flag');
    assert.strictEqual(out(bare([['full', 'pass', e.M, 'dirty']], e.R), e.repo), `covered ${e.R} by ${e.T} clean-tip`, 'a dirty run is no pass, and the clean-tip line is the review\'s to judge');
    assert.strictEqual(out(bare([['full', 'pass', e.M, 'unknown']], e.R), e.repo), `covered ${e.R} by ${e.T} clean-tip`, 'an unknown tree never covers plainly (INV-0009)');
    assert.strictEqual(out(bare([['full', 'pass', e.T, 'unknown']], e.R), e.repo), `covered ${e.R} by ${e.T} clean-tip`, 'an unknown tree at the tip is no plain cover, and the review judges the tree');
    // The clean-tip line names the branch tip only: a failed or unknown run at the tip leaves the record red, with no fallback to an earlier commit.
    assert.strictEqual(out(bare([['full', 'fail', e.T, 'clean']], e.R), e.repo), `red ${e.R} files=`, 'a failed run at the tip gives no clean-tip and no earlier commit');
    assert.strictEqual(out(bare([['full', 'unknown', e.T, 'clean']], e.R), e.repo), `red ${e.R} files=`, 'an unknown result at the tip gives no clean-tip');
    // The run writer writes `unknown` in the commit field where it cannot read the tree's HEAD, and a failed run there is never placed at the tip (INV-0009).
    assert.strictEqual(out(bare([['full', 'fail', 'unknown', 'clean']], e.R), e.repo), `red ${e.R} files=`, 'a failed run whose commit reads unknown gives no clean-tip');
    assert.strictEqual(out(bare([['full', 'fail', 'unknown', 'unknown']], e.R), e.repo), `red ${e.R} files=`, 'a failed run whose commit and tree read unknown gives no clean-tip');
    assert.strictEqual(out(bare([['full', 'pass', 'unknown', 'clean']], e.R), e.repo), `red ${e.R} files=`, 'a passing run whose commit reads unknown covers nothing and gives no clean-tip');
    assert.strictEqual(out(bare([['full', 'fail', e.T, 'clean'], ['full', 'fail', e.M, 'clean']], e.R), e.repo), `red ${e.R} files=`, 'a failed run at every later commit leaves the record red');
    // A record that names failed files takes no clean-tip exception: its files need their own runs.
    assert.strictEqual(out(e.root([`**Suite:** red @ ${e.R}`, `**Failed:** tests/a.test.js @ ${e.R}`], []), e.repo), `red ${e.R} files=tests/a.test.js`, 'failed files are covered only by runs');
    const T2 = commit(e.repo, 'tests/b.test.js', 'b\n', 'test');
    assert.strictEqual(out(bare([]), e.repo), `red ${e.T} files=`, 'a test file changed since and no path run of it');
    // A later commit up to the tip changed a test file with no path run of it: no clean-tip line, however clean an earlier commit was.
    assert.strictEqual(out(e.root([`**Suite:** red @ ${e.R}`], []), e.repo), `red ${e.R} files=`, 'a test file changed up to the tip gives no clean-tip');
    assert.strictEqual(out(bare([PATH_RUN(T2, 'tests/b.test.js')]), e.repo), `covered ${e.T} by ${T2}\nnone`,'a path run of each changed test file covers');
    assert.strictEqual(out(bare([FOCUSED(T2, ['src/y.js', 'tests/b.test.js'])]), e.repo), `red ${e.T} files=`, 'a focused run is a full run there and covers nothing');
  }
  // A test file deleted since the record needs no run of its own, an empty one that remains still does, and a git error refuses.
  {
    const d = make('node all.js');
    const bare = (lines) => d.root([`**Suite:** red @ ${d.T}`], lines);
    commit(d.repo, 'tests/empty.test.js', '', 'empty test');
    g(['rm', '-q', 'tests/a.test.js'], d.repo);
    g(['commit', '-q', '-m', 'delete a'], d.repo);
    const D = g(['rev-parse', 'HEAD'], d.repo);
    assert.strictEqual(out(bare([['full', 'pass', D, 'clean'], PATH_RUN(D, 'tests/empty.test.js')]), d.repo), `covered ${d.T} by ${D}\nnone`,'a deleted test file needs no run');
    assert.strictEqual(out(bare([['full', 'pass', D, 'clean']]), d.repo), `red ${d.T} files=`, 'an empty test file that remains still needs its own run');
    // `docs/agents` is unchanged since the record, so its tree object is unread by the path listing and unreadable by the configuration read.
    const e = make('node all.js');
    const tree = g(['rev-parse', `${e.M}:docs/agents`], e.repo);
    fs.rmSync(path.join(e.repo, '.git', 'objects', tree.slice(0, 2), tree.slice(2)), { force: true });
    assert.match(verb(e.args(e.root([`**Suite:** red @ ${e.R}`], [['full', 'pass', e.M, 'clean']])), e.repo).err, /git could not read docs\/agents\/verification\.md/, 'a git error refuses and names the cause');
  }
  // A deleted test file whose name begins with `:` is read literally: `:foo.test.js` deleted beside a present `foo.test.js` needs
  // no run of its own. Where git cannot say whether it exists, the verb refuses, naming the path and the commit.
  {
    const d = make('node all.js');
    commit(d.repo, 'foo.test.js', 'foo\n', 'foo test');
    const X = commit(d.repo, ':foo.test.js', 'colon\n', 'colon test');
    g(['rm', '-q', '--', ':(literal):foo.test.js'], d.repo);
    g(['commit', '-q', '-m', 'delete :foo.test.js'], d.repo);
    const D = g(['rev-parse', 'HEAD'], d.repo);
    const rt = d.root([`**Suite:** red @ ${X}`], [['full', 'pass', D, 'clean']]);
    assert.strictEqual(out(rt, d.repo), `covered ${X} by ${D}\nnone`, 'a deleted :foo.test.js beside a present foo.test.js needs no run');
    // A `git` on PATH that fails every `ls-tree` and runs every other call: only the existence check cannot answer.
    const shim = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-red-shim-')));
    made.push(shim);
    const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
    fs.writeFileSync(path.join(shim, 'git'), `#!/bin/sh\nfor a in "$@"; do [ "$a" = ls-tree ] && exit 128; done\nexec ${JSON.stringify(realGit)} "$@"\n`, { mode: 0o755 });
    const savedPath = process.env.PATH;
    process.env.PATH = `${shim}${path.delimiter}${savedPath}`;
    let refused;
    try {
      refused = verb(d.args(rt), d.repo);
    } finally {
      process.env.PATH = savedPath;
    }
    assert.strictEqual(refused.ok, false, 'a check git cannot answer refuses');
    assert.ok(refused.err.includes(':foo.test.js') && refused.err.includes(D), `the refusal names the path and the commit: ${refused.err}`);
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
    assert.strictEqual(verb(m.args(m.root([]), ['--ci-head', m.T, '--ci-file', status(FAILED)]), m.repo).out, 'ci-malformed', 'a malformed section is an unread source, never none');
    // A red local record and a failed check are reported together; a CI input alone is no "nothing to read".
    const both = c.root([`**Suite:** red @ ${c.T}`]);
    assert.strictEqual(ci(c.T, FAILED, both), `red ${c.T} files=\nci: failed ${c.T}\nci-failed lint http://l/1 ${c.T}`, 'both sources');
    // A failed check closes through the coverage rule of a red record with no failed file: a later commit's passing focused run over the range.
    const FOC = (sha, paths, tree = 'clean') => ['focused', 'pass', sha, tree, encodePaths(paths)];
    assert.strictEqual(ci(c.R, FAILED, c.root([], [FOC(c.M, ['src/x.js'])])), `ci: failed ${c.R}\ncovered ${c.R} by ${c.M}\nnone`, 'a failed check a later passing run covers');
    assert.strictEqual(ci(c.R, FAILED, c.root([], [FOC(c.M, ['src/x.js'], 'dirty')])), `ci: failed ${c.R}\nci-failed lint http://l/1 ${c.R}`, 'a dirty run does not cover a failed check');
    assert.match(verb(c.args(rt, ['--ci-head', c.T, '--ci-file', path.join(c.repo, 'absent.tsv')]), c.repo).err, /absent\.tsv/, 'an unreadable check-status file refuses');
  }
  // The verb writes no ledger, trace, digest, or git change.
  {
    const rt = f.root([`**Suite:** red @ ${f.R}`, `**Failed:** tests/a.test.js @ ${f.R}`], [['path', 'pass', f.M, 'clean', 'tests/a.test.js', '1', 'node t.js', '.']]);
    const snap = () => [...fs.readdirSync(rt).sort().map((n) => `${n}=${fs.readFileSync(path.join(rt, n), 'utf8')}`),
      g(['status', '--porcelain', '--ignored'], f.repo), g(['rev-parse', 'HEAD', 'feat'], f.repo), g(['for-each-ref'], f.repo)].join('\n--\n');
    const before = snap();
    assert.strictEqual(verb(f.args(rt), f.repo).ok, true);
    assert.strictEqual(snap(), before, 'the ledger, the trace, the run root, and git are unchanged');
  }
});
