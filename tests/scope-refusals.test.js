'use strict';

// Suite for the refusals of plugin/scripts/scope.js's CLI and of the stdin and ledger readers behind it: each refusal
// prints its message, carries its exit status, and writes nothing. Refusals run in-process through `run(argv)`, which
// throws the refusal error `main()` prints; one spawned case per verb family keeps the exit status and the stderr line.
// A hand-edited `**Deploy:**` entry is read as the documented outcome: a refusal naming the bad entry.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { tmp, call, run, sliceJson, scopePath, cleanup } = require('./scope-setup');
const { publishText } = require(scopePath);

// Every file under `dir` with its bytes, so a refusal can be shown to write nothing. The digest sidecar is left out: the check a
// writing verb makes first seals a hand-written run on its first check, a refusal included (ADR 0227).
const snapshot = (dir) => {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name !== 'digest.json') out[path.relative(dir, p)] = fs.readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
};

// Runs `argv` in-process and returns the refusal it throws; fails the case when the verb does not refuse.
const refusal = (argv, stdin = '') => {
  const before = snapshot(tmp);
  const logged = [];
  const orig = console.log;
  console.log = (s) => logged.push(String(s));
  let err;
  try {
    run(argv, tmp, stdin);
  } catch (e) {
    err = e;
  } finally {
    console.log = orig;
  }
  assert.ok(err && err.isRefusal, `${argv.join(' ')} refuses (got ${err ? err.message : 'success'})`);
  assert.deepEqual(logged, [], `${argv.join(' ')} prints nothing on stdout`);
  assert.deepEqual(snapshot(tmp), before, `${argv.join(' ')} writes nothing`);
  return { message: err.message, status: err.exitCode || 1 };
};

const refuses = (argv, re, status = 1, stdin = '') => {
  const r = refusal(argv, stdin);
  assert.match(r.message, re, `${argv.join(' ')} says why`);
  assert.equal(r.status, status, `${argv.join(' ')} exits ${status}`);
};

const spawn = (argv, input = '') => {
  const res = spawnSync(process.execPath, [scopePath, ...argv], { cwd: tmp, input, encoding: 'utf8', timeout: 30000, killSignal: 'SIGKILL' });
  assertSpawnDecided(res, `scope.js ${argv.join(' ')}`);
  return res;
};

try {
  assert.ok(call(['init', 'feat/refuse-me', 'implementing'], sliceJson).ok);
  const root = path.join(tmp, '.superdev', 'scopes', 'refuse-me');
  const R = ['--root', root];
  const ledgerFile = path.join(root, 'ledger.md');

  // --- the CLI switch ---
  refuses(['bogus'], /^unknown verb "bogus"\nusage:/);
  refuses([], /^unknown verb ""\nusage:/);
  refuses(['stage', 'set', 'planned'], /missing --root/);
  refuses(['stage', 'set', 'planned', '--root'], /--root needs a path/);
  refuses(['init'], /init needs a <type>\/<slug> label/);
  refuses(['slice', ...R], /slice needs <id> <status>/);
  refuses(['slice', '01', 'merged', ...R, '--range'], /--range needs a value/);
  refuses(['deploy', 'bogus', ...R], /unknown deploy subcommand "bogus" — use set\|get/);
  refuses(['deploy', 'set', 'pve', 'failed', ...R, '--exit'], /--exit needs a value/);
  refuses(['suite', 'reusable', ...R, '--branch'], /--branch needs a value/);
  refuses(['suite', 'reusable', ...R], /suite reusable needs --branch/);
  refuses(['suite', 'reusable', '--branch', 'main', ...R, '--base'], /--base needs a value/);
  refuses(['suite', 'reusable', '--branch', 'main', '--whol', ...R], /suite reusable: unrecognized argument "--whol"/);
  refuses(['suite', 'rerun', '--whole', 'green', 'abc', ...R], /--whole is not an option of rerun/);
  refuses(['suite', 'rerun', 'green', 'abc', 'extra', ...R], /suite rerun: unrecognized argument "extra"/);
  refuses(['suite', 'set', 'green', 'abc', '--kind', ...R], /suite set: unrecognized argument "--kind"/);
  refuses(['base', 'resolve', '--branch', ...R], /--branch needs a value/);
  refuses(['base', 'resolve', '--base', 'main', ...R], /base resolve needs --branch/);
  refuses(['base', 'resolve', '--branch', 'a', ...R], /base resolve needs --base/);
  refuses(['base', 'resolve', '--branch', 'a', '--base', 'b', 'extra', ...R], /base resolve: unrecognized argument "extra"/);
  refuses(['base', 'bogus', ...R], /unknown base subcommand "bogus" — use set\|resolve/);
  refuses(['base', 'set', 'a', 'b', ...R], /base set: unrecognized argument "b"/);
  refuses(['trace', '--slice', ...R], /--slice needs an id/);
  refuses(['collisions', '--base', 'a', '--branch', 'b', '--range-base', 'c', 'stray'], /unrecognized argument "stray"/, 2);
  refuses(['collisions', '--also'], /--also needs a value/, 2);

  // --- plan-open's argument parser ---
  refuses(['open'], /open needs a <type>\/<slug> label/);
  refuses(['open', 'feat/x', '--bogus', 'v'], /open: unrecognized argument "--bogus"/);
  refuses(['open', 'feat/x', '--base'], /open: --base needs a value/);
  refuses(['open', 'feat/x', '--base', 'main', '--remote', ''], /open: --remote needs a value/);
  refuses(['open', 'feat/x', '--base', 'main', '--base', 'main'], /open: --base given twice/);
  refuses(['open', 'feat/x'], /open needs --base <base-ref>/);

  // --- citations flags ---
  refuses(['citations', '--range-base', '--branch', 'b', '0131'], /citations: --range-base needs a value/, 2);
  refuses(['citations', '--range-base', 'a', '--branch', 'b', '--branch', 'c', '0131'], /citations: --branch given twice/, 2);
  refuses(['citations', '--range-base', 'a', '--branch', 'b', '--bogus', '0131'], /citations: unrecognized flag "--bogus"/, 2);
  refuses(['citations', '--range-base', 'a', '--branch', 'b'], /citations needs at least one <id>/, 2);
  refuses(['citations', '--range-base', 'a', '--branch', 'b', 'ADR 0131'], /"ADR 0131" is no id/, 2);
  refuses(['citations', '--range-base', 'a', '--branch', 'b', '131'], /"131" is no id/, 2);
  refuses(['citations', '--range-base', 'a', '--branch', 'b', 'INV-12'], /"INV-12" is no id/, 2);
  refuses(['citations', '--branch', 'b', '0131'], /citations needs --range-base <ref>/, 2);

  // --- ledger init: the stdin payload ---
  const label = 'feat/never-written';
  const payload = (o) => JSON.stringify({ anchor: '#1 — a', slices: [], ...o });
  refuses(['init', label, 'planned'], /stdin is not JSON/, 1, '');
  refuses(['init', label, 'planned'], /"anchor" string and a "slices" array/, 1, JSON.stringify({ slices: [] }));
  refuses(['init', label, 'planned'], /slice row missing "issue"/, 1, payload({ slices: [{ id: '01', title: 't', type: 'behavior' }] }));
  refuses(['init', label, 'planned'], /slice 01 has unknown status "done"/, 1, payload({ slices: [{ id: '01', issue: '#1', title: 't', type: 'behavior', status: 'done' }] }));

  // --- stage, step, slice, and adopt over a hand-edited ledger or anchor body ---
  refuses(['stage', 'bogus', 'merged', ...R], /unknown stage subcommand "bogus" — use set/);
  refuses(['step', 'bogus', ...R], /unknown step subcommand "bogus" — use set\|clear\|block/);
  const shortRoot = path.join(tmp, '.superdev', 'scopes', 'short-row');
  fs.mkdirSync(shortRoot, { recursive: true });
  fs.writeFileSync(
    path.join(shortRoot, 'ledger.md'),
    '# Ledger — short-row\n\n**Stage:** implementing\n**Branch:** feat/short-row\n**Anchor:** a\n\n' +
      '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n| 01 | #1 | t | behavior | — | todo |\n'
  );
  refuses(['slice', '01', 'merged', '--root', shortRoot], /slice row "01" does not carry the 7 ledger columns/);

  const adoptRoot = path.join(tmp, 'adopt-refusals', 'refuse-me');
  fs.mkdirSync(path.dirname(adoptRoot), { recursive: true });
  const published = publishText(root);
  refuses(['adopt', '--root', adoptRoot], /run-state payload carries unknown stage "bogus"/, 1, published.replace('**Stage:** implementing', '**Stage:** bogus'));
  const shortPayload = published.replace(/^\| 01 \|.*$/m, '| 01 | #188 | t | behavior | — | todo |');
  assert.notEqual(shortPayload, published, 'the payload carries a short row');
  refuses(['adopt', '--root', adoptRoot], /run-state payload carries a slice row without the 7 ledger columns/, 1, shortPayload);

  // --- a hand-edited **Deploy:** entry, alone and inside a list ---
  const ledger = fs.readFileSync(ledgerFile, 'utf8');
  // A hand-written ledger has no digest to mismatch: the sidecar goes with each edit (ADR 0227).
  const handWrite = (text) => {
    fs.writeFileSync(ledgerFile, text);
    fs.rmSync(path.join(root, 'digest.json'), { force: true });
  };
  const withDeploy = (value) => handWrite(ledger.replace('**Anchor:**', `**Deploy:** ${value}\n**Anchor:**`));
  withDeploy('pve bogus');
  refuses(['deploy', 'get', ...R], /unreadable deploy record entry: "pve bogus"/);
  refuses(['deploy', 'set', 'proxy', 'pending', ...R], /unreadable deploy record entry: "pve bogus"/);
  withDeploy('pve deployed, proxy failed exit x');
  refuses(['deploy', 'get', ...R], /unreadable deploy record entry: "proxy failed exit x"/);
  withDeploy('pve deployed,proxy failed');
  refuses(['deploy', 'get', ...R], /unreadable deploy record entry: "pve deployed,proxy failed"/);
  withDeploy('pve deployed, proxy failed exit 2');
  assert.equal(call(['deploy', 'get', ...R]).out, 'pve deployed\nproxy failed exit 2', 'a well-formed list is read back');
  handWrite(ledger);

  // --- one spawned refusal per verb family keeps the exit status and the stderr line ---
  const before = snapshot(tmp);
  let res = spawn(['bogus']);
  assert.equal(res.status, 1, 'an unknown verb exits 1');
  assert.match(res.stderr, /^unknown verb "bogus"\nusage:/);
  assert.equal(res.stdout, '', 'and prints nothing on stdout');
  res = spawn(['step', 'bogus', ...R]);
  assert.equal(res.status, 1, 'a ledger refusal exits 1');
  assert.match(res.stderr, /unknown step subcommand "bogus"/);
  res = spawn(['adopt', '--root', adoptRoot], published.replace('**Stage:** implementing', '**Stage:** bogus'));
  assert.equal(res.status, 1, 'an adopt refusal exits 1');
  assert.match(res.stderr, /unknown stage "bogus"/);
  res = spawn(['init', label, 'planned'], '{}');
  assert.equal(res.status, 1, 'an init refusal exits 1');
  assert.match(res.stderr, /"anchor" string/);
  res = spawn(['collisions', '--also']);
  assert.equal(res.status, 2, 'a collisions refusal exits 2');
  assert.match(res.stderr, /--also needs a value/);
  assert.deepEqual(snapshot(tmp), before, 'the spawned refusals write nothing');

  console.log('scope-refusals: all checks passed');
} finally {
  cleanup();
}
