'use strict';

// Suite for plugin/scripts/scope.js's `main()` stdin gate: every verb whose `run()` branch hands the stdin text on
// receives the piped input when spawned through the real CLI, judged by what the verb did, and a verb that reads no
// piped input runs to completion with its input left open. The verbs come from `run()`'s own source, so a new
// stdin verb the gate leaves out fails here without an edit to this file.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
require('./fixture-git');
const { assertSpawnDecided } = require('./spawn-verdict');
const { scopePath, sliceJson } = require('./scope-setup');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scope-stdin-'));

// One CLI spawn. `input` is piped and its end closes stdin; `stdin: 'open'` instead hands a pipe nobody ever
// writes to or closes, so a verb waiting on it is killed by the loose, qualitative bound.
const cli = (argv, input) => {
  const opts = { cwd: tmp, encoding: 'utf8', timeout: 30000 };
  let res;
  if (input === undefined) {
    const child = cp.spawnSync(process.execPath, ['-e', `
      const cp = require('node:child_process');
      const c = cp.spawn(process.execPath, ${JSON.stringify([scopePath, ...argv])}, { cwd: ${JSON.stringify(tmp)}, stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '', err = '';
      c.stdout.on('data', (d) => (out += d));
      c.stderr.on('data', (d) => (err += d));
      c.on('exit', (status) => { process.stdout.write(JSON.stringify({ status, out, err })); process.exit(0); });
    `], opts);
    assertSpawnDecided(child, argv.join(' ') + ' (input left open)');
    const r = JSON.parse(child.stdout);
    res = { status: r.status, stdout: r.out, stderr: r.err };
  } else {
    res = cp.spawnSync(process.execPath, [scopePath, ...argv], { ...opts, input });
    assertSpawnDecided(res, argv.join(' '));
  }
  return res;
};

try {
  // run()'s source, cut into its `case '<verb>'` branches; a branch naming stdinJson hands the piped text on.
  const src = fs.readFileSync(scopePath, 'utf8');
  const body = src.slice(src.indexOf('function run('), src.indexOf('\n}\n', src.indexOf('function run(')));
  const stdinVerbs = body
    .split(/\n\s*case '/)
    .slice(1)
    .filter((b) => b.includes('stdinJson'))
    .map((b) => b.slice(0, b.indexOf("'")));
  assert.ok(stdinVerbs.includes('init'), 'run() extraction broke: the stdin verb list lacks init (check run()\'s signature and its case branches in plugin/scripts/scope.js)');

  // The run root the ledger verbs write to: init itself is one of the stdin verbs.
  const root = path.join(tmp, '.superdev', 'scopes', 'demo');
  const ledger = () => fs.readFileSync(path.join(root, 'ledger.md'), 'utf8');

  // Each stdin verb's cases: argv, piped input, and the check that the verb acted on that input.
  const cases = {
    init: [[['init', 'feat/demo', 'implementing'], sliceJson, () => assert.match(ledger(), /ledger-guard hook/, 'init wrote the piped slices')]],
    degraded: [
      [['degraded', 'add', '-', '--root', root], 'piped degraded text\n', () => assert.match(ledger(), /- piped degraded text/)],
      [['degraded', 'add-denial', '-', '--root', root], 'piped denial text\n', () => assert.match(ledger(), /piped denial text/)],
    ],
    unresolved: [[['unresolved', 'add', '-', '--root', root], 'piped unresolved text\n', () => assert.match(ledger(), /- piped unresolved text/)]],
    deferred: [
      [['deferred', 'add', '-', '--root', root], 'piped deferred text\n', () => assert.match(ledger(), /- piped deferred text/)],
      [['deferred', 'resolve', '-', '--root', root], 'piped deferred text\n', () => assert.doesNotMatch(ledger(), /piped deferred text/)],
    ],
    adopt: [], // filled below from publish's own output
    'dod-merge': [[['dod-merge', '--root', root], '- [ ] a piped criterion\n', () => assert.match(fs.readFileSync(path.join(root, 'dod.md'), 'utf8'), /a piped criterion/)]],
    'dod-line': [],
  };
  const matchFile = path.join(tmp, 'match.txt');
  const noteFile = path.join(tmp, 'note.txt');
  fs.writeFileSync(matchFile, 'a piped criterion');
  fs.writeFileSync(noteFile, 'seen');
  let dodLineOut = '';
  cases['dod-line'].push([
    ['dod-line', '--match-file', matchFile, '--verdict', 'met', '--note-file', noteFile],
    '- [ ] a piped criterion\n',
    () => assert.match(dodLineOut, /- \[x\] a piped criterion .*met: seen/, 'dod-line rewrote the piped line'),
  ]);

  for (const verb of stdinVerbs) assert.ok(cases[verb], `verb "${verb}" reads piped input and has a case in this suite`);

  const order = ['init', ...stdinVerbs.filter((v) => v !== 'init' && v !== 'adopt'), 'adopt'];
  for (const verb of order) {
    if (verb === 'adopt') {
      const published = cli(['publish', '--root', root]);
      assert.strictEqual(published.status, 0, 'publish: ' + published.stderr);
      const adoptRoot = path.join(tmp, 'elsewhere', 'demo');
      fs.mkdirSync(path.dirname(adoptRoot), { recursive: true });
      cases.adopt.push([['adopt', '--root', adoptRoot], published.stdout, () => assert.strictEqual(fs.readFileSync(path.join(adoptRoot, 'ledger.md'), 'utf8'), ledger(), 'adopt rebuilt the piped ledger')]);
    }
    for (const [argv, input, check] of cases[verb]) {
      const res = cli(argv, input);
      assert.strictEqual(res.status, 0, argv.join(' ') + ': ' + res.stderr);
      dodLineOut = res.stdout;
      check();
    }
  }

  // dod-merge keeps the verdict a local copy already carries.
  {
    const dod = path.join(root, 'dod.md');
    fs.writeFileSync(dod, '- [x] a piped criterion — met: seen\n');
    const res = cli(['dod-merge', '--root', root], '- [ ] a piped criterion\n- [ ] another\n');
    assert.strictEqual(res.status, 0, res.stderr);
    const text = fs.readFileSync(dod, 'utf8');
    assert.match(text, /- \[x\] a piped criterion — met: seen/, 'dod-merge keeps the local verdict');
    assert.match(text, /- \[ \] another/, 'dod-merge writes the piped line');

    // Empty piped input refuses and leaves dod.md as it was.
    const empty = cli(['dod-merge', '--root', root], '');
    assert.notStrictEqual(empty.status, 0, 'dod-merge refuses empty piped input');
    assert.strictEqual(fs.readFileSync(dod, 'utf8'), text, 'dod-merge leaves dod.md as it was');
  }

  // A verb that reads no piped input runs to completion with its input left open.
  {
    const res = cli(['get', 'stage', '--root', root]);
    assert.strictEqual(res.status, 0, res.stderr);
    assert.match(res.stdout, /implementing/, 'get stage printed with its input left open');
  }

  // --help on each stdin verb prints usage with its input left open.
  for (const verb of stdinVerbs) {
    const res = cli([verb, '--help']);
    assert.strictEqual(res.status, 0, verb + ' --help: ' + res.stderr);
    assert.ok(res.stdout.includes('usage: node scope.js'), verb + ' --help prints the usage');
  }

  console.log('scope-stdin: ok');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
