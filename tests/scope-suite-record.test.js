'use strict';

// Suite for plugin/scripts/scope.js's suite record: `suite set`, `get suite`, and `suite reusable` on one repository (the last
// full-suite run's result and the commit it ran on, `references/run-state.md` `## The ledger`, INV-0017), and `isTestPath`,
// the one test-path classifier. The Markdown-only carry, the complete-selector carry, the rerun, and the run configuration are
// the other `tests/scope-suite-*.test.js` suites.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { scopePath, run } = require('./scope-setup');
const { appendTrace, isTestPath } = require(scopePath);

// --- suite: the suite record, the last full-suite run's result and the commit it ran on
// (`references/run-state.md` `## The ledger`, INV-0017) ---------------------------------------
{
  function gitSuite(args, cwd) {
    execFileSync('git', args, { cwd, stdio: 'ignore' });
  }
  const callIn = (argv, cwd, stdinJson) => {
    const logged = [];
    const orig = console.log;
    console.log = (s) => logged.push(String(s));
    try {
      run(argv, cwd, stdinJson || '');
      return { ok: true, out: logged.join('\n') };
    } catch (e) {
      if (e.isRefusal) return { ok: false, err: e.message, out: logged.join('\n') };
      throw e;
    } finally {
      console.log = orig;
    }
  };

  const suiteRepo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'scope-suite-')));
  gitSuite(['init', '-q', '-b', 'main'], suiteRepo);
  gitSuite(['config', 'user.email', 'test@example.com'], suiteRepo);
  gitSuite(['config', 'user.name', 'test'], suiteRepo);
  fs.writeFileSync(path.join(suiteRepo, 'README.md'), 'x\n');
  gitSuite(['add', '.'], suiteRepo);
  gitSuite(['commit', '-q', '-m', 'init'], suiteRepo);
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: suiteRepo, encoding: 'utf8' }).trim();

  const suiteSliceJson = JSON.stringify({
    anchor: '#1 — suite record',
    slices: [{ id: '01', issue: '#2', title: 'x', type: 'behavior', 'depends-on': '—' }],
  });
  assert.ok(
    callIn(['init', 'feat/suite-demo', 'planned'], suiteRepo, suiteSliceJson).ok,
    'init for the suite fixture'
  );
  const suiteRoot = path.join(suiteRepo, '.superdev', 'scopes', 'suite-demo');
  const SR = ['--root', suiteRoot];

  // suite set: writes the header line, and get suite prints it back.
  assert.ok(callIn(['suite', 'set', 'green', sha, ...SR], suiteRepo).ok, 'suite set green');
  const suiteText = fs.readFileSync(path.join(suiteRoot, 'ledger.md'), 'utf8');
  assert.ok(new RegExp(`\\*\\*Suite:\\*\\* green @ ${sha}`).test(suiteText), 'ledger carries the Suite line');
  assert.strictEqual(callIn(['get', 'suite', ...SR], suiteRepo).out, `green ${sha}`, 'get suite prints result and sha');

  // suite set: a second write overwrites rather than adding a second line.
  assert.ok(callIn(['suite', 'set', 'red', sha, ...SR], suiteRepo).ok, 'suite set red');
  const suiteTwice = fs.readFileSync(path.join(suiteRoot, 'ledger.md'), 'utf8');
  assert.strictEqual((suiteTwice.match(/\*\*Suite:\*\*/g) || []).length, 1, 'one Suite line, not two');
  assert.strictEqual(callIn(['get', 'suite', ...SR], suiteRepo).out, `red ${sha}`, 'the second write wins');

  // suite set: an unknown result is refused, and writes nothing.
  const beforeUnknownResult = fs.readFileSync(path.join(suiteRoot, 'ledger.md'), 'utf8');
  let r = callIn(['suite', 'set', 'yellow', sha, ...SR], suiteRepo);
  assert.ok(!r.ok && /unknown suite result "yellow"/.test(r.err), 'unknown suite result refused: ' + (r.err || ''));
  assert.strictEqual(
    fs.readFileSync(path.join(suiteRoot, 'ledger.md'), 'utf8'),
    beforeUnknownResult,
    'nothing written on an unknown-result refusal'
  );

  // suite set: a sha that resolves to no commit in this repository is refused, and writes nothing.
  r = callIn(['suite', 'set', 'green', 'not-a-real-sha', ...SR], suiteRepo);
  assert.ok(
    !r.ok && /does not resolve to a commit/.test(r.err),
    'a sha that does not resolve is refused: ' + (r.err || '')
  );
  assert.strictEqual(
    fs.readFileSync(path.join(suiteRoot, 'ledger.md'), 'utf8'),
    beforeUnknownResult,
    'nothing written on an unresolved-sha refusal'
  );

  // get suite: on a ledger with no record, prints nothing and exits zero.
  const noSuiteRoot = path.join(suiteRepo, '.superdev', 'scopes', 'suite-demo-none');
  fs.mkdirSync(noSuiteRoot, { recursive: true });
  fs.writeFileSync(
    path.join(noSuiteRoot, 'ledger.md'),
    '# Ledger — suite-demo-none\n\n**Stage:** implementing\n\n' +
      '| id | issue | title | type | depends-on | status | range |\n|---|---|---|---|---|---|---|\n',
    'utf8'
  );
  const noSuite = callIn(['get', 'suite', '--root', noSuiteRoot], suiteRepo);
  assert.ok(noSuite.ok && noSuite.out === '', 'get suite on a ledger with no record prints nothing and exits zero');

  // A ledger carrying the Suite line still parses for every existing verb.
  assert.strictEqual(callIn(['get', 'stage', ...SR], suiteRepo).out, 'planned', 'get stage still parses');
  assert.ok(callIn(['slice', '01', 'merged', ...SR], suiteRepo).ok, 'slice still parses');
  assert.ok(callIn(['publish', ...SR], suiteRepo).out.includes('**Suite:** red'), 'publish still parses, and carries the Suite line');
  const publishedSuite = callIn(['publish', ...SR], suiteRepo).out;
  // adopt matches its run-root basename against the payload's branch slug (ADR 0042), which is
  // still "suite-demo" — parked outside .superdev/scopes/ so it never collides with suiteRoot above.
  const adoptRoot = path.join(suiteRepo, 'adopt-check', 'suite-demo');
  const adopted = callIn(
    ['adopt', '--root', adoptRoot],
    suiteRepo,
    `# Anchor\n\n${publishedSuite}\n`
  );
  assert.ok(adopted.ok, 'adopt still parses a Suite-bearing snapshot: ' + (adopted.err || ''));
  assert.strictEqual(
    callIn(['get', 'suite', '--root', adoptRoot], suiteRepo).out,
    'red ' + sha,
    'adopt reconstructs the Suite line'
  );

  // suite set: a ref like HEAD records the resolved full commit, not the literal ref — a later
  // reuse compares the recorded sha against the scope branch's tip sha (INV-0017), and "HEAD"
  // never string-matches a real tip sha.
  assert.ok(callIn(['suite', 'set', 'green', 'HEAD', ...SR], suiteRepo).ok, 'suite set green HEAD');
  assert.strictEqual(
    callIn(['get', 'suite', ...SR], suiteRepo).out,
    `green ${sha}`,
    'HEAD resolves to the full commit, not the literal ref'
  );

  // suite set: a short sha also records the full commit.
  const shortSha = sha.slice(0, 8);
  assert.ok(callIn(['suite', 'set', 'green', shortSha, ...SR], suiteRepo).ok, 'suite set green <short sha>');
  assert.strictEqual(
    callIn(['get', 'suite', ...SR], suiteRepo).out,
    `green ${sha}`,
    'a short sha resolves to the full commit'
  );

  // suite set: a record made against the current tip no longer matches once the branch moves on —
  // the recorded sha stays put, the new HEAD is what changed.
  fs.writeFileSync(path.join(suiteRepo, 'README.md'), 'x\ny\n');
  gitSuite(['add', '.'], suiteRepo);
  gitSuite(['commit', '-q', '-m', 'second'], suiteRepo);
  const newSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: suiteRepo, encoding: 'utf8' }).trim();
  assert.notStrictEqual(
    callIn(['get', 'suite', ...SR], suiteRepo).out,
    `green ${newSha}`,
    'the recorded sha no longer equals the new HEAD'
  );

  // suite set: no <sha> argument is refused, and writes nothing.
  const beforeNoSha = fs.readFileSync(path.join(suiteRoot, 'ledger.md'), 'utf8');
  r = callIn(['suite', 'set', 'green', ...SR], suiteRepo);
  assert.ok(!r.ok && /needs a <sha>/.test(r.err), 'suite set with no sha is refused: ' + (r.err || ''));
  assert.strictEqual(
    fs.readFileSync(path.join(suiteRoot, 'ledger.md'), 'utf8'),
    beforeNoSha,
    'nothing written on a missing-sha refusal'
  );

  // The run trace backs reuse (ADR 0117, INV-0017): `traceRun` records one run line for a root.
  const traceRun = (rt, kind, result, sha, tree) =>
    appendTrace(rt, { kind: 'run', fields: [kind, result, sha, tree] });

  // suite reusable: a green record on the exact tip is reusable (path-scoped reuse, INV-0017).
  assert.ok(callIn(['suite', 'set', 'green', newSha, ...SR], suiteRepo).ok, 'suite set green newSha');
  // No trace file: not reusable, so the caller runs the suite again.
  r = callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo);
  assert.ok(!r.ok && /no full or whole run recorded/.test(r.err), 'a green record with no trace is not reusable: ' + (r.err || ''));
  traceRun(suiteRoot, 'full', 'pass', 'f'.repeat(40), 'clean');
  r = callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo);
  assert.ok(!r.ok && /no full or whole run recorded/.test(r.err), 'a run line at another sha does not back reuse: ' + (r.err || ''));
  traceRun(suiteRoot, 'full', 'pass', newSha, 'dirty');
  r = callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo);
  assert.ok(!r.ok && /dirty/.test(r.err), 'a dirty tree is not reusable: ' + (r.err || ''));
  traceRun(suiteRoot, 'full', 'pass', newSha, 'unknown');
  assert.ok(!callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo).ok, 'an unknown tree is not reusable');
  traceRun(suiteRoot, 'full', 'unknown', newSha, 'clean');
  assert.ok(!callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo).ok, 'an unknown result is not reusable');
  traceRun(suiteRoot, 'full', 'pass', newSha, 'clean');
  assert.ok(
    callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo).ok,
    'a green record on the exact tip is reusable'
  );

  // suite reusable: `--branch` also takes a literal sha, not only a branch name — `/superdev:ship`'s
  // own hand-merge adoption passes the merged pull request's `head.sha` this way. A sha resolves to
  // itself and answers by the recorded sha exactly like a branch name resolving to the same tip.
  assert.ok(
    callIn(['suite', 'reusable', '--branch', newSha, ...SR], suiteRepo).ok,
    'a green record is reusable against its own sha passed literally, not only a branch name'
  );
  traceRun(suiteRoot, 'full', 'fail', newSha, 'clean');
  r = callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo);
  assert.ok(!r.ok && /is fail/.test(r.err), 'a later fail run defeats reuse: ' + (r.err || ''));
  traceRun(suiteRoot, 'full', 'pass', newSha, 'clean');

  // suite reusable: a green record on an earlier commit carries to a tip with no recorded run when every path
  // changed since is Markdown, here under `docs/plans/<branch>/` (INV-0017, ADR 0110, ADR 0128, ADR 0189).
  const planDir = path.join('docs', 'plans', 'feat', 'suite-demo');
  fs.mkdirSync(path.join(suiteRepo, planDir), { recursive: true });
  fs.writeFileSync(path.join(suiteRepo, planDir, '01-tick.md'), 'ticked\n');
  gitSuite(['add', '.'], suiteRepo);
  gitSuite(['commit', '-q', '-m', 'tick'], suiteRepo);
  r = callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo);
  assert.ok(
    r.ok && r.out === 'reusable',
    'a record on an earlier commit carries across a Markdown-only commit with no run at the tip: ' + (r.err || '')
  );

  // suite reusable: `--plan-files` is not a flag, so it is refused like any unrecognized
  // argument, naming it.
  r = callIn(['suite', 'reusable', '--branch', 'main', '--plan-files', ...SR], suiteRepo);
  assert.ok(!r.ok && /--plan-files/.test(r.err), 'a leftover --plan-files is refused, naming it: ' + (r.err || ''));
  assert.ok(callIn(['suite', 'set', 'green', 'HEAD', ...SR], suiteRepo).ok, 'suite set green HEAD');
  r = callIn(['suite', 'reusable', '--branch', 'main', '--plan-files', ...SR], suiteRepo);
  assert.ok(!r.ok && /--plan-files/.test(r.err), 'a leftover --plan-files is refused on the exact tip too: ' + (r.err || ''));

  // suite reusable: a non-green record is never reusable, whatever changed.
  assert.ok(callIn(['suite', 'set', 'red', newSha, ...SR], suiteRepo).ok, 'suite set red for the non-green case');
  r = callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo);
  assert.ok(!r.ok && /not green/.test(r.err), 'a red record is not reusable: ' + (r.err || ''));

  // suite reusable: no record at all is not reusable.
  r = callIn(['suite', 'reusable', '--branch', 'main', '--root', noSuiteRoot], suiteRepo);
  assert.ok(!r.ok && /no suite record/.test(r.err), 'no suite record is not reusable: ' + (r.err || ''));

  // suite reusable: a passing full or whole run on a clean tree at the exact tip is reusable, whoever wrote it, with no
  // suite record or a record at another commit (ADR 0182). The latest such line at the tip decides.
  const exactTip = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: suiteRepo, encoding: 'utf8' }).trim();
  traceRun(noSuiteRoot, 'focused', 'pass', exactTip, 'clean');
  r = callIn(['suite', 'reusable', '--branch', 'main', '--root', noSuiteRoot], suiteRepo);
  assert.ok(!r.ok && /no suite record/.test(r.err), 'a focused run at the tip backs no reuse: ' + (r.err || ''));
  traceRun(noSuiteRoot, 'full', 'pass', exactTip, 'dirty');
  assert.ok(!callIn(['suite', 'reusable', '--branch', 'main', '--root', noSuiteRoot], suiteRepo).ok, 'a full run on a dirty tree at the tip is not reusable');
  traceRun(noSuiteRoot, 'full', 'pass', exactTip, 'clean');
  assert.ok(
    callIn(['suite', 'reusable', '--branch', 'main', '--root', noSuiteRoot], suiteRepo).ok,
    'a passing full run on a clean tree at the tip is reusable with no suite record'
  );
  // The accepted run becomes the suite record (ADR 0186).
  assert.strictEqual(callIn(['get', 'suite', '--root', noSuiteRoot], suiteRepo).out, `green ${exactTip}`, 'the exact-tip route records the run it accepted');
  r = callIn(['suite', 'reusable', '--branch', 'main', '--whole', '--root', noSuiteRoot], suiteRepo);
  assert.ok(!r.ok, 'a full run at the tip does not satisfy --whole');
  traceRun(noSuiteRoot, 'whole', 'pass', exactTip, 'clean');
  assert.ok(
    callIn(['suite', 'reusable', '--branch', 'main', '--whole', '--root', noSuiteRoot], suiteRepo).ok,
    'a passing whole run at the tip satisfies --whole over a record without the kind'
  );
  assert.strictEqual(callIn(['get', 'suite', '--root', noSuiteRoot], suiteRepo).out, `green ${exactTip} whole`, 'an accepted whole run records the kind');
  traceRun(noSuiteRoot, 'full', 'fail', exactTip, 'clean');
  r = callIn(['suite', 'reusable', '--branch', 'main', '--root', noSuiteRoot], suiteRepo);
  assert.ok(!r.ok, 'a later failing full run at the tip refuses reuse');
  traceRun(noSuiteRoot, 'full', 'pass', exactTip, 'clean');
  // A record at another commit, green or red, does not hide the tip's own passing run.
  assert.ok(callIn(['suite', 'set', 'red', newSha, '--root', noSuiteRoot], suiteRepo).ok, 'suite set red at an earlier commit');
  assert.ok(
    callIn(['suite', 'reusable', '--branch', 'main', '--root', noSuiteRoot], suiteRepo).ok,
    'a red record at an earlier commit leaves a passing full run at the tip reusable'
  );
  assert.strictEqual(callIn(['get', 'suite', '--root', noSuiteRoot], suiteRepo).out, `green ${exactTip} whole`, 'the record at the earlier commit is replaced by the tip, keeping the passing whole run\'s kind');
  // A red record at the tip itself is the rerun's (ADR 0172): a passing run after it does not override it.
  assert.ok(callIn(['suite', 'set', 'red', exactTip, '--root', noSuiteRoot], suiteRepo).ok, 'suite set red at the tip');
  traceRun(noSuiteRoot, 'full', 'pass', exactTip, 'clean');
  r = callIn(['suite', 'reusable', '--branch', 'main', '--root', noSuiteRoot], suiteRepo);
  assert.ok(!r.ok && /red/.test(r.err), 'a red record at the tip is not overridden by a later passing run: ' + (r.err || ''));

  // --- suite record kind: `whole` marks a run of the whole-repo command (ADR 0105, INV-0017) -----
  const wholeTip = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: suiteRepo, encoding: 'utf8' }).trim();

  // suite set --whole: writes the trailing " whole" marker, and get suite reports it.
  assert.ok(callIn(['suite', 'set', 'green', wholeTip, '--whole', ...SR], suiteRepo).ok, 'suite set green --whole');
  assert.strictEqual(
    callIn(['get', 'suite', ...SR], suiteRepo).out,
    `green ${wholeTip} whole`,
    'get suite reports the whole kind'
  );

  // suite reusable --whole: a green whole record on the exact tip is reusable through --whole, backed
  // only by a `whole` run line.
  traceRun(suiteRoot, 'full', 'pass', wholeTip, 'clean');
  r = callIn(['suite', 'reusable', '--branch', 'main', '--whole', ...SR], suiteRepo);
  assert.ok(!r.ok && /no whole run recorded/.test(r.err), 'a full run line does not satisfy --whole: ' + (r.err || ''));
  traceRun(suiteRoot, 'whole', 'pass', wholeTip, 'clean');
  assert.ok(
    callIn(['suite', 'reusable', '--branch', 'main', '--whole', ...SR], suiteRepo).ok,
    'a whole record is reusable through --whole'
  );

  // suite reusable: a whole run line at the tip satisfies a plain check (full or whole kind accepted).
  assert.ok(
    callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo).ok,
    'a whole run line backs a plain reusable check'
  );

  // A green record with no kind at the tip gives way to a passing whole run there: --whole accepts it and records the kind
  // (ADR 0186).
  assert.ok(callIn(['suite', 'set', 'green', wholeTip, ...SR], suiteRepo).ok, 'suite set green, no kind');
  assert.ok(callIn(['suite', 'reusable', '--branch', 'main', '--whole', ...SR], suiteRepo).ok, 'a passing whole run at the tip meets --whole over a no-kind record');
  assert.strictEqual(callIn(['get', 'suite', ...SR], suiteRepo).out, `green ${wholeTip} whole`, 'the accepted whole run records the kind');

  // suite set (no --whole): a green record with no kind fails a --whole check, naming the missing
  // kind, once no whole run passes at the tip, but still satisfies a plain check.
  assert.ok(callIn(['suite', 'set', 'green', wholeTip, ...SR], suiteRepo).ok, 'suite set green, no kind');
  traceRun(suiteRoot, 'whole', 'fail', wholeTip, 'clean');
  traceRun(suiteRoot, 'full', 'pass', wholeTip, 'clean');
  r = callIn(['suite', 'reusable', '--branch', 'main', '--whole', ...SR], suiteRepo);
  assert.ok(!r.ok && /kind/.test(r.err), 'a record with no kind fails a --whole check, naming the kind: ' + (r.err || ''));
  assert.ok(
    callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo).ok,
    'the same record still satisfies a plain reusable check'
  );
  traceRun(suiteRoot, 'whole', 'pass', wholeTip, 'clean');

  // suite reusable --whole: a red whole record is never reusable, with or without --whole, and
  // get suite shows it as red and whole.
  assert.ok(callIn(['suite', 'set', 'red', wholeTip, '--whole', ...SR], suiteRepo).ok, 'suite set red --whole');
  r = callIn(['suite', 'reusable', '--branch', 'main', '--whole', ...SR], suiteRepo);
  assert.ok(!r.ok && /not green/.test(r.err), 'a red whole record is not reusable with --whole: ' + (r.err || ''));
  r = callIn(['suite', 'reusable', '--branch', 'main', ...SR], suiteRepo);
  assert.ok(!r.ok && /not green/.test(r.err), 'a red whole record is not reusable without --whole: ' + (r.err || ''));
  assert.strictEqual(
    callIn(['get', 'suite', ...SR], suiteRepo).out,
    `red ${wholeTip} whole`,
    'get suite shows the record as red and whole'
  );

  // suite reusable --whole: a green whole record on an earlier commit carries across Markdown-only commits.
  assert.ok(
    callIn(['suite', 'set', 'green', wholeTip, '--whole', ...SR], suiteRepo).ok,
    'suite set green --whole for the earlier-commit case'
  );
  fs.writeFileSync(path.join(suiteRepo, planDir, 'another-tick.md'), 'ticked again\n');
  gitSuite(['add', '.'], suiteRepo);
  gitSuite(['commit', '-q', '-m', 'tick again'], suiteRepo);
  r = callIn(['suite', 'reusable', '--branch', 'main', '--whole', ...SR], suiteRepo);
  assert.ok(
    r.ok && r.out === 'reusable',
    'a whole record on an earlier commit carries with --whole across Markdown-only commits: ' + (r.err || '')
  );

  // suite set: an unrecognized flag (a mistyped `--whole`) is refused, naming it, and writes nothing —
  // it must never silently produce a no-kind record that a later `--whole` check trusts.
  const beforeUnknownFlag = fs.readFileSync(path.join(suiteRoot, 'ledger.md'), 'utf8');
  r = callIn(['suite', 'set', 'green', wholeTip, '--wholee', ...SR], suiteRepo);
  assert.ok(!r.ok && /--wholee/.test(r.err), 'suite set refuses an unrecognized flag, naming it: ' + (r.err || ''));
  assert.strictEqual(
    fs.readFileSync(path.join(suiteRoot, 'ledger.md'), 'utf8'),
    beforeUnknownFlag,
    'nothing written on an unrecognized-flag refusal'
  );

  // suite reusable: an unrecognized flag is refused the same way, naming it, and writes nothing (it
  // touches no ledger regardless, but the refusal itself must still happen).
  r = callIn(['suite', 'reusable', '--branch', 'main', '--wholee', ...SR], suiteRepo);
  assert.ok(!r.ok && /--wholee/.test(r.err), 'suite reusable refuses an unrecognized flag, naming it: ' + (r.err || ''));

  // suite reusable: a malformed record (garbage trailing the recognized `<result> @ <sha>[ whole]`
  // shape) is refused, and the unrecognized-flag refusals above already cover an unknown flag —
  // none of these writes to the ledger.
  const malformedRoot = path.join(suiteRepo, '.superdev', 'scopes', 'malformed-suite-demo');
  fs.mkdirSync(malformedRoot, { recursive: true });
  fs.writeFileSync(
    path.join(malformedRoot, 'ledger.md'),
    '# Ledger — malformed-suite-demo\n\n**Stage:** merged\n' +
      `**Suite:** green @ ${wholeTip} whole extra\n` +
      '**Anchor:** #1 — malformed\n\n' +
      '| id | issue | title | type | depends-on | status | range |\n' +
      '|---|---|---|---|---|---|---|\n',
    'utf8'
  );
  const beforeMalformed = fs.readFileSync(path.join(malformedRoot, 'ledger.md'), 'utf8');
  r = callIn(['suite', 'reusable', '--branch', 'main', '--root', malformedRoot], suiteRepo);
  assert.ok(!r.ok && /unreadable suite record/.test(r.err), 'a malformed record is refused: ' + (r.err || ''));
  assert.strictEqual(
    fs.readFileSync(path.join(malformedRoot, 'ledger.md'), 'utf8'),
    beforeMalformed,
    'nothing written on a malformed-record refusal'
  );

  // A ledger written before this change carries a Suite line with no kind, and reads back unchanged:
  // get suite reports the record with no kind, and it is reusable without --whole.
  const currentTip = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: suiteRepo, encoding: 'utf8' }).trim();
  const preFeatureRoot = path.join(suiteRepo, '.superdev', 'scopes', 'pre-feature-suite-demo');
  fs.mkdirSync(preFeatureRoot, { recursive: true });
  traceRun(preFeatureRoot, 'full', 'pass', currentTip, 'clean');
  fs.writeFileSync(
    path.join(preFeatureRoot, 'ledger.md'),
    '# Ledger — pre-feature-suite-demo\n\n**Stage:** merged\n**Branch:** feat/pre-feature-suite-demo\n' +
      `**Suite:** green @ ${currentTip}\n` +
      '**Anchor:** #1 — pre-feature\n\n' +
      '| id | issue | title | type | depends-on | status | range |\n' +
      '|---|---|---|---|---|---|---|\n',
    'utf8'
  );
  assert.strictEqual(
    callIn(['get', 'suite', '--root', preFeatureRoot], suiteRepo).out,
    `green ${currentTip}`,
    'a pre-existing ledger reads back unchanged, with no kind'
  );
  assert.ok(
    callIn(['suite', 'reusable', '--branch', 'main', '--root', preFeatureRoot], suiteRepo).ok,
    'a pre-existing no-kind record is reusable without --whole'
  );

  // suite reusable: a later focused run does not affect plain or --whole decision.
  const focusedRoot = path.join(suiteRepo, '.superdev', 'scopes', 'focused-suite-demo');
  fs.mkdirSync(focusedRoot, { recursive: true });
  const focusedSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: suiteRepo, encoding: 'utf8' }).trim();
  traceRun(focusedRoot, 'whole', 'pass', focusedSha, 'clean');
  traceRun(focusedRoot, 'focused', 'fail', focusedSha, 'clean');
  fs.writeFileSync(
    path.join(focusedRoot, 'ledger.md'),
    '# Ledger — focused-suite-demo\n\n**Stage:** merged\n**Branch:** main\n' +
      `**Suite:** green @ ${focusedSha} whole\n` +
      '**Anchor:** #1 — focused\n\n' +
      '| id | issue | title | type | depends-on | status | range |\n' +
      '|---|---|---|---|---|---|---|\n',
    'utf8'
  );
  assert.ok(
    callIn(['suite', 'reusable', '--branch', 'main', '--root', focusedRoot], suiteRepo).ok,
    'a later focused fail does not defeat plain reuse'
  );
  assert.ok(
    callIn(['suite', 'reusable', '--branch', 'main', '--whole', '--root', focusedRoot], suiteRepo).ok,
    'a later focused fail does not defeat --whole reuse'
  );

  // suite reusable --whole: a later whole fail defeats --whole reuse.
  const wholeFailRoot = path.join(suiteRepo, '.superdev', 'scopes', 'whole-fail-suite-demo');
  fs.mkdirSync(wholeFailRoot, { recursive: true });
  const wholeFailSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: suiteRepo, encoding: 'utf8' }).trim();
  traceRun(wholeFailRoot, 'whole', 'pass', wholeFailSha, 'clean');
  traceRun(wholeFailRoot, 'whole', 'fail', wholeFailSha, 'clean');
  fs.writeFileSync(
    path.join(wholeFailRoot, 'ledger.md'),
    '# Ledger — whole-fail-suite-demo\n\n**Stage:** merged\n**Branch:** main\n' +
      `**Suite:** green @ ${wholeFailSha} whole\n` +
      '**Anchor:** #1 — whole-fail\n\n' +
      '| id | issue | title | type | depends-on | status | range |\n' +
      '|---|---|---|---|---|---|---|\n',
    'utf8'
  );
  r = callIn(['suite', 'reusable', '--branch', 'main', '--whole', '--root', wholeFailRoot], suiteRepo);
  assert.ok(!r.ok && /is fail/.test(r.err), 'a later whole fail defeats --whole reuse: ' + (r.err || ''));

  // suite reusable: a later fail of any kind defeats a plain check (latest run of either kind decides).
  const mixedKindsRoot = path.join(suiteRepo, '.superdev', 'scopes', 'mixed-kinds-suite-demo');
  fs.mkdirSync(mixedKindsRoot, { recursive: true });
  const mixedKindsSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: suiteRepo, encoding: 'utf8' }).trim();
  traceRun(mixedKindsRoot, 'full', 'pass', mixedKindsSha, 'clean');
  traceRun(mixedKindsRoot, 'whole', 'fail', mixedKindsSha, 'clean');
  fs.writeFileSync(
    path.join(mixedKindsRoot, 'ledger.md'),
    '# Ledger — mixed-kinds-suite-demo\n\n**Stage:** merged\n**Branch:** main\n' +
      `**Suite:** green @ ${mixedKindsSha}\n` +
      '**Anchor:** #1 — mixed-kinds\n\n' +
      '| id | issue | title | type | depends-on | status | range |\n' +
      '|---|---|---|---|---|---|---|\n',
    'utf8'
  );
  r = callIn(['suite', 'reusable', '--branch', 'main', '--root', mixedKindsRoot], suiteRepo);
  assert.ok(!r.ok && /is fail/.test(r.err), 'a later whole fail defeats a plain check (latest of either kind): ' + (r.err || ''));

  fs.rmSync(suiteRepo, { recursive: true, force: true });
}

// --- isTestPath: the one test-path classifier (ADR 0128) ---------------------------------------
//
// Its globs: `*` stays in a segment, `**` crosses them, a slash anchors, a malformed entry is
// skipped, and a section with no usable entry falls back to the defaults.
{
  const paths = (...g) => '## Test paths\n\n' + g.map((e) => '- `' + e + '`').join('\n') + '\n';
  assert.ok(isTestPath('', 'a/b/x.test.js') && isTestPath('', 'tests/x.js') && !isTestPath(paths('tests/'), 'src/tests/x.js'));
  assert.ok(isTestPath(paths('lib/**/*.t.js'), 'lib/q/r.t.js') && !isTestPath(paths('lib/*.t.js'), 'lib/q/r.t.js'));
  assert.ok(!isTestPath(paths('/abs/**'), 'abs/x.js') && isTestPath(paths('/abs/**'), 'tests/x.js'), 'a malformed sole entry falls back to the defaults');
  assert.ok(isTestPath(paths('bad entry', 'lib/*.t.js'), 'lib/r.t.js') && !isTestPath(paths('bad entry', 'lib/*.t.js'), 'tests/x.js'), 'a malformed entry is skipped');
}
