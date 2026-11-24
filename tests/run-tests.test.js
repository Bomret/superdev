'use strict';

// Suite for scripts/run-tests.js, the maintainer-only test runner. Every case builds a
// throwaway tree under the OS temp dir, so the runner is exercised on suites this repository does not
// carry. The duration cache's cases, a corrupt, null, or string cache and a cache folder that cannot be created, use that
// tree's own `node_modules/`, never the repository's.

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { discoverSuites, runAll, selectSuites, parseArgs } = require('../scripts/run-tests');

const repoRoot = path.join(__dirname, '..');

const made = [];
after(() => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'run-tests-'));
  made.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

// A suite that appends its own name to <root>/log, then exits with `code`.
const suite = (name, code = 0) =>
  `require('node:fs').appendFileSync(require('node:path').join(__dirname, '..', 'log'), '${name}\\n');` +
  `process.exit(${code});`;

const logOf = (root) => (fs.existsSync(path.join(root, 'log')) ? fs.readFileSync(path.join(root, 'log'), 'utf8') : '');

const tailEntry = (root, name, code = 0) => [
  process.execPath,
  [
    '-e',
    `require('node:fs').appendFileSync(${JSON.stringify(path.join(root, 'log'))}, '${name}\\n');process.exit(${code});`,
  ],
];

async function go(root, tail, related, extra = {}) {
  const lines = [];
  const status = await runAll({ root, tail, related, out: (line) => lines.push(line), ...extra });
  return { status, out: lines.join('\n') };
}

// Fixture steps coordinate through files, never through sleeps: `waitFor` polls for a file and gives up with exit 3
// only when the contract under test is already broken.
const PRELUDE =
  `const fs = require('node:fs'), path = require('node:path'), R = path.join(__dirname, '..');\n` +
  `const mark = (n) => fs.writeFileSync(path.join(R, n), String(process.pid));\n` +
  `const has = (n) => fs.existsSync(path.join(R, n));\n` +
  `const waitFor = (n, then) => { let t = 0; const i = setInterval(() => { if (has(n)) { clearInterval(i); then(); } else if (++t > 3000) process.exit(3); }, 10); };\n` +
  `const note = (s) => fs.appendFileSync(path.join(R, 'log'), s + '\\n');\n`;
const step = (body) => PRELUDE + body;

// A step that starts a grandchild which outlives it unless ended, records both pids, then blocks.
const BLOCKER = (name) =>
  step(
    `const gc = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });\n` +
      `mark('${name}.pid'); fs.writeFileSync(path.join(R, '${name}.gc'), String(gc.pid)); console.log('${name}-secret'); mark('${name}.started'); setInterval(() => {}, 1000);`,
  );

const alive = (file) => {
  try {
    process.kill(Number(fs.readFileSync(file, 'utf8')), 0);
    return true;
  } catch {
    return false;
  }
};
const waitFile = async (file) => {
  for (let i = 0; i < 3000 && !fs.existsSync(file); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(fs.existsSync(file), `${file} appears`);
};
const waitDead = async (file) => {
  for (let i = 0; i < 3000 && alive(file); i++) await new Promise((r) => setTimeout(r, 10));
  return !alive(file);
};

test('A suite added at tests/<name>.test.js is found, a helper and a fixtures directory are not.', () => {
  const root = tree({
    'tests/b.test.js': '',
    'tests/a.test.js': '',
    'tests/helper.js': '',
    'tests/fixtures/x.test.js': '',
    'tests/sub/y.test.js': '',
  });
  const found = discoverSuites(path.join(root, 'tests')).map((f) => path.basename(f));
  assert.deepStrictEqual(found, ['a.test.js', 'b.test.js'], 'suites only, in a stable order');
  fs.writeFileSync(path.join(root, 'tests', 'c.test.js'), '');
  assert.deepStrictEqual(
    discoverSuites(path.join(root, 'tests')).map((f) => path.basename(f)),
    ['a.test.js', 'b.test.js', 'c.test.js'],
    'a suite added to the tree is picked up with no other edit',
  );
});

test('An absent or empty tests/ directory finds no suite, and the runner says so and exits nonzero.', async () => {
  const absent = tree({});
  assert.deepStrictEqual(discoverSuites(path.join(absent, 'tests')), []);
  const r = await go(absent, []);
  assert.notStrictEqual(r.status, 0, 'no suite is a failure, never a silent pass');
  assert.match(r.out, /no suite/i);
  const empty = tree({ 'tests/helper.js': '' });
  assert.notStrictEqual((await go(empty, [])).status, 0);
});

test('The suites start longest first by the durations the last run recorded, a suite with no record first of all, and the run records what it measured for the next one.', async () => {
  const root = tree({
    'tests/a.test.js': suite('a'),
    'tests/b.test.js': suite('b'),
    'tests/c.test.js': suite('c'),
    'tests/d.test.js': suite('d'),
  });
  const first = await go(root, [], undefined, { parallelism: 1 });
  assert.strictEqual(first.status, 0, first.out);
  assert.strictEqual(logOf(root), 'a\nb\nc\nd\n', 'with no record the discovery order holds');
  const file = path.join(root, 'node_modules', '.cache', 'run-tests.json');
  const recorded = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepStrictEqual(Object.keys(recorded).sort(), ['tests/a.test.js', 'tests/b.test.js', 'tests/c.test.js', 'tests/d.test.js']);
  fs.writeFileSync(file, JSON.stringify({ 'tests/a.test.js': 10, 'tests/b.test.js': 300, 'tests/c.test.js': 20 }));
  fs.rmSync(path.join(root, 'log'));
  const second = await go(root, [], undefined, { parallelism: 1 });
  assert.strictEqual(second.status, 0, second.out);
  assert.strictEqual(logOf(root), 'd\nb\nc\na\n', 'unrecorded first, then longest first');
});

test('A duration cache that is corrupt, `null`, or a string reads as empty, and one that cannot be written loses only the ordering: every suite runs and the run exits 0, leaving a valid cache, with no index keys from a string, where it can write one.', async () => {
  const labels = ['tests/a.test.js', 'tests/b.test.js'];
  for (const [label, text] of [['a corrupt cache', '{nope'], ['a null cache', 'null'], ['a string cache', '"abcd"']]) {
    const root = tree({ 'tests/a.test.js': suite('a'), 'tests/b.test.js': suite('b'), 'node_modules/.cache/run-tests.json': text });
    const r = await go(root, [], undefined, { parallelism: 1 });
    assert.strictEqual(r.status, 0, `${label}: ${r.out}`);
    assert.strictEqual(logOf(root), 'a\nb\n', `${label} runs every suite in discovery order`);
    const written = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', '.cache', 'run-tests.json'), 'utf8'));
    assert.deepStrictEqual(Object.keys(written).sort(), labels, `${label} is replaced by a valid cache of this run's suites`);
  }
  const root = tree({ 'tests/a.test.js': suite('a'), 'tests/b.test.js': suite('b'), 'node_modules/.cache': 'a plain file\n' });
  const r = await go(root, [], undefined, { parallelism: 1 });
  assert.strictEqual(r.status, 0, `a cache folder that cannot be created: ${r.out}`);
  assert.strictEqual(logOf(root), 'a\nb\n', 'a cache folder that cannot be created still runs every suite');
  assert.strictEqual(fs.readFileSync(path.join(root, 'node_modules', '.cache'), 'utf8'), 'a plain file\n', 'and the file in its place is left as it was');
});

test('Every discovered suite and every tail step runs, each prints one wall-clock line, and a step passes through the whole run (scripts/AGENTS.md, run-tests.js).', async () => {
  const root = tree({ 'tests/b.test.js': suite('b'), 'tests/a.test.js': suite('a') });
  const first = await go(root, [tailEntry(root, 'tail1'), tailEntry(root, 'tail2')]);
  assert.strictEqual(first.status, 0);
  assert.deepStrictEqual(logOf(root).split('\n').filter(Boolean).sort(), ['a', 'b', 'tail1', 'tail2'], 'every step runs');
  const timed = first.out.split('\n').filter((l) => /^run-tests: .+: \d+ ms$/.test(l));
  assert.strictEqual(timed.length, 4, 'one wall-clock line per step');
  assert.ok(timed.some((l) => /^run-tests: tests\/a\.test\.js: \d+ ms$/.test(l)), 'the line carries the step label');
});

test('A suite step runs under node:test\'s dot reporter, the flag before the suite path so the suite\'s own `process.argv` is unchanged, and no tail step carries the flag.', async () => {
  const record = (name) =>
    `require('node:fs').writeFileSync(require('node:path').join(${JSON.stringify('ROOT')}, '${name}.argv'), JSON.stringify({ execArgv: process.execArgv, argv: process.argv.slice(1) }));`;
  const root = tree({});
  const write = (rel, content) => fs.writeFileSync(path.join(root, rel), content.split(JSON.stringify('ROOT')).join(JSON.stringify(root)));
  fs.mkdirSync(path.join(root, 'tests'));
  write('tests/a.test.js', record('suite'));
  const r = await go(root, [[process.execPath, ['-e', record('tail').split(JSON.stringify('ROOT')).join(JSON.stringify(root))]]]);
  assert.strictEqual(r.status, 0, r.out);
  const suiteArgs = JSON.parse(fs.readFileSync(path.join(root, 'suite.argv'), 'utf8'));
  assert.deepStrictEqual(suiteArgs.execArgv, ['--test-reporter=dot'], 'the suite step carries the dot-reporter flag');
  assert.deepStrictEqual(suiteArgs.argv, [path.join(root, 'tests', 'a.test.js')], 'the flag sits before the suite path');
  const tailArgs = JSON.parse(fs.readFileSync(path.join(root, 'tail.argv'), 'utf8'));
  assert.ok(!tailArgs.execArgv.includes('--test-reporter=dot'), 'a tail step carries no flag');
});

test('A suite with one passing and one failing `test()` case fails the run, and the runner output names the failing case.', async () => {
  const root = tree({
    'tests/a.test.js':
      "const { test, after } = require('node:test');\n" +
      "test('passing case', () => {});\n" +
      "test('failing case', () => { throw new Error('kaboom'); });\n",
  });
  const r = await go(root, []);
  assert.notStrictEqual(r.status, 0, 'a failing case fails the run');
  assert.match(r.out, /failing case/, 'the output names the failing case');
  assert.match(r.out, /kaboom/, 'the output carries its error');
  assert.match(r.out, /^run-tests: FAILED tests\/a\.test\.js \(exit 1\)$/m);
});

test('A failing step still reports its wall clock and names itself on the FAILED line.', async () => {
  const root = tree({ 'tests/a.test.js': suite('a', 2) });
  const r = await go(root, []);
  assert.match(r.out, /^run-tests: tests\/a\.test\.js: \d+ ms$/m);
  assert.match(r.out, /^run-tests: FAILED tests\/a\.test\.js \(exit 2\)$/m);
});

test('Steps start at the same time: each of two suites waits for the other\'s start mark, so a serial runner never ends them.', async () => {
  const body = (me, other) => step(`mark('${me}.up'); waitFor('${other}.up', () => { note('${me}'); process.exit(0); });`);
  const root = tree({ 'tests/a.test.js': body('a', 'b'), 'tests/b.test.js': body('b', 'a') });
  const r = await go(root, [], undefined, { parallelism: 2 });
  assert.strictEqual(r.status, 0, 'both steps were running at once');
  const mixed = tree({ 'tests/a.test.js': body('a', 'tail'), 'tests/b.test.js': '' });
  const tail = [[process.execPath, ['-e', PRELUDE.replace(/__dirname/g, JSON.stringify(path.join(mixed, 'tests'))) + `mark('tail.up'); waitFor('a.up', () => process.exit(0));`]]];
  assert.strictEqual((await go(mixed, tail, undefined, { parallelism: 3 })).status, 0, 'a suite and a tail step overlap');
  if (os.availableParallelism() > 1) {
    const dflt = tree({ 'tests/a.test.js': body('a', 'b'), 'tests/b.test.js': body('b', 'a') });
    assert.strictEqual((await go(dflt, [])).status, 0, 'the default limit is the available parallelism');
  }
});

test('One available CPU: the steps run one at a time and reach the same result.', async () => {
  const body = (n) => step(`note('start ${n}'); setTimeout(() => { note('end ${n}'); process.exit(0); }, 20);`);
  const root = tree({ 'tests/a.test.js': body('a'), 'tests/b.test.js': body('b'), 'tests/c.test.js': body('c') });
  const r = await go(root, [], undefined, { parallelism: 1 });
  assert.strictEqual(r.status, 0);
  const lines = logOf(root).split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 6);
  lines.forEach((l, i) => assert.strictEqual(l.split(' ')[0], i % 2 ? 'end' : 'start', 'a step ends before the next starts'));
  const failing = tree({ 'tests/a.test.js': suite('a', 1), 'tests/b.test.js': suite('b') });
  const f = await go(failing, [], undefined, { parallelism: 1 });
  assert.notStrictEqual(f.status, 0);
  assert.strictEqual(logOf(failing), 'a\n', 'a failure on one CPU starts nothing after it');
});

test('Each step\'s output prints as one unbroken block between its label and its timing line, though the steps overlap.', async () => {
  const body = (me, other) =>
    step(`console.log('${me}-1'); mark('${me}.up'); waitFor('${other}.up', () => { console.log('${me}-2'); console.error('${me}-3'); });`);
  const root = tree({ 'tests/a.test.js': body('a', 'b'), 'tests/b.test.js': body('b', 'a') });
  const r = await go(root, [], undefined, { parallelism: 2 });
  assert.strictEqual(r.status, 0);
  for (const n of ['a', 'b']) {
    assert.match(
      r.out,
      new RegExp(`run-tests: tests/${n}\\.test\\.js\\n${n}-1\\n${n}-2\\n${n}-3\\nrun-tests: tests/${n}\\.test\\.js: \\d+ ms`),
      `${n}'s output is one block with its label and timing`,
    );
  }
});

test('The first failing step ends the steps still running with every process they started, starts nothing further, exits nonzero, names the failing step, and a cancelled step prints one cancelled line and none of its output.', async () => {
  const root = tree({
    'tests/a.test.js': step(`waitFor('b.started', () => { console.log('a-output'); process.exit(1); });`),
    'tests/b.test.js': BLOCKER('b'),
    'tests/c.test.js': suite('c'),
  });
  const r = await go(root, [tailEntry(root, 'tail')], undefined, { parallelism: 2 });
  assert.notStrictEqual(r.status, 0);
  assert.match(r.out, /^run-tests: FAILED tests\/a\.test\.js/m, 'the FAILED line names the failing step');
  assert.match(r.out, /a-output/, 'the failing step prints its output');
  assert.strictEqual(r.out.match(/^run-tests: .*tests\/b\.test\.js.*cancel/gim).length, 1, 'one cancelled line names the ended step');
  assert.ok(!r.out.includes('b-secret'), 'a cancelled step prints none of its output');
  assert.ok(!/tests\/b\.test\.js: \d+ ms/.test(r.out), 'a cancelled step prints no timing line');
  assert.strictEqual(logOf(root), '', 'no further step started');
  assert.ok(await waitDead(path.join(root, 'b.pid')), 'the cancelled step is gone');
  assert.ok(await waitDead(path.join(root, 'b.gc')), 'the process the cancelled step started is gone');
});

test('A tail step that fails ends the suites still running too.', async () => {
  const root = tree({ 'tests/a.test.js': BLOCKER('a') });
  const tail = [[process.execPath, ['-e', PRELUDE.replace(/__dirname/g, JSON.stringify(path.join(root, 'tests'))) + `waitFor('a.started', () => process.exit(4));`]]];
  const r = await go(root, tail, undefined, { parallelism: 2 });
  assert.notStrictEqual(r.status, 0);
  assert.ok(await waitDead(path.join(root, 'a.gc')), 'the suite process tree ended');
});

test('A step that is killed fails the run and a command that does not exist fails it, neither waits forever (INV-0009).', async () => {
  const killed = tree({ 'tests/a.test.js': step(`process.kill(process.pid, 'SIGKILL');`) });
  const k = await go(killed, []);
  assert.notStrictEqual(k.status, 0, 'a killed step fails the run');
  assert.match(k.out, /FAILED tests\/a\.test\.js \(killed by SIGKILL\)/);
  const root = tree({ 'tests/a.test.js': BLOCKER('a') });
  const r = await go(root, [['/nonexistent/binary-for-run-tests', []]], undefined, { parallelism: 2 });
  assert.notStrictEqual(r.status, 0, 'a tail command that cannot start fails the run');
  assert.match(r.out, /FAILED .*binary-for-run-tests \(did not start/);
  assert.ok(await waitDead(path.join(root, 'a.gc')), 'the running step ended with the run');
});

// Runs the runner over `root` in a child process of its own (no tail), so a test can signal it or hold its stdout.
const driveRunner = (root, { stdio, parallelism }) => {
  const driver = path.join(root, 'driver.js');
  const extra = parallelism ? `, parallelism: ${parallelism}` : '';
  fs.writeFileSync(driver, `require(${JSON.stringify(path.join(repoRoot, 'scripts/run-tests.js'))}).runAll({ root: ${JSON.stringify(root)}, tail: []${extra} }).then((c) => { process.exitCode = c; });`);
  return require('node:child_process').spawn(process.execPath, [driver], { stdio });
};

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  test(`A SIGINT, SIGTERM, or SIGHUP to the runner ends every running step and its processes before the runner exits. (${signal})`, async () => {
    const root = tree({ 'tests/a.test.js': BLOCKER('a'), 'tests/b.test.js': BLOCKER('b') });
    const child = driveRunner(root, { stdio: 'ignore', parallelism: 2 });
    const exited = new Promise((resolve) => child.on('exit', (code, sig) => resolve({ code, sig })));
    for (const f of ['a.started', 'b.started']) await waitFile(path.join(root, f));
    child.kill(signal);
    const end = await exited;
    assert.ok(end.code !== 0 || end.sig, `${signal} ends the runner nonzero`);
    for (const f of ['a.pid', 'a.gc', 'b.pid', 'b.gc']) assert.ok(await waitDead(path.join(root, f)), `${signal} left ${f} running`);
  });
}

test('A write error on the runner\'s stdout (the reader closed the pipe) ends every running step, as a signal does.', async () => {
  const root = tree({
    'tests/a.test.js': step(`waitFor('closed', () => process.exit(0));`),
    'tests/b.test.js': BLOCKER('b'),
  });
  const child = driveRunner(root, { stdio: ['ignore', 'pipe', 'ignore'], parallelism: 2 });
  const exited = new Promise((resolve) => child.on('exit', (code, sig) => resolve({ code, sig })));
  await waitFile(path.join(root, 'b.started'));
  child.stdout.destroy();
  fs.writeFileSync(path.join(root, 'closed'), '');
  // Bounded: without the stdout handler the steps never end and the runner never exits, so check the steps first.
  const dead = await waitDead(path.join(root, 'b.pid'));
  if (!dead) {
    child.kill('SIGKILL');
    for (const f of ['b.pid', 'b.gc']) {
      try {
        process.kill(-Number(fs.readFileSync(path.join(root, f), 'utf8')), 'SIGKILL');
      } catch {
        // already gone
      }
      try {
        process.kill(Number(fs.readFileSync(path.join(root, f), 'utf8')), 'SIGKILL');
      } catch {
        // already gone
      }
    }
  }
  assert.ok(dead, 'a stdout write error ends the running step');
  assert.ok(await waitDead(path.join(root, 'b.gc')), 'a stdout write error ends the process the step started');
  const end = await exited;
  assert.ok(end.code !== 0 || end.sig, 'a stdout write error ends the runner nonzero');
});

test('A step whose spawn throws synchronously (a command with a NUL byte is refused by Node) fails the run as "did not start" and ends the step still running, though the throw happens inside a close handler.', async () => {
  const root = tree({
    'tests/a.test.js': BLOCKER('a'),
    'tests/b.test.js': step(`waitFor('a.started', () => process.exit(0));`),
  });
  const r = await go(root, [['bad\0command', []]], undefined, { parallelism: 2 });
  assert.notStrictEqual(r.status, 0, 'a step that never started fails the run');
  assert.match(r.out, /^run-tests: FAILED .*\(did not start: .+\)$/m);
  assert.ok(await waitDead(path.join(root, 'a.pid')), 'the running step ended with the run');
  assert.ok(await waitDead(path.join(root, 'a.gc')), 'the process the running step started ended too');
});

// Step b exits 1 at once, but a grandchild in a process group of its own holds b's pipes open until the runner has
// printed a's FAILED line, so b's end reaches the runner while it is stopping.
test('A step that ended on its own before another step\'s failure stopped the run is no cancelled step: it prints its own output and result.', async () => {
  const holder = `const g = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(
    `const fs = require('node:fs'); const i = setInterval(() => { if (fs.existsSync(process.argv[1])) process.exit(0); }, 10); setTimeout(() => process.exit(3), 30000);`,
  )}, path.join(R, 'release')], { detached: true, stdio: ['ignore', 'inherit', 'inherit'] }); g.unref();`;
  const root = tree({
    'tests/a.test.js': step(`waitFor('b.done', () => setTimeout(() => process.exit(1), 100));`),
    'tests/b.test.js': step(`${holder} console.log('b-output'); mark('b.done'); process.exit(1);`),
  });
  const lines = [];
  const out = (line) => {
    lines.push(line);
    if (line.startsWith('run-tests: FAILED tests/a.test.js')) fs.writeFileSync(path.join(root, 'release'), '');
  };
  const status = await runAll({ root, tail: [], out, parallelism: 2 });
  const text = lines.join('\n');
  assert.notStrictEqual(status, 0);
  assert.ok(!/tests\/b\.test\.js: cancelled/.test(text), `a step that ended on its own is not labelled cancelled:\n${text}`);
  assert.match(text, /b-output/, 'a step that ended on its own prints its output');
  assert.match(text, /^run-tests: FAILED tests\/b\.test\.js \(exit 1\)$/m, 'a step that failed on its own names its own failure');
});

test('The failing step\'s output reaches the reader in full when the runner\'s stdout is a pipe.', async () => {
  const root = tree({ 'tests/a.test.js': `process.stdout.write('x'.repeat(2000000) + '\\nEND-MARK\\n'); process.exitCode = 1;` });
  const child = driveRunner(root, { stdio: ['ignore', 'pipe', 'inherit'] });
  const chunks = [];
  child.stdout.on('data', (d) => chunks.push(d));
  const code = await new Promise((resolve) => child.on('close', resolve));
  const text = Buffer.concat(chunks).toString();
  assert.notStrictEqual(code, 0);
  assert.ok(text.includes('END-MARK'), 'the last line of the output arrives');
  assert.ok(text.includes('x'.repeat(2000000)), 'the whole output arrives');
  assert.match(text, /FAILED tests\/a\.test\.js/);
});

// Focused mode: a repository-relative path list selects the suites the change set reaches.
const focusedTree = () =>
  tree({
    'plugin/hooks/alpha.js': '',
    'plugin/hooks/gamma.js': "require('../scripts/beta.js');",
    'plugin/hooks/omega.js': '',
    'plugin/scripts/beta.js': "require('./delta.js');",
    'plugin/scripts/delta.js': '',
    'tests/alpha.test.js': suite('alpha'),
    'tests/beta.test.js': suite('beta') + "\n// pins hooks/alpha.js\n",
    'tests/gamma.test.js': suite('gamma'),
    'tests/delta.test.js': suite('delta'),
    'tests/omega.test.js': suite('omega'),
    'tests/other.test.js': suite('other') + "\nrequire('./spawn-verdict');\n",
    'tests/spawn-verdict.js': '',
    'tests/bare.test.js': suite('bare') + "\nconst p = require('../plugin/hooks/lonely');\n",
  });

const picked = (root, paths) =>
  selectSuites(root, discoverSuites(path.join(root, 'tests')), paths).map((f) => path.basename(f, '.test.js'));

test('A focused selection picks the pinned suite, every suite naming the file, and the suites of the shipped files that require it.', () => {
  const root = focusedTree();
  assert.deepStrictEqual(picked(root, ['plugin/hooks/alpha.js']), ['alpha', 'beta'], 'the pinned suite and every suite naming the file, nothing else');
  assert.deepStrictEqual(
    picked(root, ['plugin/scripts/beta.js']),
    ['beta', 'gamma'],
    'the own suite of the file and the suite of every shipped file that requires it',
  );
  assert.deepStrictEqual(
    picked(root, ['plugin/scripts/delta.js']),
    ['beta', 'delta'],
    'a requiring shipped file pulls in its suite',
  );
  assert.deepStrictEqual(picked(root, ['tests/spawn-verdict.js']), ['other'], 'a test helper selects every suite that names it');
  assert.deepStrictEqual(picked(root, ['tests/omega.test.js']), ['omega'], 'a suite path selects that suite');
  assert.deepStrictEqual(picked(root, ['plugin/hooks/alpha.js', 'tests/other.test.js']), ['other', 'alpha', 'beta'].sort(), 'paths union, in suite order');
  assert.deepStrictEqual(picked(root, ['plugin/hooks/lonely.js']), ['bare'], 'a bare name between path delimiters names the file');
});

// An exact pin wins.
test('A suite split off another (`<stem>-<part>.test.js`, no `<stem>-<part>.js` shipped) pins the file of its longest `-`-delimited prefix: a change to that file, or to a file it requires, selects every part.', () => {
  const root = tree({
    'plugin/hooks/beta-hook.js': '',
    'plugin/scripts/beta.js': "require('./delta.js');",
    'plugin/scripts/delta.js': '',
    'tests/beta.test.js': suite('beta'),
    'tests/beta-verb.test.js': suite('beta-verb'),
    'tests/beta-other-verb.test.js': suite('beta-other-verb'),
    'tests/beta-hook.test.js': suite('beta-hook'),
    'tests/gamma.test.js': suite('gamma'),
  });
  const parts = ['beta-other-verb', 'beta-verb', 'beta'];
  assert.deepStrictEqual(picked(root, ['plugin/scripts/beta.js']), parts, 'every part of a split suite pins the file');
  assert.deepStrictEqual(picked(root, ['plugin/scripts/delta.js']), parts, 'every part takes the requires of the file it pins');
  assert.deepStrictEqual(picked(root, ['tests/beta-verb.test.js']), ['beta-verb'], 'a part path selects that part');
  assert.deepStrictEqual(picked(root, ['plugin/hooks/beta-hook.js']), ['beta-hook'], 'an exact pin wins over a prefix');
});

// A cycle ends the walk, and a require of a path that does not exist adds nothing.
test('Requires are followed transitively, from the file a suite pins and from the suite itself, including a require made inside a function.', () => {
  const root = tree({
    'plugin/hooks/top.js': "require('../lib/mid');",
    'plugin/lib/mid.js': "function f() { return require('./leaf.js'); }\nrequire('./ghost');",
    'plugin/lib/leaf.js': "require('./mid.js');",
    'plugin/lib/orphan.js': '',
    'tests/top.test.js': suite('top'),
    'tests/leaf.test.js': suite('leaf'),
    'tests/user.test.js': suite('user') + "\nrequire('./setup/a');\n",
    'tests/setup/a.js': "require('./b');",
    'tests/setup/b.js': '',
    'tests/free.test.js': suite('free'),
    'plugin/lib/lonely.js': "require('./ghost');",
    'tests/viaLib.test.js': suite('viaLib') + "\nrequire('../plugin/lib/outer');\n",
    'plugin/lib/outer.js': "require('./inner');",
    'plugin/lib/inner.js': '',
  });
  assert.deepStrictEqual(picked(root, ['plugin/lib/inner.js']), ['viaLib'], 'the walk from a suite file goes through a plugin/lib module into another');
  assert.deepStrictEqual(picked(root, ['plugin/lib/lonely.js']), discoverSuites(path.join(root, 'tests')).map((f) => path.basename(f, '.test.js')), 'a module requiring only a missing path throws nothing and stays unplaced');
  assert.deepStrictEqual(picked(root, ['plugin/lib/leaf.js']), ['leaf', 'top'], 'a module required only by a module reaches the suite of the entry point above it');
  assert.deepStrictEqual(picked(root, ['plugin/lib/mid.js']), ['leaf', 'top'], 'a require cycle ends the walk and selects each suite once');
  assert.deepStrictEqual(picked(root, ['plugin/lib/orphan.js']), discoverSuites(path.join(root, 'tests')).map((f) => path.basename(f, '.test.js')), 'a module no suite reaches stays unplaced');
  assert.deepStrictEqual(picked(root, ['plugin/lib/leaf.js', 'plugin/lib/mid.js']), ['leaf', 'top'], 'a missing require target selects nothing extra');
  assert.deepStrictEqual(picked(root, ['tests/setup/b.js']), ['user'], 'a shared setup file reaches the suite requiring it through another setup file');
});

test('A suite stem pins to `plugin/lib/<stem>.js` as it does in the hook and script directories.', () => {
  const root = tree({
    'plugin/lib/words.js': '',
    'tests/words.test.js': suite('words'),
    'tests/other.test.js': suite('other'),
  });
  assert.deepStrictEqual(picked(root, ['plugin/lib/words.js']), ['words'], 'the suite named for a plugin/lib module is selected');
});

test('A change set no suite can place runs every suite; prose and drift paths run none, an empty set runs none.', () => {
  const root = focusedTree();
  for (const rel of ['plugin/hooks/nobody.js', 'src/x.js']) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), '');
  }
  const all = discoverSuites(path.join(root, 'tests')).map((f) => path.basename(f, '.test.js'));
  assert.deepStrictEqual(picked(root, ['plugin/hooks/nobody.js']), all, 'an unplaceable code path runs every suite');
  assert.deepStrictEqual(picked(root, ['plugin/hooks/deleted.js']), [], 'a deleted code path no suite names reaches no suite');
  assert.deepStrictEqual(picked(root, ['plugin/hooks/alpha.js', 'plugin/hooks/deleted.js']), picked(root, ['plugin/hooks/alpha.js']), 'a deleted path adds nothing to the placed ones');
  assert.deepStrictEqual(picked(root, ['plugin/hooks/alpha.js', 'src/x.js']), all, 'one unplaceable path among placed ones runs every suite');
  assert.deepStrictEqual(picked(root, [['release', 'config', 'cjs'].join('.'), 'package.json', ['bun', 'lock'].join('.')]), [], 'release tooling no suite names selects no suite');
  assert.deepStrictEqual(picked(root, ['README.md', 'docs/adr/0001-x.md']), [], 'a prose-only change set selects no suite');
  assert.deepStrictEqual(picked(root, ['scripts/drift/contracts.js']), [], 'a drift path no rule places selects no suite: the drift selftest runs in the tail');
  assert.deepStrictEqual(picked(root, []), [], 'an empty list selects no suite');
  assert.deepStrictEqual(picked(root, ['plugin/hooks/deleted-gone.md']), [], 'a deleted path maps by name like any other');
});

// Its basename and stem are common path segments, so neither places it, and a drift path no rule places selects no
// suite rather than every suite.
test('A drift path is placed only by a suite that requires it, directly or through the require walk, or whose text holds its full repository-relative path.', () => {
  const root = tree({
    'scripts/drift/lib.js': '',
    'scripts/drift/scanners/lonely.js': '',
    'tests/req.test.js': suite('req') + "\nrequire('../scripts/drift/lib.js');\n",
    'tests/full.test.js': suite('full') + "\nconst f = 'scripts/drift/lib.js';\n",
    'tests/base.test.js': suite('base') + "\nconst f = 'lib.js';\n",
    'tests/seg.test.js': suite('seg') + "\nconst f = 'plugin/lib/x.js'; const g = 'drift/lib';\n",
    'tests/lib.test.js': suite('lib'),
  });
  assert.deepStrictEqual(picked(root, ['scripts/drift/lib.js']).sort(), ['full', 'req'], 'a drift path selects exactly the suites requiring it or naming its full path');
  assert.deepStrictEqual(picked(root, ['scripts/drift/scanners/lonely.js']), [], 'an unreferenced drift path selects no suite and never every suite');
});

test('The require walk continues through a drift file, so a suite reaching a drift file only through another drift file is selected.', () => {
  const root = tree({
    'scripts/drift/a.js': "require('./b.js');\n",
    'scripts/drift/b.js': '',
    'tests/via.test.js': suite('via') + "\nrequire('../scripts/drift/a.js');\n",
  });
  assert.deepStrictEqual(picked(root, ['scripts/drift/b.js']), ['via'], 'a drift file required through another drift file selects the suite');
});

test('The real repository: a drift module a suite requires reaches that suite.', () => {
  const real = (rel) => selectSuites(repoRoot, discoverSuites(path.join(repoRoot, 'tests')), [rel]).map((f) => path.basename(f, '.test.js'));
  assert.ok(real('scripts/drift/contracts.js').includes('scope-section'), 'scripts/drift/contracts.js reaches tests/scope-section.test.js, which requires it');
});

// The name counts only in a path anchored the way a named directory is: a `./` or `../` string, or a join from
// `__dirname`, a `./` or `../` literal, `path.dirname(...)`, or a variable the suite assigns one of those. A bare
// relative string or a join from any other value builds a fixture tree's path.
test('A `.md` path reaches the suites whose text names it, the way a code path does, and never the every-suite fallback.', () => {
  const J = `path${'.'}join`;
  const root = tree({
    'tests/doc.test.js': suite('doc') + "\nfs.readFileSync('../docs/x.md');\n",
    'tests/repo.test.js': suite('repo') + `\nconst repo = ${J}(__dirname, '..');\nfs.readFileSync(${J}(repo, 'docs', 'x.md'));\n`,
    'tests/fixture.test.js': suite('fixture') + `\nconst files = { 'docs/x.md': '' };\nfs.writeFileSync(${J}(tmp, 'docs', 'x.md'), '');\nfs.writeFileSync(${J}('docs', 'x.md'), '');\n`,
    'tests/plain.test.js': suite('plain'),
  });
  assert.deepStrictEqual(picked(root, ['docs/x.md']), ['doc', 'repo'], 'a suite reading the .md path runs; one writing it into a fixture tree does not');
  assert.deepStrictEqual(picked(root, ['docs/unnamed.md']), [], 'a .md path no suite names selects none');
  const real = (md) => selectSuites(repoRoot, discoverSuites(path.join(repoRoot, 'tests')), [md]).map((f) => path.basename(f, '.test.js'));
  assert.ok(real('docs/agents/knowledge-base.md').includes('publish-kb-templates'), 'publish-kb executes the knowledge-base templates');
  assert.ok(real('plugin/references/knowledge-base-confluence.md').includes('publish-kb-templates'), 'publish-kb executes the confluence template');
  assert.ok(real('plugin/references/knowledge-base-forgejo.md').includes('publish-kb-templates'), 'publish-kb executes the Forgejo wiki seed templates');
  assert.ok(real('plugin/references/scope-mode.md').includes('scope-ledger'), 'the scope suite pins a sentence of scope-mode.md');
  assert.deepStrictEqual(real(['docs', 'agents', ['verification', 'md'].join('.')].join('/')), ['scope-ci'], 'a fixture verification.md selects no suite; scope-ci reads the repository\'s own');
});

// The directory is a `./` or `../` path string, or the literal segments of a join call; a join whose leading
// directory is computed (`path.dirname(x)`) names its literal tail, which matches any directory ending in it. A bare
// relative literal names nothing, because a suite builds its fixture trees from such paths. The fixture text builds
// `path.join` through `${'.'}` so this suite's own text carries no such call.
test('A `.md` path under a directory a suite names reaches that suite: a suite that lists or scans a directory reads every document in it.', () => {
  const J = `path${'.'}join`;
  const root = tree({
    'tests/scan.test.js': suite('scan') + `\nfs.readdirSync(${J}(__dirname, '..', 'plugin', 'agents'));\n`,
    'tests/tail.test.js': suite('tail') + `\nfs.readdirSync(${J}(path.dirname(hookPath), '..', 'skills'));\n`,
    'tests/str.test.js': suite('str') + "\nfs.readdirSync('../docs/adr');\n",
    'tests/bare.test.js': suite('bare') + `\nfs.readdirSync('docs/adr');\nfs.mkdirSync(${J}('docs', 'adr'));\n`,
    'tests/plain.test.js': suite('plain'),
    'plugin/agents/a.md': '',
    'plugin/skills/s/SKILL.md': '',
    'docs/adr/0001-x.md': '',
    'docs/other/y.md': '',
  });
  assert.deepStrictEqual(picked(root, ['plugin/agents/a.md']), ['scan'], 'a join rooted at __dirname names its directory');
  assert.deepStrictEqual(picked(root, ['plugin/skills/s/SKILL.md']), ['tail'], 'a computed leading directory names its literal tail, at any depth under it');
  assert.deepStrictEqual(picked(root, ['docs/adr/0001-x.md']), ['str'], 'a ../ path string names the directory; a bare relative literal does not');
  assert.deepStrictEqual(picked(root, ['docs/other/y.md']), [], 'a document under no named directory reaches no suite');
  assert.deepStrictEqual(picked(root, ['plugin/agents/new-agent.md']), ['scan'], 'a document the directory gains later maps by its directory');
  fs.mkdirSync(path.join(root, 'plugin', 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(root, 'plugin', 'hooks', 'nobody.js'), '');
  assert.deepStrictEqual(picked(root, ['plugin/hooks/nobody.js']), discoverSuites(path.join(root, 'tests')).map((f) => path.basename(f, '.test.js')), 'a code path no rule places still runs every suite');
  const real = (md) => selectSuites(repoRoot, discoverSuites(path.join(repoRoot, 'tests')), [md]).map((f) => path.basename(f, '.test.js'));
  assert.ok(real(['plugin', 'agents', 'implementer.md'].join('/')).includes('run-trace-model'), 'run-trace-model lists the agents directory');
  assert.ok(real(['plugin', 'skills', 'plan', 'SKILL.md'].join('/')).includes('invariant-check'), 'invariant-check scans every file under plugin/');
});

test('A `path.dirname(<name>)` join, where the suite assigns `<name>` a `require.resolve` of a relative path, is anchored at that path\'s directory, so its tail matches no same-named directory elsewhere.', () => {
  const J = `path${'.'}join`;
  const R = `require${'.'}resolve`;
  const root = tree({
    'tests/pin.test.js': suite('pin') + `\nconst hookPath = ${R}('../plugin/hooks/h.js');\nfs.readdirSync(${J}(path.dirname(hookPath), '..', 'agents'));\n`,
    'plugin/hooks/h.js': '',
    'plugin/agents/a.md': '',
    'docs/agents/b.md': '',
  });
  assert.deepStrictEqual(picked(root, ['plugin/agents/a.md']), ['pin'], 'the resolved directory is named');
  assert.deepStrictEqual(picked(root, ['docs/agents/b.md']), [], 'a same-named directory elsewhere is not');
  const real = (md) => selectSuites(repoRoot, discoverSuites(path.join(repoRoot, 'tests')), [md]).map((f) => path.basename(f, '.test.js'));
  assert.ok(!real(['docs', 'agents', ['toolchain', 'md'].join('.')].join('/')).includes(['run-trace', 'model'].join('-')), 'run-trace-model lists plugin/agents, not docs/agents');
});

test('A join whose leading directory is a variable or another computed value other than `path.dirname(...)` builds a path inside a fixture tree, so it names no directory of the repository.', () => {
  const J = `path${'.'}join`;
  const root = tree({
    'tests/fx.test.js': suite('fx') + `\nfs.mkdirSync(${J}(s.tree, 'docs'));\nfs.mkdirSync(${J}(os.tmpdir(), 'docs', 'adr'));\n`,
    'tests/dn.test.js': suite('dn') + `\nfs.readdirSync(${J}(path.dirname(hookPath), '..', 'docs'));\n`,
    'docs/adr/0001-x.md': '',
  });
  assert.deepStrictEqual(picked(root, ['docs/adr/0001-x.md']), ['dn'], 'a fixture join names nothing; a path.dirname join names its tail');
  const real = (md) => selectSuites(repoRoot, discoverSuites(path.join(repoRoot, 'tests')), [md]).map((f) => path.basename(f, '.test.js'));
  const f2p = ['scope', 'fail', 'to', 'pass'].join('-');
  assert.ok(!real(['docs', 'invariants.md'].join('/')).includes(f2p), 'a fixture docs directory does not select its suite for the register');
  const toolchain = real(['docs', 'agents', ['toolchain', 'md'].join('.')].join('/'));
  assert.deepStrictEqual(toolchain, [], 'a fixture docs/agents directory selects no suite for a document under the real one');
});

// A unique basename matches bare, as before. A `.md` basename counts only where it ends a string outside a comment: a
// citation or a fixture sentence is no read.
test('A basename more than one file of the repository carries names a file only with a directory part the file\'s path ends with; a bare mention names the file at the repository root.', () => {
  const G = ['GUIDE', 'md'].join('.');
  const J = `path${'.'}join`;
  const root = tree({
    [G]: '',
    [`sub/${G}`]: '',
    [`other/deep/${G}`]: '',
    'docs/manual.md': '',
    'tests/rootcite.test.js': suite('rootcite') + `\nfs.readFileSync('../${G}');\n`,
    'tests/subcite.test.js': suite('subcite') + `\nfs.readFileSync('../sub/${G}');\n`,
    'tests/deepcite.test.js': suite('deepcite') + `\nfs.readFileSync('../other/deep/${G}');\n`,
    'tests/tailcite.test.js': suite('tailcite') + `\nfs.readFileSync(${J}(path.dirname(hookPath), 'deep', '${G}'));\n`,
    'tests/uniq.test.js': suite('uniq') + "\nfs.readFileSync('../docs/manual.md');\n",
    'tests/comment.test.js': suite('comment') + `\n// (${G}, ADR 0001) and \`docs/manual.md\`\nx(); // see sub/${G}\n`,
    'tests/prose.test.js': suite('prose') + `\nconst line = '- [ ] ${G} names the verb';\n`,
    'tests/joincite.test.js': suite('joincite') + `\nfs.readFileSync(${J}(__dirname, '..', 'other', 'deep', '${G}'));\n`,
  });
  assert.deepStrictEqual(picked(root, [G]), ['rootcite'], 'a bare mention of a shared basename names the root file');
  assert.deepStrictEqual(picked(root, [`sub/${G}`]), ['subcite'], 'a shared basename is named by its directory');
  assert.deepStrictEqual(picked(root, [`other/deep/${G}`]), ['deepcite', 'joincite', 'tailcite'], 'a relative, partial, or joined directory the path ends with names it');
  assert.deepStrictEqual(picked(root, ['docs/manual.md']), ['uniq'], 'a unique basename matches bare');
  const real = (p) => selectSuites(repoRoot, discoverSuites(path.join(repoRoot, 'tests')), [p]).map((f) => path.basename(f, '.test.js'));
  assert.ok(!real(['scripts', ['AGENTS', 'md'].join('.')].join('/')).includes('merge-guard'), 'a citation of the root AGENTS.md does not select a suite for scripts/AGENTS.md');
  assert.deepStrictEqual(real(['AGENTS', 'md'].join('.')), [], 'a comment citation or a fixture sentence naming the root AGENTS.md is no read');
  assert.deepStrictEqual(real(['release', 'config', 'cjs'].join('.')), ['release-config'], 'the semantic-release config selects only its own suite');
});

const logSet = (root) => logOf(root).split('\n').filter(Boolean).sort().join(',');

test('runAll in focused mode runs only the selected suites, then the whole tail.', async () => {
  const root = focusedTree();
  const r = await go(root, [tailEntry(root, 'tail')], ['plugin/hooks/alpha.js']);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(logSet(root), 'alpha,beta,tail');
  const md = tree({ 'tests/a.test.js': suite('a') });
  assert.strictEqual((await go(md, [tailEntry(md, 'tail')], ['README.md'])).status, 0);
  assert.strictEqual(logSet(md), 'tail', 'a prose-only change set runs the tail alone');
  const empty = tree({ 'tests/a.test.js': suite('a') });
  assert.strictEqual((await go(empty, [tailEntry(empty, 'tail')], [])).status, 0, 'an empty list exits 0');
  assert.strictEqual(logSet(empty), 'tail', 'an empty list runs the tail alone');
  const un = tree({ 'tests/a.test.js': suite('a'), 'tests/b.test.js': suite('b'), 'src/x.js': '' });
  await go(un, [tailEntry(un, 'tail')], ['src/x.js']);
  assert.strictEqual(logSet(un), 'a,b,tail', 'an unplaceable code path runs every suite');
});

// The full run and a focused run off the mod never run it.
test('A focused run whose paths reach the superdev-view mod runs the mod suite before the tail; a mod path places itself, so it does not fall back to every suite.', async () => {
  const files = { 'tests/a.test.js': suite('a'), 'tests/b.test.js': suite('b') + '// mods/superdev-view/hooks/x-fixtures.ts' };
  const runMod = async (related) => {
    const root = tree(files);
    await runAll({ root, tail: [tailEntry(root, 'tail')], modSuite: tailEntry(root, 'mod'), related, out: () => {} });
    return { log: logSet(root) };
  };
  assert.strictEqual((await runMod(['mods/superdev-view/hooks/parse.ts'])).log, 'mod,tail', 'a mod path runs the mod suite, no other suite');
  assert.strictEqual((await runMod(['mods/superdev-view/hooks/x-fixtures.ts'])).log, 'b,mod,tail', 'a suite naming a mod file still runs');
  assert.strictEqual((await runMod(['README.md'])).log, 'tail', 'a path off the mod runs no mod suite');
  assert.strictEqual((await runMod(undefined)).log, 'a,b,tail', 'the full run never runs the mod suite');
  const failing = tree(files);
  const r = await runAll({ root: failing, tail: [tailEntry(failing, 'tail')], modSuite: tailEntry(failing, 'mod', 1), related: ['mods/superdev-view/hooks/parse.ts'], out: () => {} });
  assert.notStrictEqual(r, 0, 'a failing mod suite fails the run');
});

test('The CLI reads `--related <path>...`; no flag is the full run.', () => {
  assert.strictEqual(parseArgs([]), undefined, 'no flag is the full run');
  assert.deepStrictEqual(parseArgs(['--related']), [], 'a flag with no path is an empty list');
  assert.deepStrictEqual(parseArgs(['--related', 'a.js', 'b/c.md']), ['a.js', 'b/c.md']);
  // `--help` or `-h` anywhere asks for help, ahead of any refusal.
  for (const argv of [['--help'], ['-h'], ['--related', 'a.js', '-h'], ['--relatd', '--help'], ['x', '--related', '', '-h']]) {
    assert.deepStrictEqual(parseArgs(argv), { help: true }, `${JSON.stringify(argv)} asks for help`);
  }
  // Any other argument is refused, naming the first one the runner does not accept.
  const refusals = [
    [['--relatd', 'x.js'], '--relatd'],
    [['--related=a.js'], '--related=a.js'],
    [['x', '--related', 'a.js'], 'x'],
    [['--related', 'a.js', '--related', 'b.js'], '--related'],
    [['--related', '-'], '-'],
    [['--related', 'a.js', '--'], '--'],
    [['--related', '--x'], '--x'],
    [['--related', 'a.js', ''], ''],
  ];
  for (const [argv, refused] of refusals) {
    assert.deepStrictEqual(parseArgs(argv), { refused }, `${JSON.stringify(argv)} is refused`);
  }
});

// An absolute path in any spelling, one leading outside the repository, and one naming an existing folder are refused
// with their reason; a backslash path is normalized.
test('#342 F50: `--related` takes repository-relative file paths.', () => {
  const root = tree({ 'plugin/lib/x.js': '', 'tests/a.test.js': '' });
  fs.symlinkSync(path.join(root, 'plugin'), path.join(root, 'linked'));
  const at = (paths) => parseArgs(['--related', ...paths], root);
  for (const [p, reason] of [
    ['/etc/x.js', 'absolute'],
    [path.join(root, 'plugin', 'lib', 'x.js'), 'absolute'],
    ['C:\\repo\\x.js', 'absolute'],
    ['C:/repo/x.js', 'absolute'],
    ['/c/repo/x.js', 'absolute'],
    ['\\\\host\\share\\x.js', 'absolute'],
    ['../x.js', 'outside the repository'],
    ['plugin/../../x.js', 'outside the repository'],
    ['plugin', 'a folder'],
    ['plugin/lib/', 'a folder'],
    ['.', 'a folder'],
    ['linked', 'a folder'],
  ]) {
    assert.deepStrictEqual(at([p]), { refused: p, reason }, `${p} is refused as ${reason}`);
  }
  assert.deepStrictEqual(at(['plugin\\lib\\x.js']), ['plugin/lib/x.js'], 'a backslash path is normalized to forward slashes');
  assert.deepStrictEqual(at(['plugin/lib/gone.js']), ['plugin/lib/gone.js'], 'a path that does not exist maps like a deleted file');
  assert.deepStrictEqual(at(['tests/a.test.js', '../x.js']), { refused: '../x.js', reason: 'outside the repository' }, 'one refused path refuses the whole call');
  assert.deepStrictEqual(at([]), [], 'an empty list is still the tail alone');
});

// Every step appends its name to <root>/log.
test('The CLI, driven end to end from a copy of the runner in a fixture tree (its root comes from `__dirname`), so a regression starts the fixture\'s steps, never this repository\'s suites.', () => {
  const { spawnSync } = require('node:child_process');
  const { assertSpawnDecided, boundFromSamples } = require('./spawn-verdict');
  const note = (name) => `require('node:fs').appendFileSync(require('node:path').join(__dirname, '..', 'log'), '${name}\\n');`;
  const root = tree({
    'scripts/run-tests.js': fs.readFileSync(path.join(repoRoot, 'scripts', 'run-tests.js'), 'utf8'),
    'scripts/invariant-check.js': note('invariant'),
    'scripts/drift-check.js': note('drift'),
    'tests/a.test.js': suite('a'),
    'tests/b.test.js': suite('b'),
    // The tail's `claude plugin validate`, found first on PATH.
    'bin/claude': `#!/bin/sh\necho claude >> "$(dirname "$0")/../log"\n`,
  });
  fs.chmodSync(path.join(root, 'bin', 'claude'), 0o755);
  const log = path.join(root, 'log');
  const durations = path.join(root, 'node_modules', '.cache', 'run-tests.json');
  let bound = 0;
  const cli = (args) => {
    for (const f of [log, durations]) fs.rmSync(f, { force: true });
    const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'run-tests.js'), ...args], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}` },
      ...(bound ? { timeout: bound, killSignal: 'SIGKILL' } : {}),
    });
    assertSpawnDecided(r, `run-tests ${JSON.stringify(args)}`);
    const steps = logOf(root).split('\n').filter(Boolean).sort().join(',');
    return { ...r, steps, recorded: fs.existsSync(durations) };
  };
  // The bound is taken from this run's own healthy full runs (AGENTS.md, ADR 0086).
  let full;
  bound = boundFromSamples(() => {
    full = cli([]);
  });
  assert.strictEqual(full.status, 0, full.stdout + full.stderr);
  assert.strictEqual(full.steps, 'a,b,claude,drift,drift,invariant', 'no argument starts every suite and every tail step');
  assert.strictEqual(full.recorded, true, 'the full run records durations');
  const tailOnly = cli(['--related']);
  assert.strictEqual(tailOnly.status, 0);
  assert.strictEqual(tailOnly.steps, 'claude,drift,drift,invariant', '--related with no path runs the tail alone');
  const focused = cli(['--related', 'tests/a.test.js']);
  assert.strictEqual(focused.status, 0);
  assert.strictEqual(focused.steps, 'a,claude,drift,drift,invariant', '--related with a path runs the tail and the suites it reaches');

  for (const args of [['--help'], ['-h']]) {
    const r = cli(args);
    assert.strictEqual(r.status, 0, `${JSON.stringify(args)} exits 0`);
    for (const form of ['node scripts/run-tests.js ', '--related <path>...', '-h | --help']) {
      assert.ok(r.stdout.includes(form), `${JSON.stringify(args)} prints a usage naming ${form}:\n${r.stdout}`);
    }
    assert.strictEqual(r.steps, '', `${JSON.stringify(args)} starts no step`);
    assert.strictEqual(r.recorded, false, `${JSON.stringify(args)} records no durations`);
  }
  for (const [args, named] of [
    [['--relatd', 'x.js'], '--relatd'],
    [['x', '--related', 'a.js'], 'x'],
    [['--related', 'a.js', ''], '(empty argument)'],
  ]) {
    const r = cli(args);
    assert.strictEqual(r.status, 2, `${JSON.stringify(args)} exits 2`);
    assert.strictEqual(r.stderr.split('\n')[0], `run-tests: unknown argument: ${named}`, `${JSON.stringify(args)} names the argument`);
    assert.ok(r.stderr.includes('--related <path>...'), `${JSON.stringify(args)} prints the usage on stderr`);
    assert.strictEqual(r.stdout, '', `${JSON.stringify(args)} prints nothing on stdout`);
    assert.strictEqual(r.steps, '', `${JSON.stringify(args)} starts no step`);
    assert.strictEqual(r.recorded, false, `${JSON.stringify(args)} records no durations`);
  }
  for (const [args, named, reason] of [
    [['--related', path.join(root, 'tests', 'a.test.js')], path.join(root, 'tests', 'a.test.js'), 'absolute'],
    [['--related', 'tests/a.test.js', '../x.js'], '../x.js', 'outside the repository'],
    [['--related', 'tests'], 'tests', 'a folder'],
  ]) {
    const r = cli(args);
    assert.strictEqual(r.status, 2, `${JSON.stringify(args)} exits 2`);
    assert.strictEqual(
      r.stderr.split('\n')[0],
      `run-tests: --related takes repository-relative file paths: ${named} (${reason})`,
      `${JSON.stringify(args)} names the path, the form, and the reason`,
    );
    assert.match(r.stderr, /absolute.*outside the repository.*folder/s, `${JSON.stringify(args)} prints a usage naming the refused forms`);
    assert.strictEqual(r.steps, '', `${JSON.stringify(args)} starts no step`);
    assert.strictEqual(r.recorded, false, `${JSON.stringify(args)} records no durations`);
  }
});

// The file names are joined at run time so this suite's own text does not name them, which would select this suite
// for a change to them.
test('On this repository, the acceptance cases hold.', () => {
  const suites = discoverSuites(path.join(repoRoot, 'tests'));
  const of = (paths) => selectSuites(repoRoot, suites, paths).map((f) => path.basename(f, '.test.js'));
  const guard = ['merge', 'guard'].join('-');
  assert.deepStrictEqual(of([`plugin/hooks/${guard}.js`]), [guard, 'plugin-layout', 'run-tests'],'a hook selects its suite and the suites naming it');
  const scope = of([`plugin/scripts/${'scope'}.js`]);
  const topics = ['ledger', 'ledger-header', 'publish-adopt', 'root-base', 'citations-collisions', 'suite-record', 'suite-carry', 'suite-complete', 'suite-rerun', 'suite-config', 'containment', 'dod-line', 'help', 'trace'];
  const verbTopics = ['record', 'refusals', 'dirty', 'kill', 'late-fork', 'first-moment-term', 'first-moment-kill', 'tree', 'install'];
  const f2p = ['verdict', 'signals', 'bound', 'trace', 'environment', 'interrupt', 'concurrency', 'watcher'].map((t) => ['scope', 'fail', 'to', 'pass', t].join('-'));
  const parts = [...topics.map((t) => `scope-${t}`), ...verbTopics.map((t) => ['scope', 'test', 'verb', t].join('-')), ...f2p];
  for (const s of [...parts, 'scope-prune', 'slicetree-sweep', 'run-trace', 'publish-kb']) {
    assert.ok(scope.includes(s), `scope.js selects ${s}`);
  }
  const required = of([`plugin/lib/${['run', 'supervision'].join('-')}.js`]);
  for (const s of parts) {
    assert.ok(required.includes(s), `a file scope.js requires selects ${s}`);
  }
  const all = discoverSuites(path.join(repoRoot, 'tests')).map((f) => path.basename(f, '.test.js'));
  const fixture = of(['tests/fixture-git.js']);
  assert.strictEqual(fixture.length < all.length, true, 'helper selection is a strict subset, not every suite');
  for (const s of ['publish-kb', 'run-tests', 'run-trace', ...topics.map((t) => `scope-${t}`), 'scope-prune', 'slicetree-sweep', 'spawn-verdict']) {
    assert.ok(fixture.includes(s), `fixture-git selects ${s}`);
  }
});

// Under node:test a suite that registers no case exits 0 and prints nothing, so a suite that lost its cases passes
// silently. Every suite in tests/ calls `test(`.
test('Every suite in tests/ registers a node:test case.', () => {
  const caseless = (dir) => discoverSuites(dir).filter((f) => !/\btest\(/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.basename(f));
  const root = tree({ 'tests/empty.test.js': "require('node:assert');\n", 'tests/full.test.js': "require('node:test').test('a case', () => {});\n" });
  assert.deepStrictEqual(caseless(path.join(root, 'tests')), ['empty.test.js'], 'the probe finds a suite with no case');
  assert.deepStrictEqual(caseless(path.join(repoRoot, 'tests')), [], 'every suite in tests/ calls test(');
});
