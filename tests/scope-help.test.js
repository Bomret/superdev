'use strict';

// Suite for plugin/scripts/scope.js's `--help` / `-h` handling: usage on stdout and exit 0 before any verb reads
// stdin, and a `-h` that is a flag's value or a bullet's text read as data. The shared directory, `call`, and the
// init payload come from tests/scope-setup.js.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { tmp, call, sliceJson, scopePath, cleanup } = require('./scope-setup');

try {
  // The run root the bullet cases below write to.
  assert.ok(call(['init', 'feat/demo', 'implementing'], sliceJson).ok, 'init for the help fixture');

  // --help / -h: usage on stdout, exit 0, before any verb reads stdin. stdin is /dev/zero, which never
  // ends, so a verb that waits on stdin first is killed by the (loose, qualitative) bound instead.
  {
    const ledgerBefore = fs.readdirSync(tmp).join(',');
    const endless = fs.openSync('/dev/zero', 'r');
    try {
      for (const argv of [['--help'], ['-h'], ['dod-line', '--help'], ['init', '--help'], ['adopt', '--help'], ['deferred', 'add', '-', '-h']]) {
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
          assert.doesNotMatch(res.stdout, /--match </, 'the usage lists no inline --match form');
          assert.doesNotMatch(res.stdout, /--note </, 'the usage lists no inline --note form');
        }
      }
    } finally {
      fs.closeSync(endless);
    }
    assert.strictEqual(fs.readdirSync(tmp).join(','), ledgerBefore, '--help writes nothing');
  }

  // A `-h` / `--help` that is a flag's value or a bullet's text is data, not a request for usage: inside a
  // store's gated body-edit chain the usage text would pass `[ -s ]` and replace the anchor body.
  {
    const spawnScope = (argv, input) =>
      cp.spawnSync(process.execPath, [scopePath, ...argv], { cwd: tmp, input, encoding: 'utf8', timeout: 30000 });
    // The note file is named `-h` and holds `-h`, so the flag's value and the note text are both the word.
    fs.writeFileSync(path.join(tmp, '-h'), '-h', 'utf8');
    fs.writeFileSync(path.join(tmp, 'match-x.txt'), 'x', 'utf8');
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
  }
} finally {
  cleanup();
}
