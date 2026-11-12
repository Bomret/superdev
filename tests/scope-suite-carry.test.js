'use strict';

// Suite for plugin/scripts/scope.js's `suite reusable` carry across Markdown-only commits (ADR 0128, INV-0017): a green
// record at R carries to a tip T when every path changed since R is Markdown and no run at T failed.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { scopePath, call, gitOut: g, head, commitAll, fixtureRepo } = require('./scope-setup');
const { appendTrace } = require(scopePath);

// --- suite reusable: a green record carries across Markdown-only commits (ADR 0128, INV-0017) ----
{
  const callIn = (argv, cwd) => call(argv, '', cwd);
  const traceRun = (rt, kind, result, sha, tree) => appendTrace(rt, { kind: 'run', fields: [kind, result, sha, tree] });

  const { repo, R } = fixtureRepo('carry', (dir) => {
    fs.writeFileSync(path.join(dir, '.gitignore'), '.superdev/\n');
    fs.writeFileSync(path.join(dir, 'a.js'), 'x\n');
    return { R: commitAll(dir, 'code') };
  }, 'scope-carry-');
  try {
  // Each case gets its own root: a ledger with a record at `sha`, and the given trace lines.
  let n = 0;
  const root = (record, lines) => {
    const rt = path.join(repo, '.superdev', 'scopes', `carry-${++n}`);
    fs.mkdirSync(rt, { recursive: true });
    fs.writeFileSync(
      path.join(rt, 'ledger.md'),
      `# Ledger — carry-${n}\n\n**Stage:** documented\n**Branch:** main\n**Suite:** ${record}\n**Anchor:** #1 — carry\n\n` +
        '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n',
      'utf8'
    );
    for (const l of lines) traceRun(rt, ...l);
    return rt;
  };
  const commit = (file, text) => {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), text);
    return commitAll(repo, file);
  };
  const reusable = (rt, ...flags) => callIn(['suite', 'reusable', '--branch', 'main', ...flags, '--root', rt], repo);

  // The reproduction: a green full record at R, one README.md commit to T, no run recorded at T (ADR 0189).
  const T = commit('README.md', 'doc\n');
  let r = reusable(root(`green @ ${R}`, [['full', 'pass', R, 'clean']]));
  assert.ok(r.ok && r.out === 'reusable', 'a green record carries across a Markdown-only commit with no run at T: ' + (r.err || ''));
  r = reusable(root(`green @ ${R}`, [['full', 'pass', R, 'clean'], ['focused', 'pass', T, 'clean']]));
  assert.ok(r.ok && r.out === 'reusable', 'a passing focused run at T changes nothing: ' + (r.err || ''));
  r = reusable(root(`green @ ${R}`, [['full', 'pass', R, 'clean'], ['focused', 'pass', T, 'dirty']]));
  assert.ok(r.ok && r.out === 'reusable', 'a passing run on a dirty tree refuses nothing: ' + (r.err || ''));

  // The kind carries: a `whole` record at R satisfies --whole at T; a record with no kind still fails it.
  r = reusable(root(`green @ ${R} whole`, [['whole', 'pass', R, 'clean'], ['focused', 'pass', T, 'clean']]), '--whole');
  assert.ok(r.ok, 'a whole record carries and satisfies --whole: ' + (r.err || ''));
  r = reusable(root(`green @ ${R}`, [['full', 'pass', R, 'clean'], ['focused', 'pass', T, 'clean']]), '--whole');
  assert.ok(!r.ok && /kind/.test(r.err), 'a carried record with no kind still fails --whole: ' + (r.err || ''));

  // R must be backed by its own full or whole pass on a clean tree, as on the exact tip.
  r = reusable(root(`green @ ${R}`, [['focused', 'pass', R, 'clean'], ['focused', 'pass', T, 'clean']]));
  assert.ok(!r.ok && new RegExp(`no full or whole run recorded at ${R}`).test(r.err), 'a focused run at R backs nothing: ' + (r.err || ''));
  r = reusable(root(`green @ ${R}`, [['full', 'pass', R, 'dirty'], ['focused', 'pass', T, 'clean']]));
  assert.ok(!r.ok && /dirty/.test(r.err), 'a dirty full run at R backs nothing: ' + (r.err || ''));

  // The runs at T: a failed run of any kind refuses and a later pass hides none; a latest run reading unknown refuses.
  const backed = [['full', 'pass', R, 'clean']];
  for (const [lines, re, what] of [
    [[['focused', 'fail', T, 'clean']], /focused run at the tip failed/, 'a failed focused run at T'],
    [[['focused', 'fail', T, 'clean'], ['focused', 'pass', T, 'clean']], /focused run at the tip failed/, 'a failed focused run at T hidden by a later pass'],
    [[['focused', 'pass', T, 'clean'], ['focused', 'fail', T, 'clean']], /focused run at the tip failed/, 'a later failed focused run at T'],
    [[['focused', 'unknown', T, 'clean']], /is unknown/, 'an unknown run at T'],
    [[['focused', 'fail', T, 'clean'], ['focused', 'unknown', T, 'clean']], /failed/, 'a failed run followed by an unknown one'],
    [[['focused', 'pass', T, 'clean'], ['full', 'unknown', T, 'clean']], /full run at the tip is unknown/, 'a latest full run reading unknown'],
  ]) {
    r = reusable(root(`green @ ${R}`, [...backed, ...lines]));
    assert.ok(!r.ok && /predates tip/.test(r.err) && re.test(r.err), `${what} refuses: ${r.err || ''}`);
  }

  // The path guard: every path changed since R ends in `.md`, case-sensitive; a deletion and both sides
  // of a rename count.
  const branchAt = (name, from) => g(['checkout', '-q', '-b', name, from], repo);
  const pathCase = (name, change, re, what) => {
    branchAt(name, T);
    change();
    const tip = commitAll(repo, name);
    const rt = root(`green @ ${R}`, [...backed, ['focused', 'pass', tip, 'clean']]);
    const res = callIn(['suite', 'reusable', '--branch', name, '--root', rt], repo);
    assert.ok(!res.ok && re.test(res.err), `${what} refuses: ${res.err || ''}`);
    g(['checkout', '-q', 'main'], repo);
  };
  pathCase('p-add', () => fs.writeFileSync(path.join(repo, 'b.js'), 'y\n'), /b\.js changed since and is not Markdown/, 'an added non-Markdown file');
  pathCase('p-mod', () => fs.writeFileSync(path.join(repo, 'a.js'), 'z\n'), /a\.js changed since/, 'a modified non-Markdown file');
  pathCase('p-del', () => fs.rmSync(path.join(repo, 'a.js')), /a\.js changed since/, 'a deleted non-Markdown file');
  pathCase('p-ren', () => fs.renameSync(path.join(repo, 'a.js'), path.join(repo, 'a.md')), /a\.js changed since/, 'a rename from a non-Markdown name');
  for (const ext of ['MD', 'mdx', 'markdown']) {
    pathCase(`p-${ext}`, () => fs.writeFileSync(path.join(repo, `x.${ext}`), 'y\n'), new RegExp(`x\\.${ext} changed since`), `a .${ext} file`);
  }

  // A Markdown file under a test path refuses: the defaults, and a configured `## Test paths` entry.
  pathCase('t-default', () => {
    fs.mkdirSync(path.join(repo, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'tests', 'fixture.md'), 'f\n');
  }, /tests\/fixture\.md is a test path/, 'a Markdown file under a default test path');

  // The configured `## Test paths` come from commit T, never from the working tree: the base commit
  // configures `check/`, and a working-tree copy that drops it changes nothing.
  g(['checkout', '-q', '-b', 'cfg', R], repo);
  const vRel = path.join('docs', 'agents', 'verification.md');
  const cfgR = commit(vRel, '# V\n\n## Test paths\n\n- `check/`\n');
  const cfgT = commit(path.join('check', 'case.md'), 'c\n');
  fs.writeFileSync(path.join(repo, vRel), '# V\n');
  r = callIn(['suite', 'reusable', '--branch', 'cfg', '--root', root(`green @ ${cfgR}`, [['full', 'pass', cfgR, 'clean'], ['focused', 'pass', cfgT, 'clean']])], repo);
  assert.ok(!r.ok && /check\/case\.md is a test path/.test(r.err), "a configured test path at T refuses, whatever the working tree says: " + (r.err || ''));
  g(['checkout', '-q', '--', vRel], repo);
  // From a subdirectory as well: T's verification.md is read at the tree root, never resolved against the cwd.
  r = callIn(['suite', 'reusable', '--branch', 'cfg', '--root', root(`green @ ${cfgR}`, [['full', 'pass', cfgR, 'clean'], ['focused', 'pass', cfgT, 'clean']])], path.join(repo, 'check'));
  assert.ok(!r.ok && /check\/case\.md is a test path/.test(r.err), 'a configured test path at T refuses from a subdirectory too: ' + (r.err || ''));

  // A change to the verification configuration's run configuration refuses: it can rewrite the commands and test
  // paths the carry trusts (ADR 0230).
  const cfgT2 = commit(vRel, '# V\n\n## Test paths\n\n- `nothing/`\n');
  r = callIn(['suite', 'reusable', '--branch', 'cfg', '--root', root(`green @ ${cfgT}`, [['full', 'pass', cfgT, 'clean'], ['focused', 'pass', cfgT2, 'clean']])], repo);
  assert.ok(!r.ok && /verification\.md changed its test paths/.test(r.err), 'a verification.md test-path change refuses: ' + (r.err || ''));
  g(['checkout', '-q', 'main'], repo);

  // A failed full or whole run at T is not hidden by a later focused pass.
  for (const k of ['full', 'whole']) {
    r = reusable(root(`green @ ${R}`, [...backed, [k, 'fail', T, 'clean'], ['focused', 'pass', T, 'clean']]));
    assert.ok(!r.ok && new RegExp(`a ${k} run at the tip failed`).test(r.err), `a failed ${k} run at T refuses despite a later focused pass: ${r.err || ''}`);
  }
  // A failed run of a test file named directly (`path`) at T is not hidden either.
  r = reusable(root(`green @ ${R}`, [...backed, ['path', 'fail', T, 'clean'], ['focused', 'pass', T, 'clean']]));
  assert.ok(!r.ok && /a path run at the tip failed/.test(r.err), `a failed path run at T refuses despite a later focused pass: ${r.err || ''}`);

  // The latest run at the tip, of any kind, decides: a pass after an unknown reuses; a lone unknown path run refuses.
  r = reusable(root(`green @ ${R}`, [...backed, ['focused', 'unknown', T, 'clean'], ['focused', 'pass', T, 'clean']]));
  assert.ok(r.ok && r.out === 'reusable', 'a focused pass after an unknown focused run at T reuses: ' + (r.err || ''));
  r = reusable(root(`green @ ${R}`, [...backed, ['full', 'unknown', T, 'clean'], ['focused', 'pass', T, 'clean']]));
  assert.ok(r.ok && r.out === 'reusable', 'a focused pass after an unknown full run at T reuses: ' + (r.err || ''));
  r = reusable(root(`green @ ${R}`, [...backed, ['path', 'unknown', T, 'clean']]));
  assert.ok(!r.ok && /path run at the tip is unknown/.test(r.err), 'an unknown path run at T refuses: ' + (r.err || ''));
  // A failed run at T refuses with no focused run at T at all.
  for (const k of ['whole', 'path']) {
    r = reusable(root(`green @ ${R}`, [...backed, [k, 'fail', T, 'clean']]));
    assert.ok(!r.ok && new RegExp(`a ${k} run at the tip failed`).test(r.err), `a failed ${k} run at T with no focused run refuses: ${r.err || ''}`);
  }

  // A --no-ff merge of a side branch that changed only Markdown still carries.
  branchAt('m-side', T);
  commit('side-doc.md', 'm\n');
  g(['checkout', '-q', '-b', 'm-into', T], repo);
  g(['merge', '-q', '--no-ff', '-m', 'merge', 'm-side'], repo);
  const M = head(repo);
  g(['checkout', '-q', 'main'], repo);
  r = callIn(['suite', 'reusable', '--branch', 'm-into', '--root', root(`green @ ${R}`, [...backed, ['focused', 'pass', M, 'clean']])], repo);
  assert.ok(r.ok && r.out === 'reusable', 'a --no-ff merge of a Markdown-only side branch carries: ' + (r.err || ''));

  // A git error while deciding the carry refuses. A loose object of the tip moved aside makes the git
  // call that needs it fail, while every earlier call still succeeds: the tip's root tree fails the
  // diff, its `docs` tree the ls-tree, and the verification.md blob the show.
  g(['checkout', '-q', '-b', 'gf', R], repo);
  const gfR = commit(vRel, '# V\n');
  const gfT = commit('gf.md', 'g\n');
  g(['checkout', '-q', 'main'], repo);
  for (const [spec, re, what] of [
    [`${gfT}^{tree}`, /git could not list the paths changed since/, 'an unreadable tip tree'],
    [`${gfT}:docs`, /git could not read the tip's verification configuration/, 'an unreadable docs tree at the tip'],
    [`${gfT}:${vRel}`, /git could not read the tip's verification configuration/, 'an unreadable verification.md at the tip'],
  ]) {
    const oid = g(['rev-parse', spec], repo);
    const obj = path.join(repo, '.git', 'objects', oid.slice(0, 2), oid.slice(2));
    fs.renameSync(obj, `${obj}.aside`);
    try {
      r = callIn(['suite', 'reusable', '--branch', 'gf', '--root', root(`green @ ${gfR}`, [['full', 'pass', gfR, 'clean'], ['focused', 'pass', gfT, 'clean']])], repo);
    } finally {
      fs.renameSync(`${obj}.aside`, obj);
    }
    assert.ok(!r.ok && re.test(r.err), `${what} refuses: ${r.err || ''}`);
  }

  // R not an ancestor of T: a commit on a side branch.
  branchAt('side', R);
  const S = commit('side.md', 's\n');
  g(['checkout', '-q', 'main'], repo);
  r = reusable(root(`green @ ${S}`, [['full', 'pass', S, 'clean'], ['focused', 'pass', T, 'clean']]));
  assert.ok(!r.ok && /not an ancestor/.test(r.err), 'a record off the tip line refuses: ' + (r.err || ''));
  // A recorded sha git cannot resolve refuses rather than throwing.
  const bogus = 'e'.repeat(40);
  r = reusable(root(`green @ ${bogus}`, [['full', 'pass', bogus, 'clean'], ['focused', 'pass', T, 'clean']]));
  assert.ok(!r.ok && /predates tip/.test(r.err), 'an unresolvable recorded sha refuses: ' + (r.err || ''));
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}
