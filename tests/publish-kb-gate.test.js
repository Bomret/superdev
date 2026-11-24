'use strict';

// Suite for plugin/scripts/publish-kb.js's publish gate, plugin/lib/kb-gate.js (ADR 0278, INV-0207): a scope publishes
// without --allow-unmerged only when it is `_adhoc`, its run root is gone, or its ledger's Stage reads `shipped` or
// `closed`. Shared fixtures live in tests/publish-kb-setup.js.

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const childProcess = require('node:child_process');
const { makeRepo, commandsDoc, writeKbDoc, call, withState, publishKbPath, cliBound } = require('./publish-kb-setup');
const { assertSpawnDecided } = require('./spawn-verdict');
const { checkGate } = require('../plugin/lib/kb-gate.js');

// A staged page written by hand, so no scope branch exists for it.
function stageByHand(repo, scope) {
  const dir = path.join(repo, '.superdev', 'kb-pending', scope);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'p.md'), '---\ntitle: P\naction: upsert\n---\nbody text.\n');
}

function writeLedger(repo, scope, text) {
  const root = path.join(repo, '.superdev', 'scopes', scope);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'ledger.md'), text);
}

// A repository with a configured backend and one hand-staged page under `scope`.
function gatedRepo(scope) {
  const repo = makeRepo();
  writeKbDoc(repo, commandsDoc('- **Backend:** Some Wiki.'));
  stageByHand(repo, scope);
  return repo;
}

const made = [];
after(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

test('a closed ledger publishes with no scope branch', () => {
  withState(() => {
    const repo = gatedRepo('done');
    writeLedger(repo, 'done', '# Ledger — done\n\n**Stage:** closed\n**Branch:** feat/done\n');
    const res = call(['--scope', 'done'], repo);
    assert.equal(res.ok, true, `a closed scope publishes: ${res.err}`);
    assert.match(res.out, /published \(created\): P/);
    assert.doesNotMatch(res.out, /unmerged/, 'no unmerged line');
  });
});

for (const stage of ['shipped', 'closed (rolled back)', '`shipped`.']) {
  test(`shipped and a closed stage in the spellings the ledger reader reads, whatever code-management.md says (${stage})`, () => {
    withState(() => {
      const repo = gatedRepo('done');
      fs.writeFileSync(path.join(repo, 'docs', 'agents', 'code-management.md'), '- **Base branch:** the default branch of the repository.\n');
      writeLedger(repo, 'done', `**Stage:** ${stage}\n`);
      const res = call(['--scope', 'done'], repo);
      assert.equal(res.ok, true, `stage ${stage} publishes: ${res.err}`);
      assert.doesNotMatch(res.out, /unmerged/, `stage ${stage}: no unmerged line`);
    });
  });
}

const staged = (repo, scope) => fs.existsSync(path.join(repo, '.superdev', 'kb-pending', scope, 'p.md'));
test('every stage below shipped refuses, names it and /superdev:ship before --allow-unmerged; the flag publishes', () => {
  for (const stage of ['planned', 'implementing', 'merged', 'reviewed', 'documented-unreviewed', 'documented', 'submitted']) {
    withState((stateFile) => {
      const repo = gatedRepo('wip');
      writeLedger(repo, 'wip', `**Stage:** ${stage}\n`);
      const res = call(['--scope', 'wip'], repo);
      assert.equal(res.ok, false, `stage ${stage} refuses`);
      assert.ok(res.err.includes(`stage ${stage}`), `the refusal names ${stage}: ${res.err}`);
      const ship = res.err.indexOf('/superdev:ship wip');
      assert.ok(ship >= 0 && ship < res.err.indexOf('--allow-unmerged'), `/superdev:ship before --allow-unmerged: ${res.err}`);
      assert.ok(staged(repo, 'wip'), 'the staged page stays');
      assert.ok(!fs.existsSync(stateFile), 'nothing reached the backend');
      const forced = call(['--scope', 'wip', '--allow-unmerged'], repo);
      assert.equal(forced.ok, true, `--allow-unmerged publishes stage ${stage}: ${forced.err}`);
      assert.match(forced.out, /^unmerged: /m, 'the report carries the unmerged line');
      assert.match(forced.out, /published \(created\): P/);
    });
  }
});

for (const [label, ledger, said] of [
  ['no ledger', null, /no ledger/],
  ['no Stage line', '# Ledger\n\n**Branch:** feat/odd\n', /no \*\*Stage:\*\* line/],
  ['an empty Stage', '**Stage:**\n', /no \*\*Stage:\*\* line/],
  ['Stage bogus', '**Stage:** bogus\n', /stage "bogus", outside the stage vocabulary/],
]) {
  test(`a missing ledger, no Stage line, or a Stage outside the vocabulary refuses naming what it read (${label})`, () => {
    withState((stateFile) => {
      const repo = gatedRepo('odd');
      if (ledger === null) fs.mkdirSync(path.join(repo, '.superdev', 'scopes', 'odd'), { recursive: true });
      else writeLedger(repo, 'odd', ledger);
      const res = call(['--scope', 'odd'], repo);
      assert.equal(res.ok, false, `${label} refuses`);
      assert.match(res.err, said, `${label}: the refusal says what it read: ${res.err}`);
      assert.match(res.err, /pass --allow-unmerged/, `${label}: overridable`);
      assert.doesNotMatch(res.err, /superdev:ship/, `${label}: names no ship`);
      assert.ok(staged(repo, 'odd'), `${label}: the staged page stays`);
      assert.ok(!fs.existsSync(stateFile), `${label}: nothing reached the backend`);
      const forced = call(['--scope', 'odd', '--allow-unmerged'], repo);
      assert.equal(forced.ok, true, `${label}: --allow-unmerged publishes: ${forced.err}`);
      assert.match(forced.out, /^unmerged: /m);
    });
  });
}

test('an absent run root publishes', () => {
  withState(() => {
    const repo = gatedRepo('gone');
    const res = call(['--scope', 'gone'], repo);
    assert.equal(res.ok, true, `an absent run root publishes: ${res.err}`);
    assert.doesNotMatch(res.out, /unmerged/);
  });
});

test('_adhoc publishes ungated: not even an unreadable ledger under its name is read', () => {
  withState(() => {
    const repo = gatedRepo('_adhoc');
    fs.mkdirSync(path.join(repo, '.superdev', 'scopes', '_adhoc', 'ledger.md'), { recursive: true });
    const res = call(['--scope', '_adhoc'], repo);
    assert.equal(res.ok, true, `_adhoc publishes: ${res.err}`);
    assert.doesNotMatch(res.out, /unmerged/);
  });
});

test('checkGate runs no git and spawns no child: a failing git first on PATH changes nothing', () => {
  const repo = makeRepo();
  writeLedger(repo, 'done', '**Stage:** shipped\n');
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-gate-bin-'));
  made.push(bin);
  fs.writeFileSync(path.join(bin, 'git'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const verbs = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'];
  const saved = verbs.map((v) => childProcess[v]);
  const prevPath = process.env.PATH;
  const spawned = [];
  verbs.forEach((v) => (childProcess[v] = (...args) => spawned.push([v, args[0]])));
  process.env.PATH = `${bin}${path.delimiter}${prevPath}`;
  try {
    assert.deepStrictEqual(checkGate(repo, 'done'), { ok: true }, 'a shipped scope passes with a failing git first on PATH');
    checkGate(repo, 'gone');
    checkGate(repo, '_adhoc');
  } finally {
    process.env.PATH = prevPath;
    verbs.forEach((v, i) => (childProcess[v] = saved[i]));
  }
  assert.deepStrictEqual(spawned, [], 'the gate spawns no child process');
});

test('The patch above misses a module that binds `spawnSync` at load, so no module the gate reaches requires child_process.', () => {
  const literal = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  const seen = new Set();
  const external = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    const specs = [...text.matchAll(literal)].map((m) => m[1]);
    assert.equal(specs.length, (text.match(/\brequire\(/g) || []).length, `${file}: every require names a literal`);
    for (const s of specs) {
      if (s.startsWith('.')) walk(require.resolve(path.resolve(path.dirname(file), s)));
      else external.add(s.replace(/^node:/, ''));
    }
  };
  walk(require.resolve('../plugin/lib/kb-gate.js'));
  assert.ok(seen.size > 1, 'the walk follows the gate into its requires');
  assert.equal(external.has('child_process'), false, `no module the gate reaches requires child_process: ${[...seen].join(', ')}`);
});

test('--help and the report describe the ledger gate, nothing of a branch', () => {
  const help = childProcess.spawnSync(process.execPath, [publishKbPath, '--help'], { encoding: 'utf8', timeout: cliBound() });
  assertSpawnDecided(help, 'publish-kb --help');
  const line = help.stdout.split('\n').find((l) => l.includes('--allow-unmerged   '));
  assert.match(line, /ledger does not record (it|this scope) as shipped or closed/, `the --allow-unmerged line names the ledger: ${line}`);
  assert.doesNotMatch(help.stdout, /branch|contained/, 'the help names no branch check');
  withState(() => {
    const repo = gatedRepo('wip');
    writeLedger(repo, 'wip', '**Stage:** submitted\n');
    const out = call(['--scope', 'wip', '--allow-unmerged'], repo).out;
    const unmerged = out.split('\n').find((l) => l.startsWith('unmerged: '));
    assert.match(unmerged, /ledger does not record (it|this scope) as shipped or closed/, `the report names the ledger: ${unmerged}`);
    assert.doesNotMatch(unmerged, /branch|contained/);
  });
});

