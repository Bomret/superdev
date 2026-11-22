'use strict';

// Suite for the refusals of plugin/scripts/scope.js when its input is malformed or a file it reads is present but unreadable:
// `init` given a slices entry that is no object, `discard` given a run root that is no directory or whose ledger cannot be read,
// every ledger read and the digest check before a writing verb, the Definition-of-Done reads, `fail-to-pass`, and the slice-id rule.
// Each case runs the real CLI in a child process and expects one stderr line, a nonzero exit, and no stack trace.
// An absent file keeps its own outcome (INV-0181). An unreadable file is a directory (EISDIR) or, where the process is not root, mode 000 (EACCES).

require('./fixture-git');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { scopePath, sliceJson } = require('./scope-setup');
const { assertSpawnDecided } = require('./spawn-verdict');

const made = [];
const repoWith = () => {
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-unreadable-')));
  made.push(repo);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo, stdio: 'ignore' });
  return repo;
};
const sc = (repo, argv, input = '') => {
  const r = spawnSync(process.execPath, [scopePath, ...argv], { cwd: repo, input, encoding: 'utf8', timeout: 60000, killSignal: 'SIGKILL' });
  assertSpawnDecided(r, `scope.js ${argv.join(' ')}`);
  return r;
};
// One line on stderr, a nonzero exit, no stack trace.
const refused = (r, re, what) => {
  assert.notStrictEqual(r.status, 0, `${what}: exits nonzero`);
  assert.doesNotMatch(r.stderr, /\n\s+at /, `${what}: no stack trace: ${r.stderr}`);
  assert.strictEqual(r.stderr.trim().split('\n').length, 1, `${what}: one line: ${r.stderr}`);
  assert.match(r.stderr, re, `${what}: says why`);
};
const canBlockReads = process.platform !== 'win32' && !(process.getuid && process.getuid() === 0);
const dodText = '## Definition of Done\n\n- [ ] The first thing holds — #1\n';
// A run at `planned` named `demo`, sealed by one writing verb, with a dod.md.
const sealed = () => {
  const repo = repoWith();
  assert.strictEqual(sc(repo, ['init', 'feat/demo', 'planned'], sliceJson).status, 0, 'init');
  const root = path.join(repo, '.superdev', 'scopes', 'demo');
  assert.strictEqual(sc(repo, ['dod-merge', '--root', root], dodText).status, 0, 'dod-merge seals');
  assert.ok(fs.existsSync(path.join(root, 'digest.json')), 'sealed');
  return { repo, root };
};
const files = (root) => ['digest.json', 'trace.log'].map((n) => (fs.existsSync(path.join(root, n)) ? fs.readFileSync(path.join(root, n), 'utf8') : null));

// --- init: a slices entry that is no object -------------------------------------------------------------------------
for (const entry of ['null', '5', '[]', '"x"']) {
  const repo = repoWith();
  const r = sc(repo, ['init', 'fix/x', 'planned'], `{"anchor":"#1 — a","slices":[${entry}]}`);
  refused(r, /slice row/, `init with slices entry ${entry}`);
  assert.doesNotMatch(r.stderr, /TypeError/, 'no TypeError');
  assert.ok(!fs.existsSync(path.join(repo, '.superdev', 'scopes', 'x', 'ledger.md')), 'no ledger written');
}
{
  const repo = repoWith();
  assert.strictEqual(sc(repo, ['init', 'feat/ok', 'planned'], sliceJson).status, 0, 'a valid envelope is still accepted');
}

// --- discard: a root that is a regular file, or whose ledger cannot be read ---------------------------------------------
{
  const repo = repoWith();
  const scopes = path.join(repo, '.superdev', 'scopes');
  fs.mkdirSync(scopes, { recursive: true });
  const file = path.join(scopes, 'afile');
  fs.writeFileSync(file, 'keep\n');
  refused(sc(repo, ['discard', '--root', file]), /afile/, 'discard of a regular file');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), 'keep\n', 'the file is untouched');
  const root = path.join(scopes, 'dirledger');
  fs.mkdirSync(path.join(root, 'ledger.md'), { recursive: true });
  fs.writeFileSync(path.join(root, 'trace.log'), 'x\n');
  refused(sc(repo, ['discard', '--root', root]), /ledger\.md.*EISDIR/, 'discard with a directory ledger');
  assert.ok(fs.existsSync(path.join(root, 'trace.log')), 'a refusal removes nothing');
  const ok = sealed();
  assert.strictEqual(sc(ok.repo, ['discard', '--root', ok.root]).status, 0, 'discard of a valid planned root');
  for (const n of ['ledger.md', 'trace.log', 'digest.json']) assert.ok(!fs.existsSync(path.join(ok.root, n)), `${n} removed`);
}

// --- a sealed ledger that is a directory or unreadable: writing and reading verbs refuse before any tamper report ------------
const ledgerBreaks = [['a directory', /ledger\.md.*EISDIR/, (l) => { fs.rmSync(l); fs.mkdirSync(l); }]];
if (canBlockReads) ledgerBreaks.push(['mode 000', /ledger\.md.*EACCES/, (l) => fs.chmodSync(l, 0)]);
for (const [how, re, brk] of ledgerBreaks) {
  for (const argv of [(root) => ['stage', 'set', 'brainstormed', '--root', root], (root) => ['get', 'stage', '--root', root]]) {
    const { repo, root } = sealed();
    brk(path.join(root, 'ledger.md'));
    const before = files(root);
    const r = sc(repo, argv(root));
    refused(r, re, `${argv(root)[0]} with a ledger that is ${how}`);
    assert.doesNotMatch(r.stderr, /changed outside/, 'no tamper line printed');
    assert.deepStrictEqual(files(root), before, 'digest.json and trace.log unchanged');
  }
}
{
  // An absent ledger keeps its outcome: the deleted-ledger tamper report.
  const { repo, root } = sealed();
  fs.rmSync(path.join(root, 'ledger.md'));
  const r = sc(repo, ['stage', 'set', 'brainstormed', '--root', root]);
  assert.match(r.stderr, /ledger\.md in .* was changed outside scope\.js/, 'the deleted ledger is reported as tamper');
}

// --- dod.md unreadable: stage set implementing, reviewed check, dod-merge ---------------------------------------------------
{
  const { repo, root } = sealed();
  const dod = path.join(root, 'dod.md');
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'c1'], { cwd: repo });
  assert.strictEqual(sc(repo, ['reviewed', 'set', '--branch', 'main', '--root', root]).status, 0, 'reviewed set records a tip');
  const breaks = [['a directory', () => { fs.rmSync(dod); fs.mkdirSync(dod); }]];
  if (canBlockReads) breaks.push(['mode 000', () => fs.chmodSync(dod, 0)]);
  const restore = () => { fs.rmSync(dod, { recursive: true, force: true }); fs.writeFileSync(dod, dodText); };
  for (const [how, brk] of breaks) {
    brk();
    refused(sc(repo, ['dod-merge', '--root', root], dodText), /dod\.md/, `dod-merge with a dod.md that is ${how}`);
    refused(sc(repo, ['reviewed', 'check', '--branch', 'main', '--base', 'main', '--root', root]), /dod\.md/, `reviewed check with a dod.md that is ${how}`);
    restore();
  }
  if (canBlockReads) {
    fs.chmodSync(dod, 0);
    refused(sc(repo, ['stage', 'set', 'implementing', '--root', root]), /dod\.md/, 'stage set implementing with an unreadable dod.md');
    fs.chmodSync(dod, 0o644);
  }
}

// --- fail-to-pass and the scope-branch header read refuse on an unreadable ledger ---------------------------------------------
{
  const { root } = sealed();
  const ledger = path.join(root, 'ledger.md');
  fs.rmSync(ledger);
  fs.mkdirSync(ledger);
  const { readHeaderOrNull } = require('../plugin/lib/scope-branch.js');
  assert.throws(() => readHeaderOrNull(root, 'Branch'), (e) => e.isRefusal && /ledger\.md/.test(e.message), 'the header read refuses');
}
{
  const { f2pFixture, verif } = require('./scope-setup');
  const { CMD, scenario, done } = f2pFixture();
  try {
    const s = scenario({
      base: { 'src.txt': 'a\n', 'docs/agents/verification.md': verif(CMD, CMD, '\n## Prepare command\n\n`none`\n') },
      tip: { 'src.txt': 'b\n', 'tests/t.sh': 'grep -q b src.txt\n' },
    });
    fs.rmSync(path.join(s.root, 'ledger.md'));
    fs.mkdirSync(path.join(s.root, 'ledger.md'));
    refused(s.run(s.range), /ledger\.md.*EISDIR/, 'fail-to-pass with a directory ledger');
  } finally {
    done();
  }
}

// --- the slice-id rule ------------------------------------------------------------------------------------------------------
for (const id of ['.', 'a\u0000b', 'a\nb', 'a\u007fb', 'a\u001fb']) {
  const repo = repoWith();
  const env = JSON.stringify({ anchor: '#1 — a', slices: [{ id, issue: '#1', title: 't', type: 'behavior' }] });
  refused(sc(repo, ['init', 'feat/x', 'planned'], env), /slice id/, `init with slice id ${JSON.stringify(id)}`);
  const { repo: r2, root } = sealed();
  // In-process: a NUL byte cannot travel in an argument vector.
  const r = require('./scope-setup').call(['slice', id, 'in-progress', '--root', root], '', r2);
  assert.ok(!r.ok && /slice id/.test(r.err), `slice with id ${JSON.stringify(id)} is refused: ${r.err}`);
}
{
  const { repo, root } = sealed();
  assert.strictEqual(sc(repo, ['slice', '01', 'in-progress', '--root', root]).status, 0, 'an ordinary id is accepted');
}

for (const d of made) fs.rmSync(d, { recursive: true, force: true });
