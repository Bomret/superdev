'use strict';

// Suite for plugin/scripts/scope.js's `reviewed check` (ADR 0273, INV-0201): the read-only verdict on a recorded
// reviewed tip, `delta <sha> <old range base>`, `unchanged <sha>`, or `whole <reason>`. Each case runs the real CLI in
// a child process from a copy of one fixture repository. A case that needs git itself to answer differently runs the
// CLI with a `git` wrapper first on PATH, built in the fixture, that answers one call its own way and hands every other
// to the real git.

require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { copyFixture, templateOnce } = require('./fixture-git');
const { scopePath, sliceJson } = require('./scope-setup');
const { assertSpawnDecided } = require('./spawn-verdict');

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' }).trim();
const realGit = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['git'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim();

// main: c1. feat/demo: c1 → c2 → c3. A run root `demo` at `implementing` whose dod.md holds two criteria.
const template = templateOnce((dir) => {
  git(dir, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'a.txt'), '1\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'c1');
  git(dir, 'switch', '-q', '-c', 'feat/demo');
  for (const n of ['2', '3']) {
    fs.writeFileSync(path.join(dir, 'a.txt'), `${n}\n`);
    git(dir, 'commit', '-q', '-am', `c${n}`);
  }
  const root = path.join(dir, '.superdev', 'scopes', 'demo');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'dod.md'), '## Definition of Done\n\n- [ ] The first thing holds — #1\n- [ ] The second thing holds — scope\n');
  const r = spawnSync(process.execPath, [scopePath, 'init', 'feat/demo', 'implementing'], { cwd: dir, input: sliceJson, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, 'fixture init: ' + r.stderr);
}, 'scope-reviewed-check-');

const fresh = () => {
  const repo = copyFixture(template(), 'scope-reviewed-check-case-');
  const root = path.join(repo, '.superdev', 'scopes', 'demo');
  const sc = (argv, env) => {
    const r = spawnSync(process.execPath, [scopePath, ...argv], { cwd: repo, encoding: 'utf8', timeout: 60000, killSignal: 'SIGKILL', env: env || process.env });
    assertSpawnDecided(r, 'scope.js ' + argv.join(' '));
    return r;
  };
  const rev = (ref) => git(repo, 'rev-parse', ref);
  const set = (tip) => assert.strictEqual(sc(['reviewed', 'set', '--branch', 'feat/demo', ...(tip ? ['--tip', tip] : []), '--root', root]).status, 0, 'reviewed set');
  const check = (env) => {
    const r = sc(['reviewed', 'check', '--branch', 'feat/demo', '--base', 'main', '--root', root], env);
    assert.strictEqual(r.status, 0, 'reviewed check exits 0: ' + r.stderr);
    const lines = r.stdout.split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 1, 'reviewed check prints one verdict line: ' + r.stdout);
    return lines[0];
  };
  return { repo, root, sc, rev, set, check };
};

// --- a recorded ancestor tip, unchanged criteria, and a recent git: the delta since that tip ------------------------
{
  const f = fresh();
  f.set('feat/demo~1');
  assert.strictEqual(f.check(), `delta ${f.rev('feat/demo~1')} ${f.rev('main')}`, 'delta <recorded sha> <old range base>');
}

const ledgerFile = (f) => path.join(f.root, 'ledger.md');
const runFiles = (f) => ['ledger.md', 'trace.log', 'digest.json'].map((n) => (fs.existsSync(path.join(f.root, n)) ? fs.readFileSync(path.join(f.root, n), 'utf8') : null));
// Rewrites the record's line in the fixture's ledger, as a ledger from another run or a hand edit would carry it.
const writeRecord = (f, value) => {
  const text = fs.readFileSync(ledgerFile(f), 'utf8');
  fs.writeFileSync(ledgerFile(f), text.replace(/^\*\*Reviewed:\*\* .*$/m, `**Reviewed:** ${value}`));
};
// The environment of a CLI run whose `git --version` prints `version`, or whose `git <sub>` exits 2, every other call reaching the real git.
const wrapped = (f, { version, failSub }) => {
  const bin = path.join(f.repo, '..', path.basename(f.repo) + '-bin');
  fs.mkdirSync(bin, { recursive: true });
  const lines = ['#!/bin/sh'];
  if (version) lines.push(`if [ "$1" = "--version" ]; then echo '${version}'; exit 0; fi`);
  if (failSub) lines.push(`if [ "$1" = "${failSub}" ]; then exit 2; fi`);
  lines.push(`exec '${realGit}' "$@"`);
  fs.writeFileSync(path.join(bin, 'git'), lines.join('\n') + '\n', { mode: 0o755 });
  return { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
};

// --- the branch tip equals the recorded tip: unchanged ---------------------------------------------------------
{
  const f = fresh();
  f.set();
  assert.strictEqual(f.check(), `unchanged ${f.rev('feat/demo')}`, 'unchanged <recorded sha>');
}

// --- each reason the record no longer holds reads the whole range, with its own reason, and writes nothing --------
{
  const cases = [
    ['no-record', () => {}],
    ['unreadable-record', (f) => { f.set('feat/demo~1'); writeRecord(f, 'not a record'); }],
    ['missing-commit', (f) => {
      f.set('feat/demo~1');
      const digest = fs.readFileSync(ledgerFile(f), 'utf8').match(/^\*\*Reviewed:\*\* \S+ (\S+)$/m)[1];
      writeRecord(f, `${'0123456789abcdef'.repeat(3).slice(0, 40)} ${digest}`);
    }],
    ['rewritten', (f) => {
      f.set();
      fs.writeFileSync(path.join(f.repo, 'a.txt'), 'amended\n');
      git(f.repo, 'commit', '-q', '--amend', '-am', 'c3 amended');
    }],
    ['criteria-changed', (f) => { f.set('feat/demo~1'); fs.appendFileSync(path.join(f.root, 'dod.md'), '- [ ] A third thing holds — #2\n'); }],
    ['dod-unreadable', (f) => { f.set('feat/demo~1'); fs.rmSync(path.join(f.root, 'dod.md')); }],
    ['untraceable-base', (f) => {
      f.set('feat/demo~1');
      git(f.repo, 'switch', '-q', '--orphan', 'lonely');
      fs.writeFileSync(path.join(f.repo, 'b.txt'), 'b\n');
      git(f.repo, 'add', 'b.txt');
      git(f.repo, 'commit', '-q', '-m', 'lonely');
      git(f.repo, 'switch', '-q', '-f', 'feat/demo');
    }, 'lonely'],
    ['git-too-old', (f) => { f.set('feat/demo~1'); return wrapped(f, { version: 'git version 2.35.9' }); }],
    ['git-too-old', (f) => { f.set('feat/demo~1'); return wrapped(f, { version: 'git version unknown' }); }],
    ['git-failed', (f) => { f.set('feat/demo~1'); return wrapped(f, { failSub: 'rev-list' }); }],
  ];
  for (const [reason, arrange, base] of cases) {
    const f = fresh();
    const env = arrange(f);
    const before = runFiles(f);
    const r = f.sc(['reviewed', 'check', '--branch', 'feat/demo', '--base', base || 'main', '--root', f.root], env);
    assert.strictEqual(r.status, 0, `${reason}: exits 0: ${r.stderr}`);
    assert.strictEqual(r.stdout, `whole ${reason}\n`, `${reason}: one whole line naming the reason`);
    assert.deepStrictEqual(runFiles(f), before, `${reason}: no ledger change, no trace event, no digest seal`);
  }
}

// --- a recorded tip reachable only through a second parent is no first-parent ancestor: rewritten -----------------
{
  const f = fresh();
  git(f.repo, 'switch', '-q', '-c', 'side');
  fs.writeFileSync(path.join(f.repo, 's.txt'), 's\n');
  git(f.repo, 'add', 's.txt');
  git(f.repo, 'commit', '-q', '-m', 's1');
  git(f.repo, 'switch', '-q', 'feat/demo');
  fs.writeFileSync(path.join(f.repo, 'a.txt'), '4\n');
  git(f.repo, 'commit', '-q', '-am', 'c4');
  git(f.repo, 'merge', '-q', '--no-ff', '-m', 'merge side', 'side');
  f.set('side');
  assert.strictEqual(f.check(), 'whole rewritten', 'an ancestor off the first-parent chain reads as rewritten');
  f.set('feat/demo~1');
  assert.strictEqual(f.check(), `delta ${f.rev('feat/demo~1')} ${f.rev('main')}`, 'its first-parent neighbour still reads as a delta');
}

// --- the old range base: the recorded Base where it is an ancestor of the recorded tip, else the merge-base ---------
{
  const f = fresh();
  f.set('feat/demo~1');
  assert.strictEqual(f.sc(['base', 'set', 'feat/demo~1', '--root', f.root]).status, 0, 'base set at the recorded tip');
  assert.strictEqual(f.check(), `delta ${f.rev('feat/demo~1')} ${f.rev('feat/demo~1')}`, 'a recorded Base that is an ancestor of the recorded tip is the old range base');
  assert.strictEqual(f.sc(['base', 'set', 'feat/demo', '--root', f.root]).status, 0, 'base set past the recorded tip');
  assert.strictEqual(f.check(), `delta ${f.rev('feat/demo~1')} ${f.rev('main')}`, 'a recorded Base past the recorded tip gives way to the merge-base');
}

// --- a vendor-suffixed git version reads as its numbers -----------------------------------------------------------
{
  for (const version of ['git version 2.39.3 (Apple Git-146)', 'git version 2.45.1.windows.1']) {
    const f = fresh();
    f.set('feat/demo~1');
    assert.strictEqual(f.check(wrapped(f, { version })), `delta ${f.rev('feat/demo~1')} ${f.rev('main')}`, `${version} is recent enough`);
  }
}

// --- the delta and unchanged verdicts write nothing either -------------------------------------------------------
{
  const f = fresh();
  f.set('feat/demo~1');
  const before = runFiles(f);
  assert.match(f.check(), /^delta /, 'a delta');
  assert.deepStrictEqual(runFiles(f), before, 'delta writes nothing');
  f.set();
  const mid = runFiles(f);
  assert.match(f.check(), /^unchanged /, 'unchanged');
  assert.deepStrictEqual(runFiles(f), mid, 'unchanged writes nothing');
}
