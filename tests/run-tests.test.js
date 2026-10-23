'use strict';

// Suite for scripts/run-tests.js, the maintainer-only test runner. Every case builds a
// throwaway tree under the OS temp dir, so the runner is exercised on suites this repository does not
// carry.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { discoverSuites, runAll, selectSuites, parseArgs } = require('../scripts/run-tests');

const repoRoot = path.join(__dirname, '..');

const made = [];

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

function go(root, tail, related) {
  const lines = [];
  const status = runAll({ root, tail, related, out: (line) => lines.push(line) });
  return { status, out: lines.join('\n') };
}

// A suite added at tests/<name>.test.js is found, a helper and a fixtures directory are not.
{
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
}

// An absent or empty tests/ directory finds no suite, and the runner says so and exits nonzero.
{
  const absent = tree({});
  assert.deepStrictEqual(discoverSuites(path.join(absent, 'tests')), []);
  const r = go(absent, []);
  assert.notStrictEqual(r.status, 0, 'no suite is a failure, never a silent pass');
  assert.match(r.out, /no suite/i);
  const empty = tree({ 'tests/helper.js': '' });
  assert.notStrictEqual(go(empty, []).status, 0);
}

// Suites run in order, then the tail. Every step, suite and tail alike, prints one wall-clock line.
{
  const root = tree({ 'tests/b.test.js': suite('b'), 'tests/a.test.js': suite('a') });
  const first = go(root, [tailEntry(root, 'tail1'), tailEntry(root, 'tail2')]);
  assert.strictEqual(first.status, 0);
  assert.strictEqual(logOf(root), 'a\nb\ntail1\ntail2\n', 'suites first, then the tail, in order');
  const timed = first.out.split('\n').filter((l) => /^run-tests: .+: \d+ ms$/.test(l));
  assert.strictEqual(timed.length, 4, 'one wall-clock line per step');
  assert.match(timed[0], /^run-tests: tests\/a\.test\.js: \d+ ms$/, 'the line carries the step label');
}

// A failing step still reports its wall clock.
{
  const root = tree({ 'tests/a.test.js': suite('a', 2) });
  assert.match(go(root, []).out, /^run-tests: tests\/a\.test\.js: \d+ ms$/m);
}

// A failing suite stops the run, names itself, exits nonzero, and runs nothing after it.
{
  const root = tree({
    'tests/a.test.js': suite('a'),
    'tests/b.test.js': suite('b', 3),
    'tests/c.test.js': suite('c'),
  });
  const r = go(root, [tailEntry(root, 'tail')]);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.out, /b\.test\.js/, 'the failure names the suite');
  assert.strictEqual(logOf(root), 'a\nb\n', 'nothing runs after the failing suite, the tail included');
}

// A failing tail command stops the run, names itself, exits nonzero, and runs nothing after it.
{
  const root = tree({ 'tests/a.test.js': suite('a') });
  const r = go(root, [tailEntry(root, 'tail1', 1), tailEntry(root, 'tail2')]);
  assert.notStrictEqual(r.status, 0);
  assert.strictEqual(logOf(root), 'a\ntail1\n');
  assert.match(r.out, /tail/i);
}

// A command that never started reads as a failure, not a pass (INV-0009).
{
  const root = tree({ 'tests/a.test.js': suite('a') });
  const r = go(root, [['/nonexistent/binary-for-run-tests', []]]);
  assert.notStrictEqual(r.status, 0, 'a tail command that cannot start fails the run');
}

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

{
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
}

// A suite split off another (`<stem>-<part>.test.js`, no `<stem>-<part>.js` shipped) pins the file of its longest
// `-`-delimited prefix: a change to that file, or to a file it requires, selects every part. An exact pin wins.
{
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
}

// Requires are followed transitively, from the file a suite pins and from the suite itself, including a require made
// inside a function. A cycle ends the walk, and a require of a path that does not exist adds nothing.
{
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
}

// A suite stem pins to `plugin/lib/<stem>.js` as it does in the hook and script directories.
{
  const root = tree({
    'plugin/lib/words.js': '',
    'tests/words.test.js': suite('words'),
    'tests/other.test.js': suite('other'),
  });
  assert.deepStrictEqual(picked(root, ['plugin/lib/words.js']), ['words'], 'the suite named for a plugin/lib module is selected');
}

// A change set no suite can place runs every suite; prose and drift paths run none, an empty set runs none.
{
  const root = focusedTree();
  const all = discoverSuites(path.join(root, 'tests')).map((f) => path.basename(f, '.test.js'));
  assert.deepStrictEqual(picked(root, ['plugin/hooks/nobody.js']), all, 'an unplaceable code path runs every suite');
  assert.deepStrictEqual(picked(root, ['plugin/hooks/alpha.js', 'package.json']), all, 'one unplaceable path among placed ones runs every suite');
  assert.deepStrictEqual(picked(root, ['README.md', 'docs/adr/0001-x.md']), [], 'a prose-only change set selects no suite');
  assert.deepStrictEqual(picked(root, ['scripts/drift/contracts.js']), [], 'a drift path selects the drift selftest, which the tail runs');
  assert.deepStrictEqual(picked(root, []), [], 'an empty list selects no suite');
  assert.deepStrictEqual(picked(root, ['plugin/hooks/deleted-gone.md']), [], 'a deleted path maps by name like any other');
}

// A `.md` path reaches the suites whose text names it, the way a code path does, and never the every-suite fallback.
{
  const root = tree({
    'tests/doc.test.js': suite('doc') + "\nfs.readFileSync('docs/x.md');\n",
    'tests/plain.test.js': suite('plain'),
  });
  assert.deepStrictEqual(picked(root, ['docs/x.md']), ['doc'], 'a suite naming the .md path runs');
  assert.deepStrictEqual(picked(root, ['docs/unnamed.md']), [], 'a .md path no suite names selects none');
  const real = (md) => selectSuites(repoRoot, discoverSuites(path.join(repoRoot, 'tests')), [md]).map((f) => path.basename(f, '.test.js'));
  assert.ok(real('docs/agents/knowledge-base.md').includes('publish-kb-templates'), 'publish-kb executes the knowledge-base templates');
  assert.ok(real('plugin/references/knowledge-base-confluence.md').includes('publish-kb-templates'), 'publish-kb executes the confluence template');
  assert.ok(real('plugin/references/scope-mode.md').includes('scope-ledger'), 'the scope suite pins a sentence of scope-mode.md');
}

// A `.md` path under a directory a suite names reaches that suite: a suite that lists or scans a directory reads
// every document in it. The directory is a path string, or the literal segments of a join call; a join whose leading
// directory is computed (`path.dirname(x)`) names its literal tail, which matches any directory ending in it.
// The fixture text builds `path.join` through `${'.'}` so this suite's own text carries no such call.
{
  const J = `path${'.'}join`;
  const root = tree({
    'tests/scan.test.js': suite('scan') + `\nfs.readdirSync(${J}(__dirname, '..', 'plugin', 'agents'));\n`,
    'tests/tail.test.js': suite('tail') + `\nfs.readdirSync(${J}(path.dirname(hookPath), '..', 'skills'));\n`,
    'tests/str.test.js': suite('str') + "\nfs.readdirSync('docs/adr');\n",
    'tests/plain.test.js': suite('plain'),
    'plugin/agents/a.md': '',
    'plugin/skills/s/SKILL.md': '',
    'docs/adr/0001-x.md': '',
    'docs/other/y.md': '',
  });
  assert.deepStrictEqual(picked(root, ['plugin/agents/a.md']), ['scan'], 'a join rooted at __dirname names its directory');
  assert.deepStrictEqual(picked(root, ['plugin/skills/s/SKILL.md']), ['tail'], 'a computed leading directory names its literal tail, at any depth under it');
  assert.deepStrictEqual(picked(root, ['docs/adr/0001-x.md']), ['str'], 'a directory path string names the directory');
  assert.deepStrictEqual(picked(root, ['docs/other/y.md']), [], 'a document under no named directory reaches no suite');
  assert.deepStrictEqual(picked(root, ['plugin/agents/new-agent.md']), ['scan'], 'a document the directory gains later maps by its directory');
  assert.deepStrictEqual(picked(root, ['plugin/hooks/nobody.js']), discoverSuites(path.join(root, 'tests')).map((f) => path.basename(f, '.test.js')), 'a code path no rule places still runs every suite');
  const real = (md) => selectSuites(repoRoot, discoverSuites(path.join(repoRoot, 'tests')), [md]).map((f) => path.basename(f, '.test.js'));
  assert.ok(real(['plugin', 'agents', 'implementer.md'].join('/')).includes('model-explicit'), 'model-explicit lists the agents directory');
  assert.ok(real(['plugin', 'skills', 'plan', 'SKILL.md'].join('/')).includes('invariant-check'), 'invariant-check scans every file under plugin/');
}

// A join whose leading directory is a variable or another computed value other than `path.dirname(...)` builds a path
// inside a fixture tree, so it names no directory of the repository.
{
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
}

// A basename more than one file of the repository carries names a file only with a directory part the file's path
// ends with; a bare mention names the file at the repository root. A unique basename matches bare, as before.
{
  const G = ['GUIDE', 'md'].join('.');
  const J = `path${'.'}join`;
  const root = tree({
    [G]: '',
    [`sub/${G}`]: '',
    [`other/deep/${G}`]: '',
    'docs/manual.md': '',
    'tests/rootcite.test.js': suite('rootcite') + `\n// (${G}, ADR 0001)\n`,
    'tests/subcite.test.js': suite('subcite') + `\nfs.readFileSync('sub/${G}');\n`,
    'tests/deepcite.test.js': suite('deepcite') + `\n// see ../other/deep/${G}\n`,
    'tests/tailcite.test.js': suite('tailcite') + `\n// see deep/${G}\n`,
    'tests/uniq.test.js': suite('uniq') + "\n// manual.md\n",
    'tests/joincite.test.js': suite('joincite') + `\nfs.readFileSync(${J}(__dirname, '..', 'other', 'deep', '${G}'));\n`,
  });
  assert.deepStrictEqual(picked(root, [G]), ['rootcite'], 'a bare mention of a shared basename names the root file');
  assert.deepStrictEqual(picked(root, [`sub/${G}`]), ['subcite'], 'a shared basename is named by its directory');
  assert.deepStrictEqual(picked(root, [`other/deep/${G}`]), ['deepcite', 'joincite', 'tailcite'], 'a relative, partial, or joined directory the path ends with names it');
  assert.deepStrictEqual(picked(root, ['docs/manual.md']), ['uniq'], 'a unique basename matches bare');
  const real = (p) => selectSuites(repoRoot, discoverSuites(path.join(repoRoot, 'tests')), [p]).map((f) => path.basename(f, '.test.js'));
  assert.ok(!real(['scripts', ['AGENTS', 'md'].join('.')].join('/')).includes('merge-guard'), 'a citation of the root AGENTS.md does not select a suite for scripts/AGENTS.md');
}

// runAll in focused mode runs only the selected suites, then the whole tail.
{
  const root = focusedTree();
  const r = go(root, [tailEntry(root, 'tail')], ['plugin/hooks/alpha.js']);
  assert.strictEqual(r.status, 0);
  assert.strictEqual(logOf(root), 'alpha\nbeta\ntail\n');
  const md = tree({ 'tests/a.test.js': suite('a') });
  assert.strictEqual(go(md, [tailEntry(md, 'tail')], ['README.md']).status, 0);
  assert.strictEqual(logOf(md), 'tail\n', 'a prose-only change set runs the tail alone');
  const empty = tree({ 'tests/a.test.js': suite('a') });
  assert.strictEqual(go(empty, [tailEntry(empty, 'tail')], []).status, 0, 'an empty list exits 0');
  assert.strictEqual(logOf(empty), 'tail\n', 'an empty list runs the tail alone');
  const un = tree({ 'tests/a.test.js': suite('a'), 'tests/b.test.js': suite('b') });
  go(un, [tailEntry(un, 'tail')], ['src/x.js']);
  assert.strictEqual(logOf(un), 'a\nb\ntail\n', 'an unplaceable code path runs every suite');
}

// A focused run whose paths reach the superdev-view mod runs the mod suite before the tail; a mod path places itself, so
// it does not fall back to every suite. The full run and a focused run off the mod never run it.
{
  const files = { 'tests/a.test.js': suite('a'), 'tests/b.test.js': suite('b') + '// mods/superdev-view/hooks/x-fixtures.ts' };
  const runMod = (related) => {
    const root = tree(files);
    runAll({ root, tail: [tailEntry(root, 'tail')], modSuite: tailEntry(root, 'mod'), related, out: () => {} });
    return { log: logOf(root) };
  };
  assert.strictEqual(runMod(['mods/superdev-view/hooks/parse.ts']).log, 'mod\ntail\n', 'a mod path runs the mod suite, no other suite');
  assert.strictEqual(runMod(['mods/superdev-view/hooks/x-fixtures.ts']).log, 'b\nmod\ntail\n', 'a suite naming a mod file still runs');
  assert.strictEqual(runMod(['README.md']).log, 'tail\n', 'a path off the mod runs no mod suite');
  assert.strictEqual(runMod(undefined).log, 'a\nb\ntail\n', 'the full run never runs the mod suite');
  const failing = tree(files);
  const r = runAll({ root: failing, tail: [tailEntry(failing, 'tail')], modSuite: tailEntry(failing, 'mod', 1), related: ['mods/superdev-view/hooks/parse.ts'], out: () => {} });
  assert.strictEqual(r, 1, 'a failing mod suite fails the run');
  assert.strictEqual(logOf(failing), 'mod\n', 'a failing mod suite stops the run before the tail');
}

// The CLI reads `--related <path>...`; no flag is the full run.
{
  assert.strictEqual(parseArgs([]), undefined, 'no flag is the full run');
  assert.deepStrictEqual(parseArgs(['--related']), [], 'a flag with no path is an empty list');
  assert.deepStrictEqual(parseArgs(['--related', 'a.js', 'b/c.md']), ['a.js', 'b/c.md']);
}

// On this repository, the acceptance cases hold. The file names are joined at run time so this suite's
// own text does not name them, which would select this suite for a change to them.
{
  const suites = discoverSuites(path.join(repoRoot, 'tests'));
  const of = (paths) => selectSuites(repoRoot, suites, paths).map((f) => path.basename(f, '.test.js'));
  const lock = ['run', 'lock'].join('-');
  assert.deepStrictEqual(of([`plugin/hooks/${lock}.js`]), ['plugin-layout', lock, 'scope-ledger'], 'run-lock selects its suite and the suites naming it');
  const scope = of([`plugin/scripts/${'scope'}.js`]);
  const topics = ['ledger', 'ledger-header', 'publish-adopt', 'root-base', 'citations-collisions', 'suite', 'containment', 'dod-line', 'help', 'trace'];
  const parts = [...topics.map((t) => `scope-${t}`), ['scope', 'test', 'verb'].join('-'), ['scope', 'fail', 'to', 'pass'].join('-')];
  for (const s of [...parts, 'scope-prune', 'slicetree-sweep', 'run-trace', 'publish-kb']) {
    assert.ok(scope.includes(s), `scope.js selects ${s}`);
  }
  const required = of([`plugin/lib/${['test', 'runs'].join('-')}.js`]);
  for (const s of parts) {
    assert.ok(required.includes(s), `a file scope.js requires selects ${s}`);
    assert.ok(of([`tests/${s}.test.js`]).includes(s), `${s} selects itself`);
  }
  const all = discoverSuites(path.join(repoRoot, 'tests')).map((f) => path.basename(f, '.test.js'));
  const fixture = of(['tests/fixture-git.js']);
  assert.strictEqual(fixture.length < all.length, true, 'helper selection is a strict subset, not every suite');
  for (const s of ['publish-kb', 'run-tests', 'run-trace', ...topics.map((t) => `scope-${t}`), 'scope-prune', 'slicetree-sweep', 'spawn-verdict']) {
    assert.ok(fixture.includes(s), `fixture-git selects ${s}`);
  }
}

for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });

console.log('run-tests.test.js ok');
