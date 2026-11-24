'use strict';

// Suite for plugin/scripts/scope.js's `--help` / `-h` handling: usage on stdout and exit 0 before any verb reads
// stdin, the full usage or the cut a verb and subcommand name, the refusals that append the full usage, and a `-h`
// that is a flag's value or a bullet's text read as data. The shared directory, `call`, and the init payload come
// from tests/scope-setup.js.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { tmp, call, sliceJson, scopePath, writeDod, scopeRoot } = require('./scope-setup');

test('The run root the bullet cases below write to.', () => {
  writeDod(scopeRoot('demo'));
  assert.ok(call(['init', 'feat/demo', 'implementing'], sliceJson).ok, 'init for the help fixture');
});

test('--help / -h: usage on stdout, exit 0, before any verb reads stdin. stdin is /dev/zero, which never ends, so a verb that waits on stdin first is killed by the (loose, qualitative) bound instead.', () => {
  const ledgerBefore = fs.readdirSync(tmp).join(',');
  const endless = fs.openSync('/dev/zero', 'r');
  try {
    for (const argv of [['--help'], ['-h'], ['dod-line', '--help'], ['dod-check', '--help'], ['dod-check', '-h'], ['init', '--help'], ['adopt', '--help'], ['deferred', 'add', '-', '-h']]) {
      const res = cp.spawnSync(process.execPath, [scopePath, ...argv], {
        cwd: tmp,
        stdio: [endless, 'pipe', 'pipe'],
        encoding: 'utf8',
        timeout: 30000,
      });
      assertSpawnDecided(res, argv.join(' '));
      assert.strictEqual(res.status, 0, argv.join(' ') + ' exits 0: ' + res.stderr);
      assert.ok(res.stdout.includes('usage: node scope.js'), argv.join(' ') + ' prints the usage');
      if (argv.join(' ') === '--help') {
        assert.match(res.stdout, /push --root <run-root> --remote <remote> --base <base-ref>/, 'the usage lists push');
        assert.match(res.stdout, /^ {2}citations /m, 'the usage lists citations');
        assert.match(res.stdout, /^ {2}dod-check +stdin: an anchor body/m, 'the usage lists dod-check');
        assert.match(res.stdout, /^ {2}discard +--root <run-root>/m, 'the usage lists discard');
        assert.doesNotMatch(res.stdout, /--match </, 'the usage lists no inline --match form');
        assert.doesNotMatch(res.stdout, /--note </, 'the usage lists no inline --note form');
      }
    }
  } finally {
    fs.closeSync(endless);
  }
  assert.strictEqual(fs.readdirSync(tmp).join(','), ledgerBefore, '--help writes nothing');
});

test('`<verb> [<sub>] --help` prints the header and a cut of the usage: the verb\'s entries, or the entries whose syntax head names the subcommand. stdin is /dev/zero, so a help request that waits on stdin is killed.', () => {
  const before = fs.readdirSync(tmp).join(',');
  const endless = fs.openSync('/dev/zero', 'r');
  const help = (argv) => {
    const res = cp.spawnSync(process.execPath, [scopePath, ...argv], {
      cwd: tmp,
      stdio: [endless, 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 30000,
    });
    assertSpawnDecided(res, argv.join(' '));
    assert.strictEqual(res.status, 0, argv.join(' ') + ' exits 0: ' + res.stderr);
    return res.stdout;
  };
  // The first line of each entry: indented exactly two spaces, the `--help, -h` header line left out.
  const entries = (out) => out.split('\n').filter((l) => /^ {2}[^ -]/.test(l)).map((l) => l.trim());
  const full = require('../plugin/lib/usage.js').usage();
  try {
    let out = help(['reviewed', '--help']);
    assert.ok(out.startsWith('usage: node scope.js'), 'reviewed --help prints the header first: ' + out);
    assert.match(out, /^ {2}--help, -h +after <verb> \[<sub>\], that verb's or subcommand's entries; alone, every entry; reads no stdin$/m, 'reviewed --help prints the --help line');
    assert.deepStrictEqual(entries(out).map((l) => l.split(/\s+/).slice(0, 2).join(' ')), ['reviewed set', 'reviewed clear', 'reviewed check'], 'reviewed --help prints the three reviewed entries alone: ' + out);

    // A subcommand narrows to the entries whose syntax head names it, continuation lines included.
    const heads = (argv) => entries(help(argv)).map((l) => l.split(/ {2,}/)[0]);
    assert.deepStrictEqual(heads(['reviewed', 'check', '--help']), ['reviewed check --branch <b> --base <base-ref>'], 'reviewed check --help');
    out = help(['test', 'focused', '--help']);
    assert.deepStrictEqual(entries(out).map((l) => l.split(/ {2,}/)[0]), ['test focused [<path>…]', 'test focused --since <ref>'], 'test focused --help: ' + out);
    assert.match(out, /^ {37}files git does not ignore/m, 'test focused --help keeps the continuation lines');
    assert.deepStrictEqual(heads(['unresolved', 'clear', '--help']), ['unresolved add <text>|clear'], 'unresolved clear --help');
    assert.deepStrictEqual(heads(['reviewed', 'bogus', '--help']).length, 3, 'a subcommand naming no entry prints every entry of the verb');
    assert.deepStrictEqual(heads(['test', 'full', '--help']), ['test full|whole'], 'test full --help prints no test focused entry');
    // Description prose and placeholders are no syntax-head words: `red` only sits inside `<green|red|…>` and the description.
    assert.deepStrictEqual(heads(['suite', 'red', '--help']), entries(full).filter((l) => l.startsWith('suite ')).map((l) => l.split(/ {2,}/)[0]), 'suite red --help prints every suite entry');

    // A verb matches whole: no longer verb sharing its start.
    assert.deepStrictEqual(heads(['fail-to-pass', '--help']), ['fail-to-pass <base>..<tip> -- <command>'], 'fail-to-pass --help prints no fail-to-pass-check entry');
    assert.deepStrictEqual(heads(['pr', '--help']), ['pr set <n>|clear'], 'pr --help prints no prepare, publish, or push entry');

    // A value flag's value is skipped when finding the subcommand.
    assert.deepStrictEqual(heads(['reviewed', '--root', '/x', 'check', '-h']), ['reviewed check --branch <b> --base <base-ref>'], 'reviewed --root /x check -h');

    // No verb in first position, an unknown verb, or none at all prints the full usage.
    for (const argv of [['--help'], ['-h'], ['nosuchverb', '--help'], ['--root', '/x', 'trace', '--help']]) {
      assert.strictEqual(help(argv), full + '\n', argv.join(' ') + ' prints the full usage');
    }
  } finally {
    fs.closeSync(endless);
  }
  assert.strictEqual(fs.readdirSync(tmp).join(','), before, 'a help request writes nothing');
});

test('A `-h` / `--help` that is a flag\'s value or a bullet\'s text is data, not a request for usage: inside a store\'s gated body-edit chain the usage text would pass `[ -s ]` and replace the anchor body.', () => {
  const spawnScope = (argv, input) =>
    cp.spawnSync(process.execPath, [scopePath, ...argv], { cwd: tmp, input, encoding: 'utf8', timeout: 30000 });
  // The note file is named `-h` and holds `-h`, so the flag's value and the note text are both the word.
  fs.writeFileSync(path.join(tmp, '-h'), '-h', 'utf8');
  fs.writeFileSync(path.join(tmp, 'match-x.txt'), 'x', 'utf8');
  // Every value-taking flag the usage names skips its values, `--repair` its two.
  for (const argv of [['trace', '--kind', '-h', '--root', '/x'], ['route', '--repair', 'open', '-h', '--root', '/x']]) {
    const r = spawnScope(argv, '');
    assertSpawnDecided(r, argv.join(' '));
    assert.ok(!r.stdout.includes('usage:'), argv.join(' ') + ' prints no usage: ' + r.stdout);
  }

  // The refusals that print the usage print all of it, and `test`'s argument refusal still finds its line.
  const fullUsage = require('../plugin/lib/usage.js').usage();
  for (const argv of [['nosuchverb'], ['run-state']]) {
    const r = spawnScope(argv, '');
    assertSpawnDecided(r, argv.join(' '));
    assert.strictEqual(r.status, 1, argv.join(' ') + ' refuses');
    assert.ok(r.stderr.includes(fullUsage), argv.join(' ') + ' appends the full usage: ' + r.stderr);
  }
  {
    const r = spawnScope(['test', 'bogus'], '');
    assertSpawnDecided(r, 'test bogus');
    assert.match(r.stderr, /test: unrecognized arguments \(test full\|whole /, 'test refusal names its usage line: ' + r.stderr);
  }

  let res = spawnScope(['dod-line', '--match-file', 'match-x.txt', '--verdict', 'met', '--note-file', '-h'], '- [ ] x — 01\n');
  assertSpawnDecided(res, 'dod-line --note-file -h');
  assert.strictEqual(res.status, 0, 'dod-line --note-file -h exits 0: ' + res.stderr);
  assert.ok(res.stdout.includes('- [x] x — 01 — met: -h'), '-h is written as the note: ' + res.stdout);
  assert.ok(!res.stdout.includes('usage:'), 'no usage text replaces the body');

  const root = path.join(tmp, '.superdev', 'scopes', 'demo');
  res = spawnScope(['unresolved', 'add', '-h', '--root', root]);
  assertSpawnDecided(res, 'unresolved add -h');
  assert.strictEqual(res.status, 0, 'unresolved add -h exits 0: ' + res.stderr);
  assert.ok(!res.stdout.includes('usage:'), 'unresolved add -h prints no usage');
  res = spawnScope(['get', 'unresolved', '--root', root]);
  assert.ok(res.stdout.includes('-h'), 'unresolved add -h records -h: ' + res.stdout + res.stderr);

  // Every token after `add` / `add-denial` is bullet text, not just the first.
  res = spawnScope(['unresolved', 'add', 'foo', '-h', '--root', root]);
  assertSpawnDecided(res, 'unresolved add foo -h');
  assert.ok(!res.stdout.includes('usage:'), 'unresolved add foo -h prints no usage');
  res = spawnScope(['get', 'unresolved', '--root', root]);
  assert.ok(res.stdout.includes('foo -h'), 'unresolved add foo -h records "foo -h": ' + res.stdout + res.stderr);
  res = spawnScope(['degraded', 'add-denial', '-h', '--root', root]);
  assertSpawnDecided(res, 'degraded add-denial -h');
  assert.ok(!res.stdout.includes('usage:'), 'degraded add-denial -h prints no usage');
  res = spawnScope(['get', 'degraded', '--root', root]);
  assert.ok(res.stdout.includes('-h'), 'degraded add-denial -h records -h: ' + res.stdout + res.stderr);
  res = spawnScope(['deferred', 'resolve', '-h', '--root', root]);
  assertSpawnDecided(res, 'deferred resolve -h');
  assert.ok(!res.stdout.includes('usage:'), 'deferred resolve -h prints no usage');

  // `degraded reset-denials` takes a reason the same way: `-h` and `--help` there are recorded, not usage.
  for (const flag of ['-h', '--help']) {
    res = spawnScope(['degraded', 'reset-denials', flag, '--root', root]);
    assertSpawnDecided(res, 'degraded reset-denials ' + flag);
    assert.strictEqual(res.status, 0, `degraded reset-denials ${flag} exits 0: ` + res.stderr);
    assert.ok(!res.stdout.includes('usage:'), `degraded reset-denials ${flag} prints no usage`);
    res = spawnScope(['get', 'degraded', '--root', root]);
    assert.ok(res.stdout.split('\n').some((l) => l.endsWith(' ' + flag)), `degraded reset-denials ${flag} records ${flag}: ` + res.stdout);
  }
  res = spawnScope(['degraded', '--help']);
  assertSpawnDecided(res, 'degraded --help');
  assert.ok(res.stdout.includes('usage: node scope.js'), 'degraded --help still prints usage');
});
