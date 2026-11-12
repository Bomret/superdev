'use strict';

// Suite for plugin/scripts/scope.js's `suite rerun` and the recorded rerun `suite reusable` reads (ADR 0172, INV-0017).

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scopePath, call, gitOut: g, commitAll, fixtureRepo } = require('./scope-setup');
const { appendTrace } = require(scopePath);

// --- suite rerun and the recorded rerun (ADR 0172, INV-0017) ------------------------------------
// Under the complete-selector declaration, a full run at the tip that failed counts green once the ledger records
// a rerun of one test file for that tip, that file alone passed clean there, and a focused run passed clean there.
{
  const { encodePaths } = require('../plugin/lib/trace-log.js');
  const callIn = (argv, cwd) => call(argv, '', cwd);
  const DECLARED = '\n## Complete selector\n\nThe focused command selects every test a changed path can affect.\n';
  const cases = [];
  // A copy of a repository whose first commit holds the verification text; `T` is its tip.
  const make = (extra) => {
    const { repo, T } = fixtureRepo(JSON.stringify(['rerun', extra]), (dir) => {
      fs.writeFileSync(path.join(dir, '.gitignore'), '.superdev/\n');
      fs.mkdirSync(path.join(dir, 'docs', 'agents'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'docs', 'agents', 'verification.md'), `# V\n\n\`\`\`\nnode all.js\n\`\`\`\n\n\`\`\`\nnode focus.js {paths}\n\`\`\`\n${extra}`);
      fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'tests', 'a.test.js'), 'a\n');
      commitAll(dir, 'base');
      // The scope's range: one commit on `feat` changing src/x.js; `main` is the base branch.
      g(['checkout', '-q', '-b', 'feat'], dir);
      fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'src', 'x.js'), 'x\n');
      return { T: commitAll(dir, 'range') };
    }, 'scope-rerun-');
    cases.push(repo);
    let n = 0;
    const root = (record, lines) => {
      const rt = path.join(repo, '.superdev', 'scopes', `rr-${++n}`);
      fs.mkdirSync(rt, { recursive: true });
      fs.writeFileSync(path.join(rt, 'ledger.md'), `# Ledger — rr-${n}\n\n**Stage:** documented\n**Branch:** main\n**Suite:** ${record}\n**Anchor:** #1 — r\n\n` +
        '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n', 'utf8');
      for (const l of lines) appendTrace(rt, { kind: 'run', fields: l });
      return rt;
    };
    const rerun = (rt, file, ref, cwd) => callIn(['suite', 'rerun', file, ref, '--root', rt], cwd || repo);
    const reusable = (rt, ...flags) => callIn(['suite', 'reusable', '--branch', 'feat', '--base', 'main', ...flags, '--root', rt], repo);
    const reusableNoBase = (rt) => callIn(['suite', 'reusable', '--branch', 'feat', '--root', rt], repo);
    return { repo, T, root, rerun, reusable, reusableNoBase };
  };
  const FAILED = (T) => ['full', 'fail', T, 'clean'];
  // A path run records the directory it ran in as its eighth field (`.` at the tree root); `dir` null writes a line without it.
  const pathRun = (T, res, tree, files, dir) => ['path', res || 'pass', T, tree || 'clean', files, '1', 'node t.js', ...(dir === null ? [] : [dir || '.'])];
  const ALONE = (T, res, tree, dir) => pathRun(T, res, tree, 'tests/a.test.js', dir);
  // The writer records a name as typed, relative to the directory the run was made in: `a.test.js` from `tests`.
  const SUBRUN = (T, res, tree, name, dir) => pathRun(T, res, tree, name || 'a.test.js', dir || 'tests');
  const FOCUSED = (T, res, tree, paths) => ['focused', res || 'pass', T, tree || 'clean', encodePaths(paths || ['src/x.js'])];
  const ledgerOf = (rt) => fs.readFileSync(path.join(rt, 'ledger.md'), 'utf8');
  try {
    const f = make(DECLARED);
    const good = [FAILED(f.T), ALONE(f.T), FOCUSED(f.T)];

    // The verb records the file, the tip, and the triage record; a second record for the tip refuses.
    const rt = f.root(`red @ ${f.T}`, good);
    let r = f.reusable(rt);
    assert.ok(!r.ok && /rerun/.test(r.err), 'a failed full run with no rerun record stays red: ' + (r.err || ''));
    r = f.rerun(rt, 'tests/a.test.js', '#99');
    assert.ok(r.ok, 'suite rerun records: ' + (r.err || ''));
    assert.ok(ledgerOf(rt).includes(`**Rerun:** tests/a.test.js @ ${f.T} #99\n`), 'the ledger carries the rerun record: ' + ledgerOf(rt));
    r = f.rerun(rt, 'tests/a.test.js', '#100');
    assert.ok(!r.ok && /already/.test(r.err), 'a tip that carries a rerun record refuses a second: ' + (r.err || ''));
    assert.ok(ledgerOf(rt).includes('#99') && !ledgerOf(rt).includes('#100'), 'the refused record leaves the ledger as it was');
    r = f.reusable(rt);
    assert.ok(r.ok && r.out === 'reusable', 'one failed full run counts green on the recorded rerun: ' + (r.err || ''));
    assert.ok(f.reusable(rt, '--whole').ok === false, 'a failed full-kind run never serves a whole-repo gate');

    // The verb refuses empty or spaced arguments and a file the tip does not hold.
    const rv = f.root(`red @ ${f.T}`, good);
    assert.ok(!f.rerun(rv, 'tests/missing.test.js', '#1').ok, 'a file the tip does not hold refuses');
    assert.ok(!f.rerun(rv, 'tests/a.test.js', 'two words').ok, 'a triage record with a space refuses');
    assert.ok(!ledgerOf(rv).includes('**Rerun:**'), 'a refused verb writes no record');

    // Every shortfall stays red.
    const red = (lines, why, tweak) => {
      const x = f.root(`red @ ${f.T}`, lines);
      assert.ok(f.rerun(x, 'tests/a.test.js', '#99').ok);
      if (tweak) tweak(x);
      const res = f.reusable(x);
      assert.ok(!res.ok, `${why} stays red`);
    };
    red([FAILED(f.T), FOCUSED(f.T)], 'no passing rerun of the file');
    red([FAILED(f.T), ALONE(f.T, 'fail'), FOCUSED(f.T)], 'a failing rerun');
    red([FAILED(f.T), ALONE(f.T, 'pass', 'dirty'), FOCUSED(f.T)], 'a dirty rerun');
    red([FAILED(f.T), ALONE(f.T, 'fail'), ALONE(f.T), FOCUSED(f.T)], 'a rerun that failed before it passed');
    red([FAILED(f.T), ALONE(f.T)], 'no focused run');
    red([FAILED(f.T), ALONE(f.T), FOCUSED(f.T, 'fail')], 'a failing focused run');
    red([FAILED(f.T), ALONE(f.T), FOCUSED(f.T, 'pass', 'dirty')], 'a dirty focused run');
    red([FAILED(f.T), FAILED(f.T), ALONE(f.T), FOCUSED(f.T)], 'two failed full runs at the tip');
    red([ALONE(f.T), FOCUSED(f.T)], 'no failed full run in the trace');
    // The file then passed: a solo or focused pass recorded before the failed full run counts for nothing.
    red([ALONE(f.T), FAILED(f.T), FOCUSED(f.T)], 'a solo pass recorded before the failed full run');
    red([FOCUSED(f.T), FAILED(f.T), ALONE(f.T)], 'a focused pass recorded before the failed full run');
    // A run of the file recorded before the failed full run, such as a dirty RED run, never turns the rerun red.
    const early = f.root(`red @ ${f.T}`, [ALONE(f.T, 'fail', 'dirty'), FAILED(f.T), ALONE(f.T), FOCUSED(f.T)]);
    assert.ok(f.rerun(early, 'tests/a.test.js', '#99').ok);
    r = f.reusable(early);
    assert.ok(r.ok && r.out === 'reusable', 'a dirty run of the file before the failed full run counts for nothing: ' + (r.err || ''));
    // A failed run of another test file at the tip is never hidden by the rerun.
    red([FAILED(f.T), ['path', 'fail', f.T, 'clean', 'tests/b.test.js'], ALONE(f.T), FOCUSED(f.T)], 'a failed path run of another file at the tip');
    red([FAILED(f.T), ['path', 'pass', f.T, 'clean', 'tests/b.test.js'], FOCUSED(f.T)], 'a rerun of another file');
    red([FAILED(f.T), ALONE(f.T), ['focused', 'pass', f.T, 'clean', '-']], 'a focused run over no path');
    // The focused run must cover every path the scope's range changed (src/x.js).
    red([FAILED(f.T), ALONE(f.T), FOCUSED(f.T, 'pass', 'clean', ['src/y.js'])], 'a focused run missing a path the range changed');
    red([FAILED(f.T), ALONE(f.T), FOCUSED(f.T, 'pass', 'clean', ['./src'])], 'a focused run naming only the directory');
    // Without --base the range cannot be judged.
    const nb = f.root(`red @ ${f.T}`, good);
    assert.ok(f.rerun(nb, 'tests/a.test.js', '#99').ok);
    r = f.reusableNoBase(nb);
    assert.ok(!r.ok && /--base/.test(r.err), 'a rerun with no --base refuses and names the flag: ' + (r.err || ''));
    // --base never changes a green record's reuse.
    const gr = f.root(`green @ ${f.T}`, [['full', 'pass', f.T, 'clean']]);
    assert.ok(f.reusableNoBase(gr).ok, 'a green record at the tip is reusable without --base');
    // A multi-file path run is no run of the file alone.
    red([FAILED(f.T), pathRun(f.T, 'pass', 'clean', 'tests/a.test.js,tests/b.test.js'), FOCUSED(f.T)], 'a multi-file run holding the rerun file');
    // The rerun file's passing run counts only where it ran at the tree root.
    red([FAILED(f.T), SUBRUN(f.T, 'pass', 'clean'), FOCUSED(f.T)], 'a passing run made from a subdirectory');
    red([FAILED(f.T), ALONE(f.T, 'pass', 'clean', '..'), FOCUSED(f.T)], 'a passing run made outside the tree');
    red([FAILED(f.T), ALONE(f.T, 'pass', 'clean', null), FOCUSED(f.T)], 'a passing run written without the directory field');
    const subRun = f.root(`red @ ${f.T}`, [FAILED(f.T), SUBRUN(f.T, 'pass', 'clean'), FOCUSED(f.T)]);
    assert.ok(f.rerun(subRun, 'tests/a.test.js', '#99').ok);
    r = f.reusable(subRun);
    assert.ok(!r.ok && /no run of tests\/a\.test\.js alone recorded/.test(r.err), 'a subdirectory run refuses with the rerun reason: ' + (r.err || ''));
    // A failing run of another file from a subdirectory still counts against the rerun.
    red([FAILED(f.T), SUBRUN(f.T, 'fail', 'clean', 'b.test.js'), ALONE(f.T), FOCUSED(f.T)], 'a failed path run of another file from a subdirectory');
    // A failing run of the rerun file recorded after the failed full run refuses with the rerun's own reason from any
    // directory, even where a root run passed after it.
    const both = f.root(`red @ ${f.T}`, [FAILED(f.T), SUBRUN(f.T, 'fail', 'clean'), ALONE(f.T), FOCUSED(f.T)]);
    assert.ok(f.rerun(both, 'tests/a.test.js', '#99').ok);
    r = f.reusable(both);
    assert.ok(!r.ok && /failed or ran on a dirty tree/.test(r.err) && !/another test file/.test(r.err), 'an after-failure subdirectory failing run of the rerun file refuses with the rerun reason: ' + (r.err || ''));
    // The same file reached as `../tests/a.test.js` from a sibling directory is the rerun file too.
    const sib = f.root(`red @ ${f.T}`, [FAILED(f.T), SUBRUN(f.T, 'fail', 'clean', '../tests/a.test.js', 'src'), ALONE(f.T), FOCUSED(f.T)]);
    assert.ok(f.rerun(sib, 'tests/a.test.js', '#99').ok);
    r = f.reusable(sib);
    assert.ok(!r.ok && /failed or ran on a dirty tree/.test(r.err) && !/another test file/.test(r.err), 'a sibling-directory failing run of the rerun file refuses with the rerun reason: ' + (r.err || ''));
    // The directory field is stored trace-encoded (a space as `\x20`): a directory whose name holds a space resolves as typed.
    const spaced = f.root(`red @ ${f.T}`, [FAILED(f.T), SUBRUN(f.T, 'fail', 'clean', '../tests/a.test.js', 'my dir'), ALONE(f.T), FOCUSED(f.T)]);
    assert.ok(f.rerun(spaced, 'tests/a.test.js', '#99').ok);
    r = f.reusable(spaced);
    assert.ok(!r.ok && /failed or ran on a dirty tree/.test(r.err) && !/another test file/.test(r.err), 'a failing run of the rerun file from a directory holding a space refuses with the rerun reason: ' + (r.err || ''));
    // A directory field outside the tree (`..`, or absolute elsewhere) puts the run outside the tree: its failing run is a run
    // of another file, never of the rerun file, whatever name it carries.
    for (const outside of ['..', path.join(path.dirname(fs.realpathSync(os.tmpdir())), 'elsewhere')]) {
      const out = f.root(`red @ ${f.T}`, [FAILED(f.T), SUBRUN(f.T, 'fail', 'clean', 'tests/a.test.js', outside), ALONE(f.T), FOCUSED(f.T)]);
      assert.ok(f.rerun(out, 'tests/a.test.js', '#99').ok);
      r = f.reusable(out);
      assert.ok(!r.ok && /another test file/.test(r.err), `a failing run made in ${outside} refuses as another file: ` + (r.err || ''));
    }
    // Before the failed full run, a failing run of the rerun file from a subdirectory, or written without the field, counts for nothing.
    for (const early of [SUBRUN(f.T, 'fail', 'clean'), SUBRUN(f.T, 'fail', 'clean', '../tests/a.test.js', 'src'), ALONE(f.T, 'fail', 'clean', null)]) {
      const dir = early[7] === undefined ? 'none' : early[7];
      const pre = f.root(`red @ ${f.T}`, [early, FAILED(f.T), ALONE(f.T), FOCUSED(f.T)]);
      assert.ok(f.rerun(pre, 'tests/a.test.js', '#99').ok);
      r = f.reusable(pre);
      assert.ok(r.ok && r.out === 'reusable', `a failing run of the file before the failed full run (dir ${dir}) counts for nothing: ` + (r.err || ''));
    }
    // A path run records its file `encodePaths`-encoded: a name holding `%` matches its own rerun.
    const pc = make(DECLARED);
    fs.writeFileSync(path.join(pc.repo, 'tests', '100%.test.js'), 'a\n');
    const PT = commitAll(pc.repo, 'pct');
    const pct = pc.root(`red @ ${PT}`, [FAILED(PT), pathRun(PT, 'pass', 'clean', encodePaths(['tests/100%.test.js'])), FOCUSED(PT, 'pass', 'clean', ['src/x.js', 'tests/100%.test.js'])]);
    assert.ok(pc.rerun(pct, 'tests/100%.test.js', '#1').ok, 'a file name holding % records');
    r = pc.reusable(pct);
    assert.ok(r.ok && r.out === 'reusable', 'a path run of a file name holding % is the rerun of that file alone: ' + (r.err || ''));
    // The test file is a blob at the tip, named root-relative however it is typed.
    const dv = f.root(`red @ ${f.T}`, good);
    assert.ok(!f.rerun(dv, 'tests', '#1').ok, 'a directory is no test file');
    assert.ok(!ledgerOf(dv).includes('**Rerun:**'), 'a refused directory writes no record');
    const dotted = f.root(`red @ ${f.T}`, good);
    assert.ok(f.rerun(dotted, './tests/a.test.js', '#1').ok, './ path records');
    assert.ok(ledgerOf(dotted).includes(`**Rerun:** tests/a.test.js @ ${f.T} #1\n`), 'a ./ path records root-relative: ' + ledgerOf(dotted));
    const sub = f.root(`red @ ${f.T}`, good);
    assert.ok(f.rerun(sub, 'a.test.js', '#1', path.join(f.repo, 'tests')).ok, 'a subdirectory-relative path records');
    assert.ok(ledgerOf(sub).includes(`**Rerun:** tests/a.test.js @ ${f.T} #1\n`), 'a subdirectory-relative path records root-relative: ' + ledgerOf(sub));
    assert.ok(f.reusable(sub).ok, 'the root-relative record matches the trace');

    // A rerun record for another tip does not count.
    const other = f.root(`red @ ${f.T}`, good);
    fs.writeFileSync(path.join(other, 'ledger.md'), ledgerOf(other).replace(`**Suite:**`, `**Rerun:** tests/a.test.js @ ${'d'.repeat(40)} #99\n**Suite:**`));
    assert.ok(!f.reusable(other).ok, 'a rerun record for another tip stays red');
    // A tip that moved past the failed run through a non-Markdown commit stays red.
    const moved = f.root(`red @ ${f.T}`, good);
    assert.ok(f.rerun(moved, 'tests/a.test.js', '#99').ok);
    fs.writeFileSync(path.join(f.repo, 'later.js'), 'x\n');
    g(['add', '-A'], f.repo);
    g(['commit', '-q', '-m', 'later'], f.repo);
    assert.ok(!f.reusable(moved).ok, 'a rerun recorded for an earlier tip stays red at a later tip past a non-Markdown commit');

    // Without the declaration the rerun never counts.
    const nd = make('');
    const ndRt = nd.root(`red @ ${nd.T}`, [FAILED(nd.T), ALONE(nd.T), FOCUSED(nd.T)]);
    assert.ok(nd.rerun(ndRt, 'tests/a.test.js', '#99').ok);
    r = nd.reusable(ndRt);
    assert.ok(!r.ok && /Complete selector|declar/.test(r.err), 'no declaration stays red: ' + (r.err || ''));

    // A Markdown-only commit after the failed run (ADR 0189): the rerun holds at the record's commit, and every path
    // changed since passes the Markdown-only rule judged at the tip.
    const dp = make(DECLARED);
    const dpOk = dp.root(`red @ ${dp.T}`, [FAILED(dp.T), ALONE(dp.T), FOCUSED(dp.T)]);
    const dpFail = dp.root(`red @ ${dp.T}`, [FAILED(dp.T), ALONE(dp.T), FOCUSED(dp.T)]);
    assert.ok(dp.rerun(dpOk, 'tests/a.test.js', '#99').ok && dp.rerun(dpFail, 'tests/a.test.js', '#99').ok);
    const dpCommit = (file) => {
      fs.writeFileSync(path.join(dp.repo, file), 'doc\n');
      return commitAll(dp.repo, file);
    };
    const DT = dpCommit('README.md');
    r = dp.reusable(dpOk);
    assert.ok(r.ok && r.out === 'reusable', 'a Markdown-only commit after a passing rerun reuses: ' + (r.err || ''));
    appendTrace(dpFail, { kind: 'run', fields: ['full', 'fail', DT, 'clean'] });
    r = dp.reusable(dpFail);
    assert.ok(!r.ok && /full run at the tip failed/.test(r.err), 'a failed run at the Markdown-only tip stays red: ' + (r.err || ''));
    dpCommit('later.js');
    r = dp.reusable(dpOk);
    assert.ok(!r.ok && /later\.js changed since and is not Markdown/.test(r.err), 'a non-Markdown commit after the failed run stays red: ' + (r.err || ''));
    // A failed run's commit off the tip's history stays red, whatever changed since.
    const offRt = dp.root(`red @ ${DT}`, [FAILED(DT), ALONE(DT), FOCUSED(DT)]);
    fs.writeFileSync(path.join(offRt, 'ledger.md'), ledgerOf(offRt).replace('**Suite:**', `**Rerun:** tests/a.test.js @ ${DT} #99\n**Suite:**`));
    g(['reset', '-q', '--hard', dp.T], dp.repo);
    dpCommit('OTHER.md');
    r = dp.reusable(offRt);
    assert.ok(!r.ok && /neither at the tip nor an ancestor/.test(r.err), 'a failed run off the tip\'s history stays red: ' + (r.err || ''));

    // A prose-only verification.md commit after the failed run keeps the rerun (ADR 0230); a run-configuration change refuses.
    const vp = make(DECLARED);
    const vpRt = vp.root(`red @ ${vp.T}`, [FAILED(vp.T), ALONE(vp.T), FOCUSED(vp.T)]);
    assert.ok(vp.rerun(vpRt, 'tests/a.test.js', '#99').ok);
    const vFile = path.join(vp.repo, 'docs', 'agents', 'verification.md');
    const vpCommit = (text) => {
      fs.writeFileSync(vFile, text);
      g(['add', '-A'], vp.repo);
      g(['commit', '-q', '-m', 'v'], vp.repo);
    };
    vpCommit(fs.readFileSync(vFile, 'utf8').replace('# V\n', '# V\n\nProse.\n'));
    r = vp.reusable(vpRt);
    assert.ok(r.ok && r.out === 'reusable', 'a prose-only verification.md commit after a passing rerun reuses: ' + (r.err || ''));
    vpCommit(fs.readFileSync(vFile, 'utf8').replace('node all.js', 'node all.js --bail'));
    r = vp.reusable(vpRt);
    assert.ok(!r.ok && /changed its full command/.test(r.err), 'a run-configuration change after the failed run stays red: ' + (r.err || ''));
  } finally {
    cases.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
  }
}
