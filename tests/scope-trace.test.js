'use strict';

// Suite for plugin/scripts/scope.js's run trace (ADR 0117): the ledger events every writing verb appends, the
// single writer `appendTrace`, and the `trace` reader. The shared init payload comes from tests/scope-setup.js;
// the suite runs in a temporary directory of its own.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assertSpawnDecided } = require('./spawn-verdict');
const { sliceJson, scopePath, run } = require('./scope-setup');

// run trace (ADR 0117): ledger events, the single writer, and the reader.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-trace-'));
  try {
    const { appendTrace } = require(scopePath);
    const { spawnSync } = require('node:child_process');
    const root = path.join(dir, '.superdev', 'scopes', 'demo');
    const traceFile = path.join(root, 'trace.log');
    const lines = () => (fs.existsSync(traceFile) ? fs.readFileSync(traceFile, 'utf8').split('\n').filter(Boolean) : []);
    const quiet = (argv, stdin) => {
      const orig = console.log;
      console.log = () => {};
      try {
        run(argv, dir, stdin || '');
        return true;
      } catch (e) {
        if (e.isRefusal) return false;
        throw e;
      } finally {
        console.log = orig;
      }
    };

    assert.ok(quiet(['init', 'feat/demo', 'implementing'], sliceJson), 'init');
    assert.equal(lines().length, 1, 'init appends one ledger line');
    assert.match(lines()[0], /^\d{4}-\d\d-\d\dT[\d:.]+Z scope main ledger init feat\/demo implementing$/, 'ledger line shape');
    assert.ok(quiet(['slice', '01', 'merged', '--root', root]), 'slice');
    assert.equal(lines().length, 2, 'slice appends one line');
    assert.match(lines()[1], / 01 main ledger slice 01 merged$/, 'slice line names its slice');
    assert.ok(quiet(['stage', 'set', 'reviewed', '--root', root]), 'stage forward');
    assert.equal(lines().length, 3);
    assert.ok(!quiet(['stage', 'set', 'implementing', '--root', root]), 'backward stage refused');
    assert.ok(!quiet(['slice', '99', 'merged', '--root', root]), 'unknown slice refused');
    assert.equal(lines().length, 3, 'a refused verb appends no line');
    assert.ok(quiet(['unresolved', 'add', 'secret-token-123', '--root', root]));
    assert.equal(lines().length, 4);
    assert.ok(!lines()[3].includes('secret-token-123'), 'bullet text stays out of the trace');
    assert.ok(quiet(['get', 'stage', '--root', root]));
    assert.equal(lines().length, 4, 'a read verb appends no line');

    // Every other writing verb appends exactly one ledger line; bullet text never reaches the trace.
    const adoptRoot = path.join(dir, 'elsewhere', 'demo');
    const git = (...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir, encoding: 'utf8' });
    git('init', '-q');
    git('commit', '-q', '--allow-empty', '-m', 'x');
    const writers1 = [
      [['base', 'set', 'HEAD'], / ledger base set HEAD$/],
      [['suite', 'set', 'green', 'HEAD'], / ledger suite set green HEAD$/],
      [['deploy', 'set', 'prod', 'pending'], / ledger deploy set prod pending$/],
      [['docs', 'set', 'inline'], / ledger docs set inline$/],
      [['docs', 'clear'], / ledger docs clear$/],
      [['pr', 'set', '12'], / ledger pr set 12$/],
      [['pr', 'clear'], / ledger pr clear$/],
      [['degraded', 'add', 'secret-token-123'], / ledger degraded add$/],
      [['degraded', 'add-denial', 'secret-token-123'], / ledger degraded add-denial$/],
      [['degraded', 'reset-denials', 'secret-token-123'], / ledger degraded reset-denials$/],
      [['deferred', 'add', 'secret-token-123'], / ledger deferred add$/],
      [['deferred', 'resolve', 'secret-token-123'], / ledger deferred resolve$/],
      [['minors', 'add', '01'], / ledger minors add$/],
      [['minors', 'clear'], / ledger minors clear$/],
    ];
    for (const [argv, shape] of writers1) {
      const n = lines().length;
      assert.ok(quiet([...argv, '--root', root]), argv.join(' ') + ' succeeds');
      assert.equal(lines().length, n + 1, argv.join(' ') + ' appends one line');
      assert.match(lines()[n], shape, argv.join(' ') + ' line shape');
      assert.ok(!lines()[n].includes('secret-token-123'), argv.join(' ') + ' keeps bullet text out');
    }
    // Every ledger-writing verb the usage text lists is driven against a fresh run root and appends one
    // `ledger <verb> …` line: a verb added to the usage text with no driver here, or one that stops tracing, fails.
    {
      const usageText = require('../plugin/lib/usage.js').usage();
      const readOnly = new Set(['get', 'trace', 'publish', 'status', 'root', 'staging', 'dod-line', 'dod-merge', 'collisions', 'citations', 'source-set', 'push', 'run-state', 'test', 'fail-to-pass']);
      const readOnlySub = /^\s+(deploy get|suite reusable|base resolve)\b/;
      const usageVerbs = new Set(usageText.split('\n').slice(1)
        .filter((l) => /^ {2}[^-\s]/.test(l) && !readOnlySub.test(l))
        .map((l) => l.trim().split(/\s+/)[0])
        .filter((v) => !readOnly.has(v)));
      assert.ok(usageVerbs.size >= 12, 'usage text yields the writing verbs: ' + [...usageVerbs].join(','));
      const drivers = {
        init: ['init', 'feat/g-init', 'implementing'],
        stage: ['stage', 'set', 'reviewed'],
        slice: ['slice', '01', 'merged'],
        step: ['step', 'set', 'review'],
        degraded: ['degraded', 'add', 'x'],
        unresolved: ['unresolved', 'add', 'x'],
        deferred: ['deferred', 'add', 'x'],
        minors: ['minors', 'add', '01'],
        docs: ['docs', 'set', 'inline'],
        pr: ['pr', 'set', '12'],
        deploy: ['deploy', 'set', 'prod', 'pending'],
        suite: ['suite', 'set', 'green', 'HEAD'],
        base: ['base', 'set', 'HEAD'],
        adopt: ['adopt'],
      };
      const traceOf = (r) => (fs.existsSync(path.join(r, 'trace.log')) ? fs.readFileSync(path.join(r, 'trace.log'), 'utf8').split('\n').filter(Boolean) : []);
      for (const v of usageVerbs) {
        // `open` traces the `init` and the `step set plan` it makes, the lines the pane starts `plan` from.
        if (v === 'open') {
          const oRoot = path.join(dir, '.superdev', 'scopes', 'g-open');
          assert.ok(quiet(['open', 'feat/g-open', '--base', 'HEAD']), 'open succeeds');
          assert.deepEqual(traceOf(oRoot).map((l) => l.replace(/^\S+ scope main /, '')), ['ledger init feat/g-open planned', 'ledger step set plan'], 'open traces the init and the step it makes');
          continue;
        }
        assert.ok(drivers[v], `usage lists writing verb "${v}" with no driver in this guard`);
        const gRoot = path.join(dir, '.superdev', 'scopes', 'g-' + v);
        let target = gRoot;
        let argv = [...drivers[v], '--root', gRoot];
        let stdin;
        if (v === 'init') argv = drivers.init, stdin = sliceJson;
        else {
          assert.ok(quiet(['init', 'feat/g-' + v, 'implementing'], sliceJson), v + ' fixture init');
          if (v === 'adopt') {
            target = path.join(dir, 'elsewhere', 'g-adopt');
            argv = ['adopt', '--root', target];
            stdin = require(scopePath).publishText(gRoot);
          }
        }
        const n = traceOf(target).length;
        assert.ok(quiet(argv, stdin), `${v} succeeds`);
        const added = traceOf(target).slice(n);
        assert.equal(added.length, 1, `${v} appends one trace line`);
        assert.match(added[0], new RegExp(` ledger ${v}( |$)`), `${v} traces a ledger ${v} event`);
      }
    }
    {
      const n = lines().length;
      assert.ok(!quiet(['deferred', 'resolve', 'no-such-bullet', '--root', root]), 'a resolve matching nothing is refused');
      assert.equal(lines().length, n, 'a refused resolve appends no line');
    }
    // No-op clears: clearing absent headers must not trace a line (RED test for finding 1).
    // Create a fresh root for the no-op clear test since root already has unresolved/docs/pr from above
    const noopRoot = path.join(dir, '.superdev', 'scopes', 'noop');
    assert.ok(quiet(['init', 'feat/noop', 'implementing'], sliceJson), 'init for noop root');
    const noop = lines().length;
    assert.ok(quiet(['unresolved', 'clear', '--root', noopRoot]), 'unresolved clear when absent succeeds');
    assert.equal(lines().length, noop, 'unresolved clear on absent header traces no line');
    assert.ok(quiet(['docs', 'clear', '--root', noopRoot]), 'docs clear when absent succeeds');
    assert.equal(lines().length, noop, 'docs clear on absent header traces no line');
    assert.ok(quiet(['pr', 'clear', '--root', noopRoot]), 'pr clear when absent succeeds');
    assert.equal(lines().length, noop, 'pr clear on absent header traces no line');
    const n0 = lines().length;
    assert.ok(quiet(['adopt', '--root', adoptRoot], require(scopePath).publishText(root)), 'adopt');
    assert.equal(fs.readFileSync(path.join(adoptRoot, 'trace.log'), 'utf8').split('\n').filter(Boolean).length, 1, 'adopt appends one line');
    assert.equal(lines().length, n0, 'adopt traces into the adopted root only');
    // An absent or empty field keeps its position.
    appendTrace(root, { slice: '', kind: 'note', fields: [undefined, ''] });
    assert.match(lines()[lines().length - 1], /^\S+ scope main note - -$/, 'placeholder fields');
    fs.writeFileSync(traceFile, lines().slice(0, 4).join('\n') + '\n');

    // Escaping: control characters never start a new line.
    const before = lines().length;
    appendTrace(root, { slice: '01', kind: 'edit', fields: ['impl', 'a\nb\rc\td\u2028e f'] });
    assert.equal(lines().length, before + 1, 'one new line');
    assert.ok(lines()[before].endsWith('edit impl a\\nb\\rc\\td\\u2028e\\x20f'), 'escaped: ' + lines()[before]);

    // Concurrent writers leave every line whole.
    const N = 8;
    const writers = [];
    const writer = `require(${JSON.stringify(scopePath)}).appendTrace(${JSON.stringify(root)}, {kind:'note', fields:['x'.repeat(5000)]})`;
    const procs = [];
    for (let i = 0; i < N; i++) procs.push(require('node:child_process').spawn(process.execPath, ['-e', writer]));
    for (const p of procs) writers.push(new Promise((res) => p.on('exit', res)));
    const done = Promise.all(writers).then(() => {
      const notes = lines().filter((l) => / note /.test(l));
      assert.equal(notes.length, N, 'every concurrent line landed');
      assert.ok(notes.every((l) => /^\S+ scope main note x{5000}$/.test(l)), 'no line torn or interleaved');

      // Reader.
      const out = spawnSync(process.execPath, [scopePath, 'trace', '--root', root], { encoding: 'utf8', timeout: 20000 });
      assertSpawnDecided(out, 'trace');
      assert.equal(out.status, 0);
      const printed = out.stdout.split('\n').filter(Boolean);
      assert.equal(printed.length, lines().length, 'trace prints every line');
      assert.match(printed[0], / ledger init /, 'oldest first');
      const one = spawnSync(process.execPath, [scopePath, 'trace', '--slice', '01', '--root', root], { encoding: 'utf8', timeout: 20000 });
      assertSpawnDecided(one, 'trace --slice');
      assert.ok(one.stdout.split('\n').filter(Boolean).every((l) => l.split(' ')[1] === '01'), '--slice 01 prints only 01');
      assert.ok(one.stdout.includes('ledger slice 01 merged'));
      const none = spawnSync(process.execPath, [scopePath, 'trace', '--slice', '99', '--root', root], { encoding: 'utf8', timeout: 20000 });
      assertSpawnDecided(none, 'trace --slice none');
      assert.match(none.stdout.trim(), /^no trace: this run has recorded no events$/, 'a slice with no lines prints the one no-trace line');
      for (const content of [null, '']) {
        const empty = path.join(dir, 'empty' + content);
        fs.mkdirSync(empty, { recursive: true });
        if (content !== null) fs.writeFileSync(path.join(empty, 'trace.log'), content);
        const r2 = spawnSync(process.execPath, [scopePath, 'trace', '--root', empty], { encoding: 'utf8', timeout: 20000 });
        assertSpawnDecided(r2, 'trace empty');
        assert.equal(r2.status, 0, 'no trace exits 0');
        assert.match(r2.stdout.trim(), /^no trace/, 'one no-trace line');
      }
      // No verb takes a caller-chosen event.
      assert.ok(!quiet(['event', 'edit', 'x', '--root', root]), 'no verb appends a caller-chosen event');
      assert.equal(lines().length, before + 1 + N, 'and the trace is unchanged');
      fs.rmSync(dir, { recursive: true, force: true });
      console.log('scope tests ok');
    });
    done.catch((e) => {
      fs.rmSync(dir, { recursive: true, force: true });
      console.error(e);
      process.exit(1);
    });
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}

// A focused run's path set reads back whole through the trace's own writer and reader, for any path (ADR 0175). The one
// spawned `scope.js test focused` case in scope-test-verb-record.test.js shows the verb writes this field.
{
  const { encodePaths, decodePaths, appendTrace, readTrace } = require('../plugin/lib/trace-log.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-trace-paths-'));
  try {
    const last = () => readTrace(fs.readFileSync(path.join(dir, 'trace.log'), 'utf8')).filter((e) => e.kind === 'run').pop();
    for (const set of [['a b.ts', 'c.ts'], ['x,y.ts', 'z.ts'], ['-lead.ts'], ['-'], ['café.ts', '100%.ts', 'back\\slash.ts', 'p%2Cq.ts']]) {
      assert.ok(appendTrace(dir, { slice: '01', kind: 'run', fields: ['focused', 'pass', 'abc', 'clean', encodePaths(set)] }));
      assert.deepEqual(decodePaths(last().fields[4]), set, `the set reads back whole: ${JSON.stringify(set)}`);
    }
    assert.deepEqual(decodePaths('-'), [], 'a line with no path set reads an empty set');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
