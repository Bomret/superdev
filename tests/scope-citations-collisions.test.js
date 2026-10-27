'use strict';

// Suite for plugin/scripts/scope.js's `citations` and `collisions` verbs: a citation of an old number the range
// added, and a numbering collision, each found by number and never by a git conflict. Each case builds its own git
// repository, so the suite needs only the `scope.js` path and `findCollisions`.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { assertSpawnDecided } = require('./spawn-verdict');
const { scopePath } = require('./scope-setup');
const { findCollisions } = require(scopePath);

// --- citations: a citation of an old number the range added, found by number (ADR 0156, INV-0134) ---
{
  const g = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-citations-')));
  const put = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), text);
  };
  const save = (msg) => {
    g(['add', '-A'], repo);
    g(['commit', '-q', '-m', msg], repo);
  };
  g(['init', '-q', '-b', 'main'], repo);
  g(['config', 'user.email', 'test@example.com'], repo);
  g(['config', 'user.name', 'test'], repo);
  put('base.md', 'keep ADR 0131 here\nline two\n');
  put('moved.md', 'a\nINV-0012 stays\nb\n');
  put('old name.md', 'one\ntwo ADR 0131\nthree\n');
  put('gone.md', 'ADR 0131 deleted\n');
  put('bin.dat', Buffer.from([0, 1, 2, 0]));
  const fork = (save('fork'), g(['rev-parse', 'HEAD'], repo));
  g(['checkout', '-q', '-b', 'scope'], repo);
  put('base.md', 'keep ADR 0131 here\nline two\nsee ADR 0131 now\n');
  put('sub/new doc.md', 'x\nINV-0012 cited\n[a](../0131-x.md)\nINV-00134 ADR 01310 INV-0013 x\nADRs 0126 and 0131\n');
  put('moved.md', 'a\nb\nINV-0012 stays\n');
  put('q"uote\tná.md', '++ ADR 0131\n');
  g(['mv', 'old name.md', 'renamed.md'], repo);
  put('renamed.md', 'one\ntwo ADR 0131\nthree\nfour ADR 0131\n');
  fs.rmSync(path.join(repo, 'gone.md'));
  put('bin.dat', Buffer.from([0, 9, 9, 0x31, 0x33, 0x31]));
  save('scope');
  const cli = (args, cwd = repo) =>
    require('node:child_process').spawnSync(process.execPath, [scopePath, 'citations', ...args], {
      cwd,
      encoding: 'utf8',
      timeout: 30000,
    });
  const lines = (res) => res.stdout.split('\n').filter(Boolean).sort();
  const want = [
    'base.md:3 0131',
    'renamed.md:4 0131',
    'sub/new doc.md:2 INV-0012',
    'sub/new doc.md:3 0131',
    'moved.md:3 INV-0012',
    'q"uote\tná.md:1 0131',
  ].sort();
  const ids = ['0131', 'INV-0012'];
  let res = cli(['--range-base', fork, '--branch', 'scope', ...ids]);
  assertSpawnDecided(res, 'citations CLI');
  assert.equal(res.status, 1, 'citations reported → exit 1');
  assert.deepEqual(lines(res), want, 'each added citing line, by path and number; base lines, deleted lines, and longer numbers are none');
  // A short sha is a ref too; the result does not move with the git diff configuration or the cwd.
  res = cli(['--range-base', fork.slice(0, 8), '--branch', 'scope', ...ids]);
  assert.deepEqual(lines(res), want, 'a short sha resolves');
  g(['config', 'diff.relative', 'true'], repo);
  g(['config', 'diff.noprefix', 'true'], repo);
  g(['config', 'diff.external', 'false'], repo);
  g(['config', 'color.diff', 'always'], repo);
  g(['config', 'color.ui', 'always'], repo);
  res = cli(['--range-base', fork, '--branch', 'scope', ...ids], path.join(repo, 'sub'));
  assertSpawnDecided(res, 'citations CLI, configured, from a subdirectory');
  assert.equal(res.status, 1);
  assert.deepEqual(lines(res), want, 'diff.relative, diff.noprefix, diff.external, color.diff, and a subdirectory change nothing');
  // Two close citing hunks in one file and a second citing file: git joins the first two under
  // diff.interHunkContext, and a `-diff` attribute makes git print "Binary files differ".
  g(['config', 'diff.interHunkContext', '5'], repo);
  g(['checkout', '-q', '-b', 'pre', 'scope'], repo);
  put('a.md', '1\n2\n3\n4\n5\n6\n');
  put('b.md', '1\n2\n3\n');
  save('pre');
  g(['checkout', '-q', '-b', 'scope2'], repo);
  put('a.md', '1\nADR 0131\n3\n4\nADR 0131\n6\n');
  put('b.md', '1\nADR 0131\n3\n');
  save('scope2');
  const close = ['a.md:2 0131', 'a.md:5 0131', 'b.md:2 0131'];
  res = cli(['--range-base', 'pre', '--branch', 'scope2', '0131']);
  assertSpawnDecided(res, 'citations CLI, interHunkContext');
  assert.deepEqual(lines(res), close, 'diff.interHunkContext hides no citation and moves no line');
  put('.gitattributes', '*.md -diff\n');
  save('scope3');
  res = cli(['--range-base', 'pre', '--branch', 'HEAD', '0131']);
  assertSpawnDecided(res, 'citations CLI, -diff attribute');
  assert.deepEqual(lines(res), close, 'a -diff attribute hides no citation');
  // A real binary file is read as text, so a citation inside it is reported.
  g(['checkout', '-q', '-b', 'binpre', 'HEAD'], repo);
  put('b.bin', Buffer.from([0, 1, 2, 0]));
  save('binpre');
  const binBase = g(['rev-parse', 'HEAD'], repo);
  put('b.bin', Buffer.from([0, 1, 0xff, 0, ...Buffer.from('ADR 0131'), 0]));
  save('bin');
  res = cli(['--range-base', binBase, '--branch', 'HEAD', '0131']);
  assertSpawnDecided(res, 'citations CLI, binary file');
  assert.deepEqual(lines(res), ['b.bin:1 0131'], 'a citation inside a binary file is reported');
  // diff.submodule=diff prints a submodule's own changes inline; a citation added inside a submodule is no line of this repository.
  const subRepo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-citations-sub-')));
  g(['init', '-q', '-b', 'main'], subRepo);
  g(['config', 'user.email', 'test@example.com'], subRepo);
  g(['config', 'user.name', 'test'], subRepo);
  fs.writeFileSync(path.join(subRepo, 's.md'), 'one\n');
  g(['add', '-A'], subRepo);
  g(['commit', '-q', '-m', 'sub'], subRepo);
  g(['checkout', '-q', '-b', 'subpre', 'HEAD'], repo);
  g(['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', subRepo, 'vendor'], repo);
  save('subpre');
  const subBase = g(['rev-parse', 'HEAD'], repo);
  fs.writeFileSync(path.join(repo, 'vendor', 's.md'), 'one\nADR 0131 inside\n');
  g(['add', '-A'], path.join(repo, 'vendor'));
  g(['commit', '-q', '-m', 'cite'], path.join(repo, 'vendor'));
  save('subpost');
  g(['config', 'diff.submodule', 'diff'], repo);
  res = cli(['--range-base', subBase, '--branch', 'HEAD', '0131']);
  assertSpawnDecided(res, 'citations CLI, submodule');
  assert.equal(res.status, 0, 'a citation inside a submodule is not reported');
  assert.equal(res.stdout, '', 'diff.submodule=diff prints nothing the verb reports');
  // INV-0013 is a whole-number match only; one id alone reports only its own lines.
  res = cli(['--range-base', fork, '--branch', 'scope', 'INV-0013']);
  assert.equal(res.status, 1, 'INV-0013 is cited once, whole');
  assert.deepEqual(lines(res), ['sub/new doc.md:4 INV-0013']);
  res = cli(['--range-base', fork, '--branch', 'scope', 'INV-0014', '0132']);
  assert.equal(res.status, 0, 'no citation → exit 0');
  assert.equal(res.stdout, '', 'and prints nothing');
  res = cli(['--range-base', 'scope', '--branch', 'scope', ...ids]);
  assert.equal(res.status, 0, 'an empty range holds none');
  // One spawned refusal keeps the exit status 2 and the stderr line; the argv refusals run in-process in scope-refusals.test.js.
  res = cli(['--range-base', 'nope', '--branch', 'scope', '0131']);
  assertSpawnDecided(res, 'citations CLI, an unresolvable ref');
  assert.equal(res.status, 2, 'an unresolvable ref → exit 2');
  assert.equal(res.stdout, '', 'an unresolvable ref prints nothing on stdout');
  assert.notEqual(res.stderr, '', 'an unresolvable ref says why');
  assert.equal(g(['status', '--porcelain'], repo), '', 'the verb leaves the working tree clean');
  fs.rmSync(repo, { recursive: true, force: true });
  fs.rmSync(subRepo, { recursive: true, force: true });
}

// --- collisions: a numbering collision found by number, never by a git conflict (ADR 0126, INV-0134) ---
{
  const g = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-collisions-')));
  const put = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), text);
  };
  const save = (msg) => {
    g(['add', '.'], repo);
    g(['commit', '-q', '-m', msg], repo);
    return g(['rev-parse', 'HEAD'], repo);
  };
  const register = (...ids) => ids.map((id) => `### INV-${id}\n\nStatement: ${id}.\n`).join('\n');
  g(['init', '-q', '-b', 'main'], repo);
  g(['config', 'user.email', 'test@example.com'], repo);
  g(['config', 'user.name', 'test'], repo);
  put('docs/adr/0001-one.md', '# 0001\n');
  put('ctx/docs/adr/0001-c.md', '# 0001\n');
  put('docs/invariants.md', register('0001'));
  const fork = save('fork point');
  g(['checkout', '-q', '-b', 'scope'], repo);
  put('docs/adr/0002-mine.md', '# 0002\n');
  put('docs/adr/0003-mine2.md', '# 0003\n');
  put('docs/adr/0004-ok.md', '# 0004\n');
  put('docs/adr/0006-same.md', '# 0006\n');
  put('ctx/docs/adr/0003-ctx.md', '# 0003\n');
  put('docs/invariants.md', `${register('0001')}\n### INV-0002\n\nStatement: the scope's own.\n`);
  save('scope work');
  g(['checkout', '-q', 'main'], repo);
  put('docs/adr/0002-base.md', '# 0002\n');
  put('docs/adr/0003-base2.md', '# 0003\n');
  put('docs/adr/0006-same.md', '# 0006 base\n');
  put('ctx/docs/adr/0002-cb.md', '# 0002\n');
  put('docs/invariants.md', register('0001', '0002'));
  save('base work');
  g(['checkout', '-q', '-b', 'other', fork], repo);
  put('docs/adr/0007-other.md', '# 0007\n');
  save('other live run');
  g(['checkout', '-q', 'main'], repo);
  const before = g(['for-each-ref', '--format=%(refname) %(objectname)'], repo);
  const opts = { base: 'main', branch: 'scope', rangeBase: fork, also: [] };

  // A same-number ADR under a different slug collides; each takes its own next free number above
  // every number in that home on both sides; an invariant id collides the same way.
  let found = findCollisions(repo, opts);
  assert.deepEqual(
    found.map((c) => [c.kind, c.home, c.number, c.scopePath, c.basePath, c.next]),
    [
      ['adr', 'docs/adr', '0002', 'docs/adr/0002-mine.md', 'docs/adr/0002-base.md', '0007'],
      ['adr', 'docs/adr', '0003', 'docs/adr/0003-mine2.md', 'docs/adr/0003-base2.md', '0008'],
      ['inv', 'docs/invariants.md', 'INV-0002', 'docs/invariants.md', 'docs/invariants.md', 'INV-0003'],
    ],
    'two ADR collisions with distinct next numbers and one invariant collision — the same path (0006) and a number held only in another ADR directory (ctx 0003) are none'
  );
  // An --also ref (another live plan run) holding the next number pushes the assignment past it.
  found = findCollisions(repo, { ...opts, also: ['other'] });
  assert.deepEqual(found.filter((c) => c.kind === 'adr').map((c) => c.next), ['0008', '0009'], '--also pushes past 0007');
  // Already took in from base: nothing the scope added collides with itself.
  assert.deepEqual(findCollisions(repo, { ...opts, rangeBase: 'scope' }), [], 'nothing added since the range base → no collision');
  assert.equal(g(['for-each-ref', '--format=%(refname) %(objectname)'], repo), before, 'the verb moves no ref');
  assert.equal(g(['status', '--porcelain'], repo), '', 'the verb leaves the working tree clean');

  // The CLI: exit 1 with one line per collision, 0 on none, 2 on an unknown ref naming it.
  const cli = (args) =>
    require('node:child_process').spawnSync(process.execPath, [scopePath, 'collisions', ...args], {
      cwd: repo,
      encoding: 'utf8',
      timeout: 30000,
    });
  let res = cli(['--base', 'main', '--branch', 'scope', '--range-base', fork]);
  assertSpawnDecided(res, 'collisions CLI');
  assert.equal(res.status, 1, 'collisions found → exit 1');
  assert.equal(res.stdout.trim().split('\n').length, 3, 'one line per collision');
  assert.match(res.stdout, /^adr docs\/adr 0002 docs\/adr\/0002-mine\.md docs\/adr\/0002-base\.md next 0007$/m);
  res = cli(['--base', 'main', '--branch', 'scope', '--range-base', 'scope']);
  assertSpawnDecided(res, 'collisions CLI, none');
  assert.equal(res.status, 0, 'nothing collides → exit 0');
  assert.equal(res.stdout, '', 'and prints nothing');
  res = cli(['--base', 'nope', '--branch', 'scope', '--range-base', fork]);
  assertSpawnDecided(res, 'collisions CLI, unknown ref');
  assert.equal(res.status, 2, 'an unknown ref → exit 2, never read as no collision');
  assert.match(res.stderr, /nope/, 'naming the ref');
  res = cli(['--base', 'main', '--branch', 'scope']);
  assertSpawnDecided(res, 'collisions CLI, missing flag');
  assert.equal(res.status, 2, 'a missing --range-base → exit 2');
  for (const flag of ['--base', '--branch', '--range-base']) {
    res = cli(['--base', 'main', '--branch', 'scope', '--range-base', fork, flag, 'main']);
    assertSpawnDecided(res, `collisions CLI, repeated ${flag}`);
    assert.equal(res.status, 2, `a repeated ${flag} → exit 2`);
    assert.match(res.stderr, new RegExp(flag), `naming ${flag}`);
  }
  // A flag followed by another flag has no value: the usage error names the flag missing it.
  res = cli(['--base', '--branch', 'scope', '--range-base', fork]);
  assertSpawnDecided(res, 'collisions CLI, flag as a value');
  assert.equal(res.status, 2, 'a flag where a value belongs → exit 2');
  assert.match(res.stderr, /--base needs a value/, 'naming --base');

  // A repository with no ADR directory and no invariant register has nothing to compare.
  const bare = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-collisions-bare-')));
  g(['init', '-q', '-b', 'main'], bare);
  g(['config', 'user.email', 'test@example.com'], bare);
  g(['config', 'user.name', 'test'], bare);
  fs.writeFileSync(path.join(bare, 'README.md'), 'x\n');
  g(['add', '.'], bare);
  g(['commit', '-q', '-m', 'only a readme'], bare);
  assert.deepEqual(findCollisions(bare, { base: 'main', branch: 'main', rangeBase: 'main', also: [] }), [], 'no ADR directory, no register → none');
  fs.rmSync(bare, { recursive: true, force: true });
  fs.rmSync(repo, { recursive: true, force: true });

  // A fresh fork for the edge cases: `scope` and `main` each diverge from `fork` once.
  const edge = (fork, onScope, onBase) => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-collisions-edge-')));
    const write = (file, text) => {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), text);
    };
    const commit = (step) => {
      step(dir, write);
      g(['add', '-A'], dir);
      g(['commit', '-q', '--allow-empty', '-m', 'step'], dir);
      return g(['rev-parse', 'HEAD'], dir);
    };
    g(['init', '-q', '-b', 'main'], dir);
    g(['config', 'user.email', 'test@example.com'], dir);
    g(['config', 'user.name', 'test'], dir);
    const forkSha = commit(fork);
    g(['checkout', '-q', '-b', 'scope'], dir);
    commit(onScope);
    g(['checkout', '-q', 'main'], dir);
    commit(onBase);
    const got = findCollisions(dir, { base: 'main', branch: 'scope', rangeBase: forkSha, also: [] });
    fs.rmSync(dir, { recursive: true, force: true });
    return got.map((c) => [c.kind, c.number, c.scopePath, c.basePath]);
  };

  // An ADR the scope renumbers by rename is added under its new number, whatever diff.renames says.
  assert.deepEqual(
    edge(
      (d, w) => w('docs/adr/0001-x.md', '# x\n'),
      (d) => g(['mv', 'docs/adr/0001-x.md', 'docs/adr/0002-x.md'], d),
      (d, w) => w('docs/adr/0002-base.md', '# base\n')
    ),
    [['adr', '0002', 'docs/adr/0002-x.md', 'docs/adr/0002-base.md']],
    'a renamed-into number collides like an added one'
  );
  // A slug-only rename keeps its own number: the old path it left behind on base is no partner.
  assert.deepEqual(
    edge(
      (d, w) => w('docs/adr/0002-old-title.md', '# old\n'),
      (d) => g(['mv', 'docs/adr/0002-old-title.md', 'docs/adr/0002-new-title.md'], d),
      () => {}
    ),
    [],
    'a slug-only rename of an existing ADR is no collision'
  );
  // Both sides rename one ADR's slug to two different paths: two files at one number, so it collides.
  assert.deepEqual(
    edge(
      (d, w) => w('docs/adr/0002-foo.md', '# foo\n'),
      (d) => g(['mv', 'docs/adr/0002-foo.md', 'docs/adr/0002-bar.md'], d),
      (d) => g(['mv', 'docs/adr/0002-foo.md', 'docs/adr/0002-foo2.md'], d)
    ),
    [['adr', '0002', 'docs/adr/0002-bar.md', 'docs/adr/0002-foo2.md']],
    'a slug rename to two different paths on both sides of one ADR collides'
  );
  // "Same ADR" means one side kept the range base's path, never one number: the scope removing an
  // ADR at a number hides no other base ADR at that number.
  const dropFoo = (d) => g(['rm', '-q', 'docs/adr/0001-foo.md'], d);
  const foo = (d, w) => w('docs/adr/0001-foo.md', '# foo\n');
  const scopeNew = (d, w) => {
    dropFoo(d);
    w('docs/adr/0001-new.md', '# new scope decision\n');
  };
  assert.deepEqual(
    edge(foo, scopeNew, (d, w) => {
      dropFoo(d);
      w('docs/adr/0001-y.md', '# y base decision\n');
    }),
    [['adr', '0001', 'docs/adr/0001-new.md', 'docs/adr/0001-y.md']],
    'both sides delete one ADR and add a different one at its number → collision'
  );
  assert.deepEqual(
    edge(foo, scopeNew, (d) => g(['mv', 'docs/adr/0001-foo.md', 'docs/adr/0001-bar.md'], d)),
    [['adr', '0001', 'docs/adr/0001-new.md', 'docs/adr/0001-bar.md']],
    'a base slug rename of the ADR the scope deleted still collides with the scope new ADR'
  );
  assert.deepEqual(
    edge(foo, scopeNew, (d, w) => {
      g(['mv', 'docs/adr/0001-foo.md', 'docs/adr/0003-foo.md'], d);
      w('docs/adr/0001-y.md', '# y base decision\n');
    }),
    [['adr', '0001', 'docs/adr/0001-new.md', 'docs/adr/0001-y.md']],
    'a base ADR new at the number the scope vacated collides'
  );
  // Rename similarity hides no collision: three ADRs on one template pair by git's rename detection,
  // yet the scope's and base's replacements of a deleted ADR are two different ADRs at one number.
  const templated = (title) =>
    `# 0001: ${title}\n\n**Status:** Accepted\n\n## Context\n\nThe plugin needs a rule here.\nEvery caller reads it.\nIt stays stable.\n\n` +
    `## Decision\n\nAdopt the rule for ${title}.\nApply it everywhere.\n\n## Consequences\n\nCallers follow the rule.\nThe suite pins it.\n`;
  assert.deepEqual(
    edge(
      (d, w) => w('docs/adr/0001-foo.md', templated('foo')),
      (d, w) => {
        dropFoo(d);
        w('docs/adr/0001-new.md', templated('new'));
      },
      (d, w) => {
        dropFoo(d);
        w('docs/adr/0001-y.md', templated('y'));
      }
    ),
    [['adr', '0001', 'docs/adr/0001-new.md', 'docs/adr/0001-y.md']],
    'two templated replacements of one deleted ADR collide, though rename detection pairs each with it'
  );
  // The scope replacing an ADR base left untouched is no collision: after the merge only the scope's
  // file holds the number.
  assert.deepEqual(edge(foo, scopeNew, () => {}), [], 'the scope replacing an ADR base kept is no collision');
  // A non-ASCII slug reads verbatim, never as a quoted path that matches no ADR file.
  assert.deepEqual(
    edge(() => {}, (d, w) => w('docs/adr/0002-größe.md', '# ä\n'), (d, w) => w('docs/adr/0002-base.md', '# base\n')),
    [['adr', '0002', 'docs/adr/0002-größe.md', 'docs/adr/0002-base.md']],
    'a non-ASCII slug collides'
  );
  // An invariant entry the scope took in from base, read against a stale range base, is no collision.
  const inv = (id, text) => (d, w) => w('docs/invariants.md', `### INV-0001\n\nStatement: 1.\n${id ? `\n### INV-${id}\n\n${text}\n` : ''}`);
  assert.deepEqual(edge(inv(), inv('0002', 'Statement: 2.'), inv('0002', 'Statement: 2.')), [], 'an identical entry on both sides is no collision');
}
