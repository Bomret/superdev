'use strict';

// Suite for scripts/drift-check.js's CLI: a plain run reports every failed check, a check that throws
// included, then exits 1; a clean run exits 0; `--selftest` dispatches to the selftests; `--help` prints the usage
// and an unknown argument refuses with it, exit 2, each running nothing. The registry and
// the selftest are replaced in the child by a preload (`node -r`), so the cases run no real check.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');

const CLI = path.join(__dirname, '..', 'scripts', 'drift-check.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-cli-'));
const preload = path.join(dir, 'preload.js');
fs.writeFileSync(
  preload,
  `const Module = require('node:module');
const load = Module._load;
const fake = (id, run) => ({ id, ok: id + '-ok', run, format: (g) => 'gap in ' + id + ': ' + g.what });
Module._load = function (request, ...rest) {
  if (request === './drift/selftest') { console.log('SELFTEST-DISPATCHED'); return {}; }
  if (request === './drift/checks') {
    const clean = [fake('clean', () => [])];
    if (process.env.FAKE === 'clean') return clean;
    return [
      fake('gappy-a', () => [{ what: 'first' }, { what: 'second' }]),
      fake('thrower', () => { throw new Error('boom'); }),
      fake('gappy-b', () => [{ what: 'third' }]),
      ...clean,
    ];
  }
  return load.call(this, request, ...rest);
};
`,
);

function run(args, env, label) {
  const r = spawnSync(process.execPath, ['-r', preload, CLI, ...args], { encoding: 'utf8', timeout: 20000, env: { ...process.env, ...env } });
  assertSpawnDecided(r, label);
  return r;
}

try {
  const bad = run([], {}, 'failing registry');
  assert.strictEqual(bad.status, 1, 'a run with failed checks exits 1');
  for (const line of ['gap in gappy-a: first', 'gap in gappy-a: second', 'thrower: run() threw — boom', 'gap in gappy-b: third']) {
    assert.ok(bad.stderr.includes(line), `reports every failed check: ${line}`);
  }
  assert.ok(!bad.stdout.includes('drift-check ok'), 'a failing run prints no ok line');

  const clean = run([], { FAKE: 'clean' }, 'clean registry');
  assert.strictEqual(clean.status, 0, 'a clean run exits 0');
  assert.match(clean.stdout, /drift-check ok: clean-ok/);

  const selftest = run(['--selftest'], {}, 'selftest');
  assert.strictEqual(selftest.status, 0);
  assert.match(selftest.stdout, /SELFTEST-DISPATCHED/, '--selftest runs the selftests');
  assert.ok(!selftest.stderr.includes('gap in'), '--selftest runs no check');

  // --help / -h anywhere prints the usage, naming --selftest, and runs no check and no selftest; it wins over an
  // unknown argument beside it.
  for (const args of [['--help'], ['-h'], ['--selftest', '--help'], ['--bogus', '--help']]) {
    const r = run(args, {}, args.join(' '));
    assert.strictEqual(r.status, 0, `${args.join(' ')} exits 0`);
    assert.match(r.stdout, /^usage: node scripts\/drift-check\.js/, `${args.join(' ')} prints the usage`);
    assert.match(r.stdout, /--selftest/, `${args.join(' ')} names --selftest`);
    assert.ok(!r.stdout.includes('SELFTEST-DISPATCHED') && !r.stderr.includes('gap in') && !r.stdout.includes('drift-check ok'), `${args.join(' ')} runs no check`);
  }
  // Any other argument refuses with the usage on stderr and exit 2, running no check and no selftest.
  for (const args of [['--bogus'], ['extra'], ['--selftest', 'extra']]) {
    const r = run(args, {}, args.join(' '));
    assert.strictEqual(r.status, 2, `${args.join(' ')} exits 2`);
    assert.match(r.stderr, /usage: node scripts\/drift-check\.js/, `${args.join(' ')} prints the usage on stderr`);
    assert.ok(!r.stdout.includes('SELFTEST-DISPATCHED') && !r.stderr.includes('gap in'), `${args.join(' ')} runs no check`);
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('drift-check CLI ok');
